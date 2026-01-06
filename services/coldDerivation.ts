/**
 * Cold Derivation Strategies
 *
 * These functions attempt to derive cryptic crossword answers
 * WITHOUT knowing the answer - using only:
 * - Standard abbreviations (OBVIOUS_ABBREVIATIONS)
 * - Indicator words (INDICATOR_DICTIONARY)
 * - Synonym lookups (SYNONYM_DICTIONARY)
 * - Homophone pairs (HOMOPHONE_PAIRS)
 *
 * Each strategy returns a derived answer if successful, or null if not.
 */

import { lookupSynonyms, STANDALONE_SYNONYMS } from '../data/synonymDictionary';
import { OBVIOUS_ABBREVIATIONS } from '../data/abbreviationDictionary';
import { HOMOPHONE_PAIRS } from '../data/homophoneDictionary';
import { OperationType } from '../data/indicatorDictionary';
import { normalizeWord, normalizeAnswer } from './parserHelpers';

/**
 * Context passed to each derivation strategy
 */
export interface DerivationContext {
    targetLength: number;
    defCandidate: string;
    defSynonyms: string[];
    clueText: string;
    words: string[];
    detectedOperations: Array<{
        indicator: string;
        type: OperationType;
        fodder?: string;
        indicatorIdx: number;
        fodderIdx?: number;
    }>;
    abbreviations: Array<{ fodder: string; result: string; type: string }>;
    knownComponents: string[];
    unknownFodder: string[];
}

/**
 * Result from a derivation strategy
 */
export interface DerivationResult {
    answer: string;
    definition: string;
}

/**
 * Verify a candidate answer against definition synonyms.
 */
export function verifyAgainstDefinition(
    candidate: string,
    defCandidate: string,
    defSynonyms: string[]
): boolean {
    const candidateClean = normalizeAnswer(candidate);
    return defSynonyms.some(ds => {
        const dsClean = normalizeAnswer(ds);
        return dsClean === candidateClean;
    });
}

/**
 * Try HIDDEN WORD derivation.
 * Slides a window of targetLength through fodder text to find hidden answer.
 */
export function tryHiddenWordDerivation(ctx: DerivationContext): DerivationResult | null {
    const hiddenOp = ctx.detectedOperations.find(op => op.type === 'hidden');
    if (!hiddenOp) return null;

    const indicatorLower = hiddenOp.indicator.toLowerCase();
    const indicatorPos = ctx.clueText.toLowerCase().indexOf(indicatorLower);
    if (indicatorPos === -1) return null;

    // Get text after and before the indicator
    const afterIndicator = ctx.clueText
        .substring(indicatorPos + hiddenOp.indicator.length)
        .replace(/\s*\([0-9,\-]+\)\s*$/, '')
        .trim();
    const beforeIndicator = ctx.clueText.substring(0, indicatorPos).trim();

    const fodderOptions = [afterIndicator, beforeIndicator].filter(f => f.length > 0);

    for (const fodderText of fodderOptions) {
        const letters = fodderText.replace(/[^a-zA-Z]/g, '').toUpperCase();

        for (let i = 0; i <= letters.length - ctx.targetLength; i++) {
            const candidate = letters.substring(i, i + ctx.targetLength);

            if (verifyAgainstDefinition(candidate, ctx.defCandidate, ctx.defSynonyms)) {
                return { answer: candidate, definition: ctx.defCandidate };
            }
        }
    }

    return null;
}

/**
 * Try DELETION derivation.
 * Gets synonyms for fodder and removes first/last letters.
 */
export function tryDeletionDerivation(ctx: DerivationContext): DerivationResult | null {
    const deletionOp = ctx.detectedOperations.find(op =>
        op.type === 'deletion_first' || op.type === 'deletion_last' || op.type === 'deletion'
    );
    if (!deletionOp) return null;

    // Get fodder - words NOT part of definition
    const defWordsLower = ctx.defCandidate.toLowerCase().split(/\s+/);
    const fodderWords = ctx.words.filter(w => {
        const wLower = normalizeWord(w);
        return !defWordsLower.includes(wLower) &&
               wLower !== normalizeWord(deletionOp.indicator);
    });

    for (const fodder of fodderWords) {
        const fodderSyns = lookupSynonyms(normalizeWord(fodder));

        for (const syn of fodderSyns) {
            const synUpper = syn.toUpperCase();

            // Try removing first letter
            if (deletionOp.type === 'deletion_first' || deletionOp.type === 'deletion') {
                const withoutFirst = synUpper.substring(1);
                if (withoutFirst.length === ctx.targetLength &&
                    verifyAgainstDefinition(withoutFirst, ctx.defCandidate, ctx.defSynonyms)) {
                    return { answer: withoutFirst, definition: ctx.defCandidate };
                }
            }

            // Try removing last letter
            if (deletionOp.type === 'deletion_last' || deletionOp.type === 'deletion') {
                const withoutLast = synUpper.substring(0, synUpper.length - 1);
                if (withoutLast.length === ctx.targetLength &&
                    verifyAgainstDefinition(withoutLast, ctx.defCandidate, ctx.defSynonyms)) {
                    return { answer: withoutLast, definition: ctx.defCandidate };
                }
            }
        }
    }

    return null;
}

