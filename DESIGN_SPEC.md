# Cryptic Trainer — Design Specification

*Last updated: 2026-01-25 (Predefined Step Templates)*

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

Handler logic (~50 lines):
1. Look up template by `step.type`
2. Get current phase from `session.phase_index`
3. Merge template phase with clue-specific data
4. Substitute variables (`{result}`, `{position}`, etc.)
5. Return render object

The UI component (`InstructionPanel`) renders purely based on `render.*` fields — it never checks `currentPhase`, `operation`, or any other field to decide what to display.

**Why This Architecture:**
- **No sync bugs** — server is single source of truth for rendering
- **No scattered conditionals** — UI doesn't have 62+ `if (phase === 'X')` checks
- **Easy to add new step types** — just add a new template
- **Predictable behavior** — what server returns is what user sees

### 3. Thin Client Architecture

**ALL business logic lives on the Python server. The UI is a thin client that only renders and captures input.**

| Layer | Responsibility |
|-------|----------------|
| **Python Server** (port 5001) | ALL logic: import, validate, store, training flow, dependency checking, answer validation, state management, **render instructions** |
| **React UI** (port 3000) | ONLY: render `RenderInstructions`, capture user input, send actions to server |

**The UI does NOT:**
- Parse or validate data
- Check dependencies or blocked state
- Validate user answers
- Compute what step comes next
- Decide what panel/buttons/highlights to show
- Make any decisions — server decides everything

**The UI ONLY:**
- Renders exactly what `render.*` fields specify
- Sends user actions to the server
- Displays feedback from server responses

This ensures:
- Single source of truth for ALL logic
- UI can be completely dumb — just a view layer
- Easy debugging — check server state directly
- No divergence between server logic and UI behavior

---

## UI State Architecture (Minimal State)

The UI holds **only 3 pieces of state**. Everything else comes from the server.

### UI State Variables

| State | Type | Purpose |
|-------|------|---------|
| `serverResponse` | `object` | **Source of truth** — full server response including `render` |
| `selectedIndices` | `number[]` | Words user has tapped (pre-submit) |
| `textInput` | `string` | Text user is typing (pre-submit) |

### State Lifecycle

```
User taps word
  → Update selectedIndices (local state)
  → Show selection highlight

User clicks "Check"
  → Call server: POST /api/training/input with {indices}
  → Server validates, updates session, returns new render
  → setServerResponse(response)
  → Clear selectedIndices
  → UI re-renders from serverResponse.render
```

### Highlight Logic

Highlights come from two sources:
1. **Confirmed highlights** — from `serverResponse.render.highlights` (accumulated correct answers)
2. **Current selection** — from local `selectedIndices` (pre-submit)

```typescript
const getWordStyle = (index: number) => {
  // Confirmed highlights from server (green, orange, blue)
  const highlight = serverResponse?.render?.highlights?.find(h => h.indices.includes(index));
  if (highlight) {
    return `bg-${highlight.color.toLowerCase()}-200`;
  }

  // Current selection (pre-submit)
  if (selectedIndices.includes(index)) {
    return 'bg-yellow-100';
  }

  return '';
};
```

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
3. **For each clue**, validate against step-based schema:
   - `clue` — number, text, enumeration, answer (all required)
   - `words` — array of words matching clue text (required)
   - `steps` — non-empty array of step objects (required)
   - Each step must have a `type` that matches an available template
4. **Skip invalid clues** — log actionable errors, continue with remaining clues
5. **Check for duplicates** — skip if clue ID already exists in database
6. **Store valid clues** in flat format with metadata
7. **Return response**:
   - Success count (saved, skipped, failed)
   - Error list with actionable details for each failed clue

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

Each step's `type` must have a corresponding template in `training_handler.STEP_TEMPLATES`. If a step type has no template, the clue is skipped with an actionable error message:

```
Clue "1A": Step 0 has type "reversal" but no template exists for this type.
Available templates: standard_definition, anagram_find, letter_selection, container, anagram_solve, double_definition
```

### UI Display

- Show success count (saved / skipped / failed)
- Show error logs with **copy** button for fixing at source
- Errors are viewable and copyable at end of import

### Key Principles

- **Skip on failure**: Invalid clues are skipped, not rejected — import continues
- **Actionable errors**: Each error identifies the clue, field, and what to fix
- **No transformation**: Store exactly as received — no field renaming
- **Fix at source**: If validation fails, fix the puzzle file — not import code

