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
        expectedColdDefinitionCandidates: ['union'],
        expectedColdIndicators: ['following delay of'],
        expectedColdFodder: ['slander'],
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
            const allExplanations = result.patternData?.wordplaySteps?.map(s => s.explanation).join(' ') || '';
            if (!allExplanations.toLowerCase().includes(tc.expectedDefinition.toLowerCase())) {
                errors.push(`Explanations should link to definition "${tc.expectedDefinition.toLowerCase()}"`);
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
