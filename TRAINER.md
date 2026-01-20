# Cryptic Trainer - Training Flow Design

## Core Philosophy

The training flow teaches the **process** expert solvers use, not just answers.

From observing expert solvers (Cracking the Cryptic), the paramount skill is **splitting the clue** - finding where the definition ends and wordplay begins.

---

## The Fundamental Rule

> **Every clue has a definition + wordplay, both leading to the same answer. Finding that split is key to solving every clue. It is usually easier to spot the definition as it is always at the START or END of the clue.**

This is the first thing users learn, and it applies to ~95% of clues.

---

## Wordplay Solving Strategy

> **Solve independent wordplay steps first, then dependent steps.**

### Classification

| Type | Definition | Example |
|------|------------|---------|
| **Independent** | Fodder comes directly from the clue text | "busy" indicator with "lymph too" fodder → anagram |
| **Dependent** | Fodder uses results from other steps | "nurses" indicator with assembled pieces as fodder |

### Why Independent First?

1. **They can actually be solved** - All information is in the clue text
2. **Builds understanding progressively** - User sees pieces form before assembly
3. **Dependent steps make no sense otherwise** - Can't nurse something that doesn't exist yet
4. **Mirrors expert solving** - Real solvers identify solvable pieces first

### Example: PHLEBOTOMY

Clue: "Busy lymph too at last to conclude job nurses blood-letting"

| Order | Step | Indicator | Fodder | Result | Type |
|-------|------|-----------|--------|--------|------|
| 1 | Anagram | "busy" | "lymph too" | PHLOTOMY | Independent |
| 2 | Last letters | "at last" | "concludE joB" | EB | Independent |
| 3 | Container | "nurses" | PHLOTOMY + EB | PHLEBOTOMY | Dependent |

The trainer guides users through steps 1 and 2 first (in either order), then step 3.

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

### Phase 0: Choose
**Goal:** User identifies what type of clue this is

**Prompt:** "What type of clue is this?"

**Options (all visible, user must pick one):**
- **Standard** - Definition + wordplay (highlighted as recommended)
- **Double Definition** - Two definitions, no wordplay
- **Cryptic Definition** - Entire clue is a cryptic hint
- **&lit** - Definition AND wordplay combined

This forces conscious thinking about clue structure before diving in.

### Phase 1: Definition (Standard clues only)
**Goal:** User identifies the definition

**Visual confirmation:** Green box shows "✓ Standard" with instruction "Now tap the definition words in the clue above"

**Hint:** "Every clue has a definition + wordplay, both leading to the same answer. Finding that split is key to solving every clue. It is usually easier to spot the definition as it is always at the START or END of the clue."

**Interaction:**
- User taps words to select (contiguous selection)
- Green highlight when correct
- "Yes, that's the definition" button appears on correct selection
- Back link to return to clue type selection if needed

### Phase 2: Wordplay
**Goal:** User solves each wordplay step by identifying parts and working out the result

**For each independent wordplay step (expanded panel):**

1. **Find indicator** - User taps word(s) → Check → Orange highlight
2. **Find fodder** - User taps word(s) → Check → Blue highlight
3. **Enter result** - User types what the wordplay produces (with Reveal button)
4. **Panel collapses** - Shows summary: "busy" (anagram) + "lymph too" → PHLOTOMY

**Then for dependent steps:**
- Same flow, but fodder references results from previous steps

**Panel States:**
- **Expanded** - Active step, user working on it
- **Collapsed** - Completed step, shows key info only

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

1. **Explicit choice upfront** - User consciously identifies clue type before proceeding
2. **Continuous reveal** - Highlights accumulate, no modal steps
3. **Answer grid always visible** - User can attempt answer at any time
4. **Natural prompts** - Text evolves based on state, not phase labels
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
