# Parser Updates Required

This file collects cases where the parser fails to handle a clue correctly. Each entry documents:
- The clue and answer
- What the parser detected
- What it should have detected
- What template/pattern is missing

---

## Case 1: TONSURE (Acrostic + Charade with Cryptic Definition)

**Date**: 2025-01-02

### Input
```
Times Cryptic 29351
3D Principles of theology ordinands now definitely do in monastery (7)

Answer: TONSURE
Parsing: first letters (principals) of Theology Ordinands Now, plus SURE (definitely).
```

### What Parser Detected
```
Definition: "do in monastery" (END) ✓
Indicator: "principles of" (acrostic) ✓
Fodder: "theology ordinands now definitely" ✗ (includes "definitely" which is separate)
Result: (missing)
```

### What It Should Detect
```
Definition: "do in monastery" (END) - CRYPTIC DEFINITION
  - "do" = hairstyle (cryptic usage)
  - "in monastery" = monk's hairstyle = TONSURE

Wordplay Component 1 (Acrostic):
  - Indicator: "Principles of"
  - Fodder: "theology ordinands now" (3 words only)
  - Result: T.O.N. (first letters)

Wordplay Component 2 (Synonym/Charade):
  - Fodder: "definitely"
  - Result: SURE (synonym)

Assembly: TON + SURE = TONSURE
```

### Missing Templates/Patterns

1. **Acrostic Pattern**
   - Indicator at START, takes first letters of following words
   - Need to detect where acrostic fodder ENDS (before next component)
   - Look for standalone synonym words after acrostic fodder

2. **Multi-Component Detection**
   - Clue has TWO wordplay parts: acrostic + synonym
   - Need to split fodder when there's a standalone synonym word
   - Common pattern: `[indicator] [fodder words] [synonym word] [definition]`

3. **Cryptic Definition Flag**
   - Definition requires insider knowledge
   - Should be flagged in patternData as `definition_type: 'cryptic'`
   - User needs to be told this definition has wordplay

### Suggested Parser Updates

```typescript
// 1. Add standalone synonym detection
const STANDALONE_SYNONYMS = [
  'definitely', 'sure', 'certainly', 'yes',
  'nothing', 'zero', 'nil', 'love',
  'soldier', 'ant', 'worker',
  // ... common short synonym words
];

// 2. For acrostic indicators, split fodder at standalone synonyms
if (indicator.type === 'acrostic') {
  const fodderWords = rawFodder.split(' ');
  const synonymIdx = fodderWords.findIndex(w =>
    STANDALONE_SYNONYMS.includes(w.toLowerCase())
  );
  if (synonymIdx > 0) {
    // Fodder 1 = words before synonym
    // Fodder 2 = the synonym word
    // Result 2 = lookup synonym
  }
}

// 3. Add definition_type to patternData
if (specialCase?.type === 'cryptic_definition') {
  variables['definition_type'] = 'cryptic';
  variables['definition_note'] = 'Requires cryptic knowledge';
}
```

### Action Items
- [x] Add `STANDALONE_SYNONYMS` list to synonymDictionary.ts
- [x] Update clueParser to split fodder at standalone synonyms for acrostic clues
- [x] Add second wordplay component detection (ACROSTIC_CHARADE pattern)
- [x] Add `definition_type` field to patternData
- [x] Update ClueSolver to show cryptic definition hint
- [x] Add cryptic definition detection (reconciliation check)
- [x] Add dynamic tips for definition position exceptions

### Completed (2026-01-02)
Parser now correctly handles TONSURE-style clues:
- Pattern ID: ACROSTIC_CHARADE
- result_1: TON (first letters)
- result_2: SURE (standalone synonym)
- def_text: "do in monastery" (END position)
- definition_type: cryptic
- definition_hint: "do" = hairstyle

ClueSolver now shows:
- CRYPTIC badge next to definition
- Hint explaining the cryptic meaning
- Dynamic tips for unusual definition positions

---

## Case 2: ALIGNMENT (Letter Movement + Charade)

**Date**: 2026-01-04

