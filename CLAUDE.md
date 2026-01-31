# Cryptic Trainer

IMPORTANT: Always work in `/Users/andrewmackenzie/Desktop/cryptic-trainer/` on the `main` branch. This is a one-person project — no feature branches or worktrees.

IMPORTANT: After editing any `.py` file, YOU MUST restart the server:
```bash
pkill -f "python3 server.py" 2>/dev/null; sleep 1; cd /Users/andrewmackenzie/Desktop/cryptic-trainer/cryptic_trainer_bundle && python3 server.py &
```

IMPORTANT: Ask before editing files. Summarize changes, then wait for "GO".

IMPORTANT: Do not refactor or rework code unless explicitly asked.

IMPORTANT: If bad metadata causes issues, say so instead of working around it.

## Architecture

- Python backend: `cryptic_trainer_bundle/` on port 5001
- React UI: root directory on port 3000
- Clues DB: `cryptic_trainer_bundle/clues_db.json`
- Import folder: `/Users/andrewmackenzie/Desktop/Times_Puzzle_Import/solved/`

## Key Files

- @DESIGN_SPEC.md — Full system design and schema
