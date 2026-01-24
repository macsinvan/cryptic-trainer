# Cryptic Trainer — Design Specification

*Last updated: 2026-01-24*

---

## Architectural Principles

### 1. All Logic Lives in the Metadata

Each clue has a JSON structure that contains:
- All information about the clue (text, answer, enumeration, etc.)
- All solve logic (steps, expected selections, validation rules)
- All hints and explanations

The application reads this metadata and presents it to the user. The UI does not compute or derive anything — it simply renders what the metadata specifies.

This means:
- Adding a new clue = adding a new JSON object with complete solve data
- No code changes required to support new clue patterns
- The solver/parser generates this metadata; the UI consumes it
- If the UI behaves incorrectly, the metadata is wrong — fix the metadata, not the UI

### 2. Thin Client Architecture

**ALL business logic lives on the Python server. The UI is a thin client that only renders and captures input.**

| Layer | Responsibility |
|-------|----------------|
| **Python Server** (port 5001) | ALL logic: import, validate, store, training flow, dependency checking, answer validation, state management |
| **React UI** (port 3000) | ONLY: render data, capture user input, display server responses |

**The UI does NOT:**
- Parse or validate data
- Check dependencies or blocked state
- Validate user answers
- Compute what step comes next
- Make any decisions — server decides everything

**The UI ONLY:**
- Displays what the server tells it to display
- Sends user actions to the server
- Renders server responses
- **Syncs local display state FROM server state** (never the reverse)

This ensures:
- Single source of truth for ALL logic
- UI can be completely dumb — just a view layer
- Easy debugging — check server state directly
- No divergence between server logic and UI behavior

**Critical Implementation Rule:**
If the UI maintains any local state for display purposes (like `wordplaySubPhase`), it MUST be synced FROM `serverState` via `useEffect`. The UI must NEVER derive server state from local UI state. Pattern:
```typescript
// CORRECT: Sync local state FROM server
useEffect(() => {
  if (serverState?.currentPhase === 'fodder') {
    setWordplaySubPhase('fodder');
  }
}, [serverState?.currentPhase]);

// WRONG: Would create out-of-sync states
// Don't manually setWordplaySubPhase without server driving it
```

---

## UI State Architecture (Minimal State)

The UI holds **only 4 pieces of state**. Everything else is derived from `serverState`.

### UI State Variables

| State | Type | Purpose |
|-------|------|---------|
| `serverState` | `TrainingActionResponse` | **Source of truth** — full server response |
| `selectedIndicatorIndices` | `number[]` | Words user has tapped for indicator (pre-check) |
| `selectedFodderIndices` | `number[]` | Words user has tapped for fodder (pre-check) |
| `resultInput` | `string` | Text user is typing for result (pre-submit) |

### Everything Else is Derived

**DO NOT create state for these — derive from `serverState`:**

| Derived Value | Source |
|---------------|--------|
| Current phase | `serverState.currentPhase` |
| Current wordplay | `serverState.currentWordplay` |
| Is indicator correct | `serverState.currentWordplay.state.indicatorFound` |
| Is fodder correct | `serverState.currentWordplay.state.fodderFound` |
| Indicator highlight | `serverState.currentWordplay.state.indicatorFound` |
| Fodder highlight | `serverState.currentWordplay.state.fodderFound` |
| Blocked hint | `serverState.blockedHint` |
| Is blocked | `serverState.blocked` |

### State Lifecycle

```
User taps word
  → Update selectedIndicatorIndices (local state)
  → Show "Check" button

User clicks "Check"
  → Call server: check_indicator(selected)
  → Server validates, updates state, returns new serverState
  → setServerState(response)
  → Clear selectedIndicatorIndices (selection consumed)
  → UI re-renders from serverState:
      - serverState.currentPhase shows new phase
      - serverState.currentWordplay.state.indicatorFound shows highlight
```

### Clear Rules

**Selection state clears when:**
1. User submits (check succeeds) — selection was consumed
2. User submits (check fails) — allow retry with new selection
3. Server returns different wordplay ID — fresh start

**Selection state NEVER clears when:**
- Phase changes within same wordplay (highlights come from serverState, not selection)

### Highlight Logic (Derived)

