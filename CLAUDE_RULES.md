# Claude Code Rules for Cryptic Trainer

**READ THIS FILE AT THE START OF EVERY SESSION**

---

## GOLDEN RULE

**YOU CANNOT EDIT ANY FILE WITHOUT APPROVAL.**

This is enforced by a two-phase commit system. Attempts to edit without approval will be **HARD BLOCKED** by the system. No exceptions. No workarounds.

---

## TWO-PHASE COMMIT WORKFLOW

### Phase 1: Propose (MANDATORY)

Before ANY edit, you MUST:

1. **Write a proposal** to `.claude/pending_proposal.md` containing:
   - File(s) to be modified
   - Current behavior
   - New behavior
   - Why the change is needed
   - What could break

2. **Ask for approval** in conversation
3. **STOP and wait** - Do not attempt any edit

### Phase 2: Execute (ONLY AFTER APPROVAL)

1. User says "approved" (or similar)
2. System creates single-use approval token
3. You may now make the approved edit
4. Token is consumed - next edit requires new proposal

### What Happens If You Skip This

- Edit attempt → **HARD BLOCK**
- No dialog, no asking - just blocked
- You must start over with Phase 1

---

## PROPOSAL TEMPLATE

Write to `.claude/pending_proposal.md`:

```markdown
## Proposal: [Brief Title]

### Files to Modify
- `path/to/file.ts` - [what changes]

### Current Behavior
[What it does now]

### New Behavior
[What it will do after]

### Why Needed
[Justification]

### Risk Assessment
[What could break, LOW/MEDIUM/HIGH]
```

---

## PROTECTED FILES (Extra Caution)

These files are critical. Be especially careful:
- `services/clueManager.ts` - Data persistence
- `services/clueParser.ts` - Core parsing logic
- `services/freeformParser.ts` - Import parsing
- `types.ts` - Type definitions
- `data/seedClues.ts` - Seed data

---

## ALLOWED WITHOUT PROPOSAL

- Reading files
- Running tests/builds
- Searching/exploring codebase
- Answering questions
- Writing to `.claude/pending_proposal.md` (this is the proposal itself)

---

## REMEMBER

1. No proposal file → BLOCKED
2. Proposal not approved → BLOCKED
3. Token expired (5 min) → BLOCKED
4. Token already used → BLOCKED
5. Each edit needs fresh approval

**There are no exceptions. The system enforces this.**

---

*Last updated: 2026-01-03*
