
import { PUBLICATIONS, STANDARD_CLUE_TYPES } from '../data';
import { ClueEvaluation, TrainingItem, ClueType, TrainingStats, PatternInstance } from '../types';
import { RAW_PRESOLVED_CLUES } from '../data/seedClues';

const runtimeClues = new Map<string, TrainingItem>();
const DB_NAME = 'CrypticTrainerDB_V2';
const STORE_NAME = 'training_items';
const PARSER_ISSUES_STORE = 'parser_issues';
const DB_VERSION = 73; // Added parser_issues store

const normalize = (text: string) => (text || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');

// --- Parser Issue Type ---
export interface ParserIssue {
    id: string;
    timestamp: number;
    fullInput: string;  // The complete raw input from the user
    clueText: string;
    answer: string;
    publication?: string;
    puzzleId?: string;
    specialCaseType: string;
    specialCaseReason: string;
    parsing?: string;
    coaching?: string[];
    patternVariables?: Record<string, string>;
}

// --- Storage Helpers ---
const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            // Training items store
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            // Parser issues store
            if (!db.objectStoreNames.contains(PARSER_ISSUES_STORE)) {
                db.createObjectStore(PARSER_ISSUES_STORE, { keyPath: 'id' });
            }
        };
    });
};

const dbGetAll = async (): Promise<TrainingItem[]> => {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch { return []; }
};

const dbPut = async (item: TrainingItem): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(item);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

// --- Parser Issues Functions ---
export const saveParserIssue = async (issue: ParserIssue): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(PARSER_ISSUES_STORE, 'readwrite');
        const store = transaction.objectStore(PARSER_ISSUES_STORE);
        const request = store.put(issue);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getParserIssues = async (): Promise<ParserIssue[]> => {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(PARSER_ISSUES_STORE, 'readonly');
            const store = transaction.objectStore(PARSER_ISSUES_STORE);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch { return []; }
};

export const getParserIssueCount = async (): Promise<number> => {
    const issues = await getParserIssues();
    return issues.length;
};

export const initializeClues = async (): Promise<void> => {
  const mergedClues = new Map<string, TrainingItem>();

  const getStdType = (id: string): ClueType => {
      const raw = (STANDARD_CLUE_TYPES.find(t => t.id === id) || STANDARD_CLUE_TYPES[0]) as any;
      return {
          id: raw.id,
          label: raw.label || raw.name,
          name: raw.label || raw.name,
          icon: raw.icon,
          description: raw.description,
          mechanism: raw.mechanism,
          theTell: raw.theTell,
          strategy: raw.strategy,
          examples: []
      };
  };

  for (const raw of RAW_PRESOLVED_CLUES) {
      const defaultType = getStdType(raw.typeId);
      
      // Use pre-calculated evaluation if it exists
      const evaluation: ClueEvaluation = raw.evaluation || {
            id: `seed-${normalize(raw.clue).substring(0, 5)}`,
            clue: raw.clue,
            card: raw.card || [], 
            learnings: raw.learnings || [], 
            type: defaultType.name,
            difficulty: (raw.example.level.charAt(0).toUpperCase() + raw.example.level.slice(1)) as any,
            reasoning: raw.example.parsing,
            answer: raw.answer,
            parsing: raw.example.parsing,
            definition: {
                text: raw.example.definition || '',
                position: 'START'
            },
            hints: raw.example.hints || [],
            wordplay: raw.wordplay || [], // Ensure wordplay is passed through
            structure: raw.example.parsing || ''
      };

      const seedItem: TrainingItem = {
          id: `seed-${normalize(raw.clue).substring(0, 10)}`,
          clue: raw.clue,
          answer: raw.answer,
          setterName: raw.setterName,
          publicationId: raw.publicationId,
          puzzleId: raw.puzzleId,
          clueType: defaultType,
          timestamp: raw.timestamp || Date.now(),
          clueNumber: raw.clueNumber,
          clueDirection: raw.clueDirection,
          stats: { attempts: 0, successes: 0, hintsUsed: 0 },
          example: raw.example,
          evaluation: evaluation,
          patternData: raw.patternData // Pass through the new Engine Data
      };
      mergedClues.set(normalize(seedItem.clue), seedItem);
  }

  const dbItems = await dbGetAll();
  dbItems.forEach(item => mergedClues.set(normalize(item.clue), item));

  runtimeClues.clear();
  mergedClues.forEach((item, key) => runtimeClues.set(key, item));
};