```typescript
const getWordStyle = (index: number) => {
  const wp = serverState?.currentWordplay;
  const phase = serverState?.currentPhase;

  // Correct indicator → orange (from server state)
  if (wp?.state?.indicatorFound && indicatorIndicesFromServer.includes(index)) {
    return 'bg-orange-200';
  }

  // Correct fodder → blue (from server state)
  if (wp?.state?.fodderFound && fodderIndicesFromServer.includes(index)) {
    return 'bg-blue-200';
  }

  // Currently selected (local state, pre-check)
  if (phase === 'indicator' && selectedIndicatorIndices.includes(index)) {
    return 'bg-yellow-100';
  }
  if (phase === 'fodder' && selectedFodderIndices.includes(index)) {
    return 'bg-yellow-100';
  }

  return '';
};
```

### Benefits

1. **No sync bugs** — only one source of truth (serverState)
2. **No duplicate state** — can't get out of sync
3. **Simple clear rules** — only clear ephemeral input state
4. **Server controls all logic** — UI just renders

---

### 3. Constraint-First Solving (No AI Guessing)

The solver derives answers using:
- Explicit, checkable wordplay frames generated from code
- Lexicon lookups (synonyms, abbreviations, phrases)
- Positional logic and pattern matching
- Machine-checkable proof traces

**Golden Rule:** The solver produces traceable proofs, not AI-generated narratives.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  PYTHON SERVER (localhost:5001)                             │
│  cryptic_trainer_bundle/                                    │
├─────────────────────────────────────────────────────────────┤
│  • /clues/import — Import puzzle files                       │
│  • /clues — CRUD operations for clue storage                │
│  • /solve — Solve clues with proof traces                   │
│  • Storage: clues_db.json                                   │
└─────────────────────────────────────────────────────────────┘
                              ↓ HTTP
┌─────────────────────────────────────────────────────────────┐
│  REACT UI (localhost:3000)                                  │
├─────────────────────────────────────────────────────────────┤
│  • ManualEntryMode — Import clues (sends raw JSON)          │
│  • ClueTrainer — Step-by-step training interface            │
│  • TrainingMode — Practice queue                            │
└─────────────────────────────────────────────────────────────┘
```

### Quick Start

```bash
# Terminal 1: Python server
cd cryptic_trainer_bundle && python3 server.py

