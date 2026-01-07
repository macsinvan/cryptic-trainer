# Performance Analysis Report

**Date:** 2026-01-07
**Codebase:** Cryptic Trainer
**Technology Stack:** React 19.2 + TypeScript + Vite + IndexedDB

---

## Executive Summary

This analysis identifies **10 significant performance anti-patterns** in the codebase, ranging from algorithmic inefficiencies (O(n!) recursive backtracking) to React rendering issues (missing memoization). The most critical issues are in the parsing engine (`clueParser.ts`) and data layer (`clueManager.ts`).

---

## Critical Issues (P0)

### 1. Recursive Backtracking Without Pruning

**Location:** `services/clueParser.ts:2970-3013`

**Problem:** The `tryCombinations()` function uses unbounded recursive backtracking that can explore factorial permutations:

```typescript
const MAX_ITERATIONS = 10000;  // Safety limit (not optimization)
const MAX_DEPTH = 6;

function tryCombinations(
    allCandidates: CandidatePart[],
    current: CandidatePart[],
    usedIndices: Set<number>,
    currentResult: string,
    depth: number = 0
): CandidatePart[] | null {
    // Explores ALL N! permutations before finding solution
    for (let i = 0; i < allCandidates.length; i++) {
        iterationCount++;
        if (iterationCount >= MAX_ITERATIONS) return null;  // Crude brake
        // ...tries ALL candidates, not just those after current
        const result = tryCombinations(allCandidates, [...current, cand], ...);
    }
}
```

**Impact:**
- 10 candidates = up to 3,628,800 iterations explored
- Safety limit of 10,000 is a crude brake, not optimization
- No memoization of failed branches
- No heuristic pruning

**Recommendation:**
- Add constraint propagation (reject branches early when sum exceeds target)
- Implement memoization for failed subproblems
- Use A* or branch-and-bound with heuristic scoring

---

### 2. O(n) Filtering on Every Query (N+1 Pattern)

**Location:** `services/clueManager.ts:171-193`

**Problem:** Every data access creates a new array and performs a full table scan:

```typescript
// Line 171-172
export const getTrainingQueue = (publicationId: string): TrainingItem[] => {
    return Array.from(runtimeClues.values()).filter(i => i.publicationId === publicationId);
};

// Line 192
export const getClueCount = (pubId: string) =>
    Array.from(runtimeClues.values()).filter(i => i.publicationId === pubId).length;

// Line 193
export const getSetterClueCount = (name: string) =>
    Array.from(runtimeClues.values()).filter(i => i.setterName === name).length;

// Line 270-274
export const searchClues = (q: string) => {
    const query = normalize(q);
    return Array.from(runtimeClues.values()).filter(item =>
        normalize(item.clue).includes(query)
    ).slice(0, 5);
};
```

**Impact:**
- O(n) on every call, where n = total clues
- Called multiple times per component render
- `normalize()` called on every item during search (expensive string operations)

**Recommendation:**
- Maintain secondary indices: `Map<publicationId, TrainingItem[]>`
- Pre-normalize clue text at storage time
- Cache counts in memory, update on write

---

### 3. Entire Dictionaries Loaded at Startup

**Location:**
- `data/synonymDictionary.ts` (78KB, 2,050 lines)
- `data/indicatorDictionary.ts` (36KB, 850 lines)
- `data/abbreviationDictionary.ts` (98 lines)
- `data/homophoneDictionary.ts` (132 lines)

**Problem:** All dictionaries are statically imported and loaded into memory on first page load:

```typescript
// services/clueParser.ts:3-6
import { lookupSynonyms, SYNONYM_DICTIONARY, CRYPTIC_MEANINGS, ... } from '../data/synonymDictionary';
import { INDICATOR_DICTIONARY } from '../data/indicatorDictionary';
import { HOMOPHONE_PAIRS } from '../data/homophoneDictionary';
import { OBVIOUS_ABBREVIATIONS, ... } from '../data/abbreviationDictionary';
```

