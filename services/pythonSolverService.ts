/**
 * Python Solver Service
 * Calls the Python cryptic_trainer solver via HTTP
 */

import { PatternInstance, ClueEvaluation } from '../types';

const SOLVER_URL = '/api/solve';

interface SolverRequest {
    clue: string;
    length?: number;
    knownAnswer?: string;
    pattern?: string;
}

interface SolverResponse {
    clue: string;
    answer_len: number;
    pattern: string | null;
    known_answer: string | null;
    tokens_raw: string[];
    tokens_modified: string[];
    testament_hint: string | null;
    indicator_hits: Array<{
        kind: string;
        text: string;
        start: number;
        end: number;
    }>;
    frames: unknown[];
    proofs: unknown[];
    top_candidates: Array<{ answer: string; count: number }>;
    patternData?: PatternInstance;
    error?: string;
}

/**
 * Call the Python solver and get PatternInstance data
 */
export async function solveCluePython(
    clue: string,
    length?: number,
    knownAnswer?: string
): Promise<{ patternData: PatternInstance | null; evaluation: ClueEvaluation | null; raw: SolverResponse }> {
    const request: SolverRequest = {
        clue,
        length,
        knownAnswer
    };

    const response = await fetch(SOLVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
    });

    if (!response.ok) {
        throw new Error(`Solver error: ${response.status}`);
    }

    const data: SolverResponse = await response.json();

    if (data.error) {
        throw new Error(data.error);
    }

    // Extract pattern data if available
    const patternData = data.patternData || null;

    // Build a minimal ClueEvaluation for compatibility
    let evaluation: ClueEvaluation | null = null;
    if (patternData) {
        evaluation = {
            id: patternData.id,
            clue: patternData.clueText,
            answer: patternData.answer,
            type: patternData.patternId || patternData.variables['technique'] || 'unknown',
            difficulty: 'Medium',
            definition: {
                text: patternData.definitionText || patternData.variables['def_text'] || '',
                position: (patternData.definitionPosition?.toUpperCase() as 'START' | 'END' | 'ENTIRE') || 'END'
            },
            wordplay: [],
            structure: patternData.parsingSummary || ''
        };
    }

    return { patternData, evaluation, raw: data };
}

/**
 * Check if the Python solver is available
 */
export async function isPythonSolverAvailable(): Promise<boolean> {
    try {
        const response = await fetch(SOLVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clue: 'test (4)', length: 4 })
        });
        return response.ok;
    } catch {
        return false;
    }
}
