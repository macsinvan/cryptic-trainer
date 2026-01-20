
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Trophy, ChevronRight } from 'lucide-react';
import { PUBLICATIONS } from '../data';
import { ScannedClue, TrainingItem } from '../types';
import { ClueSolver } from './ClueSolver';
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
            clueType: { ...STANDARD_CLUE_TYPES[0], name: 'Loading...', description: '', mechanism: '', theTell: [], strategy: '', examples: [] } as any,
            example: { clue: cc.text, answer: cc.answer || '', parsing: '', level: 'medium' },
            distractors: [],
            clueNumber: cc.number,
            clueDirection: cc.direction,
            timestamp: Date.now(),
            stats: { attempts: 0, successes: 0, hintsUsed: 0 },
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
    setQueue(items);
  }, [publicationId, isCustomMode, customClues]);

  // No JIT AI evaluation - all processing done at import time
  // If patternData is missing, the ClueSolver will work with evaluation data only

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
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button onClick={onExit} className="flex items-center text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeft size={20} className="mr-2" /> Exit Dojo
          </button>
          <div className="flex items-center gap-4">
            <div className="bg-white px-3 py-1 rounded-full border border-slate-200 text-sm font-bold text-slate-600 shadow-sm">
              Streak: <span className="text-orange-500">{streak} 🔥</span>
            </div>
            <div className="bg-slate-800 px-4 py-1 rounded-full text-white font-bold shadow-sm flex items-center gap-2">
              <Trophy size={14} className="text-yellow-400" />
              Score: {score}
            </div>
          </div>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-3xl mx-auto">
             {/* Clue Metadata Header */}
             <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 shadow-sm">
               <div className="flex justify-between items-center">
                 <div className="flex items-center gap-4">
                   <span className="text-xs font-bold text-slate-600">{pubName}</span>
                   {currentItem.setterName && currentItem.setterName !== 'Community' && (
                     <span className="text-xs text-slate-400">by {currentItem.setterName}</span>
                   )}
                   {currentItem.patternData?.clueNumber && (
                     <span className="text-xs font-mono bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                       {currentItem.patternData.clueNumber}
                     </span>
                   )}
                 </div>
                 <button
                     onClick={skipClue}
                     className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider"
                 >
                     Skip <ChevronRight size={14} />
                 </button>
               </div>
               <div className="text-xs text-slate-400 mt-2">
                 Clue {currentIndex + 1} of {queue.length}
               </div>
             </div>

            {/* Debug: log patternData variables */}
            {console.log('[TrainingMode] patternData:', currentItem.patternData)}
            {console.log('[TrainingMode] patternData.variables:', currentItem.patternData?.variables)}
            <ClueSolver
                evaluation={currentItem.evaluation}
                patternData={currentItem.patternData} // Pass the new engine data
                onCorrect={handleCorrect}
                onNext={nextClue}
                setterName={currentItem.setterName}
                level={currentItem.evaluation?.difficulty.toLowerCase() || currentItem.example.level}
            />
        </div>
      </div>
    </div>
  );
};
