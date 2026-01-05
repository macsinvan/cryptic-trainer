
import { PatternInstance } from '../types';
import { parseClue, analyzeClueWithoutAnswer, ClueAnalysis } from './clueParser';

/**
 * Normalize text from copy/paste to handle smart quotes, dashes, and special spaces.
 * This is essential because users often paste from Word, websites, or other formatted sources.
 */
function normalizeInputText(text: string): string {
    return text
        // Normalize apostrophes/quotes (smart quotes to straight)
        .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
        // Normalize dashes (en/em dash, minus to hyphen)
        .replace(/[\u2013\u2014\u2015\u2212]/g, '-')
        // Normalize spaces (non-breaking, thin, etc. to regular space)
        .replace(/[\u00A0\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000]/g, ' ')
        // Remove zero-width characters
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
}

/**
 * Parses free-form clue input in natural format:
 *
 * Times Cryptic 29351
 * 3D Principles of theology ordinands now definitely do in monastery (7)
 *
 * Answer/Parsing: TONSURE – first letters (principals) of Theology Ordinands Now, plus SURE (definitely).
 *
 * Coaching (from solve):
 * "Principles = principal (first) letters.
 * Theology Ordinand Now → T O N.
 * Definitely = SURE.
 * TON + SURE → TONSURE (monk's haircut)."
 */

export interface FreeformParseResult {
    success: boolean;
    publication?: string;
    puzzleId?: string;
    clueNumber?: string;
    clueDirection?: 'across' | 'down';
    clueText?: string;
    wordCount?: number;
    answer?: string;
    parsing?: string;
    coaching?: string[];
    patternData?: PatternInstance;
    errors: string[];
    // Special case detection
    specialCase?: {
        type: 'cryptic_definition' | 'insider_knowledge' | 'unusual_structure';
        reason: string;
    };
}

