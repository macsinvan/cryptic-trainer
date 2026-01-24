
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Trophy, ChevronRight } from 'lucide-react';
import { PUBLICATIONS } from '../data';
import { ScannedClue, TrainingItem } from '../types';
import { ClueTrainer } from './ClueTrainer';
import { getTrainingQueue } from '../services/clueManager';
import { STANDARD_CLUE_TYPES } from '../data';

interface TrainingModeProps {
  onExit: () => void;
  publicationId: string;
  customClues?: ScannedClue[];
  initialIndex?: number;
  onProgress?: (idx: number) => void;
}

export const TrainingMode: React.FC<TrainingModeProps> = ({ onExit, publicationId, customClues, initialIndex = 0, onProgress }) => {
  const [queue, setQueue] = useState<TrainingItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  
  const isCustomMode = !!customClues && customClues.length > 0;

  // Initialize Training Queue
  useEffect(() => {
    if (isCustomMode) {
        const placeholders: TrainingItem[] = customClues.map((cc, idx) => ({
            id: `custom-${idx}`,
            clue: cc.text,
            answer: cc.answer || '',
            setterName: 'Setter Consultant',
            clueNumber: cc.number,
            timestamp: Date.now(),
            stats: { attempts: 0, successes: 0, hintsUsed: 0 },
            // V2 patternData required
            patternData: {
                id: `custom-${idx}`,
                clueText: cc.text,
                answer: cc.answer || '',
                clueType: { id: 'standard' as const },
                definition: { text: '', position: 'start' as const },
                wordplays: [],
            },
            // Deprecated fields
            clueType: { ...STANDARD_CLUE_TYPES[0], name: 'Loading...', description: '', mechanism: '', theTell: [], strategy: '', examples: [] } as any,
            example: { clue: cc.text, answer: cc.answer || '', parsing: '', level: 'medium' },
            clueDirection: cc.direction,
            evaluation: {
                id: `custom-${idx}`,
                clue: cc.text,
                type: 'Unknown',
                difficulty: 'Medium',
                reasoning: '',
                answer: cc.answer || '',
                parsing: '',
                definition: { text: '', position: 'START' }, // Ensure strict typing
                hints: [],
                card: [],
                wordplay: [], // Empty initially
                structure: '',
                learnings: []
            }
        }));
        setQueue(placeholders);
        return;
    }

    const items = getTrainingQueue(publicationId);
    // Filter to only clues with V2 definition (required for ClueTrainer)
    const trainableItems = items.filter(item => item.patternData?.definition?.text);
    setQueue(trainableItems);
  }, [publicationId, isCustomMode, customClues]);

  // ClueTrainer requires patternData with definitionText
  // Clues without this data are filtered out of the queue

  const currentItem = queue[currentIndex];

  const handleCorrect = () => {
    setScore(s => s + 10 + (streak * 2));
    setStreak(s => s + 1);
  };

  const handleGiveUp = () => {
    setStreak(0);
  };

  const nextClue = () => {
    if (currentIndex < queue.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      if (onProgress) onProgress(nextIdx);
    } else {
      alert(`Training Complete! Score: ${score}`);
      onExit();
    }
  };

  const skipClue = () => {
      setStreak(0);
      nextClue();
  };

  const pubName = PUBLICATIONS.find(p => p.id === publicationId)?.name || 'Unknown';

  if (!currentItem) {
      return (
        <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-8">
            <div className="text-xl font-serif font-bold text-slate-800">No clues in queue</div>
            <p className="text-slate-500 mt-2">Import some clues to get started</p>
            <button onClick={onExit} className="mt-4 px-6 py-2 bg-slate-800 text-white rounded-lg font-bold">
              Back to Dojo
            </button>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-2 font-sans">
      <div className="max-w-2xl mx-auto">
        {/* Compact header row */}
        <div className="flex items-center justify-between mb-3 px-1">
          <button onClick={onExit} className="flex items-center text-slate-500 hover:text-slate-800 transition-colors text-sm">
            <ArrowLeft size={16} className="mr-1" /> Exit
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>{pubName}</span>
            <span>•</span>
            <span>{currentIndex + 1}/{queue.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-white px-2 py-0.5 rounded-full border border-slate-200 text-xs font-bold text-slate-600">
              <span className="text-orange-500">{streak}🔥</span>
            </div>
            <div className="bg-slate-800 px-2 py-0.5 rounded-full text-white text-xs font-bold flex items-center gap-1">
              <Trophy size={12} className="text-yellow-400" />
              {score}
            </div>
            <button
              onClick={skipClue}
              className="flex items-center gap-0.5 text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              Skip <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <ClueTrainer
            key={currentItem.id}
            patternData={currentItem.patternData}
            onCorrect={handleCorrect}
            onNext={nextClue}
            onGiveUp={handleGiveUp}
            clueNumber={currentItem.patternData?.clueNumber}
            enumeration={currentItem.patternData?.enumeration}
            setterName={currentItem.setterName}
            difficulty={currentItem.evaluation?.difficulty?.toLowerCase() || 'medium'}
          />
        </div>
      </div>
    </div>
  );
};
