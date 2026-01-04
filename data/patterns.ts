
import { Pattern, StepTemplate } from '../types';
import { LOCKED_HINTS } from './designTemplates';

// --- STEP TEMPLATES (The Reusable Instructions) ---

export const STEP_TEMPLATES: Record<string, StepTemplate> = {
    // 1. DEFINITION
    'STEP_IDENTIFY_DEF': {
        id: 'STEP_IDENTIFY_DEF',
        stage: 'DEFINITION',
        hints: {
            primary: LOCKED_HINTS.DEFINITION,
            highlight_color: 'GREEN'
        },
        actionPrompt: "Click the word or words you think form the definition.",
        interactionType: 'CLICK_WORD',
        targetVariable: 'def_text'
    },

    // 2. INDICATOR 1
    'STEP_IDENTIFY_IND_1': {
        id: 'STEP_IDENTIFY_IND_1',
        stage: 'INDICATOR',
        hints: {
            primary: LOCKED_HINTS.WP_INDICATOR,
            highlight_color: 'ORANGE'
        },
        actionPrompt: "Click the wordplay indicator.",
        interactionType: 'CLICK_WORD',
        targetVariable: 'indicator_1_text'
    },

    // 3. FODDER 1
    'STEP_IDENTIFY_FOD_1': {
        id: 'STEP_IDENTIFY_FOD_1',
        stage: 'FODDER',
        hints: {
            primary: LOCKED_HINTS.WP_FODDER,
            highlight_color: 'BLUE'
        },
        actionPrompt: "Work out the wordplay, then click 'Show Solution' to check.",
        interactionType: 'CLICK_WORD',
        targetVariable: 'fodder_1_text'
    },

    // 4. DECODE 1 (Synonym + Mod)
    'STEP_DECODE_SYNONYM_1': {
        id: 'STEP_DECODE_SYNONYM_1',
        stage: 'DECODE',
        hints: {
            primary: LOCKED_HINTS.WP_DECODE_TEMPLATE,
            highlight_color: 'SLATE'
        },
        actionPrompt: "Enter letters into the answer grid, or Continue to the next wordplay.",
        interactionType: 'READ_AND_CONTINUE',
        logicDisplay: "{{fodder_1_text}} → {{synonym_1}} → Apply '{{indicator_1_text}}' → {{result_1}}"
    },

    // 5. INDICATOR 2
    'STEP_IDENTIFY_IND_2': {
        id: 'STEP_IDENTIFY_IND_2',
        stage: 'INDICATOR',
        hints: {
            primary: "Scan the clue again from left to right. Can you spot the next wordplay indicator?",
            highlight_color: 'ORANGE'
        },
        actionPrompt: "Click the next indicator.",
        interactionType: 'CLICK_WORD',
        targetVariable: 'indicator_2_text'
    },

    // 6. FODDER 2
    'STEP_IDENTIFY_FOD_2': {
        id: 'STEP_IDENTIFY_FOD_2',
        stage: 'FODDER',
        hints: {
            primary: "Having found the indicator, decide what word it applies to.",
            highlight_color: 'BLUE'
        },
        actionPrompt: "Work out the wordplay, then click 'Show Solution' to check.",
        interactionType: 'CLICK_WORD',
        targetVariable: 'fodder_2_text'
    },

    // 7. DECODE 2 (Selection)
    'STEP_DECODE_SELECTION_2': {
        id: 'STEP_DECODE_SELECTION_2',
        stage: 'DECODE',
        hints: {
            primary: "Apply the instruction to the fodder and see what letter or letters you get.",
            highlight_color: 'SLATE'
        },
        actionPrompt: "Enter letters and continue.",
        interactionType: 'READ_AND_CONTINUE',
        logicDisplay: "Apply '{{indicator_2_text}}' to '{{fodder_2_text}}' → {{result_2}}"
    },

    // 8. FINAL SOLVE
    'STEP_SOLVE': {
        id: 'STEP_SOLVE',
        stage: 'SOLVE',
        hints: {
            primary: LOCKED_HINTS.FINAL_SOLVE,
            highlight_color: 'SLATE'
        },
        actionPrompt: "Enter your final answer.",
        interactionType: 'ENTER_TEXT'
    }
};

// --- AI FALLBACK TEMPLATES (Generated dynamically usually, but defined here for safety) ---
export const AI_TEMPLATES = {
    DEF: { ...STEP_TEMPLATES['STEP_IDENTIFY_DEF'], id: 'AI_DEF' },
    IND: { ...STEP_TEMPLATES['STEP_IDENTIFY_IND_1'], id: 'AI_IND', targetVariable: 'current_ind' },
    FOD: { ...STEP_TEMPLATES['STEP_IDENTIFY_FOD_1'], id: 'AI_FOD', targetVariable: 'current_fod' },
    DECODE: { ...STEP_TEMPLATES['STEP_DECODE_SYNONYM_1'], id: 'AI_DECODE', logicDisplay: "Apply '{{current_ind}}' to '{{current_fod}}'" },
    SOLVE: { ...STEP_TEMPLATES['STEP_SOLVE'], id: 'AI_SOLVE' }
};

// --- PATTERN REGISTRY ---

