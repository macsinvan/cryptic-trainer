# Solver Design Rules

The solver uses lexicon lookups and positional logic — no AI guessing.

If analyzing hundreds of combinations, STOP. Cryptic clues are solved by pattern recognition:
- `[word] conceals` → word BEFORE indicator is outer container
- `conceals [word]` → word AFTER indicator is inner content
- Fodder is ALWAYS adjacent to its indicator

Constrain to 1-3 possibilities max. If stuck, ask the user.

## Debug Commands

```bash
cd cryptic_trainer_bundle
python3 cryptic_trainer.py solve --clue "Clue text" --length 8 --pretty
python3 puzzle_tester.py puzzle.json --stop-on-fail
```