### Import Log Storage

Import logs are persisted in `clues_db.json` under the `import_logs` collection. Each import attempt creates a log entry with:
- Timestamp and import ID
- Publication and puzzle metadata
- Summary (saved/skipped/failed counts)
- Detailed error list for failed clues

**Log Entry Schema:**
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

**Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/import-logs` | GET | List all import logs (sorted by timestamp desc) |
| `/import-logs/<id>` | DELETE | Delete single log entry |
| `/import-logs?clearAll=true` | DELETE | Clear all logs |

**User workflows:**
- **Review logs**: GET `/import-logs` to see all past imports
- **Action errors**: Use error details to fix source puzzle file, re-import
- **Clear resolved**: DELETE `/import-logs/<id>` after fixing
- **Fresh start**: DELETE `/import-logs?clearAll=true`

### Metadata is READ-ONLY

**The imported clue metadata is READ-ONLY and must NEVER be modified.**

The stored ClueEntry in `clues_db.json` is the source of truth for clue structure:
- Clue text, answer, enumeration
- Definition text and position
- Wordplay structure (indicators, fodder, results, dependencies, blockedHint)
- Initial state (all `false`)

**This data is NEVER mutated by the server.**

### Session-Based Progress Tracking

Training progress is tracked in **session copies**, not in the source metadata:

1. **On session start**: Server creates a deep copy of the ClueEntry for this session
2. **During training**: Server updates `state` fields in the SESSION COPY only
3. **UI rendering**: UI receives the session copy with current progress
4. **Session ends**: Copy is discarded — source metadata remains unchanged

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│  SOURCE (clues_db.json)     │     │  SESSION COPY (in memory)   │
│  - READ ONLY                │────▶│  - Mutable during training  │
│  - state fields all false   │     │  - state updated as user    │
│  - Never modified           │     │    progresses               │
└─────────────────────────────┘     └─────────────────────────────┘
```

This ensures:
- Multiple users can train on same clue simultaneously
- Restarting training always starts fresh
- Source data integrity is preserved

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

#### ClueEntry (Step-Based Schema)
```json
{
  "clue": {
    "number": "string",      // e.g., "1A"
    "text": "string",        // Full clue text
    "enumeration": "string", // e.g., "10"
    "answer": "string"       // e.g., "PHLEBOTOMY"
  },
  "words": ["Drawing", "blood", ...],  // Clue split into words
  "steps": [                           // Training steps (see Step Templates)
    {
      "type": "standard_definition",
      "expected": {"indices": [0, 1], "text": "Drawing blood"},
      "position": "start"
    },
    // ... more steps
  ]
}
```

#### Stored Format (in clues_db.json)
```json
{
  "id": "times-2025-1a",           // Clue ID from source file
  "clue": { ... },                  // As above
  "words": [ ... ],                 // As above
  "steps": [ ... ],                 // As above
  "metadata": {                     // Puzzle metadata
    "publisher": "Times",
    "puzzle_number": "2025",
    "setter": "Unknown"
  },
  "publicationId": "times"
}
```

---

## Training Flow: Predefined Step Templates

### Overview

Replace complex per-clue metadata with **predefined step templates**. Each template defines the complete flow for a step type (90% generic), with clue data providing only the specific values (10%).

### Step Templates

#### standard_definition

```python
"standard_definition": {
    "phases": [
        {
            "id": "select",
            "intro": {
                "title": "Standard",
                "text": "Do you see a definition at the start or end, with wordplay indicators in the rest?",
                "example": "\"Crazy golf equipment (7)\" → PUTTERS (anagram of \"putters\")"
            },
            "panel": {
                "title": "FIND DEFINITION",
                "instruction": "Tap the definition words above. It's always at the **start** or **end** of the clue."
            },
            "inputMode": "tap_words",
            "onCorrect": {"highlight": {"color": "GREEN", "role": "definition"}},
            "onWrong": {"message": "Not quite - look at the start or end"}
        },
        {
            "id": "teaching",
            "panel": {
                "title": "🎓 Definition Found",
                "instruction": "The definition is always at the start or end — never buried in the middle. Here you found '{result}' at the {position}."
            },
            "inputMode": "none",
            "button": {"label": "Continue →", "action": "next_step"}
        }
    ]
}
```

**Clue data:**
```json
{
    "type": "standard_definition",
    "expected": {"indices": [0, 1], "text": "Drawing blood"},
    "position": "start"
}
```

