
export interface BattlecardField {
  label: string;
  value: string;
  hint?: string;
}

export interface WordplayModule {
  type: string; // e.g., "Anagram", "Charade", "Deletion"
  indicator: {
    text: string; // The text in the clue, e.g., "snubbed"
    description: string; // e.g., "remove the last letter"
  };
  fodder: {
    text: string; // The text in the clue, e.g., "close to"
    description: string; // e.g., "words to be manipulated"
  };
  synonym?: string; // The result, e.g., "NEAR"
  thinkingHint: string[]; // Coaching tips for the decode phase
}

export interface ClueEvaluation {
  id: string;
  clue: string;
  answer: string;
  type: string; // Overall type
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Extreme';
  
  // New Workflow Data
  definition: {
    text: string;
    position: 'START' | 'END' | 'ENTIRE';
  };
  wordplay: WordplayModule[];
  structure: string; // Final equation: NEAR + T = NEAT

  // Legacy/Fallback for other components
  card: BattlecardField[]; 
  learnings: string[];
  reasoning: string;
  parsing: string;
  hints: string[];
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

export interface PatternInstance {
    id: string;
    patternId: string;
    clueText: string;
    answer: string;
    variables: Record<string, string>;
    stepOverrides?: string[]; // Optional specific step ID list for this instance
    solveSteps?: string[]; // Step-by-step solve sequence for the battlecard
    analysis?: Record<string, unknown>; // Full analysis data for partial parsing
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