# Terminal 2: React UI (from project root)
npm run dev
```

---

## Import Flow

### Import Steps

1. **Receive** puzzle JSON from UI (`POST /clues/import`)
2. **Validate JSON integrity** — valid JSON, has `metadata` and `clues` objects
3. **Validate each ClueEntry** against full schema:
   - `clue` — number, text, enumeration, answer (all required)
   - `clueType` — id (required, one of: standard, double_definition, cryptic_definition, andit)
   - `definition` — text, position (both required)
   - `wordplays` — array with all required fields per Wordplay schema
4. **Reject if validation fails** — return errors in actionable form (clue number, field name, issue)
5. **Check for duplicates** — skip if clue already exists in database (by normalized text)
6. **Store valid ClueEntries** exactly as received — no transformation
7. **Return response**:
   - Success count (saved, skipped)
   - Error list with details for each failed clue

### UI Display

- Show success count
- Show error logs with **copy** button for easy fixing at source

### Key Principles

- **Import in full**: All fields must be present at import time — no partial schemas
- **No transformation**: Store exactly as received — no field renaming, no restructuring
- **Fail clearly**: Validation errors must identify exactly what to fix
- **Fix at source**: If schema doesn't fit trainer needs, fix the puzzle file — not import code

### Live Document Model

**The imported clue data structure is ALIVE during training and is the SINGLE SOURCE OF TRUTH.**

The ClueEntry schema (exactly as imported) is the working document:

1. **On load**: Server reads ClueEntry from storage — `state` fields start as `false`
2. **During training**: Server updates `state` fields as user progresses
3. **UI rendering**: UI receives current state from server and renders it
4. **All decisions**: Server checks `dependencies`, `state.solved`, `blockedHint` — UI just displays

The ClueEntry is mutated in place by the server — no separate "progress" tracking, no UI-side state.

### Source Puzzle File Format (Complete Schema)

#### Top Level
```json
{
  "metadata": {
    "file": "string",
    "publisher": "string",
    "puzzle_number": "string",
    "setter": "string"
  },
  "clues": { "<clue_number>": ClueEntry }
}
```

#### ClueEntry
```json
{
  "clue": {
    "number": "string",      // e.g., "1A"
    "text": "string",        // Full clue text
    "enumeration": "string", // e.g., "10"
    "answer": "string"       // e.g., "PHLEBOTOMY"
  },
  "clueType": {
    "id": "standard"         // One of: standard, double_definition, cryptic_definition, andit
  },
  "definition": {
    "text": "string",        // e.g., "Drawing blood"
    "position": "start|end"
  },
  "wordplays": [Wordplay]    // See Wordplay schema below
}
```

---

## Training Flow

### Step 1: Identify Clue Type

**This is ALWAYS the first step for every clue.**

| Type | ID | Question |
|------|----|----------|
| **Standard** | `standard` | Definition + wordplay indicators? |
| **Double Definition** | `double_definition` | Two meanings, no wordplay? |
| **Cryptic Definition** | `cryptic_definition` | Whole clue is whimsical description? |
| **&lit** | `andit` | Whole clue describes AND constructs? |

Validation: Compare user selection against `clueType.id` in metadata.

### Step 2: Identify Definition

| Clue Type | Definition Behavior |
|-----------|---------------------|
| `standard` | At start OR end (one span) |
| `double_definition` | Two separate definitions |
| `cryptic_definition` | Entire clue |
| `andit` | Entire clue |

Validation: Compare selected words against `definition.text`.

### Step 3: Wordplay Steps

For each wordplay step with dependencies resolved:

1. **INDICATOR** — User taps indicator word(s)
2. **FODDER** — User taps fodder word(s)
3. **RESULT** — User enters result of operation (if required by operation type)

#### Operation Types and Phases

Different operations have different phase requirements:

| Operation | Phases | Notes |
|-----------|--------|-------|
| `fodder_selection` | indicator → fodder | NO result entry — completes after fodder |
| `anagram` | indicator → fodder → result | Full flow |
| `letter_selection` | indicator → fodder → result | Full flow |
| `container` | indicator → fodder → result | Fodder may be reference |
| Most others | indicator → fodder → result | Full flow |

**Reference Fodder:**
When `fodder` is an object with `type: "result"`, the fodder phase is skipped (fodder comes from other wordplays, not user selection).

#### Dependency System

Wordplays use `dependencies` to declare which other wordplays must be solved first.

**Dependency Types:**

| Type | Example | Behavior |
|------|---------|----------|
| **Fully independent** | `dependencies: []` | Can complete entirely without other wordplays |
| **Fully dependent** | `dependencies: ["1A", "3"]` | Completely blocked until dependencies solved |
| **Partially dependent** | Has `subOperations` with mixed dependencies | Can make partial progress |

**Partial Progress with subOperations:**

When a wordplay can be partially solved before blocking, it uses `subOperations`. SubOperations are **independent trainable steps** with their OWN fields:

```json
{
  "id": "1",
  "operation": "anagram",
  "dependencies": ["2", "3"],       // Top-level deps IGNORED if subOps exist
  "subOperations": [
    {
      "id": "1A",
      "operation": "fodder_selection",
      "indicator": "busy",          // SubOp has its OWN indicator
      "fodder": "lymph too",        // SubOp has its OWN fodder
      "result": "LYMPHTOO",         // For display (not user-entered)
      "dependencies": [],           // Can do immediately
      "blockedHint": "Fodder only has 8 letters...",
      "state": {
        "indicatorFound": false,
        "fodderFound": false,
        "resultEntered": false,
        "solved": false
      }
    },
    {
      "id": "1B",
      "operation": "solve_anagram",
      "indicator": "busy",          // May share indicator with 1A
      "fodder": "lymph too + EB",   // Descriptive fodder for this step
      "result": "PHLEBOTOMY",       // User enters this
      "dependencies": ["2", "3"],   // Blocked until 2 and 3 solved
      "blockedHint": "Need to find the missing letters first...",
      "state": {
        "indicatorFound": false,
        "fodderFound": false,
        "resultEntered": false,
        "solved": false
      }
    }
  ]
}
```

**Key SubOperation Rules:**
- SubOperations have their OWN `indicator`, `fodder`, `result`, `dependencies`, `blockedHint`, `state`
- They do NOT inherit from parent — they are fully self-contained
- When a wordplay has subOperations, the parent's dependencies are IGNORED
- Server serves subOperations individually as training steps
- `fodder_selection` completes after fodder phase (no result entry needed)

**Blocked State:**
- When blocked, `blockedHint` is displayed to explain why
- User sees what they've accomplished and what's still needed
- **blockedHint is ALWAYS included** in server responses when present (even when not blocked) — for informational display

**blockedHint Rules:**
- Must be generic — no solve hints for dependent wordplays
- Good: "Solving this wordplay depends on solving adjacent wordplays first."
- Bad: "You need to find the last letters of 'conclude job' first." (gives away the dependent solve)

**Free Entry Point:**

Users can start with ANY wordplay. The system guides them:

1. User taps any wordplay
2. System checks `dependencies` array
3. For each dependency ID, check if that wordplay's `state.solved === true`
4. **All dependencies solved** → wordplay is available, proceed
5. **Any dependency unsolved** → show `blockedHint`, user is guided to solve open dependencies first

This means:
- No prescribed solve order
- User explores freely
- Blocked wordplays point to what needs solving
- The dependency graph + state = dynamic guidance

---

## Stored Data Structure

The server stores source data directly in `patternData`. Key fields:

| Field | Description |
|-------|-------------|
| `clueText` | Full clue text (no enumeration) |
| `answer` | The answer |
| `enumeration` | Letter count (e.g., "10") |
| `definition` | `{text, position}` |
| `wordplays` | Array of wordplay objects |

### Wordplay Object (Complete Schema)

```json
{
  "id": "1",                         // String identifier for this wordplay
  "indicator": "busy",               // Indicator word(s)
  "operation": "anagram",            // See operation values below
  "fodder": "lymph too",             // Fodder - string OR object (see below)
  "fodderLetterCount": 8,            // Number of letters in fodder
  "result": "PHLEBOTOMY",            // Result of this wordplay
  "resultLetterCount": 10,           // Number of letters in result
  "dependencies": ["2", "3"],        // IDs of wordplays that must be solved first
  "blockedHint": "Fodder only has 8 letters, answer needs 10. We need to find 2 more letters.",
  "state": {                         // Tracks user progress
    "indicatorFound": false,
    "fodderFound": false,
    "resultEntered": false,
    "solved": false
  },
  "subOperations": [                 // Optional: for complex multi-part operations
    {
      "id": "1A",
      "operation": "fodder_selection",
      "dependencies": [],
      "state": { "solved": false }
    },
    {
      "id": "1B",
      "operation": "solve_anagram",
      "dependencies": ["2", "3"],
      "state": { "solved": false }
    }
  ],
  "explanation": "The word 'busy' indicates an anagram of 'lymph too'...",

  // Operation-specific fields:
  "extractionType": "last_letter"    // For letter_selection: "last_letter", "first_letter"
}
```

#### Fodder as Object

When fodder comes from other wordplays, it's an object:

```json
{
  "fodder": {
    "type": "result",
    "fromWordplay": ["1A", "3"]      // IDs of wordplays providing the fodder
  }
}
```

### Valid operation Values

| operation | Description |
|-----------|-------------|
| `anagram` | Rearrange letters |
| `container` | One thing inside another |
| `hidden` | Answer hidden in consecutive letters |
| `reversal` | Spell backwards |
| `deletion` | Remove letters |
| `homophone` | Sounds like |
| `abbreviation` | Standard abbreviation (DR, N, S) |
| `letter_selection` | Take specific letters (uses `extractionType`) |
| `synonym` | Word replacement |
| `charade` | Concatenate parts |
| `fodder_selection` | Sub-operation: select fodder |
| `solve_anagram` | Sub-operation: solve the anagram |

---

## Server API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/solve` | POST | Solve a clue `{clue, length, knownAnswer?}` |
| `/clues/import` | POST | Import puzzle file `{puzzle, publicationId}` |
| `/clues` | GET | List all saved clues |
| `/clues` | POST | Save/update a clue |
| `/clues/<id>` | DELETE | Delete a clue by ID |
| `/clues/bulk` | POST | Bulk import `{items: [...]}` |
| `/clues/clear` | POST | Clear all clues |
| `/parser-issues` | GET/POST | Parser issue tracking |
| `/training/action` | POST | Training flow actions (see below) |

