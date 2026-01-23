# Trainer Design Specification (V2)

This document defines the training flow for the Cryptic Trainer app.

---

## Architectural Principle

**All logic lives in the clue metadata. The middleware and UI are presentation only.**

Each clue has a JSON structure that contains:
- All information about the clue (text, answer, enumeration, etc.)
- All solve logic (steps, expected selections, validation rules)
- All hints and explanations

The application reads this metadata and presents it to the user. The UI does not compute or derive anything — it simply renders what the metadata specifies.

This means:
- Adding a new clue = adding a new JSON object with complete solve data
- No code changes required to support new clue patterns
- The solver/parser generates this metadata; the UI consumes it
- If the UI behaves incorrectly, the metadata is wrong — fix the metadata, not the UI

The application loads this JSON structure and uses it to track solving status throughout the session. User progress (completed steps, entered letters, etc.) is recorded against this same structure.

---

## Training Flow

### Step 1: Identify Clue Type

**This is ALWAYS the first step for every clue.**

The user sees:
- The clue text with answer grid
- Educational text about definition/wordplay split
- Four clue type options to choose from

#### Educational Guidance

Before the options, show:

> Before solving, look for a clean split between the **definition** (always at start or end) and **wordplay** (the rest). Skilled solvers stay flexible — let the structure tell you how the clue wants to be read.
>
> *Tip: ? often signals wordplay or a cryptic definition. ! traditionally marks an &lit clue. Other punctuation is usually just for the surface reading.*

#### Clue Type Options

| Type | ID | Question | Example |
|------|----|----------|---------|
| **Standard** | `standard` | Do you see a definition at the start or end, with wordplay indicators in the rest? | "Crazy golf equipment (7)" → PUTTERS |
| **Double Definition** | `double_definition` | Do you see two separate meanings with no wordplay indicators? | "Sound barrier (5)" → FENCE |
| **Cryptic Definition** | `cryptic_definition` | Does the whole clue read as one whimsical description with no obvious wordplay? | "HIJKLMNO? (5)" → WATER |
| **&lit** | `andit` | Does the whole clue both describe AND construct the answer simultaneously? | "Terribly angered! (7)" → ENRAGED |

#### Clue Type Validation

The UI compares the user's selection against `clueType.id` in metadata:

```
User taps "Standard" → check if clueType.id === "standard"
User taps "Double Definition" → check if clueType.id === "double_definition"
User taps "Cryptic Definition" → check if clueType.id === "cryptic_definition"
User taps "&lit" → check if clueType.id === "andit"
```

**Correct selection:** Highlight button green, advance to Step 2
**Incorrect selection:** Brief red flash, remain on Step 1

---

### Step 2: Identify Definition

After clue type is selected, prompt user to tap the definition word(s).

#### Behavior by Clue Type

| Clue Type | Definition Behavior |
|-----------|---------------------|
| `standard` | Definition is at start OR end (one contiguous span) |
| `double_definition` | Two separate definitions (user taps both) |
| `cryptic_definition` | Entire clue is the definition |
| `andit` | Entire clue is the definition (same as cryptic_definition) |

#### Validation

The UI compares selected word indices against `patternData.wordHighlights` where `role === "definition"`.

**Correct:** Words highlight green, advance to Step 3 (or complete for cryptic_definition)
**Partial:** Words highlight light green with "Keep selecting..." prompt
**Incorrect:** Brief red flash, clear selection

---

### Step 3: Wordplay Steps

For Standard and &lit clues, guide user through each wordplay step.

#### Dependency-Based Ordering (V2)

Wordplay steps are **not** always processed in array order. The UI checks each step's `dependencies` array:

- **No dependencies** (`dependencies: []`) — Step is available immediately
- **Has dependencies** — Step is blocked until all dependency IDs are solved
- **Blocked steps** show `blockedHint` to explain why

This allows complex clues where:
- Simple extractions (letter_selection) can be solved first
- Complex operations (anagram, container) wait for their inputs

#### Step Sequence

For each available wordplay step:

1. **INDICATOR** — User taps the indicator word(s)
2. **FODDER** — User taps the fodder word(s)
3. **RESULT** — User enters the result of applying the operation

#### Indicator Phase

- UI prompts: "Tap the indicator"
- User taps word(s) in clue
- Validate against `wordplays[n].indicator`
- **Correct:** Highlight orange, update `state.indicatorFound = true`, advance to FODDER
- **Incorrect:** Brief red flash

#### Fodder Phase

- UI prompts: "Tap the fodder"
- User taps word(s) in clue
- Validate against `wordplays[n].fodder`
- **Correct:** Highlight blue, update `state.fodderFound = true`, advance to RESULT
- **Incorrect:** Brief red flash

#### Result Phase

- UI prompts: "What do you get?"
- User types letters
- Validate against `wordplays[n].result`
- **Correct:** Update `state.resultEntered = true` and `state.solved = true`, check if dependencies are now satisfied for other steps
- **Incorrect:** Show hint, allow retry

