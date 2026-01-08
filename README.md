# Cryptic Trainer

A training app for learning to solve Times-style cryptic crosswords.

## Architecture

The system has two components:

1. **Python Solver** (`cryptic_trainer_bundle/`) - Constraint-first solver with traceable proofs
2. **React UI** (`relaxed-lamarr/`) - Training interface that displays solver output

**Golden Rule:** The solver derives answers using lexicon lookups and positional logic — no AI guessing.

## Quick Start

```bash
# Terminal 1: Start Python solver
cd cryptic_trainer_bundle
python3 server.py

# Terminal 2: Start React UI
cd relaxed-lamarr
npm install
npm run dev
```

Open http://localhost:3000

## Documentation

| Document | Purpose |
|----------|---------|
| `cryptic_trainer_bundle/DESIGN_SPEC.md` | Python solver design & training workflow |
| `CLAUDE.md` | Interactive protocol for AI assistance |
| `INTERACTIVE_SOLVE_FLOW.md` | Solve UI step-by-step specification |

## Testing

```bash
# Test Python solver
cd cryptic_trainer_bundle
python3 cryptic_trainer.py solve --clue "Cross about Scottish inventor being guest announcer" --length 8 --pretty

# Test against scraped puzzles
python3 puzzle_tester.py puzzle.json --stop-on-fail

# Build React UI
cd relaxed-lamarr
npm run build
```

## Training Workflow

See `cryptic_trainer_bundle/DESIGN_SPEC.md` for the full workflow:

1. Scrape clues from Times for the Times
2. Run cold test against solver
3. Fix gaps (add synonyms, indicators, phrases)
4. Add to regression, repeat
