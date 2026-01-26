
import { PUBLICATIONS, STANDARD_CLUE_TYPES } from '../data';
import { ClueEvaluation, TrainingItem, ClueType, TrainingStats, PatternInstance, DisplayBlock } from '../types';
import { RAW_PRESOLVED_CLUES } from '../data/seedClues';
import { migratePatternInstance } from './puzzleConverter';

const runtimeClues = new Map<string, TrainingItem>();

const normalize = (text: string) => (text || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');

/** Get clue text as string (handles union type) */
const getClueText = (item: TrainingItem): string => {
    if (typeof item.clue === 'string') return item.clue;
    return item.clue?.text || '';
};

// --- HTTP API Helpers ---
const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${url}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }
    return response.json();
}

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

// --- Parser Issues Functions (now use HTTP) ---
export const saveParserIssue = async (issue: ParserIssue): Promise<void> => {
    await fetchJson('/parser-issues', {
        method: 'POST',
        body: JSON.stringify(issue)
    });
};

export const getParserIssues = async (): Promise<ParserIssue[]> => {
    try {
        const data = await fetchJson<{ items: ParserIssue[] }>('/parser-issues');
        return data.items;
    } catch { return []; }
};

export const getParserIssueCount = async (): Promise<number> => {
    const issues = await getParserIssues();
    return issues.length;
};

// --- Settings Functions ---
export interface AppSettings {
    letterChecking: boolean;
}

export const getSettings = async (): Promise<AppSettings> => {
    try {
        return await fetchJson<AppSettings>('/settings');
    } catch {
        return { letterChecking: true };
    }
};

export const saveSettings = async (settings: Partial<AppSettings>): Promise<void> => {
    await fetchJson('/settings', {
        method: 'POST',
        body: JSON.stringify(settings)
    });
};

// --- Legacy IndexedDB functions (kept for migration only) ---
const DB_NAME = 'CrypticTrainerDB_V2';
const STORE_NAME = 'training_items';
const PARSER_ISSUES_STORE = 'parser_issues';
const DB_VERSION = 73;

const openLegacyDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(PARSER_ISSUES_STORE)) {
                db.createObjectStore(PARSER_ISSUES_STORE, { keyPath: 'id' });
            }
        };
    });
};

export const getLegacyClues = async (): Promise<TrainingItem[]> => {
    try {
        const db = await openLegacyDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch { return []; }
};

export const clearLegacyDB = async (): Promise<void> => {
    try {
        const db = await openLegacyDB();
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.warn('[migration] Could not clear legacy DB:', e);
    }
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

  // Load seed clues first
  for (const raw of RAW_PRESOLVED_CLUES) {
      const defaultType = getStdType(raw.typeId);

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
            wordplay: raw.wordplay || [],
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
          patternData: raw.patternData
      };
      mergedClues.set(normalize(getClueText(seedItem)), seedItem);
  }

  // Load from server
  try {
      const data = await fetchJson<{ items: any[] }>('/clues');
      data.items.forEach(item => {
          // V3: If item has steps (new template-based format)
          if (item.steps) {
              // New format: { id, clue: { text, enumeration, answer, number }, steps: [...] }
              // Extract clue text for normalization, but keep original clue object for TemplateTrainer
              const clueObj = item.clue;
              const clueText = typeof clueObj === 'string' ? clueObj : clueObj?.text || '';
              item.answer = typeof clueObj === 'object' ? clueObj?.answer : item.answer;
              // Keep steps for TemplateTrainer detection
              if (clueText) {
                  mergedClues.set(normalize(clueText), item);
              }
              return; // Skip the rest for V3 format
          }
          // V2: If item has clueEntry, map to patternData for UI compatibility
          else if (item.clueEntry) {
              item.clue = item.clueEntry.clue.text;
              item.answer = item.clueEntry.clue.answer;
              item.enumeration = item.clueEntry.clue.enumeration;
              item.clueNumber = item.clueEntry.clue.number;
              item.patternData = {
                  id: item.id,
                  clueText: item.clueEntry.clue.text,
                  answer: item.clueEntry.clue.answer,
                  enumeration: item.clueEntry.clue.enumeration,
                  clueNumber: item.clueEntry.clue.number,
                  clueType: item.clueEntry.clueType,
                  definition: item.clueEntry.definition,
                  wordplays: item.clueEntry.wordplays,
              };
          }
          // Normalize for lookup - handle both string and object clue
          const clueText = typeof item.clue === 'string' ? item.clue : item.clue?.text || '';
          if (clueText) {
              mergedClues.set(normalize(clueText), item);
          }
      });
  } catch (e) {
      console.warn('[clueManager] Could not load clues from server:', e);
  }

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
    await fetchJson('/clues', {
        method: 'POST',
        body: JSON.stringify(item)
    });
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
        patternData: patternData || existing?.patternData,
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

    await fetchJson('/clues', {
        method: 'POST',
        body: JSON.stringify(newItem)
    });

    return !existing;
};

