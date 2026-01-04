# Cryptic Trainer — Master Application Specification

## 1. Core Philosophy

The Cryptic Trainer is a state-machine-driven application that breaks down cryptic crosswords into strict, bite-sized instructional steps.

**The Golden Rule:** All processing happens at import time. The solve session never calls AI.

---

## 2. Technology Stack

### Build System
- **Vite** - Fast build tool and dev server
- **TypeScript** - Type-safe JavaScript (~5.8.2)
- **React 19** - UI framework

### Styling
- **Tailwind CSS 3.4** - Utility-first CSS
- **PostCSS** - CSS processing
- **Autoprefixer** - Browser compatibility

### Dependencies
```json
{
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "lucide-react": "^0.555.0",  // Icon library
  "@google/genai": "^1.30.0"    // Google Gemini AI (import-time only)
}
```

### Build Commands
```bash
npm run dev      # Start dev server (http://localhost:5173)
npm run build    # Production build to /dist
npm run preview  # Preview production build
npx tsc --noEmit # Type check without emitting
```

---

## 3. Project Structure

```
cryptic-trainer/
├── App.tsx                    # Main app component, routing, views
├── index.tsx                  # React entry point
├── index.css                  # Global styles + Tailwind directives
├── types.ts                   # All TypeScript interfaces
├── data.ts                    # Publications, setters, clue types
├── vite.config.ts             # Vite configuration
├── tsconfig.json              # TypeScript configuration
├── package.json               # Dependencies and scripts
│
├── components/
│   ├── ClueCard.tsx           # Display card for clue evaluation
│   ├── ClueSolver.tsx         # State machine solver engine
│   ├── DataManager.tsx        # Database admin UI (owner area)
│   ├── GeminiTutor.tsx        # AI coaching interface
│   ├── ManualEntryMode.tsx    # Clue import/entry UI
│   ├── SolverMode.tsx         # AI solver for puzzles
│   └── TrainingMode.tsx       # Practice mode UI
│
├── services/
│   ├── clueParser.ts          # Deterministic clue parser (1900+ lines)
│   ├── clueManager.ts         # IndexedDB persistence layer
│   ├── freeformParser.ts      # Natural language coaching parser
│   ├── geminiService.ts       # Google Gemini API wrapper
│   └── supabaseClient.ts      # Cloud sync (optional)
│
├── data/
│   ├── synonymDictionary.ts   # 350+ synonym mappings
│   ├── seedClues.ts           # Pre-loaded training clues
│   ├── patterns.ts            # Step templates and patterns
│   ├── puzzlePacks.ts         # Bundled puzzle data
│   └── designTemplates.ts     # Locked coaching hints
│
├── tests/
│   ├── tc-import-solve.ts     # Main test case (27 tests)
│   └── test-qc3189.ts         # Quick Cryptic puzzle test
│
├── prompts/
│   └── analyze_failed_import.md  # AI analysis protocol
│
├── .claude/
│   ├── settings.json          # Claude Code settings
│   ├── settings.local.json    # Local overrides
│   └── hooks/                 # Hook scripts
│
├── MASTER_APP_SPECIFICATION.md      # This document
├── CLAUDE_RULES.md                  # AI assistant rules
├── INTERACTIVE_SOLVE_FLOW.md        # Solver UX documentation
├── EXPRESS_SETTER_COACHING_METHODOLOGY.md  # Coaching approach
├── parser_updates.md                # Parser change log
└── README.md                        # Project readme
```

---

## 4. Core Components

### App.tsx (Main Application)
- **View State Machine**: HOME → PUBLICATION → TRAINING/SOLVER/MANUAL_ENTRY
- **Admin Access**: Password-protected owner area (password: `dojoMaster`)
- **External Links**: Links to Big Dave, FifteenSquared, Times for the Times
- **Cloud Status**: Shows Supabase connection state

### ClueSolver.tsx (Solve Engine)
- **State Machine**: DEFINITION → WP_INDICATOR → WP_FODDER → WP_DECODE → FINAL_SOLVE → COMPLETED
- **Word Selection**: Click-to-select words from clue text
- **Validation**: Matches selection against pattern variables
- **Visual Feedback**: Color-coded word highlighting

### ManualEntryMode.tsx (Import UI)
- **Input**: Paste clue + answer + coaching notes
- **Live Preview**: Shows parsed battlecard as you type
- **Validation**: Blocks save if parsing incomplete
- **Special Cases**: Detects and warns about edge cases

### TrainingMode.tsx (Practice)
- **Queue**: Draws from publication's clue library
- **Progress**: Tracks attempts, successes, hints used
- **Navigation**: Previous/next clue, shuffle

### DataManager.tsx (Admin)
- **View All Clues**: Browse saved training items
- **Export/Import**: JSON data management
- **Failed Imports**: Review parser issues
- **Cloud Sync**: Supabase connection status

---

## 5. Service Layer

### clueParser.ts (Core Parser)
**Purpose**: Deterministic parsing of cryptic clues without AI

**Key Functions**:
```typescript
parseClue(clue: string, answer?: string, coaching?: string[]): ParseResult
batchParse(clues: {clue: string, answer: string}[]): BatchResult
completePattern(partial: PatternInstance, synonyms, results): PatternInstance
verifyDefinitionWithAI(defText: string, answer: string): Promise<{isValid, source}>
```

**ParseResult** includes:
- `success: boolean` - Whether parsing succeeded
- `confidence: number` - 0-100 confidence score
- `difficulty: 'Easy' | 'Medium' | 'Hard' | 'Very Hard'` - Auto-graded difficulty
- `patternData: PatternInstance` - Full breakdown with variables
- `needsAI: boolean` - True if fallback AI needed

