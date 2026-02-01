# Cryptic Trainer — Design Specification

*Last updated: 2026-01-31*

---

## Table of Contents

1. [Architectural Principles](#architectural-principles)
2. [System Architecture](#system-architecture)
3. [UI Application Flow](#ui-application-flow)
4. [Data Storage](#data-storage)
5. [Import Flow](#import-flow)
6. [Training Flow](#training-flow)
7. [Step Templates](#step-templates)
8. [Server API](#server-api)
9. [React Components](#react-components)
10. [File Inventory](#file-inventory)

---

## Architectural Principles

### 1. Predefined Step Templates

Replace complex per-clue metadata with **predefined step templates**. Each template defines the complete flow for a step type (90% generic), with clue data providing only the specific values (10%).

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  STEP_TEMPLATES │  +  │    Clue Data     │  =  │  Runtime Render │
│   (90% generic) │     │ (10% specific)   │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

This means:
- Adding a new clue = adding a simple JSON object with step types + specific values
- Templates define instructions, input modes, highlights, teaching moments
- Clue data provides only: indices, text, results
- Handler merges template + clue data, substitutes variables like `{result}`, `{position}`

### 2. Server-Driven Rendering

**The server tells the UI EXACTLY what to render. The UI has ZERO phase/operation logic.**

Handler logic:
1. Look up template by `step.type`
2. Get current phase from `session.phase_index`
3. Merge template phase with clue-specific data
4. Substitute variables (`{result}`, `{position}`, etc.)
5. Return render object

The UI component (`TemplateTrainer`) renders purely based on `render.*` fields — it never checks `currentPhase`, `operation`, or any other field to decide what to display.

**Why This Architecture:**
- **No sync bugs** — server is single source of truth for rendering
- **No scattered conditionals** — UI doesn't have phase-checking logic
- **Easy to add new step types** — just add a new template
- **Predictable behavior** — what server returns is what user sees

### 3. Thin Client Architecture

**ALL business logic lives on the Python server. The UI is a thin client that only renders and captures input.**

| Layer | Responsibility |
|-------|----------------|
| **Python Server** (port 5001) | ALL logic: import, validate, store, training flow, answer validation, state management, **render instructions** |
| **React UI** (port 3000) | ONLY: render `RenderInstructions`, capture user input, send actions to server |

**The UI does NOT:**
- Parse or validate clue data
- Validate user answers
- Compute what step comes next
- Decide what panel/buttons/highlights to show
- Make any decisions — server decides everything

**The UI ONLY:**
- Renders exactly what `render.*` fields specify
- Sends user actions to the server
- Displays feedback from server responses

### 4. Constraint-First Solving (No AI Guessing)

The solver derives answers using:
- Explicit, checkable wordplay frames generated from code
- Lexicon lookups (synonyms, abbreviations, phrases)
- Positional logic and pattern matching
- Machine-checkable proof traces

**Golden Rule:** The solver produces traceable proofs, not AI-generated narratives.

### 5. Hypothesis-Driven Solving (How Real Solvers Think)

**Critical insight:** Our step breakdowns are reverse-engineered from known answers. Real solvers approach clues cold using a fundamentally different mental model.

#### Research Sources

- **Cracking the Cryptic** (YouTube masterclass series) — Expert solver walkthroughs
- **"A Reasoning-Based Approach to Cryptic Crossword Clue Solving"** (arXiv:2506.04824)
- **Crossword Unclued** — 7-step solving methodology

#### How Expert Solvers Actually Think

1. **Definition-first hypothesis** — Scan start/end for definition, generate candidate answers
2. **Indicator recognition** — Spot recipe words (anagram, container, reversal indicators)
3. **Candidate generation** — "Could this be IMPASSE? Let me check..."
4. **Bi-directional verification** — Confirm answer works via BOTH definition AND wordplay
5. **Crossing letters as constraints** — Use grid to narrow possibilities

```
Real Solving:     Definition → Hypothesis → Verify Wordplay → Confirm
Our Steps:        Wordplay Part 1 → Part 2 → Part 3 → Answer
```

#### The "Two-Path" Verification Model

Expert solvers achieve confidence when the same answer emerges from two independent routes:

```
┌─────────────────┐         ┌─────────────────┐
│   DEFINITION    │         │    WORDPLAY     │
│  "blocking      │         │  IMPE around    │
│   state" = ?    │         │  ASS = ?        │
└────────┬────────┘         └────────┬────────┘
         │                           │
         ▼                           ▼
    ┌─────────┐                ┌─────────┐
    │ IMPASSE │◄───Confirm────►│ IMPASSE │
    └─────────┘                └─────────┘
```

#### What This Means for Training Content

The step data we generate feeds a **dumb template engine** — it has zero clue-specific intelligence. But the **pedagogical framing** in hints and teaching moments should reflect how real solvers think:

| Avoid (Construction Mindset) | Prefer (Verification Mindset) |
|------------------------------|-------------------------------|
| "press = IMPEL" | "What 5-letter word meaning 'press' could fit here?" |
| "Now add these parts together" | "Does this wordplay confirm your hypothesis?" |
| "The answer is built from..." | "Can you verify the answer works both ways?" |

#### Key Expert Behaviors to Teach

1. **Definition hunting** — "The definition is ALWAYS at the start or end"
2. **Indicator vocabulary** — Common signals for anagrams, containers, reversals, etc.
3. **Short synonym library** — gold=OR, old lady=MA, church=CE, current=I
4. **Backsolving** — "I guessed GUMDROP, then verified the recipe worked"
5. **Admitting uncertainty** — Experts say "I don't know" frequently, then iterate

#### Information-Driven Solve Order (Not Answer-Driven)

**Critical principle:** The order of solving operations must be determined by AVAILABLE INFORMATION, not by working backwards from the known answer.

**The Fatal Mistake:**
When creating step metadata, it's tempting to think: "The answer is IMPASSE, which is IMP+ASS+E, so first we need IMPEL, then shorten it..."

This is backwards. A real solver doesn't know that "press" = IMPEL. They can't start there.

**What Information IS Available:**
- Indicator words and their positions ("Brief", "about")
- Adjacency relationships (what's next to what)
- Structural patterns (what indicators typically operate on)
- The hypothesis from the definition (IMPASSE)

**What Information is NOT Available:**
- Which synonym to use (press → IMPEL vs press → URGE vs press → MEDIA)
- Which abbreviation applies (hot → H vs hot → SEXY)
- The "correct" decomposition of the answer

#### Determining Natural Solve Order

**Rule:** Process operations in the order that available information dictates, not the order that constructs the answer.

**Step 1: Scan for indicators AND common cryptic vocabulary**
Look for two types of footholds simultaneously:
- **Indicators** — Recipe words that signal operations (deletion, container, reversal, anagram, etc.)
- **Common vocabulary** — Words with well-known cryptic meanings (fool=ASS, gold=OR, church=CE, etc.)

Both give the solver immediate traction. Indicators tell you WHAT operation; common vocabulary gives you letters you can use right away.

**Step 2: Follow adjacency**
Indicators operate on adjacent words. "Brief press" → "Brief" operates on "press". "about fool" → "about" involves "fool".

**Step 3: Start with what you KNOW**
Begin with the easy/certain parts:
- Common vocabulary (fool=ASS) gives you concrete letters
- This anchors your verification of the hypothesis

**Step 4: Use hypothesis to discover unknowns**
With known letters in hand, work backwards from your hypothesis to find the harder synonyms:
- "I have ASS. My hypothesis IMPASSE has ASS in it. What's around it? IMP_E."
- "Brief press must give IMPE. What word for 'press' shortens to IMPE? IMPEL!"

The hard synonym (press=IMPEL) is DISCOVERED through verification, not known in advance.

#### Example: IMPASSE — Correct Solve Order

**Clue:** "Brief press about fool blocking state" (7)
**Hypothesis from definition:** IMPASSE

**What a solver sees (scanning for indicators AND common vocabulary):**
```
Brief [DELETION] press about [CONTAINER] fool [COMMON: ASS] blocking state [DEFINITION]
  ↓                    ↓              ↓
operates on         involves      = ASS (known)
"press"             "fool"
```

**Natural solve order (starting with what you KNOW):**

1. **Scan for footholds:**
   - Indicators: "Brief" (deletion), "about" (container)
   - Common vocabulary: "fool" = ASS (3 letters) ← immediate foothold!

2. **Start with the known part (fool=ASS):**
   - I have ASS (3 letters)
   - My hypothesis IMPASSE (7 letters) contains ASS
   - Looking at IMPASSE: IMP + ASS + E — ASS is in the middle

3. **Use hypothesis to find the container structure:**
   - "about" = container indicator, adjacent to "fool"
   - Something goes ABOUT (around) ASS
   - Need IMP_E around ASS → IMP[ASS]E

4. **Discover the hard synonym through verification:**
   - "Brief press" must give IMPE (4 letters)
   - "Brief" = deletion, so we're shortening something
   - What word for "press" shortens to IMPE? → IMPEL!
   - Brief IMPEL = IMPE ✓

5. **Verify complete:** IMPE about ASS = IMP[ASS]E = IMPASSE ✓

**Key insight:** We START with "fool = ASS" (common knowledge), then DISCOVER "press = IMPEL" by asking "what fits my hypothesis?"

#### Anti-Pattern: Answer-Driven Order

**Wrong approach (working backwards from IMPASSE):**
```
Step 1: synonym: press → IMPEL     ← How would solver know this?
Step 2: deletion: IMPEL → IMPE
Step 3: synonym: fool → ASS
Step 4: container: IMPE about ASS
```

**Why it's wrong:**
- Step 1 assumes knowledge the solver doesn't have
- A solver seeing "press" might think MEDIA, URGE, PUSH, SQUEEZE...
- Only by having a hypothesis (IMPASSE) can they work backwards to find IMPEL

**Correct approach (working from available information):**
```
Step 1: Scan for footholds — indicators: "Brief" (deletion), "about" (container)
                          — common vocab: "fool" = ASS (known!)
Step 2: Start with known: ASS is in my hypothesis IMPASSE
Step 3: Work outwards: IMP_E around ASS, so "Brief press" = IMPE
Step 4: Discovery: what "press" word shortens to IMPE? → IMPEL!
Step 5: Verification: IMPE (brief IMPEL) about ASS (fool) = IMPASSE ✓
```

#### Implications for Step Metadata

When creating step data, ask: "What information does the solver have at this point that tells them to do this operation?"

| Good (Information-Driven) | Bad (Answer-Driven) |
|---------------------------|---------------------|
| "The indicator 'Brief' is adjacent to 'press'" | "press = IMPEL" |
| "What operation does 'about' signal?" | "Now combine the parts" |
| "Can you verify your hypothesis?" | "The answer is built from..." |

#### Example: Expert vs. Constructed Approach

**Clue:** "Brief press about fool blocking state" (7)

**Constructed approach (what we have):**
```
Step 1: Find definition "blocking state"
Step 2: press → IMPEL (how would solver know this?)
Step 3: fool → ASS
Step 4: Brief shortens IMPEL → IMPE
Step 5: IMPE around ASS → IMPASSE
```

**Expert approach (what we should teach):**
```
Step 1: Definition at end: "blocking state" = deadlock? IMPASSE? (7 letters ✓)
Step 2: Test hypothesis — can I build IMPASSE from the wordplay?
Step 3: Spot indicators: "Brief" (deletion), "about" (container)
Step 4: Verify: "fool"=ASS, "press"=IMPEL, "brief"=shorten → IMP+ASS+E ✓
Step 5: Confirmed! Both paths lead to IMPASSE
```

**Training implication:** Steps should guide users to form hypotheses and verify them, not present pre-known synonyms as facts.

#### Split Difficulty & Recommended Approach

To help users choose the right attack vector, difficulty is split into two components:

| Component | Question | Easy | Hard |
|-----------|----------|------|------|
| **Definition** | How obvious is definition → answer? | Common word, direct meaning | Obscure/archaic, misdirection |
| **Wordplay** | How complex is the recipe? | Simple anagram, hidden word | Nested operations, obscure synonyms |

**Recommended Approach Logic:**

```
IF definition.rating == "easy" AND answer is common word:
    recommendedApproach = "definition"
    → User guesses answer from definition, then verifies wordplay

ELSE IF wordplay has simple pattern (anagram, hidden, reversal):
    recommendedApproach = "wordplay"
    → User solves recipe first, then confirms against definition

ELSE:
    recommendedApproach = "definition"
    → Default to definition-first (most common expert behavior)
```

**Example — IMPASSE clue:**
- Definition difficulty: **easy** ("blocking state" → deadlock/impasse is guessable)
- Wordplay difficulty: **hard** (nested container + deletion + obscure synonym)
- Recommended approach: **definition** (guess IMPASSE, then verify wordplay)

**Example — Anagram clue:**
- Definition difficulty: **hard** (obscure word)
- Wordplay difficulty: **easy** (clear anagram indicator + fodder)
- Recommended approach: **wordplay** (solve anagram, then confirm definition)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  PYTHON SERVER (localhost:5001)                             │
│  cryptic_trainer_bundle/                                    │
├─────────────────────────────────────────────────────────────┤
│  server.py          — HTTP server, routing, clue storage    │
│  training_handler.py — Step templates, session management   │
│  cryptic_trainer.py  — Solver engine                        │
│  clues_db.json       — Data storage                         │
└─────────────────────────────────────────────────────────────┘
                              ↓ HTTP
┌─────────────────────────────────────────────────────────────┐
│  REACT UI (localhost:3000)                                  │
├─────────────────────────────────────────────────────────────┤
│  App.tsx           — Main app, navigation, view state       │
│  TrainingMode.tsx  — Training queue management              │
│  TemplateTrainer.tsx — Server-driven training UI            │
│  ManualEntryMode.tsx — Clue entry and puzzle import         │
│  SolverMode.tsx    — AI-assisted solving                    │
└─────────────────────────────────────────────────────────────┘
```

### Quick Start

```bash
# Terminal 1: Python server
cd cryptic_trainer_bundle && python3 server.py

# Terminal 2: React UI (from project root)
npm run dev
```

---

## UI Application Flow

### Screen Hierarchy

```
HOME
 │
 ├─→ Community Bloggers (external links)
 │
 └─→ PUBLICATION (select a dojo)
      │
      ├─→ TRAINING MODE
      │    └─→ TemplateTrainer (step-by-step guided training)
      │
      ├─→ AI SOLVER
      │    └─→ ClueSolver (scan/paste clues for AI analysis)
      │
      └─→ MANUAL ENTRY
           └─→ Import puzzle files, enter clues manually
```

### View States

| View | Component | Purpose |
|------|-----------|---------|
| `HOME` | `App.tsx` | Landing page with publication tiles and external blog links |
| `PUBLICATION` | `App.tsx` | Publication detail with Training/Solver/Manual Entry buttons |
| `TRAINING` | `TrainingMode.tsx` | Practice queue with TemplateTrainer |
| `SOLVER` | `SolverMode.tsx` | AI-assisted clue solving |
| `MANUAL_ENTRY` | `ManualEntryMode.tsx` | Clue entry and puzzle file import |

### Home Screen

- **Header**: "Cryptic Trainer" title and tagline
- **Database Button**: Opens DataManager (password protected: `dojoMaster`)
- **Community Bloggers**: Links to Big Dave's Blog, FifteenSquared, Times for the Times, Reddit r/crosswords
- **Publication Tiles**: Grid of available dojos (Times, Guardian, etc.) showing setter count and clue count

### Publication Screen

Three action buttons:
1. **Training Mode** — Practice with imported clues
2. **AI Solver** — Scan/paste clues for AI help
3. **Manual Entry** — Type clues or import puzzle files

### Training Mode

1. Loads training queue from server (`GET /clues`)
2. Filters to clues with `steps` array (V3 format)
3. Displays header with publication name, progress (1/N), streak, score, **Solve** button, Skip button
4. Renders `TemplateTrainer` for current clue
5. On complete, advances to next clue or shows completion alert

**Solve Button:** Clicking "Solve" immediately shows the completed view with answer and all learnings. Useful for reviewing clues without working through each step.

### TemplateTrainer (Core Training UI)

**State:**
- `render` — Server response (source of truth)
- `selectedIndices` — Words user has tapped (pre-submit)
- `textInput` — Text user is typing (pre-submit)
- `selectedOption` — Multiple choice selection (pre-submit)
- `feedback` — Error message after wrong answer

**Lifecycle:**
1. On mount: `POST /training/start` with clueId
2. User taps words / enters text / selects option
3. User clicks "Check": `POST /training/input` with value
4. If correct: update render, clear selection
5. If wrong: show feedback message
6. On teaching phase: user clicks "Continue": `POST /training/continue`
7. When `render.complete === true`: call `onComplete()`

**Visual Layout:**
```
┌─────────────────────────────────────────┐
│ ← Back                           [1A]   │
├─────────────────────────────────────────┤
│                                         │
│   Drawing  blood  lymph  too  busy ...  │  ← Clue words (tappable)
│   (10)                                  │
│                                         │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 📖 Intro Card (if present)          │ │  ← Blue background
│ │ Title, explanation, example         │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ FIND DEFINITION                     │ │  ← Instruction panel
│ │ Tap the definition words above...   │ │
│ │                                     │ │
│ │ [Feedback message if wrong]         │ │
│ │                                     │ │
│ │ [Text input if inputMode=text]      │ │
│ │ [Options if inputMode=multi_choice] │ │
│ │                                     │ │
│ │ [ Check ] or [ Continue → ]         │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Highlight Colors:**
| Color | Hex | Role |
|-------|-----|------|
| Green | #22c55e | Definition |
| Orange | #f97316 | Indicator |
| Blue | #3b82f6 | Fodder |
| Purple | #a855f7 | Special |
| Gray | #94a3b8 | Current selection (pre-submit) |

**Letter Checking (Answer Entry):**
| Color | Meaning |
|-------|---------|
| Green background/border | Correct letter |
| Red background/border | Wrong letter |
| Blue background | Letter entered (checking disabled) |

Letter checking is configurable via the Settings panel on the publication page.

### Enumeration Parsing

Enumerations like "(3-4)" represent multi-word answers (3 letters + 4 letters = 7 total).

**Parsing Rule:** Split by non-digits, sum the numbers.
- `"10"` → 10 boxes
- `"3-4"` → 7 boxes (3 + 4)
- `"2,3,4"` → 9 boxes (2 + 3 + 4)

**Implementation:** `parse_enumeration()` helper in `training_handler.py`

### Answer Validation

Answers may contain hyphens (e.g., "LET-DOWN") but user input is compared as letters only.

**Validation Rule:** Strip non-alpha characters before comparing.
- Answer: "LET-DOWN" → "LETDOWN"
- User input: "LETDOWN" → "LETDOWN"
- Match: ✓

This applies to:
- Final answer entry (CrosswordInput)
- Intermediate step results (text input)
- Letter checking colors

---

## Data Storage

### Database File

`cryptic_trainer_bundle/clues_db.json`

```json
{
  "version": 3,
  "training_items": {
    "<clue_id>": TrainingItem,
    ...
  },
  "parser_issues": { ... },
  "import_logs": {
    "<import_id>": ImportLog,
    ...
  },
  "settings": {
    "letterChecking": true,
    "adminFilters": {
      "showOnlyUnverified": false,
      "showOnlyWithIssues": false
    }
  }
}
```

### TrainingItem Schema

```json
{
  "id": "times-2025-1a",
  "clue": {
    "number": "1A",
    "text": "Drawing blood, lymph too, busy nurses conclude job at last",
    "enumeration": "10",
    "answer": "PHLEBOTOMY",
    "definition": [                    // Optional: definition location(s)
      { "text": "Drawing blood", "position": "start" }
    ]
  },
  "words": ["Drawing", "blood", "lymph", "too", "busy", "nurses", "conclude", "job", "at", "last"],
  "steps": [
    { "type": "standard_definition", ... },
    { "type": "anagram_find", ... },
    ...
  ],
  "metadata": {
    "publisher": "Times",
    "puzzle_number": "2025",
    "setter": "Unknown"
  },
  "publicationId": "times",
  "difficulty": {                      // Clue difficulty ratings
    "definition": {                    // How obvious is definition → answer?
      "rating": "easy",                // "easy" | "medium" | "hard"
      "reasoning": "Common word, direct meaning"
    },
    "wordplay": {                      // How complex is the recipe?
      "rating": "hard",                // "easy" | "medium" | "hard"
      "reasoning": "Complex nested structure with obscure synonym"
    },
    "overall": "medium",               // Combined assessment
    "recommendedApproach": "definition" // "definition" | "wordplay" — which attack vector to try first
  },
  "verified": false,                   // Optional: admin verification status
  "reported_issue": null               // Optional: admin-reported problem description
}
```

### TrainingItem Admin Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `verified` | boolean | false | Admin has verified clue is correct |
| `reported_issue` | string \| null | null | Description of any problem with the clue |

### Admin Filter Settings

Admin filter settings control which clues appear in TrainingMode:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `showOnlyUnverified` | boolean | false | Filter training queue to unverified clues only |
| `showOnlyWithIssues` | boolean | false | Filter training queue to clues with reported issues |

These settings are configured in AdminSetup and stored in `settings.adminFilters`.

### ImportLog Schema

```json
{
  "id": "1706300000-times-2025",
  "timestamp": 1706300000,
  "publicationId": "times",
  "puzzleFile": "Times_2025.json",
  "puzzleNumber": "2025",
  "summary": {
    "saved": 5,
    "skipped": 2,
    "failed": 3
  },
  "errors": [
    {
      "clueId": "times-2025-1a",
      "clueNumber": "1A",
      "clueText": "Dog lead",
      "errors": ["steps[0] has type \"reversal\" but no template exists"]
    }
  ]
}
```

---

## Import Flow

### Source Puzzle File Format

```json
{
  "metadata": {
    "file": "Times_2025.json",
    "publisher": "Times",
    "puzzle_number": "2025",
    "setter": "Unknown"
  },
  "clues": {
    "times-2025-1a": {
      "clue": {
        "number": "1A",
        "text": "...",
        "enumeration": "10",
        "answer": "PHLEBOTOMY",
        "definition": [...]           // Optional
      },
      "words": ["..."],
      "steps": [...],
      "difficulty": {                 // Optional
        "rating": "hard",
        "reasoning": "..."
      }
    }
  }
}
```

### Import Steps

1. **Receive** puzzle JSON from UI (`POST /clues/import`)
2. **Validate JSON integrity** — valid JSON, has `metadata` and `clues` objects
3. **For each clue**, validate against step-based schema:
   - `clue` — number, text, enumeration, answer (all required)
   - `words` — array of words matching clue text (required)
   - `steps` — non-empty array of step objects (required)
   - Each step must have a `type` that matches an available template
4. **Skip invalid clues** — log actionable errors, continue with remaining clues
5. **Check for duplicates** — skip if clue ID already exists in database
6. **Store valid clues** in flat format with metadata
7. **Create import log** — save to `import_logs` collection
8. **Return response** — success count (saved, skipped, failed) + error list

### Validation Rules

| Field | Requirement |
|-------|-------------|
| `clue.number` | Required string |
| `clue.text` | Required string |
| `clue.enumeration` | Required string |
| `clue.answer` | Required string |
| `words` | Required array, must be non-empty |
| `steps` | Required array, must be non-empty |
| `steps[].type` | Must match an available template |

### Template Availability Check

Each step's `type` must have a corresponding template in `training_handler.STEP_TEMPLATES`. Available templates:
- `clue_type_identify`
- `standard_definition`
- `anagram_find`
- `letter_selection`
- `container`
- `anagram_solve`
- `double_definition`
- `synonym`
- `abbreviation`
- `deletion`
- `charade`
- `hidden`
- `homophone`
- `reversal`
- `literal_phrase`

If a step type has no template, the clue is skipped with an actionable error:
```
steps[0] has type "spoonerism" but no template exists. Available: clue_type_identify, standard_definition, anagram_find, letter_selection, container, anagram_solve, double_definition, synonym, abbreviation, deletion, charade, hidden, homophone, reversal, literal_phrase
```

### Import Log Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/import-logs` | GET | List all import logs (sorted by timestamp desc) |
| `/import-logs/<id>` | DELETE | Delete single log entry |
| `/import-logs?clearAll=true` | DELETE | Clear all logs |

### Key Principles

- **Skip on failure**: Invalid clues are skipped, not rejected — import continues
- **Actionable errors**: Each error identifies the clue, field, and what to fix
- **No transformation**: Store exactly as received — no field renaming
- **Fix at source**: If validation fails, fix the puzzle file — not import code

---

## Training Flow

### Session State

```python
session = {
    "clue_id": "phlebotomy-1",
    "step_index": -1,     # -1 = clue type identify, 0+ = clue steps
    "phase_index": 0,     # Which phase within current step
    "highlights": []      # Accumulated highlights from correct answers
}
```

### Flow Diagram

```
Session Start (step_index = -1)
    │
    ▼
┌─────────────────────────┐
│ CLUE TYPE IDENTIFICATION│  ← Synthetic step, always first
│ (multiple choice)       │
└────────────┬────────────┘
             │ correct
             ▼
┌─────────────────────────┐
│ STEP 0 (from clue data) │  ← e.g., standard_definition
│ Phase 0: select         │
│ Phase 1: teaching       │
└────────────┬────────────┘
             │ continue
             ▼
┌─────────────────────────┐
│ STEP 1 (from clue data) │  ← e.g., anagram_find
│ Phase 0: indicator      │
│ Phase 1: fodder         │
│ Phase 2: teaching       │
└────────────┬────────────┘
             │ continue
             ▼
         ... more steps ...
             │
             ▼
┌─────────────────────────┐
│ COMPLETE                │
│ render.complete = true  │
└─────────────────────────┘
```

### Clue Type Identification

Every training session starts with a synthetic "clue type identify" step (step_index = -1). This step is not in the clue's `steps` array — it's generated automatically.

The correct answer is derived from the first step type:
- `standard_definition`, `anagram_find`, etc. → "Standard"
- `double_definition` → "Double Definition"

Options presented:
1. **Standard** — Definition at start or end, with wordplay indicators in the rest
2. **Double Definition** — Two separate meanings with no wordplay indicators
3. **Cryptic Definition** — Whole clue is one whimsical description with no obvious wordplay
4. **&lit** — Whole clue both describes AND constructs the answer simultaneously

### Render Object

Every API response includes a `render` object:

```json
{
  "stepIndex": 0,
  "phaseIndex": 0,
  "stepType": "standard_definition",
  "phaseId": "select",
  "inputMode": "tap_words",
  "highlights": [
    {"indices": [0, 1], "color": "GREEN", "role": "definition"}
  ],
  "intro": {
    "title": "Standard",
    "text": "Do you see a definition at the start or end...",
    "example": "Tip: look at the start or end"
  },
  "panel": {
    "title": "FIND DEFINITION",
    "instruction": "Tap the definition words above."
  },
  "button": {"label": "Continue →", "action": "next_step"},
  "expected": [0, 1],
  "options": [...],
  "complete": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `stepIndex` | number | Current step (-1 for clue type, 0+ for clue steps) |
| `phaseIndex` | number | Current phase within step |
| `stepType` | string | Template type (e.g., "anagram_find") |
| `phaseId` | string | Phase identifier (e.g., "indicator_tap_1", "teaching") |
| `inputMode` | string | `tap_words`, `text`, `multiple_choice`, or `none` |
| `highlights` | array | Accumulated highlights from correct answers |
| `intro` | object? | Intro card (title, text, example) — shown on first phase |
| `panel` | object | Instruction panel (title, instruction) |
| `button` | object? | Button to display (for teaching/complete phases) |
| `expected` | any? | Expected answer (indices for tap, text for typing) |
| `options` | array? | Multiple choice options |
| `complete` | boolean | True when training is finished |
| `answer` | string | Correct answer for "solve anytime" feature |
| `actionPrompt` | string | Short instruction for Section 3 |
| `autoCheck` | boolean? | If true, single-word taps auto-submit without needing Check button |
| `stepProgress` | object? | Progress within current step: `{current, total, label}` |
| `answerKnown` | boolean | True if user solved from definition (reviewing wordplay) |

### Learnings Accumulation

As the user progresses through training:
1. Each teaching phase has a panel with instruction text
2. When user clicks "Continue", the learning is captured to `session.learnings[]`
3. Special formatting applies for certain step types (anagram_find, double_definition)
4. When training completes (or user solves early), all learnings display in the solved view
5. For early solve, `/training/learnings` generates all learnings without requiring step completion

### Training UX — Fixed 3-Section Layout

**CRITICAL: Sections 1-3 must ALWAYS be the same size and position. No jumpiness as user navigates between steps.**

```
┌─────────────────────────────────────────────────────┐
│ SECTION 1: CLUE (fixed height)                      │
│                                                     │
│ Drawing blood, lymph too, busy nurses conclude      │
│ job at last (10)                                    │
│                                                     │
├─────────────────────────────────────────────────────┤
│ SECTION 2: INPUT AREA (fixed height)                │
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
│ Teaching content, intro cards, feedback, etc.       │
└─────────────────────────────────────────────────────┘
```

#### Section 2: Dual-Purpose Input Area

Section 2 serves dual purpose to maintain static layout:
- **Default:** Answer entry boxes (e.g., 10 boxes for PHLEBOTOMY) — always available for "solve anytime"
- **Text input steps:** Temporarily shows intermediate input boxes (e.g., 2 boxes for "EB"), then reverts

This eliminates layout jumping when transitioning between step types.

#### Layout Principles

1. **Sections 1-3 are FIXED** — same size, same position, always visible
2. **Only content changes** — text/boxes update, but layout doesn't shift
3. **Section 4 is below the fold** — details for those who want them
4. **Experienced users** can work entirely in sections 1-3
5. **New users** scroll down for teaching content

#### Auto-Check for Single-Word Taps

When `render.autoCheck === true`, tapping a word immediately submits without needing to click "Check":
- Server sets `autoCheck: true` when `expected` array has exactly 1 index
- UI detects this and auto-submits on tap
- Streamlines flow for single-word selections (vocabulary, indicators)

#### Step Progress Indicator

Section 3 displays a yellow progress badge showing progression within a step:
- Shows "Step 1 of 4" style label for multi-phase steps
- Only displayed for interactive phases (not teaching)
- Server provides `render.stepProgress = {current, total, label}`

---

## Step Templates

Templates are defined in `training_handler.py`. Each template has multiple phases.

### clue_type_identify

**Purpose:** Identify the type of clue before solving.

**Phases:**
1. `choose` — Multiple choice: Standard, Double Definition, Cryptic Definition, &lit

**Clue data:** None (synthetic step generated automatically)

### standard_definition

**Purpose:** Find the definition at start or end of clue.

**Phases:**
1. `select` — Tap the definition words (inputMode: tap_words)
2. `teaching` — Shows where definition was found (inputMode: none)
3. `solve` — (Optional) Type the answer if `recommendedApproach === "definition"` (inputMode: text)
   - Added dynamically when clue difficulty indicates definition-first solving
   - On correct answer, session continues to wordplay steps with `answerKnown: true`
   - User reviews wordplay to verify their hypothesis

**Clue data:**
```json
{
  "type": "standard_definition",
  "expected": {"indices": [0, 1], "text": "Drawing blood"},
  "position": "start"
}
```

### wordplay_overview

**Purpose:** After finding the definition, identify common cryptic vocabulary (anchors) and indicator words one at a time. This builds verification incrementally.

**Phases (dynamically generated):**

For each item in `common_vocabulary`:
1. `vocabulary_tap_N` — Tap the word with common cryptic meaning (inputMode: tap_words, autoCheck: true)
   - Prompt: "Tap a word with a common cryptic meaning."
   - User taps: "fool"
   - Expected: [3]
2. `vocabulary_type_N` — Type the synonym (inputMode: text)
   - Prompt: "What's the common cryptic synonym for this word?"
   - User types: ASS
   - Expected: ASS

For each item in `expected_indicators`:
3. `indicator_tap_N` — Identify indicator words one at a time (inputMode: tap_words, autoCheck: true)
   - Prompt: "There are 2 indicators. Find the first one." / "Find indicator 2 of 2."
   - User taps: "Brief"
   - Expected: [0]

4. `teaching` — Confirms anchors, explains indicators, shows letter math (inputMode: none)
   - "fool = ASS (3 letters) — your anchor"
   - "Brief = deletion indicator"
   - "about = container indicator"
   - "You have 3 letters. You need 4 more."

**Note:** Indicators are now processed one at a time instead of all at once, with guided prompts like "There are N indicators, find the first one."

**Clue data:**
```json
{
  "type": "wordplay_overview",
  "definition_solved": true,
  "remaining_indices": [0, 1, 2, 3],
  "remaining_text": "Brief press about fool",
  "common_vocabulary": {
    "indices": [3],
    "text": "fool",
    "meaning": "ASS",
    "letters": 3
  },
  "expected_indicators": [
    {"indices": [0], "text": "Brief", "operation": "deletion"},
    {"indices": [2], "text": "about", "operation": "container"}
  ],
  "training": {
    "vocabulary_hint": "Look at the remaining words. Does one of these words have a common cryptic synonym that appears in IMPASSE?",
    "indicator_hint": "Which of the remaining words are wordplay indicators?"
  }
}
```

**Key fields:**
- `common_vocabulary` — The word with a well-known cryptic meaning that appears in the hypothesis
- `expected_indicators` — The indicator words and what operations they signal
- User must TYPE the synonym to confirm it applies
- User must TAP the indicators to identify them

**Teaching moment:**
- "fool = ASS, and ASS appears in IMPASSE. You have 3 anchored letters."
- "Brief = deletion (shorten something)"
- "about = container (something surrounds something)"
- "IMPASSE (7) - ASS (3) = 4 letters needed from 'Brief press'"

### deletion_discover

**Purpose:** Discover the result of a deletion operation by working backwards from the hypothesis. Guides the user through the discovery process: first find the synonym, then choose which letter to delete.

**Phases (dynamically generated):**
1. `fodder` — Tap the word the deletion indicator operates on (inputMode: tap_words)
   - Prompt: "'Brief' is a deletion indicator — it shortens something. Which adjacent word does it operate on?"
   - User taps: "press"
   - Expected: [1]
2. `synonym` — Type the full synonym before deletion (inputMode: text)
   - Prompt: "You have ASS from 'fool' (3 letters). 'Brief' 'press' needs to give you 4 more letters. Shortening 'press' directly doesn't fit IMPASSE — what synonym of 'press' might work?"
   - User types: IMPEL
   - Expected: IMPEL
3. `result` — Multiple choice: which letter to delete (inputMode: multiple_choice)
   - Prompt: "'Brief' means to shorten. Which letter do you remove from IMPEL?"
   - Options: "Delete first letter I → MPEL" or "Delete last letter L → IMPE"
   - User selects: "Delete last letter L → IMPE"
   - Expected: option index 1 (correct option)
4. `teaching` — Confirms the discovery and teaches the reusable pattern (inputMode: none)
   - "press = IMPEL, shortened = IMPE"
   - **Generic learning:** "Deletion indicators often require finding a synonym first, then shortening it."

**Clue data:**
```json
{
  "type": "deletion_discover",
  "indicator": {"indices": [0], "text": "Brief"},
  "fodder_word": {"indices": [1], "text": "press"},
  "fodder_synonym": "IMPEL",
  "result": "IMPE",
  "letters_needed": 4
}
```

**Key fields:**
- `indicator` — The deletion indicator word
- `fodder_word` — The word to find a synonym for (with indices for tap phase)
- `fodder_synonym` — The synonym that gets shortened (user must type this)
- `result` — The letters after deletion
- `letters_needed` — How many letters the result must be

**Teaching moment (reusable):**
- "press = IMPEL, shortened = IMPE"
- "**Remember:** Deletion indicators often require finding a synonym first, then shortening it."

### container_verify

**Purpose:** Combine two known components using a container operation. The user already has both pieces and knows the container indicator — they must determine which goes inside which and verify the result matches their hypothesis.

**Phases:**
1. `order` — Multiple choice: which piece goes inside which? (inputMode: multiple_choice)
   - Prompt: "'about' means one thing goes around another. Which piece fits inside which to make IMPASSE?"
   - User selects: "ASS goes inside IMPE"
   - Expected: option index 0 (correct option)
2. `result` — Type the combined result (inputMode: text)
   - Prompt: "Put ASS inside IMPE. What do you get?"
   - User types: IMPASSE
   - Expected: IMPASSE
3. `teaching` — Confirms the container operation and teaches the reusable pattern (inputMode: none)
   - "IMP + ASS + E = IMPASSE ✓"
   - **Generic learning:** "Container indicators (about, holds, around, inside, carries) tell you to put one piece inside another. The outer piece splits to wrap the inner piece."

**Clue data:**
```json
{
  "type": "container_verify",
  "indicator": {"indices": [2], "text": "about"},
  "inner": "ASS",
  "outer": "IMPE",
  "options": [
    {"label": "ASS goes inside IMPE", "correct": true},
    {"label": "IMPE goes inside ASS", "correct": false}
  ],
  "result": "IMPASSE",
  "training": {
    "order_hint": "'about' means one thing goes around another. Which piece fits inside which to make IMPASSE?",
    "result_hint": "Put ASS inside IMPE. What do you get?"
  }
}
```

**Key fields:**
- `indicator` — The container indicator word (already identified)
- `inner` — The piece that goes inside
- `outer` — The piece that wraps around
- `options` — Multiple choice for container order
- `result` — The final combined result

**Teaching moment (reusable):**
- "IMP + ASS + E = IMPASSE ✓"
- "**Remember:** Container indicators (about, holds, around, inside, carries) tell you to put one piece inside another. The outer piece splits to wrap the inner piece."

### anagram_find

**Purpose:** Identify anagram indicator and fodder.

**Phases:**
1. `indicator` — Tap the anagram indicator (inputMode: tap_words)
2. `fodder` — Tap the fodder to be rearranged (inputMode: tap_words)
3. `teaching` — Shows the anagram components (inputMode: none)

**Clue data:**
```json
{
  "type": "anagram_find",
  "indicator": {"indices": [4], "text": "busy"},
  "fodder": {"indices": [2, 3], "text": "lymph too"},
  "result": "LYMPHTOO",
  "letterCount": 8
}
```

**Special behavior:** Teaching message varies based on whether letter count matches enumeration (complete vs partial anagram).

### training.hint Override

Steps can include a `training.hint` field to override the template's panel instruction for specific phases. This provides pedagogically-focused guidance on how to approach the step (rather than just stating the result).

**Supported phases:**
- `letter_selection` → `result` phase
- `container` → `order` phase

**Example:**
```json
{
  "type": "letter_selection",
  "training": {
    "hint": "Look for a phrase that suggests taking the final letters of specific words in the clue."
  }
}
```

### letter_selection

**Purpose:** Extract specific letters from words.

**Phases:**
1. `indicator` — Tap the letter selection indicator (inputMode: tap_words)
2. `fodder` — Tap the source words (inputMode: tap_words)
3. `result` — Type the extracted letters (inputMode: text)
4. `teaching` — Shows the extraction (inputMode: none)

**Clue data:**
```json
{
  "type": "letter_selection",
  "indicator": {"indices": [8, 9], "text": "at last"},
  "fodder": {"indices": [6, 7], "text": "conclude job"},
  "extractionType": "last letter",
  "result": "EB"
}
```

### container

**Purpose:** One thing goes inside another.

**Phases:**
1. `indicator` — Tap the container indicator (inputMode: tap_words)
2. `order` — Multiple choice: what goes inside what (inputMode: multiple_choice)
3. `teaching` — Shows the insertion (inputMode: none)

**Clue data:**
```json
{
  "type": "container",
  "indicator": {"indices": [5], "text": "nurses"},
  "inner": "EB",
  "outer": "LYMPHTOO",
  "options": [
    {"label": "EB goes inside LYMPHTOO", "correct": true},
    {"label": "LYMPHTOO goes inside EB", "correct": false}
  ],
  "result": "LYMPH EB TOO"
}
```

### anagram_solve

**Purpose:** Rearrange gathered letters to find the answer.

**Phases:**
1. `result` — Type the final answer (inputMode: text)
2. `teaching` — Confirms the solution (inputMode: none)

**Clue data:**
```json
{
  "type": "anagram_solve",
  "fodder": "LYMPHEBTOO",
  "result": "PHLEBOTOMY",
  "letterCount": 10,
  "definition": "drawing blood"
}
```

### double_definition

**Purpose:** Find two definitions that both mean the same word.

**Phases:**
1. `first_def` — Tap the first definition (inputMode: tap_words)
2. `second_def` — Tap the second definition (inputMode: tap_words)
3. `solve` — Type the word that matches both (inputMode: text)
4. `teaching` — Confirms both definitions (inputMode: none)

**Clue data:**
```json
{
  "type": "double_definition",
  "definitions": [
    {"indices": [0], "text": "Dog"},
    {"indices": [1], "text": "lead"}
  ],
  "result": "POINTER"
}
```

### synonym

**Purpose:** Find a synonym for a word.

**Phases:**
1. `fodder` — Tap the word to find a synonym for (inputMode: tap_words)
2. `result` — Type the synonym (inputMode: text)
3. `teaching` — Shows the synonym relationship (inputMode: none)

**Clue data:**
```json
{
  "type": "synonym",
  "fodder": {"indices": [0], "text": "Mums"},
  "result": "MOTHERS"
}
```

### abbreviation

**Purpose:** Recognize a standard abbreviation.

**Phases:**
1. `fodder` — Tap the word to abbreviate (inputMode: tap_words)
2. `result` — Type the abbreviation (inputMode: text)
3. `teaching` — Shows the abbreviation (inputMode: none)

**Clue data:**
```json
{
  "type": "abbreviation",
  "fodder": {"indices": [4], "text": "hot"},
  "result": "H"
}
```

### deletion

**Purpose:** Remove letters from a word.

**Phases:**
1. `indicator` — Tap the deletion indicator (inputMode: tap_words)
2. `result` — Type what remains after deletion (inputMode: text)
3. `teaching` — Shows the deletion (inputMode: none)

**Clue data:**
```json
{
  "type": "deletion",
  "indicator": {"indices": [1], "text": "dropping"},
  "fodder": "MOTHERS",
  "deleteTarget": "others",
  "result": "M"
}
```

### charade

**Purpose:** Join components in sequence.

**Phases:**
1. `teaching` — Shows how components join (inputMode: none)

**Clue data:**
```json
{
  "type": "charade",
  "components": ["M", "AS", "H"],
  "result": "MASH"
}
```

### hidden

**Purpose:** Find answer hidden within consecutive letters.

**Phases:**
1. `indicator` — Tap the hidden word indicator (inputMode: tap_words)
2. `fodder` — Tap the words containing the hidden answer (inputMode: tap_words)
3. `teaching` — Shows where answer is hidden (inputMode: none)

**Clue data:**
```json
{
  "type": "hidden",
  "indicator": {"indices": [0], "text": "Some"},
  "fodder": {"indices": [1,2,3,4], "text": "impor tant Ra stafarian"},
  "result": "TANTRA"
}
```

### homophone

**Purpose:** Sound-alike of another word.

**Phases:**
1. `indicator` — Tap the homophone indicator (inputMode: tap_words)
2. `result` — Type the sound-alike word (inputMode: text)
3. `teaching` — Shows the homophone (inputMode: none)

**Clue data:**
```json
{
  "type": "homophone",
  "indicator": {"indices": [0,1], "text": "Delivery of"},
  "fodder": "THROUGH",
  "result": "THREW"
}
```

### reversal

**Purpose:** Reverse letters of a word/phrase.

**Phases:**
1. `indicator` — Tap the reversal indicator (inputMode: tap_words)
2. `fodder` — Tap the words to reverse (inputMode: tap_words)
3. `teaching` — Shows the reversal (inputMode: none)

**Clue data:**
```json
{
  "type": "reversal",
  "indicator": {"indices": [0,1], "text": "Travelling west"},
  "fodder": {"indices": [3,4,5,6,7], "text": "Nav arre I s pot"},
  "result": "TOPSIERRAVAN"
}
```

### literal_phrase

**Purpose:** Recognize phrases that sound like something else when spoken aloud.

**Phases:**
1. `fodder` — Tap the phrase that sounds like something else (inputMode: tap_words)
2. `result` — Type what the phrase sounds like when spoken (inputMode: text)
3. `teaching` — Shows the spoken interpretation (inputMode: none)

**Clue data:**
```json
{
  "type": "literal_phrase",
  "fodder": {"indices": [3, 4, 5], "text": "do you mean?"},
  "result": "ISIT",
  "letters_needed": 4,
  "note": "The question 'do you mean?' reads as its spoken equivalent 'IS IT'"
}
```

---

## Information-Driven Step Templates (V2)

These templates support the hypothesis-driven solving approach where solvers:
1. Find the definition and form a hypothesis
2. Scan for **common vocabulary** (anchors they know cold) and **indicators**
3. Start with what they KNOW, then discover unknowns by working from the hypothesis

### charade_verify

**Purpose:** Combine known components in sequence and verify they form part of (or all of) the hypothesis.

**When to use:** After `wordplay_overview` when the solver has identified multiple common vocabulary items that chain together.

**Phases:**
1. `result` — Type the combined result (inputMode: text)
   - Prompt: "Combine your known pieces: IN + SIP = ?"
   - User types: INSIP
   - Expected: INSIP
2. `teaching` — Confirms the charade and shows progress (inputMode: none)
   - "IN + SIP = INSIP (5 letters). You have 5 of 7 letters for INSIPID."

**Clue data:**
```json
{
  "type": "charade_verify",
  "components": ["IN", "SIP"],
  "result": "INSIP",
  "letters_so_far": 5,
  "letters_needed": 7,
  "training": {
    "hint": "Combine your known pieces in order. What do you get?"
  }
}
```

**Key fields:**
- `components` — The known pieces to combine (from common vocabulary)
- `result` — The combined result
- `letters_so_far` — How many letters the combined result gives
- `letters_needed` — Total letters needed for the answer

**Teaching moment:**
- "IN + SIP = INSIP (5 letters). You have 5 of 7 letters for INSIPID."

### alternation_discover

**Purpose:** Extract alternating letters from fodder to discover remaining letters needed for hypothesis.

**When to use:** When solver has identified an alternation indicator (e.g., "by turns", "oddly", "evenly", "regularly") adjacent to fodder.

**Phases:**
1. `result` — Type the extracted letters (inputMode: text)
   - Prompt: "'by turns' means take alternating letters from m-i-l-d. Which letters complete INSIPID?"
   - User types: ID
   - Expected: ID
2. `teaching` — Confirms the alternation pattern (inputMode: none)
   - "Taking alternate letters from m-i-l-d: **i**, **d** = ID"
   - **Generic learning:** "Alternation indicators (by turns, oddly, evenly, regularly) tell you to take every other letter."

**Clue data:**
```json
{
  "type": "alternation_discover",
  "indicator": {"indices": [2, 3], "text": "by turns"},
  "fodder": {"indices": [4, 5, 6, 7], "text": "m i l d"},
  "result": "ID",
  "letters_needed": 2,
  "pattern": "even",
  "training": {
    "hint": "'by turns' means take alternating letters. Which letters complete your hypothesis?"
  }
}
```

**Key fields:**
- `indicator` — The alternation indicator word(s)
- `fodder` — The letters to alternate through
- `result` — The extracted letters
- `letters_needed` — How many letters this should produce
- `pattern` — "odd" (1st, 3rd, 5th...) or "even" (2nd, 4th, 6th...)

**Teaching moment (reusable):**
- "Taking alternate letters from m-i-l-d: **i**, **d** = ID"
- "**Remember:** Alternation indicators (by turns, oddly, evenly, regularly) tell you to take every other letter."

### anagram_discover

**Purpose:** Rearrange known fodder letters to match the hypothesis. Used when anagram indicator and fodder are already identified via `wordplay_overview`.

**When to use:** After identifying anagram indicator and fodder in overview step.

**Phases:**
1. `result` — Type the anagrammed result (inputMode: text)
   - Prompt: "Rearrange DETAILMANY to match your hypothesis."
   - User types: ANIMATEDLY
   - Expected: ANIMATEDLY
2. `teaching` — Confirms the anagram (inputMode: none)
   - "DETAIL MANY rearranges to ANIMATEDLY ✓"

**Clue data:**
```json
{
  "type": "anagram_discover",
  "indicator": {"indices": [2], "text": "works"},
  "fodder": {"indices": [0, 1], "text": "Detail many"},
  "fodder_letters": "DETAILMANY",
  "result": "ANIMATEDLY",
  "training": {
    "hint": "Rearrange these letters to match your hypothesis."
  }
}
```

**Key fields:**
- `indicator` — The anagram indicator word
- `fodder` — The words providing letters
- `fodder_letters` — The letters to rearrange (uppercase, no spaces)
- `result` — The anagrammed answer

**Teaching moment:**
- "DETAIL MANY rearranges to ANIMATEDLY ✓"

### hidden_discover

**Purpose:** Find the answer hidden within consecutive letters of the fodder.

**When to use:** When solver identifies a hidden word indicator (e.g., "some", "in", "part of", "within", "jails/contains").

**Phases:**
1. `result` — Type the hidden word (inputMode: text)
   - Prompt: "Find the 4-letter word hidden in 'suspect s to p opulate'"
   - User types: STOP
   - Expected: STOP
2. `teaching` — Shows where the word is hidden (inputMode: none)
   - "suspec**t s to p** opulate contains STOP"

**Clue data:**
```json
{
  "type": "hidden_discover",
  "indicator": {"indices": [6], "text": "jails"},
  "fodder": {"indices": [1, 2, 3, 4, 5], "text": "suspect s to p opulate"},
  "result": "STOP",
  "training": {
    "hint": "The answer is hidden in consecutive letters. Can you find it?"
  }
}
```

**Key fields:**
- `indicator` — The hidden word indicator
- `fodder` — The words containing the hidden answer
- `result` — The hidden word

**Teaching moment:**
- "suspec**t s to p** opulate contains STOP"

### double_definition_verify

**Purpose:** For double definition clues where there's no wordplay — just two definitions pointing to the same word.

**When to use:** When clue type is identified as Double Definition.

**Phases:**
1. `first_def` — Tap the first definition (inputMode: tap_words)
2. `second_def` — Tap the second definition (inputMode: tap_words)
3. `result` — Type the word that matches both (inputMode: text)
4. `teaching` — Confirms both definitions (inputMode: none)
   - "DUCK = to dodge AND a zero score in cricket ✓"

**Clue data:**
```json
{
  "type": "double_definition_verify",
  "definitions": [
    {"indices": [0, 1, 2], "text": "Manage to avoid"},
    {"indices": [3, 4, 5, 6], "text": "ignominious score in test"}
  ],
  "result": "DUCK",
  "training": {
    "hint": "What single word means both of these things?"
  }
}
```

**Key fields:**
- `definitions` — Array of two definition objects with indices and text
- `result` — The word that matches both definitions

**Teaching moment:**
- "DUCK = to dodge AND a zero score in cricket ✓"

### reversal_discover

**Purpose:** Reverse known letters to discover part of the answer.

**When to use:** When reversal indicator is identified and operates on common vocabulary.

**Phases:**
1. `result` — Type the reversed letters (inputMode: text)
   - Prompt: "'withdrawing' reverses EG. What do you get?"
   - User types: GE
   - Expected: GE
2. `teaching` — Confirms the reversal (inputMode: none)
   - "EG reversed = GE"
   - **Generic learning:** "Reversal indicators (back, returning, up [down clues], west [across clues]) tell you to reverse the letters."

**Clue data:**
```json
{
  "type": "reversal_discover",
  "indicator": {"indices": [5], "text": "withdrawing"},
  "fodder": "EG",
  "fodder_source": {"indices": [3, 4], "text": "for one"},
  "result": "GE",
  "training": {
    "hint": "Reverse the letters. What do you get?"
  }
}
```

**Key fields:**
- `indicator` — The reversal indicator word
- `fodder` — The letters to reverse
- `fodder_source` — Where the fodder came from in the clue
- `result` — The reversed letters

**Teaching moment (reusable):**
- "EG reversed = GE"
- "**Remember:** Reversal indicators (back, returning, up [down clues], west [across clues]) tell you to reverse the letters."

---

## Generic Hints (V2 Templates)

Hints should NOT give away the answer. They should guide the user's thinking process.

| Template | Phase | Generic Hint |
|----------|-------|--------------|
| `standard_definition` | select | "The definition is always at the start or end of the clue." |
| `wordplay_overview` | vocabulary_tap | "Look for a word with a synonym that might appear in your answer." |
| `wordplay_overview` | vocabulary_type | "What's the common cryptic synonym for this word?" |
| `wordplay_overview` | indicator_scan | "Which remaining words signal wordplay operations (deletion, container, reversal, anagram, etc.)?" |
| `deletion_discover` | fodder | "Indicators operate on adjacent words." |
| `deletion_discover` | synonym | "Shortening the word directly doesn't fit — what synonym might work?" |
| `deletion_discover` | result | "Which letter do you remove to get the letters you need?" |
| `container_verify` | order | "'about' means one thing surrounds another. Which arrangement fits your hypothesis?" |
| `container_verify` | result | "The outer piece splits to wrap the inner piece." |
| `charade_verify` | result | "Combine your known pieces in order. What do you get?" |
| `alternation_discover` | result | "Take alternating letters. Which letters complete your hypothesis?" |
| `anagram_discover` | result | "Rearrange these letters to match your hypothesis." |
| `hidden_discover` | result | "The answer is hidden in consecutive letters. Can you find it?" |
| `reversal_discover` | result | "Reverse the letters. What do you get?" |

**Key principle:** Hints are generic and reusable across clues. They guide the solving PROCESS, not the specific answer.

---

## Training Sequence Simulator

For a complete walkthrough of how training flows work in practice, see:

**[TRAINING_SEQUENCE_1A.md](./TRAINING_SEQUENCE_1A.md)** — Full simulation of 1A IMPASSE

This document shows:
- Exact UI layout at each phase
- What the user sees (clue, highlights, input area, hints)
- Expected user response at each step
- Teaching content displayed after correct answers

Use this as a reference when creating new clue metadata to ensure the flow is pedagogically sound.

---

## Server API

### Authentication

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/login` | POST | Authenticate user |

**Credentials:**
- Username: `andrew`
- Password: `cryptic`
- Role: `admin`

**Request:**
```json
{
  "username": "andrew",
  "password": "cryptic"
}
```

**Response (success):**
```json
{
  "success": true,
  "user": {
    "username": "andrew",
    "role": "admin"
  }
}
```

**Response (failure):**
```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

### Admin Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clues/<id>/admin` | PATCH | Update admin fields on a clue |

**Request:**
```json
{
  "verified": true,
  "reported_issue": "Definition seems incorrect"
}
```

Both fields are optional. `verified` is a boolean, `reported_issue` is a string (or null to clear).

**Response:**
```json
{
  "success": true,
  "verified": true,
  "reported_issue": "Definition seems incorrect"
}
```

**TrainingItem Admin Fields:**

These fields are stored on training items for admin review:

| Field | Type | Description |
|-------|------|-------------|
| `verified` | boolean | Admin has verified clue is correct |
| `reported_issue` | string \| null | Description of any issue with the clue |

### Clue Storage

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/clues` | GET | List all training items |
| `/clues` | POST | Save/update a single clue |
| `/clues/<id>` | DELETE | Delete a clue by ID |
| `/clues/import` | POST | Import puzzle file |
| `/clues/bulk` | POST | Bulk import clues |
| `/clues/clear` | POST | Clear all clues |

### Training Flow

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/training/start` | POST | Start training session |
| `/training/input` | POST | Submit user input (tap/text/choice) |
| `/training/continue` | POST | Continue through teaching phase |
| `/training/clear` | POST | Clear session (on exit) — returns `{success, cleared}` |
| `/training/learnings` | POST | Get all learnings for a clue — returns `{success, learnings[]}` |

### Settings

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/settings` | GET | Get current settings |
| `/settings` | POST | Update settings |

### Other

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/solve` | POST | Solve a clue with proof trace |
| `/parser-issues` | GET/POST | Parser issue tracking |
| `/import-logs` | GET | List import logs |
| `/import-logs/<id>` | DELETE | Delete single import log |
| `/import-logs?clearAll=true` | DELETE | Clear all import logs |

### Training API Details

#### Start Session

```bash
curl -X POST localhost:5001/training/start \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1"}'
```

**Response:**
```json
{
  "success": true,
  "render": { ... }
}
```

#### Submit Input

```bash
# Tap words (indices)
curl -X POST localhost:5001/training/input \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1","value":[0,1]}'

# Text input
curl -X POST localhost:5001/training/input \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1","value":"PHLEBOTOMY"}'

# Multiple choice (option index)
curl -X POST localhost:5001/training/input \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1","value":0}'
```

**Response (correct):**
```json
{
  "success": true,
  "correct": true,
  "render": { ... }
}
```

**Response (wrong):**
```json
{
  "success": true,
  "correct": false,
  "message": "Not quite - look at the start or end",
  "render": { ... }
}
```

#### Continue (Teaching Phase)

```bash
curl -X POST localhost:5001/training/continue \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1"}'
```

**Response:**
```json
{
  "success": true,
  "render": { ... }
}
```

---

## React Components

### App.tsx

**Purpose:** Main application shell, routing, view state management, user authentication.

**State:**
- `viewState` — Current screen (HOME, PUBLICATION, TRAINING, SOLVER, MANUAL_ENTRY)
- `isDbReady` — Database initialization complete
- `isAdminUnlocked` — Admin mode enabled (password: `dojoMaster`)
- `showDataManager` — DataManager modal visible
- `user` — Logged-in user object (`{ username, role }`) or null
- `showLoginModal` — Login modal visible

**Renders:**
- Home screen with publication tiles
- Publication detail with mode buttons
- TrainingMode, SolverMode, ManualEntryMode based on viewState
- DataManager modal
- Password modal for admin access
- Login modal for user authentication

**User Authentication:**
- Login button in header opens login modal
- On successful login, `user` state is set and passed to child components
- Admin users (role: `admin`) see admin controls in training views

### TrainingMode.tsx

**Purpose:** Manages training queue and progress.

**Props:**
- `publicationId` — Which publication's clues to load
- `onExit` — Called when user exits training
- `user` — Logged-in user (for admin filtering)

**State:**
- `queue` — Array of TrainingItems with steps
- `currentIndex` — Current position in queue
- `score`, `streak` — Progress tracking
- `forceSolved` — When true, triggers immediate solved view

**Behavior:**
1. Loads clues from server, filters to V3 format (has `steps`)
2. **If admin**: Loads admin filter settings and applies them:
   - `showOnlyUnverified`: filters to clues where `verified !== true`
   - `showOnlyWithIssues`: filters to clues where `reported_issue` is set
3. Renders header with progress, score, skip button
4. Renders TemplateTrainer for current clue
5. Advances on complete, shows alert when queue exhausted

### TemplateTrainer.tsx

**Purpose:** Server-driven training UI component.

**Props:**
- `clueId` — Clue identifier
- `clueText` — Full clue text
- `enumeration` — Letter count (e.g., "10" or "3-4")
- `answer` — Correct answer string (required)
- `clueNumber` — Optional clue number (e.g., "1A")
- `onComplete` — Called when training complete
- `onBack` — Called when user exits
- `forceSolved` — When true, immediately shows solved view with all learnings
- `letterChecking` — Enable green/red letter feedback (default: true)
- `user` — Logged-in user object (enables admin controls if role is `admin`)

**State:**
- `render` — Server response (source of truth)
- `selectedIndices` — Tapped word indices (pre-submit)
- `textInput` — Typed text (pre-submit)
- `selectedOption` — Selected choice index (pre-submit)
- `feedback` — Error message after wrong answer

**API Calls:**
- `trainingStart(clueId)` — On mount
- `trainingInput(clueId, value)` — On check button
- `trainingContinue(clueId)` — On continue button
- `trainingLearnings(clueId)` — When forceSolved or early answer solve
- `trainingClear(clueId)` — On exit (allows fresh start next time)
- `updateClueAdmin(clueId, data)` — When admin updates verified/reported_issue

**Admin Controls (solved view only, admin users):**
- **Verified checkbox** — Mark clue as verified correct
- **Report issue input** — Submit description of any problem with the clue

### CrosswordInput.tsx

**Purpose:** Crossword-style letter boxes for answer entry.

**Props:**
- `length` — Number of letter boxes
- `value` — Current input string
- `onChange` — Called when input changes
- `onSubmit` — Called when Enter pressed
- `disabled` — Disable input
- `autoFocus` — Focus first empty box on mount
- `correctAnswer` — If provided, enables letter checking
- `letterChecking` — Show green/red feedback per letter

**Behavior:**
- Arrow keys navigate between boxes
- Backspace moves to previous box when empty
- Paste fills boxes from clipboard
- Letter checking compares against `correctAnswer` (strips non-alpha first)

### AdminSetup.tsx

**Purpose:** Admin settings page for configuring training queue filters.

**Props:**
- `onExit` — Called when user exits to home
- `username` — Logged-in admin username

**Features:**
- **Filter: Show only unverified** — Toggle to filter training queue to clues where `verified !== true`
- **Filter: Show only with issues** — Toggle to filter training queue to clues where `reported_issue` is set

**Behavior:**
1. Loads current settings on mount (`GET /settings`)
2. Toggle changes save immediately (`POST /settings`)
3. TrainingMode respects these filters when loading queue

### services/clueManager.ts

**Purpose:** API client for server communication.

**Types:**
- `User` — `{ username: string, role: 'admin' | 'guest' }`
- `LoginResponse` — `{ success: boolean, user?: User, error?: string }`
- `UpdateClueAdminResponse` — `{ success: boolean, verified?: boolean, reported_issue?: string | null, error?: string }`

**Functions:**
- `initializeClues()` — Load initial clue data
- `getTrainingQueue(publicationId)` — Get clues for training
- `getClueCount(publicationId)` — Count clues
- `trainingStart(clueId)` — Start training session
- `trainingInput(clueId, value)` — Submit user input
- `trainingContinue(clueId)` — Continue through teaching
- `trainingLearnings(clueId)` — Get all learnings for a clue (early solve)
- `trainingClear(clueId)` — Clear session on exit
- `login(username, password)` — Authenticate user, returns `LoginResponse`
- `updateClueAdmin(clueId, data)` — Update admin fields (verified, reported_issue)

---

## File Inventory

### Python Server (cryptic_trainer_bundle/)

| File | Purpose |
|------|---------|
| `server.py` | HTTP server, routing, clue storage, training endpoints |
| `training_handler.py` | Step templates (STEP_TEMPLATES), session management, render generation, `parse_enumeration()` helper |
| `cryptic_trainer.py` | Solver engine |
| `clues_db.json` | Data storage (training_items, import_logs, parser_issues) |

### React UI (root)

| File | Purpose |
|------|---------|
| `App.tsx` | Main app, navigation, view state |
| `components/TrainingMode.tsx` | Training queue management |
| `components/TemplateTrainer.tsx` | Server-driven training UI |
| `components/CrosswordInput.tsx` | Crossword-style letter boxes for input |
| `components/SolverMode.tsx` | AI-assisted solving |
| `components/ManualEntryMode.tsx` | Clue entry, puzzle import |
| `components/DataManager.tsx` | Admin data management |
| `components/AdminSetup.tsx` | Admin filter settings |
| `services/clueManager.ts` | API client |
| `types.ts` | TypeScript type definitions |
| `data/index.ts` | Publication/setter data |

### Documentation

| File | Purpose |
|------|---------|
| `DESIGN_SPEC.md` | This document — complete system design |
| `CLAUDE.md` | Claude Code rules and conventions |
| `README.md` | Quick start guide |

---

## Complete Clue Example

### PHLEBOTOMY

**Clue:** "Drawing blood, lymph too, busy nurses conclude job at last" (10)

**Answer:** PHLEBOTOMY

**Training Flow:**

| Step | Type | Action |
|------|------|--------|
| -1 | clue_type_identify | Select "Standard" |
| 0 | standard_definition | Tap "Drawing blood" |
| 1 | anagram_find | Tap indicator "busy", fodder "lymph too" |
| 2 | letter_selection | Tap indicator "at last", fodder "conclude job", type "EB" |
| 3 | container | Tap indicator "nurses", select "EB goes inside LYMPHTOO" |
| 4 | anagram_solve | Type "PHLEBOTOMY" |

**Stored Data:**
```json
{
  "id": "phlebotomy-1",
  "clue": {
    "number": "1A",
    "text": "Drawing blood, lymph too, busy nurses conclude job at last",
    "enumeration": "10",
    "answer": "PHLEBOTOMY"
  },
  "words": ["Drawing", "blood", "lymph", "too", "busy", "nurses", "conclude", "job", "at", "last"],
  "steps": [
    {
      "type": "standard_definition",
      "expected": {"indices": [0, 1], "text": "Drawing blood"},
      "position": "start"
    },
    {
      "type": "anagram_find",
      "indicator": {"indices": [4], "text": "busy"},
      "fodder": {"indices": [2, 3], "text": "lymph too"},
      "result": "LYMPHTOO",
      "letterCount": 8
    },
    {
      "type": "letter_selection",
      "indicator": {"indices": [8, 9], "text": "at last"},
      "fodder": {"indices": [6, 7], "text": "conclude job"},
      "extractionType": "last letter",
      "result": "EB"
    },
    {
      "type": "container",
      "indicator": {"indices": [5], "text": "nurses"},
      "inner": "EB",
      "outer": "LYMPHTOO",
      "options": [
        {"label": "EB goes inside LYMPHTOO", "correct": true},
        {"label": "LYMPHTOO goes inside EB", "correct": false}
      ],
      "result": "LYMPH EB TOO"
    },
    {
      "type": "anagram_solve",
      "fodder": "LYMPHEBTOO",
      "result": "PHLEBOTOMY",
      "letterCount": 10,
      "definition": "drawing blood"
    }
  ]
}
```

### POINTER (Double Definition)

**Clue:** "Dog lead" (7)

**Answer:** POINTER

**Training Flow:**

| Step | Type | Action |
|------|------|--------|
| -1 | clue_type_identify | Select "Double Definition" |
| 0 | double_definition | Tap "Dog", tap "lead", type "POINTER" |

**Stored Data:**
```json
{
  "id": "times-2025-27a",
  "clue": {
    "number": "27A",
    "text": "Dog lead",
    "enumeration": "7",
    "answer": "POINTER"
  },
  "words": ["Dog", "lead"],
  "steps": [
    {
      "type": "double_definition",
      "definitions": [
        {"indices": [0], "text": "Dog"},
        {"indices": [1], "text": "lead"}
      ],
      "result": "POINTER"
    }
  ]
}
```

---

## Verification

### Manual Testing

1. Start servers:
```bash
# Terminal 1
cd cryptic_trainer_bundle && python3 server.py

# Terminal 2
npm run dev
```

2. Test training API:
```bash
# Start session
curl -X POST localhost:5001/training/start \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1"}'

# Submit clue type (index 0 = Standard)
curl -X POST localhost:5001/training/input \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1","value":0}'

# Continue through teaching
curl -X POST localhost:5001/training/continue \
  -H "Content-Type: application/json" \
  -d '{"clueId":"phlebotomy-1"}'
```

3. Test in browser:
   - Open http://localhost:3000
   - Select a publication
   - Click "Training Mode"
   - Complete the training flow

### Test Checklist

| Test | Verifies |
|------|----------|
| Session start | Returns step -1 (clue type), phase 0 |
| Clue type select | Correct choice advances to step 0 |
| Definition select | Correct indices advance to teaching |
| Wrong selection | Returns feedback message, stays on phase |
| Teaching continue | Advances to next step |
| Full flow | All steps complete correctly |
| Highlights accumulate | Each correct answer adds to highlights array |
| Complete state | `render.complete = true` at end |
