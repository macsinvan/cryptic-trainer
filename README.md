# Cryptic Trainer

A training app for learning to solve Times-style cryptic crosswords.

## Current Status

### What's Working
- **Thin client architecture**: All logic on Python server, UI just renders and captures input
- **Training flow API**: `/training/action` endpoint handles all training state
- **Dependency system**: Wordplays block/unblock based on `dependencies` array
- **Teaching moments**: `fodder_selection` with `blockedHint` shows learning point + Pass button
- **Golden clue tests**: PHLEBOTOMY clue fully tested (11 test cases pass)

### Recent Changes
1. Added teaching moment for `fodder_selection` with `blockedHint` — shows result read-only, blocked hint, and Pass button
2. Added `'teaching'` phase and `pass_teaching` action to server
3. Updated DESIGN_SPEC.md with teaching moment documentation
4. Updated tests for teaching moment flow

### Known Issues
- `test_phlebotomy_definition_wrong` test fails (pre-existing, unrelated to teaching moment)

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

- **Thin Client Architecture** — UI only renders, server handles all logic
- **UI State Architecture** — Only 4 state variables, everything else derived from `serverState`
- **Training Flow** — Step-by-step training (clue type → definition → wordplays)
- **Wordplay Schema** — Complete metadata structure with dependencies and subOperations
- **Regression Testing** — Golden clue tests for PHLEBOTOMY
- **Test Case Design Guidelines** — Rigorous 3-step format for writing tests

## Key Files

### React UI (root directory)
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
