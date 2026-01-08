# Cryptic Trainer – Design Specification
_Last updated: 2026-01-08_

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

## Definition Detection (Improved)

### Current heuristic (v2)

1. Identify all **wordplay spans** already used (from trace).
2. Identify **indicator spans** (e.g. reversal, anagram indicators).
3. Prefer a definition at the **opposite end of the clue** from the indicator centre.
4. Try 1–3 token definitions.
5. Fall back only if necessary.

This correctly handles clues such as:

> *Cross about Scottish inventor being guest announcer (8)*  
→ definition = **guest announcer**

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

## Roadmap (Near-term)

- Prefer exact definition span trimming (e.g. `guest announcer` vs `being guest announcer`)
- Expand named referents (authors, composers, inventors)
- Confidence calibration per clue type
- UI prototype using spans

---

## Status

The system is now:
- structurally stable,
- regression-safe,
- and suitable for building a teaching UI.