#### Special Cases

**No indicator (synonym/abbreviation steps):**
- Skip INDICATOR phase
- Start directly at FODDER phase
- `wordplays[n].indicator` will be empty string `""`

**Blocked steps:**
- Show `blockedHint` message
- Disable interaction until dependencies resolve

**Sub-operations:**
- Complex wordplays may have `subOperations` array
- Each sub-operation has its own `dependencies` and `state`
- Example: Anagram with insertion has "fodder_selection" (no deps) and "solve_anagram" (deps on inserted letters)

---

## Color System

| Element | Color | CSS Class |
|---------|-------|-----------|
| Definition | Green | `bg-green-*` |
| Indicator | Orange | `bg-orange-*` |
| Fodder | Blue | `bg-blue-*` |

---

## Metadata Schema (V2)

### Top-Level Clue Structure

```json
{
  "id": "user-1768923945280",
  "clue": "Drawing blood, lymph too, busy nurses conclude job at last",
  "answer": "PHLEBOTOMY",
  "enumeration": "10",
  "clueType": {
    "id": "standard"
  },
  "definition": {
    "text": "Drawing blood",
    "position": "start"
  },
  "wordplays": [...],
  "confidence": 1.0,
  "comments": [...]
}
```

### clueType Object

**CRITICAL: This determines Step 1 validation**

```json
{
  "clueType": {
    "id": "standard"
  }
}
```

Valid values for `id`:
- `"standard"` — Definition + wordplay
- `"double_definition"` — Two definitions, no wordplay
- `"cryptic_definition"` — Entire clue is a whimsical definition
- `"andit"` — Entire clue is both definition AND wordplay (&lit)

**DO NOT use wordplay technique names here** (anagram, container, etc.)

### definition Object

```json
{
  "definition": {
    "text": "Drawing blood",
    "position": "start"
  }
}
```

| Field | Purpose |
|-------|---------|
| `text` | The definition text |
| `position` | `"start"` or `"end"` |

### wordplays Array (V2)

Each wordplay step with dependencies and state:

```json
{
  "wordplays": [
    {
      "id": "1",
      "indicator": "busy",
      "operation": "anagram",
      "fodder": "lymph too",
      "fodderLetterCount": 8,
      "result": "PHLEBOTOMY",
      "resultLetterCount": 10,
      "dependencies": ["2", "3"],
      "blockedHint": "Fodder only has 8 letters, answer needs 10. We need to find 2 more letters.",
      "state": {
        "indicatorFound": false,
        "fodderFound": false,
        "resultEntered": false,
        "solved": false
      },
      "subOperations": [
        {
          "id": "1A",
          "operation": "fodder_selection",
          "dependencies": [],
          "state": { "solved": false }
        },
        {
          "id": "1B",
          "operation": "solve_anagram",
          "dependencies": ["2", "3"],
          "blockedHint": "Cannot solve anagram until we know where the extra letters go.",
          "state": { "solved": false }
        }
      ],
      "explanation": "The word 'busy' indicates an anagram of 'lymph too', combined with letters from other wordplays to form PHLEBOTOMY."
    },
    {
      "id": "2",
      "indicator": "nurses",
      "operation": "container",
      "fodder": {
        "type": "result",
        "fromWordplay": ["1A", "3"]
      },
      "result": "(insertion point into anagram)",
      "dependencies": ["1A", "3"],
      "blockedHint": "Cannot insert until we solve adjacent wordplays.",
      "state": {
        "indicatorFound": false,
        "fodderFound": false,
        "resultEntered": false,
        "solved": false
      },
      "explanation": "The word 'nurses' indicates that EB (from 'at last') is inserted into the anagram fodder."
    },
    {
      "id": "3",
      "indicator": "at last",
      "operation": "letter_selection",
      "extractionType": "last_letter",
      "fodder": "conclude job",
      "result": "EB",
      "resultLetterCount": 2,
      "dependencies": [],
      "state": {
        "indicatorFound": false,
        "fodderFound": false,
        "resultEntered": false,
        "solved": false
      },
      "explanation": "The indicator 'at last' tells us to take the final letters of 'conclude' and 'job', giving EB."
    }
  ]
}
```

### Wordplay Fields

| Field | Purpose |
|-------|---------|
| `id` | Unique identifier for this wordplay (referenced by dependencies) |
| `indicator` | The indicator word(s) — empty string if none |
| `operation` | The wordplay technique (see list below) |
| `fodder` | The fodder word(s), or object referencing previous results |
| `fodderLetterCount` | Number of letters in fodder (for validation hints) |
| `result` | What the step produces |
| `resultLetterCount` | Number of letters in result |
| `dependencies` | Array of wordplay IDs that must be solved first |
| `blockedHint` | Message shown when step is blocked by unsolved dependencies |
| `state` | Tracks user progress through this wordplay |
| `subOperations` | Optional array of sub-steps for complex wordplays |
| `explanation` | Human-readable explanation |

