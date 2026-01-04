/**
 * Test Case: Import → Solve Flow
 *
 * Tests the complete pipeline for the RISER clue:
 * 1. Parse clue with clueParser
 * 2. Verify pattern data is correct
 * 3. Build ClueEvaluation structure
 * 4. Simulate solver state machine transitions
 *
 * Run with: npx tsx tests/tc-import-solve.ts
 */

import { parseClue } from '../services/clueParser';
import { ClueEvaluation, WordplayModule, PatternInstance } from '../types';

// ============================================================================
// TEST DATA
// ============================================================================

const TEST_CLUE = 'Being up somewhat scares Ireland following comeback (5)';
const TEST_ANSWER = 'RISER';
const TEST_COACHING = [
  'reverse (following comeback) hidden (somewhat) scaRES IReland.',
  'A person, or being, that is up (i.e. out of bed).'
];

// ============================================================================
// TEST HELPERS
// ============================================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean): void {
  try {
    const result = fn();
    if (result) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.log(`  ✗ ${name}`);
      failed++;
    }
  } catch (e: any) {
    console.log(`  ✗ ${name} - Error: ${e.message}`);
    failed++;
  }
}

function assertEqual(actual: any, expected: any, message?: string): boolean {
  const pass = actual === expected;
  if (!pass && message) {
    console.log(`      Expected: ${expected}`);
    console.log(`      Actual:   ${actual}`);
  }
  return pass;
}

// ============================================================================
// TEST: PARSER OUTPUT
// ============================================================================

console.log('\n📋 TEST CASE: Import → Solve Flow');
console.log('='.repeat(50));
console.log(`Clue: "${TEST_CLUE}"`);
console.log(`Answer: ${TEST_ANSWER}`);
console.log('='.repeat(50));

console.log('\n1️⃣  PARSER OUTPUT');

const parseResult = parseClue(TEST_CLUE, TEST_ANSWER, TEST_COACHING);

test('Parser returns success', () => parseResult.success === true);

test('Confidence >= 80', () => (parseResult.confidence || 0) >= 80);

test('Definition is "Being up"', () =>
  parseResult.parsed?.definition?.text === 'Being up'
);

test('Definition position is START', () =>
  parseResult.parsed?.definition?.position === 'START'
);

test('Indicators exclude "up"', () => {
  const indicators = parseResult.parsed?.indicators || [];
  const hasUp = indicators.some(i => i.text === 'up');
  return !hasUp;
});

test('Indicators include "somewhat"', () => {
  const indicators = parseResult.parsed?.indicators || [];
  return indicators.some(i => i.text === 'somewhat');
});

test('Indicators include "following comeback"', () => {
  const indicators = parseResult.parsed?.indicators || [];
  return indicators.some(i => i.text === 'following comeback');
});

test('Fodder is "scares Ireland"', () => {
  const fodders = parseResult.parsed?.fodders || [];
  return fodders.includes('scares Ireland');
});

// ============================================================================
// TEST: PATTERN VARIABLES
// ============================================================================

console.log('\n2️⃣  PATTERN VARIABLES');

const vars = parseResult.patternData?.variables || {};

test('def_text = "Being up"', () => vars.def_text === 'Being up');

test('definition_match_type = "synonym"', () =>
  vars.definition_match_type === 'synonym'
);

test('indicator_1_text contains "somewhat"', () =>
  (vars.indicator_1_text || '').includes('somewhat')
);

test('fodder_1_text = "scares Ireland"', () =>
  vars.fodder_1_text === 'scares Ireland'
);

test('result_1 = "RISER"', () => vars.result_1 === 'RISER');

test('hint_1 explains hidden+reversal', () => {
  const hint = vars.hint_1 || '';
  return hint.includes('RESIR') && hint.includes('reversed');
});

// ============================================================================
// TEST: EVALUATION STRUCTURE
// ============================================================================

console.log('\n3️⃣  EVALUATION STRUCTURE');