**Indicator Dictionary** (~150 patterns):
- Deletion (first/last/half)
- Letter extraction (first, last, ends)
- Anagram indicators
- Reversal indicators
- Hidden word indicators
- Container indicators
- Homophone indicators
- Substitution indicators

**Pattern Types**:
- `HIDDEN`, `HIDDEN_REVERSAL`
- `ANAGRAM`, `REVERSAL`
- `CONTAINER`, `DELETION`
- `CHARADE`, `COMPOSITE_CHARADE`
- `DOUBLE_DEFINITION`
- `SUBSTITUTION`
- `ACROSTIC_CHARADE`
- `LETTER_MOVEMENT` (letter moves position within word, e.g., "delay of M" = M moves to end)

**Difficulty Grading**:
Clues are automatically graded based on complexity:
- `Easy` - Simple patterns (double definition, basic charade)
- `Medium` - Standard patterns (anagram, reversal, deletion)
- `Hard` - Complex patterns (container, composite charade, multiple abbreviations)
- `Very Hard` - Advanced patterns (letter movement, substitution, cryptic definitions)

### clueManager.ts (Persistence)
**Purpose**: IndexedDB storage for training items

**Storage**:
- Database: `CrypticTrainerDB_V2`
- Stores: `training_items`, `parser_issues`

**Key Functions**:
```typescript
initializeClues(): Promise<void>
saveClue(item: TrainingItem): Promise<void>
getClueCount(publicationId: string): number
saveParserIssue(issue: ParserIssue): Promise<void>
getAllParserIssues(): Promise<ParserIssue[]>
```

### synonymDictionary.ts (Synonym Data)
**Purpose**: Maps words to cryptic crossword synonyms

**Exports**:
```typescript
STANDALONE_SYNONYMS: Record<string, string>     // Single-letter mappings
CRYPTIC_MEANINGS: Record<string, {...}>         // Special cryptic meanings
SYNONYM_DICTIONARY: Record<string, string[]>    // Full synonym lists
lookupSynonyms(word: string): string[]
findSynonymForOperation(fodder, operation, targetLen): Match
extractLetter(text, position): string
```

**Coverage**: 350+ synonym mappings including:
- Actions: hit→BLOW, leave→DESERT, bear→STAND
- Qualities: disgusting→RANK, inferior→LESS, fit→RIGHT
- Abbreviations: daughter→D, credit→CR, following→F
- Animals: dog→LAB/CUR, like→AS
- Materials: wood→BALSA/OAK, novel→BOOK
- Geography: antarctica→DESERT
- Heraldry: vert→GREEN, green→VERT
- Cryptic: flower→RIVER, setter→I
- Expressions: walk in the park→PICNIC, for instance→EXAMPLE

---

## 6. Data Architecture

### The Evaluation Object (`ClueEvaluation`)

Every clue MUST be converted into this structure before the Solver component mounts.

```typescript
interface ClueEvaluation {
  id: string;
  clue: string;
  answer: string;
  definition: {
    text: string;      // The substring acting as definition
    position: string;  // 'START' | 'END'
  };
  wordplay: WordplayModule[];
  structure: string;   // e.g. "NEAR + T = NEAT"
}

interface WordplayModule {
  type: string;        // e.g. "Deletion", "Anagram"
  indicator: { text: string; description: string; };
  fodder: { text: string; description: string; };
  thinkingHint: string[];
}
```

### Pattern Variables Convention

For the pattern engine, variables follow this naming:

```
def_text              - The definition text
definition_match_type - How definition maps to answer: 'direct' | 'synonym' | 'cryptic' | 'none'
definition_type       - 'cryptic' if definition has hidden meaning (legacy, use match_type)
definition_hint       - Explanation of cryptic definition (e.g., '"do" = hairstyle')
indicator_1_text      - First indicator word(s)
fodder_1_text         - First fodder word(s)
synonym_1             - (Optional) Synonym used before operation
result_1              - Result of first wordplay step
indicator_2_text      - Second indicator (if composite)
fodder_2_text         - Second fodder
result_2              - Result of second step
```

---

## 7. The State Machine

The `ClueSolver` component operates on a strict linear flow.

### States
1. **DEFINITION** → 2. **WP_INDICATOR** → 3. **WP_FODDER** → 4. **WP_DECODE** → 5. **FINAL_SOLVE** → 6. **COMPLETED**

### Transitions

| State | Input | Validation | On Success |
|-------|-------|------------|------------|
| DEFINITION | User selects word(s) | Match `definition.text` | AUTO-ADVANCE to WP_INDICATOR |
| WP_INDICATOR | User selects word(s) | Match `indicator.text` | AUTO-ADVANCE to WP_FODDER |
| WP_FODDER | User selects word(s) | Match `fodder.text` | AUTO-ADVANCE to WP_DECODE |
| WP_DECODE | User clicks Continue | None | Next indicator or FINAL_SOLVE |
| FINAL_SOLVE | User types answer | Auto-check when complete | AUTO-ADVANCE to COMPLETED |

### Implied Wordplay (Meta-Indicators)

When indicator is a meta-indicator like `(synonym)` that doesn't appear in the clue text:

1. **Detection**: Check if `indicator_N_text` starts with `(` or isn't found in clue
2. **Acceptance**: Accept the corresponding fodder word as valid click
3. **Note**: Show "One word remains – the wordplay here is implied (no explicit indicator)."
4. **Advance**: Auto-advance to next step

This handles cases where wordplay is implied (e.g., "definitely" → SURE with no explicit indicator).

### Visual Feedback
- **Definition**: Green
- **Indicator**: Orange
- **Fodder**: Blue
- **Solved**: Slate/Grey

---

## 8. Interaction Rules

