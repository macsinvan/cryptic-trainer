"""
Prompts Store - Centralized configuration for all UI prompts (Python mirror).

This file mirrors lib/prompts.ts to enable Python tests to verify correct prompts.
Keep in sync with the TypeScript version.

Key format: PROMPTS[operation_type][phase][prompt_type]
Example: PROMPTS['anagram']['indicator']['instruction']
"""

from typing import Dict, Optional

# Operation type labels (used in button text like "Find the anagram indicator")
OPERATION_LABELS: Dict[str, str] = {
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
}

# All UI prompts organized by operation type and phase
PROMPTS: Dict[str, Dict[str, Dict[str, str]]] = {
    # === ANAGRAM ===
    'anagram': {
        'label': 'Anagram',
        'indicator': {
            'instruction': 'Tap the anagram indicator in the clue above',
            'hint': 'Look for a word that signals letters should be rearranged',
            'button': 'Find the anagram indicator',
        },
        'fodder': {
            'instruction': 'Now tap the fodder words in the clue above',
            'hint': 'The fodder is adjacent to the indicator in the clue',
            'button': 'Find the fodder',
        },
        'result': {
            'instruction': 'Type the result of this wordplay step',
            'hint': 'Rearrange the fodder letters to form the result',
            'button': 'Check result',
        },
    },

    # === CONTAINER ===
    'container': {
        'label': 'Container',
        'indicator': {
            'instruction': 'Tap the container indicator in the clue above',
            'hint': 'Look for a word that signals one thing goes inside another',
            'button': 'Find the container indicator',
        },
        'fodder': {
            'instruction': 'Now tap the fodder words in the clue above',
            'hint': 'The fodder is adjacent to the indicator in the clue',
            'button': 'Find the fodder',
        },
        'result': {
            'instruction': 'Type the result of this wordplay step',
            'hint': 'Put one part inside the other as indicated',
            'button': 'Check result',
        },
    },

    # === HIDDEN WORD ===
    'hidden': {
        'label': 'Hidden Word',
        'indicator': {
            'instruction': 'Tap the hidden word indicator in the clue above',
            'hint': 'Look for a word that signals the answer is hidden within',
            'button': 'Find the hidden word indicator',
        },
        'fodder': {
            'instruction': 'Now tap the fodder words in the clue above',
            'hint': 'The fodder is adjacent to the indicator in the clue',
            'button': 'Find the fodder',
        },
        'result': {
            'instruction': 'Type the result of this wordplay step',
            'hint': 'Find the hidden word within the fodder',
            'button': 'Check result',
        },
    },

    # === REVERSAL ===
    'reversal': {
        'label': 'Reversal',
        'indicator': {
            'instruction': 'Tap the reversal indicator in the clue above',
            'hint': 'Look for a word that signals letters should be reversed',
            'button': 'Find the reversal indicator',
        },
        'fodder': {
            'instruction': 'Now tap the fodder words in the clue above',
            'hint': 'The fodder is adjacent to the indicator in the clue',
            'button': 'Find the fodder',
        },
        'result': {
            'instruction': 'Type the result of this wordplay step',
            'hint': 'Reverse the fodder letters',
            'button': 'Check result',
        },
    },

    # === DELETION ===
    'deletion': {
        'label': 'Deletion',
        'indicator': {
            'instruction': 'Tap the deletion indicator in the clue above',
            'hint': 'Look for a word that signals something should be removed',
            'button': 'Find the deletion indicator',
        },
        'deleteTarget': {
            'instruction': 'Now tap what should be deleted',
            'hint': 'The indicator tells you to remove something',
            'button': 'Find the deletion target',
        },
        'fodder': {
            'instruction': 'Now tap the fodder words in the clue above',
            'hint': 'The fodder is adjacent to the indicator in the clue',
            'button': 'Find the fodder',
        },
        'result': {
            'instruction': 'Type the result of this wordplay step',
            'hint': 'Remove the indicated letters from the fodder',
            'button': 'Check result',
        },
    },

    # === HOMOPHONE ===
    'homophone': {
        'label': 'Homophone',
        'indicator': {
            'instruction': 'Tap the homophone indicator in the clue above',
            'hint': 'Look for a word that signals something sounds like something else',
            'button': 'Find the homophone indicator',
        },
        'fodder': {
            'instruction': 'Now tap the fodder words in the clue above',
            'hint': 'The fodder is adjacent to the indicator in the clue',
            'button': 'Find the fodder',
        },
        'result': {
            'instruction': 'Type the result of this wordplay step',
            'hint': 'Find a word that sounds like the fodder',
            'button': 'Check result',
        },
    },

    # === LETTER SELECTION ===
    'letter_selection': {
        'label': 'Letter Selection',
        'indicator': {
            'instruction': 'Tap the letter selection indicator in the clue above',
            'hint': 'Look for a word that signals specific letters should be selected',
            'button': 'Find the letter selection indicator',
        },
        'fodder': {
            'instruction': 'Now tap the fodder words in the clue above',
            'hint': 'The fodder is adjacent to the indicator in the clue',
            'button': 'Find the fodder',
        },
        'result': {
            'instruction': 'Type the result of this wordplay step',
            'hint': 'Select the indicated letters from the fodder',
            'button': 'Check result',
        },
    },

    # === LETTER MOVEMENT ===
    'letter_movement': {
        'label': 'Letter Movement',
        'indicator': {
            'instruction': 'Tap the letter movement indicator in the clue above',
            'hint': 'Look for a word that signals letters should be moved',
            'button': 'Find the letter movement indicator',
        },
        'fodder': {
            'instruction': 'Now tap the fodder words in the clue above',
            'hint': 'The fodder is adjacent to the indicator in the clue',
            'button': 'Find the fodder',
        },
        'result': {
            'instruction': 'Type the result of this wordplay step',
            'hint': 'Move the indicated letters as specified',
            'button': 'Check result',
        },
    },

    # === FODDER SELECTION (auto-completes after fodder phase) ===
    'fodder_selection': {
        'label': 'Fodder Selection',
        'indicator': {
            'instruction': 'Tap the indicator in the clue above',
            'hint': 'Look for a word that signals which fodder to select',
            'button': 'Find the indicator',
        },
        'fodder': {
            'instruction': 'Now tap the fodder words in the clue above',
            'hint': 'The fodder is adjacent to the indicator in the clue',
            'button': 'Find the fodder',
        },
        # NO result phase - fodder_selection auto-completes after fodder
    },

    # === SOLVE ANAGRAM (final step after gathering fodder) ===
    'solve_anagram': {
        'label': 'Solve Anagram',
        'indicator': {
            'instruction': 'Tap the anagram indicator in the clue above',
            'hint': 'Look for a word that signals letters should be rearranged',
            'button': 'Find the anagram indicator',
        },
        'fodder': {
            'instruction': 'Now tap the fodder words in the clue above',
            'hint': 'The fodder is adjacent to the indicator in the clue',
            'button': 'Find the fodder',
        },
        'result': {
            'instruction': 'Type the result of this wordplay step',
            'hint': 'Rearrange the fodder letters to form the result',
            'button': 'Check result',
        },
    },

    # === ASSEMBLY (joining parts together) ===
    'assembly': {
        'label': 'Assembly',
        'indicator': {
            'instruction': 'Tap the assembly indicator in the clue above',
            'hint': 'Look for a word that signals parts should be joined',
            'button': 'Find the assembly indicator',
        },
        'fodder': {
            'instruction': 'Now tap the fodder words in the clue above',
            'hint': 'The fodder is adjacent to the indicator in the clue',
            'button': 'Find the fodder',
        },
        'result': {
            'instruction': 'Type the result of this wordplay step',
            'hint': 'Combine the parts as indicated',
            'button': 'Check result',
        },
    },

    # === SYNONYM (indicatorless - uses Socratic approach) ===
    'synonym': {
        'label': 'Synonym',
        'fodder': {
            'instruction': 'Select a word to decode',
            'hint': 'This word has a cryptic synonym',
            'button': 'Select word',
        },
        'result': {
            'instruction': 'What synonym does this word give you?',
            'hint': 'Think of common cryptic synonyms',
            'button': 'Check synonym',
        },
    },

    # === ABBREVIATION (indicatorless - uses Socratic approach) ===
    'abbreviation': {
        'label': 'Abbreviation',
        'fodder': {
            'instruction': 'Select a word to decode',
            'hint': 'This word has a cryptic abbreviation',
            'button': 'Select word',
        },
        'result': {
            'instruction': 'What abbreviation does this word give you?',
            'hint': 'Think of common cryptic abbreviations',
            'button': 'Check abbreviation',
        },
    },

    # === GENERIC FALLBACK ===
    'unknown': {
        'label': 'Wordplay',
        'indicator': {
            'instruction': 'Tap the indicator in the clue above',
            'hint': 'Look for a word that signals the wordplay type',
            'button': 'Find the indicator',
        },
        'fodder': {
            'instruction': 'Now tap the fodder words in the clue above',
            'hint': 'The fodder is adjacent to the indicator in the clue',
            'button': 'Find the fodder',
        },
        'result': {
            'instruction': 'Type the result of this wordplay step',
            'hint': 'Apply the operation to the fodder',
            'button': 'Check result',
        },
    },
}


