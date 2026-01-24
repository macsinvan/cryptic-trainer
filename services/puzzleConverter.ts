/**
 * V2 Puzzle Converter
 *
 * Converts puzzle import format to V2 storage schema with:
 * - Wordplays with dependencies
 * - State tracking
 * - Sub-operations for complex wordplays
 * - Blocked hints
 */

import {
  PatternInstance,
  Wordplay,
  WordplayState,
  Definition,
  ClueTypeId,
  OperationType,
} from '../types';

import {
  V2StoredClue,
  V2Wordplay,
  V2ClueData,
  V2PuzzleMetadata,
  V2OperationType,
  PuzzleClue,
  PuzzleFile,
  SolveStep,
  getCommentsArray,
} from './puzzleSchemaTypes';

// ============================================
// BLOG FORMAT TYPES (scraped from Times for the Times)
// ============================================

interface BlogClue {
  number: number;
  direction: 'across' | 'down';
  clue_text: string;
  definition: string;
  definition_position: 'start' | 'end' | 'entire';
  answer: string;
  wordplay: string;
  enumeration: string;
  length: number;
}

export interface BlogPuzzleFile {
  metadata: {
    source_url?: string;
    publication: string;
    puzzle_number: number;
    date?: string;
    blog_title?: string;
    setter?: string;
  };
  across: BlogClue[];
  down: BlogClue[];
  clue_count?: number;
}

/**
 * Check if a JSON object is in blog format (across/down arrays)
 */
function isBlogFormat(obj: unknown): obj is BlogPuzzleFile {
  if (!obj || typeof obj !== 'object') return false;
  const candidate = obj as Record<string, unknown>;
  return (
    'across' in candidate &&
    'down' in candidate &&
    Array.isArray(candidate.across) &&
    Array.isArray(candidate.down)
  );
}

// ============================================
// STATE INITIALIZATION
// ============================================

function createInitialState(): WordplayState {
  return {
    indicatorFound: false,
    fodderFound: false,
    resultEntered: false,
    solved: false,
  };
}

// ============================================
// OPERATION TYPE MAPPING
// ============================================

const IMPORT_TO_V2_OPERATION: Record<string, V2OperationType> = {
  synonym: 'synonym',
  anagram: 'anagram',
  charade: 'charade',
  container: 'container',
  reversal: 'reversal',
  deletion: 'deletion',
  hidden: 'hidden',
  homophone: 'homophone',
  abbreviation: 'abbreviation',
  double_definition: 'synonym',
  cryptic_definition: 'synonym',
};

// ============================================
// V2 CONVERSION FUNCTIONS
// ============================================

/**
 * Convert import SolveStep[] to V2 Wordplay[]
 *
 * For V2, we need to:
 * 1. Assign unique IDs
 * 2. Determine dependencies based on operation relationships
 * 3. Initialize state tracking
 * 4. Create sub-operations for complex wordplays
 */
function convertStepsToWordplays(steps: SolveStep[]): Wordplay[] {
  const wordplays: Wordplay[] = [];

  steps.forEach((step, index) => {
    const id = String(index + 1);
    const operation = IMPORT_TO_V2_OPERATION[step.operation] || 'synonym';

    const fodderText = Array.isArray(step.fodder)
      ? step.fodder.join(' ')
      : (step.fodder || '');

    // For charade (assembly) steps, they depend on all previous steps
    const dependencies: string[] = [];
    if (step.operation === 'charade' && step.components) {
      // Charade depends on all component-producing steps
      for (let i = 0; i < index; i++) {
        dependencies.push(String(i + 1));
      }
    }

    const wordplay: Wordplay = {
      id,
      indicator: step.indicator || '',
      operation: operation as OperationType,
      fodder: fodderText,
      fodderLetterCount: fodderText.replace(/\s/g, '').length,
      result: step.result,
      resultLetterCount: step.result.length,
      dependencies,
      state: createInitialState(),
      explanation: generateExplanation(step),
    };

    // Add blocked hint if there are dependencies
    if (dependencies.length > 0) {
      wordplay.blockedHint = `Complete steps ${dependencies.join(', ')} first.`;
    }

    wordplays.push(wordplay);
  });

  return wordplays;
}

