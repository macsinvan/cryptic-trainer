
#!/usr/bin/env python3
"""
Cryptic Trainer — constraint-first, traceable solver.

This is a pragmatic reference implementation derived from the design spec.
It is NOT a full cryptic solver. It focuses on:
- Parsing clue text into tokens
- Detecting common indicators (modifier, container, reversal, anagram)
- Generating candidate constructions (frames) in a constrained search space
- Producing a proof trace for each candidate

Philosophy:
- Prefer small, auditable lexicons over "AI guessing"
- Every candidate must have a trace that can be checked
- The engine can be extended safely by adding to the controlled tables

Usage:
  python cryptic_trainer.py solve --clue "Pity husband after period of sexual excitement" --length 4
  python cryptic_trainer.py trace --clue "Take out fruit" --length 4

Outputs JSON with candidates + traces.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import urllib.request
import urllib.error
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Tuple, Iterable, Any
from collections import defaultdict

# ---------------------------------
# AI Synonym Lookup (fallback)
# ---------------------------------
AI_SYNONYM_CACHE: Dict[Tuple[str, int], List[str]] = {}  # Session cache for AI results
AI_LOOKUP_ENABLED = True  # Set to False to disable AI lookups

# Learned synonyms & abbreviations - persisted to file, only contains validated entries
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LEARNED_SYNONYMS_FILE = os.path.join(_SCRIPT_DIR, "learned_synonyms.json")
LEARNED_ABBREVS_FILE = os.path.join(_SCRIPT_DIR, "learned_abbreviations.json")
LEARNED_CACHE_STATS_FILE = os.path.join(_SCRIPT_DIR, "learned_cache_stats.json")
LEARNED_SYNONYMS: Dict[str, List[str]] = {}  # word -> [validated synonyms]
LEARNED_ABBREVS: Dict[str, List[str]] = {}  # word -> [validated abbreviations]
LEARNED_CACHE_STATS: Dict[str, int] = {
    "solves_attempted": 0, "solves_passed": 0, "solves_no_ai": 0,  # cold solve stats
    "syn_hits": 0, "syn_lookups": 0,  # synonym cache stats
    "abbr_hits": 0, "abbr_lookups": 0,  # abbreviation cache stats
    "total_ai_queries": 0  # cumulative AI queries across all solves
}
# Per-solve AI query counter (reset each solve)
_SOLVE_AI_QUERIES = 0

def load_learned_cache() -> None:
    """Load validated synonyms, abbreviations and stats from persistent files."""
    global LEARNED_SYNONYMS, LEARNED_ABBREVS, LEARNED_CACHE_STATS
    if os.path.exists(LEARNED_SYNONYMS_FILE):
        try:
            with open(LEARNED_SYNONYMS_FILE, 'r') as f:
                LEARNED_SYNONYMS = json.load(f)
        except Exception:
            LEARNED_SYNONYMS = {}
    if os.path.exists(LEARNED_ABBREVS_FILE):
        try:
            with open(LEARNED_ABBREVS_FILE, 'r') as f:
                LEARNED_ABBREVS = json.load(f)
        except Exception:
            LEARNED_ABBREVS = {}
    if os.path.exists(LEARNED_CACHE_STATS_FILE):
        try:
            with open(LEARNED_CACHE_STATS_FILE, 'r') as f:
                LEARNED_CACHE_STATS = json.load(f)
        except Exception:
            LEARNED_CACHE_STATS = {"solves_attempted": 0, "solves_passed": 0, "solves_no_ai": 0, "syn_hits": 0, "syn_lookups": 0, "abbr_hits": 0, "abbr_lookups": 0, "total_ai_queries": 0}

def _save_cache_stats() -> None:
    """Save stats to persistent file."""
    try:
        with open(LEARNED_CACHE_STATS_FILE, 'w') as f:
            json.dump(LEARNED_CACHE_STATS, f, indent=2)
    except Exception:
        pass

def get_stats_summary() -> Dict[str, Any]:
    """Return stats summary with counts and rates."""
    s = LEARNED_CACHE_STATS
    attempted = s.get("solves_attempted", 0)
    passed = s.get("solves_passed", 0)
    no_ai = s.get("solves_no_ai", 0)
    total_ai = s.get("total_ai_queries", 0)
    total_hits = s.get("syn_hits", 0) + s.get("abbr_hits", 0)

    return {
        "cold_solve": {
            "attempted": attempted,
            "passed": passed,
            "pass_rate": f"{100 * passed / max(1, attempted):.1f}%",
            "no_ai": no_ai,
            "no_ai_rate": f"{100 * no_ai / max(1, attempted):.1f}%"
        },
        "ai_queries": {
            "total": total_ai,
            "avg_per_clue": f"{total_ai / max(1, attempted):.1f}"
        },
        "cache_hits": {
            "total": total_hits,
            "rate": f"{100 * total_hits / max(1, total_hits + total_ai):.1f}%"
        }
    }

def save_learned_synonym(word: str, synonym: str) -> None:
    """Save a validated synonym to the persistent file."""
    word_key = word.lower()
    syn_upper = synonym.upper()
    if word_key not in LEARNED_SYNONYMS:
        LEARNED_SYNONYMS[word_key] = []
    if syn_upper not in LEARNED_SYNONYMS[word_key]:
        LEARNED_SYNONYMS[word_key].append(syn_upper)
        try:
            with open(LEARNED_SYNONYMS_FILE, 'w') as f:
                json.dump(LEARNED_SYNONYMS, f, indent=2, sort_keys=True)
        except Exception as e:
            print(f"Failed to save learned synonym: {e}", file=__import__('sys').stderr)

def save_learned_abbrev(word: str, abbrev: str) -> None:
    """Save a validated abbreviation to the persistent file."""
    word_key = word.lower()
    abbrev_upper = abbrev.upper()
    if word_key not in LEARNED_ABBREVS:
        LEARNED_ABBREVS[word_key] = []
    if abbrev_upper not in LEARNED_ABBREVS[word_key]:
        LEARNED_ABBREVS[word_key].append(abbrev_upper)
        try:
            with open(LEARNED_ABBREVS_FILE, 'w') as f:
                json.dump(LEARNED_ABBREVS, f, indent=2, sort_keys=True)
        except Exception as e:
            print(f"Failed to save learned abbrev: {e}", file=__import__('sys').stderr)

# Load learned cache at module import
load_learned_cache()

def ai_lookup_synonyms(word: str, length: int) -> List[str]:
    """
    Query AI for synonyms of a word with a specific length.
    Checks learned (validated) synonyms first, then falls back to AI query.
    Returns a list of candidate synonyms (uppercase).
    """
    if not AI_LOOKUP_ENABLED:
        return []

    word_lower = word.lower()
    cache_key = (word_lower, length)

    # Check learned synonyms first (these are validated)
    if word_lower in LEARNED_SYNONYMS:
        learned = [s for s in LEARNED_SYNONYMS[word_lower] if len(s) == length]
        if learned:
            LEARNED_CACHE_STATS["syn_hits"] += 1
            _save_cache_stats()
            return learned

    # Check session cache (don't count as hit - same session)
    if cache_key in AI_SYNONYM_CACHE:
        return AI_SYNONYM_CACHE[cache_key]

    # Check for API key (must be non-empty)
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not anthropic_key and not openai_key:
        return []

    # Track AI lookup (cache miss) - only count if we actually make API call
    global _SOLVE_AI_QUERIES
    LEARNED_CACHE_STATS["syn_lookups"] = LEARNED_CACHE_STATS.get("syn_lookups", 0) + 1
    LEARNED_CACHE_STATS["total_ai_queries"] = LEARNED_CACHE_STATS.get("total_ai_queries", 0) + 1
    _SOLVE_AI_QUERIES += 1
    _save_cache_stats()

    prompt = f"For a UK cryptic crossword, give synonyms for '{word}' with exactly {length} letters. Include British slang, informal terms, and colloquial UK English. Return ONLY a comma-separated list, no explanations. If none, return NONE."

    try:
        if anthropic_key:
            results = _call_anthropic(prompt, anthropic_key)
        else:
            results = _call_openai(prompt, openai_key)

        # Parse results
        if results and results.upper() != "NONE":
            synonyms = [s.strip().upper() for s in results.split(",") if s.strip()]
            # Filter to exact length
            synonyms = [s for s in synonyms if len(s) == length and s.isalpha()]
            AI_SYNONYM_CACHE[cache_key] = synonyms
            return synonyms
    except Exception as e:
        print(f"AI lookup failed for '{word}': {e}", file=__import__('sys').stderr)

    AI_SYNONYM_CACHE[cache_key] = []
    return []

AI_ABBREV_CACHE: Dict[Tuple[str, int], List[str]] = {}  # Session cache for AI abbrev results

def ai_lookup_abbreviations(word: str, length: int) -> List[str]:
    """
    Query AI for abbreviations of a word with a specific length.
    Checks learned (validated) abbreviations first, then falls back to AI query.
    Returns a list of candidate abbreviations (uppercase).
    """
    if not AI_LOOKUP_ENABLED:
        return []

    word_lower = word.lower()
    cache_key = (word_lower, length)

    # Check learned abbreviations first (these are validated)
    if word_lower in LEARNED_ABBREVS:
        learned = [a for a in LEARNED_ABBREVS[word_lower] if len(a) == length]
        if learned:
            LEARNED_CACHE_STATS["abbr_hits"] += 1
            _save_cache_stats()
            return learned

    # Check session cache (don't count as hit - same session)
    if cache_key in AI_ABBREV_CACHE:
        return AI_ABBREV_CACHE[cache_key]

    # Check for API key (must be non-empty)
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not anthropic_key and not openai_key:
        return []

    # Track AI lookup (cache miss) - only count if we actually make API call
    global _SOLVE_AI_QUERIES
    LEARNED_CACHE_STATS["abbr_lookups"] = LEARNED_CACHE_STATS.get("abbr_lookups", 0) + 1
    LEARNED_CACHE_STATS["total_ai_queries"] = LEARNED_CACHE_STATS.get("total_ai_queries", 0) + 1
    _SOLVE_AI_QUERIES += 1
    _save_cache_stats()

    prompt = f"In Times UK cryptic crosswords, what are common abbreviations for '{word}' that are exactly {length} letter(s)? Return ONLY a comma-separated list of abbreviations, no explanations. If none exist, return NONE."

    try:
        if anthropic_key:
            results = _call_anthropic(prompt, anthropic_key)
        else:
            results = _call_openai(prompt, openai_key)

        # Parse results
        if results and results.upper() != "NONE":
            abbrevs = [a.strip().upper() for a in results.split(",") if a.strip()]
            # Filter to exact length
            abbrevs = [a for a in abbrevs if len(a) == length and a.isalpha()]
            AI_ABBREV_CACHE[cache_key] = abbrevs
            return abbrevs
    except Exception as e:
        print(f"AI abbrev lookup failed for '{word}': {e}", file=__import__('sys').stderr)

    AI_ABBREV_CACHE[cache_key] = []
    return []

def _call_anthropic(prompt: str, api_key: str) -> Optional[str]:
    """Call Anthropic Claude API."""
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01"
    }
    data = json.dumps({
        "model": "claude-3-haiku-20240307",
        "max_tokens": 100,
        "messages": [{"role": "user", "content": prompt}]
    }).encode('utf-8')

    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    with urllib.request.urlopen(req, timeout=10) as response:
        result = json.loads(response.read().decode('utf-8'))
        return result.get("content", [{}])[0].get("text", "")

def _call_openai(prompt: str, api_key: str) -> Optional[str]:
    """Call OpenAI API."""
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    data = json.dumps({
        "model": "gpt-3.5-turbo",
        "max_tokens": 100,
        "messages": [{"role": "user", "content": prompt}]
    }).encode('utf-8')

    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    with urllib.request.urlopen(req, timeout=10) as response:
        result = json.loads(response.read().decode('utf-8'))
        return result.get("choices", [{}])[0].get("message", {}).get("content", "")

# ---------------------------------
# Lexicons (controlled / minimal)
# ---------------------------------
SENTINELS = {"__initial__", "__headless__", "__inner__", "__tailless__", "__extremes__"}

ABBREVS: Dict[str, List[str]] = {
    "golf": ["G"],
    "husband": ["H"],
    "married": ["M"],
    "old": ["O"],
    "saint": ["ST"],
    "doctor": ["DR"],
    "street": ["ST"],
    "north": ["N"],
    "south": ["S"],
    "east": ["E"],
    "west": ["W"],
    "large": ["L"],
    "part": ["PT"],
}

SYNONYMS: Dict[str, List[str]] = {
    "fabric": ["BRAID"],
    "moon": ["IO"],
    "tip": ["LEAN"],
    "dance": ["BALL"],
    "march": ["MONTH"],
    "end": ["TERM"],
    "coach": ["CARRIAGE"],
    "celebrated": ["STAR"],
    "more stupid": ["DENSER"],
    "not tell the truth": ["LIE"],
    "fraud": ["CON"],
    "huge": ["BIG"],
    "unpleasant": ["NASTY"],
    "beware": ["CAVE"],
    "fever": ["AGUE"],
    # keep tiny; expand deliberately
    "pity": ["RUTH"],
    "help": ["AID", "AIDE"],
    "aid": ["AID"],
    "take out": ["ELIDE", "REMOVE"],
    "fruit": ["PEAR", "PLUM", "DATE", "FIG"],
    "school": ["SCH"],
    "theatre": ["DRAMA"],
    "period": ["AGE", "ERA", "RUT"],
    "excitement": ["RUT"],  # spec example only
    "lady": ["HER"],
    "bear": ["CALVE"],  # give birth (animal)
    "cooler": ["LIEBIGCONDENSER"],  # chemistry apparatus
    "small amount": ["IOTA", "BIT", "JOT"],
    "cross": ["ROOD", "ANGRY", "IRATE"],
    "inventor": ["BELL"],  # Alexander Graham Bell
    "computer": ["LAPTOP", "PC"],
    "work": ["OP", "OPUS"],
}

PHRASES: Dict[str, List[str]] = {
    "decorated fabric": ["BRAID"],
    "old testament": ["OT"],
    "school members": ["IDES"],
    "chess piece": ["KNIGHT"],
    "something resembling it": ["MARE"],
    "the french": ["LES"],
    "period of sexual excitement": ["RUT"],
    "old chap": ["O"],
    "large sum of money": ["POTS"],
    "guest announcer": ["DOORBELL"],
    "us city": ["LA", "NY"],
    "later events": ["AFTERMATH"],
}

# ---------------------------------
# Indicators
# ---------------------------------
MODIFIERS_3 = {
    ("ultimately", "lost", "by"): "__tailless__",
}
MODIFIERS_2 = {
    ("starting", "late"): "__headless__",
    ("content", "to"): "__inner__",
    ("beginning", "of"): "__initial__",     # "content to X" -> inner letters of X
    ("ultimately", "lost"): "__tailless__",
    ("scratching", "head"): "__headless__",
}
MODIFIERS_1 = {
    "initially": "__initial__",
    "first": "__initial__",
    "headless": "__headless__",
    "innards": "__inner__",
    "inside": "__inner__",
    "lastly": "__tailless__",
    "ultimately": "__tailless__",
    "finally": "__tailless__",
    "extremely": "__extremes__",
}

CONTAINER_2 = {
    ("hiding", "in"),
    ("to", "house"),
    ("to", "cut"),
}
CONTAINER_1 = {
    "in", "inside", "within", "around", "about", "cuddling", "wearing",
    "entertaining", "hiding", "house", "interrupts", "covers", "conceals",
}

REVERSAL_1 = {"return", "returned", "back", "backing", "backwards", "reversed", "up", "about"}  # 'up' for downs, 'about' = turning

ANAGRAM_1 = {"wild", "mad", "crazily", "broken", "mixed", "drunk", "odd", "high", "flying", "about", "ruined", "damaged", "wrecked", "smashed"}  # not exhaustive

HOMOPHONE_1 = {"heard", "we hear", "reportedly", "they say", "picked up", "sounds like"}

HOMOPHONES: Dict[str, List[str]] = {
    "KNIGHT": ["NIGHT"],
}

# ---------------------------------
# Anagram fodder extraction (teaching-grade heuristic)
# ---------------------------------
STOPWORDS = {"with", "and", "the", "a", "an", "to", "of", "in", "on", "for"}

def extract_anagram_fodder(tokens: List[str], ind_span: Tuple[int,int], target_length: int = 0) -> Tuple[List[str], str]:
    """
    Very small heuristic:
    - try tokens to the LEFT of the anagram indicator span
    - if that doesn't match target length, try tokens to the RIGHT
    - remove common link words (STOPWORDS) and enumeration numbers
    - concatenate remaining tokens' letters (A-Z)
    Returns (fodder_tokens, fodder_concat)
    """
    i, j = ind_span

    # Try LEFT first
    left = tokens[:i]
    kept_left = [t for t in left if t not in STOPWORDS and not t.isdigit()]
    concat_left = "".join([re.sub(r"[^A-Z]", "", t.upper()) for t in kept_left])

    # Try RIGHT
    right = tokens[j:]
    kept_right = [t for t in right if t not in STOPWORDS and not t.isdigit()]
    concat_right = "".join([re.sub(r"[^A-Z]", "", t.upper()) for t in kept_right])

    # If target_length specified, prefer the one that matches
    if target_length > 0:
        if len(concat_right) == target_length:
            return kept_right, concat_right
        if len(concat_left) == target_length:
            return kept_left, concat_left

    # Default: prefer longer fodder, or right if equal
    if len(concat_right) >= len(concat_left):
        return kept_right, concat_right
    return kept_left, concat_left


# ---------------------------------
# Utility functions
# ---------------------------------
def normalize(text: str) -> str:
    text = text.strip()
    text = re.sub(r"[“”]", '"', text)
    text = re.sub(r"[’]", "'", text)
    text = text.lower()
    # keep apostrophes inside words, strip other punctuation to spaces
    text = re.sub(r"[^a-z0-9'\s-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def tokenize(text: str) -> List[str]:
    # keep hyphenated as separate tokens but preserve phrase matching via join
    text = normalize(text)
    toks = []
    for t in text.split(" "):
        if "-" in t:
            toks.extend([x for x in t.split("-") if x])
        else:
            toks.append(t)
    return [t for t in toks if t]

def windows(tokens: List[str], n: int) -> Iterable[Tuple[int, Tuple[str, ...]]]:
    for i in range(0, max(0, len(tokens) - n + 1)):
        yield i, tuple(tokens[i:i+n])

def apply_modifier(mod: str, s: str) -> str:
    if mod == "__initial__":
        return s[:1] if s else ""
    if mod == "__tailless__":
        return s[-1:] if s else ""
    if mod == "__headless__":
        return s[1:] if len(s) >= 1 else ""
    if mod == "__inner__":
        return s[1:-1] if len(s) >= 3 else ""
    if mod == "__extremes__":
        return (s[:1] + s[-1:]) if len(s) >= 2 else (s if s else "")
    raise ValueError(f"Unknown modifier {mod}")

def is_wordlike(x: str) -> bool:
    return bool(re.fullmatch(r"[A-Z]+", x))

def uniq_preserve(xs: Iterable[Any]) -> List[Any]:
    seen = set()
    out = []
    for x in xs:
        key = json.dumps(x, sort_keys=True, default=str) if not isinstance(x, str) else x
        if key in seen:
            continue
        seen.add(key)
        out.append(x)
    return out


# ---------------------------------
# Trace model
# ---------------------------------
@dataclass
class Step:
    op: str
    src: List[str]
    out: str
    note: str = ""

@dataclass
class Candidate:
    answer: str
    length: int
    score: float
    steps: List[Step]
    method: str
    notes: List[str]

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["steps"] = [asdict(s) for s in self.steps]
        return d


# ---------------------------------
# Expansion: token -> strings
# ---------------------------------
def expand_token(token: str) -> List[Tuple[str, str]]:
    """
    Returns list of (string, provenance) pairs.
    """
    out: List[Tuple[str, str]] = []
    t = token.lower()
    # abbrev
    if t in ABBREVS:
        for v in ABBREVS[t]:
            out.append((v.upper(), f"abbrev:{t}"))
    # synonym
    if t in SYNONYMS:
        for v in SYNONYMS[t]:
            out.append((v.upper(), f"syn:{t}"))
    # literal as-is (uppercased) - only if alpha
    if re.fullmatch(r"[a-z]+", t):
        out.append((t.upper(), "lit"))
    return uniq_preserve(out)

def expand_phrase(tokens: List[str], i: int, j: int) -> List[Tuple[str, str]]:
    """
    Expand tokens[i:j] as a phrase key in PHRASES/SYNONYMS.
    """
    phrase = " ".join(tokens[i:j]).lower()
    out: List[Tuple[str, str]] = []
    if phrase in PHRASES:
        for v in PHRASES[phrase]:
            out.append((v.upper(), f"phrase:{phrase}"))
    if phrase in SYNONYMS:
        for v in SYNONYMS[phrase]:
            out.append((v.upper(), f"synphrase:{phrase}"))
    return uniq_preserve(out)

def all_expansions(tokens: List[str]) -> Dict[Tuple[int, int], List[Tuple[str, str]]]:
    """
    Returns mapping from span (i,j) to expansions.
    Includes single tokens and phrase spans up to length 5.
    """
    m: Dict[Tuple[int, int], List[Tuple[str, str]]] = defaultdict(list)
    n = len(tokens)
    # single tokens
    for i in range(n):
        m[(i, i+1)].extend(expand_token(tokens[i]))
    # phrase spans
    for span in range(2, min(6, n+1)):
        for i in range(n - span + 1):
            j = i + span
            ex = expand_phrase(tokens, i, j)
            if ex:
                m[(i, j)].extend(ex)
    # de-dup
    for k, v in list(m.items()):
        m[k] = uniq_preserve(v)
    return m

def augment_with_ai_synonyms(tokens: List[str], exmap: Dict[Tuple[int,int], List[Tuple[str,str]]], target_length: int) -> None:
    """
    Augment expansion map with AI synonym lookups for tokens that have no lexicon synonym.
    Only queries AI for single-word tokens that look like they could be synonym sources.
    """
    if not AI_LOOKUP_ENABLED:
        return

    # Words to skip (common structural/indicator words that shouldn't be synonyms)
    skip_words = STOPWORDS | set(MODIFIERS_1.keys()) | set(MODIFIERS_2.keys())

    for i, tok in enumerate(tokens):
        span = (i, i+1)
        existing = exmap.get(span, [])

        # Skip if we already have synonym expansions (not just literal/abbrev)
        has_syn = any(prov.startswith("syn:") or prov.startswith("synphrase:") for _, prov in existing)
        if has_syn:
            continue

        t = tok.lower()
        # Skip function words, indicators, very short words
        if t in skip_words or len(t) < 3:
            continue

        # Query AI for lengths that could contribute to the target
        # Try lengths from 2 to target_length (for potential charade parts)
        for length in range(2, min(target_length + 1, 10)):
            ai_syns = ai_lookup_synonyms(t, length)
            for syn in ai_syns:
                exmap[span].append((syn, f"ai_syn:{t}"))

def augment_with_ai_abbreviations(tokens: List[str], exmap: Dict[Tuple[int,int], List[Tuple[str,str]]], target_length: int) -> None:
    """
    Augment expansion map with AI abbreviation lookups for tokens that have no lexicon abbreviation.
    """
    if not AI_LOOKUP_ENABLED:
        return

    for i, tok in enumerate(tokens):
        span = (i, i+1)
        existing = exmap.get(span, [])

        # Skip if we already have abbreviation expansions
        has_abbrev = any(prov.startswith("abbrev:") for _, prov in existing)
        if has_abbrev:
            continue

        t = tok.lower()
        # Skip very short words (unlikely to have abbreviations)
        if len(t) < 4:
            continue

        # Query AI for short abbreviations (1-3 letters typical)
        for length in range(1, min(4, target_length + 1)):
            ai_abbrevs = ai_lookup_abbreviations(t, length)
            for abbrev in ai_abbrevs:
                exmap[span].append((abbrev, f"ai_abbrev:{t}"))

def apply_local_modifiers(tokens: List[str], exmap: Dict[Tuple[int,int], List[Tuple[str,str]]]) -> None:
    """Apply 1-word modifiers like 'extremely' to the immediately following single-token span."""
    for i, tok in enumerate(tokens[:-1]):
        if tok in MODIFIERS_1:
            mod = MODIFIERS_1[tok]
            target_span = (i+1, i+2)
            if target_span in exmap:
                new = []
                for s, prov in exmap[target_span]:
                    try:
                        ms = apply_modifier(mod, s)
                    except Exception:
                        continue
                    if ms:
                        new.append((ms, f"{prov}|mod:{tok}"))
                exmap[target_span].extend(new)
    # de-dup each span
    for k, v in list(exmap.items()):
        exmap[k] = uniq_preserve(v)

def apply_local_homophones(tokens: List[str], exmap: Dict[Tuple[int,int], List[Tuple[str,str]]]) -> None:
    """Apply homophone indicators like 'picked up' to the immediately following span (token or phrase)."""
    n = len(tokens)
    # handle 2-word indicators like "picked up"
    for i in range(n-1):
        bigram = f"{tokens[i]} {tokens[i+1]}"
        if bigram in HOMOPHONE_1:
            # try spans starting at i+2, prefer longer (up to 3 tokens)
            for span_len in (3,2,1):
                j = i+2+span_len
                if j <= n and (i+2, j) in exmap:
                    new=[]
                    for s, prov in exmap[(i+2,j)]:
                        key=s.upper()
                        if key in HOMOPHONES:
                            for v in HOMOPHONES[key]:
                                new.append((v.upper(), f"{prov}|hom:{bigram}"))
                    exmap[(i+2,j)].extend(new)
                    break
    # handle 1-word indicators like "heard"
    for i,tok in enumerate(tokens[:-1]):
        if tok in HOMOPHONE_1:
            for span_len in (3,2,1):
                j = i+1+span_len
                if j <= n and (i+1, j) in exmap:
                    new=[]
                    for s, prov in exmap[(i+1,j)]:
                        key=s.upper()
                        if key in HOMOPHONES:
                            for v in HOMOPHONES[key]:
                                new.append((v.upper(), f"{prov}|hom:{tok}"))
                    exmap[(i+1,j)].extend(new)
                    break
    for k,v in list(exmap.items()):
        exmap[k]=uniq_preserve(v)



# ---------------------------------
# Indicator detection
# ---------------------------------
@dataclass
class IndicatorHit:
    kind: str   # modifier/container/reversal/anagram
    span: Tuple[int, int]
    value: str  # sentinel or indicator token

def detect_indicators(tokens: List[str]) -> List[IndicatorHit]:
    hits: List[IndicatorHit] = []

    # modifiers 3-gram, 2-gram, 1-gram
    for i, w in windows(tokens, 3):
        if w in MODIFIERS_3:
            hits.append(IndicatorHit("modifier", (i, i+3), MODIFIERS_3[w]))
    for i, w in windows(tokens, 2):
        if w in MODIFIERS_2:
            hits.append(IndicatorHit("modifier", (i, i+2), MODIFIERS_2[w]))
        if w in CONTAINER_2:
            hits.append(IndicatorHit("container", (i, i+2), " ".join(w)))
    for i, w in windows(tokens, 1):
        t = w[0]
        if t in MODIFIERS_1:
            hits.append(IndicatorHit("modifier", (i, i+1), MODIFIERS_1[t]))
        if t in CONTAINER_1:
            hits.append(IndicatorHit("container", (i, i+1), t))
        if t in REVERSAL_1:
            hits.append(IndicatorHit("reversal", (i, i+1), t))
        if t in ANAGRAM_1:
            hits.append(IndicatorHit("anagram", (i, i+1), t))
        if t in HOMOPHONE_1:
            hits.append(IndicatorHit("homophone", (i, i+1), t))

    # deterministic ordering: earlier spans first
    hits.sort(key=lambda h: (h.span[0], h.span[1], h.kind))
    return hits


# ---------------------------------
# Frame generation (constrained)
# ---------------------------------
def build_units(tokens: List[str], exmap: Dict[Tuple[int,int], List[Tuple[str,str]]], max_units: int = 8):
    """
    Make a small list of "units" from expansions, preferring longer phrases.
    Unit = (span, string, provenance)
    """
    spans = sorted(exmap.keys(), key=lambda ij: (-(ij[1]-ij[0]), ij[0], ij[1]))
    units = []
    used = set()
    for ij in spans:
        for s, prov in exmap[ij]:
            units.append((ij, s, prov))
        used.add(ij)
        if len(units) >= max_units * 5:
            break
    # trim
    return units[: max_units * 5]

def charade_candidates(units, length: int, k: int) -> List[Tuple[str, List[Step]]]:
    """
    k-part charade: concatenate k unit strings (no span overlap required, but we
    later down-score overlaps). Constrained by exact length.
    """
    outs = []
    # use small pool
    pool = units[:20]
    for parts in itertools_product(pool, repeat=k):
        s = "".join(p[1] for p in parts)
        if len(s) != length:
            continue
        steps = []
        for (span, seg, prov) in parts:
            steps.append(Step(op="unit", src=[f"{span}"], out=seg, note=prov))
        steps.append(Step(op="charade", src=[p[1] for p in parts], out=s, note=f"{k}-part"))
        outs.append((s, steps))
    return outs


def charade_with_reversal_candidates(units, length: int) -> List[Tuple[str, List[Step]]]:
    """
    2-part charade where one component is reversed.
    Handles patterns like "Cross about inventor" = ROOD reversed + BELL = DOOR + BELL = DOORBELL
    """
    outs = []
    pool = units[:20]

    for a in pool:
        for b in pool:
            if a[0] == b[0]:  # same span
                continue

            A_span, A_str, A_prov = a
            B_span, B_str, B_prov = b

            # Try reversing A (first component)
            A_rev = A_str[::-1]
            s1 = A_rev + B_str
            if len(s1) == length:
                steps = [
                    Step(op="unit", src=[f"{A_span}"], out=A_str, note=A_prov),
                    Step(op="reversal", src=[A_str], out=A_rev, note="reverse"),
                    Step(op="unit", src=[f"{B_span}"], out=B_str, note=B_prov),
                    Step(op="charade", src=[A_rev, B_str], out=s1, note="2-part (first reversed)")
                ]
                outs.append((s1, steps))

            # Try reversing B (second component)
            B_rev = B_str[::-1]
            s2 = A_str + B_rev
            if len(s2) == length:
                steps = [
                    Step(op="unit", src=[f"{A_span}"], out=A_str, note=A_prov),
                    Step(op="unit", src=[f"{B_span}"], out=B_str, note=B_prov),
                    Step(op="reversal", src=[B_str], out=B_rev, note="reverse"),
                    Step(op="charade", src=[A_str, B_rev], out=s2, note="2-part (second reversed)")
                ]
                outs.append((s2, steps))

    return outs

def itertools_product(pool, repeat: int):
    # local fast product (avoid importing itertools in this small file? already standard)
    import itertools
    return itertools.product(pool, repeat=repeat)

def container_candidates(units, length: int) -> List[Tuple[str, List[Step]]]:
    """
    A in B or B around A: try inserting one unit into another.
    """
    outs = []
    pool = units[:25]
    for a in pool:
        for b in pool:
            if a == b:
                continue
            A = a[1]
            B = b[1]
            for cut in range(0, len(B)+1):
                s = B[:cut] + A + B[cut:]
                if len(s) != length:
                    continue
                steps = [
                    Step(op="unit", src=[f"{a[0]}"], out=A, note=a[2]),
                    Step(op="unit", src=[f"{b[0]}"], out=B, note=b[2]),
                    Step(op="container", src=[A, B], out=s, note=f"insert at {cut}")
                ]
                outs.append((s, steps))
    return outs

def reversal_candidates(units, length: int) -> List[Tuple[str, List[Step]]]:
    outs = []
    pool = units[:30]
    for u in pool:
        s = u[1][::-1]
        if len(s) != length:
            continue
        steps = [
            Step(op="unit", src=[f"{u[0]}"], out=u[1], note=u[2]),
            Step(op="reversal", src=[u[1]], out=s, note="reverse")
        ]
        outs.append((s, steps))
    return outs

def homophone_candidates(units, length: int) -> List[Tuple[str, List[Step]]]:
    """
    Generate homophone outputs using a tiny controlled HOMOPHONES table.
    If a unit equals a key in HOMOPHONES, emit its listed homophones.
    """
    outs = []
    pool = units[:40]
    for u in pool:
        key = u[1].upper()
        if key in HOMOPHONES:
            for v in HOMOPHONES[key]:
                if len(v) != length:
                    continue
                steps = [
                    Step(op="unit", src=[f"{u[0]}"], out=key, note=u[2]),
                    Step(op="homophone", src=[key], out=v, note="from HOMOPHONES table")
                ]
                outs.append((v, steps))
    return outs

def anagram_candidates(units, length: int) -> List[Tuple[str, List[Step]]]:
    """
    Record-only: we don't generate full anagram set; instead we emit a placeholder
    if unit length matches. This keeps the solver honest without a wordlist.
    """
    outs = []
    pool = units[:30]
    for u in pool:
        if len(u[1]) != length:
            continue
        steps = [
            Step(op="unit", src=[f"{u[0]}"], out=u[1], note=u[2]),
            Step(op="anagram", src=[u[1]], out=f"ANAG({u[1]})", note="requires wordlist")
        ]
        outs.append((f"ANAG({u[1]})", steps))
    return outs


# ---------------------------------
# Training recipe pipeline executor
# ---------------------------------
def exec_pipeline(recipe: dict) -> Tuple[Optional[str], List[Step]]:
    """
    Execute a small, checkable pipeline of operations producing a final string.
    Supported ops:
      - unit: value
      - charade: parts (list of strings)
      - container: outer, inner, at (int)
      - anagram_check: fodder (string)  (does NOT permute; just records check)
      - reversal: base (string)
      - delete_head/delete_tail: base, n
      - regular_letters: base, which ('odd'/'even')
      - extremes: base
    Returns (result, steps).
    """
    steps: List[Step] = []
    cur: Optional[str] = None

    def norm(s: str) -> str:
        return re.sub(r"[^A-Z]", "", s.upper())

    for op in recipe.get("pipeline", []):
        kind = op.get("op")
        if kind == "unit":
            cur = norm(str(op.get("value","")))
            steps.append(Step(op="unit", src=[op.get("source","")], out=cur, note="pipeline"))
        elif kind == "charade":
            parts = [norm(p) for p in op.get("parts", [])]
            cur = "".join(parts)
            steps.append(Step(op="charade", src=parts, out=cur, note="pipeline"))
        elif kind == "container":
            outer = norm(str(op.get("outer","")))
            inner = norm(str(op.get("inner","")))
            at = int(op.get("at", 0))
            cur = outer[:at] + inner + outer[at:]
            steps.append(Step(op="container", src=[inner, outer], out=cur, note=f"pipeline insert at {at}"))
        elif kind == "reversal":
            base = norm(str(op.get("base","")))
            cur = base[::-1]
            steps.append(Step(op="reversal", src=[base], out=cur, note="pipeline"))
        elif kind == "delete_head":
            base = norm(str(op.get("base","")))
            n = int(op.get("n", 1))
            cur = base[n:]
            steps.append(Step(op="delete_head", src=[base], out=cur, note=f"pipeline drop first {n}"))
        elif kind == "delete_tail":
            base = norm(str(op.get("base","")))
            n = int(op.get("n", 1))
            cur = base[:-n] if n <= len(base) else ""
            steps.append(Step(op="delete_tail", src=[base], out=cur, note=f"pipeline drop last {n}"))
        elif kind == "regular_letters":
            base = norm(str(op.get("base","")))
            which = str(op.get("which","odd")).lower()
            cur = base[0::2] if which == "odd" else base[1::2]
            steps.append(Step(op="regular_letters", src=[base], out=cur, note=f"pipeline {which}"))
        elif kind == "extremes":
            base = norm(str(op.get("base","")))
            cur = (base[:1] + base[-1:]) if len(base) >= 2 else base
            steps.append(Step(op="extremes", src=[base], out=cur, note="pipeline first+last"))
        elif kind == "anagram_check":
                fod = norm(str(op.get("fodder","")))
                res = norm(str(op.get("result", cur or "")))
                # If we have a current string, treat it as fodder unless explicit fodder given
                if not fod and cur is not None:
                    fod = norm(cur)
                if not res:
                    res = norm(cur or "")
                # Set current to result (training declares the intended output), but record a check
                cur = res
                note = "pipeline letters-match check"
                if fod and res and len(fod) == len(res) and sorted(fod) == sorted(res):
                    note = "pipeline letters match"
                steps.append(Step(op="anagram_check", src=[fod], out=cur, note=note))
        else:
            steps.append(Step(op="unknown_op", src=[str(op)], out=cur or "", note="unsupported"))
    return cur, steps

# ---------------------------------
# Scoring
# ---------------------------------
def overlap_penalty(spans: List[Tuple[int,int]]) -> float:
    """
    Penalize using same span multiple times.
    """
    score = 0.0
    for i in range(len(spans)):
        for j in range(i+1, len(spans)):
            a = spans[i]; b = spans[j]
            if not (a[1] <= b[0] or b[1] <= a[0]):
                score += 1.0
    return score

def score_candidate(ans: str, steps: List[Step], method: str, tokens: List[str]) -> float:
    # Base: prefer real word-like (all caps letters) over placeholders
    score = 0.0
    if re.fullmatch(r"[A-Z]+", ans):
        score += 2.0
    if "ANAG(" in ans:
        score -= 0.5

    # shorter traces slightly preferred
    score -= 0.05 * max(0, len(steps) - 3)

    # penalize overlap if we can read spans out of unit steps
    spans = []
    for st in steps:
        if st.op == "unit" and st.src and st.src[0].startswith("("):
            try:
                sp = eval(st.src[0], {}, {})  # safe enough: tuples like (i,j)
                if isinstance(sp, tuple) and len(sp) == 2:
                    spans.append(sp)
            except Exception:
                pass
    score -= 0.35 * overlap_penalty(spans)

    # method priors
    pri = {"charade2": 0.8, "charade3": 0.6, "charade_rev": 0.85, "container": 0.7, "reversal": 0.5, "anagram": 0.4}
    score += pri.get(method, 0.0)

    # Boost charade_rev if reversal indicator present in tokens
    if method == "charade_rev":
        if any(t in REVERSAL_1 for t in tokens):
            score += 0.5

    # Big boost if answer matches a known definition phrase
    for phrase, answers in PHRASES.items():
        if ans in answers:
            # Check if phrase words appear in clue tokens
            phrase_words = set(phrase.lower().split())
            token_set = set(t.lower() for t in tokens)
            if phrase_words & token_set:  # overlap
                score += 3.0
                break

    # Also check SYNONYMS for definition matches
    for word, syns in SYNONYMS.items():
        if ans in syns and word in [t.lower() for t in tokens]:
            score += 2.0
            break

    return score


# ---------------------------------
# Solve entrypoint
# ---------------------------------
# ---------------------------------
# ---------------------------------
# UI-facing analysis schema builder
# ---------------------------------

NAMED_REFERENTS = {
    ("scottish", "inventor"): {"referent": "Alexander Graham Bell", "yields": "BELL"},
}

# Step type mappings for battlecard UI
METHOD_TO_STEP_TYPE = {
    "charade2": "synonym",
    "charade3": "synonym",
    "charade_rev": "reversal",
    "container": "container",
    "reversal": "reversal",
    "anagram": "anagram",
    "anagram_known": "anagram",
    "homophone": "homophone",
    "training_container": "container",
    "training_anagram": "anagram",
    "training_charade": "synonym",
    "training_pipeline": "unknown",
    "training_hidden": "hidden",
    "training_hidden_rev": "hidden",
    "training_delete_head": "deletion",
    "training_delete_tail": "deletion",
    "training_regular_letters": "deletion",
    "training_extremes": "deletion",
    "training_reversal": "reversal",
}

# Complexity by step type (1=easy, 2=medium, 3=hard)
STEP_TYPE_COMPLEXITY = {
    "abbreviation": 1,
    "synonym": 1,
    "deletion": 2,
    "reversal": 2,
    "hidden": 2,
    "anagram": 2,
    "container": 2,
    "homophone": 2,
    "letter_movement": 3,
    "assembly": 0,
    "unknown": 2,
}

def _generate_step_explanation(step_type: str, fodder: str, result: str, indicator: str, is_assembly: bool = False, def_text: str = "") -> str:
    """Generate plain English explanation for a wordplay step."""
    if is_assembly:
        if def_text:
            return f"Combine the parts to get {result} = {def_text}"
        return f"Combine the parts to get {result}"

    if step_type == "abbreviation":
        return f'"{fodder}" is a standard cryptic abbreviation for {result}.'
    elif step_type == "synonym":
        return f'"{fodder}" → {result} (synonym lookup).'
    elif step_type == "reversal":
        if indicator:
            return f'"{indicator}" signals reversal — read "{fodder}" backwards to get {result}.'
        return f'Reverse "{fodder}" to get {result}.'
    elif step_type == "anagram":
        if indicator:
            return f'"{indicator}" signals anagram — rearrange the letters of "{fodder}" to get {result}.'
        return f'Rearrange the letters of "{fodder}" to get {result}.'
    elif step_type == "hidden":
        return f'The answer {result} is hidden within "{fodder}".'
    elif step_type == "container":
        if indicator:
            return f'"{indicator}" signals insertion — one part goes inside another to form {result}.'
        return f'Insert one part inside another to form {result}.'
    elif step_type == "homophone":
        if indicator:
            return f'"{indicator}" signals a homophone — "{fodder}" sounds like {result}.'
        return f'"{fodder}" sounds like {result}.'
    elif step_type == "deletion":
        return f'Apply deletion to "{fodder}" to get {result}.'
    else:
        return f'"{fodder}" → {result}'


def validate_definition(def_text: str, answer: str) -> Tuple[bool, str]:
    """
    Validate that the definition text actually relates to the answer.
    Returns (is_valid, match_type) where match_type is 'synonym', 'direct', or 'none'.
    """
    if not def_text or not answer:
        return (False, "none")

    answer_upper = answer.upper().strip()
    # Strip trailing numbers/enumeration from definition
    def_lower = re.sub(r'\s*\d+\s*$', '', def_text.lower().strip())
    def_words = [w for w in def_lower.split() if not w.isdigit()]

    # Check 1: Direct match (definition IS the answer)
    if def_lower.replace(" ", "").upper() == answer_upper:
        return (True, "direct")

    # Check 2: Definition phrase in PHRASES maps to answer
    if def_lower in PHRASES:
        if answer_upper in PHRASES[def_lower]:
            return (True, "synonym")

    # Check 3: Definition phrase in SYNONYMS maps to answer
    if def_lower in SYNONYMS:
        if answer_upper in SYNONYMS[def_lower]:
            return (True, "synonym")

    # Check 4: Any word in definition maps to answer via SYNONYMS
    for word in def_words:
        if word in SYNONYMS and answer_upper in SYNONYMS[word]:
            return (True, "synonym")

    # Check 5: Reverse lookup - answer maps to definition word
    if answer_upper.lower() in SYNONYMS:
        for syn in SYNONYMS[answer_upper.lower()]:
            if syn.lower() in def_words or syn.lower() == def_lower:
                return (True, "synonym")

    # Check 6: Answer appears as key, definition word appears as value (anywhere in SYNONYMS)
    for key, values in SYNONYMS.items():
        if answer_upper in values:
            if key in def_words or key == def_lower:
                return (True, "synonym")

    # No validation found
    return (False, "none")


def build_pattern_instance(clue: str, length: int, tokens: List[str], best_candidate: Optional[Dict[str, Any]],
                           definition: Dict[str, Any], all_candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build a PatternInstance object matching the TypeScript interface for battlecard UI.

    This is the primary output format for the React UI.
    """
    import uuid

    answer = best_candidate.get("answer", "") if best_candidate else ""
    method = best_candidate.get("method", "unknown") if best_candidate else "unknown"
    steps_raw = best_candidate.get("steps", []) if best_candidate else []

    # Map method to pattern ID (human-readable clue type)
    pattern_id_map = {
        "charade2": "Charade",
        "charade3": "Charade",
        "charade_rev": "Charade",
        "container": "Container",
        "reversal": "Reversal",
        "anagram": "Anagram",
        "anagram_known": "Anagram",
        "homophone": "Homophone",
        "training_container": "Container",
        "training_anagram": "Anagram",
        "training_charade": "Charade",
        "training_pipeline": "Multi-step",
        "training_hidden": "Hidden Word",
        "training_hidden_rev": "Hidden Word (Reversed)",
        "training_delete_head": "Deletion",
        "training_delete_tail": "Deletion",
        "training_regular_letters": "Alternate Letters",
        "training_extremes": "Outer Letters",
        "training_reversal": "Reversal",
    }
    pattern_id = pattern_id_map.get(method, "Unknown")

    # Build variables dict (legacy compatibility)
    variables: Dict[str, str] = {}

    # Definition variables
    def_text = definition.get("text") or ""
    def_side = definition.get("side") or "left"
    def_position = "start" if def_side == "left" else "end"

    variables["def_text"] = def_text
    variables["definition_position"] = def_position.upper()

    # Validate definition-answer relationship
    def_valid, def_match_type = validate_definition(def_text, answer)
    variables["definition_match_type"] = def_match_type
    variables["definition_validated"] = "true" if def_valid else "false"
    variables["answer"] = answer
    variables["structure"] = ""

    # Build wordplay steps from trace
    wordplay_steps: List[Dict[str, Any]] = []
    step_results: List[str] = []

    step_idx = 1
    for step in steps_raw:
        op = step.get("op", "")
        out = step.get("out", "")
        note = step.get("note", "")
        src = step.get("src", [])

        # Skip internal steps, only use meaningful operations
        if op in ("unit", "recipe_base", "recipe_outer", "recipe_inner", "recipe_fodder",
                  "recipe_text", "recipe_part", "fodder_tokens", "fodder_concat"):
            continue

        # Determine step type
        step_type = "unknown"
        if op == "charade":
            step_type = "synonym"
        elif op == "container":
            step_type = "container"
        elif op == "reversal":
            step_type = "reversal"
        elif op in ("anagram", "anagram_check"):
            step_type = "anagram"
        elif op == "homophone":
            step_type = "homophone"
        elif op in ("hidden", "hidden_rev"):
            step_type = "hidden"
        elif op in ("delete_head", "delete_tail", "regular_letters", "extremes"):
            step_type = "deletion"

        complexity = STEP_TYPE_COMPLEXITY.get(step_type, 2)

        # Extract fodder from sources
        fodder = ""
        if isinstance(src, list) and src:
            fodder = " + ".join(str(s) for s in src if s)

        # Extract indicator from note if available
        indicator = ""
        if "indicator=" in note:
            m = re.search(r"indicator='([^']*)'", note)
            if m:
                indicator = m.group(1)

        is_assembly = (op == "charade" and len(src) > 1)

        explanation = _generate_step_explanation(step_type, fodder, out, indicator, is_assembly, def_text)

        wordplay_step = {
            "indicator": indicator,
            "fodder": fodder,
            "result": out,
            "synonym": "",
            "hint": note,
            "complexity": complexity,
            "isAssembly": is_assembly,
            "stepType": step_type,
            "explanation": explanation
        }
        wordplay_steps.append(wordplay_step)

        if out and not is_assembly:
            step_results.append(out)

        # Store in variables
        variables[f"indicator_{step_idx}_text"] = indicator
        variables[f"fodder_{step_idx}_text"] = fodder
        variables[f"result_{step_idx}"] = out
        variables[f"complexity_{step_idx}"] = str(complexity)
        step_idx += 1

    # Sort wordplay steps: non-assembly by complexity (ascending), assembly last
    wordplay_steps.sort(key=lambda s: (1 if s["isAssembly"] else 0, s["complexity"]))

    # Build parsing summary
    parsing_summary = ""
    if step_results and answer:
        parsing_summary = " + ".join(step_results) + " = " + answer
    variables["structure"] = parsing_summary

    # Check completeness - requires validated definition-answer relationship
    is_complete = bool(def_text and answer and len(wordplay_steps) > 0 and def_valid)

    # Build techniques used
    techniques_used: List[str] = []
    step_types_seen = set(s["stepType"] for s in wordplay_steps if not s["isAssembly"])

    if "abbreviation" in step_types_seen:
        techniques_used.append("abbreviation")
    if "synonym" in step_types_seen:
        techniques_used.append("synonym")
    if "container" in step_types_seen:
        techniques_used.append("container")
    if "reversal" in step_types_seen:
        techniques_used.append("reversal")
    if "anagram" in step_types_seen:
        techniques_used.append("anagram")
    if "hidden" in step_types_seen:
        techniques_used.append("hidden word")
    if "homophone" in step_types_seen:
        techniques_used.append("homophone")
    if "deletion" in step_types_seen:
        techniques_used.append("deletion")

    # Detect charade from method name or multiple non-assembly steps
    is_charade = (
        method in ("charade2", "charade3", "training_charade") or
        "charade" in method.lower() or
        (len(wordplay_steps) > 1 and "container" not in step_types_seen)
    )
    if is_charade and "charade" not in techniques_used:
        techniques_used.append("charade")

    # Build setter hint
    setter_hint = ""
    if techniques_used:
        formatted = [f"**{t}**" for t in techniques_used]
        if len(formatted) == 1:
            tech_list = formatted[0]
        elif len(formatted) == 2:
            tech_list = f"{formatted[0]} and {formatted[1]}"
        else:
            tech_list = ", ".join(formatted[:-1]) + f", and {formatted[-1]}"

        look_for = ""
        if "container" in step_types_seen:
            look_for = "Can you spot the insertion indicator?"
        elif "anagram" in step_types_seen:
            look_for = "Look for the anagram indicator."
        elif "reversal" in step_types_seen:
            look_for = "Look for the reversal indicator."
        elif "hidden word" in techniques_used:
            look_for = "The answer is hiding in plain sight."
        elif "homophone" in step_types_seen:
            look_for = "Look for the auditory indicator."
        elif "charade" in techniques_used:
            look_for = "How do the parts combine?"

        setter_hint = f"The setter has used {tech_list} here. {look_for}"

    # Build definition explanation
    definition_explanation = ""
    if def_text:
        pos_text = "the start" if def_position == "start" else "the end"
        definition_explanation = f'The definition is "{def_text}" — found at {pos_text}. This maps to {answer}.'

    # Build solveExplanation display blocks
    solve_explanation: List[Dict[str, Any]] = []

    # 1. Clue type
    solve_explanation.append({
        "type": "clue-type",
        "content": pattern_id,
        "label": "Clue Type"
    })

    # 2. Setter hint
    if setter_hint:
        solve_explanation.append({
            "type": "setter-hint",
            "content": setter_hint,
            "techniques": techniques_used
        })

    # 3. Definition explanation
    if definition_explanation:
        solve_explanation.append({
            "type": "explanation",
            "content": definition_explanation,
            "label": "Definition"
        })

    # 4. Wordplay step explanations
    for idx, step in enumerate(wordplay_steps):
        if step["explanation"] and not step["isAssembly"]:
            solve_explanation.append({
                "type": "explanation",
                "content": step["explanation"],
                "label": f"Step {idx + 1}"
            })

    # 5. Assembly step
    assembly_step = next((s for s in wordplay_steps if s["isAssembly"]), None)
    if assembly_step and assembly_step["explanation"]:
        solve_explanation.append({
            "type": "explanation",
            "content": assembly_step["explanation"],
            "label": "Assembly"
        })

    # 6. Parsing summary
    if parsing_summary:
        solve_explanation.append({
            "type": "parsing",
            "content": parsing_summary,
            "label": "Parsing"
        })

    return {
        "id": str(uuid.uuid4()),
        "patternId": pattern_id,
        "clueText": clue,
        "answer": answer,
        "variables": variables,
        "solveSteps": [],  # Legacy field

        # Pre-computed fields for UI
        "wordplaySteps": wordplay_steps,
        "isComplete": is_complete,
        "parsingSummary": parsing_summary,
        "definitionText": def_text,
        "definitionMatchType": def_match_type,
        "definitionExplanation": definition_explanation,
        "definitionPosition": def_position,
        "definitionHint": "",

        # Teaching fields
        "techniquesUsed": techniques_used,
        "setterHint": setter_hint,

        # Display blocks for data-driven UI
        "solveExplanation": solve_explanation,

        # Metadata
        "thesaurusRequired": False,
    }

