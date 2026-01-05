
// AI Service Abstraction Layer
// Allows switching between Claude and Gemini via AI_PROVIDER environment variable
// Default: claude

import { ClueEvaluation, ScannedCrossword } from "../types";
import { learnSynonym, lookupSynonyms, SYNONYM_DICTIONARY } from "../data/synonymDictionary";

// --- Common Interfaces ---

export interface SolvedClue {
    answer: string;
    definition: string;
    definitionPosition: 'START' | 'END' | 'ENTIRE';
    parsing: string;
    confidence: 'high' | 'medium' | 'low';
    explanation: string;
}

export interface GeneratedChallenge {
    clue: string;
    answer: string;
    explanation: string;
}

export interface ChallengeVerification {
    isValid: boolean;
    feedback: string;
    evaluation?: ClueEvaluation;
}

export interface HypothesisVerification {
    valid: boolean;
    synonym: string | null;
    answer: string | null;
    confidence: 'high' | 'medium' | 'low' | 'cannot_verify';
    reasoning: string;
}

export interface HypothesisInput {
    definition: string;
    synonymFodder: string;
    requiredLetterCount: number;
    knownParts: string[];
    targetLength: number;
}

export interface AIProvider {
    evaluateClue(clue: string, context?: string): Promise<ClueEvaluation | null>;
    generateChallenge(setter: string, clueType: string): Promise<GeneratedChallenge | null>;
    analyzeCrosswordImage(publication: string, base64: string, mimeType: string): Promise<ScannedCrossword | null>;
    verifyClueChallenge(clue: string, answer: string, proposal: string): Promise<ChallengeVerification | null>;
    validateTutorResponse(clue: string, stageType: string, userInput: string, targetExpected: string): Promise<{ isCorrect: boolean; feedback: string }>;
    quickIdentifyDefinition(clue: string): Promise<string>;
    verifySynonym(word: string, answer: string): Promise<boolean>;
    solveClue(clue: string): Promise<SolvedClue | null>;
    verifyHypothesis?(hypothesis: HypothesisInput): Promise<HypothesisVerification>;
    testHypotheses?(hypotheses: HypothesisInput[]): Promise<{
        bestHypothesis: number | null;
        results: HypothesisVerification[];
    }>;
}

// --- Provider Selection ---

type ProviderType = 'claude' | 'gemini';

const getProviderType = (): ProviderType => {
    const provider = (import.meta.env.VITE_AI_PROVIDER || 'claude').toLowerCase();
    if (provider === 'gemini') return 'gemini';
    return 'claude'; // Default to Claude
};

// --- Lazy Loading of Providers ---

let currentProvider: AIProvider | null = null;
let currentProviderType: ProviderType | null = null;

const getProvider = async (): Promise<AIProvider> => {
    const providerType = getProviderType();

    // Return cached provider if same type
    if (currentProvider && currentProviderType === providerType) {
        return currentProvider;
    }

    // Load the appropriate provider
    if (providerType === 'gemini') {
        const { GeminiProvider } = await import('./geminiProvider');
        currentProvider = new GeminiProvider();
    } else {
        const { ClaudeProvider } = await import('./claudeProvider');
        currentProvider = new ClaudeProvider();
    }

    currentProviderType = providerType;
    return currentProvider;
};

// --- Exported Functions (maintain backward compatibility) ---

export async function evaluateClue(clue: string, context: string = ""): Promise<ClueEvaluation | null> {
    const provider = await getProvider();
    return provider.evaluateClue(clue, context);
}

export async function generateChallenge(setter: string, clueType: string): Promise<GeneratedChallenge | null> {
    const provider = await getProvider();
    return provider.generateChallenge(setter, clueType);
}

export async function analyzeCrosswordImage(publication: string, base64: string, mimeType: string): Promise<ScannedCrossword | null> {
    const provider = await getProvider();
    return provider.analyzeCrosswordImage(publication, base64, mimeType);
}

export async function verifyClueChallenge(clue: string, answer: string, proposal: string): Promise<ChallengeVerification | null> {
    const provider = await getProvider();
    return provider.verifyClueChallenge(clue, answer, proposal);
}

export async function validateTutorResponse(clue: string, stageType: string, userInput: string, targetExpected: string): Promise<{ isCorrect: boolean; feedback: string }> {
    const provider = await getProvider();
    return provider.validateTutorResponse(clue, stageType, userInput, targetExpected);
}

export async function quickIdentifyDefinition(clue: string): Promise<string> {
    const provider = await getProvider();
    return provider.quickIdentifyDefinition(clue);
}

export async function verifySynonym(word: string, answer: string): Promise<boolean> {
    const provider = await getProvider();
    const result = await provider.verifySynonym(word, answer);

    // If AI confirmed the synonym and we didn't have it in our dictionary, learn it
    if (result) {
        const existingSynonyms = lookupSynonyms(word);
        const answerUpper = answer.toUpperCase().trim();
        if (!existingSynonyms.includes(answerUpper)) {
            learnSynonym(word, answer);
        }
    }

    return result;
}

export async function solveClue(clue: string): Promise<SolvedClue | null> {
    const provider = await getProvider();
    return provider.solveClue(clue);
}

export async function verifyHypothesis(hypothesis: HypothesisInput): Promise<HypothesisVerification> {
    const provider = await getProvider();
    if (provider.verifyHypothesis) {
        return provider.verifyHypothesis(hypothesis);
    }
    return {
        valid: false,
        synonym: null,
        answer: null,
        confidence: 'cannot_verify',
        reasoning: 'Provider does not support hypothesis verification'
    };
}

export async function testHypotheses(hypotheses: HypothesisInput[]): Promise<{
    bestHypothesis: number | null;
    results: HypothesisVerification[];
}> {
    const provider = await getProvider();
    let testResult: { bestHypothesis: number | null; results: HypothesisVerification[] };

    if (provider.testHypotheses) {
        testResult = await provider.testHypotheses(hypotheses);
    } else {
        // Fallback: test each hypothesis individually
        const results: HypothesisVerification[] = [];
        for (const h of hypotheses) {
            results.push(await verifyHypothesis(h));
        }
        const validIdx = results.findIndex(r => r.valid);
        testResult = {
            bestHypothesis: validIdx >= 0 ? validIdx : null,
            results
        };
    }

    // Learn from successful hypothesis validation
    if (testResult.bestHypothesis !== null) {
        const winningHypothesis = hypotheses[testResult.bestHypothesis];
        const winningResult = testResult.results[testResult.bestHypothesis];

        // Learn the definition → answer mapping
        if (winningHypothesis.definition && winningResult.answer) {
            learnSynonym(winningHypothesis.definition, winningResult.answer);
        }

        // Learn the synonym fodder → synonym mapping
        if (winningHypothesis.synonymFodder && winningResult.synonym) {
            learnSynonym(winningHypothesis.synonymFodder, winningResult.synonym);
        }
    }

    return testResult;
}

// Keep this for backward compatibility with existing code
export function analyzeDefinitionHeuristic(clue: string) {
    return { selected: 'END', candidates: { START: 'Start', END: 'End' } };
}

// --- Utility to get current provider name ---
export function getCurrentProviderName(): string {
    return getProviderType();
}