/**
 * Try HOMOPHONE derivation.
 * Gets synonyms for fodder and looks up homophone pairs.
 */
export function tryHomophoneDerivation(ctx: DerivationContext): DerivationResult | null {
    const homophoneOp = ctx.detectedOperations.find(op => op.type === 'homophone');
    if (!homophoneOp || !homophoneOp.fodder) return null;

    const fodderSyns = lookupSynonyms(normalizeWord(homophoneOp.fodder));

    for (const syn of fodderSyns) {
        const synUpper = syn.toUpperCase();
        const homophones = HOMOPHONE_PAIRS[synUpper];

        if (homophones) {
            for (const homophone of homophones) {
                // Direct match
                if (homophone.length === ctx.targetLength &&
                    verifyAgainstDefinition(homophone, ctx.defCandidate, ctx.defSynonyms)) {
                    return { answer: homophone, definition: ctx.defCandidate };
                }

                // Homophone + charade combination
                if (homophone.length < ctx.targetLength) {
                    const remainingLen = ctx.targetLength - homophone.length;
                    const defWords = ctx.defCandidate.toLowerCase().split(/\s+/);

                    // Try combining with ALL clue words (not just unconsumed)
                    // because charade parts might be consumed as fodder elsewhere
                    for (const word of ctx.words) {
                        const wordClean = normalizeWord(word);
                        if (defWords.some(dw => dw === wordClean)) continue;
                        if (wordClean.length < 2) continue;

                        const wordSyns = lookupSynonyms(wordClean);
                        for (const wordSyn of wordSyns) {
                            if (wordSyn.length === remainingLen) {
                                // Try both orders
                                const combined1 = (homophone + wordSyn).toUpperCase();
                                const combined2 = (wordSyn + homophone).toUpperCase();
                                const combined1Space = homophone + ' ' + wordSyn.toUpperCase();
                                const combined2Space = wordSyn.toUpperCase() + ' ' + homophone;

                                // Check both with and without space
                                const defSynsNorm = ctx.defSynonyms.map(ds => ds.toUpperCase().replace(/\s+/g, ''));

                                if (defSynsNorm.includes(combined1) ||
                                    verifyAgainstDefinition(combined1Space, ctx.defCandidate, ctx.defSynonyms)) {
                                    return { answer: combined1Space, definition: ctx.defCandidate };
                                }
                                if (defSynsNorm.includes(combined2) ||
                                    verifyAgainstDefinition(combined2Space, ctx.defCandidate, ctx.defSynonyms)) {
                                    return { answer: combined2Space, definition: ctx.defCandidate };
                                }
                            }
                        }
                    }
                }
            }
        }

        // Check for near-homophones (add/remove E pattern)
        if (syn.length + 1 === ctx.targetLength) {
            const withE = synUpper + 'E';
            if (verifyAgainstDefinition(withE, ctx.defCandidate, ctx.defSynonyms)) {
                return { answer: withE, definition: ctx.defCandidate };
            }
        }
        if (synUpper.endsWith('E') && synUpper.length - 1 === ctx.targetLength) {
            const withoutE = synUpper.slice(0, -1);
            if (verifyAgainstDefinition(withoutE, ctx.defCandidate, ctx.defSynonyms)) {
                return { answer: withoutE, definition: ctx.defCandidate };
            }
        }
    }

    return null;
}

/**
 * Try CONTAINER assembly derivation.
 * Inserts inner component inside outer container at each position.
 */