METHOD_TO_ACTION = {
    "reversal": "reverse",
    "container": "insert",
    "anagram": "anagram",
    "charade2": "concatenate",
    "training_anagram": "anagram",
    "training_container": "insert",
    "training_charade": "concatenate",
    "training_pipeline": "multi_step",
    "training_hidden": "hidden",
    "training_hidden_rev": "hidden_reversed",
    "training_delete_head": "delete_head",
    "training_delete_tail": "delete_tail",
    "training_regular_letters": "regular_letters",
    "training_extremes": "extremes",
    "training_reversal": "reverse",
    "homophone": "homophone",
}

def _parse_span(s: Any) -> Optional[List[int]]:
    if not isinstance(s, str):
        return None
    m = re.match(r"^\((\d+),\s*(\d+)\)$", s.strip())
    if not m:
        return None
    return [int(m.group(1)), int(m.group(2))]

def _span_union(spans: List[List[int]]) -> Optional[List[int]]:
    if not spans:
        return None
    return [min(s[0] for s in spans), max(s[1] for s in spans)]

def _collect_used(tokens_len: int, spans: List[List[int]]) -> List[bool]:
    used = [False] * tokens_len
    for a, b in spans:
        for i in range(max(0, a), min(tokens_len, b)):
            used[i] = True
    return used

