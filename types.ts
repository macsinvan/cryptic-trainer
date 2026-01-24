export interface ClueEvaluation {
  id: string;
  clue: string;
  answer: string;
  type: string; // Overall type
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Extreme';
  definition: {
    text: string;
    position: 'START' | 'END' | 'ENTIRE';
  };
  wordplay: Array<{
    type: string;
    indicator: { text: string; description: string };
    fodder: { text: string; description: string };
    synonym?: string;
    thinkingHint: string[];
  }>;
  structure: string; // Final equation: NEAR + T = NEAT
}

// --- NEW DETERMINISTIC ENGINE TYPES ---

export type InteractionType = 'CLICK_WORD' | 'READ_AND_CONTINUE' | 'ENTER_TEXT';

export interface StepTemplate {
  id: string;
  stage: 'DEFINITION' | 'INDICATOR' | 'FODDER' | 'DECODE' | 'SOLVE';
  hints: {
    primary: string;
    highlight_color?: 'GREEN' | 'ORANGE' | 'BLUE' | 'SLATE';
  };
  actionPrompt: string;
  interactionType: InteractionType;
  targetVariable?: string; // Key in variables map for validation
  logicDisplay?: string;   // Handlebars-like string for showing logic
}

export interface Pattern {
    id: string;
    name: string;
    description?: string;
    steps: string[]; // List of StepTemplate IDs
}

// ========== V2 SCHEMA TYPES ==========

/** Valid wordplay operation types */
export type OperationType =
    | 'anagram'
    | 'container'
    | 'hidden'
    | 'reversal'
    | 'deletion'
    | 'homophone'
    | 'abbreviation'
    | 'letter_selection'
    | 'synonym'
    | 'charade';

/** State tracking for wordplay progress */
export interface WordplayState {
    indicatorFound: boolean;
    fodderFound: boolean;
    resultEntered: boolean;
    solved: boolean;
}

/** Sub-operation for complex wordplays */
export interface SubOperation {
    id: string;
    operation: string;
    dependencies: string[];
    blockedHint?: string;
    state: { solved: boolean };
}

/** Fodder reference when fodder comes from other wordplay results */
export interface FodderReference {
    type: 'result';
    fromWordplay: string[];
}

/** V2 Wordplay with dependencies and state tracking */
export interface Wordplay {
    id: string;
    indicator: string;
    operation: OperationType;
    fodder: string | FodderReference;
    fodderLetterCount?: number;
    result: string;
    resultLetterCount?: number;
    dependencies: string[];
    blockedHint?: string;
    state: WordplayState;
    subOperations?: SubOperation[];
    explanation: string;
    // For letter_selection
    extractionType?: 'first_letter' | 'last_letter' | 'odd_letters' | 'even_letters' | 'middle_letters';
}

/** V2 Definition structure */
export interface Definition {
    text: string;
    position: 'start' | 'end' | 'entire';
}

/** V2 Clue type identification */
export interface ClueTypeId {
    id: 'standard' | 'double_definition' | 'cryptic_definition' | 'andit';
}

// ========== LEGACY V1 TYPES (deprecated) ==========

/** @deprecated Use Wordplay instead */
export interface WordplayStep {
    indicator: string;
    fodder: string;
    result: string;
    synonym: string;
    hint: string;
    complexity: number;  // 1=easy, 2=medium, 3=hard
    isAssembly: boolean; // True for Assembly steps (informational only)
    stepType: 'abbreviation' | 'letter_movement' | 'assembly' | 'synonym' | 'anagram' | 'hidden' | 'reversal' | 'deletion' | 'homophone' | 'container' | 'unknown';
    explanation: string; // Pre-computed plain English explanation for UI
    // For deletion steps with implied operations (e.g., "dropping others" from "Mums")
    deleteTarget?: string;        // What to delete (e.g., "others")
    impliedOperation?: 'anagram' | 'synonym'; // Operation needed to make deletion work
    impliedResult?: string;       // Result of implied operation (e.g., "MOTHERS" from anagram of "Mums")
}

/** Word-by-word highlighting data for UI rendering */
export interface WordHighlight {
    word: string;
    role: 'definition' | 'indicator' | 'fodder' | 'connector';
    stepNumber: number | null;
    colorType: 'GREEN' | 'ORANGE' | 'BLUE' | 'SLATE';
}

// Data-driven display block for UI rendering
export interface DisplayBlock {
    type: 'setter-hint' | 'clue-type' | 'parsing' | 'explanation';
    content: string;
    label?: string;           // Optional label (e.g., "Parsing", "Clue Type")
    techniques?: string[];    // For setter-hint: list of techniques for tooltip rendering
}

/** Sequencer metadata for free-form wordplay discovery */
export interface SequencerMetadata {
    indicatorToStep: Record<string, number>;  // Word → step index (0-based)
    fodderToStep: Record<string, number>;     // Word → step index (0-based)
    definitionWords: string[];                // Definition word list
    answerLetterCount: number;                // Length of answer
    totalSteps: number;                       // Number of wordplay steps
}

