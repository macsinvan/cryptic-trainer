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

---

## DESIGN DOCUMENTATION

| Document | Purpose |
|----------|---------|
| `CLAUDE_RULES.md` | This file — interactive protocol (read first) |
| `parser_updates.md` | Parser architecture & explanation templates |
| `MASTER_APP_SPECIFICATION.md` | Full app specification |
| `INTERACTIVE_SOLVE_FLOW.md` | Solve UI specification |

---

*Last updated: 2026-01-05*
