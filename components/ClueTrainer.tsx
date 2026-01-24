
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronRight, ChevronDown, Check, HelpCircle, Lightbulb, Zap, BookOpen } from 'lucide-react';
import { PatternInstance, WordHighlight } from '../types';
import { WORKFLOW_COLORS } from '../data/designTemplates';
import { trainingAction } from '../services/clueManager';

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
  // STATE
  // ---------------------------------------------------------------------------

  const [phase, setPhase] = useState<TrainingPhase>('choose');
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [discoveredParts, setDiscoveredParts] = useState<DiscoveredPart[]>([]);
  const [grid, setGrid] = useState<string[]>([]);
  const [isDefinitionCorrect, setIsDefinitionCorrect] = useState(false);
  const [hasCheckedDefinition, setHasCheckedDefinition] = useState(false);  // User explicitly clicked "Check"
  const [showWordplayDetail, setShowWordplayDetail] = useState(false);
  const [currentWordplayStep, setCurrentWordplayStep] = useState(0);

  // Wordplay step state
  // Sub-phases: indicator → deleteTarget (for deletion) → fodder → decodeMethod (for indicatorless) → discovery (if implied op) → result
  type WordplaySubPhase = 'indicator' | 'deleteTarget' | 'fodder' | 'decodeMethod' | 'discovery' | 'assembly' | 'result';
  type DecodeMethod = 'literal' | 'synonym' | 'abbreviation' | null;
  const [wordplaySubPhase, setWordplaySubPhase] = useState<WordplaySubPhase>('indicator');
  const [selectedIndicatorIndices, setSelectedIndicatorIndices] = useState<number[]>([]);
  const [selectedDeleteTargetIndices, setSelectedDeleteTargetIndices] = useState<number[]>([]); // For deletion: what to delete
  const [selectedFodderIndices, setSelectedFodderIndices] = useState<number[]>([]);
  const [hasCheckedIndicator, setHasCheckedIndicator] = useState(false);
  const [isIndicatorCorrect, setIsIndicatorCorrect] = useState(false);
  const [hasCheckedDeleteTarget, setHasCheckedDeleteTarget] = useState(false);
  const [isDeleteTargetCorrect, setIsDeleteTargetCorrect] = useState(false);
  const [hasCheckedFodder, setHasCheckedFodder] = useState(false);
  const [isFodderCorrect, setIsFodderCorrect] = useState(false);
  const [selectedDecodeMethod, setSelectedDecodeMethod] = useState<DecodeMethod>(null); // How user thinks the word decodes
  const [decodeMethodInput, setDecodeMethodInput] = useState(''); // User's typed synonym/abbreviation
  const [hasCheckedDecodeMethod, setHasCheckedDecodeMethod] = useState(false);
  const [isDecodeMethodCorrect, setIsDecodeMethodCorrect] = useState(false);
  const [impliedResultInput, setImpliedResultInput] = useState(''); // For discovery phase: user types implied result (e.g., MOTHERS)
  const [hasCheckedImpliedResult, setHasCheckedImpliedResult] = useState(false);
  const [isImpliedResultCorrect, setIsImpliedResultCorrect] = useState(false);
  const [stepResultInput, setStepResultInput] = useState('');
  const [hasCheckedResult, setHasCheckedResult] = useState(false);
  const [isResultCorrect, setIsResultCorrect] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]); // Collapsed steps
  const [onHoldSteps, setOnHoldSteps] = useState<number[]>([]); // Steps where user found indicator/fodder but skipped result
  const [expandedCompletedSteps, setExpandedCompletedSteps] = useState<number[]>([]); // Which collapsed steps are expanded to show learnings
  const [revealedIndicatorSteps, setRevealedIndicatorSteps] = useState<number[]>([]);
  const [confirmedHighlights, setConfirmedHighlights] = useState<{indicatorIndices: number[], deleteTargetIndices: number[], fodderIndices: number[]}[]>([]); // Persisted wordplay highlights

  // For special clue types
  const [identifiedType, setIdentifiedType] = useState<ClueType | null>(null);


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

  // Current step the user is working on
  const currentStep = wordplaySteps[currentWordplayStep];

  // V2: Check if a wordplay's dependencies are all solved
  const isWordplayBlocked = (wp: any, allWordplays: any[]): boolean => {
    if (!wp.dependencies || wp.dependencies.length === 0) return false;
    return wp.dependencies.some((depId: string) => {
      const dep = allWordplays.find((w: any) => w.id === depId);
      return dep && !dep.state?.solved;
    });
  };

  // Compute which wordplays are blocked
  const blockedWordplays = useMemo(() => {
    return wordplaySteps.map(wp => isWordplayBlocked(wp, wordplaySteps));
  }, [wordplaySteps]);

  // Check if current step is blocked
  const isCurrentStepBlocked = blockedWordplays[currentWordplayStep] || false;

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
  // e.g., anagram fodder + inserted letters -> combined fodder ready for anagram
  const assembledAnagramFodder = useMemo(() => {
    if (!currentStep || currentStep.stepType !== 'container') return null;

    // Find the on-hold anagram step
    const anagramStepIdx = onHoldSteps.find(idx => wordplaySteps[idx]?.stepType === 'anagram');
    if (anagramStepIdx === undefined) return null;

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
  }, [currentStep, onHoldSteps, completedSteps, wordplaySteps]);

  // Check if current step is a container that assembles letters for a pending anagram
  const isContainerAssemblyStep = useMemo(() => {
    if (!currentStep || currentStep.stepType !== 'container') return false;
    // Check if there's an on-hold anagram step
    return onHoldSteps.some(idx => wordplaySteps[idx]?.stepType === 'anagram');
  }, [currentStep, onHoldSteps, wordplaySteps]);

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
    // Completed wordplay step words
    for (const highlight of confirmedHighlights) {
      highlight.indicatorIndices.forEach(i => used.add(i));
      highlight.deleteTargetIndices.forEach(i => used.add(i));
      highlight.fodderIndices.forEach(i => used.add(i));
    }
    return used;
  }, [discoveredParts, confirmedHighlights]);

  // Get unused words (not yet highlighted)
  const unusedWords = useMemo(() => {
    return words.filter((_, idx) => !usedWordIndices.has(idx));
  }, [words, usedWordIndices]);

  // ---------------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Reset state when clue changes
    setPhase('choose');
    setSelectedIndices([]);
    setDiscoveredParts([]);
    setIsDefinitionCorrect(false);
    setHasCheckedDefinition(false);
    setShowWordplayDetail(false);
    setCurrentWordplayStep(0);
    setIdentifiedType(null);
    setWordplaySubPhase('indicator');
    setSelectedIndicatorIndices([]);
    setSelectedDeleteTargetIndices([]);
    setSelectedFodderIndices([]);
    setHasCheckedIndicator(false);
    setIsIndicatorCorrect(false);
    setHasCheckedDeleteTarget(false);
    setIsDeleteTargetCorrect(false);
    setHasCheckedFodder(false);
    setIsFodderCorrect(false);
    setSelectedDecodeMethod(null);
    setDecodeMethodInput('');
    setHasCheckedDecodeMethod(false);
    setIsDecodeMethodCorrect(false);
    setImpliedResultInput('');
    setHasCheckedImpliedResult(false);
    setIsImpliedResultCorrect(false);
    setStepResultInput('');
    setHasCheckedResult(false);
    setIsResultCorrect(false);
    setCompletedSteps([]);
    setOnHoldSteps([]);
    setExpandedCompletedSteps([]);
    setRevealedIndicatorSteps([]);
    setConfirmedHighlights([]);

    // Initialize answer grid
    const cleanAnswer = answer.replace(/[^A-Z]/gi, '').toUpperCase();
    setGrid(new Array(cleanAnswer.length).fill(''));
  }, [clueText, answer]);

  // When entering wordplay phase, ask server for first available wordplay
  useEffect(() => {
    if (phase === 'wordplay' && clueId) {
      trainingAction(clueId, 'start').then(response => {
        if (response.success && response.currentWordplayIndex !== undefined) {
          setCurrentWordplayStep(response.currentWordplayIndex);
          // If blocked, show hint (though start should give unblocked)
          if (response.blocked && response.blockedHint) {
            console.log('[training] Blocked:', response.blockedHint);
          }
        }
      }).catch(err => {
        console.warn('[training] Could not get initial wordplay:', err);
      });
    }
  }, [phase, clueId]);

  // ---------------------------------------------------------------------------
  // INTERACTION HANDLERS
  // ---------------------------------------------------------------------------

  const handleWordTap = (wordIndex: number) => {
    // Definition phase - contiguous selection
    if (phase === 'definition') {
      // Don't allow changes after successful check (user should click Continue)
      if (hasCheckedDefinition && isDefinitionCorrect) {
        return;
      }
      setSelectedIndices(prev => {
        if (prev.includes(wordIndex)) {
          return prev.filter(i => i !== wordIndex);
        }
        // Keep selection contiguous for definition phase
        if (prev.length > 0) {
          const min = Math.min(...prev, wordIndex);
          const max = Math.max(...prev, wordIndex);
          return Array.from({ length: max - min + 1 }, (_, i) => min + i);
        }
        return [...prev, wordIndex].sort((a, b) => a - b);
      });
      return;
    }

    // Wordplay phase - indicator, deleteTarget, or fodder selection
    if (phase === 'wordplay' && !showWordplayDetail) {
      if (wordplaySubPhase === 'indicator') {
        setSelectedIndicatorIndices(prev => {
          if (prev.includes(wordIndex)) {
            return prev.filter(i => i !== wordIndex);
          }
          return [...prev, wordIndex].sort((a, b) => a - b);
        });
      } else if (wordplaySubPhase === 'deleteTarget') {
        setSelectedDeleteTargetIndices(prev => {
          if (prev.includes(wordIndex)) {
            return prev.filter(i => i !== wordIndex);
          }
          return [...prev, wordIndex].sort((a, b) => a - b);
        });
      } else if (wordplaySubPhase === 'fodder') {
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
            setHasCheckedFodder(true);
            setIsFodderCorrect(true);
            setTimeout(() => {
              setWordplaySubPhase('decodeMethod');
            }, 300); // Brief highlight before advancing
          } else {
            // Wrong word - brief red flash then clear
            setSelectedFodderIndices([wordIndex]);
            setHasCheckedFodder(true);
            setIsFodderCorrect(false);
            setTimeout(() => {
              setSelectedFodderIndices([]);
              setHasCheckedFodder(false);
              setIsFodderCorrect(false);
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

  // Check if selected words match the expected definition (only in definition phase)
  useEffect(() => {
    // Only run this check in definition phase
    if (phase !== 'definition') {
      return;
    }

    if (selectedIndices.length === 0) {
      setIsDefinitionCorrect(false);
      return;
    }

    const selectedText = selectedIndices.map(i => words[i].text).join(' ');
    const expectedText = expectedDefinition.wordIndices.map(i => words[i]?.text || '').join(' ');

    const isMatch = selectedText === expectedText ||
                    selectedIndices.length === expectedDefinition.wordIndices.length &&
                    selectedIndices.every((idx, i) => idx === expectedDefinition.wordIndices[i]);

    setIsDefinitionCorrect(isMatch);
  }, [selectedIndices, phase, words, expectedDefinition]);

  const handleCheckDefinition = () => {
    // User explicitly checks their selection
    // Check correctness inline to decide if we should auto-reset
    const selectedText = selectedIndices.map(i => words[i].text).join(' ');
    const expectedText = expectedDefinition.wordIndices.map(i => words[i]?.text || '').join(' ');
    const isMatch = selectedText === expectedText ||
                    selectedIndices.length === expectedDefinition.wordIndices.length &&
                    selectedIndices.every((idx, i) => idx === expectedDefinition.wordIndices[i]);

    if (isMatch) {
      // Correct - show success state
      setHasCheckedDefinition(true);
    } else {
      // Wrong - briefly show red, then auto-clear for retry
      setHasCheckedDefinition(true);
      setTimeout(() => {
        setSelectedIndices([]);
        setHasCheckedDefinition(false);
      }, 800); // Brief flash of red feedback
    }
  };

  const handleDefinitionConfirm = () => {
    if (!isDefinitionCorrect) return;

    // Add definition to discovered parts
    const defText = selectedIndices.map(i => words[i].display).join(' ');
    setDiscoveredParts([{
      role: 'definition',
      text: defText,
      wordIndices: [...selectedIndices],
      colorType: 'GREEN',
      explanation: `"${defText}" is the definition`
    }]);

    setSelectedIndices([]);
    setHasCheckedDefinition(false);
    setPhase('wordplay');
  };

  const handleSpecialType = (type: ClueType) => {
    setIdentifiedType(type);

    if (type === 'double_definition' || type === 'triple_definition') {
      // For DD/TD, the whole clue is definitions - move to solve
      setDiscoveredParts([{
        role: 'definition',
        text: clueText,
        wordIndices: words.map((_, i) => i),
        colorType: 'GREEN',
        explanation: type === 'double_definition'
          ? 'Both parts define the same answer'
          : 'All three parts define the same answer'
      }]);
      setPhase('solve');
    } else if (type === 'cryptic_definition') {
      // CD - entire clue is a cryptic definition
      setDiscoveredParts([{
        role: 'definition',
        text: clueText,
        wordIndices: words.map((_, i) => i),
        colorType: 'GREEN',
        explanation: 'The entire clue is a cryptic definition with hidden meaning'
      }]);
      setPhase('solve');
    } else if (type === 'and_lit') {
      // &lit - entire clue is both definition AND wordplay
      setDiscoveredParts([{
        role: 'definition',
        text: clueText,
        wordIndices: words.map((_, i) => i),
        colorType: 'GREEN',
        explanation: 'The entire clue reads as both a definition AND wordplay instructions'
      }]);
      setPhase('wordplay');
    }
  };

  const handleCheckIndicator = () => {
    if (!currentStep) return;

    // Get the selected text
    const selectedText = selectedIndicatorIndices.map(i => words[i].text).join(' ');
    const targetIndicator = currentStep.indicator.toLowerCase().replace(/[.,;!?()'"]/g, '');

    // Check if it matches (allowing for some flexibility)
    const isMatch = selectedText === targetIndicator ||
                    selectedText.includes(targetIndicator) ||
                    targetIndicator.includes(selectedText);

    setHasCheckedIndicator(true);
    setIsIndicatorCorrect(isMatch);

    if (isMatch) {
      // Correct - auto-advance after brief success flash
      setTimeout(() => {
        if (isDeletionWithImpliedOp) {
          // Deletion with implied op: go to deleteTarget phase
          setWordplaySubPhase('deleteTarget');
        } else if (isContainerAssemblyStep) {
          // Container assembling for anagram: go to assembly phase (shows assembled letters)
          setWordplaySubPhase('assembly');
        } else if (isFodderDependent) {
          // Dependent fodder: skip to result
          setWordplaySubPhase('result');
        } else {
          // Normal: go to fodder selection
          setWordplaySubPhase('fodder');
        }
      }, 600);
    } else {
      // Wrong - auto-clear after brief red flash
      setTimeout(() => {
        setSelectedIndicatorIndices([]);
        setHasCheckedIndicator(false);
        setIsIndicatorCorrect(false);
      }, 800);
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

    setHasCheckedDeleteTarget(true);
    setIsDeleteTargetCorrect(isMatch);

    if (isMatch) {
      // Correct - auto-advance to fodder selection
      setTimeout(() => {
        setWordplaySubPhase('fodder');
      }, 600);
    } else {
      // Wrong - auto-clear after brief red flash
      setTimeout(() => {
        setSelectedDeleteTargetIndices([]);
        setHasCheckedDeleteTarget(false);
        setIsDeleteTargetCorrect(false);
      }, 800);
    }
  };

  const handleCheckFodder = () => {
    if (!currentStep) return;

    // Get the selected text
    const selectedText = selectedFodderIndices.map(i => words[i].text).join(' ');
    // V2: fodder can be string or FodderReference object - only use string values
    const fodderStr = typeof currentStep.fodder === 'string' ? currentStep.fodder : '';
    const targetFodder = fodderStr.toLowerCase().replace(/[.,;!?()'"]/g, '');

    // Check if it matches (allowing for some flexibility)
    const isMatch = selectedText === targetFodder ||
                    selectedText.includes(targetFodder) ||
                    targetFodder.includes(selectedText);

    setHasCheckedFodder(true);
    setIsFodderCorrect(isMatch);

    if (isMatch) {
      // Correct - auto-advance after brief success flash
      setTimeout(() => {
        if (isDeletionWithImpliedOp) {
          // Go to discovery phase - user will realize delete target isn't in fodder
          setWordplaySubPhase('discovery');
        } else if (!stepHasIndicator) {
          // Indicatorless step - ask HOW it decodes (literal/synonym/abbreviation)
          setWordplaySubPhase('decodeMethod');
        } else {
          setWordplaySubPhase('result');
        }
      }, 600);
    } else {
      // Wrong - auto-clear after brief red flash
      setTimeout(() => {
        setSelectedFodderIndices([]);
        setHasCheckedFodder(false);
        setIsFodderCorrect(false);
      }, 800);
    }
  };

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

    setHasCheckedDecodeMethod(true);
    setIsDecodeMethodCorrect(isCorrect);

    if (isCorrect) {
      // Correct - auto-advance to result phase with result pre-filled
      setTimeout(() => {
        if (selectedDecodeMethod === 'literal') {
          // For literal, we already know the result - auto-fill and complete
          setStepResultInput(targetResult);
          setHasCheckedResult(true);
          setIsResultCorrect(true);
        } else {
          // For synonym/abbreviation, the user typed the result - auto-fill
          setStepResultInput(userInput);
          setHasCheckedResult(true);
          setIsResultCorrect(true);
        }
        // Transition to result sub-phase to show the "Next Step" button
        setWordplaySubPhase('result');
      }, 600);
    } else {
      // Wrong - reset after flash
      setTimeout(() => {
        setHasCheckedDecodeMethod(false);
        setIsDecodeMethodCorrect(false);
        // Don't clear the method selection, just let them try again
      }, 800);
    }
  };

  const handleCheckImpliedResult = () => {
    if (!currentStep || !currentStep.impliedResult) return;

    const targetImplied = currentStep.impliedResult.toUpperCase().replace(/[^A-Z]/g, '');
    const userImplied = impliedResultInput.toUpperCase().replace(/[^A-Z]/g, '');

    const isMatch = userImplied === targetImplied;

    setHasCheckedImpliedResult(true);
    setIsImpliedResultCorrect(isMatch);

    if (isMatch) {
      // Correct - auto-advance to result phase
      setTimeout(() => {
        setWordplaySubPhase('result');
      }, 600);
    } else {
      // Wrong - reset after flash
      setTimeout(() => {
        setHasCheckedImpliedResult(false);
        setIsImpliedResultCorrect(false);
      }, 800);
    }
  };

  const handleCheckResult = () => {
    if (!currentStep) return;

    const targetResult = currentStep.result.toUpperCase().replace(/[^A-Z]/g, '');
    const userResult = stepResultInput.toUpperCase().replace(/[^A-Z]/g, '');

    const isMatch = userResult === targetResult;

    setHasCheckedResult(true);
    setIsResultCorrect(isMatch);

    if (!isMatch) {
      // Wrong - reset after flash
      setTimeout(() => {
        setHasCheckedResult(false);
        setIsResultCorrect(false);
      }, 800);
    }
  };

  const handleRevealStepResult = () => {
    if (!currentStep) return;
    setStepResultInput(currentStep.result);
    setHasCheckedResult(true);
    setIsResultCorrect(true);
  };

  // Handle assembly step completion - container assembled letters, now go back to anagram
  const handleAssemblyComplete = () => {
    // Save confirmed highlights for container step
    setConfirmedHighlights(prev => [...prev, {
      indicatorIndices: [...selectedIndicatorIndices],
      deleteTargetIndices: [],
      fodderIndices: []
    }]);

    // Mark container step as completed
    setCompletedSteps(prev => [...prev, currentWordplayStep]);

    // Find the on-hold anagram step and resume it
    const anagramStepIdx = onHoldSteps.find(idx => wordplaySteps[idx]?.stepType === 'anagram');
    if (anagramStepIdx !== undefined) {
      // Remove from on-hold
      setOnHoldSteps(prev => prev.filter(i => i !== anagramStepIdx));

      // Switch to the anagram step
      setCurrentWordplayStep(anagramStepIdx);

      // Go directly to result phase - user now has all letters
      setWordplaySubPhase('result');
      setStepResultInput('');
      setHasCheckedResult(false);
      setIsResultCorrect(false);
      setSelectedIndicatorIndices([]);
      setSelectedDeleteTargetIndices([]);
      setSelectedFodderIndices([]);
      setHasCheckedIndicator(false);
      setIsIndicatorCorrect(false);
      setHasCheckedDeleteTarget(false);
      setIsDeleteTargetCorrect(false);
      setHasCheckedFodder(false);
      setIsFodderCorrect(false);
    }
  };

  const handleStepComplete = () => {
    // Save confirmed highlights before clearing
    setConfirmedHighlights(prev => [...prev, {
      indicatorIndices: [...selectedIndicatorIndices],
      deleteTargetIndices: [...selectedDeleteTargetIndices],
      fodderIndices: [...selectedFodderIndices]
    }]);

    // Mark step as completed (collapsed)
    setCompletedSteps(prev => [...prev, currentWordplayStep]);

    const nextStep = currentWordplayStep + 1;

    if (nextStep >= wordplaySteps.length) {
      // All steps done - move to solve phase
      setPhase('solve');
    } else {
      // Move to next step
      setCurrentWordplayStep(nextStep);

      // Check if next step has an indicator to determine starting sub-phase
      const nextStepData = wordplaySteps[nextStep];
      const nextStepHasIndicator = nextStepData?.indicator && nextStepData.indicator.trim() !== '';

      // Reset sub-phase state - skip to fodder for indicatorless steps
      setWordplaySubPhase(nextStepHasIndicator ? 'indicator' : 'fodder');
      setSelectedIndicatorIndices([]);
      setSelectedDeleteTargetIndices([]);
      setSelectedFodderIndices([]);
      setHasCheckedIndicator(false);
      setIsIndicatorCorrect(false);
      setHasCheckedDeleteTarget(false);
      setIsDeleteTargetCorrect(false);
      setHasCheckedFodder(false);
      setIsFodderCorrect(false);
      setSelectedDecodeMethod(null);
      setDecodeMethodInput('');
      setHasCheckedDecodeMethod(false);
      setIsDecodeMethodCorrect(false);
      setImpliedResultInput('');
      setHasCheckedImpliedResult(false);
      setIsImpliedResultCorrect(false);
      setStepResultInput('');
      setHasCheckedResult(false);
      setIsResultCorrect(false);
    }
  };

  // Skip current step and move to next (user can come back later)
  const handleSkipStep = () => {
    // Save confirmed highlights before clearing
    setConfirmedHighlights(prev => [...prev, {
      indicatorIndices: [...selectedIndicatorIndices],
      deleteTargetIndices: [...selectedDeleteTargetIndices],
      fodderIndices: [...selectedFodderIndices]
    }]);

    // Mark step as on-hold (not completed - result still pending)
    setOnHoldSteps(prev => [...prev, currentWordplayStep]);

    // Find next step to work on (not completed, not on-hold)
    const findNextStep = () => {
      for (let i = currentWordplayStep + 1; i < wordplaySteps.length; i++) {
        if (!completedSteps.includes(i) && !onHoldSteps.includes(i)) {
          return i;
        }
      }
      // Wrap around to find earlier steps
      for (let i = 0; i < currentWordplayStep; i++) {
        if (!completedSteps.includes(i) && !onHoldSteps.includes(i)) {
          return i;
        }
      }
      return -1; // No more steps to work on
    };

    const nextStep = findNextStep();

    if (nextStep === -1) {
      // All steps either completed or on-hold - check if we can proceed
      const allNonHoldCompleted = wordplaySteps.every((_, i) =>
        completedSteps.includes(i) || onHoldSteps.includes(i)
      );
      if (allNonHoldCompleted && onHoldSteps.length > 0) {
        // Go back to first on-hold step
        const firstOnHold = onHoldSteps[0];
        setCurrentWordplayStep(firstOnHold);
        const stepData = wordplaySteps[firstOnHold];
        const hasIndicator = stepData?.indicator && stepData.indicator.trim() !== '';
        // On-hold steps already have indicator/fodder found, so go to result
        setWordplaySubPhase('result');
      }
    } else {
      // Move to next step
      setCurrentWordplayStep(nextStep);

      // Check if next step has an indicator to determine starting sub-phase
      const nextStepData = wordplaySteps[nextStep];
      const nextStepHasIndicator = nextStepData?.indicator && nextStepData.indicator.trim() !== '';

      // Reset sub-phase state
      setWordplaySubPhase(nextStepHasIndicator ? 'indicator' : 'fodder');
      setSelectedIndicatorIndices([]);
      setSelectedDeleteTargetIndices([]);
      setSelectedFodderIndices([]);
      setHasCheckedIndicator(false);
      setIsIndicatorCorrect(false);
      setHasCheckedDeleteTarget(false);
      setIsDeleteTargetCorrect(false);
      setHasCheckedFodder(false);
      setIsFodderCorrect(false);
      setSelectedDecodeMethod(null);
      setDecodeMethodInput('');
      setHasCheckedDecodeMethod(false);
      setIsDecodeMethodCorrect(false);
      setImpliedResultInput('');
      setHasCheckedImpliedResult(false);
      setIsImpliedResultCorrect(false);
      setStepResultInput('');
      setHasCheckedResult(false);
      setIsResultCorrect(false);
    }
  };

  // Resume an on-hold step
  const handleResumeStep = (stepIdx: number) => {
    // Remove from on-hold list
    setOnHoldSteps(prev => prev.filter(i => i !== stepIdx));

    // Switch to that step
    setCurrentWordplayStep(stepIdx);

    // On-hold steps already have indicator/fodder found, so go to result
    setWordplaySubPhase('result');
    setStepResultInput('');
    setHasCheckedResult(false);
    setIsResultCorrect(false);
  };

  const handleNextIndicator = () => {
    // Mark current step as revealed before moving on
    setRevealedIndicatorSteps(prev => [...prev, currentWordplayStep]);

    const nextStep = currentWordplayStep + 1;

    if (nextStep >= wordplaySteps.length) {
      // All indicators found - move to solve phase
      setShowWordplayDetail(true);
      setCurrentWordplayStep(nextStep); // Move past last step to show summary
    } else {
      // Move to next indicator
      setCurrentWordplayStep(nextStep);
      setSelectedIndicatorIndices([]);
      setHasCheckedIndicator(false);
      setIsIndicatorCorrect(false);
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
    // Check if word is in discovered parts (definition)
    for (const part of discoveredParts) {
      if (part.wordIndices.includes(wordIndex)) {
        const theme = WORKFLOW_COLORS[part.colorType];
        return `${theme?.bg || 'bg-slate-200'} ${theme?.text || 'text-slate-600'} ${theme?.border || ''} font-bold`;
      }
    }

    // Check persisted wordplay highlights from completed steps
    for (const highlight of confirmedHighlights) {
      if (highlight.indicatorIndices.includes(wordIndex)) {
        return 'bg-orange-200 text-orange-800 ring-2 ring-orange-400 font-bold';
      }
      if (highlight.deleteTargetIndices.includes(wordIndex)) {
        return 'bg-purple-200 text-purple-800 ring-2 ring-purple-400 font-bold';
      }
      if (highlight.fodderIndices.includes(wordIndex)) {
        return 'bg-blue-200 text-blue-800 ring-2 ring-blue-400 font-bold';
      }
    }

    // Definition phase - selected words
    if (selectedIndices.includes(wordIndex)) {
      // Only show green after user has checked AND it's correct
      if (phase === 'definition' && hasCheckedDefinition && isDefinitionCorrect) {
        return 'bg-green-200 text-green-800 ring-2 ring-green-400 font-bold';
      }
      // Show red after user has checked AND it's wrong
      if (phase === 'definition' && hasCheckedDefinition && !isDefinitionCorrect) {
        return 'bg-red-200 text-red-800 ring-2 ring-red-400 font-bold';
      }
      // Normal selection (before checking)
      return 'bg-slate-800 text-white ring-2 ring-slate-600 font-bold';
    }

    // Wordplay phase - indicator selection (persist through all sub-phases once confirmed)
    if (selectedIndicatorIndices.includes(wordIndex)) {
      // Confirmed correct indicator - keep orange highlight through fodder and result phases
      if (phase === 'wordplay' && isIndicatorCorrect) {
        return 'bg-orange-200 text-orange-800 ring-2 ring-orange-400 font-bold';
      }
      // Wrong selection (only during indicator sub-phase)
      if (phase === 'wordplay' && hasCheckedIndicator && !isIndicatorCorrect) {
        return 'bg-red-200 text-red-800 ring-2 ring-red-400 font-bold';
      }
      // Normal selection (before checking, during indicator sub-phase)
      if (phase === 'wordplay' && wordplaySubPhase === 'indicator') {
        return 'bg-slate-800 text-white ring-2 ring-slate-600 font-bold';
      }
    }

    // Wordplay phase - fodder selection (persist through result phase once confirmed)
    if (selectedFodderIndices.includes(wordIndex)) {
      // Confirmed correct fodder - keep blue highlight through result phase
      if (phase === 'wordplay' && isFodderCorrect) {
        return 'bg-blue-200 text-blue-800 ring-2 ring-blue-400 font-bold';
      }
      // Wrong selection (only during fodder sub-phase)
      if (phase === 'wordplay' && hasCheckedFodder && !isFodderCorrect) {
        return 'bg-red-200 text-red-800 ring-2 ring-red-400 font-bold';
      }
      // Normal selection (before checking, during fodder sub-phase)
      if (phase === 'wordplay' && wordplaySubPhase === 'fodder') {
        return 'bg-slate-800 text-white ring-2 ring-slate-600 font-bold';
      }
    }

    // Wordplay phase - deleteTarget selection (for deletion steps)
    if (selectedDeleteTargetIndices.includes(wordIndex)) {
      // Confirmed correct deleteTarget - keep purple highlight through fodder/discovery phases
      if (phase === 'wordplay' && isDeleteTargetCorrect) {
        return 'bg-purple-200 text-purple-800 ring-2 ring-purple-400 font-bold';
      }
      // Wrong selection
      if (phase === 'wordplay' && hasCheckedDeleteTarget && !isDeleteTargetCorrect) {
        return 'bg-red-200 text-red-800 ring-2 ring-red-400 font-bold';
      }
      // Normal selection (before checking, during deleteTarget sub-phase)
      if (phase === 'wordplay' && wordplaySubPhase === 'deleteTarget') {
        return 'bg-slate-800 text-white ring-2 ring-slate-600 font-bold';
      }
    }

    // Interactive state - definition or wordplay selection phases
    if (phase === 'definition') {
      return 'hover:bg-indigo-50 cursor-pointer';
    }
    if (phase === 'wordplay' && wordplaySubPhase === 'indicator') {
      return 'hover:bg-orange-50 cursor-pointer';
    }
    if (phase === 'wordplay' && wordplaySubPhase === 'deleteTarget') {
      return 'hover:bg-purple-50 cursor-pointer';
    }
    if (phase === 'wordplay' && wordplaySubPhase === 'fodder') {
      return 'hover:bg-blue-50 cursor-pointer';
    }

    return '';
  };

  const getPromptText = (): string => {
    switch (phase) {
      case 'choose':
        return "What type of clue is this?";

      case 'definition':
        if (hasCheckedDefinition && isDefinitionCorrect) {
          return "That's it! The definition is highlighted";
        }
        if (hasCheckedDefinition && !isDefinitionCorrect) {
          return "Not quite — try again";
        }
        if (selectedIndices.length === 0) {
          return "Standard clue — tap the definition words";
        }
        return "Tap Check when ready";

      case 'wordplay':
        if (currentStep && currentWordplayStep < wordplaySteps.length) {
          // Indicatorless steps (synonym, abbreviation) - Socratic approach
          if (!stepHasIndicator) {
            if (wordplaySubPhase === 'fodder') {
              return `Select a word to decode`;
            }
            if (wordplaySubPhase === 'decodeMethod') {
              return `How does "${currentStep.fodder}" decode?`;
            }
            if (wordplaySubPhase === 'result') {
              return `What does "${currentStep.fodder}" give you?`;
            }
          } else {
            // Steps with indicator
            if (wordplaySubPhase === 'indicator') {
              return `Find the ${getStepTypeLabel(currentStep).toLowerCase()} indicator`;
            }
            if (wordplaySubPhase === 'deleteTarget') {
              return `What should be deleted?`;
            }
            if (wordplaySubPhase === 'fodder') {
              return `Now find the fodder for "${currentStep.indicator}"`;
            }
            if (wordplaySubPhase === 'discovery') {
              return `But wait...`;
            }
            if (wordplaySubPhase === 'result') {
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
          const isIndicatorSelection = phase === 'wordplay' && wordplaySubPhase === 'indicator';
          const isDeleteTargetSelection = phase === 'wordplay' && wordplaySubPhase === 'deleteTarget';
          const isFodderSelection = phase === 'wordplay' && wordplaySubPhase === 'fodder';
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
              {isIndicatorSelection && selectedIndicatorIndices.length > 0 && !hasCheckedIndicator && (
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
              {isDeleteTargetSelection && selectedDeleteTargetIndices.length > 0 && !hasCheckedDeleteTarget && (
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
              {isFodderSelection && selectedFodderIndices.length > 0 && !hasCheckedFodder && stepHasIndicator && (
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
              {phase === 'definition' && selectedIndices.length > 0 && !hasCheckedDefinition && (
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
        const isFocusedSelection = phase === 'wordplay' && (wordplaySubPhase === 'indicator' || wordplaySubPhase === 'deleteTarget' || wordplaySubPhase === 'fodder');
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
        const isFocusedSelection = phase === 'wordplay' && (wordplaySubPhase === 'indicator' || wordplaySubPhase === 'deleteTarget' || wordplaySubPhase === 'fodder');
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
          {!(hasCheckedDefinition && isDefinitionCorrect) && (
            <div className="bg-slate-50 rounded-md p-3 border border-slate-200 mb-3">
              <p className="text-slate-600 text-sm">
                Tap the definition words above. It's always at the <strong>start</strong> or <strong>end</strong> of the clue.
              </p>
            </div>
          )}

          {/* Check button moved to clue box above */}

          {/* Result after checking - with key learning */}
          {hasCheckedDefinition && isDefinitionCorrect && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="bg-green-50 border border-green-200 rounded-md px-3 py-2 text-green-700 font-bold text-sm flex items-center gap-2">
                  <Check size={14} className="text-green-600" />
                  Nice split!
                </div>
                <button
                  onClick={handleDefinitionConfirm}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md font-bold text-sm transition-colors shadow-sm flex items-center gap-1"
                >
                  Continue <ChevronRight size={16} />
                </button>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                <p className="text-amber-800 text-sm leading-relaxed">
                  <strong>Key learning:</strong> {renderLearningText(DEFINITION_LEARNINGS[identifiedType || 'standard'])}
                </p>
              </div>
            </div>
          )}

          {hasCheckedDefinition && !isDefinitionCorrect && (
            <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-red-700 font-medium text-sm animate-in fade-in">
              ✗ Not quite — try again
            </div>
          )}

          {/* Back to choose - only when nothing selected and not checked */}
          {selectedIndices.length === 0 && !hasCheckedDefinition && (
            <button
              onClick={() => setPhase('choose')}
              className="text-slate-400 hover:text-slate-600 text-xs font-medium"
            >
              ← Back
            </button>
          )}
        </div>
      )}

      {/* WORDPLAY PHASE - Progressive indicator/fodder/result flow */}
      {phase === 'wordplay' && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 animate-in fade-in slide-in-from-bottom-2">
          {/* Header with progress */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 text-white p-1.5 rounded-md">
                <Lightbulb size={16} />
              </div>
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Wordplay</h3>
            </div>
            {wordplaySteps.length > 1 && (
              <div className="flex items-center gap-1.5">
                {wordplaySteps.map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      completedSteps.includes(i)
                        ? 'bg-green-500'
                        : onHoldSteps.includes(i)
                        ? 'bg-amber-400'
                        : blockedWordplays[i]
                        ? 'bg-slate-300 ring-1 ring-slate-400'
                        : i === currentWordplayStep
                        ? 'bg-indigo-500'
                        : 'bg-slate-200'
                    }`}
                    title={blockedWordplays[i] ? 'Blocked - solve dependencies first' : undefined}
                  />
                ))}
              </div>
            )}
          </div>

          {/* COLLAPSED PANELS - Show completed steps with expandable learnings */}
          {completedSteps.length > 0 && (
            <div className="space-y-2 mb-3">
              {completedSteps.map((stepIdx) => {
                const step = wordplaySteps[stepIdx];
                if (!step) return null;
                const stepType = step.stepType?.toLowerCase() || '';
                const learning = WORDPLAY_LEARNINGS[stepType];
                const clueSpecific = getClueSpecificLearning(stepType, step.indicator, step.fodder);
                const isExpanded = expandedCompletedSteps.includes(stepIdx);
                return (
                  <div key={stepIdx} className="bg-slate-50 border border-slate-200 rounded-md overflow-hidden">
                    <button
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedCompletedSteps(prev => prev.filter(i => i !== stepIdx));
                        } else {
                          setExpandedCompletedSteps(prev => [...prev, stepIdx]);
                        }
                      }}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-100 transition-colors"
                    >
                      <Check size={16} className="text-green-600 flex-shrink-0" />
                      <span className="text-indigo-600 text-sm font-bold uppercase">{getStepTypeLabel(step)}:</span>
                      <span className="text-slate-600 text-base">"{step.indicator}" + "{step.fodder}" → {step.result}</span>
                      <ChevronDown
                        size={14}
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

          {/* ON-HOLD PANELS - Show steps where user skipped to work on others */}
          {onHoldSteps.length > 0 && (
            <div className="space-y-2 mb-3">
              {onHoldSteps.map((stepIdx) => {
                const step = wordplaySteps[stepIdx];
                if (!step) return null;
                return (
                  <div key={stepIdx} className="bg-amber-50 border border-amber-300 rounded-md px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <HelpCircle size={16} className="text-amber-600 flex-shrink-0" />
                        <span className="text-amber-700 text-sm font-bold uppercase">{getStepTypeLabel(step)}:</span>
                        <span className="text-amber-600 text-base">"{step.indicator}" + "{step.fodder}" → <span className="italic">?</span></span>
                      </div>
                      <button
                        onClick={() => handleResumeStep(stepIdx)}
                        className="text-amber-600 hover:text-amber-700 text-xs font-bold"
                      >
                        Resume →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* EXPANDED PANEL - Current active step */}
          {currentStep && currentWordplayStep < wordplaySteps.length && !onHoldSteps.includes(currentWordplayStep) && (
            <div className="bg-slate-50 border-2 border-indigo-300 rounded-lg p-3 space-y-3">
              {/* Step header */}
              <div className="flex items-center justify-between">
                <p className="text-indigo-600 text-sm font-bold uppercase tracking-wide">
                  {getStepTypeLabel(currentStep)}
                </p>
                <span className="text-sm text-slate-400">
                  {currentWordplayStep + 1}/{wordplaySteps.length}
                </span>
              </div>

              {/* V2: Show blockedHint when step has unsolved dependencies */}
              {isCurrentStepBlocked && currentStep.blockedHint && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-amber-800 text-sm">{currentStep.blockedHint}</p>
                  <p className="text-amber-600 text-xs mt-1">
                    Solve the required wordplays first, then come back to this one.
                  </p>
                </div>
              )}

              {/* Clear instruction - hide once result is correct */}
              {!(hasCheckedResult && isResultCorrect) && wordplaySubPhase !== 'discovery' && (
                <div className="bg-white rounded-lg p-3 border border-slate-200">
                  {/* Indicatorless steps: Socratic approach */}
                  {!stepHasIndicator && wordplaySubPhase === 'fodder' && (
                    <>
                      {/* Letter boxes: accumulated + blanks for remaining */}
                      <div className="flex items-center gap-1 mb-3">
                        {accumulatedLetters.split('').map((letter, i) => (
                          <span key={i} className="w-8 h-8 flex items-center justify-center bg-indigo-100 text-indigo-700 rounded font-mono text-base font-bold border border-indigo-200">
                            {letter}
                          </span>
                        ))}
                        {Array.from({ length: lettersNeeded }).map((_, i) => (
                          <span key={`blank-${i}`} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded font-mono text-base border-2 border-dashed border-slate-300">
                          </span>
                        ))}
                      </div>
                      {/* Socratic guidance */}
                      <div className="text-slate-600 text-sm space-y-1">
                        <p>You have {unusedWords.length} word{unusedWords.length !== 1 ? 's' : ''} remaining: <span className="font-medium">{unusedWords.map(w => w.display).join(' and ')}</span>. That's {unusedWords.reduce((sum, w) => sum + w.text.length, 0)} letters.</p>
                        <p>You only need {lettersNeeded} more letter{lettersNeeded !== 1 ? 's' : ''}.</p>
                        <p className="text-slate-500 italic">There is likely an implied synonym, abbreviation or literal in there.</p>
                      </div>
                    </>
                  )}
                  {/* Steps with indicators: direct prompts */}
                  {stepHasIndicator && (
                    <>
                      <p className="text-slate-800 font-medium text-base">
                        {wordplaySubPhase === 'indicator' && `Tap the ${getStepTypeLabel(currentStep).toLowerCase()} indicator in the clue above`}
                        {wordplaySubPhase === 'deleteTarget' && `Now tap what should be deleted`}
                        {wordplaySubPhase === 'fodder' && `Now tap the fodder words in the clue above`}
                        {wordplaySubPhase === 'result' && `Type the result of this wordplay step`}
                      </p>
                      <p className="text-slate-500 text-sm mt-1">
                        {wordplaySubPhase === 'indicator' && `Look for a word that signals letters should be rearranged, selected, or transformed`}
                        {wordplaySubPhase === 'deleteTarget' && `The indicator tells you to remove something`}
                        {wordplaySubPhase === 'fodder' && `The fodder is adjacent to the indicator in the clue`}
                        {wordplaySubPhase === 'result' && isFodderDependent && `This step combines your previous results`}
                        {wordplaySubPhase === 'result' && !isFodderDependent && `Apply the operation to the fodder`}
                      </p>
                    </>
                  )}
                  {/* Indicatorless decode method phase - how does this word contribute? */}
                  {!stepHasIndicator && wordplaySubPhase === 'decodeMethod' && (
                    <div className="space-y-3">
                      <p className="text-slate-700 font-medium text-sm mb-2">
                        You selected "<span className="font-bold">{currentStep.fodder}</span>". How does it decode?
                      </p>

                      {/* Decode method options */}
                      <div className="space-y-2">
                        <label className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedDecodeMethod === 'literal'
                            ? 'border-indigo-400 bg-indigo-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}>
                          <input
                            type="radio"
                            name="decodeMethod"
                            checked={selectedDecodeMethod === 'literal'}
                            onChange={() => { setSelectedDecodeMethod('literal'); setDecodeMethodInput(''); setHasCheckedDecodeMethod(false); }}
                            className="sr-only"
                          />
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            selectedDecodeMethod === 'literal' ? 'border-indigo-500' : 'border-slate-300'
                          }`}>
                            {selectedDecodeMethod === 'literal' && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                          </div>
                          <span className="text-slate-700">
                            "<span className="font-bold">{currentStep.fodder}</span>" is used <span className="font-semibold">literally</span>
                          </span>
                        </label>

                        <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedDecodeMethod === 'synonym'
                            ? 'border-indigo-400 bg-indigo-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}>
                          <input
                            type="radio"
                            name="decodeMethod"
                            checked={selectedDecodeMethod === 'synonym'}
                            onChange={() => { setSelectedDecodeMethod('synonym'); setDecodeMethodInput(''); setHasCheckedDecodeMethod(false); }}
                            className="sr-only"
                          />
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                            selectedDecodeMethod === 'synonym' ? 'border-indigo-500' : 'border-slate-300'
                          }`}>
                            {selectedDecodeMethod === 'synonym' && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                          </div>
                          <div className="flex-1">
                            <span className="text-slate-700">
                              "<span className="font-bold">{currentStep.fodder}</span>" has a common cryptic <span className="font-semibold">synonym</span>
                            </span>
                            {selectedDecodeMethod === 'synonym' && (
                              <input
                                type="text"
                                value={decodeMethodInput}
                                onChange={(e) => { setDecodeMethodInput(e.target.value.toUpperCase()); setHasCheckedDecodeMethod(false); }}
                                placeholder="Type the synonym..."
                                className="mt-2 w-full px-3 py-2 rounded-md border border-slate-200 font-mono text-sm uppercase focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                autoFocus
                              />
                            )}
                          </div>
                        </label>

                        <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedDecodeMethod === 'abbreviation'
                            ? 'border-indigo-400 bg-indigo-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}>
                          <input
                            type="radio"
                            name="decodeMethod"
                            checked={selectedDecodeMethod === 'abbreviation'}
                            onChange={() => { setSelectedDecodeMethod('abbreviation'); setDecodeMethodInput(''); setHasCheckedDecodeMethod(false); }}
                            className="sr-only"
                          />
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                            selectedDecodeMethod === 'abbreviation' ? 'border-indigo-500' : 'border-slate-300'
                          }`}>
                            {selectedDecodeMethod === 'abbreviation' && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                          </div>
                          <div className="flex-1">
                            <span className="text-slate-700">
                              "<span className="font-bold">{currentStep.fodder}</span>" has a common cryptic <span className="font-semibold">abbreviation</span>
                            </span>
                            {selectedDecodeMethod === 'abbreviation' && (
                              <input
                                type="text"
                                value={decodeMethodInput}
                                onChange={(e) => { setDecodeMethodInput(e.target.value.toUpperCase()); setHasCheckedDecodeMethod(false); }}
                                placeholder="Type the abbreviation..."
                                className="mt-2 w-full px-3 py-2 rounded-md border border-slate-200 font-mono text-sm uppercase focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                autoFocus
                              />
                            )}
                          </div>
                        </label>
                      </div>

                      {/* Check button */}
                      {selectedDecodeMethod && (selectedDecodeMethod === 'literal' || decodeMethodInput.length > 0) && !hasCheckedDecodeMethod && (
                        <button
                          onClick={handleCheckDecodeMethod}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2"
                        >
                          <Check size={16} />
                          Check
                        </button>
                      )}

                      {/* Feedback */}
                      {hasCheckedDecodeMethod && !isDecodeMethodCorrect && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-red-700 font-medium text-sm animate-in fade-in">
                          ✗ Not quite — try again
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* === INDICATOR SUB-PHASE === */}
              {wordplaySubPhase === 'indicator' && (
                <div className="space-y-3">
                  {/* Check button moved to clue box above */}

                  {/* Correct indicator - auto-advances */}
                  {hasCheckedIndicator && isIndicatorCorrect && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 font-medium text-sm flex items-center gap-2">
                      <Check size={14} className="text-green-600" />
                      "{currentStep.indicator}" — correct!
                    </div>
                  )}

                  {/* Wrong indicator */}
                  {hasCheckedIndicator && !isIndicatorCorrect && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 font-medium text-sm animate-in fade-in">
                      ✗ Not quite — try again
                    </div>
                  )}
                </div>
              )}

              {/* === DELETE TARGET SUB-PHASE (for deletion with implied op) === */}
              {wordplaySubPhase === 'deleteTarget' && (
                <div className="space-y-3">
                  {/* Show confirmed indicator */}
                  <div className="flex items-center gap-2 text-sm">
                    <Check size={14} className="text-green-600" />
                    <span className="text-orange-600 font-medium">Indicator: "{currentStep.indicator}"</span>
                  </div>

                  {/* Check button is in clue box above */}

                  {/* Correct delete target - auto-advances */}
                  {hasCheckedDeleteTarget && isDeleteTargetCorrect && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 font-medium text-sm flex items-center gap-2">
                      <Check size={14} className="text-green-600" />
                      Delete "{currentStep.deleteTarget}" — correct!
                    </div>
                  )}

                  {/* Wrong delete target */}
                  {hasCheckedDeleteTarget && !isDeleteTargetCorrect && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 font-medium text-sm animate-in fade-in">
                      ✗ Not quite — try again
                    </div>
                  )}
                </div>
              )}

              {/* === FODDER SUB-PHASE === */}
              {wordplaySubPhase === 'fodder' && (
                <div className="space-y-3">
                  {/* Show confirmed indicator (only for steps with indicators) */}
                  {stepHasIndicator && !isDeletionWithImpliedOp && (
                    <div className="flex items-center gap-2 text-sm">
                      <Check size={14} className="text-green-600" />
                      <span className="text-indigo-600 font-medium">Indicator: "{currentStep.indicator}"</span>
                    </div>
                  )}
                  {/* For deletion with implied op, show both indicator and delete target */}
                  {isDeletionWithImpliedOp && (
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <div className="flex items-center gap-1">
                        <Check size={14} className="text-green-600" />
                        <span className="text-orange-600 font-medium">"{currentStep.indicator}"</span>
                      </div>
                      <span className="text-slate-400">→ delete</span>
                      <div className="flex items-center gap-1">
                        <Check size={14} className="text-green-600" />
                        <span className="text-purple-600 font-medium">"{currentStep.deleteTarget}"</span>
                      </div>
                    </div>
                  )}

                  {/* Check button moved to clue box above */}

                  {/* Correct fodder - auto-advances */}
                  {hasCheckedFodder && isFodderCorrect && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 font-medium text-sm flex items-center gap-2">
                      <Check size={14} className="text-green-600" />
                      "{currentStep.fodder}" — correct!
                    </div>
                  )}

                  {/* Wrong fodder */}
                  {hasCheckedFodder && !isFodderCorrect && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 font-medium text-sm animate-in fade-in">
                      ✗ Not quite — try again
                    </div>
                  )}
                </div>
              )}

              {/* === DISCOVERY SUB-PHASE (aha moment for deletion with implied op) === */}
              {wordplaySubPhase === 'discovery' && isDeletionWithImpliedOp && (
                <div className="space-y-3">
                  {/* Show what we have so far */}
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <div className="flex items-center gap-1">
                      <Check size={14} className="text-green-600" />
                      <span className="text-orange-600 font-medium">"{currentStep.indicator}"</span>
                    </div>
                    <span className="text-slate-400">→ delete</span>
                    <div className="flex items-center gap-1">
                      <Check size={14} className="text-green-600" />
                      <span className="text-purple-600 font-medium">"{currentStep.deleteTarget}"</span>
                    </div>
                    <span className="text-slate-400">from</span>
                    <div className="flex items-center gap-1">
                      <Check size={14} className="text-green-600" />
                      <span className="text-blue-600 font-medium">"{currentStep.fodder}"</span>
                    </div>
                  </div>

                  {/* The AHA moment */}
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
                    <p className="text-amber-800 font-bold text-base mb-2">
                      🤔 But wait...
                    </p>
                    <p className="text-amber-700 text-base">
                      "{currentStep.deleteTarget?.toUpperCase()}" isn't in "{currentStep.fodder?.toUpperCase()}"!
                    </p>
                    <p className="text-amber-600 text-sm mt-2">
                      This implies a {currentStep.impliedOperation} is needed first. What does "{currentStep.fodder}" become?
                    </p>
                  </div>

                  {/* Implied result input */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={impliedResultInput}
                      onChange={(e) => setImpliedResultInput(e.target.value.toUpperCase())}
                      placeholder={`${currentStep.impliedOperation === 'anagram' ? 'Anagram' : 'Synonym'} of "${currentStep.fodder}"...`}
                      className={`flex-1 px-4 py-2.5 rounded-lg border-2 font-mono text-lg uppercase tracking-wider transition-colors
                        ${hasCheckedImpliedResult && isImpliedResultCorrect
                          ? 'bg-green-50 border-green-200 text-green-700'
                          : hasCheckedImpliedResult && !isImpliedResultCorrect
                          ? 'bg-red-50 border-red-200 text-red-700'
                          : 'bg-white border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
                        }`}
                      disabled={hasCheckedImpliedResult && isImpliedResultCorrect}
                    />
                    {!hasCheckedImpliedResult && impliedResultInput.length > 0 && (
                      <button
                        onClick={handleCheckImpliedResult}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm"
                      >
                        Check
                      </button>
                    )}
                  </div>

                  {/* Wrong implied result feedback */}
                  {hasCheckedImpliedResult && !isImpliedResultCorrect && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-red-700 font-medium text-sm animate-in fade-in">
                      ✗ Not quite — try again
                    </div>
                  )}

                  {/* Correct implied result - auto-advances */}
                  {hasCheckedImpliedResult && isImpliedResultCorrect && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 font-medium text-sm flex items-center gap-2">
                      <Check size={14} className="text-green-600" />
                      "{currentStep.fodder}" → {currentStep.impliedResult} — now we can delete "{currentStep.deleteTarget}"!
                    </div>
                  )}
                </div>
              )}

              {/* === ASSEMBLY SUB-PHASE (container assembles letters for pending anagram) === */}
              {wordplaySubPhase === 'assembly' && isContainerAssemblyStep && (
                <div className="space-y-3">
                  {/* Show what we're assembling */}
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <div className="flex items-center gap-1">
                      <Check size={14} className="text-green-600" />
                      <span className="text-orange-600 font-medium">"{currentStep.indicator}"</span>
                    </div>
                    <span className="text-slate-400">assembles:</span>
                  </div>

                  {/* Show the assembled letters */}
                  <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                    <p className="text-green-800 font-bold text-base mb-2">
                      ✓ Letters assembled!
                    </p>
                    <p className="text-green-700 text-lg font-mono tracking-wider">
                      {assembledAnagramFodder?.toUpperCase() || ''}
                    </p>
                    <p className="text-green-600 text-sm mt-2">
                      You now have {(assembledAnagramFodder || '').replace(/\s/g, '').length} letters — enough to solve the anagram!
                    </p>
                  </div>

                  {/* Button to go back to anagram */}
                  <button
                    onClick={handleAssemblyComplete}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2"
                  >
                    Solve the Anagram <ChevronRight size={16} />
                  </button>
                </div>
              )}

              {/* === RESULT SUB-PHASE === */}
                  {wordplaySubPhase === 'result' && (
                    <div className="space-y-3">
                      {/* Show confirmed parts - different display for deletion with implied op */}
                      {isDeletionWithImpliedOp ? (
                        // Deletion with implied op: show full chain
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm flex-wrap">
                            <span className="text-slate-500">"{currentStep.fodder}"</span>
                            <span className="text-slate-400">→</span>
                            <span className="text-green-600 font-medium">{currentStep.impliedResult}</span>
                            <span className="text-slate-400">(via {currentStep.impliedOperation})</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm flex-wrap">
                            <span className="text-green-600 font-medium">{currentStep.impliedResult}</span>
                            <span className="text-slate-400">−</span>
                            <span className="text-purple-600 font-medium">"{currentStep.deleteTarget}"</span>
                            <span className="text-slate-400">= ?</span>
                          </div>
                        </div>
                      ) : (
                        // Standard indicator + fodder display
                        <div className="flex items-center gap-2 text-sm flex-wrap">
                          {/* Show indicator (only for steps with indicators) */}
                          {stepHasIndicator && (
                            <>
                              <div className="flex items-center gap-1">
                                <div className="bg-orange-500 text-white p-0.5 rounded-full">
                                  <Check size={12} />
                                </div>
                                <span className="text-orange-600 font-medium">"{currentStep.indicator}"</span>
                              </div>
                              <span className="text-slate-400">+</span>
                            </>
                          )}
                          <div className="flex items-center gap-1 flex-wrap">
                            {isFodderDependent ? (
                              // Dependent step - fodder from previous results
                              // Show descriptive text for each component instead of metadata result
                              <>
                                <Zap size={12} className="text-indigo-500" />
                                {(() => {
                                  // Build descriptive fodder from completed and on-hold steps
                                  const parts: React.ReactNode[] = [];
                                  wordplaySteps.forEach((step, idx) => {
                                    if (idx === currentWordplayStep) return; // Skip current step
                                    if (completedSteps.includes(idx)) {
                                      // Completed step - show result
                                      parts.push(
                                        <span key={idx} className="text-green-600 font-medium">{step.result}</span>
                                      );
                                    } else if (onHoldSteps.includes(idx)) {
                                      // On-hold step - show descriptive text
                                      const stepLabel = step.stepType === 'anagram' ? 'anagram' : step.stepType;
                                      parts.push(
                                        <span key={idx} className="text-amber-600 font-medium italic">({stepLabel} of "{step.fodder}")</span>
                                      );
                                    }
                                  });
                                  return parts.length > 0 ? (
                                    <>
                                      {parts.map((part, i) => (
                                        <React.Fragment key={i}>
                                          {i > 0 && <span className="text-slate-400 mx-1">+</span>}
                                          {part}
                                        </React.Fragment>
                                      ))}
                                      <span className="text-slate-400 text-xs ml-1">(from previous)</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-indigo-600 font-medium">{currentStep.fodder}</span>
                                      <span className="text-slate-400 text-xs">(from previous)</span>
                                    </>
                                  );
                                })()}
                              </>
                            ) : isResumedAnagramWithAssembly ? (
                              // Anagram resumed after assembly - show assembled fodder
                              <>
                                <Check size={12} className="text-green-600" />
                                <span className="text-indigo-600 font-medium font-mono tracking-wider">{resumedAnagramFodder?.toUpperCase()}</span>
                                <span className="text-slate-400 text-xs ml-1">(assembled)</span>
                              </>
                            ) : (
                              // Independent step - fodder was selected by user
                              <>
                                <Check size={12} className="text-green-600" />
                                <span className="text-indigo-600 font-medium">"{currentStep.fodder}"</span>
                              </>
                            )}
                          </div>
                          <span className="text-slate-400">= ?</span>
                        </div>
                      )}

                      {/* Result input */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={stepResultInput}
                          onChange={(e) => setStepResultInput(e.target.value.toUpperCase())}
                          placeholder="Type result..."
                          className={`flex-1 px-4 py-2.5 rounded-lg border-2 font-mono text-lg uppercase tracking-wider transition-colors
                            ${hasCheckedResult && isResultCorrect
                              ? 'bg-green-50 border-green-200 text-green-700'
                              : hasCheckedResult && !isResultCorrect
                              ? 'bg-red-50 border-red-200 text-red-700'
                              : 'bg-white border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
                            }`}
                          disabled={hasCheckedResult && isResultCorrect}
                        />
                        {!hasCheckedResult && stepResultInput.length > 0 && (
                          <button
                            onClick={handleCheckResult}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm"
                          >
                            Check
                          </button>
                        )}
                      </div>

                      {/* Letter count hint and Skip button */}
                      {!isResultCorrect && (
                        <div className="space-y-3">
                          {/* Show letter count mismatch for anagram steps */}
                          {currentStep.stepType?.toLowerCase() === 'anagram' && (() => {
                            // V2: fodder can be string or FodderReference object
                            const fodderStr = typeof currentStep.fodder === 'string' ? currentStep.fodder : '';
                            const fodderLetters = fodderStr.replace(/[^a-zA-Z]/g, '').length;
                            const answerLetters = answer.replace(/[^a-zA-Z]/g, '').length;
                            if (fodderLetters < answerLetters) {
                              return (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                  <p className="text-amber-700 font-medium text-sm">
                                    ⚠️ Not enough letters! "{fodderStr}" has {fodderLetters} letters, but the answer needs {answerLetters}.
                                  </p>
                                  <p className="text-amber-600 text-sm mt-1">
                                    You may need to find other wordplay steps first to get the missing letters.
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          })()}

                          <div className="flex items-center gap-3">
                            <button
                              onClick={handleRevealStepResult}
                              className="text-slate-400 hover:text-slate-600 text-xs font-medium"
                            >
                              Reveal result
                            </button>
                            {wordplaySteps.length > 1 && (
                              <button
                                onClick={handleSkipStep}
                                className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors shadow-sm"
                              >
                                Skip for now →
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Wrong result feedback */}
                      {hasCheckedResult && !isResultCorrect && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-red-700 font-medium text-sm animate-in fade-in">
                          ✗ Not quite — try again
                        </div>
                      )}

                      {/* Correct result - complete step with key learning */}
                      {hasCheckedResult && isResultCorrect && (
                        <div className="space-y-3">
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 font-medium text-base flex items-center gap-2">
                            <Check size={16} className="text-green-600" />
                            Correct! {currentStep.explanation || `"${currentStep.fodder}" → ${currentStep.result}`}
                          </div>
                          {/* Key learning for this wordplay type */}
                          {(() => {
                            const stepType = currentStep.stepType?.toLowerCase() || '';
                            const learning = WORDPLAY_LEARNINGS[stepType];
                            const clueSpecific = getClueSpecificLearning(stepType, currentStep.indicator, currentStep.fodder);
                            if (!learning) return null;
                            return (
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
                            );
                          })()}
                          <button
                            onClick={handleStepComplete}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2"
                          >
                            {currentWordplayStep + 1 >= wordplaySteps.length ? (
                              <>Enter Answer <ChevronRight size={16} /></>
                            ) : (
                              <>Next Step <ChevronRight size={16} /></>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Fallback if no indicator steps */}
              {wordplaySteps.length === 0 && (
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <p className="text-slate-600 text-sm mb-3">
                    No wordplay indicators to identify for this clue.
                  </p>
                  <button
                    onClick={() => setPhase('solve')}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2"
                  >
                    Enter the answer <ChevronRight size={18} />
                  </button>
                </div>
              )}
        </div>
      )}

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