#### anagram_find

```python
"anagram_find": {
    "phases": [
        {
            "id": "indicator",
            "intro": {
                "title": "Anagram",
                "text": "An anagram indicator signals that letters need rearranging.",
                "example": "\"crazy\", \"wild\", \"broken\", \"mixed\" all suggest anagrams"
            },
            "panel": {
                "title": "FIND INDICATOR",
                "instruction": "Tap the anagram indicator - a word suggesting disorder or change."
            },
            "inputMode": "tap_words",
            "onCorrect": {"highlight": {"color": "ORANGE", "role": "indicator"}},
            "onWrong": {"message": "Look for a word suggesting rearrangement"}
        },
        {
            "id": "fodder",
            "panel": {
                "title": "FIND FODDER",
                "instruction": "Tap the fodder - the letters to be rearranged. It's adjacent to the indicator."
            },
            "inputMode": "tap_words",
            "onCorrect": {"highlight": {"color": "BLUE", "role": "fodder"}},
            "onWrong": {"message": "Look for words adjacent to the indicator"}
        },
        {
            "id": "teaching",
            "panel": {
                "title": "🎓 Anagram Identified",
                "instruction": "'{indicator}' tells us to rearrange '{fodder}' → {result} ({letterCount} letters)"
            },
            "inputMode": "none",
            "button": {"label": "Continue →", "action": "next_step"}
        }
    ]
}
```

**Clue data:**
```json
{
    "type": "anagram_find",
    "indicator": {"indices": [4], "text": "busy"},
    "fodder": {"indices": [2, 3], "text": "lymph too"},
    "result": "LYMPHTOO"
}
```

#### letter_selection

```python
"letter_selection": {
    "phases": [
        {
            "id": "indicator",
            "intro": {
                "title": "Letter Selection",
                "text": "Some indicators tell you to extract specific letters from words.",
                "example": "\"at last\" = final letters, \"initially\" = first letters"
            },
            "panel": {
                "title": "FIND INDICATOR",
                "instruction": "Tap the letter selection indicator."
            },
            "inputMode": "tap_words",
            "onCorrect": {"highlight": {"color": "ORANGE", "role": "indicator"}},
            "onWrong": {"message": "Look for a phrase about which letters to take"}
        },
        {
            "id": "fodder",
            "panel": {
                "title": "FIND SOURCE WORDS",
                "instruction": "Tap the words we extract letters from."
            },
            "inputMode": "tap_words",
            "onCorrect": {"highlight": {"color": "BLUE", "role": "fodder"}},
            "onWrong": {"message": "Which words contribute letters?"}
        },
        {
            "id": "result",
            "panel": {
                "title": "EXTRACT LETTERS",
                "instruction": "Type the extracted letters from '{fodder}'."
            },
            "inputMode": "text",
            "onCorrect": {"message": "Correct!"},
            "onWrong": {"message": "Take the {extractionType} of each word"}
        },
        {
            "id": "teaching",
            "panel": {
                "title": "🎓 Letters Extracted",
                "instruction": "'{indicator}' tells us to take {extractionType}s from '{fodder}' → {result}"
            },
            "inputMode": "none",
            "button": {"label": "Continue →", "action": "next_step"}
        }
    ]
}
```

**Clue data:**
```json
{
    "type": "letter_selection",
    "indicator": {"indices": [7, 8], "text": "at last"},
    "fodder": {"indices": [5, 6], "text": "conclude job"},
    "extractionType": "last letter",
    "result": "EB"
}
```

#### anagram_solve

```python
"anagram_solve": {
    "phases": [
        {
            "id": "result",
            "intro": {
                "title": "Solve the Anagram",
                "text": "You've gathered all the letters. Now rearrange them to find the answer."
            },
            "panel": {
                "title": "SOLVE",
                "instruction": "Rearrange {fodder} to form a {letterCount}-letter word meaning '{definition}'."
            },
            "inputMode": "text",
            "onCorrect": {"message": "Correct!"},
            "onWrong": {"message": "Try rearranging the letters differently"}
        },
        {
            "id": "teaching",
            "panel": {
                "title": "🎓 Solved!",
                "instruction": "{fodder} rearranges to {result} - {definition}."
            },
            "inputMode": "none",
            "button": {"label": "Complete →", "action": "complete"}
        }
    ]
}
```

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

