# Parser Updates Required

This file collects cases where the parser fails to handle a clue correctly. Each entry documents:
- The clue and answer
- What the parser detected
- What it should have detected
- What template/pattern is missing

---

## Case 1: TONSURE (Acrostic + Charade with Cryptic Definition)

**Date**: 2025-01-02

### Input
```
Times Cryptic 29351
3D Principles of theology ordinands now definitely do in monastery (7)

Answer: TONSURE
Parsing: first letters (principals) of Theology Ordinands Now, plus SURE (definitely).
```

### What Parser Detected
```
Definition: "do in monastery" (END) ✓
Indicator: "principles of" (acrostic) ✓
Fodder: "theology ordinands now definitely" ✗ (includes "definitely" which is separate)
Result: (missing)
```

### What It Should Detect
```
Definition: "do in monastery" (END) - CRYPTIC DEFINITION
  - "do" = hairstyle (cryptic usage)
  - "in monastery" = monk's hairstyle = TONSURE

Wordplay Component 1 (Acrostic):
  - Indicator: "Principles of"
  - Fodder: "theology ordinands now" (3 words only)
  - Result: T.O.N. (first letters)

Wordplay Component 2 (Synonym/Charade):
  - Fodder: "definitely"
  - Result: SURE (synonym)

Assembly: TON + SURE = TONSURE
```

### Missing Templates/Patterns

1. **Acrostic Pattern**
   - Indicator at START, takes first letters of following words
   - Need to detect where acrostic fodder ENDS (before next component)
   - Look for standalone synonym words after acrostic fodder

2. **Multi-Component Detection**
   - Clue has TWO wordplay parts: acrostic + synonym
   - Need to split fodder when there's a standalone synonym word
   - Common pattern: `[indicator] [fodder words] [synonym word] [definition]`

3. **Cryptic Definition Flag**
   - Definition requires insider knowledge
   - Should be flagged in patternData as `definition_type: 'cryptic'`
   - User needs to be told this definition has wordplay

### Suggested Parser Updates

```typescript
// 1. Add standalone synonym detection
const STANDALONE_SYNONYMS = [
  'definitely', 'sure', 'certainly', 'yes',
  'nothing', 'zero', 'nil', 'love',
  'soldier', 'ant', 'worker',
  // ... common short synonym words
];

// 2. For acrostic indicators, split fodder at standalone synonyms
if (indicator.type === 'acrostic') {
  const fodderWords = rawFodder.split(' ');
  const synonymIdx = fodderWords.findIndex(w =>
    STANDALONE_SYNONYMS.includes(w.toLowerCase())
  );
  if (synonymIdx > 0) {
    // Fodder 1 = words before synonym
    // Fodder 2 = the synonym word
    // Result 2 = lookup synonym
  }
}

// 3. Add definition_type to patternData
if (specialCase?.type === 'cryptic_definition') {
  variables['definition_type'] = 'cryptic';
  variables['definition_note'] = 'Requires cryptic knowledge';
}
```

### Action Items
- [x] Add `STANDALONE_SYNONYMS` list to synonymDictionary.ts
- [x] Update clueParser to split fodder at standalone synonyms for acrostic clues
- [x] Add second wordplay component detection (ACROSTIC_CHARADE pattern)
- [x] Add `definition_type` field to patternData
- [x] Update ClueSolver to show cryptic definition hint
- [x] Add cryptic definition detection (reconciliation check)
- [x] Add dynamic tips for definition position exceptions

### Completed (2026-01-02)
Parser now correctly handles TONSURE-style clues:
- Pattern ID: ACROSTIC_CHARADE
- result_1: TON (first letters)
- result_2: SURE (standalone synonym)
- def_text: "do in monastery" (END position)
- definition_type: cryptic
- definition_hint: "do" = hairstyle

ClueSolver now shows:
- CRYPTIC badge next to definition
- Hint explaining the cryptic meaning
- Dynamic tips for unusual definition positions

---

## Template for New Cases

```markdown
## Case N: [ANSWER] ([Clue Type])

**Date**: YYYY-MM-DD

### Input
```
[Raw input as pasted]
```

### What Parser Detected
```
[Current parser output]
```

### What It Should Detect
```
[Correct parsing]
```

### Missing Templates/Patterns
[What's needed]

### Suggested Parser Updates
```typescript
// Code suggestions
```

### Action Items
- [ ] Task 1
- [ ] Task 2
```
