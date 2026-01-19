
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
            structure: `${cfg.answer} = ${cfg.construction}`
        }
    };
}


// --- THE DATA ---
// Library is now populated from imported puzzle files

export const RAW_PRESOLVED_CLUES: Array<any> = [];