export interface PatternInstance {
    id: string;
    clueText: string;
    answer: string;
    enumeration?: string;            // e.g., "10", "9,6"
    clueNumber?: string;             // e.g., "1A", "12D"

    // V2 Schema - Core structures
    clueType: ClueTypeId;            // standard, double_definition, cryptic_definition, andit
    definition: Definition;          // Definition text and position
    wordplays: Wordplay[];           // V2 wordplays with dependencies and state

    // Metadata
    publication?: string;            // e.g., "Times Puzzles"
    puzzleNumber?: number;           // e.g., 2025
    setter?: string;                 // e.g., "Unknown"
    confidence?: number;             // 0.0 to 1.0
    comments?: string[];             // Solver comments

    // ========== DEPRECATED V1 FIELDS (for backward compatibility during migration) ==========
    /** @deprecated Use clueType instead */
    patternId?: string;
    /** @deprecated Use wordplays instead */
    wordplaySteps?: WordplayStep[];
    /** @deprecated Use definition.text instead */
    definitionText?: string;
    /** @deprecated Use definition.position instead */
    definitionPosition?: 'start' | 'end' | 'entire';
    /** @deprecated */
    variables?: Record<string, string>;
    /** @deprecated */
    wordHighlights?: WordHighlight[];
    /** @deprecated */
    solveExplanation?: DisplayBlock[];
    /** @deprecated */
    isComplete?: boolean;
    /** @deprecated */
    parsingSummary?: string;
    /** @deprecated */
    definitionMatchType?: 'direct' | 'synonym' | 'cryptic' | 'none';
    /** @deprecated */
    definitionExplanation?: string;
    /** @deprecated */
    definitionHint?: string;
    /** @deprecated */
    techniquesUsed?: string[];
    /** @deprecated */
    setterHint?: string;
    /** @deprecated */
    solverComments?: string[];
    /** @deprecated */
    thesaurusRequired?: boolean;
    /** @deprecated */
    sequencer?: SequencerMetadata;
    /** @deprecated */
    stepOverrides?: string[];
    /** @deprecated */
    solveSteps?: string[];
    /** @deprecated */
    analysis?: Record<string, unknown>;
}

// -------------------------------------

export interface TrainingStats {
  attempts: number;
  successes: number;
  hintsUsed: number;
  lastSolvedAt?: number;
}

export interface ClueExample {
  clue: string;
  answer: string;
  parsing: string;
  level: 'easy' | 'medium' | 'hard';
  definition?: string;
  hints?: string[];
  twist?: string;
}

export interface ClueType {
  id: string;
  label: string;
  name: string;
  icon: string;
  description: string;
  mechanism: string;
  theTell: string[];
  strategy: string;
  examples: ClueExample[];
}

export interface DojoRules {
  ximeneanStrictness: number;
  indicatorStyle: 'classic' | 'modern';
  commonAbbreviations: string[];
  forbiddenTechniques: string[];
  bias: {
    preferredWordplay: string[];
    hintEscalationSpeed: 'slow' | 'fast';
    ambiguityTolerance: 'low' | 'high';
  };
}

export interface Setter {
  id: string;
  pseudonym: string;
  realName: string;
  difficulty: number;
  activeFrom: number;
  famousQuote: string;
  description: string;
  solvingTips: string[];
  commonThemes: string[];
  clueTypes: ClueType[];
}

export interface Publication {
  id: string;
  name: string;
  description: string;
  established: number;
  logoColor: string;
  countryFlag: string;
  defaultRules: DojoRules;
  setters: Setter[];
  externalLink?: string;
  externalLinkNote?: string;
}

export interface TrainingItem {
  id: string;
  clue: string;
  answer: string;
  enumeration?: string;           // e.g., "10"
  clueNumber?: string;            // e.g., "1A"

  // V2 Schema - The primary data structure
  patternData: PatternInstance;   // V2 engine data with wordplays, dependencies, state

  // Metadata
  setterName: string;
  publicationId?: string;
  puzzleId?: string;
  timestamp: number;

  // Progress tracking
  stats: TrainingStats;

  // ========== DEPRECATED V1 FIELDS ==========
  /** @deprecated Use patternData.clueType instead */
  clueType?: any;
  /** @deprecated No longer used */
  evaluation?: ClueEvaluation;
  /** @deprecated */
  clueDirection?: string;
  /** @deprecated */
  example?: any;
  /** @deprecated */
  tutorProgress?: {
    stageIndex: number;
    summaryChain: string[];
    identifiedDefinition?: string;
  };
}

export interface ScannedClue {
  number: string;
  direction: 'across' | 'down' | 'unknown';
  text: string;
  answer?: string;
  originalType?: string;
  originalParsing?: string;
}

export interface ScannedCrossword {
  clues: ScannedClue[];
}

export type ViewState = 
  | { type: 'HOME' }
  | { type: 'PUBLICATION'; publicationId: string }
  | { type: 'SETTER'; publicationId: string; setterId: string }
  | { type: 'TRAINING'; publicationId: string; customClues?: ScannedClue[]; initialIndex?: number }
  | { type: 'SOLVER'; publicationId: string }
  | { type: 'MANUAL_ENTRY'; publicationId: string };
