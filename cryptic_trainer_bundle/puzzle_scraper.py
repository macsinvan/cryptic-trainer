#!/usr/bin/env python3
"""
Puzzle Scraper for Times for the Times blog.

Parses crossword blog posts and extracts structured clue data including:
- Puzzle metadata (number, setter, date)
- All clues with definitions (from underline markup), answers, and wordplay explanations

Usage:
    python puzzle_scraper.py https://timesforthetimes.co.uk/times-29431-just-right
    python puzzle_scraper.py https://timesforthetimes.co.uk/times-29431-just-right --output puzzle.json
"""

import argparse
import json
import re
import sys
from typing import Dict, List, Optional, Any
from urllib.request import urlopen, Request
from html.parser import HTMLParser


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
    # Pattern: "Times 29431" or "times-29431"
    num_match = re.search(r'[Tt]imes[- ](\d+)', html)
    if num_match:
        metadata["puzzle_number"] = int(num_match.group(1))
    else:
        # Try URL
        url_match = re.search(r'times-(\d+)', url)
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


def parse_puzzle(url: str) -> Dict[str, Any]:
    """Main function to parse a puzzle from URL."""
    html = fetch_html(url)

    metadata = extract_puzzle_metadata(html, url)
    raw_clues = extract_clues(html)

    # Enrich clues with enumeration and length
    clues = []
    for clue in raw_clues:
        enumeration = extract_enumeration(clue.get("clue_text", ""))
        clue["enumeration"] = enumeration
        clue["length"] = calculate_length(enumeration) if enumeration else None

        # Clean up wordplay explanation
        wordplay = clue.get("wordplay", "")
        # Remove leading dash/hyphen
        wordplay = re.sub(r'^[\s\-–—]+', '', wordplay).strip()
        clue["wordplay"] = wordplay

        clues.append(clue)

    # Separate across and down
    across = [c for c in clues if c.get("direction") == "across"]
    down = [c for c in clues if c.get("direction") == "down"]

    return {
        "metadata": metadata,
        "across": across,
        "down": down,
        "clue_count": len(clues)
    }


def main():
    parser = argparse.ArgumentParser(
        description="Parse Times for the Times crossword blog posts"
    )
    parser.add_argument("url", help="URL of the blog post to parse")
    parser.add_argument(
        "--output", "-o",
        help="Output file (default: stdout)",
        default=None
    )
    parser.add_argument(
        "--pretty", "-p",
        action="store_true",
        help="Pretty-print JSON output"
    )

    args = parser.parse_args()

    try:
        puzzle = parse_puzzle(args.url)

        indent = 2 if args.pretty else None
        json_output = json.dumps(puzzle, indent=indent, ensure_ascii=False)

        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(json_output)
            print(f"Saved to {args.output}", file=sys.stderr)
        else:
            print(json_output)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