#### container

```python
"container": {
    "phases": [
        {
            "id": "indicator",
            "intro": {
                "title": "Container",
                "text": "A container indicator tells you one thing goes inside another.",
                "example": "\"nurses\", \"holds\", \"contains\", \"swallows\" all suggest insertion"
            },
            "panel": {
                "title": "FIND INDICATOR",
                "instruction": "Tap the container indicator - a word suggesting something goes inside something else."
            },
            "inputMode": "tap_words",
            "onCorrect": {"highlight": {"color": "ORANGE", "role": "indicator"}},
            "onWrong": {"message": "Look for a word meaning 'holds' or 'contains'"}
        },
        {
            "id": "order",
            "panel": {
                "title": "WHAT GOES WHERE?",
                "instruction": "Which element goes inside which?"
            },
            "inputMode": "multiple_choice",
            "onCorrect": {"message": "Correct!"},
            "onWrong": {"message": "Think about what '{indicator}' means - who is doing the holding?"}
        },
        {
            "id": "result",
            "panel": {
                "title": "SHOW INSERTION",
                "instruction": "Type the result of inserting {inner} into {outer}."
            },
            "inputMode": "text",
            "onCorrect": {"message": "Correct!"},
            "onWrong": {"message": "Insert {inner} into {outer}"}
        },
        {
            "id": "teaching",
            "panel": {
                "title": "Container Complete",
                "instruction": "'{indicator}' tells us {inner} goes inside {outer} → {result}"
            },
            "inputMode": "none",
            "button": {"label": "Continue →", "action": "next_step"}
        }
    ]
}
```

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

---

## Complete Clue Example (PHLEBOTOMY)

```json
{
    "id": "phlebotomy-1",
    "clue": {
        "number": "1A",
        "text": "Drawing blood, lymph too, busy nurses conclude job at last",
        "enumeration": "10",
        "answer": "PHLEBOTOMY"
    },
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

---

## Session State

```python
session = {
    "clue_id": "phlebotomy-1",
    "step_index": 0,      # Which step (0-3)
    "phase_index": 0,     # Which phase within step
    "highlights": []      # Accumulated highlights
}
```

---

## Handler Implementation

The handler is ~80 lines total:

```python
STEP_TEMPLATES = { ... }  # ~60 lines

def get_render(session, clue):
    step = clue["steps"][session["step_index"]]
    template = STEP_TEMPLATES[step["type"]]
    phase = template["phases"][session["phase_index"]]

    # Merge template with clue data, substitute variables
    render = substitute_variables(phase, step, session)
    render["highlights"] = session["highlights"]
    return render

def handle_input(session, clue, value):
    step = clue["steps"][session["step_index"]]
    template = STEP_TEMPLATES[step["type"]]
    phase = template["phases"][session["phase_index"]]

    if check_answer(phase, step, value):
        # Add highlight if applicable
        if "onCorrect" in phase and "highlight" in phase["onCorrect"]:
            session["highlights"].append({
                "indices": get_expected_indices(phase, step),
                "color": phase["onCorrect"]["highlight"]["color"]
            })
        # Advance phase
        session["phase_index"] += 1
        if session["phase_index"] >= len(template["phases"]):
            session["step_index"] += 1
            session["phase_index"] = 0

    return get_render(session, clue)

def handle_continue(session, clue):
    # Button pressed - advance to next phase/step
    step = clue["steps"][session["step_index"]]
    template = STEP_TEMPLATES[step["type"]]

    session["phase_index"] += 1
    if session["phase_index"] >= len(template["phases"]):
        session["step_index"] += 1
        session["phase_index"] = 0

    if session["step_index"] >= len(clue["steps"]):
        return {"complete": True}

    return get_render(session, clue)
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `cryptic_trainer_bundle/training_handler.py` | New file: templates + handler (~100 lines) |
| `cryptic_trainer_bundle/server.py` | Replace training endpoints to use new handler |
| `cryptic_trainer_bundle/clues_db.json` | Convert PHLEBOTOMY to new steps format |

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
| `/api/training/start` | POST | Start training session |
| `/api/training/input` | POST | Submit user input (tap/text) |
| `/api/training/continue` | POST | Continue through teaching |

### Training Flow API

#### Start Session

```bash
curl -X POST localhost:5001/api/training/start \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1"}'
```

