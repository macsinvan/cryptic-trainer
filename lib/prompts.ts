/**
 * Prompts Store - Centralized configuration for all UI prompts
 *
 * These prompts are keyed by operation type and phase, making them easy to:
 * 1. Reference in tests (verify correct prompt displayed for each step)
 * 2. Update consistently across the app
 * 3. Localize if needed in the future
 *
 * Key format: PROMPTS[operationType][phase][promptType]
 * Example: PROMPTS.anagram.indicator.instruction
 */

export type Phase = 'indicator' | 'fodder' | 'result' | 'deleteTarget' | 'decodeMethod' | 'discovery';
export type PromptType = 'instruction' | 'hint' | 'button';

export interface PhasePrompts {
  instruction: string;
  hint: string;
  button: string;
}

export interface OperationPrompts {
  label: string;  // Display name for the operation (e.g., "Anagram", "Hidden Word")
  indicator?: PhasePrompts;
  fodder?: PhasePrompts;
  result?: PhasePrompts;
  deleteTarget?: PhasePrompts;
}

// Operation type labels (used in button text like "Find the anagram indicator")
export const OPERATION_LABELS: Record<string, string> = {
  'anagram': 'Anagram',
  'container': 'Container',
  'hidden': 'Hidden Word',
  'reversal': 'Reversal',
  'deletion': 'Deletion',
  'homophone': 'Homophone',
  'abbreviation': 'Abbreviation',
  'letter_selection': 'Letter Selection',
  'letter_movement': 'Letter Movement',
  'synonym': 'Synonym',
  'assembly': 'Assembly',
  'fodder_selection': 'Fodder Selection',
  'solve_anagram': 'Solve Anagram',
};

/**
 * All UI prompts organized by operation type and phase.
 *
 * For operations with indicators (anagram, container, reversal, etc.):
 *   Phase order: indicator → fodder → result
 *
 * For fodder_selection:
 *   Phase order: indicator → fodder (auto-completes, no result phase)
 *
 * For indicatorless operations (synonym, abbreviation):
 *   Uses Socratic approach with decodeMethod phase
 */