export const subscribeToClues = (cb: () => void) => {
    return () => {};
};

export const getCloudConnectionStatus = () => ({
    status: 'connected' as const,
    userCount: 1,
    currentUserId: 'local-user',
    recentUsers: [] as Array<{ id: string; last_active: string }>,
    error: null as string | null
});
export const refreshConnection = async () => {};
export const getCustomClueCount = () => 0;

export const clearUserData = async () => {
    await fetchJson('/clues/clear', { method: 'POST' });
    runtimeClues.clear();
};

export const deleteClue = async (clueText: string): Promise<boolean> => {
    const norm = normalize(clueText);
    const item = runtimeClues.get(norm);
    if (!item) return false;

    await fetchJson(`/clues/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    runtimeClues.delete(norm);
    return true;
};

export const exportUserData = async (): Promise<string> => {
    const items = Array.from(runtimeClues.values()).filter(item => item.id.startsWith('user-'));
    return JSON.stringify({ version: 1, items }, null, 2);
};

export const importUserData = async (jsonString: string): Promise<{ success: boolean; message: string }> => {
    try {
        const data = JSON.parse(jsonString);
        const items = data.items || [];

        const result = await fetchJson<{ imported: number; errors: number }>('/clues/bulk', {
            method: 'POST',
            body: JSON.stringify({ items })
        });

        // Reload clues from server
        await initializeClues();

        return { success: true, message: `Imported ${result.imported} clues` };
    } catch (e) {
        return { success: false, message: String(e) };
    }
};

export const searchClues = (q: string) => {
    const query = normalize(q);
    return Array.from(runtimeClues.values()).filter(item =>
        normalize(getClueText(item)).includes(query)
    ).slice(0, 5);
};
export const mapToValidClueType = (s: string, p?: string) => (STANDARD_CLUE_TYPES[0] as any);

// =============================================================================
// TEMPLATE-BASED TRAINING API
// =============================================================================

/** Multiple choice option for container steps */
export interface MultipleChoiceOption {
    label: string;
    correct: boolean;
}

/** Response from new template-based training endpoints */
export interface NewTrainingRender {
    stepIndex: number;
    phaseIndex: number;
    stepType: string;
    phaseId: string;
    inputMode: 'tap_words' | 'text' | 'multiple_choice' | 'none';
    highlights: Array<{ indices: number[]; color: string; role: string }>;
    intro?: { title: string; text: string; example: string };
    panel?: { title: string; instruction: string };
    button?: { label: string; action: string };
    expected?: number[] | string;
    options?: MultipleChoiceOption[];  // For multiple_choice inputMode
    complete?: boolean;
    actionPrompt: string;  // Short instruction for Section 3 (e.g., "Tap the definition words")
    answer: string;        // The correct answer for early solve attempts
    learnings?: Array<{ title: string; text: string }>;  // Accumulated teaching summaries for solved view
}

export interface NewTrainingResponse {
    success: boolean;
    render: NewTrainingRender;
    correct?: boolean;
    message?: string;
    error?: string;
}

/** Convert new render format to legacy RenderInstructions for UI compatibility */
function adaptRenderToLegacy(render: NewTrainingRender): RenderInstructions {
    // Determine panel type
    let panel: 'active' | 'teaching' | 'blocked' | 'complete' = 'active';
    if (render.complete) {
        panel = 'complete';
    } else if (render.phaseId === 'teaching') {
        panel = 'teaching';
    }

    // Determine input mode
    let inputMode: 'tap_words' | 'enter_text' | 'none' = 'none';
    if (render.inputMode === 'tap_words') {
        inputMode = 'tap_words';
    } else if (render.inputMode === 'text') {
        inputMode = 'enter_text';
    }

    // Build buttons
    const buttons: ButtonSpec[] = [];
    if (render.button) {
        buttons.push({
            id: render.button.action,
            label: render.button.label,
            action: render.button.action === 'next_step' ? 'continue' : render.button.action,
            variant: 'primary',
            requiresSelection: false,
            requiresInput: false
        });
    } else if (render.inputMode === 'tap_words') {
        buttons.push({
            id: 'check',
            label: 'Check',
            action: 'check_input',
            variant: 'primary',
            requiresSelection: true,
            requiresInput: false
        });
    } else if (render.inputMode === 'text') {
        buttons.push({
            id: 'check',
            label: 'Check',
            action: 'check_input',
            variant: 'primary',
            requiresSelection: false,
            requiresInput: true
        });
    }

    // Convert highlights
    const highlights: HighlightInstruction[] = render.highlights.map(h => ({
        indices: h.indices,
        color: h.color as 'GREEN' | 'ORANGE' | 'BLUE' | 'PURPLE',
        role: h.role as 'definition' | 'indicator' | 'fodder' | 'result',
        confirmed: true
    }));

    return {
        panel,
        primaryText: render.panel?.instruction || (render.complete ? 'Training complete!' : ''),
        secondaryText: render.intro?.text || null,
        inputMode,
        inputTarget: render.phaseId === 'indicator' ? 'indicator' :
                     render.phaseId === 'fodder' ? 'fodder' :
                     render.phaseId === 'result' ? 'result' : null,
        showResultInput: render.inputMode === 'text',
        buttons,
        highlights,
        stepLabel: render.panel?.title || render.stepType?.toUpperCase().replace('_', ' ') || '',
        stepProgress: `${render.stepIndex + 1}`,
        stepId: `${render.stepType}-${render.phaseId}`,
        resultDisplay: null,
        blockedHint: null
    };
}

/** Start a new training session (template-based) */
export const trainingStart = async (clueId: string): Promise<NewTrainingResponse> => {
    return fetchJson<NewTrainingResponse>('/training/start', {
        method: 'POST',
        body: JSON.stringify({ clueId })
    });
};

/** Submit user input (tap indices, text, or multiple choice index) */
export const trainingInput = async (clueId: string, value: number[] | string | number): Promise<NewTrainingResponse> => {
    return fetchJson<NewTrainingResponse>('/training/input', {
        method: 'POST',
        body: JSON.stringify({ clueId, value })
    });
};

/** Continue to next step (after teaching moment) */
export const trainingContinue = async (clueId: string): Promise<NewTrainingResponse> => {
    return fetchJson<NewTrainingResponse>('/training/continue', {
        method: 'POST',
        body: JSON.stringify({ clueId })
    });
};

/** Clear training session (e.g., on exit). Allows fresh start next time. */
export const trainingClear = async (clueId: string): Promise<{ success: boolean; cleared: boolean }> => {
    return fetchJson('/training/clear', {
        method: 'POST',
        body: JSON.stringify({ clueId })
    });
};

/** Get all learnings for a clue (for early solve) */
export const trainingLearnings = async (clueId: string): Promise<{ success: boolean; learnings: Array<{ title: string; text: string }> }> => {
    return fetchJson('/training/learnings', {
        method: 'POST',
        body: JSON.stringify({ clueId })
    });
};

/** Get adapted render for UI compatibility */
export const getAdaptedRender = (response: NewTrainingResponse): RenderInstructions => {
    return adaptRenderToLegacy(response.render);
};

/**
 * Check if a clue already exists in the library (by normalized text)
 */
export const clueExists = (text: string): boolean => {
    return runtimeClues.has(normalize(text));
};

/**
 * Migrate all clues to apply latest converter logic
 */
export const migrateAllClues = async (): Promise<{ migrated: number; errors: number }> => {
    let migrated = 0;
    let errors = 0;

    const items = Array.from(runtimeClues.values());
    console.log(`[migration] Starting migration of ${items.length} clues...`);

    for (const item of items) {
        try {
            if (item.patternData) {
                const migratedPatternData = migratePatternInstance(item.patternData);
                item.patternData = migratedPatternData;

                await fetchJson('/clues', {
                    method: 'POST',
                    body: JSON.stringify(item)
                });

                runtimeClues.set(normalize(getClueText(item)), item);
                migrated++;
                console.log(`[migration] Migrated: ${getClueText(item).substring(0, 40)}... → ${migratedPatternData.patternId}`);
            }
        } catch (err) {
            errors++;
            console.error(`[migration] Error migrating clue "${getClueText(item)}":`, err);
        }
    }

    console.log(`[migration] Complete: ${migrated} migrated, ${errors} errors`);
    return { migrated, errors };
};

/**
 * Clear all clues from specific puzzle numbers
 */
export const clearCluesByPuzzleNumber = async (puzzleNumbers: number[]): Promise<number> => {
    let deleted = 0;

    console.log(`[cleanup] Clearing clues from puzzles: ${puzzleNumbers.join(', ')}`);

    for (const [norm, item] of runtimeClues.entries()) {
        const puzzleNum = item.patternData?.puzzleNumber;
        if (puzzleNum && puzzleNumbers.includes(puzzleNum)) {
            try {
                await fetchJson(`/clues/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
                runtimeClues.delete(norm);
                deleted++;
                console.log(`[cleanup] Deleted: ${getClueText(item).substring(0, 40)}... (puzzle ${puzzleNum})`);
            } catch (e) {
                console.error(`[cleanup] Failed to delete:`, e);
            }
        }
    }

    console.log(`[cleanup] Complete: ${deleted} clues deleted`);
    return deleted;
};

