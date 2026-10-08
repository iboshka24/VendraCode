import { useAppStore } from '@/stores/appStore';
import { TitleBar } from '@/components/TitleBar';
import { StatusBar } from '@/components/StatusBar';
import { CodeEditor } from '@/components/CodeEditor';
import { TerminalPanel } from '@/components/Terminal';
import { AnimatePresence, motion } from 'framer-motion';
import { lazy, Suspense } from 'react';

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
  const { activeView, isChatOpen } = useAppStore();

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
              <Suspense fallback={<div className="w-64 bg-surface border-r border-border" />}>
                <FileExplorer />
              </Suspense>

              {/* Editor + Terminal */}
              <div className="flex-1 flex flex-col min-w-0 min-h-0">
                <CodeEditor />
                <TerminalPanel />
              </div>

              {/* AI Chat Panel */}
              <AnimatePresence>
                {isChatOpen && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 380, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="border-l border-border overflow-hidden shrink-0"
                  >
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
    </div>
  );
}

export default App;
