
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
  const [showWordplayDetail, setShowWordplayDetail] = useState(false);
  const [currentWordplayStep, setCurrentWordplayStep] = useState(0);

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

  // ---------------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Reset state when clue changes
    setPhase('choose');
    setSelectedIndices([]);
    setDiscoveredParts([]);
    setIsDefinitionCorrect(false);
    setShowWordplayDetail(false);
    setCurrentWordplayStep(0);
    setIdentifiedType(null);

    // Initialize answer grid
    const cleanAnswer = answer.replace(/[^A-Z]/gi, '').toUpperCase();
    setGrid(new Array(cleanAnswer.length).fill(''));
  }, [clueText, answer]);

  // ---------------------------------------------------------------------------
  // INTERACTION HANDLERS
  // ---------------------------------------------------------------------------

  const handleWordTap = (wordIndex: number) => {
    // Only allow tapping in definition phase
    if (phase !== 'definition') return;

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

  const getWordStyle = (wordIndex: number): string => {
    // Check if word is in discovered parts
    for (const part of discoveredParts) {
      if (part.wordIndices.includes(wordIndex)) {
        const theme = WORKFLOW_COLORS[part.colorType];
        return `${theme?.bg || 'bg-slate-200'} ${theme?.text || 'text-slate-600'} ${theme?.border || ''} font-bold`;
      }
    }

    // Check if word is selected
    if (selectedIndices.includes(wordIndex)) {
      if (phase === 'definition' && isDefinitionCorrect) {
        return 'bg-green-200 text-green-800 ring-2 ring-green-400 font-bold';
      }
      return 'bg-slate-800 text-white ring-2 ring-slate-600 font-bold';
    }

    // Interactive state - only in definition phase
    if (phase === 'definition') {
      return 'hover:bg-indigo-50 cursor-pointer';
    }

    return '';
  };

  const getPromptText = (): string => {
    switch (phase) {
      case 'choose':
        return "What type of clue is this?";

      case 'definition':
        if (selectedIndices.length === 0) {
          return "Standard clue — tap the definition words";
        }
        if (isDefinitionCorrect) {
          return "That's it! The definition is highlighted";
        }
        return "Keep selecting to find the full definition...";

      case 'wordplay':
        if (!showWordplayDetail) {
          return "Now let's explore the wordplay";
        }
        return "See how the wordplay builds the answer";

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
        return `The remaining words contain instructions to build "${answer}"`;

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

              {/* Confirm button - only when selection is correct */}
              {isDefinitionCorrect && (
                <button
                  onClick={handleDefinitionConfirm}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2"
                >
                  <Check size={18} />
                  Yes, that's the definition
                </button>
              )}

              {/* Back to choose */}
              {!isDefinitionCorrect && selectedIndices.length === 0 && (
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

      {/* WORDPLAY PHASE - Progressive reveal */}
      {phase === 'wordplay' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-start gap-4">
            <Lightbulb className="text-amber-500 mt-1 shrink-0" size={24} />

            <div className="flex-1 space-y-4">
              <p className="text-slate-600 text-sm leading-relaxed">
                {getHintText()}
              </p>

              {/* Show wordplay button or detail */}
              {!showWordplayDetail ? (
                <button
                  onClick={handleRevealWordplay}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-lg font-bold text-sm transition-colors shadow-sm flex items-center gap-2"
                >
                  <Zap size={18} />
                  Show how it works
                </button>
              ) : (
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 space-y-3">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Wordplay Breakdown</p>

                  {/* Mock wordplay steps - will be replaced with real data */}
                  {MOCK_CLUE.wordplaySteps.map((step, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <span className="bg-amber-100 text-amber-700 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0">
                        {i + 1}
                      </span>
                      <div>
                        <span className="text-orange-600 font-medium">"{step.indicator}"</span>
                        {' signals '}
                        <span className="text-blue-600 font-medium">"{step.fodder}"</span>
                        {' → '}
                        <span className="text-slate-800 font-bold">{step.result}</span>
                        <p className="text-slate-500 text-xs mt-1">{step.explanation}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Continue to solve */}
              {showWordplayDetail && (
                <button
                  onClick={() => setPhase('solve')}
                  className="text-slate-500 hover:text-slate-700 text-sm font-medium flex items-center gap-1"
                >
                  Now enter the answer <ChevronRight size={16} />
                </button>
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