export function parseFreeformInput(input: string, defaultPubId?: string): FreeformParseResult {
    // Normalize input to handle smart quotes, dashes, and special characters from copy/paste
    const normalizedInput = normalizeInputText(input);
    const lines = normalizedInput.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // ============================================================
    // PHASE 1: UP-FRONT VALIDATION (fail fast with clear errors)
    // ============================================================

    // 1a. Check input not empty
    if (lines.length < 1) {
        return {
            success: false,
            errors: [
                'Input is empty.',
                'Expected format:',
                '  3D Clue text here (5)',
                '  Answer: WORD – explanation'
            ]
        };
    }

    // 1b. Find clue schema pattern: text ending with (NUMBER) or (N,N)
    const allText = lines.join('\n');
    const schemaMatches = allText.match(/\(\d+(?:,\d+)*\)/g);

    if (!schemaMatches || schemaMatches.length === 0) {
        return {
            success: false,
            errors: [
                'No clue found. Could not find word count pattern.',
                'Expected: Clue text ending with (5) or (3,4)',
                'Example: "Principles of theology... (7)"',
                '',
                'Your input:',
                lines.slice(0, 3).map(l => `  ${l.substring(0, 50)}${l.length > 50 ? '...' : ''}`).join('\n')
            ]
        };
    }

    if (schemaMatches.length > 1) {
        return {
            success: false,
            errors: [
                'Ambiguous input – found multiple word count patterns.',
                `Found: ${schemaMatches.join(', ')}`,
                'Please provide only one clue at a time.'
            ]
        };
    }

    // 1c. Find answer line
    // Accepts multiple formats:
    //   - "Answer: WORD – explanation"
    //   - "Answer/Parsing: WORD – explanation"
    //   - "WORD – explanation" (direct format, uppercase word + dash)
    let answerLineIdx = lines.findIndex(l =>
        l.toLowerCase().startsWith('answer') ||
        l.toLowerCase().includes('answer/parsing') ||
        l.toLowerCase().includes('answer:')
    );

    // If no "Answer:" line, look for direct format: "WORD – explanation"
    if (answerLineIdx === -1) {
        answerLineIdx = lines.findIndex(l =>
            /^[A-Z]{2,}\s*[–\-—]\s*.+/.test(l)
        );
    }

    // Note: answerLineIdx === -1 means no answer provided yet
    // We'll continue and return partial success if we have a clue

    // 1d. Extract and validate answer (if present)
    const answerLine = answerLineIdx !== -1 ? lines[answerLineIdx] : '';
    let answer = '';
    let parsing = '';

    if (answerLine) {
        // Try "Answer: WORD" format first
        const answerMatch = answerLine.match(/(?:answer(?:\/parsing)?)[:\s]+([A-Z]+)(?:\s*[–\-—]\s*(.+))?/i);
        if (answerMatch) {
            answer = answerMatch[1].toUpperCase();
            parsing = answerMatch[2] || '';
        } else {
            // Try direct format: "WORD – explanation"
            const directMatch = answerLine.match(/^([A-Z]{2,})\s*[–\-—]\s*(.+)/);
            if (directMatch) {
                answer = directMatch[1].toUpperCase();
                parsing = directMatch[2] || '';
            } else {
                // Last resort: extract any uppercase word
                const simpleMatch = answerLine.match(/[:\s]([A-Z]{2,})/);
                if (simpleMatch) {
                    answer = simpleMatch[1];
                }
            }
        }
    }

    // If we have an answer line but couldn't extract the answer, show error
    if (answerLine && !answer) {
        return {
            success: false,
            errors: [
                'Could not extract answer from answer line.',
                `Found line: "${answerLine.substring(0, 60)}${answerLine.length > 60 ? '...' : ''}"`,
                'Expected: "Answer: WORD" where WORD is in UPPERCASE.',
                'Example: "Answer: TONSURE – first letters of..."'
            ]
        };
    }

    // No answer is OK - we'll proceed with partial analysis

    // ============================================================
    // PHASE 2: PARSE CLUE LINE AND METADATA
    // ============================================================

    // 2a. Detect clue line by (N) word count suffix (mandatory)
    // Number prefix like "3D" is optional
    const wordCountPattern = /\(\d+(?:,\d+)*\)\s*$/;

    // Find the first line that ends with word count - that's the clue
    const clueLineIdx = lines.findIndex(l => wordCountPattern.test(l));

    if (clueLineIdx === -1) {
        return {
            success: false,
            errors: [
                'No clue line found.',
                'Clue must end with letter count, e.g., (5) or (3,4)',
                'Example: "Being up somewhat scares Ireland following comeback (5)"'
            ]
        };
    }

    let publication = '';
    let puzzleId = '';

    // If clue is not on first line, check for publication info before it
    if (clueLineIdx > 0) {
        const pubLine = lines[0];

        if (/^\d+$/.test(pubLine)) {
            puzzleId = pubLine;
            publication = defaultPubId || 'times';
        } else {
            const pubMatch = pubLine.match(/^(.+?)\s+(\d+)$/);
            if (pubMatch) {
                publication = pubMatch[1].trim();
                puzzleId = pubMatch[2];
            } else {
                publication = pubLine;
            }
        }
    } else {
        publication = defaultPubId || 'times';
    }

    const pubId = normalizePublication(publication) || defaultPubId || 'times';

    // 2b. Parse clue line
    const clueLine = lines[clueLineIdx];
    let clueNumber = '';
    let clueDirection: 'across' | 'down' = 'across';
    let clueText = clueLine;

    const clueMatch = clueLine.match(/^(\d+)([ADad])\s+(.+)$/);
    if (clueMatch) {
        clueNumber = clueMatch[1];
        clueDirection = clueMatch[2].toUpperCase() === 'D' ? 'down' : 'across';
        clueText = clueMatch[3];
    } else {
        const numMatch = clueLine.match(/^(\d+)[.)\s]+(.+)$/);
        if (numMatch) {
            clueNumber = numMatch[1];
            clueText = numMatch[2];
        }
    }

    // 2c. Validate clue ends with word count
    const clueSchemaPattern = /\((\d+(?:,\d+)*)\)\s*$/;
    if (!clueSchemaPattern.test(clueText)) {
        return {
            success: false,
            errors: [
                'Clue line does not end with word count.',
                `Found: "${clueText.substring(0, 50)}${clueText.length > 50 ? '...' : ''}"`,
                'Expected: Clue ending with (5) or (3,4)',
                'Check that the clue is on a single line.'
            ]
        };
    }

    // 2d. Extract word count
    const wordCountMatch = clueText.match(/\((\d+(?:,\d+)*)\)$/);
    const wordCount = wordCountMatch ?
        wordCountMatch[1].split(',').reduce((sum, n) => sum + parseInt(n), 0) :
        undefined;

    // 2e. Validate answer length matches word count (only if we have an answer)
    if (answer && wordCount && answer.length !== wordCount) {
        return {
            success: false,
            errors: [
                'Answer length does not match word count.',
                `Clue says (${wordCountMatch?.[1]}) = ${wordCount} letters`,
                `Answer "${answer}" has ${answer.length} letters`,
                'Please check the answer or word count.'
            ]
        };
    }

    // ============================================================
    // PHASE 3: PARSE OPTIONAL FIELDS (coaching notes, etc.)
    // ============================================================

    const remainingLines = lines.slice(clueLineIdx + 1);

    // --- COACHING NOTES ---
    // Look for "Coaching" section and extract bullet points
    const coaching: string[] = [];
    const coachingIdx = remainingLines.findIndex(l =>
        l.toLowerCase().includes('coaching') ||
        l.toLowerCase().includes('explanation')
    );

    if (coachingIdx !== -1) {
        // Collect lines after "Coaching:" until end or next section
        for (let i = coachingIdx + 1; i < remainingLines.length; i++) {
            const line = remainingLines[i];
            // Stop at next section header
            if (line.match(/^[A-Z][a-z]+:/)) break;

            // Clean up the line (remove quotes, bullets)
            const cleaned = line
                .replace(/^["'"]/g, '')
                .replace(/["'"]$/g, '')
                .replace(/^[•\-\*]\s*/, '')
                .trim();

            if (cleaned.length > 0) {
                coaching.push(cleaned);
            }
        }
    }

    // --- DETECT SPECIAL CASES ---
    // Look for signals that this clue doesn't fit standard patterns
    const specialCase = detectSpecialCase(remainingLines.join(' '), coaching);

    // --- BUILD PATTERN DATA ---
    // Try to use our parser first, then enhance with coaching notes
    let patternData: PatternInstance | undefined;

    if (answer && clueText) {
        // Full parsing with answer
        const parseResult = parseClue(clueText, answer, coaching);

        if (parseResult.patternData) {
            patternData = parseResult.patternData;

            // Enhance with extracted parsing info
            if (parsing) {
                patternData.variables['parsing_notes'] = parsing;
            }
        } else {
            // Create minimal pattern data from freeform input
            patternData = buildPatternFromCoaching(clueText, answer, parsing, coaching);
        }
    } else if (clueText && !answer) {
        // Partial parsing without answer - use hypothesis-based analysis
        const analysis = analyzeClueWithoutAnswer(clueText);

        // Check if we derived the answer without AI
        if (analysis.derivedAnswer) {
            // Re-parse with the derived answer for full pattern data
            const fullResult = parseClue(clueText, analysis.derivedAnswer, coaching);
            if (fullResult.patternData) {
                patternData = fullResult.patternData;
                // Update the answer variable for the result
                answer = analysis.derivedAnswer;
            }
        }

        // If we still don't have pattern data, create partial analysis
        if (!patternData) {
            // Build variables from analysis
            const variables: Record<string, string> = {};
            if (analysis.definitionCandidates.length > 0) {
                variables['def_candidates'] = analysis.definitionCandidates.join(' | ');
            }
            analysis.obviousElements.forEach((elem, i) => {
                if (elem.type === 'abbreviation') {
                    variables[`fodder_${i + 1}_text`] = elem.fodder;
                    variables[`result_${i + 1}`] = elem.result;
                }
            });

            patternData = {
                id: `partial-${Date.now()}`,
                patternId: 'PARTIAL',
                clueText,
                answer: '',
                variables,
                solveSteps: analysis.solveSteps,
                // Store the full analysis for UI to use
                analysis: analysis as unknown as Record<string, unknown>
            };
        }
    }

    // All validation passed - return success
    return {
        success: true,
        publication: pubId,
        puzzleId,
        clueNumber,
        clueDirection,
        clueText,
        wordCount,
        answer,
        parsing,
        coaching,
        patternData,
        errors: [],
        specialCase
    };
}

