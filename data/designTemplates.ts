
/**
 * LOCKED DESIGN TEMPLATES
 * -----------------------
 * This file contains the immutable design constants for the Cryptic Trainer.
 * Modifications to these values must be approved against the INTERACTIVE_SOLVE_FLOW.md
 */

// 1. Color System (Tailwind Classes)
// Keys match highlight_color values in step templates: 'GREEN', 'ORANGE', 'BLUE'
export const WORKFLOW_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    GREEN: {
        bg: 'bg-green-200',
        text: 'text-green-900',
        border: 'border-green-300',
        dot: 'bg-green-500'
    },
    ORANGE: {
        bg: 'bg-orange-200',
        text: 'text-orange-900',
        border: 'border-orange-300',
        dot: 'bg-orange-500'
    },
    BLUE: {
        bg: 'bg-blue-200',
        text: 'text-blue-900',
        border: 'border-blue-300',
        dot: 'bg-blue-500'
    }
};

// 2. Exact Hint Text (From the stored MD file)
export const LOCKED_HINTS = {
    DEFINITION: "The definition is usually at the start or the end of the clue. Sometimes the whole clue is the definition, or there may be two.",
    
    // Wordplay 1 Hints
    WP_INDICATOR: "The Times uses a limited set of common signals for wordplay. Read the clue and try to spot the most obvious one.",
    WP_FODDER: "Now that we’ve found the indicator, decide what word or words the instruction applies to. In Times clues, this is usually right next to the indicator.",
    
    // Decoding Hint (Complex)
    WP_DECODE_TEMPLATE: `Look at the fodder and consider the instruction.
If applying it directly doesn’t fit the answer length, don’t force it.

This usually means you need to find a **simple synonym** that *does* fit,
then apply the instruction to that.`,

    // Solve Hint
    FINAL_SOLVE: "You now have all the information needed to solve this clue. Use the definition to check that your answer makes sense."
};

// 3. Workflow State Machine Template
export type WorkflowStage = 'DEFINITION' | 'INDICATOR' | 'FODDER' | 'DECODE' | 'SOLVE';

export const WORKFLOW_SEQUENCE: WorkflowStage[] = [
    'DEFINITION',
    'INDICATOR',
    'FODDER',
    'DECODE',
    'SOLVE'
];
