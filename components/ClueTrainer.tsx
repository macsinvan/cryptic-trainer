
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronRight, ChevronDown, Check, HelpCircle, Lightbulb, Zap, BookOpen } from 'lucide-react';
import { PatternInstance, WordHighlight, RenderInstructions } from '../types';
import { WORKFLOW_COLORS } from '../data/designTemplates';
import { trainingAction } from '../services/clueManager';
import { InstructionPanel } from './training/InstructionPanel';

// =============================================================================
// TYPES
// =============================================================================

type ClueType = 'standard' | 'double_definition' | 'triple_definition' | 'cryptic_definition' | 'and_lit';

type TrainingPhase =
  | 'choose'          // User chooses clue type approach
  | 'definition'      // User selecting definition words
  | 'wordplay'        // User exploring wordplay components
  | 'solve'           // User entering answer
  | 'complete';       // Showing summary

interface Word {
  id: number;
  text: string;       // cleaned (no punctuation)
  display: string;    // original with punctuation
}

interface DiscoveredPart {
  role: 'definition' | 'indicator' | 'fodder' | 'connector';
  text: string;
  wordIndices: number[];
  colorType: 'GREEN' | 'ORANGE' | 'BLUE' | 'SLATE';
  explanation?: string;
}

// =============================================================================
// PROPS
// =============================================================================

interface ClueTrainerProps {
  // Core data
  clueId?: string;
  patternData?: PatternInstance;

  // Callbacks
  onCorrect?: () => void;
  onNext: () => void;
  onGiveUp?: () => void;

  // Display options
  clueNumber?: string;
  enumeration?: string;
  setterName?: string;
  difficulty?: string;
}

// =============================================================================
// KEY LEARNINGS - Educational text shown after successful steps
// =============================================================================

const DEFINITION_LEARNINGS: Record<ClueType, string> = {
  standard: "The definition is always at the **start** or **end** — never buried in the middle. It must work as a standalone synonym or phrase that could replace the answer in a sentence.",
  double_definition: "Double definitions have **no wordplay** — just two different meanings of the same word. They're often short clues (2-4 words). Look for where one definition ends and another begins.",
  triple_definition: "Triple definitions are rare gems — three separate meanings for one word, with no wordplay. Each part must independently define the answer.",
  cryptic_definition: "The **entire clue** is a misleading definition — there's no separate wordplay. The setter uses puns, misdirection, or whimsy. Question marks often signal this type.",
  and_lit: "In an &lit clue, the **whole clue is both definition AND wordplay** simultaneously. The surface reading describes the answer while also containing the cryptic instructions. Often marked with \"!\" at the end."
};

const WORDPLAY_LEARNINGS: Record<string, string> = {
  anagram: "Anagram indicators suggest **disorder or change**: \"mixed\", \"broken\", \"wild\", \"drunk\", \"crazy\". The fodder (letters to rearrange) is always **adjacent** to the indicator.",
  container: "Container indicators signal one thing goes **inside** another: \"in\", \"around\", \"holding\", \"swallowing\". The fodder is **adjacent** to the indicator.",
  hidden: "Hidden word indicators conceal the answer **consecutively within** the clue text: \"in\", \"part of\", \"some\", \"held by\". The fodder is **adjacent** to the indicator.",
  reversal: "Reversal indicators suggest **backwards** movement: \"back\", \"returned\", \"up\" (in down clues), \"west\" (in across clues). The fodder is **adjacent** to the indicator.",
  deletion: "Deletion indicators **remove letters**: \"headless\" (first), \"endless\" (last), \"heartless\" (middle). The fodder is **adjacent** to the indicator.",
  homophone: "Homophone indicators signal a word that **sounds like** the answer: \"heard\", \"said\", \"reportedly\", \"on the radio\". The fodder is **adjacent** to the indicator.",
  abbreviation: "Common abbreviations: directions (N,S,E,W), titles (DR, ST, REV), units, symbols. \"Doctor\" = DR, \"note\" = musical letters.",
  letter_selection: "Letter selection extracts **specific letters**: \"first\" (initial), \"last\" (final), \"odd\", \"even\", \"regularly\" (alternating). The fodder is **adjacent** to the indicator.",
  letter_movement: "Letter movement **repositions letters** within a word, indicated by words suggesting motion or displacement. The fodder is **adjacent** to the indicator.",
  synonym: "Synonym substitution replaces a word with its **equivalent meaning**. The indicator and fodder combine through direct word replacement."
};

// Generate clue-specific learning sentence based on step type
const getClueSpecificLearning = (stepType: string, indicator: string, fodder: string): string => {
  const type = stepType?.toLowerCase() || '';
  switch (type) {
    case 'anagram':
      return `Here, "${indicator}" signalled an anagram and the fodder "${fodder}" was found adjacent to the indicator.`;
    case 'container':
      return `Here, "${indicator}" signalled a container and the fodder "${fodder}" was found adjacent to the indicator.`;
    case 'hidden':
      return `Here, "${indicator}" signalled a hidden word and the fodder "${fodder}" was found adjacent to the indicator.`;
    case 'reversal':
      return `Here, "${indicator}" signalled a reversal and the fodder "${fodder}" was found adjacent to the indicator.`;
    case 'deletion':
      return `Here, "${indicator}" signalled a deletion and the fodder "${fodder}" was found adjacent to the indicator.`;
    case 'homophone':
      return `Here, "${indicator}" signalled a homophone and the fodder "${fodder}" was found adjacent to the indicator.`;
    case 'letter_selection':
      return `Here, "${indicator}" signalled letter selection and the fodder "${fodder}" was found adjacent to the indicator.`;
    case 'letter_movement':
      return `Here, "${indicator}" signalled letter movement and the fodder "${fodder}" was found adjacent to the indicator.`;
    case 'abbreviation':
      return `Here, "${fodder}" is a common abbreviation that solvers learn to recognise.`;
    case 'synonym':
      return `Here, "${fodder}" provides a synonym that contributes to the answer.`;
    default:
      // No silent fallback - unknown types should be fixed in metadata
      return '';
  }
};

// Helper to render markdown-style **bold** text as JSX
const renderLearningText = (text: string): React.ReactNode => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

// =============================================================================
// COMPONENT
// =============================================================================