// Detect if coaching notes signal a special case that doesn't fit standard patterns
function detectSpecialCase(
    fullText: string,
    coaching: string[]
): FreeformParseResult['specialCase'] {
    const combined = (fullText + ' ' + coaching.join(' ')).toLowerCase();

    // Cryptic definition signals
    const crypticDefSignals = [
        'definition has wordplay',
        'definition has a small wordplay',
        'cryptic definition',
        'the definition requires',
        'definition phrase',
        'the real issue: the definition',
        'definition is tricky'
    ];

    for (const signal of crypticDefSignals) {
        if (combined.includes(signal)) {
            return {
                type: 'cryptic_definition',
                reason: 'The definition contains wordplay or requires cryptic knowledge'
            };
        }
    }

    // Insider knowledge signals
    const insiderSignals = [
        'insider knowledge',
        'requires knowledge',
        'you need to know',
        'standard cryptic usage',
        'feels weak',
        'discomfort',
        'note to battlecard',
        'why it does work'
    ];

    for (const signal of insiderSignals) {
        if (combined.includes(signal)) {
            return {
                type: 'insider_knowledge',
                reason: 'This clue requires specific cryptic crossword knowledge'
            };
        }
    }

    // Unusual structure signals
    const unusualSignals = [
        'unusual structure',
        'doesn\'t fit',
        'non-standard',
        'edge case',
        'exception'
    ];

    for (const signal of unusualSignals) {
        if (combined.includes(signal)) {
            return {
                type: 'unusual_structure',
                reason: 'This clue has an unusual structure'
            };
        }
    }

    return undefined;
}