### Training Flow API

The `/training/action` endpoint handles all training flow logic:

**Request:**
```json
{
  "clueId": "user-123-1A",
  "action": "start|get_state|check_indicator|check_fodder|check_result|select_wordplay",
  "data": {
    "wordplayId": "1A",     // For check_* and select_wordplay
    "selected": "busy",     // For check_indicator, check_fodder
    "entered": "LYMPHTOO"   // For check_result
  }
}
```

**Response:**
```json
{
  "success": true,
  "clueEntry": { ... },           // Full clue data with updated state
  "currentWordplay": { ... },     // Wordplay user should work on
  "currentPhase": "indicator|fodder|result|complete|blocked",
  "blocked": false,
  "blockedHint": "...",           // ALWAYS included if present on wordplay
  "isSubOperation": true,
  "parentWordplay": { ... },      // If isSubOperation=true
  "currentWordplayIndex": 0,
  "validation": {                 // For check_* actions
    "correct": true,
    "expected": "busy"
  },
  "allSolved": false
}
```

**Phase Transitions:**
- After `check_indicator` correct → advance to fodder (stay on SAME wordplay)
- After `check_fodder` correct → advance to result OR complete (for `fodder_selection`)
- After `check_result` correct → find NEXT available wordplay
- Wrong answers keep user on same phase

