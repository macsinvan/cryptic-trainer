# Parser Design & Architecture

This document defines the architecture, principles, and patterns for the cryptic crossword parser.

---

## Architecture: Backend-First Design

### The Golden Rule
**All logic lives in the backend (parser). The UI is dumb — it only renders.**

This prevents:
- Distributed logic causing unpredictable behavior
- UI bugs from incorrect computation
- Inconsistent state between test harness and app
- Duplicated logic that drifts apart over time

### Testing Principle

If you can test it with `npx tsx test-clue-import.ts`, it's in the right place.

```bash
npx tsx test-clue-import.ts
# Shows: isComplete, parsingSummary, wordplaySteps, explanations — all computed by parser
```

### Where Logic Lives

| Concern | Location | Why |
|---------|----------|-----|
| Step ordering | `computeDerivedFields()` in clueParser.ts | Testable, single source of truth |
| Step explanations | `generateStepExplanation()` in clueParser.ts | Consistent templates |
| Definition explanation | `computeDerivedFields()` in clueParser.ts | Pre-computed for UI |
| isComplete check | `computeDerivedFields()` in clueParser.ts | Same logic for all consumers |
| Parsing summary | `computeDerivedFields()` in clueParser.ts | Structural order with full chains |
| Definition matching | `findBestDefinitionMatch()` in clueParser.ts | Complex heuristics |
| Complexity rating | Assigned during pattern detection | Part of parsing |
| Rendering steps | ManualEntryMode.tsx | Just `.map()` over `wordplaySteps` |
| Show/hide conditions | ManualEntryMode.tsx | UI-only, uses `isComplete` flag |

---

## PatternInstance Computed Fields

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
    wordplaySteps?: WordplayStep[];       // Sorted: easy first, Assembly last
    isComplete?: boolean;                  // True if definition + all wordplay resolved
    parsingSummary?: string;               // Structural order with full chains
    definitionText?: string;               // "union"
    definitionMatchType?: 'direct' | 'synonym' | 'cryptic' | 'none';
    definitionExplanation?: string;        // Pre-computed plain English explanation
    definitionPosition?: 'start' | 'end' | 'entire';
    definitionHint?: string;               // For cryptic definitions
}

interface WordplayStep {
    indicator: string;
    fodder: string;
    result: string;
    synonym: string;
    hint: string;
    complexity: number;              // 1=easy, 2=medium, 3=hard
    isAssembly: boolean;             // True for Assembly steps
    stepType: StepType;              // Type of wordplay operation
    explanation: string;             // Pre-computed plain English explanation
}

type StepType =
    | 'abbreviation'      // Direct lookup (hospital department → ENT)
    | 'letter_movement'   // Move a letter within/between words
    | 'assembly'          // Combine parts into final answer
    | 'synonym'           // Simple synonym lookup
    | 'anagram'           // Rearrange letters
    | 'hidden'            // Answer hidden in clue text
    | 'reversal'          // Reverse letters
    | 'deletion'          // Remove letters
    | 'homophone'         // Sounds like (lodge → STOW → STOWE)
    | 'unknown';          // Fallback
```

### UI Code Pattern

The UI should NEVER compute derived values. It reads and renders:

```typescript
// CORRECT - UI reads pre-computed values
const renderBattlecardReview = () => {
    const wordplaySteps = activePatternData.wordplaySteps || [];
    const hasMissingInfo = !activePatternData.isComplete;
    const parsingSummary = activePatternData.parsingSummary || '';

    return (
        <ul>
            <li>{activePatternData.definitionExplanation}</li>
            {wordplaySteps.map(step => <li>{step.explanation}</li>)}
        </ul>
    );
};
```

---

## Cold Parsing Algorithm (No Answer)

When parsing without a known answer, the parser uses a structured elimination approach:

### Algorithm

1. **Eliminate wordplay words first**
   - Find abbreviation fodder (e.g., "hospital department" → ENT) and mark as consumed
   - Find indicator phrases (multi-word first, e.g., "following delay of", then single words)
   - Find fodder adjacent to each indicator and mark as consumed

2. **Remaining words = definition candidates**
   - Only unconsumed words can be the definition
   - Build multi-word hypotheses expanding from start/end:
     - At START: try "1st word", "1st + 2nd", "1st + 2nd + 3rd"
     - At END: try "last word", "last + 2nd-last", etc.

3. **Derive answer without AI**
   - For each definition candidate, lookup synonyms in dictionary
   - Filter by target length
   - Try parsing with each candidate as answer
   - If successful → derived answer found

### Example: "Public school lodge reported (5)"

```
Step 1: Eliminate wordplay
  - "reported" = homophone indicator (consumed)
  - "lodge" = fodder adjacent to indicator (consumed)