function normalizePublication(pub: string): string {
    const lower = pub.toLowerCase();
    if (lower.includes('times')) return 'times';
    if (lower.includes('guardian')) return 'guardian';
    if (lower.includes('telegraph')) return 'telegraph';
    if (lower.includes('independent')) return 'independent';
    if (lower.includes('express')) return 'express';
    if (lower.includes('financial')) return 'ft';
    return 'times'; // Default
}

function buildPatternFromCoaching(
    clueText: string,
    answer: string,
    parsing: string,
    coaching: string[]
): PatternInstance {
    const variables: Record<string, string> = {};

    // Try to extract definition from coaching
    // Look for patterns like "X = definition" or "definition: X"
    for (const line of coaching) {
        // Pattern: "word → result"
        const arrowMatch = line.match(/(.+?)\s*→\s*(.+)/);
        if (arrowMatch) {
            // This might be a transformation step
            continue;
        }

        // Pattern: "X = Y" for definitions
        const eqMatch = line.match(/(.+?)\s*=\s*(.+)/);
        if (eqMatch) {
            const left = eqMatch[1].trim();
            const right = eqMatch[2].trim();

            // If right side contains the answer, left is probably the definition
            if (right.toUpperCase().includes(answer) ||
                right.toLowerCase().includes("monk's") ||
                right.toLowerCase().includes('definition')) {
                variables['def_text'] = left;
            }
        }
    }

    // Try to extract from parsing string
    // Pattern: "first letters (principals) of X"
    if (parsing) {
        const firstLettersMatch = parsing.match(/first letters?\s*\([^)]+\)\s*of\s+([^,]+)/i);
        if (firstLettersMatch) {
            variables['indicator_1_text'] = 'first letters';
            variables['fodder_1_text'] = firstLettersMatch[1].trim();
        }

        // Pattern: "plus X (meaning)"
        const plusMatch = parsing.match(/plus\s+([A-Z]+)\s*\(([^)]+)\)/i);
        if (plusMatch) {
            variables['fodder_2_text'] = plusMatch[2].trim();
            variables['result_2'] = plusMatch[1].toUpperCase();
        }
    }

    // Determine pattern type from parsing
    let patternId = 'UNKNOWN';
    if (parsing) {
        if (parsing.toLowerCase().includes('first letters')) {
            patternId = 'ACROSTIC';
        } else if (parsing.toLowerCase().includes('anagram')) {
            patternId = 'ANAGRAM';
        } else if (parsing.toLowerCase().includes('hidden')) {
            patternId = 'HIDDEN';
        } else if (parsing.toLowerCase().includes('reversal')) {
            patternId = 'REVERSAL';
        }
    }

    return {
        id: `freeform-${Date.now()}`,
        patternId,
        clueText,
        answer,
        variables
    };
}

/**
 * Parse multiple clues from a batch input
 * Clues separated by blank lines or "---"
 */
export function parseBatchFreeform(input: string): FreeformParseResult[] {
    // Split on double newlines or "---"
    const blocks = input.split(/\n\s*\n|\n---\n/).filter(b => b.trim().length > 0);
    return blocks.map(block => parseFreeformInput(block));
}
