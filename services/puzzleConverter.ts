/**
 * Converts new puzzle schema format to PatternInstance for UI rendering
 */

import { PatternInstance, WordplayStep, WordHighlight, DisplayBlock } from '../types';
import {
  PuzzleClue,
  PuzzleFile,
  SolveStep,
  WordUsage,
  OperationType,
  getCommentsArray,
  getOperationTypes,
  isClueFullyValid,
} from './puzzleSchemaTypes';

// ============================================
// COLOR MAPPING
// ============================================

type ColorType = 'GREEN' | 'ORANGE' | 'BLUE' | 'SLATE';

const ROLE_TO_COLOR: Record<string, ColorType> = {
  definition: 'GREEN',
  indicator: 'ORANGE',
  fodder: 'BLUE',
  connector: 'SLATE',
};

// ============================================
// OPERATION TYPE MAPPING
// ============================================

type StepType = WordplayStep['stepType'];

const OPERATION_TO_STEP_TYPE: Record<OperationType, StepType> = {
  synonym: 'synonym',
  anagram: 'anagram',
  charade: 'assembly',
  container: 'container',
  reversal: 'reversal',
  deletion: 'deletion',
  hidden: 'hidden',
  homophone: 'homophone',
  double_definition: 'synonym',
  cryptic_definition: 'synonym',
};

// ============================================
// CONVERSION FUNCTIONS
// ============================================

/**
 * Convert word_accounting.usage to wordHighlights array
 */
function convertWordAccounting(usage: WordUsage[]): WordHighlight[] {
  return usage.map(u => ({
    word: u.word,
    role: u.role,
    stepNumber: u.step,
    colorType: ROLE_TO_COLOR[u.role] || 'SLATE',
  }));
}

/**
 * Convert solve steps to WordplayStep array
 */
function convertSteps(steps: SolveStep[]): WordplayStep[] {
  return steps.map(step => {
    const fodderText = Array.isArray(step.fodder)
      ? step.fodder.join(' + ')
      : step.fodder;

    // Generate explanation based on operation type
    const explanation = generateStepExplanation(step);

    return {
      indicator: step.indicator || '',
      fodder: fodderText,
      result: step.result,
      synonym: step.result, // The result is the "synonym" in UI terms
      hint: step.clue_fragment,
      complexity: getStepComplexity(step),
      isAssembly: step.operation === 'charade',
      stepType: OPERATION_TO_STEP_TYPE[step.operation] || 'unknown',
      explanation,
    };
  });
}

/**
 * Generate human-readable explanation for a step
 */
function generateStepExplanation(step: SolveStep): string {
  const fodderText = Array.isArray(step.fodder)
    ? step.fodder.join(' + ')
    : step.fodder;

  switch (step.operation) {
    case 'synonym':
      return `"${fodderText}" gives ${step.result}`;

    case 'anagram':
      return `"${fodderText}" anagrammed (${step.indicator}) gives ${step.result}`;

    case 'charade':
      return `${fodderText} combined gives ${step.result}`;

    case 'container':
      return `${fodderText} inserted gives ${step.result}`;

    case 'reversal':
      return `"${fodderText}" reversed (${step.indicator}) gives ${step.result}`;

    case 'deletion':
      return `"${fodderText}" with letter(s) removed gives ${step.result}`;

    case 'hidden':
      return `Hidden in "${fodderText}" is ${step.result}`;

    case 'homophone':
      return `"${fodderText}" sounds like ${step.result}`;

    default:
      return `${fodderText} → ${step.result}`;
  }
}

/**
 * Determine complexity score for a step (1=easy, 2=medium, 3=hard)
 */
function getStepComplexity(step: SolveStep): number {
  // Simple synonyms and abbreviations are easy
  if (step.operation === 'synonym' && step.result.length <= 2) {
    return 1;
  }

  // Anagrams and containers are harder
  if (step.operation === 'anagram' || step.operation === 'container') {
    return 3;
  }

  // Everything else is medium
  return 2;
}

/**
 * Generate parsing summary string (e.g., "E + LOPERS = ELOPERS")
 */