### Storage Format

Clues stored in `cryptic_trainer_bundle/clues_db.json`:

```json
{
  "version": 2,
  "training_items": {
    "user-123": { "id": "...", "clue": "...", "patternData": {...} }
  },
  "parser_issues": {}
}
```

---

## Color System

| Element | Color | Purpose |
|---------|-------|---------|
| Definition | Green | `bg-green-*` |
| Indicator | Orange | `bg-orange-*` |
| Fodder | Blue | `bg-blue-*` |

---

## Validation Checklist

Before saving a clue, verify:

1. **clueType.id** is one of: `standard`, `double_definition`, `cryptic_definition`, `andit`
2. **definition.text** matches words in the clue
3. **definition.position** is `start` or `end`
4. **wordplays** each have unique `id` values
5. **dependencies** reference valid wordplay IDs (no circular refs)
6. **state** objects are initialized to all `false`
7. **result** values chain correctly to produce final answer

---

## File Inventory

### Core Files
- `cryptic_trainer_bundle/server.py` — HTTP server + clue storage
- `cryptic_trainer_bundle/cryptic_trainer.py` — Solver engine

### Data Storage
- `cryptic_trainer_bundle/clues_db.json` — Server-side clue storage

### Learned Cache (auto-generated)
- `learned_synonyms.json` — Validated AI-provided synonyms
- `learned_abbreviations.json` — Validated abbreviations

### Documentation
- `DESIGN_SPEC.md` — This document
- `CLAUDE.md` — Claude Code rules
- `README.md` — Quick start guide

---

## Key Concepts Summary

| Concept | Purpose |
|---------|---------|
| **Source Schema** | Puzzle file format with complete wordplay data |
| **patternData** | Server stores source data directly here |
| **wordplays** | Array of wordplay objects with dependencies |
| **dependencies** | Array of wordplay IDs that must be solved first |
| **blockedHint** | Hint shown when wordplay cannot be solved yet |
| **state** | Tracks user progress through each wordplay |
| **subOperations** | For complex wordplays with multiple parts |
| **thin client** | UI sends raw data to server, server handles all logic |

---

## Regression Testing

### Golden Clue Tests

Golden clues are well-understood clues with known correct behavior. They serve as regression tests to ensure training flow works correctly.

**Test File:** `cryptic_trainer_bundle/test_training_flow.py`

