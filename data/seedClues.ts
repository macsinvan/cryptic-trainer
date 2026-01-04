
import { BattlecardField } from '../types';
import { LOCKED_HINTS } from './designTemplates';

// --- HELPER: Automate the boring JSON generation ---

type ClueLogicType = 'deletion' | 'anagram' | 'container' | 'hidden' | 'reversal' | 'charade' | 'double_definition';

interface ClueConfig {
    // Core Data
    clue: string;
    answer: string;
    // Logic Parts (The "Words" you mentioned)
    definition: string;
    indicator: string;
    fodder: string;
    synonym?: string; // The mental step (e.g. "Close to" -> "NEAR")
    construction: string; // The math (e.g. "bROOK - b")
    // Metadata
    type: ClueLogicType;
    setter: string;
    pubId: string;
    puzzleId?: string;
    clueNum: string;
    direction: string;
    time: number;
    level?: 'easy' | 'medium' | 'hard';
}

function getWordIndices(clue: string, phrase: string): number[] {
    const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const clueWords = clue.split(/\s+/).map(clean);
    const phraseWords = phrase.split(/\s+/).map(clean);
    
    if (phraseWords.length === 0) return [];

    // Sliding window search
    for (let i = 0; i <= clueWords.length - phraseWords.length; i++) {
        let match = true;
        for (let j = 0; j < phraseWords.length; j++) {
            if (clueWords[i + j] !== phraseWords[j]) {
                match = false;
                break;
            }
        }
        if (match) {
            // Return array of indices [i, i+1, ... i+n]
            return Array.from({ length: phraseWords.length }, (_, k) => i + k);
        }
    }
    return []; // Fallback (shouldn't happen if inputs match clue)
}

function createClue(cfg: ClueConfig) {
    const defIndices = getWordIndices(cfg.clue, cfg.definition);
    
    const fodderValue = cfg.synonym ? `${cfg.fodder} (may require a synonym)` : cfg.fodder;

    // Build the Battlecard
    const card: BattlecardField[] = [
        { label: "DEFINITION", value: `Found at ${defIndices[0] === 0 ? 'start' : 'end'} - ${cfg.definition}` },
        { label: "INDICATOR", value: `${cfg.indicator} (${cfg.type} indicator)` },
        { label: "FODDER", value: fodderValue }
    ];
    
    if (cfg.synonym) {
        card.push({ label: "SYNONYM", value: cfg.synonym, hint: `Mental step: ${cfg.fodder} -> ${cfg.synonym}` });
    }
    card.push({ label: "CONSTRUCTION", value: cfg.construction });

    // Build the Wordplay structure required for the state machine
    const wordplayModule = {
        type: cfg.type.charAt(0).toUpperCase() + cfg.type.slice(1),
        indicator: { text: cfg.indicator, description: `${cfg.type} indicator` },
        fodder: { text: cfg.fodder, description: "Wordplay input" },
        synonym: cfg.synonym,
        thinkingHint: [
             `Look at the fodder '${cfg.fodder}' and consider the instruction '${cfg.indicator}'.`,
             cfg.synonym ? `Try finding a synonym for '${cfg.fodder}' that fits.` : `Apply '${cfg.indicator}' to '${cfg.fodder}'.`
        ]
    };

    return {
        clue: cfg.clue,
        answer: cfg.answer,
        setterName: cfg.setter,
        publicationId: cfg.pubId,
        puzzleId: cfg.puzzleId,
        typeId: cfg.type,
        timestamp: cfg.time,
        clueNumber: cfg.clueNum,
        clueDirection: cfg.direction,
        example: {
            clue: cfg.clue,
            answer: cfg.answer,
            level: cfg.level || 'medium',
            parsing: `${cfg.answer} = ${cfg.construction}`,
            definition: cfg.definition,
            hints: [`Definition: ${cfg.definition}`, `Indicator: ${cfg.indicator}`, `Type: ${cfg.type}`]
        },
        card: card,
        evaluation: {
            id: `seed-${cfg.clue.substring(0, 5)}`,
            clue: cfg.clue,
            answer: cfg.answer,
            type: cfg.type.charAt(0).toUpperCase() + cfg.type.slice(1),
            difficulty: (cfg.level ? cfg.level.charAt(0).toUpperCase() + cfg.level.slice(1) : 'Medium') as any,
            definition: {
                text: cfg.definition,
                position: defIndices[0] === 0 ? 'START' : 'END'
            },
            wordplay: [wordplayModule],
            structure: `${cfg.answer} = ${cfg.construction}`,
            card: card,
            learnings: [
                `Definition is '${cfg.definition}'`,
                `Indicator '${cfg.indicator}' signals a ${cfg.type}`,
                `Logic: ${cfg.construction} = ${cfg.answer}`
            ],
            parsing: `${cfg.answer} = ${cfg.construction}`,
            hints: [],
            reasoning: ''
        },
        learnings: [
            `Definition is '${cfg.definition}'`,
            `Indicator '${cfg.indicator}' signals a ${cfg.type}`,
            `Logic: ${cfg.construction} = ${cfg.answer}`
        ]
    };
}


