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

## EXAMPLE WORKFLOW

```
User: "The definition is showing at the wrong position"

Claude: "My understanding: The definition position is displaying incorrectly
in the UI.

Let me investigate the root cause...

[reads files, searches code]

Root cause: The `definition_position` variable isn't being passed to
computeDerivedFields().

Fix: Add `definition_position` to the variables object in clueParser.ts
line 3448.

Want me to go ahead?"

User: "go"

Claude: [makes the edit]
```

---

## WHAT NOT TO DO

❌ Start editing without explaining what you'll change
❌ Make multiple file edits without checking in
❌ Assume approval from previous session
❌ Skip the summary step
❌ **NO HALLUCINATION** - Do not guess or make things up to fit. If you do not have facts to back something up, say "I do not know"

---

## DESIGN DOCUMENTATION

| Document | Purpose |
|----------|---------|
| `CLAUDE_RULES.md` | This file — interactive protocol (read first) |
| `parser_updates.md` | Parser architecture & explanation templates |
| `MASTER_APP_SPECIFICATION.md` | Full app specification |
| `INTERACTIVE_SOLVE_FLOW.md` | Solve UI specification |

---

## CORE DESIGN PRINCIPLE: NO CLUE IS LOGICALLY HARD

**CRITICAL**: If you find yourself analyzing hundreds of combinations, you are on the wrong track. EXIT IMMEDIATELY.

A human solver cannot compute permutations. Cryptic clues are designed to be solved by pattern recognition and positional logic, not brute force.

### Key Insight: Positional Information

Indicators tell you the RELATIONSHIP between adjacent words:
- `[word] conceals` → word BEFORE indicator is the outer container
- `conceals [word]` → word AFTER indicator is the inner content
- Fodder is ALWAYS adjacent to its indicator

### When Stuck

1. STOP trying combinations
2. Ask: "What does the indicator tell me about word positions?"
3. Use that to constrain the search to 1-3 possibilities max
4. If still stuck, ask the user - they can help

---

## DEBUGGING COMPLEX CLUES (Constrained Combination Search)

When a clue times out or produces too many combinations, use this method:

### Step 1: Extract Known Facts

From the clue, identify:
- **Definition** → tells you the answer
- **Answer length** → the key constraint

### Step 2: Get Synonym Candidates

For each wordplay piece, list the synonym results with their letter counts.

### Step 3: Filter by Letter Count

Only consider combinations where the letter counts sum to the answer length.

**Example: TELEPROMPTER**

```
Clue: "What newsreaders read in French, the expert seducer conceals"
Answer: TELEPROMPTER (12 letters)

Pieces:
- "in French, the" → LE (2)
- "expert" → PRO (3)
- "seducer" → TEMPTER (7)

Check: 2 + 3 + 7 = 12 ✓

Result: Only test this ONE combination instead of thousands.
```

### Step 4: Implement in Parser

The parser should:
1. Calculate answer length from definition match
2. Get all synonym candidates with their lengths
3. Prune combinations that can't possibly sum to answer length
4. Only test remaining (few) combinations

This reduces exponential search to a manageable set.

### Phase 4: Commit

1. Run full regression: `npx tsx test-regression.ts`
2. Commit with count: "feat: Add N clues (X required code changes)"

---

## DEBUGGING CLUE IMPORT PARSING

When a clue fails to parse correctly, follow this process:

### Step 1: Run the Import

```
npx tsx test-clue.ts "Clue text here (N)" "ANSWER"
```

### Step 2: Show Clue and Steps

Display EVERY parsing step. Show raw data, no interpretation.

For each step show:

| Field | Description |
|-------|-------------|
| **Function** | Name of the function called |
| **Inputs** | All parameters passed to the function |
| **Logic** | What the function does (plain English) |
| **Output** | The return value |

**IMPORTANT:**
- Show ALL steps. Do not summarize or skip steps.
- Steps must be real function calls, not debug placeholders like "Starting..."

### Example Output

```
=== STEP 1: findDefinitionFirst ===
Function: findDefinitionFirst
Inputs: { clue: "...", knownAnswer: "CASHCARDS" }
Logic: Search for synonym match between clue words and answer
Output: { definition: "means to get ready", position: "END" }

=== STEP 2: findIndicators ===
Function: findIndicators
Inputs: { cleanClue: "...", lockedWordIndices: [5,6,7,8] }
Logic: Scan for indicator words, skip locked definition indices
Output: [{ text: "mostly", type: "deletion_last" }, ...]
```

### Step 3: Identify Failure Point

Find the step where output diverges from expected behavior.

---

*Last updated: 2026-01-07*
