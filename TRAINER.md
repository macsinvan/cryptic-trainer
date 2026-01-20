# Cryptic Trainer - Training Flow Design

## Core Philosophy

The training flow teaches the **process** expert solvers use, not just answers.

From observing expert solvers (Cracking the Cryptic), the paramount skill is **splitting the clue** - finding where the definition ends and wordplay begins.

---

## The Fundamental Rule

> **Every clue has a definition + wordplay, both leading to the same answer. Finding that split is key. The definition is always at the START or END of the clue.**

This is the first thing users learn, and it applies to ~95% of clues.

---

## Clue Types

| Type | Structure | Notes |
|------|-----------|-------|
| **Standard** | Definition at start/end + wordplay | Most common |
| **Double Definition (DD)** | Two definitions, no wordplay | Short clues, no indicators |
| **Triple Definition (TD)** | Three definitions | Rare |
| **Cryptic Definition (CD)** | Entire clue is a cryptic hint | No wordplay, relies on misdirection |
| **&lit** | Entire clue is BOTH definition AND wordplay | Indicated by "!" at end |

---

## Training Flow

### Phase 1: Definition
**Goal:** User identifies the definition

**Prompt:** "Tap the word(s) that form the definition"

**Hint:** "Every clue has a definition + wordplay, both leading to the same answer. Finding that split is key. The definition is always at the START or END of the clue."

**Interaction:**
- User taps words to select (contiguous selection)
- Green highlight when correct
- "Yes, that's the definition" button appears on correct selection
- Subtle escape hatches for special types: "Double Definition", "Cryptic Definition", "&lit"

### Phase 2: Wordplay
**Goal:** User explores how the wordplay builds the answer

**Prompt:** "Now let's explore the wordplay"

**Hint:** "The remaining words contain instructions to build [ANSWER]"

**Interaction:**
- "Show how it works" reveals step-by-step breakdown
- Each step shows: indicator → fodder → result
- Progressive reveal, not all at once

### Phase 3: Solve
**Goal:** User enters the answer

**Prompt:** "Type the answer to complete"

**Interaction:**
- Answer grid visible throughout (not just this phase)
- Auto-check when all cells filled
- "Reveal Answer" escape hatch

### Phase 4: Complete
**Goal:** Summary of what was learned

**Shows:**
- All discovered parts with explanations
- Special clue type note if applicable
- "Next Clue" button

---

## UX Principles

1. **Continuous reveal** - Highlights accumulate, no modal steps
2. **Answer grid always visible** - User can attempt answer at any time
3. **Natural prompts** - Text evolves based on state, not phase labels
4. **Special types as escape hatch** - Subtle buttons, not quiz questions
5. **No step-based feeling** - Flow should feel like guided discovery

---

## Component

`components/ClueTrainer.tsx` - New training UI component

**Test URL:** `http://localhost:3001/?test=trainer`

---

## Data Requirements

From `PatternInstance`:
- `clueText` - The clue text
- `answer` - The answer
- `definitionText` - The definition words
- `definitionPosition` - 'start' | 'end' | 'entire'
- `wordplaySteps` - Array of { indicator, fodder, result, explanation }
- `enumeration` - e.g., "9" or "4,5"
- `clueNumber` - e.g., "12A"

---

## Next Steps

1. Wire up `ClueTrainer` to real `PatternInstance` data
2. Handle special clue types (DD, CD, &lit) with actual detection
3. Add wordplay step highlighting in clue text
4. Progressive difficulty - start with simple clues
5. Track user progress on splitting skill