Step 2: Remaining words
  - "Public", "school" at START

Step 3: Build definition hypotheses
  - "Public" (1 word)
  - "Public school" (2 words) ✓ → STOWE in dictionary

Result: Definition = "Public school", Answer = STOWE
```

### Example: "Following delay of months, slander hospital department's union (9)"

```
Step 1: Eliminate wordplay
  - "following delay of" = letter_movement indicator (consumed)
  - "months" = abbreviation fodder → M (consumed)
  - "slander" = fodder for letter_movement (consumed)
  - "hospital department" = abbreviation fodder → ENT (consumed)

Step 2: Remaining words
  - "union" at END (single word, no ambiguity)

Step 3: Build definition hypotheses
  - "union" ✓ → ALIGNMENT in dictionary

Result: Definition = "union", Answer = ALIGNMENT
```

---

## Explanation Template System

### The Cold View Principle

**Explanations must guide discovery, not reveal the answer.**

The student doesn't know the answer. Each explanation step must:
1. Show what the clue signals
2. Explain what operation is needed
3. Guide the student through the reasoning
4. Only reveal the result at the end of the chain

### Template Architecture

Explanations are generated by `generateStepExplanation()` in clueParser.ts:

```typescript
function generateStepExplanation(
    stepType: WordplayStep['stepType'],
    fodder: string,
    result: string,
    indicator: string,
    letterMovementVars?: LetterMovementVars,
    definitionText?: string  // For assembly steps
): string
```

### Step Type Templates

#### 1. Definition
Generated in `computeDerivedFields()` based on match type and position.

```
The definition is "union" — found at the end. This maps to ALIGNMENT.
```

For cryptic definitions, includes the hint explaining the cryptic twist.

#### 2. Abbreviation (complexity: 1)
Uses `ABBREVIATION_EXPLANATIONS` dictionary for teaching content.

```
"hospital department's" is a standard cryptic abbreviation. In Times-style
clueing, "hospital department" very often gives ENT, because ENT is the
standard abbreviation for the Ear, Nose and Throat department (you'll see
it on hospital signage, referrals, etc.).
```

#### 3. Letter Movement (complexity: 3)
Guides from indicator through reasoning to solution.

```
"following delay of" signals letter movement — a letter needs to move
position. "months" = M (standard abbreviation). The M must be inside a
word. But "slander" doesn't contain M! So we need a synonym for "slander"
that contains M. slander → MALIGN → ALIGNM
```

Key elements:
- Identify the indicator signal
- Identify the letter source (abbreviation)
- Note the constraint (letter must be in a word)
- Show the problem (fodder doesn't contain the letter)
- Explain the solution (need a synonym)
- Show the chain: fodder → synonym → result

#### 4. Homophone (complexity: 2)
Guides through sound-alike reasoning.

```
"reported" signals a homophone — we need a word that sounds like something.
"lodge" → STOW (synonym). STOW sounds like STOWE.
```

Key elements:
- Identify the indicator signal ("reported", "we hear", "sounds like")
- Find synonym of fodder
- Show that synonym sounds like the answer

#### 5. Assembly (complexity: 0)
Combines parts and links to definition.

```
Combine the parts: ALIGNM + ENT = ALIGNMENT = union
```

### Adding New Templates

When adding a new step type:

1. Add the type to `StepType` in types.ts
2. Add a case in `generateStepExplanation()` switch statement
3. If the template needs extra variables, create an interface and pass it
4. Follow the cold view principle — guide discovery, don't reveal

---

## Parsing Summary Format

The `parsingSummary` field shows the structural derivation in answer order:

```
slander → MALIGN → Move M → ALIGNM + hospital department's → ENT = ALIGNMENT
```

Format rules:
- **Structural order**: Parts appear in the order they combine to form the answer
- **Full chains for complex operations**: Letter movement shows `fodder → synonym → Move X → result`
- **Simple chains for lookups**: `fodder → result`
- **Final equation**: `= ANSWER`

Generated in `computeDerivedFields()` using the `structure` variable for ordering.

---

## Teaching Content Dictionaries

### ABBREVIATION_EXPLANATIONS

Located in `synonymDictionary.ts`. Every abbreviation lookup should teach why.

```typescript
export const ABBREVIATION_EXPLANATIONS: Record<string, {
    result: string;
    explanation: string
}> = {
    'hospital department': {
        result: 'ENT',
        explanation: 'In Times-style clueing, "hospital department" very often
            gives ENT, because ENT is the standard abbreviation for the Ear,
            Nose and Throat department.'
    },
    'months': {
        result: 'M',
        explanation: 'M is the standard abbreviation for months (as seen in
            "3M" = 3 months on contracts, medical notes, etc.)'
    },
};
```

### CRYPTIC_MEANINGS

For cryptic definitions where words have non-obvious meanings.

```typescript
export const CRYPTIC_MEANINGS: Record<string, string> = {
    'do': 'hairstyle (as in "hairdo")',
    'flower': 'river (something that flows)',
};
```

---

## Wordplay Ordering (Pedagogical)

**Process wordplay components by complexity, simplest first.**

This teaches students to:
1. **Find easy wins first** - Build confidence with quick lookups
2. **Use results to constrain harder parts** - "I need 6 more letters"
3. **Tackle complex operations with context** - Letter movement is easier when you know the target

| Complexity | Examples | Teaching Value |
|------------|----------|----------------|
| 1 (Easy)   | Abbreviation lookup, single synonym | Quick win, builds confidence |
| 2 (Medium) | Deletion, reversal, hidden word | Standard cryptic technique |
| 3 (Hard)   | Letter movement, substitution | Advanced - attempt last |

Sorting happens in `computeDerivedFields()` — never in the UI.

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
- `solveClue(clue)` - Never ask AI to solve the full clue
- Open-ended parsing - Never ask AI to identify indicators/fodder
- Definition identification - Always use heuristics (start/end position)

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

## Solved Cases (Reference)

### Case 1: TONSURE (Acrostic + Charade)
**Solved**: 2026-01-02

Clue: "Principles of theology ordinands now definitely do in monastery (7)"

Pattern: ACROSTIC_CHARADE
- "Principles of" triggers acrostic on "theology ordinands now" → TON
- "definitely" is standalone synonym → SURE
- Definition: "do in monastery" (cryptic: "do" = hairstyle)

### Case 2: ALIGNMENT (Letter Movement + Charade)
**Solved**: 2026-01-04

Clue: "Following delay of months, slander hospital department's union (9)"

Pattern: Charade with Letter Movement
- Definition: "union" → ALIGNMENT (synonym match, at end)
- Step 1 (easy): "hospital department's" → ENT (abbreviation)
- Step 2 (hard): "following delay of months, slander" → ALIGNM (letter movement)
  - "delay of" signals movement, "months" = M
  - Need synonym for "slander" containing M → MALIGN
  - Move M to end → ALIGNM
- Assembly: ALIGNM + ENT = ALIGNMENT = union

Parsing summary: `slander → MALIGN → Move M → ALIGNM + hospital department's → ENT = ALIGNMENT`

