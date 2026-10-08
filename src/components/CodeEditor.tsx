import { useRef, useCallback, useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useAppStore } from '@/stores/appStore';
import { X, Circle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function CodeEditor() {
  const {
    openTabs, activeTabId, setActiveTab, closeTab,
    updateTabContent, markTabClean, workspacePath, settings
  } = useAppStore();
  const editorRef = useRef<any>(null);

  const activeTab = openTabs.find((t) => t.id === activeTabId);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;

    // Ctrl+S to save
    editor.addCommand(
      // Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.KeyS
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

  if (openTabs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="text-6xl mb-6 opacity-20">⌨</div>
          <h2 className="text-xl font-semibold text-text-secondary mb-2">VendraCode</h2>
          <p className="text-text-muted text-sm max-w-xs">
            Open a folder to get started, or use the AI assistant to create files.
          </p>
          <div className="mt-6 flex flex-col gap-2 text-xs text-text-muted">
            <span>Ctrl+O — Open Folder</span>
            <span>Ctrl+S — Save File</span>
            <span>Ctrl+Shift+P — Command Palette</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Tab Bar */}
      <div className="flex h-9 bg-surface border-b border-border overflow-x-auto">
        <AnimatePresence>
          {openTabs.map((tab) => (
            <motion.div
              key={tab.id}
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className={`flex items-center gap-2 px-3 text-sm cursor-pointer border-r border-border
                shrink-0 min-w-0 group transition-colors
                ${tab.id === activeTabId
                  ? 'bg-background text-text-primary border-t-2 border-t-primary'
                  : 'bg-surface text-text-secondary hover:bg-surface-hover'
                }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="truncate max-w-[120px]">{tab.name}</span>
              {tab.isDirty && (
                <Circle size={8} className="text-warning fill-warning shrink-0" />
              )}
              <button
                className="opacity-0 group-hover:opacity-100 hover:bg-border rounded p-0.5 transition-opacity shrink-0"
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
              >
                <X size={12} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Editor */}
      {activeTab && (
        <div className="flex-1 min-h-0">
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
              fontFamily: settings.fontFamily,
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
