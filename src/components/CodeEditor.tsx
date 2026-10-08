import { useState, useRef, useCallback, useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useAppStore } from '@/stores/appStore';
import { X, Circle, FolderOpen, Compass, Sparkles, Play, Users, GitCommit, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LiveAgentStream } from './LiveAgentStream';

export function CodeEditor() {
  const {
    openTabs, activeTabId, setActiveTab, closeTab,
    updateTabContent, markTabClean, workspacePath, setWorkspacePath,
    setFileTree, setActiveView, toggleChat, activeLocks, settings
  } = useAppStore();
  const editorRef = useRef<any>(null);
  const [isLiveStreaming, setIsLiveStreaming] = useState(false);

  const activeTab = openTabs.find((t) => t.id === activeTabId);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;

    // Ctrl+S to save
    editor.addCommand(
      2048 | 49, // CtrlCmd + S
      async () => {
        if (!activeTab) return;
        try {
          await window.vendraAPI.fs.writeFile(activeTab.path, activeTab.content);
          markTabClean(activeTab.id);
        } catch (err) {
          console.error('Failed to save:', err);
        }
      }
    );
  };

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (activeTabId && value !== undefined) {
        updateTabContent(activeTabId, value);
      }
    },
    [activeTabId, updateTabContent]
  );

  const handleOpenFolder = async () => {
    try {
      const path = await window.vendraAPI.dialog.openDirectory();
      if (path) {
        setWorkspacePath(path);
        localStorage.setItem('vendracode-workspace', path);
        const entries = await window.vendraAPI.fs.readDir(path);
        setFileTree(entries);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Save on Ctrl+S globally
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!activeTab) return;
        try {
          await window.vendraAPI.fs.writeFile(activeTab.path, activeTab.content);
          markTabClean(activeTab.id);
        } catch (err) {
          console.error('Failed to save:', err);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTab, markTabClean]);

  // If in live stream view, show the full multi-agent collaborative typing screen
  if (isLiveStreaming) {
    return (
      <div className="flex-1 min-h-0 bg-background p-3">
        <LiveAgentStream
          filename={activeTab?.name || 'src/auth/authenticate.ts'}
          onApplyToFile={(code) => {
            if (activeTabId) {
              updateTabContent(activeTabId, code);
              setIsLiveStreaming(false);
            }
          }}
          onClose={() => setIsLiveStreaming(false)}
        />
      </div>
    );
  }

  // Welcome Screen when no files open
  if (openTabs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background select-none">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm px-6"
        >
          <div className="w-12 h-12 rounded-2xl bg-chip border border-border-light flex items-center justify-center mx-auto mb-4 text-text-primary shadow-lg">
            <span className="font-bold text-lg text-accent">V</span>
          </div>
          <h2 className="text-base font-bold text-text-primary mb-1 tracking-tight">VendraCode IDE</h2>
          <p className="text-text-muted text-xs leading-relaxed mb-6">
            Multiplayer AI-Native Development Environment with The Shared Brain & Hermes agent skills.
          </p>

          <div className="flex flex-col gap-2 items-center">
            {/* Live Streaming Animation Launcher */}
            <button
              type="button"
              onClick={() => setIsLiveStreaming(true)}
              className="btn btn-primary w-52 text-xs justify-center gap-2 shadow-lg"
            >
              <Play size={13} className="text-popfg fill-current" />
              <span>Watch Live Agent Typing</span>
            </button>

            <button
              type="button"
              onClick={handleOpenFolder}
              className="btn btn-ghost w-52 text-xs justify-center"
            >
              <FolderOpen size={14} />
              <span>Open Repository</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('mission-control')}
              className="btn btn-ghost w-52 text-xs justify-center"
            >
              <Compass size={14} />
              <span>Mission Control</span>
            </button>
            <button
              type="button"
              onClick={toggleChat}
              className="btn btn-ghost w-52 text-xs justify-center"
            >
              <Sparkles size={14} className="text-accent" />
              <span>AI Agent Prompt</span>
            </button>
          </div>

          <div className="mt-8 pt-4 border-t border-border flex justify-center gap-4 text-[10px] text-text-muted font-mono">
            <span>Ctrl+O · Open</span>
            <span>Ctrl+S · Save</span>
            <span>Ctrl+Shift+P · Palette</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      {/* Tab Bar with Live Stream Launcher */}
      <div className="flex items-center justify-between h-8 bg-bgtitle border-b border-border overflow-x-auto select-none px-1">
        <div className="flex items-center overflow-x-auto min-w-0">
          <AnimatePresence>
            {openTabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <motion.div
                  key={tab.id}
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className={`flex items-center gap-2 px-3 h-8 text-xs cursor-pointer border-r border-border
                    shrink-0 min-w-0 group transition-all font-mono
                    ${isActive
                      ? 'bg-background text-text-primary border-t-2 border-t-pop font-medium'
                      : 'bg-bgtitle text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="truncate max-w-[130px]">{tab.name}</span>
                  {tab.isDirty && (
                    <Circle size={6} className="text-warning fill-warning shrink-0" />
                  )}
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 hover:bg-chip rounded p-0.5 transition-opacity shrink-0"
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  >
                    <X size={11} />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Live Multi-Agent Co-Editing Button */}
        <div className="flex items-center gap-2 shrink-0 pr-2">
          <button
            type="button"
            onClick={() => setIsLiveStreaming(true)}
            className="btn btn-ghost h-6 px-2 text-[11px] font-sans flex items-center gap-1.5 border border-border"
            title="Open Amoeba live collaborative typing display"
          >
            <span className="dotpulse" />
            <Play size={10} className="fill-current text-ok" />
            <span>Live Typing Stream</span>
          </button>
        </div>
      </div>

      {/* Monaco Editor */}
      {activeTab && (
        <div className="flex-1 min-h-0 bg-background">
          <Editor
            key={activeTab.id}
            height="100%"
            theme="vs-dark"
            language={activeTab.language}
            value={activeTab.content}
            onChange={handleChange}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: settings.minimap },
              fontSize: settings.fontSize,
              fontFamily: '"Geist Mono", "JetBrains Mono", Consolas, monospace',
              wordWrap: settings.wordWrap ? 'on' : 'off',
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorSmoothCaretAnimation: 'on',
              renderWhitespace: 'selection',
              bracketPairColorization: { enabled: true },
              padding: { top: 8 },
              lineHeight: 1.6,
              automaticLayout: true,
            }}
          />
        </div>
      )}
    </div>
  );
}