/**
 * Generate human-readable explanation for a step
 */
function generateExplanation(step: SolveStep): string {
  const fodderText = Array.isArray(step.fodder)
    ? step.fodder.join(' + ')
    : (step.fodder || '');

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
    case 'abbreviation':
      return `"${fodderText}" abbreviated gives ${step.result}`;
    default:
      return `${fodderText} → ${step.result}`;
  }
}

/**
 * Determine clue type ID from puzzle data
 */
function determineClueType(clue: PuzzleClue): ClueTypeId {
  if (clue.assembly.method === 'double_definition') {
    return { id: 'double_definition' };
  }
  if (clue.assembly.method === 'cryptic_definition' ||
      (clue.definition.position as string === 'entire' && clue.steps.length === 0)) {
    return { id: 'cryptic_definition' };
  }
  // TODO: Detect &lit clues (would need marker in import format)
  return { id: 'standard' };
}

// ============================================
// MAIN CONVERTER
// ============================================

/**
 * Convert a PuzzleClue (import format) to PatternInstance (V2 storage)
 */
export function convertClueToPatternInstance(
  clue: PuzzleClue,
  clueNumber: string,
  puzzleMetadata?: { publication?: string; puzzleNumber?: number; setter?: string }
): PatternInstance {
  const clueType = determineClueType(clue);

  const definition: Definition = {
    text: clue.definition.text,
    position: (clue.definition.position as string) === 'entire' ? 'entire' : clue.definition.position,
  };

  const wordplays = convertStepsToWordplays(clue.steps);

  return {
    id: `puzzle-${clueNumber}-${Date.now()}`,
    clueText: clue.clue.text,
    answer: clue.clue.answer,
    enumeration: clue.clue.enumeration,
    clueNumber: clue.clue.number,

    // V2 core structures
    clueType,
    definition,
    wordplays,

    // Metadata
    publication: puzzleMetadata?.publication,
    puzzleNumber: puzzleMetadata?.puzzleNumber,
    setter: puzzleMetadata?.setter,
    confidence: clue.confidence,
    comments: getCommentsArray(clue.comments),
  };
}

/**
 * Convert an entire puzzle file to array of PatternInstances
 */
export function convertPuzzleFile(puzzle: PuzzleFile): PatternInstance[] {
  const instances: PatternInstance[] = [];

  const puzzleMetadata = {
    publication: puzzle.metadata?.publisher,
    puzzleNumber: puzzle.metadata?.puzzle_number ? parseInt(puzzle.metadata.puzzle_number, 10) : undefined,
    setter: puzzle.metadata?.setter,
  };

  for (const [clueNumber, clue] of Object.entries(puzzle.clues)) {
    instances.push(convertClueToPatternInstance(clue, clueNumber, puzzleMetadata));
  }

  return instances;
}

/**
 * Convert a blog format clue to PatternInstance
 */
function convertBlogClueToPatternInstance(
  blogClue: BlogClue,
  puzzleMetadata?: { publication?: string; puzzleNumber?: number; setter?: string }
): PatternInstance {
  const clueNumber = `${blogClue.number}${blogClue.direction === 'across' ? 'A' : 'D'}`;

  // Blog format has simple wordplay text, not structured steps
  // Create a single explanation wordplay entry
  const wordplays: Wordplay[] = [{
    id: '1',
    indicator: '',
    operation: 'synonym' as OperationType,
    fodder: blogClue.wordplay || '',
    fodderLetterCount: 0,
    result: blogClue.answer,
    resultLetterCount: blogClue.answer.length,
    dependencies: [],
    state: createInitialState(),
    explanation: blogClue.wordplay || '',
  }];

  const definition: Definition = {
    text: blogClue.definition,
    position: blogClue.definition_position === 'entire' ? 'entire' : blogClue.definition_position,
  };

  return {
    id: `puzzle-${clueNumber}-${Date.now()}`,
    clueText: blogClue.clue_text,
    answer: blogClue.answer,
    enumeration: blogClue.enumeration,
    clueNumber: clueNumber,

    // V2 core structures
    clueType: { id: 'standard' as const },
    definition,
    wordplays,

    // Metadata
    publication: puzzleMetadata?.publication,
    puzzleNumber: puzzleMetadata?.puzzleNumber,
    setter: puzzleMetadata?.setter,
    confidence: 1.0,
    comments: [],
  };
}

