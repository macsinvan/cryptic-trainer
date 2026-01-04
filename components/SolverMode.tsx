import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Upload, Camera, Search, Loader2, ChevronRight, Lightbulb, CheckCircle, HelpCircle, X, Clipboard, FileText, Database, Image as ImageIcon, RefreshCw, Save, Zap, Brain, AlertTriangle, WifiOff, Flag } from 'lucide-react';
import { analyzeCrosswordImage, evaluateClue, verifyClueChallenge } from '../services/aiService';
import { findKnownClue, saveClue, mapToValidClueType, getClueCount } from '../services/clueManager';
import { ScannedCrossword, ScannedClue, ClueEvaluation, ClueType } from '../types';
import { ClueSolver } from './ClueSolver';
import { STANDARD_CLUE_TYPES, PUBLICATIONS } from '../data';

interface SolverModeProps {
  onExit: () => void;
  publicationName: string;
  isAdminUnlocked?: boolean;
}

export const SolverMode: React.FC<SolverModeProps> = ({ onExit, publicationName, isAdminUnlocked = false }) => {
  const [inputMethod, setInputMethod] = useState<'IMAGE' | 'TEXT'>('IMAGE');
  const [pastedText, setPastedText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedData, setScannedData] = useState<ScannedCrossword | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [selectedClue, setSelectedClue] = useState<ScannedClue | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [evaluation, setEvaluation] = useState<ClueEvaluation | null>(null);
  const [solvedClues, setSolvedClues] = useState<Record<string, string>>({});
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);

  // Live Counter
  const [totalClueCount, setTotalClueCount] = useState(0);

  useEffect(() => {
    const pubId = PUBLICATIONS.find(p => p.name === publicationName)?.id || 'express';
    setTotalClueCount(getClueCount(pubId));
  }, [publicationName]);

  // Cycle loading messages
  useEffect(() => {
    if (!isEvaluating) return;
    const messages = [
        "Consulting the Setter...",
        "Identifying clue type...",
        "Breaking down wordplay...",
        "Generating coaching steps...",
        "Finalizing solution..."
    ];
    let i = 0;
    setLoadingMessage(messages[0]);
    const interval = setInterval(() => {
        i = (i + 1) % messages.length;
        setLoadingMessage(messages[i]);
    }, 1500);
    return () => clearInterval(interval);
  }, [isEvaluating]);

  const getClueId = (clue: ScannedClue) => `${clue.number}-${clue.direction}`;

  const startCamera = async () => {
    setShowCamera(true);
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera start error:", err);
      setCameraError("Could not access camera. Please check permissions or upload a file instead.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
            setFile(file);
            setPreviewUrl(URL.createObjectURL(file));
            setScannedData(null);
            setError(null);
            setSolvedClues({});
            stopCamera();
          }
        }, 'image/jpeg');
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
      setScannedData(null);
      setError(null);
      setSolvedClues({});
    }
  };

  const handleScan = async () => {
    if (!file) return;
    setIsScanning(true);
    setError(null);
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const base64String = (reader.result as string).split(',')[1];
        const result = await analyzeCrosswordImage(publicationName, base64String, file.type);
        if (result && result.clues.length > 0) {
            setScannedData(result);
        } else {
            setError("No clues found. Please ensure image is clear.");
        }
      } catch (e) {
          setError("Failed to scan image.");
      } finally {
          setIsScanning(false);
      }
    };
  };

  const handleTextParse = () => {
      if (!pastedText.trim()) return;
      
      const clues: ScannedClue[] = [];
      const lines = pastedText.split('\n');
      let currentDirection: 'across' | 'down' = 'across';
      let currentClue: ScannedClue | null = null;

      for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // 1. Check for Direction Header
          if (/^ACROSS/i.test(trimmed)) { currentDirection = 'across'; continue; }
          if (/^DOWN/i.test(trimmed)) { currentDirection = 'down'; continue; }

          // 2. Check for Start of a New Clue (Number + Text)
          // Matches: "8a. Clue (8)" or "1. Clue (5)"
          const clueMatch = trimmed.match(/^\**(\d+)([ad])?[\.\)]?\s+(.+?)(\(\d+(?:,\s*\d+)*\))\s*(\*+)?$/i);
          
          if (clueMatch) {
              if (currentClue) clues.push(currentClue); // Push previous

              const num = clueMatch[1];
              const dirChar = clueMatch[2];
              const text = clueMatch[3].trim() + (clueMatch[4] ? ` ${clueMatch[4]}` : '');
              
              // Infer direction from '8a' or '1d' if present, else use section header
              let dir = currentDirection;
              if (dirChar) dir = dirChar.toLowerCase() === 'a' ? 'across' : 'down';

              currentClue = {
                  number: num,
                  direction: dir,
                  text: text,
                  answer: undefined,
                  originalType: undefined,
                  originalParsing: undefined
              };
              continue;
          }

          // 3. Check for Metadata (ANSWER, TYPE, PARSING) belonging to current clue
          if (currentClue) {
              const answerMatch = trimmed.match(/^ANSWER:\s*(.+)$/i);
              if (answerMatch) {
                  currentClue.answer = answerMatch[1].trim().toUpperCase();
                  continue;
              }

              const typeMatch = trimmed.match(/^TYPE:\s*(.+)$/i);
              if (typeMatch) {
                  currentClue.originalType = typeMatch[1].trim();
                  continue;
              }

              const parsingMatch = trimmed.match(/^PARSING:\s*(.+)$/i);
              if (parsingMatch) {
                  currentClue.originalParsing = parsingMatch[1].trim();
                  continue;
              }
          }
      }
      
      // Push final clue
      if (currentClue) clues.push(currentClue);

      if (clues.length > 0) {
          setScannedData({ clues });
          setError(null);
      } else {
          setError("Could not parse clues. Try formatting like: '1. Clue text (6)' or paste the full analysis block.");
      }
  };

  const selectClue = async (clue: ScannedClue) => {
      setSelectedClue(clue);
      setEvaluation(null);

      const known = findKnownClue(clue.text);
      if (known) {
         setEvaluation(known);
      } else {
         setIsEvaluating(true);
         
         // Construct rich context string to speed up AI
         let richContext = clue.answer ? `Answer: ${clue.answer}. ` : '';
         if (clue.originalType) richContext += `Type: ${clue.originalType}. `;
         if (clue.originalParsing) richContext += `Parsing: ${clue.originalParsing}. `;

         const result = await evaluateClue(clue.text, richContext);
         if (result) {
            setEvaluation(result);
         }
         setIsEvaluating(false);
      }
  };

  const handleBatchProcess = async () => {
      if (!scannedData || !isAdminUnlocked) return;
      setBatchProcessing(true);
      setBatchProgress(0);
      const total = scannedData.clues.length;
      const pubId = PUBLICATIONS.find(p => p.name === publicationName)?.id || 'express';

      for (let i = 0; i < total; i++) {
          const clue = scannedData.clues[i];
          const known = findKnownClue(clue.text);
          if (!known) {
              // Throttle slightly
              if (i > 0) await new Promise(r => setTimeout(r, 2000));
              try {
                   // Construct rich context
                   let richContext = clue.answer ? `Answer: ${clue.answer}. ` : '';
                   if (clue.originalType) richContext += `Type: ${clue.originalType}. `;
                   if (clue.originalParsing) richContext += `Parsing: ${clue.originalParsing}. `;

                  const result = await evaluateClue(clue.text, richContext);
                  if (result) {
                      const isNew = await saveClue(pubId, clue.text, result);
                      if (isNew) setTotalClueCount(prev => prev + 1);
                  }
              } catch (e) {
                  console.error("Batch error", e);
              }
          }
          setBatchProgress(Math.round(((i + 1) / total) * 100));
      }
      setBatchProcessing(false);
      alert("All clues analyzed and added to Training Dojo!");
  };

  const handleFinishClue = () => {
      setSelectedClue(null);
  };

  const handleSolved = async () => {
      if (selectedClue && evaluation) {
          const id = getClueId(selectedClue);
          setSolvedClues(prev => ({ ...prev, [id]: evaluation.answer }));
          const pubId = PUBLICATIONS.find(p => p.name === publicationName)?.id || 'express';
          const isNew = await saveClue(pubId, selectedClue.text, evaluation);
          if (isNew) {
            setTotalClueCount(prev => prev + 1); 
          }
          setShowSavedToast(true);
          setTimeout(() => setShowSavedToast(false), 3000);
      }
  };
  
  const currentIndex = scannedData?.clues.findIndex(c => c === selectedClue) ?? -1;
  const hasNextClue = scannedData && currentIndex !== -1 && currentIndex < scannedData.clues.length - 1;

  const handleNextNavigation = () => {
      if (hasNextClue && scannedData) {
          const nextClue = scannedData.clues[currentIndex + 1];
          selectClue(nextClue);
      } else {
          handleFinishClue();
      }
  };

  if (showCamera) {
      return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
            <div className="flex-1 relative bg-black flex items-center justify-center">
                {cameraError ? (
                    <div className="text-white text-center p-4">
                        <X size={48} className="mx-auto text-red-500 mb-4" />
                        <p>{cameraError}</p>
                        <button onClick={stopCamera} className="mt-4 px-4 py-2 bg-white text-black rounded font-bold">Close</button>
                    </div>
                ) : (
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                )}
                {!cameraError && (
                    <div className="absolute inset-0 border-[40px] border-black/50 pointer-events-none">
                        <div className="w-full h-full border-2 border-white/50 relative">
                            <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-white"></div>
                            <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-white"></div>
                            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-white"></div>
                            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-white"></div>
                        </div>
                        <div className="absolute bottom-4 left-0 right-0 text-center">
                             <div className="bg-black/70 inline-block px-4 py-2 rounded-full text-white text-xs">
                                Camera blocked? Check site permissions in browser settings.
                             </div>
                        </div>
                    </div>
                )}
            </div>
            <div className="h-24 bg-black flex items-center justify-between px-8">
                <button onClick={stopCamera} className="text-white font-medium">Cancel</button>
                <button onClick={capturePhoto} className="w-16 h-16 rounded-full bg-white border-4 border-slate-300 flex items-center justify-center shadow-lg active:scale-95 transition-transform">
                    <div className="w-14 h-14 rounded-full bg-white border-2 border-black" />
                </button>
                <div className="w-12"></div>
            </div>
        </div>
      );
  }

  const renderContent = () => {
    // 1. Scan/Upload View
    if (!scannedData) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center animate-in fade-in">
                <div className="flex justify-center mb-6">
                    <div className="bg-white border-2 border-indigo-100 px-4 py-1.5 rounded-full flex items-center gap-2 text-indigo-600 shadow-sm">
                        <Camera size={16} />
                        <span className="text-xs font-black uppercase tracking-widest">Scan Image</span>
                    </div>
                </div>
                <h2 className="text-2xl font-serif font-bold text-slate-900 mb-2">
                    {inputMethod === 'IMAGE' ? 'Scan Your Puzzle' : 'Import Clues'}
                </h2>
                {inputMethod === 'IMAGE' ? (
                    <>
                        <p className="text-slate-600 mb-8 max-w-md mx-auto">Use your camera to scan the crossword grid or clues.</p>
                        <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileSelect} />
                        {!previewUrl ? (
                            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                <button onClick={startCamera} className="px-6 py-3 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 flex items-center justify-center gap-2">
                                    <Camera size={18} /> Take Photo
                                </button>
                                <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-50 flex items-center justify-center gap-2">
                                    <ImageIcon size={18} /> Upload File
                                </button>
                                <button onClick={() => setInputMethod('TEXT')} className="px-6 py-3 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-50 flex items-center justify-center gap-2">
                                    <FileText size={18} /> Paste Text
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <img src={previewUrl} alt="Preview" className="w-64 h-64 mx-auto rounded-lg object-cover border-2 border-slate-200" />
                                {error && <div className="text-red-600 text-sm font-bold bg-red-50 p-3 rounded">{error}</div>}
                                <div className="flex gap-4 justify-center">
                                    <button onClick={() => setPreviewUrl(null)} className="px-4 py-3 text-slate-500 font-bold hover:text-slate-700">Retake</button>
                                    <button onClick={handleScan} disabled={isScanning} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2 disabled:opacity-70">
                                        {isScanning ? <><Loader2 size={18} className="animate-spin" /> Scanning...</> : <><Search size={18} /> Scan & List Clues</>}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <p className="text-slate-600 mb-6 max-w-md mx-auto">Copy clues from a website (e.g. Guardian) or a full analysis text block and paste here.</p>
                        <textarea value={pastedText} onChange={(e) => setPastedText(e.target.value)} placeholder={`1. Example clue text (5)\n2. Another clue (4)`} className="w-full h-48 p-4 border border-slate-300 rounded-lg mb-4 font-mono text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                        {error && <div className="text-red-600 text-sm font-bold bg-red-50 p-3 rounded mb-4">{error}</div>}
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <button onClick={() => { setInputMethod('IMAGE'); setPastedText(''); setError(null); }} className="px-6 py-3 text-slate-500 font-bold hover:text-slate-700">
                                Cancel
                            </button>
                            <button onClick={handleTextParse} disabled={!pastedText.trim()} className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2 disabled:opacity-50">
                                <Clipboard size={18} /> Parse Clues
                            </button>
                        </div>
                    </>
                )}
            </div>
        );
    }

    // 2. Clue List View (List of scanned clues)
    if (!selectedClue) {
        return (
            <div className="animate-in fade-in">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="font-serif text-xl font-bold text-slate-900">Detected Clues</h2>
                    {isAdminUnlocked && (
                        !batchProcessing ? (
                            <button onClick={handleBatchProcess} className="flex items-center gap-2 text-indigo-600 font-bold hover:text-indigo-800 text-sm bg-indigo-50 px-3 py-1.5 rounded-lg">
                                <Database size={16} /> Add All to Training
                            </button>
                        ) : (
                            <div className="flex items-center gap-2 text-indigo-600 font-bold text-sm bg-indigo-50 px-3 py-1.5 rounded-lg">
                                <Loader2 size={16} className="animate-spin" /> Processing {batchProgress}%
                            </div>
                        )
                    )}
                </div>
                <div className="grid grid-cols-1 gap-2">
                    {scannedData.clues.map((clue, idx) => {
                        const id = getClueId(clue);
                        const isSolved = !!solvedClues[id];
                        const answer = solvedClues[id];
                        const isKnown = !!findKnownClue(clue.text);
                        const hasRichData = clue.answer && clue.originalParsing;
                        
                        return (
                            <div key={idx} onClick={() => selectClue(clue)} className={`bg-white border rounded-lg p-4 cursor-pointer transition-all flex justify-between items-center group ${isSolved ? 'border-green-200 bg-green-50' : isKnown ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 hover:border-indigo-400 hover:shadow-md'}`}>
                                <div className="flex gap-4 items-center flex-1">
                                    <span className={`font-mono font-bold w-8 ${isSolved ? 'text-green-600' : 'text-slate-400'}`}>{clue.number}</span>
                                    <div className="flex flex-col">
                                        <span className={`font-medium ${isSolved ? 'text-green-800 line-through opacity-70' : 'text-slate-800 group-hover:text-indigo-900'}`}>{clue.text}</span>
                                        {isSolved && <span className="text-sm font-mono font-bold text-green-600 mt-1 uppercase tracking-wider">{answer}</span>}
                                        {!isSolved && isKnown && <span className="text-xs font-bold text-indigo-500 mt-1 uppercase flex items-center gap-1"><Zap size={12} fill="currentColor" /> Ready to Solve</span>}
                                        {!isSolved && !isKnown && hasRichData && <span className="text-xs font-bold text-blue-500 mt-1 uppercase flex items-center gap-1"><Brain size={12} /> Rich Context</span>}
                                    </div>
                                </div>
                                {isSolved ? <CheckCircle size={18} className="text-green-500" /> : isKnown ? <Zap size={18} className="text-indigo-500" fill="currentColor" /> : <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-500" />}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // 3. Loading State (If Evaluating)
    if (isEvaluating) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center animate-in fade-in">
                <div className="relative mb-6">
                    <div className="absolute inset-0 bg-purple-100 rounded-full animate-ping opacity-20"></div>
                    <div className="relative bg-purple-50 p-4 rounded-full inline-block">
                        <Brain size={48} className="text-purple-600 animate-pulse" />
                    </div>
                </div>
                <h3 className="text-xl font-serif font-bold text-slate-900 mb-2">{loadingMessage}</h3>
                <p className="text-slate-500 text-sm">Analyzing cryptic indicators and wordplay structure...</p>
                <div className="mt-8 flex justify-center gap-2">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
            </div>
        );
    }

    // 4. Solving View
    return (
         <ClueSolver 
            evaluation={evaluation!}
            setterName={publicationName}
            level={evaluation?.difficulty?.toLowerCase() || 'medium'}
            onCorrect={handleSolved} 
            onNext={handleNextNavigation}
            nextLabel={hasNextClue ? "Next Clue" : "Return to List"}
        />
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans relative">
         <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <button 
                    onClick={selectedClue ? () => { setSelectedClue(null); setEvaluation(null); } : onExit} 
                    className="flex items-center text-slate-500 hover:text-slate-900 font-medium transition-colors"
                >
                    <ArrowLeft size={20} className="mr-2" /> 
                    {selectedClue ? 'Back to List' : 'Back'}
                </button>

                <div className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2">
                    <span>Training Clues:</span>
                    <span className="text-indigo-900">{totalClueCount}</span>
                </div>
            </div>

            {showSavedToast && (
                <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-full shadow-xl font-bold flex items-center gap-2 animate-in slide-in-from-top-4 z-50">
                    <Save size={18} /> 
                    <span>Saved to Training Dojo</span>
                </div>
            )}

            {renderContent()}
         </div>
    </div>
  );
};
