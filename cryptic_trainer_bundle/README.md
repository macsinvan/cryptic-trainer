# Cryptic Trainer (Reference Implementation)

This folder contains a pragmatic Python implementation based on `crptic_trainer_design.md`.

## Files
- `cryptic_trainer.py` — CLI tool that tokenizes clues, detects indicators, generates constrained candidates, and outputs proof traces in JSON.
- `DESIGN_SPEC.md` — the design spec you uploaded (copied here for convenience).

## Quick start

```bash
python cryptic_trainer.py trace --clue "Pity husband after period of sexual excitement"
python cryptic_trainer.py solve --clue "Pity husband after period of sexual excitement" --length 4 --pretty
```

## Notes
- The lexicons (`ABBREVS`, `SYNONYMS`, `PHRASES`) are intentionally small and auditable.
- The `anagram` method is *record-only* and emits placeholders like `ANAG(FODDER)` until you plug in a wordlist.
