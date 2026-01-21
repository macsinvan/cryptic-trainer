
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronRight, Check, HelpCircle, Lightbulb, Zap, BookOpen } from 'lucide-react';
import { PatternInstance, WordHighlight } from '../types';
import { WORKFLOW_COLORS } from '../data/designTemplates';

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
  // Core data - will be wired up later
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
// MOCK DATA (for development - remove when wiring up)
// =============================================================================

const MOCK_CLUE = {
  text: "Setter's upset about resistance in maze",
  answer: "LABYRINTH",
  enumeration: "9",
  clueNumber: "12A",
  definition: {
    text: "maze",
    position: 'end' as const,
    wordIndices: [6]  // "maze" is at index 6
  },
  clueType: 'standard' as ClueType,
  wordplaySteps: [
    { indicator: "upset", fodder: "Setter's", result: "LABYRS", explanation: "LABYRS is an anagram of 'Setter's'" },
    { indicator: "about", fodder: "R", result: "LABYRINTH", explanation: "R (resistance) goes inside" }
  ]
};

// =============================================================================
// COMPONENT
// =============================================================================

export const ClueTrainer: React.FC<ClueTrainerProps> = ({
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
  type WordplaySubPhase = 'indicator' | 'fodder' | 'result';
  const [wordplaySubPhase, setWordplaySubPhase] = useState<WordplaySubPhase>('indicator');
  const [selectedIndicatorIndices, setSelectedIndicatorIndices] = useState<number[]>([]);
  const [selectedFodderIndices, setSelectedFodderIndices] = useState<number[]>([]);
  const [hasCheckedIndicator, setHasCheckedIndicator] = useState(false);
  const [isIndicatorCorrect, setIsIndicatorCorrect] = useState(false);
  const [hasCheckedFodder, setHasCheckedFodder] = useState(false);
  const [isFodderCorrect, setIsFodderCorrect] = useState(false);
  const [stepResultInput, setStepResultInput] = useState('');
  const [hasCheckedResult, setHasCheckedResult] = useState(false);
  const [isResultCorrect, setIsResultCorrect] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]); // Collapsed steps
  const [revealedIndicatorSteps, setRevealedIndicatorSteps] = useState<number[]>([]);
  const [confirmedHighlights, setConfirmedHighlights] = useState<{indicatorIndices: number[], fodderIndices: number[]}[]>([]); // Persisted wordplay highlights

  // For special clue types
  const [identifiedType, setIdentifiedType] = useState<ClueType | null>(null);

  // Refs
  const gridRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ---------------------------------------------------------------------------
  // DERIVED DATA (use mock for now, will use patternData when wired)
  // ---------------------------------------------------------------------------

  const clueText = patternData?.clueText || MOCK_CLUE.text;
  const answer = patternData?.answer || MOCK_CLUE.answer;
  const displayEnumeration = enumeration || patternData?.enumeration || MOCK_CLUE.enumeration;
  const displayClueNumber = clueNumber || patternData?.clueNumber || MOCK_CLUE.clueNumber;

  // Tokenize clue into words
  const words = useMemo<Word[]>(() => {
    return clueText.split(/\s+/).map((word, i) => ({
      id: i,
      text: word.replace(/[.,;!?()'"]/g, '').toLowerCase(),
      display: word
    }));
  }, [clueText]);

  // Expected definition (from data or mock)
  const expectedDefinition = useMemo(() => {
    if (patternData?.definitionText) {
      // Find word indices that match the definition text
      const defWords = patternData.definitionText.toLowerCase().split(/\s+/);
      const indices: number[] = [];

      // Search from start
      if (patternData.definitionPosition === 'start') {
        for (let i = 0; i < defWords.length && i < words.length; i++) {
          if (words[i].text === defWords[i]) indices.push(i);
        }
      }
      // Search from end
      else if (patternData.definitionPosition === 'end') {
        for (let i = 0; i < defWords.length; i++) {
          const wordIdx = words.length - defWords.length + i;
          if (wordIdx >= 0 && words[wordIdx].text === defWords[i]) {
            indices.push(wordIdx);
          }
        }
      }

      return {
        text: patternData.definitionText,
        position: patternData.definitionPosition || 'end',
        wordIndices: indices
      };
    }
    return MOCK_CLUE.definition;
  }, [patternData, words]);

  // Get wordplay steps that have indicators (exclude assembly steps which are informational)
  const indicatorSteps = useMemo(() => {
    const steps = patternData?.wordplaySteps || [];
    return steps.filter(step => !step.isAssembly && step.indicator);
  }, [patternData]);

  // Current indicator step the user needs to find
  const currentIndicatorTarget = indicatorSteps[currentWordplayStep];

  // Check if a step is "dependent" (fodder uses results from previous steps, not clue text)
  const isStepDependent = useMemo(() => {
    if (!currentIndicatorTarget) return false;
    const fodder = currentIndicatorTarget.fodder.toLowerCase();
    // If fodder contains uppercase result references or + signs, it's dependent
    // Also check if fodder words don't exist in the clue text
    const fodderWords = fodder.split(/\s+/).map(w => w.replace(/[^a-z]/gi, '').toLowerCase());
    const clueWordsLower = words.map(w => w.text.toLowerCase());
    // A step is dependent if most of its fodder words aren't in the clue
    const wordsInClue = fodderWords.filter(fw => fw && clueWordsLower.includes(fw));
    return wordsInClue.length < fodderWords.length / 2;
  }, [currentIndicatorTarget, words]);

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
    setSelectedFodderIndices([]);
    setHasCheckedIndicator(false);
    setIsIndicatorCorrect(false);
    setHasCheckedFodder(false);
    setIsFodderCorrect(false);
    setStepResultInput('');
    setHasCheckedResult(false);
    setIsResultCorrect(false);
    setCompletedSteps([]);
    setRevealedIndicatorSteps([]);
    setConfirmedHighlights([]);

    // Initialize answer grid
    const cleanAnswer = answer.replace(/[^A-Z]/gi, '').toUpperCase();
    setGrid(new Array(cleanAnswer.length).fill(''));
  }, [clueText, answer]);

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

    // Wordplay phase - indicator or fodder selection
    if (phase === 'wordplay' && !showWordplayDetail) {
      if (wordplaySubPhase === 'indicator') {
        setSelectedIndicatorIndices(prev => {
          if (prev.includes(wordIndex)) {
            return prev.filter(i => i !== wordIndex);
          }
          return [...prev, wordIndex].sort((a, b) => a - b);
        });
      } else if (wordplaySubPhase === 'fodder') {
        setSelectedFodderIndices(prev => {
          if (prev.includes(wordIndex)) {
            return prev.filter(i => i !== wordIndex);
          }
          return [...prev, wordIndex].sort((a, b) => a - b);
        });
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
    if (!currentIndicatorTarget) return;

    // Get the selected text
    const selectedText = selectedIndicatorIndices.map(i => words[i].text).join(' ');
    const targetIndicator = currentIndicatorTarget.indicator.toLowerCase().replace(/[.,;!?()'"]/g, '');

    // Check if it matches (allowing for some flexibility)
    const isMatch = selectedText === targetIndicator ||
                    selectedText.includes(targetIndicator) ||
                    targetIndicator.includes(selectedText);

    setHasCheckedIndicator(true);
    setIsIndicatorCorrect(isMatch);

    if (isMatch) {
      // Correct - auto-advance after brief success flash
      // For dependent steps (fodder from previous results), skip to result
      // For independent steps, go to fodder selection
      setTimeout(() => {
        if (isStepDependent) {
          setWordplaySubPhase('result');
        } else {
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

  const handleCheckFodder = () => {
    if (!currentIndicatorTarget) return;

    // Get the selected text
    const selectedText = selectedFodderIndices.map(i => words[i].text).join(' ');
    const targetFodder = currentIndicatorTarget.fodder.toLowerCase().replace(/[.,;!?()'"]/g, '');

    // Check if it matches (allowing for some flexibility)
    const isMatch = selectedText === targetFodder ||
                    selectedText.includes(targetFodder) ||
                    targetFodder.includes(selectedText);

    setHasCheckedFodder(true);
    setIsFodderCorrect(isMatch);

    if (isMatch) {
      // Correct - auto-advance to result after brief success flash
      setTimeout(() => {
        setWordplaySubPhase('result');
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

  const handleCheckResult = () => {
    if (!currentIndicatorTarget) return;

    const targetResult = currentIndicatorTarget.result.toUpperCase().replace(/[^A-Z]/g, '');
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
    if (!currentIndicatorTarget) return;
    setStepResultInput(currentIndicatorTarget.result);
    setHasCheckedResult(true);
    setIsResultCorrect(true);
  };

  const handleStepComplete = () => {
    // Save confirmed highlights before clearing
    setConfirmedHighlights(prev => [...prev, {
      indicatorIndices: [...selectedIndicatorIndices],
      fodderIndices: [...selectedFodderIndices]
    }]);

    // Mark step as completed (collapsed)
    setCompletedSteps(prev => [...prev, currentWordplayStep]);

    const nextStep = currentWordplayStep + 1;

    if (nextStep >= indicatorSteps.length) {
      // All steps done - move to solve phase
      setPhase('solve');
    } else {
      // Move to next step
      setCurrentWordplayStep(nextStep);
      // Reset sub-phase state
      setWordplaySubPhase('indicator');
      setSelectedIndicatorIndices([]);
      setSelectedFodderIndices([]);
      setHasCheckedIndicator(false);
      setIsIndicatorCorrect(false);
      setHasCheckedFodder(false);
      setIsFodderCorrect(false);
      setStepResultInput('');
      setHasCheckedResult(false);
      setIsResultCorrect(false);
    }
  };

  const handleNextIndicator = () => {
    // Mark current step as revealed before moving on
    setRevealedIndicatorSteps(prev => [...prev, currentWordplayStep]);

    const nextStep = currentWordplayStep + 1;

    if (nextStep >= indicatorSteps.length) {
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
  const getStepTypeLabel = (step: typeof currentIndicatorTarget): string => {
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

    // Interactive state - definition or wordplay selection phases
    if (phase === 'definition') {
      return 'hover:bg-indigo-50 cursor-pointer';
    }
    if (phase === 'wordplay' && wordplaySubPhase === 'indicator') {
      return 'hover:bg-orange-50 cursor-pointer';
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
        if (currentIndicatorTarget && currentWordplayStep < indicatorSteps.length) {
          if (wordplaySubPhase === 'indicator') {
            return `Find the ${getStepTypeLabel(currentIndicatorTarget).toLowerCase()} indicator`;
          }
          if (wordplaySubPhase === 'fodder') {
            return `Now find the fodder for "${currentIndicatorTarget.indicator}"`;
          }
          if (wordplaySubPhase === 'result') {
            return `Work out the result`;
          }
        }
        if (completedSteps.length === indicatorSteps.length && indicatorSteps.length > 0) {
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
      <div className="bg-white p-5 md:p-6 rounded-xl shadow-sm border border-slate-200 text-center relative">
        <div className="text-2xl md:text-3xl font-serif text-slate-900 leading-relaxed flex flex-wrap justify-center items-baseline gap-x-2 gap-y-2">
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
            <span className="text-slate-400 font-normal text-xl">({displayEnumeration})</span>
          )}
        </div>

        {/* Prompt - evolves based on phase */}
        {phase !== 'complete' && (() => {
          const isFocusedSelection = phase === 'wordplay' && (wordplaySubPhase === 'indicator' || wordplaySubPhase === 'fodder');
          return (
            <div className={`mt-4 transition-all duration-300 ${
              isFocusedSelection
                ? 'text-base font-semibold text-indigo-700 bg-indigo-50 rounded-lg px-3 py-1.5 inline-block'
                : 'text-sm text-slate-600'
            }`}>
              {getPromptText()}
            </div>
          );
        })()}
      </div>

      {/* ANSWER GRID - Hidden during indicator/fodder selection for focus */}
      {(() => {
        const isFocusedSelection = phase === 'wordplay' && (wordplaySubPhase === 'indicator' || wordplaySubPhase === 'fodder');
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
        const isFocusedSelection = phase === 'wordplay' && (wordplaySubPhase === 'indicator' || wordplaySubPhase === 'fodder');
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
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-indigo-600 text-white p-1.5 rounded-md">
              <BookOpen size={16} />
            </div>
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Clue Type</h3>
          </div>

          {/* All clue type options */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleChooseStandard}
              className="text-left p-3 rounded-md border-2 border-indigo-300 bg-indigo-50 hover:border-indigo-500 hover:bg-indigo-100 transition-all"
            >
              <span className="font-bold text-indigo-700 text-sm">Standard</span>
              <p className="text-xs text-indigo-600">Definition + wordplay</p>
            </button>
            <button
              onClick={() => handleSpecialType('double_definition')}
              className="text-left p-3 rounded-md border-2 border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
            >
              <span className="font-bold text-slate-700 text-sm">Double Definition</span>
              <p className="text-xs text-slate-500">Two definitions</p>
            </button>
            <button
              onClick={() => handleSpecialType('cryptic_definition')}
              className="text-left p-3 rounded-md border-2 border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
            >
              <span className="font-bold text-slate-700 text-sm">Cryptic Definition</span>
              <p className="text-xs text-slate-500">Entire clue is a hint</p>
            </button>
            <button
              onClick={() => handleSpecialType('and_lit')}
              className="text-left p-3 rounded-md border-2 border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
            >
              <span className="font-bold text-slate-700 text-sm">&lit</span>
              <p className="text-xs text-slate-500">Both combined</p>
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

          {/* Instruction card */}
          <div className="bg-slate-50 rounded-md p-3 border border-slate-200 mb-3">
            <p className="text-slate-600 text-sm">
              Tap the definition words above. It's always at the <strong>start</strong> or <strong>end</strong> of the clue.
            </p>
          </div>

          {/* Step 1: Check button - appears when user has selected words but hasn't checked yet */}
          {selectedIndices.length > 0 && !hasCheckedDefinition && (
            <button
              onClick={handleCheckDefinition}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md font-bold text-sm transition-colors shadow-sm flex items-center gap-2"
            >
              <Check size={16} />
              Check
            </button>
          )}

          {/* Step 2: Result after checking */}
          {hasCheckedDefinition && isDefinitionCorrect && (
            <div className="flex items-center gap-3">
              <div className="bg-green-50 border border-green-200 rounded-md px-3 py-2 text-green-700 font-medium text-sm flex items-center gap-2">
                <Check size={14} className="text-green-600" />
                Correct!
              </div>
              <button
                onClick={handleDefinitionConfirm}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md font-bold text-sm transition-colors shadow-sm flex items-center gap-1"
              >
                Continue <ChevronRight size={16} />
              </button>
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
            {indicatorSteps.length > 1 && (
              <div className="flex items-center gap-1.5">
                {indicatorSteps.map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      completedSteps.includes(i)
                        ? 'bg-green-500'
                        : i === currentWordplayStep
                        ? 'bg-indigo-500'
                        : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* COLLAPSED PANELS - Show completed steps (without revealing results) */}
          {completedSteps.length > 0 && (
            <div className="space-y-2 mb-3">
              {completedSteps.map((stepIdx) => {
                const step = indicatorSteps[stepIdx];
                if (!step) return null;
                return (
                  <div key={stepIdx} className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2 flex items-center gap-2">
                    <Check size={14} className="text-green-600" />
                    <span className="text-indigo-600 text-xs font-bold uppercase">{getStepTypeLabel(step)}</span>
                    <span className="text-slate-400 text-xs">"{step.indicator}" + "{step.fodder}"</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* EXPANDED PANEL - Current active step */}
          {currentIndicatorTarget && currentWordplayStep < indicatorSteps.length && (
            <div className="bg-slate-50 border-2 border-indigo-300 rounded-lg p-3 space-y-3">
              {/* Step header */}
              <div className="flex items-center justify-between">
                <p className="text-indigo-600 text-xs font-bold uppercase tracking-wide">
                  {getStepTypeLabel(currentIndicatorTarget)}
                </p>
                <span className="text-xs text-slate-400">
                  {currentWordplayStep + 1}/{indicatorSteps.length}
                </span>
              </div>

              {/* Clear instruction - hide once result is correct */}
              {!(hasCheckedResult && isResultCorrect) && (
                <div className="bg-white rounded-lg p-3 border border-slate-200">
                  <p className="text-slate-800 font-medium text-sm">
                    {wordplaySubPhase === 'indicator' && `Tap the ${getStepTypeLabel(currentIndicatorTarget).toLowerCase()} indicator in the clue above`}
                    {wordplaySubPhase === 'fodder' && `Now tap the fodder words in the clue above`}
                    {wordplaySubPhase === 'result' && `Type the result of this wordplay step`}
                  </p>
                  <p className="text-slate-500 text-xs mt-1">
                    {wordplaySubPhase === 'indicator' && `Look for a word that signals letters should be rearranged, selected, or transformed`}
                    {wordplaySubPhase === 'fodder' && `The fodder is adjacent to the indicator in the clue`}
                    {wordplaySubPhase === 'result' && isStepDependent && `This step combines your previous results`}
                    {wordplaySubPhase === 'result' && !isStepDependent && `Apply the operation to the fodder`}
                  </p>
                </div>
              )}

              {/* === INDICATOR SUB-PHASE === */}
              {wordplaySubPhase === 'indicator' && (
                <div className="space-y-3">
                  {/* Check button */}
                  {selectedIndicatorIndices.length > 0 && !hasCheckedIndicator && (
                    <button
                      onClick={handleCheckIndicator}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2"
                    >
                      <Check size={16} />
                      Check Indicator
                    </button>
                  )}

                  {/* Correct indicator - auto-advances */}
                  {hasCheckedIndicator && isIndicatorCorrect && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 font-medium text-sm flex items-center gap-2">
                      <Check size={14} className="text-green-600" />
                      "{currentIndicatorTarget.indicator}" — correct!
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

              {/* === FODDER SUB-PHASE === */}
              {wordplaySubPhase === 'fodder' && (
                <div className="space-y-3">
                  {/* Show confirmed indicator */}
                  <div className="flex items-center gap-2 text-sm">
                    <Check size={14} className="text-green-600" />
                    <span className="text-indigo-600 font-medium">Indicator: "{currentIndicatorTarget.indicator}"</span>
                  </div>

                  {/* Check button */}
                  {selectedFodderIndices.length > 0 && !hasCheckedFodder && (
                    <button
                      onClick={handleCheckFodder}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2"
                    >
                      <Check size={16} />
                      Check Fodder
                    </button>
                  )}

                  {/* Correct fodder - auto-advances */}
                  {hasCheckedFodder && isFodderCorrect && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 font-medium text-sm flex items-center gap-2">
                      <Check size={14} className="text-green-600" />
                      "{currentIndicatorTarget.fodder}" — correct!
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

                  {/* === RESULT SUB-PHASE === */}
                  {wordplaySubPhase === 'result' && (
                    <div className="space-y-3">
                      {/* Show confirmed indicator and fodder */}
                      <div className="flex items-center gap-2 text-sm flex-wrap">
                        <div className="flex items-center gap-1">
                          <div className="bg-orange-500 text-white p-0.5 rounded-full">
                            <Check size={12} />
                          </div>
                          <span className="text-orange-600 font-medium">"{currentIndicatorTarget.indicator}"</span>
                        </div>
                        <span className="text-slate-400">+</span>
                        <div className="flex items-center gap-1">
                          {isStepDependent ? (
                            // Dependent step - fodder from previous results
                            <>
                              <Zap size={12} className="text-indigo-500" />
                              <span className="text-indigo-600 font-medium">{currentIndicatorTarget.fodder}</span>
                              <span className="text-slate-400 text-xs">(from previous)</span>
                            </>
                          ) : (
                            // Independent step - fodder was selected by user
                            <>
                              <Check size={12} className="text-green-600" />
                              <span className="text-indigo-600 font-medium">"{currentIndicatorTarget.fodder}"</span>
                            </>
                          )}
                        </div>
                        <span className="text-slate-400">= ?</span>
                      </div>

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

                      {/* Reveal button */}
                      {!isResultCorrect && (
                        <button
                          onClick={handleRevealStepResult}
                          className="text-slate-400 hover:text-slate-600 text-xs font-medium"
                        >
                          Reveal result
                        </button>
                      )}

                      {/* Wrong result feedback */}
                      {hasCheckedResult && !isResultCorrect && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-red-700 font-medium text-sm animate-in fade-in">
                          ✗ Not quite — try again
                        </div>
                      )}

                      {/* Correct result - complete step */}
                      {hasCheckedResult && isResultCorrect && (
                        <div className="space-y-3">
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 font-medium text-sm flex items-center gap-2">
                            <Check size={14} className="text-green-600" />
                            Correct! {currentIndicatorTarget.explanation || `"${currentIndicatorTarget.fodder}" → ${currentIndicatorTarget.result}`}
                          </div>
                          <button
                            onClick={handleStepComplete}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2"
                          >
                            {currentWordplayStep + 1 >= indicatorSteps.length ? (
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
              {indicatorSteps.length === 0 && (
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
          {/* Wordplay summary */}
          {indicatorSteps.length > 0 && (
            <div className="space-y-2 mb-3 pb-3 border-b border-slate-100">
              {indicatorSteps.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Check size={14} className="text-green-600" />
                  <span className="text-indigo-600 font-bold text-xs uppercase">{getStepTypeLabel(step)}:</span>
                  <span className="text-slate-500">"{step.indicator}" + "{step.fodder}" → {step.result}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 text-white p-1.5 rounded-md">
                <Zap size={16} />
              </div>
              <span className="text-slate-600 text-sm">Type the answer above</span>
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
            {patternData?.wordplaySteps && patternData.wordplaySteps.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {Array.from(new Set(patternData.wordplaySteps.map(s => getStepTypeLabel(s)))).map((technique, i) => (
                  <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                    {technique}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Compact summary */}
          <div className="space-y-2 mb-4">
            {patternData?.definitionText && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-indigo-600 font-bold text-xs uppercase">Def:</span>
                <span className="text-indigo-600">{patternData.definitionText}</span>
                <span className="text-slate-400 text-xs">({patternData.definitionPosition})</span>
              </div>
            )}
            {patternData?.wordplaySteps?.map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-indigo-600 font-bold text-xs uppercase">{getStepTypeLabel(step)}:</span>
                <span className="text-slate-600">{step.fodder} → {step.result}</span>
              </div>
            ))}
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
