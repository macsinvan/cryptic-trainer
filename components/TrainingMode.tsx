
import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Trophy, ChevronRight } from 'lucide-react';
import { PUBLICATIONS } from '../data';
import { ScannedClue, TrainingItem } from '../types';
import { TemplateTrainer } from './TemplateTrainer';
import { getTrainingQueue, trainingClear, getSettings, User, AdminFilters } from '../services/clueManager';

interface TrainingModeProps {
  onExit: () => void;
  publicationId: string;
  customClues?: ScannedClue[];
  initialIndex?: number;
  onProgress?: (idx: number) => void;
  letterChecking?: boolean;
  user?: User | null;
}

export const TrainingMode: React.FC<TrainingModeProps> = ({ onExit, publicationId, customClues, initialIndex = 0, onProgress, letterChecking = true, user }) => {
  const [queue, setQueue] = useState<TrainingItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [forceSolved, setForceSolved] = useState(false);

  const isCustomMode = !!customClues && customClues.length > 0;

  // Initialize Training Queue
  useEffect(() => {
    if (isCustomMode) {
        // Custom clues from scanner - not yet supported in V3
        // Would need to be converted to step-based format first
        setQueue([]);
        return;
    }

    const loadQueue = async () => {
      const items = getTrainingQueue(publicationId);
      // Filter to only clues with steps (V3 template-based format)
      let trainableItems = items.filter(item => item.steps);

      // If admin, apply admin filters; otherwise show only verified clues
      if (user?.role === 'admin') {
        try {
          const settings = await getSettings();
          const filters: AdminFilters = settings.adminFilters || {
            showOnlyUnverified: false,
            showOnlyWithIssues: false
          };

          if (filters.showOnlyUnverified) {
            trainableItems = trainableItems.filter(item => !(item as any).verified);
          }
          if (filters.showOnlyWithIssues) {
            trainableItems = trainableItems.filter(item => !!(item as any).reported_issue);
          }
        } catch {
          // Use unfiltered queue on error
        }
      } else {
        // Regular users only see verified clues
        trainableItems = trainableItems.filter(item => (item as any).verified === true);
      }

      setQueue(trainableItems);
    };

    loadQueue();
  }, [publicationId, isCustomMode, customClues, user?.role]);

  const currentItem = queue[currentIndex];

  const nextClue = () => {
    setForceSolved(false);  // Reset for next clue
    if (currentIndex < queue.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      if (onProgress) onProgress(nextIdx);
    } else {
      onExit();
    }
  };

  const skipClue = () => {
      setStreak(0);
      nextClue();
  };

  const solveClue = () => {
      setForceSolved(true);
  };

  // Handle exit - clear current session so it starts fresh next time
  const handleExit = useCallback(() => {
    if (currentItem) {
      trainingClear(currentItem.id).catch(() => {});
    }
    onExit();
  }, [currentItem, onExit]);

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
          <button onClick={handleExit} className="flex items-center text-slate-500 hover:text-slate-800 transition-colors text-sm">
            <ArrowLeft size={16} className="mr-1" /> Exit
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>{pubName} {typeof currentItem.clue === 'object' && (currentItem as any).metadata?.puzzle_number ? (currentItem as any).metadata.puzzle_number : ''}, clue {typeof currentItem.clue === 'object' ? currentItem.clue.number : ''}</span>
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
              onClick={solveClue}
              className="flex items-center gap-0.5 text-xs font-bold text-green-600 hover:text-green-800"
            >
              Solve
            </button>
            <button
              onClick={skipClue}
              className="flex items-center gap-0.5 text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              Skip <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <TemplateTrainer
            key={currentItem.id}
            clueId={currentItem.id}
            clueText={typeof currentItem.clue === 'string' ? currentItem.clue : currentItem.clue?.text || ''}
            enumeration={typeof currentItem.clue === 'string' ? '' : (currentItem.clue?.enumeration || '')}
            answer={typeof currentItem.clue === 'string' ? currentItem.answer : (currentItem.clue?.answer || currentItem.answer || '')}
            clueNumber={typeof currentItem.clue === 'string' ? undefined : currentItem.clue?.number}
            onComplete={nextClue}
            onBack={onExit}
            letterChecking={letterChecking}
            forceSolved={forceSolved}
            user={user}
            initialVerified={(currentItem as any).verified || false}
            initialReportedIssue={(currentItem as any).reported_issue || null}
          />
        </div>
      </div>
    </div>
  );
};
