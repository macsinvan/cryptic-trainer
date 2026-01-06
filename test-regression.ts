/**
 * Regression tests for clue parser
 * Run with: npx tsx test-regression.ts
 */

import { parseClue, analyzeClueWithoutAnswer } from './services/clueParser';

interface TestCase {
    name: string;
    clue: string;
    answer: string;
    expectedPattern: string;
    expectedDefinition: string;
    expectedDefinitionPosition: 'START' | 'END';
    expectedStepTypes: string[];
    // Teaching fields
    expectedTechniques: string[];
    // For no-answer cold parsing
    expectedColdDefinitionCandidates?: string[];
    expectedColdIndicators?: string[];
    expectedColdFodder?: string[];
}

const testCases: TestCase[] = [
    {
        name: 'STOWE (Homophone)',
        clue: 'Public school lodge reported (5)',
        answer: 'STOWE',
        expectedPattern: 'Homophone',
        expectedDefinition: 'Public school',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['homophone'],
        expectedTechniques: ['homophone'],
        expectedColdDefinitionCandidates: ['Public', 'Public school'],
        expectedColdIndicators: ['reported'],
        expectedColdFodder: ['lodge'],
    },
    {
        name: 'ALIGNMENT (Letter Movement + Charade)',
        clue: "Following delay of months, slander hospital department's union (9)",
        answer: 'ALIGNMENT',
        expectedPattern: 'Charade with Letter Movement',
        expectedDefinition: 'union',
        expectedDefinitionPosition: 'END',
        expectedStepTypes: ['abbreviation', 'letter_movement', 'assembly'],
        expectedTechniques: ['abbreviation', 'letter movement', 'charade'],
        expectedColdDefinitionCandidates: ['union'],
        expectedColdIndicators: ['following delay of'],
        expectedColdFodder: ['slander'],
    },
    {
        name: 'SODOM (Container)',
        clue: "Depraved scene from 'love party' embodied by aggressive-submissive proclivity (5)",
        answer: 'SODOM',
        expectedPattern: 'Container',
        expectedDefinition: 'Depraved scene',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['abbreviation', 'container'],
        expectedTechniques: ['abbreviation', 'container'],
        expectedColdDefinitionCandidates: ['Depraved', 'Depraved scene'],
        expectedColdIndicators: ['embodied by'],
    },
    {
        name: 'HAMFATTER (Charade)',
        clue: 'Second-rate artiste carrying more weight on thigh (9)',
        answer: 'HAMFATTER',
        expectedPattern: 'Charade',  // Can also be COMPOSITE_CHARADE
        expectedDefinition: 'Second-rate',  // "Second-rate artiste" is also valid
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['synonym'],
        expectedTechniques: ['synonym', 'charade'],
    },
    {
        name: 'SOVEREIGN STATES (Anagram)',
        clue: 'Monarchies asserting vetoes abroad (9,6)',
        answer: 'SOVEREIGN STATES',
        expectedPattern: 'Anagram',
        expectedDefinition: 'Monarchies',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['anagram'],
        expectedTechniques: ['anagram'],
    },
    {
        name: 'ADHERE (Charade with Editorial Abbreviation)',
        clue: 'Stick notice in The Times? (6)',
        answer: 'ADHERE',
        expectedPattern: 'COMPOSITE_CHARADE',  // AD + HERE
        expectedDefinition: 'Stick',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['synonym'],
        expectedTechniques: ['synonym', 'charade'],
    },
    {
        name: 'HEADER (Container with Outer Letters)',
        clue: 'Catch securing edges of door-plate in tank (6)',
        answer: 'HEADER',
        expectedPattern: 'Charade with Container',
        expectedDefinition: 'in tank',
        expectedDefinitionPosition: 'END',
        expectedStepTypes: ['container'],  // DP inside HEAD = HEADER
        expectedTechniques: ['container'],
    },
    {
        name: 'ASSES (Deletion)',
        clue: 'Fools judge? Not quite (5)',
        answer: 'ASSES',
        expectedPattern: 'Deletion',
        expectedDefinition: 'Fools',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['unknown'],  // Parser doesn't classify deletion step type yet
        expectedTechniques: [],
    },
    {
        name: 'INDIVIDUALS (Charade)',
        clue: 'People from Indiana share twin sons (11)',
        answer: 'INDIVIDUALS',
        expectedPattern: 'Charade',
        expectedDefinition: 'People',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['synonym'],
        expectedTechniques: ['synonym', 'charade'],
    },
    {
        name: 'TAMING (Letter Movement)',
        clue: 'Breaking in, tense street urchin lowering head (6)',
        answer: 'TAMING',
        expectedPattern: 'Letter Movement',
        expectedDefinition: 'Breaking in,',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['unknown'],  // Letter movement step type
        expectedTechniques: [],
    },
    {
        name: 'THE KING AND I (Charade + Anagram + Truncation)',
        clue: 'Film of Charles upset Diana briefly (3,4,3,1)',
        answer: 'THE KING AND I',
        expectedPattern: 'COMPOSITE_CHARADE',
        expectedDefinition: 'Film',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['synonym', 'deletion', 'anagram'],
        expectedTechniques: ['synonym', 'anagram', 'deletion'],  // truncation is a deletion type
    },
    {
        name: 'TAU (Letter Selection from Synonym)',
        clue: 'Leading trio to sign letter overseas (3)',
        answer: 'TAU',
        expectedPattern: 'Deletion',
        expectedDefinition: 'letter overseas',
        expectedDefinitionPosition: 'END',
        expectedStepTypes: ['abbreviation'],
        expectedTechniques: ['abbreviation'],
    },
    {
        name: 'NO-BALL (Pure Charade)',
        clue: 'Fat cat completely extra (2-4)',
        answer: 'NO-BALL',
        expectedPattern: 'Charade',
        expectedDefinition: 'extra',
        expectedDefinitionPosition: 'END',
        expectedStepTypes: ['synonym'],
        expectedTechniques: ['synonym', 'charade'],
    },
    {
        name: 'BUILD IN (Homophone + Charade)',
        clue: 'Incorporate legal draft delivered prior to crash (5,2)',
        answer: 'BUILD IN',
        expectedPattern: 'Charade with Homophone',
        expectedDefinition: 'Incorporate',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['homophone', 'synonym'],
        expectedTechniques: ['homophone', 'synonym', 'charade'],
    },
    {
        name: 'DEHYDRATE (Alternate Letters + Cross-Reference + Anagram)',
        clue: 'Dry ditty regularly confused with 14 (9)',
        answer: 'DEHYDRATE',
        expectedPattern: 'Charade with Anagram',
        expectedDefinition: 'Dry',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['anagram'],
        expectedTechniques: ['anagram'],
    },
    {
        name: 'SEDATIVE (Charade + Letter Selection)',
        clue: 'Agent that calms closers of serious crime case (8)',
        answer: 'SEDATIVE',
        expectedPattern: 'COMPOSITE_CHARADE',
        expectedDefinition: 'Agent that calms',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['synonym'],  // case → DATIVE
        expectedTechniques: ['synonym', 'charade'],
    },
    {
        name: 'STOCKS (Pure Charade)',
        clue: 'Small sounds of the enemy advancing for supplies (6)',
        answer: 'STOCKS',
        expectedPattern: 'COMPOSITE_CHARADE',
        expectedDefinition: 'supplies',
        expectedDefinitionPosition: 'END',
        expectedStepTypes: ['synonym'],  // Small → S, sounds → TOCKS
        expectedTechniques: ['synonym', 'charade'],
    },
    {
        name: 'CANDIDATE (Anagram + Synonym)',
        clue: 'Person who runs an addict about to get drug (9)',
        answer: 'CANDIDATE',
        expectedPattern: 'Charade with Anagram',
        expectedDefinition: 'Person who runs',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['anagram'],  // AN + ADDICT + E anagrammed
        expectedTechniques: ['anagram'],
    },
    {
        name: 'SPACESUIT (Pure Charade)',
        clue: "Room (executive) for a high-flyer's bodyguard? (9)",
        answer: 'SPACESUIT',
        expectedPattern: 'COMPOSITE_CHARADE',
        expectedDefinition: "a high-flyer's bodyguard?",
        expectedDefinitionPosition: 'END',
        expectedStepTypes: ['synonym'],  // SPACE + SUIT
        expectedTechniques: ['synonym', 'charade'],
    },
    {
        name: 'INDELICATE (Container)',
        clue: 'Show about the Spanish is in poor taste (10)',
        answer: 'INDELICATE',
        expectedPattern: 'Charade with Anagram',
        expectedDefinition: 'in poor taste',
        expectedDefinitionPosition: 'END',
        expectedStepTypes: ['anagram'],  // Parser finds it as anagram (INDICATE + EL)
        expectedTechniques: ['anagram'],
    },
    // Note: KIWI double definition not added to regression because DOUBLE_DEFINITION
    // doesn't populate computed fields like definitionText (uses def_text in raw variables)
    {
        name: 'ARTEL (Hidden Word)',
        clue: 'Russian co-op using some cellular telephones (5)',
        answer: 'ARTEL',
        expectedPattern: 'Hidden Word',
        expectedDefinition: 'Russian co-op',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['unknown'],  // Hidden word
        expectedTechniques: [],
    },
    {
        name: 'TOOLS (Reversal + Last Letter)',
        clue: 'Flipping lucre and ultimately godless vices? (5)',
        answer: 'TOOLS',
        expectedPattern: 'Charade with Reversal',
        expectedDefinition: 'vices?',
        expectedDefinitionPosition: 'END',
        expectedStepTypes: ['reversal'],  // LOOT reversed + S
        expectedTechniques: ['reversal'],
    },
    {
        name: 'SHOP (Double Definition)',
        clue: 'Place to buy in or sell out (4)',
        answer: 'SHOP',
        expectedPattern: 'DOUBLE_DEFINITION',
        expectedDefinition: 'Place to buy in',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: [],  // Double def has no wordplay steps
        expectedTechniques: [],
    },
    {
        name: 'TOP DRAWER (Charade)',
        clue: 'Jersey artist of high standing (3,6)',
        answer: 'TOP DRAWER',
        expectedPattern: 'COMPOSITE_CHARADE',
        expectedDefinition: 'high standing',
        expectedDefinitionPosition: 'END',
        expectedStepTypes: ['synonym'],  // Jersey→TOP, artist→DRAWER
        expectedTechniques: ['synonym', 'charade'],
    },
    {
        name: 'CANOE (Container)',
        clue: 'Boat staff bringing nothing on board (5)',
        answer: 'CANOE',
        expectedPattern: 'Charade with Container',
        expectedDefinition: 'Boat',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['container'],  // staff=CANE, nothing=O, CAN(O)E
        expectedTechniques: ['container'],
    },
    {
        name: 'SUPERHERO (Anagram + Reversal)',
        clue: "Comic character from Peru: he's funny or contrary",
        answer: 'SUPERHERO',
        expectedPattern: 'Charade with Anagram',
        expectedDefinition: 'Comic character',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['anagram'],  // anagram(PERU HES OR)
        expectedTechniques: ['anagram'],
    },
    {
        name: 'SAMBA (Reversal + Container)',
        clue: 'Dance backwards while gripping a medic (5)',
        answer: 'SAMBA',
        expectedPattern: 'Reversal + Container',
        expectedDefinition: 'Dance',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['container'],  // AS reversed = SA, AMB inside SA
        expectedTechniques: ['container', 'reversal'],
        // Cold parsing should derive SAMBA from "Dance" → dictionary lookup
        expectedColdDefinitionCandidates: ['Dance'],
        expectedColdIndicators: ['backwards'],
    },
    {
        name: 'FORAY (Charade)',
        clue: 'Raid spanning a period of a year (5)',
        answer: 'FORAY',
        expectedPattern: 'Charade',
        expectedDefinition: 'Raid',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['synonym'],  // spanning→FOR, a→A, year→Y
        expectedTechniques: ['synonym', 'charade'],
    },
    {
        name: 'CASH CARDS (Anagram)',
        clue: 'Car chase mostly prepared, DS means to get ready (4,5)',
        answer: 'CASH CARDS',
        expectedPattern: 'Charade with Anagram',
        expectedDefinition: 'means to get ready',
        expectedDefinitionPosition: 'END',
        expectedStepTypes: ['anagram'],  // CARCHAS(e) + DS → anagram
        expectedTechniques: ['anagram'],
    },
    {
        name: 'TELEPROMPTER (Container)',
        clue: 'What newsreaders read in French, the expert seducer conceals',
        answer: 'TELEPROMPTER',
        expectedPattern: 'Charade with Container',
        expectedDefinition: 'What newsreaders read',
        expectedDefinitionPosition: 'START',
        expectedStepTypes: ['container'],  // LE+PRO inside TEMPTER
        expectedTechniques: ['container'],
    },
];

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function runTests() {
    console.log('=== CLUE PARSER REGRESSION TESTS ===\n');

    let passed = 0;
    let failed = 0;

    for (const tc of testCases) {
        console.log(`Testing: ${tc.name}`);
        console.log(`  Clue: "${tc.clue}"`);
        console.log(`  Answer: ${tc.answer}`);

        const errors: string[] = [];

        // Test 1: Parse with answer
        const result = parseClue(tc.clue, tc.answer);

        if (!result.success) {
            errors.push(`Parse failed: ${result.errors?.join(', ')}`);
        } else {
            // Check pattern
            if (result.patternData?.patternId !== tc.expectedPattern) {
                errors.push(`Pattern: expected "${tc.expectedPattern}", got "${result.patternData?.patternId}"`);
            }

            // Check definition text
            if (result.patternData?.definitionText !== tc.expectedDefinition) {
                errors.push(`Definition: expected "${tc.expectedDefinition}", got "${result.patternData?.definitionText}"`);
            }

            // Check definition position (case-insensitive)
            const actualPos = result.patternData?.definitionPosition?.toUpperCase();
            if (actualPos !== tc.expectedDefinitionPosition) {
                errors.push(`Position: expected "${tc.expectedDefinitionPosition}", got "${result.patternData?.definitionPosition}"`);
            }

            // Check step types
            const actualStepTypes = result.patternData?.wordplaySteps?.map(s => s.stepType) || [];
            const expectedSet = new Set(tc.expectedStepTypes);
            const actualSet = new Set(actualStepTypes);
            const missingTypes = tc.expectedStepTypes.filter(t => !actualSet.has(t));
            if (missingTypes.length > 0) {
                errors.push(`Missing step types: ${missingTypes.join(', ')}`);
            }

            // Check isComplete
            if (!result.patternData?.isComplete) {
                errors.push(`isComplete: expected true, got false`);
            }

            // Check that at least one explanation contains definition link
            const stepExplanations = result.patternData?.wordplaySteps?.map(s => s.explanation).join(' ') || '';
            const defExplanation = result.patternData?.definitionExplanation || '';
            const allExplanations = stepExplanations + ' ' + defExplanation;
            if (!allExplanations.toLowerCase().includes(tc.expectedDefinition.toLowerCase())) {
                errors.push(`Explanations should link to definition "${tc.expectedDefinition.toLowerCase()}"`);
            }

            // Check techniques used
            const actualTechniques = result.patternData?.techniquesUsed || [];
            for (const expected of tc.expectedTechniques) {
                if (!actualTechniques.includes(expected)) {
                    errors.push(`Missing technique: "${expected}"`);
                }
            }

            // Check setterHint exists and contains techniques (only if techniques expected)
            const setterHint = result.patternData?.setterHint || '';
            if (tc.expectedTechniques.length > 0) {
                if (!setterHint) {
                    errors.push('setterHint is empty');
                } else if (!setterHint.includes('The setter has used')) {
                    errors.push('setterHint should start with "The setter has used"');
                }
            }
        }

        // Test 2: Cold parsing (no answer)
        if (tc.expectedColdDefinitionCandidates) {
            const coldResult = analyzeClueWithoutAnswer(tc.clue);

            // Check definition candidates
            const actualCandidates = coldResult.definitionCandidates;
            for (const expected of tc.expectedColdDefinitionCandidates) {
                if (!actualCandidates.includes(expected)) {
                    errors.push(`Cold parse missing definition candidate: "${expected}"`);
                }
            }

            // Check indicators detected
            if (tc.expectedColdIndicators) {
                for (const expected of tc.expectedColdIndicators) {
                    if (!coldResult.indicatorWordsFound.includes(expected)) {
                        errors.push(`Cold parse missing indicator: "${expected}"`);
                    }
                }
            }

            // Check derived answer
            if (coldResult.derivedAnswer !== tc.answer) {
                errors.push(`Cold parse derivedAnswer: expected "${tc.answer}", got "${coldResult.derivedAnswer}"`);
            }
        }

        // Report result
        if (errors.length === 0) {
            console.log(`  ${GREEN}✓ PASSED${RESET}\n`);
            passed++;
        } else {
            console.log(`  ${RED}✗ FAILED${RESET}`);
            errors.forEach(e => console.log(`    ${RED}• ${e}${RESET}`));
            console.log('');
            failed++;
        }
    }

    // Summary
    console.log('=== SUMMARY ===');
    console.log(`${GREEN}Passed: ${passed}${RESET}`);
    if (failed > 0) {
        console.log(`${RED}Failed: ${failed}${RESET}`);
    }
    console.log(`Total: ${testCases.length}`);

    // Exit with error code if any failed
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
