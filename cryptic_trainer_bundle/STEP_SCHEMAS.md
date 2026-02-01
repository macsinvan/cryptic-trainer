# Step Schemas for Clue Metadata

This document defines the expected JSON schema for each step type in puzzle files.

---

## General Clue Structure

```json
{
  "clue-id": {
    "clue": {
      "number": "1A",
      "text": "Full clue text",
      "enumeration": "6",
      "answer": "ANSWER",
      "definition": [
        {"text": "definition words", "position": "start|end"}
      ]
    },
    "difficulty": {
      "definition": {"rating": "easy|medium|hard", "hint": "..."},
      "wordplay": {"rating": "easy|medium|hard", "hint": "..."},
      "overall": "easy|medium|hard",
      "recommendedApproach": "definition|wordplay"
    },
    "words": ["word1", "word2", "..."],
    "steps": [...]
  }
}
```

---

## Step Types

### standard_definition

Find the definition at start or end of clue.

```json
{
  "type": "standard_definition",
  "expected": {
    "indices": [0, 1],
    "text": "Come by"
  },
  "position": "start"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `expected.indices` | number[] | Yes | Word indices for the definition |
| `expected.text` | string | Yes | The definition text |
| `position` | string | Yes | "start" or "end" |

---

### abbreviation

Recognize a standard abbreviation.

```json
{
  "type": "abbreviation",
  "fodder": {
    "indices": [2],
    "text": "five"
  },
  "result": "V"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fodder.indices` | number[] | Yes | Word indices to abbreviate |
| `fodder.text` | string | Yes | The word(s) to abbreviate |
| `result` | string | Yes | The abbreviation |

**Breadcrumb:** `ABBREVIATION: five → V`

---

### literal_phrase

Phrase that sounds like something else when spoken.

```json
{
  "type": "literal_phrase",
  "fodder": {
    "indices": [3, 4, 5],
    "text": "do you mean?"
  },
  "result": "ISIT"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fodder.indices` | number[] | Yes | Word indices of the phrase |
| `fodder.text` | string | Yes | The phrase text |
| `result` | string | Yes | What it sounds like |

**Breadcrumb:** `LITERAL PHRASE: do you mean? → ISIT`

---

### synonym

Find a synonym for a word.

```json
{
  "type": "synonym",
  "fodder": {
    "indices": [2],
    "text": "bungle"
  },
  "result": "BISH"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fodder.indices` | number[] | Yes | Word indices to find synonym for |
| `fodder.text` | string | Yes | The word needing a synonym |
| `result` | string | Yes | The synonym |

**Breadcrumb:** `SYNONYM: bungle → BISH`

---

### deletion

Remove letters from a word.

```json
{
  "type": "deletion",
  "indicator": {
    "indices": [0, 1, 2],
    "text": "a lot of"
  },
  "fodder": "KEEN",
  "deletionType": "end",
  "result": "KEE"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `indicator.indices` | number[] | Yes | Word indices of deletion indicator |
| `indicator.text` | string | Yes | The indicator text |
| `fodder` | string | Yes | The word to delete from |
| `deletionType` | string | No | "start", "end", or "middle" |
| `result` | string | Yes | What remains after deletion |

**Breadcrumb:** `DELETION: a lot of KEEN → KEE`

---

### reversal

Reverse letters of a word.

```json
{
  "type": "reversal",
  "indicator": {
    "indices": [4],
    "text": "turns"
  },
  "fodder": "KEE",
  "result": "EEK"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `indicator.indices` | number[] | Yes | Word indices of reversal indicator |
| `indicator.text` | string | Yes | The indicator text |
| `fodder` | string | Yes | The letters to reverse |
| `result` | string | Yes | The reversed letters |

**Breadcrumb:** `REVERSAL: turns KEE → EEK`

---

### letter_selection

Extract specific letters from a word.

```json
{
  "type": "letter_selection",
  "indicator": {
    "indices": [3, 4],
    "text": "head of"
  },
  "fodder": {
    "indices": [5],
    "text": "office"
  },
  "extractionType": "first",
  "result": "O"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `indicator.indices` | number[] | Yes | Word indices of selection indicator |
| `indicator.text` | string | Yes | The indicator text |
| `fodder.indices` | number[] | Yes | Word indices of source word |
| `fodder.text` | string | Yes | The source word |
| `extractionType` | string | Yes | "first", "last", "middle", "edges" |
| `result` | string | Yes | The extracted letter(s) |

**Breadcrumb:** `LETTER SELECTION: head of office → O`

---

### literal

Use word/letters directly as-is.

```json
{
  "type": "literal",
  "fodder": {
    "indices": [6],
    "text": "IT"
  },
  "result": "IT"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fodder.indices` | number[] | Yes | Word indices used literally |
| `fodder.text` | string | Yes | The literal text |
| `result` | string | Yes | The letters contributed |

**Breadcrumb:** `LITERAL: IT → IT`

---

### anagram

Rearrange letters to form a word.

```json
{
  "type": "anagram",
  "indicator": {
    "indices": [7, 8],
    "text": "struggles with"
  },
  "fodder": ["O", "IT", "PC"],
  "result": "OPTIC"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `indicator.indices` | number[] | Yes | Word indices of anagram indicator |
| `indicator.text` | string | Yes | The indicator text |
| `fodder` | string[] | Yes | The letters/components to rearrange |
| `result` | string | Yes | The anagrammed word |

**Breadcrumb:** `ANAGRAM: struggles with O+IT+PC → OPTIC`

---

### charade_verify

Combine components in sequence (final step).

```json
{
  "type": "charade_verify",
  "components": ["BISH", "OP"],
  "result": "BISHOP",
  "letters_so_far": 6,
  "letters_needed": 6
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `components` | string[] | Yes | The pieces to combine |
| `result` | string | Yes | The combined result |
| `letters_so_far` | number | No | Letters in result |
| `letters_needed` | number | No | Total letters needed |

**Breadcrumb:** `SOLVED!` (if complete) or `CHARADE: BISH + OP → BISHOP`

---

### double_definition

Two definitions pointing to same word.

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

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `definitions` | array | Yes | Two definition objects |
| `definitions[].indices` | number[] | Yes | Word indices |
| `definitions[].text` | string | Yes | Definition text |
| `result` | string | Yes | The answer |

**Breadcrumb:** `DOUBLE DEFINITION`

---

## V2 Step Types (Hypothesis-Driven)

These step types support the hypothesis-driven solving approach where solvers form a hypothesis from the definition, then verify it through wordplay.

### wordplay_overview

Scan remaining wordplay for anchors (common vocabulary) and indicators.

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
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `common_vocabulary` | object or array | Yes | Word(s) with known cryptic synonyms |
| `common_vocabulary.indices` | number[] | Yes | Word indices |
| `common_vocabulary.text` | string | Yes | The word |
| `common_vocabulary.meaning` | string | Yes | The cryptic synonym |
| `common_vocabulary.letters` | number | Yes | Letter count |
| `expected_indicators` | array | Yes | Indicator words to find |
| `expected_indicators[].indices` | number[] | Yes | Word indices |
| `expected_indicators[].text` | string | Yes | Indicator text |
| `expected_indicators[].operation` | string | Yes | Operation type |

---

### deletion_discover

Discover deletion by working backwards from hypothesis.

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

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `indicator.indices` | number[] | Yes | Word indices of deletion indicator |
| `indicator.text` | string | Yes | The indicator text |
| `fodder_word.indices` | number[] | Yes | Word indices to find synonym for |
| `fodder_word.text` | string | Yes | The word needing a synonym |
| `fodder_synonym` | string | Yes | The synonym before deletion |
| `result` | string | Yes | Result after deletion |
| `letters_needed` | number | Yes | How many letters needed |

---

### container_verify

Verify container operation with known pieces.

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
  "result": "IMPASSE"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `indicator.indices` | number[] | Yes | Word indices of container indicator |
| `indicator.text` | string | Yes | The indicator text |
| `inner` | string | Yes | The piece that goes inside |
| `outer` | string | Yes | The piece that wraps around |
| `options` | array | Yes | Multiple choice options |
| `result` | string | Yes | The combined result |

---

### alternation_discover

Extract alternating letters from fodder.

```json
{
  "type": "alternation_discover",
  "indicator": {"indices": [3], "text": "turns"},
  "fodder": {"indices": [4], "text": "mild"},
  "result": "ID",
  "letters_needed": 2,
  "pattern": "even"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `indicator.indices` | number[] | Yes | Word indices of alternation indicator |
| `indicator.text` | string | Yes | The indicator text |
| `fodder.indices` | number[] | Yes | Word indices of source |
| `fodder.text` | string | Yes | The source word |
| `result` | string | Yes | The extracted letters |
| `letters_needed` | number | Yes | How many letters needed |
| `pattern` | string | Yes | "odd" or "even" |

---

## Reference Examples (Currently Imported)

### Example 1: IMPASSE (V2 Schema - Hypothesis-Driven)

**Clue:** "Brief press about fool blocking state" (7) = IMPASSE

Uses: `standard_definition` → `wordplay_overview` → `deletion_discover` → `container_verify`

```json
{
  "times-29439-1a": {
    "clue": {
      "number": "1A",
      "text": "Brief press about fool blocking state",
      "enumeration": "7",
      "answer": "IMPASSE",
      "definition": [{"text": "blocking state", "position": "end"}]
    },
    "difficulty": {
      "definition": {"rating": "easy", "hint": "'blocking state' suggests reaching a deadlock — find a common word that fits this definition"},
      "wordplay": {"rating": "hard", "reasoning": "Nested container + deletion + obscure synonym (press=IMPEL)"},
      "overall": "medium",
      "recommendedApproach": "definition"
    },
    "words": ["Brief", "press", "about", "fool", "blocking", "state"],
    "steps": [
      {
        "type": "standard_definition",
        "expected": {"indices": [4, 5], "text": "blocking state"},
        "position": "end"
      },
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
        ]
      },
      {
        "type": "deletion_discover",
        "indicator": {"indices": [0], "text": "Brief"},
        "fodder_word": {"indices": [1], "text": "press"},
        "fodder_synonym": "IMPEL",
        "result": "IMPE",
        "letters_needed": 4
      },
      {
        "type": "container_verify",
        "indicator": {"indices": [2], "text": "about"},
        "inner": "ASS",
        "outer": "IMPE",
        "options": [
          {"label": "ASS goes inside IMPE", "correct": true},
          {"label": "IMPE goes inside ASS", "correct": false}
        ],
        "result": "IMPASSE"
      }
    ]
  }
}
```

---

### Example 2: INSIPID (V2 Schema - Multiple Anchors)

**Clue:** "Popular drink, by turns mild and short on taste" (7) = INSIPID

Uses: `standard_definition` → `wordplay_overview` → `alternation_discover` → `charade_verify`

```json
{
  "times-29439-1d": {
    "clue": {
      "number": "1D",
      "text": "Popular drink, by turns mild and short on taste",
      "enumeration": "7",
      "answer": "INSIPID",
      "definition": [{"text": "short on taste", "position": "end"}]
    },
    "difficulty": {
      "definition": {"rating": "easy", "hint": "'short on taste' suggests something bland or lacking flavour — find a common word that fits"},
      "wordplay": {"rating": "easy", "reasoning": "All anchors are common cryptic vocabulary (IN, SIP) plus clear alternation indicator"},
      "overall": "easy",
      "recommendedApproach": "wordplay"
    },
    "words": ["Popular", "drink", "by", "turns", "mild", "and", "short", "on", "taste"],
    "steps": [
      {
        "type": "standard_definition",
        "expected": {"indices": [6, 7, 8], "text": "short on taste"},
        "position": "end"
      },
      {
        "type": "wordplay_overview",
        "definition_solved": true,
        "remaining_indices": [0, 1, 2, 3, 4, 5],
        "remaining_text": "Popular drink, by turns mild and",
        "common_vocabulary": [
          {"indices": [0], "text": "Popular", "meaning": "IN", "letters": 2},
          {"indices": [1], "text": "drink", "meaning": "SIP", "letters": 3}
        ],
        "expected_indicators": [
          {"indices": [3], "text": "turns", "operation": "alternation"}
        ]
      },
      {
        "type": "alternation_discover",
        "indicator": {"indices": [3], "text": "turns"},
        "fodder": {"indices": [4], "text": "mild"},
        "result": "ID",
        "letters_needed": 2,
        "pattern": "even"
      },
      {
        "type": "charade_verify",
        "components": ["IN", "SIP", "ID"],
        "result": "INSIPID",
        "letters_so_far": 7,
        "letters_needed": 7
      }
    ]
  }
}
```

---

### Example 3: VISIT (V1 Schema - Simple Steps)

**Clue:** "Come by five, do you mean?" (5) = VISIT

Uses: `standard_definition` → `abbreviation` → `literal_phrase` → `charade_verify`

```json
{
  "times-29453-11a": {
    "clue": {
      "number": "11A",
      "text": "Come by five, do you mean?",
      "enumeration": "5",
      "answer": "VISIT",
      "definition": [{"text": "Come by", "position": "start"}]
    },
    "difficulty": {
      "definition": {"rating": "easy", "hint": "'Come by' suggests dropping in on someone - find a common 5-letter word for this"},
      "wordplay": {"rating": "easy", "hint": "A Roman numeral followed by a conversational phrase that reads as spoken"},
      "overall": "easy",
      "recommendedApproach": "wordplay"
    },
    "words": ["Come", "by", "five", "do", "you", "mean"],
    "steps": [
      {
        "type": "standard_definition",
        "expected": {"indices": [0, 1], "text": "Come by"},
        "position": "start"
      },
      {
        "type": "abbreviation",
        "fodder": {"indices": [2], "text": "five"},
        "result": "V"
      },
      {
        "type": "literal_phrase",
        "fodder": {"indices": [3, 4, 5], "text": "do you mean?"},
        "result": "ISIT"
      },
      {
        "type": "charade_verify",
        "components": ["V", "ISIT"],
        "result": "VISIT",
        "letters_so_far": 5,
        "letters_needed": 5
      }
    ]
  }
}
```