export function tryContainerDerivation(ctx: DerivationContext): DerivationResult | null {
    if (!ctx.detectedOperations.some(op => op.type === 'container')) return null;

    // Gather outer candidates from operation fodder and unknownFodder
    const outerCandidates: string[] = [];
    const innerCandidates: string[] = [...ctx.knownComponents];

    // Get synonyms of operation fodder as outer candidates
    for (const op of ctx.detectedOperations) {
        if (op.fodder) {
            const syns = lookupSynonyms(op.fodder.toLowerCase());
            outerCandidates.push(...syns);
        }
    }

    // Also try unknownFodder
    for (const fodder of ctx.unknownFodder) {
        const syns = lookupSynonyms(fodder.toLowerCase());
        outerCandidates.push(...syns);
    }

    // Add detected abbreviations as inners
    for (const elem of ctx.abbreviations) {
        if (elem.result && !innerCandidates.includes(elem.result)) {
            innerCandidates.push(elem.result);
        }
    }

    // Also add 2+ letter abbreviations as potential outers
    for (const elem of ctx.abbreviations) {
        if (elem.result && elem.result.length >= 2 && !outerCandidates.includes(elem.result)) {
            outerCandidates.push(elem.result);
        }
    }

    // Check operation fodder for obvious abbreviations as inner candidates
    const operationFodder: string[] = ctx.detectedOperations
        .filter(op => op.fodder)
        .map(op => op.fodder!);

    for (const fodder of operationFodder) {
        const fodderLower = fodder.toLowerCase();
        for (const [abbrev, fodders] of Object.entries(OBVIOUS_ABBREVIATIONS)) {
            if (fodders.some(f => f.toLowerCase() === fodderLower)) {
                if (!innerCandidates.includes(abbrev)) {
                    innerCandidates.push(abbrev);
                }
            }
        }
    }

    // Check if fodder words give short synonyms (≤2 letters) that could be inner
    for (const fodder of [...operationFodder, ...ctx.unknownFodder]) {
        const syns = lookupSynonyms(fodder.toLowerCase());
        for (const syn of syns) {
            if (syn.length <= 2 && !innerCandidates.includes(syn)) {
                innerCandidates.push(syn);
            }
        }
    }

    // Build combined inners (pairs concatenated)
    const combinedInners: string[] = [...innerCandidates];
    for (let i = 0; i < innerCandidates.length; i++) {
        for (let j = 0; j < innerCandidates.length; j++) {
            if (i !== j) {
                const combined = innerCandidates[i] + innerCandidates[j];
                if (!combinedInners.includes(combined)) {
                    combinedInners.push(combined);
                }
            }
        }
    }

    // Try inserting inner at each position in outer
    for (const outer of outerCandidates) {
        const outerClean = outer.replace(/[^A-Z]/gi, '').toUpperCase();

        for (const inner of combinedInners) {
            const innerClean = inner.replace(/[^A-Z]/gi, '').toUpperCase();

            for (let pos = 1; pos < outerClean.length; pos++) {
                const assembled = outerClean.slice(0, pos) + innerClean + outerClean.slice(pos);

                if (assembled.length === ctx.targetLength &&
                    verifyAgainstDefinition(assembled, ctx.defCandidate, ctx.defSynonyms)) {
                    return { answer: assembled, definition: ctx.defCandidate };
                }
            }
        }
    }

    return null;
}

/**
 * Try REVERSAL + CONTAINER derivation.
 * Reverses outer container, then inserts inner.
 */
export function tryReversalContainerDerivation(ctx: DerivationContext): DerivationResult | null {
    const hasReversal = ctx.detectedOperations.some(op => op.type === 'reversal');
    const hasContainer = ctx.detectedOperations.some(op => op.type === 'container');
    if (!hasReversal || !hasContainer) return null;

    // Same setup as container derivation
    const outerCandidates: string[] = [];
    const innerCandidates: string[] = [...ctx.knownComponents];

    for (const op of ctx.detectedOperations) {
        if (op.fodder) {
            const syns = lookupSynonyms(op.fodder.toLowerCase());
            outerCandidates.push(...syns);
        }
    }

    for (const fodder of ctx.unknownFodder) {
        const syns = lookupSynonyms(fodder.toLowerCase());
        outerCandidates.push(...syns);
    }

    for (const elem of ctx.abbreviations) {
        if (elem.result && !innerCandidates.includes(elem.result)) {
            innerCandidates.push(elem.result);
        }
    }

    // Check operation fodder for obvious abbreviations as inner candidates
    const operationFodder: string[] = ctx.detectedOperations
        .filter(op => op.fodder)
        .map(op => op.fodder!);

    for (const fodder of operationFodder) {
        const fodderLower = fodder.toLowerCase();
        for (const [abbrev, fodders] of Object.entries(OBVIOUS_ABBREVIATIONS)) {
            if (fodders.some(f => f.toLowerCase() === fodderLower)) {
                if (!innerCandidates.includes(abbrev)) {
                    innerCandidates.push(abbrev);
                }
            }
        }
    }

    // Check if fodder words give short synonyms (≤2 letters) that could be inner
    for (const fodder of [...operationFodder, ...ctx.unknownFodder]) {
        const syns = lookupSynonyms(fodder.toLowerCase());
        for (const syn of syns) {
            if (syn.length <= 2 && !innerCandidates.includes(syn)) {
                innerCandidates.push(syn);
            }
        }
    }

    // Build combined inners
    const combinedInners: string[] = [...innerCandidates];
    for (let i = 0; i < innerCandidates.length; i++) {
        for (let j = 0; j < innerCandidates.length; j++) {
            if (i !== j) {
                const combined = innerCandidates[i] + innerCandidates[j];
                if (!combinedInners.includes(combined)) {
                    combinedInners.push(combined);
                }
            }
        }
    }

    // Try reversed outer gripping inner
    for (const outer of outerCandidates) {
        const outerClean = outer.replace(/[^A-Z]/gi, '').toUpperCase();
        const outerReversed = outerClean.split('').reverse().join('');

        for (const inner of combinedInners) {
            const innerClean = inner.replace(/[^A-Z]/gi, '').toUpperCase();

            for (let pos = 1; pos < outerReversed.length; pos++) {
                const assembled = outerReversed.slice(0, pos) + innerClean + outerReversed.slice(pos);

                if (assembled.length === ctx.targetLength &&
                    verifyAgainstDefinition(assembled, ctx.defCandidate, ctx.defSynonyms)) {
                    return { answer: assembled, definition: ctx.defCandidate };
                }
            }
        }
    }

    return null;
}

