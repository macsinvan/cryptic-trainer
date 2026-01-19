
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Brain, Sparkles, Check, AlertCircle, Loader2, Send, Upload, ChevronLeft, ChevronRight, FileJson } from 'lucide-react';
import { getClueCount, saveClue, saveParserIssue, ParserIssue, clueExists } from '../services/clueManager';
import { parseFreeformInput, FreeformParseResult } from '../services/freeformParser';
import { SolvedClue } from '../services/aiService';
import { solveCluePython } from '../services/pythonSolverService';
import { ClueEvaluation, PatternInstance, DisplayBlock } from '../types';
import { ClueSolver } from './ClueSolver';
import { loadPuzzleFromJson } from '../services/puzzleConverter';
import { PuzzleMetadata, PuzzleFile } from '../services/puzzleSchemaTypes';

interface ManualEntryModeProps {
  onExit: () => void;
  publicationName: string;
  publicationId: string;
}

export const ManualEntryMode: React.FC<ManualEntryModeProps> = ({ onExit, publicationId }) => {
  const [freeformText, setFreeformText] = useState('');
  const [parseResult, setParseResult] = useState<FreeformParseResult | null>(null);
  const [isTutorMode, setIsTutorMode] = useState(false);
  const [fullAnalysis, setFullAnalysis] = useState<ClueEvaluation | null>(null);
  const [activePatternData, setActivePatternData] = useState<PatternInstance | null>(null);
  const [totalClueCount, setTotalClueCount] = useState(0);
  const [isSolving, setIsSolving] = useState(false);
  const [solvedClue, setSolvedClue] = useState<SolvedClue | null>(null);
  const [solveError, setSolveError] = useState<string | null>(null);

  // Puzzle file import state
  const [puzzleMetadata, setPuzzleMetadata] = useState<PuzzleMetadata | null>(null);
  const [puzzleClues, setPuzzleClues] = useState<PatternInstance[]>([]);
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
  const [isPuzzleMode, setIsPuzzleMode] = useState(false);
  const [rawPuzzleData, setRawPuzzleData] = useState<PuzzleFile | null>(null); // Retained for debugging until save
  const [alreadyImportedCount, setAlreadyImportedCount] = useState(0); // Track how many clues were already imported
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTotalClueCount(getClueCount(publicationId));
  }, [publicationId]);

  // Parse freeform input as user types
  useEffect(() => {
    if (freeformText.trim()) {
      const result = parseFreeformInput(freeformText, publicationId);
      setParseResult(result);
    } else {
      setParseResult(null);
    }
    // Clear solved state when input changes (unless we just added the answer)
    if (!freeformText.includes(solvedClue?.answer || '')) {
      setSolvedClue(null);
      setSolveError(null);
    }
  }, [freeformText, publicationId]);

  const [isAccepted, setIsAccepted] = useState(false);
  const [issueSent, setIssueSent] = useState(false);

  // Send failed parse for offline analysis
  const handleSendForAnalysis = async () => {
    if (!parseResult) return;

    const issue: ParserIssue = {
      id: `issue-${Date.now()}`,
      timestamp: Date.now(),
      fullInput: freeformText,
      clueText: parseResult.clueText || '',
      answer: parseResult.answer || '',
      publication: parseResult.publication || publicationId,
      specialCaseType: parseResult.specialCase?.type || 'unknown',
      specialCaseReason: parseResult.specialCase?.reason || 'Parser could not handle this clue',
      parsing: parseResult.parsing,
      coaching: parseResult.coaching,
      patternVariables: activePatternData?.variables,
    };

    await saveParserIssue(issue);
    setIssueSent(true);
  };

  // Handle puzzle file upload
  const handlePuzzleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const { metadata, clues, rawData } = loadPuzzleFromJson(content);

      setPuzzleMetadata(metadata);
      setPuzzleClues(clues);
      setRawPuzzleData(rawData); // Store raw data for debugging

      // Count already-imported clues and find first non-imported
      let importedCount = 0;
      let firstNewIndex = -1;
      for (let i = 0; i < clues.length; i++) {
        if (clueExists(clues[i].clueText)) {
          importedCount++;
        } else if (firstNewIndex === -1) {
          firstNewIndex = i;
        }
      }
      setAlreadyImportedCount(importedCount);

      // Start at first non-imported clue, or first clue if all imported
      const startIndex = firstNewIndex >= 0 ? firstNewIndex : 0;
      setCurrentPuzzleIndex(startIndex);
      setIsPuzzleMode(true);

      // Load the starting clue into the viewer
      if (clues.length > 0) {
        loadPuzzleClue(clues[startIndex]);
      }
    } catch (err) {
      setSolveError(`Failed to load puzzle file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Load a puzzle clue into the review mode
  const loadPuzzleClue = (clue: PatternInstance) => {
    setActivePatternData(clue);

    // Build evaluation from puzzle data
    const evaluation: ClueEvaluation = {
      id: clue.id,
      clue: clue.clueText,
      answer: clue.answer,
      type: clue.patternId || 'unknown',
      difficulty: 'Medium',
      definition: {
        text: clue.definitionText || '',
        position: (clue.definitionPosition?.toUpperCase() as 'START' | 'END' | 'ENTIRE') || 'START'
      },
      wordplay: [],
      structure: clue.parsingSummary || ''
    };

    setFullAnalysis(evaluation);
    setIsAccepted(false);
    setIsTutorMode(true);
  };

  // Navigate puzzle clues (skipping already-imported)
  const goToPuzzleClue = (direction: 'prev' | 'next') => {
    let newIndex = currentPuzzleIndex;

    if (direction === 'next') {
      // Find next non-imported clue
      for (let i = currentPuzzleIndex + 1; i < puzzleClues.length; i++) {
        if (!clueExists(puzzleClues[i].clueText)) {
          newIndex = i;
          break;
        }
      }
      // If no non-imported found, stay at current or go to last
      if (newIndex === currentPuzzleIndex && currentPuzzleIndex < puzzleClues.length - 1) {
        newIndex = puzzleClues.length - 1; // Allow viewing already-imported if no new ones remain
      }
    } else {
      // Find previous non-imported clue
      for (let i = currentPuzzleIndex - 1; i >= 0; i--) {
        if (!clueExists(puzzleClues[i].clueText)) {
          newIndex = i;
          break;
        }
      }
      // If no non-imported found, stay at current or go to first
      if (newIndex === currentPuzzleIndex && currentPuzzleIndex > 0) {
        newIndex = 0; // Allow viewing already-imported if no new ones before
      }
    }

    if (newIndex !== currentPuzzleIndex) {
      setCurrentPuzzleIndex(newIndex);
      loadPuzzleClue(puzzleClues[newIndex]);
    }
  };

  // Exit puzzle mode
  const exitPuzzleMode = () => {
    setIsPuzzleMode(false);
    setPuzzleMetadata(null);
    setPuzzleClues([]);
    setRawPuzzleData(null); // Clear raw data on exit
    setAlreadyImportedCount(0);
    setCurrentPuzzleIndex(0);
    setIsTutorMode(false);
    setFullAnalysis(null);
    setActivePatternData(null);
  };

  // Preview the battlecard using Python solver
  const previewBattlecard = async () => {
    if (!parseResult?.success || !parseResult.clueText) return;

    setIsSolving(true);
    setSolveError(null);

    try {
      // Extract length from clue if present
      const lengthMatch = parseResult.clueText.match(/\((\d+)\)\s*$/);
      const length = lengthMatch ? parseInt(lengthMatch[1]) : undefined;

      // Call Python solver
      const result = await solveCluePython(
        parseResult.clueText,
        length,
        parseResult.answer
      );

      if (result.patternData) {
        setActivePatternData(result.patternData);

        // Build evaluation from Python solver result
        const evaluation: ClueEvaluation = {
          id: result.patternData.id,
          clue: parseResult.clueText,
          answer: result.patternData.answer || parseResult.answer || '',
          type: result.patternData.patternId || 'unknown',
          difficulty: 'Medium',
          definition: {
            text: result.patternData.definitionText || '',
            position: (result.patternData.definitionPosition?.toUpperCase() as 'START' | 'END' | 'ENTIRE') || 'START'
          },
          wordplay: [],
          structure: result.patternData.parsingSummary || ''
        };

        setFullAnalysis(evaluation);
        setIsAccepted(false);
        setIsTutorMode(true);
      } else {
        setSolveError('Solver returned no results. Check that the Python server is running.');
      }
    } catch (err) {
      setSolveError(`Solver error: ${err instanceof Error ? err.message : 'Unknown error'}. Is the Python server running?`);
    } finally {
      setIsSolving(false);
    }
  };

  // Accept and save to library
  const acceptAndSave = async () => {
    if (!fullAnalysis || !activePatternData) return;

    // Get clue text from fullAnalysis (works for both puzzle mode and freeform mode)
    const clueText = fullAnalysis.clue;
    if (!clueText) return;

    await saveClue(
      parseResult?.publication || publicationId,
      clueText,
      fullAnalysis,
      activePatternData
    );

    setIsAccepted(true);
    setRawPuzzleData(null); // Clear raw data after save
    setTotalClueCount(getClueCount(publicationId));

    // Update imported count if in puzzle mode
    if (isPuzzleMode) {
      setAlreadyImportedCount(prev => prev + 1);
    }
  };

  const detectClueType = (patternId: string, parsing: string): string => {
    // PatternId is already human-readable from parser
    if (patternId && patternId !== 'Unknown') {
      return patternId;
    }

    // Fallback to parsing string detection for legacy data
    const lower = parsing.toLowerCase();
    if (lower.includes('first letter')) return 'Acrostic';
    if (lower.includes('anagram')) return 'Anagram';
    if (lower.includes('hidden')) return 'Hidden Word';
    if (lower.includes('reversal')) return 'Reversal';
    if (lower.includes('container')) return 'Container';
    if (lower.includes('deletion')) return 'Deletion';
    if (lower.includes('charade') || lower.includes('plus')) return 'Charade';
    return 'Mixed';
  };

  // Update a pattern variable
  const updatePatternVar = (key: string, value: string) => {
    if (!activePatternData) return;
    setActivePatternData({
      ...activePatternData,
      variables: {
        ...activePatternData.variables,
        [key]: value
      }
    });
  };

  const renderBattlecardReview = () => {
    if (!fullAnalysis || !activePatternData) return null;

    const answer = fullAnalysis.answer;

    // All logic is computed in the parser - UI just reads pre-computed values
    const wordplaySteps = activePatternData.wordplaySteps || [];
    const hasMissingInfo = !activePatternData.isComplete;
    const parsingSummary = activePatternData.parsingSummary || '';

    // For legacy compatibility, also expose vars for any remaining direct accesses
    const vars = activePatternData.variables;

    return (
      <div className="space-y-6">
        {/* Puzzle Navigation (when in puzzle mode) */}
        {renderPuzzleNavigation()}

        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              if (isPuzzleMode) {
                exitPuzzleMode();
              } else {
                setIsTutorMode(false);
                if (isAccepted) {
                  setFreeformText('');
                  setParseResult(null);
                  setIsAccepted(false);
                }
              }
            }}
            className="flex items-center text-slate-500 hover:text-slate-900 font-bold transition-colors"
          >
            <ArrowLeft size={18} className="mr-2" /> {isPuzzleMode ? 'Exit Puzzle' : isAccepted ? 'Done' : 'Edit'}
          </button>
          {isAccepted && (
            <span className="text-xs font-black text-green-600 uppercase tracking-widest flex items-center gap-2">
              <Check size={14} /> Saved to Library
            </span>
          )}
        </div>

        {/* Main Battlecard */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">

          {/* Clue Display */}
          <div className="p-8 border-b border-slate-100">
            <p className="text-2xl font-serif text-slate-900 leading-relaxed text-center">
              {activePatternData?.clueNumber && (
                <span className="text-indigo-600 font-bold mr-2">{activePatternData.clueNumber}</span>
              )}
              {fullAnalysis.clue}
              {activePatternData?.enumeration && (
                <span className="text-slate-400 font-normal ml-2">({activePatternData.enumeration})</span>
              )}
            </p>
          </div>

          {/* Answer Grid - show letters if answer exists, or blank boxes for target length */}
          <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-center">
            {answer ? (
              (() => {
                const letters = answer.replace(/[^A-Z]/gi, '');
                const len = letters.length;
                // Dynamic sizing: smaller boxes for longer answers
                const boxClass = len > 12 ? 'w-8 h-8 text-sm' : len > 9 ? 'w-10 h-10 text-lg' : 'w-12 h-12 text-xl';
                const gapClass = len > 12 ? 'gap-1' : 'gap-2';
                return (
                  <div className={`flex flex-wrap justify-center ${gapClass}`}>
                    {letters.split('').map((char, i) => (
                      <div
                        key={i}
                        className={`${boxClass} bg-green-100 border-2 border-green-300 rounded-lg flex items-center justify-center font-bold text-green-700`}
                      >
                        {char.toUpperCase()}
                      </div>
                    ))}
                  </div>
                );
              })()
            ) : activePatternData?.analysis?.targetLength ? (
              (() => {
                const len = activePatternData.analysis.targetLength as number;
                const boxClass = len > 12 ? 'w-8 h-8 text-sm' : len > 9 ? 'w-10 h-10 text-lg' : 'w-12 h-12 text-xl';
                const gapClass = len > 12 ? 'gap-1' : 'gap-2';
                return (
                  <div className={`flex flex-wrap justify-center ${gapClass}`}>
                    {Array.from({ length: len }).map((_, i) => (
                      <div
                        key={i}
                        className={`${boxClass} bg-amber-100 border-2 border-amber-300 rounded-lg flex items-center justify-center font-bold text-amber-400`}
                      >
                        ?
                      </div>
                    ))}
                  </div>
                );
              })()
            ) : (
              <div className="text-slate-400 text-sm italic">No answer provided</div>
            )}
          </div>

          {/* Solved-Style Breakdown OR Partial Analysis OR Edit Form */}
          <div className="p-6">
            {/* PARTIAL ANALYSIS: Show solve steps when we have analysis but no answer */}
            {!answer && activePatternData?.solveSteps && activePatternData.solveSteps.length > 0 ? (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-amber-600 text-white p-1.5 rounded">
                    <Brain size={16} />
                  </div>
                  <h3 className="font-bold text-amber-900 uppercase tracking-widest text-sm">Partial Analysis — What We Can See</h3>
                </div>

                {/* Solve Steps */}
                <div className="space-y-2 mb-6">
                  {activePatternData.solveSteps.map((step, i) => (
                    <div key={i} className="flex gap-3 text-sm">
                      <span className="text-amber-500 font-bold min-w-[24px]">{i + 1}.</span>
                      <span className="text-amber-900">{step}</span>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-amber-600 italic mt-4">
                  Add the answer to see full verification
                </p>
              </div>
            ) : !hasMissingInfo && !isAccepted ? (
              // COMPLETE: Data-driven solved battlecard - UI just renders solveExplanation array
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-indigo-600 text-white p-1.5 rounded">
                    <Check size={16} />
                  </div>
                  <h3 className="font-bold text-indigo-900 uppercase tracking-widest text-sm">Solved — What We Learned</h3>
                </div>

                {/* Data-driven rendering - iterate over solveExplanation blocks */}
                <div className="space-y-4">
                  {(activePatternData.solveExplanation || []).map((block: DisplayBlock, i: number) => {
                    // Render different block types with appropriate styling
                    switch (block.type) {
                      case 'setter-hint':
                        return (
                          <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <p className="text-sm text-amber-800" dangerouslySetInnerHTML={{
                              __html: block.content.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-amber-900">$1</strong>')
                            }} />
                            {block.techniques && block.techniques.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-3">
                                {block.techniques.map((tech, ti) => (
                                  <span key={ti} className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded font-medium">
                                    {tech}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );

                      case 'clue-type':
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-indigo-400 text-xs font-bold uppercase tracking-widest">{block.label || 'Clue Type'}:</span>
                            <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-xs font-bold">{block.content}</span>
                          </div>
                        );

                      case 'parsing':
                        return (
                          <div key={i} className="bg-white/70 border border-indigo-200 rounded-lg p-4 font-mono text-sm text-indigo-800">
                            <span className="text-indigo-400 text-xs font-sans font-bold uppercase tracking-widest block mb-1">{block.label || 'Parsing'}</span>
                            {block.content}
                          </div>
                        );

                      case 'explanation':
                        return (
                          <div key={i} className="bg-white/50 p-3 rounded-lg border border-indigo-100/50">
                            {block.label && (
                              <span className="text-indigo-400 text-[10px] font-bold uppercase tracking-widest block mb-1">{block.label}</span>
                            )}
                            <div className="flex gap-3 text-sm text-indigo-900 leading-relaxed">
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0"></div>
                              <div className="flex-1">
                                <p>{block.content}</p>
                              </div>
                            </div>
                          </div>
                        );

                      default:
                        return (
                          <div key={i} className="bg-white/50 p-3 rounded-lg border border-indigo-100/50">
                            <p className="text-sm text-indigo-900">{block.content}</p>
                          </div>
                        );
                    }
                  })}
                </div>
              </div>
            ) : isAccepted ? (
              // SAVED: Show confirmation
              <div className="bg-green-50 border border-green-100 rounded-xl p-6 text-center">
                <div className="bg-green-600 text-white p-3 rounded-full inline-flex mb-4">
                  <Check size={24} />
                </div>
                <h3 className="font-bold text-green-900 text-lg mb-2">Clue Saved to Library</h3>
                <p className="text-green-700 text-sm">This clue is now available in your training queue.</p>
              </div>
            ) : (
              // INCOMPLETE: Show edit form
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2 text-amber-700">
                    <AlertCircle size={16} />
                    <span className="text-sm font-medium">Complete the missing information below</span>
                  </div>
                </div>

                {/* Definition Editor */}
                {(() => {
                  const defMatchType = vars['definition_match_type'];
                  const isValidDef = defMatchType === 'direct' || defMatchType === 'synonym';
                  const isCrypticDef = defMatchType === 'cryptic';

                  return (
                    <div className={`border rounded-lg p-4 ${isValidDef ? 'border-green-200 bg-green-50/30' : 'border-slate-200'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Definition</span>
                        <div className="flex items-center gap-2">
                          {isValidDef && (
                            <span className="text-xs text-green-600 font-medium">Valid match</span>
                          )}
                          {isCrypticDef && (
                            <span className="text-xs text-amber-600 font-medium">Cryptic twist</span>
                          )}
                          {vars['def_text'] && <Check size={14} className={isValidDef ? 'text-green-500' : isCrypticDef ? 'text-amber-500' : 'text-slate-400'} />}
                        </div>
                      </div>
                      <input
                        type="text"
                        value={vars['def_text'] || ''}
                        placeholder="e.g., Being up"
                        className={`w-full px-3 py-2 border-2 rounded-lg text-sm focus:outline-none mb-2 ${isValidDef ? 'border-green-200 focus:border-green-500' : 'border-slate-200 focus:border-indigo-500'}`}
                        onChange={(e) => updatePatternVar('def_text', e.target.value)}
                      />
                      <textarea
                        value={vars['definition_hint'] || ''}
                        placeholder={isCrypticDef ? "Explain the cryptic twist (recommended)" : "Hint: How does this define the answer? (optional)"}
                        className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none resize-none"
                        rows={2}
                        onChange={(e) => updatePatternVar('definition_hint', e.target.value)}
                      />
                    </div>
                  );
                })()}

                {/* Wordplay Editor */}
                {(wordplaySteps.length > 0 ? wordplaySteps : [{ indicator: '', fodder: '', result: '', synonym: '', hint: '', index: 1 }]).map((step, i) => {
                  const isComplete = step.indicator && step.fodder && (step.result || step.synonym);
                  return (
                    <div key={i} className="border border-slate-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                          Wordplay {wordplaySteps.length > 1 ? i + 1 : ''}
                        </span>
                        <div className="flex items-center gap-2">
                          {isComplete && <Check size={14} className="text-green-500" />}
                          {wordplaySteps.length > 1 && (
                            <button
                              onClick={() => {
                                updatePatternVar(`indicator_${step.index}_text`, '');
                                updatePatternVar(`fodder_${step.index}_text`, '');
                                updatePatternVar(`synonym_${step.index}`, '');
                                updatePatternVar(`result_${step.index}`, '');
                                updatePatternVar(`hint_${step.index}`, '');
                              }}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <input
                          type="text"
                          value={step.indicator}
                          placeholder="Indicator (e.g., somewhat)"
                          className="px-3 py-2 border-2 border-orange-200 rounded-lg text-sm focus:border-orange-500 focus:outline-none"
                          onChange={(e) => updatePatternVar(`indicator_${step.index}_text`, e.target.value)}
                        />
                        <input
                          type="text"
                          value={step.fodder}
                          placeholder="Fodder (e.g., scares Ireland)"
                          className="px-3 py-2 border-2 border-blue-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                          onChange={(e) => updatePatternVar(`fodder_${step.index}_text`, e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <input
                          type="text"
                          value={step.synonym || ''}
                          placeholder="Synonym (optional)"
                          className="px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-mono focus:border-indigo-500 focus:outline-none"
                          onChange={(e) => updatePatternVar(`synonym_${step.index}`, e.target.value.toUpperCase())}
                        />
                        <input
                          type="text"
                          value={step.result || ''}
                          placeholder="Result (e.g., RISER)"
                          className="px-3 py-2 border-2 border-green-200 rounded-lg text-sm font-mono focus:border-green-500 focus:outline-none"
                          onChange={(e) => updatePatternVar(`result_${step.index}`, e.target.value.toUpperCase())}
                        />
                      </div>
                      <textarea
                        value={step.hint || ''}
                        placeholder="Hint: How does this wordplay work? (optional)"
                        className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none resize-none"
                        rows={2}
                        onChange={(e) => updatePatternVar(`hint_${step.index}`, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Actions - different for special case vs normal */}
        {(() => {
          const parserFailed = !(vars['result_1'] || vars['result_2']);
          const hasSpecialCase = parseResult?.specialCase;
          const isBlocked = hasSpecialCase && parserFailed;

          if (issueSent) {
            // Issue was sent for analysis - show confirmation
            return (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <div className="bg-green-600 text-white p-2 rounded-full inline-flex mb-3">
                    <Check size={20} />
                  </div>
                  <p className="text-green-800 font-medium">Sent for Analysis</p>
                  <p className="text-green-600 text-sm mt-1">View in Data Manager → Failed Imports</p>
                </div>
                <button
                  onClick={() => {
                    setIsTutorMode(false);
                    setFreeformText('');
                    setParseResult(null);
                    setIssueSent(false);
                  }}
                  className="w-full py-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Sparkles size={18} /> Import Another
                </button>
              </div>
            );
          }

          if (isAccepted) {
            // Already saved - in puzzle mode, go to next clue; otherwise allow importing another
            return (
              <div className="flex gap-3">
                <button
                  onClick={onExit}
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  Back to Dojo
                </button>
                <button
                  onClick={() => {
                    if (isPuzzleMode) {
                      // Go to next clue in puzzle
                      goToPuzzleClue('next');
                    } else {
                      // Reset for freeform import
                      setIsTutorMode(false);
                      setFreeformText('');
                      setParseResult(null);
                      setIsAccepted(false);
                    }
                  }}
                  className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
                >
                  <ChevronRight size={18} /> {isPuzzleMode ? 'Next Clue' : 'Import Another'}
                </button>
              </div>
            );
          }

          if (isBlocked) {
            // BLOCKED: Special case + parser failed - only "Send for Analysis"
            return (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-red-700 mb-2">
                    <AlertCircle size={18} />
                    <span className="font-bold">Parser Cannot Handle This Pattern</span>
                  </div>
                  <p className="text-red-600 text-sm">
                    {parseResult?.specialCase?.reason || 'This clue uses a pattern the parser doesn\'t recognize.'}
                    {' '}Save for offline analysis to improve the parser.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setIsTutorMode(false);
                    }}
                    className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <ArrowLeft size={18} /> Edit
                  </button>
                  <button
                    onClick={handleSendForAnalysis}
                    className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Send size={18} /> Send for Analysis
                  </button>
                </div>
              </div>
            );
          }

          if (hasSpecialCase) {
            // WARNING: Special case + parser succeeded - both options
            return (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-amber-700 mb-2">
                    <AlertCircle size={18} />
                    <span className="font-bold">Unusual Pattern Detected</span>
                  </div>
                  <p className="text-amber-600 text-sm">
                    {parseResult?.specialCase?.reason || 'This clue may use non-standard patterns.'}
                    {' '}You can accept it or flag for review.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleSendForAnalysis}
                    className="flex-1 py-4 bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <Send size={18} /> Flag for Review
                  </button>
                  <button
                    onClick={acceptAndSave}
                    className="flex-1 py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Check size={18} /> Accept Anyway
                  </button>
                </div>
              </div>
            );
          }

          // NORMAL: No special case - standard Accept & Save
          return (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setIsTutorMode(false);
                }}
                className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft size={18} /> Edit
              </button>
              <button
                onClick={acceptAndSave}
                className="flex-1 py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
              >
                <Check size={18} /> Accept & Save
              </button>
            </div>
          );
        })()}
      </div>
    );
  };

  // Render puzzle navigation header when in puzzle mode
  const renderPuzzleNavigation = () => {
    if (!isPuzzleMode || !puzzleMetadata) return null;

    const currentClue = puzzleClues[currentPuzzleIndex];
    const isCurrentClueImported = currentClue ? clueExists(currentClue.clueText) : false;
    const newCluesRemaining = puzzleClues.length - alreadyImportedCount;

    return (
      <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileJson size={18} className="text-indigo-600" />
            <span className="text-sm font-bold text-indigo-900">
              {puzzleMetadata.publisher} #{puzzleMetadata.puzzle_number}
            </span>
            {puzzleMetadata.setter && (
              <span className="text-xs text-indigo-600">by {puzzleMetadata.setter}</span>
            )}
          </div>
          <button
            onClick={exitPuzzleMode}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Exit Puzzle
          </button>
        </div>

        {/* Import progress indicator */}
        {alreadyImportedCount > 0 && (
          <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check size={14} className="text-green-600" />
              <span className="text-xs text-green-700 font-medium">
                {alreadyImportedCount} of {puzzleClues.length} clues already imported
              </span>
            </div>
            <span className="text-xs text-green-600">
              {newCluesRemaining} new
            </span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={() => goToPuzzleClue('prev')}
            disabled={currentPuzzleIndex === 0}
            className="p-2 bg-white rounded-lg border border-indigo-200 hover:bg-indigo-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={18} className="text-indigo-600" />
          </button>

          <div className="flex-1 mx-4 text-center">
            <span className="text-xs text-indigo-600 font-medium">
              Clue {currentPuzzleIndex + 1} of {puzzleClues.length}
              {isCurrentClueImported && (
                <span className="ml-2 text-green-600">(already imported)</span>
              )}
            </span>
            {currentClue && (
              <div className="text-xs text-indigo-500 mt-1">
                {currentClue.patternId} • {currentClue.answer} ({currentClue.answer.length})
              </div>
            )}
          </div>

          <button
            onClick={() => goToPuzzleClue('next')}
            disabled={currentPuzzleIndex === puzzleClues.length - 1}
            className="p-2 bg-white rounded-lg border border-indigo-200 hover:bg-indigo-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={18} className="text-indigo-600" />
          </button>
        </div>

        {/* Word highlights preview with clue number and enumeration */}
        {currentClue?.wordHighlights && currentClue.wordHighlights.length > 0 && (
          <div className="mt-4 p-3 bg-white rounded-lg border border-indigo-100">
            <div className="flex flex-wrap gap-1.5 items-center">
              {/* Clue number */}
              {currentClue.clueNumber && (
                <span className="px-2 py-0.5 text-xs font-bold text-slate-700">
                  {currentClue.clueNumber}
                </span>
              )}
              {currentClue.wordHighlights.map((highlight, i) => {
                const bgColor = {
                  GREEN: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                  ORANGE: 'bg-amber-100 text-amber-800 border-amber-200',
                  BLUE: 'bg-sky-100 text-sky-800 border-sky-200',
                  SLATE: 'bg-slate-100 text-slate-600 border-slate-200',
                }[highlight.colorType];

                return (
                  <span
                    key={i}
                    className={`px-2 py-0.5 rounded text-xs font-medium border ${bgColor}`}
                    title={`${highlight.role}${highlight.stepNumber ? ` (step ${highlight.stepNumber})` : ''}`}
                  >
                    {highlight.word}
                  </span>
                );
              })}
              {/* Enumeration */}
              {currentClue.enumeration && (
                <span className="px-2 py-0.5 text-xs font-bold text-slate-700">
                  ({currentClue.enumeration})
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderParsePreview = () => {
    if (!parseResult) return null;

    // Filter coaching notes - only keep substantive content
    const filteredCoaching = (parseResult.coaching || []).filter(note => {
      const clean = note.trim();
      // Skip empty, very short, or header-like entries
      if (clean.length < 3) return false;
      if (clean.endsWith(':')) return false;
      // Keep notes with arrows or equals (transformations)
      if (clean.includes('→') || clean.includes('=')) return true;
      // Keep notes with actual content (more than 10 chars)
      return clean.length > 10;
    });

    // Build source line
    const sourceParts = [];
    if (parseResult.publication) sourceParts.push(parseResult.publication.toUpperCase());
    if (parseResult.puzzleId) sourceParts.push(`#${parseResult.puzzleId}`);
    if (parseResult.clueNumber) {
      sourceParts.push(`${parseResult.clueNumber}${parseResult.clueDirection === 'down' ? ' Down' : ' Across'}`);
    }
    const sourceLine = sourceParts.join(' · ');

    return (
      <div className={`mt-6 rounded-2xl border-2 overflow-hidden ${parseResult.success ? 'border-green-300' : 'border-amber-300'}`}>
        {/* Header */}
        <div className={`px-5 py-3 flex items-center justify-between ${parseResult.success ? 'bg-green-100' : 'bg-amber-100'}`}>
          <div className="flex items-center gap-2">
            {parseResult.success ? (
              <Check size={16} className="text-green-600" />
            ) : (
              <AlertCircle size={16} className="text-amber-600" />
            )}
            <span className={`text-xs font-black uppercase tracking-widest ${parseResult.success ? 'text-green-700' : 'text-amber-700'}`}>
              {parseResult.success ? 'Ready to Import' : 'Needs More Info'}
            </span>
          </div>
          {sourceLine && (
            <span className="text-xs font-medium text-slate-500">{sourceLine}</span>
          )}
        </div>

        {/* Errors */}
        {parseResult.errors.length > 0 && (
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-200">
            {parseResult.errors.map((err, i) => (
              <p key={i} className="text-sm text-amber-700">• {err}</p>
            ))}
          </div>
        )}

        {/* Partial Analysis Preview - show when clue exists but no answer */}
        {parseResult.clueText && !parseResult.answer && parseResult.patternData?.solveSteps && (
          <div className="px-5 py-4 bg-amber-50 border-b border-amber-200">
            <div className="flex items-center gap-2 mb-3">
              <Brain size={16} className="text-amber-600" />
              <span className="text-xs font-black uppercase tracking-widest text-amber-700">Partial Analysis (No Answer)</span>
            </div>
            <div className="space-y-1.5">
              {parseResult.patternData.solveSteps.map((step, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="text-amber-500 font-bold min-w-[20px]">{i + 1}.</span>
                  <span className="text-amber-800">{step}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-amber-600 mt-3 italic">
              Click "Review Battlecard" to solve with AI
            </p>
          </div>
        )}

        {/* AI Solution Preview */}
        {solvedClue && (
          <div className="px-5 py-4 bg-green-50 border-b border-green-200">
            <div className="flex items-center gap-2 mb-3">
              <Check size={16} className="text-green-600" />
              <span className="text-xs font-black uppercase tracking-widest text-green-700">AI Solution Found</span>
              <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded ${
                solvedClue.confidence === 'high' ? 'bg-green-200 text-green-800' :
                solvedClue.confidence === 'medium' ? 'bg-amber-200 text-amber-800' :
                'bg-red-200 text-red-800'
              }`}>
                {solvedClue.confidence} confidence
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-sm">
                <span className="font-bold text-green-700">Answer:</span>{' '}
                <span className="font-mono font-bold text-green-800">{solvedClue.answer}</span>
              </p>
              <p className="text-sm">
                <span className="font-bold text-green-700">Definition:</span>{' '}
                <span className="text-green-800">"{solvedClue.definition}"</span>
                <span className="text-xs text-green-600 ml-1">({solvedClue.definitionPosition.toLowerCase()})</span>
              </p>
              <p className="text-sm">
                <span className="font-bold text-green-700">Parsing:</span>{' '}
                <span className="text-green-800 font-mono">{solvedClue.parsing}</span>
              </p>
              <details className="mt-2">
                <summary className="text-xs font-medium text-green-700 cursor-pointer hover:text-green-900">
                  Show full explanation
                </summary>
                <p className="text-sm text-green-800 mt-2 pl-3 border-l-2 border-green-300">
                  {solvedClue.explanation}
                </p>
              </details>
            </div>
          </div>
        )}

        {/* Battlecard Content */}
        <div className="bg-white p-5 space-y-4">

          {/* CLUE TEXT - Primary display */}
          {parseResult.clueText && (
            <div>
              <p className="font-serif text-xl text-slate-900 leading-relaxed">{parseResult.clueText}</p>
            </div>
          )}

          {/* ANSWER - Prominent */}
          {parseResult.answer && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Answer</span>
              <span className="bg-indigo-600 text-white px-3 py-1 rounded font-mono font-bold tracking-widest">
                {parseResult.answer}
              </span>
            </div>
          )}

          {/* PARSING - How it works */}
          {parseResult.parsing && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Parsing</span>
              <p className="text-sm text-slate-700 font-mono">{parseResult.parsing}</p>
            </div>
          )}

          {/* COACHING - Filtered, clean */}
          {filteredCoaching.length > 0 && (
            <div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Key Insights</span>
              <ul className="space-y-1">
                {filteredCoaching.slice(0, 5).map((note, i) => (
                  <li key={i} className="text-sm text-slate-600 flex gap-2">
                    <span className="text-indigo-400 shrink-0">•</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans relative">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button onClick={onExit} className="flex items-center text-slate-500 hover:text-slate-900 font-bold transition-colors group">
            <ArrowLeft size={18} className="mr-2" /> Back
          </button>
          <div className="bg-white border-2 border-slate-100 text-slate-600 px-4 py-1 rounded-full text-[9px] font-black flex items-center gap-2 shadow-sm uppercase tracking-widest">
            <span className="text-slate-400">DOJO LIBRARY:</span>
            <span className="text-indigo-600">{totalClueCount}</span>
          </div>
        </div>

        {isTutorMode ? renderBattlecardReview() : (
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in border border-slate-200">
            <div className="bg-[#0c121e] p-10 text-white relative">
              <div className="absolute top-0 right-0 p-12 opacity-[0.05] pointer-events-none">
                <Brain size={120} />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-3">
                  <Sparkles size={20} className="text-indigo-400" />
                  <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.4em]">Clue Import</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-serif font-black tracking-tight">Battlecard Builder</h2>
              </div>
            </div>

            <div className="p-10 space-y-6 bg-slate-50/30">
              {/* Hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handlePuzzleFileUpload}
                accept=".json"
                className="hidden"
              />

              {/* Load from puzzle file button */}
              <div className="flex gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-4 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold rounded-xl transition-colors flex items-center justify-center gap-3 border-2 border-indigo-200"
                >
                  <Upload size={18} />
                  <span className="text-xs uppercase tracking-widest">Load Puzzle File</span>
                </button>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-slate-200"></div>
                <span className="text-xs text-slate-400 font-medium">or paste manually</span>
                <div className="flex-1 h-px bg-slate-200"></div>
              </div>

              <div className="space-y-3">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] block ml-2">
                  Paste Clue with Answer & Coaching Notes
                </label>
                <textarea
                  value={freeformText}
                  onChange={(e) => setFreeformText(e.target.value)}
                  placeholder={`Times Cryptic 29351
3D Principles of theology ordinands now definitely do in monastery (7)

Answer: TONSURE – first letters of Theology Ordinands Now, plus SURE (definitely).

Coaching:
Principles = principal (first) letters.
Theology Ordinand Now → T O N.
Definitely = SURE.
TON + SURE → TONSURE (monk's haircut).`}
                  className="w-full p-6 bg-white border-2 border-slate-200 rounded-2xl focus:border-indigo-600 focus:outline-none min-h-[280px] text-sm font-mono text-slate-900 shadow-sm transition-all leading-relaxed"
                />
              </div>

              {renderParsePreview()}

              <button
                onClick={previewBattlecard}
                disabled={!parseResult?.success || isSolving}
                className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-[0.4em] text-[10px] rounded-xl shadow-xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-4 disabled:opacity-50"
              >
                {isSolving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Review Battlecard'
                )}
              </button>

              {solveError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                  {solveError}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
