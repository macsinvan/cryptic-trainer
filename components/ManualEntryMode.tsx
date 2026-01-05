
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Brain, Sparkles, Check, AlertCircle, Wand2, Loader2, Send } from 'lucide-react';
import { getClueCount, saveClue, saveParserIssue, ParserIssue } from '../services/clueManager';
import { parseFreeformInput, FreeformParseResult } from '../services/freeformParser';
import { parseClue } from '../services/clueParser';
import { solveClue, SolvedClue, testHypotheses, HypothesisInput } from '../services/aiService';
import { ClueEvaluation, PatternInstance } from '../types';
import { ClueSolver } from './ClueSolver';

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

  // Preview the battlecard WITHOUT saving
  // Can preview without answer to show partial analysis
  // If no answer but we have hypotheses, auto-solve with AI
  const previewBattlecard = async () => {
    if (!parseResult?.success || !parseResult.clueText) return;

    // Try code-based parser first (pass coaching notes for cryptic definition detection)
    // If no answer, use empty string to get partial analysis
    const codeParseResult = parseClue(parseResult.clueText, parseResult.answer || '', parseResult.coaching);

    // Use code parser result if successful, otherwise use freeform-extracted data
    let patternData: PatternInstance = codeParseResult.patternData || parseResult.patternData || {
      id: `freeform-${Date.now()}`,
      patternId: 'IMPORTED',
      clueText: parseResult.clueText,
      answer: parseResult.answer,
      variables: {
        'def_text': codeParseResult.parsed?.definition.text || ''
      }
    };

    // AUTO-SOLVE: If no answer but we have hypotheses, test them with AI
    let autoSolvedAnswer = parseResult.answer || '';
    if (!parseResult.answer && patternData.analysis?.hypotheses) {
      const hypotheses = patternData.analysis.hypotheses as Array<{
        definitionCandidate: string;
        wordplayParts: Array<{fodder: string; result: string}>;
        synonymNeeded?: {fodder: string; letterCount: number};
        targetLength: number;
      }>;

      // Convert to HypothesisInput format
      const inputs: HypothesisInput[] = hypotheses
        .filter(h => h.synonymNeeded)
        .map(h => ({
          definition: h.definitionCandidate,
          synonymFodder: h.synonymNeeded!.fodder,
          requiredLetterCount: h.synonymNeeded!.letterCount,
          knownParts: h.wordplayParts.filter(p => p.result).map(p => p.result),
          targetLength: h.targetLength
        }));

      if (inputs.length > 0) {
        setIsSolving(true);
        try {
          const result = await testHypotheses(inputs);
          if (result.bestHypothesis !== null) {
            const winning = result.results[result.bestHypothesis];
            if (winning.answer) {
              autoSolvedAnswer = winning.answer;
              setSolvedClue({
                answer: winning.answer,
                definition: inputs[result.bestHypothesis].definition,
                definitionPosition: 'END',
                parsing: `${inputs[result.bestHypothesis].knownParts.join(' + ')} + ${winning.synonym} = ${winning.answer}`,
                explanation: winning.reasoning,
                confidence: winning.confidence
              });

              // Re-parse with the answer to get full analysis
              const fullParseResult = parseClue(parseResult.clueText, winning.answer, parseResult.coaching);
              if (fullParseResult.patternData) {
                patternData = fullParseResult.patternData;
              }
            }
          }
        } catch (err) {
          console.error('Auto-solve failed:', err);
        } finally {
          setIsSolving(false);
        }
      }
    }

    // Build evaluation from available data
    const evaluation: ClueEvaluation = {
      id: `freeform-${Date.now()}`,
      clue: parseResult.clueText,
      answer: autoSolvedAnswer,
      type: autoSolvedAnswer ? detectClueType(patternData.patternId, parseResult.parsing || '') : 'Analysis',
      difficulty: 'Medium',
      definition: {
        text: patternData.variables['def_text'] || '',
        position: codeParseResult.parsed?.definition.position || 'START'
      },
      wordplay: [],
      structure: parseResult.parsing || '',
      card: [],
      learnings: parseResult.coaching || [],
      parsing: parseResult.parsing || '',
      hints: [],
      reasoning: ''
    };

    setFullAnalysis(evaluation);
    setActivePatternData(patternData);
    setIsAccepted(false);
    setIsTutorMode(true);
  };

  // Accept and save to library
  const acceptAndSave = async () => {
    if (!fullAnalysis || !activePatternData || !parseResult?.clueText) return;

    await saveClue(
      parseResult.publication || publicationId,
      parseResult.clueText,
      fullAnalysis,
      activePatternData
    );

    setIsAccepted(true);
    setTotalClueCount(getClueCount(publicationId));
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

  // Solve clue using AI when no answer is provided
  const handleSolveClue = async () => {
    if (!parseResult?.clueText) return;

    setIsSolving(true);
    setSolveError(null);
    setSolvedClue(null);

    try {
      const result = await solveClue(parseResult.clueText);
      if (result) {
        setSolvedClue(result);
        // Auto-populate the answer into the text field
        const updatedText = freeformText + `\n\nAnswer: ${result.answer} – ${result.parsing}`;
        setFreeformText(updatedText);
      } else {
        setSolveError('Could not solve this clue. Try adding more context or the answer manually.');
      }
    } catch (err) {
      setSolveError('Failed to connect to AI service. Please try again.');
      console.error('Solve error:', err);
    } finally {
      setIsSolving(false);
    }
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
        {/* Header */}
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

        {/* Main Battlecard */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">

          {/* Clue Display */}
          <div className="p-8 border-b border-slate-100">
            <p className="text-2xl font-serif text-slate-900 leading-relaxed text-center">
              {fullAnalysis.clue}
            </p>
          </div>

          {/* Answer Grid - show letters if answer exists, or blank boxes for target length */}
          <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-center">
            {answer ? (
              <div className="flex gap-2">
                {answer.replace(/[^A-Z]/gi, '').split('').map((char, i) => (
                  <div
                    key={i}
                    className="w-12 h-12 bg-green-100 border-2 border-green-300 rounded-lg flex items-center justify-center text-xl font-bold text-green-700"
                  >
                    {char.toUpperCase()}
                  </div>
                ))}
              </div>
            ) : activePatternData?.analysis?.targetLength ? (
              <div className="flex gap-2">
                {Array.from({ length: activePatternData.analysis.targetLength as number }).map((_, i) => (
                  <div
                    key={i}
                    className="w-12 h-12 bg-amber-100 border-2 border-amber-300 rounded-lg flex items-center justify-center text-xl font-bold text-amber-400"
                  >
                    ?
                  </div>
                ))}
              </div>
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

                {/* Solve with AI button */}
                {activePatternData.analysis?.hypotheses && (
                  <>
                    <button
                      onClick={async () => {
                        setIsSolving(true);
                        setSolveError(null);
                        try {
                          const hypotheses = activePatternData.analysis?.hypotheses as Array<{
                            definitionCandidate: string;
                            wordplayParts: Array<{fodder: string; result: string}>;
                            synonymNeeded?: {fodder: string; letterCount: number};
                            targetLength: number;
                          }>;

                          // Convert to HypothesisInput format
                          const inputs: HypothesisInput[] = hypotheses
                            .filter(h => h.synonymNeeded)
                            .map(h => ({
                              definition: h.definitionCandidate,
                              synonymFodder: h.synonymNeeded!.fodder,
                              requiredLetterCount: h.synonymNeeded!.letterCount,
                              knownParts: h.wordplayParts.filter(p => p.result).map(p => p.result),
                              targetLength: h.targetLength
                            }));

                          const result = await testHypotheses(inputs);

                          if (result.bestHypothesis !== null) {
                            const winning = result.results[result.bestHypothesis];
                            if (winning.answer) {
                              // Update the freeform text with the answer
                              const updatedText = freeformText + `\n\nAnswer: ${winning.answer}`;
                              setFreeformText(updatedText);
                              setSolvedClue({
                                answer: winning.answer,
                                definition: inputs[result.bestHypothesis].definition,
                                definitionPosition: 'END',
                                parsing: `${inputs[result.bestHypothesis].knownParts.join(' + ')} + ${winning.synonym} = ${winning.answer}`,
                                explanation: winning.reasoning,
                                confidence: winning.confidence
                              });
                            }
                          } else {
                            setSolveError('Could not verify any hypothesis. Try adding the answer manually.');
                          }
                        } catch (err) {
                          setSolveError('AI verification failed. Try again or add answer manually.');
                          console.error('Hypothesis test error:', err);
                        } finally {
                          setIsSolving(false);
                        }
                      }}
                      disabled={isSolving}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSolving ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          Solving...
                        </>
                      ) : (
                        <>
                          <Wand2 size={18} />
                          Solve with AI
                        </>
                      )}
                    </button>
                    {solveError && (
                      <p className="text-red-600 text-sm mt-2">{solveError}</p>
                    )}
                  </>
                )}

                <p className="text-xs text-amber-600 italic mt-4">
                  Or add the answer manually to see full verification
                </p>
              </div>
            ) : !hasMissingInfo && !isAccepted ? (
              // COMPLETE: Show solved battlecard style
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-indigo-600 text-white p-1.5 rounded">
                    <Check size={16} />
                  </div>
                  <h3 className="font-bold text-indigo-900 uppercase tracking-widest text-sm">Solved — What We Learned</h3>
                </div>

                {/* Clue Type */}
                {fullAnalysis.type && (
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-indigo-400 text-xs font-bold uppercase tracking-widest">Clue Type:</span>
                    <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-xs font-bold">{fullAnalysis.type}</span>
                  </div>
                )}

                {/* Parsing Summary */}
                {parsingSummary && (
                  <div className="bg-white/70 border border-indigo-200 rounded-lg p-4 mb-4 font-mono text-sm text-indigo-800">
                    <span className="text-indigo-400 text-xs font-sans font-bold uppercase tracking-widest block mb-1">Parsing</span>
                    {parsingSummary}
                  </div>
                )}

                {/* Learnings - all explanations pre-computed by parser */}
                <ul className="space-y-3">
                  {/* Definition learning */}
                  <li className="bg-white/50 p-3 rounded-lg border border-indigo-100/50">
                    <div className="flex gap-3 text-sm text-indigo-900 leading-relaxed">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0"></div>
                      <div className="flex-1">
                        <p>{activePatternData.definitionExplanation}</p>
                      </div>
                    </div>
                  </li>

                  {/* Wordplay learnings - uses pre-computed explanations from parser */}
                  {wordplaySteps.map((step, i) => (
                    <li key={i} className="bg-white/50 p-3 rounded-lg border border-indigo-100/50">
                      <div className="flex gap-3 text-sm text-indigo-900 leading-relaxed">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0"></div>
                        <div className="flex-1">
                          <p>{step.explanation}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
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
            // Already saved
            return (
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setIsTutorMode(false);
                    setFreeformText('');
                    setParseResult(null);
                    setIsAccepted(false);
                  }}
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Sparkles size={18} /> Import Another
                </button>
                <button
                  onClick={onExit}
                  className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
                >
                  Back to Dojo
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
                disabled={!parseResult?.success}
                className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-[0.4em] text-[10px] rounded-xl shadow-xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-4 disabled:opacity-50"
              >
                Review Battlecard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