function generateParsingSummary(steps: SolveStep[], answer: string): string {
  // Get the final results from each non-charade step
  const parts = steps
    .filter(s => s.operation !== 'charade')
    .map(s => s.result);

  if (parts.length === 0) {
    return answer;
  }

  if (parts.length === 1) {
    return `${parts[0]} = ${answer}`;
  }

  return `${parts.join(' + ')} = ${answer}`;
}

/**
 * Convert operation types to user-friendly technique names
 */
function operationToTechnique(op: OperationType): string {
  const mapping: Record<OperationType, string> = {
    synonym: 'Synonym',
    anagram: 'Anagram',
    charade: 'Charade',
    container: 'Container',
    reversal: 'Reversal',
    deletion: 'Deletion',
    hidden: 'Hidden Word',
    homophone: 'Homophone',
    double_definition: 'Double Definition',
    cryptic_definition: 'Cryptic Definition',
  };
  return mapping[op] || op;
}

/**
 * Generate solveExplanation DisplayBlock array for UI rendering
 */
function generateSolveExplanation(
  clue: PuzzleClue,
  techniquesUsed: string[],
  parsingSummary: string
): DisplayBlock[] {
  const blocks: DisplayBlock[] = [];

  // Check for special clue types
  const isDoubleDefinition = clue.assembly.method === 'double_definition';
  const isCrypticDefinition = clue.assembly.method === 'cryptic_definition' ||
    (clue.definition.position === 'entire' && clue.steps.length === 0);
  const allDefinitions = clue.clue.definition || [];

  // 1. Setter hint block with techniques
  if (techniquesUsed.length > 0 || isDoubleDefinition || isCrypticDefinition) {
    let content: string;
    if (isCrypticDefinition) {
      content = `This is a **Cryptic Definition** clue. The entire clue is a playful or misleading definition of the answer — there is no separate wordplay. Look for puns, double meanings, or clever misdirection.`;
    } else if (isDoubleDefinition && allDefinitions.length >= 2) {
      const defTexts = allDefinitions.map(d => `"${d.text}"`).join(' and ');
      content = `This is a **Double Definition** clue. Both ${defTexts} lead to the same answer.`;
    } else {
      const techniqueList = techniquesUsed.join(', ');
      content = `This clue uses **${techniqueList}**. The definition "${clue.definition.text}" appears at the ${clue.definition.position} of the clue.`;
    }
    blocks.push({
      type: 'setter-hint',
      content,
      techniques: isCrypticDefinition ? ['Cryptic Definition'] : isDoubleDefinition ? ['Double Definition'] : techniquesUsed,
    });
  }

  // 2. Definition(s)
  if (isCrypticDefinition) {
    // Cryptic definition: entire clue is the definition
    blocks.push({
      type: 'explanation',
      label: 'Cryptic Definition',
      content: `The entire clue "${clue.clue.text}" is a cryptic way of defining ${clue.clue.answer}`,
    });
  } else if (isDoubleDefinition && allDefinitions.length >= 2) {
    // Show both definitions for double definition clues
    allDefinitions.forEach((def, i) => {
      blocks.push({
        type: 'explanation',
        label: `Definition ${i + 1}`,
        content: `"${def.text}" at ${def.position} of clue → ${clue.clue.answer}`,
      });
    });
  } else {
    // Single definition
    blocks.push({
      type: 'explanation',
      label: 'Definition',
      content: `"${clue.definition.text}" at ${clue.definition.position} of clue`,
    });
  }

  // 5. Wordplay steps (remaining steps)
  clue.steps.forEach((step, i) => {
    const type = operationToTechnique(step.operation);

    // Special handling for charade steps - show assembly equation
    if (step.operation === 'charade' && step.components && step.components.length > 0) {
      const equation = `${step.components.join(' + ')} = ${step.result}`;
      blocks.push({
        type: 'explanation',
        label: `Wordplay ${i + 1}: ${type}`,
        content: equation,
      });
      return;
    }

    // For other operations, show indicator and fodder if present
    const fodderText = Array.isArray(step.fodder) ? step.fodder.join(' + ') : (step.fodder || '');

    // Build content based on what data we have
    let content: string;
    if (step.indicator && fodderText) {
      content = `Indicator: ${step.indicator} | Fodder: ${fodderText} → ${step.result}`;
    } else if (fodderText) {
      // No indicator (common for synonyms/abbreviations)
      content = `${fodderText} → ${step.result}`;
    } else {
      // Fallback
      content = `→ ${step.result}`;
    }

    blocks.push({
      type: 'explanation',
      label: `Wordplay ${i + 1}: ${type}`,
      content,
    });
  });

  return blocks;
}

