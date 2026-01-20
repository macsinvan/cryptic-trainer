# Claude Code Rules for Cryptic Trainer

**READ THIS FILE AT THE START OF EVERY SESSION**

---

## INTERACTIVE PROTOCOL

This is the mandatory workflow for every interaction. No exceptions.

### Step 1: Summarize Understanding

Before doing anything, summarize your understanding of the user's input in plain English.

### Step 2: Analyze & Plan

| If Bug | If Feature |
|--------|------------|
| Find the root cause | Explain your plan |
| Plain English summary | Plain English summary |

### Step 3: Permissions

| Action | Permission |
|--------|------------|
| Read files | ✅ No permission needed |
| Search codebase | ✅ No permission needed |
| Run tests | ✅ No permission needed |
| **Edit any file** | ❌ **MUST ASK FIRST** |

### Step 4: Ask for Go

Before editing ANY file, you MUST:

1. Provide a plain English summary of what you will change
2. Ask: **"Want me to go ahead?"** (or similar)
3. **WAIT** for user approval

---

## WHAT NOT TO DO

- Do not edit first and explain later
- Do not make multiple file edits without checking in
- Do not assume approval from previous session
- Do not skip the summary step
- **NO HALLUCINATION** - If you lack evidence, say "I don't know"
- **NO REWORKING/REFACTORING** - Only change what user explicitly tells you. Do not rework, do not refactor unless explicitly asked.
- **DO NOT COMPENSATE FOR BAD METADATA** - If issues are due to bad metadata in puzzle files, point this out instead of working around it.

---

## COMPLETION VERIFICATION

- Do NOT self-report "done" without verification
- Run tests to prove completion
- Define success criteria BEFORE starting

**Binary done check:** Can you run a test that proves the task is complete? YES/NO

---

## ARCHITECTURE

The system has two components that must BOTH be running:

| Component | Location | Port | Start Command |
|-----------|----------|------|---------------|
| Python Backend | `cryptic_trainer_bundle/` | 5001 | `python3 server.py` |
| React UI | Root directory | 3000 | `npm run dev` |

**Golden Rule:** The solver derives answers using lexicon lookups and positional logic — no AI guessing.

### Quick Start (two terminals)
```bash
# Terminal 1: Python backend
cd cryptic_trainer_bundle && python3 server.py

# Terminal 2: React UI (from project root)
npm run dev
```

### Data Storage
- Clues stored in `cryptic_trainer_bundle/clues_db.json` (server-side, not browser)
- Each clue has `puzzleNumber`, `publication`, `setter` metadata

---

## DESIGN DOCUMENTATION

| Document | Purpose |
|----------|---------|
| `cryptic_trainer_bundle/DESIGN_SPEC.md` | Python solver design & training workflow |
| `INTERACTIVE_SOLVE_FLOW.md` | Solve UI step-by-step specification |

---

## CORE DESIGN PRINCIPLE: NO CLUE IS LOGICALLY HARD

**CRITICAL**: If you find yourself analyzing hundreds of combinations, EXIT IMMEDIATELY.

Cryptic clues are solved by pattern recognition and positional logic, not brute force.

### Key Insight: Positional Information

Indicators tell you the RELATIONSHIP between adjacent words:
- `[word] conceals` → word BEFORE indicator is the outer container
- `conceals [word]` → word AFTER indicator is the inner content
- Fodder is ALWAYS adjacent to its indicator

### When Stuck

1. STOP trying combinations
2. Ask: "What does the indicator tell me about word positions?"
3. Use that to constrain the search to 1-3 possibilities max
4. If still stuck, ask the user

---

## DEBUGGING THE SOLVER

### Test a clue directly:

```bash
cd cryptic_trainer_bundle
python3 cryptic_trainer.py solve --clue "Clue text here" --length 8 --pretty
```

### Test against scraped puzzles:

```bash
python3 puzzle_tester.py puzzle.json --stop-on-fail
```

### Training workflow:

See `cryptic_trainer_bundle/DESIGN_SPEC.md` for the full Times for the Times workflow.

---

*Last updated: 2026-01-20*
