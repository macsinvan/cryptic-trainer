/**
 * Types for the new puzzle schema format (Times_Puzzles_*.json)
 *
 * This schema captures full puzzles with rich solve breakdowns including:
 * - Word-by-word role accounting
 * - Step-by-step solve traces
 * - Verification checks at each step
 * - Human-readable comments
 */

// ============================================
// CHECK TYPES (validation at each step)
// ============================================

export interface DefinitionCheck {
  method: 'definition_valid';
  answer_means_definition: boolean;
  pass: boolean;
}

export interface SynonymCheck {
  method: 'synonym_valid';
  pass: boolean;
}

export interface AnagramCheck {
  method: 'sorted_match';
  fodder_sorted: string;
  result_sorted: string;
  pass: boolean;
}

export interface CombinationCheck {
  method: 'combination_valid';
  pass: boolean;
}

export interface AssemblyCheck {
  method: 'matches_answer';
  answer: string;
  length_match: boolean;
  exact_match: boolean;
  pass: boolean;
}

export interface WordAccountingCheck {
  method: 'all_words_used';
  pass: boolean;
}

export type StepCheck = SynonymCheck | AnagramCheck | CombinationCheck;

// ============================================
// CLUE COMPONENTS
// ============================================

export type OperationType =
  | 'synonym'
  | 'anagram'
  | 'charade'
  | 'container'
  | 'reversal'
  | 'deletion'
  | 'hidden'
  | 'homophone'
  | 'abbreviation'
  | 'double_definition'
  | 'cryptic_definition';

export type WordRole = 'definition' | 'indicator' | 'fodder' | 'connector';

export interface ClueDefinition {
  text: string;
  position: 'start' | 'end';
}

export interface ClueMetadata {
  number: string;      // e.g., "1A", "12D"
  text: string;        // The full clue text
  enumeration: string; // e.g., "7", "9,6"
  answer: string;      // The answer
  definition: ClueDefinition[];
}

export interface SolveStep {
  step: number;
  operation: OperationType;
  clue_fragment: string;
  indicator: string | null;
  fodder: string | string[] | null;
  synonyms_considered?: string[];
  result: string;
  result_letters: string[];
  check: StepCheck;
  components?: string[];  // For charade steps: the parts being combined
}

export interface WordUsage {
  word: string;
  role: WordRole;
  step: number | null;
  position: number;
}

export interface WordAccounting {
  clue_words: string[];
  usage: WordUsage[];
  unaccounted: string[];
  check: WordAccountingCheck;
}

export interface Assembly {
  method: string;
  final_step: number;
  result: string;
  result_letters: string[];
  check: AssemblyCheck;
}

export interface Definition {
  text: string;
  position: 'start' | 'end';
  check: DefinitionCheck;
}

// ============================================
// FULL CLUE SOLVE
// ============================================

export interface PuzzleClue {
  clue: ClueMetadata;
  definition: Definition;
  steps: SolveStep[];
  word_accounting: WordAccounting;
  assembly: Assembly;
  confidence: number;
  comments: string | string[];
}

// ============================================
// PUZZLE FILE FORMAT
// ============================================

export interface PuzzleMetadata {
  publisher: string;
  puzzle_number: string;
  setter: string;
}

export interface PuzzleFile {
  metadata: PuzzleMetadata;
  clues: Record<string, PuzzleClue>;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get comments as an array (handles both string and string[] formats)
 */
export function getCommentsArray(comments: string | string[]): string[] {
  if (Array.isArray(comments)) {
    return comments;
  }
  return comments ? [comments] : [];
}

/**
 * Check if all validations passed for a clue
 */
export function isClueFullyValid(clue: PuzzleClue): boolean {
  const definitionValid = clue.definition.check.pass;
  const stepsValid = clue.steps.every(s => s.check.pass);
  const accountingValid = clue.word_accounting.check.pass;
  const assemblyValid = clue.assembly.check.pass;

  return definitionValid && stepsValid && accountingValid && assemblyValid;
}

/**
 * Extract unique operation types from steps (for techniques list)
 */
export function getOperationTypes(steps: SolveStep[]): OperationType[] {
  const types = new Set<OperationType>();
  steps.forEach(step => types.add(step.operation));
  return Array.from(types);
}
