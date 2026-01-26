// ========== SOLVER TYPES (used by ClueSolver, SolverMode, ManualEntryMode) ==========

export interface ClueEvaluation {
  id: string;
  clue: string;
  answer: string;
  type: string;
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
  structure: string;
}

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

export interface WordplayState {
    indicatorFound: boolean;
    fodderFound: boolean;
    resultEntered: boolean;
    solved: boolean;
}

export interface SubOperation {
    id: string;
    operation: string;
    indicator?: string;
    fodder?: string;
    result?: string;
    dependencies: string[];
    blockedHint?: string;
    state: { solved: boolean; indicatorFound?: boolean; fodderFound?: boolean; resultEntered?: boolean; indicatorIndices?: number[]; fodderIndices?: number[] };
}

export interface FodderReference {
    type: 'result';
    fromWordplay: string[];
}

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
    extractionType?: 'first_letter' | 'last_letter' | 'odd_letters' | 'even_letters' | 'middle_letters';
}

export interface Definition {
    text: string;
    position: 'start' | 'end' | 'entire';
}

export interface ClueTypeId {
    id: 'standard' | 'double_definition' | 'cryptic_definition' | 'andit';
}

export interface WordHighlight {
    word: string;
    role: 'definition' | 'indicator' | 'fodder' | 'connector';
    stepNumber: number | null;
    colorType: 'GREEN' | 'ORANGE' | 'BLUE' | 'SLATE';
}

export interface DisplayBlock {
    type: 'setter-hint' | 'clue-type' | 'parsing' | 'explanation';
    content: string;
    label?: string;
    techniques?: string[];
}

export interface PatternInstance {
    id: string;
    clueText: string;
    answer: string;
    enumeration?: string;
    clueNumber?: string;
    clueType: ClueTypeId;
    definition: Definition;
    wordplays: Wordplay[];
    publication?: string;
    puzzleNumber?: number;
    setter?: string;
    confidence?: number;
    comments?: string[];
}

// ========== PUBLICATION/SETTER DATA TYPES ==========

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

// ========== TRAINING TYPES (V3 Template-based) ==========

export interface TrainingStats {
  attempts: number;
  successes: number;
  hintsUsed: number;
  lastSolvedAt?: number;
}

export interface TrainingItem {
  id: string;
  clue: string | { text: string; enumeration?: string; answer?: string; number?: string };
  answer: string;
  enumeration?: string;
  clueNumber?: string;

  // V3 Schema - Template-based training
  steps?: Array<{
    type: string;
    expected?: { indices: number[]; text: string };
    indicator?: { indices: number[]; text: string };
    fodder?: { indices: number[]; text: string } | string;
    result?: string;
    position?: string;
    extractionType?: string;
    letterCount?: number;
    definition?: string;
  }>;

  // Metadata
  setterName?: string;
  publicationId?: string;
  puzzleId?: string;
  timestamp?: number;
  stats?: TrainingStats;
}

// ========== SCANNER TYPES ==========

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

// ========== VIEW STATE ==========

export type ViewState =
  | { type: 'HOME' }
  | { type: 'PUBLICATION'; publicationId: string }
  | { type: 'SETTER'; publicationId: string; setterId: string }
  | { type: 'TRAINING'; publicationId: string; customClues?: ScannedClue[]; initialIndex?: number }
  | { type: 'SOLVER'; publicationId: string }
  | { type: 'MANUAL_ENTRY'; publicationId: string };

// ========== SERVER-DRIVEN RENDER INSTRUCTIONS ==========

export interface ButtonSpec {
  id: string;
  label: string;
  action: string;
  variant: 'primary' | 'secondary' | 'danger';
  requiresSelection?: boolean;
  requiresInput?: boolean;
}

export interface HighlightInstruction {
  indices: number[];
  color: 'GREEN' | 'ORANGE' | 'BLUE' | 'PURPLE';
  role: 'definition' | 'indicator' | 'fodder' | 'deleteTarget' | 'result';
  confirmed: boolean;
}

export type PanelType = 'active' | 'teaching' | 'complete' | 'blocked';

export type InputMode = 'tap_words' | 'enter_text' | 'multiple_choice' | 'none';

export interface MultipleChoiceOption {
  label: string;
  correct: boolean;
}

export interface RenderInstructions {
  panel: PanelType;
  primaryText: string;
  secondaryText?: string | null;
  inputMode: InputMode;
  inputTarget: 'indicator' | 'fodder' | 'result' | null;
  showResultInput: boolean;
  buttons: ButtonSpec[];
  highlights: HighlightInstruction[];
  stepLabel: string;
  stepProgress: string;
  stepId?: string;
  resultDisplay?: string | null;
  blockedHint?: string | null;
  options?: MultipleChoiceOption[];
}
