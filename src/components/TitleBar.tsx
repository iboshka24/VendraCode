import { LivePeersBadge } from './LivePeersBadge';
import React from 'react';
import { useAppStore } from '@/stores/appStore';
import {
  Code2, Compass, Settings, Users, MessageSquare, Terminal,
  Search, GitBranch, Zap, Sparkles
} from 'lucide-react';
import { motion } from 'framer-motion';
import { VendraLogo } from './VendraLogo';

// Deterministic accent per teammate so a given peer always looks the same.
const PEER_COLORS = ['#f06595', '#38d9a9', '#4dabf7', '#7c3aed', '#f59f00', '#e64980', '#12b886'];

function peerColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PEER_COLORS[h % PEER_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function TitleBar() {
  const { activeView, setActiveView, toggleChat, isChatOpen, toggleTerminal, toggleSearch, toggleShare, workspacePath, brainPeers, brainStatus } = useAppStore();

  const repoName = workspacePath ? workspacePath.split('/').pop() : '';
  const selfName = (typeof localStorage !== 'undefined' && localStorage.getItem('vendracode-peer-name')) || 'You';
  const isLive = brainStatus === 'online';

  return (
    <header 
      className="h-11 border-b border-border flex items-center justify-between px-3 bg-bgtitle shrink-0 select-none z-40"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* Left: Brand + Workspace + Nav */}
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {/* Brand mark */}
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

      {/* Center: real multiplayer state (no simulated sync claims) */}
      <div className="hidden md:flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <LivePeersBadge />
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

        {/* Team Avatar Stack — real teammates from the brain session */}
        <div className="flex -space-x-1.5 items-center" title={isLive ? 'Connected to brain.vendra.uz' : `brain.vendra.uz · ${brainStatus}`}>
          <div
            className="w-6 h-6 rounded-full border border-bgtitle flex items-center justify-center text-[9px] font-bold text-white shadow-sm"
            style={{ background: peerColor(selfName) }}
            title={`${selfName} · you`}
          >
            {initials(selfName)}
          </div>
          {brainPeers.map((peer) => (
            <div
              key={peer}
              className="w-6 h-6 rounded-full border border-bgtitle flex items-center justify-center text-[9px] font-bold text-white shadow-sm"
              style={{ background: peerColor(peer) }}
              title={`${peer} · online`}
            >
              {initials(peer)}
            </div>
          ))}
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
