# Cryptic Trainer

A training app for learning to solve Times-style cryptic crosswords.

## Current Status

### What's Working
- **Server-driven rendering**: Server sends explicit `RenderInstructions` — UI has zero phase logic
- **Thin client architecture**: All logic on Python server, UI just renders what server says
- **Training flow API**: `/training/action` endpoint handles all training state
- **Dependency system**: Wordplays block/unblock based on `dependencies` array
- **Teaching moments**: `fodder_selection` with `blockedHint` shows learning point + Continue button
- **Golden clue tests**: PHLEBOTOMY clue fully tested (13 test cases pass)

### Recent Changes
1. **Server-driven rendering** — Server returns `render` object with explicit UI instructions:
   - `panel`: which panel to show (active, teaching, complete, blocked)
   - `primaryText`, `secondaryText`: instruction text
   - `inputMode`: tap_words, enter_text, or none
   - `buttons`: exactly which buttons to display with labels and actions
   - `highlights`: which words to highlight and in what color
2. **InstructionPanel component** — New UI component that renders purely from `render` instructions
3. Teaching moment for `fodder_selection` now works correctly via `render.panel = 'teaching'`
4. All 13 golden clue tests pass

### Known Issues
- None currently

---

## Architecture

The system has two components:

| Component | Location | Port | Purpose |
|-----------|----------|------|---------|
| **Python Backend** | `cryptic_trainer_bundle/` | 5001 | Constraint-first solver + clue storage API |
| **React UI** | Root directory | 3000 | Training interface (Vite dev server) |

**Golden Rule:** The solver derives answers using lexicon lookups and positional logic — no AI guessing.

### Data Storage

Clues are stored server-side in `cryptic_trainer_bundle/clues_db.json` (auto-created).
The Python server provides REST endpoints for CRUD operations on clues.

## Quick Start

```bash
# Terminal 1: Start Python backend (solver + storage API)
cd cryptic_trainer_bundle
python3 server.py
# Runs on http://localhost:5001

# Terminal 2: Start React UI (from project root)
npm install
npm run dev
# Runs on http://localhost:3000
```

Open http://localhost:3000

### Server API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/solve` | POST | Solve a cryptic clue |
| `/clues` | GET | List all saved clues |
| `/clues` | POST | Save/update a clue |
| `/clues/<id>` | DELETE | Delete a clue by ID |
| `/clues/bulk` | POST | Bulk import clues |
| `/clues/clear` | POST | Clear all clues |
| `/parser-issues` | GET/POST | Parser issue tracking |

## Documentation

| Document | Purpose |
|----------|---------|
| `CLAUDE.md` | **Read first** — AI assistant rules and interactive protocol |
| `DESIGN_SPEC.md` | **Complete system design** — architecture, schema, training flow, test guidelines |
| `INTERACTIVE_SOLVE_FLOW.md` | Solve UI step-by-step specification |

### Key Sections in DESIGN_SPEC.md

- **Server-Driven Rendering** — Server sends explicit `RenderInstructions`, UI has zero logic
- **Thin Client Architecture** — UI only renders, server handles all logic
- **UI State Architecture** — Only 4 state variables, everything else derived from `serverState`
- **Training Flow** — Step-by-step training (clue type → definition → wordplays)
- **Wordplay Schema** — Complete metadata structure with dependencies and subOperations
- **Regression Testing** — Golden clue tests for PHLEBOTOMY
- **Test Case Design Guidelines** — Rigorous 3-step format for writing tests

## Key Files

### React UI (root directory)
- `components/training/InstructionPanel.tsx` — Server-driven rendering (renders `RenderInstructions`)
- `components/ClueTrainer.tsx` — Training interface (uses InstructionPanel)
- `services/clueManager.ts` — Clue CRUD via HTTP to Python backend
- `services/puzzleConverter.ts` — Converts puzzle JSON to UI format
- `components/ManualEntryMode.tsx` — Puzzle file import UI
- `vite.config.ts` — Dev server config with API proxy rules

### Python Backend (`cryptic_trainer_bundle/`)
- `server.py` — HTTP server (solver + storage API)
- `cryptic_trainer.py` — Core solver logic
- `clues_db.json` — Clue storage (auto-created)

## Testing

```bash
# Run golden clue regression tests (requires server running)
cd cryptic_trainer_bundle
python3 test_training_flow.py              # Run all tests
python3 test_training_flow.py --verbose    # Detailed output
python3 test_training_flow.py --test 1A    # Run specific test

# Test Python solver directly
python3 cryptic_trainer.py solve --clue "Cross about Scottish inventor being guest announcer" --length 8 --pretty

# Test against scraped puzzles
python3 puzzle_tester.py puzzle.json --stop-on-fail

# Build React UI (from project root)
npm run build
```

### Test Design Guidelines

See `DESIGN_SPEC.md` → "Test Case Design Guidelines" for the rigorous 3-step format:

1. **Step 1: Identify Indicator** — positive/negative cases, state changes, UI result
2. **Step 2: Identify Fodder** — positive/negative cases, state changes, UI result
3. **Step 3: Result** — depends on `metadata.operation`:
   - `fodder_selection`: NO result input, auto-completes
   - Other operations: result input required

**Key principle**: Metadata is source of truth. If test can't be written due to incomplete metadata, fix the metadata.

## Training Workflow

See `cryptic_trainer_bundle/DESIGN_SPEC.md` for the full workflow:

1. Scrape clues from Times for the Times
2. Run cold test against solver
3. Fix gaps (add synonyms, indicators, phrases)
4. Add to regression, repeat

## Importing Puzzles

1. Create a puzzle JSON file (see `cryptic_trainer_bundle/DESIGN_SPEC.md` for format)
2. In the UI, click "Import Puzzle" and select the JSON file
3. Each clue imports with `puzzleNumber`, `publication`, and `setter` metadata

## Deployment

This app runs locally. See [Quick Start](#quick-start) for setup instructions.
