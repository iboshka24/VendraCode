import React from 'react';
import { useAppStore } from '@/stores/appStore';
import { Code2, Compass, Settings, Users, MessageSquare, Terminal, Search, ChevronRight } from 'lucide-react';
import { VendraLogo } from './VendraLogo';

export function TitleBar() {
  const { activeView, setActiveView, toggleChat, isChatOpen, toggleTerminal, toggleSearch, toggleShare, workspacePath, brainPeers, brainStatus } = useAppStore();
  const repoName = workspacePath?.split(/[\\/]/).filter(Boolean).pop();
  return (
    <header className="vc-titlebar" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center gap-3 min-w-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex items-center gap-2.5 mr-3"><VendraLogo size={23}/><span className="text-[13px] font-semibold tracking-tight">VendraCode</span></div>
        <nav className="flex gap-1">
          {[
            { id: 'editor' as const, icon: Code2, label: 'Editor' },
            { id: 'mission-control' as const, icon: Compass, label: 'Mission Control' },
            { id: 'settings' as const, icon: Settings, label: 'Settings' },
          ].map(tab => <button key={tab.id} onClick={() => setActiveView(tab.id)} className={`vc-nav ${activeView === tab.id ? 'vc-nav-active' : ''}`}><tab.icon size={14}/><span>{tab.label}</span></button>)}
        </nav>
        {repoName && <div className="hidden lg:flex items-center gap-2 text-text-muted text-xs min-w-0"><ChevronRight size={12}/><span className="truncate max-w-40">{repoName}</span></div>}
      </div>
      <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button onClick={toggleSearch} className="btn btn-ghost h-8 w-8 p-0" title="Search Codebase (Ctrl+Shift+F)"><Search size={15}/></button>
        <button onClick={toggleTerminal} className="btn btn-ghost h-8 w-8 p-0" title="Toggle Terminal"><Terminal size={15}/></button>
        <button onClick={toggleChat} className={`vc-nav ${isChatOpen ? 'vc-nav-active' : ''}`} title="Toggle AI Assistant"><MessageSquare size={14}/><span>Agent</span></button>
        <div className="h-4 w-px bg-border mx-2"/>
        <button onClick={toggleShare} className="btn h-8 text-xs"><Users size={13}/><span>Share</span>{brainStatus === 'online' && <span className="w-1.5 h-1.5 bg-success rounded-full" title={`${brainPeers.length} peers online`}/>}</button>
      </div>
    </header>
  );
}