export const getTrainingQueue = (publicationId: string): TrainingItem[] => {
    return Array.from(runtimeClues.values()).filter(i => i.publicationId === publicationId);
};

export const findKnownClue = (text: string): ClueEvaluation | null => {
    const item = runtimeClues.get(normalize(text));
    return item ? item.evaluation : null;
};

export const findFullItem = (text: string): TrainingItem | null => {
  return runtimeClues.get(normalize(text)) || null;
};

export const updateTutorProgress = async (text: string, progress: { stageIndex: number; summaryChain: string[]; identifiedDefinition?: string }) => {
  const item = runtimeClues.get(normalize(text));
  if (item) {
    item.tutorProgress = progress;
    await dbPut(item);
  }
};

export const getClueCount = (pubId: string) => Array.from(runtimeClues.values()).filter(i => i.publicationId === pubId).length;
export const getSetterClueCount = (name: string) => Array.from(runtimeClues.values()).filter(i => i.setterName === name).length;

export const saveClue = async (pubId: string, text: string, evaluation: ClueEvaluation, patternData?: PatternInstance) => {
    const norm = normalize(text);
    const existing = runtimeClues.get(norm);

    const level: 'easy' | 'medium' | 'hard' =
        evaluation.difficulty === 'Easy' ? 'easy' :
        evaluation.difficulty === 'Hard' || evaluation.difficulty === 'Extreme' ? 'hard' : 'medium';

    const newItem: TrainingItem = {
        id: existing?.id || `user-${Date.now()}`,
        clue: text,
        answer: evaluation.answer,
        setterName: existing?.setterName || 'Community',
        publicationId: pubId,
        clueType: (STANDARD_CLUE_TYPES.find(t => t.label === evaluation.type) || STANDARD_CLUE_TYPES[0]) as any,
        evaluation,
        patternData: patternData || existing?.patternData, // Preserve existing patternData if not provided
        stats: existing?.stats || { attempts: 0, successes: 0, hintsUsed: 0 },
        timestamp: Date.now(),
        example: {
            clue: text,
            answer: evaluation.answer,
            parsing: evaluation.structure,
            level: level,
            definition: evaluation.definition.text,
            hints: []
        },
        tutorProgress: existing?.tutorProgress
    };
    runtimeClues.set(norm, newItem);
    await dbPut(newItem);
    return !existing;
};

export const subscribeToClues = (cb: () => void) => {
    return () => {};
};

export const getCloudConnectionStatus = () => ({ status: 'connected' as any });
export const refreshConnection = async () => {};
export const getCustomClueCount = () => 0;
export const clearUserData = async () => {
    // Clear IndexedDB
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => {
            runtimeClues.clear();
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteClue = async (clueText: string): Promise<boolean> => {
    const norm = normalize(clueText);
    const item = runtimeClues.get(norm);
    if (!item) return false;

    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(item.id);
        request.onsuccess = () => {
            runtimeClues.delete(norm);
            resolve(true);
        };
        request.onerror = () => reject(request.error);
    });
};
export const exportUserData = async () => "";
export const importUserData = async (s: string) => ({ success: true, message: "" });
export const searchClues = (q: string) => {
    const query = normalize(q);
    return Array.from(runtimeClues.values()).filter(item => 
        normalize(item.clue).includes(query)
    ).slice(0, 5);
};
export const mapToValidClueType = (s: string, p?: string) => (STANDARD_CLUE_TYPES[0] as any);

/**
 * Check if a clue already exists in the library (by normalized text)
 */
export const clueExists = (text: string): boolean => {
    return runtimeClues.has(normalize(text));
};
