# Plan: Training UX Improvements

## Problem Summary

Based on UI captures (screenshots 1-7), the current training flow has these UX issues:

1. **Jumpiness** - Panels appear/disappear abruptly, causing layout shifts
2. **No step history** - User can't see what they've solved or what's coming
3. **Inconsistent buttons** - Check/Continue buttons appear in different states/positions
4. **No progress indicator** - User doesn't know where they are in the solving flow

## Core Requirement: Solve Anytime

**The user must be able to enter the answer at any point during training.**

This is a training app with many steps, but sometimes the user "gets it" early and wants to solve immediately.

### Fixed Top Layout

The UI must ALWAYS show at the top:

1. **The clue** - Full clue text with enumeration
2. **The answer entry** - Crossword-style boxes (one box per letter, based on enumeration)

```
┌─────────────────────────────────────────────────────┐
│ Drawing blood, lymph too, busy nurses conclude      │
│ job at last (10)                                    │
├─────────────────────────────────────────────────────┤
│ ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐          │
│ │   │   │   │   │   │   │   │   │   │   │          │  ← Crossword boxes
│ └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘          │
└─────────────────────────────────────────────────────┘
```

### Behavior

- User can type answer at ANY time during training
- If correct answer entered → skip all remaining steps → go to solved screen
- If incorrect → show feedback, continue with training steps

### Crossword-Style Input

ALL letter entry in the app should use crossword boxes:
- Final answer entry (always visible)
- Intermediate step results (e.g., typing "EB" for letter extraction)

---

## Fixed 3-Section Layout

**CRITICAL: These three sections must ALWAYS be the same size and position. No jumpiness as user navigates between steps.**

```
┌─────────────────────────────────────────────────────┐
│ SECTION 1: CLUE (fixed height)                      │
│                                                     │
│ Drawing blood, lymph too, busy nurses conclude      │
│ job at last (10)                                    │
│                                                     │
├─────────────────────────────────────────────────────┤
│ SECTION 2: ANSWER ENTRY (fixed height)              │
│                                                     │
│ ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐          │
│ │   │   │   │   │   │   │   │   │   │   │          │
│ └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘          │
│                                                     │
├─────────────────────────────────────────────────────┤
│ SECTION 3: ACTION REQUIRED + BUTTON (fixed height)  │
│                                                     │
│ Tap the definition words                [ Check ]   │
│                                                     │
└─────────────────────────────────────────────────────┘
│                                                     │
│ SECTION 4: DETAILS (scrollable, below fold)         │
│                                                     │
│ Teaching content, intro cards, step history, etc.   │
│ Always available - user scrolls down if needed      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Layout Principles

1. **Sections 1-3 are FIXED** - same size, same position, always visible
2. **Only content changes** - text/boxes update, but layout doesn't shift
3. **Section 4 is below the fold** - details for those who want them
4. **Experienced users** can work entirely in sections 1-3
5. **New users** scroll down for teaching content

### Section Details

| Section | Content | Height |
|---------|---------|--------|
| 1. Clue | Full clue text with enumeration | Fixed |
| 2. Answer Entry | Crossword boxes (one per letter) | Fixed |
| 3. Action | Brief instruction + action button | Fixed |
| 4. Details | Teaching, history, intros (scrollable) | Variable |

---

## Previous Design (Superseded)

The design below is kept for reference but has been superseded by the Fixed 3-Section Layout above.

### Design Concept (OLD)

```
┌─────────────────────────────────────────────────────┐
│ ← Back              Step 2 of 5              1A     │  ← Fixed header with progress
├─────────────────────────────────────────────────────┤
│                                                     │
│   Drawing  blood  lymph  too  busy  nurses ...      │  ← Clue (always visible)
│   (10)                                              │
│                                                     │
├─────────────────────────────────────────────────────┤
│ STEP HISTORY (collapsible, shows completed steps)   │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ✓ Clue Type: Standard                           │ │
│ │ ✓ Definition: "Drawing blood" (start)           │ │
│ └─────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│ CURRENT STEP (fixed height zone)                    │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 📘 Anagram                                      │ │  ← Collapsible intro
│ │ An anagram indicator signals...                 │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ FIND INDICATOR                                  │ │  ← Instruction panel
│ │ Tap the anagram indicator...                    │ │
│ │                                                 │ │
│ │              [ Check ]                          │ │  ← Button always in same spot
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Key Improvements