**Run Tests:**
```bash
cd cryptic_trainer_bundle && python3 test_training_flow.py
python3 test_training_flow.py --verbose        # Detailed output
python3 test_training_flow.py --test PHLEBOTOMY  # Run specific test
```

### Current Golden Clues

#### PHLEBOTOMY (Times 2025)

**Clue:** "Drawing blood, lymph too, busy nurses conclude job at last" (10)

**Structure:**
- Definition: "Drawing blood" (start)
- Wordplay 1: anagram with subOperations
  - SubOp 1A: `fodder_selection` (deps: []) — identify indicator + fodder
  - SubOp 1B: `solve_anagram` (deps: ["2", "3"]) — solve full anagram
- Wordplay 2: `container` (deps: ["1A", "3"]) — "nurses" indicates insertion
- Wordplay 3: `letter_selection` (deps: []) — "at last" from "conclude job" = EB

**Test Coverage:**

| Test | Verifies |
|------|----------|
| Session start | Fresh session returns correct initial state |
| Dependency blocking | SubOp 1B blocked, shows blockedHint |
| Wordplay 3 flow | Full indicator → fodder → result flow |
| SubOp 1A flow | `fodder_selection` completes after fodder (no result) |
| Wrong indicator | Incorrect selections rejected |
| Wrong result | Incorrect entries rejected |
| Full solve sequence | Dependency chain works correctly |
| Case-insensitive | Validation ignores case |
| Session isolation | New session resets all state |

### Adding New Golden Clues

1. Create puzzle file with complete metadata in `Times_Puzzle_Import/solved/`
2. Import via `/clues/import` endpoint
3. Add test functions to `test_training_flow.py`:
   - `test_<clue>_session_start()`
   - `test_<clue>_dependency_blocking()` (if applicable)
   - `test_<clue>_full_flow()`
   - Operation-specific tests

### Test Design Principles

1. **Test against server API** — not internal functions
2. **One assertion per behavior** — clear failure messages
3. **Test complete flows** — not just happy path
4. **Always include blockedHint tests** — verify informational hints present
5. **Test phase transitions** — same wordplay until solved, then next

---

## Test Case Design Guidelines

### Philosophy

Tests must verify the **complete user journey**, not just API responses. Each test case documents exactly what a user should see and do at each step.

**The imported metadata is your source of truth.** All expected values come from the wordplay metadata — never hardcode expected values without first reading them from the clue's metadata.

### Test Case Format

Every wordplay test case follows this 3-step format. Expected values are derived from the wordplay metadata:

```json
// Source: wordplay metadata
{
  "id": "1A",
  "operation": "fodder_selection",
  "indicator": "busy",           // ← Expected indicator
  "fodder": "lymph too",         // ← Expected fodder
  "result": "LYMPHTOO"           // ← Expected result (or auto-set for fodder_selection)
}
```

#### Step 1: Identify Indicator

| Aspect | Positive Case | Negative Case |
|--------|---------------|---------------|
| **Instructions** | "Tap the indicator word(s)" | Same |
| **Buttons** | Check (enabled when selection made) | Check (enabled when selection made) |
| **User Action** | Tap word(s) matching `metadata.indicator` | Tap any other word(s) |
| **API Call** | `check_indicator(selected: metadata.indicator)` | `check_indicator(selected: <other>)` |
| **Server Response** | `validation.correct: true`, `validation.expected: metadata.indicator` | `validation.correct: false`, `validation.expected: metadata.indicator` |
| **State Change** | `indicatorFound: true`, `indicatorIndices: [...]` | No state change |
| **UI Result** | Orange highlight on indicator, advance to fodder | Red flash, clear selection, stay on indicator |
| **Next Phase** | `currentPhase: 'fodder'` | `currentPhase: 'indicator'` (unchanged) |

#### Step 2: Identify Fodder