### Auto-Advance vs Manual
- **Identification Steps** (Definition, Indicator, Fodder): AUTO-ADVANCE on correct selection
- **Cognitive Steps** (Decode): Require explicit "Continue" button
- **Final Solve**: AUTO-CHECK when grid complete

### Reveal Answer
Button available at any stage to skip to solved view with full explanation.

---

## 9. Coaching Content

### Static Tips (during solve)

**DEFINITION**: "The definition is usually at the start or the end of the clue."

**WP_INDICATOR**: "Read the clue and try to spot the most obvious indicator signal."

**WP_FODDER**: "Decide what word or words the instruction applies to — usually right next to the indicator."

**WP_DECODE**: "Look at the fodder and consider the instruction. You may need to find a synonym first."

**FINAL_SOLVE**: "Use the definition to check that your answer makes sense."

### Dynamic Tips (in learnings after solve)

Definition position tips are generated based on actual position:

| Position | Tip |
|----------|-----|
| START | Found at the start. Always check both ends. |
| END | Found at the end. Always check both ends. |
| ENTIRE | The entire clue is the definition. Exception: no separate wordplay. |
| Other | Exception: Not at usual start or end position. |

If `definition_type = 'cryptic'`:
- Badge: **CRYPTIC** shown next to definition
- Hint: Shows `definition_hint` (e.g., '"do" = hairstyle')
- Learning: "This is a cryptic definition with hidden meaning."

---

## 10. Completed State — "What We Learned"

Shows:
1. **Clue Type** badge (Deletion, Anagram, etc.)
2. **Parsing Summary** equation
3. **Auto-Derived Learnings** from pattern variables

---

## 11. Import Pipeline

### Design Principle

```
┌─────────────────────────────────────────────────────────────┐
│  IMPORT TIME                    │  SOLVE TIME               │
│  (All processing here)          │  (Zero AI calls)          │
├─────────────────────────────────┼───────────────────────────┤
│  • Parse freeform input         │  • Read from IndexedDB    │
│  • Detect indicators            │  • Display UI             │
│  • Extract definition/fodder    │  • Track user progress    │
│  • Resolve synonyms             │  • Show learnings         │
│  • User completes missing info  │                           │
│  • Save on explicit Accept      │                           │
└─────────────────────────────────┴───────────────────────────┘
```

### Input Format Auto-Detection

The freeform parser auto-detects input format by looking for the **letter count suffix** `(N)` which is mandatory. The clue number prefix (e.g., `3D`) is optional.

| Line Format | Interpretation |
|-------------|----------------|
| `Being up somewhat... (5)` | Clue line (detected by letter count suffix) |
| `3D Clue text... (5)` | Clue line with optional number prefix |
| `29351` | Puzzle number only (publication from context) |
| `Times Cryptic 29351` | Full publication + puzzle number |

**Detection Rule:** The first line ending with `(N)` or `(N,N)` is the clue line.

When in a publication's work area (e.g., Times Dojo), the `publicationId` is passed as default, so users can paste minimal input:

```
Being up somewhat scares Ireland following comeback (5)
RISER – reverse (following comeback) hidden (somewhat) scaRES IReland.
```

Or with optional clue number:
```
3D Principles of theology ordinands now definitely do in monastery (7)
Answer: TONSURE – first letters...
```

### AI-Assisted Solving (Import Time Only)

When a clue is pasted without an answer, the user can optionally use AI to solve it:

```typescript
// services/geminiService.ts
interface SolvedClue {
    answer: string;                              // e.g., "TONSURE"
    definition: string;                          // e.g., "do in monastery"
    definitionPosition: 'START' | 'END' | 'ENTIRE';
    parsing: string;                             // e.g., "TON + SURE = TONSURE"
    confidence: 'high' | 'medium' | 'low';
    explanation: string;                         // Full wordplay breakdown
}

solveClue(clue: string): Promise<SolvedClue | null>
```

**UI Flow:**
1. User pastes clue without answer
2. "Solve with AI" button appears in preview panel
3. Click triggers `solveClue()` API call
4. Solution displayed with confidence level (high/medium/low)
5. Answer auto-populated into text field
6. User reviews and proceeds to "Review Battlecard"

**Design Principle:** This AI call happens at **import time**, not solve time. The solved answer is saved to the clue and the solve session remains AI-free.

### Battlecard Builder Flow

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: INPUT & PARSE                                     │
├─────────────────────────────────────────────────────────────┤
│  • Paste coaching notes into textarea                       │
│  • Live preview extracts: publication, clue, answer         │
│  • Publication auto-detected from context if not specified  │
│  • Green = ready, Amber = incomplete                        │
│  • If no answer: "Solve with AI" button available           │
│  • Click "Review Battlecard"                                │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  PHASE 2: REVIEW & COMPLETE                                 │
├─────────────────────────────────────────────────────────────┤
│  • Solved-style battlecard preview                          │
│  • Green dot (●) = field complete                           │
│  • Amber dot (●) = needs user input                         │
│  • Fill in missing: definition, synonym, result             │
│  • Special case warning if pattern doesn't fit              │
│  • Buttons: [Edit] [Accept & Save]                          │
└─────────────────────────────────────────────────────────────┘

### Full Parsing Display (Programmatic)

The battlecard "Full Parsing" section is built programmatically from pattern variables:

```
Definition: "{def_text}" – {definition_hint}     (if cryptic)
Wordplay 1: "{indicator_1_text}" → "{fodder_1_text}" → {result_1}
Wordplay 2: "{indicator_2_text}" → "{fodder_2_text}" → {result_2}
Assembly: {result_1} + {result_2} = {answer}
```

Example output for TONSURE:
```
Definition: "do in monastery" – "do" = hairstyle
Wordplay 1: "principles of" → "theology ordinands now" → TON
Wordplay 2: "(synonym)" → "definitely" → SURE
Assembly: TON + SURE = TONSURE
```