**Impact:**
- ~10MB+ of dictionary data loaded for every user session
- Increases initial bundle size significantly
- Most users only solve a few clues per session

**Recommendation:**
- Lazy-load dictionaries on first use
- Split by category (only load anagram indicators when anagram detected)
- Consider moving to IndexedDB with on-demand lookup

---

### 4. Synchronous Main Thread Parsing

**Location:** `services/clueParser.ts` (entire file, 5,847 lines)

**Problem:** The `parseClue()` function and all its helpers run synchronously on the main thread:

```typescript
// Called from ManualEntryMode.tsx:80
const codeParseResult = parseClue(parseResult.clueText, parseResult.answer || '', parseResult.coaching);
```

**Impact:**
- UI freezes during complex parsing
- No way to cancel long-running operations
- Batch imports block the entire application

**Recommendation:**
- Move parsing to a Web Worker
- Add chunked processing with `requestIdleCallback()`
- Implement cancellation tokens

---

## Significant Issues (P1)

### 5. Missing Memoization in React Components

**Location:** `components/ClueSolver.tsx`, `components/ManualEntryMode.tsx`

**Problem:** Only one `useMemo` in the entire component tree:

```typescript
// ClueSolver.tsx:92-98 - ONLY memoization in 988 lines
const words = useMemo(() => {
    return evaluation.clue.split(/\s+/).map((word, i) => ({
        id: i,
        text: word.replace(/[.,;!?()]/g, ''),
        display: word
    }));
}, [evaluation.clue]);
```

**Missing memoization for:**
- `getWordStyle()` - called on every render for every word
- `renderLogicDisplay()` - template string replacement
- Pattern data transformations
- Display block rendering
- `discoveredParts` grouping calculations (lines 706-795)

**Impact:**
- Functions recreated on every render
- Child components re-render unnecessarily
- Expensive calculations repeated

**Recommendation:**
```typescript
// Add useCallback for handlers
const handleContinue = useCallback(() => { ... }, [deps]);

// Add useMemo for expensive computations
const groupedParts = useMemo(() => {
    const definition = discoveredParts.find(p => p.label === 'DEFINITION');
    const wordplayParts = discoveredParts.filter(p => p.label !== 'DEFINITION');
    // ... grouping logic
    return { definition, pairs };
}, [discoveredParts]);
```

---

### 6. IndexedDB Transaction Overhead

**Location:** `services/clueManager.ts:31-72`

**Problem:** Every operation opens a new database connection:

```typescript
const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        // ...
    });
};

// Called for EVERY operation
const dbPut = async (item: TrainingItem): Promise<void> => {
    const db = await openDB();  // New connection each time
    // ...
};
```

**Impact:**
- Connection overhead on every read/write
- No connection pooling or reuse
- Batch imports are especially slow

**Recommendation:**
- Implement connection pooling (keep-alive connection)
- Batch multiple writes in single transaction
- Use `transaction.oncomplete` for batch operations

---

### 7. Parser Issues Count Requires Full Load

**Location:** `services/clueManager.ts:99-102`

**Problem:**

```typescript
export const getParserIssueCount = async (): Promise<number> => {
    const issues = await getParserIssues();  // Loads ALL issues
    return issues.length;  // Just to count them
};
```

**Impact:**
- Loads entire dataset just to get count
- Wastes memory and I/O

**Recommendation:**
- Use IndexedDB `count()` method directly
- Or maintain a metadata record with counts

---

## Moderate Issues (P2)

### 8. String Normalization Not Cached

**Location:** `services/clueManager.ts:12, 270-274`

**Problem:**

```typescript
const normalize = (text: string) => (text || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');

// Called repeatedly during search
export const searchClues = (q: string) => {
    const query = normalize(q);
    return Array.from(runtimeClues.values()).filter(item =>
        normalize(item.clue).includes(query)  // normalize() called for EVERY item
    ).slice(0, 5);
};
```