export const PROMPTS: Record<string, OperationPrompts> = {
  // === ANAGRAM ===
  anagram: {
    label: 'Anagram',
    indicator: {
      instruction: 'Tap the anagram indicator in the clue above',
      hint: 'Look for a word that signals letters should be rearranged',
      button: 'Find the anagram indicator',
    },
    fodder: {
      instruction: 'Now tap the fodder words in the clue above',
      hint: 'The fodder is adjacent to the indicator in the clue',
      button: 'Find the fodder',
    },
    result: {
      instruction: 'Type the result of this wordplay step',
      hint: 'Rearrange the fodder letters to form the result',
      button: 'Check result',
    },
  },

  // === CONTAINER ===
  container: {
    label: 'Container',
    indicator: {
      instruction: 'Tap the container indicator in the clue above',
      hint: 'Look for a word that signals one thing goes inside another',
      button: 'Find the container indicator',
    },
    fodder: {
      instruction: 'Now tap the fodder words in the clue above',
      hint: 'The fodder is adjacent to the indicator in the clue',
      button: 'Find the fodder',
    },
    result: {
      instruction: 'Type the result of this wordplay step',
      hint: 'Put one part inside the other as indicated',
      button: 'Check result',
    },
  },

  // === HIDDEN WORD ===
  hidden: {
    label: 'Hidden Word',
    indicator: {
      instruction: 'Tap the hidden word indicator in the clue above',
      hint: 'Look for a word that signals the answer is hidden within',
      button: 'Find the hidden word indicator',
    },
    fodder: {
      instruction: 'Now tap the fodder words in the clue above',
      hint: 'The fodder is adjacent to the indicator in the clue',
      button: 'Find the fodder',
    },
    result: {
      instruction: 'Type the result of this wordplay step',
      hint: 'Find the hidden word within the fodder',
      button: 'Check result',
    },
  },

  // === REVERSAL ===
  reversal: {
    label: 'Reversal',
    indicator: {
      instruction: 'Tap the reversal indicator in the clue above',
      hint: 'Look for a word that signals letters should be reversed',
      button: 'Find the reversal indicator',
    },
    fodder: {
      instruction: 'Now tap the fodder words in the clue above',
      hint: 'The fodder is adjacent to the indicator in the clue',
      button: 'Find the fodder',
    },
    result: {
      instruction: 'Type the result of this wordplay step',
      hint: 'Reverse the fodder letters',
      button: 'Check result',
    },
  },

  // === DELETION ===
  deletion: {
    label: 'Deletion',
    indicator: {
      instruction: 'Tap the deletion indicator in the clue above',
      hint: 'Look for a word that signals something should be removed',
      button: 'Find the deletion indicator',
    },
    deleteTarget: {
      instruction: 'Now tap what should be deleted',
      hint: 'The indicator tells you to remove something',
      button: 'Find the deletion target',
    },
    fodder: {
      instruction: 'Now tap the fodder words in the clue above',
      hint: 'The fodder is adjacent to the indicator in the clue',
      button: 'Find the fodder',
    },
    result: {
      instruction: 'Type the result of this wordplay step',
      hint: 'Remove the indicated letters from the fodder',
      button: 'Check result',
    },
  },

  // === HOMOPHONE ===
  homophone: {
    label: 'Homophone',
    indicator: {
      instruction: 'Tap the homophone indicator in the clue above',
      hint: 'Look for a word that signals something sounds like something else',
      button: 'Find the homophone indicator',
    },
    fodder: {
      instruction: 'Now tap the fodder words in the clue above',
      hint: 'The fodder is adjacent to the indicator in the clue',
      button: 'Find the fodder',
    },
    result: {
      instruction: 'Type the result of this wordplay step',
      hint: 'Find a word that sounds like the fodder',
      button: 'Check result',
    },
  },

  // === LETTER SELECTION ===
  letter_selection: {
    label: 'Letter Selection',
    indicator: {
      instruction: 'Tap the letter selection indicator in the clue above',
      hint: 'Look for a word that signals specific letters should be selected',
      button: 'Find the letter selection indicator',
    },
    fodder: {
      instruction: 'Now tap the fodder words in the clue above',
      hint: 'The fodder is adjacent to the indicator in the clue',
      button: 'Find the fodder',
    },
    result: {
      instruction: 'Type the result of this wordplay step',
      hint: 'Select the indicated letters from the fodder',
      button: 'Check result',
    },
  },

  // === LETTER MOVEMENT ===
  letter_movement: {
    label: 'Letter Movement',
    indicator: {
      instruction: 'Tap the letter movement indicator in the clue above',
      hint: 'Look for a word that signals letters should be moved',
      button: 'Find the letter movement indicator',
    },
    fodder: {
      instruction: 'Now tap the fodder words in the clue above',
      hint: 'The fodder is adjacent to the indicator in the clue',
      button: 'Find the fodder',
    },
    result: {
      instruction: 'Type the result of this wordplay step',
      hint: 'Move the indicated letters as specified',
      button: 'Check result',
    },
  },

  // === FODDER SELECTION (auto-completes after fodder phase) ===
  fodder_selection: {
    label: 'Fodder Selection',
    indicator: {
      instruction: 'Tap the indicator in the clue above',
      hint: 'Look for a word that signals which fodder to select',
      button: 'Find the indicator',
    },
    fodder: {
      instruction: 'Now tap the fodder words in the clue above',
      hint: 'The fodder is adjacent to the indicator in the clue',
      button: 'Find the fodder',
    },
    // NO result phase - fodder_selection auto-completes after fodder
  },

  // === SOLVE ANAGRAM (final step after gathering fodder from other operations) ===
  solve_anagram: {
    label: 'Solve Anagram',
    indicator: {
      instruction: 'Tap the anagram indicator in the clue above',
      hint: 'Look for a word that signals letters should be rearranged',
      button: 'Find the anagram indicator',
    },
    fodder: {
      instruction: 'Now tap the fodder words in the clue above',
      hint: 'The fodder is adjacent to the indicator in the clue',
      button: 'Find the fodder',
    },
    result: {
      instruction: 'Type the result of this wordplay step',
      hint: 'Rearrange the combined fodder letters to form the answer',
      button: 'Check result',
    },
  },

  // === ASSEMBLY (joining parts together) ===
  assembly: {
    label: 'Assembly',
    indicator: {
      instruction: 'Tap the assembly indicator in the clue above',
      hint: 'Look for a word that signals parts should be joined',
      button: 'Find the assembly indicator',
    },
    fodder: {
      instruction: 'Now tap the fodder words in the clue above',
      hint: 'The fodder is adjacent to the indicator in the clue',
      button: 'Find the fodder',
    },
    result: {
      instruction: 'Type the result of this wordplay step',
      hint: 'Combine the parts as indicated',
      button: 'Check result',
    },
  },

  // === SYNONYM (indicatorless - uses Socratic approach) ===
  synonym: {
    label: 'Synonym',
    fodder: {
      instruction: 'Select a word to decode',
      hint: 'This word has a cryptic synonym',
      button: 'Select word',
    },
    result: {
      instruction: 'What synonym does this word give you?',
      hint: 'Think of common cryptic synonyms',
      button: 'Check synonym',
    },
  },

  // === ABBREVIATION (indicatorless - uses Socratic approach) ===
  abbreviation: {
    label: 'Abbreviation',
    fodder: {
      instruction: 'Select a word to decode',
      hint: 'This word has a cryptic abbreviation',
      button: 'Select word',
    },
    result: {
      instruction: 'What abbreviation does this word give you?',
      hint: 'Think of common cryptic abbreviations',
      button: 'Check abbreviation',
    },
  },

  // === GENERIC FALLBACK ===
  unknown: {
    label: 'Wordplay',
    indicator: {
      instruction: 'Tap the indicator in the clue above',
      hint: 'Look for a word that signals the wordplay type',
      button: 'Find the indicator',
    },
    fodder: {
      instruction: 'Now tap the fodder words in the clue above',
      hint: 'The fodder is adjacent to the indicator in the clue',
      button: 'Find the fodder',
    },
    result: {
      instruction: 'Type the result of this wordplay step',
      hint: 'Apply the operation to the fodder',
      button: 'Check result',
    },
  },
};