This ensures consistent, maintainable parsing display derived from the actual pattern data.
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  PHASE 3: PERSIST (after Accept)                            │
├─────────────────────────────────────────────────────────────┤
│  • saveClue(pubId, text, evaluation, patternData)           │
│  • Stored in IndexedDB                                      │
│  • Buttons: [Import Another] [Back to Dojo]                 │
└─────────────────────────────────────────────────────────────┘
```

### Special Case Detection

Parser detects when coaching notes signal non-standard patterns:

| Signal Phrase | Type |
|---------------|------|
| "definition has wordplay" | `cryptic_definition` |
| "standard cryptic usage" | `insider_knowledge` |
| "feels weak" / "discomfort" | `insider_knowledge` |
| "unusual structure" | `unusual_structure` |

#### Override Logic

Special case detection is independent of parser success. User can override if parser succeeded:

| Scenario | Warning | User Options |
|----------|---------|--------------|
| Special case + parser FAILED | Red | "Send for Analysis" only (blocked) |
| Special case + parser SUCCEEDED | Amber | "Accept Anyway" OR "Send for Analysis" |
| No special case | None | Normal "Accept & Save" |

**Parser success** = has `result_1` or `result_2` in pattern variables.

When blocked:
- Issue saved to `parser_issues` store in IndexedDB
- Viewable in Data Manager → Failed Imports section

### Parser Updates Workflow

When parsing fails for a new pattern:

1. **Do NOT modify app code**
2. **Append to `parser_updates.md`**:
   - The clue and answer
   - What parser detected vs should detect
   - Missing template/pattern needed
   - Suggested code changes
3. **Action later** in batch

### Clue Parser (`/services/clueParser.ts`)

#### Indicator Dictionary (~150 patterns)

| Type | Examples |
|------|----------|
| Deletion (first) | beheaded, headless, topless, losing head |
| Deletion (last) | nearly, almost, snubbed, curtailed, stunted, docked, clipped, trimmed, short, shortened |
| Deletion (half) | half, half of, halved |
| Letter extraction | end of, start of, finally, initially, opener, leader, primarily |
| Outer letters | extremely, wings of, cases of, borders of |
| Acrostic | principles, first letters, initials, leaders, heads of |
| Anagram | mixed, broken, confused, scrambled, bananas, washed, misguided, desecrated, running, racing, moving |
| Reversal | back, returned, reversed, reflected, mounting, rising, coming up, upend, upended, flipped, inverted |
| Hidden | within, inside, held by, part of, houses, somewhat |
| Container | about, clutching, holding, surrounding, entertains, breaking, introduced to, conveys, to consume |
| Homophone | say, we hear, sounds like, reportedly, recounted, broadcast |
| Substitution | as substitute for, substitute for, replacing, in place of, instead of |

#### Definition-First Parsing (Word Locking)

**Critical Insight:** Definition must be found FIRST, before indicators. Definition words are then "locked" and cannot be detected as indicators.

**Why This Matters:**
- Words like "up", "back", "in" can be both definition words AND indicators
- Example: "Being up" is a definition (= RISER), but "up" alone is a reversal indicator
- Without word locking, "up" gets detected as indicator, breaking the parse

**Parsing Flow:**
```
1. FIND DEFINITION FIRST
   - Check 1-4 word phrases at START against synonym dictionary
   - Check 1-4 word phrases at END against synonym dictionary
   - Take LONGEST phrase that matches answer via synonym/direct
   - Record locked word indices (e.g., [0, 1] for "Being up")

2. FIND INDICATORS (excluding locked words)
   - Search for indicator patterns in clue
   - Skip any match that falls within locked word indices
   - This ensures "up" is NOT detected when it's part of "Being up"

3. EXTRACT FODDER from remaining words
   - Words between definition and indicators
   - Process left-to-right, each word used only once

4. RESOLVE RESULTS using operation logic
```

**Example: "Being up somewhat scares Ireland following comeback (5)" → RISER**
```
Step 1: "Being up" matches RISER via synonym → lock indices [0, 1]
Step 2: Find indicators (skip indices 0,1):
        - "somewhat" (hidden) ✓
        - "following comeback" (reversal) ✓
        - "up" SKIPPED (locked)
Step 3: Fodder = "scares Ireland"
Step 4: Hidden+Reversal → find "RESIR" in fodder → reverse → RISER
```

#### Fallback Definition Detection

If definition-first matching fails (no synonym match found), fall back to heuristics:

1. Check if first indicator has `definitionAtEnd` flag
2. Find indicator positions in clue
3. Apply heuristics:
   - If indicator at START with `definitionAtEnd` → definition at END
   - If nothing after last indicator → definition at START
   - Limit to ~3-4 words

#### Cryptic Definition Detection

After extracting definition, check if it can be reconciled with the answer:

**Step 1: Check CRYPTIC_MEANINGS dictionary**
1. For each word in definition, look up in `CRYPTIC_MEANINGS`
2. If found, check if answer matches any of the cryptic synonyms
3. If match → automatically generate hint from dictionary

**Step 2: Check standard synonym dictionary**
1. Look up each definition word in `SYNONYM_DICTIONARY`
2. Check if any synonym matches the answer

**Step 3: Flag if no match found**
- Set `definition_type = 'cryptic'`
- If hint from Step 1: use dictionary meaning
- Else extract from coaching notes (look for "X = Y" patterns)
- Fallback: `definition_hint = 'Definition may have a cryptic twist'`

Example: "do in monastery" for TONSURE
- "do" found in `CRYPTIC_MEANINGS` with meaning "hairstyle"
- TONSURE in synonyms list for "do"
- Auto-generated hint: `"do" = hairstyle`

#### Definition Match Type

The parser validates whether the definition maps to the answer and returns a `definition_match_type`:

| Match Type | Meaning | UI Display |
|------------|---------|------------|
| `direct` | Definition word IS the answer | Green styling, "Valid match" |
| `synonym` | Definition word has answer as synonym | Green styling, "Valid match" |
| `cryptic` | Definition uses cryptic meaning (e.g., "flower" = river) | Amber styling, "Cryptic twist" |
| `none` | No recognized mapping found | Default styling, needs review |

**Algorithm:**
```
1. Try progressively longer phrases (1-4 words) from START or END
2. For each phrase length:
   a. Check direct match (phrase = answer)
   b. Check synonym dictionary (phrase → synonyms → answer)
   c. Check CRYPTIC_MEANINGS dictionary
