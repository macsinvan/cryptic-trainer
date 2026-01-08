# Cryptic Trainer — Design Spec (Constraint-First, Traceable)

## Purpose

Build a cryptic crossword “trainer” that:
- **does not solve by free-form AI** (too error-prone and hallucinatory),
- instead uses **explicit, checkable wordplay frames** generated from code,
- produces **machine-checkable proofs** (step-by-step),
- and supports **iterative learning**: add training clues + expected answers, run regression, inspect trace, patch gaps.

The goal is: **a human-like constrained solver** that can explain and verify its reasoning.

---

## Core Principles

### 1) Constraint-first (no “AI guesses”)
The engine should:
- identify plausible wordplay structures from indicator words/phrases,
- expand only via small controlled lexicons (abbrev/synonym/phrase tables),
- assemble candidates using a small set of operations (frames),
- output a proof trace with explicit steps.

### 2) Small steps, always testable
Each improvement should be:
- minimal (one indicator rule / one frame type / one lexicon entry),
- traceable (shows in trace logs),
- regression-tested (clue pool).

### 3) No brute force permutations
Cryptics are designed to be solved by positional logic and tight constraints.
Avoid combinatorial explosion:
- do not generate all anagrams,
- keep span lengths small (e.g., 1–4 tokens),
- prune by answer length early.

### 4) Explicit “proofs” not narratives
A solve is accepted only if we can output:
- the final answer
- a list of concrete steps (PART1, INSERT, REV, etc.)
- the originating parse frame

---

## Inputs / Outputs

### Inputs
- `clue_text` (string; may include enumeration like `(7)` or `(6,3)`)
- `answer_len` (single integer; spaces removed)
- optional `pattern` like `A..I....` (dots = unknown)
- optional `known_answer` (used for regression filtering)

### Outputs
- `ANSWER: <WORD>`
- `FRAME: <frame kind> / <indicator>`
- Proof steps list:
  - `PART1: ...`
  - `CONTAINER: ...`
  - etc.
- Optional JSON trace (`--trace trace.json`)

---

## Supported Operations

The solver builds candidates only via operations represented as frames.

### A) Charade
Concatenation of expansions.

- **charade2**: A + B
- **charade3**: A + B + C
- **charade_rev**: A + B where one component is reversed
- Special "after" rule:
  - `A after B` → B + A

Example (charade_rev):
> *Cross about Scottish inventor being guest announcer (8)*
> ROOD (cross) → reversed to DOOR + BELL (inventor) = DOORBELL

### B) Container / Insertion
Insert inner into outer:
- generate all insertion positions in the outer (bounded by short strings).

Supports:
- **1-word container indicators**: `in, inside, within, around, about, cuddling, wearing, entertaining, hiding, house, interrupts`
- **2-word container indicators**: `hiding in`, `to house`, `to cut`

### C) Reversal
Reverse an expanded string:
- `return`, `backwards`, `rev`, etc.

Supports:
- fodder before indicator
- fodder after indicator

### D) Modifiers (Letter operations)
These modify the next fodder span by inserting a **sentinel** token into the token stream:
- `__initial__` → take first letter
- `__headless__` → drop first letter
- `__inner__` → inner letters
- `__tailless__` → drop last letter

Mapped from indicators like:
- `starting late` → `__initial__`
- `content to` → `__inner__` (skips the “to”)
- `ultimately lost` → `__tailless__`
- `ultimately lost by` → `__tailless__` (targets token after “by”)

### E) Anagram (limited)
Current implementation is intentionally conservative:
- records "fodder" and flags as an anagram step,
- does **not** enumerate permutations.
- fodder extraction checks **both left and right** of the indicator, preferring the side that matches target length

Example:
> *Farm ruined later events (9)*
> "ruined" is the indicator; fodder "aftermath" is to the RIGHT, not left

(We can later add a constrained anagram matcher using letter-bag equality with a candidate source list.)

---

## Lexicon System

All expansions come from controlled tables:

### ABBREVS
Single token -> list of expansions  
Example:
- `"golf" -> ["G"]`
- `"husband" -> ["H"]`

### SYNONYMS
Single token -> list of expansions  
Example:
- `"shadow" -> ["TAIL"]`

### PHRASES
Multi-token span -> list of expansions  
Example:
- `"period of sexual excitement" -> ["RUT"]`
- `"big match nerves" -> ["SEMISTRESS"]`

### Contextual expansions (tiny)
Example:
- “cryptically” → `OT` or `NT` **only** if a Bible book is present in the clue tokens.

**Rule:** Add to lexicons only when:
- it explains a consistent pattern,
- it’s a standard crossword abbreviation,
- or it’s specifically trained for this clue set (clearly marked).

---

## Parsing and Frame Generation

### 1) Tokenization
- remove enumeration at end
- normalize punctuation/dashes
- split on spaces
- preserve curly apostrophes (`’`) as equivalent to `'` via phrase table duplicates

### 2) Indicator Detection
Scan tokens for:
- 3-word modifiers (e.g. `ultimately lost by`)
- 2-word modifiers (e.g. `content to`, `starting late`)
- 2-word container indicators (`to cut`, `hiding in`, `to house`)
- 1-word anagram/reversal/container indicators

### 3) Apply Modifiers
Convert modifier indicators into sentinel insertions:
- insert sentinel at the **end index** of the indicator
- applied right-to-left to preserve indices

### 4) Build Frames
Generate candidate frames:
- charade2: spans around a split (span length 1–4)
- charade3: consecutive spans (span length 1–4)
- container: local adjacency and 2-word indicator patterns
- reversal: local window before/after indicator
- anagram: fodder before indicator (window 1–4)

Frames are deduped by (kind, indicator, parts).

