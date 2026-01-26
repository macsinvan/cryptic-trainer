
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Brain, Sparkles, Check, AlertCircle, Loader2, Send, Upload, ChevronLeft, ChevronRight, FileJson } from 'lucide-react';
import { getClueCount, saveClue, saveParserIssue, ParserIssue, clueExists } from '../services/clueManager';
import { parseFreeformInput, FreeformParseResult } from '../services/freeformParser';
import { SolvedClue } from '../services/aiService';
import { solveCluePython } from '../services/pythonSolverService';
import { ClueEvaluation, PatternInstance, DisplayBlock } from '../types';
import { ClueSolver } from './ClueSolver';
import { loadPuzzleFromJson, BlogPuzzleFile } from '../services/puzzleConverter';
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
  const [rawPuzzleData, setRawPuzzleData] = useState<PuzzleFile | BlogPuzzleFile | null>(null); // Retained for debugging until save
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
  const [showSaveFlash, setShowSaveFlash] = useState(false);
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

  // Import result state for showing summary
  const [importResult, setImportResult] = useState<{
    saved: number;
    skipped: number;
    failed: number;
    errors: Array<{ clueId: string; clueNumber: string; clueText: string; errors: string[] }>;
    importLogId?: string;
  } | null>(null);

  // Import logs state for viewing past logs
  const [showImportLogs, setShowImportLogs] = useState(false);
  const [importLogs, setImportLogs] = useState<Array<{
    id: string;
    timestamp: number;
    puzzleFile: string;
    puzzleNumber: string;
    summary: { saved: number; skipped: number; failed: number };
    errors: Array<{ clueId: string; clueNumber: string; clueText: string; errors: string[] }>;
  }>>([]);

  // Fetch import logs from server
  const fetchImportLogs = async () => {
    try {
      const response = await fetch('/api/import-logs');
      if (response.ok) {
        const data = await response.json();
        setImportLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch import logs:', err);
    }
  };

  // Copy import log to clipboard
  const copyLogToClipboard = (log: typeof importLogs[0]) => {
    const text = [
      `Import Log: ${log.puzzleFile} (#${log.puzzleNumber})`,
      `Date: ${new Date(log.timestamp * 1000).toLocaleString()}`,
      `Summary: ${log.summary.saved} saved, ${log.summary.skipped} skipped, ${log.summary.failed} failed`,
      '',
      'Errors:',
      ...log.errors.map(e => `  ${e.clueNumber}: ${e.clueText}\n    - ${e.errors.join('\n    - ')}`)
    ].join('\n');
    navigator.clipboard.writeText(text);
  };

  // Check if a clue has valid V2 metadata for training
  const isClueValid = (clue: PatternInstance): { valid: boolean; issue?: string } => {
    if (!clue.definition?.text) {
      return { valid: false, issue: 'Missing definition text' };
    }
    if (!clue.wordplays || clue.wordplays.length === 0) {
      return { valid: false, issue: 'Missing wordplay data' };
    }
    if (!clue.wordplays.some(wp => wp.explanation || wp.fodder)) {
      return { valid: false, issue: 'Wordplay has no explanation' };
    }
    return { valid: true };
  };

  // Handle puzzle file upload - Send raw JSON to server for import
  // All import logic lives on the server - UI is a thin client
  const handlePuzzleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Clear any previous state
    setSolveError(null);
    setImportResult(null);

    let puzzleData: any = null;
    let fileContent = '';

    try {
      // Read file content
      fileContent = await file.text();
      puzzleData = JSON.parse(fileContent);
    } catch (err) {
      // JSON parse error - show error with file details
      setSolveError(`Failed to parse ${file.name}: ${err instanceof Error ? err.message : 'Invalid JSON'}`);
      // Show import result with parse error
      setImportResult({
        saved: 0,
        skipped: 0,
        failed: 1,
        errors: [{
          clueId: 'parse-error',
          clueNumber: '-',
          clueText: file.name,
          errors: [`JSON parse error: ${err instanceof Error ? err.message : 'Invalid JSON'}`]
        }]
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    try {
      // Send to server for import - server handles all conversion/validation
      const response = await fetch('/api/clues/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          puzzle: puzzleData,
          publicationId: publicationId
        })
      });

      // Handle non-JSON responses (server error)
      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        // Server returned non-JSON (likely error page)
        setSolveError(`Server error: ${response.status} ${response.statusText}`);
        setImportResult({
          saved: 0,
          skipped: 0,
          failed: 1,
          errors: [{
            clueId: 'server-error',
            clueNumber: '-',
            clueText: file.name,
            errors: [`Server returned ${response.status}: ${responseText.slice(0, 200)}`]
          }]
        });
        return;
      }

      if (!result.success) {
        setSolveError(result.error || 'Import failed');
        // Still show the import result with the error
        setImportResult({
          saved: 0,
          skipped: 0,
          failed: 1,
          errors: [{
            clueId: 'import-error',
            clueNumber: '-',
            clueText: puzzleData?.metadata?.file || file.name,
            errors: [result.error || 'Unknown import error']
          }]
        });
        return;
      }

      // Update UI with server response
      setTotalClueCount(getClueCount(publicationId));

      // Show import result from server (use correct field names from server)
      setImportResult({
        saved: result.saved || 0,
        skipped: result.skipped || 0,
        failed: result.failed || 0,
        errors: result.errors || [],
        importLogId: result.importLogId
      });

      // Store metadata for display
      if (puzzleData.metadata) {
        setPuzzleMetadata({
          publisher: puzzleData.metadata.publisher,
          puzzle_number: puzzleData.metadata.puzzle_number,
          setter: puzzleData.metadata.setter
        });
      }

    } catch (err) {
      // Network or other error
      setSolveError(`Failed to import: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setImportResult({
        saved: 0,
        skipped: 0,
        failed: 1,
        errors: [{
          clueId: 'network-error',
          clueNumber: '-',
          clueText: file.name,
          errors: [`Network error: ${err instanceof Error ? err.message : 'Unknown error'}`]
        }]
      });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Load a puzzle clue into the review mode - STEP 2: Called when user clicks "Review"
  const loadPuzzleClue = (clue: PatternInstance) => {
    // Clear any previous state
    setSolveError(null);

    try {
      setActivePatternData(clue);

      // Build evaluation from puzzle data (V2 schema with V1 fallbacks)
      const defText = clue.definition?.text || clue.definitionText || '';
      const defPosition = clue.definition?.position || clue.definitionPosition || 'start';

      const evaluation: ClueEvaluation = {
        id: clue.id,
        clue: clue.clueText,
        answer: clue.answer,
        type: clue.clueType?.id || clue.patternId || 'unknown',
        difficulty: 'Medium',
        definition: {
          text: defText,
          position: defPosition.toUpperCase() as 'START' | 'END' | 'ENTIRE'
        },
        wordplay: [],
        structure: clue.parsingSummary || ''
      };

      setFullAnalysis(evaluation);
      setIsAccepted(false);
      setShowSaveFlash(false);
      setIsTutorMode(true);
    } catch (err) {
      setSolveError(`Failed to load clue: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
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

  // Exit puzzle/import mode
  const exitPuzzleMode = () => {
    setIsPuzzleMode(false);
    setPuzzleMetadata(null);
    setPuzzleClues([]);
    setRawPuzzleData(null);
    setAlreadyImportedCount(0);
    setCurrentPuzzleIndex(0);
    setIsTutorMode(false);
    setFullAnalysis(null);
    setActivePatternData(null);
    setImportResult(null);
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

        // Build evaluation from Python solver result (V2 schema with V1 fallbacks)
        const defText = result.patternData.definition?.text || result.patternData.definitionText || '';
        const defPosition = result.patternData.definition?.position || result.patternData.definitionPosition || 'start';

        const evaluation: ClueEvaluation = {
          id: result.patternData.id,
          clue: parseResult.clueText,
          answer: result.patternData.answer || parseResult.answer || '',
          type: result.patternData.clueType?.id || result.patternData.patternId || 'unknown',
          difficulty: 'Medium',
          definition: {
            text: defText,
            position: defPosition.toUpperCase() as 'START' | 'END' | 'ENTIRE'
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
    setShowSaveFlash(true);
    setRawPuzzleData(null); // Clear raw data after save
    setTotalClueCount(getClueCount(publicationId));

    // Update imported count if in puzzle mode
    if (isPuzzleMode) {
      setAlreadyImportedCount(prev => prev + 1);

      // Auto-advance to next clue after brief flash
      setTimeout(() => {
        setShowSaveFlash(false);
        goToPuzzleClue('next');
      }, 1500);
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
    const parsingSummary = activePatternData.parsingSummary || '';

    // V2 completeness check: has definition AND has wordplays with explanations
    const hasV2Definition = activePatternData.definition?.text && activePatternData.definition.text.length > 0;
    const hasV2Wordplays = activePatternData.wordplays && activePatternData.wordplays.length > 0 &&
                          activePatternData.wordplays.some(wp => wp.explanation || wp.fodder);
    const isV2Complete = hasV2Definition && hasV2Wordplays;

    // For V1 data, use isComplete flag. For V2 data (puzzle imports), use V2 check
    const hasMissingInfo = isPuzzleMode ? !isV2Complete : !activePatternData.isComplete;

    // For legacy compatibility, also expose vars for any remaining direct accesses
    const vars = activePatternData.variables || {};

    return (
      <div className="space-y-6">
        {/* Header - only show in freeform mode */}
        {!isPuzzleMode && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setIsTutorMode(false);
                if (isAccepted) {
                  setFreeformText('');
                  setParseResult(null);
                  setIsAccepted(false);
                }
              }}
              className="flex items-center text-slate-500 hover:text-slate-900 font-bold transition-colors"
            >
              <ArrowLeft size={18} className="mr-2" /> {isAccepted ? 'Done' : 'Edit'}
            </button>
            {isAccepted && (
              <span className="text-xs font-black text-green-600 uppercase tracking-widest flex items-center gap-2">
                <Check size={14} /> Saved to Library
              </span>
            )}
          </div>
        )}

        {/* Main Battlecard */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">

          {/* Puzzle Header (when in puzzle mode) */}
          {isPuzzleMode && puzzleMetadata && (
            <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
              <button
                onClick={exitPuzzleMode}
                className="flex items-center text-indigo-600 hover:text-indigo-900 font-medium text-xs transition-colors"
              >
                <ArrowLeft size={14} className="mr-1" /> Exit Puzzle
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => goToPuzzleClue('prev')}
                  disabled={currentPuzzleIndex === 0}
                  className="p-1.5 bg-white rounded border border-indigo-200 hover:bg-indigo-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} className="text-indigo-600" />
                </button>
                <div className="text-center">
                  <span className="text-xs font-bold text-indigo-900">
                    {puzzleMetadata.publisher} #{puzzleMetadata.puzzle_number}
                  </span>
                  {puzzleMetadata.setter && puzzleMetadata.setter !== 'Unknown' && (
                    <span className="text-xs text-indigo-600 ml-2">by {puzzleMetadata.setter}</span>
                  )}
                </div>
                <button
                  onClick={() => goToPuzzleClue('next')}
                  disabled={currentPuzzleIndex === puzzleClues.length - 1}
                  className="p-1.5 bg-white rounded border border-indigo-200 hover:bg-indigo-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} className="text-indigo-600" />
                </button>
              </div>
              <span className="text-xs text-indigo-600 font-medium">
                Clue {currentPuzzleIndex + 1} of {puzzleClues.length}
              </span>
            </div>
          )}

          {/* Clue Display */}
          <div className="px-6 py-4 border-b border-slate-100">
            <p className="text-lg font-serif text-slate-900 text-center whitespace-nowrap">
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
              // COMPLETE: Show V2 data (puzzle imports) or V1 solveExplanation
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-indigo-600 text-white p-1.5 rounded">
                    <Check size={16} />
                  </div>
                  <h3 className="font-bold text-indigo-900 uppercase tracking-widest text-sm">
                    {isPuzzleMode ? 'Review Clue Data' : 'Solved — What We Learned'}
                  </h3>
                </div>

                {/* V2 DATA: Render definition and wordplays from puzzle file */}
                {isV2Complete ? (
                  <div className="space-y-4">
                    {/* Definition */}
                    <div className="bg-white/70 border border-indigo-200 rounded-lg p-4">
                      <span className="text-indigo-400 text-xs font-bold uppercase tracking-widest block mb-2">Definition</span>
                      <p className="text-indigo-900 font-medium">"{activePatternData.definition?.text}"</p>
                      <span className="text-xs text-indigo-500 mt-1 block">
                        Position: {activePatternData.definition?.position}
                      </span>
                    </div>

                    {/* Wordplays */}
                    <div className="bg-white/70 border border-indigo-200 rounded-lg p-4">
                      <span className="text-indigo-400 text-xs font-bold uppercase tracking-widest block mb-3">Wordplay</span>
                      <div className="space-y-3">
                        {activePatternData.wordplays?.map((wp, i) => {
                          const fodderText = typeof wp.fodder === 'string' ? wp.fodder : `[result from step ${wp.fodder.fromWordplay.join(', ')}]`;
                          return (
                            <div key={wp.id} className="border-l-2 border-indigo-300 pl-3">
                              {activePatternData.wordplays && activePatternData.wordplays.length > 1 && (
                                <span className="text-xs font-bold text-indigo-500 block mb-1">Step {i + 1}</span>
                              )}
                              <p className="text-sm text-indigo-800">{wp.explanation || fodderText}</p>
                              {wp.indicator && (
                                <span className="text-xs text-orange-600 mt-1 block">
                                  Indicator: "{wp.indicator}"
                                </span>
                              )}
                              {wp.operation && wp.operation !== 'synonym' && (
                                <span className="text-xs bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded mt-1 inline-block">
                                  {wp.operation}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Clue Type */}
                    {activePatternData.clueType?.id && activePatternData.clueType.id !== 'standard' && (
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-400 text-xs font-bold uppercase tracking-widest">Clue Type:</span>
                        <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-xs font-bold">
                          {activePatternData.clueType.id.replace('_', ' ')}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  /* V1 DATA: Render solveExplanation blocks */
                  <div className="space-y-4">
                    {(activePatternData.solveExplanation || []).map((block: DisplayBlock, i: number) => {
                      switch (block.type) {
                        case 'setter-hint':
                          return (
                            <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                              {block.techniques && block.techniques.length > 0 && (
                                <div className="flex flex-wrap gap-2">
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
                                <span className="text-indigo-900 text-sm font-bold uppercase tracking-wide block mb-1">{block.label}</span>
                              )}
                              <div className="flex gap-3 text-sm text-indigo-700 leading-relaxed">
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
                )}
              </div>
            ) : isAccepted && showSaveFlash ? (
              // SAVED FLASH: Brief confirmation before auto-advance
              <div className="bg-green-50 border border-green-100 rounded-xl p-6 text-center animate-in fade-in">
                <div className="bg-green-600 text-white p-3 rounded-full inline-flex mb-4">
                  <Check size={24} />
                </div>
                <h3 className="font-bold text-green-900 text-lg">Saved to Library</h3>
              </div>
            ) : isAccepted && !isPuzzleMode ? (
              // SAVED (freeform mode only): Show confirmation with actions
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
            // In puzzle mode with flash showing, don't render buttons (auto-advancing)
            if (isPuzzleMode && showSaveFlash) {
              return null;
            }

            // Already saved - in freeform mode, allow importing another
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
                    // Reset for freeform import
                    setIsTutorMode(false);
                    setFreeformText('');
                    setParseResult(null);
                    setIsAccepted(false);
                  }}
                  className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
                >
                  <ChevronRight size={18} /> Import Another
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

        {isTutorMode ? renderBattlecardReview() : importResult ? (
          /* IMPORT RESULT VIEW - After auto-import completes */
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in border border-slate-200">
            <div className={`p-6 text-white ${importResult.errors.length > 0 ? 'bg-amber-600' : 'bg-green-600'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {importResult.errors.length > 0 ? (
                      <AlertCircle size={18} className="text-amber-200" />
                    ) : (
                      <Check size={18} className="text-green-200" />
                    )}
                    <span className="text-xs font-bold text-white/80 uppercase tracking-widest">
                      Import {importResult.errors.length > 0 ? 'Partial' : 'Complete'}
                    </span>
                  </div>
                  <h2 className="text-xl font-serif font-bold">
                    {puzzleMetadata ? `${puzzleMetadata.publisher} #${puzzleMetadata.puzzle_number}` : 'Puzzle Import'}
                  </h2>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // Copy current errors to clipboard
                      const text = importResult.errors.map(e =>
                        `${e.clueNumber}: ${e.clueText}\n  - ${e.errors.join('\n  - ')}`
                      ).join('\n\n');
                      navigator.clipboard.writeText(text);
                    }}
                    className="px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors"
                    title="Copy errors to clipboard"
                  >
                    Copy Log
                  </button>
                  <button
                    onClick={() => {
                      setImportResult(null);
                      setPuzzleMetadata(null);
                      setIsPuzzleMode(false);
                    }}
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6">
              {/* Import summary stats */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-700">{importResult.saved}</div>
                  <div className="text-xs text-green-600 font-medium uppercase tracking-wide">Saved</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-slate-500">{importResult.skipped}</div>
                  <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">Already Imported</div>
                </div>
                <div className={`rounded-lg p-4 text-center ${importResult.failed > 0 ? 'bg-red-50 border border-red-200' : 'bg-slate-50 border border-slate-200'}`}>
                  <div className={`text-2xl font-bold ${importResult.failed > 0 ? 'text-red-700' : 'text-slate-400'}`}>{importResult.failed}</div>
                  <div className={`text-xs font-medium uppercase tracking-wide ${importResult.failed > 0 ? 'text-red-600' : 'text-slate-400'}`}>Failed</div>
                </div>
              </div>

              {/* Errors list - actionable for upstream solver */}
              {importResult.errors.length > 0 && (
                <div className="border border-red-200 rounded-lg overflow-hidden">
                  <div className="bg-red-50 px-4 py-3 border-b border-red-200 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-red-800">Import Errors</h3>
                      <p className="text-xs text-red-600 mt-1">These clues need fixes before importing</p>
                    </div>
                    <button
                      onClick={() => {
                        fetchImportLogs();
                        setShowImportLogs(true);
                      }}
                      className="text-xs text-red-700 hover:text-red-900 font-medium underline"
                    >
                      View All Logs
                    </button>
                  </div>
                  <div className="divide-y divide-red-100 max-h-64 overflow-y-auto">
                    {importResult.errors.map((error, idx) => (
                      <div key={idx} className="px-4 py-3 bg-white">
                        <div className="flex items-start gap-3">
                          <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded shrink-0">
                            {error.clueNumber}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-700 truncate">{error.clueText}</p>
                            {error.errors.map((err, errIdx) => (
                              <p key={errIdx} className="text-xs text-red-600 mt-1 font-medium">
                                • {err}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Success message when no errors */}
              {importResult.errors.length === 0 && importResult.saved > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                  <div className="bg-green-600 text-white p-3 rounded-full inline-flex mb-4">
                    <Check size={24} />
                  </div>
                  <h3 className="font-bold text-green-900 text-lg mb-2">All Clues Imported Successfully</h3>
                  <p className="text-green-700 text-sm">
                    {importResult.saved} clue{importResult.saved !== 1 ? 's' : ''} added to your training library.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* FREEFORM INPUT VIEW - Initial state */
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

              {/* Error display */}
              {solveError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} />
                    {solveError}
                  </div>
                </div>
              )}

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

      {/* Import Logs Modal */}
      {showImportLogs && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="bg-slate-800 text-white p-4 flex items-center justify-between">
              <h2 className="font-bold">Import Logs</h2>
              <button
                onClick={() => setShowImportLogs(false)}
                className="text-white/70 hover:text-white text-xl"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(80vh-60px)]">
              {importLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  No import logs found
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {importLogs.map((log) => (
                    <div key={log.id} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-bold text-slate-800">{log.puzzleFile}</span>
                          <span className="text-xs text-slate-500 ml-2">
                            {new Date(log.timestamp * 1000).toLocaleString()}
                          </span>
                        </div>
                        <button
                          onClick={() => copyLogToClipboard(log)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          Copy
                        </button>
                      </div>
                      <div className="flex gap-4 text-xs mb-2">
                        <span className="text-green-600">{log.summary.saved} saved</span>
                        <span className="text-slate-500">{log.summary.skipped} skipped</span>
                        <span className={log.summary.failed > 0 ? 'text-red-600' : 'text-slate-400'}>
                          {log.summary.failed} failed
                        </span>
                      </div>
                      {log.errors.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-red-600 cursor-pointer hover:text-red-800">
                            {log.errors.length} error{log.errors.length !== 1 ? 's' : ''} (click to expand)
                          </summary>
                          <div className="mt-2 bg-red-50 rounded p-2 text-xs space-y-2 max-h-40 overflow-y-auto">
                            {log.errors.map((err, idx) => (
                              <div key={idx} className="border-b border-red-100 pb-2 last:border-0">
                                <span className="font-bold text-red-700">{err.clueNumber}:</span>{' '}
                                <span className="text-slate-700">{err.clueText}</span>
                                {err.errors.map((e, i) => (
                                  <p key={i} className="text-red-600 ml-4">• {e}</p>
                                ))}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