**Impact:**
- Regex operations are expensive
- Same normalization done repeatedly for same strings

**Recommendation:**
- Store normalized version alongside original in TrainingItem
- Pre-compute at save time, not query time

---

### 9. Multiple Parsing Passes (Sequential Strategy)

**Location:** `services/clueParser.ts:184-500+`

**Problem:** The parser tries multiple strategies sequentially, each making a full pass:

1. `scanClueForObviousElements()` - full word scan
2. Find multi-word indicators - another full scan
3. Find single-word indicators - another scan
4. Build definition hypotheses - iterate remaining words
5. Each strategy may trigger sub-scans

**Impact:**
- Same text processed 4-5 times
- No short-circuiting on early match

**Recommendation:**
- Single-pass tokenization with multi-purpose tagging
- Pipeline architecture: Tokenize → Tag → Analyze
- Early exit when high-confidence match found

---

### 10. Component State Proliferation

**Location:**
- `components/ClueSolver.tsx:75-90` (13 useState hooks)
- `components/ManualEntryMode.tsx:18-26` (8 useState hooks)

**Problem:**

```typescript
// ClueSolver.tsx - 13 separate state variables
const [currentStepIndex, setCurrentStepIndex] = useState(0);
const [runtimePattern, setRuntimePattern] = useState<...>(null);
const [grid, setGrid] = useState<string[]>([]);
const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
const [discoveredParts, setDiscoveredParts] = useState<DiscoveredPart[]>([]);
const [isCompleted, setIsCompleted] = useState(false);
const [hintRevealed, setHintRevealed] = useState(false);
const [isPartialMatch, setIsPartialMatch] = useState(false);
const [selectionCorrect, setSelectionCorrect] = useState(false);
const [pendingDiscovery, setPendingDiscovery] = useState<DiscoveredPart | null>(null);
// ... plus refs
```

**Impact:**
- Multiple re-renders when related state updates
- No batched updates for related changes
- Complex state synchronization

**Recommendation:**
- Use `useReducer` for related state
- Consider state management library (Zustand) for shared state
- Group related state into objects

---

## Performance Metrics Summary

| Issue | Severity | Complexity | File:Line |
|-------|----------|------------|-----------|
| Recursive backtracking | P0 - Critical | O(n!) worst case | clueParser.ts:2970 |
| O(n) query filtering | P0 - Critical | O(n) per call | clueManager.ts:171-193 |
| Dictionary bundle size | P0 - Critical | ~10MB startup | data/*.ts |
| Sync main thread parsing | P0 - Critical | Blocks UI | clueParser.ts |
| Missing memoization | P1 - Significant | Re-renders | ClueSolver.tsx |
| IDB connection overhead | P1 - Significant | I/O per op | clueManager.ts:31-72 |
| Issues count full load | P1 - Significant | O(n) for count | clueManager.ts:99-102 |
| Normalize not cached | P2 - Moderate | Repeated regex | clueManager.ts:12,270 |
| Multiple parsing passes | P2 - Moderate | 4-5x scans | clueParser.ts:184-500 |
| State proliferation | P2 - Moderate | Re-renders | ClueSolver.tsx:75-90 |

---

## Recommended Priority Order

1. **Add secondary indices to clueManager** - Quick win, immediate impact
2. **Add memoization to ClueSolver** - Medium effort, visible improvement
3. **Implement connection pooling for IndexedDB** - Medium effort
4. **Add pruning to tryCombinations()** - High impact on edge cases
5. **Lazy-load dictionaries** - Requires architecture change
6. **Move parsing to Web Worker** - Significant refactor

---

## Code Quality Observations

- **No Web Workers used** - All computation on main thread
- **No React.memo on components** - All components re-render on parent changes
- **No useCallback for event handlers** - New functions created each render
- **Monolithic parser file** - 5,847 lines in single file makes optimization difficult
- **No performance monitoring** - No metrics collection for identifying bottlenecks
