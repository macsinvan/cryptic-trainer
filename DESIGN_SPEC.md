# Cryptic Trainer — Design Specification

*Last updated: 2026-01-28*

---

## Table of Contents

1. [Architectural Principles](#architectural-principles)
2. [System Architecture](#system-architecture)
3. [UI Application Flow](#ui-application-flow)
4. [Data Storage](#data-storage)
5. [Import Flow](#import-flow)
6. [Training Flow](#training-flow)
7. [Step Templates](#step-templates)
8. [Server API](#server-api)
9. [React Components](#react-components)
10. [File Inventory](#file-inventory)

---

## Architectural Principles

### 1. Predefined Step Templates

Replace complex per-clue metadata with **predefined step templates**. Each template defines the complete flow for a step type (90% generic), with clue data providing only the specific values (10%).

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  STEP_TEMPLATES │  +  │    Clue Data     │  =  │  Runtime Render │
│   (90% generic) │     │ (10% specific)   │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

This means:
- Adding a new clue = adding a simple JSON object with step types + specific values
- Templates define instructions, input modes, highlights, teaching moments
- Clue data provides only: indices, text, results
- Handler merges template + clue data, substitutes variables like `{result}`, `{position}`

### 2. Server-Driven Rendering

**The server tells the UI EXACTLY what to render. The UI has ZERO phase/operation logic.**

Handler logic:
1. Look up template by `step.type`
2. Get current phase from `session.phase_index`
3. Merge template phase with clue-specific data
4. Substitute variables (`{result}`, `{position}`, etc.)
5. Return render object

The UI component (`TemplateTrainer`) renders purely based on `render.*` fields — it never checks `currentPhase`, `operation`, or any other field to decide what to display.

**Why This Architecture:**
- **No sync bugs** — server is single source of truth for rendering
- **No scattered conditionals** — UI doesn't have phase-checking logic
- **Easy to add new step types** — just add a new template
- **Predictable behavior** — what server returns is what user sees

### 3. Thin Client Architecture

**ALL business logic lives on the Python server. The UI is a thin client that only renders and captures input.**

| Layer | Responsibility |
|-------|----------------|
| **Python Server** (port 5001) | ALL logic: import, validate, store, training flow, answer validation, state management, **render instructions** |
| **React UI** (port 3000) | ONLY: render `RenderInstructions`, capture user input, send actions to server |

**The UI does NOT:**
- Parse or validate clue data
- Validate user answers
- Compute what step comes next
- Decide what panel/buttons/highlights to show
- Make any decisions — server decides everything

**The UI ONLY:**
- Renders exactly what `render.*` fields specify
- Sends user actions to the server
- Displays feedback from server responses

### 4. Constraint-First Solving (No AI Guessing)

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
│  server.py          — HTTP server, routing, clue storage    │
│  training_handler.py — Step templates, session management   │
│  cryptic_trainer.py  — Solver engine                        │
│  clues_db.json       — Data storage                         │
└─────────────────────────────────────────────────────────────┘
                              ↓ HTTP
┌─────────────────────────────────────────────────────────────┐
│  REACT UI (localhost:3000)                                  │
├─────────────────────────────────────────────────────────────┤
│  App.tsx           — Main app, navigation, view state       │
│  TrainingMode.tsx  — Training queue management              │
│  TemplateTrainer.tsx — Server-driven training UI            │
│  ManualEntryMode.tsx — Clue entry and puzzle import         │
│  SolverMode.tsx    — AI-assisted solving                    │
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

## UI Application Flow

### Screen Hierarchy

```
HOME
 │
 ├─→ Community Bloggers (external links)
 │
 └─→ PUBLICATION (select a dojo)
      │
      ├─→ TRAINING MODE
      │    └─→ TemplateTrainer (step-by-step guided training)
      │
      ├─→ AI SOLVER
      │    └─→ ClueSolver (scan/paste clues for AI analysis)
      │
      └─→ MANUAL ENTRY
           └─→ Import puzzle files, enter clues manually
```

### View States

| View | Component | Purpose |
|------|-----------|---------|
| `HOME` | `App.tsx` | Landing page with publication tiles and external blog links |
| `PUBLICATION` | `App.tsx` | Publication detail with Training/Solver/Manual Entry buttons |
| `TRAINING` | `TrainingMode.tsx` | Practice queue with TemplateTrainer |
| `SOLVER` | `SolverMode.tsx` | AI-assisted clue solving |
| `MANUAL_ENTRY` | `ManualEntryMode.tsx` | Clue entry and puzzle file import |

### Home Screen

- **Header**: "Cryptic Trainer" title and tagline
- **Database Button**: Opens DataManager (password protected: `dojoMaster`)
- **Community Bloggers**: Links to Big Dave's Blog, FifteenSquared, Times for the Times, Reddit r/crosswords
- **Publication Tiles**: Grid of available dojos (Times, Guardian, etc.) showing setter count and clue count

### Publication Screen

Three action buttons:
1. **Training Mode** — Practice with imported clues
2. **AI Solver** — Scan/paste clues for AI help
3. **Manual Entry** — Type clues or import puzzle files

### Training Mode

1. Loads training queue from server (`GET /clues`)
2. Filters to clues with `steps` array (V3 format)
3. Displays header with publication name, progress (1/N), streak, score, **Solve** button, Skip button
4. Renders `TemplateTrainer` for current clue
5. On complete, advances to next clue or shows completion alert

**Solve Button:** Clicking "Solve" immediately shows the completed view with answer and all learnings. Useful for reviewing clues without working through each step.

### TemplateTrainer (Core Training UI)

**State:**
- `render` — Server response (source of truth)
- `selectedIndices` — Words user has tapped (pre-submit)
- `textInput` — Text user is typing (pre-submit)
- `selectedOption` — Multiple choice selection (pre-submit)
- `feedback` — Error message after wrong answer

**Lifecycle:**
1. On mount: `POST /training/start` with clueId
2. User taps words / enters text / selects option
3. User clicks "Check": `POST /training/input` with value
4. If correct: update render, clear selection
5. If wrong: show feedback message
6. On teaching phase: user clicks "Continue": `POST /training/continue`
7. When `render.complete === true`: call `onComplete()`

**Visual Layout:**
```
┌─────────────────────────────────────────┐
│ ← Back                           [1A]   │
├─────────────────────────────────────────┤
│                                         │
│   Drawing  blood  lymph  too  busy ...  │  ← Clue words (tappable)
│   (10)                                  │
│                                         │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 📖 Intro Card (if present)          │ │  ← Blue background
│ │ Title, explanation, example         │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ FIND DEFINITION                     │ │  ← Instruction panel
│ │ Tap the definition words above...   │ │
│ │                                     │ │
│ │ [Feedback message if wrong]         │ │
│ │                                     │ │
│ │ [Text input if inputMode=text]      │ │
│ │ [Options if inputMode=multi_choice] │ │
│ │                                     │ │
│ │ [ Check ] or [ Continue → ]         │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Highlight Colors:**
| Color | Hex | Role |
|-------|-----|------|
| Green | #22c55e | Definition |
| Orange | #f97316 | Indicator |
| Blue | #3b82f6 | Fodder |
| Purple | #a855f7 | Special |
| Gray | #94a3b8 | Current selection (pre-submit) |

**Letter Checking (Answer Entry):**
| Color | Meaning |
|-------|---------|
| Green background/border | Correct letter |
| Red background/border | Wrong letter |
| Blue background | Letter entered (checking disabled) |

Letter checking is configurable via the Settings panel on the publication page.

### Enumeration Parsing

Enumerations like "(3-4)" represent multi-word answers (3 letters + 4 letters = 7 total).

**Parsing Rule:** Split by non-digits, sum the numbers.
- `"10"` → 10 boxes
- `"3-4"` → 7 boxes (3 + 4)
- `"2,3,4"` → 9 boxes (2 + 3 + 4)

**Implementation:** `parse_enumeration()` helper in `training_handler.py`

### Answer Validation

Answers may contain hyphens (e.g., "LET-DOWN") but user input is compared as letters only.

**Validation Rule:** Strip non-alpha characters before comparing.
- Answer: "LET-DOWN" → "LETDOWN"
- User input: "LETDOWN" → "LETDOWN"
- Match: ✓

This applies to:
- Final answer entry (CrosswordInput)
- Intermediate step results (text input)
- Letter checking colors

---

## Data Storage

### Database File

`cryptic_trainer_bundle/clues_db.json`

```json
{
  "version": 3,
  "training_items": {
    "<clue_id>": TrainingItem,
    ...
  },
  "parser_issues": { ... },
  "import_logs": {
    "<import_id>": ImportLog,
    ...
  },
  "settings": {
    "letterChecking": true
  }
}
```

### TrainingItem Schema

```json
{
  "id": "times-2025-1a",
  "clue": {
    "number": "1A",
    "text": "Drawing blood, lymph too, busy nurses conclude job at last",
    "enumeration": "10",
    "answer": "PHLEBOTOMY",
    "definition": [                    // Optional: definition location(s)
      { "text": "Drawing blood", "position": "start" }
    ]
  },
  "words": ["Drawing", "blood", "lymph", "too", "busy", "nurses", "conclude", "job", "at", "last"],
  "steps": [
    { "type": "standard_definition", ... },
    { "type": "anagram_find", ... },
    ...
  ],
  "metadata": {
    "publisher": "Times",
    "puzzle_number": "2025",
    "setter": "Unknown"
  },
  "publicationId": "times",
  "difficulty": {                      // Optional: clue difficulty rating
    "rating": "hard",                  // "easy" | "medium" | "hard"
    "reasoning": "Complex nested structure with obscure medical term"
  }
}
```

### ImportLog Schema

```json
{
  "id": "1706300000-times-2025",
  "timestamp": 1706300000,
  "publicationId": "times",
  "puzzleFile": "Times_2025.json",
  "puzzleNumber": "2025",
  "summary": {
    "saved": 5,
    "skipped": 2,
    "failed": 3
  },
  "errors": [
    {
      "clueId": "times-2025-1a",
      "clueNumber": "1A",
      "clueText": "Dog lead",
      "errors": ["steps[0] has type \"reversal\" but no template exists"]
    }
  ]
}
```

---

## Import Flow

### Source Puzzle File Format

```json
{
  "metadata": {
    "file": "Times_2025.json",
    "publisher": "Times",
    "puzzle_number": "2025",
    "setter": "Unknown"
  },
  "clues": {
    "times-2025-1a": {
      "clue": {
        "number": "1A",
        "text": "...",
        "enumeration": "10",
        "answer": "PHLEBOTOMY",
        "definition": [...]           // Optional
      },
      "words": ["..."],
      "steps": [...],
      "difficulty": {                 // Optional
        "rating": "hard",
        "reasoning": "..."
      }
    }
  }
}
```

### Import Steps

1. **Receive** puzzle JSON from UI (`POST /clues/import`)
2. **Validate JSON integrity** — valid JSON, has `metadata` and `clues` objects
3. **For each clue**, validate against step-based schema:
   - `clue` — number, text, enumeration, answer (all required)
   - `words` — array of words matching clue text (required)
   - `steps` — non-empty array of step objects (required)
   - Each step must have a `type` that matches an available template
4. **Skip invalid clues** — log actionable errors, continue with remaining clues
5. **Check for duplicates** — skip if clue ID already exists in database
6. **Store valid clues** in flat format with metadata
7. **Create import log** — save to `import_logs` collection
8. **Return response** — success count (saved, skipped, failed) + error list

### Validation Rules

| Field | Requirement |
|-------|-------------|
| `clue.number` | Required string |
| `clue.text` | Required string |
| `clue.enumeration` | Required string |
| `clue.answer` | Required string |
| `words` | Required array, must be non-empty |
| `steps` | Required array, must be non-empty |
| `steps[].type` | Must match an available template |

### Template Availability Check

Each step's `type` must have a corresponding template in `training_handler.STEP_TEMPLATES`. Available templates:
- `clue_type_identify`
- `standard_definition`
- `anagram_find`
- `letter_selection`
- `container`
- `anagram_solve`
- `double_definition`
- `synonym`
- `abbreviation`
- `deletion`
- `charade`
- `hidden`
- `homophone`
- `reversal`

If a step type has no template, the clue is skipped with an actionable error:
```
steps[0] has type "spoonerism" but no template exists. Available: clue_type_identify, standard_definition, anagram_find, letter_selection, container, anagram_solve, double_definition, synonym, abbreviation, deletion, charade, hidden, homophone, reversal
```

### Import Log Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/import-logs` | GET | List all import logs (sorted by timestamp desc) |
| `/import-logs/<id>` | DELETE | Delete single log entry |
| `/import-logs?clearAll=true` | DELETE | Clear all logs |

### Key Principles

- **Skip on failure**: Invalid clues are skipped, not rejected — import continues
- **Actionable errors**: Each error identifies the clue, field, and what to fix
- **No transformation**: Store exactly as received — no field renaming
- **Fix at source**: If validation fails, fix the puzzle file — not import code

---

## Training Flow

### Session State

```python
session = {
    "clue_id": "phlebotomy-1",
    "step_index": -1,     # -1 = clue type identify, 0+ = clue steps
    "phase_index": 0,     # Which phase within current step
    "highlights": []      # Accumulated highlights from correct answers
}
```

### Flow Diagram

```
Session Start (step_index = -1)
    │
    ▼
┌─────────────────────────┐
│ CLUE TYPE IDENTIFICATION│  ← Synthetic step, always first
│ (multiple choice)       │
└────────────┬────────────┘
             │ correct
             ▼
┌─────────────────────────┐
│ STEP 0 (from clue data) │  ← e.g., standard_definition
│ Phase 0: select         │
│ Phase 1: teaching       │
└────────────┬────────────┘
             │ continue
             ▼
┌─────────────────────────┐
│ STEP 1 (from clue data) │  ← e.g., anagram_find
│ Phase 0: indicator      │
│ Phase 1: fodder         │
│ Phase 2: teaching       │
└────────────┬────────────┘
             │ continue
             ▼
         ... more steps ...
             │
             ▼
┌─────────────────────────┐
│ COMPLETE                │
│ render.complete = true  │
└─────────────────────────┘
```

### Clue Type Identification

Every training session starts with a synthetic "clue type identify" step (step_index = -1). This step is not in the clue's `steps` array — it's generated automatically.

The correct answer is derived from the first step type:
- `standard_definition`, `anagram_find`, etc. → "Standard"
- `double_definition` → "Double Definition"

Options presented:
1. **Standard** — Definition at start or end, with wordplay indicators in the rest
2. **Double Definition** — Two separate meanings with no wordplay indicators
3. **Cryptic Definition** — Whole clue is one whimsical description with no obvious wordplay
4. **&lit** — Whole clue both describes AND constructs the answer simultaneously

### Render Object

Every API response includes a `render` object:

```json
{
  "stepIndex": 0,
  "phaseIndex": 0,
  "stepType": "standard_definition",
  "phaseId": "select",
  "inputMode": "tap_words",
  "highlights": [
    {"indices": [0, 1], "color": "GREEN", "role": "definition"}
  ],
  "intro": {
    "title": "Standard",
    "text": "Do you see a definition at the start or end...",
    "example": "Tip: look at the start or end"
  },
  "panel": {
    "title": "FIND DEFINITION",
    "instruction": "Tap the definition words above."
  },
  "button": {"label": "Continue →", "action": "next_step"},
  "expected": [0, 1],
  "options": [...],
  "complete": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `stepIndex` | number | Current step (-1 for clue type, 0+ for clue steps) |
| `phaseIndex` | number | Current phase within step |
| `stepType` | string | Template type (e.g., "anagram_find") |
| `phaseId` | string | Phase identifier (e.g., "indicator", "teaching") |
| `inputMode` | string | `tap_words`, `text`, `multiple_choice`, or `none` |
| `highlights` | array | Accumulated highlights from correct answers |
| `intro` | object? | Intro card (title, text, example) — shown on first phase |
| `panel` | object | Instruction panel (title, instruction) |
| `button` | object? | Button to display (for teaching/complete phases) |
| `expected` | any? | Expected answer (indices for tap, text for typing) |
| `options` | array? | Multiple choice options |
| `complete` | boolean | True when training is finished |
| `answer` | string | Correct answer for "solve anytime" feature |
| `actionPrompt` | string | Short instruction for Section 3 |

### Learnings Accumulation

As the user progresses through training:
1. Each teaching phase has a panel with instruction text
2. When user clicks "Continue", the learning is captured to `session.learnings[]`
3. Special formatting applies for certain step types (anagram_find, double_definition)
4. When training completes (or user solves early), all learnings display in the solved view
5. For early solve, `/training/learnings` generates all learnings without requiring step completion

### Training UX — Fixed 3-Section Layout

**CRITICAL: Sections 1-3 must ALWAYS be the same size and position. No jumpiness as user navigates between steps.**

```
┌─────────────────────────────────────────────────────┐
│ SECTION 1: CLUE (fixed height)                      │
│                                                     │
│ Drawing blood, lymph too, busy nurses conclude      │
│ job at last (10)                                    │
│                                                     │
├─────────────────────────────────────────────────────┤
│ SECTION 2: INPUT AREA (fixed height)                │
│                                                     │
│ ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐          │
│ │   │   │   │   │   │   │   │   │   │   │          │
│ └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘          │
│                                                     │
├─────────────────────────────────────────────────────┤
│ SECTION 3: ACTION REQUIRED + BUTTON (fixed height)  │
│                                                     │
│ Tap the definition words                [ Check ]   │
│                                                     │
└─────────────────────────────────────────────────────┘
│                                                     │
│ SECTION 4: DETAILS (scrollable, below fold)         │
│ Teaching content, intro cards, feedback, etc.       │
└─────────────────────────────────────────────────────┘
```

#### Section 2: Dual-Purpose Input Area

Section 2 serves dual purpose to maintain static layout:
- **Default:** Answer entry boxes (e.g., 10 boxes for PHLEBOTOMY) — always available for "solve anytime"
- **Text input steps:** Temporarily shows intermediate input boxes (e.g., 2 boxes for "EB"), then reverts

This eliminates layout jumping when transitioning between step types.

#### Layout Principles

1. **Sections 1-3 are FIXED** — same size, same position, always visible
2. **Only content changes** — text/boxes update, but layout doesn't shift
3. **Section 4 is below the fold** — details for those who want them
4. **Experienced users** can work entirely in sections 1-3
5. **New users** scroll down for teaching content

---

## Step Templates

Templates are defined in `training_handler.py`. Each template has multiple phases.

### clue_type_identify

**Purpose:** Identify the type of clue before solving.

**Phases:**
1. `choose` — Multiple choice: Standard, Double Definition, Cryptic Definition, &lit

**Clue data:** None (synthetic step generated automatically)

### standard_definition

**Purpose:** Find the definition at start or end of clue.

**Phases:**
1. `select` — Tap the definition words (inputMode: tap_words)
2. `teaching` — Shows where definition was found (inputMode: none)

**Clue data:**
```json
{
  "type": "standard_definition",
  "expected": {"indices": [0, 1], "text": "Drawing blood"},
  "position": "start"
}
```

### anagram_find

**Purpose:** Identify anagram indicator and fodder.

**Phases:**
1. `indicator` — Tap the anagram indicator (inputMode: tap_words)
2. `fodder` — Tap the fodder to be rearranged (inputMode: tap_words)
3. `teaching` — Shows the anagram components (inputMode: none)

**Clue data:**
```json
{
  "type": "anagram_find",
  "indicator": {"indices": [4], "text": "busy"},
  "fodder": {"indices": [2, 3], "text": "lymph too"},
  "result": "LYMPHTOO",
  "letterCount": 8
}
```

**Special behavior:** Teaching message varies based on whether letter count matches enumeration (complete vs partial anagram).

### training.hint Override

Steps can include a `training.hint` field to override the template's panel instruction for specific phases. This provides pedagogically-focused guidance on how to approach the step (rather than just stating the result).

**Supported phases:**
- `letter_selection` → `result` phase
- `container` → `order` phase

**Example:**
```json
{
  "type": "letter_selection",
  "training": {
    "hint": "Look for a phrase that suggests taking the final letters of specific words in the clue."
  }
}
```

### letter_selection

**Purpose:** Extract specific letters from words.

**Phases:**
1. `indicator` — Tap the letter selection indicator (inputMode: tap_words)
2. `fodder` — Tap the source words (inputMode: tap_words)
3. `result` — Type the extracted letters (inputMode: text)
4. `teaching` — Shows the extraction (inputMode: none)

**Clue data:**
```json
{
  "type": "letter_selection",
  "indicator": {"indices": [8, 9], "text": "at last"},
  "fodder": {"indices": [6, 7], "text": "conclude job"},
  "extractionType": "last letter",
  "result": "EB"
}
```

### container

**Purpose:** One thing goes inside another.

**Phases:**
1. `indicator` — Tap the container indicator (inputMode: tap_words)
2. `order` — Multiple choice: what goes inside what (inputMode: multiple_choice)
3. `teaching` — Shows the insertion (inputMode: none)

**Clue data:**
```json
{
  "type": "container",
  "indicator": {"indices": [5], "text": "nurses"},
  "inner": "EB",
  "outer": "LYMPHTOO",
  "options": [
    {"label": "EB goes inside LYMPHTOO", "correct": true},
    {"label": "LYMPHTOO goes inside EB", "correct": false}
  ],
  "result": "LYMPH EB TOO"
}
```

### anagram_solve

**Purpose:** Rearrange gathered letters to find the answer.

**Phases:**
1. `result` — Type the final answer (inputMode: text)
2. `teaching` — Confirms the solution (inputMode: none)

**Clue data:**
```json
{
  "type": "anagram_solve",
  "fodder": "LYMPHEBTOO",
  "result": "PHLEBOTOMY",
  "letterCount": 10,
  "definition": "drawing blood"
}
```

### double_definition

**Purpose:** Find two definitions that both mean the same word.

**Phases:**
1. `first_def` — Tap the first definition (inputMode: tap_words)
2. `second_def` — Tap the second definition (inputMode: tap_words)
3. `solve` — Type the word that matches both (inputMode: text)
4. `teaching` — Confirms both definitions (inputMode: none)

**Clue data:**
```json
{
  "type": "double_definition",
  "definitions": [
    {"indices": [0], "text": "Dog"},
    {"indices": [1], "text": "lead"}
  ],
  "result": "POINTER"
}
```

### synonym

**Purpose:** Find a synonym for a word.

**Phases:**
1. `fodder` — Tap the word to find a synonym for (inputMode: tap_words)
2. `result` — Type the synonym (inputMode: text)
3. `teaching` — Shows the synonym relationship (inputMode: none)

**Clue data:**
```json
{
  "type": "synonym",
  "fodder": {"indices": [0], "text": "Mums"},
  "result": "MOTHERS"
}
```

### abbreviation

**Purpose:** Recognize a standard abbreviation.

**Phases:**
1. `fodder` — Tap the word to abbreviate (inputMode: tap_words)
2. `result` — Type the abbreviation (inputMode: text)
3. `teaching` — Shows the abbreviation (inputMode: none)

**Clue data:**
```json
{
  "type": "abbreviation",
  "fodder": {"indices": [4], "text": "hot"},
  "result": "H"
}
```

### deletion

**Purpose:** Remove letters from a word.

**Phases:**
1. `indicator` — Tap the deletion indicator (inputMode: tap_words)
2. `result` — Type what remains after deletion (inputMode: text)
3. `teaching` — Shows the deletion (inputMode: none)

**Clue data:**
```json
{
  "type": "deletion",
  "indicator": {"indices": [1], "text": "dropping"},
  "fodder": "MOTHERS",
  "deleteTarget": "others",
  "result": "M"
}
```

### charade

**Purpose:** Join components in sequence.

**Phases:**
1. `teaching` — Shows how components join (inputMode: none)

**Clue data:**
```json
{
  "type": "charade",
  "components": ["M", "AS", "H"],
  "result": "MASH"
}
```

### hidden

**Purpose:** Find answer hidden within consecutive letters.

**Phases:**
1. `indicator` — Tap the hidden word indicator (inputMode: tap_words)
2. `fodder` — Tap the words containing the hidden answer (inputMode: tap_words)
3. `teaching` — Shows where answer is hidden (inputMode: none)

**Clue data:**
```json
{
  "type": "hidden",
  "indicator": {"indices": [0], "text": "Some"},
  "fodder": {"indices": [1,2,3,4], "text": "impor tant Ra stafarian"},
  "result": "TANTRA"
}
```

### homophone

**Purpose:** Sound-alike of another word.

**Phases:**
1. `indicator` — Tap the homophone indicator (inputMode: tap_words)
2. `result` — Type the sound-alike word (inputMode: text)
3. `teaching` — Shows the homophone (inputMode: none)

**Clue data:**
```json
{
  "type": "homophone",
  "indicator": {"indices": [0,1], "text": "Delivery of"},
  "fodder": "THROUGH",
  "result": "THREW"
}
```

### reversal

**Purpose:** Reverse letters of a word/phrase.

**Phases:**
1. `indicator` — Tap the reversal indicator (inputMode: tap_words)
2. `fodder` — Tap the words to reverse (inputMode: tap_words)
3. `teaching` — Shows the reversal (inputMode: none)

**Clue data:**
```json
{
  "type": "reversal",
  "indicator": {"indices": [0,1], "text": "Travelling west"},
  "fodder": {"indices": [3,4,5,6,7], "text": "Nav arre I s pot"},
  "result": "TOPSIERRAVAN"
}
```

---

## Server API

### Clue Storage

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clues` | GET | List all training items |
| `/clues` | POST | Save/update a single clue |
| `/clues/<id>` | DELETE | Delete a clue by ID |
| `/clues/import` | POST | Import puzzle file |
| `/clues/bulk` | POST | Bulk import clues |
| `/clues/clear` | POST | Clear all clues |

### Training Flow

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/training/start` | POST | Start training session |
| `/training/input` | POST | Submit user input (tap/text/choice) |
| `/training/continue` | POST | Continue through teaching phase |
| `/training/clear` | POST | Clear session (on exit) — returns `{success, cleared}` |
| `/training/learnings` | POST | Get all learnings for a clue — returns `{success, learnings[]}` |

### Settings

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/settings` | GET | Get current settings |
| `/settings` | POST | Update settings |

### Other

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/solve` | POST | Solve a clue with proof trace |
| `/parser-issues` | GET/POST | Parser issue tracking |
| `/import-logs` | GET | List import logs |
| `/import-logs/<id>` | DELETE | Delete single import log |
| `/import-logs?clearAll=true` | DELETE | Clear all import logs |

### Training API Details

#### Start Session

```bash
curl -X POST localhost:5001/training/start \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1"}'
```

**Response:**
```json
{
  "success": true,
  "render": { ... }
}
```

#### Submit Input

```bash
# Tap words (indices)
curl -X POST localhost:5001/training/input \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1","value":[0,1]}'

# Text input
curl -X POST localhost:5001/training/input \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1","value":"PHLEBOTOMY"}'

# Multiple choice (option index)
curl -X POST localhost:5001/training/input \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1","value":0}'
```

**Response (correct):**
```json
{
  "success": true,
  "correct": true,
  "render": { ... }
}
```

**Response (wrong):**
```json
{
  "success": true,
  "correct": false,
  "message": "Not quite - look at the start or end",
  "render": { ... }
}
```

#### Continue (Teaching Phase)

```bash
curl -X POST localhost:5001/training/continue \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1"}'
```

**Response:**
```json
{
  "success": true,
  "render": { ... }
}
```

---

## React Components

### App.tsx

**Purpose:** Main application shell, routing, view state management.

**State:**
- `viewState` — Current screen (HOME, PUBLICATION, TRAINING, SOLVER, MANUAL_ENTRY)
- `isDbReady` — Database initialization complete
- `isAdminUnlocked` — Admin mode enabled (password: `dojoMaster`)
- `showDataManager` — DataManager modal visible

**Renders:**
- Home screen with publication tiles
- Publication detail with mode buttons
- TrainingMode, SolverMode, ManualEntryMode based on viewState
- DataManager modal
- Password modal for admin access

### TrainingMode.tsx

**Purpose:** Manages training queue and progress.

**Props:**
- `publicationId` — Which publication's clues to load
- `onExit` — Called when user exits training

**State:**
- `queue` — Array of TrainingItems with steps
- `currentIndex` — Current position in queue
- `score`, `streak` — Progress tracking
- `forceSolved` — When true, triggers immediate solved view

**Behavior:**
1. Loads clues from server, filters to V3 format (has `steps`)
2. Renders header with progress, score, skip button
3. Renders TemplateTrainer for current clue
4. Advances on complete, shows alert when queue exhausted

### TemplateTrainer.tsx

**Purpose:** Server-driven training UI component.

**Props:**
- `clueId` — Clue identifier
- `clueText` — Full clue text
- `enumeration` — Letter count (e.g., "10" or "3-4")
- `answer` — Correct answer string (required)
- `clueNumber` — Optional clue number (e.g., "1A")
- `onComplete` — Called when training complete
- `onBack` — Called when user exits
- `forceSolved` — When true, immediately shows solved view with all learnings
- `letterChecking` — Enable green/red letter feedback (default: true)

**State:**
- `render` — Server response (source of truth)
- `selectedIndices` — Tapped word indices (pre-submit)
- `textInput` — Typed text (pre-submit)
- `selectedOption` — Selected choice index (pre-submit)
- `feedback` — Error message after wrong answer

**API Calls:**
- `trainingStart(clueId)` — On mount
- `trainingInput(clueId, value)` — On check button
- `trainingContinue(clueId)` — On continue button
- `trainingLearnings(clueId)` — When forceSolved or early answer solve
- `trainingClear(clueId)` — On exit (allows fresh start next time)

### CrosswordInput.tsx

**Purpose:** Crossword-style letter boxes for answer entry.

**Props:**
- `length` — Number of letter boxes
- `value` — Current input string
- `onChange` — Called when input changes
- `onSubmit` — Called when Enter pressed
- `disabled` — Disable input
- `autoFocus` — Focus first empty box on mount
- `correctAnswer` — If provided, enables letter checking
- `letterChecking` — Show green/red feedback per letter

**Behavior:**
- Arrow keys navigate between boxes
- Backspace moves to previous box when empty
- Paste fills boxes from clipboard
- Letter checking compares against `correctAnswer` (strips non-alpha first)

### services/clueManager.ts

**Purpose:** API client for server communication.

**Functions:**
- `initializeClues()` — Load initial clue data
- `getTrainingQueue(publicationId)` — Get clues for training
- `getClueCount(publicationId)` — Count clues
- `trainingStart(clueId)` — Start training session
- `trainingInput(clueId, value)` — Submit user input
- `trainingContinue(clueId)` — Continue through teaching
- `trainingLearnings(clueId)` — Get all learnings for a clue (early solve)
- `trainingClear(clueId)` — Clear session on exit

---

## File Inventory

### Python Server (cryptic_trainer_bundle/)

| File | Purpose |
|------|---------|
| `server.py` | HTTP server, routing, clue storage, training endpoints |
| `training_handler.py` | Step templates (STEP_TEMPLATES), session management, render generation, `parse_enumeration()` helper |
| `cryptic_trainer.py` | Solver engine |
| `clues_db.json` | Data storage (training_items, import_logs, parser_issues) |

### React UI (root)

| File | Purpose |
|------|---------|
| `App.tsx` | Main app, navigation, view state |
| `components/TrainingMode.tsx` | Training queue management |
| `components/TemplateTrainer.tsx` | Server-driven training UI |
| `components/CrosswordInput.tsx` | Crossword-style letter boxes for input |
| `components/SolverMode.tsx` | AI-assisted solving |
| `components/ManualEntryMode.tsx` | Clue entry, puzzle import |
| `components/DataManager.tsx` | Admin data management |
| `services/clueManager.ts` | API client |
| `types.ts` | TypeScript type definitions |
| `data/index.ts` | Publication/setter data |

### Documentation

| File | Purpose |
|------|---------|
| `DESIGN_SPEC.md` | This document — complete system design |
| `CLAUDE.md` | Claude Code rules and conventions |
| `README.md` | Quick start guide |

---

## Complete Clue Example

### PHLEBOTOMY

**Clue:** "Drawing blood, lymph too, busy nurses conclude job at last" (10)

**Answer:** PHLEBOTOMY

**Training Flow:**

| Step | Type | Action |
|------|------|--------|
| -1 | clue_type_identify | Select "Standard" |
| 0 | standard_definition | Tap "Drawing blood" |
| 1 | anagram_find | Tap indicator "busy", fodder "lymph too" |
| 2 | letter_selection | Tap indicator "at last", fodder "conclude job", type "EB" |
| 3 | container | Tap indicator "nurses", select "EB goes inside LYMPHTOO" |
| 4 | anagram_solve | Type "PHLEBOTOMY" |

**Stored Data:**
```json
{
  "id": "phlebotomy-1",
  "clue": {
    "number": "1A",
    "text": "Drawing blood, lymph too, busy nurses conclude job at last",
    "enumeration": "10",
    "answer": "PHLEBOTOMY"
  },
  "words": ["Drawing", "blood", "lymph", "too", "busy", "nurses", "conclude", "job", "at", "last"],
  "steps": [
    {
      "type": "standard_definition",
      "expected": {"indices": [0, 1], "text": "Drawing blood"},
      "position": "start"
    },
    {
      "type": "anagram_find",
      "indicator": {"indices": [4], "text": "busy"},
      "fodder": {"indices": [2, 3], "text": "lymph too"},
      "result": "LYMPHTOO",
      "letterCount": 8
    },
    {
      "type": "letter_selection",
      "indicator": {"indices": [8, 9], "text": "at last"},
      "fodder": {"indices": [6, 7], "text": "conclude job"},
      "extractionType": "last letter",
      "result": "EB"
    },
    {
      "type": "container",
      "indicator": {"indices": [5], "text": "nurses"},
      "inner": "EB",
      "outer": "LYMPHTOO",
      "options": [
        {"label": "EB goes inside LYMPHTOO", "correct": true},
        {"label": "LYMPHTOO goes inside EB", "correct": false}
      ],
      "result": "LYMPH EB TOO"
    },
    {
      "type": "anagram_solve",
      "fodder": "LYMPHEBTOO",
      "result": "PHLEBOTOMY",
      "letterCount": 10,
      "definition": "drawing blood"
    }
  ]
}
```

### POINTER (Double Definition)

**Clue:** "Dog lead" (7)

**Answer:** POINTER

**Training Flow:**

| Step | Type | Action |
|------|------|--------|
| -1 | clue_type_identify | Select "Double Definition" |
| 0 | double_definition | Tap "Dog", tap "lead", type "POINTER" |

**Stored Data:**
```json
{
  "id": "times-2025-27a",
  "clue": {
    "number": "27A",
    "text": "Dog lead",
    "enumeration": "7",
    "answer": "POINTER"
  },
  "words": ["Dog", "lead"],
  "steps": [
    {
      "type": "double_definition",
      "definitions": [
        {"indices": [0], "text": "Dog"},
        {"indices": [1], "text": "lead"}
      ],
      "result": "POINTER"
    }
  ]
}
```

---

## Verification

### Manual Testing

1. Start servers:
```bash
# Terminal 1
cd cryptic_trainer_bundle && python3 server.py

# Terminal 2
npm run dev
```

2. Test training API:
```bash
# Start session
curl -X POST localhost:5001/training/start \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1"}'

# Submit clue type (index 0 = Standard)
curl -X POST localhost:5001/training/input \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1","value":0}'

# Continue through teaching
curl -X POST localhost:5001/training/continue \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1"}'
```

3. Test in browser:
   - Open http://localhost:3000
   - Select a publication
   - Click "Training Mode"
   - Complete the training flow

### Test Checklist

| Test | Verifies |
|------|----------|
| Session start | Returns step -1 (clue type), phase 0 |
| Clue type select | Correct choice advances to step 0 |
| Definition select | Correct indices advance to teaching |
| Wrong selection | Returns feedback message, stays on phase |
| Teaching continue | Advances to next step |
| Full flow | All steps complete correctly |
| Highlights accumulate | Each correct answer adds to highlights array |
| Complete state | `render.complete = true` at end |
