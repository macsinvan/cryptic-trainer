/**
 * CrosswordInput - Crossword-style letter boxes for answer entry
 *
 * Renders individual boxes for each letter, styled like a crossword grid.
 * Used for both final answer entry and intermediate step results.
 */

import React, { useRef, useEffect } from 'react';

interface CrosswordInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  correctAnswer?: string;  // If provided, enables letter checking
  letterChecking?: boolean;  // Whether to show green/red feedback
  hypothesisLocked?: boolean;  // When true, show orange "hypothesis entered" styling
}

export function CrosswordInput({
  length,
  value,
  onChange,
  onSubmit,
  disabled = false,
  autoFocus = false,
  correctAnswer,
  letterChecking = false,
  hypothesisLocked = false
}: CrosswordInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Pad or truncate value to match length (use space as pad character so split creates correct array length)
  const letters = value.toUpperCase().padEnd(length, ' ').slice(0, length).split('');

  // Focus first empty box on mount if autoFocus
  useEffect(() => {
    if (autoFocus && !disabled) {
      const firstEmptyIndex = letters.findIndex(l => l === '' || l === ' ');
      const targetIndex = firstEmptyIndex === -1 ? 0 : firstEmptyIndex;
      inputRefs.current[targetIndex]?.focus();
    }
  }, [autoFocus, disabled]);

  const handleChange = (index: number, char: string) => {
    if (disabled) return;

    // Only accept letters
    const letter = char.toUpperCase().replace(/[^A-Z]/g, '');

    // Build new value
    const newLetters = [...letters];
    newLetters[index] = letter.slice(0, 1);
    const newValue = newLetters.join('');

    onChange(newValue);

    // Move to next box if letter entered
    if (letter && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'Backspace') {
      if (letters[index] === '' || letters[index] === ' ') {
        // Move to previous box if current is empty
        if (index > 0) {
          e.preventDefault();
          inputRefs.current[index - 1]?.focus();
        }
      } else {
        // Clear current box
        const newLetters = [...letters];
        newLetters[index] = '';
        onChange(newLetters.join(''));
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === 'Enter' && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (disabled) return;

    e.preventDefault();
    const pasted = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z]/g, '');
    const newValue = pasted.slice(0, length).padEnd(length, '');
    onChange(newValue);

    // Focus last filled box or end
    const lastIndex = Math.min(pasted.length, length) - 1;
    if (lastIndex >= 0) {
      inputRefs.current[lastIndex]?.focus();
    }
  };

  // Get letter checking colors
  const getLetterStyle = (letter: string, index: number) => {
    if (!letter || letter === ' ') {
      return { bg: '', border: '', text: '' };
    }

    // Hypothesis locked (orange) - shown when user solved from definition, reviewing wordplay
    if (hypothesisLocked) {
      return { bg: 'bg-orange-100', border: 'border-orange-500', text: 'text-orange-700' };
    }

    // Letter checking (green/red per letter)
    if (letterChecking && correctAnswer) {
      // Strip non-alpha from correctAnswer (e.g., "LET-DOWN" → "LETDOWN")
      const correctLettersOnly = correctAnswer.replace(/[^A-Za-z]/g, '').toUpperCase();
      const correctLetter = correctLettersOnly[index];
      if (letter === correctLetter) {
        return { bg: 'bg-green-100', border: 'border-green-500', text: 'text-green-700' };
      } else {
        return { bg: 'bg-red-100', border: 'border-red-500', text: 'text-red-700' };
      }
    }

    // Default: letter entered but no checking
    return { bg: 'bg-blue-50', border: '', text: '' };
  };

  return (
    <div className="flex gap-0.5 sm:gap-1 justify-center flex-wrap">
      {letters.map((letter, index) => {
        const style = getLetterStyle(letter, index);
        return (
          <input
            key={index}
            ref={el => inputRefs.current[index] = el}
            type="text"
            value={letter === ' ' ? '' : letter}
            onChange={e => handleChange(index, e.target.value)}
            onKeyDown={e => handleKeyDown(index, e)}
            onPaste={handlePaste}
            disabled={disabled}
            maxLength={1}
            className={`
              w-8 h-10 sm:w-10 sm:h-12 text-center text-lg sm:text-xl font-bold font-mono uppercase
              border-2 rounded
              focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500
              ${disabled
                ? 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed'
                : `bg-white border-gray-400 text-gray-900 ${style.bg} ${style.border} ${style.text}`}
            `}
          />
        );
      })}
    </div>
  );
}

export default CrosswordInput;