### State Object

```json
{
  "state": {
    "indicatorFound": false,
    "fodderFound": false,
    "resultEntered": false,
    "solved": false
  }
}
```

The UI updates these flags as the user progresses. When `solved` becomes `true`, dependent wordplays become unblocked.

### Valid operation Values

| operation | Description |
|-----------|-------------|
| `anagram` | Rearrange letters |
| `container` | One thing inside another |
| `hidden` | Answer hidden in consecutive letters |
| `reversal` | Spell backwards |
| `deletion` | Remove letters |
| `homophone` | Sounds like |
| `abbreviation` | Standard abbreviation (DR, N, S, etc.) |
| `letter_selection` | Take specific letters (first, last, odd, even) |
| `synonym` | Word replacement |
| `charade` | Concatenate parts |

### Fodder Reference Object

When fodder comes from previous wordplay results:

```json
{
  "fodder": {
    "type": "result",
    "fromWordplay": ["1A", "3"]
  }
}
```

---

## Example: Complete PHLEBOTOMY Metadata (V2)

```json
{
  "id": "user-1768923945280",
  "clue": "Drawing blood, lymph too, busy nurses conclude job at last",
  "answer": "PHLEBOTOMY",
  "enumeration": "10",
  "clueType": {
    "id": "standard"
  },
  "definition": {
    "text": "Drawing blood",
    "position": "start"
  },
  "wordplays": [
    {
      "id": "1",
      "indicator": "busy",
      "operation": "anagram",
      "fodder": "lymph too",
      "fodderLetterCount": 8,
      "result": "PHLEBOTOMY",
      "resultLetterCount": 10,
      "dependencies": ["2", "3"],
      "blockedHint": "Fodder only has 8 letters, answer needs 10. We need to find 2 more letters.",
      "state": {
        "indicatorFound": false,
        "fodderFound": false,
        "resultEntered": false,
        "solved": false
      },
      "subOperations": [
        {
          "id": "1A",
          "operation": "fodder_selection",
          "dependencies": [],
          "state": { "solved": false }
        },
        {
          "id": "1B",
          "operation": "solve_anagram",
          "dependencies": ["2", "3"],
          "blockedHint": "Cannot solve anagram until we know where the extra letters go.",
          "state": { "solved": false }
        }
      ],
      "explanation": "The word 'busy' indicates an anagram of 'lymph too', combined with letters from other wordplays to form PHLEBOTOMY."
    },
    {
      "id": "2",
      "indicator": "nurses",
      "operation": "container",
      "fodder": {
        "type": "result",
        "fromWordplay": ["1A", "3"]
      },
      "result": "(insertion point into anagram)",
      "dependencies": ["1A", "3"],
      "blockedHint": "Cannot insert until we solve adjacent wordplays.",
      "state": {
        "indicatorFound": false,
        "fodderFound": false,
        "resultEntered": false,
        "solved": false
      },
      "explanation": "The word 'nurses' indicates that EB (from 'at last') is inserted into the anagram fodder."
    },
    {
      "id": "3",
      "indicator": "at last",
      "operation": "letter_selection",
      "extractionType": "last_letter",
      "fodder": "conclude job",
      "result": "EB",
      "resultLetterCount": 2,
      "dependencies": [],
      "state": {
        "indicatorFound": false,
        "fodderFound": false,
        "resultEntered": false,
        "solved": false
      },
      "explanation": "The indicator 'at last' tells us to take the final letters of 'conclude' and 'job', giving EB."
    }
  ],
  "confidence": 1.0,
  "comments": [
    "The definition 'Drawing blood' exactly matches the medical term PHLEBOTOMY.",
    "The container indicator 'nurses' is used as a verb meaning 'to hold or contain'.",
    "The letters extracted from 'conclude job' are the final letters of those words (E and B)."
  ]
}
```

---

## Validation Checklist

Before saving a clue, verify:

1. **clueType.id** is one of: `standard`, `double_definition`, `cryptic_definition`, `andit`
2. **definition.text** matches words in the clue
3. **definition.position** is `start` or `end`
4. **wordplays** each have unique `id` values
5. **dependencies** reference valid wordplay IDs
6. **dependencies** form a valid DAG (no circular references)
7. **state** objects are initialized to all `false`
8. **result** values chain correctly to produce the final answer
9. **blockedHint** is provided for any step with dependencies

---

## Key Concepts Summary

| Concept | Purpose |
|---------|---------|
| **dependencies** | Wordplays can depend on other wordplays being solved first |
| **blockedHint** | Shown to user when a step cannot be completed yet due to unsolved dependencies |
| **state** | Tracks user progress through each wordplay component |
| **subOperations** | Complex wordplays can have internal steps (e.g., fodder selection before anagram solving) |
