---
name: investigation-first
description: Enforces an investigation-first workflow. Claude must investigate and report findings, options, tradeoffs, and risks, and must not write code or implement anything until the user explicitly says GO.
triggers:
  - investigate
  - research
  - analyze
  - explore
  - findings
---

# Investigation-First Workflow

## Rules

- When triggered:
  - Do NOT write code
  - Do NOT implement solutions
  - Do NOT modify files
- Always return:
  - findings
  - options
  - tradeoffs
  - risks
- Wait for an explicit **GO** before:
  - writing code
  - generating artifacts
  - executing plans
- If GO is ambiguous or missing, assume **NO GO**

## Required Output Format

- Summary of findings
- Options considered
- Tradeoffs
- Risks / unknowns
- Recommended next step (awaiting GO)
