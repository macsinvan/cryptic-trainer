
import React, { useState, useEffect } from 'react';
import { BookOpen, User, ArrowLeft, Star, Award, Book, Search, Lightbulb, Zap, Target, Palette, Brain, Upload, Layers, Keyboard, Database, Loader2, ExternalLink, MessageSquare, Newspaper, Globe, Sparkles, ChevronRight, Lock, Key, X, FileJson, Code } from 'lucide-react';
import { PUBLICATIONS } from './data';
import { ViewState, Setter, Publication } from './types';
import { TrainingMode } from './components/TrainingMode';
import { SolverMode } from './components/SolverMode';
import { ManualEntryMode } from './components/ManualEntryMode';
import { DataManager } from './components/DataManager';
import { ClueTrainer } from './components/ClueTrainer';
import { getClueCount, getSetterClueCount, initializeClues, subscribeToClues, getCloudConnectionStatus } from './services/clueManager';

const EXTERNAL_BLOGGERS = [
  {
    id: 'bigdave',
    name: "Big Dave's Blog",
    description: "The gold standard for beginners and masters alike. Famous for its technical wordplay analysis and adherence to Ximenean principles.",
    url: 'https://bigdave44.com/',
    color: '#1e40af',
    iconText: 'BD'
  },
  {
    id: 'fifteensquared',
    name: 'FifteenSquared',
    description: 'The definitive daily log for Guardian, FT, Indy, and Azed solvers. Excellent for deep parsing analysis.',
    url: 'https://www.fifteensquared.net/',
    color: '#0ea5e9',
    iconText: '15²'
  },
  {
    id: 'timesforthetimes',
    name: 'Times for the Times',
    description: 'Expert walkthroughs for every Times puzzle. Vital for mastering the subtle "Times" house style.',
    url: 'https://timesforthetimes.co.uk/',
    color: '#111827',
    iconText: 'T'
  },
  {
    id: 'reddit_crosswords',
    name: 'Reddit r/crosswords',
    description: 'A vibrant community for clue-sharing, critique, and solving help. Great for casual discussion and crowdsourced parsing.',
    url: 'https://www.reddit.com/r/crosswords/',
    color: '#ff4500',
    iconText: 'r/'
  }
];