/**
 * Helper function to get prompt for a specific operation, phase, and prompt type.
 * Falls back to 'unknown' operation if the specific operation isn't found.
 *
 * @param operationType - The operation type (e.g., 'anagram', 'container')
 * @param phase - The current phase (e.g., 'indicator', 'fodder', 'result')
 * @param promptType - The type of prompt (e.g., 'instruction', 'hint', 'button')
 * @returns The prompt string, or empty string if not found
 */
export function getPrompt(
  operationType: string,
  phase: Phase,
  promptType: PromptType
): string {
  const operation = PROMPTS[operationType] || PROMPTS.unknown;
  const phasePrompts = operation[phase];
  if (!phasePrompts) return '';
  return phasePrompts[promptType] || '';
}

/**
 * Helper function to get the display label for an operation type.
 *
 * @param operationType - The operation type (e.g., 'anagram', 'letter_selection')
 * @returns The display label (e.g., 'Anagram', 'Letter Selection')
 */
export function getOperationLabel(operationType: string): string {
  return OPERATION_LABELS[operationType] || 'Wordplay';
}

/**
 * Check if an operation type requires a result phase.
 * fodder_selection auto-completes after fodder phase.
 *
 * @param operationType - The operation type
 * @returns true if the operation requires result entry, false otherwise
 */
export function operationRequiresResult(operationType: string): boolean {
  return operationType !== 'fodder_selection';
}