// Build evaluation from parse result (simulating what ManualEntryMode does)
function buildEvaluation(result: typeof parseResult): ClueEvaluation {
  const vars = result.patternData?.variables || {};

  const wordplay: WordplayModule[] = [];
  if (vars.indicator_1_text) {
    wordplay.push({
      type: result.patternData?.patternId || 'UNKNOWN',
      indicator: {
        text: vars.indicator_1_text,
        description: 'Combined hidden + reversal operation'
      },
      fodder: {
        text: vars.fodder_1_text || '',
        description: 'Source text for wordplay'
      },
      synonym: vars.result_1,
      thinkingHint: vars.hint_1 ? [vars.hint_1] : []
    });
  }

  return {
    id: `test-${Date.now()}`,
    clue: TEST_CLUE,
    answer: TEST_ANSWER,
    type: result.patternData?.patternId || 'UNKNOWN',
    difficulty: 'Medium',
    definition: {
      text: vars.def_text || '',
      position: result.parsed?.definition?.position || 'START'
    },
    wordplay,
    structure: `${vars.fodder_1_text} → ${vars.result_1}`,
    card: [],
    learnings: [],
    reasoning: '',
    parsing: '',
    hints: []
  };
}

const evaluation = buildEvaluation(parseResult);

test('Evaluation has correct answer', () => evaluation.answer === 'RISER');

test('Evaluation definition.text = "Being up"', () =>
  evaluation.definition.text === 'Being up'
);

test('Evaluation has wordplay module', () => evaluation.wordplay.length > 0);

test('Wordplay module has result RISER', () =>
  evaluation.wordplay[0]?.synonym === 'RISER'
);

// ============================================================================
// TEST: SOLVER STATE MACHINE SIMULATION
// ============================================================================

console.log('\n4️⃣  SOLVER STATE MACHINE');

type SolverState = 'DEFINITION' | 'WP_INDICATOR' | 'WP_FODDER' | 'WP_DECODE' | 'FINAL_SOLVE' | 'COMPLETED';

interface StateSimulator {
  state: SolverState;
  advance: (input?: string) => boolean;
}

function createStateSimulator(eval_: ClueEvaluation, pattern: PatternInstance): StateSimulator {
  let currentState: SolverState = 'DEFINITION';
  const vars = pattern.variables;

  return {
    get state() { return currentState; },
    advance(input?: string): boolean {
      switch (currentState) {
        case 'DEFINITION':
          // User clicks on definition words
          if (input === vars.def_text) {
            currentState = 'WP_INDICATOR';
            return true;
          }
          return false;

        case 'WP_INDICATOR':
          // User clicks on indicator
          if (vars.indicator_1_text?.includes(input || '')) {
            currentState = 'WP_FODDER';
            return true;
          }
          return false;

        case 'WP_FODDER':
          // User clicks on fodder
          if (input === vars.fodder_1_text) {
            currentState = 'WP_DECODE';
            return true;
          }
          return false;

        case 'WP_DECODE':
          // User reads decode hint and clicks continue
          currentState = 'FINAL_SOLVE';
          return true;

        case 'FINAL_SOLVE':
          // User types answer
          if (input?.toUpperCase() === eval_.answer) {
            currentState = 'COMPLETED';
            return true;
          }
          return false;

        case 'COMPLETED':
          return false;
      }
    }
  };
}

const simulator = createStateSimulator(evaluation, parseResult.patternData!);

test('Initial state is DEFINITION', () => simulator.state === 'DEFINITION');

test('Selecting "Being up" advances to WP_INDICATOR', () => {
  const result = simulator.advance('Being up');
  return result && simulator.state === 'WP_INDICATOR';
});

test('Selecting "somewhat" advances to WP_FODDER', () => {
  const result = simulator.advance('somewhat');
  return result && simulator.state === 'WP_FODDER';
});

test('Selecting "scares Ireland" advances to WP_DECODE', () => {
  const result = simulator.advance('scares Ireland');
  return result && simulator.state === 'WP_DECODE';
});

test('Clicking continue advances to FINAL_SOLVE', () => {
  const result = simulator.advance();
  return result && simulator.state === 'FINAL_SOLVE';
});

test('Typing "RISER" advances to COMPLETED', () => {
  const result = simulator.advance('RISER');
  return result && simulator.state === 'COMPLETED';
});

// ============================================================================
// TEST: LEARNINGS (WHAT WE LEARNED)
// ============================================================================

console.log('\n5️⃣  LEARNINGS VALIDATION');

test('Definition learning available', () => {
  return vars.def_text !== undefined && vars.def_text.length > 0;
});

test('Definition match type is valid', () => {
  return ['direct', 'synonym', 'cryptic'].includes(vars.definition_match_type || '');
});

test('Hint explains the wordplay', () => {
  const hint = vars.hint_1 || '';
  return hint.length > 10; // Has meaningful content
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(50));
console.log(`📊 RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
  console.log('\n❌ SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('\n✅ ALL TESTS PASSED');
  process.exit(0);
}