| Aspect | Positive Case | Negative Case |
|--------|---------------|---------------|
| **Instructions** | "Tap the fodder word(s)" | Same |
| **Buttons** | Check (enabled when selection made) | Check (enabled when selection made) |
| **Prerequisite** | Indicator found (orange highlight visible) | Indicator found |
| **User Action** | Tap word(s) matching `metadata.fodder` | Tap any other word(s) |
| **API Call** | `check_fodder(selected: metadata.fodder)` | `check_fodder(selected: <other>)` |
| **Server Response** | `validation.correct: true`, `validation.expected: metadata.fodder` | `validation.correct: false`, `validation.expected: metadata.fodder` |
| **State Change** | `fodderFound: true`, `fodderIndices: [...]` | No state change |
| **UI Result** | Blue highlight on fodder | Red flash, clear selection, stay on fodder |
| **Next Phase** | Depends on `metadata.operation` (see Step 3) | `currentPhase: 'fodder'` (unchanged) |

#### Step 3: Result (operation-dependent)

**Behavior depends on `metadata.operation`:**

**For `fodder_selection` operations:**

| Aspect | Expected Behavior |
|--------|-------------------|
| **Result Input** | NOT SHOWN - operation auto-completes |
| **Display** | Show `metadata.result` as read-only text |
| **State Change** | `resultEntered: true`, `solved: true` (auto-set by server) |
| **Next Wordplay** | Advance to next available wordplay |

**For operations requiring result entry (`anagram`, `letter_selection`, etc.):**

| Aspect | Positive Case | Negative Case |
|--------|---------------|---------------|
| **Instructions** | "Enter the result" | Same |
| **Buttons** | Check (enabled when input non-empty) | Check (enabled when input non-empty) |
| **Prerequisite** | Indicator + fodder found (highlights visible) | Same |
| **User Action** | Type text matching `metadata.result` | Type any other text |
| **API Call** | `check_result(entered: metadata.result)` | `check_result(entered: <other>)` |
| **Server Response** | `validation.correct: true`, `validation.expected: metadata.result` | `validation.correct: false`, `validation.expected: metadata.result` |
| **State Change** | `resultEntered: true`, `solved: true` | No state change |
| **UI Result** | Green highlight, advance to next | Red flash, stay on result |

### Test Case Template (Python)