### Input
```
Following delay of months, slander hospital department's union (9)

Answer: ALIGNMENT
Hint: This is a composite instruction. The letter movement operation ("delay of months" = move M from the adjacent word) tells you that we do not use "slander" directly, we first need to find a synonym that has an M, and then do the move. The ENT wordplay is the easy one and should come first.
```

### What Parser Originally Detected (BEFORE fix)
```
Definition: "union" (END) ✓
Definition Match Type: synonym ✓
Indicator: "following delay of" (detected as charade) ✗
Fodder: "months, slander hospital department's"
Result: (missing)
Pattern ID: CHARADE
Needs AI: true
```

### Required Output (AFTER fix)
```
Success: true
Confidence: 100
Difficulty: Hard
Pattern ID: LETTER_MOVEMENT
Needs AI: false

Definition: "union"
Definition Match Type: synonym

Indicator 1: "following delay of"
Fodder 1: "slander, months"
Synonym 1: MALIGN
Result 1: ALIGNM
Hint 1: "slander" → MALIGN, "months" → M, move M to end → ALIGNM

Indicator 2: (implied abbreviation)
Fodder 2: "hospital department's"
Synonym 2: ENT
Result 2: ENT
Hint 2: "hospital department's" → ENT

Structure: ALIGNM + ENT = ALIGNMENT
```

### Teaching Flow (Pedagogical Order)
Present wordplay components by complexity, simplest first:

**Step 1 (Easy):** "hospital department's" → ENT
> *"In Times-style clueing, 'hospital department' very often gives ENT, because ENT is the standard abbreviation for the Ear, Nose and Throat department (you'll see it on hospital signage, referrals, etc.)"*

**Step 2 (Hard):** Letter movement - "slander" → MALIGN, move M to end → ALIGNM
> *"'delay of months' tells us to move M (abbreviation for months) to the end of an adjacent word. 'slander' = MALIGN contains M, so moving M to the end gives ALIGNM."*

**Step 3:** Assembly - ALIGNM + ENT = ALIGNMENT

### Missing Templates/Patterns

1. **Dictionary Variants for Multi-Word Phrases**
   - "hospital department's" (possessive) doesn't match "hospital department"
   - Need explicit entries for common variants:
     - `'hospital department': ['ENT', ...]`
     - `'hospital departments': ['ENT', ...]`
     - `"hospital department's": ['ENT', ...]`

2. **Letter Movement Detection**
   - "delay of" + letter source should trigger letter_movement, not charade
   - Current indicator dictionary has `'following delay of': { type: 'charade' }` which is incorrect
   - Should recognize pattern: "delay of [letter-source]" = move that letter

3. **Composite Pattern: Letter Movement + Charade**
   - Combine letter movement result with additional charade parts
   - ALIGNM (from letter movement) + ENT (from abbreviation) = ALIGNMENT

### Suggested Parser Updates

```typescript
// 1. Add dictionary variants (in synonymDictionary.ts)
'hospital department': ['ENT', 'ER', 'ICU', 'OR', 'A&E', 'WARD'],
'hospital departments': ['ENT', 'ER', 'ICU', 'OR', 'A&E', 'WARD'],
"hospital department's": ['ENT', 'ER', 'ICU', 'OR', 'A&E', 'WARD'],

// 2. Update indicator dictionary - "delay of" context detection
// When "delay of" is followed by a single-letter source (months→M),
// treat as letter_movement, not charade

// 3. Ensure tryLetterMovementCharade handles possessive forms
// Strip 's before dictionary lookup in phrase matching

// 4. Add teaching content structure for abbreviations (new export)
export const ABBREVIATION_EXPLANATIONS: Record<string, { result: string; explanation: string }> = {
    'hospital department': {
        result: 'ENT',
        explanation: 'In Times-style clueing, "hospital department" very often gives ENT, because ENT is the standard abbreviation for the Ear, Nose and Throat department (you\'ll see it on hospital signage, referrals, etc.).'
    },
    'months': {
        result: 'M',
        explanation: 'M is the standard abbreviation for months (as seen in "3M" = 3 months on contracts, medical notes, etc.)'
    },
    // Add explanations for other common abbreviations...
};
```

### Teaching Content Principle

**Every abbreviation lookup should have an explanation.** The app teaches conventions, not just answers.

