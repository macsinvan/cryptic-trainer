#!/usr/bin/env python3
"""
Puzzle Scraper for Times for the Times blog.

Parses crossword blog posts and extracts structured clue data including:
- Puzzle metadata (number, setter, date)
- All clues with definitions (from underline markup), answers, and wordplay explanations

Rate limited: 10 minute cooldown between scrapes to avoid getting blocked.
Output: Saves to <Publication>/<Publication>_<puzzle_number>.json

Usage:
    python puzzle_scraper.py https://timesforthetimes.co.uk/times-29431-just-right
    python puzzle_scraper.py https://timesforthetimes.co.uk/times-29431-just-right --force
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Any
from urllib.request import urlopen, Request
from html.parser import HTMLParser

# Rate limiting config
RATE_LIMIT_SECONDS = 600  # 10 minutes
RATE_LIMIT_FILE = Path(__file__).parent / ".scraper_last_fetch"


def check_rate_limit() -> Optional[int]:
    """Check if we're within the rate limit cooldown.

    Returns None if OK to proceed, or seconds remaining if in cooldown.
    """
    if not RATE_LIMIT_FILE.exists():
        return None

    try:
        last_fetch = float(RATE_LIMIT_FILE.read_text().strip())
        elapsed = time.time() - last_fetch
        remaining = RATE_LIMIT_SECONDS - elapsed

        if remaining > 0:
            return int(remaining)
        return None
    except (ValueError, OSError):
        return None


def record_fetch():
    """Record the current time as the last fetch time."""
    try:
        RATE_LIMIT_FILE.write_text(str(time.time()))
    except OSError as e:
        print(f"Warning: Could not save rate limit timestamp: {e}", file=sys.stderr)


def get_output_path(publication: str, puzzle_number: int) -> Path:
    """Generate output path: <Publication>/<Publication>_<puzzle_number>.json"""
    pub_dir = Path(__file__).parent / publication.upper()
    pub_dir.mkdir(exist_ok=True)
    return pub_dir / f"{publication.upper()}_{puzzle_number}.json"


def puzzle_exists(publication: str, puzzle_number: int) -> bool:
    """Check if a puzzle file already exists locally."""
    path = get_output_path(publication, puzzle_number)
    return path.exists()


def extract_puzzle_links_from_index(html: str) -> List[Dict[str, Any]]:
    """Extract puzzle links from an index page.

    Returns list of dicts with 'url', 'publication', 'puzzle_number'.
    """
    seen = set()  # Track (publication, puzzle_number) to avoid duplicates
    puzzles = []
    base_url = "https://timesforthetimes.co.uk"

    # Find all links that look like puzzle posts
    # Patterns: times-29431, times-cryptic-29433, quick-cryptic-3193, etc.
    link_pattern = re.compile(r'href="([^"]*)"')

    for match in link_pattern.finditer(html):
        href = match.group(1)

        # Skip fragments (e.g., #comments)
        if '#' in href:
            href = href.split('#')[0]

        # Make absolute URL if relative
        if href.startswith('/'):
            url = base_url + href
        elif not href.startswith('http'):
            url = base_url + '/' + href
        else:
            url = href

        # Skip non-puzzle pages
        if '/page/' in url or url.endswith('.co.uk') or url.endswith('.co.uk/'):
            continue

        # Try to extract puzzle info (order matters - more specific patterns first)
        puzzle_info = None

        # Sunday Times: sunday-times-5196 (must check BEFORE generic times pattern)
        st_match = re.search(r'sunday-times-(\d{4})', url)
        if st_match:
            puzzle_info = {
                'url': url,
                'publication': 'sunday_times',
                'puzzle_number': int(st_match.group(1))
            }

        # Quick Cryptic: quick-cryptic-3193, qc-3191, times-quick-cryptic
        qc_match = re.search(r'(?:times-)?(?:quick-cryptic|qc)-(?:no-)?(\d{4})', url)
        if qc_match and not puzzle_info:
            puzzle_info = {
                'url': url,
                'publication': 'times_quick',
                'puzzle_number': int(qc_match.group(1))
            }

        # Mephisto: mephisto-3409
        meph_match = re.search(r'mephisto-(\d{4})', url)
        if meph_match and not puzzle_info:
            puzzle_info = {
                'url': url,
                'publication': 'mephisto',
                'puzzle_number': int(meph_match.group(1))
            }

        # Times Cryptic: times-29431, times-cryptic-29433 (generic - check last)
        times_match = re.search(r'times-(?:cryptic-)?(\d{4,5})', url)
        if times_match and not puzzle_info:
            puzzle_info = {
                'url': url,
                'publication': 'times',
                'puzzle_number': int(times_match.group(1))
            }

        # Deduplicate by (publication, puzzle_number)
        if puzzle_info:
            key = (puzzle_info['publication'], puzzle_info['puzzle_number'])
            if key not in seen:
                seen.add(key)
                puzzles.append(puzzle_info)

    return puzzles


def scrape_index_page(page_num: int) -> List[Dict[str, Any]]:
    """Fetch an index page and extract puzzle links."""
    url = f"https://timesforthetimes.co.uk/page/{page_num}"
    print(f"Fetching index page {page_num}...", file=sys.stderr)
    html = fetch_html(url)
    return extract_puzzle_links_from_index(html)


class ClueTableParser(HTMLParser):
    """Parse the clue table HTML to extract clues with definitions."""

    def __init__(self):
        super().__init__()
        self.clues: List[Dict[str, Any]] = []
        self.current_clue: Dict[str, Any] = {}
        self.current_direction: str = "across"

        # State tracking
        self.in_clue_td = False
        self.in_ans_td = False
        self.in_num_td = False
        self.in_underline = False
        self.in_strong = False

        # Text accumulation
        self.clue_text_parts: List[str] = []
        self.definition_parts: List[str] = []
        self.answer_text = ""
        self.explanation_text = ""
        self.num_text = ""

    def handle_starttag(self, tag: str, attrs: List[tuple]):
        attr_dict = dict(attrs)
        class_name = attr_dict.get("class", "")
        style = attr_dict.get("style", "")

        if tag == "td":
            if class_name == "clue":
                self.in_clue_td = True
                self.clue_text_parts = []
                self.definition_parts = []
            elif class_name == "ans":
                self.in_ans_td = True
                self.answer_text = ""
                self.explanation_text = ""
            elif class_name == "num":
                self.in_num_td = True
                self.num_text = ""

        elif tag == "span" and "text-decoration: underline" in style:
            self.in_underline = True

        elif tag == "strong" and self.in_ans_td:
            self.in_strong = True

        # Detect direction headers
        elif tag == "h3" or tag == "h4":
            pass  # Will check content in handle_data

    def handle_endtag(self, tag: str):
        if tag == "td":
            if self.in_clue_td:
                self.in_clue_td = False
                full_clue = "".join(self.clue_text_parts).strip()
                definition = "".join(self.definition_parts).strip()

                if full_clue:
                    self.current_clue["clue_text"] = full_clue
                    self.current_clue["definition"] = definition
                    self.current_clue["definition_position"] = self._detect_def_position(full_clue, definition)

            elif self.in_ans_td:
                self.in_ans_td = False
                if self.answer_text:
                    self.current_clue["answer"] = self.answer_text.strip()
                    self.current_clue["wordplay"] = self.explanation_text.strip()

                    # Finalize clue if we have required fields
                    if self.current_clue.get("clue_text") and self.current_clue.get("answer"):
                        self.clues.append(self.current_clue)
                        self.current_clue = {}

            elif self.in_num_td:
                self.in_num_td = False
                num = self.num_text.strip()
                if num and num.isdigit():
                    self.current_clue = {
                        "number": int(num),
                        "direction": self.current_direction
                    }

        elif tag == "span":
            self.in_underline = False

        elif tag == "strong":
            self.in_strong = False

    def handle_data(self, data: str):
        # Check for direction headers
        data_lower = data.lower().strip()
        if data_lower == "across":
            self.current_direction = "across"
            return
        elif data_lower == "down":
            self.current_direction = "down"
            return

        if self.in_num_td:
            self.num_text += data

        elif self.in_clue_td:
            self.clue_text_parts.append(data)
            if self.in_underline:
                self.definition_parts.append(data)

        elif self.in_ans_td:
            if self.in_strong:
                self.answer_text += data
            else:
                self.explanation_text += data

    def _detect_def_position(self, clue: str, definition: str) -> str:
        """Determine if definition is at start, end, or elsewhere in clue."""
        if not definition or not clue:
            return "unknown"

        # Remove enumeration for comparison
        clue_clean = re.sub(r'\s*\([^)]+\)\s*$', '', clue).strip()

        if clue_clean.startswith(definition):
            return "start"
        elif clue_clean.endswith(definition):
            return "end"
        else:
            return "middle"


def fetch_html(url: str) -> str:
    """Fetch HTML content from URL."""
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; CrypticTrainer/1.0)"
    }
    req = Request(url, headers=headers)
    with urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8")


def extract_puzzle_metadata(html: str, url: str) -> Dict[str, Any]:
    """Extract puzzle number, setter, and date from page."""
    metadata: Dict[str, Any] = {
        "source_url": url,
        "publication": "times"
    }

    # Extract puzzle number from title or URL
    # Pattern: "Times 29431", "Times Cryptic 29433", "times-29431", "times-cryptic-29433"
    num_match = re.search(r'[Tt]imes[- ](?:[Cc]ryptic[- ])?(\d+)', html)
    if num_match:
        metadata["puzzle_number"] = int(num_match.group(1))
    else:
        # Try URL
        url_match = re.search(r'times-(?:cryptic-)?(\d+)', url)
        if url_match:
            metadata["puzzle_number"] = int(url_match.group(1))

    # Extract setter if mentioned
    # Common patterns: "by [Setter]", "setter: [Name]", "Today's puzzle is by [Name]"
    setter_patterns = [
        r'[Ss]etter[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
        r'[Pp]uzzle\s+(?:is\s+)?by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
        r'[Tt]oday.s\s+.*?by\s+([A-Z][a-z]+)',
    ]
    for pattern in setter_patterns:
        setter_match = re.search(pattern, html)
        if setter_match:
            metadata["setter"] = setter_match.group(1)
            break

    # Extract date from meta or URL
    date_match = re.search(r'(\d{4}-\d{2}-\d{2})', html)
    if date_match:
        metadata["date"] = date_match.group(1)

    # Extract blog title
    title_match = re.search(r'<title>([^<]+)</title>', html)
    if title_match:
        metadata["blog_title"] = title_match.group(1).strip()

    return metadata


def extract_clues(html: str) -> List[Dict[str, Any]]:
    """Extract all clues from the HTML."""
    parser = ClueTableParser()
    parser.feed(html)
    return parser.clues


def extract_enumeration(clue_text: str) -> Optional[str]:
    """Extract the enumeration from clue text, e.g., (5) or (3,4)."""
    match = re.search(r'\(([0-9,\-\s]+)\)\s*$', clue_text)
    if match:
        return match.group(1)
    return None


def calculate_length(enumeration: str) -> int:
    """Calculate total letter count from enumeration."""
    if not enumeration:
        return 0
    # Sum all numbers, ignoring commas and hyphens
    numbers = re.findall(r'\d+', enumeration)
    return sum(int(n) for n in numbers)


def infer_step_type(wordplay: str) -> str:
    """Infer the wordplay step type from the explanation text."""
    lower = wordplay.lower()
    if '*(' in wordplay or 'anagram' in lower:
        return 'anagram'
    if 'hidden' in lower or 'concealed' in lower:
        return 'hidden'
    if 'reversal' in lower or 'reversed' in lower or 'back' in lower:
        return 'reversal'
    if 'container' in lower or 'inside' in lower or 'around' in lower:
        return 'container'
    if 'deletion' in lower or 'without' in lower or 'losing' in lower:
        return 'deletion'
    if 'homophone' in lower or 'sounds like' in lower:
        return 'homophone'
    if 'abbreviation' in lower or 'abbrev' in lower:
        return 'abbreviation'
    if 'double definition' in lower:
        return 'double_definition'
    if '+' in wordplay:
        return 'charade'
    return 'unknown'


def extract_indicator_from_wordplay(wordplay: str) -> str:
    """Try to extract the indicator word from wordplay explanation."""
    # Common patterns in wordplay explanations
    # e.g., "*(CHAT + MARK + ME)" - the * indicates anagram
    if '*(' in wordplay:
        return '*'  # Anagram indicator
    # Look for quoted words that might be indicators
    quoted = re.findall(r'"([^"]+)"', wordplay)
    if quoted:
        return quoted[0]
    return ''


def clue_to_battlecard(clue: Dict[str, Any], metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a raw clue to battle card format."""
    publication = metadata.get("publication", "unknown")
    puzzle_number = metadata.get("puzzle_number", 0)
    setter = metadata.get("setter", "Unknown")

    clue_num = clue.get("number", 0)
    direction = clue.get("direction", "across")
    direction_suffix = "a" if direction == "across" else "d"

    clue_text = clue.get("clue_text", "")
    answer = clue.get("answer", "")
    definition = clue.get("definition", "")
    definition_position = clue.get("definition_position", "unknown")
    wordplay = clue.get("wordplay", "")

    # Generate ID
    clue_id = f"{publication}-{puzzle_number}-{clue_num}{direction_suffix}"

    # Infer pattern type
    step_type = infer_step_type(wordplay)
    pattern_id = step_type.upper() if step_type != 'unknown' else 'UNKNOWN'

    # Build wordplay step
    wordplay_step = {
        "indicator": extract_indicator_from_wordplay(wordplay),
        "fodder": "",  # Would need more parsing to extract
        "result": answer,
        "synonym": "",
        "hint": wordplay,
        "complexity": 1,
        "isAssembly": False,
        "stepType": step_type,
        "explanation": wordplay
    }

    # Build parsing summary
    parsing_summary = f"{answer} = {wordplay}" if wordplay else answer

    return {
        "id": clue_id,
        "patternId": pattern_id,
        "clueText": clue_text,
        "answer": answer,
        "publication": publication,
        "puzzleNumber": puzzle_number,
        "setter": setter,
        "clueNumber": str(clue_num),
        "clueDirection": direction,
        "variables": {},
        "definitionText": definition,
        "definitionPosition": definition_position,
        "parsingSummary": parsing_summary,
        "wordplaySteps": [wordplay_step] if wordplay else [],
        "isComplete": bool(answer and definition)
    }


