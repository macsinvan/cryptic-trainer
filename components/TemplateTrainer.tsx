/**
 * TemplateTrainer - Simplified training component using template-based API
 *
 * This component is 100% server-driven:
 * - Server sends render instructions
 * - UI renders exactly what server says
 * - No local business logic
 */

import React, { useState, useEffect, useCallback } from 'react';
import { trainingStart, trainingInput, trainingContinue, NewTrainingRender } from '../services/clueManager';

// =============================================================================
// TYPES
// =============================================================================

interface TemplateTrainerProps {
  clueId: string;
  clueText: string;
  enumeration: string;
  clueNumber?: string;
  onComplete?: () => void;
  onBack?: () => void;
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
  clueNumber,
  onComplete,
  onBack
}: TemplateTrainerProps) {
  // Server state (source of truth)
  const [render, setRender] = useState<NewTrainingRender | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ephemeral UI state (pre-submission)
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [textInput, setTextInput] = useState('');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean; message: string } | null>(null);

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
  // Handle check/submit
  // ---------------------------------------------------------------------------
  const handleSubmit = useCallback(async (optionIndex?: number) => {
    if (!render) return;

    setFeedback(null);

    // Determine value based on input mode
    let value: number[] | string | number;
    if (render.inputMode === 'tap_words') {
      value = selectedIndices;
    } else if (render.inputMode === 'multiple_choice') {
      value = optionIndex ?? selectedOption ?? 0;
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

          // Check if complete
          if (response.render.complete) {
            onComplete?.();
          }
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
  }, [clueId, render, selectedIndices, textInput, selectedOption, onComplete]);

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

        if (response.render.complete) {
          onComplete?.();
        }
      } else {
        setError(response.error || 'Server error');
      }
    } catch (e) {
      setError(String(e));
    }
  }, [clueId, onComplete]);

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
          onClick={onBack}
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
  const canSubmit = render.inputMode === 'tap_words'
    ? selectedIndices.length > 0
    : render.inputMode === 'multiple_choice'
    ? selectedOption !== null
    : textInput.trim().length > 0;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <span>&larr;</span> Back
        </button>
        {clueNumber && (
          <span className="text-blue-600 font-mono font-bold">{clueNumber}</span>
        )}
      </div>

      {/* Clue Display */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex flex-wrap gap-2 text-2xl font-serif leading-relaxed">
          {words.map((word, index) => {
            const bgColor = getWordColor(index);
            return (
              <span
                key={index}
                onClick={() => handleWordTap(index)}
                className={`
                  px-2 py-1 rounded cursor-pointer transition-all
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
      </div>

      {/* Intro Card (if present) */}
      {render.intro && !isTeaching && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
          <h3 className="font-bold text-blue-800">{render.intro.title}</h3>
          <p className="text-blue-700 mt-1">{render.intro.text}</p>
          {render.intro.example && (
            <p className="text-blue-600 text-sm mt-2 italic">{render.intro.example}</p>
          )}
        </div>
      )}

      {/* Instruction Panel */}
      {render.panel && (
        <div className={`
          rounded-xl p-6
          ${isComplete ? 'bg-green-50 border-2 border-green-500' :
            isTeaching ? 'bg-amber-50 border-2 border-amber-400' :
            'bg-white border shadow-sm'}
        `}>
          <div className="flex items-center gap-3 mb-4">
            {isTeaching && <span className="text-2xl">&#127891;</span>}
            {isComplete && <span className="text-2xl">&#127881;</span>}
            <h3 className={`
              font-bold uppercase tracking-wide
              ${isComplete ? 'text-green-700' :
                isTeaching ? 'text-amber-700' :
                'text-gray-700'}
            `}>
              {render.panel.title}
            </h3>
          </div>

          <p className={`
            text-lg
            ${isComplete ? 'text-green-800' :
              isTeaching ? 'text-amber-800' :
              'text-gray-800'}
          `}>
            {render.panel.instruction}
          </p>

          {/* Feedback message */}
          {feedback && (
            <div className={`
              mt-4 p-3 rounded-lg
              ${feedback.correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
            `}>
              {feedback.message}
            </div>
          )}

          {/* Text input */}
          {render.inputMode === 'text' && !isTeaching && (
            <div className="mt-4">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleSubmit()}
                placeholder="Type your answer..."
                className="w-full px-4 py-3 text-xl font-mono border-2 rounded-lg focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>
          )}

          {/* Multiple choice options */}
          {render.inputMode === 'multiple_choice' && render.options && (
            <div className="mt-4 space-y-3">
              {render.options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => handleSubmit(index)}
                  className={`
                    w-full px-4 py-3 text-left rounded-lg border-2 transition-colors
                    hover:bg-blue-50 hover:border-blue-400
                    ${selectedOption === index
                      ? 'bg-blue-100 border-blue-500'
                      : 'bg-white border-gray-200'}
                  `}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {/* Buttons */}
          <div className="mt-6 flex gap-3">
            {render.button ? (
              // Teaching/Complete phase - show continue button
              <button
                onClick={handleContinue}
                className="flex-1 py-3 px-6 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                {render.button.label}
              </button>
            ) : render.inputMode !== 'none' && render.inputMode !== 'multiple_choice' && (
              // Input phase - show check button (not for multiple_choice which submits on click)
              <button
                onClick={() => handleSubmit()}
                disabled={!canSubmit}
                className={`
                  flex-1 py-3 px-6 font-medium rounded-lg transition-colors
                  ${canSubmit
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
                `}
              >
                Check
              </button>
            )}
          </div>
        </div>
      )}

      {/* Complete State */}
      {isComplete && (
        <div className="text-center">
          <button
            onClick={onBack}
            className="px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700"
          >
            Done - Back to List
          </button>
        </div>
      )}
    </div>
  );
}

export default TemplateTrainer;
