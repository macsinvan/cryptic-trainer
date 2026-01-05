## Proposal: Add hospital department variants to synonymDictionary.ts

### Files to Modify
- `data/synonymDictionary.ts` - Add plural and possessive variants for "hospital department"

### Current Behavior
The dictionary only has the base form:
```typescript
'hospital department': ['ENT', 'ER', 'ICU', 'OR', 'A&E', 'WARD'],
```

When parsing "hospital department's" from a clue like:
"Following delay of months, slander hospital department's union (9)" → ALIGNMENT

The possessive form doesn't match directly, requiring regex stripping which is fragile.

### New Behavior
Add explicit variants:
```typescript
'hospital department': ['ENT', 'ER', 'ICU', 'OR', 'A&E', 'WARD'],
'hospital departments': ['ENT', 'ER', 'ICU', 'OR', 'A&E', 'WARD'],
"hospital department's": ['ENT', 'ER', 'ICU', 'OR', 'A&E', 'WARD'],
```

This ensures direct lookup for all common forms.

### Why Needed
The clue "Following delay of months, slander hospital department's union (9)" → ALIGNMENT requires:
- "hospital department's" → ENT
- "months" → M
- "slander" → MALIGN
- Letter movement: MALIGN with M moved to end → ALIGNM
- ALIGNM + ENT = ALIGNMENT

Currently the parser detects "hospital department's" but the possessive form doesn't match the dictionary entry cleanly.

### Risk Assessment
**LOW** - Adding dictionary entries only, no logic changes. Additive change that enables better matching.