### Case 3: STOWE (Homophone)
**Solved**: 2026-01-05

Clue: "Public school lodge reported (5)"

Pattern: Homophone
- Definition: "Public school" → STOWE (synonym match, at start)
- Wordplay: "lodge" + "reported" (homophone indicator)
  - "lodge" → STOW (synonym)
  - "reported" signals homophone
  - STOW sounds like STOWE
- Answer: STOWE

Parsing summary: `lodge → STOW → STOWE = STOWE`

---

## Regression Testing

### Running Tests

```bash
npx tsx test-regression.ts
```

### Test Structure

Each test case in `test-regression.ts` verifies:

**With answer (full parsing):**
- Pattern ID matches expected
- Definition text matches
- Definition position (START/END)
- Step types present (abbreviation, homophone, etc.)
- isComplete is true
- Explanations link to definition

**Cold parsing (no answer):**
- Definition candidates include expected phrases
- Indicators detected correctly
- Answer derived correctly from dictionary

### Adding New Test Cases

```typescript
{
    name: 'STOWE (Homophone)',
    clue: 'Public school lodge reported (5)',
    answer: 'STOWE',
    expectedPattern: 'Homophone',
    expectedDefinition: 'Public school',
    expectedDefinitionPosition: 'START',
    expectedStepTypes: ['homophone'],
    expectedColdDefinitionCandidates: ['Public', 'Public school'],
    expectedColdIndicators: ['reported'],
    expectedColdFodder: ['lodge'],
},
```

### When to Add Tests

Add a regression test when:
1. A new clue type is successfully parsed
2. A bug is fixed (prevent regression)
3. A new pattern is implemented

---

## Template for New Cases

```markdown
## Case N: [ANSWER] ([Clue Type])

**Date**: YYYY-MM-DD

### Input
[Raw clue as pasted]

### What Parser Detected
[Current parser output]

### What It Should Detect
[Correct parsing with explanations]

### Missing Templates/Patterns
[What's needed]

### Action Items
- [ ] Task 1
- [ ] Task 2
```