def get_prompt(operation_type: str, phase: str, prompt_type: str) -> str:
    """Get prompt for a specific operation, phase, and prompt type.

    Falls back to 'unknown' operation if the specific operation isn't found.

    Args:
        operation_type: The operation type (e.g., 'anagram', 'container')
        phase: The current phase (e.g., 'indicator', 'fodder', 'result')
        prompt_type: The type of prompt (e.g., 'instruction', 'hint', 'button')

    Returns:
        The prompt string, or empty string if not found
    """
    operation = PROMPTS.get(operation_type, PROMPTS['unknown'])
    phase_prompts = operation.get(phase, {})
    return phase_prompts.get(prompt_type, '')


def get_operation_label(operation_type: str) -> str:
    """Get the display label for an operation type.

    Args:
        operation_type: The operation type (e.g., 'anagram', 'letter_selection')

    Returns:
        The display label (e.g., 'Anagram', 'Letter Selection')
    """
    return OPERATION_LABELS.get(operation_type, 'Wordplay')


def operation_requires_result(operation_type: str) -> bool:
    """Check if an operation type requires a result phase.

    fodder_selection auto-completes after fodder phase.

    Args:
        operation_type: The operation type

    Returns:
        True if the operation requires result entry, False otherwise
    """
    return operation_type != 'fodder_selection'
