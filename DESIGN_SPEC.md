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

This ensures:
- Single source of truth for ALL logic
- UI can be completely dumb — just a view layer
- Easy debugging — check server state directly
- No divergence between server logic and UI behavior

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
3. **RESULT** — User enters result of operation

#### Dependency System

Wordplays use `dependencies` to declare which other wordplays must be solved first.

**Dependency Types:**

| Type | Example | Behavior |
|------|---------|----------|
| **Fully independent** | `dependencies: []` | Can complete entirely without other wordplays |
| **Fully dependent** | `dependencies: ["1A", "3"]` | Completely blocked until dependencies solved |
| **Partially dependent** | Has `subOperations` with mixed dependencies | Can make partial progress |

**Partial Progress with subOperations:**

When a wordplay can be partially solved before blocking, it uses `subOperations`:

```json
{
  "id": "1",
  "operation": "anagram",
  "dependencies": ["2", "3"],
  "subOperations": [
    {
      "id": "1A",
      "operation": "fodder_selection",
      "dependencies": [],           // Can do immediately
      "state": { "solved": false }
    },
    {
      "id": "1B",
      "operation": "solve_anagram",
      "dependencies": ["2", "3"],   // Blocked until 2 and 3 solved
      "state": { "solved": false }
    }
  ]
}
```

In this example:
- User CAN identify indicator ("busy") and fodder ("lymph too") immediately
- User CANNOT solve the anagram until wordplays "2" and "3" provide the missing letters
- `blockedHint` explains why: "Fodder only has 8 letters, answer needs 10..."

**Blocked State:**
- When blocked, `blockedHint` is displayed to explain why
- User sees what they've accomplished and what's still needed

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
