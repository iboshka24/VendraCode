import { useAppStore } from '@/stores/appStore';
import { useBrainSync } from '@/hooks/useBrainSync';
import { TitleBar } from '@/components/TitleBar';
import { StatusBar } from '@/components/StatusBar';
import { CodeEditor } from '@/components/CodeEditor';
import { TerminalPanel } from '@/components/Terminal';
import { SearchModal } from '@/components/SearchModal';
import { ShareSessionModal } from '@/components/ShareSessionModal';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, lazy, Suspense } from 'react';

// Lazy-load heavier panels
const FileExplorer = lazy(() => import('@/components/FileExplorer').then(m => ({ default: m.FileExplorer })));
const AIChat = lazy(() => import('@/components/AIChat').then(m => ({ default: m.AIChat })));
const MissionControl = lazy(() => import('@/components/MissionControl').then(m => ({ default: m.MissionControl })));
const Settings = lazy(() => import('@/components/Settings').then(m => ({ default: m.Settings })));

function LoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-text-muted text-sm">Loading...</span>
      </div>
    </div>
  );
}

function App() {
  const {
    activeView,
    isChatOpen,
    chatPanelWidth,
    setChatPanelWidth,
    workspacePath,
    setWorkspacePath,
    setFileTree,
    setLocalCLIs,
    setActiveLocks,
    addBrainAction,
    isShareOpen,
    toggleShare,
    toggleSearch,
    setBrainSessionId,
    setBrainRepoUrl,
  } = useAppStore();

  // True while the user drags the agent panel's edge (disables the width
  // animation so the drag tracks the cursor 1:1).
  const [isResizingChat, setIsResizingChat] = useState(false);

  // Cloudflare Edge Brain multiplayer sync (brain.vendra.uz/ws)
  useBrainSync();

  // Auto-load last workspace or default workspace on start so Explorer isn't blank
  useEffect(() => {
    if (!window.vendraAPI) return;
    const last = localStorage.getItem('vendracode-workspace') || '/home/ibrohim/VendraCode';
    if (!workspacePath && last) {
      setWorkspacePath(last);
      window.vendraAPI.fs.readDir(last).then((entries) => {
        if (entries && entries.length > 0) {
          setFileTree(entries);
        }
      }).catch(() => {});
    }
  }, [workspacePath, setWorkspacePath, setFileTree]);

  // Initialize Local CLI detection & Brain coordination listeners
  useEffect(() => {
    if (!window.vendraAPI) return;

    // Detect installed agent CLIs (agy, cline, opencode, claude)
    window.vendraAPI.cli.detectAll().then((clis) => {
      setLocalCLIs(clis);
    });

    // Listen to live locks & coordination actions
    const removeLocksListener = window.vendraAPI.brain.onLocksUpdated((locks) => {
      setActiveLocks(locks);
    });

    const removeActionListener = window.vendraAPI.brain.onActionRecorded((action) => {
      addBrainAction(action);
    });

    return () => {
      removeLocksListener();
      removeActionListener();
    };
  }, [setLocalCLIs, setActiveLocks, addBrainAction]);

  // Global keyboard shortcuts (the ones the welcome screen and tooltips promise)
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      // Ctrl+Shift+F — search codebase
      // Ctrl+Shift+P — command palette (same modal, quick actions first)
      if (e.shiftKey && (e.key === 'f' || e.key === 'F' || e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        toggleSearch();
        return;
      }

      // Ctrl+O — open a repository folder
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        try {
          const path = await window.vendraAPI?.dialog.openDirectory();
          if (path) {
            setWorkspacePath(path);
            const entries = await window.vendraAPI.fs.readDir(path);
            if (entries?.length) setFileTree(entries);
          }
        } catch (err) {
          console.error('Failed to open directory:', err);
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSearch, setWorkspacePath, setFileTree]);

  // Watch workspace when path changes so that ANY external CLI action updates the IDE in real-time
  useEffect(() => {
    if (!workspacePath || !window.vendraAPI) return;

    window.vendraAPI.workspace.watch(workspacePath);

    const removeFileWatcher = window.vendraAPI.workspace.onFileChanged(async ({ eventType, filename }) => {
      // Auto-reload the directory tree when files change externally
      try {
        const entries = await window.vendraAPI.fs.readDir(workspacePath);
        setFileTree(entries);
      } catch {}
    });

    return () => {
      removeFileWatcher();
    };
  }, [workspacePath, setFileTree]);

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-text-primary overflow-hidden">
      <TitleBar />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <AnimatePresence mode="wait">
          {activeView === 'editor' && (
            <motion.div
              key="editor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex min-w-0 min-h-0"
            >
              {/* File Explorer Sidebar */}
              <Suspense fallback={<div className="w-60 bg-bgside border-r border-border" />}>
                <FileExplorer />
              </Suspense>

              {/* Editor + Terminal */}
              <div className="flex-1 flex flex-col min-w-0 min-h-0">
                <CodeEditor />
                <TerminalPanel />
              </div>

              {/* AI Chat Panel (drag its left edge to resize, double-click resets) */}
              <AnimatePresence>
                {isChatOpen && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: chatPanelWidth, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: isResizingChat ? 0 : 0.2, ease: 'easeOut' }}
                    className="relative border-l border-border overflow-hidden shrink-0"
                  >
                    <div
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setIsResizingChat(true);
                        const startX = e.clientX;
                        const startW = chatPanelWidth;
                        const onMove = (ev: MouseEvent) => setChatPanelWidth(startW + (startX - ev.clientX));
                        const onUp = () => {
                          setIsResizingChat(false);
                          window.removeEventListener('mousemove', onMove);
                          window.removeEventListener('mouseup', onUp);
                        };
                        window.addEventListener('mousemove', onMove);
                        window.addEventListener('mouseup', onUp);
                      }}
                      onDoubleClick={() => setChatPanelWidth(380)}
                      title="Drag to resize · double-click to reset"
                      className="absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-col-resize z-20 hover:bg-accent/40 active:bg-accent/60 transition-colors"
                    />
                    <Suspense fallback={<LoadingFallback />}>
                      <AIChat />
                    </Suspense>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeView === 'mission-control' && (
            <motion.div
              key="mission-control"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1 overflow-y-auto"
            >
              <Suspense fallback={<LoadingFallback />}>
                <MissionControl />
              </Suspense>
            </motion.div>
          )}

          {activeView === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1 overflow-y-auto"
            >
              <Suspense fallback={<LoadingFallback />}>
                <Settings />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <StatusBar />

      {/* Global Modals */}
      <SearchModal />
      <ShareSessionModal isOpen={isShareOpen} onClose={toggleShare} />
    </div>
  );
}

export default App;
