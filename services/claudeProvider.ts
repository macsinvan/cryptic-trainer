
import Anthropic from "@anthropic-ai/sdk";
import { ClueEvaluation, ScannedCrossword } from "../types";
import { AIProvider, SolvedClue, GeneratedChallenge, ChallengeVerification } from "./aiService";

const client = new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY || '',
    dangerouslyAllowBrowser: true
});

const COMPLEX_MODEL = 'claude-sonnet-4-20250514';
const FAST_MODEL = 'claude-haiku-2025-03-04';

// Helper to extract JSON from Claude's response
function extractJSON<T>(text: string): T | null {
    try {
        // Try direct parse first
        return JSON.parse(text);
    } catch {
        // Try to find JSON in markdown code blocks
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1].trim());
            } catch {
                // Fall through
            }
        }
        // Try to find raw JSON object
        const objectMatch = text.match(/\{[\s\S]*\}/);
        if (objectMatch) {
            try {
                return JSON.parse(objectMatch[0]);
            } catch {
                // Fall through
            }
        }
        console.error("Failed to extract JSON from response:", text.substring(0, 200));
        return null;
    }
}

export class ClaudeProvider implements AIProvider {

    async evaluateClue(clue: string, context: string = ""): Promise<ClueEvaluation | null> {
        const response = await client.messages.create({
            model: COMPLEX_MODEL,
            max_tokens: 4096,
            messages: [{
                role: "user",
                content: `Analyze this cryptic crossword clue using the "Coaching Workflow" methodology.

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

Return ONLY valid JSON matching this exact structure:
{
    "id": "unique-id-string",
    "clue": "the original clue",
    "answer": "ANSWER IN CAPS",
    "type": "Clue type (e.g., Charade, Anagram, etc.)",
    "difficulty": "Easy|Medium|Hard|Extreme",
    "definition": {
        "text": "the definition words",
        "position": "START|END|ENTIRE"
    },
    "wordplay": [
        {
            "type": "Wordplay type",
            "indicator": {
                "text": "indicator word(s)",
                "description": "what it signals"
            },
            "fodder": {
                "text": "fodder word(s)",
                "description": "what they represent"
            },
            "synonym": "RESULT",
            "thinkingHint": ["hint 1", "hint 2"]
        }
    ],
    "structure": "PART1 + PART2 = ANSWER",
    "card": [
        {"label": "DEFINITION", "value": "...", "hint": "..."},
        {"label": "INDICATOR", "value": "...", "hint": "..."},
        {"label": "FODDER", "value": "...", "hint": "..."}
    ],
    "parsing": "Brief parsing explanation",
    "learnings": ["Learning point 1", "Learning point 2"],
    "reasoning": "Full reasoning explanation",
    "hints": ["Progressive hint 1", "Progressive hint 2"]
}`
            }]
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        return extractJSON<ClueEvaluation>(text);
    }

    async generateChallenge(setter: string, clueType: string): Promise<GeneratedChallenge | null> {
        const response = await client.messages.create({
            model: FAST_MODEL,
            max_tokens: 1024,
            messages: [{
                role: "user",
                content: `Generate a new, unique cryptic crossword clue in the style of setter '${setter}'.
The mechanism should be '${clueType}'.

Return ONLY valid JSON: {"clue": "...", "answer": "...", "explanation": "..."}`
            }]
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        return extractJSON<GeneratedChallenge>(text);
    }

    async analyzeCrosswordImage(publication: string, base64: string, mimeType: string): Promise<ScannedCrossword | null> {
        const mediaType = mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

        const response = await client.messages.create({
            model: FAST_MODEL,
            max_tokens: 4096,
            messages: [{
                role: "user",
                content: [
                    {
                        type: "image",
                        source: {
                            type: "base64",
                            media_type: mediaType,
                            data: base64
                        }
                    },
                    {
                        type: "text",
                        text: `Scan this crossword image from '${publication}'. Extract all visible clues.

Return ONLY valid JSON: {"clues": [{"number": "1", "direction": "across", "text": "The clue text..."}]}`
                    }
                ]
            }]
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        return extractJSON<ScannedCrossword>(text);
    }

    async verifyClueChallenge(clue: string, answer: string, proposal: string): Promise<ChallengeVerification | null> {
        const response = await client.messages.create({
            model: COMPLEX_MODEL,
            max_tokens: 2048,
            messages: [{
                role: "user",
                content: `Evaluate this alternative parsing for a cryptic crossword clue.

Clue: ${clue}
Standard Answer: ${answer}
Proposed Alternative: ${proposal}

Is the proposed alternative a valid solution? If yes, provide a full evaluation.

Return ONLY valid JSON: {"isValid": true/false, "feedback": "explanation", "evaluation": null or ClueEvaluation object}`
            }]
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        return extractJSON<ChallengeVerification>(text);
    }

    async validateTutorResponse(clue: string, stageType: string, userInput: string, targetExpected: string): Promise<{ isCorrect: boolean; feedback: string }> {
        // Simple local validation - no AI call needed
        const isCorrect = userInput.toLowerCase().trim() === targetExpected.toLowerCase().trim();
        return {
            isCorrect,
            feedback: isCorrect ? "Spot on!" : "Not quite."
        };
    }

    async quickIdentifyDefinition(clue: string): Promise<string> {
        const response = await client.messages.create({
            model: FAST_MODEL,
            max_tokens: 256,
            messages: [{
                role: "user",
                content: `Identify only the definition portion in this cryptic crossword clue. Return just the definition words, nothing else.

Clue: "${clue}"`
            }]
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        return text.trim();
    }

    async verifySynonym(word: string, answer: string): Promise<boolean> {
        const response = await client.messages.create({
            model: FAST_MODEL,
            max_tokens: 64,
            messages: [{
                role: "user",
                content: `In a cryptic crossword context, is "${answer}" an acceptable synonym or meaning for "${word}"?

Answer only "yes" or "no".

Examples:
- "union" and "ALIGNMENT" -> yes (both can mean agreement/being in line)
- "cat" and "DOG" -> no (not synonyms)
- "slander" and "MALIGN" -> yes (both mean to speak ill of)`
            }]
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        return text.toLowerCase().trim().startsWith('yes');
    }

    async solveClue(clue: string): Promise<SolvedClue | null> {
        const response = await client.messages.create({
            model: COMPLEX_MODEL,
            max_tokens: 2048,
            messages: [{
                role: "user",
                content: `You are an expert cryptic crossword solver. Solve this cryptic crossword clue and explain your reasoning.

Clue: ${clue}

TASK:
1. Find the ANSWER to this clue
2. Identify the DEFINITION (the part that directly means the answer)
3. Explain the WORDPLAY (how the rest of the clue constructs the answer)

IMPORTANT RULES FOR CRYPTIC CLUES:
- The definition is usually at the START or END of the clue (rarely in the middle)
- The wordplay uses techniques like anagrams, hidden words, charades, containers, deletions, etc.
- The answer length is usually indicated in parentheses at the end, e.g., (7) means 7 letters

Return ONLY valid JSON:
{
    "answer": "ANSWER IN CAPS",
    "definition": "the definition words from the clue",
    "definitionPosition": "START|END|ENTIRE",
    "parsing": "Brief parsing formula, e.g., 'NEAR (close to) - R + T = NEAT'",
    "confidence": "high|medium|low",
    "explanation": "Full explanation of how the wordplay works"
}`
            }]
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        return extractJSON<SolvedClue>(text);
    }

    /**
     * Test a specific hypothesis about a cryptic clue.
     * This is a CONSTRAINED verification - we tell the AI exactly what to check.
     *
     * @param hypothesis - The specific hypothesis to test
     * @returns Verification result with confidence
     */
    async verifyHypothesis(hypothesis: {
        definition: string;           // The proposed definition word
        synonymFodder: string;        // The word that needs a synonym
        requiredLetterCount: number;  // How many letters the synonym must have
        knownParts: string[];         // Already known letter parts (e.g., ["ENT", "M"])
        targetLength: number;         // Total answer length
    }): Promise<{
        valid: boolean;
        synonym: string | null;       // The synonym found (if valid)
        answer: string | null;        // The complete answer (if valid)
        confidence: 'high' | 'medium' | 'low' | 'cannot_verify';
        reasoning: string;
    }> {
        const { definition, synonymFodder, requiredLetterCount, knownParts, targetLength } = hypothesis;

        const response = await client.messages.create({
            model: COMPLEX_MODEL,
            max_tokens: 1024,
            messages: [{
                role: "user",
                content: `You are verifying a SPECIFIC hypothesis about a cryptic crossword clue. Do NOT solve the clue yourself - only verify what is asked.

HYPOTHESIS TO TEST:
- Definition word: "${definition}"
- Word needing synonym: "${synonymFodder}"
- Required synonym length: exactly ${requiredLetterCount} letters
- Known letter parts: ${knownParts.join(', ')}
- Total answer length: ${targetLength} letters

TASK:
1. Find a ${requiredLetterCount}-letter synonym for "${synonymFodder}"
2. Combine it with the known parts (${knownParts.join(' + ')}) to form a ${targetLength}-letter word
3. Check if that word means "${definition}"

CRITICAL RULES:
- The synonym must be EXACTLY ${requiredLetterCount} letters
- The final answer must be EXACTLY ${targetLength} letters
- The answer must genuinely mean "${definition}"
- If you cannot find a valid synonym, say "cannot_verify"
- Do NOT guess or hallucinate - only report if you are confident

Return ONLY valid JSON:
{
    "valid": true/false,
    "synonym": "THE SYNONYM IN CAPS" or null,
    "answer": "THE ANSWER IN CAPS" or null,
    "confidence": "high" | "medium" | "low" | "cannot_verify",
    "reasoning": "Brief explanation of your verification"
}`
            }]
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const result = extractJSON<{
            valid: boolean;
            synonym: string | null;
            answer: string | null;
            confidence: 'high' | 'medium' | 'low' | 'cannot_verify';
            reasoning: string;
        }>(text);

        return result || {
            valid: false,
            synonym: null,
            answer: null,
            confidence: 'cannot_verify',
            reasoning: 'Failed to parse AI response'
        };
    }

    /**
     * Test multiple hypotheses in parallel and return the best verified result.
     */
    async testHypotheses(hypotheses: Array<{
        definition: string;
        synonymFodder: string;
        requiredLetterCount: number;
        knownParts: string[];
        targetLength: number;
    }>): Promise<{
        bestHypothesis: number | null;  // Index of the best hypothesis (or null if none valid)
        results: Array<{
            valid: boolean;
            synonym: string | null;
            answer: string | null;
            confidence: 'high' | 'medium' | 'low' | 'cannot_verify';
            reasoning: string;
        }>;
    }> {
        // Test all hypotheses in parallel
        const results = await Promise.all(
            hypotheses.map(h => this.verifyHypothesis(h))
        );

        // Find the best valid result (highest confidence)
        const confidenceOrder = { high: 3, medium: 2, low: 1, cannot_verify: 0 };
        let bestIdx: number | null = null;
        let bestConfidence = 0;

        results.forEach((r, i) => {
            if (r.valid && confidenceOrder[r.confidence] > bestConfidence) {
                bestConfidence = confidenceOrder[r.confidence];
                bestIdx = i;
            }
        });

        return {
            bestHypothesis: bestIdx,
            results
        };
    }
}