/**
 * Try ANAGRAM + REVERSAL combination derivation.
 * Anagrams one fodder and reverses another, then combines.
 */
export function tryAnagramReversalDerivation(ctx: DerivationContext): DerivationResult | null {
    const anagramOp = ctx.detectedOperations.find(op => op.type === 'anagram');
    const reversalOp = ctx.detectedOperations.find(op => op.type === 'reversal');
    if (!anagramOp || !reversalOp) return null;

    // Find short word before reversal indicator as reversal fodder
    const reversalIdx = reversalOp.indicatorIdx;
    let reversalFodder = '';

    if (reversalIdx > 0) {
        const prevWord = ctx.words[reversalIdx - 1];
        if (prevWord && prevWord.length <= 3) {
            reversalFodder = normalizeAnswer(prevWord);
        }
    }

    if (!reversalFodder) return null;

    // Collect anagram fodder - words between definition and anagram indicator
    // Filter out common function words that aren't part of the anagram
    const defWordsCount = ctx.defCandidate.split(/\s+/).length;
    const anagramIdx = anagramOp.indicatorIdx;
    const skipWords = new Set(['from', 'of', 'the', 'a', 'an']);

    let anagramFodder = '';
    for (let i = defWordsCount; i < anagramIdx; i++) {
        const word = ctx.words[i];
        if (word) {
            const wordLower = normalizeWord(word);
            if (!skipWords.has(wordLower)) {
                anagramFodder += normalizeAnswer(word);
            }
        }
    }

    if (!anagramFodder) return null;

    // Target: anagram of anagramFodder + reversed reversalFodder = targetLength
    const reversedPart = reversalFodder.split('').reverse().join('');
    const anagramPartLength = ctx.targetLength - reversedPart.length;

    if (anagramPartLength <= 0 || anagramFodder.length !== anagramPartLength) return null;

    // Check if anagram of anagramFodder + reversedPart is a definition synonym
    const sortedAnagramFodder = anagramFodder.split('').sort().join('');

    for (const defSyn of ctx.defSynonyms) {
        const defSynClean = normalizeAnswer(defSyn);
        if (defSynClean.length !== ctx.targetLength) continue;

        // Check if it ends with the reversed part (anagram + reversed)
        if (defSynClean.endsWith(reversedPart)) {
            const firstPart = defSynClean.slice(0, anagramPartLength);
            const sortedFirstPart = firstPart.split('').sort().join('');

            if (sortedFirstPart === sortedAnagramFodder) {
                return { answer: defSynClean, definition: ctx.defCandidate };
            }
        }

        // Also check if it starts with the reversed part (reversed + anagram)
        if (defSynClean.startsWith(reversedPart)) {
            const lastPart = defSynClean.slice(reversedPart.length);
            const sortedLastPart = lastPart.split('').sort().join('');

            if (sortedLastPart === sortedAnagramFodder) {
                return { answer: defSynClean, definition: ctx.defCandidate };
            }
        }
    }

    return null;
}

/**
 * Run all derivation strategies in order.
 * Returns the first successful result.
 */
export function runDerivationStrategies(ctx: DerivationContext): DerivationResult | null {
    // Strategy order matters - simpler patterns first

    // 1. Hidden word (very reliable when indicator present)
    let result = tryHiddenWordDerivation(ctx);
    if (result) return result;

    // 2. Deletion (straightforward when indicator present)
    result = tryDeletionDerivation(ctx);
    if (result) return result;

    // 3. Homophone (including homophone + charade)
    result = tryHomophoneDerivation(ctx);
    if (result) return result;

    // 4. Container (inner inside outer)
    result = tryContainerDerivation(ctx);
    if (result) return result;

    // 5. Reversal + Container
    result = tryReversalContainerDerivation(ctx);
    if (result) return result;

    // 6. Anagram + Reversal
    result = tryAnagramReversalDerivation(ctx);
    if (result) return result;

    return null;
}
