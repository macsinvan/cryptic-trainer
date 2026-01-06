/**
 * Homophone pairs for cryptic crossword parsing.
 * Maps words to their sound-alike alternatives.
 *
 * Usage: HOMOPHONE_PAIRS['STOW'] returns ['STOWE']
 */

export const HOMOPHONE_PAIRS: Record<string, string[]> = {
    // Knight/Night group
    'NIGHT': ['KNIGHT'],
    'KNIGHT': ['NIGHT'],

    // Right/Write/Rite group
    'RIGHT': ['WRITE', 'RITE'],
    'WRITE': ['RIGHT', 'RITE'],
    'RITE': ['RIGHT', 'WRITE'],

    // Air/Heir/Ere/Err group
    'AIR': ['HEIR', 'ERE', 'ERR'],
    'HEIR': ['AIR'],
    'ERE': ['AIR'],
    'ERR': ['AIR'],

    // Hear/Here
    'HEAR': ['HERE'],
    'HERE': ['HEAR'],

    // Sale/Sail
    'SALE': ['SAIL'],
    'SAIL': ['SALE'],

    // Tale/Tail
    'TALE': ['TAIL'],
    'TAIL': ['TALE'],

    // Male/Mail
    'MALE': ['MAIL'],
    'MAIL': ['MALE'],

    // Pale/Pail
    'PALE': ['PAIL'],
    'PAIL': ['PALE'],

    // Bill/Build (homophone in some accents)
    'BILL': ['BUILD'],
    'BUILD': ['BILL'],

    // Stow/Stowe
    'STOW': ['STOWE'],
    'STOWE': ['STOW'],

    // New/Knew/Gnu
    'NEW': ['KNEW', 'GNU'],
    'KNEW': ['NEW', 'GNU'],
    'GNU': ['NEW', 'KNEW'],

    // Flour/Flower
    'FLOUR': ['FLOWER'],
    'FLOWER': ['FLOUR'],

    // Meat/Meet
    'MEAT': ['MEET'],
    'MEET': ['MEAT'],

    // Wait/Weight
    'WAIT': ['WEIGHT'],
    'WEIGHT': ['WAIT'],

    // Eight/Ate
    'EIGHT': ['ATE'],
    'ATE': ['EIGHT'],

    // Suite/Sweet
    'SUITE': ['SWEET'],
    'SWEET': ['SUITE'],

    // Sight/Site/Cite
    'SIGHT': ['SITE', 'CITE'],
    'SITE': ['SIGHT', 'CITE'],
    'CITE': ['SIGHT', 'SITE'],

    // Letter homophones (See/Sea/C, Bee/Be/B, etc.)
    'SEE': ['SEA', 'C'],
    'SEA': ['SEE', 'C'],
    'C': ['SEE', 'SEA'],

    'BEE': ['BE', 'B'],
    'BE': ['BEE', 'B'],
    'B': ['BEE', 'BE'],

    'TEA': ['TEE', 'T'],
    'TEE': ['TEA', 'T'],
    'T': ['TEA', 'TEE'],

    'YOU': ['EWE', 'U'],
    'EWE': ['YOU', 'U'],
    'U': ['YOU', 'EWE'],

    // Peace/Piece
    'PIECE': ['PEACE'],
    'PEACE': ['PIECE'],

    // Fair/Fare
    'FAIR': ['FARE'],
    'FARE': ['FAIR'],

    // Bare/Bear
    'BARE': ['BEAR'],
    'BEAR': ['BARE'],

    // Pair/Pear/Pare
    'PAIR': ['PEAR', 'PARE'],
    'PEAR': ['PAIR', 'PARE'],
    'PARE': ['PAIR', 'PEAR'],

    // Board/Bored
    'BOARD': ['BORED'],
    'BORED': ['BOARD'],

    // Course/Coarse
    'COURSE': ['COARSE'],
    'COARSE': ['COURSE'],
};

/**
 * Look up homophones for a word.
 * @param word - The word to look up (case-insensitive)
 * @returns Array of homophone alternatives, or empty array if none found
 */
export function lookupHomophones(word: string): string[] {
    return HOMOPHONE_PAIRS[word.toUpperCase()] || [];
}