// --- THE DATA ---

export const RAW_PRESOLVED_CLUES: Array<any> = [
    // 1. NEAT - Converted to Deterministic Pattern
    {
        clue: "Orderly snubbed close to end of shift (4)",
        answer: "NEAT",
        setterName: "The Times",
        publicationId: "times",
        typeId: "deletion",
        timestamp: 1736000000006,
        clueNumber: "12",
        clueDirection: "across",
        
        // --- NEW ENGINE DATA ---
        patternData: {
            id: "seed-neat",
            patternId: "COMPOSITE_SYNONYM_DELETION_CHARADE",
            clueText: "Orderly snubbed close to end of shift (4)",
            answer: "NEAT",
            variables: {
                "def_text": "Orderly",
                "indicator_1_text": "snubbed",
                "fodder_1_text": "close to",
                "synonym_1": "NEAR",
                "result_1": "NEA",
                "indicator_2_text": "end of",
                "fodder_2_text": "shift",
                "result_2": "T"
            }
        },
        // -----------------------

        // Legacy Fallback (So other components don't crash before refactor)
        example: {
            clue: "Orderly snubbed close to end of shift (4)",
            answer: "NEAT",
            level: "easy",
            parsing: "NEAR (close) snubbed (dropped last letter) to NEA + T (end of shift) = NEAT",
            definition: "Orderly",
            hints: [LOCKED_HINTS.DEFINITION]
        },
        evaluation: {
            id: "seed-neat",
            clue: "Orderly snubbed close to end of shift (4)",
            answer: "NEAT",
            type: "Deletion",
            difficulty: "Easy",
            definition: { text: "Orderly", position: "START" },
            wordplay: [], // Handled by pattern engine now
            structure: "NEA + T = NEAT",
            card: [],
            learnings: [],
            parsing: "",
            hints: [],
            reasoning: ""
        }
    },

    // 2. ROOK - Deletion with synonym (heading away = remove first letter)
    {
        clue: "Bird heading away from stream (4)",
        answer: "ROOK",
        setterName: "The Times",
        publicationId: "times",
        typeId: "deletion",
        timestamp: 1736000000010,
        clueNumber: "1",
        clueDirection: "across",

        patternData: {
            id: "seed-rook",
            patternId: "SYNONYM_DELETION",
            clueText: "Bird heading away from stream (4)",
            answer: "ROOK",
            variables: {
                "def_text": "Bird",
                "indicator_1_text": "heading away from",
                "fodder_1_text": "stream",
                "synonym_1": "BROOK",
                "result_1": "ROOK"
            }
        },

        example: {
            clue: "Bird heading away from stream (4)",
            answer: "ROOK",
            level: "easy",
            parsing: "BROOK (stream) heading away (drop first letter) = ROOK",
            definition: "Bird",
            hints: [LOCKED_HINTS.DEFINITION]
        },
        evaluation: {
            id: "seed-rook",
            clue: "Bird heading away from stream (4)",
            answer: "ROOK",
            type: "Deletion",
            difficulty: "Easy",
            definition: { text: "Bird", position: "START" },
            wordplay: [],
            structure: "BROOK - B = ROOK",
            card: [],
            learnings: [],
            parsing: "",
            hints: [],
            reasoning: ""
        }
    },

    // 3. EIGHTY - Deletion with synonym (conceding header = remove first letter)
    {
        clue: "Score four times? That's massive after conceding header (6)",
        answer: "EIGHTY",
        setterName: "Ed Hall",
        publicationId: "times",
        puzzleId: "29351",
        typeId: "deletion",
        timestamp: 1736000000015,
        clueNumber: "1",
        clueDirection: "across",

        patternData: {
            id: "seed-eighty",
            patternId: "SYNONYM_DELETION",
            clueText: "Score four times? That's massive after conceding header (6)",
            answer: "EIGHTY",
            variables: {
                "def_text": "Score four times?",
                "indicator_1_text": "after conceding header",
                "fodder_1_text": "That's massive",
                "synonym_1": "WEIGHTY",
                "result_1": "EIGHTY"
            }
        },

        example: {
            clue: "Score four times? That's massive after conceding header (6)",
            answer: "EIGHTY",
            level: "easy",
            parsing: "WEIGHTY (That's massive) conceding header (drop first letter) = EIGHTY",
            definition: "Score four times?",
            hints: [LOCKED_HINTS.DEFINITION]
        },
        evaluation: {
            id: "seed-eighty",
            clue: "Score four times? That's massive after conceding header (6)",
            answer: "EIGHTY",
            type: "Deletion",
            difficulty: "Easy",
            definition: { text: "Score four times?", position: "START" },
            wordplay: [],
            structure: "WEIGHTY - W = EIGHTY",
            card: [],
            learnings: [],
            parsing: "",
            hints: [],
            reasoning: ""
        }
    }
];
