import React, { useState, useEffect } from 'react';
import { ArrowLeft, Settings, Filter, AlertCircle } from 'lucide-react';
import { getSettings, saveSettings, AdminFilters } from '../services/clueManager';

interface AdminSetupProps {
  onExit: () => void;
  username: string;
}

export function AdminSetup({ onExit, username }: AdminSetupProps) {
  const [filters, setFilters] = useState<AdminFilters>({
    showOnlyUnverified: false,
    showOnlyWithIssues: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getSettings();
        if (settings.adminFilters) {
          setFilters(settings.adminFilters);
        }
      } catch {
        // Use defaults
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  // Handle toggle change
  const handleToggle = async (key: keyof AdminFilters) => {
    const newFilters = { ...filters, [key]: !filters[key] };
    setFilters(newFilters);
    setSaving(true);
    setMessage(null);

    try {
      await saveSettings({ adminFilters: newFilters });
      setMessage('Saved');
      setTimeout(() => setMessage(null), 1500);
    } catch {
      setMessage('Failed to save');
      // Revert on failure
      setFilters(filters);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button
        onClick={onExit}
        className="mb-6 flex items-center text-slate-500 hover:text-indigo-600 font-bold transition-colors"
      >
        <ArrowLeft size={20} className="mr-2" /> Back to Home
      </button>

      <div className="animate-in fade-in slide-in-from-bottom-4">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-indigo-600 text-white text-2xl font-bold shadow-lg">
            <Settings size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-serif font-black text-slate-900">Admin Setup</h1>
            <p className="text-slate-500 font-medium">Logged in as <span className="text-indigo-600 font-bold">{username}</span></p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-purple-100 w-10 h-10 rounded-lg flex items-center justify-center text-purple-600">
              <Filter size={20} />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900">Training Queue Filters</h3>
              <p className="text-sm text-slate-500">Control which clues appear in Training Mode</p>
            </div>
            {message && (
              <span className={`ml-auto text-sm font-medium ${message === 'Saved' ? 'text-green-600' : 'text-red-600'}`}>
                {message}
              </span>
            )}
          </div>

          <div className="space-y-4">
            {/* Show only unverified toggle */}
            <label className="flex items-center justify-between p-4 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 w-8 h-8 rounded-lg flex items-center justify-center text-green-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <span className="font-medium text-slate-800">Show only unverified clues</span>
                  <p className="text-sm text-slate-500">Filter queue to clues that haven't been verified yet</p>
                </div>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={filters.showOnlyUnverified}
                  onChange={() => handleToggle('showOnlyUnverified')}
                  disabled={saving}
                  className="sr-only"
                />
                <div className={`w-11 h-6 rounded-full transition-colors ${filters.showOnlyUnverified ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform mt-0.5 ${filters.showOnlyUnverified ? 'translate-x-5.5 ml-0.5' : 'translate-x-0.5'}`} />
                </div>
              </div>
            </label>

            {/* Show only with issues toggle */}
            <label className="flex items-center justify-between p-4 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 w-8 h-8 rounded-lg flex items-center justify-center text-amber-600">
                  <AlertCircle size={16} />
                </div>
                <div>
                  <span className="font-medium text-slate-800">Show only clues with issues</span>
                  <p className="text-sm text-slate-500">Filter queue to clues that have reported issues</p>
                </div>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={filters.showOnlyWithIssues}
                  onChange={() => handleToggle('showOnlyWithIssues')}
                  disabled={saving}
                  className="sr-only"
                />
                <div className={`w-11 h-6 rounded-full transition-colors ${filters.showOnlyWithIssues ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform mt-0.5 ${filters.showOnlyWithIssues ? 'translate-x-5.5 ml-0.5' : 'translate-x-0.5'}`} />
                </div>
              </div>
            </label>
          </div>

          {/* Active filters summary */}
          {(filters.showOnlyUnverified || filters.showOnlyWithIssues) && (
            <div className="mt-6 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
              <p className="text-sm text-indigo-700">
                <span className="font-medium">Active filters:</span>{' '}
                {[
                  filters.showOnlyUnverified && 'Unverified only',
                  filters.showOnlyWithIssues && 'With issues only'
                ].filter(Boolean).join(', ')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminSetup;