---

## Proof System

A proof is:
- a candidate answer
- a list of ProofSteps
- the originating ParseFrame

ProofSteps are always concrete operations:
- FODDER expansion
- PART expansions
- REV / CONTAINER insertion step
- CHARADE concatenation step

---

## Trace Format (JSON)

When `--trace trace.json` is provided, write:

- `clue`, `answer_len`, `pattern`, `known_answer`
- `tokens_raw`
- `tokens_modified` (with sentinels)
- `testament_hint` (OT/NT or null)
- `indicator_hits[]` (kind, text, start, end)
- `frames[]` (capped for size)
- `proofs[]` (first N proofs)
- `top_candidates[]` (frequency count)

This is the **primary debugging tool**.

---

## Training Workflow: Times for the Times

The solver is trained using real clues scraped from the Times for the Times blog (https://timesforthetimes.co.uk/). This provides ground truth including definitions (from underline markup) and wordplay explanations.

### Step 1: Scrape Ground Truth

```bash
python puzzle_scraper.py https://timesforthetimes.co.uk/times-29431-just-right --output puzzle.json
```

This extracts:
- Clue text with enumeration
- Answer (from `<strong>` tags)
- Definition (from underlined markup)
- Definition position (start/end)
- Wordplay explanation

### Step 2: Run Cold Test

```bash
python puzzle_tester.py puzzle.json --stop-on-fail
```

Tests the solver against each clue using **only the clue text** (no answer hints). Compares output to scraped ground truth.

### Step 3: Analyze First Failure

When a clue fails, examine:
- Did solver find the correct answer in candidates?
- Is the answer ranked #1?
- Does definition match?

Run detailed trace if needed:
```bash
python cryptic_trainer.py solve --clue "Clue text here" --length 8 --pretty
```

### Step 4: Fix the Gap (One Minimal Fix)

Only one category of patch per cycle:
- Add missing synonym to `SYNONYMS` (e.g., `"cross": ["ROOD"]`)
- Add missing abbreviation to `ABBREVS` (e.g., `"part": ["PT"]`)
- Add missing phrase to `PHRASES` (e.g., `"guest announcer": ["DOORBELL"]`)
- Add missing indicator to indicator sets (e.g., `"ruined"` to `ANAGRAM_1`)
- Fix parser logic if needed (e.g., bidirectional anagram fodder)

**Key Principle**: Never "teach the answer" — fix the solver to derive it from the clue using legitimate cryptic logic.

### Step 5: Add to Regression

Add passing clue to `regression_cases.json`:
```json
{
  "clue": "Cross about Scottish inventor being guest announcer (8)",
  "length": 8,
  "expected_answer": "DOORBELL"
}
```

### Step 6: Verify Regression

```bash
python cryptic_trainer.py solve --clue "..." --length N
```

Ensure all existing tests still pass.

### Step 7: Repeat

Move to next failing clue. Iterate until puzzle passes.

---

## Definition Validation

The solver validates that the identified definition actually relates to the answer before marking a result as complete.

### Validation checks (in order):
1. **Direct match** — definition text equals the answer
2. **PHRASES lookup** — definition phrase maps to answer
3. **SYNONYMS lookup** — definition word maps to answer
4. **Reverse lookup** — answer maps back to a definition word

A result is only marked `isComplete: true` if definition validation passes.

This prevents the solver from presenting hallucinated answers where the definition and answer are unrelated.

---

## Scoring System

Candidates are scored to rank the most likely answer first.

### Score components:
- **Base score**: +2.0 for valid all-caps answers, -0.5 for placeholders like `ANAG(...)`
- **Method priors**: charade_rev (0.85) > charade2 (0.8) > container (0.7) > charade3 (0.6) > reversal (0.5) > anagram (0.4)
- **Reversal indicator boost**: +0.5 if reversal indicator present and method is charade_rev
- **Definition phrase boost**: +3.0 if answer matches a known PHRASES entry whose words appear in the clue
- **Synonym boost**: +2.0 if answer matches a SYNONYMS entry whose key appears in the clue
- **Overlap penalty**: -0.35 per overlapping token span (prevents reusing the same fodder)
- **Trace length penalty**: -0.05 per step beyond 3

---

## Non-goals (for now)

- Full dictionary-based solving
- Enumerating all anagrams
- Semantic definition solving with AI
- Complex multi-stage transformations beyond simple frames

---

## Planned Extensions (next)

1) **Constrained anagram matcher**
   - Use letter-bag equality vs a candidate source list (wordlist) filtered by length and pattern.

2) **Learning-assisted lexicon suggestions**
   - Optional AI lookups in *strict mode*:
     - "give me crossword abbrev(s) for X"
     - "give me common 3–4 letter synonym(s) for X"
   - Must return small lists, cached and reviewable.

## Recently Implemented

1) **Definition validation** — answers are only marked complete if definition-answer relationship is verified
2) **Charade with reversal** — handles clues like DOORBELL (ROOD reversed + BELL)
3) **Bidirectional anagram fodder** — checks both left and right of indicator
4) **Scoring boosts** — definition phrase and synonym matches boost candidate ranking
5) **UI integration** — HTTP server with patternData output for React frontend

---

## File Inventory

- `cryptic_trainer.py` — solver, frame generation, trace
- `server.py` — HTTP server wrapper (localhost:5001) for UI integration
- `regression_cases.json` — training set with expected answers
- `puzzle_scraper.py` — scrapes Times for the Times blog for training data
- `puzzle_tester.py` — test harness for comparing solver vs ground truth
- `DESIGN_SPEC.md` — this document
- `CRYPTIC_TRAINER_DESIGN_SPEC.md` — detailed output schema

---