/**
 * Convert a blog format puzzle file to array of PatternInstances
 */
function convertBlogPuzzleFile(puzzle: BlogPuzzleFile): PatternInstance[] {
  const instances: PatternInstance[] = [];

  const puzzleMetadata = {
    publication: puzzle.metadata?.publication,
    puzzleNumber: puzzle.metadata?.puzzle_number,
    setter: puzzle.metadata?.setter,
  };

  // Convert across clues
  for (const clue of puzzle.across) {
    instances.push(convertBlogClueToPatternInstance(clue, puzzleMetadata));
  }

  // Convert down clues
  for (const clue of puzzle.down) {
    instances.push(convertBlogClueToPatternInstance(clue, puzzleMetadata));
  }

  return instances;
}

/**
 * Load and convert a puzzle file from JSON
 * Supports both blog format (across/down arrays) and solver output format (clues object)
 * Always normalizes metadata to PuzzleMetadata format
 */
export function loadPuzzleFromJson(jsonContent: string): {
  metadata: PuzzleFile['metadata'];
  clues: PatternInstance[];
  rawData: PuzzleFile | BlogPuzzleFile | V2StoredClue;
} {
  const parsed = JSON.parse(jsonContent);

  // Check if this is blog format (across/down arrays)
  if (isBlogFormat(parsed)) {
    const blogPuzzle = parsed as BlogPuzzleFile;
    const clues = convertBlogPuzzleFile(blogPuzzle);

    // Convert blog metadata to PuzzleFile metadata format
    const metadata: PuzzleFile['metadata'] = {
      publisher: blogPuzzle.metadata.publication,
      puzzle_number: String(blogPuzzle.metadata.puzzle_number),
      setter: blogPuzzle.metadata.setter || 'Unknown',
    };

    return {
      metadata,
      clues,
      rawData: blogPuzzle,
    };
  }

  // Check if this is V2StoredClue format (single clue with full wordplay data)
  console.log('[puzzleConverter] Checking V2StoredClue:', isV2StoredClue(parsed), 'keys:', Object.keys(parsed));
  if (isV2StoredClue(parsed)) {
    console.log('[puzzleConverter] Detected V2StoredClue format');
    console.log('[puzzleConverter] Input wordplays:', JSON.stringify(parsed.clues?.wordplays?.map((w: any) => ({ id: w.id, indicator: w.indicator, operation: w.operation }))));
    const v2Clue = parsed as V2StoredClue;
    const patternInstance = convertV2StoredClueToPatternInstance(v2Clue);
    console.log('[puzzleConverter] Output wordplays:', JSON.stringify(patternInstance.wordplays?.map(w => ({ id: w.id, indicator: w.indicator, operation: w.operation }))));

    const metadata: PuzzleFile['metadata'] = {
      publisher: v2Clue.metadata.publisher,
      puzzle_number: v2Clue.metadata.puzzle_number,
      setter: v2Clue.metadata.setter,
    };

    return {
      metadata,
      clues: [patternInstance],
      rawData: v2Clue,
    };
  }

  // Otherwise, assume solver output format (multi-clue PuzzleFile)
  const puzzle: PuzzleFile = parsed;
  const clues = convertPuzzleFile(puzzle);

  return {
    metadata: puzzle.metadata,
    clues,
    rawData: puzzle,
  };
}

