/**
 * Common cryptic abbreviations that solvers should recognize immediately.
 * Maps abbreviation result (uppercase) to fodder phrases (lowercase).
 *
 * Usage: OBVIOUS_ABBREVIATIONS['M'] returns ['months', 'month', 'thousand', ...]
 */

export const OBVIOUS_ABBREVIATIONS: Record<string, string[]> = {
    // Single letters
    'A': ['a', 'an', 'one', 'ace', 'first'],
    'B': ['born', 'book', 'black', 'bishop'],
    'C': ['century', 'cold', 'carbon', 'circa', 'hundred'],
    'D': ['day', 'daughter', 'died', 'penny', 'five hundred', 'dee'],  // dee = the letter D
    'E': ['east', 'english', 'energy', 'eastern'],
    'H': ['henry', 'hospital', 'hot', 'hard', 'hour', 'husband', 'hydrogen'],
    'I': ['one', 'island', 'iodine', 'current'],
    'L': ['left', 'large', 'lake', 'latin', 'learner', 'fifty'],
    'M': ['months', 'month', 'thousand', 'meters', 'male', 'married'],
    'N': ['north', 'nitrogen', 'noon', 'number', 'name'],
    'O': ['love', 'zero', 'old', 'oxygen', 'over', 'nothing', 'nil', 'nought', 'duck'],
    'P': ['page', 'piano', 'quiet', 'parking'],
    'R': ['right', 'river', 'king', 'queen', 'runs'],
    'S': ['south', 'second', 'small', 'son', 'saint'],
    'T': ['time', 'ton', 'temperature'],
    'V': ['five', 'versus', 'volt', 'very'],
    'W': ['west', 'with', 'wife', 'western', 'women'],
    'X': ['ten', 'times', 'kiss', 'unknown'],

    // Multi-letter common abbreviations
    'AC': ['account', 'alternating current'],
    'AD': ['advertisement', 'anno domini', 'notice'],
    'AH': ['hesitation', 'exclamation'],
    'AI': ['artificial intelligence'],
    'AM': ['morning', 'before noon'],
    'DO': ['party', 'function', 'event', 'bash'],
    'DR': ['doctor', 'drive'],
    'ENT': ['hospital department', 'ear nose throat', 'ear, nose and throat'],
    'ER': ['hesitation', 'emergency room'],
    'IT': ['information technology'],
    'MB': ['medic', 'doctor'],
    'MD': ['doctor', 'physician'],
    'MO': ['medical officer', 'doctor'],
    'OR': ['operating room', 'gold'],
    'PM': ['afternoon', 'evening'],
    'RD': ['road'],
    'RE': ['about', 'concerning', 'regarding'],
    'SM': ['aggressive-submissive proclivity', 'sadomasochism'],
    'ST': ['street', 'saint'],
    'UM': ['hesitation'],

    // Self-referential editorial (common in Times)
    'HERE': ['in the times', 'in this paper', 'in this place', 'at this point'],

    // Foreign articles (common in cryptic clues)
    'DAS': ['the german', 'german the'],
    'DER': ['the german', 'german the'],
    'DIE': ['the german', 'german the'],
    'EL': ['the spanish', 'spanish the'],
    'IL': ['the italian', 'italian the'],
    'LA': ['the french', 'french the', 'the in french'],
    'LE': ['the french', 'french the', 'in french the', 'the in french', 'in french, the', 'french, the'],
    'LES': ['the french', 'french the'],
    'UN': ['a french', 'french a', 'one french'],
    'UNE': ['a french', 'french a'],

    // Professional/expert abbreviations
    'PRO': ['expert', 'professional', 'for'],
};

/**
 * Check if a fodder->result mapping is an "obvious" abbreviation.
 */
export function isObviousAbbreviation(fodder: string, result: string): boolean {
    const fodderLower = fodder.toLowerCase();
    const resultUpper = result.toUpperCase();

    const abbrevFodders = OBVIOUS_ABBREVIATIONS[resultUpper];
    if (abbrevFodders) {
        return abbrevFodders.some(f => fodderLower.includes(f));
    }
    return false;
}

/**
 * Check if result is a direct/obvious transformation (not requiring synonym knowledge).
 */
export function isObviousTransformation(fodder: string, result: string, operation?: string): boolean {
    // Abbreviations are obvious
    if (isObviousAbbreviation(fodder, result)) return true;

    // Single letter extractions with operation hints are obvious
    if (result.length === 1 && operation) return true;

    // Very short results from common abbreviation fodders
    if (result.length <= 3 && isObviousAbbreviation(fodder, result)) return true;

    return false;
}
