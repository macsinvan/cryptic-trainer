# Cryptic Trainer — Master Application Specification

*Last updated: 2026-01-08*

---

## 1. Architecture Overview

The system has two components:

| Component | Location | Purpose |
|-----------|----------|---------|
| **Python Solver** | `cryptic_trainer_bundle/` | Constraint-first solver with traceable proofs |
| **React UI** | `relaxed-lamarr/` | Training interface that displays solver output |

**Golden Rule:** The solver derives answers using lexicon lookups and positional logic — no AI guessing.

```
┌─────────────────────────────────────────────────────────────┐
│  PYTHON SOLVER (localhost:5001)                             │
│  cryptic_trainer_bundle/                                    │
├─────────────────────────────────────────────────────────────┤
│  • Tokenizes clue, detects indicators                       │
│  • Expands via lexicons (SYNONYMS, ABBREVS, PHRASES)        │
│  • Generates candidates with proof traces                   │
│  • Validates definition-answer relationship                 │
│  • Returns patternData for UI                               │
└─────────────────────────────────────────────────────────────┘
                              ↓ HTTP POST /solve
┌─────────────────────────────────────────────────────────────┐
│  REACT UI (localhost:3000)                                  │
│  relaxed-lamarr/                                            │
├─────────────────────────────────────────────────────────────┤
│  • ManualEntryMode: Import clues, display solver results    │
│  • ClueSolver: Step-by-step training interface              │
│  • DataManager: Browse saved clues                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Python Solver

Full documentation: `cryptic_trainer_bundle/DESIGN_SPEC.md`

### Supported Operations
- **Charade**: A + B, A + B + C
- **Charade with Reversal**: ROOD → DOOR + BELL = DOORBELL
- **Container**: Insert inner into outer
- **Reversal**: Reverse a string
- **Anagram**: Record fodder (constrained matching)
- **Modifiers**: First letter, last letter, inner letters

### Lexicon System
- `ABBREVS`: golf → G, husband → H
- `SYNONYMS`: cross → ROOD, inventor → BELL
- `PHRASES`: guest announcer → DOORBELL

### Key Functions
- `solve(clue, length, known_answer)` → candidates with proof traces
- `validate_definition(def_text, answer)` → validates definition-answer relationship
- `score_candidate(answer, steps, method, tokens)` → ranks candidates

---

## 3. React UI

### Technology Stack
- **Vite** - Build tool
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling

### Key Components

| Component | Purpose |
|-----------|---------|
| `ManualEntryMode.tsx` | Import clues, call Python solver, display results |
| `ClueSolver.tsx` | Step-by-step training engine |
| `DataManager.tsx` | Browse saved clues, export/import |
| `TrainingMode.tsx` | Practice mode |

### Services

| Service | Purpose |
|---------|---------|
| `pythonSolverService.ts` | HTTP client for Python solver |
| `clueManager.ts` | IndexedDB persistence |

---

## 4. Solve Flow

```
User pastes clue + answer
        ↓
ManualEntryMode calls Python solver via HTTP
        ↓
Solver returns patternData:
  - answer, definition, wordplaySteps
  - isComplete (true if definition validated)
        ↓
UI displays structured breakdown
        ↓
User saves to IndexedDB for training
```

---

## 5. Training Workflow

See `cryptic_trainer_bundle/DESIGN_SPEC.md` for full details.

1. Scrape clues from Times for the Times
2. Run cold test with `puzzle_tester.py`
3. Fix gaps (add to lexicons)
4. Add passing clues to regression
5. Repeat

---

## 6. Documentation

| Document | Purpose |
|----------|---------|
| `cryptic_trainer_bundle/DESIGN_SPEC.md` | Python solver design & training workflow |
| `CLAUDE.md` | Interactive protocol for AI assistance |
| `INTERACTIVE_SOLVE_FLOW.md` | Solve UI step-by-step specification |

---

## 7. Quick Start

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