// ============================================
// MAIN CONVERTER
// ============================================

/**
 * Build variables object for engine validation
 * The engine expects: def_text, indicator_N_text, fodder_N_text
 *
 * We extract from two sources:
 * 1. steps[] - has fodder, result, and sometimes indicator
 * 2. word_accounting.usage - has word roles including indicators
 */
function buildEngineVariables(clue: PuzzleClue): Record<string, string> {
  const vars: Record<string, string> = {
    def_text: clue.definition.text,
  };

  // For double definitions, add both definition texts
  const allDefinitions = clue.clue.definition || [];
  if (clue.assembly.method === 'double_definition' && allDefinitions.length >= 2) {
    allDefinitions.forEach((def, i) => {
      vars[`def_${i + 1}_text`] = def.text;
    });
  }

  // Extract indicator words from word_accounting (joined by space)
  const indicatorWords = clue.word_accounting.usage
    .filter(u => u.role === 'indicator')
    .sort((a, b) => a.position - b.position)
    .map(u => u.word);

  if (indicatorWords.length > 0) {
    // For now, put all indicators in indicator_1_text (most clues have one indicator)
    vars['indicator_1_text'] = indicatorWords.join(' ');
  }

  // Add fodder and result from each step
  clue.steps.forEach((step, idx) => {
    const stepNum = idx + 1;

    // Check if step has an explicit indicator (overrides word_accounting)
    if (step.indicator) {
      vars[`indicator_${stepNum}_text`] = step.indicator;
    }

    // Add fodder (may be string or array)
    const fodderText = Array.isArray(step.fodder)
      ? step.fodder.join(' ')
      : step.fodder;
    if (fodderText) {
      vars[`fodder_${stepNum}_text`] = fodderText;
    }

    // Add result for decode steps
    if (step.result) {
      vars[`result_${stepNum}`] = step.result;
      vars[`synonym_${stepNum}`] = step.result;
    }
  });

  return vars;
}

/**
 * Convert a single PuzzleClue to PatternInstance
 */
export function convertClueToPatternInstance(
  clue: PuzzleClue,
  clueNumber: string
): PatternInstance {
  // Check for special clue types (assembly.method indicates this)
  const isDoubleDefinition = clue.assembly.method === 'double_definition';
  const isCrypticDefinition = clue.assembly.method === 'cryptic_definition' ||
    (clue.definition.position === 'entire' && clue.steps.length === 0);

  const operations = getOperationTypes(clue.steps);
  let techniquesUsed = operations.map(operationToTechnique);

  // For special clue types, ensure the technique is listed
  if (isCrypticDefinition && !techniquesUsed.includes('Cryptic Definition')) {
    techniquesUsed = ['Cryptic Definition', ...techniquesUsed];
  } else if (isDoubleDefinition && !techniquesUsed.includes('Double Definition')) {
    techniquesUsed = ['Double Definition', ...techniquesUsed];
  }

  // Determine primary pattern type
  const primaryOp = operations[0];
  let patternId = primaryOp ? operationToTechnique(primaryOp) : 'Unknown';

  // Special clue types take precedence as the pattern type
  if (isCrypticDefinition) {
    patternId = 'Cryptic Definition';
  } else if (isDoubleDefinition) {
    patternId = 'Double Definition';
  }

  // Generate parsing summary
  const parsingSummary = generateParsingSummary(clue.steps, clue.clue.answer);

  // Build variables for engine validation
  const variables = buildEngineVariables(clue);

  return {
    id: `puzzle-${clueNumber}-${Date.now()}`,
    patternId,
    clueText: clue.clue.text,
    answer: clue.clue.answer,
    clueNumber: clue.clue.number,
    enumeration: clue.clue.enumeration,
    variables,

    // Word-by-word highlighting
    wordHighlights: convertWordAccounting(clue.word_accounting.usage),

    // Wordplay steps
    wordplaySteps: convertSteps(clue.steps),

    // Definition
    definitionText: clue.definition.text,
    definitionPosition: clue.definition.position,

    // Computed fields
    isComplete: isClueFullyValid(clue),
    parsingSummary,
    techniquesUsed,

    // Data-driven UI blocks for display
    solveExplanation: generateSolveExplanation(clue, techniquesUsed, parsingSummary),

    // Human-readable comments
    solverComments: getCommentsArray(clue.comments),

    // Confidence from the solver
    // (could add confidence field to PatternInstance if needed)
  };
}