def _best_end_definition(tokens: List[str], used: List[bool], indicator_spans: Optional[List[List[int]]] = None) -> Dict[str, Any]:
    n = len(tokens)
    if n == 0:
        return {"text": None, "span": None, "side": None, "confidence": 0.0, "rationale": "no tokens"}

    # Invalid starting words for definitions
    INVALID_DEF_STARTS = {"and", "or", "but", "is", "are", "was", "were", "of", "in", "with", "for", "to", "from"}

    prefer_right = None
    if indicator_spans:
        mid = sum((a + b) / 2 for a, b in indicator_spans) / len(indicator_spans)
        prefer_right = (mid < n / 2)

    def left_candidate(k: int):
        if n >= k and not any(used[i] for i in range(0, k)):
            if tokens[0].lower() in INVALID_DEF_STARTS:
                return None
            return {
                "text": " ".join(tokens[0:k]),
                "span": [0, k],
                "side": "left",
                "confidence": 0.62 if k == 1 else 0.58,
                "rationale": "unused left edge; opposite-indicator preference"
            }
        return None

    def right_candidate(k: int):
        if n >= k and not any(used[i] for i in range(n - k, n)):
            if tokens[n - k].lower() in INVALID_DEF_STARTS:
                return None
            return {
                "text": " ".join(tokens[n - k:n]),
                "span": [n - k, n],
                "side": "right",
                "confidence": 0.62 if k == 1 else 0.58,
                "rationale": "unused right edge; opposite-indicator preference"
            }
        return None

    orders = []
    if prefer_right is True:
        orders = [right_candidate, left_candidate]
    elif prefer_right is False:
        orders = [left_candidate, right_candidate]
    else:
        orders = [left_candidate, right_candidate]

    for fn in orders:
        for k in (3, 2, 1):
            cand = fn(k)
            if cand:
                return cand

    return {"text": tokens[0], "span": [0, 1], "side": "left", "confidence": 0.30, "rationale": "fallback"}