def parse_puzzle(url: str) -> List[Dict[str, Any]]:
    """Main function to parse a puzzle from URL. Returns list of battle cards."""
    html = fetch_html(url)

    metadata = extract_puzzle_metadata(html, url)
    raw_clues = extract_clues(html)

    # Convert each clue to battle card format
    battlecards = []
    for clue in raw_clues:
        # Enrich with enumeration
        enumeration = extract_enumeration(clue.get("clue_text", ""))
        clue["enumeration"] = enumeration
        clue["length"] = calculate_length(enumeration) if enumeration else None

        # Clean up wordplay explanation
        wordplay = clue.get("wordplay", "")
        wordplay = re.sub(r'^[\s\-–—]+', '', wordplay).strip()
        clue["wordplay"] = wordplay

        # Convert to battle card
        battlecard = clue_to_battlecard(clue, metadata)
        battlecards.append(battlecard)

    return battlecards


def scrape_single_puzzle(url: str, output: Optional[str] = None, force: bool = False) -> bool:
    """Scrape a single puzzle URL. Returns True on success."""
    # Check rate limit
    if not force:
        remaining = check_rate_limit()
        if remaining:
            mins = remaining // 60
            secs = remaining % 60
            print(f"Rate limited: please wait {mins}m {secs}s before scraping again.", file=sys.stderr)
            print(f"Use --force to bypass (not recommended).", file=sys.stderr)
            return False

    try:
        battlecards = parse_puzzle(url)

        # Record successful fetch for rate limiting
        record_fetch()

        json_output = json.dumps(battlecards, indent=2, ensure_ascii=False)

        # Determine output path
        if output:
            output_path = Path(output)
        else:
            # Auto-generate: <Publication>/<Publication>_<puzzle_number>.json
            # Get publication/puzzle_number from first battlecard
            if battlecards:
                publication = battlecards[0].get("publication", "unknown")
                puzzle_number = battlecards[0].get("puzzleNumber", 0)
            else:
                publication = "unknown"
                puzzle_number = 0

            if puzzle_number:
                output_path = get_output_path(publication, puzzle_number)
            else:
                # Fallback to stdout if no puzzle number
                print(json_output)
                return True

        # Save to file
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(json_output)
        print(f"Saved to {output_path}", file=sys.stderr)
        print(f"  {len(battlecards)} clues in battle card format", file=sys.stderr)
        return True

    except Exception as e:
        print(f"Error scraping {url}: {e}", file=sys.stderr)
        return False


