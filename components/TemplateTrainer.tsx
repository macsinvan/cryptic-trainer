/**
 * TemplateTrainer - Server-driven training component with fixed 3-section layout
 *
 * Layout:
 * - Section 1: Clue (fixed height)
 * - Section 2: Answer Entry - crossword boxes (fixed height)
 * - Section 3: Action Required + Button (fixed height)
 * - Section 4: Details (scrollable, below fold)
 *
 * User can enter answer at any time. Correct answer skips to complete.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { trainingStart, trainingInput, trainingContinue, trainingClear, NewTrainingRender } from '../services/clueManager';
import { CrosswordInput } from './CrosswordInput';

// =============================================================================
// TYPES
// =============================================================================

interface TemplateTrainerProps {
  clueId: string;
  clueText: string;
  enumeration: string;
  answer: string;
  clueNumber?: string;
  onComplete?: () => void;
  onBack?: () => void;
  letterChecking?: boolean;
}

interface Highlight {
  indices: number[];
  color: string;
  role: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TemplateTrainer({
  clueId,
  clueText,
  enumeration,
  answer,
  clueNumber,
  onComplete,
  onBack,
  letterChecking = true
}: TemplateTrainerProps) {
  // Server state (source of truth)
  const [render, setRender] = useState<NewTrainingRender | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Answer entry state (always visible)
  const [answerInput, setAnswerInput] = useState('');
  const [answerFeedback, setAnswerFeedback] = useState<string | null>(null);

  // Ephemeral UI state for step interactions
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [textInput, setTextInput] = useState('');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean; message: string } | null>(null);

  // Parse enumeration to get letter count (fallback to answer length from server)
  const answerFromServer = render?.answer || answer;
  const letterCount = parseInt(enumeration.replace(/[^0-9]/g, ''), 10) || answerFromServer.replace(/[^A-Za-z]/g, '').length || 10;

  // Split clue into words
  const words = clueText.replace(/[,;:]/g, ' ').split(/\s+/).filter(Boolean);

  // ---------------------------------------------------------------------------
  // Start session on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const startSession = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await trainingStart(clueId);
        if (response.success) {
          setRender(response.render);
        } else {
          setError(response.error || 'Failed to start training');
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    startSession();
  }, [clueId]);

  // ---------------------------------------------------------------------------
  // Handle answer submission (can happen at any time)
  // ---------------------------------------------------------------------------
  const handleAnswerSubmit = useCallback(() => {
    const normalizedInput = answerInput.toUpperCase().replace(/\s/g, '');
    const normalizedAnswer = answer.toUpperCase().replace(/\s/g, '');

    if (normalizedInput === normalizedAnswer) {
      // Correct! Skip to complete
      setAnswerFeedback(null);
      onComplete?.();
    } else if (normalizedInput.length === normalizedAnswer.length) {
      // Wrong answer
      setAnswerFeedback('Not quite - keep working through the steps');
    }
  }, [answerInput, answer, onComplete]);

  // ---------------------------------------------------------------------------
  // Handle word tap
  // ---------------------------------------------------------------------------
  const handleWordTap = useCallback((index: number) => {
    if (render?.inputMode !== 'tap_words') return;

    setFeedback(null);
    setSelectedIndices(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      }
      return [...prev, index];
    });
  }, [render?.inputMode]);

  // ---------------------------------------------------------------------------
  // Handle check/submit for current step
  // ---------------------------------------------------------------------------
  const handleSubmit = useCallback(async (optionIndex?: number) => {
    if (!render) return;

    setFeedback(null);

    // Determine value based on input mode
    // anagram_solve and double_definition use the main answer input
    let value: number[] | string | number;
    if (render.inputMode === 'tap_words') {
      value = selectedIndices;
    } else if (render.inputMode === 'multiple_choice') {
      value = optionIndex ?? selectedOption ?? 0;
    } else if (render.stepType === 'anagram_solve' || render.stepType === 'double_definition') {
      value = answerInput;
    } else {
      value = textInput;
    }

    try {
      const response = await trainingInput(clueId, value);

      if (response.success) {
        if (response.correct) {
          // Correct - update render state
          setRender(response.render);
          setSelectedIndices([]);
          setTextInput('');
          setSelectedOption(null);
          setFeedback(null);

          // Note: Don't auto-advance when complete - show solved view first
        } else {
          // Wrong - show feedback
          setFeedback({
            correct: false,
            message: response.message || 'Try again'
          });
        }
      } else {
        setError(response.error || 'Server error');
      }
    } catch (e) {
      setError(String(e));
    }
  }, [clueId, render, selectedIndices, textInput, selectedOption, answerInput, onComplete]);

  // ---------------------------------------------------------------------------
  // Handle continue button
  // ---------------------------------------------------------------------------
  const handleContinue = useCallback(async () => {
    try {
      const response = await trainingContinue(clueId);
      if (response.success) {
        setRender(response.render);
        setSelectedIndices([]);
        setTextInput('');
        setSelectedOption(null);
        setFeedback(null);

        // Note: Don't auto-advance when complete - show solved view first
      } else {
        setError(response.error || 'Server error');
      }
    } catch (e) {
      setError(String(e));
    }
  }, [clueId]);

  // ---------------------------------------------------------------------------
  // Handle back/exit - clear session so it starts fresh next time
  // ---------------------------------------------------------------------------
  const handleBack = useCallback(async () => {
    // Clear session on server (fire and forget - don't block UI)
    trainingClear(clueId).catch(() => {});
    onBack?.();
  }, [clueId, onBack]);

  // ---------------------------------------------------------------------------
  // Get word highlight color
  // ---------------------------------------------------------------------------
  const getWordColor = (index: number): string | null => {
    // Check confirmed highlights from server
    const highlight = render?.highlights.find(h => h.indices.includes(index));
    if (highlight) {
      switch (highlight.color) {
        case 'GREEN': return '#22c55e';
        case 'ORANGE': return '#f97316';
        case 'BLUE': return '#3b82f6';
        case 'PURPLE': return '#a855f7';
      }
    }

    // Check ephemeral selection
    if (selectedIndices.includes(index)) {
      return '#94a3b8'; // gray for selection
    }

    return null;
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-lg">
        <p className="font-medium">Error</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={handleBack}
          className="mt-4 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!render) return null;

  const isComplete = render.complete;
  const isTeaching = render.phaseId === 'teaching';
  const isFinalAnswerStep = render.stepType === 'anagram_solve' || render.stepType === 'double_definition';
  const canSubmit = render.inputMode === 'tap_words'
    ? selectedIndices.length > 0
    : render.inputMode === 'multiple_choice'
    ? selectedOption !== null
    : isFinalAnswerStep
    ? answerInput.trim().length > 0
    : textInput.trim().length > 0;

  // Solved view - show congratulations with all learnings
  if (isComplete) {
    return (
      <div className="max-w-2xl mx-auto">
        {/* ===== SOLVED HEADER ===== */}
        <div className="bg-green-600 rounded-t-xl p-6 text-center">
          <div className="text-4xl mb-2">🎉</div>
          <h2 className="text-2xl font-bold text-white">Solved!</h2>
          <p className="text-green-100 mt-1 text-lg font-serif">{answer}</p>
        </div>

        {/* ===== CLUE WITH HIGHLIGHTS ===== */}
        <div className="bg-white border-x p-4">
          <div className="flex flex-wrap gap-2 text-lg font-serif leading-relaxed">
            {words.map((word, index) => {
              const bgColor = getWordColor(index);
              return (
                <span
                  key={index}
                  className="px-1.5 py-0.5 rounded"
                  style={bgColor ? { backgroundColor: bgColor, color: 'white' } : undefined}
                >
                  {word}
                </span>
              );
            })}
            <span className="text-gray-400">({enumeration})</span>
          </div>
        </div>

        {/* ===== LEARNINGS SECTION ===== */}
        <div className="bg-slate-50 border-x border-t p-4">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">What You Learned</h3>
          <div className="space-y-3">
            {render.learnings && render.learnings.length > 0 ? (
              render.learnings.map((learning, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-amber-500">🎓</span>
                    <div>
                      <h4 className="font-bold text-slate-700 text-sm">{learning.title}</h4>
                      <p className="text-slate-600 text-sm mt-1">{learning.text}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-500 text-sm italic">Great work completing this clue!</p>
            )}
          </div>
        </div>

        {/* ===== NEXT BUTTON ===== */}
        <div className="bg-green-50 border border-green-300 rounded-b-xl p-4 flex items-center justify-between">
          <p className="text-green-700 font-medium">Ready for the next clue?</p>
          <button
            onClick={onComplete}
            className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors"
          >
            Next Clue →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* ===== SECTION 1: CLUE (fixed height) ===== */}
      <div className="bg-white rounded-t-xl border border-b-0 p-4 min-h-[100px]">
        <div className="flex flex-wrap gap-2 text-xl font-serif leading-relaxed">
          {words.map((word, index) => {
            const bgColor = getWordColor(index);
            return (
              <span
                key={index}
                onClick={() => handleWordTap(index)}
                className={`
                  px-1.5 py-0.5 rounded transition-all
                  ${bgColor ? 'text-white' : 'hover:bg-gray-100'}
                  ${render.inputMode === 'tap_words' ? 'cursor-pointer' : 'cursor-default'}
                `}
                style={bgColor ? { backgroundColor: bgColor } : undefined}
              >
                {word}
              </span>
            );
          })}
          <span className="text-gray-400">({enumeration})</span>
        </div>
        {clueNumber && (
          <div className="mt-2 text-sm text-blue-600 font-mono font-bold">{clueNumber}</div>
        )}
      </div>

      {/* ===== SECTION 2: INPUT AREA (fixed height) ===== */}
      {/* Shows either: transitory text input (for intermediate steps) OR answer entry */}
      {/* anagram_solve uses the main answer input since it's the final answer */}
      <div className="bg-slate-50 border border-b-0 p-4 min-h-[80px] flex flex-col justify-center">
        {render.inputMode === 'text' && !isTeaching && render.stepType !== 'anagram_solve' && render.stepType !== 'double_definition' ? (
          /* Transitory input for intermediate steps (e.g., typing "EB" for letter extraction) */
          <>
            <CrosswordInput
              length={typeof render.expected === 'string' ? render.expected.length : 5}
              value={textInput}
              onChange={setTextInput}
              onSubmit={() => canSubmit && handleSubmit()}
              autoFocus
            />
            <p className="text-center text-xs text-slate-500 mt-2">
              {render.actionPrompt}
            </p>
          </>
        ) : (
          /* Default: Answer entry (always available for "solve anytime") */
          <>
            <CrosswordInput
              length={letterCount}
              value={answerInput}
              onChange={setAnswerInput}
              onSubmit={handleAnswerSubmit}
              disabled={isComplete}
              correctAnswer={answerFromServer}
              letterChecking={letterChecking}
            />
            {answerFeedback && (
              <p className="text-center text-sm text-amber-600 mt-2">{answerFeedback}</p>
            )}
          </>
        )}
      </div>

      {/* ===== SECTION 3: ACTION REQUIRED + BUTTON (fixed height) ===== */}
      <div className="border rounded-b-xl p-4 min-h-[70px] flex items-center justify-between gap-4 bg-white">
        <p className="flex-1 font-medium text-gray-700">
          {/* For text input mode, show generic prompt since specific prompt is in Section 2 */}
          {render.inputMode === 'text' && !isTeaching ? 'Enter letters above' : render.actionPrompt}
        </p>

        {/* Button */}
        {render.button ? (
          <button
            onClick={handleContinue}
            className="px-5 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            {render.button.label}
          </button>
        ) : render.inputMode !== 'none' && render.inputMode !== 'multiple_choice' ? (
          <button
            onClick={() => handleSubmit()}
            disabled={!canSubmit}
            className={`
              px-5 py-2 font-medium rounded-lg transition-colors whitespace-nowrap
              ${canSubmit
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
            `}
          >
            Check
          </button>
        ) : null}
      </div>

      {/* ===== SECTION 4: DETAILS (below fold, scrollable) ===== */}
      <div className="mt-4 space-y-4">
        {/* Feedback message */}
        {feedback && (
          <div className={`
            p-3 rounded-lg
            ${feedback.correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
          `}>
            {feedback.message}
          </div>
        )}

        {/* Multiple choice options */}
        {render.inputMode === 'multiple_choice' && render.options && (
          <div className="space-y-2">
            {render.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleSubmit(index)}
                className={`
                  w-full px-4 py-3 text-left rounded-lg border-2 transition-all flex items-center gap-3
                  ${selectedOption === index
                    ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                    : 'bg-white border-gray-200 hover:bg-blue-50 hover:border-blue-400'}
                `}
              >
                <span className={`
                  w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                  ${selectedOption === index
                    ? 'bg-white border-white'
                    : 'border-gray-300'}
                `}>
                  {selectedOption === index && (
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                  )}
                </span>
                <span className="font-medium">{option.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Intro Card - teaching content for new users (only when not in teaching phase) */}
        {render.intro && !isTeaching && (
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
            <h3 className="font-bold text-blue-800">{render.intro.title}</h3>
            <p className="text-blue-700 mt-1">{render.intro.text}</p>
            {render.intro.example && (
              <p className="text-blue-600 text-sm mt-2 italic">{render.intro.example}</p>
            )}
          </div>
        )}

        {/* Teaching Panel - only show when in teaching phase (after correct answer) */}
        {isTeaching && render.panel && (
          <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">🎓</span>
              <h3 className="font-bold uppercase tracking-wide text-sm text-amber-700">
                {render.panel.title}
              </h3>
            </div>
            <p className="text-amber-800">{render.panel.instruction}</p>
          </div>
        )}

        {/* Previous learnings - collapsed (title only) */}
        {render.learnings && render.learnings.length > 0 && (
          <div className="space-y-2">
            {render.learnings.map((learning, idx) => (
              <div key={idx} className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-amber-500 text-sm">🎓</span>
                  <span className="font-bold text-slate-600 text-sm">{learning.title}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TemplateTrainer;