**Response:**
```json
{
  "success": true,
  "session": {
    "clue_id": "phlebotomy-1",
    "step_index": 0,
    "phase_index": 0,
    "highlights": []
  },
  "render": { ... }
}
```

#### Submit Input

```bash
curl -X POST localhost:5001/api/training/input \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1","value":{"indices":[0,1]}}'
```

**Response:**
```json
{
  "success": true,
  "correct": true,
  "session": { ... },
  "render": { ... }
}
```

#### Continue (Teaching)

```bash
curl -X POST localhost:5001/api/training/continue \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1"}'
```

**Response:**
```json
{
  "success": true,
  "session": { ... },
  "render": { ... },
  "complete": false
}
```

### Render Object

Every response includes a `render` object built from template + clue data:

```json
{
  "render": {
    "intro": {
      "title": "Anagram",
      "text": "An anagram indicator signals that letters need rearranging.",
      "example": "\"crazy\", \"wild\", \"broken\", \"mixed\" all suggest anagrams"
    },
    "panel": {
      "title": "FIND INDICATOR",
      "instruction": "Tap the anagram indicator - a word suggesting disorder or change."
    },
    "inputMode": "tap_words",
    "button": {"label": "Continue →", "action": "next_step"},
    "highlights": [
      {"indices": [0, 1], "color": "GREEN"},
      {"indices": [4], "color": "ORANGE"}
    ],
    "feedback": {"message": "Not quite - look at the start or end"}
  }
}
```

**Key Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `intro` | object? | Shown once at step start (title, text, example) |
| `panel.title` | string | Phase title (e.g., "FIND INDICATOR") |
| `panel.instruction` | string | What user should do (with variable substitution) |
| `inputMode` | string | `tap_words`, `text`, or `none` |
| `button` | object? | Button to display (label, action) |
| `highlights` | array | Accumulated highlights from session |
| `feedback` | object? | Error message on wrong answer |

### Storage Format

Clues stored in `cryptic_trainer_bundle/clues_db.json`:

```json
{
  "version": 3,
  "clues": {
    "phlebotomy-1": {
      "id": "phlebotomy-1",
      "clue": { "number": "1A", "text": "...", "enumeration": "10", "answer": "PHLEBOTOMY" },
      "steps": [ ... ]
    }
  }
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

1. **clue** has number, text, enumeration, answer
2. **steps** array is non-empty
3. Each step has a valid **type** matching a template
4. Each step has required fields for its type (indices, text, result, etc.)
5. **indices** arrays contain valid word positions for the clue text

---

## File Inventory

### Core Files
- `cryptic_trainer_bundle/server.py` — HTTP server + clue storage
- `cryptic_trainer_bundle/training_handler.py` — Step templates + handler (~100 lines)
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
| **Step Templates** | Predefined flows for each step type (90% generic) |
| **Clue Data** | Specific values for a clue (10% — indices, text, results) |
| **Session State** | Tracks step_index, phase_index, highlights |
| **Handler** | Merges template + clue data, substitutes variables |
| **Thin Client** | UI sends raw input to server, server returns render object |

---

## Verification

### Manual Testing

1. Start server:
```bash
cd cryptic_trainer_bundle && python3 server.py
```

2. Test via curl:
```bash
# Start session
curl -X POST localhost:5001/api/training/start \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1"}'

# Submit definition selection
curl -X POST localhost:5001/api/training/input \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1","value":{"indices":[0,1]}}'

# Continue through teaching
curl -X POST localhost:5001/api/training/continue \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1"}'
```

3. Start UI:
```bash
npm run dev
```

4. Complete full PHLEBOTOMY training flow in browser

### Golden Clue: PHLEBOTOMY

**Clue:** "Drawing blood, lymph too, busy nurses conclude job at last" (10)

**Steps:**
1. `standard_definition` — Find "Drawing blood" at start
2. `anagram_find` — Find indicator "busy", fodder "lymph too"
3. `letter_selection` — Find indicator "at last", fodder "conclude job", enter "EB"
4. `anagram_solve` — Solve "LYMPHTOO + EB" → PHLEBOTOMY

### Test Coverage

| Test | Verifies |
|------|----------|
| Session start | Returns step 0, phase 0 |
| Definition select | Correct indices advance to teaching |
| Wrong selection | Returns feedback message, stays on phase |
| Teaching continue | Advances to next step |
| Full flow | All 4 steps complete correctly |
| Highlights accumulate | Each correct answer adds to highlights array |
