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

## Nested Wordplay (Deletion with Implied Operation)

Some clues have **nested operations** where one wordplay depends on an implied transformation.

### Example: MASH

Clue: "Scrub others like hot potato dish"

| Step | Type | Indicator | DeleteTarget | Fodder | ImpliedOp | ImpliedResult | Result |
|------|------|-----------|--------------|--------|-----------|---------------|--------|
| 1 | Deletion | "Scrub" | "others" | "mums" | synonym | MOTHERS | M |
| 2 | Synonym | — | — | "like" | — | — | AS |
| 3 | Abbreviation | — | — | "hot" | — | — | H |

**The discovery flow for Step 1:**
1. User finds indicator "Scrub" (deletion)
2. User finds what to delete "others" (OTHERS)
3. User finds fodder "mums"
4. **Aha moment**: "But OTHERS isn't in MUMS!"
5. User realizes implied synonym: mums → MOTHERS
6. User works out: MOTHERS − OTHERS = M

### Data Model for Nested Steps

```typescript
interface WordplayStep {
  stepType: string;
  indicator: string;
  fodder: string;
  result: string;
  explanation?: string;

  // For deletion with implied operation
  deleteTarget?: string;      // What to remove (e.g., "others")
  impliedOperation?: string;  // "synonym" | "anagram"
  impliedResult?: string;     // Result after implied op (e.g., "MOTHERS")
}
```

---

## Indicatorless Steps (Socratic Approach)

Some steps have **no indicator** — they're pure synonym or abbreviation lookups. These use a **Socratic teaching method** rather than direct prompts.

### The Problem with Direct Prompts

❌ "Tap 'like' in the clue above" — **gives away the answer**

### The Socratic Solution

Instead of telling users what to do, guide their thinking:

1. **Show progress visually** — Letter boxes: filled letters + blank boxes for remaining
2. **Present the puzzle** — "You have 2 words remaining: 'like' and 'hot'. That's 7 letters."
3. **Hint at the gap** — "You only need 3 more letters."
4. **Suggest the pattern** — "There is likely an implied synonym, abbreviation or literal in there."
5. **Prompt action** — "Select a word to decode"

### Decode Method Selection

After user selects a word, ask **HOW** it contributes:

| Option | Description | User Action |
|--------|-------------|-------------|
| **Literal** | Word itself is used | Just select |
| **Synonym** | Word has a cryptic synonym | Type the synonym |
| **Abbreviation** | Word has a cryptic abbreviation | Type the abbreviation |

This teaches pattern recognition:
- "like" → AS (common cryptic synonym)
- "hot" → H (common abbreviation)
- "note" → could be DO, RE, MI, etc.

### Visual Flow

```
┌─────────────────────────────────────────┐
│  [M] [_] [_] [_]                        │
│                                         │
│  You have 2 words remaining: like, hot  │
│  That's 7 letters.                      │
│  You only need 3 more letters.          │
│                                         │
│  There is likely an implied synonym,    │
│  abbreviation or literal in there.      │
│                                         │
│  ► Select a word to decode              │
└─────────────────────────────────────────┘

         ↓ User taps "like"

┌─────────────────────────────────────────┐
│  How does "like" decode?                │
│                                         │
│  ○ "like" is used literally             │
│  ● "like" has a common synonym ___      │
│     [AS_______]                         │
│  ○ "like" has a common abbreviation ___ │
│                                         │
│  [Check]                                │
└─────────────────────────────────────────┘
```

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
- User taps words in the clue box to select (contiguous selection)
- "Check Definition" button appears in the clue box when words are selected
- Green highlight when correct
- Back link to return to clue type selection if needed

### Phase 2: Wordplay
**Goal:** User solves each wordplay step by identifying parts and working out the result

**Sub-phases (state machine):**

```
indicator → deleteTarget* → fodder → decodeMethod* → discovery* → result
                ↑                         ↑              ↑
         (deletion only)        (indicatorless)   (implied op)
```

**For steps WITH indicators:**

1. **Find indicator** - User taps word(s) → "Check Indicator" → Orange highlight
2. **Find deleteTarget** *(deletion only)* - User taps what to delete → Purple highlight
3. **Find fodder** - User taps word(s) → "Check Fodder" → Blue highlight
4. **Discovery** *(if implied operation)* - "But wait... OTHERS isn't in MUMS!" → User types implied result
5. **Enter result** - User types what the wordplay produces (with Reveal button)
6. **Panel collapses** - Shows summary with expandable key learnings

**For steps WITHOUT indicators (synonym/abbreviation):**

1. **Socratic guidance** - Shows letter progress, unused words, hints at pattern
2. **Find fodder** - Prompt: "Select a word to decode" → User taps word → Blue highlight
3. **Decode method** - User chooses: literal / synonym / abbreviation → Types value if needed
4. **Result auto-filled** - Correct decode method validates and fills result
5. **Panel collapses** - Shows summary with expandable key learnings

**Then for dependent steps:**
- Same flow, but fodder references results from previous steps

**Panel States:**
- **Expanded** - Active step, user working on it
- **Collapsed** - Completed step, clickable to expand key learnings

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
3. **Answer grid always visible** - User can attempt answer at any time (hidden during indicator/fodder selection for focus)
4. **Natural prompts** - Text evolves based on state, not phase labels
5. **No step-based feeling** - Flow should feel like guided discovery
6. **Unified interaction zone** - All Check buttons appear in the clue box where user is already focused
7. **Expandable learnings** - Completed steps can be clicked to reveal key learnings
8. **Socratic guidance** - Never give away answers; guide thinking with progress and hints
9. **Teach patterns** - For indicatorless steps, make users identify HOW words decode (literal/synonym/abbreviation)
10. **Aha moments** - For nested operations, let users discover contradictions ("But OTHERS isn't in MUMS!")

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
- `wordplaySteps` - Array of WordplayStep objects (see below)
- `enumeration` - e.g., "9" or "4,5"
- `clueNumber` - e.g., "12A"

### WordplayStep Structure

```typescript
interface WordplayStep {
  // Core fields
  stepType: string;           // 'anagram', 'container', 'deletion', 'synonym', 'abbreviation', etc.
  indicator: string;          // The indicator word(s) - empty for indicatorless steps
  fodder: string;             // The source material
  result: string;             // What this step produces
  explanation?: string;       // Human-readable explanation

  // For deletion with implied operation
  deleteTarget?: string;      // What to remove (e.g., "others")
  impliedOperation?: string;  // "synonym" | "anagram" - the hidden transformation
  impliedResult?: string;     // Result after implied op (e.g., "MOTHERS")

  // Assembly flag
  isAssembly?: boolean;       // True for final assembly steps (filtered out of UI)
}
```

### Step Type Detection

| stepType | Has Indicator? | Flow |
|----------|----------------|------|
| anagram | Yes | indicator → fodder → result |
| container | Yes | indicator → fodder → result |
| deletion | Yes | indicator → deleteTarget → fodder → [discovery] → result |
| reversal | Yes | indicator → fodder → result |
| hidden | Yes | indicator → fodder → result |
| homophone | Yes | indicator → fodder → result |
| letter_selection | Yes | indicator → fodder → result |
| **synonym** | **No** | fodder → decodeMethod → result |
| **abbreviation** | **No** | fodder → decodeMethod → result |

---

## Next Steps

1. Wire up `ClueTrainer` to real `PatternInstance` data
2. Handle special clue types (DD, CD, &lit) with actual detection
3. Add wordplay step highlighting in clue text
4. Progressive difficulty - start with simple clues
5. Track user progress on splitting skill
