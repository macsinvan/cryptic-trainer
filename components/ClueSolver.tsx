
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronRight, Check, ArrowRight, MousePointer2, Lightbulb, Zap, Eye, EyeOff, Unlock } from 'lucide-react';
import { ClueEvaluation, PatternInstance, StepTemplate } from '../types';
import { WORKFLOW_COLORS } from '../data/designTemplates';
import { PATTERNS, getStepTemplate, AI_TEMPLATES } from '../data/patterns';

interface ClueSolverProps {
  evaluation: ClueEvaluation;
  // Optional Pattern Data for the new Engine
  patternData?: PatternInstance;
  onCorrect?: () => void;
  onNext: () => void;
  nextLabel?: string;
  setterName?: string;
  level?: string;
}

interface DiscoveredPart {
  label: string;
  text: string;
  colorType: 'GREEN' | 'ORANGE' | 'BLUE' | 'SLATE';
  indices: number[];
  note?: string;  // Optional note for implied wordplay etc.
}

// Collapsible learning item with hint reveal
const LearningItem: React.FC<{ text: string; hint?: string }> = ({ text, hint }) => {
  const [revealed, setRevealed] = useState(false);

  return (
    <li className="bg-white/50 p-3 rounded-lg border border-indigo-100/50">
      <div className="flex gap-3 text-sm text-indigo-900 leading-relaxed">
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0"></div>
        <div className="flex-1">
          <p>{text}</p>
          {hint && (
            <div className="mt-2">
              {!revealed ? (
                <button
                  onClick={() => setRevealed(true)}
                  className="flex items-center gap-2 text-xs font-bold text-indigo-500 hover:text-indigo-700 transition-colors group"
                >
                  <Eye size={16} />
                  <span>Show Solution</span>
                </button>
              ) : (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      onClick={() => setRevealed(false)}
                      className="text-indigo-400 hover:text-indigo-600 transition-colors"
                    >
                      <EyeOff size={12} />
                    </button>
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Solve Sequence</span>
                  </div>
                  <div className="bg-indigo-100/50 border border-indigo-200 rounded-md px-3 py-2 font-mono text-xs text-indigo-800">
                    {hint}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
};

export const ClueSolver: React.FC<ClueSolverProps> = ({
  evaluation, patternData, onCorrect, onNext, nextLabel = "Next Clue", setterName = "The Setter", level
}) => {
  // --- ENGINE STATE ---
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [runtimePattern, setRuntimePattern] = useState<{ steps: string[], variables: Record<string, string>, solveSteps?: string[] } | null>(null);
  
  // --- UI STATE ---
  const [grid, setGrid] = useState<string[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [discoveredParts, setDiscoveredParts] = useState<DiscoveredPart[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [isPartialMatch, setIsPartialMatch] = useState(false);
  const [selectionCorrect, setSelectionCorrect] = useState(false);
  const [pendingDiscovery, setPendingDiscovery] = useState<DiscoveredPart | null>(null);
  
  // Refs
  const gridRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Tokenize clue
  const words = useMemo(() => {
    return evaluation.clue.split(/\s+/).map((word, i) => ({
      id: i,
      text: word.replace(/[.,;!?()]/g, ''), 
      display: word
    }));
  }, [evaluation.clue]);

  // --- INITIALIZATION & ADAPTER LOGIC ---
  useEffect(() => {
    setGrid(new Array(evaluation.answer.replace(/[^A-Z]/g, '').length).fill(''));
    setSelectedIndices([]);
    setDiscoveredParts([]);
    setIsCompleted(false);
    setCurrentStepIndex(0);
    setSelectionCorrect(false);
    setPendingDiscovery(null);
    setHintRevealed(false);

    // ENGINE SELECTION:
    // 1. Use strict pattern data if available (The Cookbook)
    if (patternData) {
        const patternDef = PATTERNS[patternData.patternId];
        if (patternDef) {
            setRuntimePattern({
                steps: patternData.stepOverrides || patternDef.steps,
                variables: patternData.variables,
                solveSteps: patternData.solveSteps
            });
            return;
        }

        // 1b. Pattern not in registry but patternData exists - generate dynamic steps
        // This handles custom/unknown patterns by inferring steps from variables
        const dynamicSteps: string[] = ['STEP_IDENTIFY_DEF'];

        // Check how many wordplay components exist based on variables
        for (let i = 1; i <= 3; i++) {
            const hasIndicator = patternData.variables[`indicator_${i}_text`];
            const hasFodder = patternData.variables[`fodder_${i}_text`];

            if (hasIndicator || hasFodder) {
                if (i === 1) {
                    dynamicSteps.push('STEP_IDENTIFY_IND_1', 'STEP_IDENTIFY_FOD_1', 'STEP_DECODE_SYNONYM_1');
                } else if (i === 2) {
                    dynamicSteps.push('STEP_IDENTIFY_IND_2', 'STEP_IDENTIFY_FOD_2', 'STEP_DECODE_SELECTION_2');
                }
            }
        }

        dynamicSteps.push('STEP_SOLVE');

        setRuntimePattern({
            steps: patternData.stepOverrides || dynamicSteps,
            variables: patternData.variables,
            solveSteps: patternData.solveSteps
        });
        return;
    }

    // 2. Fallback: Create ephemeral pattern from legacy/AI evaluation (The Shim)
    const aiSteps: string[] = ['AI_DEF'];
    const aiVars: Record<string, string> = {
        'def_text': evaluation.definition.text
    };

    evaluation.wordplay.forEach((wp, idx) => {
        // Map dynamic variables for this iteration
        // Note: The AI Templates use generic keys like 'current_ind', which won't work for multiple steps 
        // unless we dynamically clone templates. For now, we simulate simple flow.
        // A better approach for the shim is to just cycle generic templates but update the "Answer Key"
        // We will handle this in the render logic by checking index if needed, OR simplify the shim.
        
        // Simpler Shim: Just push generic IDs, but we need a way to store multiple variable values.
        // Solution: Create unique variable keys per index.
        const indKey = `ind_${idx}`;
        const fodKey = `fod_${idx}`;
        const synKey = `syn_${idx}`; // Not used in matching but useful for logic display
        
        aiVars[indKey] = wp.indicator.text;
        aiVars[fodKey] = wp.fodder.text;
        aiVars[synKey] = wp.synonym || '';

        // We push special dynamic step IDs that the engine needs to interpret
        // or we register temporary templates?
        // Easier: Just use the generic templates but modify how we look up variables in validation.
        // We will store the *lookup key* in the runtime pattern step list? No, steps are strings.
        
        // Workaround: We will use a custom property in our runtime state to map Step Index -> Variable Key
        // But for strict compliance with the new engine, let's keep it simple.
        // We will just use the AI_TEMPLATES and update the `targetVariable` on the fly? No.
        
        // We will just add 1 set of WP steps. Multi-part AI clues will be simplified to 1 part for now 
        // to ensure robustness, or we accept that AI clues use the non-deterministic fallback path?
        // The prompt asked to refactor the render loop.
        
        // Let's create a mapped runtime structure.
        aiSteps.push(`AI_IND_${idx}`);
        aiSteps.push(`AI_FOD_${idx}`);
        aiSteps.push(`AI_DECODE_${idx}`);
    });
    
    aiSteps.push('AI_SOLVE');
    setRuntimePattern({ steps: aiSteps, variables: aiVars });

  }, [evaluation, patternData]);

  // --- ENGINE HELPERS ---

  const getTemplateForStep = (stepId: string): StepTemplate | null => {
      // 1. Standard Registry Lookup
      if (getStepTemplate(stepId)) return getStepTemplate(stepId)!;

      // 2. AI Shim Lookup (Handling the dynamic indices like AI_IND_0)
      if (stepId.startsWith('AI_')) {
          if (stepId === 'AI_DEF') return AI_TEMPLATES.DEF;
          if (stepId === 'AI_SOLVE') return AI_TEMPLATES.SOLVE;
          
          const parts = stepId.split('_'); // AI, IND, 0
          const type = parts[1]; // IND, FOD, DECODE
          const idx = parts[2];

          // Clone the base template but inject the specific variable target
          const base = AI_TEMPLATES[type as keyof typeof AI_TEMPLATES];
          if (!base) return null;

          return {
              ...base,
              targetVariable: type === 'IND' ? `ind_${idx}` : type === 'FOD' ? `fod_${idx}` : undefined,
              logicDisplay: type === 'DECODE' ? `Apply '{{ind_${idx}}}' to '{{fod_${idx}}}'` : undefined
          };
      }
      return null;
  };

  const currentTemplate = runtimePattern && runtimePattern.steps[currentStepIndex] 
      ? getTemplateForStep(runtimePattern.steps[currentStepIndex]) 
      : null;


  // --- INTERACTION LOGIC ---

  useEffect(() => {
    if (!currentTemplate || !runtimePattern || isCompleted) return;
    if (currentTemplate.interactionType !== 'CLICK_WORD') return;
    if (selectedIndices.length === 0) return;

    // VALIDATION LOGIC
    const userText = selectedIndices.map(i => words[i].text.toLowerCase()).join('').replace(/[^a-z0-9]/g, '');
    const targetKey = currentTemplate.targetVariable;
    if (!targetKey) return; // Should not happen for CLICK_WORD

    const targetText = runtimePattern.variables[targetKey] || '';
    const cleanTarget = targetText.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Check if this is an indicator step with a meta-indicator (implied wordplay)
    const isIndicatorStep = targetKey.includes('indicator');
    const isMetaIndicator = isIndicatorStep && (targetText.startsWith('(') || !cleanTarget);

    // If meta-indicator, accept the fodder word instead
    let acceptedText = targetText;
    let acceptedClean = cleanTarget;
    let impliedNote: string | undefined;

    if (isMetaIndicator) {
        // Get the corresponding fodder for this indicator
        const idx = targetKey.includes('_2') ? '2' : '1';
        const fodderKey = `fodder_${idx}_text`;
        const fodderText = runtimePattern.variables[fodderKey] || '';
        const cleanFodder = fodderText.toLowerCase().replace(/[^a-z0-9]/g, '');

        if (userText === cleanFodder) {
            acceptedText = fodderText;
            acceptedClean = cleanFodder;
            impliedNote = 'One word remains – the wordplay here is implied (no explicit indicator).';
        }
    }

    if (acceptedClean && userText === acceptedClean) {
        // SUCCESS - full match
        setIsPartialMatch(false);
        const colorType = currentTemplate.hints.highlight_color || 'SLATE';
        const label = currentTemplate.stage;

        setDiscoveredParts(prev => [...prev, {
            label,
            text: acceptedText,
            colorType,
            indices: [...selectedIndices],
            note: impliedNote
        }]);

        setSelectedIndices([]);

        // AUTO ADVANCE
        if (currentStepIndex < runtimePattern.steps.length - 1) {
            setCurrentStepIndex(prev => prev + 1);
            setHintRevealed(false);
        }
    } else if (acceptedClean && acceptedClean.startsWith(userText) && userText.length > 0) {
        // PARTIAL MATCH - user is on the right track
        setIsPartialMatch(true);
    } else {
        // No match
        setIsPartialMatch(false);
    }

  }, [selectedIndices, currentTemplate, runtimePattern, isCompleted, words]);

  const handleContinue = () => {
      // Add pending discovery to discovered parts
      if (pendingDiscovery) {
          setDiscoveredParts(prev => [...prev, pendingDiscovery]);
          setPendingDiscovery(null);
      }
      setSelectedIndices([]);
      setSelectionCorrect(false);
      setHintRevealed(false);

      if (runtimePattern && currentStepIndex < runtimePattern.steps.length - 1) {
          setCurrentStepIndex(prev => prev + 1);
      }
  };

  const handleSkipStep = () => {
     // Auto-fill discovery if possible
     if (currentTemplate?.targetVariable && runtimePattern) {
         const targetText = runtimePattern.variables[currentTemplate.targetVariable];
         if (targetText) {
            // Find indices roughly
            const cleanFind = targetText.toLowerCase().replace(/[^a-z0-9]/g, '');
            const foundIndices: number[] = [];
            words.forEach((w, i) => {
                 if (cleanFind.includes(w.text.toLowerCase())) foundIndices.push(i);
            });
            
            setDiscoveredParts(prev => [...prev, {
                label: currentTemplate.stage,
                text: targetText,
                colorType: currentTemplate.hints.highlight_color || 'SLATE',
                indices: foundIndices
            }]);
         }
     }
     handleContinue();
  };

  const handleRevealAnswer = () => {
    // Fill in the answer grid
    const cleanAnswer = evaluation.answer.replace(/[^A-Z]/g, '').toUpperCase();
    const answerChars = cleanAnswer.split('');
    setGrid(answerChars);

    // Auto-discover all parts for the solved display
    if (runtimePattern) {
      const allParts: DiscoveredPart[] = [];

      // Add definition
      if (runtimePattern.variables['def_text']) {
        allParts.push({
          label: 'DEFINITION',
          text: runtimePattern.variables['def_text'],
          colorType: 'GREEN',
          indices: []
        });
      }

      // Add all indicators and fodders
      for (let i = 1; i <= 3; i++) {
        const indicator = runtimePattern.variables[`indicator_${i}_text`];
        const fodder = runtimePattern.variables[`fodder_${i}_text`];

        if (indicator) {
          allParts.push({
            label: 'INDICATOR',
            text: indicator,
            colorType: 'ORANGE',
            indices: []
          });
        }
        if (fodder) {
          allParts.push({
            label: 'FODDER',
            text: fodder,
            colorType: 'BLUE',
            indices: []
          });
        }
      }

      setDiscoveredParts(allParts);
    }

    // Mark as completed
    setIsCompleted(true);
  };

  // Auto-check answer when grid is filled
  useEffect(() => {
    if (isCompleted) return;

    // Check if all cells are filled
    const allFilled = grid.every(char => char !== '');
    if (!allFilled) return;

    const userString = grid.join('').toUpperCase();
    const cleanAnswer = evaluation.answer.replace(/[^A-Z]/g, '').toUpperCase();

    if (userString === cleanAnswer) {
      setIsCompleted(true);
      if (onCorrect) onCorrect();
    }
  }, [grid, evaluation.answer, isCompleted, onCorrect]);


  // --- RENDER HELPERS ---

  const renderLogicDisplay = (templateString: string) => {
      if (!runtimePattern) return templateString;
      // Simple Handlebars replacement
      let result = templateString;
      Object.keys(runtimePattern.variables).forEach(key => {
          const val = runtimePattern.variables[key];
          result = result.replace(new RegExp(`{{${key}}}`, 'g'), val);
      });
      return result;
  };

  const getWordStyle = (wordIndex: number) => {
    for (const part of discoveredParts) {
        if (part.indices.includes(wordIndex)) {
            const theme = part.colorType === 'SLATE' ? null : WORKFLOW_COLORS[part.colorType];
            return theme ? `${theme.bg} ${theme.text} ${theme.border} font-bold` : 'bg-slate-200 text-slate-600';
        }
    }
    if (selectedIndices.includes(wordIndex)) {
        if (isPartialMatch && currentTemplate) {
            // Partial match - use lighter version of target color
            const targetColor = currentTemplate.hints.highlight_color || 'SLATE';
            const partialColors: Record<string, string> = {
                'GREEN': 'bg-green-100 text-green-700 border-green-300 ring-2 ring-green-400 font-bold',
                'ORANGE': 'bg-orange-100 text-orange-700 border-orange-300 ring-2 ring-orange-400 font-bold',
                'BLUE': 'bg-blue-100 text-blue-700 border-blue-300 ring-2 ring-blue-400 font-bold',
                'SLATE': 'bg-slate-200 text-slate-700 border-slate-300 ring-2 ring-slate-400 font-bold'
            };
            return partialColors[targetColor] || partialColors['SLATE'];
        }
        return 'bg-slate-800 text-white ring-2 ring-slate-600 font-bold';
    }
    if (currentTemplate?.interactionType === 'CLICK_WORD') {
        return 'hover:bg-indigo-50 cursor-pointer';
    }
    return '';
  };

  // --- RENDER ---
  
  if (!currentTemplate && !isCompleted) return <div>Loading Engine...</div>;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6 font-sans">
      
      {/* 1. CLUE DISPLAY */}
      <div className="bg-white p-8 md:p-10 rounded-2xl shadow-sm border border-slate-200 text-center relative">
         <div className="text-2xl md:text-3xl font-serif text-slate-900 leading-relaxed flex flex-wrap justify-center gap-x-2 gap-y-2">
            {words.map((word, idx) => (
               <span
                  key={idx}
                  onClick={() => currentTemplate?.interactionType === 'CLICK_WORD' && !isCompleted && (() => {
                      setSelectedIndices(prev => {
                        if (prev.includes(idx)) return prev.filter(i => i !== idx);
                        return [...prev, idx].sort((a, b) => a - b);
                      });
                  })()}
                  className={`px-1.5 py-0.5 rounded transition-all duration-300 border border-transparent ${getWordStyle(idx)}`}
               >
                  {word.display}
               </span>
            ))}
         </div>
         {/* Partial match hint - always present to prevent layout jump */}
         <div className={`mt-4 text-base font-bold transition-opacity duration-200 ${isPartialMatch && selectedIndices.length > 0 ? 'text-indigo-600 animate-pulse opacity-100' : 'opacity-0'}`}>
            Keep selecting...
         </div>
      </div>

      {/* 2. ANSWER GRID */}
      <div className="flex justify-center gap-2 md:gap-3 py-2">
          {grid.map((char, i) => (
              <input
                key={i}
                ref={el => gridRefs.current[i] = el}
                type="text"
                maxLength={1}
                value={char}
                onChange={(e) => {
                    if (e.target.value.length > 1) e.target.value = e.target.value.slice(-1);
                    const newGrid = [...grid];
                    newGrid[i] = e.target.value.toUpperCase();
                    setGrid(newGrid);
                    if (e.target.value && i < grid.length - 1) gridRefs.current[i + 1]?.focus();
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !grid[i] && i > 0) gridRefs.current[i - 1]?.focus();
                }}
                className={`
                    w-10 h-10 md:w-14 md:h-14 text-center text-xl md:text-2xl font-bold rounded-lg border-2 shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all uppercase
                    ${isCompleted ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-slate-200 text-slate-900 focus:border-indigo-500'}
                `}
              />
          ))}
      </div>

      {/* 3. ENGINE INTERFACE */}
      {!isCompleted && currentTemplate && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2">
            
            {/* Header */}
            <div className="bg-slate-50 px-6 py-3 border-b border-slate-100 flex justify-between items-center">
                 <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    {currentTemplate.stage} PHASE
                 </span>
                 {level && <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-[9px] font-bold uppercase">{level}</span>}
            </div>

            <div className="p-6">
                <div className="flex gap-4">
                    <div className="mt-1">
                        {currentTemplate.stage === 'DECODE' ? <Lightbulb className="text-indigo-500" size={24} /> : 
                         currentTemplate.stage === 'SOLVE' ? <Zap className="text-yellow-500" size={24} /> :
                         <MousePointer2 className="text-slate-400" size={24} />}
                    </div>

                    <div className="flex-1">
                         {/* HINT - Always visible */}
                         <h3 className="font-bold text-slate-800 text-lg mb-2">Hint</h3>
                         <div className="text-slate-600 text-sm leading-relaxed mb-4 whitespace-pre-wrap">
                            {currentTemplate.hints.primary}
                         </div>

                         {/* ACTION */}
                         <h3 className="font-bold text-slate-800 text-lg mb-2">Action</h3>
                         <div className="text-slate-600 text-sm leading-relaxed mb-6">
                            {currentTemplate.actionPrompt}
                         </div>

                         {/* SOLVE STEPS (for DEFINITION stage) */}
                         {runtimePattern && currentTemplate.stage === 'DEFINITION' && (() => {
                             const defText = runtimePattern.variables['def_text'];
                             const defType = runtimePattern.variables['definition_type'];
                             const defHint = runtimePattern.variables['definition_hint'];
                             const defPos = evaluation.definition?.position || 'END';

                             const posLabel = defPos === 'START' ? 'at the START' :
                                            defPos === 'END' ? 'at the END' :
                                            defPos === 'ENTIRE' ? '(the ENTIRE clue)' : '';

                             let logicChain = `Definition: "${defText}" → found ${posLabel}`;

                             if (defType === 'cryptic' && defHint) {
                                 logicChain += `\n\n⚠️ CRYPTIC: ${defHint}`;
                             }

                             logicChain += '\n\nTip: The definition is usually at the very START or END of the clue.';

                             return (
                                 <div className="mb-4">
                                     {!hintRevealed ? (
                                         <button
                                             onClick={() => setHintRevealed(true)}
                                             className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold text-sm rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                                         >
                                             <Eye size={16} />
                                             <span>Show Solution</span>
                                         </button>
                                     ) : (
                                         <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                             <div className="flex items-center gap-2 mb-1">
                                                 <button
                                                     onClick={() => setHintRevealed(false)}
                                                     className="text-indigo-400 hover:text-indigo-600 transition-colors"
                                                 >
                                                     <EyeOff size={12} />
                                                 </button>
                                                 <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Solve Sequence</span>
                                             </div>
                                             <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                                                 {runtimePattern?.solveSteps?.length ? (
                                                     runtimePattern.solveSteps.map((step, i) => (
                                                         <div key={i} className="flex gap-2 text-sm">
                                                             <span className="text-indigo-500 font-bold">{i + 1}.</span>
                                                             <span className="text-slate-700">{step}</span>
                                                         </div>
                                                     ))
                                                 ) : (
                                                     <div className="font-mono text-xs text-slate-700 whitespace-pre-wrap">
                                                         {logicChain}
                                                     </div>
                                                 )}
                                             </div>
                                         </div>
                                     )}
                                 </div>
                             );
                         })()}

                         {/* SOLVE STEPS (for wordplay stages) */}
                         {runtimePattern && currentTemplate.stage !== 'DEFINITION' && currentTemplate.stage !== 'SOLVE' && (() => {
                             const stepId = runtimePattern.steps[currentStepIndex] || '';
                             let idx = '1';
                             if (stepId.includes('_2') || currentTemplate.targetVariable?.includes('_2_')) {
                                 idx = '2';
                             }

                             const fodder = runtimePattern.variables[`fodder_${idx}_text`];
                             const synonym = runtimePattern.variables[`synonym_${idx}`];
                             const indicator = runtimePattern.variables[`indicator_${idx}_text`];
                             const result = runtimePattern.variables[`result_${idx}`];
                             const precomputedHint = runtimePattern.variables[`hint_${idx}`];

                             if (fodder && result) {
                                 let logicChain: string;
                                 if (precomputedHint) {
                                     logicChain = precomputedHint;
                                 } else {
                                     logicChain = synonym
                                         ? `${fodder} → ${synonym} → Apply '${indicator}' → ${result}`
                                         : `${fodder} → Apply '${indicator}' → ${result}`;
                                 }

                                 return (
                                     <div className="mb-4">
                                         {!hintRevealed ? (
                                             <button
                                                 onClick={() => setHintRevealed(true)}
                                                 className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold text-sm rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                                             >
                                                 <Eye size={16} />
                                                 <span>Show Solution</span>
                                             </button>
                                         ) : (
                                             <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                                 <div className="flex items-center gap-2 mb-1">
                                                     <button
                                                         onClick={() => setHintRevealed(false)}
                                                         className="text-indigo-400 hover:text-indigo-600 transition-colors"
                                                     >
                                                         <EyeOff size={12} />
                                                     </button>
                                                     <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Solve Sequence</span>
                                                 </div>
                                                 <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                                                     {runtimePattern?.solveSteps?.length ? (
                                                         runtimePattern.solveSteps.map((step, i) => (
                                                             <div key={i} className="flex gap-2 text-sm">
                                                                 <span className="text-indigo-500 font-bold">{i + 1}.</span>
                                                                 <span className="text-slate-700">{step}</span>
                                                             </div>
                                                         ))
                                                     ) : (
                                                         <div className="font-mono text-xs text-slate-700">
                                                             {logicChain}
                                                         </div>
                                                     )}
                                                 </div>
                                             </div>
                                         )}
                                     </div>
                                 );
                             }
                             return null;
                         })()}

                         {/* CONTROLS */}
                         <div className="flex items-center gap-3">
                            {currentTemplate.interactionType === 'ENTER_TEXT' ? (
                                <div className="text-slate-500 text-sm italic flex items-center gap-2">
                                    <Zap size={14} className="text-yellow-500" />
                                    Fill in the answer above — it will auto-check when complete
                                </div>
                            ) : currentTemplate.interactionType === 'READ_AND_CONTINUE' ? (
                                <button onClick={handleContinue} className="bg-slate-900 text-white px-8 py-3 rounded-lg font-bold text-sm hover:bg-slate-800 transition-colors shadow-sm flex items-center gap-2">
                                    Continue <ArrowRight size={16} />
                                </button>
                            ) : (
                                <div className="text-slate-400 text-xs italic">Select the words in the clue to proceed...</div>
                            )}

                            {currentTemplate.interactionType !== 'ENTER_TEXT' && (
                                <button onClick={handleSkipStep} className="text-slate-300 hover:text-slate-500 text-xs font-bold uppercase tracking-widest px-3 ml-auto">
                                   Skip
                                </button>
                            )}
                         </div>
                    </div>
                </div>
            </div>
          </div>
      )}

      {/* REVEAL ANSWER BUTTON - Always visible when not completed */}
      {!isCompleted && (
        <div className="flex justify-center">
          <button
            onClick={handleRevealAnswer}
            className="flex items-center gap-2 px-6 py-3 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all text-sm font-medium"
          >
            <Unlock size={16} />
            Reveal Answer
          </button>
        </div>
      )}

      {/* 4. DISCOVERED PARTS */}
      {discoveredParts.length > 0 && !isCompleted && (() => {
         // Group parts: Definition on its own row, Indicator+Fodder pairs together
         const definition = discoveredParts.find(p => p.label === 'DEFINITION');
         const wordplayParts = discoveredParts.filter(p => p.label !== 'DEFINITION');

         // Pair up indicators and fodders
         const pairs: { indicator?: typeof discoveredParts[0]; fodder?: typeof discoveredParts[0] }[] = [];
         let currentPair: { indicator?: typeof discoveredParts[0]; fodder?: typeof discoveredParts[0] } = {};

         wordplayParts.forEach(part => {
             if (part.label === 'INDICATOR') {
                 if (currentPair.indicator) pairs.push(currentPair);
                 currentPair = { indicator: part };
             } else if (part.label === 'FODDER') {
                 currentPair.fodder = part;
                 pairs.push(currentPair);
                 currentPair = {};
             }
         });
         if (currentPair.indicator) pairs.push(currentPair);

         return (
         <div className="bg-white border border-slate-200 rounded-xl p-6 animate-in slide-in-from-bottom-4">
             <h3 className="font-bold text-slate-400 text-xs uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">What we've discovered so far</h3>
             <div className="space-y-3">
                 {/* Definition - full width */}
                 {definition && (() => {
                     const theme = WORKFLOW_COLORS[definition.colorType];
                     const defHint = runtimePattern?.variables?.['definition_hint'];
                     const defType = runtimePattern?.variables?.['definition_type'];
                     return (
                         <div className="space-y-1">
                             <div className="flex items-center gap-3">
                                 <div className={`w-3 h-3 rounded-full shrink-0 ${theme?.dot || 'bg-slate-400'}`}></div>
                                 <div>
                                     <span className="text-slate-500 text-xs font-bold uppercase mr-2">{definition.label}:</span>
                                     <span className={`text-sm font-medium ${theme?.text || 'text-slate-700'}`}>{definition.text}</span>
                                     {defType === 'cryptic' && (
                                         <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded">CRYPTIC</span>
                                     )}
                                 </div>
                             </div>
                             {defHint && (
                                 <div className="ml-6 pl-3 border-l-2 border-amber-300">
                                     <p className="text-xs text-amber-700 italic">{defHint}</p>
                                 </div>
                             )}
                         </div>
                     );
                 })()}

                 {/* Indicator + Fodder pairs - two columns */}
                 {pairs.map((pair, i) => (
                     <div key={i} className="grid grid-cols-2 gap-4">
                         {pair.indicator && (() => {
                             const theme = WORKFLOW_COLORS[pair.indicator.colorType];
                             return (
                                 <div className="flex items-start gap-2">
                                     <div className={`w-3 h-3 rounded-full shrink-0 mt-1 ${theme?.dot || 'bg-slate-400'}`}></div>
                                     <div>
                                         <span className="text-slate-500 text-[10px] font-bold uppercase mr-1">{pair.indicator.label}:</span>
                                         <span className={`text-sm font-medium ${theme?.text || 'text-slate-700'}`}>{pair.indicator.text}</span>
                                         {pair.indicator.note && (
                                             <p className="text-xs text-slate-500 italic mt-1">{pair.indicator.note}</p>
                                         )}
                                     </div>
                                 </div>
                             );
                         })()}
                         {pair.fodder && (() => {
                             const theme = WORKFLOW_COLORS[pair.fodder.colorType];
                             return (
                                 <div className="flex items-start gap-2">
                                     <div className={`w-3 h-3 rounded-full shrink-0 mt-1 ${theme?.dot || 'bg-slate-400'}`}></div>
                                     <div>
                                         <span className="text-slate-500 text-[10px] font-bold uppercase mr-1">{pair.fodder.label}:</span>
                                         <span className={`text-sm font-medium ${theme?.text || 'text-slate-700'}`}>{pair.fodder.text}</span>
                                         {pair.fodder.note && (
                                             <p className="text-xs text-slate-500 italic mt-1">{pair.fodder.note}</p>
                                         )}
                                     </div>
                                 </div>
                             );
                         })()}
                     </div>
                 ))}
             </div>
         </div>
         );
      })()}

      {/* 5. SOLVED */}
      {isCompleted && (() => {
         // Auto-derive learnings from solve steps - written in teaching style
         // Each learning has: text (always shown), hint (hidden by default)
         const derivedLearnings: { text: string; hint?: string }[] = [];

         // Definition learning
         if (runtimePattern?.variables['def_text']) {
             const defText = runtimePattern.variables['def_text'];
             const rawPos = evaluation.definition?.position;
             const defType = runtimePattern.variables['definition_type'];
             const defHint = runtimePattern.variables['definition_hint'];

             let text = '';
             let hint: string | undefined;

             // Handle different definition positions
             if (rawPos === 'ENTIRE') {
                 text = `The entire clue "${defText}" is the definition.`;
                 hint = 'Exception: Sometimes the whole clue is a cryptic definition with no separate wordplay.';
             } else if (rawPos === 'START') {
                 text = `The definition is "${defText}" — found at the start.`;
             } else if (rawPos === 'END') {
                 text = `The definition is "${defText}" — found at the end.`;
             } else {
                 // Unusual position (middle or unknown)
                 text = `The definition is "${defText}".`;
                 hint = 'Exception: This definition is not at the usual start or end position.';
             }

             // Add cryptic definition note
             if (defType === 'cryptic') {
                 text += ' This is a cryptic definition with hidden meaning.';
                 hint = defHint || 'Look for wordplay within the definition itself.';
             } else if (!hint) {
                 text += ' Tip: Always check both ends of the clue for the definition.';
             }

             derivedLearnings.push({ text, hint });
         }

         // Indicator learnings - iterate through all indicators with teaching explanations
         let idx = 1;
         while (runtimePattern?.variables[`indicator_${idx}_text`] || runtimePattern?.variables[`fodder_${idx}_text`]) {
             const indicator = runtimePattern.variables[`indicator_${idx}_text`] || '';
             const fodder = runtimePattern.variables[`fodder_${idx}_text`] || '';
             const synonym = runtimePattern.variables[`synonym_${idx}`];
             const result = runtimePattern.variables[`result_${idx}`];
             const precomputedHint = runtimePattern.variables[`hint_${idx}`];

             let text = '';
             let hint = precomputedHint || '';  // Use pre-computed hint if available

             if (synonym && result) {
                 // Synonym + operation pattern (e.g., deletion with synonym)
                 if (indicator) {
                     text = `"${indicator}" signals wordplay on "${fodder}".`;
                 } else {
                     text = `"${fodder}" is wordplay fodder.`;
                 }
                 if (!precomputedHint) {
                     hint = `${fodder} → ${synonym} → ${result}`;
                 }
             } else if (result && result.length === 1 && fodder) {
                 // Single letter extraction (e.g., "end of shift" → T)
                 const lastChar = fodder.slice(-1).toUpperCase();
                 const firstChar = fodder.charAt(0).toUpperCase();
                 if (result.toUpperCase() === lastChar) {
                     text = `"${indicator}" means take the last letter of the following word.`;
                     if (!precomputedHint) hint = `${fodder} → last letter → ${result}`;
                 } else if (result.toUpperCase() === firstChar) {
                     text = `"${indicator}" means take the first letter of the following word.`;
                     if (!precomputedHint) hint = `${fodder} → first letter → ${result}`;
                 } else {
                     text = `"${indicator}" tells us to extract a letter from "${fodder}".`;
                     if (!precomputedHint) hint = `${fodder} → ${result}`;
                 }
             } else if (result) {
                 if (indicator) {
                     text = `"${indicator}" signals wordplay on "${fodder}".`;
                 } else {
                     text = `"${fodder}" is wordplay fodder.`;
                 }
                 if (!precomputedHint) hint = `→ ${result}`;
             } else if (indicator) {
                 text = `"${indicator}" is a wordplay indicator acting on "${fodder}".`;
             } else if (fodder) {
                 text = `"${fodder}" is wordplay fodder.`;
             }

             if (text) {
                 derivedLearnings.push({ text, hint: hint || undefined });
             }
             idx++;
         }

         // Fallback to evaluation.learnings if no pattern data
         const learnings: { text: string; hint?: string }[] = derivedLearnings.length > 0
             ? derivedLearnings
             : (evaluation.learnings || []).map(l => ({ text: l }));

         // Build detailed parsing summary from pattern variables
         let parsingSummary = '';
         if (runtimePattern?.variables) {
             const parts: string[] = [];
             let idx = 1;
             while (runtimePattern.variables[`result_${idx}`]) {
                 const indicator = runtimePattern.variables[`indicator_${idx}_text`];
                 const fodder = runtimePattern.variables[`fodder_${idx}_text`];
                 const synonym = runtimePattern.variables[`synonym_${idx}`];
                 const result = runtimePattern.variables[`result_${idx}`];

                 if (synonym && result) {
                     // Synonym + operation (e.g., deletion)
                     const isDeleted = synonym.length > result.length;
                     if (isDeleted) {
                         parts.push(`${synonym} (${fodder}) ${indicator} (dropped ${synonym.length - result.length === 1 ? 'last letter' : 'letters'}) to ${result}`);
                     } else {
                         parts.push(`${synonym} (${fodder}) → ${result}`);
                     }
                 } else if (result.length === 1 && fodder) {
                     // Letter extraction
                     parts.push(`${result} (${indicator} ${fodder})`);
                 } else {
                     parts.push(result);
                 }
                 idx++;
             }
             if (parts.length > 0) {
                 parsingSummary = parts.join(' + ') + ' = ' + evaluation.answer;
             }
         }
         // Fallback to evaluation.structure
         if (!parsingSummary) {
             parsingSummary = evaluation.structure || '';
         }

         return (
         <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 animate-in zoom-in-95">
             <div className="flex items-center gap-2 mb-4">
                 <div className="bg-indigo-600 text-white p-1.5 rounded">
                     <Check size={16} />
                 </div>
                 <h3 className="font-bold text-indigo-900 uppercase tracking-widest text-sm">Solved — What We Learned</h3>
             </div>

             {/* Clue Type */}
             {evaluation.type && (
                 <div className="flex items-center gap-2 mb-4">
                     <span className="text-indigo-400 text-xs font-bold uppercase tracking-widest">Clue Type:</span>
                     <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-xs font-bold">{evaluation.type}</span>
                 </div>
             )}

             {/* Solve Sequence - step by step solving approach */}
             {runtimePattern?.solveSteps?.length ? (
                 <div className="bg-white/70 border border-indigo-200 rounded-lg p-4 mb-4">
                     <span className="text-indigo-400 text-xs font-bold uppercase tracking-widest block mb-3">Solve Sequence</span>
                     <div className="space-y-2">
                         {runtimePattern.solveSteps.map((step, i) => (
                             <div key={i} className="flex gap-2 text-sm">
                                 <span className="text-indigo-500 font-bold min-w-[20px]">{i + 1}.</span>
                                 <span className="text-slate-700">{step}</span>
                             </div>
                         ))}
                     </div>
                 </div>
             ) : parsingSummary ? (
                 <div className="bg-white/70 border border-indigo-200 rounded-lg p-4 mb-4 font-mono text-sm text-indigo-800">
                     <span className="text-indigo-400 text-xs font-sans font-bold uppercase tracking-widest block mb-1">Parsing</span>
                     {parsingSummary}
                 </div>
             ) : null}

             {/* Learnings with collapsible hints */}
             <ul className="space-y-3 mb-6">
                 {learnings.map((L, i) => (
                     <LearningItem key={i} text={L.text} hint={L.hint} />
                 ))}
             </ul>
             <button
                onClick={onNext}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-lg"
             >
                {nextLabel} <ChevronRight size={20} />
             </button>
         </div>
         );
      })()}
    </div>
  );
};