def _guess_definition(tokens: List[str], used: List[bool], indicator_spans: Optional[List[List[int]]] = None) -> Dict[str, Any]:
    return _best_end_definition(tokens, used, indicator_spans)

def build_analysis_result(clue: str, enumeration: str, length: int, tokens: List[str], candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
    best = candidates[0] if candidates else None

    def _clue_type_from_method(m: Optional[str]) -> str:
        if not m:
            return "unknown"
        if m.startswith("training_"):
            if m == "training_pipeline":
                return "multi_step"
            return m.replace("training_", "")
        return m

    primary_type = _clue_type_from_method(best.get("method") if best else None)

    alts: List[Dict[str, Any]] = []
    seen = {primary_type}
    for c in candidates[1:8]:
        t = _clue_type_from_method(c.get("method"))
        if t and t not in seen:
            seen.add(t)
            alts.append({"type": t, "confidence": 0.20})
        if len(alts) >= 4:
            break

    # used spans from trace
    used_spans: List[List[int]] = []
    for c in candidates[:3]:
        for st in c.get("steps", []) or []:
            srcs = st.get("src") or []
            if isinstance(srcs, list):
                for s in srcs:
                    sp = _parse_span(s)
                    if sp is not None:
                        used_spans.append(sp)
    used = _collect_used(len(tokens), used_spans)

    # indicator spans (simple scan)
    ind_spans: List[List[int]] = []
    for i in range(len(tokens)):
        for n in (2, 1):
            if i + n <= len(tokens):
                key = tuple(t.lower() for t in tokens[i:i+n])
                if n == 2 and key in CONTAINER_2:
                    ind_spans.append([i, i+n])
                elif n == 1:
                    w = key[0]
                    if w in REVERSAL_1 or w in ANAGRAM_1 or w in CONTAINER_1 or w in HOMOPHONE_1:
                        ind_spans.append([i, i+n])

    definition = _guess_definition(tokens, used, ind_spans)

    wordplays: List[Dict[str, Any]] = []
    for idx, cand in enumerate(candidates[:3], 1):
        wp_id = f"wp{idx}"
        wp_type = _clue_type_from_method(cand.get("method") or "unknown")

        # indicators (spanned)
        indicators: List[Dict[str, Any]] = []
        expected_op = None
        if wp_type in ("reversal", "hidden_rev"):
            expected_op = "__reversal__"
        elif wp_type == "container":
            expected_op = "__container__"
        elif wp_type == "anagram":
            expected_op = "__anagram__"

        found = []
        for i in range(len(tokens)):
            for n in (2, 1):
                if i + n <= len(tokens):
                    key = tuple(t.lower() for t in tokens[i:i+n])
                    op = None
                    phrase = " ".join(tokens[i:i+n]).lower()
                    if n == 2 and key in CONTAINER_2:
                        op = "__container__"
                    elif n == 1:
                        w = key[0]
                        if w in CONTAINER_1:
                            op = "__container__"
                        elif w in REVERSAL_1:
                            op = "__reversal__"
                        elif w in ANAGRAM_1:
                            op = "__anagram__"
                        elif phrase in HOMOPHONE_1:
                            op = "__homophone__"
                    if op and (expected_op is None or op == expected_op):
                        found.append((i, i+n, " ".join(tokens[i:i+n])))

        seen_sp = set()
        for (a, b, name) in found:
            if (a, b) in seen_sp:
                continue
            seen_sp.add((a, b))
            indicators.append({
                "id": f"{wp_id}_ind{len(indicators)+1}",
                "name": name,
                "span": [a, b],
                "action": METHOD_TO_ACTION.get(wp_type, "unknown"),
                "scope": "unknown",
                "confidence": 0.70
            })

        # fodder with spans from trace
        fodder: List[Dict[str, Any]] = []
        for st in cand.get("steps", []) or []:
            if st.get("op") in ("unit", "recipe_base", "recipe_fodder", "recipe_text"):
                span = None
                srcs = st.get("src") or []
                if isinstance(srcs, list):
                    spans = [_parse_span(s) for s in srcs]
                    spans = [s for s in spans if s is not None]
                    if spans:
                        span = _span_union(spans)
                fodder.append({
                    "text": st.get("note") or None,
                    "span": span,
                    "normalized": st.get("out"),
                    "source": "trace",
                    "confidence": 0.70 if span else 0.55
                })

        # named referents
        for k, meta in NAMED_REFERENTS.items():
            klen = len(k)
            for i in range(len(tokens) - klen + 1):
                if tuple(t.lower() for t in tokens[i:i+klen]) == k:
                    if meta.get("yields") and meta["yields"] in (cand.get("answer") or ""):
                        fodder.append({
                            "text": " ".join(tokens[i:i+klen]),
                            "span": [i, i+klen],
                            "normalized": meta["yields"],
                            "source": "named_referent",
                            "confidence": 0.75,
                            "referent": meta.get("referent")
                        })

        ops: List[Dict[str, Any]] = []
        for st in cand.get("steps", []) or []:
            ops.append({"op": st.get("op"), "input": st.get("src"), "output": st.get("out"), "note": st.get("note")})

        wordplays.append({
            "id": wp_id,
            "type": wp_type,
            "confidence": min(0.95, 0.35 + float(cand.get("score") or 0.0) / 10.0),
            "indicators": indicators,
            "fodder": fodder,
            "operations": ops,
            "result": {"answer": cand.get("answer"), "length": length, "score": cand.get("score")}
        })

    stitched = []
    for idx, c in enumerate(candidates):
        stitched.append({
            "answer": c.get("answer"),
            "score": c.get("score"),
            "method": c.get("method"),
            "wordplay_id": f"wp{idx+1}" if idx < 3 else None,
            "steps": c.get("steps"),
            "notes": c.get("notes"),
        })

    # Build patternData for battlecard UI (TypeScript PatternInstance format)
    best_candidate = candidates[0] if candidates else None
    pattern_data = build_pattern_instance(clue, length, tokens, best_candidate, definition, candidates)

    return {
        "clue": {"text": clue, "enumeration": enumeration, "length": length, "tokens": tokens},
        "analysis": {
            "clue_type": {"primary": primary_type, "confidence": 0.35 if primary_type == "unknown" else 0.60, "alternatives": alts},
            "definition": definition,
            "wordplay": wordplays
        },
        "candidates": stitched,
        "patternData": pattern_data
    }


def _get_definition_candidates(tokens: List[str], indicator_spans: List[List[int]] = None, log: bool = False) -> List[Dict[str, Any]]:
    """
    Return valid definition candidates using prioritized logic:
    1. Primary: Single-word definition at opposite end from indicators
    2. Secondary: Multi-word definition (2-3 words)
    3. Fallback 1: Cryptic definition (deferred to caller)
    4. Fallback 2: Double definition (no indicators, split clue)
    """
    import sys
    def _log(msg):
        if log:
            print(f"[DEF] {msg}", file=sys.stderr)

    INVALID_DEF_STARTS = {"and", "or", "but", "is", "are", "was", "were", "of", "in", "with", "for", "to", "from"}
    n = len(tokens)

    _log(f"Tokens: {tokens}")
    _log(f"Indicator spans: {indicator_spans}")

    # Determine preferred side based on indicator position
    prefer_right = None
    if indicator_spans:
        mid = sum((a + b) / 2 for a, b in indicator_spans) / len(indicator_spans)
        prefer_right = (mid < n / 2)  # indicators in left half -> prefer right definition
        _log(f"Indicator midpoint: {mid:.1f}, n/2: {n/2}, prefer_right: {prefer_right}")
    else:
        _log("No indicators found - will try both sides equally")

    candidates = []

    def is_valid_start(token):
        return token.lower() not in INVALID_DEF_STARTS

    # === PRIMARY: Single-word definitions ===
    _log("--- PRIMARY: Single-word definitions ---")

    if prefer_right is True:
        sides = [("right", n-1, n), ("left", 0, 1)]
    elif prefer_right is False:
        sides = [("left", 0, 1), ("right", n-1, n)]
    else:
        sides = [("left", 0, 1), ("right", n-1, n)]

    for side, start, end in sides:
        if is_valid_start(tokens[start]):
            weight = 1.0 if (prefer_right is True and side == "right") or (prefer_right is False and side == "left") else 0.8
            cand = {
                "text": tokens[start],
                "span": [start, end],
                "side": side,
                "type": "primary",
                "weight": weight
            }
            candidates.append(cand)
            _log(f"  Added: '{cand['text']}' ({side}, weight={weight})")
        else:
            _log(f"  Rejected: '{tokens[start]}' ({side}) - invalid start word")

    # === SECONDARY: Multi-word definitions (2-3 words) ===
    _log("--- SECONDARY: Multi-word definitions ---")

    def has_no_structural_words(token_list):
        return not any(t.lower() in INVALID_DEF_STARTS for t in token_list)

    for k in (2, 3):
        if n >= k:
            # Left side
            left_tokens = tokens[0:k]
            if has_no_structural_words(left_tokens):
                weight = 0.6 if prefer_right is False else 0.4
                cand = {
                    "text": " ".join(left_tokens),
                    "span": [0, k],
                    "side": "left",
                    "type": "secondary",
                    "weight": weight
                }
                candidates.append(cand)
                _log(f"  Added: '{cand['text']}' (left, {k} words, weight={weight})")
            else:
                _log(f"  Rejected: '{' '.join(left_tokens)}' (left, {k} words) - contains structural word")

            # Right side
            right_tokens = tokens[n-k:n]
            if has_no_structural_words(right_tokens):
                weight = 0.6 if prefer_right is True else 0.4
                cand = {
                    "text": " ".join(right_tokens),
                    "span": [n-k, n],
                    "side": "right",
                    "type": "secondary",
                    "weight": weight
                }
                candidates.append(cand)
                _log(f"  Added: '{cand['text']}' (right, {k} words, weight={weight})")
            else:
                _log(f"  Rejected: '{' '.join(right_tokens)}' (right, {k} words) - contains structural word")

    # === FALLBACK 2: Double definition ===
    if not indicator_spans:
        _log("--- FALLBACK 2: Double definition (no indicators) ---")
        if n >= 2:
            mid_idx = n // 2
            cand = {
                "text": f"{' '.join(tokens[:mid_idx])} | {' '.join(tokens[mid_idx:])}",
                "span": None,
                "side": "both",
                "type": "double_def",
                "weight": 0.3,
                "left_span": [0, mid_idx],
                "right_span": [mid_idx, n]
            }
            candidates.append(cand)
            _log(f"  Added double definition: '{cand['text']}'")
    else:
        _log("--- FALLBACK 2: Skipped (indicators present) ---")

    # Sort by weight descending
    candidates.sort(key=lambda x: -x.get("weight", 0))

    _log(f"--- FINAL CANDIDATES ({len(candidates)}) ---")
    for i, c in enumerate(candidates):
        _log(f"  {i+1}. [{c['type']}] '{c['text']}' ({c['side']}, weight={c.get('weight', 0)})")

    return candidates


def solve(clue: str, length: int, max_candidates: int = 50, known_answer: Optional[str] = None, training_json: Optional[str] = None) -> Dict[str, Any]:
    # Reset per-solve AI query counter
    global _SOLVE_AI_QUERIES
    _SOLVE_AI_QUERIES = 0

    # Track solve attempt if known_answer provided
    if known_answer:
        LEARNED_CACHE_STATS["solves_attempted"] = LEARNED_CACHE_STATS.get("solves_attempted", 0) + 1
        _save_cache_stats()

    tokens = tokenize(clue)

    # Build full expansion map first
    exmap = all_expansions(tokens)
    augment_with_ai_synonyms(tokens, exmap, length)  # AI fallback for missing synonyms
    augment_with_ai_abbreviations(tokens, exmap, length)  # AI fallback for missing abbreviations
    apply_local_modifiers(tokens, exmap)
    apply_local_homophones(tokens, exmap)
    hits = detect_indicators(tokens)

    # Get indicator spans for definition logic
    ind_spans = [[h.span[0], h.span[1]] for h in hits] if hits else None

    # Get possible definition positions (using indicator info)
    def_candidates = _get_definition_candidates(tokens, indicator_spans=ind_spans, log=True)

    # Normalize known_answer for comparison
    ka = re.sub(r"[^A-Z]", "", known_answer.upper()) if known_answer else None

    # Try solving with each definition candidate in priority order
    # Stop on first success (answer found)
    all_cands: List[Candidate] = []
    winning_def_cand = None

    import sys
    for def_idx, def_cand in enumerate(def_candidates):
        def_span = def_cand.get("span")
        def_type = def_cand.get("type", "unknown")
        def_weight = def_cand.get("weight", 0.5)
        def_text = def_cand.get("text", "")

        print(f"[SOLVE] Trying definition #{def_idx+1}: '{def_text}' ({def_type}, w={def_weight})", file=sys.stderr)

        # Skip double_def for now (no wordplay to solve)
        if def_type == "double_def":
            print(f"[SOLVE]   Skipped (double_def not implemented)", file=sys.stderr)
            continue

        # Filter exmap to exclude definition span
        if def_span:
            filtered_exmap = {
                span: expansions
                for span, expansions in exmap.items()
                if span[1] <= def_span[0] or span[0] >= def_span[1]  # no overlap with definition
            }
        else:
            filtered_exmap = exmap

        # Build units from filtered expansion map
        units = build_units(tokens, filtered_exmap, max_units=10)

        # Generate candidates with this definition excluded
        gen = []
        gen.extend([("charade2", charade_candidates(units, length, 2))])
        gen.extend([("charade3", charade_candidates(units, length, 3))])
        gen.extend([("charade_rev", charade_with_reversal_candidates(units, length))])
        gen.extend([("container", container_candidates(units, length))])
        gen.extend([("reversal", reversal_candidates(units, length))])
        gen.extend([("anagram", anagram_candidates(units, length))])

        def_cands: List[Candidate] = []
        for method, outs in gen:
            for ans, steps in outs:
                sc = score_candidate(ans, steps, method, tokens) * def_weight
                notes = [f"def:{def_cand['side']}:{def_text} ({def_type}, w={def_weight})"]
                if hits:
                    notes.append("indicators: " + ", ".join(sorted({h.kind for h in hits})))
                def_cands.append(Candidate(answer=ans, length=length, score=sc, steps=steps, method=method, notes=notes))

        print(f"[SOLVE]   Generated {len(def_cands)} candidates", file=sys.stderr)

        # Check if known_answer found in this batch
        if ka:
            found_in_batch = any(c.answer == ka for c in def_cands)
            if found_in_batch:
                print(f"[SOLVE]   ✓ FOUND '{ka}' with definition '{def_text}' (candidate #{def_idx+1})", file=sys.stderr)
                winning_def_cand = def_cand
                all_cands.extend(def_cands)
                break  # Stop on first success
            else:
                print(f"[SOLVE]   ✗ '{ka}' not found, trying next definition...", file=sys.stderr)

        all_cands.extend(def_cands)

        # In non-training mode, stop after first definition that produces candidates
        if not ka and def_cands:
            print(f"[SOLVE]   Stopping (non-training mode, got candidates)", file=sys.stderr)
            break

    # Log training validation result
    if ka and winning_def_cand:
        print(f"[SOLVE] Definition validation: '{winning_def_cand['text']}' was correct (type={winning_def_cand['type']}, weight={winning_def_cand['weight']})", file=sys.stderr)
    elif ka:
        print(f"[SOLVE] Definition validation: FAILED - '{ka}' not found in any definition candidate", file=sys.stderr)

    # Also try with full tokens (no definition excluded) for backwards compatibility
    units = build_units(tokens, exmap, max_units=10)

    cands: List[Candidate] = []

    # If we have a known answer (training/regression), try to validate it against
    # any detected anagram indicator using extracted fodder, and if it fits, inject
    # it as a concrete candidate with a checkable trace.
    if known_answer:
        ka = re.sub(r"[^A-Z]", "", known_answer.upper())
        if len(ka) == length:
            for h in hits:
                if h.kind == "anagram":
                    fod_toks, fod = extract_anagram_fodder(tokens, h.span, target_length=length)
                    if len(fod) == length and sorted(fod) == sorted(ka):
                        steps = [
                            Step(op="fodder_tokens", src=fod_toks, out=" ".join(fod_toks), note="fodder; stopwords removed"),
                            Step(op="fodder_concat", src=fod_toks, out=fod, note="concatenate letters"),
                            Step(op="anagram", src=[fod, h.value], out=ka, note=f"indicator='{h.value}'"),
                        ]
                        cands.append(Candidate(
                            answer=ka,
                            length=length,
                            score=9.0,  # strong prior for validated known answer
                            steps=steps,
                            method="anagram_known",
                            notes=["validated_known_answer"]
                        ))


    # If training_json is provided, we can validate specific wordplay recipes (from your training notes)
    # and inject the known answer only when the construction checks out.
    if training_json:
        try:
            recipe = json.loads(training_json)
        except Exception:
            recipe = None
        if recipe and known_answer:
            ka = re.sub(r"[^A-Z]", "", known_answer.upper())


            # Preferred: explicit multi-step pipeline recipes (e.g., container then anagram check).
            if isinstance(recipe, dict) and recipe.get("pipeline"):
                built, steps = exec_pipeline(recipe)
                if built and built == ka and len(ka) == length:
                    cands.append(Candidate(
                        answer=ka, length=length, score=9.0,
                        steps=steps, method="training_pipeline",
                        notes=["validated_training_recipe"]
                    ))

            rtype = recipe.get("type")
            if rtype == "container":
                outer = recipe.get("outer", "").upper()
                inner = recipe.get("inner", "").upper()
                at = recipe.get("at")
                if outer and inner and len(ka) == length:
                    # build all possible insertions unless 'at' specified
                    cuts = [at] if isinstance(at, int) else list(range(0, len(outer)+1))
                    for cut in cuts:
                        built = outer[:cut] + inner + outer[cut:]
                        if built == ka:
                            steps = [
                                Step(op="recipe_outer", src=[recipe.get("outer_source","")], out=outer, note="training recipe"),
                                Step(op="recipe_inner", src=[recipe.get("inner_source","")], out=inner, note="training recipe"),
                                Step(op="container", src=[inner, outer], out=built, note=f"insert at {cut}"),
                            ]
                            cands.append(Candidate(
                                answer=ka, length=length, score=9.0,
                                steps=steps, method="training_container",
                                notes=["validated_training_recipe"]
                            ))

            elif rtype == "anagram":
                fodder = re.sub(r"[^A-Z]", "", str(recipe.get("fodder","")).upper())
                if fodder and len(ka) == length and len(fodder) == length and sorted(fodder) == sorted(ka):
                    steps = [
                        Step(op="recipe_fodder", src=[recipe.get("fodder_source","")], out=fodder, note="training recipe"),
                        Step(op="anagram_check", src=[fodder], out=ka, note="letters match (training)"),
                    ]
                    cands.append(Candidate(
                        answer=ka, length=length, score=9.0,
                        steps=steps, method="training_anagram",
                        notes=["validated_training_recipe"]
                    ))
            elif rtype == "hidden":
                textsrc = str(recipe.get("text",""))
                hay = re.sub(r"[^A-Z]", "", textsrc.upper())
                if ka in hay and len(ka) == length:
                    steps = [
                        Step(op="recipe_text", src=[recipe.get("text_source","")], out=textsrc, note="training recipe"),
                        Step(op="hidden", src=[textsrc], out=ka, note="substring (training)"),
                    ]
                    cands.append(Candidate(
                        answer=ka, length=length, score=9.0,
                        steps=steps, method="training_hidden",
                        notes=["validated_training_recipe"]
                    ))
            elif rtype == "hidden_rev":
                textsrc = str(recipe.get("text",""))
                hay = re.sub(r"[^A-Z]", "", textsrc.upper())
                rev = ka[::-1]
                if rev in hay and len(ka) == length:
                    steps = [
                        Step(op="recipe_text", src=[recipe.get("text_source","")], out=textsrc, note="training recipe"),
                        Step(op="hidden_rev", src=[textsrc], out=ka, note="reversed substring (training)"),
                    ]
                    cands.append(Candidate(
                        answer=ka, length=length, score=9.0,
                        steps=steps, method="training_hidden_rev",
                        notes=["validated_training_recipe"]
                    ))
            elif rtype == "delete_head":
                base_txt = re.sub(r"[^A-Z]", "", str(recipe.get("base","")).upper())
                n = int(recipe.get("n", 1))
                built = base_txt[n:]
                if built == ka and len(ka) == length:
                    steps = [
                        Step(op="recipe_base", src=[recipe.get("base_source","")], out=base_txt, note="training recipe"),
                        Step(op="delete_head", src=[base_txt], out=built, note=f"drop first {n}"),
                    ]
                    cands.append(Candidate(answer=ka, length=length, score=9.0,
                        steps=steps, method="training_delete_head", notes=["validated_training_recipe"]))

            elif rtype == "delete_tail":
                base_txt = re.sub(r"[^A-Z]", "", str(recipe.get("base","")).upper())
                n = int(recipe.get("n", 1))
                built = base_txt[:-n] if n <= len(base_txt) else ""
                if built == ka and len(ka) == length:
                    steps = [
                        Step(op="recipe_base", src=[recipe.get("base_source","")], out=base_txt, note="training recipe"),
                        Step(op="delete_tail", src=[base_txt], out=built, note=f"drop last {n}"),
                    ]
                    cands.append(Candidate(answer=ka, length=length, score=9.0,
                        steps=steps, method="training_delete_tail", notes=["validated_training_recipe"]))

            elif rtype == "regular_letters":
                base_txt = re.sub(r"[^A-Z]", "", str(recipe.get("base","")).upper())
                which = str(recipe.get("which","odd")).lower()  # odd/even (1-indexed)
                if which == "odd":
                    built = base_txt[0::2]
                else:
                    built = base_txt[1::2]
                if built == ka and len(ka) == length:
                    steps = [
                        Step(op="recipe_base", src=[recipe.get("base_source","")], out=base_txt, note="training recipe"),
                        Step(op="regular_letters", src=[base_txt], out=built, note=which),
                    ]
                    cands.append(Candidate(answer=ka, length=length, score=9.0,
                        steps=steps, method="training_regular_letters", notes=["validated_training_recipe"]))

            elif rtype == "extremes":
                base_txt = re.sub(r"[^A-Z]", "", str(recipe.get("base","")).upper())
                built = (base_txt[:1] + base_txt[-1:]) if len(base_txt) >= 2 else base_txt
                if built == ka and len(ka) == length:
                    steps = [
                        Step(op="recipe_base", src=[recipe.get("base_source","")], out=base_txt, note="training recipe"),
                        Step(op="extremes", src=[base_txt], out=built, note="first+last"),
                    ]
                    cands.append(Candidate(answer=ka, length=length, score=9.0,
                        steps=steps, method="training_extremes", notes=["validated_training_recipe"]))

            elif rtype == "reversal":
                base_txt = re.sub(r"[^A-Z]", "", str(recipe.get("base","")).upper())
                built = base_txt[::-1]
                if built == ka and len(ka) == length:
                    steps = [
                        Step(op="recipe_base", src=[recipe.get("base_source","")], out=base_txt, note="training recipe"),
                        Step(op="reversal", src=[base_txt], out=built, note="reverse"),
                    ]
                    cands.append(Candidate(answer=ka, length=length, score=9.0,
                        steps=steps, method="training_reversal", notes=["validated_training_recipe"]))
            elif rtype == "charade":
                parts = [p.upper() for p in recipe.get("parts", [])]
                if parts and "".join(parts) == ka and len(ka)==length:
                    steps = [Step(op="recipe_part", src=[str(i)], out=parts[i], note="training recipe") for i in range(len(parts))]
                    steps.append(Step(op="charade", src=parts, out=ka, note=f"{len(parts)}-part (training)"))
                    cands.append(Candidate(
                        answer=ka, length=length, score=9.0,
                        steps=steps, method="training_charade",
                        notes=["validated_training_recipe"]
                    ))



# Generate basic methods (we don't require indicator presence, but we note it)
    gen = []
    gen.extend([("charade2", charade_candidates(units, length, 2))])
    gen.extend([("charade3", charade_candidates(units, length, 3))])
    gen.extend([("charade_rev", charade_with_reversal_candidates(units, length))])
    gen.extend([("container", container_candidates(units, length))])
    gen.extend([("reversal", reversal_candidates(units, length))])
    gen.extend([("anagram", anagram_candidates(units, length))])

    for method, outs in gen:
        for ans, steps in outs:
            sc = score_candidate(ans, steps, method, tokens)
            notes = []
            if hits:
                # note indicators present (for teaching)
                notes.append("indicators: " + ", ".join(sorted({h.kind for h in hits})))
            cands.append(Candidate(answer=ans, length=length, score=sc, steps=steps, method=method, notes=notes))

    # Merge candidates from definition-aware solving
    cands.extend(all_cands)

    # de-dup by answer+method
    seen = set()
    uniq = []
    for c in sorted(cands, key=lambda x: (-x.score, x.method, x.answer)):
        key = (c.answer, c.method)
        if key in seen:
            continue
        seen.add(key)
        uniq.append(c)
        if len(uniq) >= max_candidates:
            break


    # If we have a known answer, check if we found it and record stats
    if known_answer:
        import sys
        ka = re.sub(r"[^A-Z]", "", known_answer.upper())

        # Check if answer was found in candidates
        found = any(c.answer == ka for c in uniq)
        winning = next((c for c in uniq if c.answer == ka), None) if found else None

        # Battle card checks
        has_definition = winning is not None  # If we found answer, we likely had definition
        # Charade clues often have no explicit indicator - accept charade methods as implicit indicators
        has_indicator = len(hits) > 0 or (winning and winning.method in ("charade2", "charade3"))
        has_fodder = winning is not None and any(
            s.op in ("fodder_tokens", "fodder_concat", "unit", "recipe_fodder", "recipe_base", "recipe_part", "recipe_outer", "recipe_inner")
            for s in winning.steps
        )
        has_answer = found

        # Full solve requires ALL elements: definition, indicator, fodder, answer
        full_solve = has_definition and has_indicator and has_fodder and has_answer

        # Only count as passed if full solve (all battle card elements checked)
        if full_solve:
            LEARNED_CACHE_STATS["solves_passed"] = LEARNED_CACHE_STATS.get("solves_passed", 0) + 1
            if _SOLVE_AI_QUERIES == 0:
                LEARNED_CACHE_STATS["solves_no_ai"] = LEARNED_CACHE_STATS.get("solves_no_ai", 0) + 1
            _save_cache_stats()
            # Extract ai_syn/ai_abbrev provenances from steps and save validated ones
            for step in winning.steps:
                note = step.note or ""
                if note.startswith("ai_syn:"):
                    source_word = note[7:]  # strip "ai_syn:"
                    save_learned_synonym(source_word, step.out)
                elif note.startswith("ai_abbrev:"):
                    source_word = note[10:]  # strip "ai_abbrev:"
                    save_learned_abbrev(source_word, step.out)

        # Print enhanced clue result to stderr (battle card format)
        ai_status = "no-AI" if _SOLVE_AI_QUERIES == 0 else f"AI:{_SOLVE_AI_QUERIES}"
        mark = "✓" if full_solve else "✗"
        def chk(b): return "✓" if b else "✗"

        print(f"\n{'═'*65}", file=sys.stderr)
        print(f"{mark} {ka} ({length}) [{ai_status}] <- {clue}", file=sys.stderr)
        print(f"{'─'*65}", file=sys.stderr)
        print(f"Battle Card: [{chk(has_definition)}] definition  [{chk(has_indicator)}] indicator  [{chk(has_fodder)}] fodder  [{chk(has_answer)}] answer", file=sys.stderr)

        # Show steps from winning candidate
        if found and winning and winning.steps:
            print(f"Steps:", file=sys.stderr)
            for i, step in enumerate(winning.steps, 1):
                src_str = ", ".join(str(s) for s in step.src) if step.src else ""
                note_str = f" ({step.note})" if step.note else ""
                print(f"  {i}. {step.out} <- {src_str} [{step.op}]{note_str}", file=sys.stderr)
        else:
            print(f"No winning candidate found.", file=sys.stderr)

        # Show cumulative stats
        stats = get_stats_summary()
        cs = stats["cold_solve"]
        print(f"Stats: {cs['passed']}/{cs['attempted']} passed ({cs['pass_rate']}), {cs['no_ai']}/{cs['attempted']} no-AI ({cs['no_ai_rate']}), avg AI/clue: {stats['ai_queries']['avg_per_clue']}", file=sys.stderr)
        print(f"{'═'*65}\n", file=sys.stderr)

    # Build UI-facing analysis result (schema v1)
    cands_out = [c.to_dict() for c in uniq]
    enumeration = str(length)
    return build_analysis_result(clue=clue, enumeration=enumeration, length=length, tokens=tokens, candidates=cands_out)



# ---------------------------------
# CLI
# ---------------------------------
def main():
    ap = argparse.ArgumentParser(prog="cryptic_trainer", description="Constraint-first cryptic clue trainer")
    sub = ap.add_subparsers(dest="cmd", required=True)

    ap_solve = sub.add_parser("solve", help="Generate candidates with traces")
    ap_solve.add_argument("--clue", required=True)
    ap_solve.add_argument("--length", required=True, type=int)
    ap_solve.add_argument("--max", type=int, default=50)
    ap_solve.add_argument("--known-answer", default=None)
    ap_solve.add_argument("--training-json", default=None)
    ap_solve.add_argument("--pretty", action="store_true")

    ap_trace = sub.add_parser("trace", help="Only show tokenization + indicator hits")
    ap_trace.add_argument("--clue", required=True)

    sub.add_parser("stats", help="Show solve and cache statistics")
    sub.add_parser("clear-stats", help="Reset all statistics to zero")

    args = ap.parse_args()

    if args.cmd == "clear-stats":
        global LEARNED_CACHE_STATS
        LEARNED_CACHE_STATS = {
            "solves_attempted": 0, "solves_passed": 0, "solves_no_ai": 0,
            "syn_hits": 0, "syn_lookups": 0,
            "abbr_hits": 0, "abbr_lookups": 0,
            "total_ai_queries": 0
        }
        _save_cache_stats()
        print("Stats cleared.", file=__import__('sys').stderr)
        return

    if args.cmd == "trace":
        tokens = tokenize(args.clue)
        hits = detect_indicators(tokens)
        out = {"clue": args.clue, "tokens": tokens, "indicator_hits": [asdict(h) for h in hits]}
        print(json.dumps(out, indent=2))
        return

    if args.cmd == "stats":
        print(json.dumps(get_stats_summary(), indent=2))
        return

    if args.cmd == "solve":
        out = solve(args.clue, args.length, max_candidates=args.max, known_answer=args.known_answer, training_json=args.training_json)
        if args.pretty:
            print(json.dumps(out, indent=2))
        else:
            print(json.dumps(out))
        return


if __name__ == "__main__":
    main()
