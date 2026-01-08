# Cryptic Trainer – Design Specification
_Last updated: 2026-01-08 (v3 — prioritized definition detection)_

## Purpose

The Cryptic Trainer is an **interactive teaching tool** for cryptic crosswords.

A user inputs a **single cryptic clue**.  
The system analyses the clue and returns a **structured explanation** suitable for:
- step-by-step learning,
- UI highlighting,
- regression testing,
- and future automation.

The solver **must only use the clue text (and optional training input)** — no external context is assumed unless explicitly modelled (e.g. named referents).

---

## Core Principles

1. **Clue-first**  
   All analysis is derived from the clue text.  
   Training recipes may *verify* a parse, but never invent one.

2. **Explainable output**  
   Every answer must be accompanied by:
   - definition identification,
   - wordplay breakdown,
   - indicators,
   - fodder,
   - operations.

3. **UI-ready**  
   All significant components include **token spans** so the UI can highlight:
   - definition,
   - indicators,
   - fodder.

4. **Regression-safe**  
   The same schema is used for:
   - solver output,
   - expected test results.

---

## Input

### Required
- `clue` (string)
- `length` or `enumeration` (string or int)

### Optional (training / verification)
- `known-answer`
- `training-json` (explicit wordplay recipe)

---

## Output Schema (Authoritative)

```json
{
  "clue": {
    "text": "string",
    "enumeration": "8",
    "length": 8,
    "tokens": ["token", "..."]
  },

  "analysis": {
    "clue_type": {
      "primary": "reversal | anagram | container | charade | multi_step | unknown",
      "confidence": 0.0,
      "alternatives": [
        { "type": "string", "confidence": 0.0 }
      ]
    },

    "definition": {
      "text": "string",
      "span": [start, end],
      "side": "left | right",
      "confidence": 0.0,
      "rationale": "string"
    },

    "wordplay": [
      {
        "id": "wp1",
        "type": "string",
        "confidence": 0.0,

        "indicators": [
          {
            "id": "wp1_ind1",
            "name": "string",
            "span": [start, end],
            "action": "reverse | anagram | insert | etc",
            "scope": "unknown",
            "confidence": 0.0
          }
        ],

        "fodder": [
          {
            "text": "string | null",
            "span": [start, end] | null,
            "normalized": "string",
            "source": "trace | named_referent",
            "confidence": 0.0,
            "referent": "string (optional)"
          }
        ],

        "operations": [
          {
            "op": "unit | reversal | anagram | charade | ...",
            "input": ["..."],
            "output": "string",
            "note": "string | null"
          }
        ],

        "result": {
          "answer": "string",
          "length": 8,
          "score": 0.0
        }
      }
    ]
  },

  "candidates": [
    {
      "answer": "string",
      "score": 0.0,
      "method": "string",
      "wordplay_id": "wp1",
      "steps": [],
      "notes": []
    }
  ]
}
```

---

## Definition Detection (v3 — Prioritized Candidates)

The solver identifies definition candidates using a prioritized system and tries them sequentially until a successful solve is found.

### Candidate Priority

| Priority | Type | Weight | Description |
|----------|------|--------|-------------|
| Primary | Single-word | 0.8 | First or last word of clue |
| Secondary | Multi-word | 0.6 | 2-3 words at clue ends |
| Fallback | Double-def | 0.3 | Split clue (no indicators) |

### Structural Word Filter

Multi-word definitions are rejected if they contain linking/structural words:
- `and, or, but, is, are, was, were, of, in, with, for, to, from`

Examples:
- ✓ "guest announcer" — valid
- ✗ "and miserable" — rejected (starts with "and")
- ✗ "musk is old" — rejected (contains "is")

### Indicator-Based Preference

When indicators are detected:
- Calculate indicator center position
- Prefer definition at **opposite end** from indicator center
- Example: indicator at start → prefer definition at end

### Sequential Processing

1. Generate definition candidates sorted by weight (descending)
2. For each candidate:
   - Exclude definition span from wordplay tokens
   - Generate answer candidates from remaining tokens
   - If known answer found → stop, use this definition
   - Otherwise → try next candidate
3. First successful definition wins

This correctly handles clues such as:

> *Musk is old and miserable (5)*
→ definition = **musk** (single-word, left side)
→ wordplay = O (old) + DOUR (miserable) = ODOUR

---

## Indicator Detection (Improved)

Indicators are detected by scanning:
- unigram and bigram token windows
- against curated indicator sets:
  - reversal
  - anagram
  - container
  - homophone

Each detected indicator includes:
- token span
- intended action
- confidence score

---

## Named Referents (New)

The solver now supports **explicit named referents** for teaching clarity.

Example:

```json
{
  "tokens": ["scottish", "inventor"],
  "referent": "Alexander Graham Bell",
  "yields": "BELL"
}
```

This appears in output as:

```json
{
  "text": "scottish inventor",
  "span": [2, 4],
  "normalized": "BELL",
  "source": "named_referent",
  "referent": "Alexander Graham Bell"
}
```

This is:
- explainable,
- optional,
- non-magical.

---

## Regression Testing

- Each regression case includes an `expected` object using **the same schema**.
- Tests verify:
  - correct answer present,
  - schema integrity,
  - stable explanation fields (where asserted).

This allows **incremental tightening** of expectations without breaking tests.

---

## Non-goals (Explicit)

- No grid filling
- No cross-letter inference
- No statistical language model guessing
- No external databases (except named referents explicitly encoded)

---

## Battle Card Output

During training (cold solve with `--known-answer`), the solver outputs a battle card showing solve status.

### Format

```
═══════════════════════════════════════════════════════════════════
✓ ODOUR (5) [no-AI] <- Musk is old and miserable
───────────────────────────────────────────────────────────────────
Battle Card: [✓] definition  [✓] indicator  [✓] fodder  [✓] answer
Steps:
  1. O <- (2, 3) [unit] (abbrev:old)
  2. DOUR <- (4, 5) [unit] (ai_syn:miserable)
  3. ODOUR <- O, DOUR [charade] (2-part)
Stats: 2/16 passed (12.5%), 1/16 no-AI (6.2%), avg AI/clue: 16.4
═══════════════════════════════════════════════════════════════════
```

### Elements

- **Definition**: ✓ if answer found in candidates
- **Indicator**: ✓ if explicit indicator OR charade method (implicit)
- **Fodder**: ✓ if steps include unit/fodder operations
- **Answer**: ✓ if known answer matches a candidate

Full pass requires all four elements.

---

## Roadmap (Near-term)

- Expand named referents (authors, composers, inventors)
- Confidence calibration per clue type
- Cryptic definition detection
- Double definition solving

---

## Status

The system is now:
- structurally stable,
- regression-safe,
- supports prioritized definition detection,
- includes AI-assisted synonym/abbreviation lookups with validated caching,
- outputs battle card format for training validation,
- and is suitable for building a teaching UI.

_Last updated: 2026-01-08_