/**
 * Migrate clues from browser IndexedDB to server
 * Call this once to move existing data to the new server-based storage
 */
export const migrateFromBrowser = async (): Promise<{ migrated: number; errors: number }> => {
    console.log('[migration] Starting migration from browser IndexedDB to server...');

    const legacyItems = await getLegacyClues();
    if (legacyItems.length === 0) {
        console.log('[migration] No legacy clues found in browser');
        return { migrated: 0, errors: 0 };
    }

    console.log(`[migration] Found ${legacyItems.length} clues in browser IndexedDB`);

    try {
        const result = await fetchJson<{ imported: number; errors: number }>('/clues/bulk', {
            method: 'POST',
            body: JSON.stringify({ items: legacyItems })
        });

        console.log(`[migration] Server imported ${result.imported} clues`);

        // Clear legacy DB after successful migration
        await clearLegacyDB();
        console.log('[migration] Cleared browser IndexedDB');

        // Reload from server
        await initializeClues();

        return { migrated: result.imported, errors: result.errors };
    } catch (e) {
        console.error('[migration] Migration failed:', e);
        return { migrated: 0, errors: legacyItems.length };
    }
};

// Expose migration function globally for one-time use via browser console
if (typeof window !== 'undefined') {
    (window as any).migrateFromBrowser = migrateFromBrowser;
    (window as any).clearBadImports = async () => {
        const count = await clearCluesByPuzzleNumber([29434, 29435]);
        console.log(`Cleared ${count} clues from puzzles 29434 and 29435`);
        return count;
    };
}
