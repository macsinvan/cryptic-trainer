# Cryptic Trainer

A training app for learning to solve Times-style cryptic crosswords.

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
| `cryptic_trainer_bundle/DESIGN_SPEC.md` | Python solver design & training workflow |
| `INTERACTIVE_SOLVE_FLOW.md` | Solve UI step-by-step specification |

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
# Test Python solver
cd cryptic_trainer_bundle
python3 cryptic_trainer.py solve --clue "Cross about Scottish inventor being guest announcer" --length 8 --pretty

# Test against scraped puzzles
python3 puzzle_tester.py puzzle.json --stop-on-fail

# Build React UI (from project root)
npm run build
```

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

**Production URL:** https://www.cryptic-trainer.com

The React UI is deployed via Vercel. The Python backend runs separately.

```bash
# Build for production
npm run build
```

Vercel auto-deploys from the `main` branch.
