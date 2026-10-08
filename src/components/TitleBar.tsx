import React from 'react';
import { useAppStore } from '@/stores/appStore';
import {
  Code2, Compass, Settings, Users, MessageSquare, Terminal,
  Search, GitBranch, Zap, Sparkles
} from 'lucide-react';
import { motion } from 'framer-motion';
import { VendraLogo } from './VendraLogo';

export function TitleBar() {
  const { activeView, setActiveView, toggleChat, isChatOpen, toggleTerminal, toggleSearch, toggleShare, workspacePath } = useAppStore();

  const repoName = workspacePath ? workspacePath.split('/').pop() : 'abyssal-drift';

  return (
    <header 
      className="h-11 border-b border-border flex items-center justify-between px-3 bg-bgtitle shrink-0 select-none z-40"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* Left: Brand + Workspace + Nav */}
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {/* Amoeba Brand Mark */}
        <div className="flex items-center gap-2 mr-1">
          <VendraLogo size={22} />
          <span className="font-bold text-text-primary tracking-tight text-xs font-mono">
            Vendra<strong className="text-ok font-black">Code</strong>
          </span>
          <span className="text-[10px] text-text-muted font-mono bg-chip px-1.5 py-0.5 rounded border border-border">
            {repoName}
          </span>
        </div>

        {/* Nav Tabs */}
        <nav className="flex items-center gap-1">
          {[
            { id: 'editor' as const, icon: Code2, label: 'Editor' },
            { id: 'mission-control' as const, icon: Compass, label: 'Mission Control' },
            { id: 'settings' as const, icon: Settings, label: 'Settings' },
          ].map((tab) => {
            const isActive = activeView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveView(tab.id)}
                className={`btn h-7 px-2.5 text-xs ${
                  isActive 
                    ? 'btn-primary font-semibold' 
                    : 'btn-ghost'
                }`}
              >
                <tab.icon size={13} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Center: Live Sync Pill */}
      <div className="hidden md:flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-chip border border-border text-[11px] text-text-secondary">
          <span className="dotpulse" />
          <span className="font-mono text-[10px]">Zero Conflicts · 5s Live Sync</span>
        </div>
      </div>

      {/* Right: Actions + Avatars + Share */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {/* Quick Action Buttons */}
        <button
          type="button"
          onClick={toggleSearch}
          className="btn btn-ghost h-7 w-7 p-0"
          title="Search Codebase (Ctrl+Shift+F)"
        >
          <Search size={14} />
        </button>
        <button
          type="button"
          onClick={toggleTerminal}
          className="btn btn-ghost h-7 w-7 p-0"
          title="Toggle Terminal"
        >
          <Terminal size={14} />
        </button>
        <button
          type="button"
          onClick={toggleChat}
          className={`btn h-7 px-2.5 text-xs ${
            isChatOpen ? 'btn-primary' : 'btn-ghost'
          }`}
          title="Toggle AI Assistant"
        >
          <Sparkles size={13} className={isChatOpen ? 'text-accent' : ''} />
          <span>AI</span>
        </button>

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Team Avatar Stack */}
        <div className="flex -space-x-1.5 items-center">
          <div 
            className="w-6 h-6 rounded-full bg-[#f06595] border border-bgtitle flex items-center justify-center text-[9px] font-bold text-white shadow-sm"
            title="Alice (Claude Code) · Online"
          >
            AN
          </div>
          <div 
            className="w-6 h-6 rounded-full bg-[#38d9a9] border border-bgtitle flex items-center justify-center text-[9px] font-bold text-white shadow-sm"
            title="Chen (Codex) · Online"
          >
            CI
          </div>
          <div 
            className="w-6 h-6 rounded-full bg-[#4dabf7] border border-bgtitle flex items-center justify-center text-[9px] font-bold text-white shadow-sm"
            title="Bob (Claude Code) · Online"
          >
            BF
          </div>
          <div 
            className="w-6 h-6 rounded-full bg-[#7c3aed] border border-bgtitle flex items-center justify-center text-[9px] font-bold text-white shadow-sm"
            title="You · Online"
          >
            IB
          </div>
        </div>

        {/* Share Session Pop Button */}
        <button
          type="button"
          className="btn btn-primary h-7 px-3 text-xs ml-1"
          onClick={toggleShare}
        >
          <Users size={12} />
          <span>Share</span>
        </button>
      </div>
    </header>
  );
}