3. If no match at guessed position, try opposite position
4. First match wins (prefers direct/synonym over cryptic)
```

**UI Rules:**
- Green check + "(maps to ANSWER)" for `direct` or `synonym`
- Amber "Cryptic Twist" box for `cryptic` (with explanation)
- No special styling for `none` — definition may need user review

This ensures users don't see warnings on valid definitions (e.g., "Being up" → RISER shows green, not amber).

#### Acrostic + Charade Detection

For acrostic indicators, check if fodder contains a standalone synonym:

1. Detect standalone synonym words (definitely→SURE, nothing→NIL, etc.)
2. Split fodder at standalone synonym
3. Create two wordplay components:
   - Component 1: Acrostic (first letters of words before synonym)
   - Component 2: Synonym lookup
4. Pattern ID: `ACROSTIC_CHARADE`

#### Composite Charade (Synonym + Deletion)

Handles clues where synonym lookup and deletion operations combine:

**Example: "Semiaquatic animal in pond – half in, half out (5)" → HIPPO**
```
Definition: "Semiaquatic animal" (START)
Wordplay:
  - "in" → HIP (synonym: "in" = fashionable = HIP)
  - "pond" + "half" → PO (deletion: first half of POND)
  - HIP + PO = HIPPO
```

**Algorithm (`tryCompositeCharade`):**
1. Find deletion indicators in wordplay (half, stunted, etc.)
2. Build candidate parts from:
   - Synonym lookups for each word/phrase
   - Deletion operations applied to nearby words
3. Use combination search to find parts that sum to answer
4. Return first valid combination

#### Backtracking Charade Search

For pure charades (no indicators), uses backtracking to try all synonym combinations:

**Example: "What may control shock of drink and huge rent (9)" → KIRBIGRIP**
```
Definition: "What may control shock" (START)
Wordplay:
  - "drink" → KIR (French cocktail)
  - "huge" → BIG
  - "rent" → RIP (tear)
  - KIR + BIG + RIP = KIRBIGRIP
```

**Algorithm (`tryCharadeSplit`):**
1. Build all synonym candidates for each word position
2. Backtracking search: try each candidate, recurse
3. Skip connector words ("and", "of", "with")
4. Return first combination matching answer length and letters

#### Definition by Elimination

When synonym-based definition detection fails, infer definition from successful charade:

1. No synonym match for definition → definition unknown
2. Try charade on various definition lengths (1-5 words)
3. If charade succeeds, the remaining words are the definition
4. Set `definition_match_type: 'cryptic'` (unverified)

This allows parsing clues where the definition is cryptic but the wordplay is recognizable.

#### Substitution Pattern

Handles clues where letters are replaced within a base word:

**Example: "Pawn telly, primarily as substitute for money-grubber's credit (6)" → STOOGE**
```
Definition: "Pawn" (START) → STOOGE
Wordplay:
  - Base word: "money-grubber's" → SCROOGE
  - Remove: "credit" → CR
  - Insert: "telly, primarily" → T (first letter)
  - SCROOGE - CR + T = STOOGE
```

**Algorithm (`trySubstitution`):**
1. Require substitution indicator ("as substitute for", "replacing", "in place of")
2. Build candidates for base word, removed letters, inserted letters
3. For each base word (synonym with len >= answer-2):
   - Try removing each short synonym (len <= 3)
   - Try inserting each first-letter or single-letter synonym
   - Check if result equals answer
4. Return match with explanation

**Key Indicators:**
- "as substitute for", "substitute for"
- "replacing", "in place of"
- "instead of", "in lieu of"

#### Letter Movement Pattern

Handles clues where a letter moves position within a word, often combined with charade:

**Example: "Following delay of months, slander hospital department's union (9)" → ALIGNMENT**
```
Definition: "union" (END) → ALIGNMENT
Wordplay:
  1. "slander" → MALIGN (synonym)
  2. "months" → M (abbreviation)
  3. "Following delay of months" = move M to end of MALIGN → ALIGNM
  4. "hospital department's" → ENT (abbreviation)
  5. ALIGNM + ENT = ALIGNMENT (charade)
