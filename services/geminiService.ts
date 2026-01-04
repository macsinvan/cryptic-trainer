
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ClueEvaluation, ScannedCrossword, BattlecardField } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const COMPLEX_MODEL = 'gemini-3-pro-preview';
const FLASH_MODEL = 'gemini-3-flash-preview';

export async function evaluateClue(clue: string, context: string = ""): Promise<ClueEvaluation | null> {
    const response = await ai.models.generateContent({
        model: COMPLEX_MODEL,
        contents: `Analyze this cryptic crossword clue using the "Coaching Workflow" methodology.
        
        Clue: ${clue}
        Additional Context: ${context}
        
        OBJECTIVE: Break the clue down into instructional steps for a student.
        
        STRUCTURE REQUIREMENTS:
        1. DEFINITION: Identify the definition text.
        2. WORDPLAY MODULES: Isolate each logic component (e.g. Charade Part 1, Anagram Part, etc).
           For EACH module, identify:
           - INDICATOR: The word signaling the action (e.g., "snubbed", "mixed").
           - FODDER: The specific words being acted upon (e.g., "close to").
           - SYNONYM/DECODE: The result of the mental step (e.g., "close to" -> "NEAR").
           - THINKING: A sequence of hints to guide the user to the synonym.
        3. ASSEMBLY: The final equation (e.g. "NEAR + T = NEAT").
        
        JSON SCHEMA:
        - Must include 'wordplay' array with strict {indicator, fodder, thinkingHint} structure.
        - 'definition' must separate text from position.
        `,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    clue: { type: Type.STRING },
                    answer: { type: Type.STRING },
                    type: { type: Type.STRING },
                    difficulty: { type: Type.STRING, enum: ['Easy', 'Medium', 'Hard', 'Extreme'] },
                    definition: { 
                        type: Type.OBJECT,
                        properties: {
                            text: { type: Type.STRING },
                            position: { type: Type.STRING, enum: ['START', 'END', 'ENTIRE'] }
                        },
                        required: ['text', 'position']
                    },
                    wordplay: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                type: { type: Type.STRING },
                                indicator: { 
                                    type: Type.OBJECT,
                                    properties: { text: { type: Type.STRING }, description: { type: Type.STRING } },
                                    required: ['text', 'description']
                                },
                                fodder: { 
                                    type: Type.OBJECT,
                                    properties: { text: { type: Type.STRING }, description: { type: Type.STRING } },
                                    required: ['text', 'description']
                                },
                                synonym: { type: Type.STRING },
                                thinkingHint: { type: Type.ARRAY, items: { type: Type.STRING } }
                            },
                            required: ['type', 'indicator', 'fodder', 'thinkingHint']
                        }
                    },
                    structure: { type: Type.STRING },
                    // Legacy fields for compatibility
                    card: { 
                        type: Type.ARRAY, 
                        items: { type: Type.OBJECT, properties: { label: {type:Type.STRING}, value: {type:Type.STRING}, hint: {type:Type.STRING} } } 
                    },
                    parsing: { type: Type.STRING },
                    learnings: { type: Type.ARRAY, items: { type: Type.STRING } },
                    reasoning: { type: Type.STRING },
                    hints: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ['id', 'clue', 'answer', 'type', 'difficulty', 'definition', 'wordplay', 'structure', 'card', 'parsing', 'learnings']
            }
        }
    });

    try {
        const text = response.text || "null";
        const parsed = JSON.parse(text);
        return parsed;
    } catch (e) {
        console.error("Failed to parse evaluation JSON", e);
        return null;
    }
}

export async function generateChallenge(setter: string, clueType: string): Promise<{clue: string; answer: string; explanation: string} | null> {
    const response = await ai.models.generateContent({
        model: FLASH_MODEL,
        contents: `Generate a new, unique cryptic crossword clue in the style of setter '${setter}'.
        The mechanism should be '${clueType}'.
        Return JSON: {"clue": "...", "answer": "...", "explanation": "..."}`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    clue: { type: Type.STRING },
                    answer: { type: Type.STRING },
                    explanation: { type: Type.STRING }
                },
                required: ["clue", "answer", "explanation"]
            }
        }
    });
    try {
        return JSON.parse(response.text || "null");
    } catch { return null; }
}