// ============================================
// V2 STORED CLUE CONVERSION
// ============================================

/**
 * Convert a V2StoredClue (direct JSON format) to PatternInstance
 * This handles clues that are already in V2 format
 */
export function convertV2StoredClueToPatternInstance(stored: V2StoredClue): PatternInstance {
  const clueData = stored.clues;

  // Map V2Wordplay to Wordplay (they should be compatible)
  const wordplays: Wordplay[] = clueData.wordplays.map(wp => ({
    id: wp.id,
    indicator: wp.indicator,
    operation: wp.operation as OperationType,
    fodder: wp.fodder,
    fodderLetterCount: wp.fodderLetterCount,
    result: wp.result,
    resultLetterCount: wp.resultLetterCount,
    dependencies: wp.dependencies,
    blockedHint: wp.blockedHint,
    state: wp.state,
    subOperations: wp.subOperations,
    explanation: wp.explanation,
    extractionType: wp.extractionType,
  }));

  // Determine clue type from structure
  let clueTypeId: 'standard' | 'double_definition' | 'cryptic_definition' | 'andit' = 'standard';
  if (clueData.definition.position === 'entire') {
    clueTypeId = 'cryptic_definition';
  }

  return {
    id: `puzzle-${clueData.clue.number}-${Date.now()}`,
    clueText: clueData.clue.text,
    answer: clueData.clue.answer,
    enumeration: clueData.clue.enumeration,
    clueNumber: clueData.clue.number,

    clueType: { id: clueTypeId },
    definition: clueData.definition,
    wordplays,

    publication: stored.metadata.publisher,
    puzzleNumber: parseInt(stored.metadata.puzzle_number, 10),
    setter: stored.metadata.setter,
    confidence: stored.confidence,
    comments: stored.comments,
  };
}

/**
 * Check if a JSON object is in V2StoredClue format
 */
export function isV2StoredClue(obj: unknown): obj is V2StoredClue {
  if (!obj || typeof obj !== 'object') return false;
  const candidate = obj as Record<string, unknown>;
  return (
    'metadata' in candidate &&
    'clues' in candidate &&
    typeof candidate.clues === 'object' &&
    candidate.clues !== null &&
    'wordplays' in (candidate.clues as Record<string, unknown>)
  );
}

// ============================================
// DEPRECATED V1 FUNCTIONS (for reference during migration)
// ============================================

/** @deprecated Use convertClueToPatternInstance instead */
export function migratePatternInstance(instance: PatternInstance): PatternInstance {
  // If already V2 format, return as-is
  if (instance.wordplays && instance.wordplays.length > 0) {
    return instance;
  }

  // Convert V1 wordplaySteps to V2 wordplays
  if (instance.wordplaySteps && instance.wordplaySteps.length > 0) {
    const wordplays: Wordplay[] = instance.wordplaySteps.map((step, index) => ({
      id: String(index + 1),
      indicator: step.indicator,
      operation: (step.stepType === 'assembly' ? 'charade' : step.stepType) as OperationType,
      fodder: step.fodder,
      fodderLetterCount: step.fodder.replace(/\s/g, '').length,
      result: step.result,
      resultLetterCount: step.result.length,
      dependencies: step.isAssembly ? instance.wordplaySteps!.slice(0, index).map((_, i) => String(i + 1)) : [],
      state: createInitialState(),
      explanation: step.explanation,
    }));

    return {
      ...instance,
      clueType: instance.clueType || { id: 'standard' as const },
      definition: {
        text: instance.definitionText || '',
        position: instance.definitionPosition || 'start',
      },
      wordplays,
    };
  }

  // Return with minimal V2 structure
  return {
    ...instance,
    clueType: instance.clueType || { id: 'standard' as const },
    definition: {
      text: instance.definitionText || '',
      position: instance.definitionPosition || 'start',
    },
    wordplays: [],
  };
}