export const ClueTrainer: React.FC<ClueTrainerProps> = ({
  clueId,
  patternData,
  onCorrect,
  onNext,
  onGiveUp,
  clueNumber,
  enumeration,
  setterName,
  difficulty
}) => {
  // ---------------------------------------------------------------------------
  // STATE - Thin Client: Only UI interaction state, no business logic
  // ---------------------------------------------------------------------------

  // Core phase state
  const [phase, setPhase] = useState<TrainingPhase>('choose');
  const [identifiedType, setIdentifiedType] = useState<ClueType | null>(null);

  // Definition phase UI state - ONLY ephemeral user input (pre-check selection)
  const [selectedIndices, setSelectedIndices] = useState<number[]>();

  // Solve phase UI state
  const [grid, setGrid] = useState<string[]>([]);

  // Wordplay phase UI state - ONLY ephemeral user input (pre-check selections)
  const [showWordplayDetail, setShowWordplayDetail] = useState(false);
  type DecodeMethod = 'literal' | 'synonym' | 'abbreviation' | null;
  const [selectedIndicatorIndices, setSelectedIndicatorIndices] = useState<number[]>([]);
  const [selectedDeleteTargetIndices, setSelectedDeleteTargetIndices] = useState<number[]>([]);
  const [selectedFodderIndices, setSelectedFodderIndices] = useState<number[]>([]);
  const [selectedDecodeMethod, setSelectedDecodeMethod] = useState<DecodeMethod>(null);
  const [decodeMethodInput, setDecodeMethodInput] = useState('');
  const [impliedResultInput, setImpliedResultInput] = useState('');
  const [stepResultInput, setStepResultInput] = useState('');
  const [expandedCompletedSteps, setExpandedCompletedSteps] = useState<number[]>([]);
  const [revealedIndicatorSteps, setRevealedIndicatorSteps] = useState<number[]>([]);

  // Temporary UI feedback state - for showing brief correct/wrong feedback
  // This is reset after each check action completes
  type CheckFeedback = { type: 'indicator' | 'fodder' | 'result' | 'deleteTarget' | 'decodeMethod' | 'impliedResult'; correct: boolean } | null;
  const [checkFeedback, setCheckFeedback] = useState<CheckFeedback>(null);

  // NOTE: All wordplay phase state is now derived from serverState
  // - currentPhase replaces wordplaySubPhase
  // - indicatorFound/fodderFound/resultFound replace hasChecked*/isCorrect* pairs
  // - allIndicatorIndices/allFodderIndices replace confirmedHighlights

  // SERVER STATE - Single source of truth for training progress
  // Server controls: which wordplay to work on, what phase, what's solved
  // Note: Server returns phases: indicator, fodder, result, blocked, complete
  // Legacy UI phases (deleteTarget, decodeMethod, discovery, assembly) are included for compatibility
  // but not used in the minimal state architecture
  const [serverState, setServerStateRaw] = useState<{
    clueEntry: any;
    currentWordplay: any;  // The actual wordplay/subOperation object from server
    currentWordplayIndex: number;
    currentPhase: 'indicator' | 'fodder' | 'result' | 'blocked' | 'complete' | 'teaching' | 'deleteTarget' | 'decodeMethod' | 'discovery' | 'assembly';
    blocked: boolean;
    blockedHint: string;
    allSolved: boolean;
    render?: RenderInstructions;  // Server-driven render instructions
  } | null>(null);

  // Wrapper to log every serverState change - includes render instructions
  const setServerState = (value: any) => {
    if (typeof value === 'function') {
      setServerStateRaw((prev: any) => {
        const result = value(prev);
        console.log('[setServerState] UPDATE:', {
          currentPhase: result?.currentPhase,
          renderPanel: result?.render?.panel,
          renderStepLabel: result?.render?.stepLabel,
          renderShowResultInput: result?.render?.showResultInput,
          wordplayId: result?.currentWordplay?.id,
        });
        return result;
      });
    } else {
      console.log('[setServerState] SET:', {
        currentPhase: value?.currentPhase,
        renderPanel: value?.render?.panel,
        renderStepLabel: value?.render?.stepLabel,
        renderShowResultInput: value?.render?.showResultInput,
        wordplayId: value?.currentWordplay?.id,
      });
      setServerStateRaw(value);
    }
  };

  // Derive currentWordplayStep from server state (fallback to 0 for legacy)
  const currentWordplayStep = serverState?.currentWordplayIndex ?? 0;

  // ---------------------------------------------------------------------------
  // DERIVED FROM SERVER STATE - NOT state variables
  // ---------------------------------------------------------------------------
  // DEBUG: Log when serverState changes
  console.log('[DERIVED] serverState?.currentWordplay?.id:', serverState?.currentWordplay?.id,
    'state:', serverState?.currentWordplay?.state);

  const currentPhase = serverState?.currentPhase ?? 'indicator';

  // Definition state (from clueEntry.state)
  const definitionFound = serverState?.clueEntry?.state?.definitionFound ?? false;
  const definitionIndices = serverState?.clueEntry?.state?.definitionIndices ?? [];

  // Current wordplay state (for phase logic)
  const indicatorFound = serverState?.currentWordplay?.state?.indicatorFound ?? false;
  const fodderFound = serverState?.currentWordplay?.state?.fodderFound ?? false;
  const resultFound = serverState?.currentWordplay?.state?.resultEntered ?? false;

  // AGGREGATED indices from ALL wordplays - for persistent highlighting
  // This collects indices from all wordplays (including subOperations) so highlights persist
  // even when we move to a different wordplay step
  const { allIndicatorIndices, allFodderIndices } = useMemo(() => {
    const indicatorIndices: number[] = [];
    const fodderIndices: number[] = [];

    const wordplays = serverState?.clueEntry?.wordplays ?? [];
    for (const wp of wordplays) {
      // Check main wordplay state
      if (wp.state?.indicatorIndices) {
        indicatorIndices.push(...wp.state.indicatorIndices);
      }
      if (wp.state?.fodderIndices) {
        fodderIndices.push(...wp.state.fodderIndices);
      }
      // Check subOperations
      for (const sub of wp.subOperations ?? []) {
        if (sub.state?.indicatorIndices) {
          indicatorIndices.push(...sub.state.indicatorIndices);
        }
        if (sub.state?.fodderIndices) {
          fodderIndices.push(...sub.state.fodderIndices);
        }
      }
    }

    return { allIndicatorIndices: indicatorIndices, allFodderIndices: fodderIndices };
  }, [serverState?.clueEntry?.wordplays]);

  // Legacy: single wordplay indices (still used for some logic)
  const confirmedIndicatorIndices = serverState?.currentWordplay?.state?.indicatorIndices ?? [];
  const confirmedFodderIndices = serverState?.currentWordplay?.state?.fodderIndices ?? [];

  // Local override for special clue types (DD, TD, CD, &lit) that don't use server definition flow
  const [specialTypeDefinition, setSpecialTypeDefinition] = useState<DiscoveredPart | null>(null);

  // Derived: discoveredParts from serverState OR special type override
  const discoveredParts = useMemo<DiscoveredPart[]>(() => {
    // Special type takes precedence (DD, TD, CD, &lit)
    if (specialTypeDefinition) {
      return [specialTypeDefinition];
    }
    // Otherwise use server state
    if (!definitionFound || definitionIndices.length === 0) return [];
    // Build the definition text from word indices
    const words = (patternData?.clueText || '').split(/\s+/);
    const defText = definitionIndices.map((i: number) => words[i] || '').join(' ');
    return [{
      role: 'definition' as const,
      text: defText,
      wordIndices: definitionIndices,
      colorType: 'GREEN' as const,
      explanation: `"${defText}" is the definition`
    }];
  }, [definitionFound, definitionIndices, patternData?.clueText, specialTypeDefinition]);

  // Refs
  const gridRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ---------------------------------------------------------------------------
  // DERIVED DATA
  // ---------------------------------------------------------------------------

  const clueText = patternData?.clueText || '';
  const answer = patternData?.answer || '';
  const displayEnumeration = enumeration || patternData?.enumeration || '';
  const displayClueNumber = clueNumber || patternData?.clueNumber || '';

  // Tokenize clue into words
  const words = useMemo<Word[]>(() => {
    return clueText.split(/\s+/).map((word, i) => ({
      id: i,
      text: word.replace(/[.,;!?()'"]/g, '').toLowerCase(),
      display: word
    }));
  }, [clueText]);

  // Expected definition (from data or mock)
  // V2: Use patternData.definition.text and patternData.definition.position
  const expectedDefinition = useMemo(() => {
    const defText = patternData?.definition?.text || patternData?.definitionText;
    const defPosition = patternData?.definition?.position || patternData?.definitionPosition;

    if (defText) {
      // Find word indices that match the definition text
      const defWords = defText.toLowerCase().split(/\s+/);
      const indices: number[] = [];

      // Search from start
      if (defPosition === 'start') {
        for (let i = 0; i < defWords.length && i < words.length; i++) {
          if (words[i].text === defWords[i]) indices.push(i);
        }
      }
      // Search from end
      else if (defPosition === 'end') {
        for (let i = 0; i < defWords.length; i++) {
          const wordIdx = words.length - defWords.length + i;
          if (wordIdx >= 0 && words[wordIdx].text === defWords[i]) {
            indices.push(wordIdx);
          }
        }
      }

      return {
        text: defText,
        position: defPosition || 'end',
        wordIndices: indices
      };
    }
    // No definition found - return empty
    return {
      text: '',
      position: 'end' as const,
      wordIndices: []
    };
  }, [patternData, words]);

  // Get wordplay steps from source data
  // Source format uses `steps` array with `training` sub-object
  const wordplaySteps = useMemo(() => {
    // Source format: steps array
    if (patternData?.steps && patternData.steps.length > 0) {
      return patternData.steps
        .filter((s: any) => s.operation !== 'charade') // Exclude assembly steps
        .map((s: any) => ({
          indicator: s.indicator || '',
          fodder: typeof s.fodder === 'string' ? s.fodder : '',
          result: s.result || '',
          synonym: '',
          hint: s.training?.explanation || '',
          complexity: s.training?.complexity || 1,
          isAssembly: s.operation === 'charade',
          stepType: s.operation as any,
          explanation: s.training?.explanation || '',
          dependsOnSteps: s.training?.dependsOnSteps || [],
          canSolveIndependently: s.training?.canSolveIndependently ?? true,
        }));
    }
    // V2 format: wordplays array with dependencies and state
    if (patternData?.wordplays && patternData.wordplays.length > 0) {
      return patternData.wordplays
        .filter((wp: any) => wp.operation !== 'charade')
        .map((wp: any) => ({
          id: wp.id || '',
          indicator: wp.indicator || '',
          fodder: typeof wp.fodder === 'string' ? wp.fodder : '',
          fodderRef: typeof wp.fodder === 'object' ? wp.fodder : null,
          result: wp.result || '',
          synonym: '',
          hint: wp.blockedHint || '',
          complexity: 1,
          isAssembly: wp.operation === 'charade',
          stepType: wp.operation as any,
          explanation: wp.explanation || '',
          dependencies: wp.dependencies || [],
          blockedHint: wp.blockedHint || '',
          state: wp.state,
          subOperations: wp.subOperations,
        }));
    }
    const steps = patternData?.wordplaySteps || [];
    return steps.filter((step: any) => !step.isAssembly);
  }, [patternData]);

  // Use server's currentWordplay directly as currentStep (for subOperations support)
  // Falls back to wordplaySteps for legacy/non-server mode
  const currentStep = serverState?.currentWordplay || wordplaySteps[currentWordplayStep];

  // DERIVED FROM SERVER: completedSteps = indices where state.solved is true
  // Server is source of truth for what's solved
  const completedSteps = useMemo(() => {
    // Use server's clueEntry if available, otherwise fall back to patternData
    const wordplaysSource = serverState?.clueEntry?.wordplays || patternData?.wordplays || [];
    const indices: number[] = [];
    wordplaysSource.forEach((wp: any, idx: number) => {
      if (wp.state?.solved) {
        indices.push(idx);
      }
    });
    return indices;
  }, [serverState, patternData]);

  // DERIVED: onHoldSteps - no longer used in server-driven model
  // Server handles all dependency logic, so there are no "on-hold" steps
  // Keep as empty array for backward compatibility with UI code
  const onHoldSteps: number[] = [];

  // DERIVED: blockedWordplays - which wordplays have unsolved dependencies
  // Computed from server state for UI display (progress dots)
  const blockedWordplays = useMemo(() => {
    const wordplaysSource = serverState?.clueEntry?.wordplays || patternData?.wordplays || [];
    return wordplaySteps.map((_, idx) => {
      const wp = wordplaysSource[idx];
      if (!wp || !wp.dependencies || wp.dependencies.length === 0) return false;
      // Check if any dependency is unsolved
      return wp.dependencies.some((depId: string) => {
        const dep = wordplaysSource.find((w: any) => w.id === depId);
        return dep && !dep.state?.solved;
      });
    });
  }, [serverState, patternData, wordplaySteps]);

  // DERIVED FROM SERVER: Check if current step is blocked
  const isCurrentStepBlocked = serverState?.blocked || false;

  // Check if current step has an indicator (vs indicatorless like synonym/abbreviation)
  // Using direct computation (not useMemo) to avoid any stale value issues
  const stepHasIndicator = Boolean(currentStep?.indicator && currentStep.indicator.trim() !== '');

  // Check if current step is a deletion with implied operation (needs discovery flow)
  const isDeletionWithImpliedOp = useMemo(() => {
    if (!currentStep) return false;
    return currentStep.stepType === 'deletion' &&
           currentStep.deleteTarget &&
           currentStep.impliedOperation;
  }, [currentStep]);

  // Check if a step's fodder is "dependent" (uses results from previous steps, not clue text)
  const isFodderDependent = useMemo(() => {
    if (!currentStep) return false;
    // Deletion with implied op is NOT dependent - fodder comes from clue
    if (isDeletionWithImpliedOp) return false;
    // V2: fodder can be string or FodderReference object
    const fodderStr = typeof currentStep.fodder === 'string' ? currentStep.fodder : '';
    const fodder = fodderStr.toLowerCase();
    if (!fodder) return false;
    // Check if fodder words exist in the clue text
    const fodderWords = fodder.split(/\s+/).map(w => w.replace(/[^a-z]/gi, '').toLowerCase());
    const clueWordsLower = words.map(w => w.text.toLowerCase());
    // A fodder is dependent if most of its words aren't in the clue
    const wordsInClue = fodderWords.filter(fw => fw && clueWordsLower.includes(fw));
    return wordsInClue.length < fodderWords.length / 2;
  }, [currentStep, words, isDeletionWithImpliedOp]);

  // Compute accumulated letters from completed steps (only independent steps like letter_selection)
  const accumulatedLetters = useMemo(() => {
    return completedSteps
      .filter(stepIdx => {
        const step = wordplaySteps[stepIdx];
        // Only count steps that produce independent results (not container assembly)
        return step && step.stepType !== 'container' && step.stepType !== 'anagram';
      })
      .map(stepIdx => wordplaySteps[stepIdx]?.result || '')
      .join('');
  }, [completedSteps, wordplaySteps]);

  // Compute letters still needed
  const lettersNeeded = useMemo(() => {
    const answerLength = answer.replace(/[^A-Z]/gi, '').length;
    return answerLength - accumulatedLetters.length;
  }, [answer, accumulatedLetters]);

  // For container steps that assemble an anagram + other letters, compute the assembled fodder
  // Server handles dependency logic - this is just for display
  const assembledAnagramFodder = useMemo(() => {
    if (!currentStep || currentStep.stepType !== 'container') return null;

    // Find anagram step that's not yet solved
    const anagramStepIdx = wordplaySteps.findIndex((wp: any) =>
      wp.stepType === 'anagram' && !wp.state?.solved
    );
    if (anagramStepIdx === -1) return null;

    const anagramStep = wordplaySteps[anagramStepIdx];
    const anagramFodder = anagramStep?.fodder || '';

    // Get completed results (like EB from letter_selection)
    const completedResults = completedSteps
      .filter(idx => idx !== anagramStepIdx && wordplaySteps[idx]?.stepType !== 'container')
      .map(idx => wordplaySteps[idx]?.result || '')
      .filter(r => r);

    if (completedResults.length === 0) return null;

    // Assemble: fodder + inserted letters for container operations
    return `${anagramFodder} ${completedResults.join(' ')}`.trim();
  }, [currentStep, completedSteps, wordplaySteps]);

  // Check if current step is a container that assembles letters for a pending anagram
  // Server handles this logic - check if there's an unsolved anagram with dependencies
  const isContainerAssemblyStep = useMemo(() => {
    if (!currentStep || currentStep.stepType !== 'container') return false;
    // Check if there's an unsolved anagram step
    return wordplaySteps.some((wp: any) => wp.stepType === 'anagram' && !wp.state?.solved);
  }, [currentStep, wordplaySteps]);

  // Check if current step is an anagram that was resumed after assembly
  // (container step completed, now solving the anagram with assembled letters)
  const isResumedAnagramWithAssembly = useMemo(() => {
    if (!currentStep || currentStep.stepType !== 'anagram') return false;
    // Check if a container step has been completed
    const containerCompleted = completedSteps.some(idx => wordplaySteps[idx]?.stepType === 'container');
    // And we have other completed steps (like letter_selection)
    const hasOtherResults = completedSteps.some(idx => {
      const step = wordplaySteps[idx];
      return step && step.stepType !== 'container' && step.stepType !== 'anagram';
    });
    return containerCompleted && hasOtherResults;
  }, [currentStep, completedSteps, wordplaySteps]);

  // Get the assembled anagram fodder for a resumed anagram
  const resumedAnagramFodder = useMemo(() => {
    if (!isResumedAnagramWithAssembly || !currentStep) return null;

    // V2: fodder can be string or FodderReference object
    const anagramFodder = typeof currentStep.fodder === 'string' ? currentStep.fodder : '';
    // Get results from non-anagram, non-container completed steps
    const otherResults = completedSteps
      .filter(idx => {
        const step = wordplaySteps[idx];
        return step && step.stepType !== 'container' && step.stepType !== 'anagram';
      })
      .map(idx => wordplaySteps[idx]?.result || '')
      .filter(r => r);

    return `${anagramFodder} ${otherResults.join(' ')}`.trim();
  }, [isResumedAnagramWithAssembly, currentStep, completedSteps, wordplaySteps]);

  // Compute which word indices are "used" (highlighted in completed steps or definition)
  const usedWordIndices = useMemo(() => {
    const used = new Set<number>();
    // Definition words
    for (const part of discoveredParts) {
      part.wordIndices.forEach(i => used.add(i));
    }
    // Completed wordplay step words (from aggregated server indices)
    allIndicatorIndices.forEach(i => used.add(i));
    allFodderIndices.forEach(i => used.add(i));
    return used;
  }, [discoveredParts, allIndicatorIndices, allFodderIndices]);

  // Get unused words (not yet highlighted)
  const unusedWords = useMemo(() => {
    return words.filter((_, idx) => !usedWordIndices.has(idx));
  }, [words, usedWordIndices]);

  // ---------------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Reset UI state when clue changes
    setPhase('choose');
    setSelectedIndices([]);
    setDefinitionCheckFeedback(null);
    setSpecialTypeDefinition(null);
    setShowWordplayDetail(false);
    setIdentifiedType(null);
    // Ephemeral selection state
    setSelectedIndicatorIndices([]);
    setSelectedDeleteTargetIndices([]);
    setSelectedFodderIndices([]);
    setSelectedDecodeMethod(null);
    setStepResultInput('');
    setExpandedCompletedSteps([]);
    setRevealedIndicatorSteps([]);
    setCheckFeedback(null);
    // Reset server state - this resets all phase/highlighting state
    setServerState(null);

    // Initialize answer grid
    const cleanAnswer = answer.replace(/[^A-Z]/gi, '').toUpperCase();
    setGrid(new Array(cleanAnswer.length).fill(''));
  }, [clueText, answer]);

  // When entering wordplay phase, ask server for first available wordplay
  // Server is source of truth for training state
  useEffect(() => {
    console.log('[useEffect wordplay init] phase:', phase, 'clueId:', clueId, 'hasServerState:', !!serverState);
    // Only call start if we don't already have server state
    // This prevents resetting state when the effect re-runs
    if (phase === 'wordplay' && clueId && !serverState) {
      console.warn('!!!! [useEffect wordplay init] CALLING trainingAction start - no existing serverState !!!!');
      trainingAction(clueId, 'start').then(response => {
        console.warn('!!!! [useEffect wordplay init] Got response, setting serverState !!!!');
        if (response.success) {
          // Store full server state - this is the source of truth
          setServerState({
            clueEntry: response.clueEntry,
            currentWordplay: response.currentWordplay,  // Server's actual wordplay/subOp
            currentWordplayIndex: response.currentWordplayIndex ?? 0,
            currentPhase: response.currentPhase || 'indicator',
            blocked: response.blocked || false,
            blockedHint: response.blockedHint || '',
            allSolved: response.allSolved || false,
            render: response.render,  // Include render instructions
          });

          // Phase is derived from serverState.currentPhase, no need to set manually
          // Just handle the 'complete' case to transition training phase
          if (response.currentPhase === 'complete') {
            setPhase('solve');
          }
        }
      }).catch(err => {
        console.warn('[training] Could not get initial wordplay:', err);
      });
    }
  }, [phase, clueId]);

  // When currentPhase becomes 'complete', move to solve phase
  useEffect(() => {
    if (currentPhase === 'complete') {
      setPhase('solve');
    }
  }, [currentPhase]);

  // NOTE: wordplaySubPhase removed - use currentPhase (derived from serverState) directly

  // ---------------------------------------------------------------------------
  // INTERACTION HANDLERS
  // ---------------------------------------------------------------------------

  const handleWordTap = (wordIndex: number) => {
    // Definition phase - contiguous selection
    if (phase === 'definition') {
      // Don't allow changes after successful check (feedback showing)
      if (definitionCheckFeedback === 'correct') {
        return;
      }
      setSelectedIndices(prev => {
        const current = prev ?? [];
        if (current.includes(wordIndex)) {
          return current.filter(i => i !== wordIndex);
        }
        // Keep selection contiguous for definition phase
        if (current.length > 0) {
          const min = Math.min(...current, wordIndex);
          const max = Math.max(...current, wordIndex);
          return Array.from({ length: max - min + 1 }, (_, i) => min + i);
        }
        return [...current, wordIndex].sort((a, b) => a - b);
      });
      return;
    }

    // Wordplay phase - indicator, deleteTarget, or fodder selection
    if (phase === 'wordplay' && !showWordplayDetail) {
      if (currentPhase === 'indicator') {
        setSelectedIndicatorIndices(prev => {
          if (prev.includes(wordIndex)) {
            return prev.filter(i => i !== wordIndex);
          }
          return [...prev, wordIndex].sort((a, b) => a - b);
        });
      } else if (currentPhase === 'deleteTarget') {
        setSelectedDeleteTargetIndices(prev => {
          if (prev.includes(wordIndex)) {
            return prev.filter(i => i !== wordIndex);
          }
          return [...prev, wordIndex].sort((a, b) => a - b);
        });
      } else if (currentPhase === 'fodder') {
        // For indicatorless steps, auto-validate on single word tap (no Check button needed)
        if (!stepHasIndicator) {
          // Check if tapped word matches the expected fodder
          const tappedWord = words[wordIndex].text;
          // V2: fodder can be string or FodderReference object - only use string values
          const fodderValue = currentStep?.fodder;
          const targetFodder = (typeof fodderValue === 'string' ? fodderValue : '').toLowerCase().replace(/[.,;!?()'"]/g, '');

          if (tappedWord === targetFodder) {
            // Correct - set fodder and auto-advance to decode method
            setSelectedFodderIndices([wordIndex]);
            // Legacy: fodder state now from server
            // Legacy: fodder state now from server
            setTimeout(() => {
              // Phase controlled by serverState.currentPhase
            }, 300); // Brief highlight before advancing
          } else {
            // Wrong word - brief red flash then clear
            setSelectedFodderIndices([wordIndex]);
            // Legacy: fodder state now from server
            // Legacy: fodder state now from server
            setTimeout(() => {
              setSelectedFodderIndices([]);
              // Legacy: fodder state now from server
              // Legacy: fodder state now from server
            }, 600);
          }
        } else {
          // Steps with indicators - normal multi-word selection
          setSelectedFodderIndices(prev => {
            if (prev.includes(wordIndex)) {
              return prev.filter(i => i !== wordIndex);
            }
            return [...prev, wordIndex].sort((a, b) => a - b);
          });
        }
      }
      return;
    }
  };

  const handleChooseStandard = () => {
    setIdentifiedType('standard');
    setPhase('definition');
  };

  // Temporary feedback state for definition check (for red flash on wrong answer)
  const [definitionCheckFeedback, setDefinitionCheckFeedback] = useState<'correct' | 'wrong' | null>(null);

  const handleCheckDefinition = async () => {
    if (!clueId || !selectedIndices || selectedIndices.length === 0) return;

    const selectedText = selectedIndices.map(i => words[i].text).join(' ');

    try {
      const response = await trainingAction(clueId, 'check_definition', {
        selected: selectedText,
        selectedIndices: selectedIndices,
      });

      const isCorrect = response.validation?.correct || false;

      // Show feedback
      setDefinitionCheckFeedback(isCorrect ? 'correct' : 'wrong');

      // Update server state - create new state if none exists
      setServerState((prev: any) => ({
        clueEntry: response.clueEntry,
        currentWordplay: prev?.currentWordplay ?? null,
        currentWordplayIndex: prev?.currentWordplayIndex ?? 0,
        currentPhase: prev?.currentPhase ?? 'indicator',
        blocked: prev?.blocked ?? false,
        blockedHint: prev?.blockedHint ?? '',
        allSolved: prev?.allSolved ?? false,
      }));

      if (isCorrect) {
        // Clear selection after brief delay, then move to wordplay phase
        setTimeout(() => {
          setSelectedIndices([]);
          setDefinitionCheckFeedback(null);
          setPhase('wordplay');
        }, 600);
      } else {
        // Wrong - clear selection after brief red flash
        setTimeout(() => {
          setSelectedIndices([]);
          setDefinitionCheckFeedback(null);
        }, 800);
      }
    } catch (err) {
      console.warn('[training] Definition check failed:', err);
    }
  };

  const handleSpecialType = (type: ClueType) => {
    setIdentifiedType(type);

    if (type === 'double_definition' || type === 'triple_definition') {
      // For DD/TD, the whole clue is definitions - move to solve
      setSpecialTypeDefinition({
        role: 'definition',
        text: clueText,
        wordIndices: words.map((_, i) => i),
        colorType: 'GREEN',
        explanation: type === 'double_definition'
          ? 'Both parts define the same answer'
          : 'All three parts define the same answer'
      });
      setPhase('solve');
    } else if (type === 'cryptic_definition') {
      // CD - entire clue is a cryptic definition
      setSpecialTypeDefinition({
        role: 'definition',
        text: clueText,
        wordIndices: words.map((_, i) => i),
        colorType: 'GREEN',
        explanation: 'The entire clue is a cryptic definition with hidden meaning'
      });
      setPhase('solve');
    } else if (type === 'and_lit') {
      // &lit - entire clue is both definition AND wordplay
      setSpecialTypeDefinition({
        role: 'definition',
        text: clueText,
        wordIndices: words.map((_, i) => i),
        colorType: 'GREEN',
        explanation: 'The entire clue reads as both a definition AND wordplay instructions'
      });
      setPhase('wordplay');
    }
  };

  const handleCheckIndicator = async () => {
    if (!currentStep || !clueId) return;

    const selectedText = selectedIndicatorIndices.map(i => words[i].text).join(' ');

    try {
      // Ask server to validate indicator selection
      const response = await trainingAction(clueId, 'check_indicator', {
        wordplayId: currentStep.id,
        selected: selectedText,
        selectedIndices: selectedIndicatorIndices,  // Send indices for server to store
      });

      const isCorrect = response.validation?.correct || false;

      // DEBUG: Log the full response to verify indices are returned
      console.log('[handleCheckIndicator] response:', JSON.stringify(response, null, 2));
      console.log('[handleCheckIndicator] response.currentWordplay?.state:', response.currentWordplay?.state);

      // Show feedback briefly
      setCheckFeedback({ type: 'indicator', correct: isCorrect });

      // Update server state - this is the ONLY state change needed
      console.log('[handleCheckIndicator] About to setServerState, response.currentWordplay:', response.currentWordplay?.id, response.currentWordplay?.state);
      setServerState(prev => {
        console.log('[handleCheckIndicator] Inside setServerState, prev:', prev?.currentWordplay?.id, prev?.currentWordplay?.state);
        if (!prev) return null;
        const newState = {
          ...prev,
          clueEntry: response.clueEntry,
          currentWordplay: response.currentWordplay ?? prev.currentWordplay,
          currentWordplayIndex: response.currentWordplayIndex ?? prev.currentWordplayIndex,
          currentPhase: response.currentPhase ?? prev.currentPhase,
          render: response.render,  // Include render instructions
        };
        console.log('[handleCheckIndicator] New state will be:', newState.currentWordplay?.id, newState.currentWordplay?.state);
        return newState;
      });

      // Clear selection and feedback after brief delay
      setTimeout(() => {
        setSelectedIndicatorIndices([]);
        setCheckFeedback(null);
        // If complete, move to solve phase
        if (response.currentPhase === 'complete') {
          setPhase('solve');
        }
      }, isCorrect ? 600 : 800);

    } catch (err) {
      console.warn('[training] Indicator check failed:', err);
    }
  };

  const handleCheckDeleteTarget = () => {
    if (!currentStep || !currentStep.deleteTarget) return;

    // Get the selected text
    const selectedText = selectedDeleteTargetIndices.map(i => words[i].text).join(' ');
    const targetDelete = currentStep.deleteTarget.toLowerCase().replace(/[.,;!?()'"]/g, '');

    // Check if it matches
    const isMatch = selectedText === targetDelete ||
                    selectedText.includes(targetDelete) ||
                    targetDelete.includes(selectedText);

    // Legacy: deleteTarget state removed
    // Legacy: deleteTarget state removed

    if (isMatch) {
      // Correct - auto-advance to fodder selection
      setTimeout(() => {
        // Phase controlled by serverState.currentPhase
      }, 600);
    } else {
      // Wrong - auto-clear after brief red flash
      setTimeout(() => {
        setSelectedDeleteTargetIndices([]);
        // Legacy: deleteTarget state removed
        // Legacy: deleteTarget state removed
      }, 800);
    }
  };

  const handleCheckFodder = async () => {
    if (!currentStep || !clueId) return;

    const selectedText = selectedFodderIndices.map(i => words[i].text).join(' ');

    try {
      // Ask server to validate fodder selection
      const response = await trainingAction(clueId, 'check_fodder', {
        wordplayId: currentStep.id,
        selected: selectedText,
        selectedIndices: selectedFodderIndices,  // Send indices for server to store
      });

      const isCorrect = response.validation?.correct || false;

      // Show feedback briefly
      setCheckFeedback({ type: 'fodder', correct: isCorrect });

      // Update server state - this is the ONLY state change needed
      setServerState(prev => prev ? {
        ...prev,
        clueEntry: response.clueEntry,
        currentWordplay: response.currentWordplay ?? prev.currentWordplay,
        currentWordplayIndex: response.currentWordplayIndex ?? prev.currentWordplayIndex,
        currentPhase: response.currentPhase ?? prev.currentPhase,
        render: response.render,  // Include render instructions
      } : null);

      // Clear selection and feedback after brief delay
      setTimeout(() => {
        setSelectedFodderIndices([]);
        setCheckFeedback(null);
        // If moving to new wordplay, also clear indicator selection
        if (response.currentPhase === 'indicator') {
          setSelectedIndicatorIndices([]);
        }
        // If complete, move to solve phase
        if (response.currentPhase === 'complete') {
          setPhase('solve');
        }
      }, isCorrect ? 600 : 800);

    } catch (err) {
      console.warn('[training] Fodder check failed:', err);
    }
  };

  const handlePassTeaching = async () => {
    if (!currentStep || !clueId) return;

    try {
      const response = await trainingAction(clueId, 'pass_teaching', {
        wordplayId: currentStep.id,
      });

      setServerState(prev => prev ? {
        ...prev,
        clueEntry: response.clueEntry,
        currentWordplay: response.currentWordplay ?? prev.currentWordplay,
        currentWordplayIndex: response.currentWordplayIndex ?? prev.currentWordplayIndex,
        currentPhase: response.currentPhase ?? prev.currentPhase,
        render: response.render,  // Include render instructions
      } : null);

      // Clear selections for new wordplay
      setSelectedIndicatorIndices([]);
      setSelectedFodderIndices([]);

      if (response.currentPhase === 'complete') {
        setPhase('solve');
      }
    } catch (err) {
      console.warn('[training] Pass teaching failed:', err);
    }
  };

  // Unified action handler for InstructionPanel - handles all server actions
  const handleServerAction = async (action: string) => {
    if (!clueId) return;

    const currentWp = serverState?.currentWordplay;
    const phase = serverState?.currentPhase;

    // Build request data based on action
    let data: any = { wordplayId: currentWp?.id };

    // Map action to server action and add appropriate data
    let serverAction = action;

    if (action === 'check_indicator') {
      const selectedText = selectedIndicatorIndices.map(i => words[i].text).join(' ');
      data.selected = selectedText;
      data.selectedIndices = selectedIndicatorIndices;
    } else if (action === 'check_fodder') {
      const selectedText = selectedFodderIndices.map(i => words[i].text).join(' ');
      data.selected = selectedText;
      data.selectedIndices = selectedFodderIndices;
    } else if (action === 'check_result') {
      data.entered = stepResultInput.toUpperCase();
    }

    try {
      const response = await trainingAction(clueId, serverAction as any, data);

      // Show feedback if validation
      if (response.validation) {
        setCheckFeedback({
          type: phase === 'indicator' ? 'indicator' : phase === 'fodder' ? 'fodder' : 'result',
          correct: response.validation.correct
        });
      }

      // Update server state including render instructions
      setServerState(prev => prev ? {
        ...prev,
        clueEntry: response.clueEntry,
        currentWordplay: response.currentWordplay ?? prev.currentWordplay,
        currentWordplayIndex: response.currentWordplayIndex ?? prev.currentWordplayIndex,
        currentPhase: response.currentPhase ?? prev.currentPhase,
        blockedHint: response.blockedHint ?? prev.blockedHint,
        render: response.render,  // Include render instructions
      } : null);

      // Clear inputs after delay
      setTimeout(() => {
        setCheckFeedback(null);
        if (response.validation?.correct) {
          setSelectedIndicatorIndices([]);
          setSelectedFodderIndices([]);
          setStepResultInput('');
        }
        if (response.currentPhase === 'complete' || response.allSolved) {
          setPhase('solve');
        }
      }, response.validation?.correct ? 600 : 800);

    } catch (err) {
      console.warn('[training] Server action failed:', err);
    }
  };

  // Feedback state for InstructionPanel
  const instructionPanelFeedback = checkFeedback ? {
    type: checkFeedback.correct ? 'success' as const : 'error' as const,
    message: checkFeedback.correct ? 'Correct!' : 'Not quite - try again'
  } : null;

  const handleCheckDecodeMethod = () => {
    if (!currentStep || !selectedDecodeMethod) return;

    const targetResult = (currentStep.result || '').toUpperCase().replace(/[^A-Z]/g, '');
    // V2: fodder can be string or FodderReference object - only use string values
    const fodderStr = typeof currentStep.fodder === 'string' ? currentStep.fodder : '';
    const fodderText = fodderStr.toUpperCase().replace(/[^A-Z]/g, '');
    const userInput = decodeMethodInput.toUpperCase().replace(/[^A-Z]/g, '');

    let isCorrect = false;

    if (selectedDecodeMethod === 'literal') {
      // Literal means the word itself is used (fodder = result)
      isCorrect = fodderText === targetResult;
    } else if (selectedDecodeMethod === 'synonym' || selectedDecodeMethod === 'abbreviation') {
      // User typed a value - check if it matches the result
      isCorrect = userInput === targetResult;
    }

    // Show feedback
    setCheckFeedback({ type: 'decodeMethod', correct: isCorrect });

    if (isCorrect) {
      // Correct - auto-advance to result phase with result pre-filled
      setTimeout(() => {
        setCheckFeedback(null);
        if (selectedDecodeMethod === 'literal') {
          // For literal, we already know the result - auto-fill and complete
          setStepResultInput(targetResult);
        } else {
          // For synonym/abbreviation, the user typed the result - auto-fill
          setStepResultInput(userInput);
        }
      }, 600);
    } else {
      // Wrong - reset feedback after flash
      setTimeout(() => {
        setCheckFeedback(null);
        // Don't clear the method selection, just let them try again
      }, 800);
    }
  };

  const handleCheckImpliedResult = () => {
    if (!currentStep || !currentStep.impliedResult) return;

    const targetImplied = currentStep.impliedResult.toUpperCase().replace(/[^A-Z]/g, '');
    const userImplied = impliedResultInput.toUpperCase().replace(/[^A-Z]/g, '');

    const isMatch = userImplied === targetImplied;

    // Show feedback
    setCheckFeedback({ type: 'impliedResult', correct: isMatch });

    if (isMatch) {
      // Correct - clear feedback after brief delay
      setTimeout(() => {
        setCheckFeedback(null);
      }, 600);
    } else {
      // Wrong - reset feedback after flash
      setTimeout(() => {
        setCheckFeedback(null);
      }, 800);
    }
  };

  const handleCheckResult = async () => {
    if (!currentStep || !clueId) return;

    const userResult = stepResultInput.toUpperCase().replace(/[^A-Z]/g, '');

    try {
      // Ask server to validate result
      const response = await trainingAction(clueId, 'check_result', {
        wordplayId: currentStep.id,
        entered: userResult,
      });

      const isMatch = response.validation?.correct || false;

      // Show feedback
      setCheckFeedback({ type: 'result', correct: isMatch });

      if (isMatch) {
        // Update server state - this marks the wordplay as solved
        setServerState(prev => prev ? {
          ...prev,
          clueEntry: response.clueEntry,
          currentWordplay: response.currentWordplay,  // Next wordplay from server
          currentWordplayIndex: response.currentWordplayIndex ?? -1,
          currentPhase: response.currentPhase || 'complete',
          allSolved: response.allSolved || false,
          render: response.render,  // Include render instructions
        } : null);

        // Clear feedback after brief delay
        setTimeout(() => setCheckFeedback(null), 600);
      } else {
        // Wrong - reset feedback after flash
        setTimeout(() => {
          setCheckFeedback(null);
        }, 800);
      }
    } catch (err) {
      console.warn('[training] Result check failed:', err);
    }
  };

  const handleRevealStepResult = () => {
    if (!currentStep) return;
    setStepResultInput(currentStep.result);
    // Result correctness now derived from server state after check
  };

  // Handle assembly step completion - server controls flow
  const handleAssemblyComplete = async () => {
    if (!clueId) return;

    // Highlights now come from server state

    // Ask server for next wordplay after assembly
    try {
      const response = await trainingAction(clueId, 'get_state');
      if (response.success) {
        setServerState(prev => prev ? {
          ...prev,
          clueEntry: response.clueEntry,
          currentWordplay: response.currentWordplay ?? prev.currentWordplay,
          currentWordplayIndex: response.currentWordplayIndex ?? prev.currentWordplayIndex,
          currentPhase: response.currentPhase || 'indicator',
          allSolved: response.allSolved || false,
          render: response.render,  // Include render instructions
        } : null);

        // Reset UI state for next wordplay
        resetWordplayUIState();

        // Set phase from server
        if (response.currentPhase === 'indicator') {
          // Phase controlled by serverState.currentPhase
        } else if (response.currentPhase === 'fodder') {
          // Phase controlled by serverState.currentPhase
        } else if (response.currentPhase === 'result') {
          // Phase controlled by serverState.currentPhase
        } else if (response.currentPhase === 'complete') {
          setPhase('solve');
        }
      }
    } catch (err) {
      console.warn('[training] Assembly complete failed:', err);
    }
  };

  // Helper to reset wordplay UI state
  const resetWordplayUIState = () => {
    // Clear ephemeral selection state (pre-check user input)
    setSelectedIndicatorIndices([]);
    setSelectedDeleteTargetIndices([]);
    setSelectedFodderIndices([]);
    setSelectedDecodeMethod(null);
    setDecodeMethodInput('');
    setImpliedResultInput('');
    setStepResultInput('');
    // All "checked" and "correct" state now derives from serverState
  };

  // Step complete - server already updated state in handleCheckResult
  // This just moves to next wordplay from server state
  const handleStepComplete = async () => {
    if (!clueId) return;

    // Ask server for next available wordplay
    try {
      const response = await trainingAction(clueId, 'get_state');
      if (response.success) {
        // Update server state
        setServerState(prev => prev ? {
          ...prev,
          clueEntry: response.clueEntry,
          currentWordplay: response.currentWordplay,
          currentWordplayIndex: response.currentWordplayIndex ?? -1,
          currentPhase: response.currentPhase || 'complete',
          allSolved: response.allSolved || false,
          render: response.render,  // Include render instructions
        } : null);

        // Check if all done
        if (response.allSolved || response.currentPhase === 'complete') {
          setPhase('solve');
          return;
        }

        // Reset UI state for next wordplay
        resetWordplayUIState();

        // Set phase from server
        if (response.currentPhase === 'indicator') {
          // Phase controlled by serverState.currentPhase
        } else if (response.currentPhase === 'fodder') {
          // Phase controlled by serverState.currentPhase
        } else if (response.currentPhase === 'result') {
          // Phase controlled by serverState.currentPhase
        } else if (response.currentPhase === 'blocked') {
          // All remaining wordplays are blocked - shouldn't happen with proper dependencies
          console.warn('[training] All remaining wordplays blocked');
        }
      }
    } catch (err) {
      console.warn('[training] Get next wordplay failed:', err);
    }
  };

  // Skip current step - server decides what's next based on dependencies
  const handleSkipStep = async () => {
    if (!clueId) return;

    // Highlights now come from server state

    // Ask server for next available (unblocked) wordplay
    // Server will skip to the next unblocked, unsolved wordplay
    try {
      const response = await trainingAction(clueId, 'get_state');
      if (response.success && response.currentWordplayIndex !== undefined) {
        setServerState(prev => prev ? {
          ...prev,
          clueEntry: response.clueEntry,
          currentWordplay: response.currentWordplay ?? prev.currentWordplay,
          currentWordplayIndex: response.currentWordplayIndex,
          currentPhase: response.currentPhase || 'indicator',
          render: response.render,  // Include render instructions
        } : null);

        // Reset UI state
        resetWordplayUIState();

        // Set phase from server
        if (response.currentPhase === 'indicator') {
          // Phase controlled by serverState.currentPhase
        } else if (response.currentPhase === 'fodder') {
          // Phase controlled by serverState.currentPhase
        } else if (response.currentPhase === 'result') {
          // Phase controlled by serverState.currentPhase
        }
      }
    } catch (err) {
      console.warn('[training] Skip step failed:', err);
    }
  };

  // Resume a step - ask server to select it
  const handleResumeStep = async (stepIdx: number) => {
    if (!clueId) return;

    const wp = wordplaySteps[stepIdx];
    if (!wp?.id) return;

    try {
      const response = await trainingAction(clueId, 'select_wordplay', {
        wordplayId: wp.id,
      });

      if (response.success) {
        setServerState(prev => prev ? {
          ...prev,
          clueEntry: response.clueEntry,
          currentWordplay: response.currentWordplay ?? prev.currentWordplay,
          currentWordplayIndex: response.currentWordplayIndex ?? stepIdx,
          currentPhase: response.currentPhase || 'indicator',
          blocked: response.blocked || false,
          blockedHint: response.blockedHint || '',
          render: response.render,  // Include render instructions
        } : null);

        // Reset UI and set phase from server
        resetWordplayUIState();
        if (response.currentPhase === 'indicator') {
          // Phase controlled by serverState.currentPhase
        } else if (response.currentPhase === 'fodder') {
          // Phase controlled by serverState.currentPhase
        } else if (response.currentPhase === 'result') {
          // Phase controlled by serverState.currentPhase
        }
      }
    } catch (err) {
      console.warn('[training] Resume step failed:', err);
    }
  };

  const handleNextIndicator = async () => {
    // Mark current step as revealed before moving on
    setRevealedIndicatorSteps(prev => [...prev, currentWordplayStep]);

    // In thin client mode, ask server for next state
    if (clueId) {
      try {
        const response = await trainingAction(clueId, 'get_state');
        if (response.success) {
          setServerState(prev => prev ? {
            ...prev,
            clueEntry: response.clueEntry,
            currentWordplay: response.currentWordplay,
            currentWordplayIndex: response.currentWordplayIndex ?? -1,
            currentPhase: response.currentPhase || 'complete',
            allSolved: response.allSolved || false,
            render: response.render,  // Include render instructions
          } : null);

          if (response.allSolved || response.currentPhase === 'complete') {
            setShowWordplayDetail(true);
          } else {
            // Clear ephemeral selection - checked state derives from serverState
            setSelectedIndicatorIndices([]);
          }
        }
      } catch (err) {
        console.warn('[training] Next indicator failed:', err);
      }
    }
  };

  const handleRevealWordplay = () => {
    setShowWordplayDetail(true);
  };

  const handleGridChange = (index: number, value: string) => {
    const newGrid = [...grid];
    newGrid[index] = value.toUpperCase();
    setGrid(newGrid);

    // Auto-advance to next cell
    if (value && index < grid.length - 1) {
      gridRefs.current[index + 1]?.focus();
    }
  };

  const handleGridKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !grid[index] && index > 0) {
      gridRefs.current[index - 1]?.focus();
    }
  };

  // Auto-check answer when grid is filled
  useEffect(() => {
    if (phase === 'complete') return;

    const allFilled = grid.every(char => char !== '');
    if (!allFilled) return;

    const userAnswer = grid.join('').toUpperCase();
    const cleanAnswer = answer.replace(/[^A-Z]/gi, '').toUpperCase();

    if (userAnswer === cleanAnswer) {
      setPhase('complete');
      if (onCorrect) onCorrect();
    }
  }, [grid, answer, phase, onCorrect]);

  const handleRevealAnswer = () => {
    const cleanAnswer = answer.replace(/[^A-Z]/gi, '').toUpperCase();
    setGrid(cleanAnswer.split(''));
    setPhase('complete');
  };

  // ---------------------------------------------------------------------------
  // RENDER HELPERS
  // ---------------------------------------------------------------------------

  // Get a display-friendly step type label (handles "unknown" gracefully)
  const getStepTypeLabel = (step: typeof currentStep): string => {
    if (!step) return '';
    const stepType = step.stepType?.toLowerCase() || 'unknown';

    // Map known types to friendly labels
    const typeLabels: Record<string, string> = {
      'anagram': 'Anagram',
      'container': 'Container',
      'hidden': 'Hidden Word',
      'reversal': 'Reversal',
      'deletion': 'Deletion',
      'homophone': 'Homophone',
      'abbreviation': 'Abbreviation',
      'letter_selection': 'Letter Selection',
      'letter_movement': 'Letter Movement',
      'synonym': 'Synonym',
      'assembly': 'Assembly',
    };

    if (typeLabels[stepType]) return typeLabels[stepType];

    // For "unknown", try to infer from indicator text
    if (stepType === 'unknown') {
      const indicator = step.indicator?.toLowerCase() || '';
      if (indicator.includes('last') || indicator.includes('final') || indicator.includes('end')) {
        return 'Last Letters';
      }
      if (indicator.includes('first') || indicator.includes('start') || indicator.includes('head')) {
        return 'First Letters';
      }
      if (indicator.includes('middle') || indicator.includes('heart') || indicator.includes('centre')) {
        return 'Middle Letters';
      }
      // Fallback to "Wordplay" instead of "Unknown"
      return 'Wordplay';
    }

    // Fallback: capitalize the step type
    return stepType.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getWordStyle = (wordIndex: number): string => {
    // DEBUG: Log state for highlighting (only for first word to avoid spam)
    if (wordIndex === 0) {
      console.log('[getWordStyle] allIndicatorIndices:', allIndicatorIndices, 'allFodderIndices:', allFodderIndices);
    }
    // 1. Definition highlights (from discoveredParts)
    for (const part of discoveredParts) {
      if (part.wordIndices.includes(wordIndex)) {
        const theme = WORKFLOW_COLORS[part.colorType];
        return `${theme?.bg || 'bg-slate-200'} ${theme?.text || 'text-slate-600'} ${theme?.border || ''} font-bold`;
      }
    }

    // 2. Confirmed indicator highlight (from ALL wordplays in clueEntry)
    // Uses aggregated allIndicatorIndices so highlights persist across wordplay steps
    if (allIndicatorIndices.includes(wordIndex)) {
      return 'bg-orange-200 text-orange-800 ring-2 ring-orange-400 font-bold';
    }

    // 3. Confirmed fodder highlight (from ALL wordplays in clueEntry)
    // Uses aggregated allFodderIndices so highlights persist across wordplay steps
    if (allFodderIndices.includes(wordIndex)) {
      return 'bg-blue-200 text-blue-800 ring-2 ring-blue-400 font-bold';
    }

    // 4. Definition phase - selected words with feedback
    if (selectedIndices?.includes(wordIndex)) {
      if (phase === 'definition' && definitionCheckFeedback === 'correct') {
        return 'bg-green-200 text-green-800 ring-2 ring-green-400 font-bold';
      }
      if (phase === 'definition' && definitionCheckFeedback === 'wrong') {
        return 'bg-red-200 text-red-800 ring-2 ring-red-400 font-bold';
      }
      return 'bg-slate-800 text-white ring-2 ring-slate-600 font-bold';
    }

    // 5. Current indicator selection (pre-check, ephemeral)
    if (phase === 'wordplay' && currentPhase === 'indicator' && selectedIndicatorIndices.includes(wordIndex)) {
      return 'bg-slate-800 text-white ring-2 ring-slate-600 font-bold';
    }

    // 6. Current fodder selection (pre-check, ephemeral)
    if (phase === 'wordplay' && currentPhase === 'fodder' && selectedFodderIndices.includes(wordIndex)) {
      return 'bg-slate-800 text-white ring-2 ring-slate-600 font-bold';
    }

    // 7. Current deleteTarget selection (pre-check, ephemeral)
    if (phase === 'wordplay' && currentPhase === 'deleteTarget' && selectedDeleteTargetIndices.includes(wordIndex)) {
      return 'bg-slate-800 text-white ring-2 ring-slate-600 font-bold';
    }

    // Interactive hover states
    if (phase === 'definition') {
      return 'hover:bg-indigo-50 cursor-pointer';
    }
    if (phase === 'wordplay' && currentPhase === 'indicator') {
      return 'hover:bg-orange-50 cursor-pointer';
    }
    if (phase === 'wordplay' && currentPhase === 'deleteTarget') {
      return 'hover:bg-purple-50 cursor-pointer';
    }
    if (phase === 'wordplay' && currentPhase === 'fodder') {
      return 'hover:bg-blue-50 cursor-pointer';
    }

    return '';
  };

  const getPromptText = (): string => {
    switch (phase) {
      case 'choose':
        return "What type of clue is this?";

      case 'definition':
        if (definitionCheckFeedback === 'correct') {
          return "That's it! The definition is highlighted";
        }
        if (definitionCheckFeedback === 'wrong') {
          return "Not quite — try again";
        }
        if (!selectedIndices || selectedIndices.length === 0) {
          return "Standard clue — tap the definition words";
        }
        return "Tap Check when ready";

      case 'wordplay':
        if (currentStep && currentWordplayStep < wordplaySteps.length) {
          // Indicatorless steps (synonym, abbreviation) - Socratic approach
          if (!stepHasIndicator) {
            if (currentPhase === 'fodder') {
              return `Select a word to decode`;
            }
            if (currentPhase === 'decodeMethod') {
              return `How does "${currentStep.fodder}" decode?`;
            }
            if (currentPhase === 'result') {
              return `What does "${currentStep.fodder}" give you?`;
            }
          } else {
            // Steps with indicator
            if (currentPhase === 'indicator') {
              return `Find the ${getStepTypeLabel(currentStep).toLowerCase()} indicator`;
            }
            if (currentPhase === 'deleteTarget') {
              return `What should be deleted?`;
            }
            if (currentPhase === 'fodder') {
              return `Now find the fodder for "${currentStep.indicator}"`;
            }
            if (currentPhase === 'discovery') {
              return `But wait...`;
            }
            if (currentPhase === 'result') {
              return `Work out the result`;
            }
          }
        }
        if (completedSteps.length === wordplaySteps.length && wordplaySteps.length > 0) {
          return "All steps solved — enter the answer!";
        }
        return "Explore the wordplay";

      case 'solve':
        return "Type the answer to complete";

      case 'complete':
        return "";

      default:
        return "";
    }
  };

  const getHintText = (): string => {
    switch (phase) {
      case 'definition':
        return `Every clue has a definition + wordplay, both leading to the same answer. Finding that split is key to solving every clue. It is usually easier to spot the definition as it is always at the START or END of the clue.`;

      case 'wordplay':
        return `The remaining words contain instructions to build the answer`;

      default:
        return '';
    }
  };

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-3 font-sans">

      {/* CLUE DISPLAY */}
      <div className="bg-white p-5 md:p-6 rounded-xl shadow-sm border border-slate-200 relative">
        <div className="text-xl md:text-2xl font-serif text-slate-900 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {/* Clue number */}
          {displayClueNumber && (
            <span className="text-indigo-600 font-bold">{displayClueNumber}</span>
          )}

          {/* Words */}
          {words.map((word, idx) => (
            <span
              key={idx}
              onClick={() => handleWordTap(idx)}
              className={`px-1.5 py-0.5 rounded transition-all duration-200 border border-transparent ${getWordStyle(idx)}`}
            >
              {word.display}
            </span>
          ))}

          {/* Enumeration */}
          {displayEnumeration && (
            <span className="text-slate-400 font-normal text-lg">({displayEnumeration})</span>
          )}
        </div>

        {/* Prompt - evolves based on phase */}
        {phase !== 'complete' && (() => {
          const isIndicatorSelection = phase === 'wordplay' && currentPhase === 'indicator';
          const isDeleteTargetSelection = phase === 'wordplay' && currentPhase === 'deleteTarget';
          const isFodderSelection = phase === 'wordplay' && currentPhase === 'fodder';
          const isFocusedSelection = isIndicatorSelection || isDeleteTargetSelection || isFodderSelection;

          return (
            <div className="text-center mt-4">
              {/* Standard prompt text */}
              <div className={`transition-all duration-300 ${
                isFocusedSelection
                  ? 'text-base font-semibold text-indigo-700 bg-indigo-50 rounded-lg px-3 py-1.5 inline-block'
                  : 'text-sm text-slate-600'
              }`}>
                {getPromptText()}
              </div>

              {/* Check Indicator button - in clue box */}
              {isIndicatorSelection && selectedIndicatorIndices.length > 0 && !indicatorFound && !checkFeedback && (
                <div className="mt-3">
                  <button
                    onClick={handleCheckIndicator}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2 mx-auto"
                  >
                    <Check size={16} />
                    Check Indicator
                  </button>
                </div>
              )}

              {/* Check Delete Target button - in clue box */}
              {isDeleteTargetSelection && selectedDeleteTargetIndices.length > 0 && !checkFeedback && (
                <div className="mt-3">
                  <button
                    onClick={handleCheckDeleteTarget}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2 mx-auto"
                  >
                    <Check size={16} />
                    Check Selection
                  </button>
                </div>
              )}

              {/* Check Fodder button - in clue box (only for steps WITH indicators) */}
              {isFodderSelection && selectedFodderIndices.length > 0 && !fodderFound && !checkFeedback && stepHasIndicator && (
                <div className="mt-3">
                  <button
                    onClick={handleCheckFodder}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2 mx-auto"
                  >
                    <Check size={16} />
                    Check Fodder
                  </button>
                </div>
              )}

              {/* Check Definition button - in clue box */}
              {phase === 'definition' && selectedIndices && selectedIndices.length > 0 && !definitionCheckFeedback && (
                <div className="mt-3">
                  <button
                    onClick={handleCheckDefinition}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2 mx-auto"
                  >
                    <Check size={16} />
                    Check Definition
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ANSWER GRID - Hidden during indicator/fodder selection for focus */}
      {(() => {
        const isFocusedSelection = phase === 'wordplay' && (currentPhase === 'indicator' || currentPhase === 'deleteTarget' || currentPhase === 'fodder');
        return (
          <div className={`flex justify-center gap-1.5 md:gap-2 transition-all duration-300 ${
            isFocusedSelection ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'
          }`}>
            {grid.map((char, i) => (
              <input
                key={i}
                ref={el => gridRefs.current[i] = el}
                type="text"
                maxLength={1}
                value={char}
                onChange={(e) => handleGridChange(i, e.target.value)}
                onKeyDown={(e) => handleGridKeyDown(i, e)}
                disabled={phase === 'complete'}
                tabIndex={isFocusedSelection ? -1 : 0}
                className={`
                  w-9 h-9 md:w-11 md:h-11 text-center text-lg md:text-xl font-bold rounded-lg border-2 shadow-sm
                  focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all uppercase
                  ${phase === 'complete'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-white border-slate-200 text-slate-900 focus:border-indigo-500'}
                `}
              />
            ))}
          </div>
        );
      })()}

      {/* DISCOVERED PARTS - Hidden during indicator/fodder selection for focus */}
      {(() => {
        const isFocusedSelection = phase === 'wordplay' && (currentPhase === 'indicator' || currentPhase === 'deleteTarget' || currentPhase === 'fodder');
        const shouldShow = discoveredParts.length > 0 && phase !== 'complete';

        if (!shouldShow) return null;

        return (
          <div className={`bg-white rounded-lg border border-slate-200 px-4 py-3 transition-all duration-300 ${
            isFocusedSelection ? 'opacity-0 h-0 overflow-hidden p-0 border-0' : 'opacity-100 animate-in fade-in'
          }`}>
            <div className="flex items-center gap-2">
              <span className="text-indigo-600 text-xs font-bold uppercase">Definition:</span>
              <span className="text-indigo-600 font-medium text-sm">{discoveredParts[0]?.text}</span>
            </div>
          </div>
        );
      })()}

      {/* CHOOSE PHASE - User picks clue type */}
      {phase === 'choose' && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 animate-in fade-in slide-in-from-bottom-2">
          {/* Introduction text - instructional guidance */}
          <div className="bg-slate-50 rounded-md p-3 border border-slate-200 mb-4">
            <p className="text-slate-600 text-sm leading-relaxed">
              Before solving, look for a clean split between the <strong>definition</strong> (always at start or end) and <strong>wordplay</strong> (the rest).
              Skilled solvers stay flexible — let the structure tell you how the clue wants to be read.
            </p>
            <p className="text-slate-500 text-sm mt-2 italic">
              Tip: <strong>?</strong> often signals wordplay or a cryptic definition. <strong>!</strong> traditionally marks an &lit clue. Other punctuation is usually just for the surface reading.
            </p>
          </div>

          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-indigo-600 text-white p-1.5 rounded-md">
              <BookOpen size={16} />
            </div>
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">What type of clue is this?</h3>
          </div>

          {/* All clue type options - stacked for more room */}
          <div className="space-y-2">
            <button
              onClick={handleChooseStandard}
              className="w-full text-left p-3 rounded-md border-2 border-indigo-300 bg-indigo-50 hover:border-indigo-500 hover:bg-indigo-100 transition-all"
            >
              <span className="font-bold text-indigo-700">Standard</span>
              <p className="text-sm text-indigo-600 mt-0.5">Do you see a definition at the start or end, with wordplay indicators in the rest?</p>
              <p className="text-sm text-indigo-500 italic mt-1">e.g. "Crazy golf equipment (7)" → PUTTERS (anagram of "putters")</p>
            </button>
            <button
              onClick={() => handleSpecialType('double_definition')}
              className="w-full text-left p-3 rounded-md border-2 border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
            >
              <span className="font-bold text-slate-700">Double Definition</span>
              <p className="text-sm text-slate-500 mt-0.5">Do you see two separate meanings with no wordplay indicators?</p>
              <p className="text-sm text-slate-400 italic mt-1">e.g. "Sound barrier (5)" → FENCE (healthy + obstacle)</p>
            </button>
            <button
              onClick={() => handleSpecialType('cryptic_definition')}
              className="w-full text-left p-3 rounded-md border-2 border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
            >
              <span className="font-bold text-slate-700">Cryptic Definition</span>
              <p className="text-sm text-slate-500 mt-0.5">Does the whole clue read as one whimsical description with no obvious wordplay?</p>
              <p className="text-sm text-slate-400 italic mt-1">e.g. "HIJKLMNO? (5)" → WATER (H to O = H₂O)</p>
            </button>
            <button
              onClick={() => handleSpecialType('and_lit')}
              className="w-full text-left p-3 rounded-md border-2 border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
            >
              <span className="font-bold text-slate-700">&lit <span className="font-normal text-slate-400">("and literally so")</span></span>
              <p className="text-sm text-slate-500 mt-0.5">Does the whole clue both describe AND construct the answer simultaneously?</p>
              <p className="text-sm text-slate-400 italic mt-1">e.g. "Terribly angered! (7)" → ENRAGED (anagram + literal meaning)</p>
            </button>
          </div>
        </div>
      )}

      {/* DEFINITION PHASE - User taps words to select definition */}
      {phase === 'definition' && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 animate-in fade-in slide-in-from-bottom-2">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-indigo-600 text-white p-1.5 rounded-md">
              <BookOpen size={16} />
            </div>
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Find Definition</h3>
          </div>

          {/* Instruction card - hide once definition is correct */}
          {definitionCheckFeedback !== 'correct' && (
            <div className="bg-slate-50 rounded-md p-3 border border-slate-200 mb-3">
              <p className="text-slate-600 text-sm">
                Tap the definition words above. It's always at the <strong>start</strong> or <strong>end</strong> of the clue.
              </p>
            </div>
          )}

          {/* Check button moved to clue box above */}

          {/* Result after checking - with key learning (brief flash before auto-advancing) */}
          {definitionCheckFeedback === 'correct' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="bg-green-50 border border-green-200 rounded-md px-3 py-2 text-green-700 font-bold text-sm flex items-center gap-2">
                  <Check size={14} className="text-green-600" />
                  Nice split!
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                <p className="text-amber-800 text-sm leading-relaxed">
                  <strong>Key learning:</strong> {renderLearningText(DEFINITION_LEARNINGS[identifiedType || 'standard'])}
                </p>
              </div>
            </div>
          )}

          {definitionCheckFeedback === 'wrong' && (
            <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-red-700 font-medium text-sm animate-in fade-in">
              ✗ Not quite — try again
            </div>
          )}

          {/* Back to choose - only when nothing selected and not checking */}
          {(!selectedIndices || selectedIndices.length === 0) && !definitionCheckFeedback && (
            <button
              onClick={() => setPhase('choose')}
              className="text-slate-400 hover:text-slate-600 text-xs font-medium"
            >
              ← Back
            </button>
          )}
        </div>
      )}

      {/* WORDPLAY PHASE - Server-driven InstructionPanel */}
      {phase === 'wordplay' && serverState?.render && (() => {
        console.log('[RENDER] InstructionPanel with:', {
          panel: serverState.render?.panel,
          stepLabel: serverState.render?.stepLabel,
          showResultInput: serverState.render?.showResultInput,
          primaryText: serverState.render?.primaryText?.substring(0, 30),
        });
        return (
        <InstructionPanel
          render={serverState.render}
          selectedIndices={
            serverState.currentPhase === 'indicator' ? selectedIndicatorIndices :
            serverState.currentPhase === 'fodder' ? selectedFodderIndices :
            []
          }
          textInput={stepResultInput}
          onTextChange={setStepResultInput}
          onAction={handleServerAction}
          feedback={instructionPanelFeedback}
        />
        );
      })()}

      {/* SOLVE PHASE - Show wordplay summary + answer prompt */}
      {phase === 'solve' && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 animate-in fade-in slide-in-from-bottom-2">
          {/* Wordplay summary - expandable */}
          {wordplaySteps.length > 0 && (
            <div className="space-y-2 mb-3 pb-3 border-b border-slate-100">
              {wordplaySteps.map((step, i) => {
                const stepType = step.stepType?.toLowerCase() || '';
                const learning = WORDPLAY_LEARNINGS[stepType];
                const clueSpecific = getClueSpecificLearning(stepType, step.indicator, step.fodder);
                const isExpanded = expandedCompletedSteps.includes(i);
                return (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-md overflow-hidden">
                    <button
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedCompletedSteps(prev => prev.filter(idx => idx !== i));
                        } else {
                          setExpandedCompletedSteps(prev => [...prev, i]);
                        }
                      }}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-100 transition-colors text-left"
                    >
                      <Check size={16} className="text-green-600 flex-shrink-0" />
                      <span className="text-indigo-600 text-sm font-bold uppercase">{getStepTypeLabel(step)}:</span>
                      <span className="text-slate-600 text-base">"{step.indicator}" + "{step.fodder}" → {step.result}</span>
                      <ChevronDown
                        size={16}
                        className={`ml-auto text-slate-400 transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                      />
                    </button>
                    {isExpanded && learning && (
                      <div className="px-3 pb-3 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
                          <p className="text-amber-800 text-base leading-relaxed">
                            <strong>Key learning:</strong> {renderLearningText(learning)}
                          </p>
                          {clueSpecific && (
                            <p className="text-amber-700 text-base leading-relaxed italic">
                              {clueSpecific}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 text-white p-1.5 rounded-md">
                <Zap size={16} />
              </div>
              <span className="text-slate-600 text-base">Type the answer above</span>
            </div>
            <button
              onClick={handleRevealAnswer}
              className="text-slate-400 hover:text-slate-600 text-xs font-medium px-3 py-1.5 rounded-md hover:bg-slate-100 transition-colors"
            >
              Reveal
            </button>
          </div>
        </div>
      )}

      {/* COMPLETE - Summary and next */}
      {phase === 'complete' && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 animate-in zoom-in-95">
          {/* Header with technique tags */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="bg-green-600 text-white p-1.5 rounded-md">
                <Check size={16} />
              </div>
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Solved</h3>
            </div>
            {/* Technique tags */}
            {(patternData?.steps?.length || patternData?.wordplays?.length || patternData?.wordplaySteps?.length) ? (
              <div className="flex flex-wrap gap-1">
                {Array.from(new Set(
                  patternData?.steps?.length
                    ? patternData.steps.map((s: any) => s.operation)
                    : patternData?.wordplays?.length
                      ? patternData.wordplays.map((wp: any) => wp.operation)
                      : patternData?.wordplaySteps?.map((s: any) => getStepTypeLabel(s)) || []
                )).map((technique, i) => (
                  <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                    {technique}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* Summary with expandable wordplay steps */}
          <div className="space-y-2 mb-4">
            {(patternData?.definition?.text || patternData?.definitionText) && (
              <div className="flex items-center gap-2 text-base px-3 py-2 bg-slate-50 border border-slate-200 rounded-md">
                <span className="text-indigo-600 font-bold text-sm uppercase">Def:</span>
                <span className="text-indigo-600">{patternData?.definition?.text || patternData?.definitionText}</span>
                <span className="text-slate-400 text-sm">({patternData?.definition?.position || patternData?.definitionPosition})</span>
              </div>
            )}
            {/* Render wordplay steps */}
            {(patternData?.steps?.length ? patternData.steps : patternData?.wordplays?.length ? patternData.wordplays : patternData?.wordplaySteps || []).map((step: any, i: number) => {
              // Handle both V1 (stepType) and V2 (operation) formats
              const stepType = (step.operation || step.stepType || '').toLowerCase();
              const learning = WORDPLAY_LEARNINGS[stepType];
              const fodderText = typeof step.fodder === 'string' ? step.fodder : '';
              const clueSpecific = getClueSpecificLearning(stepType, step.indicator || '', fodderText);
              const isExpanded = expandedCompletedSteps.includes(i);
              // Skip assembly/charade steps
              if (stepType === 'charade' || step.isAssembly) return null;
              return (
                <div key={i} className="bg-slate-50 border border-slate-200 rounded-md overflow-hidden">
                  <button
                    onClick={() => {
                      if (isExpanded) {
                        setExpandedCompletedSteps(prev => prev.filter(idx => idx !== i));
                      } else {
                        setExpandedCompletedSteps(prev => [...prev, i]);
                      }
                    }}
                    className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-100 transition-colors text-left"
                  >
                    <Check size={16} className="text-green-600 flex-shrink-0" />
                    <span className="text-indigo-600 text-sm font-bold uppercase">{stepType || 'step'}:</span>
                    <span className="text-slate-600 text-base">{fodderText} → {step.result}</span>
                    {learning && (
                      <ChevronDown
                        size={16}
                        className={`ml-auto text-slate-400 transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                      />
                    )}
                  </button>
                  {isExpanded && learning && (
                    <div className="px-3 pb-3 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
                        <p className="text-amber-800 text-base leading-relaxed">
                          <strong>Key learning:</strong> {renderLearningText(learning)}
                        </p>
                        {clueSpecific && (
                          <p className="text-amber-700 text-base leading-relaxed italic">
                            {clueSpecific}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={onNext}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
          >
            Next Clue <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
};
