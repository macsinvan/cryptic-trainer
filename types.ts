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

/** Computed wordplay step - ready for UI display */
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

export interface PatternInstance {
    id: string;
    patternId: string;
    clueText: string;
    answer: string;
    variables: Record<string, string>;
    stepOverrides?: string[]; // Optional specific step ID list for this instance
    solveSteps?: string[]; // Step-by-step solve sequence for the battlecard
    analysis?: Record<string, unknown>; // Full analysis data for partial parsing

    // DATA-DRIVEN UI: Parser returns ordered blocks, UI just renders them
    solveExplanation?: DisplayBlock[];  // Ordered list of display blocks for UI

    // Word-by-word highlighting (from new puzzle schema)
    wordHighlights?: WordHighlight[];  // Pre-computed role/color for each word in clue

    // Pre-computed fields for UI (all logic in backend)
    wordplaySteps?: WordplayStep[];  // Ordered by complexity (easy first), Assembly last
    isComplete?: boolean;            // True if definition + all wordplay resolved
    parsingSummary?: string;         // e.g., "MALIGN (slander) → ALIGNM + ENT = ALIGNMENT"
    definitionText?: string;         // The definition text
    definitionMatchType?: 'direct' | 'synonym' | 'cryptic' | 'none';
    definitionExplanation?: string;  // Pre-computed plain English explanation for definition
    definitionPosition?: 'start' | 'end' | 'entire';  // Where definition appears in clue
    definitionHint?: string;         // For cryptic definitions, the cryptic twist explanation

    // Teaching fields - help student learn setter techniques
    techniquesUsed?: string[];       // e.g., ['abbreviation', 'container'] - cryptic vocabulary terms
    setterHint?: string;             // e.g., "The setter has used **abbreviations** and a **container** here. Can you spot the insertion indicator?"

    // Human-readable solver comments (from new puzzle schema)
    solverComments?: string[];       // Natural language explanations from the solver

    // Clue metadata for display
    clueNumber?: string;             // e.g., "1A", "12D"
    enumeration?: string;            // e.g., "7", "9,6"

    // Publication metadata (from legacy format)
    publication?: string;            // e.g., "times"
    puzzleNumber?: number;           // e.g., 29435
    setter?: string;                 // e.g., "Unknown"

    // Answer metadata
    thesaurusRequired?: boolean;     // True if answer is uncommon (e.g., GRUB KICK) - UI can show "Thesaurus may help"
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
  setterName: string;
  publicationId?: string;
  puzzleId?: string;
  clueType?: any;
  
  evaluation: ClueEvaluation; // Keep for backward compatibility/display
  patternData?: PatternInstance; // The Engine Data

  stats: TrainingStats;
  timestamp: number;
  clueNumber?: string;
  clueDirection?: string;
  example?: any;
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