```

**Difficulty: Very Hard** - Requires understanding:
- Rare "letter movement" mechanism
- Multi-step operation (synonym + movement + charade)
- Medical abbreviation knowledge

**Algorithm (`tryLetterMovementCharade`):**
1. Find single-letter candidates (abbreviations like M for "months")
2. Find word candidates containing that letter (synonyms like MALIGN for "slander")
3. Apply letter movement based on indicator direction:
   - "delay", "demoted", "moved to end" → letter moves to end
   - "promoted", "moved to start" → letter moves to start
4. Check if moved word matches answer start
5. Find additional charade parts to complete the answer
6. Return full traceable breakdown

**Key Indicators:**
- "following delay", "following delay of" (move to end)
- "delayed", "demoted" (move to end)
- "promoted" (move to start)
- "moved to the end", "moved to the start"
- "shifted", "transferred", "relocated"

**Disambiguation:** When a word could be part of definition OR wordplay:
- Parser checks if word has synonyms that are substrings of answer
- Prefers shorter definitions that leave more words for wordplay
- Example: "department's union" vs "union" - prefers "union" since "department's" is needed for ENT

#### Definition Phrase Matching

When checking if a phrase matches the answer as a definition:

**Rule: Multi-word phrases must match as a whole**

The phrase "Pawn telly, primarily as" should NOT match STOOGE just because "pawn" is one word within it. Only:
- The entire phrase as a dictionary entry, OR
- A single-word phrase

This prevents over-greedy definition detection that would select longer phrases incorrectly.

**Implementation (`checkPhraseMatchesAnswer`):**
- Check phrase as whole first (dictionary lookup)
- Individual word synonym checks only for `phraseWords.length === 1`
- CRYPTIC_MEANINGS checks also restricted to single words

#### Double Definition Pattern

Handles clues where two parts each independently define the answer:

**Example: "Leave Antarctica? (6)" → DESERT**
```
Part 1: "Leave" → DESERT (to abandon)
Part 2: "Antarctica?" → DESERT (it's technically a desert)
No wordplay - both parts are definitions
```

**Example: "Disgusting position (4)" → RANK**
```
Part 1: "Disgusting" → RANK (foul, smelly)
Part 2: "position" → RANK (grade, tier)
```

**Algorithm (`tryDoubleDefinition`):**
1. Check when no indicators found
2. Try splitting clue at each word boundary
3. For each split, check if BOTH parts can define the answer (via synonym lookup)
4. If both match, return as DOUBLE_DEFINITION pattern
5. Pattern ID: `DOUBLE_DEFINITION`, confidence: 90

**Signals:**
- Question mark at end often indicates double definition
- Very short clues (2-3 words)
- No obvious indicators

#### Charade + Reversal Pattern

Handles clues where synonym components combine and then reverse:

**Example: "Like dog to upend wood (5)" → BALSA**
```
like → AS
dog → LAB
Combined: ASLAB
Reversed (to upend): BALSA
Definition: "wood"
```

**Algorithm:**
1. When reversal indicator detected but direct reversal doesn't match answer
2. Try splitting fodder into charade components (using `tryCharadeSplit`)
3. Combine results and reverse
4. Check if reversed result matches answer
5. If match, use REVERSAL pattern with charade hint

#### Anagram Verification

Validates that anagram fodder actually contains the correct letters:

**Algorithm:**
1. When anagram indicator found, extract fodder
2. Remove spaces/punctuation from fodder
3. Sort fodder letters alphabetically
4. Sort answer letters alphabetically
5. Compare: if match, anagram is valid
6. Increment `synonymsResolved` only if valid

**Example: "Coe isnt running district (7)" → SECTION**
```
COEISNT letters sorted: CEINOSS
SECTION letters sorted: CEINOSS
Match confirmed → ANAGRAM pattern
```

#### Hidden Fodder Fallback

For hidden indicators, tries both fodder locations:

**Problem:** Fodder can be before OR after the hidden indicator
- "bLESSing not entirely needed" → fodder BEFORE "not entirely"
- "somewhat scaRES IReland" → fodder AFTER "somewhat"

**Algorithm:**
1. Try primary fodder location
2. If answer not found in fodder, try alternate location
3. Check words before indicator (excluding definition)
4. Check words after indicator (excluding definition)
5. Use whichever contains the answer

#### Charade Fallback

When indicator-based parsing doesn't fully resolve (`needsAI` would be true), tries charade as a fallback:

**Problem:** Some clues have indicators that don't fully resolve, but work as simple charades.
- "Upset, wearing green (6)" → "wearing" detected as container indicator, but actually IN+VERT charade

**Algorithm:**
1. After indicator processing, check if `synonymsResolved < synonymsNeeded`
2. If so, build wordplay text by excluding definition
3. Call `tryCharadeSplit()` on wordplay
4. If charade succeeds:
   - Update patternData to CHARADE
   - Set confidence to 75
   - Mark `needsAI = false`

**Example: "Upset, wearing green (6)" → INVERT**
```
Container processing fails (can't resolve)
Charade fallback: "wearing green"
  wearing → IN
  green → VERT
  IN + VERT = INVERT ✓
```

### Synonym Dictionary (`/data/synonymDictionary.ts`)

**Main Dictionary (350+ mappings):**
- Proximity: `close to → NEAR, BY, AT`
- Water: `stream → BROOK, CREEK, BECK`
- Size: `massive → WEIGHTY, HUGE, VAST`
- Animals: `bird → ROOK, CROW, JAY`

**Standalone Synonyms (for charade splitting):**
- Certainty: `definitely → SURE`, `certainly → SURE`
- Negation: `nothing → NIL`, `zero → O`
- Roles: `soldier → ANT`, `sailor → TAR`
- Direction: `north → N`, `east → E`

These are used to split multi-component clues (e.g., acrostic + synonym).

**Cryptic-Specific Synonyms (with explanations):**

| Entry | Synonym | Why |
|-------|---------|-----|
| `drink` | KIR | French cocktail (white wine + cassis) |
| `rent` | RIP | "Rent" as noun = tear in fabric |
| `in` | HIP | "In" = fashionable = hip |
| `perfect` | MINT | "Mint condition" = perfect |
| `soldier killer` | ANTEATER | Anteaters eat soldier ants |
| `ref's assistant` | VAR | Video Assistant Referee |
| `daughter` | D | Standard abbreviation |
| `go before` | ANTEDATE | To precede in time |
| `money-grubber` | SCROOGE | Dickens character, miser |
| `credit` | CR | Standard abbreviation (accounting) |
| `pawn` | STOOGE | Someone manipulated by another |

These require explanations for users learning cryptic conventions.

**Cryptic Meanings Dictionary (`CRYPTIC_MEANINGS`):**

Maps words with special cryptic crossword meanings to their explanations and synonyms:

| Word | Meaning | Synonyms |
|------|---------|----------|
| `do` | hairstyle | HAIRDO, PERM, BOB, TONSURE, COIF |
| `flower` | river (flows) | RIVER, STREAM, PO, DEE, CAM |
| `runner` | river/smuggler/blade | RIVER, BLADE, SKI |
| `banker` | river (has banks) | RIVER, STREAM, AVON, NILE |
| `see` | bishop's territory | DIOCESE, ELY, BATH |
| `number` | anaesthetic (numbs) | ANAESTHETIC, GAS, ETHER |
| `setter` | dog/compiler | DOG, I, ME |

Used by cryptic definition detection to automatically identify when a definition word has a special meaning that matches the answer.

---

## 12. Data Persistence

```typescript
// services/clueManager.ts
saveClue(pubId, clueText, evaluation, patternData)
```

The `TrainingItem` stores:
- `evaluation`: Full clue analysis
- `patternData`: Engine-ready step variables

Training Mode loads from IndexedDB — never calls AI.

---

## 13. Files (Summary)

| File | Purpose |
|------|---------|
| `services/freeformParser.ts` | Parses natural coaching format |
| `services/clueParser.ts` | Heuristic indicator/definition detection |
| `services/geminiService.ts` | AI functions (solveClue, evaluateClue, etc.) |
| `data/synonymDictionary.ts` | 350+ synonym mappings |
| `services/clueManager.ts` | Persistence layer |
| `components/ManualEntryMode.tsx` | Battlecard Builder UI + AI solve button |
| `components/ClueSolver.tsx` | Solve session engine |
| `parser_updates.md` | Pending parser improvements |

---

## 14. Testing

### Pre-Save Validation (REQUIRED)

Before any clue can be saved to the library, the parser output must pass validation. This ensures only properly-parsed clues enter the training queue.

**Validation Requirements:**
| Check | Requirement |
|-------|-------------|
| `result_1` exists | Parser must resolve wordplay to a result |
| `def_text` exists | Definition must be extracted |
| `fodder_1_text` exists | Fodder must be identified |
| Result matches answer | `result_1` (or combined results) = answer |

**If validation fails:** Show "Send for Analysis" button, block "Accept & Save".

### Test Case Script

**Location:** `tests/tc-import-solve.ts`

**Run with:**
```bash
npx tsx tests/tc-import-solve.ts
```

**Test Coverage (27 tests):**

| Section | Tests | Purpose |
|---------|-------|---------|
| Parser Output | 8 | Definition, indicators, fodder extracted correctly |
| Pattern Variables | 6 | All vars populated (def_text, result_1, etc.) |
| Evaluation Structure | 4 | ClueEvaluation built correctly |
| Solver State Machine | 6 | All state transitions work (DEFINITION → COMPLETED) |
| Learnings Validation | 3 | Hints and match types available |

**Reference Clue:**
```
Clue: "Being up somewhat scares Ireland following comeback (5)"
Answer: RISER
Expected: def_text="Being up", fodder="scares Ireland", result="RISER"
```

**Run this test after any parser changes to catch regressions.**

### Import-to-Solve Flow

```
1. Dojo → Add Clue → Paste notes → "Review Battlecard"
2. Parser validates output → must have result_1
3. If valid: "Accept & Save" enabled
4. If invalid: "Send for Analysis" only (blocked)
5. Back to Dojo → Training Mode → Solve clue
6. Verify: patternData drives step-by-step engine
```

### Validation Checklist

- [ ] Parse preview updates live
- [ ] Special case warning shows when detected
- [ ] Missing fields have input prompts
- [ ] **Pre-save validation passes (result exists)**
- [ ] Accept saves to IndexedDB
- [ ] Clue appears in Training queue
- [ ] Pattern engine used (not fallback)

### TypeScript Check

```bash
npx tsc --noEmit
```

---

## 15. Claude Code Controls — Two-Phase Commit System

### Purpose

Prevent uncontrolled changes to the codebase using a **hard enforcement** system. Claude cannot edit any file without explicit user approval. This is not a soft prompt — it's a system-level block.

### The Problem with Soft Controls

Soft controls (asking Claude to follow rules, UI approval dialogs) fail because:
- Claude may "forget" or ignore rules mid-conversation
- UI dialogs ask the user AFTER Claude decided to edit
- No enforcement = no guarantee

### Solution: Two-Phase Commit

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: PROPOSE                                            │
├─────────────────────────────────────────────────────────────┤
│  Claude writes proposal → .claude/pending_proposal.md        │
│  Claude asks user → "Do you approve?"                        │
│  Claude STOPS and waits                                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  USER APPROVAL                                               │
├─────────────────────────────────────────────────────────────┤
│  User says "approved"                                        │
│  Hook detects → creates .claude/approval_granted (token)     │
│  Token: single-use, 5-minute expiry                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  PHASE 2: EXECUTE                                            │
├─────────────────────────────────────────────────────────────┤
│  Claude attempts Edit/Write                                  │
│  Hook checks: valid token exists?                            │
│  YES → Allow edit, consume token                             │
│  NO  → HARD BLOCK (not ask, block)                           │
└─────────────────────────────────────────────────────────────┘
```

### Why This Is 100% Enforceable

| Check | Failure Mode |
|-------|--------------|
| No token file | BLOCKED |
| Token expired (>5 min) | BLOCKED |
| Token already used | BLOCKED |
| Token corrupted | BLOCKED |

There is no path to edit without a valid token. Claude cannot create the token — only the user saying "approved" triggers it.

### Hook Files

| File | Purpose |
|------|---------|
| `.claude/settings.json` | Hook configuration |
| `.claude/hooks/check_approval.py` | Listens for "approved", creates token, injects rules |
| `.claude/hooks/gate_edits.py` | Hard blocks Edit/Write without valid token |
| `CLAUDE_RULES.md` | Rules document (injected into every prompt) |

### Token File Structure

`.claude/approval_granted`:
```json
{
  "timestamp": 1704307200.0,
  "expires": 1704307500.0,
  "proposal": "First 500 chars of proposal...",
  "used": false
}
```

After edit: `"used": true` → token invalidated.

### Proposal Template

Claude writes to `.claude/pending_proposal.md`:

```markdown
## Proposal: [Brief Title]

### Files to Modify
- `path/to/file.ts` - [what changes]

### Current Behavior
[What it does now]

### New Behavior
[What it will do after]

### Why Needed
[Justification]

### Risk Assessment
[What could break, LOW/MEDIUM/HIGH]
```

### settings.json Configuration

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/check_approval.py\""
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "type": "command",
        "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/gate_edits.py\""
      }
    ]
  }
}
```

### Implementing in Other Projects

1. **Create `.claude/hooks/` directory**
2. **Copy hook files**: `check_approval.py`, `gate_edits.py`
3. **Create `CLAUDE_RULES.md`** with two-phase commit instructions
4. **Configure `.claude/settings.json`** with hooks
5. **Test**: Attempt an edit without approval — should be blocked

### Protected Files (Extra Caution)

These files are critical infrastructure:
- `services/clueManager.ts` - Data persistence
- `services/clueParser.ts` - Core parsing logic
- `services/freeformParser.ts` - Import parsing
- `types.ts` - Type definitions
- `data/seedClues.ts` - Seed data

### Allowed Without Approval

- Reading files
- Running tests/builds
- Bash commands (non-destructive)
- Searching/exploring codebase
- Writing to `.claude/pending_proposal.md` (the proposal itself)

---

## 16. Parser Change Protocol

### When a clue fails to parse correctly

**DO NOT** modify parser code directly. Follow this protocol:

### Step 1: Save Failed Import

Failed imports are saved to IndexedDB `parser_issues` store containing:
- Full input text
- Clue text and answer
- What parser detected
- Special case type and reason

### Step 2: Analyze Using Prompt Template

Use `prompts/analyze_failed_import.md` which enforces:

| Step | Action | Constraint |
|------|--------|------------|
| 1 | Understand the clue | Read only, no changes |
| 2 | Identify the gap | Read only, no changes |
| 3 | Classify the fix | A=Data, B=Pattern, C=Logic, D=Edge |
| 4 | Propose solution | Plain English, wait for approval |
| 5 | Implement | Only after explicit approval |

### Step 3: Classify Fix Type

| Category | Description | Risk | Example |
|----------|-------------|------|---------|
| A | Add data to dictionary | LOW | Add `'definitely': 'SURE'` |
| B | Add new pattern type | MEDIUM | Acrostic+Charade combo |
| C | Modify parsing logic | HIGH | Change fodder extraction |
| D | Edge case / defer | N/A | One-off unusual clue |

### Step 4: Regression Testing

After any parser change, verify these clues still parse:

```
1. "Stream flowing back round esplanade initially (5)" = CREEK
2. "Heading away from Santa, fly like a bird (4)" = SOAR
3. "Nearly all our products returned are unusual (7)" = CURIOUS
```

---

## 17. Files (Complete)

| File | Purpose |
|------|---------|
| **Core Services** | |
| `services/freeformParser.ts` | Parses natural coaching format |
| `services/clueParser.ts` | Heuristic indicator/definition detection + cryptic definition detection |
| `services/clueManager.ts` | Persistence layer (IndexedDB) + parser issues store |
| **Data** | |
| `data/synonymDictionary.ts` | 350+ synonym mappings + standalone synonyms |
| `data/seedClues.ts` | Pre-loaded training clues |
| **Components** | |
| `components/ManualEntryMode.tsx` | Battlecard Builder UI with special case override |
| `components/ClueSolver.tsx` | Solve session engine + dynamic definition tips |
| `components/DataManager.tsx` | Cloud Hub + Failed Imports viewer |
| **Controls** | |
| `CLAUDE_RULES.md` | Master rules for Claude Code |
| `.claude/settings.json` | Hook configuration |
| `.claude/hooks/inject_rules.py` | Rule injection hook |
| `.claude/hooks/gate_edits.py` | Edit/Write gate hook |
| **Prompts** | |
| `prompts/analyze_failed_import.md` | Protocol for analyzing failed imports |
| **Documentation** | |
| `parser_updates.md` | Documented parser cases and action items |
| `MASTER_APP_SPECIFICATION.md` | This document |

---

## 18. Key Learnings

### Cryptic Definitions
- Not all definitions can be reconciled with the answer via synonyms
- "do in monastery" = TONSURE requires knowing "do" = hairstyle
- Parser detects these and flags with `definition_type = 'cryptic'`
- Hint extracted from coaching notes when available

### Multi-Component Clues
- Some clues combine multiple wordplay types (e.g., acrostic + synonym)
- Parser splits fodder at standalone synonym words
- Pattern ID: `ACROSTIC_CHARADE` for these cases

### Definition Position Exceptions
- Most definitions are at START or END
- Some clues have ENTIRE clue as definition (cryptic definitions)
- Some have definition in unusual positions (rare)
- Dynamic tips inform user when position is exceptional

### Parser Safety
- All parser changes require explicit user approval
- Failed imports saved to DB for later analysis
- User can override warnings if parser succeeded
- Regression tests verify existing clues still work
