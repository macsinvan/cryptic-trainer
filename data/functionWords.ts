/**
 * Common function words in cryptic clues.
 * These are typically indicators or connectors, not content fodder.
 */

import { INDICATOR_DICTIONARY } from './indicatorDictionary';

/**
 * Function words - grammatical words that don't carry lexical meaning.
 * These are typically NOT fodder for wordplay.
 */
export const FUNCTION_WORDS = new Set([
    'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'and', 'or', 'but',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'do', 'does', 'did',
    'this', 'that', 'these', 'those', 'it', 'its', 'from', 'into', 'about', 'as', 'up', 'down'
]);

/**
 * Indicator words - derived from INDICATOR_DICTIONARY keys.
 * These signal wordplay operations, not content.
 *
 * Note: This is dynamically built from INDICATOR_DICTIONARY to ensure consistency.
 * Additional words not in the dictionary can be added to the Set below.
 */
export const INDICATOR_WORDS: Set<string> = new Set([
    // Derived from INDICATOR_DICTIONARY keys
    ...Object.keys(INDICATOR_DICTIONARY).map(k => k.toLowerCase()),

    // Additional indicator words not in INDICATOR_DICTIONARY
    // (these may be variations or less common forms)
    // Movement/time
    'delay', 'delayed', 'late', 'later', 'early', 'earlier',
    'moving', 'moved', 'shifting', 'shifted', 'changing', 'changed',
    'turning', 'turned', 'becoming', 'becomes',
    // Reversal
    'contrarily', 'oppositely', 'opposite',
    // Letter position
    'lastly', 'firstly', 'primarily',
    // General modifiers
    'oddly', 'strangely', 'unusually',
    // Homophone (single word forms of multi-word indicators)
    'sounds', 'heard', 'spoken', 'said', 'vocal', 'audibly', 'reported', 'reportedly',
    'delivered', 'orally', 'aloud', 'voiced', 'broadcast', 'announced',
    // Container
    'around', 'surrounding', 'outside', 'embracing', 'holding', 'embodied', 'embodying',
    'bringing', 'carries', 'carrying', 'contains', 'containing', 'houses', 'housing',
    'includes', 'including', 'keeps', 'keeping', 'gripping', 'clasping', 'boarding',
    'conceals', 'concealing', 'hides', 'hiding', 'covers', 'covering', 'wraps', 'wrapping',
    // Deletion/truncation
    'losing', 'lost', 'without', 'missing', 'dropping', 'dropped',
    'briefly', 'shortly', 'almost', 'nearly', 'mostly',
    // Hidden
    'hidden', 'hiding', 'within', 'inside', 'contained',
    // Anagram
    'broken', 'mixed', 'confused', 'crazy', 'wild', 'upset', 'troubled',
    'arranged', 'rearranged', 'sorted', 'ordered', 'shuffled', 'abroad', 'funny', 'odd',
    // Reversal
    'back', 'backward', 'backwards', 'returned', 'reversed', 'reflected', 'flipping', 'flipped',
    'contrary',
    // Position
    'following', 'after', 'before', 'behind', 'ahead', 'over', 'under',
    'initially', 'finally', 'first', 'last', 'start', 'end', 'beginning', 'ending',
    'ultimately',
]);

/**
 * Check if a word is a function word.
 */
export function isFunctionWord(word: string): boolean {
    return FUNCTION_WORDS.has(word.toLowerCase());
}

/**
 * Check if a word is an indicator word.
 */
export function isIndicatorWord(word: string): boolean {
    return INDICATOR_WORDS.has(word.toLowerCase());
}
