# Cryptic Trainer (Python Solver)

This folder contains the Python cryptic crossword solver with constraint-based candidate generation.

## Files

### Core
- `cryptic_trainer.py` — CLI tool that tokenizes clues, detects indicators, generates constrained candidates, and outputs proof traces in JSON.

### Documentation
- `DESIGN_SPEC.md` — architecture, workflow, and training process
- `CRYPTIC_TRAINER_DESIGN_SPEC.md` — output schema and definition detection

### Learned Cache (auto-generated)
- `learned_synonyms.json` — validated AI-provided synonyms
- `learned_abbreviations.json` — validated AI-provided abbreviations
- `learned_cache_stats.json` — solve statistics and cache metrics

## CLI Commands

### solve
Generate candidates for a clue:
```bash
python cryptic_trainer.py solve --clue "Musk is old and miserable" --length 5 --pretty
```

With known answer (training mode with battle card output):
```bash
python cryptic_trainer.py solve --clue "Musk is old and miserable" --length 5 --known-answer "ODOUR" --pretty
```

### trace
Show tokenization and indicator detection only:
```bash
python cryptic_trainer.py trace --clue "Pity husband after period of sexual excitement"
```

### stats
View solve statistics:
```bash
python cryptic_trainer.py stats
```

### clear-stats
Reset all statistics:
```bash
python cryptic_trainer.py clear-stats
```

## Battle Card Output

When using `--known-answer`, the solver outputs a battle card showing solve status:

```
═══════════════════════════════════════════════════════════════════
✓ ODOUR (5) [no-AI] <- Musk is old and miserable
───────────────────────────────────────────────────────────────────
Battle Card: [✓] definition  [✓] indicator  [✓] fodder  [✓] answer
Steps:
  1. O <- (2, 3) [unit] (abbrev:old)
  2. DOUR <- (4, 5) [unit] (ai_syn:miserable)
  3. ODOUR <- O, DOUR [charade] (2-part)
Stats: 2/16 passed (12.5%), 1/16 no-AI (6.2%), avg AI/clue: 16.4
═══════════════════════════════════════════════════════════════════
```

## Notes
- The lexicons (`ABBREVS`, `SYNONYMS`, `PHRASES`) are intentionally small and auditable.
- AI-assisted lookups expand synonyms/abbreviations when static tables miss; validated results are cached.
- The `anagram` method is *record-only* and emits placeholders like `ANAG(FODDER)` until you plug in a wordlist.
