/**
 * Shared helper functions for cryptic clue parsing.
 * Centralizes common text normalization and utility operations.
 */

/**
 * Normalize a word to lowercase letters only.
 * Removes all non-letter characters.
 *
 * @example normalizeWord("Hello!") -> "hello"
 * @example normalizeWord("don't") -> "dont"
 */
export function normalizeWord(word: string): string {
    return word.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Normalize a word, also removing possessives ('s, 's).
 * Useful for matching words that may have possessive forms.
 *
 * @example normalizeWithPossessive("doctor's") -> "doctor"
 * @example normalizeWithPossessive("it's") -> "it"
 */
export function normalizeWithPossessive(word: string): string {
    return word.toLowerCase().replace(/['']s?/g, '').replace(/[^a-z]/g, '');
}

/**
 * Clean text for comparison - lowercase, remove punctuation except hyphen/apostrophe.
 *
 * @example cleanText("Hello, World!") -> "hello world"
 */
export function cleanText(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9\s'-]/g, '').trim();
}

/**
 * Remove word count pattern from end of clue.
 * Handles formats: (5), (3,4), (2-4), (3,4,5)
 *
 * @example removeWordCount("Boat staff (5)") -> "Boat staff"
 */
export function removeWordCount(clue: string): string {
    return clue.replace(/\s*\([0-9,\-]+\)\s*$/, '').trim();
}

/**
 * Extract target letter count from clue.
 * Sums all numbers in the word count pattern.
 *
 * @example extractTargetLength("Boat staff (5)") -> 5
 * @example extractTargetLength("Top drawer (3,6)") -> 9
 */
export function extractTargetLength(clue: string): number {
    const match = clue.match(/\((\d+(?:,\d+)*)\)\s*$/);
    if (!match) return 0;
    return match[1].split(',').reduce((sum, n) => sum + parseInt(n), 0);
}

/**
 * Check if a character is a word boundary.
 * Used for matching whole words in clue text.
 */
export function isWordBoundary(char: string): boolean {
    return /[\s,;:'"()\-\?!]/.test(char);
}

/**
 * Normalize answer for comparison - uppercase, letters only.
 *
 * @example normalizeAnswer("BUILD IN") -> "BUILDIN"
 * @example normalizeAnswer("Top-Drawer") -> "TOPDRAWER"
 */
export function normalizeAnswer(answer: string): string {
    return answer.toUpperCase().replace(/[^A-Z]/g, '');
}

/**
 * Get words from clue text, removing word count pattern first.
 * Splits on whitespace and filters empty strings.
 *
 * @example getClueWords("Boat staff (5)") -> ["Boat", "staff"]
 * @example getClueWords("Top drawer (3,6)") -> ["Top", "drawer"]
 */
export function getClueWords(clue: string): string[] {
    return removeWordCount(clue).split(/\s+/).filter(w => w.length > 0);
}
