# Cryptic Trainer

A training app for learning to solve Times-style cryptic crosswords.

## Current Status

### What's Working
- **Predefined step templates**: 90% generic templates + 10% clue-specific data
- **Server-driven rendering**: Server merges template + clue data, UI just renders
- **Thin client architecture**: All logic on Python server (~100 lines handler)
- **Teaching moments**: Built into templates with variable substitution
- **Solved view with learnings**: Shows all teaching summaries (even when solving early)
- **Fixed 3-section layout**: Clue, answer entry, and action area with consistent button placement
- **Letter checking**: Green/red feedback as you type the answer (configurable via Settings)
- **Progress tracking**: Collapsed learnings show what you've discovered in previous steps
- **Improved header**: Shows publication name, puzzle number, and clue number (e.g., "The Times 2025, clue 1A")
- **Admin system**: Login, clue verification, issue reporting, queue filtering
- **User filtering**: Regular users only see verified clues; admins can filter by unverified/issues

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  STEP_TEMPLATES │  +  │    Clue Data     │  =  │  Runtime Render │
│   (90% generic) │     │ (10% specific)   │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Known Issues
- None currently

---

## Architecture

The system has two components:

| Component | Location | Port | Purpose |
|-----------|----------|------|---------|
| **Python Backend** | `cryptic_trainer_bundle/` | 5001 | Step templates + handler + clue storage |
| **React UI** | Root directory | 3000 | Training interface (Vite dev server) |

**Golden Rule:** The solver derives answers using lexicon lookups and positional logic — no AI guessing.

### Data Storage

Clues are stored server-side in `cryptic_trainer_bundle/clues_db.json` (auto-created).

Puzzles are imported from: `/Users/andrewmackenzie/Desktop/Times_Puzzle_Import/solved`

## Quick Start

```bash
# Terminal 1: Start Python backend
cd cryptic_trainer_bundle
python3 server.py
# Runs on http://localhost:5001

# Terminal 2: Start React UI (from project root)
npm install
npm run dev
# Runs on http://localhost:3000
```

Open http://localhost:3000

### Training API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/training/start` | POST | Start training session |
| `/api/training/input` | POST | Submit user input (tap/text) |
| `/api/training/continue` | POST | Continue through teaching |
| `/api/training/clear` | POST | Clear session (reset progress) |
| `/api/training/learnings` | POST | Get all learnings for early solve |

### Other API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/solve` | POST | Solve a cryptic clue |
| `/clues` | GET | List all saved clues |
| `/clues` | POST | Save/update a clue |
| `/clues/<id>` | DELETE | Delete a clue by ID |
| `/clues/import` | POST | Import puzzle file (validates step-based schema) |
| `/clues/bulk` | POST | Bulk import clues |
| `/clues/clear` | POST | Clear all clues |
| `/import-logs` | GET | List all import logs |
| `/import-logs/<id>` | DELETE | Delete single import log |
| `/import-logs?clearAll=true` | DELETE | Clear all import logs |

## Documentation

| Document | Purpose |
|----------|---------|
| `CLAUDE.md` | **Read first** — AI assistant rules and interactive protocol |
| `DESIGN_SPEC.md` | **Complete system design** — step templates, session state, handler |

### Key Sections in DESIGN_SPEC.md

- **Predefined Step Templates** — `standard_definition`, `anagram_find`, `letter_selection`, `anagram_solve`, `container`, `double_definition`
- **Import Flow** — Step-based schema validation, template availability check, import log storage
- **Complete Clue Example** — PHLEBOTOMY in the new `steps` format
- **Session State** — `step_index`, `phase_index`, `highlights`, `learnings`
- **Handler Implementation** — ~80 lines: `get_render`, `handle_input`, `handle_continue`
- **Verification** — curl commands for manual testing

## Key Files

### React UI (root directory)
- `components/TemplateTrainer.tsx` — Server-driven training with fixed 3-section layout + solved view
- `components/TrainingMode.tsx` — Training session wrapper with queue management
- `components/AdminSetup.tsx` — Admin filter settings page
- `vite.config.ts` — Dev server config with API proxy rules

### Python Backend (`cryptic_trainer_bundle/`)
- `server.py` — HTTP server + training endpoints
- `training_handler.py` — Step templates + handler (~100 lines)
- `cryptic_trainer.py` — Core solver logic
- `clues_db.json` — Clue storage (auto-created)
- `find_issues.py` — Utility to find clues with reported issues

## Testing

### Manual Testing with curl

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

### Test Python solver directly

```bash
cd cryptic_trainer_bundle
python3 cryptic_trainer.py solve --clue "Cross about Scottish inventor being guest announcer" --length 8 --pretty
```

## Step Templates

| Template | Phases | Description |
|----------|--------|-------------|
| `standard_definition` | select → teaching | Find definition at start/end |
| `anagram_find` | indicator → fodder → teaching | Find anagram indicator + fodder |
| `letter_selection` | indicator → fodder → result → teaching | Extract letters from words |
| `anagram_solve` | result → teaching | Solve the anagram |

## Example Clue (PHLEBOTOMY)

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
        {"type": "standard_definition", "expected": {"indices": [0, 1], "text": "Drawing blood"}, "position": "start"},
        {"type": "anagram_find", "indicator": {"indices": [4], "text": "busy"}, "fodder": {"indices": [2, 3], "text": "lymph too"}, "result": "LYMPHTOO"},
        {"type": "letter_selection", "indicator": {"indices": [7, 8], "text": "at last"}, "fodder": {"indices": [5, 6], "text": "conclude job"}, "extractionType": "last letter", "result": "EB"},
        {"type": "anagram_solve", "fodder": "LYMPHTOO + EB", "result": "PHLEBOTOMY", "letterCount": 10, "definition": "drawing blood"}
    ]
}
```

## Deployment

This app runs locally. See [Quick Start](#quick-start) for setup instructions.