export const PATTERNS: Record<string, Pattern> = {
    'SYNONYM_DELETION': {
        id: 'SYNONYM_DELETION',
        name: 'Simple Deletion with Synonym',
        description: 'Find a synonym for the fodder, then apply a deletion operation.',
        steps: [
            'STEP_IDENTIFY_DEF',
            'STEP_IDENTIFY_IND_1',
            'STEP_IDENTIFY_FOD_1',
            'STEP_DECODE_SYNONYM_1',
            'STEP_SOLVE'
        ]
    },
    'COMPOSITE_SYNONYM_DELETION_CHARADE': {
        id: 'COMPOSITE_SYNONYM_DELETION_CHARADE',
        name: 'Deletion with Synonyms & Charades',
        description: 'A complex pattern involving a synonym substitution followed by a deletion, then combined with a positional charade.',
        steps: [
            'STEP_IDENTIFY_DEF',
            'STEP_IDENTIFY_IND_1',
            'STEP_IDENTIFY_FOD_1',
            'STEP_DECODE_SYNONYM_1',
            'STEP_IDENTIFY_IND_2',
            'STEP_IDENTIFY_FOD_2',
            'STEP_DECODE_SELECTION_2',
            'STEP_SOLVE'
        ]
    },
    'ACROSTIC': {
        id: 'ACROSTIC',
        name: 'Acrostic (First Letters)',
        description: 'Take the first letter of each word in the fodder.',
        steps: [
            'STEP_IDENTIFY_DEF',
            'STEP_IDENTIFY_IND_1',
            'STEP_IDENTIFY_FOD_1',
            'STEP_DECODE_SYNONYM_1',
            'STEP_SOLVE'
        ]
    },
    'ACROSTIC_CHARADE': {
        id: 'ACROSTIC_CHARADE',
        name: 'Acrostic + Charade',
        description: 'Take first letters of some words, combine with a synonym.',
        steps: [
            'STEP_IDENTIFY_DEF',
            'STEP_IDENTIFY_IND_1',
            'STEP_IDENTIFY_FOD_1',
            'STEP_DECODE_SYNONYM_1',
            'STEP_IDENTIFY_IND_2',
            'STEP_IDENTIFY_FOD_2',
            'STEP_DECODE_SELECTION_2',
            'STEP_SOLVE'
        ]
    },
    'COMPOSITE_CHARADE': {
        id: 'COMPOSITE_CHARADE',
        name: 'Composite Charade',
        description: 'Multiple wordplay components combined.',
        steps: [
            'STEP_IDENTIFY_DEF',
            'STEP_IDENTIFY_IND_1',
            'STEP_IDENTIFY_FOD_1',
            'STEP_DECODE_SYNONYM_1',
            'STEP_IDENTIFY_IND_2',
            'STEP_IDENTIFY_FOD_2',
            'STEP_DECODE_SELECTION_2',
            'STEP_SOLVE'
        ]
    },
    'ANAGRAM': {
        id: 'ANAGRAM',
        name: 'Anagram',
        description: 'Rearrange the letters of the fodder.',
        steps: [
            'STEP_IDENTIFY_DEF',
            'STEP_IDENTIFY_IND_1',
            'STEP_IDENTIFY_FOD_1',
            'STEP_DECODE_SYNONYM_1',
            'STEP_SOLVE'
        ]
    },
    'REVERSAL': {
        id: 'REVERSAL',
        name: 'Reversal',
        description: 'Reverse the letters of the fodder.',
        steps: [
            'STEP_IDENTIFY_DEF',
            'STEP_IDENTIFY_IND_1',
            'STEP_IDENTIFY_FOD_1',
            'STEP_DECODE_SYNONYM_1',
            'STEP_SOLVE'
        ]
    },
    'HIDDEN': {
        id: 'HIDDEN',
        name: 'Hidden Word',
        description: 'The answer is hidden within the clue text.',
        steps: [
            'STEP_IDENTIFY_DEF',
            'STEP_IDENTIFY_IND_1',
            'STEP_IDENTIFY_FOD_1',
            'STEP_DECODE_SYNONYM_1',
            'STEP_SOLVE'
        ]
    },
    'DELETION_FIRST': {
        id: 'DELETION_FIRST',
        name: 'First Letter Deletion',
        description: 'Remove the first letter from a word.',
        steps: [
            'STEP_IDENTIFY_DEF',
            'STEP_IDENTIFY_IND_1',
            'STEP_IDENTIFY_FOD_1',
            'STEP_DECODE_SYNONYM_1',
            'STEP_SOLVE'
        ]
    },
    'DELETION_LAST': {
        id: 'DELETION_LAST',
        name: 'Last Letter Deletion',
        description: 'Remove the last letter from a word.',
        steps: [
            'STEP_IDENTIFY_DEF',
            'STEP_IDENTIFY_IND_1',
            'STEP_IDENTIFY_FOD_1',
            'STEP_DECODE_SYNONYM_1',
            'STEP_SOLVE'
        ]
    }
};

export const getStepTemplate = (id: string): StepTemplate | undefined => {
    return STEP_TEMPLATES[id];
};

export const getPattern = (id: string): Pattern | undefined => {
    return PATTERNS[id];
};