```python
# Expected values come from the wordplay metadata
WORDPLAY_METADATA = {
    "id": "1A",
    "operation": "fodder_selection",
    "indicator": "busy",
    "fodder": "lymph too",
    "result": "LYMPHTOO"
}

def test_<clue>_<wordplay>_flow() -> TestResult:
    """Test complete flow through wordplay (operation type from metadata).

    Expected values derived from WORDPLAY_METADATA:
      - indicator: metadata['indicator']
      - fodder: metadata['fodder']
      - result: metadata['result']
      - operation: metadata['operation'] (determines Step 3 behavior)
    """
    result = TestResult("<CLUE>: <Wordplay> complete flow")

    metadata = WORDPLAY_METADATA
    wp_id = metadata['id']
    expected_indicator = metadata['indicator']
    expected_fodder = metadata['fodder']
    expected_result = metadata['result']
    operation = metadata['operation']

    # === STEP 1: INDICATOR ===
    resp = training_action(CLUE_ID, 'start')
    result.assert_eq(resp.get('currentPhase'), 'indicator',
                     "Initial phase is 'indicator'")

    # Negative case: wrong indicator
    resp = training_action(CLUE_ID, 'check_indicator', {
        'wordplayId': wp_id,
        'selected': 'wrong_word'  # Any word NOT matching expected_indicator
    })
    result.assert_true(not resp.get('validation', {}).get('correct'),
                       "Wrong indicator rejected")
    result.assert_eq(resp.get('validation', {}).get('expected'), expected_indicator.lower(),
                     f"Server returns expected indicator from metadata")
    result.assert_eq(resp.get('currentPhase'), 'indicator',
                     "Phase unchanged after wrong indicator")

    # Positive case: correct indicator (from metadata)
    resp = training_action(CLUE_ID, 'check_indicator', {
        'wordplayId': wp_id,
        'selected': expected_indicator,
        'selectedIndices': [4]  # Indices where indicator appears in clue
    })
    result.assert_true(resp.get('validation', {}).get('correct'),
                       f"Indicator '{expected_indicator}' accepted")
    result.assert_eq(resp.get('currentPhase'), 'fodder',
                     "Phase advances to fodder")
    state = resp.get('currentWordplay', {}).get('state', {})
    result.assert_true(state.get('indicatorFound'),
                       "indicatorFound is True")
    result.assert_true(state.get('indicatorIndices') is not None,
                       "indicatorIndices stored for UI highlight")

    # === STEP 2: FODDER ===
    # Negative case: wrong fodder
    resp = training_action(CLUE_ID, 'check_fodder', {
        'wordplayId': wp_id,
        'selected': 'wrong words'  # Any words NOT matching expected_fodder
    })
    result.assert_true(not resp.get('validation', {}).get('correct'),
                       "Wrong fodder rejected")
    result.assert_eq(resp.get('validation', {}).get('expected'), expected_fodder.lower(),
                     f"Server returns expected fodder from metadata")
    result.assert_eq(resp.get('currentPhase'), 'fodder',
                     "Phase unchanged after wrong fodder")

    # Positive case: correct fodder (from metadata)
    resp = training_action(CLUE_ID, 'check_fodder', {
        'wordplayId': wp_id,
        'selected': expected_fodder,
        'selectedIndices': [2, 3]  # Indices where fodder appears in clue
    })
    result.assert_true(resp.get('validation', {}).get('correct'),
                       f"Fodder '{expected_fodder}' accepted")
    state = resp.get('currentWordplay', {}).get('state', {})
    result.assert_true(state.get('fodderFound'),
                       "fodderFound is True")
    result.assert_true(state.get('fodderIndices') is not None,
                       "fodderIndices stored for UI highlight")

    # === STEP 3: RESULT (behavior depends on metadata.operation) ===
    if operation == 'fodder_selection':
        # fodder_selection auto-completes after fodder — NO result input
        result.assert_true(state.get('resultEntered'),
                           "resultEntered auto-set for fodder_selection")
        result.assert_true(state.get('solved'),
                           "solved auto-set for fodder_selection")
        # UI should display metadata.result as read-only (NOT an input field)
        # Verify advanced to next wordplay
        next_wp = resp.get('currentWordplay', {})
        result.assert_true(next_wp.get('id') != wp_id,
                           "Advanced to next wordplay")
    else:
        # Operations requiring result entry
        result.assert_eq(resp.get('currentPhase'), 'result',
                         "Phase advances to result")

        # Negative case: wrong result
        resp = training_action(CLUE_ID, 'check_result', {
            'wordplayId': wp_id,
            'entered': 'WRONG'
        })
        result.assert_true(not resp.get('validation', {}).get('correct'),
                           "Wrong result rejected")
        result.assert_eq(resp.get('validation', {}).get('expected'), expected_result,
                         f"Server returns expected result from metadata")

        # Positive case: correct result (from metadata)
        resp = training_action(CLUE_ID, 'check_result', {
            'wordplayId': wp_id,
            'entered': expected_result
        })
        result.assert_true(resp.get('validation', {}).get('correct'),
                           f"Result '{expected_result}' accepted")
        state = resp.get('currentWordplay', {}).get('state', {})
        result.assert_true(state.get('solved'),
                           "Wordplay marked as solved")

    return result
```

### UI Behavior Assertions

For each phase, the test must verify:

1. **Instructions Panel**
   - Correct text displayed for current phase
   - Highlights visible for completed phases

2. **Button State**
   - Check button: enabled only when selection/input exists
   - Skip button: visible when multiple wordplays exist
   - Reveal button: visible when stuck

3. **Input Fields**
   - Result input: visible ONLY when `currentPhase === 'result'` AND operation requires result entry
   - Result input: NOT visible for `fodder_selection` operations

4. **Highlight State**
   - Definition: green (when found)
   - Indicator: orange (when found)
   - Fodder: blue (when found)
   - Current selection: dark/inverted (pre-check)

### Operation Types Reference

| Operation | Phases | Result Entry | Notes |
|-----------|--------|--------------|-------|
| `fodder_selection` | indicator → fodder | NO | Auto-completes after fodder |
| `anagram` | indicator → fodder → result | YES | Full flow |
| `letter_selection` | indicator → fodder → result | YES | Full flow |
| `container` | indicator → (fodder) → result | MAYBE | Fodder may be reference |
| `reversal` | indicator → fodder → result | YES | Full flow |
| `hidden` | indicator → fodder → result | YES | Full flow |