1. **Fixed Layout Zones** - Three stable zones that don't shift:
   - Header (progress indicator)
   - Clue display
   - Working area (history + current step)

2. **Step History Panel** - Shows completed steps with results:
   - Collapsed by default, expandable
   - Each completed step shows: type, key finding, result
   - Provides context and sense of progress

3. **Consistent Button Placement** - Button always at bottom of current step panel:
   - Always same position
   - State changes (disabled/enabled) but doesn't move
   - "Check" for input phases, "Continue →" for teaching phases

4. **Progress Indicator** - "Step 2 of 5" in header:
   - Shows overall progress
   - Replaces the jumpy step label changes

5. **Collapsible Intro Cards** - Intro teaching text can be collapsed:
   - Reduces visual noise on repeat visits
   - Still available for reference

## Implementation

### Files to Modify

| File | Changes |
|------|---------|
| `components/TemplateTrainer.tsx` | Add history panel, fixed layout zones, progress indicator |
| `cryptic_trainer_bundle/training_handler.py` | Add `totalSteps` and `completedSteps` to render response |

### Server Changes (training_handler.py)

Add to `get_render()` response:
```python
render = {
    # ... existing fields ...
    "totalSteps": len(steps),  # Total steps in clue (not counting clue_type_identify)
    "currentStepNumber": session["step_index"] + 1,  # 0-indexed to 1-indexed
    "completedSteps": [...]  # Array of completed step summaries
}
```

Completed step summary format:
```python
{
    "type": "standard_definition",
    "label": "Definition",
    "result": "Drawing blood",
    "detail": "at start"
}
```

### UI Changes (TemplateTrainer.tsx)

1. **Add StepHistory component:**
```tsx
function StepHistory({ steps }: { steps: CompletedStep[] }) {
  const [expanded, setExpanded] = useState(false);
  // Render collapsed summary or expanded list
}
```

2. **Add ProgressHeader component:**
```tsx
function ProgressHeader({ current, total, clueNumber }) {
  return (
    <div className="flex justify-between">
      <button>← Back</button>
      <span>Step {current} of {total}</span>
      <span>{clueNumber}</span>
    </div>
  );
}
```

3. **Fixed layout structure:**
```tsx
<div className="flex flex-col h-full">
  <ProgressHeader ... />
  <ClueDisplay ... />        {/* Fixed height */}
  <StepHistory ... />        {/* Collapsible */}
  <CurrentStepPanel ... />   {/* Flex-grow, scrollable if needed */}
</div>
```

4. **Stable button positioning:**
- Button always at bottom of CurrentStepPanel
- Use `min-h-[200px]` or similar to prevent panel height changes
- Animate panel content changes with CSS transitions

### Animation Strategy

Use CSS transitions to smooth panel changes:
```css
.panel-content {
  transition: opacity 150ms ease-in-out;
}
.panel-entering { opacity: 0; }
.panel-entered { opacity: 1; }
```

## Verification

1. Start servers and navigate to Training Mode
2. Progress through PHLEBOTOMY clue
3. Verify:
   - [ ] Header shows "Step X of Y" throughout
   - [ ] Clue display stays in place (no jumping)
   - [ ] Step history shows completed steps
   - [ ] Button stays in consistent position
   - [ ] Transitions feel smooth, not jumpy
   - [ ] Can expand/collapse intro cards

## Questions for User

Before finalizing:
1. Should step history be expanded or collapsed by default?
2. Should intro cards auto-collapse after first view of that step type?
3. Any specific animations/transitions preferred?
