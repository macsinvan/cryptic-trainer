/**
 * InstructionPanel - Server-driven rendering component
 *
 * This component renders EXACTLY what the server's `render` instructions say.
 * It has ZERO phase/operation logic. All decisions are made by the server.
 */

import React from 'react';
import { Check, AlertCircle, Lightbulb } from 'lucide-react';
import { RenderInstructions, ButtonSpec } from '../../types';

interface InstructionPanelProps {
  render: RenderInstructions | undefined;
  selectedIndices: number[];
  textInput: string;
  onTextChange: (value: string) => void;
  onAction: (action: string) => void;
  feedback?: { type: 'success' | 'error'; message: string } | null;
}

export const InstructionPanel: React.FC<InstructionPanelProps> = ({
  render,
  selectedIndices,
  textInput,
  onTextChange,
  onAction,
  feedback,
}) => {
  if (!render) return null;

  const canCheck = () => {
    if (render.inputMode === 'tap_words') {
      return selectedIndices.length > 0;
    }
    if (render.inputMode === 'enter_text') {
      return textInput.trim().length > 0;
    }
    return true; // No input required
  };

  const isButtonEnabled = (button: ButtonSpec) => {
    if (button.requiresSelection && selectedIndices.length === 0) return false;
    if (button.requiresInput && textInput.trim().length === 0) return false;
    return true;
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-yellow-400 rounded-full p-1.5">
              <Lightbulb size={14} className="text-yellow-900" />
            </div>
            <span className="font-semibold text-slate-700">{render.stepLabel}</span>
            {render.stepId && (
              <span className="text-xs text-slate-400 font-mono">[{render.stepId}]</span>
            )}
          </div>
          <span className="text-sm text-slate-500">{render.stepProgress}</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Feedback Banner */}
        {feedback && (
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            feedback.type === 'success'
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}>
            {feedback.type === 'success' ? (
              <Check size={16} className="text-green-600" />
            ) : (
              <AlertCircle size={16} className="text-red-600" />
            )}
            <span className={feedback.type === 'success' ? 'text-green-700' : 'text-red-700'}>
              {feedback.message}
            </span>
          </div>
        )}

        {/* Teaching Moment Panel */}
        {render.panel === 'teaching' && (
          <div className="space-y-4">
            {/* Result display (read-only) */}
            {render.resultDisplay && (
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <Check size={12} className="text-green-500" />
                <span className="text-green-700 font-mono font-bold">{render.resultDisplay}</span>
              </div>
            )}

            {/* Teaching hint */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-amber-800 font-medium mb-1">{render.primaryText}</p>
              {render.secondaryText && (
                <p className="text-amber-700 text-sm">{render.secondaryText}</p>
              )}
            </div>
          </div>
        )}

        {/* Blocked Panel */}
        {render.panel === 'blocked' && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <p className="text-slate-700 font-medium">{render.primaryText}</p>
            {render.secondaryText && (
              <p className="text-slate-500 text-sm mt-1">{render.secondaryText}</p>
            )}
          </div>
        )}

        {/* Complete Panel */}
        {render.panel === 'complete' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <Check size={24} className="text-green-600 mx-auto mb-2" />
            <p className="text-green-700 font-medium">{render.primaryText}</p>
          </div>
        )}

        {/* Active Panel (indicator/fodder/result) */}
        {render.panel === 'active' && !feedback && (
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <p className="text-slate-700 font-medium">{render.primaryText}</p>
            {render.secondaryText && (
              <p className="text-slate-500 text-sm mt-1">{render.secondaryText}</p>
            )}
          </div>
        )}

        {/* Result Input */}
        {render.showResultInput && (
          <input
            type="text"
            value={textInput}
            onChange={(e) => onTextChange(e.target.value.toUpperCase())}
            placeholder="TYPE RESULT..."
            className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg font-mono text-lg
                       focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none
                       placeholder:text-slate-400"
            disabled={!!feedback}
          />
        )}

        {/* Buttons */}
        <div className="flex flex-wrap gap-2">
          {render.buttons.map((button) => (
            <button
              key={button.id}
              onClick={() => onAction(button.action)}
              disabled={!isButtonEnabled(button)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                button.variant === 'primary'
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500'
                  : button.variant === 'secondary'
                  ? 'bg-orange-500 text-white hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400'
                  : 'bg-red-500 text-white hover:bg-red-600 disabled:bg-slate-200 disabled:text-slate-400'
              }`}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default InstructionPanel;
