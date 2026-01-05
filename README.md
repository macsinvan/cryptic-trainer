# Cryptic Trainer

A training app for learning to solve Times-style cryptic crosswords.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Documentation

| Document | Purpose |
|----------|---------|
| `CLAUDE_RULES.md` | Interactive protocol for AI assistance |
| `MASTER_APP_SPECIFICATION.md` | Full application specification |
| `parser_updates.md` | Parser architecture & explanation templates |
| `INTERACTIVE_SOLVE_FLOW.md` | Solve UI step-by-step specification |

## Architecture

**Golden Rule:** All processing happens at import time. The solve session never calls AI.

- **Parser** (`services/clueParser.ts`) - Deterministic clue parsing
- **UI** (`components/`) - Dumb rendering, reads pre-computed values
- **Data** (`data/synonymDictionary.ts`) - 350+ synonym mappings

## Testing

```bash
npx tsx test-regression.ts     # Run import regression tests
npx tsx test-clue-import.ts    # Test single clue parser output
npx tsc --noEmit               # Type check
```

## Supported Pattern Types

- Anagram, Reversal, Hidden Word
- Charade, Double Definition
- Container, Deletion
- Acrostic, Letter Movement
- Homophone, Substitution