export default function App() {
  const [viewState, setViewState] = useState<ViewState>({ type: 'HOME' });
  const [showDataManager, setShowDataManager] = useState(false);
  const [isDbReady, setIsDbReady] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [cloudStatus, setCloudStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState(false);

  // Test mode for ClueTrainer component (access via ?test=trainer)
  const [showTrainerTest, setShowTrainerTest] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('test') === 'trainer';
  });

  useEffect(() => {
    const init = async () => {
        await initializeClues();
        setIsDbReady(true);
    };
    init();

    // Owner auto-unlock logic for development or previously unlocked users
    const isDev = window.location.hostname.includes('aistudio.google.com') || window.location.hostname === 'localhost';
    const hasKey = localStorage.getItem('owner_unlocked') === 'true';
    if (isDev || hasKey) {
        setIsAdminUnlocked(true);
    }

    const unsubscribe = subscribeToClues(() => {
        setDataVersion(v => v + 1);
        setCloudStatus(getCloudConnectionStatus().status);
    });

    return () => unsubscribe();
  }, []);

  const handleOpenDatabase = () => {
      if (isAdminUnlocked) {
          setShowDataManager(true);
      } else {
          setShowPasswordModal(true);
          setPassError(false);
          setPassInput('');
      }
  };

  const submitPassword = (e?: React.FormEvent) => {
      e?.preventDefault();
      if (passInput === 'dojoMaster') {
          setIsAdminUnlocked(true);
          localStorage.setItem('owner_unlocked', 'true');
          setShowPasswordModal(false);
          setShowDataManager(true);
      } else {
          setPassError(true);
          setPassInput('');
      }
  };

  const handleDownloadSchema = () => {
    const schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "CrypticClueBattlecard",
        "description": "Schema for importing analyzed cryptic clues into the Dojo.",
        "type": "object",
        "properties": {
            "id": { "type": "string" },
            "clue": { "type": "string" },
            "answer": { "type": "string" },
            "type": { "type": "string" },
            "difficulty": { "type": "string", "enum": ["Easy", "Medium", "Hard", "Extreme"] },
            "definition": { "type": "string" },
            "parsing": { "type": "string" },
            "card": {
                "type": "array",
                "description": "The logic battlecard steps.",
                "items": {
                    "type": "object",
                    "properties": {
                        "label": { 
                            "type": "string",
                            "enum": ["DEFINITION", "INDICATOR", "FODDER", "SYNONYM", "CONSTRUCTION"]
                        },
                        "value": { "type": "string" },
                        "hint": { 
                            "type": "string",
                            "description": "LOCKED for DEFINITION: 'The definition is usually at the start or the end of the clue. Sometimes the whole clue is the definition, or there may be two.'"
                        }
                    },
                    "required": ["label", "value"]
                }
            },
            "learnings": {
                "type": "array",
                "items": { "type": "string" }
            }
        },
        "required": ["clue", "answer", "card", "learnings"]
    };

    const blob = new Blob([JSON.stringify(schema, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dojo_clue_schema.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getCurrentPublication = (): Publication | undefined => {
    if (viewState.type === 'HOME') return undefined;
    if (viewState.type === 'TRAINING') return PUBLICATIONS.find(p => p.id === viewState.publicationId);
    if (viewState.type === 'SOLVER') return PUBLICATIONS.find(p => p.id === viewState.publicationId);
    if (viewState.type === 'MANUAL_ENTRY') return PUBLICATIONS.find(p => p.id === viewState.publicationId);
    return PUBLICATIONS.find(p => p.id === (viewState as any).publicationId);
  };

  const getCurrentSetter = (): Setter | undefined => {
    if (viewState.type !== 'SETTER') return undefined;
    const pub = getCurrentPublication();
    return pub?.setters.find(s => s.id === viewState.setterId);
  };

  const renderPublicationTile = (pub: Publication) => {
    const totalClues = isDbReady ? getClueCount(pub.id) : 0;
    
    return (
      <div 
        key={pub.id}
        onClick={() => setViewState({ type: 'PUBLICATION', publicationId: pub.id })}
        className="group bg-white rounded-xl shadow-sm border border-slate-200 p-6 cursor-pointer hover:shadow-xl hover:border-indigo-500 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden flex flex-col"
      >
        <div className="flex justify-between items-start">
            <div 
              className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 text-white font-serif font-black text-xl shadow-inner"
              style={{ backgroundColor: pub.logoColor }}
            >
              {pub.name.charAt(0)}
            </div>
            <div className="text-3xl filter grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-100 transition-all transform group-hover:scale-110">
                {pub.countryFlag}
            </div>
        </div>
        
        <h2 className="text-2xl font-serif font-bold text-slate-900 group-hover:text-guardian-blue transition-colors">
          {pub.name}
        </h2>
        <p className="text-slate-500 mt-2 mb-4 leading-relaxed text-sm line-clamp-2 font-medium">
          {pub.description}
        </p>
        <div className="mt-auto flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-widest pt-4 border-t border-slate-50">
          <div className="flex items-center gap-1.5">
            <User size={14} className="text-indigo-400" />
            {pub.setters.length} Setters
          </div>
          <div className="flex items-center gap-1.5 bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md">
             <Layers size={14} />
             {isDbReady ? `${totalClues} Training Clues` : 'Loading...'}
          </div>
        </div>
      </div>
    );
  };

  const renderHome = () => (
    <div className="max-w-4xl mx-auto px-4 py-8 relative">
      <div className="absolute top-4 right-4">
         <button 
           onClick={handleOpenDatabase}
           className="flex items-center gap-2 px-3 py-2 bg-white text-slate-500 hover:text-indigo-600 rounded-lg shadow-sm border border-slate-200 transition-colors text-sm font-medium relative group"
         >
            {isAdminUnlocked ? <Database size={16} /> : <Lock size={16} className="text-slate-300 group-hover:text-indigo-400" />}
            {isAdminUnlocked ? 'Database' : 'Owner Area'}
            
            {/* Status light is always visible regardless of lock state */}
            {cloudStatus === 'connected' && <span className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white -mt-1 -mr-1"></span>}
            {cloudStatus === 'disconnected' && <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white -mt-1 -mr-1"></span>}
            {cloudStatus === 'connecting' && <span className="absolute top-0 right-0 w-3 h-3 bg-yellow-400 rounded-full border-2 border-white -mt-1 -mr-1 animate-pulse"></span>}
         </button>
      </div>

      <header className="mb-14 text-center pt-8">
        <h1 className="font-serif text-5xl md:text-6xl font-black text-guardian-blue mb-5 tracking-tight">Cryptic Trainer</h1>
        <p className="text-slate-600 text-xl max-w-2xl mx-auto font-medium leading-relaxed">
          Master the art of crossword solving by entering the <span className="text-indigo-600 font-bold underline decoration-indigo-200 underline-offset-4">Dojo</span> of the world's most fair and fiendish setters.
        </p>
      </header>

      {/* Community & Blog Section */}
      <div className="mb-14">
        <h3 className="font-bold text-slate-400 text-xs uppercase tracking-[0.25em] mb-6 flex items-center gap-2 border-b border-slate-200 pb-3">
          <MessageSquare size={14} className="text-indigo-500" />
          Community Bloggers & External Resources
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {EXTERNAL_BLOGGERS.map((blogger) => (
            <a 
              key={blogger.id}
              href={blogger.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="group bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-xl hover:border-indigo-500 transition-all flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white shadow-sm" style={{ backgroundColor: blogger.color }}>
                 {blogger.iconText}
              </div>
              <div>
                 <h4 className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{blogger.name}</h4>
                 <p className="text-sm text-slate-500 leading-snug">{blogger.description}</p>
              </div>
              <ExternalLink size={16} className="ml-auto text-slate-300 group-hover:text-indigo-400" />
            </a>
          ))}
        </div>
      </div>

      {/* Publications Section */}
      <div>
         <h3 className="font-bold text-slate-400 text-xs uppercase tracking-[0.25em] mb-6 flex items-center gap-2 border-b border-slate-200 pb-3">
            <Newspaper size={14} className="text-indigo-500" />
            Select Your Dojo
         </h3>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PUBLICATIONS.map(pub => renderPublicationTile(pub))}
         </div>
      </div>
    </div>
  );

  // Test view for ClueTrainer
  if (showTrainerTest) {
    return (
      <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => {
                setShowTrainerTest(false);
                window.history.replaceState({}, '', window.location.pathname);
              }}
              className="flex items-center text-slate-500 hover:text-slate-800 transition-colors"
            >
              <ArrowLeft size={20} className="mr-2" /> Exit Test Mode
            </button>
            <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-sm font-bold">
              ClueTrainer Test Mode
            </span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 shadow-sm">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-slate-600">Test Publication</span>
                <span className="text-xs text-slate-400">Mock Data</span>
              </div>
            </div>
            <div className="text-xs text-slate-400 mt-2">
              Testing ClueTrainer component with mock data
            </div>
          </div>

          <ClueTrainer
            onNext={() => alert('Next clue would load here')}
            onCorrect={() => console.log('Correct!')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {viewState.type === 'HOME' && renderHome()}
      
      {viewState.type === 'PUBLICATION' && (
         <div className="max-w-4xl mx-auto px-4 py-8">
            <button onClick={() => setViewState({ type: 'HOME' })} className="mb-6 flex items-center text-slate-500 hover:text-indigo-600 font-bold transition-colors">
               <ArrowLeft size={20} className="mr-2" /> Back to Dojo
            </button>
            {(() => {
               const pub = getCurrentPublication();
               if (!pub) return null;
               return (
                  <div className="animate-in fade-in slide-in-from-bottom-4">
                     <div className="flex items-center gap-4 mb-6">
                        <div className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-3xl font-serif font-black shadow-lg" style={{ backgroundColor: pub.logoColor }}>
                           {pub.name.charAt(0)}
                        </div>
                        <div>
                           <h1 className="text-4xl font-serif font-black text-slate-900">{pub.name}</h1>
                           <p className="text-slate-500 font-medium">{pub.description}</p>
                        </div>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <button 
                           onClick={() => setViewState({ type: 'TRAINING', publicationId: pub.id })}
                           className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-500 transition-all text-left group"
                        >
                           <div className="bg-indigo-50 w-12 h-12 rounded-lg flex items-center justify-center text-indigo-600 mb-4 group-hover:scale-110 transition-transform">
                              <Target size={24} />
                           </div>
                           <h3 className="font-bold text-lg text-slate-900 mb-1 group-hover:text-indigo-600">Training Mode</h3>
                           <p className="text-xs text-slate-500 leading-relaxed">Practice with infinite AI-generated clues in the house style.</p>
                        </button>

                        <button 
                           onClick={() => setViewState({ type: 'SOLVER', publicationId: pub.id })}
                           className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-purple-500 transition-all text-left group"
                        >
                           <div className="bg-purple-50 w-12 h-12 rounded-lg flex items-center justify-center text-purple-600 mb-4 group-hover:scale-110 transition-transform">
                              <Sparkles size={24} />
                           </div>
                           <h3 className="font-bold text-lg text-slate-900 mb-1 group-hover:text-purple-600">AI Solver</h3>
                           <p className="text-xs text-slate-500 leading-relaxed">Scan a puzzle grid or upload an image for instant help.</p>
                        </button>

                        <button 
                           onClick={() => setViewState({ type: 'MANUAL_ENTRY', publicationId: pub.id })}
                           className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-emerald-500 transition-all text-left group"
                        >
                           <div className="bg-emerald-50 w-12 h-12 rounded-lg flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform">
                              <Keyboard size={24} />
                           </div>
                           <h3 className="font-bold text-lg text-slate-900 mb-1 group-hover:text-emerald-600">Manual Entry</h3>
                           <p className="text-xs text-slate-500 leading-relaxed">Type in a clue to get a logic breakdown and tutor.</p>
                        </button>
                     </div>
                  </div>
               );
            })()}
         </div>
      )}

      {viewState.type === 'TRAINING' && (
         <TrainingMode 
            publicationId={viewState.publicationId} 
            customClues={viewState.customClues}
            initialIndex={viewState.initialIndex}
            onExit={() => setViewState({ type: 'PUBLICATION', publicationId: viewState.publicationId })}
         />
      )}
      
      {viewState.type === 'SOLVER' && (
         <SolverMode 
            publicationName={PUBLICATIONS.find(p => p.id === viewState.publicationId)?.name || 'Unknown'} 
            onExit={() => setViewState({ type: 'PUBLICATION', publicationId: viewState.publicationId })}
            isAdminUnlocked={isAdminUnlocked}
         />
      )}

      {viewState.type === 'MANUAL_ENTRY' && (
         <ManualEntryMode 
            publicationName={PUBLICATIONS.find(p => p.id === viewState.publicationId)?.name || 'Unknown'} 
            publicationId={viewState.publicationId}
            onExit={() => setViewState({ type: 'PUBLICATION', publicationId: viewState.publicationId })}
         />
      )}

      {showDataManager && (
         <DataManager onClose={() => setShowDataManager(false)} />
      )}

      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
           <form onSubmit={submitPassword} className="bg-white rounded-xl p-8 max-w-sm w-full shadow-2xl">
              <div className="flex justify-center mb-6">
                 <div className="bg-indigo-100 p-3 rounded-full text-indigo-600">
                    <Lock size={24} />
                 </div>
              </div>
              <h3 className="text-xl font-bold text-center mb-2">Owner Access</h3>
              <p className="text-slate-500 text-center text-sm mb-6">Enter the master key to access the database.</p>
              
              <input 
                 type="password" 
                 autoFocus
                 value={passInput}
                 onChange={(e) => setPassInput(e.target.value)}
                 className="w-full border border-slate-300 rounded-lg px-4 py-3 mb-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                 placeholder="Password..."
              />
              {passError && <p className="text-red-500 text-xs font-bold mb-4 text-center">Incorrect password.</p>}
              
              <div className="flex gap-3">
                 <button type="button" onClick={() => setShowPasswordModal(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-lg">Cancel</button>
                 <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700">Unlock</button>
              </div>
           </form>
        </div>
      )}
    </div>
  );
}