export async function analyzeCrosswordImage(publication: string, base64: string, mimeType: string): Promise<ScannedCrossword | null> {
    const response = await ai.models.generateContent({
        model: FLASH_MODEL,
        contents: [
            { inlineData: { data: base64, mimeType: mimeType } },
            { text: `Scan this crossword image from '${publication}'. Extract clues. Return JSON: {"clues": [{"number": "1", "direction": "across", "text": "..."}]}` }
        ],
        config: {
            responseMimeType: "application/json"
        }
    });
    try {
        return JSON.parse(response.text || '{"clues": []}');
    } catch { return null; }
}

export async function verifyClueChallenge(clue: string, answer: string, proposal: string): Promise<{ isValid: boolean; feedback: string; evaluation?: ClueEvaluation } | null> {
    const response = await ai.models.generateContent({
        model: COMPLEX_MODEL,
        contents: `Evaluate this alternative parsing for clue: ${clue}. Standard: ${answer}. Proposal: ${proposal}. If valid, return new ClueEvaluation.`,
        config: { responseMimeType: "application/json" }
    });
    try {
        return JSON.parse(response.text || "null");
    } catch { return null; }
}

export async function validateTutorResponse(clue: string, stageType: string, userInput: string, targetExpected: string): Promise<{ isCorrect: boolean; feedback: string }> {
    return {
        isCorrect: userInput.toLowerCase().trim() === targetExpected.toLowerCase().trim(),
        feedback: userInput.toLowerCase().trim() === targetExpected.toLowerCase().trim() ? "Spot on!" : "Not quite."
    };
}

export async function quickIdentifyDefinition(clue: string): Promise<string> {
    const response = await ai.models.generateContent({
        model: FLASH_MODEL,
        contents: `Identify only the definition in: "${clue}"`,
    });
    return response.text?.trim() || "";
}

export function analyzeDefinitionHeuristic(clue: string) {
  return { selected: 'END', candidates: { START: 'Start', END: 'End' } };
}

// Quick AI check: is this word a valid synonym for the answer?
export async function verifySynonym(word: string, answer: string): Promise<boolean> {
    const response = await ai.models.generateContent({
        model: FLASH_MODEL,
        contents: `In a cryptic crossword context, is "${answer}" an acceptable synonym or meaning for "${word}"?

Answer only "yes" or "no".

Examples:
- "union" and "ALIGNMENT" -> yes (both can mean agreement/being in line)
- "cat" and "DOG" -> no (not synonyms)
- "slander" and "MALIGN" -> yes (both mean to speak ill of)`,
    });
    const text = (response.text || "").toLowerCase().trim();
    return text.startsWith('yes');
}

export interface SolvedClue {
    answer: string;
    definition: string;
    definitionPosition: 'START' | 'END' | 'ENTIRE';
    parsing: string;
    confidence: 'high' | 'medium' | 'low';
    explanation: string;
}

export async function solveClue(clue: string): Promise<SolvedClue | null> {
    const response = await ai.models.generateContent({
        model: COMPLEX_MODEL,
        contents: `You are an expert cryptic crossword solver. Solve this cryptic crossword clue and explain your reasoning.

Clue: ${clue}

TASK:
1. Find the ANSWER to this clue
2. Identify the DEFINITION (the part that directly means the answer)
3. Explain the WORDPLAY (how the rest of the clue constructs the answer)

IMPORTANT RULES FOR CRYPTIC CLUES:
- The definition is usually at the START or END of the clue (rarely in the middle)
- The wordplay uses techniques like anagrams, hidden words, charades, containers, deletions, etc.
- The answer length is usually indicated in parentheses at the end, e.g., (7) means 7 letters

Return your solution with confidence level: 'high' if you're certain, 'medium' if likely, 'low' if uncertain.`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    answer: { type: Type.STRING, description: "The solved answer in UPPERCASE" },
                    definition: { type: Type.STRING, description: "The definition words from the clue" },
                    definitionPosition: { type: Type.STRING, enum: ['START', 'END', 'ENTIRE'] },
                    parsing: { type: Type.STRING, description: "Brief parsing formula, e.g., 'NEAR (close to) - R + T = NEAT'" },
                    confidence: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
                    explanation: { type: Type.STRING, description: "Full explanation of how the wordplay works" }
                },
                required: ['answer', 'definition', 'definitionPosition', 'parsing', 'confidence', 'explanation']
            }
        }
    });

    try {
        const text = response.text || "null";
        const parsed = JSON.parse(text);
        return parsed as SolvedClue;
    } catch (e) {
        console.error("Failed to parse solve clue JSON", e);
        return null;
    }
}
