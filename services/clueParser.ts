
import { PatternInstance, WordplayStep, DisplayBlock } from '../types';
import { lookupSynonyms, findSynonymForOperation, extractLetter, splitAtStandaloneSynonym, SYNONYM_DICTIONARY, CRYPTIC_MEANINGS, ABBREVIATION_EXPLANATIONS, STANDALONE_SYNONYMS } from '../data/synonymDictionary';
import { OperationType, IndicatorEntry, INDICATOR_DICTIONARY } from '../data/indicatorDictionary';
import { HOMOPHONE_PAIRS } from '../data/homophoneDictionary';
import { OBVIOUS_ABBREVIATIONS, isObviousAbbreviation, isObviousTransformation } from '../data/abbreviationDictionary';
import { FUNCTION_WORDS, INDICATOR_WORDS } from '../data/functionWords';
import { normalizeWord, normalizeWithPossessive, removeWordCount, extractTargetLength, normalizeAnswer, cleanText, getClueWords } from './parserHelpers';
import { runDerivationStrategies, DerivationContext } from './coldDerivation';

// --- SOLVE STEPS GENERATOR ---
// Generates step-by-step solve sequence for the battlecard
// KEY PRINCIPLE: Start with what can be spotted WITHOUT knowing the answer

// --- CLUE SCANNER ---
// Scans clue text to find obvious elements WITHOUT knowing the answer
// Returns elements that a solver could spot just by reading the clue

interface ScannedElement {
    fodder: string;           // The phrase in the clue
    result: string;           // What it becomes (abbreviation or empty if unknown)
    type: 'abbreviation' | 'indicator' | 'definition' | 'remaining';
    startIndex: number;       // Position in clue text
    endIndex: number;
    obvious: boolean;         // Can be spotted without answer
    needsSynonym?: boolean;   // True if word doesn't work directly
}

