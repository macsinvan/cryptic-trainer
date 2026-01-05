# Failed Import Analysis Prompt

This prompt is automatically generated when analyzing failed parser imports.
AI must follow each step in order and WAIT for user approval before proceeding.

---

## CONTEXT

```
Clue: {{CLUE_TEXT}}
Answer: {{ANSWER}}
Publication: {{PUBLICATION}}
Puzzle ID: {{PUZZLE_ID}}

Special Case Type: {{SPECIAL_CASE_TYPE}}
Special Case Reason: {{SPECIAL_CASE_REASON}}

Current Parser Output:
  Definition: {{DEF_TEXT}}
  Indicator 1: {{INDICATOR_1}}
  Fodder 1: {{FODDER_1}}
  Result 1: {{RESULT_1}}
  Indicator 2: {{INDICATOR_2}}
  Fodder 2: {{FODDER_2}}
  Result 2: {{RESULT_2}}

Full Input:
{{FULL_INPUT}}
```

---

## STEP 1: UNDERSTAND THE CLUE (Read Only)

Describe in plain English:
1. What is the definition? Where is it (START/END)?
2. What type of wordplay is used? (anagram, acrostic, charade, deletion, etc.)
3. How does the wordplay produce the answer?
4. Break down the equation: [component] + [component] = ANSWER

**CONSTRAINT: Do not propose any changes. Just describe what the clue does.**

---

## STEP 2: IDENTIFY THE GAP (Read Only)

Compare parser output to correct parsing:
1. What did the parser get RIGHT?
2. What did the parser get WRONG or MISS?
3. Why did it fail? (missing indicator, wrong fodder split, unknown synonym, etc.)

**CONSTRAINT: Do not propose any changes yet. Just identify the gap.**

---

## STEP 3: CLASSIFY THE FIX (Analysis Only)

Which category does this fix fall into?

| Category | Description | Risk Level |
|----------|-------------|------------|
| A. Add Data | Add synonym, indicator, or standalone word to dictionary | LOW |
| B. Add Pattern | New pattern type the parser doesn't handle | MEDIUM |
| C. Modify Logic | Change how existing patterns are parsed | HIGH |
| D. Edge Case | One-off clue that doesn't fit any pattern | DEFER |

**CONSTRAINT: State the category and explain why. Do not write code.**

---

## STEP 4: PROPOSE SOLUTION (Requires Approval)

Based on the category:

### If Category A (Add Data):
- Which file? (synonymDictionary.ts, clueParser.ts indicators)
- What exact entries to add?
- Example: `'definitely': 'SURE'` in STANDALONE_SYNONYMS

### If Category B (Add Pattern):
- Describe the pattern in plain English
- What indicators trigger it?
- How should fodder be extracted?
- How should result be computed?

### If Category C (Modify Logic):
- Which function needs modification?
- What is the current behavior?
- What should the new behavior be?
- What existing clues might be affected?

### If Category D (Edge Case):
- Explain why this doesn't fit existing patterns
- Recommend: skip, manual entry, or defer to later

**CONSTRAINT: STOP HERE. Ask "Want me to go ahead?" and wait for user to say "go" before any implementation.**

---

## STEP 5: IMPLEMENTATION (Only After "go")

Only proceed when user says "go".

Before making changes:
1. List all files that will be modified
2. List all functions that will be touched
3. Confirm no changes to protected files (see below)

After making changes:
1. Run the specific clue through parser to verify fix
2. Run regression test on sample clues (see below)
3. Report results

---

## PROTECTED FILES (Never Modify Without Explicit Permission)

- `services/clueManager.ts` - Core data persistence
- `components/ClueSolver.tsx` - Solve UI (unless specifically requested)
- `types.ts` - Type definitions
- `data/seedClues.ts` - Seed data

---

## REGRESSION TEST CLUES

After any parser change, verify these still parse correctly:

```
1. "Stream flowing back round esplanade initially (5)" = CREEK
   Type: Reversal + Letter extraction

2. "Heading away from Santa, fly like a bird (4)" = SOAR
   Type: Deletion + Synonym

3. "Nearly all our products returned are unusual (7)" = CURIOUS
   Type: Deletion + Reversal
```

---

## OUTPUT FORMAT

After completing Steps 1-4, provide summary:

```
CLUE: [clue text]
ANSWER: [answer]
CORRECT PARSING: [equation]
PARSER GAP: [what was missed]
FIX CATEGORY: [A/B/C/D]
PROPOSED FIX: [plain English description]
FILES TO MODIFY: [list]
RISK ASSESSMENT: [low/medium/high]
AWAITING GO: YES
```

---

## NOTES

- This prompt enforces a deliberate, step-by-step process
- No code changes without explicit user approval
- Each step must be completed before moving to the next
- When in doubt, classify as Category D and defer
