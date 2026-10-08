import { useAppStore } from '@/stores/appStore';
import {
  Code2, Compass, Settings, Users, MessageSquare, Terminal,
  Search, FolderOpen, GitBranch, Zap
} from 'lucide-react';
import { motion } from 'framer-motion';

export function TitleBar() {
  const { activeView, setActiveView, toggleChat, isChatOpen, toggleTerminal, toggleSearch } = useAppStore();

  return (
    <header className="h-12 border-b border-border flex items-center justify-between px-4 bg-surface shrink-0 select-none"
            style={{ WebkitAppRegion: 'drag' } as any}>
      {/* Left: Logo + Navigation */}
      <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {/* Logo */}
        <div className="flex items-center gap-2 mr-2">
          <motion.div
            className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center shadow-lg"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Zap size={16} className="text-white" />
          </motion.div>
          <span className="font-bold text-text-primary tracking-wide text-sm">VendraCode</span>
        </div>

        {/* Nav Tabs */}
        <nav className="flex items-center gap-1">
          {[
            { id: 'editor' as const, icon: Code2, label: 'Editor' },
            { id: 'mission-control' as const, icon: Compass, label: 'Mission Control' },
            { id: 'settings' as const, icon: Settings, label: 'Settings' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all duration-150
                ${activeView === tab.id
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Right: Actions + Avatars */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {/* Quick Actions */}
        <button
          onClick={toggleSearch}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition"
          title="Search (Ctrl+Shift+F)"
        >
          <Search size={16} />
        </button>
        <button
          onClick={toggleTerminal}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition"
          title="Toggle Terminal"
        >
          <Terminal size={16} />
        </button>
        <button
          onClick={toggleChat}
          className={`p-1.5 rounded-md transition
            ${isChatOpen ? 'text-primary bg-primary/10' : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'}`}
          title="Toggle AI Chat"
        >
          <MessageSquare size={16} />
        </button>

        <div className="w-px h-5 bg-border mx-1" />

        {/* User Avatars */}
        <div className="flex -space-x-2">
          <div className="w-7 h-7 rounded-full bg-blue-600 border-2 border-surface flex items-center justify-center text-[10px] font-bold text-white z-10">
            IB
          </div>
          <div className="w-7 h-7 rounded-full bg-primary border-2 border-surface flex items-center justify-center text-[10px] font-bold text-white z-0">
            AI
          </div>
        </div>

        {/* Share Session */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="vc-btn-primary flex items-center gap-1.5 text-xs ml-1"
        >
          <Users size={13} />
          Share Session
        </motion.button>
      </div>
    </header>
  );
}