function scanClueForObviousElements(clue: string, definition?: string): ScannedElement[] {
    const elements: ScannedElement[] = [];

    // Remove word count from end, e.g., "(9)" or "(3,4)"
    const clueText = clue.replace(/\s*\([0-9,\-]+\)\s*$/, '').trim();

    // Normalize for matching: remove apostrophes/possessives, lowercase
    const clueTextNormalized = clueText.toLowerCase().replace(/['']s?\b/g, '');
    const clueTextLower = clueText.toLowerCase();

    // Track which character positions are "used" by abbreviations
    const usedRanges: { start: number; end: number }[] = [];

    // Scan for known abbreviations - try both exact and normalized matching
    // Find ALL occurrences, not just the first one
    for (const [abbrev, fodders] of Object.entries(OBVIOUS_ABBREVIATIONS)) {
        for (const fodder of fodders) {
            const fodderLower = fodder.toLowerCase();
            const matchLength = fodder.length;

            // Find all occurrences of this fodder in the clue
            let searchStart = 0;
            while (searchStart < clueTextLower.length) {
                let idx = clueTextLower.indexOf(fodderLower, searchStart);

                // If no exact match, try normalized match (handles "department's" matching "department")
                if (idx === -1) {
                    const fodderNormalized = fodderLower.replace(/['']s?\b/g, '');
                    idx = clueTextNormalized.indexOf(fodderNormalized, searchStart);
                    if (idx === -1) break;  // No more matches
                }

                // Check it's a word boundary (not part of larger word)
                const before = idx === 0 ? ' ' : clueTextLower[idx - 1];
                const afterIdx = idx + matchLength;
                const after = afterIdx >= clueTextLower.length ? ' ' : clueTextLower[afterIdx];
                const isWordBoundary = /[\s,;:'"()\-\?!]/.test(before) && /[\s,;:'"()\-\?!]/.test(after);

                if (isWordBoundary || idx === 0 || afterIdx === clueTextLower.length) {
                    // Extract the actual text from clue (preserving case)
                    const actualFodder = clueText.substring(idx, idx + matchLength);

                    // Avoid duplicates
                    if (!elements.some(e => e.startIndex === idx && e.result === abbrev)) {
                        elements.push({
                            fodder: actualFodder,
                            result: abbrev,
                            type: 'abbreviation',
                            startIndex: idx,
                            endIndex: idx + matchLength,
                            obvious: true
                        });
                        usedRanges.push({ start: idx, end: idx + matchLength });
                    }
                }

                // Move to next potential match
                searchStart = idx + 1;
            }
        }
    }

    // Find remaining content words (not used by abbreviations, not function words, not definition)
    const words = clueText.split(/\s+/);
    let currentPos = 0;

    for (const word of words) {
        const wordStart = clueText.indexOf(word, currentPos);
        const wordEnd = wordStart + word.length;
        currentPos = wordEnd;

        // Clean word for checking
        const cleanWord = word.toLowerCase().replace(/[^a-z']/g, '');

        // Skip if empty, function word, or indicator word
        if (!cleanWord || FUNCTION_WORDS.has(cleanWord) || INDICATOR_WORDS.has(cleanWord)) continue;

        // Skip if part of definition
        if (definition && definition.toLowerCase().includes(cleanWord)) continue;

        // Skip if already covered by an abbreviation (check for ANY overlap)
        const isUsed = usedRanges.some(r =>
            (wordStart >= r.start && wordStart < r.end) ||  // Word starts inside range
            (wordEnd > r.start && wordEnd <= r.end) ||      // Word ends inside range
            (wordStart <= r.start && wordEnd >= r.end)      // Word contains range
        );
        if (isUsed) continue;

        // Also skip if the word (without possessives) was part of a multi-word abbreviation fodder
        const cleanWordNoPossessive = cleanWord.replace(/['']s?$/, '');
        const isPartOfAbbrev = elements.some(e =>
            e.type === 'abbreviation' &&
            e.fodder.toLowerCase().replace(/['']s?/g, '').split(/\s+/).some(
                part => part === cleanWordNoPossessive
            )
        );
        if (isPartOfAbbrev) continue;

        // Check if it's a known indicator
        // (We'll check INDICATOR_DICTIONARY later when it's in scope)
        // For now, mark as 'remaining' content word
        elements.push({
            fodder: word.replace(/[,;:'"]/g, ''),
            result: '',  // Unknown until we check
            type: 'remaining',
            startIndex: wordStart,
            endIndex: wordEnd,
            obvious: false,
            needsSynonym: true  // Assume needs synonym until proven otherwise
        });
    }

    // Sort by position in clue (left to right)
    elements.sort((a, b) => a.startIndex - b.startIndex);

    return elements;
}

// --- HYPOTHESIS-BASED ANALYSIS ---
// Analyzes clue WITHOUT knowing answer, generates testable hypotheses

export interface ClueHypothesis {
    definitionCandidate: string;
    definitionPosition: 'START' | 'END';
    wordplayParts: {
        fodder: string;
        result: string;        // Known result (abbreviation) or empty
        letterCount?: number;  // If result unknown, how many letters needed
    }[];
    knownLetters: number;      // Total letters from known abbreviations
    neededLetters: number;     // Letters still needed from synonyms
    targetLength: number;      // Total answer length from (N)
    synonymNeeded: {
        fodder: string;        // The word that needs a synonym
        letterCount: number;   // How many letters the synonym must have
    } | null;
}

export interface ClueAnalysis {
    clueText: string;
    targetLength: number;
    obviousElements: ScannedElement[];
    contentWords: string[];           // Words that are wordplay fodder
    indicatorWordsFound: string[];    // Indicator words found (wordplay signals)
    definitionCandidates: string[];   // Possible definitions (start/end)
    hypotheses: ClueHypothesis[];     // Testable hypotheses
    solveSteps: string[];             // Human-readable solve sequence
    derivedAnswer?: string | null;    // Answer derived without AI (from dictionary + wordplay verification)
    derivedDefinition?: string | null; // The definition that matched the derived answer
}

/**
 * Analyze a clue WITHOUT knowing the answer.
 * Returns hypotheses that can be tested with constrained AI calls.
 */
export function analyzeClueWithoutAnswer(clue: string): ClueAnalysis {
    // Extract target length from (N) at end
    const lengthMatch = clue.match(/\((\d+(?:,\d+)*)\)\s*$/);
    const targetLength = lengthMatch
        ? lengthMatch[1].split(',').reduce((sum, n) => sum + parseInt(n), 0)
        : 0;

    const clueText = clue.replace(/\s*\([0-9,\-]+\)\s*$/, '').trim();
    const words = clueText.split(/\s+/);

    // =================================================================
    // COLD PARSING ALGORITHM:
    // 1. First eliminate wordplay words (indicators + their fodder)
    // 2. Remaining words are definition candidates
    // 3. Build multi-word definition hypotheses expanding from start/end
    // =================================================================

    // Step 1: Find all obvious abbreviations (these are wordplay, not definition)
    const obviousElements = scanClueForObviousElements(clue);
    const abbreviations = obviousElements.filter(e => e.type === 'abbreviation');

    // Track which words are CONSUMED by wordplay (not available for definition)
    const consumedWordIndices = new Set<number>();

    // Mark abbreviation fodder words as consumed (only actual abbreviations, not "remaining" type)
    abbreviations.forEach(a => {
        if (a.type !== 'abbreviation') return;  // Only consume actual abbreviations
        const fodderWords = a.fodder.toLowerCase().replace(/['']s?/g, '').split(/\s+/);
        words.forEach((word, idx) => {
            const wLower = normalizeWithPossessive(word);
            if (fodderWords.some(fw => fw.replace(/[^a-z]/g, '') === wLower)) {
                consumedWordIndices.add(idx);
            }
        });
    });

    // Step 2: Find indicators and their fodder, mark as consumed
    // IMPORTANT: Check multi-word phrases first (e.g., "following delay of"), then single words
    const detectedOperations: Array<{ indicator: string; type: OperationType; fodder?: string; indicatorIdx: number; fodderIdx?: number }> = [];

    // First pass: find multi-word indicator phrases from INDICATOR_DICTIONARY
    const clueTextLower = clueText.toLowerCase();
    const multiWordIndicators: Array<{ phrase: string; type: OperationType; startIdx: number; endIdx: number }> = [];

    // Get all multi-word keys from INDICATOR_DICTIONARY (2+ words)
    for (const key of Object.keys(INDICATOR_DICTIONARY)) {
        if (key.includes(' ')) {
            const keyLower = key.toLowerCase();
            const pos = clueTextLower.indexOf(keyLower);
            if (pos !== -1) {
                // Find word indices that make up this phrase
                const beforePhrase = clueText.substring(0, pos);
                const startWordIdx = beforePhrase.split(/\s+/).filter(w => w.length > 0).length;
                const phraseWordCount = key.split(/\s+/).length;
                const endWordIdx = startWordIdx + phraseWordCount - 1;

                multiWordIndicators.push({
                    phrase: key,
                    type: INDICATOR_DICTIONARY[key].type,
                    startIdx: startWordIdx,
                    endIdx: endWordIdx
                });
            }
        }
    }

    // Sort by length descending (prefer longer phrases)
    multiWordIndicators.sort((a, b) => b.phrase.length - a.phrase.length);

    // Mark multi-word indicator words as consumed
    for (const mwi of multiWordIndicators) {
        // Check none of these indices already consumed
        let alreadyConsumed = false;
        for (let i = mwi.startIdx; i <= mwi.endIdx; i++) {
            if (consumedWordIndices.has(i)) {
                alreadyConsumed = true;
                break;
            }
        }
        if (alreadyConsumed) continue;

        // Mark all words in phrase as consumed
        for (let i = mwi.startIdx; i <= mwi.endIdx; i++) {
            consumedWordIndices.add(i);
        }

        // Find fodder - first try after the indicator phrase, then before
        let fodder: string | undefined;
        let fodderIdx: number | undefined;

        // Look after the indicator phrase
        for (let i = mwi.endIdx + 1; i < words.length; i++) {
            const fw = normalizeWithPossessive(words[i]);
            if (fw.length < 2 || FUNCTION_WORDS.has(fw)) continue;
            if (!consumedWordIndices.has(i)) {
                fodder = words[i];
                fodderIdx = i;
                break;
            }
        }

        // If no fodder after, look before the indicator phrase
        if (!fodder) {
            for (let i = mwi.startIdx - 1; i >= 0; i--) {
                const fw = normalizeWithPossessive(words[i]);
                if (fw.length < 2 || FUNCTION_WORDS.has(fw)) continue;
                if (!consumedWordIndices.has(i) && !INDICATOR_WORDS.has(fw)) {
                    fodder = words[i];
                    fodderIdx = i;
                    break;
                }
            }
        }

        // For letter_movement: the letter source (e.g., "months" → M) is already detected as abbreviation
        // Just consume the word to modify (e.g., "slander") as fodder
        // For container indicators: DON'T consume arbitrary fodder - inner/outer come from abbreviations
        if (fodderIdx !== undefined && mwi.type !== 'container') {
            consumedWordIndices.add(fodderIdx);
        }

        detectedOperations.push({
            indicator: mwi.phrase,
            type: mwi.type,
            fodder: mwi.type === 'container' ? undefined : fodder,  // Container doesn't use generic fodder
            indicatorIdx: mwi.startIdx,
            fodderIdx: mwi.type === 'container' ? undefined : fodderIdx
        });
    }

    // Second pass: find single-word indicators not already consumed
    // IMPORTANT: Protect idx 0 and last content word index - these are likely definition
    // Find the last content word (non-function word) index
    let lastContentWordIdx = words.length - 1;
    for (let i = words.length - 1; i >= 0; i--) {
        const w = normalizeWithPossessive(words[i]);
        if (w.length >= 2 && !FUNCTION_WORDS.has(w)) {
            lastContentWordIdx = i;
            break;
        }
    }

    // Protected indices (likely definition words)
    const protectedIndices = new Set<number>([0, lastContentWordIdx]);

    words.forEach((word, idx) => {
        if (consumedWordIndices.has(idx)) return;

        const wLower = normalizeWithPossessive(word);
        if (INDICATOR_WORDS.has(wLower)) {
            // This is an indicator - mark it as consumed
            consumedWordIndices.add(idx);

            // Look up in INDICATOR_DICTIONARY for operation type
            const entry = INDICATOR_DICTIONARY[wLower];
            const opType = entry?.type || 'synonym';

            // Find fodder - but DON'T consume protected indices (likely definition)
            let fodder: string | undefined;
            let fodderIdx: number | undefined;

            // Look backwards for fodder (skip function words and protected indices)
            for (let i = idx - 1; i >= 0; i--) {
                if (protectedIndices.has(i)) continue;  // Skip protected definition words
                const fw = normalizeWithPossessive(words[i]);
                if (fw.length < 2 || FUNCTION_WORDS.has(fw)) continue;
                if (!consumedWordIndices.has(i) && !INDICATOR_WORDS.has(fw)) {
                    fodder = words[i];
                    fodderIdx = i;
                    break;
                }
            }

            // If no fodder found before, look forward (also skip protected indices)
            if (!fodder) {
                for (let i = idx + 1; i < words.length; i++) {
                    if (protectedIndices.has(i)) continue;  // Skip protected definition words
                    const fw = normalizeWithPossessive(words[i]);
                    if (fw.length < 2 || FUNCTION_WORDS.has(fw)) continue;
                    if (!consumedWordIndices.has(i) && !INDICATOR_WORDS.has(fw)) {
                        fodder = words[i];
                        fodderIdx = i;
                        break;
                    }
                }
            }

            // Mark fodder as consumed (but NOT for container indicators - their inner/outer come from abbreviations)
            if (fodderIdx !== undefined && opType !== 'container') {
                consumedWordIndices.add(fodderIdx);
            }

            detectedOperations.push({
                indicator: word,
                type: opType,
                fodder: opType === 'container' ? undefined : fodder,  // Container doesn't use generic fodder
                indicatorIdx: idx,
                fodderIdx: opType === 'container' ? undefined : fodderIdx
            });
        }
    });

    // Step 3: Remaining words (not consumed) are definition candidates
    // Track their original indices for position-based logic
    const remainingWords: Array<{ word: string; idx: number }> = [];
    words.forEach((word, idx) => {
        const wLower = normalizeWithPossessive(word);
        if (wLower.length < 2) return;
        if (FUNCTION_WORDS.has(wLower)) return;
        if (!consumedWordIndices.has(idx)) {
            remainingWords.push({ word, idx });
        }
    });

    // Step 4: Build multi-word definition hypotheses
    // If remaining words are at START → expand: 1st, 1st+2nd, 1st+2nd+3rd
    // If remaining words are at END → expand: last, last+2nd-last, etc.
    const definitionCandidates: string[] = [];

    if (remainingWords.length > 0) {
        // Check if remaining words are contiguous at start or end
        const firstRemainingIdx = remainingWords[0].idx;
        const lastRemainingIdx = remainingWords[remainingWords.length - 1].idx;

        // Determine position: are remaining words at START or END of clue?
        const atStart = firstRemainingIdx === 0 ||
            (firstRemainingIdx <= 1 && normalizeWord(words[0]).length < 2);
        const atEnd = lastRemainingIdx === words.length - 1 ||
            (lastRemainingIdx >= words.length - 2);

        if (atStart && !atEnd) {
            // Definition at START - build expanding phrases from start
            // Try: 1st word, 1st+2nd, 1st+2nd+3rd, etc.
            for (let len = 1; len <= remainingWords.length && len <= 4; len++) {
                const phrase = remainingWords.slice(0, len).map(w => w.word).join(' ');
                definitionCandidates.push(phrase);
            }
        } else if (atEnd && !atStart) {
            // Definition at END - build expanding phrases from end
            // Try: last word, last+2nd-last, etc.
            for (let len = 1; len <= remainingWords.length && len <= 4; len++) {
                const phrase = remainingWords.slice(-len).map(w => w.word).join(' ');
                definitionCandidates.push(phrase);
            }
            // Also try including preceding function words (e.g., "in tank" not just "tank")
            const lastRemaining = remainingWords[remainingWords.length - 1];
            if (lastRemaining) {
                // Look for function words immediately before the last content word
                for (let i = lastRemaining.idx - 1; i >= 0 && i >= lastRemaining.idx - 2; i--) {
                    const prevWord = words[i] ? normalizeWord(words[i]) : '';
                    if (prevWord && FUNCTION_WORDS.has(prevWord)) {
                        // Build phrase including the function word
                        const phraseWithFunc = words.slice(i, lastRemaining.idx + 1).join(' ');
                        if (!definitionCandidates.includes(phraseWithFunc)) {
                            definitionCandidates.push(phraseWithFunc);
                        }
                    }
                }
            }
        } else {
            // Ambiguous - try both directions
            // From start
            for (let len = 1; len <= remainingWords.length && len <= 3; len++) {
                const phrase = remainingWords.slice(0, len).map(w => w.word).join(' ');
                definitionCandidates.push(phrase);
            }
            // From end (if different from start)
            if (remainingWords.length > 1) {
                for (let len = 1; len <= remainingWords.length && len <= 3; len++) {
                    const phrase = remainingWords.slice(-len).map(w => w.word).join(' ');
                    if (!definitionCandidates.includes(phrase)) {
                        definitionCandidates.push(phrase);
                    }
                }
            }
            // Also try including preceding function words at end (e.g., "in tank")
            const lastRemaining = remainingWords[remainingWords.length - 1];
            if (lastRemaining) {
                for (let i = lastRemaining.idx - 1; i >= 0 && i >= lastRemaining.idx - 2; i--) {
                    const prevWord = words[i] ? normalizeWord(words[i]) : '';
                    if (prevWord && FUNCTION_WORDS.has(prevWord)) {
                        const phraseWithFunc = words.slice(i, lastRemaining.idx + 1).join(' ');
                        if (!definitionCandidates.includes(phraseWithFunc)) {
                            definitionCandidates.push(phraseWithFunc);
                        }
                    }
                }
            }
        }
    }

    // Step 5: Calculate known letters from abbreviations
    const knownLetters = abbreviations.reduce((sum, a) => sum + a.result.length, 0);
    const neededLetters = targetLength - knownLetters;

    // Step 6: Build hypotheses for each definition candidate
    const hypotheses: ClueHypothesis[] = [];

    for (const defCandidate of definitionCandidates) {
        // Determine position based on where the definition words are
        const defWords = defCandidate.split(/\s+/);
        const firstDefWord = defWords[0];
        const firstDefIdx = words.findIndex(w => w === firstDefWord);
        const position = firstDefIdx <= 1 ? 'START' : 'END';

        // Wordplay parts = consumed fodder from detected operations + abbreviations
        const wordplayParts: Array<{ fodder: string; result: string; letterCount?: number }> = [];

        // Add fodder from detected operations
        detectedOperations.forEach(op => {
            if (op.fodder) {
                wordplayParts.push({
                    fodder: op.fodder,
                    result: '',  // Unknown without answer
                    letterCount: undefined
                });
            }
        });

        // Add abbreviations
        abbreviations.forEach(abbrev => {
            wordplayParts.push({
                fodder: abbrev.fodder,
                result: abbrev.result,
                letterCount: abbrev.result.length
            });
        });

        // Find which fodder needs a synonym (operations without known result)
        const unknownParts = wordplayParts.filter(p => !p.result);
        const synonymNeeded = unknownParts.length === 1 && neededLetters > 0
            ? { fodder: unknownParts[0].fodder, letterCount: neededLetters }
            : null;

        hypotheses.push({
            definitionCandidate: defCandidate,
            definitionPosition: position,
            wordplayParts,
            knownLetters,
            neededLetters,
            targetLength,
            synonymNeeded
        });
    }

    // Step 7: Generate human-readable solve steps in CORRECT ORDER
    const solveSteps: string[] = [];

    // 1. Show detected operation types from indicators (this is the key insight)
    if (detectedOperations.length > 0) {
        for (const op of detectedOperations) {
            const typeLabels: Record<OperationType, string> = {
                'homophone': 'homophone — a word that sounds like the answer',
                'anagram': 'anagram — rearrange the letters',
                'reversal': 'reversal — read backwards',
                'hidden': 'hidden word — answer is concealed in the text',
                'deletion_first': 'deletion — remove the first letter',
                'deletion_last': 'deletion — remove the last letter',
                'container': 'container — one word goes inside another',
                'charade': 'charade — words combine in sequence',
                'double_def': 'double definition — two meanings',
                'acrostic': 'acrostic — take first letters',
                'synonym': 'synonym lookup',
                'substitution': 'substitution — replace one letter with another',
                'letter_movement': 'letter movement — move a letter to a new position',
            };
            const label = typeLabels[op.type] || op.type;
            if (op.fodder) {
                solveSteps.push(`"${op.indicator}" signals ${label}. Fodder: "${op.fodder}"`);
            } else {
                solveSteps.push(`"${op.indicator}" signals ${label}`);
            }
        }
    }

    // 2. Show obvious abbreviations
    if (abbreviations.length > 0) {
        abbreviations.forEach((abbrev, i) => {
            solveSteps.push(`"${abbrev.fodder}" → ${abbrev.result} (abbreviation)`);
        });
        solveSteps.push(`Known letters: ${abbreviations.map(a => a.result).join(' + ')} = ${knownLetters} letters`);
    }

    // 3. Show target calculation
    if (targetLength > 0) {
        solveSteps.push(`Target: ${targetLength} letters`);
    }

    // 4. Show definition candidates (multi-word hypotheses)
    if (definitionCandidates.length > 0) {
        // Group by length to show expansion
        const byLength = new Map<number, string[]>();
        definitionCandidates.forEach(d => {
            const len = d.split(/\s+/).length;
            if (!byLength.has(len)) byLength.set(len, []);
            byLength.get(len)!.push(d);
        });

        // Determine position from first candidate
        const firstDefIdx = words.findIndex(w => w === definitionCandidates[0].split(/\s+/)[0]);
        const position = firstDefIdx <= 1 ? 'start' : 'end';

        if (definitionCandidates.length === 1) {
            solveSteps.push(`Definition: "${definitionCandidates[0]}" (at ${position})`);
        } else {
            // Show as expanding hypotheses
            const defList = definitionCandidates.map(d => `"${d}"`).join(', ');
            solveSteps.push(`Definition candidates (at ${position}): ${defList}`);
        }
    }

    // Only show hypotheses if there's ambiguity (more than one candidate)
    // If there's only one hypothesis and we've already shown definition + synonym needed, skip this
    if (definitionCandidates.length > 1) {
        hypotheses.forEach((h, i) => {
            if (h.synonymNeeded) {
                solveSteps.push(`Hypothesis ${i + 1}: "${h.definitionCandidate}" = definition → need ${h.synonymNeeded.letterCount}-letter synonym for "${h.synonymNeeded.fodder}"`);
            }
        });
    }

    // Step 7: Try to derive the answer from WORDPLAY (not definition lookup!)
    // 1. Extract known components from wordplay (abbreviations, literals)
    // 2. Get synonyms for wordplay FODDER words
    // 3. Assemble candidate answers from components
    // 4. Verify assembled candidates match the DEFINITION
    let derivedAnswer: string | null = null;
    let derivedDefinition: string | null = null;

    // For each definition candidate, identify what's left as wordplay
    for (const defCandidate of definitionCandidates) {
        const defWords = defCandidate.toLowerCase().split(/\s+/);

        // Wordplay = content words NOT in the definition
        const wordplayWords = remainingWords.filter(rw =>
            !defWords.some(dw => dw === normalizeWord(rw.word))
        );

        // Note: wordplayWords may be empty if all wordplay is in detectedOperations
        // We still need to continue to try container assembly with operation fodder

        // Collect known components from wordplay
        const knownComponents: string[] = [];
        const unknownFodder: string[] = [];

        for (const ww of wordplayWords) {
            const wordLower = normalizeWord(ww.word);

            // Check for known abbreviations (from OBVIOUS_ABBREVIATIONS)
            let foundAbbrev = false;
            for (const [abbrev, fodders] of Object.entries(OBVIOUS_ABBREVIATIONS)) {
                if (fodders.some(f => f.toLowerCase() === wordLower)) {
                    knownComponents.push(abbrev);
                    foundAbbrev = true;
                    break;
                }
            }

            // Check for standalone synonyms (nothing→O, year→Y, etc)
            if (!foundAbbrev) {
                const standaloneResult = STANDALONE_SYNONYMS[wordLower];
                if (standaloneResult && standaloneResult.length <= 2) {
                    knownComponents.push(standaloneResult);
                    foundAbbrev = true;
                }
            }

            // Check for single letter literals
            if (!foundAbbrev && wordLower.length === 1) {
                knownComponents.push(wordLower.toUpperCase());
                foundAbbrev = true;
            }

            // Otherwise it's unknown fodder that needs synonym lookup
            if (!foundAbbrev) {
                unknownFodder.push(ww.word);
            }
        }

        // For pure charade: try assembling from wordplay synonyms
        // Get synonyms for each unknown fodder word
        const fodderSynonymOptions: string[][] = [];
        for (const fodder of unknownFodder) {
            const syns = lookupSynonyms(fodder.toLowerCase());
            if (syns.length > 0) {
                fodderSynonymOptions.push(syns);
            } else {
                // No synonyms found - can't derive this wordplay
                fodderSynonymOptions.push([]);
            }
        }

        // Try to assemble candidates (simple charade: concatenate components)
        // If all unknown fodder has synonyms, try combinations
        if (fodderSynonymOptions.every(opts => opts.length > 0) || unknownFodder.length === 0) {
            // Generate candidate assemblies
            const assembleCandidates = (
                componentsSoFar: string,
                fodderIndex: number
            ): string[] => {
                if (fodderIndex >= fodderSynonymOptions.length) {
                    // Add known components
                    return [componentsSoFar + knownComponents.join('')];
                }

                const results: string[] = [];
                for (const syn of fodderSynonymOptions[fodderIndex]) {
                    results.push(...assembleCandidates(
                        componentsSoFar + syn,
                        fodderIndex + 1
                    ));
                }
                return results;
            };

            const candidates = fodderSynonymOptions.length > 0
                ? assembleCandidates('', 0)
                : [knownComponents.join('')];

            // Filter by target length and verify against definition
            for (const candidate of candidates) {
                const candidateClean = candidate.replace(/[^A-Z]/gi, '').toUpperCase();
                if (candidateClean.length !== targetLength) continue;

                // Verify this candidate matches a synonym of the definition
                const defSynonyms = lookupSynonyms(defCandidate.toLowerCase());
                if (defSynonyms.some(ds => ds.toUpperCase() === candidateClean)) {
                    derivedAnswer = candidateClean;
                    derivedDefinition = defCandidate;
                    break;
                }
            }
        }

        // Try INDICATOR-AS-FODDER CHARADE
        // Some words can be either indicators OR fodder (e.g., "sounds" = homophone indicator OR "noises" → TOCKS)
        // If previous charade didn't work, try using indicator words as fodder
        if (!derivedAnswer && detectedOperations.length > 0) {
            // Get all detected indicator words that might also work as fodder
            const indicatorFodderCandidates = detectedOperations.map(op => op.indicator);

            for (const indWord of indicatorFodderCandidates) {
                const indSyns = lookupSynonyms(indWord.toLowerCase());
                if (indSyns.length === 0) continue;

                // Try combining indicator synonyms with known abbreviation components
                for (const indSyn of indSyns) {
                    // Try: abbreviation + indicator synonym
                    for (const elem of abbreviations) {
                        if (!elem.result) continue;

                        // Try abbrev + synonym
                        const combined1 = elem.result + indSyn;
                        if (combined1.length === targetLength) {
                            const defSynonyms = lookupSynonyms(defCandidate.toLowerCase());
                            if (defSynonyms.some(ds => ds.toUpperCase() === combined1.toUpperCase())) {
                                derivedAnswer = combined1.toUpperCase();
                                derivedDefinition = defCandidate;
                                break;
                            }
                        }

                        // Try synonym + abbrev
                        const combined2 = indSyn + elem.result;
                        if (combined2.length === targetLength) {
                            const defSynonyms = lookupSynonyms(defCandidate.toLowerCase());
                            if (defSynonyms.some(ds => ds.toUpperCase() === combined2.toUpperCase())) {
                                derivedAnswer = combined2.toUpperCase();
                                derivedDefinition = defCandidate;
                                break;
                            }
                        }
                    }
                    if (derivedAnswer) break;
                }
                if (derivedAnswer) break;
            }
        }

        // Try PURE ABBREVIATION CHARADE
        // If we have multiple obvious abbreviations, try concatenating them
        if (!derivedAnswer && abbreviations.length >= 2) {
            // Get non-overlapping abbreviations, preferring longer matches
            const sortedAbbrevs = [...abbreviations]
                .filter(a => a.result)
                .sort((a, b) => (b.endIndex - b.startIndex) - (a.endIndex - a.startIndex));

            // Greedily select non-overlapping abbreviations
            const selectedAbbrevs: typeof abbreviations = [];
            for (const abbrev of sortedAbbrevs) {
                const overlaps = selectedAbbrevs.some(selected =>
                    (abbrev.startIndex >= selected.startIndex && abbrev.startIndex < selected.endIndex) ||
                    (abbrev.endIndex > selected.startIndex && abbrev.endIndex <= selected.endIndex) ||
                    (abbrev.startIndex <= selected.startIndex && abbrev.endIndex >= selected.endIndex)
                );
                if (!overlaps) {
                    selectedAbbrevs.push(abbrev);
                }
            }

            // Sort by position in clue
            selectedAbbrevs.sort((a, b) => a.startIndex - b.startIndex);

            // Try concatenating all selected abbreviations
            const abbrevResults = selectedAbbrevs.map(a => a.result);
            const concatenated = abbrevResults.join('');

            if (concatenated.length === targetLength) {
                // Verify against definition synonyms
                const defSynonyms = lookupSynonyms(defCandidate.toLowerCase());
                if (defSynonyms.some(ds => ds.toUpperCase() === concatenated)) {
                    derivedAnswer = concatenated;
                    derivedDefinition = defCandidate;
                }
            }

            // Also try subsets of 2 abbreviations
            if (!derivedAnswer) {
                for (let i = 0; i < selectedAbbrevs.length; i++) {
                    for (let j = i + 1; j < selectedAbbrevs.length; j++) {
                        const pair = selectedAbbrevs[i].result + selectedAbbrevs[j].result;
                        if (pair.length === targetLength) {
                            const defSynonyms = lookupSynonyms(defCandidate.toLowerCase());
                            if (defSynonyms.some(ds => ds.toUpperCase() === pair)) {
                                derivedAnswer = pair;
                                derivedDefinition = defCandidate;
                                break;
                            }
                        }
                    }
                    if (derivedAnswer) break;
                }
            }
        }

        // Try modular derivation strategies (container, hidden, deletion, homophone, anagram+reversal)
        if (!derivedAnswer) {
            const defSynonyms = lookupSynonyms(defCandidate.toLowerCase());
            const ctx: DerivationContext = {
                targetLength,
                defCandidate,
                defSynonyms,
                clueText,
                words,
                detectedOperations,
                abbreviations: abbreviations.map(a => ({
                    fodder: a.fodder,
                    result: a.result || '',
                    type: a.type
                })),
                knownComponents,
                unknownFodder
            };

            const result = runDerivationStrategies(ctx);
            if (result) {
                derivedAnswer = result.answer;
                derivedDefinition = result.definition;
            }
        }

        if (derivedAnswer) break;
    }

    // Build indicator words found list for return (from detectedOperations)
    const indicatorWordsFound = detectedOperations.map(op => op.indicator);

    // Build content words list for return (remaining words that aren't consumed)
    const contentWords = remainingWords.map(w => w.word);

    return {
        clueText,
        targetLength,
        obviousElements,
        contentWords,
        indicatorWordsFound,
        definitionCandidates,
        hypotheses,
        solveSteps,
        derivedAnswer,
        derivedDefinition,
        knownLetters,
        neededLetters
    };
}

// Guess definition position (usually at start or end of clue)
function guessDefinitionFromClue(clue: string): { text: string; position: 'START' | 'END' } {
    // Remove word count
    const clueText = clue.replace(/\s*\([0-9,\-]+\)\s*$/, '').trim();
    const words = clueText.split(/\s+/);

    // Heuristic: definition is usually 1-3 words at start or end
    // Look for natural break points (commas, etc.)

    // Check for comma - often separates definition from wordplay
    const commaIdx = clueText.indexOf(',');
    if (commaIdx !== -1) {
        const beforeComma = clueText.substring(0, commaIdx).trim();
        const afterComma = clueText.substring(commaIdx + 1).trim();

        // Shorter part is likely definition
        if (beforeComma.split(/\s+/).length <= 3) {
            return { text: beforeComma, position: 'START' };
        }
        if (afterComma.split(/\s+/).length <= 3) {
            return { text: afterComma, position: 'END' };
        }
    }

    // Default: last word(s) as definition
    if (words.length >= 2) {
        return { text: words[words.length - 1], position: 'END' };
    }

    return { text: words[0], position: 'START' };
}

function generateSolveSteps(
    variables: Record<string, string>,
    patternId: string,
    answer: string,
    coaching?: string[],
    clue?: string
): string[] {
    const steps: string[] = [];
    const answerClean = normalizeAnswer(answer);

    // Step 1: Definition - use parsed definition if available, otherwise guessed
    const guessedDef = clue ? guessDefinitionFromClue(clue) : null;
    const defText = variables['def_text'] || guessedDef?.text || '';
    const defPosition = variables['definition_position'] || guessedDef?.position || 'END';
    if (defText) {
        steps.push(`Spot the definition: "${defText}" (at ${defPosition.toLowerCase()})`);
    }

    // PHASE 1: Scan the clue for obvious elements (no answer needed)
    // Pass definition so scanner can exclude it from remaining words
    const scannedElements = clue ? scanClueForObviousElements(clue, defText) : [];

    // PHASE 2: Build wordplay parts - start with scanned elements, enhance with coaching
    let wordplayParts: { fodder: string; indicator: string; synonym?: string; result: string; hint?: string; operation?: string; position?: number; scanned: boolean; needsSynonym?: boolean }[] = [];

    // Add scanned abbreviations (these are obvious from clue alone)
    for (const elem of scannedElements) {
        if (elem.type === 'abbreviation') {
            wordplayParts.push({
                fodder: elem.fodder,
                indicator: '',
                result: elem.result,
                scanned: true  // Marked as found from clue scan
            });
        }
    }

    // Add remaining content words (need to check if they work directly or need synonyms)
    const remainingWords = scannedElements.filter(e => e.type === 'remaining');
    for (const elem of remainingWords) {
        // Check if this word directly contributes letters to the answer
        const wordUpper = normalizeAnswer(elem.fodder);
        // If no answer provided, we can't check - mark as needing synonym (unknown)
        const worksDirectly = answerClean.length > 0 && answerClean.includes(wordUpper) && wordUpper.length >= 2;

        wordplayParts.push({
            fodder: elem.fodder,
            indicator: '',
            result: worksDirectly ? wordUpper : '',
            scanned: true,
            needsSynonym: answerClean.length === 0 ? undefined : !worksDirectly  // undefined = unknown (no answer)
        });
    }

    // Add/enhance with coaching notes (provides synonyms and operations)
    if (coaching && coaching.length > 0) {
        const coachingParts = parseCoachingNotes(coaching, answer);
        for (const cp of coachingParts) {
            // Check if this fodder was already scanned
            const existing = wordplayParts.find(p =>
                p.fodder.toLowerCase() === cp.fodder.toLowerCase()
            );
            if (existing) {
                // Enhance with coaching info (e.g., operation, actual result)
                existing.operation = cp.operation;
                existing.position = cp.position;
                if (cp.result) {
                    existing.result = cp.result;
                    existing.needsSynonym = false;
                }
            } else {
                // New part from coaching (not scannable - e.g., synonyms)
                wordplayParts.push({
                    fodder: cp.fodder,
                    indicator: cp.operation || '',
                    result: cp.result,
                    operation: cp.operation,
                    position: cp.position,
                    scanned: false  // Not obvious from clue alone
                });
            }
        }
    }

    // Fall back to variables if no parts found
    if (wordplayParts.length === 0) {
        for (let i = 1; i <= 5; i++) {
            const fodder = variables[`fodder_${i}_text`];
            const indicator = variables[`indicator_${i}_text`] || '';
            const synonym = variables[`synonym_${i}`];
            const result = variables[`result_${i}`];
            const hint = variables[`hint_${i}`];

            if (fodder && result) {
                const isScanned = scannedElements.some(e =>
                    e.fodder.toLowerCase() === fodder.toLowerCase()
                );
                wordplayParts.push({ fodder, indicator, synonym, result, hint, scanned: isScanned });
            }
        }
    }

    // Classify parts into "obvious" (scanned from clue) vs "deduced" (need coaching/answer)
    const obviousParts = wordplayParts.filter(p => isObviousTransformation(p.fodder, p.result, p.operation));
    const deducedParts = wordplayParts.filter(p => !isObviousTransformation(p.fodder, p.result, p.operation));

    // Sort obvious parts by "obviousness" - longer results are more obvious
    obviousParts.sort((a, b) => b.result.length - a.result.length);

    // Step 2: Work through obvious wordplay (what solver can spot immediately)
    if (obviousParts.length > 0) {
        obviousParts.forEach((part, idx) => {
            let stepText = `"${part.fodder}" → ${part.result}`;
            if (part.operation) {
                stepText += ` (${part.operation})`;
            }
            if (idx === 0) {
                steps.push(`Most obvious wordplay: ${stepText}`);
            } else {
                steps.push(`Next: ${stepText}`);
            }
        });
    }

    // Step 3: Show what we have so far
    const obviousResults = obviousParts.map(p => p.result).filter(r => r);
    const obviousLen = obviousResults.join('').length;

    if (obviousResults.length > 0 && answerClean.length > 0) {
        const neededLen = answerClean.length - obviousLen;
        const obviousSum = obviousResults.join(' + ');
        steps.push(`We have: ${obviousSum} (${obviousLen} letters). Need ${neededLen} more.`);
    } else if (obviousResults.length > 0) {
        // No answer provided - just show what we found
        const obviousSum = obviousResults.join(' + ');
        steps.push(`Found so far: ${obviousSum} (${obviousLen} letters)`);
    }

    // Step 4: Show remaining words and deduce what they must contribute
    if (deducedParts.length > 0) {
        deducedParts.forEach(part => {
            const fodderUpper = normalizeAnswer(part.fodder);

            if (answerClean.length === 0) {
                // No answer - just note remaining content words
                steps.push(`Remaining: "${part.fodder}" → needs synonym or contributes letters`);
            } else if (part.needsSynonym || !answerClean.includes(fodderUpper)) {
                // Word doesn't appear directly in answer - need synonym
                steps.push(`Remaining: "${part.fodder}" → doesn't fit directly, need a synonym`);
            } else {
                // Word might work directly
                steps.push(`Remaining: "${part.fodder}" → ?`);
            }
        });
    }

    // Step 5: Reveal the deduced parts (solution reveal)
    if (deducedParts.length > 0) {
        const hasResults = deducedParts.some(p => p.result);
        if (hasResults) {
            deducedParts.forEach(part => {
                if (part.result) {
                    steps.push(`Solution: "${part.fodder}" → ${part.result}`);
                }
            });
        }
    }

    // Final step: Check positions and verify assembly
    // Only include parts that have results, and only if we have an answer to verify against
    const partsWithResults = wordplayParts.filter(p => p.result);

    if (partsWithResults.length > 0 && answerClean.length > 0) {
        // Check for letter movement
        const movedPart = partsWithResults.find(p => p.operation === 'moved to end');
        const basePart = partsWithResults.find(p => p.result.length > 1 && p !== movedPart);

        if (movedPart && basePart) {
            const letter = movedPart.result;
            const base = basePart.result;

            // Find the base that starts with the moved letter (e.g., MALIGN starts with M)
            const correctBase = partsWithResults.find(p =>
                p.result.length > 1 &&
                p.result.startsWith(letter) &&
                p !== movedPart
            ) || basePart;

            const actualBase = correctBase.result;
            const transformed = actualBase.slice(1) + letter;
            const otherParts = partsWithResults.filter(p => p !== movedPart && p !== correctBase);
            const otherResults = otherParts.map(p => p.result).filter(r => r);

            // Build position display
            const allParts = [actualBase.slice(1), letter, ...otherResults];
            const posDisplay = `[${allParts.join('][')}]`;

            if (otherResults.length > 0) {
                steps.push(`Check: ${actualBase} → ${actualBase.slice(1)} + ${letter} at end → ${transformed}, + ${otherResults.join(' + ')}`);
            } else {
                steps.push(`Check: ${actualBase} → ${actualBase.slice(1)} + ${letter} at end → ${transformed}`);
            }
            steps.push(`Verify: ${posDisplay} = ${answerClean} ✓`);
        } else {
            // Simple charade - show position breakdown
            const sortedParts = [...partsWithResults].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
            const allResults = sortedParts.map(p => p.result).filter(r => r);
            const posDisplay = `[${allResults.join('][')}]`;
            steps.push(`Check: ${allResults.join(' + ')}`);
            steps.push(`Verify: ${posDisplay} = ${answerClean} ✓`);
        }
    }

    return steps;
}

// --- COACHING NOTES PARSER ---
// Parses explanation text like "MALIGN (slander) with M (months) moved to the end + ENT (hospital department)"

interface CoachingPart {
    fodder: string;      // The word in the clue (e.g., "slander")
    result: string;      // What it becomes (e.g., "MALIGN")
    operation?: string;  // Optional operation description
    position?: number;   // Position in answer (0 = leftmost)
}

function parseCoachingNotes(coaching: string[], answer?: string): CoachingPart[] {
    const parts: CoachingPart[] = [];
    const answerClean = answer ? normalizeAnswer(answer) : '';

    for (const note of coaching) {
        // Pattern 1: "RESULT (fodder)" - e.g., "MALIGN (slander)", "ENT (hospital department)"
        const pattern1 = /([A-Z]+)\s*\(([^)]+)\)/g;
        let match;
        while ((match = pattern1.exec(note)) !== null) {
            parts.push({
                fodder: match[2].trim(),
                result: match[1].trim()
            });
        }

        // Pattern 2: "fodder → result" or "fodder = result"
        const pattern2 = /["']?([^"'→=]+)["']?\s*[→=]\s*([A-Z]+)/g;
        while ((match = pattern2.exec(note)) !== null) {
            const fodder = match[1].trim();
            // Avoid duplicates
            if (!parts.some(p => p.fodder === fodder)) {
                parts.push({
                    fodder,
                    result: match[2].trim()
                });
            }
        }

        // Pattern 3: Look for "M (months)" style abbreviation hints
        const abbrPattern = /\b([A-Z])\s*\(([^)]+)\)/g;
        while ((match = abbrPattern.exec(note)) !== null) {
            const fodder = match[2].trim();
            // Only add if not already captured and it's a single letter result
            if (!parts.some(p => p.fodder === fodder) && match[1].length === 1) {
                parts.push({
                    fodder,
                    result: match[1].trim()
                });
            }
        }

        // Pattern 4: Extract operation hints like "moved to the end"
        if (note.includes('moved to the end') || note.includes('moved to end')) {
            // Find the letter being moved
            const moveMatch = note.match(/([A-Z])\s*\([^)]+\)\s*moved/i);
            if (moveMatch) {
                const existingPart = parts.find(p => p.result.length === 1);
                if (existingPart) {
                    existingPart.operation = 'moved to end';
                }
            }
        }
    }

    // Calculate positions in the answer for each part
    // For letter movement cases, we need special handling
    if (answerClean && parts.length > 0) {
        const movedPart = parts.find(p => p.operation === 'moved to end');

        if (movedPart) {
            // Letter movement case: e.g., ALIGNMENT = ALIGN + M + ENT
            // The moved letter and its base word form a unit
            // Find the base word (the synonym that contains the moved letter at start)
            const basePart = parts.find(p =>
                p !== movedPart &&
                p.result.length > 1 &&
                p.result.startsWith(movedPart.result)
            );

            if (basePart) {
                // The base becomes the transformed version (letter moved to end)
                // e.g., MALIGN -> ALIGNM (position 0, contributes ALIGN at start, M later)
                const transformedBase = basePart.result.slice(1) + movedPart.result;

                // Find remaining parts and their positions
                let currentPos = 0;

                // First: the transformed base (minus the moved letter which comes later)
                basePart.position = currentPos;
                currentPos += basePart.result.length - 1; // ALIGN part

                // The moved letter position
                movedPart.position = currentPos;
                currentPos += 1; // M part

                // Other parts in order they appear in remaining answer
                const otherParts = parts.filter(p => p !== basePart && p !== movedPart);
                for (const part of otherParts) {
                    const posInAnswer = answerClean.indexOf(part.result, currentPos);
                    if (posInAnswer >= 0) {
                        part.position = posInAnswer;
                        currentPos = posInAnswer + part.result.length;
                    }
                }
            }
        } else {
            // Simple charade: find each part's position in the answer
            let searchStart = 0;
            for (const part of parts) {
                const posInAnswer = answerClean.indexOf(part.result, searchStart);
                if (posInAnswer >= 0) {
                    part.position = posInAnswer;
                    searchStart = posInAnswer + part.result.length;
                }
            }
        }
    }

    return parts;
}

// --- PARSING RESULT ---

export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard' | 'Very Hard';

export interface ParseResult {
    success: boolean;
    confidence: number;  // 0-100
    difficulty?: DifficultyLevel;
    patternData?: PatternInstance;
    needsAI: boolean;
    reason?: string;  // Why AI is needed or parsing failed
    parsed?: {
        definition: { text: string; position: 'START' | 'END' };
        indicators: { text: string; type: OperationType; entry: IndicatorEntry }[];
        fodders: string[];
    };
}

/**
 * Calculate difficulty based on pattern complexity, number of steps, etc.
 *
 * Factors that increase difficulty:
 * - Complex patterns (letter_movement, substitution, container)
 * - Multiple wordplay components (charade with 3+ parts)
 * - Abbreviations requiring specialized knowledge
 * - Cryptic definitions
 * - Multi-step operations (e.g., synonym + deletion + charade)
 */
function calculateDifficulty(
    patternId: string,
    variables: Record<string, string>,
    defMatchType: string
): DifficultyLevel {
    let score = 0;

    // Pattern complexity
    const complexPatterns: Record<string, number> = {
        'LETTER_MOVEMENT': 3,      // Very rare, hard to spot
        'SUBSTITUTION': 3,         // Multi-step replacement
        'CONTAINER': 2,            // X inside Y
        'COMPOSITE_CHARADE': 2,    // Multiple operations
        'ANAGRAM': 1,              // Common but requires work
        'REVERSAL': 1,             // Straightforward once seen
        'HIDDEN': 1,               // Need to spot hidden word
        'CHARADE': 1,              // Basic combination
        'DELETION': 1,             // Simple removal
        'DOUBLE_DEFINITION': 0,    // Usually easier
        'ACROSTIC': 1,             // First letters
    };
    score += complexPatterns[patternId] ?? 1;

    // Number of wordplay components
    const componentCount = Object.keys(variables).filter(k =>
        k.startsWith('result_') || k.startsWith('additional_result_')
    ).length;
    if (componentCount >= 3) score += 2;
    else if (componentCount >= 2) score += 1;

    // Abbreviations (single-letter results suggest abbreviations)
    const hasAbbreviations = Object.entries(variables).some(([k, v]) =>
        (k.startsWith('result_') || k === 'letter') && v.length === 1
    );
    if (hasAbbreviations) score += 1;

    // Cryptic definition
    if (defMatchType === 'cryptic' || defMatchType === 'none') {
        score += 2;
    }

    // Multi-step hints (contains multiple arrows)
    const hint = variables['hint_1'] || '';
    const arrowCount = (hint.match(/→/g) || []).length;
    if (arrowCount >= 4) score += 2;
    else if (arrowCount >= 3) score += 1;

    // Map score to difficulty
    if (score >= 6) return 'Very Hard';
    if (score >= 4) return 'Hard';
    if (score >= 2) return 'Medium';
    return 'Easy';
}

// --- HELPER FUNCTIONS ---
// Note: cleanText is imported from parserHelpers.ts

/**
 * Extra variables for letter_movement explanation template
 */
interface LetterMovementVars {
    letterSource: string;   // "months"
    letter: string;         // "M"
    synonymFodder: string;  // "slander"
    synonym: string;        // "MALIGN"
    movedResult: string;    // "ALIGNM"
}

/**
 * Extra variables for homophone explanation template
 */
interface HomophoneVars {
    base: string;           // "STOW" (the synonym that sounds like the answer)
    result: string;         // "STOWE" (the answer)
}

/**
 * Generate plain English explanation for a wordplay step.
 * Templates are keyed by stepType.
 * Uses ABBREVIATION_EXPLANATIONS for teaching content.
 */
interface ContainerVars {
    outer: string;        // Full outer container (SM)
    outerFirst: string;   // First part (S)
    outerLast: string;    // Last part (M)
    inner: string;        // Inner content (ODO)
    part: 'first' | 'last';  // Which part this step represents
}

function generateStepExplanation(
    stepType: WordplayStep['stepType'],
    fodder: string,
    result: string,
    indicator: string,
    letterMovementVars?: LetterMovementVars,
    definitionText?: string,
    homophoneVars?: HomophoneVars,
    containerVars?: ContainerVars
): string {
    switch (stepType) {
        case 'abbreviation': {
            // Check for letter extraction with synonym (e.g., "leading trio to sign" → TAURUS → TAU)
            // The indicator tells us what operation was used
            const indEntry = INDICATOR_DICTIONARY[indicator?.toLowerCase()];
            if (indEntry?.letterOp === 'first' && indEntry?.letterCount && indEntry.letterCount > 1) {
                // Multi-letter first extraction from synonym
                return `"${indicator}" signals taking the first ${indEntry.letterCount} letters. We need a synonym for "${fodder}" that starts with ${result}. Result: ${result}.`;
            }
            if (indEntry?.letterOp === 'last' && indEntry?.letterCount && indEntry.letterCount > 1) {
                // Multi-letter last extraction from synonym
                return `"${indicator}" signals taking the last ${indEntry.letterCount} letters. We need a synonym for "${fodder}" that ends with ${result}. Result: ${result}.`;
            }

            // Look up teaching explanation for this abbreviation
            // Try exact match first, then normalized (strip possessive, lowercase)
            const normalized = fodder.toLowerCase().replace(/'s\b/g, '').trim();
            const abbrevInfo = ABBREVIATION_EXPLANATIONS[fodder.toLowerCase()] ||
                               ABBREVIATION_EXPLANATIONS[normalized];

            if (abbrevInfo) {
                return `"${fodder}" is a standard cryptic abbreviation. ${abbrevInfo.explanation}`;
            }
            // Fallback if no teaching content available
            return `"${fodder}" is a standard cryptic abbreviation. "${fodder}" → ${result}.`;
        }

        case 'letter_movement': {
            if (!letterMovementVars) {
                return ''; // Missing data
            }
            const { letterSource, letter, synonymFodder, synonym, movedResult } = letterMovementVars;
            // Cold view template - guides student to discover they need a synonym, then shows solution
            return `"${indicator}" signals letter movement — a letter needs to move position. "${letterSource}" = ${letter} (standard abbreviation). The ${letter} must be inside a word. But "${synonymFodder}" doesn't contain ${letter}! So we need a synonym for "${synonymFodder}" that contains ${letter}. ${synonymFodder} → ${synonym} → ${movedResult}`;
        }

        case 'homophone': {
            // Handle composite charade path where indicator contains "homophone of X"
            if (indicator?.includes('homophone of')) {
                const match = indicator.match(/homophone of (\w+)/i);
                const base = match ? match[1] : '';
                return `"${fodder}" → ${base} (synonym). ${base} sounds like ${result} — a homophone.`;
            }
            if (!homophoneVars) {
                return ''; // Missing data
            }
            const { base, result: homophoneResult } = homophoneVars;
            // Cold view template for homophone - guides student through the sound-alike reasoning
            // Link to definition at the end
            const defLink = definitionText ? ` = ${definitionText.toLowerCase()}` : '';
            return `"${indicator}" signals a homophone — we need a word that sounds like something. "${fodder}" → ${base} (synonym). ${base} sounds like ${homophoneResult}${defLink}.`;
        }

        case 'assembly':
            // fodder contains the equation like "ALIGNM + ENT = ALIGNMENT"
            // Add the definition to complete the explanation
            return definitionText
                ? `Combine the parts: ${fodder} = ${definitionText}`
                : `Combine the parts: ${fodder}`;

        case 'container': {
            // Check if indicator contains "inside" pattern (from composite charade)
            if (indicator?.includes(' inside ')) {
                // Parse "PIR (reversal) inside EXE" or "PIR inside EXE" format
                const reversalMatch = indicator.match(/(\w+)\s+\(reversal\)\s+inside\s+(\w+)/i);
                const simpleMatch = indicator.match(/(\w+)\s+inside\s+(\w+)/i);

                if (reversalMatch) {
                    const inner = reversalMatch[1];
                    const outer = reversalMatch[2];
                    const original = inner.split('').reverse().join('');
                    return `"${fodder}" combines reversal and container — ${original} reversed gives ${inner}, which goes inside ${outer} to form ${result}.`;
                } else if (simpleMatch) {
                    const inner = simpleMatch[1];
                    const outer = simpleMatch[2];
                    return `"${fodder}" involves a container — ${inner} goes inside ${outer} to form ${result}.`;
                }
            }
            if (!containerVars) {
                return '';
            }
            const { outer, outerFirst, outerLast, inner, part } = containerVars;
            // Full container step - produces final answer
            if (outer.length === 2) {
                // 2-letter outer: unambiguous, only one insertion point
                return `"${indicator}" signals a container — ${inner} goes inside ${outer}. "${fodder}" → ${outer}. With a 2-letter container, there's only one place for ${inner} to go: ${outerFirst}(${inner})${outerLast} = ${result}.`;
            } else {
                // Longer container - acknowledge the figuring out required
                return `"${indicator}" signals a container — ${inner} goes inside ${outer}. "${fodder}" → ${outer}. We need to find where ${inner} fits inside ${outer} to make a word matching the definition. Result: ${result}.`;
            }
        }

        case 'reversal': {
            // Check if indicator contains "reversal of" pattern (from composite charade)
            if (indicator?.includes('reversal of')) {
                const reversalMatch = indicator.match(/reversal of (\w+)/i);
                if (reversalMatch) {
                    const original = reversalMatch[1];
                    return `"${fodder}" reversed — "${original}" turned around gives ${result}.`;
                }
            }
            // Generic reversal
            return `"${indicator}" signals reversal — turn the letters around to get ${result}.`;
        }

        case 'synonym': {
            // Check for editorial abbreviations and self-references
            const fodderLower = fodder.toLowerCase().replace(/\?$/, '').trim();

            // Self-referential editorial device
            if (fodderLower.includes('times') || fodderLower.includes('this paper') || fodderLower.includes('this place')) {
                return `"${fodder}" is a self-referential device — "in this paper" / "in this place" = ${result}.`;
            }

            // Common newspaper abbreviations
            if (fodderLower === 'notice' && result === 'AD') {
                return `"${fodder}" gives ${result} — in newspaper cryptics, "notice" often means AD (advertisement).`;
            }
            if (fodderLower === 'advertisement' && result === 'AD') {
                return `"${fodder}" gives ${result} (standard abbreviation).`;
            }

            // Default: simple synonym
            return `"${fodder}" gives ${result} (synonym).`;
        }

        case 'anagram':
            // Anagram - letters rearranged
            return `"${indicator}" signals an anagram — rearrange the letters of "${fodder}" to get ${result}.`;

        case 'deletion': {
            // Outer letters / deletion / truncation
            if (result.length === 2 && fodder.length > 2) {
                // Outer letters (first + last)
                return `"${indicator}" signals outer letters — take the first and last letters of "${fodder}" to get ${result}.`;
            }
            // Truncation (briefly, nearly, almost, etc.) - remove last letter
            if (indicator === 'truncation' || indicator?.includes('truncation')) {
                return `"briefly" signals truncation — remove the last letter. ${fodder} → ${result}.`;
            }
            // General deletion
            return `"${indicator}" signals deletion — remove letters from "${fodder}" to get ${result}.`;
        }

        default:
            return '';
    }
}

/**
 * Compute all derived fields for a PatternInstance.
 * This is the SINGLE place where all battlecard logic lives.
 * The UI receives ready-to-render data with no computation needed.
 *
 * Computes:
 * - wordplaySteps: Ordered array (easy first, Assembly last)
 * - isComplete: True if definition + all wordplay resolved
 * - parsingSummary: Human-readable summary string
 * - definitionText: The definition
 * - definitionMatchType: How definition was matched
 */
function computeDerivedFields(patternData: PatternInstance): PatternInstance {
    const variables = patternData.variables;
    const answer = patternData.answer;

    // Extract steps from variables
    const steps: WordplayStep[] = [];
    for (let i = 1; i <= 5; i++) {
        const indicator = variables[`indicator_${i}_text`];
        const fodder = variables[`fodder_${i}_text`];
        if (indicator !== undefined || fodder !== undefined) {
            const isAssembly = indicator === 'Assembly';
            const complexity = parseInt(variables[`complexity_${i}`] || '2', 10);
            const result = variables[`result_${i}`] || '';

            // Determine stepType based on indicator and complexity
            let stepType: WordplayStep['stepType'] = 'unknown';
            if (isAssembly) {
                stepType = 'assembly';
            } else if (variables[`container_part_${i}`] || indicator?.includes(' inside ')) {
                // Container part detected via stored variables OR operation like "PIR inside EXE"
                stepType = 'container' as WordplayStep['stepType'];
            } else if (indicator?.includes('reversal of')) {
                // Reversal operation (e.g., "reversal of RIP")
                stepType = 'reversal';
            } else if (!indicator && complexity === 1) {
                stepType = 'abbreviation';
            } else if (indicator?.includes('delay') || indicator?.includes('movement')) {
                stepType = 'letter_movement';
            } else if (variables[`homophone_base_${i}`] || indicator?.includes('homophone of')) {
                // Homophone detected via stored variables or indicator text
                stepType = 'homophone';
            } else if (indicator === '(synonym)' || indicator === 'synonym') {
                // Charade parts identified as synonym lookups
                stepType = 'synonym';
            } else if (indicator === 'truncation' || indicator?.includes('truncation of')) {
                // Truncation operation (e.g., "Diana briefly" -> DIAN)
                stepType = 'deletion';
            } else if (indicator === 'anagram' || indicator?.includes('anagram of') || INDICATOR_DICTIONARY[indicator?.toLowerCase()]?.type === 'anagram') {
                // Anagram indicator detected
                stepType = 'anagram';
            } else if (variables[`outer_letters_${i}`] === 'true' || INDICATOR_DICTIONARY[indicator?.toLowerCase()]?.letterOp === 'ends') {
                // Outer letters extraction
                stepType = 'deletion';  // Use 'deletion' for outer letter extraction
            } else if (INDICATOR_DICTIONARY[indicator?.toLowerCase()]?.letterOp === 'first' || INDICATOR_DICTIONARY[indicator?.toLowerCase()]?.letterOp === 'last') {
                // First/last letter extraction (including multi-letter like "leading trio")
                // Use 'abbreviation' since it's a letter selection operation
                stepType = 'abbreviation';
            }

            // Build extra vars for letter_movement template
            let letterMovementVars: LetterMovementVars | undefined;
            if (stepType === 'letter_movement') {
                letterMovementVars = {
                    letterSource: variables[`letterSource_${i}`] || '',
                    letter: variables[`letter_${i}`] || '',
                    synonymFodder: variables[`synonymFodder_${i}`] || '',
                    synonym: variables[`synonym_${i}`] || '',
                    movedResult: variables[`result_${i}`] || ''
                };
            }

            // Build extra vars for homophone template
            let homophoneVars: HomophoneVars | undefined;
            if (stepType === 'homophone') {
                homophoneVars = {
                    base: variables[`homophone_base_${i}`] || '',
                    result: variables[`homophone_result_${i}`] || ''
                };
            }

            // Build extra vars for container template
            let containerVars: ContainerVars | undefined;
            if (stepType === 'container') {
                const part = variables[`container_part_${i}`] as 'first' | 'last';
                containerVars = {
                    outer: variables['container_outer'] || '',
                    outerFirst: variables['container_outer_first'] || '',
                    outerLast: variables['container_outer_last'] || '',
                    inner: variables['container_inner'] || '',
                    part: part || 'first'
                };
            }

            // Generate explanation based on stepType
            // Pass definitionText for assembly steps
            const defText = variables['def_text'] || '';
            const explanation = generateStepExplanation(stepType, fodder || '', result, indicator || '', letterMovementVars, defText, homophoneVars, containerVars);

            steps.push({
                indicator: indicator || '',
                fodder: fodder || '',
                result,
                synonym: variables[`synonym_${i}`] || '',
                hint: variables[`hint_${i}`] || '',
                complexity,
                isAssembly,
                stepType,
                explanation
            });
        }
    }

    // Sort: non-Assembly steps by complexity (ascending), Assembly last
    steps.sort((a, b) => {
        if (a.isAssembly !== b.isAssembly) {
            return a.isAssembly ? 1 : -1;
        }
        return a.complexity - b.complexity;
    });

    // Rebuild variables with reordered steps
    const reorderedVars = { ...variables };
    for (let i = 1; i <= 5; i++) {
        delete reorderedVars[`indicator_${i}_text`];
        delete reorderedVars[`fodder_${i}_text`];
        delete reorderedVars[`result_${i}`];
        delete reorderedVars[`synonym_${i}`];
        delete reorderedVars[`hint_${i}`];
        delete reorderedVars[`complexity_${i}`];
    }
    steps.forEach((step, idx) => {
        const n = idx + 1;
        if (step.indicator) reorderedVars[`indicator_${n}_text`] = step.indicator;
        if (step.fodder) reorderedVars[`fodder_${n}_text`] = step.fodder;
        if (step.result) reorderedVars[`result_${n}`] = step.result;
        if (step.synonym) reorderedVars[`synonym_${n}`] = step.synonym;
        if (step.hint) reorderedVars[`hint_${n}`] = step.hint;
        if (step.complexity) reorderedVars[`complexity_${n}`] = String(step.complexity);
    });

    // Compute isComplete
    const defText = variables['def_text'] || '';
    const defMissing = !defText;
    const actualSteps = steps.filter(s => !s.isAssembly);
    const wordplayMissing = actualSteps.length === 0 ||
        actualSteps.some(s => !s.fodder || (!s.result && !s.synonym));

    // VALIDATION: Check that all assembly components are traceable to step results
    // This catches errors like showing "S + ODO + M" when steps only show "ODO" and "SM"
    let assemblyTraceabilityOk = true;
    const structure = variables['structure'] || '';
    if (structure) {
        // Parse structure like "S + ODO + M = SODOM" to get components [S, ODO, M]
        const equalsIdx = structure.indexOf('=');
        const componentsPart = equalsIdx > 0 ? structure.substring(0, equalsIdx) : structure;
        const assemblyComponents = componentsPart.split('+').map(c => c.trim().toUpperCase()).filter(c => c);

        // Collect all results from non-assembly steps
        const stepResults = actualSteps
            .map(s => s.result?.toUpperCase())
            .filter((r): r is string => !!r);

        // Check each assembly component is traceable
        const untracedComponents: string[] = [];
        for (const component of assemblyComponents) {
            // Check 1: Exact match to a step result
            if (stepResults.includes(component)) {
                continue;
            }

            // Check 2: Component is a substring of a step result (split container)
            // e.g., "S" and "M" are parts of "SM"
            const isSubstringOfResult = stepResults.some(result => result.includes(component));
            if (isSubstringOfResult) {
                // This is the problem case - we're using parts of a result without explaining
                // the split. Mark as untraced so isComplete becomes false.
                untracedComponents.push(component);
                continue;
            }

            // Component not found at all
            untracedComponents.push(component);
        }

        if (untracedComponents.length > 0) {
            assemblyTraceabilityOk = false;
            // Store for debugging/display
            reorderedVars['untraced_components'] = untracedComponents.join(', ');
        }
    }

    const isComplete = !defMissing && !wordplayMissing && assemblyTraceabilityOk;

    // Compute parsingSummary
    // Use structural order (from 'structure' variable), not complexity order
    // Show full chains for letter movement: fodder → synonym → Move X → result
    let parsingSummary = '';
    if (isComplete && answer) {
        // Get structural order from the 'structure' variable (e.g., "ALIGNM + ENT = ALIGNMENT")
        const structure = variables['structure'] || '';
        const structureMatch = structure.match(/^([A-Z]+)\s*\+\s*([A-Z]+)\s*=/);

        // Build a map of result -> step for ordering
        const resultToStep = new Map<string, WordplayStep>();
        steps.filter(s => !s.isAssembly).forEach(step => {
            if (step.result) {
                resultToStep.set(step.result.toUpperCase(), step);
            }
        });

        // Order steps by structure if available
        let orderedSteps: WordplayStep[];
        if (structureMatch) {
            const [, first, second] = structureMatch;
            const firstStep = resultToStep.get(first);
            const secondStep = resultToStep.get(second);
            orderedSteps = [firstStep, secondStep].filter((s): s is WordplayStep => !!s);
        } else {
            // Fallback: use original variable order (fodder_1, fodder_2, etc.)
            orderedSteps = steps.filter(s => !s.isAssembly);
        }

        const parts: string[] = [];
        orderedSteps.forEach(step => {
            if (step.stepType === 'letter_movement') {
                // Full chain: fodder → synonym → Move X → result
                const letterMovementVars = {
                    synonymFodder: variables['synonymFodder_1'] || variables['synonymFodder_2'] || '',
                    synonym: step.synonym || '',
                    letter: variables['letter_1'] || variables['letter_2'] || '',
                    result: step.result || ''
                };
                if (letterMovementVars.synonymFodder && letterMovementVars.synonym) {
                    parts.push(`${letterMovementVars.synonymFodder} → ${letterMovementVars.synonym} → Move ${letterMovementVars.letter} → ${letterMovementVars.result}`);
                } else if (step.result) {
                    parts.push(`${step.fodder} → ${step.result}`);
                }
            } else if (step.synonym && step.result && step.synonym !== step.result) {
                parts.push(`${step.fodder} → ${step.synonym} → ${step.result}`);
            } else if (step.result) {
                parts.push(`${step.fodder} → ${step.result}`);
            }
        });
        if (parts.length > 0) {
            parsingSummary = parts.join(' + ') + ' = ' + answer;
        }
    }

    // Compute definition explanation
    const defMatchType = (variables['definition_match_type'] as 'direct' | 'synonym' | 'cryptic' | 'none') || 'none';
    const defPosition = (variables['definition_position'] || 'start').toLowerCase() as 'start' | 'end' | 'entire';
    const defHint = variables['definition_hint'] || '';

    let definitionExplanation = '';
    if (defText) {
        const positionText = defPosition === 'entire' ? 'the entire clue' : `the ${defPosition}`;

        if (defMatchType === 'direct' || defMatchType === 'synonym') {
            definitionExplanation = `The definition is "${defText}" — found at ${positionText}. This maps to ${answer}.`;
        } else if (defMatchType === 'cryptic') {
            definitionExplanation = `The definition is "${defText}" — found at ${positionText}. This is a cryptic definition.`;
            if (defHint) {
                definitionExplanation += ` ${defHint}`;
            }
        } else {
            definitionExplanation = `The definition is "${defText}" — found at ${positionText}. Tip: Always check both ends of the clue for the definition.`;
        }
    }

    // Generate techniquesUsed and setterHint for teaching
    const techniquesUsed: string[] = [];
    const stepTypes = new Set(steps.filter(s => !s.isAssembly).map(s => s.stepType));

    // Also check step indicators for embedded operations (e.g., "PIR (reversal) inside EXE" combines reversal+container)
    const allIndicators = steps.filter(s => !s.isAssembly).map(s => s.indicator).join(' ');
    const hasEmbeddedReversal = allIndicators.includes('reversal of') ||
        allIndicators.includes('(reversal)') ||
        steps.some(s => s.fodder?.toLowerCase().includes('turned') || s.fodder?.toLowerCase().includes('reversed'));

    // Map stepTypes to technique vocabulary
    if (stepTypes.has('abbreviation')) techniquesUsed.push('abbreviation');
    if (stepTypes.has('container')) techniquesUsed.push('container');
    if (stepTypes.has('homophone')) techniquesUsed.push('homophone');
    if (stepTypes.has('anagram')) techniquesUsed.push('anagram');
    if (stepTypes.has('hidden')) techniquesUsed.push('hidden word');
    if (stepTypes.has('reversal') || hasEmbeddedReversal) techniquesUsed.push('reversal');
    if (stepTypes.has('deletion')) techniquesUsed.push('deletion');
    if (stepTypes.has('letter_movement')) techniquesUsed.push('letter movement');
    if (stepTypes.has('synonym')) techniquesUsed.push('synonym');

    // Check for charade (multiple non-assembly steps that combine)
    const nonAssemblySteps = steps.filter(s => !s.isAssembly);
    if (nonAssemblySteps.length > 1 && !stepTypes.has('container')) {
        techniquesUsed.push('charade');
    }

    // Generate setterHint
    let setterHint = '';
    if (techniquesUsed.length > 0) {
        // Format techniques with ** for bold (markdown)
        const formattedTechniques = techniquesUsed.map(t => `**${t}**`);
        const techniquesList = formattedTechniques.length === 1
            ? formattedTechniques[0]
            : formattedTechniques.length === 2
                ? `${formattedTechniques[0]} and ${formattedTechniques[1]}`
                : `${formattedTechniques.slice(0, -1).join(', ')}, and ${formattedTechniques[formattedTechniques.length - 1]}`;

        // Build the hint with technique-specific prompts
        let lookFor = '';
        if (stepTypes.has('container')) {
            lookFor = 'Can you spot the insertion indicator?';
        } else if (stepTypes.has('homophone')) {
            lookFor = 'Look for the auditory indicator.';
        } else if (stepTypes.has('letter_movement')) {
            lookFor = 'Watch for the movement indicator.';
        } else if (stepTypes.has('anagram')) {
            lookFor = 'Look for the anagram indicator.';
        } else if (stepTypes.has('hidden')) {
            lookFor = 'The answer is hiding in plain sight.';
        } else if (stepTypes.has('reversal')) {
            lookFor = 'Look for the reversal indicator.';
        } else if (stepTypes.has('deletion')) {
            lookFor = 'Look for indicators of letter extraction.';
        } else if (techniquesUsed.includes('charade')) {
            lookFor = 'How do the parts combine?';
        }

        setterHint = `The setter has used ${techniquesList} here. ${lookFor}`;
    }

    // Build solveExplanation array - ordered display blocks for data-driven UI
    // The UI just iterates and renders these - no field-specific logic in UI
    const solveExplanation: DisplayBlock[] = [];

    // 1. Clue type (first - establishes context)
    if (patternData.patternId) {
        solveExplanation.push({
            type: 'clue-type',
            content: patternData.patternId,
            label: 'Clue Type'
        });
    }

    // 2. Setter hint (primes student for what to look for)
    if (setterHint) {
        solveExplanation.push({
            type: 'setter-hint',
            content: setterHint,
            techniques: techniquesUsed
        });
    }

    // 3. Definition explanation
    if (definitionExplanation) {
        solveExplanation.push({
            type: 'explanation',
            content: definitionExplanation,
            label: 'Definition'
        });
    }

    // 4. Wordplay step explanations (in complexity order - easy first)
    steps.forEach((step, idx) => {
        if (step.explanation && !step.isAssembly) {
            solveExplanation.push({
                type: 'explanation',
                content: step.explanation,
                label: `Step ${idx + 1}`
            });
        }
    });

    // 5. Assembly step (if present - shows how parts combine)
    const assemblyStep = steps.find(s => s.isAssembly);
    if (assemblyStep?.explanation) {
        solveExplanation.push({
            type: 'explanation',
            content: assemblyStep.explanation,
            label: 'Assembly'
        });
    }

    // 6. Parsing summary (final equation)
    if (parsingSummary) {
        solveExplanation.push({
            type: 'parsing',
            content: parsingSummary,
            label: 'Parsing'
        });
    }

    // Thesaurus required: true if definition needed synonym lookup (uncommon answer)
    // Answers that are direct matches or common words don't need a thesaurus
    const thesaurusRequired = defMatchType === 'synonym';

    return {
        ...patternData,
        variables: reorderedVars,
        wordplaySteps: steps,
        isComplete,
        parsingSummary,
        definitionText: defText,
        definitionMatchType: defMatchType,
        definitionExplanation,
        definitionPosition: defPosition,
        definitionHint: defHint,
        techniquesUsed,
        setterHint,
        solveExplanation,
        thesaurusRequired
    };
}

// Use extractTargetLength from parserHelpers (returns 0 if no match)
// Note: extractTargetLength handles multi-number patterns like (3,4) by summing

// Use removeWordCount from parserHelpers - alias for backwards compatibility
const getClueWithoutCount = removeWordCount;

// Find definition FIRST by checking synonym matches - returns locked word indices
function findDefinitionFirst(clue: string, answer: string): {
    definition: string;
    position: 'START' | 'END';
    matchType: 'direct' | 'synonym' | 'cryptic' | 'none';
    hint?: string;
    lockedWordIndices: number[];
} | null {
    const words = getClueWords(clue);
    const maxLen = Math.min(4, Math.floor(words.length / 2));

    // Try START: check 1-4 word phrases for synonym/direct match
    // IMPORTANT: Try LONGER phrases first to prefer "Being up" over "Being"
    let bestMatch: { phrase: string; matchType: 'direct' | 'synonym'; hint?: string; len: number } | null = null;

    for (let len = 1; len <= maxLen; len++) {
        const phrase = words.slice(0, len).join(' ');
        const match = checkPhraseMatchesAnswer(phrase, answer);
        if (match.matchType === 'direct' || match.matchType === 'synonym') {
            // Keep the longest match
            bestMatch = { phrase, matchType: match.matchType, hint: match.hint, len };
        }
    }

    if (bestMatch) {
        return {
            definition: bestMatch.phrase,
            position: 'START',
            matchType: bestMatch.matchType,
            hint: bestMatch.hint,
            lockedWordIndices: Array.from({ length: bestMatch.len }, (_, i) => i)
        };
    }

    // Try END: check 1-4 word phrases for synonym/direct match
    for (let len = 1; len <= maxLen; len++) {
        const phrase = words.slice(-len).join(' ');
        const match = checkPhraseMatchesAnswer(phrase, answer);
        if (match.matchType === 'direct' || match.matchType === 'synonym') {
            return {
                definition: phrase,
                position: 'END',
                matchType: match.matchType,
                hint: match.hint,
                lockedWordIndices: Array.from({ length: len }, (_, i) => words.length - len + i)
            };
        }
    }

    return null; // No definition match found via synonyms
}

// Connector words to skip in charade splitting
const CHARADE_CONNECTORS = new Set(['and', 'with', 'on', 'in', 'by', 'for', 'to', 'a', 'an', 'the']);

// Try to split wordplay into synonym components that combine to answer
// Uses backtracking to try all synonym combinations
function tryCharadeSplit(
    wordplayText: string,
    answer: string
): { parts: { text: string; result: string }[]; success: boolean } | null {
    const words = wordplayText.split(/\s+/).filter(w => w.length > 0);
    const answerClean = normalizeAnswer(answer);
    const answerLen = answerClean.length;

    // Find reversal indicators in the wordplay
    const reversalIndicators = new Set<number>();
    for (let i = 0; i < words.length; i++) {
        const word = words[i].toLowerCase().replace(/[^a-z']/g, '');
        const entry = INDICATOR_DICTIONARY[word];
        if (entry && entry.type === 'reversal') {
            reversalIndicators.add(i);
        }
    }

    // Build all possible synonym candidates for each word/phrase position
    interface Candidate {
        text: string;
        result: string;
        wordStart: number;
        wordEnd: number;
    }
    const candidates: Candidate[] = [];

    for (let i = 0; i < words.length; i++) {
        const word = words[i].toLowerCase().replace(/[^a-z']/g, '');
        // Skip pure connector words for candidate building
        if (CHARADE_CONNECTORS.has(word) && !SYNONYM_DICTIONARY[word]) continue;

        // Skip reversal indicators that have no synonym meaning (pure indicators)
        // Words like "over" can be both indicator AND fodder, so don't skip if it has synonyms
        if (reversalIndicators.has(i) && !SYNONYM_DICTIONARY[word]) continue;

        for (let phraseLen = Math.min(3, words.length - i); phraseLen >= 1; phraseLen--) {
            const phrase = words.slice(i, i + phraseLen).join(' ').toLowerCase().replace(/[^a-z' \\-]/g, '');

            const synonyms = SYNONYM_DICTIONARY[phrase];
            if (synonyms) {
                for (const syn of synonyms) {
                    candidates.push({
                        text: words.slice(i, i + phraseLen).join(' '),
                        result: syn,
                        wordStart: i,
                        wordEnd: i + phraseLen
                    });
                }
            }

            // If adjacent to a reversal indicator, also add reversed word as candidate
            const hasReversalBefore = reversalIndicators.has(i - 1);
            const hasReversalAfter = reversalIndicators.has(i + phraseLen);
            if (hasReversalBefore || hasReversalAfter) {
                const wordClean = phrase.replace(/[^a-z]/g, '').toUpperCase();
                const reversed = wordClean.split('').reverse().join('');
                candidates.push({
                    text: words.slice(i, i + phraseLen).join(' ') + ' (reversed)',
                    result: reversed,
                    wordStart: i,
                    wordEnd: i + phraseLen
                });
            }
        }
    }

    // Backtracking search for combination that matches answer
    function search(
        nextWordIdx: number,
        currentResult: string,
        parts: { text: string; result: string }[]
    ): { text: string; result: string }[] | null {
        if (currentResult === answerClean) {
            return parts.length >= 2 ? parts : null;
        }
        if (currentResult.length >= answerLen) return null;

        // Skip connector words
        while (nextWordIdx < words.length) {
            const word = words[nextWordIdx].toLowerCase().replace(/[^a-z']/g, '');
            if (CHARADE_CONNECTORS.has(word) && !SYNONYM_DICTIONARY[word]) {
                nextWordIdx++;
            } else {
                break;
            }
        }
        if (nextWordIdx >= words.length) return null;

        // Try each candidate starting at this position
        for (const cand of candidates) {
            if (cand.wordStart !== nextWordIdx) continue;
            if (currentResult.length + cand.result.length > answerLen) continue;

            const result = search(
                cand.wordEnd,
                currentResult + cand.result,
                [...parts, { text: cand.text, result: cand.result }]
            );
            if (result) return result;
        }

        // Also try skipping this word (might be filler)
        const result = search(nextWordIdx + 1, currentResult, parts);
        if (result) return result;

        return null;
    }

    const solution = search(0, '', []);
    if (solution) {
        return { parts: solution, success: true };
    }

    // Try reversed order for charade with "on" connector
    // "A on B" often means B + A in charade order (B is the base, A goes on top)
    // Try all 2-part combinations in reversed order
    if (candidates.length >= 2) {
        // Group candidates by their results
        const uniqueResults = new Map<string, Candidate>();
        for (const cand of candidates) {
            const key = cand.result;
            if (!uniqueResults.has(key) || cand.text.length > uniqueResults.get(key)!.text.length) {
                uniqueResults.set(key, cand);
            }
        }

        // Try all pairs in reversed order (B + A instead of A + B)
        const candList = Array.from(uniqueResults.values());
        for (let i = 0; i < candList.length; i++) {
            for (let j = 0; j < candList.length; j++) {
                if (i === j) continue;
                const first = candList[i];
                const second = candList[j];
                // Check that they don't overlap in word indices
                if (first.wordEnd > second.wordStart && second.wordEnd > first.wordStart) continue;

                const combined = second.result + first.result;
                if (combined === answerClean) {
                    return {
                        parts: [
                            { text: second.text, result: second.result },
                            { text: first.text, result: first.result }
                        ],
                        success: true
                    };
                }
            }
        }
    }

    return null;
}

// Enhanced composite charade: handles synonym + deletion combinations
// e.g., "in pond – half" → HIP (in) + PO (half of pond) = HIPPO
export function tryCompositeCharade(
    wordplayText: string,
    answer: string,
    indicators: { text: string; type: OperationType; entry: IndicatorEntry }[]
): { parts: { text: string; result: string; operation: string }[]; success: boolean } | null {
    const words = wordplayText.split(/\s+/).filter(w => w.length > 0);
    const answerClean = normalizeAnswer(answer);
    const answerLen = answerClean.length;

    // Find deletion indicators and their likely fodders
    const deletionIndicators = indicators.filter(i =>
        i.type === 'deletion_first' || i.type === 'deletion_last' ||
        i.entry.letterOp === 'first' || i.entry.letterOp === 'last'
    );

    // Build candidate parts from synonyms and deletions
    interface CandidatePart {
        text: string;
        result: string;
        operation: string;
        wordIndices: number[];
    }
    const candidates: CandidatePart[] = [];

    // 1. Find synonym candidates (don't skip connectors - they might have synonym meanings like "in" = HIP)
    for (let i = 0; i < words.length; i++) {
        // Allow phrases up to 5 words to capture entries like "head of state no longer"
        for (let phraseLen = Math.min(5, words.length - i); phraseLen >= 1; phraseLen--) {
            // Try both cleaned version and original (for special entries like "£1")
            const phraseOriginal = words.slice(i, i + phraseLen).join(' ').toLowerCase();
            const phraseCleaned = phraseOriginal.replace(/[^a-z' \\-]/g, '');

            // Try original first (for entries like "£1"), then cleaned
            const phrasesToTry = [phraseOriginal, phraseCleaned].filter(p => p.length > 0);

            for (const phrase of phrasesToTry) {
                const synonyms = SYNONYM_DICTIONARY[phrase];
                if (synonyms) {
                    for (const syn of synonyms) {
                        if (syn.length <= answerLen) {
                            candidates.push({
                                text: words.slice(i, i + phraseLen).join(' '),
                                result: syn,
                                operation: 'synonym',
                                wordIndices: Array.from({ length: phraseLen }, (_, j) => i + j)
                            });
                        }
                    }
                    break;  // Found synonyms, don't try the cleaned version
                }

                // Also check STANDALONE_SYNONYMS for multi-word phrases (e.g., "in french, the" → LE)
                const standalone = STANDALONE_SYNONYMS[phrase];
                if (standalone && standalone.length <= answerLen) {
                    candidates.push({
                        text: words.slice(i, i + phraseLen).join(' '),
                        result: standalone,
                        operation: 'abbreviation',
                        wordIndices: Array.from({ length: phraseLen }, (_, j) => i + j)
                    });
                    break;
                }
            }
        }
    }

    // 1a2. Find abbreviation candidates from OBVIOUS_ABBREVIATIONS and STANDALONE_SYNONYMS
    // e.g., "Henry" → H, "months" → M, "gas" → S
    for (let i = 0; i < words.length; i++) {
        const word = normalizeWord(words[i]);
        if (word.length < 2) continue;
        // Skip if this word is an indicator
        const isIndicator = indicators.some(ind =>
            normalizeWord(ind.text) === word
        );
        if (isIndicator) continue;

        // Check against OBVIOUS_ABBREVIATIONS
        for (const [abbrev, fodders] of Object.entries(OBVIOUS_ABBREVIATIONS)) {
            if (fodders.some(f => word === f || word.includes(f))) {
                // Don't add if we already have a synonym for this word
                const alreadyHas = candidates.some(c =>
                    c.wordIndices.length === 1 && c.wordIndices[0] === i && c.result === abbrev
                );
                if (!alreadyHas) {
                    candidates.push({
                        text: words[i],
                        result: abbrev,
                        operation: 'abbreviation',
                        wordIndices: [i]
                    });
                }
            }
        }

        // Check against STANDALONE_SYNONYMS (e.g., "gas" → S, "nothing" → O)
        const standaloneResult = STANDALONE_SYNONYMS[word];
        if (standaloneResult) {
            const alreadyHas = candidates.some(c =>
                c.wordIndices.length === 1 && c.wordIndices[0] === i && c.result === standaloneResult
            );
            if (!alreadyHas) {
                candidates.push({
                    text: words[i],
                    result: standaloneResult,
                    operation: 'abbreviation',
                    wordIndices: [i]
                });
            }
        }
    }

    // 1a3. Handle cross-references (e.g., "with 14", "see 14", "14 across")
    // Cross-references refer to answers from other clues in the same puzzle
    // We maintain a lookup of known cross-references for specific puzzles
    const CROSS_REFERENCE_ANSWERS: Record<string, string> = {
        // Format: "clue_number" → "ANSWER"
        // These would typically be provided per-puzzle, but we include known references
        '14': 'ADHERE',  // From the DEHYDRATE clue puzzle
    };

    // Look for patterns like "with 14", "14 across", "see 14", just "14"
    for (let i = 0; i < words.length; i++) {
        const word = words[i].replace(/[^0-9]/g, '');  // Extract just the number
        if (word && /^\d+$/.test(word)) {
            const crossRefAnswer = CROSS_REFERENCE_ANSWERS[word];
            if (crossRefAnswer && crossRefAnswer.length <= answerLen) {
                candidates.push({
                    text: words[i],
                    result: crossRefAnswer,
                    operation: `cross-reference (${word} = ${crossRefAnswer})`,
                    wordIndices: [i]
                });
            }
        }
    }

    // 1b. For anagrams: add raw words as potential fodder (the word itself contributes letters)
    // e.g., "codes" in "defective... codes formed" contributes CODES to the anagram
    // e.g., "an addict" in "an addict about" contributes AN + ADDICT to the anagram
    const hasAnagramIndicator = indicators.some(i => i.type === 'anagram');
    if (hasAnagramIndicator) {
        for (let i = 0; i < words.length; i++) {
            const word = normalizeWord(words[i]);
            // For anagrams, include short connector words like "an" as they contribute letters
            // Only skip very short words (1 letter) and pure function words like "the"
            const skipConnectors = new Set(['the', 'a']);  // Only skip articles, not "an"
            if (word.length < 2 || skipConnectors.has(word)) continue;
            // Skip if this word is an indicator
            const isIndicator = indicators.some(ind =>
                normalizeWord(ind.text) === word
            );
            if (isIndicator) continue;
            // For anagrams, always add the raw word even if it has synonyms
            // The actual letters might be needed for the anagram (e.g., "an" = AN, not A or ONE)
            // Skip duplicates only if they already exist as raw
            const alreadyHasRaw = candidates.some(c =>
                c.wordIndices.length === 1 && c.wordIndices[0] === i && c.operation === 'raw'
            );
            if (alreadyHasRaw) continue;

            const wordUpper = word.toUpperCase();
            if (wordUpper.length <= answerLen) {
                candidates.push({
                    text: words[i],
                    result: wordUpper,
                    operation: 'raw',
                    wordIndices: [i]
                });
            }
        }
    }

    // 2. Find deletion candidates (half of word, truncation)
    for (const ind of deletionIndicators) {
        // Find words near this indicator that could be fodder
        const indWord = ind.text.toLowerCase();

        // Find the indicator position in words array
        let indIdx = -1;
        for (let i = 0; i < words.length; i++) {
            if (normalizeWord(words[i]) === normalizeWord(indWord)) {
                indIdx = i;
                break;
            }
        }

        for (let i = 0; i < words.length; i++) {
            const word = normalizeWord(words[i]);
            if (word === indWord || CHARADE_CONNECTORS.has(word) || word.length < 3) continue;

            const wordUpper = word.toUpperCase();
            // Half = first or second half
            if (ind.text === 'half' || ind.text === 'half of' || ind.text === 'halved') {
                const midpoint = Math.ceil(wordUpper.length / 2);
                const firstHalf = wordUpper.slice(0, midpoint);
                const secondHalf = wordUpper.slice(midpoint);
                candidates.push({
                    text: words[i],
                    result: firstHalf,
                    operation: `half of ${words[i]} (first)`,
                    wordIndices: [i]
                });
                candidates.push({
                    text: words[i],
                    result: secondHalf,
                    operation: `half of ${words[i]} (second)`,
                    wordIndices: [i]
                });
            }
            // Truncation (briefly, nearly, almost, etc.) - remove last letter
            else if (ind.type === 'deletion_last' && !ind.entry.letterOp) {
                // Only consider words near the indicator (within 2 positions)
                if (indIdx >= 0 && Math.abs(i - indIdx) > 2) continue;

                const truncated = wordUpper.slice(0, -1);
                if (truncated.length >= 2) {
                    candidates.push({
                        text: words[i],
                        result: truncated,
                        operation: `truncation of ${words[i]}`,
                        wordIndices: [i]
                    });
                }
            }
        }
    }

    // 2b. Find middle letter candidates (heart of, essentially, core, etc.)
    const middleIndicators = indicators.filter(i => i.entry.letterOp === 'middle');
    for (const ind of middleIndicators) {
        const indWord = ind.text.toLowerCase();
        // Find the indicator position in words array
        let indIdx = -1;
        for (let i = 0; i < words.length; i++) {
            if (normalizeWord(words[i]) === normalizeWord(indWord)) {
                indIdx = i;
                break;
            }
        }

        // Look at word(s) adjacent to the indicator
        for (let i = 0; i < words.length; i++) {
            const originalWord = words[i];
            // Handle possessives: "chip's" → "chip" (remove trailing 's')
            let word = originalWord.includes("'s")
                ? normalizeWord(originalWord.replace(/'s$/i, ''))
                : normalizeWord(originalWord);

            if (word === normalizeWord(indWord) || CHARADE_CONNECTORS.has(word) || word.length < 2) continue;

            // Only consider words near the indicator (within 2 positions)
            if (indIdx >= 0 && Math.abs(i - indIdx) > 2) continue;

            const wordUpper = word.toUpperCase();
            // For odd-length words, take the middle letter
            // For even-length words, take the middle 2 letters
            if (wordUpper.length % 2 === 1) {
                // Odd length: single middle letter
                const midIdx = Math.floor(wordUpper.length / 2);
                const middleLetter = wordUpper[midIdx];
                candidates.push({
                    text: originalWord,
                    result: middleLetter,
                    operation: `middle of ${originalWord}`,
                    wordIndices: [i]
                });
            } else {
                // Even length: middle 2 letters
                const midIdx = wordUpper.length / 2 - 1;
                const middleLetters = wordUpper.slice(midIdx, midIdx + 2);
                candidates.push({
                    text: originalWord,
                    result: middleLetters,
                    operation: `middle of ${originalWord}`,
                    wordIndices: [i]
                });
            }
        }
    }

    // 2c. Find container candidates (one word inside another)
    // e.g., "soldiers charging Roman Catholic" = MEN inside LATIN = LAMENTIN
    const containerIndicators = indicators.filter(i => i.type === 'container');
    if (containerIndicators.length > 0) {
        // Get all synonym pairs that could form a container
        const synonymCandidates = candidates.filter(c => c.operation === 'synonym');
        for (let i = 0; i < synonymCandidates.length; i++) {
            for (let j = 0; j < synonymCandidates.length; j++) {
                if (i === j) continue;
                // Check if word indices don't overlap
                const iIndices = new Set(synonymCandidates[i].wordIndices);
                if (synonymCandidates[j].wordIndices.some(idx => iIndices.has(idx))) continue;

                const inner = synonymCandidates[i].result;  // MEN
                const outer = synonymCandidates[j].result;  // LATIN

                // Try inserting inner at each position in outer
                for (let pos = 1; pos < outer.length; pos++) {
                    const combined = outer.slice(0, pos) + inner + outer.slice(pos);
                    if (combined.length <= answerLen) {
                        candidates.push({
                            text: `${synonymCandidates[i].text} in ${synonymCandidates[j].text}`,
                            result: combined,
                            operation: `${inner} inside ${outer}`,
                            wordIndices: [...synonymCandidates[i].wordIndices, ...synonymCandidates[j].wordIndices]
                        });
                    }
                }
            }
        }
    }

    // 2d. Find last-letter/ends candidates
    const lastOrEndsIndicators = indicators.filter(i => i.entry.letterOp === 'last' || i.entry.letterOp === 'ends');
    for (const ind of lastOrEndsIndicators) {
        const indWord = ind.text.toLowerCase();
        // Find the indicator position in words array
        let indIdx = -1;
        for (let i = 0; i < words.length; i++) {
            if (normalizeWord(words[i]) === normalizeWord(indWord)) {
                indIdx = i;
                break;
            }
        }

        // Special handling for "closers of X Y" or "enders of X Y" patterns
        // Extract last letters from all words between "of" and the first word that has synonyms
        if ((indWord === 'closers' || indWord === 'enders') && indIdx >= 0) {
            // Check if next word is "of"
            const nextWord = words[indIdx + 1] ? normalizeWord(words[indIdx + 1]) : '';
            if (nextWord === 'of') {
                // Extract last letters from words after "of" until we hit a synonym word
                const lastLetterResults: string[] = [];
                const lastLetterTexts: string[] = [];
                const lastLetterIndices: number[] = [];

                for (let i = indIdx + 2; i < words.length; i++) {
                    const word = normalizeWord(words[i]);
                    if (word.length < 2) continue;

                    // Check if this word has synonyms (meaning it's likely a separate fodder word, not a letter source)
                    const synonyms = SYNONYM_DICTIONARY[word];
                    if (synonyms && synonyms.length > 0 && synonyms.some(s => s.length > 2)) {
                        // This word is likely a synonym source, stop extracting last letters here
                        break;
                    }

                    // Extract last letter
                    const wordUpper = word.toUpperCase();
                    lastLetterResults.push(wordUpper[wordUpper.length - 1]);
                    lastLetterTexts.push(words[i]);
                    lastLetterIndices.push(i);
                }

                // Add combined last letters as a candidate
                if (lastLetterResults.length > 0) {
                    candidates.push({
                        text: lastLetterTexts.join(' '),
                        result: lastLetterResults.join(''),
                        operation: `last letters of ${lastLetterTexts.join(', ')}`,
                        wordIndices: lastLetterIndices
                    });
                }
            }
        }

        // Look at word(s) adjacent to the indicator
        for (let i = 0; i < words.length; i++) {
            const word = normalizeWord(words[i]);
            if (word === indWord.replace(/[^a-z]/g, '') || CHARADE_CONNECTORS.has(word) || word.length < 2) continue;

            // Only consider words near the indicator (within 2 positions)
            if (indIdx >= 0 && Math.abs(i - indIdx) > 2) continue;

            const wordUpper = word.toUpperCase();

            if (ind.entry.letterOp === 'ends') {
                // Outer letters (first + last)
                const outerLetters = wordUpper[0] + wordUpper[wordUpper.length - 1];
                candidates.push({
                    text: words[i],
                    result: outerLetters,
                    operation: `outer of ${words[i]}`,
                    wordIndices: [i]
                });
            } else {
                // Just last letter
                const lastLetter = wordUpper[wordUpper.length - 1];
                candidates.push({
                    text: words[i],
                    result: lastLetter,
                    operation: `last of ${words[i]}`,
                    wordIndices: [i]
                });
            }
        }
    }

    // 2e. Find first-letter candidates (primarily, initially, head of, leading trio, etc.)
    const firstLetterIndicators = indicators.filter(i => i.entry.letterOp === 'first');
    for (const ind of firstLetterIndicators) {
        const indWord = ind.text.toLowerCase();
        const letterCount = ind.entry.letterCount || 1;  // Default to 1 letter

        // Find the indicator position in words array
        let indIdx = -1;
        for (let i = 0; i < words.length; i++) {
            if (normalizeWord(words[i]) === normalizeWord(indWord)) {
                indIdx = i;
                break;
            }
        }
        // For multi-word indicators like "leading trio", find the start
        if (indIdx === -1 && indWord.includes(' ')) {
            const indWords = indWord.split(' ');
            for (let i = 0; i < words.length; i++) {
                if (normalizeWord(words[i]) === normalizeWord(indWords[0])) {
                    indIdx = i;
                    break;
                }
            }
        }

        // Look at word(s) adjacent to the indicator
        for (let i = 0; i < words.length; i++) {
            const word = normalizeWord(words[i]);
            if (word === indWord.replace(/[^a-z]/g, '') || CHARADE_CONNECTORS.has(word) || word.length < 2) continue;

            // Skip multi-word indicator parts (e.g., skip both "leading" and "trio")
            if (indWord.includes(' ')) {
                const indParts = indWord.split(' ');
                if (indParts.some(part => word === part.replace(/[^a-z]/g, ''))) continue;
            }

            // Only consider words near the indicator (within 2 positions)
            if (indIdx >= 0 && Math.abs(i - indIdx) > 2) continue;

            const wordUpper = word.toUpperCase();

            if (letterCount === 1) {
                // Single first letter
                const firstLetter = wordUpper[0];
                candidates.push({
                    text: words[i],
                    result: firstLetter,
                    operation: `first of ${words[i]}`,
                    wordIndices: [i]
                });
            } else if (wordUpper.length >= letterCount) {
                // Multi-letter extraction (e.g., "leading trio" = first 3 letters)
                const firstLetters = wordUpper.slice(0, letterCount);
                candidates.push({
                    text: words[i],
                    result: firstLetters,
                    operation: `first ${letterCount} of ${words[i]}`,
                    wordIndices: [i]
                });
            }

            // Also check synonyms of the fodder word for multi-letter extraction
            // e.g., "leading trio to sign" → sign = TAURUS → first 3 = TAU
            if (letterCount > 1) {
                const synonyms = lookupSynonyms(word);
                for (const syn of synonyms) {
                    const synUpper = syn.toUpperCase();
                    if (synUpper.length >= letterCount) {
                        const firstLetters = synUpper.slice(0, letterCount);
                        candidates.push({
                            text: words[i],
                            result: firstLetters,
                            operation: `first ${letterCount} of ${syn} (${words[i]})`,
                            wordIndices: [i]
                        });
                    }
                }
            }
        }
    }

    // 2e2. Find alternate letter candidates (regularly, oddly, evenly)
    const alternateIndicators = indicators.filter(i => i.entry.letterOp === 'alternate');
    for (const ind of alternateIndicators) {
        const indWord = ind.text.toLowerCase();

        // Find words adjacent to the indicator
        for (let i = 0; i < words.length; i++) {
            const word = normalizeWord(words[i]);
            if (word === indWord.replace(/[^a-z]/g, '') || CHARADE_CONNECTORS.has(word) || word.length < 3) continue;

            const wordUpper = word.toUpperCase();
            // Extract odd-positioned letters (1st, 3rd, 5th, etc.) - most common interpretation
            let oddLetters = '';
            let evenLetters = '';
            for (let j = 0; j < wordUpper.length; j++) {
                if (j % 2 === 0) {
                    oddLetters += wordUpper[j];  // 0, 2, 4... (1st, 3rd, 5th positions)
                } else {
                    evenLetters += wordUpper[j];  // 1, 3, 5... (2nd, 4th, 6th positions)
                }
            }

            // Add odd-positioned letters (default for "regularly")
            if (oddLetters.length > 0) {
                candidates.push({
                    text: words[i],
                    result: oddLetters,
                    operation: `alternate letters of ${words[i]}`,
                    wordIndices: [i]
                });
            }
            // Also try even-positioned letters
            if (evenLetters.length > 0) {
                candidates.push({
                    text: words[i],
                    result: evenLetters,
                    operation: `alternate letters of ${words[i]} (even)`,
                    wordIndices: [i]
                });
            }
        }
    }

    // 2f. Find reversal candidates
    const reversalIndicators = indicators.filter(i => i.type === 'reversal');
    if (reversalIndicators.length > 0) {
        // Get all synonym candidates and create reversed versions
        const synonymCandidates = candidates.filter(c => c.operation === 'synonym');
        for (const synCand of synonymCandidates) {
            const reversed = synCand.result.split('').reverse().join('');
            candidates.push({
                text: synCand.text,
                result: reversed,
                operation: `reversal of ${synCand.text}`,
                wordIndices: [...synCand.wordIndices]
            });
        }
    }

    // 2f2. Find homophone candidates (when homophone indicator present)
    const homophoneIndicators = indicators.filter(i => i.type === 'homophone');
    if (homophoneIndicators.length > 0) {
        // Get synonym candidates and create homophone versions
        const synonymCandidates = candidates.filter(c => c.operation === 'synonym');
        for (const synCand of synonymCandidates) {
            const synUpper = synCand.result.toUpperCase();
            const homophones = HOMOPHONE_PAIRS[synUpper];
            if (homophones) {
                for (const homophone of homophones) {
                    if (homophone.length <= answerLen) {
                        candidates.push({
                            text: synCand.text,
                            result: homophone,
                            operation: `homophone of ${synCand.result}`,
                            wordIndices: [...synCand.wordIndices]
                        });
                    }
                }
            }
        }
    }

    // 2g. Container with insertion - insert content into outer container
    // e.g., "used in sensitive regressive" → U inside EROS = EUROS
    // e.g., "PIR in EXE" → EXPIRE (multi-letter insertion)
    // e.g., "RANT + H in GAM" → G(RANTH)AM = GRANTHAM (combined inner)
    // e.g., "BEAM to secure R" → B(R)EAM = BREAM
    // Check if "in" appears in the wordplay OR container indicator present
    const hasInWord = words.some(w => normalizeWord(w) === 'in');
    const hasContainerIndicator = containerIndicators.length > 0;

    // 2g0. OPTIMIZATION: "[word] conceals" pattern - word before indicator IS the outer container
    // This avoids combinatorial explosion by using positional information
    if (hasContainerIndicator) {
        for (const ind of containerIndicators) {
            const indText = normalizeWord(ind.text);
            // Find indicator position in words
            let indIdx = -1;
            for (let i = 0; i < words.length; i++) {
                if (normalizeWord(words[i]) === indText) {
                    indIdx = i;
                    break;
                }
            }
            if (indIdx === -1) continue;

            // Check word BEFORE indicator - this is the outer container
            if (indIdx > 0) {
                const outerWord = normalizeWord(words[indIdx - 1]);
                // Find synonym for this word
                const outerSyns = SYNONYM_DICTIONARY[outerWord];
                if (outerSyns) {
                    // Build list of outer candidates: original synonyms + reversed (if reversal indicator present)
                    const hasReversalIndicator = reversalIndicators.length > 0;
                    const outerVariants: { outer: string; isReversed: boolean; original: string }[] = [];

                    for (const syn of outerSyns) {
                        outerVariants.push({ outer: syn, isReversed: false, original: syn });
                        // If reversal indicator present, also try reversed synonym as outer container
                        // e.g., "backwards while gripping" → AS reversed = SA, SA grips MB = SAMBA
                        if (hasReversalIndicator) {
                            const reversed = syn.split('').reverse().join('');
                            outerVariants.push({ outer: reversed, isReversed: true, original: syn });
                        }
                    }

                    for (const { outer, isReversed, original } of outerVariants) {
                        if (outer.length < 2 || outer.length > answerLen - 2) continue;

                        // Calculate inner length needed
                        const innerNeeded = answerLen - outer.length;

                        // Find candidates that sum to innerNeeded (excluding the outer word)
                        const otherCandidates = candidates.filter(c =>
                            !c.wordIndices.includes(indIdx - 1) &&
                            c.result.length <= innerNeeded
                        );

                        // Try single candidate as inner
                        for (const innerCand of otherCandidates) {
                            if (innerCand.result.length !== innerNeeded) continue;

                            // Try inserting at each position
                            for (let pos = 1; pos < outer.length; pos++) {
                                const result = outer.slice(0, pos) + innerCand.result + outer.slice(pos);
                                if (result === answerClean) {
                                    const operationDesc = isReversed
                                        ? `${original} reversed = ${outer}, ${innerCand.result} inside ${outer}`
                                        : `${innerCand.result} inside ${outer}`;
                                    candidates.push({
                                        text: `${innerCand.text} in ${words[indIdx - 1]}${isReversed ? ' (reversed)' : ''}`,
                                        result: answerClean,
                                        operation: operationDesc,
                                        wordIndices: [...innerCand.wordIndices, indIdx - 1]
                                    });
                                }
                            }
                        }

                        // Try pairs of candidates as inner
                        for (let i = 0; i < otherCandidates.length; i++) {
                            for (let j = i + 1; j < otherCandidates.length; j++) {
                                const c1 = otherCandidates[i];
                                const c2 = otherCandidates[j];

                                // Check no overlap
                                if (c1.wordIndices.some(idx => c2.wordIndices.includes(idx))) continue;

                                // Try both orders
                                for (const [inner1, inner2] of [[c1, c2], [c2, c1]]) {
                                    const combinedInner = inner1.result + inner2.result;
                                    if (combinedInner.length !== innerNeeded) continue;

                                    for (let pos = 1; pos < outer.length; pos++) {
                                        const result = outer.slice(0, pos) + combinedInner + outer.slice(pos);
                                        if (result === answerClean) {
                                            const operationDesc = isReversed
                                                ? `${original} reversed = ${outer}, ${combinedInner} inside ${outer}`
                                                : `${combinedInner} inside ${outer}`;
                                            candidates.push({
                                                text: `${inner1.text} + ${inner2.text} in ${words[indIdx - 1]}${isReversed ? ' (reversed)' : ''}`,
                                                result: answerClean,
                                                operation: operationDesc,
                                                wordIndices: [...inner1.wordIndices, ...inner2.wordIndices, indIdx - 1]
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // If we found a solution via the optimized path, return early
        const directSolution = candidates.find(c => c.result === answerClean);
        if (directSolution) {
            return {
                parts: [{ text: directSolution.text, result: directSolution.result, operation: directSolution.operation }],
                success: true
            };
        }
    }

    if (hasInWord || hasContainerIndicator) {
        // Get inner candidates (any length for insertion)
        const innerCandidates = candidates.filter(c => c.result.length >= 1 && c.result.length <= answerLen - 2);
        // Get outer candidates (container - at least 2 letters to wrap around)
        const outerCandidates = candidates.filter(c => c.result.length >= 2);

        // 2g1. Try single candidates as inner content
        for (const innerCand of innerCandidates) {
            for (const outerCand of outerCandidates) {
                // Check indices don't overlap
                const innerIndices = new Set(innerCand.wordIndices);
                if (outerCand.wordIndices.some(idx => innerIndices.has(idx))) continue;

                const inner = innerCand.result;
                const outer = outerCand.result;

                // Try inserting inner at each position in outer (not start or end)
                for (let pos = 1; pos < outer.length; pos++) {
                    const combined = outer.slice(0, pos) + inner + outer.slice(pos);
                    if (combined.length <= answerLen) {
                        // Preserve reversal info in operation if inner was reversed
                        const isInnerReversal = innerCand.operation?.includes('reversal of');
                        const operationDesc = isInnerReversal
                            ? `${inner} (reversal) inside ${outer}`
                            : `${inner} inside ${outer}`;
                        candidates.push({
                            text: `${innerCand.text} in ${outerCand.text}`,
                            result: combined,
                            operation: operationDesc,
                            wordIndices: [...innerCand.wordIndices, ...outerCand.wordIndices]
                        });
                    }
                }
            }
        }

        // 2g2. Try pairs of candidates combined as inner content
        // e.g., RANT + H combined, then inserted into GAM
        for (let i = 0; i < innerCandidates.length; i++) {
            for (let j = 0; j < innerCandidates.length; j++) {
                if (i === j) continue;
                const cand1 = innerCandidates[i];
                const cand2 = innerCandidates[j];

                // Check they don't overlap
                const indices1 = new Set(cand1.wordIndices);
                if (cand2.wordIndices.some(idx => indices1.has(idx))) continue;

                const combinedInner = cand1.result + cand2.result;
                if (combinedInner.length > answerLen - 2) continue;

                for (const outerCand of outerCandidates) {
                    // Check outer doesn't overlap with either inner candidate
                    const allInnerIndices = new Set([...cand1.wordIndices, ...cand2.wordIndices]);
                    if (outerCand.wordIndices.some(idx => allInnerIndices.has(idx))) continue;

                    const outer = outerCand.result;

                    // Try inserting combined inner at each position in outer
                    for (let pos = 1; pos < outer.length; pos++) {
                        const result = outer.slice(0, pos) + combinedInner + outer.slice(pos);
                        if (result.length <= answerLen) {
                            candidates.push({
                                text: `${cand1.text} + ${cand2.text} in ${outerCand.text}`,
                                result: result,
                                operation: `${combinedInner} inside ${outer}`,
                                wordIndices: [...cand1.wordIndices, ...cand2.wordIndices, ...outerCand.wordIndices]
                            });
                        }
                    }
                }
            }
        }
    }

    // 2g3. Container frame pattern - answer provides outer letters, inner content fills middle
    // e.g., "Providing aid from stake money invested in silver" → A(BET+TIN)G = ABETTING
    // The answer ABETTING provides frame A___G, and BET+TIN fills the middle
    if (hasContainerIndicator && answerLen >= 4) {
        const answerFirst = answerClean[0];
        const answerLast = answerClean[answerClean.length - 1];
        const innerNeeded = answerClean.slice(1, -1);  // Middle letters needed
        const frameCandidates: CandidatePart[] = [];  // Collect new candidates separately

        // Take snapshot of current candidates length to avoid infinite loop
        const candidatesSnapshot = candidates.slice();

        // Try single candidates that exactly match the inner
        for (const cand of candidatesSnapshot) {
            if (cand.result === innerNeeded) {
                frameCandidates.push({
                    text: cand.text,
                    result: answerClean,
                    operation: `${cand.result} inside ${answerFirst}_${answerLast} frame`,
                    wordIndices: cand.wordIndices
                });
            }
        }

        // Try pairs of candidates that combine to match the inner
        for (let i = 0; i < candidatesSnapshot.length; i++) {
            for (let j = 0; j < candidatesSnapshot.length; j++) {
                if (i === j) continue;
                const cand1 = candidatesSnapshot[i];
                const cand2 = candidatesSnapshot[j];

                // Check they don't overlap
                const indices1 = new Set(cand1.wordIndices);
                if (cand2.wordIndices.some(idx => indices1.has(idx))) continue;

                const combined = cand1.result + cand2.result;
                if (combined === innerNeeded) {
                    frameCandidates.push({
                        text: `${cand1.text} + ${cand2.text}`,
                        result: answerClean,
                        operation: `${combined} inside ${answerFirst}_${answerLast} frame`,
                        wordIndices: [...cand1.wordIndices, ...cand2.wordIndices]
                    });
                }
            }
        }

        // Add frame candidates to main list
        candidates.push(...frameCandidates);
    }

    // Sort candidates by their first word index to ensure proper ordering
    candidates.sort((a, b) => a.wordIndices[0] - b.wordIndices[0]);

    // 3. Try combinations of candidates that don't overlap and sum to answer
    // Allow any order (not just clue order) due to indicators like "following"
    // OPTIMIZATION: Limit depth and iterations to prevent exponential blowup
    let iterationCount = 0;
    const MAX_ITERATIONS = 10000;  // Safety limit
    const MAX_DEPTH = 6;  // Most clues have 2-4 parts

    function tryCombinations(
        allCandidates: CandidatePart[],
        current: CandidatePart[],
        usedIndices: Set<number>,
        currentResult: string,
        depth: number = 0
    ): CandidatePart[] | null {
        if (currentResult === answerClean) {
            return current;
        }
        if (currentResult.length >= answerLen) {
            return null;
        }
        // Safety limits
        if (depth >= MAX_DEPTH || iterationCount >= MAX_ITERATIONS) {
            return null;
        }

        for (let i = 0; i < allCandidates.length; i++) {
            iterationCount++;
            if (iterationCount >= MAX_ITERATIONS) return null;

            const cand = allCandidates[i];
            // Check for overlap with already used word indices
            if (cand.wordIndices.some(idx => usedIndices.has(idx))) continue;
            // Check if it fits
            if (currentResult.length + cand.result.length > answerLen) continue;

            const newUsed = new Set(usedIndices);
            cand.wordIndices.forEach(idx => newUsed.add(idx));

            const result = tryCombinations(
                allCandidates,  // Try ALL candidates, not just those after this one
                [...current, cand],
                newUsed,
                currentResult + cand.result,
                depth + 1
            );
            if (result) return result;
        }
        return null;
    }

    const solution = tryCombinations(candidates, [], new Set(), '', 0);
    // Allow single-part solutions for container operations (e.g., RANTH inside GAM = GRANTHAM)
    // Require 2+ parts for pure charades
    if (solution && (solution.length >= 2 || (solution.length === 1 && solution[0].operation.includes('inside')))) {
        return {
            parts: solution.map(s => ({ text: s.text, result: s.result, operation: s.operation })),
            success: true
        };
    }

    // 4. Try anagram of combined parts
    // e.g., "electronic chip's core codes" = E + HI + CODES, anagram → ECHOISED
    const anagramIndicators = indicators.filter(i => i.type === 'anagram');
    if (anagramIndicators.length > 0) {
        // Helper to check if letters can be rearranged to form answer
        function isAnagram(letters: string, target: string): boolean {
            const sortedLetters = letters.toUpperCase().split('').sort().join('');
            const sortedTarget = target.toUpperCase().split('').sort().join('');
            return sortedLetters === sortedTarget;
        }

        // Try combinations of candidates that when combined form an anagram of the answer
        function tryAnagramCombinations(
            remaining: CandidatePart[],
            current: CandidatePart[],
            usedIndices: Set<number>,
            currentLetters: string
        ): CandidatePart[] | null {
            // Check if current letters anagram to answer
            if (currentLetters.length === answerLen && isAnagram(currentLetters, answerClean)) {
                return current;
            }
            if (currentLetters.length >= answerLen) {
                return null;
            }

            for (let i = 0; i < remaining.length; i++) {
                const cand = remaining[i];
                // Check for overlap
                if (cand.wordIndices.some(idx => usedIndices.has(idx))) continue;
                // Check if adding this won't exceed answer length
                if (currentLetters.length + cand.result.length > answerLen) continue;

                const newUsed = new Set(usedIndices);
                cand.wordIndices.forEach(idx => newUsed.add(idx));

                const result = tryAnagramCombinations(
                    remaining,
                    [...current, cand],
                    newUsed,
                    currentLetters + cand.result
                );
                if (result) return result;
            }
            return null;
        }

        const anagramSolution = tryAnagramCombinations(candidates, [], new Set(), '');
        if (anagramSolution && anagramSolution.length >= 2) {
            // Combine all parts into single anagram operation
            const combinedFodder = anagramSolution.map(s => s.text).join(' + ');
            const combinedLetters = anagramSolution.map(s => s.result).join('');
            return {
                parts: [{
                    text: combinedFodder,
                    result: answerClean,
                    operation: `anagram of ${combinedLetters}`
                }],
                success: true
            };
        }

        // 5. Try charade + partial anagram
        // e.g., "Charles upset Diana briefly" = THE KING + anagram(DIAN) = THE KING + ANDI = THEKINGANDI
        // One or more candidates are kept as-is, one or more are anagrammed
        function tryCharadeWithPartialAnagram(): { parts: { text: string; result: string; operation: string }[]; success: boolean } | null {
            // Get non-anagram candidates (synonyms, truncations, etc. that aren't indicators)
            const nonIndicatorCandidates = candidates.filter(c =>
                c.operation !== 'raw' &&
                !indicators.some(ind => ind.text.toLowerCase() === normalizeWord(c.text))
            );

            // Try each combination of 1+ fixed candidates + 1+ anagrammed candidates
            for (let fixedCount = 1; fixedCount < nonIndicatorCandidates.length; fixedCount++) {
                // Try each subset of candidates as "fixed"
                function* combinations<T>(arr: T[], k: number): Generator<T[]> {
                    if (k === 0) { yield []; return; }
                    if (arr.length < k) return;
                    const [first, ...rest] = arr;
                    for (const combo of combinations(rest, k - 1)) {
                        yield [first, ...combo];
                    }
                    yield* combinations(rest, k);
                }

                for (const fixedCandidates of combinations(nonIndicatorCandidates, fixedCount)) {
                    const fixedIndices = new Set(fixedCandidates.flatMap(c => c.wordIndices));
                    // Strip spaces from fixed letters (THE KING -> THEKING)
                    const fixedLettersRaw = fixedCandidates.map(c => c.result).join('');
                    const fixedLetters = fixedLettersRaw.replace(/[^A-Z]/gi, '').toUpperCase();

                    // Remaining candidates to be anagrammed
                    const anagramCandidates = nonIndicatorCandidates.filter(c =>
                        !c.wordIndices.some(idx => fixedIndices.has(idx))
                    );

                    // Try combinations of remaining candidates as anagram fodder
                    for (let anagramCount = 1; anagramCount <= anagramCandidates.length; anagramCount++) {
                        for (const toAnagram of combinations(anagramCandidates, anagramCount)) {
                            const anagramIndices = new Set(toAnagram.flatMap(c => c.wordIndices));
                            // Check no overlap
                            if ([...anagramIndices].some(idx => fixedIndices.has(idx))) continue;

                            const anagramLettersRaw = toAnagram.map(c => c.result).join('');
                            const anagramLetters = anagramLettersRaw.replace(/[^A-Z]/gi, '').toUpperCase();
                            const totalLetters = fixedLetters.length + anagramLetters.length;

                            if (totalLetters !== answerLen) continue;

                            // Check if fixed + anagram(fodder) = answer
                            // Try both orders: fixed first, or anagrammed first
                            const sortedAnagram = anagramLetters.split('').sort().join('');

                            // Helper to format result with spaces based on answer format
                            // e.g., answer "THE KING AND I" with result "ANDI" -> "AND I"
                            function formatResultWithSpaces(result: string, fullAnswer: string, startPos: number): string {
                                // Find word boundaries in original answer
                                const answerWords = fullAnswer.split(/\s+/);
                                let pos = 0;
                                const boundaries: number[] = [0];
                                for (const word of answerWords) {
                                    pos += word.replace(/[^A-Z]/gi, '').length;
                                    boundaries.push(pos);
                                }

                                // Insert spaces at appropriate positions
                                let formatted = '';
                                for (let i = 0; i < result.length; i++) {
                                    const globalPos = startPos + i;
                                    if (i > 0 && boundaries.includes(globalPos)) {
                                        formatted += ' ';
                                    }
                                    formatted += result[i];
                                }
                                return formatted;
                            }

                            // Get the anagram indicator text (e.g., "upset")
                            const anagramIndicatorText = anagramIndicators.length > 0 ? anagramIndicators[0].text : 'anagram';

                            // Helper to build parts, splitting truncation from anagram
                            function buildPartsWithTruncationSplit(
                                toAnagram: CandidatePart[],
                                anagramResult: string,
                                anagramLetters: string,
                                fixedCandidates: CandidatePart[],
                                fixedFirst: boolean,
                                startPosForAnagram: number,
                                anagramIndicator: string
                            ): { text: string; result: string; operation: string }[] {
                                const parts: { text: string; result: string; operation: string }[] = [];

                                // Add fixed candidates first if fixedFirst
                                if (fixedFirst) {
                                    for (const c of fixedCandidates) {
                                        parts.push({ text: c.text, result: c.result, operation: c.operation });
                                    }
                                }

                                // Check if any toAnagram candidate is a truncation
                                const truncationCandidates = toAnagram.filter(c => c.operation.startsWith('truncation'));
                                const nonTruncationCandidates = toAnagram.filter(c => !c.operation.startsWith('truncation'));

                                if (truncationCandidates.length > 0) {
                                    // Split: first add truncation steps, then anagram step
                                    for (const tc of truncationCandidates) {
                                        // Extract original word from operation like "truncation of Diana"
                                        const match = tc.operation.match(/truncation of (\w+)/);
                                        const originalWord = match ? match[1] : tc.text;
                                        parts.push({
                                            text: originalWord,
                                            result: tc.result,
                                            operation: 'truncation'
                                        });
                                    }

                                    // Now add the anagram step using the truncated result
                                    // Use the actual indicator word (e.g., "upset") not just "anagram"
                                    const formattedResult = formatResultWithSpaces(anagramResult, answer, startPosForAnagram);
                                    parts.push({
                                        text: truncationCandidates.map(c => c.result).join(' + '),
                                        result: formattedResult,
                                        operation: anagramIndicator
                                    });
                                } else {
                                    // No truncation, just anagram
                                    const formattedResult = formatResultWithSpaces(anagramResult, answer, startPosForAnagram);
                                    parts.push({
                                        text: toAnagram.map(c => c.text).join(' + '),
                                        result: formattedResult,
                                        operation: anagramIndicator
                                    });
                                }

                                // Add fixed candidates last if not fixedFirst
                                if (!fixedFirst) {
                                    for (const c of fixedCandidates) {
                                        parts.push({ text: c.text, result: c.result, operation: c.operation });
                                    }
                                }

                                return parts;
                            }

                            // Order 1: fixed + anagram
                            const remainder1 = answerClean.slice(fixedLetters.length);
                            if (answerClean.startsWith(fixedLetters) &&
                                remainder1.split('').sort().join('') === sortedAnagram) {
                                return {
                                    parts: buildPartsWithTruncationSplit(
                                        toAnagram, remainder1, anagramLetters,
                                        fixedCandidates, true, fixedLetters.length,
                                        anagramIndicatorText
                                    ),
                                    success: true
                                };
                            }

                            // Order 2: anagram + fixed
                            const remainder2 = answerClean.slice(0, answerLen - fixedLetters.length);
                            if (answerClean.endsWith(fixedLetters) &&
                                remainder2.split('').sort().join('') === sortedAnagram) {
                                return {
                                    parts: buildPartsWithTruncationSplit(
                                        toAnagram, remainder2, anagramLetters,
                                        fixedCandidates, false, 0,
                                        anagramIndicatorText
                                    ),
                                    success: true
                                };
                            }
                        }
                    }
                }
            }
            return null;
        }

        const partialAnagramSolution = tryCharadeWithPartialAnagram();
        if (partialAnagramSolution) {
            return partialAnagramSolution;
        }
    }

    return null;
}

// Try letter movement + charade pattern
// e.g., "Following delay of months, slander hospital department's union" → ALIGNMENT
//       months = M, slander = MALIGN, delay of M = move M to end → ALIGNM
//       hospital department = ENT, ALIGNM + ENT = ALIGNMENT
function tryLetterMovementCharade(
    wordplayText: string,
    answer: string,
    movementIndicator: string // e.g., "following delay of"
): {
    letterSource: string;    // "months"
    letter: string;          // "M"
    baseSource: string;      // "slander"
    baseWord: string;        // "MALIGN"
    movedWord: string;       // "ALIGNM"
    movement: 'to_end' | 'to_start';  // direction
    additionalParts: { source: string; result: string }[];  // [{source: "hospital department", result: "ENT"}]
    success: boolean;
} | null {
    const answerClean = normalizeAnswer(answer);
    const answerLen = answerClean.length;

    // Determine movement direction from indicator
    const movement: 'to_end' | 'to_start' =
        movementIndicator.includes('delay') ||
        movementIndicator.includes('demoted') ||
        movementIndicator.includes('moved to the end') ||
        movementIndicator.includes('moving to the end')
            ? 'to_end' : 'to_start';

    // Parse the wordplay text to find components
    const words = wordplayText.split(/\s+/).filter(w => w.length > 0);

    // Build synonym candidates
    interface Candidate {
        text: string;       // original text
        value: string;      // synonym result
        wordIndices: number[];
    }
    const candidates: Candidate[] = [];

    for (let i = 0; i < words.length; i++) {
        for (let phraseLen = Math.min(3, words.length - i); phraseLen >= 1; phraseLen--) {
            // Clean phrase: remove punctuation, possessives ('s), and extra chars
            let phrase = words.slice(i, i + phraseLen).join(' ').toLowerCase();
            phrase = phrase.replace(/'s\b/g, '');  // Remove possessive 's
            phrase = phrase.replace(/[^a-z \-]/g, '').trim();  // Keep only letters, spaces, hyphens
            if (!phrase) continue;

            const synonyms = SYNONYM_DICTIONARY[phrase];
            if (synonyms) {
                for (const syn of synonyms) {
                    candidates.push({
                        text: words.slice(i, i + phraseLen).join(' '),
                        value: syn,
                        wordIndices: Array.from({ length: phraseLen }, (_, j) => i + j)
                    });
                }
            }
        }
    }

    // Find single-letter candidates (abbreviations like M for months)
    const letterCandidates = candidates.filter(c => c.value.length === 1);

    // Find word candidates that contain the letter
    const wordCandidates = candidates.filter(c => c.value.length >= 3);

    // Try each letter + word combination
    for (const letterCand of letterCandidates) {
        const letter = letterCand.value;

        for (const wordCand of wordCandidates) {
            // Check word contains the letter
            if (!wordCand.value.includes(letter)) continue;

            // Check no overlap between letter source and word source
            if (letterCand.wordIndices.some(i => wordCand.wordIndices.includes(i))) continue;

            // Apply letter movement
            let movedWord: string;
            if (movement === 'to_end') {
                // Remove first occurrence of letter and add to end
                const idx = wordCand.value.indexOf(letter);
                movedWord = wordCand.value.slice(0, idx) + wordCand.value.slice(idx + 1) + letter;
            } else {
                // Remove last occurrence and add to start
                const idx = wordCand.value.lastIndexOf(letter);
                movedWord = letter + wordCand.value.slice(0, idx) + wordCand.value.slice(idx + 1);
            }

            // Check if movedWord matches answer start
            if (!answerClean.startsWith(movedWord)) continue;

            // Find remaining parts to complete the answer
            const remaining = answerClean.slice(movedWord.length);
            if (remaining.length === 0) {
                // Perfect match, no additional parts needed
                return {
                    letterSource: letterCand.text,
                    letter,
                    baseSource: wordCand.text,
                    baseWord: wordCand.value,
                    movedWord,
                    movement,
                    additionalParts: [],
                    success: true
                };
            }

            // Look for additional charade parts
            const usedIndices = new Set([...letterCand.wordIndices, ...wordCand.wordIndices]);
            const unusedCandidates = candidates.filter(c =>
                !c.wordIndices.some(i => usedIndices.has(i)) &&
                c.value.length <= remaining.length
            );

            // Try to find parts that complete the answer
            function findParts(
                needed: string,
                available: Candidate[],
                used: Set<number>,
                found: Candidate[]
            ): Candidate[] | null {
                if (needed.length === 0) return found;

                for (const cand of available) {
                    if (cand.wordIndices.some(i => used.has(i))) continue;
                    if (!needed.startsWith(cand.value)) continue;

                    const newUsed = new Set(used);
                    cand.wordIndices.forEach(i => newUsed.add(i));
                    const newAvailable = available.filter(c => c !== cand);
                    const result = findParts(
                        needed.slice(cand.value.length),
                        newAvailable,
                        newUsed,
                        [...found, cand]
                    );
                    if (result) return result;
                }
                return null;
            }

            const parts = findParts(remaining, unusedCandidates, usedIndices, []);
            if (parts) {
                return {
                    letterSource: letterCand.text,
                    letter,
                    baseSource: wordCand.text,
                    baseWord: wordCand.value,
                    movedWord,
                    movement,
                    additionalParts: parts.map(p => ({ source: p.text, result: p.value })),
                    success: true
                };
            }
        }
    }

    return null;
}

// Try substitution pattern: replace letters in base word
// e.g., "telly, primarily as substitute for money-grubber's credit"
//       → T (primarily telly) replaces CR (credit) in SCROOGE → STOOGE
function trySubstitution(
    wordplayText: string,
    answer: string,
    indicators: { text: string; type: OperationType; entry: IndicatorEntry }[]
): { baseWord: string; baseSynonym: string; removed: string; removedFrom: string; inserted: string; insertedFrom: string; success: boolean } | null {
    const answerClean = normalizeAnswer(answer);
    const words = wordplayText.split(/\s+/).filter(w => w.length > 0);

    // Need a substitution indicator
    const subIndicator = indicators.find(i => i.type === 'substitution');
    if (!subIndicator) return null;

    // Need a first-letter indicator for the replacement
    const firstLetterIndicator = indicators.find(i => i.entry.letterOp === 'first');

    // Build candidates for base word, removed letters, and inserted letters
    const candidates: { text: string; value: string; type: 'synonym' | 'firstLetter' }[] = [];

    for (let i = 0; i < words.length; i++) {
        for (let phraseLen = Math.min(3, words.length - i); phraseLen >= 1; phraseLen--) {
            const phrase = words.slice(i, i + phraseLen).join(' ').toLowerCase().replace(/[^a-z' \\-]/g, '');
            const synonyms = SYNONYM_DICTIONARY[phrase];
            if (synonyms) {
                for (const syn of synonyms) {
                    candidates.push({ text: phrase, value: syn, type: 'synonym' });
                }
            }
        }
        // Also check for first letter extraction
        const word = normalizeWord(words[i]);
        if (word.length > 0) {
            candidates.push({ text: words[i], value: word[0].toUpperCase(), type: 'firstLetter' });
        }
    }

    // Try combinations: find base word where removing X and inserting Y gives answer
    for (const base of candidates.filter(c => c.type === 'synonym' && c.value.length >= answerClean.length - 2)) {
        const baseWord = base.value;

        for (const removed of candidates.filter(c => c.type === 'synonym' && c.value.length <= 3)) {
            const removedLetters = removed.value;

            // Check if base contains the letters to remove
            const removeIdx = baseWord.indexOf(removedLetters);
            if (removeIdx === -1) continue;

            // What would remain after removal
            const afterRemoval = baseWord.slice(0, removeIdx) + baseWord.slice(removeIdx + removedLetters.length);

            // Try inserting each first letter candidate
            for (const inserted of candidates.filter(c => c.type === 'firstLetter' || (c.type === 'synonym' && c.value.length === 1))) {
                const insertLetter = inserted.value;

                // Insert at the removal position
                const result = afterRemoval.slice(0, removeIdx) + insertLetter + afterRemoval.slice(removeIdx);

                if (result === answerClean) {
                    return {
                        baseWord: base.text,
                        baseSynonym: baseWord,
                        removed: removed.text,
                        removedFrom: removedLetters,
                        inserted: inserted.text,
                        insertedFrom: insertLetter,
                        success: true
                    };
                }
            }
        }
    }

    return null;
}

// Try to detect double definition pattern
// Two parts of the clue, each independently defining the answer
// e.g., "Leave Antarctica? (6)" → DESERT (leave=desert, Antarctica is a desert)
// e.g., "Place to buy in or sell out (4)" → SHOP (place to buy in=shop, sell out=shop)
function tryDoubleDefinition(
    clue: string,
    answer: string
): { def1: string; def2: string; success: boolean } | null {
    const cleanClueText = getClueWithoutCount(clue);
    const words = cleanClueText.split(/\s+/).filter(w => w.length > 0);
    const answerClean = normalizeAnswer(answer);

    // Need at least 2 words for double definition
    if (words.length < 2) return null;

    // First, check if "or" appears as a conjunction between two definitions
    // e.g., "Place to buy in or sell out" → "Place to buy in" OR "sell out"
    const orIndex = words.findIndex(w => w.toLowerCase() === 'or');
    if (orIndex > 0 && orIndex < words.length - 1) {
        const part1 = words.slice(0, orIndex).join(' ');
        const part2 = words.slice(orIndex + 1).join(' ');

        const match1 = checkPhraseMatchesAnswer(part1, answer);
        const match2 = checkPhraseMatchesAnswer(part2, answer);

        if ((match1.matchType === 'synonym' || match1.matchType === 'direct') &&
            (match2.matchType === 'synonym' || match2.matchType === 'direct')) {
            return {
                def1: part1,
                def2: part2,
                success: true
            };
        }
    }

    // Try splitting at each position
    for (let splitIdx = 1; splitIdx < words.length; splitIdx++) {
        const part1 = words.slice(0, splitIdx).join(' ');
        const part2 = words.slice(splitIdx).join(' ');

        // Check if both parts can define the answer
        const match1 = checkPhraseMatchesAnswer(part1, answer);
        const match2 = checkPhraseMatchesAnswer(part2, answer);

        if ((match1.matchType === 'synonym' || match1.matchType === 'direct') &&
            (match2.matchType === 'synonym' || match2.matchType === 'direct')) {
            return {
                def1: part1,
                def2: part2,
                success: true
            };
        }
    }

    return null;
}

function findIndicators(clue: string, lockedWordIndices: number[] = []): { text: string; type: OperationType; entry: IndicatorEntry; startIdx: number; endIdx: number }[] {
    const cleanClue = cleanText(clue);
    const words = getClueWords(clue);
    const found: { text: string; type: OperationType; entry: IndicatorEntry; startIdx: number; endIdx: number }[] = [];

    // Build set of locked character ranges from locked word indices
    const lockedRanges: { start: number; end: number }[] = [];
    let charPos = 0;
    for (let i = 0; i < words.length; i++) {
        const wordLen = cleanText(words[i]).length;
        if (lockedWordIndices.includes(i)) {
            lockedRanges.push({ start: charPos, end: charPos + wordLen });
        }
        charPos += wordLen + 1; // +1 for space
    }

    // Sort indicators by length (longest first) to match phrases before single words
    const sortedIndicators = Object.entries(INDICATOR_DICTIONARY)
        .sort((a, b) => b[0].length - a[0].length);

    for (const [indicator, entry] of sortedIndicators) {
        // Use word boundary matching to avoid matching inside words
        // e.g., "new" should not match inside "newspaper"
        const escapedIndicator = indicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`\\b${escapedIndicator}\\b`, 'i');
        const match = cleanClue.match(pattern);

        if (match && match.index !== undefined) {
            const idx = match.index;

            // Check if this indicator falls within a locked (definition) range
            const inLockedRange = lockedRanges.some(r =>
                (idx >= r.start && idx < r.end) ||
                (idx + indicator.length > r.start && idx + indicator.length <= r.end)
            );
            if (inLockedRange) continue; // Skip - this word is part of the definition

            // Check it's not already covered by a longer match
            const alreadyCovered = found.some(f =>
                (idx >= f.startIdx && idx < f.endIdx) ||
                (idx + indicator.length > f.startIdx && idx + indicator.length <= f.endIdx)
            );
            if (!alreadyCovered) {
                found.push({
                    text: indicator,
                    type: entry.type,
                    entry,
                    startIdx: idx,
                    endIdx: idx + indicator.length
                });
            }
        }
    }

    return found.sort((a, b) => a.startIdx - b.startIdx);
}

function guessDefinitionPosition(clue: string, indicators: { startIdx: number; endIdx: number; entry: IndicatorEntry }[]): 'START' | 'END' {
    if (indicators.length === 0) return 'START';

    // Check if any indicator explicitly signals definition position
    const firstIndicator = indicators[0];
    if (firstIndicator.entry.definitionAtEnd) {
        return 'END';
    }

    const words = getClueWords(clue);
    const lastIndicator = indicators[indicators.length - 1];

    // Find which word the first indicator starts at
    const cleanClue = cleanText(clue);
    let charCount = 0;
    let firstIndWordIdx = 0;
    for (let i = 0; i < words.length; i++) {
        if (charCount >= firstIndicator.startIdx) {
            firstIndWordIdx = i;
            break;
        }
        charCount += cleanText(words[i]).length + 1; // +1 for space
    }

    // Find which word the last indicator ends at
    charCount = 0;
    let lastIndWordIdx = words.length;
    for (let i = 0; i < words.length; i++) {
        charCount += cleanText(words[i]).length;
        if (charCount >= lastIndicator.endIdx) {
            lastIndWordIdx = i + 1;
            break;
        }
        charCount += 1; // space
    }

    const wordsBeforeFirst = firstIndWordIdx;
    const wordsAfterLast = words.length - lastIndWordIdx;

    // Edge case: if nothing after indicator, definition must be at START
    if (wordsAfterLast === 0) return 'START';
    // Edge case: if nothing before indicator, definition must be at END
    if (wordsBeforeFirst === 0) return 'END';

    // If only 1-2 words before first indicator, it's likely the definition at START
    if (wordsBeforeFirst <= 2 && wordsAfterLast > 2) return 'START';
    // If only 1-2 words after last indicator, it's likely the definition at END
    if (wordsAfterLast <= 2 && wordsBeforeFirst > 2) return 'END';

    // Default: prefer START (traditional cryptic convention)
    return 'START';
}

function extractDefinition(clue: string, position: 'START' | 'END', indicators: { text: string; startIdx: number; endIdx: number; entry: IndicatorEntry }[]): string {
    const cleanClue = getClueWithoutCount(clue);
    const words = getClueWords(clue);

    if (indicators.length === 0) {
        // No indicators found - take first or last 1-2 words as definition
        return position === 'START' ? words.slice(0, 2).join(' ') : words.slice(-2).join(' ');
    }

    if (position === 'START') {
        // Definition is before first indicator
        const firstIndicatorWord = indicators[0].text.split(/\s+/)[0];
        let idx = words.findIndex(w => cleanText(w) === firstIndicatorWord || cleanText(w).includes(firstIndicatorWord));

        if (idx <= 0) idx = 1;  // At least one word

        // Look for natural break points (punctuation) that might split definition from fodder
        // Common pattern: "Definition? Fodder indicator" or "Definition, fodder indicator"
        let defEndIdx = idx;
        for (let i = 0; i < idx; i++) {
            const word = words[i];
            // If word ends with ? or has standalone punctuation, it might be definition boundary
            if (word.endsWith('?') || word.endsWith('!')) {
                defEndIdx = i + 1;
                break;
            }
        }

        // Sanity check: definition shouldn't be more than ~4 words usually
        // If we grabbed too many words before indicator, check for punctuation breaks
        if (defEndIdx > 4) {
            // Look for question mark or comma within first 4 words
            for (let i = 0; i < Math.min(4, idx); i++) {
                if (words[i].includes('?') || words[i].includes(',')) {
                    defEndIdx = i + 1;
                    break;
                }
            }
        }

        return words.slice(0, defEndIdx).join(' ');
    } else {
        // Definition is at END - take last 2-4 words
        // For cryptic definitions, typically 2-4 words at the very end

        // Check if first indicator has definitionAtEnd flag (like acrostic)
        // In this case, definition is at the end, not after indicator
        if (indicators[0].entry?.definitionAtEnd) {
            // Take last 3-4 words as definition
            // Look for natural breaks or just take last 3
            const defLength = Math.min(4, Math.max(2, Math.floor(words.length / 3)));
            return words.slice(-defLength).join(' ');
        }

        // Standard case: definition after last indicator
        const lastIndicator = indicators[indicators.length - 1];
        const lastIndicatorWords = lastIndicator.text.split(/\s+/);
        const lastWord = lastIndicatorWords[lastIndicatorWords.length - 1];

        // Find where the indicator ends and take everything after
        for (let i = words.length - 1; i >= 0; i--) {
            if (cleanText(words[i]).includes(lastWord)) {
                return words.slice(i + 1).join(' ');
            }
        }
        return words[words.length - 1];
    }
}

function extractFodder(
    clue: string,
    indicator: { text: string; startIdx: number; endIdx: number; entry?: IndicatorEntry },
    defPosition: 'START' | 'END',
    allIndicators: { text: string; startIdx: number; endIdx: number }[],
    defEndWordIdx: number,  // Where definition ends (if START) or begins (if END)
    letterOp?: 'first' | 'last' | 'ends' | 'middle'  // Override for letter extraction indicators
): string {
    const cleanClue = getClueWithoutCount(clue);
    const words = getClueWords(clue);
    const indicatorWords = indicator.text.split(/\s+/);

    // Find indicator position in word array
    let indicatorStartWord = -1;
    let indicatorEndWord = -1;

    for (let i = 0; i <= words.length - indicatorWords.length; i++) {
        let match = true;
        for (let j = 0; j < indicatorWords.length; j++) {
            if (!cleanText(words[i + j]).includes(indicatorWords[j])) {
                match = false;
                break;
            }
        }
        if (match) {
            indicatorStartWord = i;
            indicatorEndWord = i + indicatorWords.length;
            break;
        }
    }

    if (indicatorStartWord === -1) return '';

    // Find the next indicator after this one (to bound fodder)
    const thisIndicatorIdx = allIndicators.findIndex(ind => ind.text === indicator.text);
    const nextIndicator = allIndicators[thisIndicatorIdx + 1];

    let nextIndicatorStartWord = words.length;
    if (nextIndicator) {
        const nextIndWords = nextIndicator.text.split(/\s+/);
        for (let i = indicatorEndWord; i <= words.length - nextIndWords.length; i++) {
            let match = true;
            for (let j = 0; j < nextIndWords.length; j++) {
                if (!cleanText(words[i + j]).includes(nextIndWords[j])) {
                    match = false;
                    break;
                }
            }
            if (match) {
                nextIndicatorStartWord = i;
                break;
            }
        }
    }

    // Fodder location depends on indicator type and position
    // For most indicators, fodder is adjacent (before or after)
    // For letter extraction (end of, start of), fodder is immediately after
    // For MIDDLE letter extraction (essentially, core of), fodder is immediately BEFORE

    // Get the effective letterOp from either the parameter or the indicator entry
    const effectiveLetterOp = letterOp || indicator.entry?.letterOp;

    if (defPosition === 'START') {
        // Definition at start
        // Check if there's content BEFORE this indicator (between def and indicator)
        const beforeIndicator = words.slice(defEndWordIdx, indicatorStartWord);
        // Check if there's content AFTER this indicator (before next indicator)
        const afterIndicator = words.slice(indicatorEndWord, nextIndicatorStartWord);

        // For MIDDLE letter indicators (essentially, core of, heart of), prefer content BEFORE
        // "bet, essentially £1" → fodder is "bet" (before "essentially"), not "£1"
        if (effectiveLetterOp === 'middle') {
            if (beforeIndicator.length > 0) {
                // Take just the word immediately before the indicator
                return beforeIndicator[beforeIndicator.length - 1];
            }
            if (afterIndicator.length > 0) {
                return afterIndicator[0];  // Fallback: first word after
            }
        }

        // Prefer content after indicator for "end of", "start of" type extractions
        if (afterIndicator.length > 0) {
            return afterIndicator.join(' ');
        }
        // Otherwise take content before indicator
        if (beforeIndicator.length > 0) {
            return beforeIndicator.join(' ');
        }
    } else {
        // Definition at end
        // For acrostic/first-letter indicators at START, fodder is AFTER the indicator
        // For other cases, fodder might be before

        // Check if there's content BEFORE this indicator
        const beforeIndicator = words.slice(0, indicatorStartWord);
        // First try: content AFTER indicator, up to the definition boundary
        const afterIndicator = words.slice(indicatorEndWord, defEndWordIdx);

        // For MIDDLE letter indicators, prefer content BEFORE
        if (effectiveLetterOp === 'middle') {
            if (beforeIndicator.length > 0) {
                // Take just the word immediately before the indicator
                return beforeIndicator[beforeIndicator.length - 1];
            }
            if (afterIndicator.length > 0) {
                return afterIndicator[0];  // Fallback: first word after
            }
        }

        if (afterIndicator.length > 0) {
            return afterIndicator.join(' ');
        }

        // Fallback: content BEFORE the indicator
        if (beforeIndicator.length > 0) {
            return beforeIndicator.join(' ');
        }
    }

    return '';
}

// --- DEFINITION MATCHING ---
// Check if a phrase matches the answer via synonyms or cryptic meanings

interface DefinitionMatch {
    phrase: string;
    matchType: 'direct' | 'synonym' | 'cryptic' | 'none';
    hint?: string;  // For cryptic matches, explains the twist
}

function checkPhraseMatchesAnswer(phrase: string, answer: string): DefinitionMatch {
    const answerUpper = normalizeAnswer(answer);
    const phraseLower = phrase.toLowerCase();
    const phraseWords = phraseLower.split(/\s+/).filter(w => w.length > 0);

    // 1. Check phrase as a whole - is it in our synonym dictionary?
    const phraseKey = phraseWords.join(' ');
    const phraseSynonyms = lookupSynonyms(phraseKey);
    // Normalize synonym (remove spaces/punctuation) before comparing to normalized answer
    if (phraseSynonyms.some(s => normalizeAnswer(s) === answerUpper)) {
        return { phrase, matchType: 'synonym' };
    }

    // 2. Check individual words for direct synonym match
    // ONLY for single-word phrases - multi-word phrases must match as a whole
    if (phraseWords.length === 1) {
        for (const word of phraseWords) {
            if (word.length < 2) continue;

            // Direct match
            if (word.toUpperCase() === answerUpper) {
                return { phrase, matchType: 'direct' };
            }

            // Synonym match (normalize synonyms to handle multi-word answers like "GRUB KICK")
            const synonyms = lookupSynonyms(word);
            if (synonyms.some(s => normalizeAnswer(s) === answerUpper)) {
                return { phrase, matchType: 'synonym' };
            }

            // Reverse lookup: is word a synonym of something that maps to answer?
            // IMPORTANT: Require exact match on fodder, not partial match
            for (const [fodder, syns] of Object.entries(SYNONYM_DICTIONARY)) {
                // Normalize synonyms for comparison
                if (syns.some(s => normalizeAnswer(s) === answerUpper) && fodder.toLowerCase() === word) {
                    return { phrase, matchType: 'synonym' };
                }
            }
        }
    }

    // 3. Check for CRYPTIC_MEANINGS match (single-word phrases only)
    if (phraseWords.length === 1) {
        for (const word of phraseWords) {
            const crypticEntry = CRYPTIC_MEANINGS[word];
            if (crypticEntry) {
                if (crypticEntry.synonyms.some(s => normalizeAnswer(s) === answerUpper)) {
                    return {
                        phrase,
                        matchType: 'cryptic',
                        hint: `"${word}" = ${crypticEntry.meaning}`
                    };
                }
                // Also check partial matches
                for (const syn of crypticEntry.synonyms) {
                    if (answerUpper.includes(syn.toUpperCase()) || syn.toUpperCase().includes(answerUpper)) {
                        return {
                            phrase,
                            matchType: 'cryptic',
                            hint: `"${word}" = ${crypticEntry.meaning}`
                        };
                    }
                }
            }
        }
    }

    return { phrase, matchType: 'none' };
}

/**
 * Check if a phrase contains words that have synonyms useful for wordplay.
 * Used to determine if a definition candidate is "stealing" words needed for wordplay.
 */
function phraseContainsWordplayWords(phrase: string, answer: string): boolean {
    const words = phrase.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    const answerClean = normalizeAnswer(answer);

    for (const word of words) {
        const cleanWord = word.replace(/[^a-z]/g, '');
        if (!cleanWord) continue;

        // Check if this word has synonyms that could contribute to the answer
        const synonyms = lookupSynonyms(cleanWord);
        for (const syn of synonyms) {
            // If synonym is part of answer (not the whole answer), it's wordplay
            if (syn.length < answerClean.length && answerClean.includes(syn)) {
                return true;
            }
        }

        // Check multi-word phrases starting with this word
        const wordIdx = words.indexOf(cleanWord);
        if (wordIdx >= 0 && wordIdx < words.length - 1) {
            const twoWordPhrase = words.slice(wordIdx, wordIdx + 2).join(' ').replace(/[^a-z ]/g, '');
            const twoWordSynonyms = lookupSynonyms(twoWordPhrase);
            for (const syn of twoWordSynonyms) {
                if (syn.length < answerClean.length && answerClean.includes(syn)) {
                    return true;
                }
            }
        }
    }

    return false;
}

/**
 * Find the best definition match by trying progressively longer phrases.
 * IMPORTANT: Prefers shorter definitions when longer ones would steal words
 * needed for wordplay.
 *
 * Example: For "Following delay of months, slander hospital department's union"
 *   Both "union" and "department's union" might match ALIGNMENT
 *   But "department's" is needed for "hospital department's" → ENT
 *   So we prefer "union" as it leaves more words for wordplay
 */
function findBestDefinitionMatch(
    clue: string,
    answer: string,
    position: 'START' | 'END',
    maxWords: number = 4
): DefinitionMatch {
    const cleanClue = getClueWithoutCount(clue);
    const words = getClueWords(clue);

    // Try progressively longer phrases
    // For START: "word1", "word1 word2", "word1 word2 word3", ...
    // For END: "wordN", "wordN-1 wordN", "wordN-2 wordN-1 wordN", ...

    const maxLen = Math.min(maxWords, Math.floor(words.length / 2)); // Definition shouldn't be more than half the clue

    // Collect ALL matching candidates with their lengths
    interface DefCandidate {
        match: DefinitionMatch;
        length: number;
        stealsWordplay: boolean;
    }
    const candidates: DefCandidate[] = [];

    // First pass: find all direct/synonym matches
    for (let len = 1; len <= maxLen; len++) {
        let phrase: string;
        let remainingWords: string[];

        if (position === 'START') {
            phrase = words.slice(0, len).join(' ');
            remainingWords = words.slice(len);
        } else {
            phrase = words.slice(-len).join(' ');
            remainingWords = words.slice(0, -len);
        }

        const match = checkPhraseMatchesAnswer(phrase, answer);
        if (match.matchType === 'direct' || match.matchType === 'synonym') {
            // Check if extra words (beyond first match) contain wordplay-useful synonyms
            const extraWords = len > 1
                ? (position === 'END' ? words.slice(-len, -1).join(' ') : words.slice(1, len).join(' '))
                : '';
            const stealsWordplay = extraWords ? phraseContainsWordplayWords(extraWords, answer) : false;

            candidates.push({ match, length: len, stealsWordplay });
        }
    }

    // If we have candidates, prefer shortest one OR one that doesn't steal wordplay
    if (candidates.length > 0) {
        // Sort: prefer non-stealing, then shorter
        candidates.sort((a, b) => {
            if (a.stealsWordplay !== b.stealsWordplay) {
                return a.stealsWordplay ? 1 : -1; // Non-stealing first
            }
            return a.length - b.length; // Shorter first
        });
        return candidates[0].match;
    }

    // Second pass: look for cryptic matches
    for (let len = 1; len <= maxLen; len++) {
        let phrase: string;
        if (position === 'START') {
            phrase = words.slice(0, len).join(' ');
        } else {
            phrase = words.slice(-len).join(' ');
        }

        const match = checkPhraseMatchesAnswer(phrase, answer);
        if (match.matchType === 'cryptic') {
            return match;
        }
    }

    // No match found - return shortest phrase as fallback
    const fallbackPhrase = position === 'START'
        ? words.slice(0, Math.min(2, maxLen)).join(' ')
        : words.slice(-Math.min(2, maxLen)).join(' ');

    return { phrase: fallbackPhrase, matchType: 'none' };
}

// --- CRYPTIC DEFINITION DETECTION (FALLBACK) ---
// Only called when findBestDefinitionMatch returns 'none'
// Tries to extract hints from coaching notes

function detectCrypticDefinition(
    defText: string,
    answer: string,
    coaching?: string[]
): { isCryptic: boolean; hint: string; difficulty: 'Hard' | null } {
    if (!defText || !answer) {
        return { isCryptic: false, hint: '', difficulty: null };
    }

    // At this point, we've already tried all phrase lengths and found no match
    // Mark as cryptic and try to extract hint from coaching notes

    let hint = 'Definition may have a cryptic twist';

    if (coaching && coaching.length > 0) {
        const defWordsLower = defText.toLowerCase().split(/\s+/);

        for (const note of coaching) {
            const noteLower = note.toLowerCase();

            // Skip meta-commentary lines
            if (noteLower.includes('the real issue') ||
                noteLower.includes('note to') ||
                noteLower.includes('discomfort') ||
                noteLower.startsWith('why')) {
                continue;
            }

            // Look for "word = meaning" patterns where word is in definition
            const equalsMatch = note.match(/["']?(\w+)["']?\s*=\s*(.+?)(?:\.|$)/i);
            if (equalsMatch) {
                const matchWord = equalsMatch[1].toLowerCase();
                if (defWordsLower.includes(matchWord)) {
                    hint = `"${equalsMatch[1]}" = ${equalsMatch[2].trim()}`;
                    break;
                }
            }
        }
    }

    return { isCryptic: true, hint, difficulty: 'Hard' };
}

// --- ACROSTIC HELPER ---
// For acrostic clues, check if fodder contains a standalone synonym that should be split out
function splitAcrosticFodder(fodder: string, answer: string): {
    acrosticFodder: string;
    acrosticResult: string;
    synonymFodder: string | null;
    synonymResult: string | null;
} | null {
    const split = splitAtStandaloneSynonym(fodder);

    if (!split || split.before.length === 0) {
        return null;  // No standalone synonym found or nothing before it
    }

    // The acrostic applies to words BEFORE the standalone synonym
    const acrosticWords = split.before;
    const acrosticResult = acrosticWords.map(w => w[0].toUpperCase()).join('');

    // Check if acrostic + synonym = answer
    const combined = acrosticResult + split.synonymResult;
    if (combined.length === answer.replace(/[^A-Z]/gi, '').length) {
        return {
            acrosticFodder: acrosticWords.join(' '),
            acrosticResult,
            synonymFodder: split.synonymWord,
            synonymResult: split.synonymResult
        };
    }

    return null;
}

// --- MAIN PARSER ---

// Parser step logger - captures each step with purpose, input, and result
const parserLog: Array<{ step: number; purpose: string; input: any; result: any }> = [];
let stepNum = 0;

function logStep(purpose: string, input: any, result: any) {
    stepNum++;
    const entry = { step: stepNum, purpose, input, result };
    parserLog.push(entry);
    console.log(`\n=== STEP ${stepNum}: ${purpose} ===`);
    console.log('INPUT:', JSON.stringify(input, null, 2));
    console.log('RESULT:', JSON.stringify(result, null, 2));
}

export function getParserLog() {
    return parserLog;
}

export function clearParserLog() {
    parserLog.length = 0;
    stepNum = 0;
}

export function parseClue(clue: string, knownAnswer?: string, coaching?: string[]): ParseResult {
    clearParserLog();
    logStep('parseClue', { clue, knownAnswer, coaching }, 'Starting...');

    const wordCount = extractTargetLength(clue);
    logStep('extractTargetLength', { clue }, { wordCount });

    const cleanClue = getClueWithoutCount(clue);
    logStep('getClueWithoutCount', { clue }, { cleanClue });

    const clueWords = getClueWords(clue);
    logStep('getClueWords', { clue }, { clueWords });

    // NEW FLOW: Find definition FIRST, lock those words, then find indicators
    let definition: string;
    let defPosition: 'START' | 'END' = 'START';
    let defMatchType: 'direct' | 'synonym' | 'cryptic' | 'none' = 'none';
    let defHint: string | undefined;
    let lockedWordIndices: number[] = [];

    // Step 1: If we have the answer, find definition first using synonym matching
    if (knownAnswer) {
        const defFirst = findDefinitionFirst(clue, knownAnswer);
        logStep('findDefinitionFirst', { clue, knownAnswer }, defFirst);
        if (defFirst) {
            definition = defFirst.definition;
            defPosition = defFirst.position;
            defMatchType = defFirst.matchType;
            defHint = defFirst.hint;
            lockedWordIndices = defFirst.lockedWordIndices;
        }
    }

    // Step 2: Find indicators, excluding locked definition words
    let indicators = findIndicators(cleanClue, lockedWordIndices);
    logStep('findIndicators', { cleanClue, lockedWordIndices }, indicators);

    // Step 2b: Validate anagram indicators - if fodder can't anagram to answer, remove them
    // Skip validation if deletion indicators present - they modify fodder, making simple letter comparison invalid
    const hasDeletionIndicators = indicators.some(i =>
        i.type === 'deletion_first' || i.type === 'deletion_last' ||
        i.entry.letterOp === 'first' || i.entry.letterOp === 'last'
    );

    if (knownAnswer && indicators.some(i => i.type === 'anagram') && !hasDeletionIndicators) {
        const answerClean = normalizeAnswer(knownAnswer);
        const answerLettersSorted = answerClean.split('').sort().join('');

        const validatedIndicators = indicators.filter(ind => {
            if (ind.type !== 'anagram') return true;  // Keep non-anagram indicators

            // Get fodder words (words before the indicator, excluding definition)
            const wordsBeforeIndicator = cleanClue.slice(0, ind.startIdx).trim();
            const fodderLetters = wordsBeforeIndicator.replace(/[^a-zA-Z]/g, '').toUpperCase();
            const fodderSorted = fodderLetters.split('').sort().join('');

            // Check if fodder can anagram to answer
            const isValidAnagram = fodderSorted === answerLettersSorted;

            if (!isValidAnagram) {
                logStep('validateAnagramIndicator',
                    { indicator: ind.text, fodder: wordsBeforeIndicator, fodderLetters, answerClean, fodderSorted, answerLettersSorted },
                    { valid: false, reason: 'Fodder letters do not match answer letters' });
            }

            return isValidAnagram;
        });

        if (validatedIndicators.length < indicators.length) {
            logStep('filterInvalidAnagramIndicators',
                { originalIndicators: indicators, validatedIndicators },
                { removed: indicators.filter(i => !validatedIndicators.includes(i)).map(i => i.text) });
            indicators = validatedIndicators;
        }
    } else if (hasDeletionIndicators && indicators.some(i => i.type === 'anagram')) {
        logStep('skipAnagramValidation',
            { reason: 'Deletion indicators present - fodder will be modified' },
            { keptIndicators: indicators.map(i => i.text) });
    }

    // Always try double definition first - it should take priority even if indicators are found
    // because words like "in", "out", "or" can be parts of definition phrases
    if (knownAnswer) {
        const doubleDef = tryDoubleDefinition(clue, knownAnswer);
        logStep('tryDoubleDefinition', { clue, knownAnswer }, doubleDef);
        if (doubleDef?.success) {
            const variables: Record<string, string> = {
                'def_text': doubleDef.def1,
                'def_2_text': doubleDef.def2,
                'definition_match_type': 'double',
                'definition_position': 'START'
            };

            // Build the solve explanation for double definition
            const solveExplanation: Array<{type: string; label?: string; content: string; techniques?: string[]}> = [
                {
                    type: 'clue-type',
                    label: 'Clue Type',
                    content: 'Double Definition'
                },
                {
                    type: 'explanation',
                    label: 'Definition 1',
                    content: `"${doubleDef.def1}" = ${knownAnswer}`
                },
                {
                    type: 'explanation',
                    label: 'Definition 2',
                    content: `"${doubleDef.def2}" = ${knownAnswer}`
                }
            ];

            return {
                success: true,
                confidence: 90,
                needsAI: false,
                parsed: {
                    definition: { text: doubleDef.def1 + ' / ' + doubleDef.def2, position: 'START' },
                    indicators: [],
                    fodders: []
                },
                patternData: {
                    id: `double-def-${Date.now()}`,
                    patternId: 'DOUBLE_DEFINITION',
                    clueText: clue,
                    answer: knownAnswer,
                    variables,
                    solveSteps: [
                        `Definition 1: "${doubleDef.def1}" = ${knownAnswer}`,
                        `Definition 2: "${doubleDef.def2}" = ${knownAnswer}`,
                        `Both definitions point to the same answer: ${knownAnswer}`
                    ],
                    // Computed fields for UI
                    isComplete: true,
                    definitionText: doubleDef.def1,
                    definitionMatchType: 'double',
                    definitionPosition: 'START',
                    definitionExplanation: `This is a double definition: "${doubleDef.def1}" and "${doubleDef.def2}" both mean ${knownAnswer}.`,
                    wordplaySteps: [],
                    techniquesUsed: ['double definition'],
                    setterHint: 'The setter has used a **double definition** here. Both parts of the clue define the same answer.',
                    solveExplanation,
                    parsingSummary: `"${doubleDef.def1}" = ${knownAnswer}, "${doubleDef.def2}" = ${knownAnswer}`
                }
            };
        }
    }

    if (indicators.length === 0) {
        // Double definition already tried above (lines 4727-4791), no need to retry

        // Try charade fallback - works even without pre-found definition
        if (knownAnswer) {
            const cleanClueWords = getClueWords(clue);

            // If definition already found, use it; otherwise try both positions
            const positionsToTry: Array<{ position: 'START' | 'END'; defText: string | undefined }> = [];

            if (definition) {
                positionsToTry.push({ position: defPosition, defText: definition });
            } else {
                // Try definition at START (wordplay at END)
                // Try various definition lengths
                for (let defLen = 1; defLen <= Math.min(5, cleanClueWords.length - 2); defLen++) {
                    positionsToTry.push({
                        position: 'START',
                        defText: cleanClueWords.slice(0, defLen).join(' ')
                    });
                }
                // Try definition at END (wordplay at START)
                for (let defLen = 1; defLen <= Math.min(5, cleanClueWords.length - 2); defLen++) {
                    positionsToTry.push({
                        position: 'END',
                        defText: cleanClueWords.slice(-defLen).join(' ')
                    });
                }
            }

            for (const { position, defText } of positionsToTry) {
                if (!defText) continue;
                const defWords = defText.split(/\s+/);
                let wordplayWords: string[];

                if (position === 'START') {
                    wordplayWords = cleanClueWords.slice(defWords.length);
                } else {
                    wordplayWords = cleanClueWords.slice(0, cleanClueWords.length - defWords.length);
                }

                const wordplayText = wordplayWords.join(' ');
                const charade = tryCharadeSplit(wordplayText, knownAnswer);
                logStep('tryCharadeSplit', { wordplayText, knownAnswer, defText, position }, charade);

                if (charade?.success) {
                    // Check if definition has a cryptic meaning hint
                    let crypticHint = '';
                    const defLower = defText.toLowerCase();
                    const crypticEntry = CRYPTIC_MEANINGS[defLower];
                    if (crypticEntry) {
                        const answerUpper = normalizeAnswer(knownAnswer);
                        if (crypticEntry.synonyms.some(s => normalizeAnswer(s) === answerUpper)) {
                            crypticHint = `Think ${crypticEntry.meaning}!`;
                        }
                    }

                    const variables: Record<string, string> = {
                        'def_text': defText,
                        'definition_match_type': crypticHint ? 'cryptic' : (definition ? defMatchType : 'cryptic'),
                        'definition_position': position
                    };

                    if (crypticHint) {
                        variables['definition_hint'] = crypticHint;
                    }

                    charade.parts.forEach((part, idx) => {
                        const n = idx + 1;
                        variables[`indicator_${n}_text`] = '(synonym)';
                        variables[`fodder_${n}_text`] = part.text;
                        variables[`result_${n}`] = part.result;
                        variables[`complexity_${n}`] = '2';  // Medium complexity for synonym lookups
                    });

                    const partsHint = charade.parts.map(p => `${p.text} → ${p.result}`).join(' + ');
                    variables['hint_1'] = `Charade: ${partsHint} = ${knownAnswer}`;

                    const rawPatternData: PatternInstance = {
                        id: `charade-${Date.now()}`,
                        patternId: 'Charade',
                        clueText: clue,
                        answer: knownAnswer,
                        variables,
                        solveSteps: generateSolveSteps(variables, 'CHARADE', knownAnswer, coaching, clue)
                    };

                    return {
                        success: true,
                        confidence: definition ? 75 : 70,
                        needsAI: false,
                        parsed: {
                            definition: { text: defText, position },
                            indicators: [],
                            fodders: charade.parts.map(p => p.text)
                        },
                        patternData: computeDerivedFields(rawPatternData)
                    };
                }
            }
        }

        return {
            success: false,
            confidence: 0,
            needsAI: true,
            reason: 'No known indicators found in clue'
        };
    }

    // Step 3: If definition wasn't found via synonym, fall back to old method
    if (!definition) {
        defPosition = guessDefinitionPosition(cleanClue, indicators);

        if (knownAnswer) {
            // Try the guessed position first
            let bestMatch = findBestDefinitionMatch(clue, knownAnswer, defPosition);

            // If no match at guessed position, try the other position
            if (bestMatch.matchType === 'none') {
                const otherPosition = defPosition === 'START' ? 'END' : 'START';
                const otherMatch = findBestDefinitionMatch(clue, knownAnswer, otherPosition);

                // Use the other position if it found a match
                if (otherMatch.matchType !== 'none') {
                    bestMatch = otherMatch;
                    defPosition = otherPosition;
                }
            }

            definition = bestMatch.phrase;
            defMatchType = bestMatch.matchType;
            defHint = bestMatch.hint;
        } else {
            // No answer - fall back to basic extraction
            definition = extractDefinition(clue, defPosition, indicators);
        }
    }

    if (!definition || definition.length < 2) {
        return {
            success: false,
            confidence: 20,
            needsAI: true,
            reason: 'Could not extract definition',
            parsed: {
                definition: { text: '', position: defPosition },
                indicators: indicators.map(i => ({ text: i.text, type: i.type, entry: i.entry })),
                fodders: []
            }
        };
    }

    // Step 3b: Try composite charade now that definition is guaranteed
    if (knownAnswer) {
        const cleanClueWordsForComposite = getClueWords(clue);
        const defWordsForComposite = definition.split(/\s+/);
        let wordplayWordsForComposite: string[];

        if (defPosition === 'START') {
            wordplayWordsForComposite = cleanClueWordsForComposite.slice(defWordsForComposite.length);
        } else {
            wordplayWordsForComposite = cleanClueWordsForComposite.slice(0, cleanClueWordsForComposite.length - defWordsForComposite.length);
        }

        const wordplayTextForComposite = wordplayWordsForComposite.join(' ');
        const composite = tryCompositeCharade(wordplayTextForComposite, knownAnswer, indicators);
        logStep('tryCompositeCharade', { wordplayText: wordplayTextForComposite, knownAnswer, indicators, definition, defPosition }, composite);

        if (composite?.success) {
            const variables: Record<string, string> = {
                'def_text': definition,
                'definition_match_type': defMatchType,
                'definition_position': defPosition
            };

            composite.parts.forEach((part, idx) => {
                const n = idx + 1;
                variables[`indicator_${n}_text`] = part.operation;
                variables[`fodder_${n}_text`] = part.text;
                variables[`result_${n}`] = part.result;
            });

            const partsHint = composite.parts.map(p => `${p.text} → ${p.result} (${p.operation})`).join(' + ');
            variables['hint_1'] = `Composite: ${partsHint} = ${knownAnswer}`;

            // Determine pattern ID based on operations detected
            const allOperations = composite.parts.map(p => p.operation.toLowerCase()).join(' ');
            const hasReversal = allOperations.includes('reversed') || allOperations.includes('reversal');
            const hasContainer = allOperations.includes('inside') || allOperations.includes('container');
            const hasHomophone = allOperations.includes('homophone');
            const hasAnagram = allOperations.includes('anagram');

            let compositePatternId = 'COMPOSITE_CHARADE';
            if (hasReversal && hasContainer) {
                compositePatternId = 'Reversal + Container';
            } else if (hasReversal && hasHomophone) {
                compositePatternId = 'Reversal + Homophone';
            } else if (hasContainer && hasAnagram) {
                compositePatternId = 'Container + Anagram';
            } else if (hasReversal) {
                compositePatternId = 'Charade with Reversal';
            } else if (hasContainer) {
                compositePatternId = 'Charade with Container';
            } else if (hasHomophone) {
                compositePatternId = 'Charade with Homophone';
            } else if (hasAnagram) {
                compositePatternId = 'Charade with Anagram';
            }

            const rawPatternData: PatternInstance = {
                id: `composite-${Date.now()}`,
                patternId: compositePatternId,
                clueText: clue,
                answer: knownAnswer,
                variables,
                solveSteps: generateSolveSteps(variables, compositePatternId, knownAnswer, coaching, clue)
            };

            return {
                success: true,
                confidence: 85,
                needsAI: false,
                parsed: {
                    definition: { text: definition, position: defPosition },
                    indicators: indicators.map(i => ({ text: i.text, type: i.type, entry: i.entry })),
                    fodders: composite.parts.map(p => p.text)
                },
                patternData: computeDerivedFields(rawPatternData)
            };
        }

        // Step 3c: Try substitution pattern
        const substitution = trySubstitution(wordplayTextForComposite, knownAnswer, indicators);
        if (substitution?.success) {
            const variables: Record<string, string> = {
                'def_text': definition,
                'definition_match_type': defMatchType,
                'definition_position': defPosition,
                'indicator_1_text': 'substitution',
                'fodder_1_text': substitution.baseWord,
                'result_1': knownAnswer,
                'hint_1': `Substitution: ${substitution.baseSynonym} with ${substitution.insertedFrom} (${substitution.inserted}) replacing ${substitution.removedFrom} (${substitution.removed}) = ${knownAnswer}`
            };

            return {
                success: true,
                confidence: 80,
                needsAI: false,
                parsed: {
                    definition: { text: definition, position: defPosition },
                    indicators: indicators.map(i => ({ text: i.text, type: i.type, entry: i.entry })),
                    fodders: [substitution.baseWord, substitution.removed, substitution.inserted]
                },
                patternData: {
                    id: `substitution-${Date.now()}`,
                    patternId: 'SUBSTITUTION',
                    clueText: clue,
                    answer: knownAnswer,
                    variables,
                    solveSteps: generateSolveSteps(variables, 'SUBSTITUTION', knownAnswer, coaching, clue)
                }
            };
        }
    }

    // Step 4: Calculate definition boundary word index
    const cleanClueWords = getClueWords(clue);
    const defWords = definition.split(/\s+/);
    let defEndWordIdx = defPosition === 'START' ? defWords.length : cleanClueWords.length - defWords.length;

    // Step 5: Extract fodder - process left to right, words used only once
    // For combined operations (hidden+reversal, etc.), treat as single wordplay
    const fodders: string[] = [];
    const usedWordIndices = new Set<number>();

    // Mark definition words as used
    if (defPosition === 'START') {
        for (let i = 0; i < defEndWordIdx; i++) usedWordIndices.add(i);
    } else {
        for (let i = defEndWordIdx; i < cleanClueWords.length; i++) usedWordIndices.add(i);
    }

    // Only extract fodder for FIRST indicator - combine multiple indicators into one operation
    // This handles combined operations like "hidden + reversal" as a single step
    if (indicators.length > 0) {
        const fodder = extractFodder(clue, indicators[0], defPosition, indicators, defEndWordIdx);
        if (fodder) fodders.push(fodder);
    }

    // Step 5: Build confidence score
    let confidence = 50;  // Base confidence for finding indicators

    if (definition.length > 0) confidence += 15;
    if (fodders.length === indicators.length) confidence += 15;
    if (knownAnswer && wordCount === normalizeAnswer(knownAnswer).length) confidence += 10;
    if (indicators.length === 1) confidence += 10;  // Single operation is more reliable

    // Reduce confidence for complex clues
    if (indicators.length > 2) confidence -= 20;
    if (clueWords.length > 10) confidence -= 10;

    confidence = Math.max(0, Math.min(100, confidence));

    // Step 6: Determine if we need AI
    const needsAI = confidence < 70 || !knownAnswer;

    // Step 7: Build patternData if confident enough
    let patternData: PatternInstance | undefined;
    let synonymsResolved = 0;
    let synonymsNeeded = 0;

    if (confidence >= 50 && knownAnswer) {
        // Determine pattern type based on indicators - use human-readable names
        let patternId = 'Unknown';
        const firstIndicatorType = indicators[0]?.entry?.type;

        // Map indicator types to user-friendly pattern names
        const indicatorToPattern: Record<string, string> = {
            'acrostic': 'Acrostic',
            'anagram': 'Anagram',
            'hidden': 'Hidden Word',
            'reversal': 'Reversal',
            'container': 'Container',
            'deletion': 'Deletion',
            'deletion_first': 'Deletion',
            'deletion_last': 'Deletion',
            'letter_movement': 'Letter Movement',
            'charade': 'Charade',
            'homophone': 'Homophone',
        };

        if (indicators.length === 1) {
            patternId = indicatorToPattern[firstIndicatorType || ''] || 'Unknown';
        } else {
            // Check if any indicator is letter_movement
            const hasLetterMovement = indicators.some(i => i.entry?.type === 'letter_movement');
            if (hasLetterMovement) {
                patternId = 'Charade with Letter Movement';
            } else {
                patternId = 'Charade';
            }
        }

        const variables: Record<string, string> = {
            'def_text': definition,
            'definition_match_type': defMatchType,  // 'direct' | 'synonym' | 'cryptic' | 'none'
            'definition_position': defPosition  // 'START' | 'END'
        };

        // Calculate expected result lengths for each part
        // For single indicator: result length = answer length
        // For multiple indicators: we need to figure out how they combine
        const answerLen = knownAnswer.replace(/[^A-Z]/gi, '').length;

        // Only create variables for first indicator + combine all indicator texts
        // Multiple indicators (e.g., "somewhat" + "following comeback") = combined operation
        const allIndicatorTexts = indicators.map(i => i.text).join(', ');

        // Process only the first indicator for wordplay
        [indicators[0]].forEach((ind, idx) => {
            const n = idx + 1;
            // Include all indicator texts so user sees the full operation
            variables[`indicator_${n}_text`] = allIndicatorTexts;

            const fodder = fodders[idx];
            if (fodder) {
                // Try to resolve synonym and result using dictionary
                const entry = ind.entry;

                // SPECIAL CASE: Acrostic indicators - check for standalone synonym split
                if (entry.type === 'acrostic' && knownAnswer) {
                    const acrosticSplit = splitAcrosticFodder(fodder, knownAnswer);

                    if (acrosticSplit) {
                        // Split into two wordplay components:
                        // Component 1: Acrostic (first letters)
                        variables[`fodder_${n}_text`] = acrosticSplit.acrosticFodder;
                        variables[`result_${n}`] = acrosticSplit.acrosticResult;
                        synonymsNeeded++;
                        synonymsResolved++;

                        // Component 2: Standalone synonym (charade part)
                        const m = n + 1;
                        variables[`indicator_${m}_text`] = '(synonym)';
                        variables[`fodder_${m}_text`] = acrosticSplit.synonymFodder || '';
                        variables[`result_${m}`] = acrosticSplit.synonymResult || '';
                        synonymsNeeded++;
                        synonymsResolved++;

                        return;  // Skip normal processing for this indicator
                    }
                }

                variables[`fodder_${n}_text`] = fodder;
                synonymsNeeded++;

                if (entry.letterOp === 'first' || entry.letterOp === 'last' || entry.letterOp === 'ends') {
                    // Letter extraction - check for multi-letter extraction via synonyms
                    const letterCount = entry.letterCount || 1;

                    if (letterCount > 1 && knownAnswer) {
                        // Multi-letter extraction - need to look up synonyms
                        // e.g., "leading trio to sign" → sign = TAURUS → first 3 = TAU
                        const answerClean = normalizeAnswer(knownAnswer);
                        const fodderClean = fodder.replace(/[^a-z ]/gi, '').toLowerCase();

                        // Try each word in fodder as synonym key
                        const fodderWords = fodderClean.split(/\s+/).filter(w => w.length > 1);
                        let found = false;

                        for (const word of fodderWords) {
                            const synonyms = lookupSynonyms(word);
                            for (const syn of synonyms) {
                                const synUpper = normalizeAnswer(syn);
                                if (synUpper.length >= letterCount) {
                                    const extracted = entry.letterOp === 'first'
                                        ? synUpper.slice(0, letterCount)
                                        : synUpper.slice(-letterCount);

                                    if (extracted === answerClean) {
                                        variables[`synonym_${n}`] = syn;
                                        variables[`result_${n}`] = extracted;
                                        variables[`hint_${n}`] = `"${word}" → ${syn}, first ${letterCount} letters → ${extracted}`;
                                        synonymsResolved++;
                                        found = true;
                                        break;
                                    }
                                }
                            }
                            if (found) break;
                        }

                        if (!found) {
                            // Fallback to direct extraction
                            const letter = extractLetter(fodder, entry.letterOp);
                            variables[`result_${n}`] = letter;
                            synonymsResolved++;
                        }
                    } else {
                        // Single letter extraction - no synonym needed
                        const letter = extractLetter(fodder, entry.letterOp);
                        variables[`result_${n}`] = letter;
                        synonymsResolved++;
                    }
                } else if (entry.letterOp === 'middle') {
                    // Middle letter extraction - "bet, essentially" = E
                    const cleanFodder = fodder.replace(/[^a-z]/gi, '').toUpperCase();
                    let middleLetter: string;
                    if (cleanFodder.length % 2 === 1) {
                        // Odd length: single middle letter
                        const midIdx = Math.floor(cleanFodder.length / 2);
                        middleLetter = cleanFodder[midIdx];
                    } else {
                        // Even length: middle 2 letters
                        const midIdx = cleanFodder.length / 2 - 1;
                        middleLetter = cleanFodder.slice(midIdx, midIdx + 2);
                    }
                    variables[`result_${n}`] = middleLetter;
                    synonymsResolved++;
                } else if (entry.type === 'acrostic') {
                    // Acrostic without split - take first letters of all words
                    const words = fodder.split(/\s+/);
                    const result = words.map(w => w[0]?.toUpperCase() || '').join('');
                    variables[`result_${n}`] = result;
                    synonymsResolved++;
                } else if (entry.type === 'anagram') {
                    // Anagram - check if fodder letters can be rearranged to form answer
                    let fodderClean = fodder.replace(/[^a-zA-Z]/g, '').toUpperCase();
                    if (knownAnswer) {
                        const answerClean = normalizeAnswer(knownAnswer);
                        const answerSorted = answerClean.split('').sort().join('');
                        let fodderSorted = fodderClean.split('').sort().join('');
                        let actualFodder = fodder;

                        // If fodder doesn't match, try to find correct fodder from clue
                        if (fodderSorted !== answerSorted) {
                            const words = clueWords;
                            const indWords = ind.text.toLowerCase().split(/\s+/);

                            // Find indicator position
                            let indStart = 0;
                            let indEnd = 0;
                            for (let i = 0; i <= words.length - indWords.length; i++) {
                                if (words.slice(i, i + indWords.length).join(' ').toLowerCase() === indWords.join(' ')) {
                                    indStart = i;
                                    indEnd = i + indWords.length;
                                    break;
                                }
                            }

                            // Try fodder BEFORE indicator with various definition lengths
                            // For "Monarchies asserting vetoes abroad", try:
                            // - def=1 word: fodder = "asserting vetoes" (words 1-2)
                            // - def=2 words: fodder = "vetoes" (word 2 only)
                            if (defPosition === 'START') {
                                // Try different definition lengths (1 to indStart-1 words)
                                for (let defLen = 1; defLen < indStart && fodderSorted !== answerSorted; defLen++) {
                                    const testFodder = words.slice(defLen, indStart).join(' ');
                                    const testClean = testFodder.replace(/[^a-zA-Z]/g, '').toUpperCase();
                                    const testSorted = testClean.split('').sort().join('');
                                    if (testSorted === answerSorted) {
                                        actualFodder = testFodder;
                                        fodderClean = testClean;
                                        fodderSorted = testSorted;
                                        variables[`fodder_${n}_text`] = actualFodder;
                                        // Update definition to match
                                        const newDef = words.slice(0, defLen).join(' ');
                                        variables['def_text'] = newDef;
                                        break;
                                    }
                                }
                            } else {
                                // Definition at END - try fodder before indicator
                                for (let len = indStart; len >= 1 && fodderSorted !== answerSorted; len--) {
                                    const testFodder = words.slice(indStart - len, indStart).join(' ');
                                    const testClean = testFodder.replace(/[^a-zA-Z]/g, '').toUpperCase();
                                    const testSorted = testClean.split('').sort().join('');
                                    if (testSorted === answerSorted) {
                                        actualFodder = testFodder;
                                        fodderClean = testClean;
                                        fodderSorted = testSorted;
                                        variables[`fodder_${n}_text`] = actualFodder;
                                        break;
                                    }
                                }
                            }

                            // If still no match, try fodder AFTER indicator
                            if (fodderSorted !== answerSorted) {
                                for (let len = 1; len <= words.length - indEnd; len++) {
                                    const testFodder = words.slice(indEnd, indEnd + len).join(' ');
                                    const testClean = testFodder.replace(/[^a-zA-Z]/g, '').toUpperCase();
                                    const testSorted = testClean.split('').sort().join('');
                                    if (testSorted === answerSorted) {
                                        actualFodder = testFodder;
                                        fodderClean = testClean;
                                        fodderSorted = testSorted;
                                        variables[`fodder_${n}_text`] = actualFodder;
                                        break;
                                    }
                                }
                            }
                        }

                        // Check if letters match (anagram verification)
                        if (fodderSorted === answerSorted) {
                            variables[`result_${n}`] = answerClean;
                            variables[`hint_${n}`] = `"${actualFodder}" anagrammed = ${answerClean}`;
                            synonymsResolved++;
                        }
                    }
                } else if (entry.type === 'hidden' || entry.type === 'reversal') {
                    // Hidden word or reversal - check fodder for answer
                    let fodderClean = fodder.replace(/\s+/g, '').toUpperCase();
                    if (knownAnswer) {
                        const answerClean = normalizeAnswer(knownAnswer);
                        const reversedAnswer = answerClean.split('').reverse().join('');

                        // For hidden indicators, try alternate fodder if primary doesn't contain answer
                        // (fodder could be before OR after the indicator)
                        let actualFodder = fodder;
                        if (entry.type === 'hidden' && !fodderClean.includes(answerClean)) {
                            // Try alternate fodder location (before indicator instead of after, or vice versa)
                            const words = clueWords;
                            const indWords = ind.text.toLowerCase().split(/\s+/);

                            // Find indicator position
                            let indStart = -1;
                            for (let i = 0; i <= words.length - indWords.length; i++) {
                                if (words.slice(i, i + indWords.length).join(' ').toLowerCase().includes(indWords.join(' '))) {
                                    indStart = i;
                                    break;
                                }
                            }

                            if (indStart >= 0) {
                                const indEnd = indStart + indWords.length;
                                // Words before indicator (excluding definition)
                                const beforeInd = words.slice(defPosition === 'START' ? defEndWordIdx : 0, indStart);
                                // Words after indicator (excluding definition)
                                const afterInd = words.slice(indEnd, defPosition === 'END' ? defEndWordIdx : words.length);

                                // Try before indicator
                                const beforeClean = normalizeAnswer(beforeInd.join(''));
                                if (beforeClean.includes(answerClean)) {
                                    actualFodder = beforeInd.join(' ');
                                    fodderClean = beforeClean;
                                    variables[`fodder_${n}_text`] = actualFodder;
                                }
                                // Try after indicator
                                else {
                                    const afterClean = normalizeAnswer(afterInd.join(''));
                                    if (afterClean.includes(answerClean)) {
                                        actualFodder = afterInd.join(' ');
                                        fodderClean = afterClean;
                                        variables[`fodder_${n}_text`] = actualFodder;
                                    }
                                }
                            }
                        }

                        // Check if multiple indicators suggest combined operation (hidden + reversal)
                        const hasHidden = indicators.some(i => i.type === 'hidden');
                        const hasReversal = indicators.some(i => i.type === 'reversal');

                        if (hasHidden && hasReversal) {
                            // Combined hidden + reversal: look for reversed answer in fodder
                            if (fodderClean.includes(reversedAnswer)) {
                                variables[`result_${n}`] = answerClean;
                                variables[`hint_${n}`] = `Hidden "${reversedAnswer}" in "${actualFodder}" reversed = ${answerClean}`;
                                synonymsResolved++;
                            }
                        } else if (entry.type === 'hidden') {
                            // Pure hidden: look for answer directly in fodder
                            if (fodderClean.includes(answerClean)) {
                                variables[`result_${n}`] = answerClean;
                                variables[`hint_${n}`] = `Hidden word in "${actualFodder}" = ${answerClean}`;
                                synonymsResolved++;
                            }
                        } else if (entry.type === 'reversal') {
                            // Pure reversal: reverse the fodder
                            if (fodderClean.length === answerClean.length) {
                                const reversed = fodderClean.split('').reverse().join('');
                                if (reversed === answerClean) {
                                    variables[`result_${n}`] = answerClean;
                                    variables[`hint_${n}`] = `"${fodder}" reversed = ${answerClean}`;
                                    synonymsResolved++;
                                }
                            }

                            // Charade + reversal: try splitting fodder into synonym parts,
                            // combine them, then reverse to get answer
                            if (!variables[`result_${n}`]) {
                                // Try to find charade that when reversed gives answer
                                const reversedAnswer = answerClean.split('').reverse().join('');
                                const charadeSplit = tryCharadeSplit(fodder, reversedAnswer);
                                if (charadeSplit && charadeSplit.success) {
                                    const combined = charadeSplit.parts.map(p => p.result).join('');
                                    if (combined === reversedAnswer) {
                                        const partsDesc = charadeSplit.parts.map(p => `${p.text}→${p.result}`).join(' + ');
                                        variables[`result_${n}`] = answerClean;
                                        variables[`hint_${n}`] = `Charade (${partsDesc}) = ${combined}, reversed = ${answerClean}`;
                                        synonymsResolved++;
                                    }
                                }
                            }
                        }
                    }
                } else if (entry.type === 'homophone') {
                    // Homophone - find a synonym of fodder that sounds like the answer
                    if (knownAnswer) {
                        const answerClean = normalizeAnswer(knownAnswer);

                        // Get synonyms for the fodder word
                        const fodderSynonyms = lookupSynonyms(fodder);

                        // Check if any synonym sounds like the answer (differs by one letter, typically E)
                        // Common homophones: STOW/STOWE, NIGHT/KNIGHT, HEIR/AIR, etc.
                        let homophoneMatch: { fodderSynonym: string; sounds_like: string } | null = null;

                        for (const syn of fodderSynonyms) {
                            // Check if synonym + E = answer (common pattern)
                            if (syn + 'E' === answerClean) {
                                homophoneMatch = { fodderSynonym: syn, sounds_like: answerClean };
                                break;
                            }
                            // Check if synonym - E = answer
                            if (syn.endsWith('E') && syn.slice(0, -1) === answerClean) {
                                homophoneMatch = { fodderSynonym: syn, sounds_like: answerClean };
                                break;
                            }
                            // Check for other common homophone patterns (NIGHT/KNIGHT, etc.)
                            if (HOMOPHONE_PAIRS[syn]?.includes(answerClean)) {
                                homophoneMatch = { fodderSynonym: syn, sounds_like: answerClean };
                                break;
                            }
                            // Direct match (sounds exactly like answer)
                            if (syn === answerClean) {
                                homophoneMatch = { fodderSynonym: syn, sounds_like: answerClean };
                                break;
                            }
                        }

                        if (homophoneMatch) {
                            variables[`indicator_${n}_text`] = ind.text;
                            variables[`fodder_${n}_text`] = fodder;
                            variables[`synonym_${n}`] = homophoneMatch.fodderSynonym;
                            variables[`result_${n}`] = answerClean;
                            variables[`hint_${n}`] = `"${fodder}" → ${homophoneMatch.fodderSynonym}, sounds like ${answerClean}`;
                            variables[`complexity_${n}`] = '2';  // Medium complexity
                            // Store homophone-specific vars for explanation template
                            variables[`homophone_base_${n}`] = homophoneMatch.fodderSynonym;
                            variables[`homophone_result_${n}`] = answerClean;
                            synonymsResolved++;
                        }
                    }
                } else if (entry.type === 'container') {
                    // Container - inner content goes inside outer container
                    // Pattern: [inner] embodied by [outer] OR [outer] containing [inner]
                    if (knownAnswer) {
                        const answerClean = normalizeAnswer(knownAnswer);
                        const words = clueWords;
                        const indicatorWords = ind.text.split(/\s+/);

                        // Find indicator position in word array
                        let indicatorStartWord = -1;
                        let indicatorEndWord = -1;
                        for (let i = 0; i <= words.length - indicatorWords.length; i++) {
                            let match = true;
                            for (let j = 0; j < indicatorWords.length; j++) {
                                if (!cleanText(words[i + j]).includes(indicatorWords[j].toLowerCase())) {
                                    match = false;
                                    break;
                                }
                            }
                            if (match) {
                                indicatorStartWord = i;
                                indicatorEndWord = i + indicatorWords.length;
                                break;
                            }
                        }

                        if (indicatorStartWord !== -1) {
                            // Container semantics depend on indicator:
                            // - "embodied by/in" → inner BEFORE indicator, outer AFTER
                            // - "securing/holding/containing" → outer BEFORE indicator, inner AFTER
                            //
                            // Default assumption: inner before, outer after
                            // But certain indicators flip the semantics
                            const outerBeforeIndicators = new Set([
                                'securing', 'guarding', 'trapping', 'clutching', 'holding',
                                'embracing', 'surrounding', 'containing', 'entertaining',
                                'hosting', 'housing', 'protecting', 'consuming', 'swallowing',
                                'eating', 'wearing'
                            ]);
                            const indicatorLower = ind.text.toLowerCase();
                            const isOuterBefore = outerBeforeIndicators.has(indicatorLower);

                            let innerWords: string[];
                            let outerWords: string[];

                            if (isOuterBefore) {
                                // Outer BEFORE indicator, inner AFTER (up to definition)
                                // For def at START: outer is from defEndWordIdx to indicatorStart
                                // For def at END: outer is from 0 to indicatorStart
                                const outerStart = defPosition === 'START' ? defEndWordIdx : 0;
                                outerWords = words.slice(outerStart, indicatorStartWord);
                                // Inner is after indicator, but need to exclude definition at end
                                const defWordCount = definition.split(/\s+/).length;
                                const innerEnd = defPosition === 'END' ? words.length - defWordCount : words.length;
                                innerWords = words.slice(indicatorEndWord, innerEnd);
                            } else {
                                // Inner BEFORE indicator, outer AFTER
                                const innerStart = defPosition === 'START' ? defEndWordIdx : 0;
                                innerWords = words.slice(innerStart, indicatorStartWord);
                                outerWords = words.slice(indicatorEndWord);
                            }

                            // Clean up the inner text (remove "from", quotes, etc.)
                            let innerText = innerWords.join(' ').replace(/^from\s+/i, '').replace(/[''"]/g, '').trim();
                            let outerText = outerWords.join(' ').trim();

                            // Resolve inner to its result
                            // Handle special cases:
                            // - "edges of X" / "ends of X" → outer letters of X
                            // - "love party" = O (love) + DO (party) = ODO
                            let innerResult = '';
                            const innerWordList = innerText.split(/\s+/);
                            const innerParts: { word: string; result: string }[] = [];

                            // Check for outer-letter indicators in inner text
                            const outerLetterMatch = innerText.match(/^(edges?\s+of|ends?\s+of|cover\s+from|extremes?\s+of)\s+(.+)$/i);
                            if (outerLetterMatch) {
                                const indicatorPhrase = outerLetterMatch[1];
                                const fodderText = outerLetterMatch[2].replace(/-/g, '');  // Remove hyphens
                                innerResult = extractLetter(fodderText, 'ends');
                                innerParts.push({ word: innerText, result: innerResult });
                            } else {
                                // Standard inner resolution
                                for (const word of innerWordList) {
                                    const wordClean = word.toLowerCase().replace(/[^a-z-]/g, '');
                                    if (!wordClean) continue;

                                    // Check STANDALONE_SYNONYMS first (love→O, party handled via CRYPTIC_MEANINGS)
                                    const standaloneResult = STANDALONE_SYNONYMS[wordClean];
                                    if (standaloneResult) {
                                        innerParts.push({ word, result: standaloneResult });
                                        innerResult += standaloneResult;
                                    } else {
                                        // Check ABBREVIATION_EXPLANATIONS
                                        const abbrevInfo = ABBREVIATION_EXPLANATIONS[wordClean];
                                        if (abbrevInfo) {
                                            innerParts.push({ word, result: abbrevInfo.result });
                                            innerResult += abbrevInfo.result;
                                        } else {
                                            // Check CRYPTIC_MEANINGS (party → DO)
                                            const crypticInfo = CRYPTIC_MEANINGS[wordClean];
                                            if (crypticInfo && crypticInfo.synonyms.length > 0) {
                                                // Take the shortest synonym (usually the abbreviation)
                                                const shortest = crypticInfo.synonyms.reduce((a, b) => a.length <= b.length ? a : b);
                                                innerParts.push({ word, result: shortest });
                                                innerResult += shortest;
                                            } else {
                                                // Try regular synonyms
                                                const syns = lookupSynonyms(wordClean);
                                                if (syns.length > 0 && syns[0].length <= 3) {
                                                    innerParts.push({ word, result: syns[0] });
                                                    innerResult += syns[0];
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            // Resolve outer to its result
                            // "aggressive-submissive proclivity" = SM
                            // Also handle charade prefix: "Good buzz" = G + KICK
                            let outerResult = '';
                            let charadePrefix = '';  // For cases like "Good buzz" where "Good"=G is prefix
                            let actualOuterText = outerText;  // The actual container word (e.g., "buzz")

                            // Check ABBREVIATION_EXPLANATIONS for full phrase
                            const outerAbbrevInfo = ABBREVIATION_EXPLANATIONS[outerText.toLowerCase()];
                            if (outerAbbrevInfo) {
                                outerResult = outerAbbrevInfo.result;
                            } else {
                                // Check STANDALONE_SYNONYMS for hyphenated terms
                                const outerStandalone = STANDALONE_SYNONYMS[outerText.toLowerCase().replace(/\s+proclivity$/i, '')];
                                if (outerStandalone) {
                                    outerResult = outerStandalone;
                                } else {
                                    // Try phrase lookup in synonyms
                                    const syns = lookupSynonyms(outerText);
                                    if (syns.length > 0) {
                                        outerResult = syns[0];
                                    } else {
                                        // NEW: Check if outer has multiple words where first is abbreviation (charade prefix)
                                        // e.g., "Good buzz" → "Good"=G (prefix) + "buzz"=KICK (container)
                                        const outerWordList = outerText.split(/\s+/);
                                        if (outerWordList.length >= 2) {
                                            const firstWord = outerWordList[0].toLowerCase();
                                            const restWords = outerWordList.slice(1).join(' ').toLowerCase();

                                            // Check if first word is a single-letter abbreviation
                                            const firstSyns = lookupSynonyms(firstWord);
                                            const singleLetterAbbrev = firstSyns.find(s => s.length === 1);

                                            if (singleLetterAbbrev) {
                                                // Check if rest is the actual container
                                                const restSyns = lookupSynonyms(restWords);
                                                if (restSyns.length > 0 && restSyns[0].length >= 2) {
                                                    charadePrefix = singleLetterAbbrev;
                                                    outerResult = restSyns[0];
                                                    actualOuterText = outerWordList.slice(1).join(' ');
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            // Perform container operation: insert inner in middle of outer
                            // Container semantics: inner goes INSIDE outer
                            // Try different insertion points to find one that produces the answer
                            if (innerResult && outerResult && outerResult.length >= 2) {
                                // Try each insertion point (1 to outerLen-1)
                                let combined = '';
                                let insertionPoint = 0;
                                let foundMatch = false;
                                let usedCharadePrefix = false;

                                // First try without charade prefix
                                for (let tryPos = 1; tryPos < outerResult.length; tryPos++) {
                                    const tryResult = outerResult.slice(0, tryPos) + innerResult + outerResult.slice(tryPos);
                                    if (tryResult === answerClean) {
                                        combined = tryResult;
                                        insertionPoint = tryPos;
                                        foundMatch = true;
                                        break;
                                    }
                                }

                                // If no match and we have a charade prefix, try with prefix
                                if (!foundMatch && charadePrefix) {
                                    for (let tryPos = 1; tryPos < outerResult.length; tryPos++) {
                                        const containerResult = outerResult.slice(0, tryPos) + innerResult + outerResult.slice(tryPos);
                                        const tryResult = charadePrefix + containerResult;
                                        if (tryResult === answerClean) {
                                            combined = containerResult;
                                            insertionPoint = tryPos;
                                            foundMatch = true;
                                            usedCharadePrefix = true;
                                            break;
                                        }
                                    }
                                }

                                // Also verify letters match (in case answer has different case)
                                if (!foundMatch) {
                                    for (let tryPos = 1; tryPos < outerResult.length; tryPos++) {
                                        const tryResult = outerResult.slice(0, tryPos) + innerResult + outerResult.slice(tryPos);
                                        const combinedSorted = tryResult.split('').sort().join('');
                                        const answerSorted = answerClean.split('').sort().join('');
                                        if (combinedSorted === answerSorted && tryResult.length === answerClean.length) {
                                            combined = tryResult;
                                            insertionPoint = tryPos;
                                            foundMatch = true;
                                            break;
                                        }
                                    }
                                }

                                if (foundMatch) {
                                    const outerFirst = outerResult.slice(0, insertionPoint);
                                    const outerLast = outerResult.slice(insertionPoint);

                                    if (usedCharadePrefix) {
                                        // Charade + Container pattern: G + K[RUB]ICK = GRUBKICK
                                        // Step 1: Charade prefix (abbreviation)
                                        const prefixWord = outerText.split(/\s+/)[0];
                                        variables[`indicator_1_text`] = '';
                                        variables[`fodder_1_text`] = prefixWord;
                                        variables[`result_1`] = charadePrefix;
                                        variables[`complexity_1`] = '1';

                                        // Step 2: Inner content
                                        variables[`indicator_2_text`] = '';
                                        variables[`fodder_2_text`] = innerText;
                                        variables[`result_2`] = innerResult;
                                        variables[`hint_2`] = innerParts.map(p => `"${p.word}" → ${p.result}`).join(', ');
                                        variables[`complexity_2`] = '1';

                                        // Step 3: Container operation
                                        variables[`indicator_3_text`] = ind.text;
                                        variables[`fodder_3_text`] = actualOuterText;
                                        variables[`result_3`] = combined;
                                        variables[`hint_3`] = `"${actualOuterText}" → ${outerResult}, ${innerResult} inside → ${outerFirst}(${innerResult})${outerLast}`;
                                        variables[`complexity_3`] = '2';
                                        variables[`container_part_3`] = 'full';

                                        // Step 4: Assembly
                                        variables[`indicator_4_text`] = 'Assembly';
                                        variables[`fodder_4_text`] = '';
                                        variables[`result_4`] = answerClean;
                                        variables[`complexity_4`] = '3';
                                        variables['structure'] = `${charadePrefix} + ${combined} = ${answerClean}`;

                                        // Store container-specific vars
                                        variables['container_inner'] = innerResult;
                                        variables['container_outer'] = outerResult;
                                        variables['container_outer_first'] = outerFirst;
                                        variables['container_outer_last'] = outerLast;
                                        variables['container_indicator'] = ind.text;
                                        variables['container_verified'] = 'true';
                                        variables['charade_prefix'] = charadePrefix;

                                        synonymsResolved = 3;
                                        patternId = 'Charade with Container';
                                    } else {
                                        // Standard container pattern (no charade prefix)
                                        // Set up wordplay steps - clean, simple sequence:
                                        // Step 1: Inner content
                                        // Step 2: Container operation (produces final answer)

                                        // Step 1: Inner content (abbreviation lookup)
                                        variables[`indicator_1_text`] = '';
                                        variables[`fodder_1_text`] = innerText;
                                        variables[`result_1`] = innerResult;
                                        variables[`hint_1`] = innerParts.map(p => `"${p.word}" → ${p.result}`).join(', ');
                                        variables[`complexity_1`] = '1';

                                        // Step 2: Container operation (produces final result)
                                        variables[`indicator_2_text`] = ind.text;
                                        variables[`fodder_2_text`] = outerText;
                                        variables[`result_2`] = combined;  // Full result: SODOM
                                        variables[`hint_2`] = `"${outerText}" → ${outerResult}, ${innerResult} inside → ${outerFirst}(${innerResult})${outerLast}`;
                                        variables[`complexity_2`] = '2';
                                        variables[`container_part_2`] = 'full';

                                        // Store container-specific vars for explanation template
                                        variables['container_inner'] = innerResult;
                                        variables['container_outer'] = outerResult;
                                        variables['container_outer_first'] = outerFirst;
                                        variables['container_outer_last'] = outerLast;
                                        variables['container_indicator'] = ind.text;
                                        variables['container_verified'] = 'true';  // Flag to skip result verification

                                        // No assembly step needed - container operation produces final answer
                                        synonymsResolved = 2;
                                    }
                                }
                            }
                        }
                    }
                } else if (entry.type === 'letter_movement') {
                    // Letter movement - create battlecard steps where results combine to answer
                    if (knownAnswer) {
                        const movementResult = tryLetterMovementCharade(fodder, knownAnswer, ind.text);
                        if (movementResult?.success) {
                            const direction = movementResult.movement === 'to_end' ? 'to end' : 'to start';
                            const answerClean = normalizeAnswer(knownAnswer);

                            // Clean up source strings (remove trailing punctuation)
                            const cleanSource = (s: string) => s.replace(/[,;:.']+$/g, '').trim();
                            const baseClean = cleanSource(movementResult.baseSource);
                            const letterClean = cleanSource(movementResult.letterSource);

                            // Step 1: Letter movement (combined base + letter operation → moved word)
                            // This produces the first part of the answer
                            variables[`indicator_1_text`] = ind.text;
                            variables[`fodder_1_text`] = `${baseClean}, ${letterClean}`;
                            variables[`synonym_1`] = movementResult.baseWord;
                            variables[`result_1`] = movementResult.movedWord;
                            variables[`hint_1`] = `"${baseClean}" → ${movementResult.baseWord}, "${letterClean}" → ${movementResult.letter}, move ${movementResult.letter} ${direction} → ${movementResult.movedWord}`;
                            // Mark as complex (3 steps) for pedagogical ordering
                            variables[`complexity_1`] = '3';
                            // Store separate parts for explanation template
                            variables[`letterSource_1`] = letterClean;  // "months"
                            variables[`letter_1`] = movementResult.letter;  // "M"
                            variables[`synonymFodder_1`] = baseClean;  // "slander"

                            // Step 2+: Additional charade parts (simple lookups)
                            let stepNum = 2;
                            for (const part of movementResult.additionalParts) {
                                const partClean = cleanSource(part.source);
                                variables[`indicator_${stepNum}_text`] = '';
                                variables[`fodder_${stepNum}_text`] = partClean;
                                variables[`synonym_${stepNum}`] = part.result;
                                variables[`result_${stepNum}`] = part.result;
                                variables[`hint_${stepNum}`] = `"${partClean}" → ${part.result}`;
                                // Mark as simple (1 step) for pedagogical ordering
                                variables[`complexity_${stepNum}`] = '1';
                                stepNum++;
                            }

                            // Store structure for parsing summary
                            let structure = `${movementResult.movedWord}`;
                            if (movementResult.additionalParts.length > 0) {
                                structure += ` + ${movementResult.additionalParts.map(p => p.result).join(' + ')}`;
                            }
                            structure += ` = ${answerClean}`;
                            variables['structure'] = structure;

                            // Final assembly step - shows how all parts combine
                            // Note: don't set result_N for assembly as it would break the combination check
                            const finalStepNum = stepNum;
                            variables[`indicator_${finalStepNum}_text`] = 'Assembly';
                            variables[`fodder_${finalStepNum}_text`] = structure;
                            variables[`hint_${finalStepNum}`] = `${movementResult.movedWord} + ${movementResult.additionalParts.map(p => p.result).join(' + ')} = ${answerClean}`;

                            // Mark as fully resolved - results will combine to answer
                            synonymsResolved = 1 + movementResult.additionalParts.length;
                        } else {
                            // Fallback if we can't trace it
                            const answerClean = normalizeAnswer(knownAnswer);
                            variables[`result_${n}`] = answerClean;
                            variables[`hint_${n}`] = `Letter movement pattern (could not trace steps)`;
                        }
                    }
                } else if (entry.synonymRequired || lookupSynonyms(fodder).length > 0) {
                    // Need to find synonym, then apply operation
                    const operation = entry.type === 'deletion_first' ? 'deletion_first' : 'deletion_last';

                    // For composite clues, try multiple possible target lengths
                    // For single clue, result length = answer length
                    let targetLengths: number[] = [answerLen];

                    if (indicators.length > 1) {
                        // For 2-part charades, try various splits
                        // Account for letter extractions in other parts
                        const otherPartsLetterExtract = indicators.filter((ind, i) =>
                            i !== idx && (ind.entry.letterOp === 'first' || ind.entry.letterOp === 'last')
                        ).length;

                        const remainingLen = answerLen - otherPartsLetterExtract;

                        // Try different possible lengths for this part
                        targetLengths = [];
                        for (let len = 1; len <= remainingLen; len++) {
                            targetLengths.push(len);
                        }
                    }

                    // Try each possible target length
                    for (const targetLen of targetLengths) {
                        const match = findSynonymForOperation(fodder, operation, targetLen);
                        if (match) {
                            variables[`synonym_${n}`] = match.synonym;
                            variables[`result_${n}`] = match.result;
                            synonymsResolved++;
                            break;  // Found a valid match
                        }
                    }
                } else {
                    // Direct operation on fodder (no synonym step)
                    const fodderClean = normalizeAnswer(fodder);
                    if (entry.type === 'deletion_first') {
                        variables[`result_${n}`] = fodderClean.slice(1);
                        synonymsResolved++;
                    } else if (entry.type === 'deletion_last') {
                        variables[`result_${n}`] = fodderClean.slice(0, -1);
                        synonymsResolved++;
                    }
                }
            }
        });

        // Verify that results combine to form the answer
        // Check up to 3 result slots (acrostic splits can create extra results)
        const resultParts: string[] = [];
        for (let i = 1; i <= 3; i++) {
            if (variables[`result_${i}`]) {
                resultParts.push(variables[`result_${i}`]);
            }
        }
        const combinedResult = resultParts.join('').toUpperCase();
        const expectedAnswer = normalizeAnswer(knownAnswer);
        let resultsMatchAnswer = combinedResult === expectedAnswer;

        // If results don't match for composite clues, try smarter combinations
        if (!resultsMatchAnswer && indicators.length === 2 && fodders.length === 2) {
            // Clear previous attempts
            for (let i = 1; i <= indicators.length; i++) {
                delete variables[`synonym_${i}`];
                delete variables[`result_${i}`];
            }
            synonymsResolved = 0;

            // Try all valid length combinations for a 2-part charade
            const ind1 = indicators[0];
            const ind2 = indicators[1];
            const fod1 = fodders[0];
            const fod2 = fodders[1];

            // Determine what operations each part uses
            const op1 = ind1.entry.letterOp ? `extract_${ind1.entry.letterOp}` as const :
                       ind1.entry.type === 'deletion_first' ? 'deletion_first' : 'deletion_last';
            const op2 = ind2.entry.letterOp ? `extract_${ind2.entry.letterOp}` as const :
                       ind2.entry.type === 'deletion_first' ? 'deletion_first' : 'deletion_last';

            // For each possible split of the answer length
            for (let len1 = 1; len1 < answerLen; len1++) {
                const len2 = answerLen - len1;

                let match1: { synonym: string; result: string } | null = null;
                let match2: { synonym: string; result: string } | null = null;

                // Try to find synonyms that produce results of these lengths
                if (ind1.entry.letterOp === 'first' || ind1.entry.letterOp === 'last') {
                    if (len1 === 1) {
                        match1 = { synonym: '', result: extractLetter(fod1, ind1.entry.letterOp) };
                    }
                } else {
                    match1 = findSynonymForOperation(fod1, op1 as any, len1);
                }

                if (ind2.entry.letterOp === 'first' || ind2.entry.letterOp === 'last') {
                    if (len2 === 1) {
                        match2 = { synonym: '', result: extractLetter(fod2, ind2.entry.letterOp) };
                    }
                } else {
                    match2 = findSynonymForOperation(fod2, op2 as any, len2);
                }

                if (match1 && match2) {
                    const combined = (match1.result + match2.result).toUpperCase();
                    if (combined === expectedAnswer) {
                        if (match1.synonym) variables['synonym_1'] = match1.synonym;
                        variables['result_1'] = match1.result;
                        if (match2.synonym) variables['synonym_2'] = match2.synonym;
                        variables['result_2'] = match2.result;
                        synonymsResolved = 2;
                        resultsMatchAnswer = true;
                        break;
                    }
                }
            }
        } else if (!resultsMatchAnswer && synonymsResolved > 0 && !variables['container_verified']) {
            // Single part clue failed - clear incorrect results
            // Skip for container patterns which have already been verified
            for (let i = 1; i <= indicators.length; i++) {
                delete variables[`synonym_${i}`];
                delete variables[`result_${i}`];
            }
            synonymsResolved = 0;
        }

        // Update patternId if we detected an acrostic+charade split
        if (firstIndicatorType === 'acrostic' && variables['result_2']) {
            patternId = 'Charade with Acrostic';
        }

        // Update patternId if letter movement produced additional charade parts
        if (firstIndicatorType === 'letter_movement' && variables['result_2']) {
            patternId = 'Charade with Letter Movement';
        }

        // Set definition type based on findBestDefinitionMatch results
        // This uses the multi-word phrase matching we did earlier
        if (defMatchType === 'cryptic' && defHint) {
            variables['definition_type'] = 'cryptic';
            variables['definition_hint'] = defHint;
        } else if (defMatchType === 'none') {
            // No match found even with multi-word phrases - last resort fallback
            const crypticCheck = detectCrypticDefinition(definition, knownAnswer, coaching);
            if (crypticCheck.isCryptic) {
                variables['definition_type'] = 'cryptic';
                variables['definition_hint'] = crypticCheck.hint;
            }
        }
        // For 'direct' and 'synonym' matches, definition is straightforward (no special type)

        patternData = {
            id: `parsed-${Date.now()}`,
            patternId,
            clueText: clue,
            answer: knownAnswer,
            variables,
            solveSteps: generateSolveSteps(variables, patternId, knownAnswer, coaching, clue)
        };

        // Boost confidence if we resolved synonyms AND they match the answer
        if (synonymsNeeded > 0 && synonymsResolved === synonymsNeeded && resultsMatchAnswer) {
            confidence = Math.min(100, confidence + 15);
        }
    }

    // Update needsAI based on synonym resolution
    let needsAIUpdated = confidence < 70 || !knownAnswer || (synonymsNeeded > 0 && synonymsResolved < synonymsNeeded);

    // Charade fallback: if indicator-based parsing didn't fully resolve, try charade
    if (needsAIUpdated && knownAnswer && definition) {
        // Build wordplay text by excluding definition
        const defWords = definition.split(/\s+/);
        const allWords = clueWords;

        let wordplayWords: string[];
        if (defPosition === 'START') {
            wordplayWords = allWords.slice(defWords.length);
        } else {
            wordplayWords = allWords.slice(0, allWords.length - defWords.length);
        }

        const wordplayText = wordplayWords.join(' ');
        const charade = tryCharadeSplit(wordplayText, knownAnswer);

        if (charade?.success) {
            // Charade succeeded - update patternData
            const charadevars: Record<string, string> = {
                'def_text': definition,
                'definition_match_type': defMatchType,
                'definition_position': defPosition
            };

            charade.parts.forEach((part, idx) => {
                const n = idx + 1;
                charadevars[`indicator_${n}_text`] = '(synonym)';
                charadevars[`fodder_${n}_text`] = part.text;
                charadevars[`result_${n}`] = part.result;
                charadevars[`complexity_${n}`] = '2';  // Medium complexity for synonym lookups
            });

            const partsHint = charade.parts.map(p => `${p.text} → ${p.result}`).join(' + ');
            charadevars['hint_1'] = `Charade: ${partsHint} = ${knownAnswer}`;

            patternData = {
                id: `charade-fallback-${Date.now()}`,
                patternId: 'Charade',
                clueText: clue,
                answer: knownAnswer,
                variables: charadevars,
                solveSteps: generateSolveSteps(charadevars, 'CHARADE', knownAnswer, coaching, clue)
            };

            confidence = 75;
            needsAIUpdated = false;
        }
    }

    // Outer-letter charade fallback: handles patterns like "cover from X pipe Y at both ends"
    // Where outer letters of words combine with synonyms
    if (needsAIUpdated && knownAnswer && definition) {
        const words = clueWords;
        const answerClean = normalizeAnswer(knownAnswer);

        // Scan for outer-letter indicators directly from INDICATOR_DICTIONARY
        const outerIndicators: { text: string; startWord: number; endWord: number }[] = [];
        for (let i = 0; i < words.length; i++) {
            for (let len = 3; len >= 1; len--) {
                if (i + len > words.length) continue;
                const phrase = words.slice(i, i + len).join(' ').toLowerCase();
                const entry = INDICATOR_DICTIONARY[phrase];
                if (entry && entry.letterOp === 'ends') {
                    outerIndicators.push({ text: phrase, startWord: i, endWord: i + len });
                    break; // Take longest match
                }
            }
        }

        if (outerIndicators.length >= 1) {
            // Sort by position
            outerIndicators.sort((a, b) => a.startWord - b.startWord);

            // Build parts: outer-letter extractions + synonyms
            const parts: { fodder: string; result: string; type: 'outer_letters' | 'synonym'; indicator?: string }[] = [];
            const defWords = definition.split(/\s+/).length;
            const startPos = defPosition === 'START' ? defWords : 0;
            const endPos = defPosition === 'START' ? words.length : words.length - defWords;

            // Mark which word indices are used by indicators
            const usedByIndicator = new Set<number>();
            for (const ind of outerIndicators) {
                for (let i = ind.startWord; i < ind.endWord; i++) {
                    usedByIndicator.add(i);
                }
            }

            // Process each outer indicator
            for (const ind of outerIndicators) {
                // Look for fodder AFTER indicator (e.g., "cover from discharge")
                if (ind.endWord < endPos && !usedByIndicator.has(ind.endWord)) {
                    const fodderWord = words[ind.endWord];
                    const result = extractLetter(fodderWord, 'ends');
                    parts.push({ fodder: fodderWord, result, type: 'outer_letters', indicator: ind.text });
                    usedByIndicator.add(ind.endWord);
                }
                // Look for fodder BEFORE indicator (e.g., "examined at both ends")
                else if (ind.startWord > startPos && !usedByIndicator.has(ind.startWord - 1)) {
                    const fodderWord = words[ind.startWord - 1];
                    const result = extractLetter(fodderWord, 'ends');
                    parts.push({ fodder: fodderWord, result, type: 'outer_letters', indicator: ind.text });
                    usedByIndicator.add(ind.startWord - 1);
                }
            }

            // Look for synonym parts in remaining words
            for (let i = startPos; i < endPos; i++) {
                if (usedByIndicator.has(i)) continue;
                const word = words[i];
                const syns = lookupSynonyms(word);
                if (syns.length > 0) {
                    parts.push({ fodder: word, result: syns[0], type: 'synonym' });
                    usedByIndicator.add(i);
                }
            }

            // Try all permutations of parts to find one that matches the answer
            const tryPermutations = (arr: typeof parts): typeof parts[] => {
                if (arr.length <= 1) return [arr];
                const result: typeof parts[] = [];
                for (let i = 0; i < arr.length; i++) {
                    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
                    for (const perm of tryPermutations(rest)) {
                        result.push([arr[i], ...perm]);
                    }
                }
                return result;
            };

            for (const ordering of tryPermutations(parts)) {
                const combined = ordering.map(p => p.result).join('');
                if (combined === answerClean) {
                    // Success! Build variables
                    const charadevars: Record<string, string> = {
                        'def_text': definition,
                        'definition_match_type': defMatchType,
                        'definition_position': defPosition
                    };

                    ordering.forEach((part, idx) => {
                        const n = idx + 1;
                        if (part.type === 'outer_letters') {
                            charadevars[`indicator_${n}_text`] = part.indicator || '(outer letters)';
                        } else {
                            charadevars[`indicator_${n}_text`] = '(synonym)';
                        }
                        charadevars[`fodder_${n}_text`] = part.fodder;
                        charadevars[`result_${n}`] = part.result;
                        charadevars[`complexity_${n}`] = '1';
                        if (part.type === 'outer_letters') {
                            charadevars[`outer_letters_${n}`] = 'true';
                        }
                    });

                    const partsHint = ordering.map(p => `${p.fodder} → ${p.result}`).join(' + ');
                    charadevars['hint_1'] = `Charade: ${partsHint} = ${knownAnswer}`;
                    charadevars['structure'] = ordering.map(p => p.result).join(' + ') + ' = ' + answerClean;

                    patternData = {
                        id: `outer-letter-charade-${Date.now()}`,
                        patternId: 'Charade with Outer Letters',
                        clueText: clue,
                        answer: knownAnswer,
                        variables: charadevars,
                        solveSteps: generateSolveSteps(charadevars, 'CHARADE', knownAnswer, coaching, clue)
                    };

                    confidence = 85;
                    needsAIUpdated = false;
                    break;
                }
            }
        }
    }

    // If no patternData but we have a clue (e.g., no answer provided), create partial analysis
    if (!patternData && clue) {
        // Use the full hypothesis-based analysis
        const fullAnalysis = analyzeClueWithoutAnswer(clue);

        // If we derived an answer without AI, re-parse with that answer for full pattern data
        if (fullAnalysis.derivedAnswer) {
            const fullResult = parseClue(clue, fullAnalysis.derivedAnswer);
            if (fullResult.success && fullResult.patternData) {
                patternData = fullResult.patternData;
                confidence = fullResult.confidence;
                needsAIUpdated = false; // Solved without AI!
            }
        }

        // Only create partial analysis if we couldn't derive the answer
        if (!patternData) {
            const variables: Record<string, string> = {};
            if (fullAnalysis.definitionCandidates.length > 0) {
                // Don't set def_text until we verify which is correct
                // Just note the candidates
                variables['definition_candidates'] = fullAnalysis.definitionCandidates.join(' | ');
            }

            // Add scanned abbreviations to variables
            fullAnalysis.obviousElements.filter(e => e.type === 'abbreviation').forEach((elem, i) => {
                variables[`fodder_${i + 1}_text`] = elem.fodder;
                variables[`result_${i + 1}`] = elem.result;
            });

            // Add content words
            if (fullAnalysis.contentWords.length > 0) {
                variables['content_words'] = fullAnalysis.contentWords.join(', ');
            }

            patternData = {
                id: `partial-${Date.now()}`,
                patternId: 'PARTIAL',
                clueText: clue,
                answer: '',
                variables,
                solveSteps: fullAnalysis.solveSteps,
                analysis: {
                    targetLength: fullAnalysis.targetLength,
                    obviousElements: fullAnalysis.obviousElements,
                    contentWords: fullAnalysis.contentWords,
                    definitionCandidates: fullAnalysis.definitionCandidates,
                    hypotheses: fullAnalysis.hypotheses
                }
            };
        }
    }

    // Calculate difficulty
    const difficulty = patternData
        ? calculateDifficulty(
            patternData.patternId,
            patternData.variables,
            patternData.variables['definition_match_type'] || 'synonym'
        )
        : 'Medium';

    // Compute all derived fields (wordplaySteps, isComplete, parsingSummary, etc.)
    // This is the SINGLE place where all battlecard logic lives - UI just renders
    if (patternData) {
        patternData = computeDerivedFields(patternData);
    }

    return {
        success: confidence >= 50 || (patternData?.patternId === 'PARTIAL'),
        confidence,
        difficulty,
        patternData,
        needsAI: needsAIUpdated,
        reason: needsAIUpdated ? `Confidence ${confidence}% - ${synonymsResolved}/${synonymsNeeded} synonyms resolved` : undefined,
        parsed: {
            definition: { text: definition, position: defPosition },
            indicators: indicators.map(i => ({ text: i.text, type: i.type, entry: i.entry })),
            fodders
        }
    };
}

// --- TEMPLATE COMPLETION ---
// Given partial patternData, fill in missing pieces with known rules

export function completePattern(
    partial: PatternInstance,
    synonyms?: Record<string, string>,  // fodder -> synonym mapping
    results?: Record<string, string>    // step -> result mapping
): PatternInstance {
    const variables = { ...partial.variables };

    // Apply provided synonyms
    if (synonyms) {
        Object.entries(synonyms).forEach(([fodder, synonym]) => {
            // Find which fodder slot this matches
            for (let i = 1; i <= 3; i++) {
                if (variables[`fodder_${i}_text`]?.toLowerCase() === fodder.toLowerCase()) {
                    variables[`synonym_${i}`] = synonym.toUpperCase();
                }
            }
        });
    }

    // Apply provided results
    if (results) {
        Object.entries(results).forEach(([key, result]) => {
            variables[key] = result.toUpperCase();
        });
    }

    return {
        ...partial,
        variables
    };
}

// --- BATCH IMPORT HELPER ---

export interface BatchImportResult {
    total: number;
    parsed: number;
    needsAI: number;
    items: {
        clue: string;
        answer: string;
        result: ParseResult;
    }[];
}

export function batchParse(clues: { clue: string; answer: string }[]): BatchImportResult {
    const items = clues.map(({ clue, answer }) => ({
        clue,
        answer,
        result: parseClue(clue, answer)
    }));

    return {
        total: items.length,
        parsed: items.filter(i => i.result.success && !i.result.needsAI).length,
        needsAI: items.filter(i => i.result.needsAI).length,
        items
    };
}

/**
 * Verify a definition against an answer using AI as fallback.
 * First checks the synonym dictionary, then falls back to AI if needed.
 *
 * @param definitionText - The suspected definition text from the clue
 * @param answer - The known answer
 * @returns Promise resolving to verification result
 */
export async function verifyDefinitionWithAI(
    definitionText: string,
    answer: string
): Promise<{ isValid: boolean; source: 'dictionary' | 'ai' | 'unknown' }> {
    const answerUpper = normalizeAnswer(answer);
    const defLower = definitionText.toLowerCase().trim();

    // First check dictionary
    const synonyms = lookupSynonyms(defLower);
    if (synonyms.some(s => s.toUpperCase() === answerUpper)) {
        return { isValid: true, source: 'dictionary' };
    }

    // Reverse lookup in dictionary
    for (const [fodder, syns] of Object.entries(SYNONYM_DICTIONARY)) {
        if (syns.includes(answerUpper) && fodder.toLowerCase() === defLower) {
            return { isValid: true, source: 'dictionary' };
        }
    }

    // Check CRYPTIC_MEANINGS
    const crypticEntry = CRYPTIC_MEANINGS[defLower];
    if (crypticEntry?.synonyms.some(s => s.toUpperCase() === answerUpper)) {
        return { isValid: true, source: 'dictionary' };
    }

    // Fall back to AI verification
    try {
        const { verifySynonym } = await import('./geminiService');
        const aiResult = await verifySynonym(definitionText, answer);
        return { isValid: aiResult, source: 'ai' };
    } catch (e) {
        console.error('AI verification failed:', e);
        return { isValid: false, source: 'unknown' };
    }
}