When ClueSolver presents a wordplay component like "hospital department's" → ENT, it should also display:

> *"In Times-style clueing, 'hospital department' very often gives ENT, because ENT is the standard abbreviation for the Ear, Nose and Throat department (you'll see it on hospital signage, referrals, etc.)"*

This builds the student's knowledge base so they recognize the pattern in future clues.

**Structure:** Create `ABBREVIATION_EXPLANATIONS` alongside `CRYPTIC_MEANINGS` in synonymDictionary.ts:
- `CRYPTIC_MEANINGS` → explains cryptic definitions (e.g., "do" = hairstyle)
- `ABBREVIATION_EXPLANATIONS` → explains standard abbreviations (e.g., "hospital department" = ENT)

### Wordplay Ordering Principle (Pedagogical)

**Process wordplay components by complexity, simplest first.** This teaches students to:

1. **Find easy wins first** - Build confidence with quick lookups
2. **Use results to constrain harder parts** - "I need 6 more letters to complete the answer"
3. **Tackle complex operations with context** - Letter movement is easier when you know the target

| Complexity | Steps | Examples | Teaching Value |
|------------|-------|----------|----------------|
| 1 (Easy)   | 1     | Abbreviation lookup, single synonym | Quick win, builds confidence |
| 2 (Medium) | 2     | Deletion, reversal, hidden word | Standard cryptic technique |
| 3 (Hard)   | 3+    | Letter movement, substitution | Advanced - attempt last |

**For ALIGNMENT:** Present ENT first (complexity 1), then the letter movement (complexity 3).

### Action Items
- [x] Add plural/possessive variants for "hospital department" to synonymDictionary.ts
- [ ] Review other multi-word phrases that may need variants
- [x] Verify tryLetterMovementCharade is being triggered correctly
- [x] Test that "delay of [letter-source]" triggers letter movement pattern
- [x] Implement wordplay complexity rating in parser
- [x] Order wordplay components by complexity in ClueSolver UI
- [x] Create ABBREVIATION_EXPLANATIONS export in synonymDictionary.ts
- [x] Add teaching explanations for common abbreviations (ENT, M, ER, etc.)
- [ ] Update ClueSolver to display explanations during solve flow

