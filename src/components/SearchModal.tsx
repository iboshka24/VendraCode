import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { Search, File, Terminal, Compass, Sparkles, X, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const SearchModal: React.FC = () => {
  const { isSearchOpen, toggleSearch, workspacePath, openFile, setActiveView, toggleChat, toggleTerminal } = useAppStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!query.trim() || !workspacePath || !window.vendraAPI?.fs) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const matches = await window.vendraAPI.fs.search(workspacePath, query);
        setResults(matches || []);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, workspacePath]);

  // Escape closes the palette (the input placeholder promises it)
  useEffect(() => {
    if (!isSearchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        toggleSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSearchOpen, toggleSearch]);

  if (!isSearchOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -10 }}
        className="w-full max-w-xl bg-surface border border-border-light rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Search Header */}
        <div className="flex items-center px-4 py-3 border-b border-border gap-3 bg-bgtitle">
          <Search size={16} className="text-accent shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files, symbols, commands... (Esc to close)"
            className="w-full bg-transparent text-sm text-text-primary outline-none"
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-text-muted hover:text-text-primary">
              <X size={14} />
            </button>
          )}
          <button onClick={toggleSearch} className="btn btn-ghost h-6 px-2 text-[10px]">
            ESC
          </button>
        </div>

        {/* Quick Actions / Results */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1 text-xs">
          {query.trim() === '' ? (
            <div className="space-y-1">
              <div className="text-[10px] text-text-muted px-3 py-1 font-semibold uppercase tracking-wider">
                Quick Actions
              </div>
              <button
                type="button"
                onClick={() => { setActiveView('mission-control'); toggleSearch(); }}
                className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-surface-hover text-left transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Compass size={15} className="text-accent" />
                  <span className="font-medium text-text-primary">Open Mission Control</span>
                </div>
                <ArrowRight size={13} className="text-text-muted" />
              </button>
              <button
                type="button"
                onClick={() => { toggleChat(); toggleSearch(); }}
                className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-surface-hover text-left transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles size={15} className="text-primary" />
                  <span className="font-medium text-text-primary">Open AI Assistant</span>
                </div>
                <ArrowRight size={13} className="text-text-muted" />
              </button>
              <button
                type="button"
                onClick={() => { toggleTerminal(); toggleSearch(); }}
                className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-surface-hover text-left transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Terminal size={15} className="text-warning" />
                  <span className="font-medium text-text-primary">Toggle Terminal</span>
                </div>
                <ArrowRight size={13} className="text-text-muted" />
              </button>
            </div>
          ) : (
            <div>
              <div className="text-[10px] text-text-muted px-3 py-1 font-semibold uppercase tracking-wider flex justify-between">
                <span>Codebase Results</span>
                <span>{results.length} found</span>
              </div>
              {results.length === 0 ? (
                <div className="text-center py-8 text-text-muted text-xs">
                  {isSearching ? 'Searching across project...' : 'No matches found.'}
                </div>
              ) : (
                results.slice(0, 15).map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={async () => {
                      if (r.file) {
                        try {
                          const content = await window.vendraAPI.fs.readFile(r.file);
                          openFile(r.file, r.file.split('/').pop() || '', content);
                          toggleSearch();
                        } catch (err) {}
                      }
                    }}
                    className="w-full flex items-start gap-2.5 p-2 rounded-lg hover:bg-surface-hover text-left font-mono transition-colors"
                  >
                    <File size={13} className="text-text-muted shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-accent truncate">
                        {r.file} {r.line ? `:${r.line}` : ''}
                      </div>
                      <div className="text-[10px] text-text-secondary truncate">{r.text}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
