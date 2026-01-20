
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

  // Check if selected words match the expected definition
  useEffect(() => {
    if (phase !== 'definition' || selectedIndices.length === 0) {
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
      explanation: `"${defText}" means ${answer}`
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
    // Check if word is in discovered parts
    for (const part of discoveredParts) {
      if (part.wordIndices.includes(wordIndex)) {
        const theme = WORKFLOW_COLORS[part.colorType];
        return `${theme?.bg || 'bg-slate-200'} ${theme?.text || 'text-slate-600'} ${theme?.border || ''} font-bold`;
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
            return `Find the ${currentIndicatorTarget.stepType.replace('_', ' ')} indicator`;
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
    <div className="max-w-3xl mx-auto flex flex-col gap-5 font-sans">

      {/* CLUE DISPLAY */}
      <div className="bg-white p-8 md:p-10 rounded-2xl shadow-sm border border-slate-200 text-center relative">
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
        {phase !== 'complete' && (
          <div className="mt-6 text-base text-slate-600 transition-all duration-300">
            {getPromptText()}
          </div>
        )}
      </div>

      {/* ANSWER GRID - Always visible */}
      <div className="flex justify-center gap-2 md:gap-3 py-2">
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
            className={`
              w-10 h-10 md:w-14 md:h-14 text-center text-xl md:text-2xl font-bold rounded-lg border-2 shadow-sm
              focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all uppercase
              ${phase === 'complete'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-white border-slate-200 text-slate-900 focus:border-indigo-500'}
            `}
          />
        ))}
      </div>

      {/* DEFINITION PHASE - Confirm button & special type options */}
      {/* CHOOSE PHASE - User picks clue type */}
      {phase === 'choose' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-start gap-4">
            <BookOpen className="text-indigo-500 mt-1 shrink-0" size={24} />

            <div className="flex-1 space-y-4">
              {/* Main hint */}
              <p className="text-slate-600 text-sm leading-relaxed">
                {getHintText()}
              </p>

              {/* All clue type options */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleChooseStandard}
                  className="text-left p-4 rounded-lg border-2 border-indigo-200 bg-indigo-50 hover:border-indigo-400 hover:bg-indigo-100 transition-all group"
                >
                  <span className="font-bold text-indigo-700 group-hover:text-indigo-900">Standard</span>
                  <p className="text-xs text-indigo-600 mt-1">Definition + wordplay</p>
                </button>
                <button
                  onClick={() => handleSpecialType('double_definition')}
                  className="text-left p-4 rounded-lg border-2 border-slate-200 hover:border-amber-300 hover:bg-amber-50 transition-all group"
                >
                  <span className="font-bold text-slate-700 group-hover:text-amber-700">Double Definition</span>
                  <p className="text-xs text-slate-500 group-hover:text-amber-600 mt-1">Two definitions, no wordplay</p>
                </button>
                <button
                  onClick={() => handleSpecialType('cryptic_definition')}
                  className="text-left p-4 rounded-lg border-2 border-slate-200 hover:border-purple-300 hover:bg-purple-50 transition-all group"
                >
                  <span className="font-bold text-slate-700 group-hover:text-purple-700">Cryptic Definition</span>
                  <p className="text-xs text-slate-500 group-hover:text-purple-600 mt-1">Entire clue is a cryptic hint</p>
                </button>
                <button
                  onClick={() => handleSpecialType('and_lit')}
                  className="text-left p-4 rounded-lg border-2 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition-all group"
                >
                  <span className="font-bold text-slate-700 group-hover:text-emerald-700">&lit</span>
                  <p className="text-xs text-slate-500 group-hover:text-emerald-600 mt-1">Definition AND wordplay combined</p>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DEFINITION PHASE - User taps words to select definition */}
      {phase === 'definition' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-start gap-4">
            <BookOpen className="text-indigo-500 mt-1 shrink-0" size={24} />

            <div className="flex-1 space-y-4">
              {/* Selected Standard button with instruction */}
              <div className="p-4 rounded-lg border-2 border-green-400 bg-green-50">
                <div className="flex items-center gap-2 mb-2">
                  <div className="bg-green-500 text-white p-1 rounded-full">
                    <Check size={14} />
                  </div>
                  <span className="font-bold text-green-700">Standard</span>
                </div>
                <p className="text-green-700 font-medium">
                  Now tap the definition words in the clue above
                </p>
              </div>

              {/* Main hint */}
              <p className="text-slate-600 text-sm leading-relaxed">
                {getHintText()}
              </p>

              {/* Step 1: Check button - appears when user has selected words but hasn't checked yet */}
              {selectedIndices.length > 0 && !hasCheckedDefinition && (
                <button
                  onClick={handleCheckDefinition}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2"
                >
                  <Check size={18} />
                  Check
                </button>
              )}

              {/* Step 2: Result after checking */}
              {hasCheckedDefinition && isDefinitionCorrect && (
                <div className="space-y-3">
                  <div className="bg-green-100 border border-green-300 rounded-lg p-3 text-green-800 font-medium">
                    ✓ Correct! That's the definition.
                  </div>
                  <button
                    onClick={handleDefinitionConfirm}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2"
                  >
                    Continue <ChevronRight size={18} />
                  </button>
                </div>
              )}

              {hasCheckedDefinition && !isDefinitionCorrect && (
                <div className="bg-red-100 border border-red-300 rounded-lg p-3 text-red-800 font-medium animate-in fade-in">
                  ✗ Not quite — try again
                </div>
              )}

              {/* Back to choose - only when nothing selected and not checked */}
              {selectedIndices.length === 0 && !hasCheckedDefinition && (
                <button
                  onClick={() => setPhase('choose')}
                  className="text-slate-400 hover:text-slate-600 text-xs font-medium"
                >
                  ← Back to clue type selection
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WORDPLAY PHASE - Progressive indicator/fodder/result flow */}
      {phase === 'wordplay' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-start gap-4">
            <Lightbulb className="text-amber-500 mt-1 shrink-0" size={24} />

            <div className="flex-1 space-y-4">
              {/* Wordplay intro box */}
              <div className="p-4 rounded-lg border-2 border-amber-400 bg-amber-50">
                <div className="flex items-center gap-2 mb-2">
                  <div className="bg-amber-500 text-white p-1 rounded-full">
                    <Zap size={14} />
                  </div>
                  <span className="font-bold text-amber-700">Wordplay</span>
                </div>
                <p className="text-amber-700 font-medium">
                  {indicatorSteps.length > 1
                    ? `This clue has ${indicatorSteps.length} wordplay operations. Solve each one to build the answer.`
                    : 'Identify the parts of this wordplay operation'
                  }
                </p>
              </div>

              {/* Progress indicator for multiple steps */}
              {indicatorSteps.length > 1 && (
                <div className="flex items-center gap-2">
                  {indicatorSteps.map((_, i) => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-full transition-colors ${
                        completedSteps.includes(i)
                          ? 'bg-green-500'
                          : i === currentWordplayStep
                          ? 'bg-amber-300 ring-2 ring-amber-400'
                          : 'bg-slate-200'
                      }`}
                    />
                  ))}
                  <span className="text-xs text-slate-500 ml-2">
                    Step {Math.min(currentWordplayStep + 1, indicatorSteps.length)} of {indicatorSteps.length}
                  </span>
                </div>
              )}

              {/* COLLAPSED PANELS - Show completed steps */}
              {completedSteps.map((stepIdx) => {
                const step = indicatorSteps[stepIdx];
                if (!step) return null;
                return (
                  <div key={stepIdx} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="bg-green-500 text-white p-0.5 rounded-full">
                        <Check size={12} />
                      </div>
                      <span className="text-orange-600 font-medium">"{step.indicator}"</span>
                      <span className="text-slate-400">({getStepTypeLabel(step)})</span>
                      <span className="text-slate-400">+</span>
                      <span className="text-blue-600 font-medium">"{step.fodder}"</span>
                      <span className="text-slate-400">→</span>
                      <span className="text-green-700 font-bold">{step.result}</span>
                    </div>
                  </div>
                );
              })}

              {/* EXPANDED PANEL - Current active step */}
              {currentIndicatorTarget && currentWordplayStep < indicatorSteps.length && (
                <div className="bg-white border-2 border-amber-300 rounded-lg p-4 space-y-4">
                  {/* Step header */}
                  <div className="flex items-center justify-between">
                    <p className="text-slate-700 font-bold">
                      <span className="text-amber-600">{getStepTypeLabel(currentIndicatorTarget)}</span>
                    </p>
                    <span className="text-xs text-slate-400 uppercase tracking-wide">
                      {wordplaySubPhase === 'indicator' ? '1. Find Indicator' :
                       wordplaySubPhase === 'fodder' ? '2. Find Fodder' :
                       isStepDependent ? '2. Work Out Result' : '3. Work Out Result'}
                    </span>
                  </div>

                  {/* Hint text */}
                  <p className="text-slate-500 text-sm">
                    {wordplaySubPhase === 'indicator' && (currentIndicatorTarget.hint || `Look for a word that signals a ${currentIndicatorTarget.stepType.replace('_', ' ')} operation`)}
                    {wordplaySubPhase === 'fodder' && `Now find the word(s) that the indicator operates on`}
                    {wordplaySubPhase === 'result' && isStepDependent && `This step combines your previous results. What does "${currentIndicatorTarget.indicator}" do to ${currentIndicatorTarget.fodder}?`}
                    {wordplaySubPhase === 'result' && !isStepDependent && `What does applying "${currentIndicatorTarget.indicator}" to "${currentIndicatorTarget.fodder}" give you?`}
                  </p>

                  {/* === INDICATOR SUB-PHASE === */}
                  {wordplaySubPhase === 'indicator' && (
                    <div className="space-y-3">
                      {/* Check button */}
                      {selectedIndicatorIndices.length > 0 && !hasCheckedIndicator && (
                        <button
                          onClick={handleCheckIndicator}
                          className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2"
                        >
                          <Check size={16} />
                          Check Indicator
                        </button>
                      )}

                      {/* Correct indicator - auto-advances */}
                      {hasCheckedIndicator && isIndicatorCorrect && (
                        <div className="bg-orange-100 border border-orange-300 rounded-lg p-3 text-orange-800 font-medium text-sm">
                          ✓ "{currentIndicatorTarget.indicator}" — correct!
                        </div>
                      )}

                      {/* Wrong indicator */}
                      {hasCheckedIndicator && !isIndicatorCorrect && (
                        <div className="bg-red-100 border border-red-300 rounded-lg p-3 text-red-800 font-medium text-sm animate-in fade-in">
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
                        <div className="bg-orange-500 text-white p-0.5 rounded-full">
                          <Check size={12} />
                        </div>
                        <span className="text-orange-600 font-medium">Indicator: "{currentIndicatorTarget.indicator}"</span>
                      </div>

                      {/* Check button */}
                      {selectedFodderIndices.length > 0 && !hasCheckedFodder && (
                        <button
                          onClick={handleCheckFodder}
                          className="bg-blue-500 hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2"
                        >
                          <Check size={16} />
                          Check Fodder
                        </button>
                      )}

                      {/* Correct fodder - auto-advances */}
                      {hasCheckedFodder && isFodderCorrect && (
                        <div className="bg-blue-100 border border-blue-300 rounded-lg p-3 text-blue-800 font-medium text-sm">
                          ✓ "{currentIndicatorTarget.fodder}" — correct!
                        </div>
                      )}

                      {/* Wrong fodder */}
                      {hasCheckedFodder && !isFodderCorrect && (
                        <div className="bg-red-100 border border-red-300 rounded-lg p-3 text-red-800 font-medium text-sm animate-in fade-in">
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
                            // Dependent step - fodder from previous results (purple/violet styling)
                            <>
                              <div className="bg-violet-500 text-white p-0.5 rounded-full">
                                <Zap size={12} />
                              </div>
                              <span className="text-violet-600 font-medium">{currentIndicatorTarget.fodder}</span>
                              <span className="text-violet-400 text-xs">(from previous)</span>
                            </>
                          ) : (
                            // Independent step - fodder was selected by user
                            <>
                              <div className="bg-blue-500 text-white p-0.5 rounded-full">
                                <Check size={12} />
                              </div>
                              <span className="text-blue-600 font-medium">"{currentIndicatorTarget.fodder}"</span>
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
                              ? 'bg-green-50 border-green-400 text-green-700'
                              : hasCheckedResult && !isResultCorrect
                              ? 'bg-red-50 border-red-400 text-red-700'
                              : 'bg-white border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
                            }`}
                          disabled={hasCheckedResult && isResultCorrect}
                        />
                        {!hasCheckedResult && stepResultInput.length > 0 && (
                          <button
                            onClick={handleCheckResult}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm"
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
                        <div className="bg-red-100 border border-red-300 rounded-lg p-2 text-red-800 font-medium text-sm animate-in fade-in">
                          ✗ Not quite — try again
                        </div>
                      )}

                      {/* Correct result - complete step */}
                      {hasCheckedResult && isResultCorrect && (
                        <div className="space-y-3">
                          <div className="bg-green-100 border border-green-300 rounded-lg p-3 text-green-800 font-medium text-sm">
                            ✓ Correct! {currentIndicatorTarget.explanation || `"${currentIndicatorTarget.fodder}" → ${currentIndicatorTarget.result}`}
                          </div>
                          <button
                            onClick={handleStepComplete}
                            className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2"
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
                <div className="space-y-3">
                  <p className="text-slate-500 text-sm italic">
                    No wordplay indicators to identify for this clue.
                  </p>
                  <button
                    onClick={() => setPhase('solve')}
                    className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2"
                  >
                    Enter the answer <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SOLVE PHASE - Just encouragement */}
      {phase === 'solve' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="text-indigo-500" size={24} />
              <p className="text-slate-600 text-sm">
                Type the answer above — it will auto-check when complete
              </p>
            </div>

            <button
              onClick={handleRevealAnswer}
              className="text-slate-400 hover:text-slate-600 text-xs font-medium px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Reveal Answer
            </button>
          </div>
        </div>
      )}

      {/* DISCOVERED PARTS - Accumulates as user progresses */}
      {discoveredParts.length > 0 && phase !== 'complete' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 animate-in fade-in">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
            Discovered
          </p>
          <div className="space-y-2">
            {discoveredParts.map((part, i) => {
              const theme = WORKFLOW_COLORS[part.colorType];
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${theme?.dot || 'bg-slate-400'}`} />
                  <div>
                    <span className="text-slate-500 text-xs font-bold uppercase mr-2">
                      {part.role}:
                    </span>
                    <span className={`font-medium ${theme?.text || 'text-slate-700'}`}>
                      {part.text}
                    </span>
                    {part.explanation && (
                      <p className="text-slate-500 text-xs mt-1">{part.explanation}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* COMPLETE - Summary and next */}
      {phase === 'complete' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 animate-in zoom-in-95">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-green-600 text-white p-2 rounded-full">
              <Check size={20} />
            </div>
            <h3 className="font-bold text-green-900 text-lg">Solved!</h3>
          </div>

          {/* Summary of what was learned */}
          <div className="space-y-3 mb-6">
            {discoveredParts.map((part, i) => (
              <div key={i} className="bg-white/70 rounded-lg p-3 border border-green-200">
                <span className="text-green-600 text-xs font-bold uppercase">{part.role}</span>
                <p className="text-slate-800 font-medium mt-1">"{part.text}"</p>
                {part.explanation && (
                  <p className="text-slate-600 text-sm mt-1">{part.explanation}</p>
                )}
              </div>
            ))}

            {/* Special clue type note */}
            {identifiedType && identifiedType !== 'standard' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <span className="text-amber-600 text-xs font-bold uppercase">Clue Type</span>
                <p className="text-slate-800 font-medium mt-1">
                  {identifiedType === 'double_definition' && 'Double Definition — two definitions, no wordplay'}
                  {identifiedType === 'triple_definition' && 'Triple Definition — three definitions, no wordplay'}
                  {identifiedType === 'cryptic_definition' && 'Cryptic Definition — the entire clue hints at the answer'}
                  {identifiedType === 'and_lit' && '&lit — the clue is both definition AND wordplay'}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={onNext}
            className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-lg"
          >
            Next Clue <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
};