### Completed (2026-01-04)
Parser now correctly handles ALIGNMENT-style clues:
- Pattern ID: LETTER_MOVEMENT
- Needs AI: false
- result_1: ALIGNM (slander → MALIGN, move M to end) - complexity_1: 3 (hard)
- result_2: ENT (hospital department's → ENT) - complexity_2: 1 (easy)
- structure: ALIGNM + ENT = ALIGNMENT

Changes made:
1. Added `'hospital departments'` and `"hospital department's"` to SYNONYM_DICTIONARY
2. Changed `'following delay'`, `'following delay of'`, `'delay of'`, `'delayed'` from `charade` to `letter_movement` in indicator dictionary
3. Created `ABBREVIATION_EXPLANATIONS` export with teaching content
4. Added `complexity_N` fields to pattern variables (1=easy, 2=medium, 3=hard)
5. Updated ManualEntryMode.tsx to sort wordplay steps by complexity (easy first)
6. Added answer derivation without AI (lookup definition synonyms → try wordplay → verify)
7. Added learned synonyms system (AI discoveries saved to localStorage for future use)

---

## AI Usage Policy

### The Golden Rule
**Never give AI the full clue and ask it to solve.** All AI calls must be:
1. **Constrained** - Specific, narrow questions
2. **Near-binary** - Yes/no or single-value responses
3. **Learnable** - Results saved to dictionary for future use

### Allowed AI Calls

| Call Type | Input | Output | Learning |
|-----------|-------|--------|----------|
| `verifySynonym(word, answer)` | "union", "ALIGNMENT" | true/false | If true → save to learned synonyms |
| `testHypotheses(hypotheses)` | Structured hypothesis objects | Best match + synonym | Save definition→answer and fodder→synonym |

### Forbidden AI Calls
- ❌ `solveClue(clue)` - Never ask AI to solve the full clue
- ❌ Open-ended parsing - Never ask AI to identify indicators/fodder
- ❌ Definition identification - Always use heuristics (start/end position)

### Solve Priority (No AI First)
1. **Dictionary lookup** - Check static + learned synonyms
2. **Wordplay derivation** - Try candidate answers from definition synonyms
3. **AI verification** (last resort) - Only if dictionary fails, ask constrained questions

### Learning Loop
When AI validates something new:
1. `verifySynonym("strange", "RUM")` returns true
2. "strange" → "RUM" not in static dictionary
3. Call `learnSynonym("strange", "RUM")`
4. Saved to localStorage under `cryptic_learned_synonyms`
5. Next clue with "strange" → no AI needed

---

## Architecture: Backend-First Design

### The Golden Rule
**All logic lives in the backend (parser). The UI is dumb — it only renders.**

This prevents:
- Distributed logic causing unpredictable behavior
- UI bugs from incorrect computation
- Inconsistent state between test harness and app
- Duplicated logic that drifts apart over time

### PatternInstance Computed Fields

The parser returns a `PatternInstance` with pre-computed fields ready for UI display:

```typescript
interface PatternInstance {
    // Core data
    id: string;
    patternId: string;           // Human-readable: "Charade with Letter Movement"
    clueText: string;
    answer: string;
    variables: Record<string, string>;
    solveSteps?: string[];

    // PRE-COMPUTED FIELDS (UI-ready)
    wordplaySteps?: WordplayStep[];  // Sorted: easy first, Assembly last
    isComplete?: boolean;            // True if definition + all wordplay resolved
    parsingSummary?: string;         // "ENT + ALIGNM = ALIGNMENT"
    definitionText?: string;         // "union"
    definitionMatchType?: 'direct' | 'synonym' | 'cryptic' | 'none';
}

interface WordplayStep {
    indicator: string;
    fodder: string;
    result: string;
    synonym: string;
    hint: string;
    complexity: number;   // 1=easy, 2=medium, 3=hard
    isAssembly: boolean;  // True for Assembly steps
}
```

### UI Code Pattern

The UI should NEVER compute derived values. It reads and renders:

```typescript
// ✅ CORRECT - UI reads pre-computed values
const renderBattlecardReview = () => {
    const wordplaySteps = activePatternData.wordplaySteps || [];
    const hasMissingInfo = !activePatternData.isComplete;
    const parsingSummary = activePatternData.parsingSummary || '';
    // Just render these values...
};

// ❌ WRONG - UI computing logic
const renderBattlecardReview = () => {
    const wordplaySteps = [];
    for (let i = 1; i <= 3; i++) {
        // Building steps from variables...
    }
    wordplaySteps.sort((a, b) => a.complexity - b.complexity);
    const hasMissingInfo = steps.some(s => !s.result);
    // This logic belongs in the parser!
};
```

### Testing Principle

If you can test it with `npx tsx test-clue-import.ts`, it's in the right place.

All logic should be testable without running the UI:
```bash
npx tsx test-clue-import.ts
# Shows: isComplete, parsingSummary, wordplaySteps — all computed by parser
```

### Where Logic Lives

| Concern | Location | Why |
|---------|----------|-----|
| Step ordering | `computeDerivedFields()` in clueParser.ts | Testable, single source of truth |
| isComplete check | `computeDerivedFields()` in clueParser.ts | Same logic for all consumers |
| Parsing summary | `computeDerivedFields()` in clueParser.ts | Consistent format |
| Definition matching | `findBestDefinitionMatch()` in clueParser.ts | Complex heuristics |
| Complexity rating | Assigned during pattern detection | Part of parsing |
| Rendering steps | ManualEntryMode.tsx | Just `.map()` over `wordplaySteps` |
| Show/hide conditions | ManualEntryMode.tsx | UI-only, uses `isComplete` flag |

---

## Template for New Cases

```markdown
## Case N: [ANSWER] ([Clue Type])

**Date**: YYYY-MM-DD

### Input
```
[Raw input as pasted]
```

### What Parser Detected
```
[Current parser output]
```

### What It Should Detect
```
[Correct parsing]
```

### Missing Templates/Patterns
[What's needed]

### Suggested Parser Updates
```typescript
// Code suggestions
```

### Action Items
- [ ] Task 1
- [ ] Task 2
```
