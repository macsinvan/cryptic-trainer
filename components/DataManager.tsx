
import React, { useRef, useState, useEffect } from 'react';
// Added ChevronRight to the imports from lucide-react to fix the 'Cannot find name' error.
import { Download, Upload, Trash2, Database, X, Check, AlertTriangle, Package, Loader2, Zap, Cloud, CloudOff, FileJson, Users, RefreshCw, Activity, ShieldCheck, Terminal, ChevronRight, FileCode } from 'lucide-react';
import { exportUserData, importUserData, clearUserData, getCustomClueCount, saveClue, getCloudConnectionStatus, subscribeToClues, refreshConnection, getParserIssues, ParserIssue, migrateFromBrowser, getLegacyClues } from '../services/clueManager';
import { evaluateClue } from '../services/aiService';
import { ScannedClue } from '../types';
import { PRESET_PUZZLES } from '../data/puzzlePacks';

interface DataManagerProps {
    onClose: () => void;
}

export const DataManager: React.FC<DataManagerProps> = ({ onClose }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [count, setCount] = useState(0);
    const [status, setStatus] = useState<{type: 'success' | 'error' | 'info', message: string} | null>(null);
    const [cloudInfo, setCloudInfo] = useState(getCloudConnectionStatus());
    const [isRefreshing, setIsRefreshing] = useState(false);
    
    // Batch Processing State
    const [processingPackId, setProcessingPackId] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [totalToProcess, setTotalToProcess] = useState(0);
    const [stage, setStage] = useState<'PARSING' | 'SOLVING'>('PARSING');

    // Parser Issues State
    const [parserIssues, setParserIssues] = useState<ParserIssue[]>([]);
    const [expandedIssue, setExpandedIssue] = useState<string | null>(null);

    // Migration State
    const [legacyCount, setLegacyCount] = useState(0);
    const [isMigrating, setIsMigrating] = useState(false);

    useEffect(() => {
        setCount(getCustomClueCount());
        setCloudInfo(getCloudConnectionStatus());

        // Load parser issues
        getParserIssues().then(setParserIssues);

        // Check for legacy browser data
        getLegacyClues().then(items => setLegacyCount(items.length));

        const unsubscribe = subscribeToClues(() => {
            setCloudInfo(getCloudConnectionStatus());
            setCount(getCustomClueCount());
        });

        return () => unsubscribe();
    }, []);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await refreshConnection();
        setIsRefreshing(false);
        setStatus({ type: 'info', message: 'Connection diagnostics updated.' });
    };

    const handleExport = async () => {
        const json = await exportUserData();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cryptic_trainer_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setStatus({ type: 'success', message: 'Backup file downloaded.' });
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
        setStatus({ type: 'success', message: 'Schema definition downloaded.' });
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            const content = ev.target?.result as string;
            const result = await importUserData(content);
            if (result.success) {
                setStatus({ type: 'success', message: result.message });
            } else {
                setStatus({ type: 'error', message: result.message });
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleClear = async () => {
        if (confirm("Are you sure? This deletes local custom clues.")) {
            await clearUserData();
            setStatus({ type: 'info', message: 'Local data cleared.' });
        }
    };

    const handleResetDatabase = () => {
        if (confirm("⚠️ RESET DATABASE?\n\nThis will delete ALL clues and reload the page.\n\nAre you sure?")) {
            indexedDB.deleteDatabase('CrypticTrainerDB_V2');
            setStatus({ type: 'info', message: 'Database reset. Reloading...' });
            setTimeout(() => location.reload(), 500);
        }
    };

    const handleMigrateFromBrowser = async () => {
        if (legacyCount === 0) {
            setStatus({ type: 'info', message: 'No browser data to migrate.' });
            return;
        }

        setIsMigrating(true);
        try {
            const result = await migrateFromBrowser();
            setLegacyCount(0);
            setStatus({
                type: 'success',
                message: `Migrated ${result.migrated} clues to server. Browser storage cleared.`
            });
        } catch (e) {
            setStatus({ type: 'error', message: `Migration failed: ${e}` });
        } finally {
            setIsMigrating(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[95vh] border border-white/20">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                    <div className="flex items-center gap-3 text-slate-900">
                        <div className="bg-indigo-600 p-2 rounded-lg shadow-lg">
                            <Database className="text-white" size={20} />
                        </div>
                        <h2 className="font-serif text-xl font-bold tracking-tight">Cloud Dojo Hub</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8 overflow-y-auto bg-white">
                    {/* Status Header */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                        <div className={`p-5 rounded-2xl flex flex-col gap-3 border shadow-sm transition-all ${
                            cloudInfo.status === 'connected' ? 'bg-emerald-50 border-emerald-200' :
                            cloudInfo.status === 'connecting' ? 'bg-amber-50 border-amber-200' :
                            'bg-rose-50 border-rose-200'
                        }`}>
                            <div className="flex items-center justify-between">
                                <div className={`p-2 rounded-lg ${cloudInfo.status === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'} text-white shadow-md`}>
                                    {cloudInfo.status === 'connected' ? <Cloud size={18} /> : <CloudOff size={18} />}
                                </div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</div>
                            </div>
                            <div>
                                <h3 className={`font-bold text-sm ${cloudInfo.status === 'connected' ? 'text-emerald-800' : 'text-rose-800'}`}>
                                    {cloudInfo.status === 'connected' ? 'Cloud Sync Online' : 
                                     cloudInfo.status === 'connecting' ? 'Synchronizing...' : 
                                     'Cloud Sync Offline'}
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    {cloudInfo.status === 'connected' ? 'Puzzles are stored in the Dojo Cloud.' : 'Check your internet connection.'}
                                </p>
                            </div>
                        </div>

                        <div className="p-5 rounded-2xl bg-indigo-50 border border-indigo-100 flex flex-col gap-3 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="p-2 rounded-lg bg-indigo-600 text-white shadow-md">
                                    <Users size={18} />
                                </div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Total Users</div>
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-indigo-900 leading-none">
                                    {cloudInfo.userCount || 1}
                                </h3>
                                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-tighter mt-1">
                                    Unique Trainees Detected
                                </p>
                            </div>
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col gap-3 shadow-xl">
                            <div className="flex items-center justify-between">
                                <div className="p-2 rounded-lg bg-indigo-500 text-white shadow-md">
                                    <Activity size={18} />
                                </div>
                                <button 
                                    onClick={handleRefresh}
                                    disabled={isRefreshing}
                                    className="text-indigo-400 hover:text-white transition-colors"
                                >
                                    <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                                </button>
                            </div>
                            <div>
                                <h3 className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1 flex items-center gap-1">
                                    <ShieldCheck size={10} /> Your Device ID
                                </h3>
                                <p className="text-[10px] font-mono text-slate-400 truncate bg-black/30 p-1.5 rounded border border-white/5">
                                    {cloudInfo.currentUserId || 'Unknown'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {status && (
                        <div className={`mb-8 p-4 rounded-xl text-sm font-bold flex items-center gap-3 animate-in slide-in-from-top-2 ${
                            status.type === 'success' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 
                            status.type === 'error' ? 'bg-rose-100 text-rose-700 border border-rose-200' : 
                            'bg-sky-100 text-sky-700 border border-sky-200'
                        }`}>
                            {status.type === 'success' ? <Check size={18} /> : 
                             status.type === 'error' ? <AlertTriangle size={18} /> : 
                             <Activity size={18} />}
                            {status.message}
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                        {/* Live Connection Trace */}
                        <div className="space-y-6">
                            <h3 className="font-bold text-slate-400 text-xs uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-3">
                                <Terminal size={14} className="text-indigo-500" />
                                Live Activity Diagnostics
                            </h3>
                            
                            <div className="bg-slate-950 rounded-xl p-4 font-mono text-[10px] text-emerald-400/90 shadow-2xl overflow-hidden relative">
                                <div className="absolute top-0 right-0 p-2 opacity-20 pointer-events-none">
                                    <Activity size={48} className="text-emerald-500" />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2 border-b border-white/10 pb-2 mb-1">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                        <span className="text-white font-bold uppercase tracking-widest">Recent Active Trainees</span>
                                    </div>
                                    {cloudInfo.recentUsers && cloudInfo.recentUsers.length > 0 ? (
                                        cloudInfo.recentUsers.map((u, i) => (
                                            <div key={i} className={`flex justify-between items-center py-1 border-b border-white/5 last:border-0 ${u.id === cloudInfo.currentUserId ? 'text-white' : ''}`}>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-slate-600">{i+1}.</span>
                                                    <span className="truncate max-w-[120px]">{u.id}</span>
                                                    {u.id === cloudInfo.currentUserId && <span className="bg-indigo-500 text-white text-[8px] px-1 rounded font-sans font-black">THIS DEVICE</span>}
                                                </div>
                                                <span className="text-slate-500">{new Date(u.last_active).toLocaleTimeString()}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-4 text-center text-slate-600 italic">No cloud activity logs found...</div>
                                    )}
                                    {cloudInfo.error && (
                                        <div className="mt-4 p-2 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded">
                                            ERROR LOG: {cloudInfo.error}
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs leading-relaxed flex gap-3">
                                <AlertTriangle size={18} className="shrink-0 text-amber-500" />
                                <div>
                                    <p className="font-bold mb-1">Tracking Note:</p>
                                    <p>We use unique browser-stored IDs (LocalStorage). Changing your IP or using a VPN on the same browser will <strong>not</strong> count as a new user. To verify tracking, please use a completely different device or a different browser type (e.g. Chrome vs Safari).</p>
                                </div>
                            </div>
                        </div>

                        {/* Traditional Controls */}
                        <div className="space-y-6">
                            <h3 className="font-bold text-slate-400 text-xs uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-3">
                                <ShieldCheck size={14} className="text-indigo-500" />
                                Data Control Panel
                            </h3>
                            
                            <div className="space-y-4">
                                <div className="flex gap-3">
                                    <button 
                                        onClick={handleExport}
                                        className="flex-1 py-3 px-4 bg-white border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 text-slate-700 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-sm group"
                                    >
                                        <Download size={16} className="text-slate-400 group-hover:text-indigo-600" />
                                        Export JSON
                                    </button>
                                    <button 
                                        onClick={handleImportClick}
                                        className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg"
                                    >
                                        <Upload size={16} />
                                        Import JSON
                                    </button>
                                </div>
                                
                                {/* Enhanced Schema Section */}
                                <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-white rounded-lg border border-slate-200 text-slate-500">
                                            <FileCode size={18} />
                                        </div>
                                        <div>
                                            <h5 className="font-bold text-slate-700 text-sm">JSON Battlecard Schema</h5>
                                            <p className="text-[10px] text-slate-500 mt-0.5">Standard definition for AI & imports</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={handleDownloadSchema}
                                        className="px-4 py-2 bg-white text-indigo-600 border border-indigo-200 rounded-lg text-xs font-bold shadow-sm hover:border-indigo-400 hover:shadow-md transition-all flex items-center gap-2"
                                    >
                                        <Download size={14} />
                                        Download
                                    </button>
                                </div>

                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    accept=".json" 
                                    className="hidden" 
                                    onChange={handleFileChange} 
                                />

                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex items-center justify-between">
                                    <div>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Local Inventory</span>
                                        <span className="text-slate-900 font-bold text-lg">{count} Custom Clues</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handleClear}
                                            className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors border border-transparent hover:border-rose-100"
                                            title="Clear Custom Clues"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                        <button
                                            onClick={handleResetDatabase}
                                            className="px-3 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors"
                                            title="Reset entire database"
                                        >
                                            Reset DB
                                        </button>
                                    </div>
                                </div>

                                {/* Migration from Browser */}
                                {legacyCount > 0 && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest block mb-1">
                                                <AlertTriangle size={10} className="inline mr-1" />
                                                Browser Data Found
                                            </span>
                                            <span className="text-amber-900 font-bold text-lg">{legacyCount} clues in IndexedDB</span>
                                            <p className="text-xs text-amber-700 mt-1">Migrate to server for persistent storage</p>
                                        </div>
                                        <button
                                            onClick={handleMigrateFromBrowser}
                                            disabled={isMigrating}
                                            className="px-4 py-2 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {isMigrating ? (
                                                <>
                                                    <Loader2 size={14} className="animate-spin" />
                                                    Migrating...
                                                </>
                                            ) : (
                                                <>
                                                    <Upload size={14} />
                                                    Migrate to Server
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="mt-6">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Legacy Puzzle Packs</h4>
                                <div className="space-y-3">
                                    {PRESET_PUZZLES.slice(0, 1).map(pack => (
                                        <div key={pack.id} className="border border-slate-100 bg-slate-50/50 rounded-xl p-4 flex items-center justify-between group hover:bg-white hover:shadow-md hover:border-indigo-200 transition-all">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                                                    <Package size={16} />
                                                </div>
                                                <div>
                                                    <h5 className="font-bold text-sm text-slate-800">{pack.name}</h5>
                                                    <p className="text-[10px] text-slate-500">Quick Analysis Set</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setStatus({type: 'info', message: 'Use the Solver mode to process packs.'})}
                                                className="p-2 text-indigo-400 hover:text-indigo-600"
                                            >
                                                <ChevronRight size={18} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Parser Issues Section */}
                            <div className="mt-6">
                                <h4 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <AlertTriangle size={12} />
                                    Failed Imports ({parserIssues.length})
                                </h4>
                                {parserIssues.length === 0 ? (
                                    <div className="border border-slate-100 bg-slate-50/50 rounded-xl p-4 text-center text-slate-400 text-sm">
                                        No failed imports to review
                                    </div>
                                ) : (
                                    <div className="space-y-3 max-h-64 overflow-y-auto">
                                        {parserIssues.map(issue => (
                                            <div
                                                key={issue.id}
                                                className="border border-amber-200 bg-amber-50 rounded-xl p-4 hover:bg-amber-100 transition-all"
                                            >
                                                <div
                                                    className="flex items-start justify-between cursor-pointer"
                                                    onClick={() => setExpandedIssue(expandedIssue === issue.id ? null : issue.id)}
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-mono text-sm text-slate-800 truncate">
                                                            {issue.clueText || 'Unknown clue'}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="bg-amber-200 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">
                                                                {issue.answer || '?'}
                                                            </span>
                                                            <span className="text-[10px] text-amber-600">
                                                                {issue.specialCaseType}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <ChevronRight
                                                        size={16}
                                                        className={`text-amber-400 transition-transform ${expandedIssue === issue.id ? 'rotate-90' : ''}`}
                                                    />
                                                </div>

                                                {expandedIssue === issue.id && (
                                                    <div className="mt-3 pt-3 border-t border-amber-200 space-y-2">
                                                        <div>
                                                            <span className="text-[10px] font-bold text-amber-700 uppercase">Reason:</span>
                                                            <p className="text-xs text-slate-600">{issue.specialCaseReason}</p>
                                                        </div>
                                                        {issue.parsing && (
                                                            <div>
                                                                <span className="text-[10px] font-bold text-amber-700 uppercase">Parsing:</span>
                                                                <p className="text-xs text-slate-600 font-mono">{issue.parsing}</p>
                                                            </div>
                                                        )}
                                                        <div>
                                                            <span className="text-[10px] font-bold text-amber-700 uppercase">Full Input:</span>
                                                            <pre className="text-[10px] text-slate-500 bg-white p-2 rounded mt-1 overflow-x-auto whitespace-pre-wrap">
                                                                {issue.fullInput || 'N/A'}
                                                            </pre>
                                                        </div>
                                                        <div className="text-[10px] text-slate-400">
                                                            Saved: {new Date(issue.timestamp).toLocaleString()}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="bg-slate-50 p-6 border-t border-slate-100 flex justify-end gap-4 shrink-0">
                    <button onClick={onClose} className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg">
                        Close Diagnostics
                    </button>
                </div>
            </div>
        </div>
    );
};