def scrape_from_index_page(page_num: int, publication_filter: Optional[str] = None):
    """Scrape all missing puzzles from an index page with rate limiting."""
    # Fetch index page (doesn't count toward rate limit)
    puzzles = scrape_index_page(page_num)

    if not puzzles:
        print(f"No puzzles found on page {page_num}", file=sys.stderr)
        return

    # Filter by publication if specified
    if publication_filter:
        puzzles = [p for p in puzzles if p['publication'] == publication_filter.lower()]

    # Check which ones we already have
    missing = []
    for p in puzzles:
        if puzzle_exists(p['publication'], p['puzzle_number']):
            print(f"  [EXISTS] {p['publication'].upper()}_{p['puzzle_number']}", file=sys.stderr)
        else:
            missing.append(p)
            print(f"  [MISSING] {p['publication'].upper()}_{p['puzzle_number']} - {p['url']}", file=sys.stderr)

    if not missing:
        print(f"\nAll {len(puzzles)} puzzles from page {page_num} already downloaded.", file=sys.stderr)
        return

    print(f"\nFound {len(missing)} missing puzzles. Will download with 10-minute delays.", file=sys.stderr)

    # Download missing puzzles with rate limiting
    for i, p in enumerate(missing):
        print(f"\n[{i+1}/{len(missing)}] Downloading {p['publication'].upper()}_{p['puzzle_number']}...", file=sys.stderr)

        # Wait for rate limit if needed
        remaining = check_rate_limit()
        if remaining:
            mins = remaining // 60
            secs = remaining % 60
            print(f"  Waiting {mins}m {secs}s for rate limit...", file=sys.stderr)
            time.sleep(remaining + 1)  # Add 1 second buffer

        success = scrape_single_puzzle(p['url'], force=False)

        if success:
            print(f"  Downloaded successfully.", file=sys.stderr)
        else:
            print(f"  Failed to download.", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(
        description="Parse Times for the Times crossword blog posts"
    )
    parser.add_argument("url", nargs='?', help="URL of the blog post to parse")
    parser.add_argument(
        "--output", "-o",
        help="Output file (default: auto-generate from publication/puzzle number)",
        default=None
    )
    parser.add_argument(
        "--force", "-f",
        action="store_true",
        help="Bypass rate limit (use sparingly!)"
    )
    parser.add_argument(
        "--pretty", "-p",
        action="store_true",
        help="Pretty-print JSON output"
    )
    parser.add_argument(
        "--list-page",
        type=int,
        metavar="N",
        help="Scrape all missing puzzles from index page N (e.g., --list-page 1)"
    )
    parser.add_argument(
        "--publication",
        help="Filter by publication when using --list-page (times, times_quick, sunday_times, mephisto)"
    )

    args = parser.parse_args()

    # Mode: List page scraping
    if args.list_page is not None:
        scrape_from_index_page(args.list_page, args.publication)
        return

    # Mode: Single URL scraping
    if not args.url:
        parser.error("URL is required (or use --list-page N)")

    # Check rate limit
    if not args.force:
        remaining = check_rate_limit()
        if remaining:
            mins = remaining // 60
            secs = remaining % 60
            print(f"Rate limited: please wait {mins}m {secs}s before scraping again.", file=sys.stderr)
            print(f"Use --force to bypass (not recommended).", file=sys.stderr)
            sys.exit(1)

    try:
        battlecards = parse_puzzle(args.url)

        # Record successful fetch for rate limiting
        record_fetch()

        indent = 2 if args.pretty else None
        json_output = json.dumps(battlecards, indent=indent, ensure_ascii=False)

        # Determine output path
        if args.output:
            output_path = Path(args.output)
        else:
            # Auto-generate: <Publication>/<Publication>_<puzzle_number>.json
            # Get publication/puzzle_number from first battlecard
            if battlecards:
                publication = battlecards[0].get("publication", "unknown")
                puzzle_number = battlecards[0].get("puzzleNumber", 0)
            else:
                publication = "unknown"
                puzzle_number = 0

            if puzzle_number:
                output_path = get_output_path(publication, puzzle_number)
            else:
                # Fallback to stdout if no puzzle number
                print(json_output)
                return

        # Save to file
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(json_output)
        print(f"Saved to {output_path}", file=sys.stderr)
        print(f"  {len(battlecards)} clues in battle card format", file=sys.stderr)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