/**
 * Convert an entire puzzle file to array of PatternInstances
 */
export function convertPuzzleFile(puzzle: PuzzleFile): PatternInstance[] {
  const instances: PatternInstance[] = [];

  for (const [clueNumber, clue] of Object.entries(puzzle.clues)) {
    instances.push(convertClueToPatternInstance(clue, clueNumber));
  }

  return instances;
}

/**
 * Populate variables for a legacy PatternInstance that has empty variables
 * This enables training mode to work with older exported puzzle files
 * Exported for use in clueManager when loading from IndexedDB
 */
export function populateLegacyVariables(instance: PatternInstance): PatternInstance {
  // If variables are already populated, return as-is
  if (instance.variables && Object.keys(instance.variables).length > 0) {
    return instance;
  }

  // Build variables from existing PatternInstance data
  const vars: Record<string, string> = {};

  // Add definition
  if (instance.definitionText) {
    vars['def_text'] = instance.definitionText;
  }

  // Extract indicator from wordHighlights (from word_accounting.usage)
  if (instance.wordHighlights && instance.wordHighlights.length > 0) {
    const indicatorWords = instance.wordHighlights
      .filter(w => w.role === 'indicator')
      .map(w => w.word);

    if (indicatorWords.length > 0) {
      vars['indicator_1_text'] = indicatorWords.join(' ');
    }
  }

  // Extract indicator and fodder from wordplaySteps
  if (instance.wordplaySteps && instance.wordplaySteps.length > 0) {
    instance.wordplaySteps.forEach((step, idx) => {
      const stepNum = idx + 1;

      // Add indicator if present (overrides wordHighlights extraction)
      if (step.indicator) {
        vars[`indicator_${stepNum}_text`] = step.indicator;
      }

      // Add fodder if present
      if (step.fodder) {
        vars[`fodder_${stepNum}_text`] = step.fodder;
      }

      // Add result/synonym
      if (step.result) {
        vars[`result_${stepNum}`] = step.result;
        vars[`synonym_${stepNum}`] = step.result;
      }
    });
  }

  return {
    ...instance,
    variables: vars,
  };
}

/**
 * Load and convert a puzzle file from JSON
 * Supports both:
 * 1. New PuzzleFile format with metadata and clues object
 * 2. Legacy format: direct array of PatternInstance objects
 */
export function loadPuzzleFromJson(jsonContent: string): {
  metadata: PuzzleFile['metadata'];
  clues: PatternInstance[];
  rawData: PuzzleFile | null;
} {
  const parsed = JSON.parse(jsonContent);

  // Check if this is the legacy array format (array of PatternInstance)
  if (Array.isArray(parsed)) {
    // Legacy format: direct array of PatternInstance objects
    const clues = parsed.map((instance: PatternInstance) => populateLegacyVariables(instance));

    // Debug: log first clue's variables
    if (clues[0]) {
      console.log('[puzzleConverter] Loaded legacy format, first clue variables:', clues[0].variables);
    }

    // Extract metadata from first clue if available
    const firstClue = clues[0];
    const metadata: PuzzleFile['metadata'] = {
      publisher: firstClue?.publication || 'Times',
      puzzle_number: String(firstClue?.puzzleNumber || 0),
      setter: firstClue?.setter || 'Unknown',
      publication_date: '',
      source_url: '',
    };

    return {
      metadata,
      clues,
      rawData: null, // No raw PuzzleFile for legacy format
    };
  }

  // New PuzzleFile format with metadata and clues object
  const puzzle: PuzzleFile = parsed;
  const clues = convertPuzzleFile(puzzle);

  // Debug: log first clue's variables
  if (clues[0]) {
    console.log('[puzzleConverter] Loaded new PuzzleFile format, first clue variables:', clues[0].variables);
  }

  return {
    metadata: puzzle.metadata,
    clues,
    rawData: puzzle,
  };
}
