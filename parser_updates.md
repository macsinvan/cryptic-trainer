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

    // DATA-DRIVEN UI: Parser returns ordered blocks, UI just renders them
    solveExplanation?: DisplayBlock[];  // Ordered list of display blocks for UI

    // PRE-COMPUTED FIELDS (UI-ready)
    wordplaySteps?: WordplayStep[];       // Sorted: easy first, Assembly last
    isComplete?: boolean;                  // True if definition + all wordplay resolved
    parsingSummary?: string;               // Structural order with full chains
    definitionText?: string;               // "union"
    definitionMatchType?: 'direct' | 'synonym' | 'cryptic' | 'none';
    definitionExplanation?: string;        // Pre-computed plain English explanation
    definitionPosition?: 'start' | 'end' | 'entire';
    definitionHint?: string;               // For cryptic definitions

    // Teaching fields
    techniquesUsed?: string[];       // e.g., ['abbreviation', 'container']
    setterHint?: string;             // e.g., "The setter has used **abbreviation**..."
}

interface DisplayBlock {
    type: 'setter-hint' | 'clue-type' | 'parsing' | 'explanation';
    content: string;
    label?: string;           // Optional label (e.g., "Parsing", "Clue Type")
    techniques?: string[];    // For setter-hint: list of techniques for tooltip
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
// CORRECT - Data-driven UI just iterates over solveExplanation
const renderBattlecardReview = () => {
    return (
        <div>
            {(activePatternData.solveExplanation || []).map((block, i) => {
                switch (block.type) {
                    case 'clue-type':
                        return <div key={i}><strong>{block.label}:</strong> {block.content}</div>;
                    case 'setter-hint':
                        return <div key={i} className="hint">{block.content}</div>;
                    case 'parsing':
                        return <div key={i} className="mono">{block.content}</div>;
                    case 'explanation':
                        return <div key={i}>{block.label && <small>{block.label}</small>}{block.content}</div>;
                }
            })}
        </div>
    );
};
```

### solveExplanation Block Order

The parser generates blocks in this order:

1. **clue-type** - Pattern name (e.g., "Homophone", "Container")
2. **setter-hint** - Teaching hint with technique vocabulary
3. **explanation (Definition)** - Definition explanation
4. **explanation (Step N)** - Wordplay step explanations (sorted by complexity)
5. **explanation (Assembly)** - Assembly step if present
6. **parsing** - Final equation summary

Example output for STOWE:
```
[1] CLUE-TYPE (Clue Type)
    Homophone

[2] SETTER-HINT
    The setter has used **homophone** here. Look for the auditory indicator.

[3] EXPLANATION (Definition)
    The definition is "Public school" — found at the start. This maps to STOWE.

[4] EXPLANATION (Step 1)
    "reported" signals a homophone — we need a word that sounds like something...

[5] PARSING (Parsing)
    lodge → STOW → STOWE = STOWE
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

### Case 4: SODOM (Container)
**Solved**: 2026-01-05

Clue: "Depraved scene from 'love party' embodied by aggressive-submissive proclivity (5)"

Pattern: Container
- Definition: "Depraved scene" → SODOM (synonym match, at start)
- Wordplay:
  - Inner content: "love party" = O (love) + DO (party) = ODO
  - Outer container: "aggressive-submissive proclivity" = SM
  - Container indicator: "embodied by"
  - Container operation: S + ODO + M = SODOM (inner goes inside outer)
- Answer: SODOM

Parsing summary: `love party → ODO + aggressive-submissive proclivity → SM = SODOM`

### Case 5: ARTEL (Hidden Word)
**Solved**: 2026-01-06

Clue: "Russian co-op using some cellular telephones (5)"

Pattern: Hidden Word
- Definition: "Russian co-op" → ARTEL (synonym match, at start)
- Wordplay:
  - Hidden indicator: "using some"
  - Fodder: "cellular telephones"
  - Hidden word: cellul**AR TEL**ephones = ARTEL
- Answer: ARTEL

Parsing summary: `hidden in "cellular telephones" = ARTEL`

### Case 6: TELEPROMPTER (Container with French Articles)
**Solved**: 2026-01-06

Clue: "What newsreaders read in French, the expert seducer conceals (12)"

Pattern: Container
- Definition: "What newsreaders read" → TELEPROMPTER (synonym match, at start)
- Wordplay:
  - Inner: "in French, the" = LE + "expert" = PRO → LE PRO
  - Outer: "seducer" → TEMPTER (synonym)
  - Container indicator: "conceals"
  - Container operation: TEMP + LE PRO + TER = TELEPROMPTER
- Answer: TELEPROMPTER

Parsing summary: `seducer → TEMPTER + in French the expert → LE PRO inside = TELEPROMPTER`

### Case 7: ASSES (Deletion)
**Solved**: 2026-01-06

Clue: "Fools judge? Not quite (5)"

Pattern: Deletion
- Definition: "Fools" → ASSES (synonym match, at start)
- Wordplay:
  - Deletion indicator: "Not quite" (deletion_last)
  - Fodder: "judge" → ASSESS (synonym)
  - Operation: ASSESS - S = ASSES
- Answer: ASSES

Parsing summary: `judge → ASSESS → not quite → ASSES`

### Case 8: TOOLS (Reversal + Last Letter)
**Solved**: 2026-01-06

Clue: "Flipping lucre and ultimately godless vices? (5)"

Pattern: Reversal + Last Letter
- Definition: "vices?" → TOOLS (cryptic: vice = clamping tool)
- Wordplay:
  - Reversal indicator: "Flipping"
  - Fodder: "lucre" → LOOT (synonym) reversed → TOOL
  - Last letter indicator: "ultimately"
  - Fodder: "godless" → S (last letter)
  - Assembly: TOOL + S = TOOLS
- Answer: TOOLS

Parsing summary: `lucre → LOOT → flipping → TOOL + ultimately godless → S = TOOLS`

### Case 9: ADHERE (Abbreviation Charade)
**Solved**: 2026-01-06

Clue: "Stick notice in The Times? (6)"

Pattern: Abbreviation Charade
- Definition: "Stick" → ADHERE (synonym match, at start)
- Wordplay:
  - "notice" → AD (abbreviation)
  - "in The Times?" → HERE (self-referential: "here" = in this newspaper)
  - Assembly: AD + HERE = ADHERE
- Answer: ADHERE

Parsing summary: `notice → AD + in The Times → HERE = ADHERE`

### Case 10: SUPERHERO (Anagram + Reversal)
**Solved**: 2026-01-06

Clue: "Comic character from Peru: he's funny or contrary (9)"

Pattern: Anagram + Reversal
- Definition: "Comic character" → SUPERHERO (synonym match, at start)
- Wordplay:
  - Anagram indicator: "funny"
  - Anagram fodder: "Peru: he's" = PERUHES (7 letters)
  - Reversal indicator: "contrary"
  - Reversal fodder: "or" → RO (2 letters)
  - Assembly: anagram(PERUHES) + RO = SUPERHE + RO = SUPERHERO
- Answer: SUPERHERO

Parsing summary: `Peru he's (anagram) → SUPERHE + or (contrary) → RO = SUPERHERO`

### Case 11: BUILD IN (Homophone + Charade)
**Solved**: 2026-01-06

Clue: "Incorporate legal draft delivered prior to crash (5,2)"

Pattern: Homophone + Charade
- Definition: "Incorporate" → BUILD IN (synonym match, at start)
- Wordplay:
  - Homophone indicator: "delivered"
  - Homophone fodder: "draft" → BILL (synonym) sounds like BUILD
  - Charade part: "crash" → IN (synonym)
  - Assembly: BUILD + IN = BUILD IN
- Answer: BUILD IN

Parsing summary: `draft → BILL → delivered → BUILD + crash → IN = BUILD IN`

---

## Cold Parsing Derivation Types

The `analyzeClueWithoutAnswer()` function attempts to derive the answer using these strategies (in order):

### 1. Simple Charade Assembly
Concatenate known abbreviations and synonyms of fodder words.

**Example**: FORAY = FOR (spanning) + A + Y (year)

### 2. Pure Abbreviation Charade
Select non-overlapping abbreviations from clue, prefer longer matches, concatenate in position order.

**Example**: ADHERE = AD (notice) + HERE (in The Times)

### 3. Container Assembly
Insert inner content inside outer container at each position, verify against definition synonyms.

**Example**: CANOE = CAN + O inside E → C(O)ANE? No, try CA(O)NE... CANOE ✓

### 4. Reversal + Container
Reverse a synonym, then insert another component inside it.

**Example**: SAMBA = AS (while) reversed → SA, gripping A + MB = S(AMB)A

### 5. Hidden Word
Slide window of target length through fodder text, verify against definition.

**Example**: ARTEL = hidden in "cellul**AR TEL**ephones"

### 6. Deletion
Get synonyms for fodder, apply deletion (first/last letter), verify against definition.

**Example**: ASSES = ASSESS (judge) - S (not quite)

### 7. Homophone
Get synonyms for fodder, lookup in homophone pairs, verify against definition.

**Example**: STOWE = STOW (lodge) sounds like STOWE

### 8. Homophone + Charade
Find homophone, then combine with other word synonyms to reach target length.

**Example**: BUILD IN = BUILD (sounds like BILL from draft) + IN (crash)

### 9. Anagram + Reversal
When both indicators present, try anagram of one fodder + reversal of another.

**Example**: SUPERHERO = anagram(PERUHES) + reverse(OR) = SUPERHE + RO

### 10. Indicator-as-Fodder Fallback
When standard charade fails, try indicator words themselves as fodder for synonym lookup.

**Example**: STOCKS = S (Small) + TOCKS (sounds as noun, not as indicator)

---

## Cold Parsing Test Results (2026-01-06)

**Final Score: 12/16 (75%)**

### Passing Cold Parses (12)
| Clue | Pattern | Key Technique |
|------|---------|---------------|
| CANOE | Container | Staff→CANE + O inside |
| SAMBA | Reversal+Container | While→AS reversed + AMB inside |
| SODOM | Container | ODO inside SM |
| ARTEL | Hidden Word | In "cellular telephones" |
| TELEPROMPTER | Container | LE PRO inside TEMPTER |
| ASSES | Deletion | ASSESS - last letter |
| TOOLS | Reversal+Last Letter | LOOT reversed + S |
| ADHERE | Abbreviation Charade | AD + HERE |
| STOWE | Homophone | STOW sounds like |
| STOCKS | Indicator-as-Fodder | S + TOCKS |
| SUPERHERO | Anagram+Reversal | PERUHES anagram + OR reversed |
| BUILD IN | Homophone+Charade | BILL→BUILD + IN |

### Failing Cold Parses (4)
| Clue | Pattern | Reason |
|------|---------|--------|
| ALIGNMENT | Letter Movement+Charade | Requires moving M within synonym |
| HEADER | Container+Outer Letters | Missing catch→HEAD synonym |
| THE KING AND I | Synonym+Truncation+Anagram | Complex 3-way combination |
| DEHYDRATE | Alternate Letters+Cross-Ref | References another clue |

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
