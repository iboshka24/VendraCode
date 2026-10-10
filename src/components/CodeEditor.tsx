import { useState, useRef, useCallback, useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useAppStore } from '@/stores/appStore';
import { brainClient } from '@/services/brainClient';
import { remoteClassToken, renderRemoteStyles } from '@/utils/remoteStyles';
import { toWorkspaceRelative } from '@/utils/workspacePath';
import { X, Circle, FolderOpen, Compass, Sparkles } from 'lucide-react';import { motion, AnimatePresence } from 'framer-motion';
import { VendraLogo } from './VendraLogo';
import { LivePeersBadge } from './LivePeersBadge';

/** Live diff broadcast is throttled so a fast typist can't flood the edge. */
const BROADCAST_THROTTLE_MS = 120;

export function CodeEditor() {
  const {
    openTabs, activeTabId, setActiveTab, closeTab,
    updateTabContent, markTabClean, workspacePath, setWorkspacePath,
    setFileTree, setActiveView, toggleChat, settings, remoteEdits,
    openFile, setTabContentLive, applyRemoteEdit, liveWrite, endLiveWrite
  } = useAppStore();
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<any>(null);
  /** View-zone ids currently rendered for remote-edit badges. */
  const zonesRef = useRef<string[]>([]);
  const lastBroadcastRef = useRef(0);
  const workspacePathRef = useRef(workspacePath);
  const heldLockPathRef = useRef<string | null>(null);
  /** Counts programmatic content applications that must not be echoed to peers. */
  const suppressBroadcastRef = useRef(0);
  /** True while the agent live-write animation drives the model. */
  const agentWritingRef = useRef(false);
  /** Latest active tab, readable from the (memoized) Monaco mount callback. */
  const activeTabRef = useRef<any>(null);

  const activeTab = openTabs.find((t) => t.id === activeTabId);
  activeTabRef.current = activeTab;
  workspacePathRef.current = workspacePath;

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    decorationsRef.current = editor.createDecorationsCollection([]);

    // Ctrl+S to save
    editor.addCommand(
      2048 | 49, // CtrlCmd + S
      async () => {
        const tab = activeTabRef.current;
        if (!tab) return;
        try {
          await window.vendraAPI.fs.writeFile(tab.path, tab.content);
          markTabClean(tab.id);
        } catch (err) {
          console.error('Failed to save:', err);
        }
      }
    );

    // ── Live multiplayer diff broadcast → brain.vendra.uz/ws ───────────
    // Monaco emits semantic model changes; we forward them verbatim so remote
    // peers can render live, line-accurate ghost edits.
    const contentDisposable = editor.onDidChangeModelContent((event) => {
      const tab = activeTabRef.current;
      if (!tab) return;

      // Programmatic application (e.g. "Apply to file") — don't echo it.
      if (suppressBroadcastRef.current > 0) {
        suppressBroadcastRef.current -= 1;
        return;
      }

      // The agent live-write animation is not a user edit.
      if (agentWritingRef.current) return;

      // Only real, user-driven edits should reach teammates.
      if (!editor.hasTextFocus()) return;

      const now = Date.now();
      if (now - lastBroadcastRef.current < BROADCAST_THROTTLE_MS) return;
      lastBroadcastRef.current = now;

      const changes = event.changes.map((change) => ({
        range: {
          startLineNumber: change.range.startLineNumber,
          startColumn: change.range.startColumn,
          endLineNumber: change.range.endLineNumber,
          endColumn: change.range.endColumn,
        },
        text: change.text,
        rangeLength: change.rangeLength,
      }));

      // Workspace-relative so teammates with different local roots match the file.
      brainClient.sendDiff(toWorkspaceRelative(tab.path, workspacePathRef.current), changes);
    });

    // Advisory file lock: teammates see the file as "in use" while we type.
    const focusDisposable = editor.onDidFocusEditorText(() => {
      const tab = activeTabRef.current;
      if (tab) {
        const lockPath = toWorkspaceRelative(tab.path, workspacePathRef.current);
        heldLockPathRef.current = lockPath;
        brainClient.acquireLock(lockPath);
      }
    });

    // Release the advisory lock when the widget unmounts (tab close / switch).
    editor.onDidDispose(() => {
      contentDisposable.dispose();
      focusDisposable.dispose();
      editor.changeViewZones((changeAccessor: any) => {
        for (const zoneId of zonesRef.current) changeAccessor.removeZone(zoneId);
        zonesRef.current = [];
      });
      if (heldLockPathRef.current) {
        brainClient.releaseLock(heldLockPathRef.current);
        heldLockPathRef.current = null;
      }
    });
  };

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (activeTabId && value !== undefined) {
        updateTabContent(activeTabId, value);
      }
    },
    [activeTabId, updateTabContent]
  );

  /** Applies code produced by an agent to the current tab without echoing it. */
  const applyProgrammaticContent = useCallback(
    (code: string) => {
      if (!activeTabId) return;
      suppressBroadcastRef.current += 1;
      updateTabContent(activeTabId, code);
    },
    [activeTabId, updateTabContent]
  );

  const handleCloseTab = useCallback(
    (id: string) => {
      const tab = openTabs.find((t) => t.id === id);
      if (tab) brainClient.releaseLock(toWorkspaceRelative(tab.path, workspacePath));
      closeTab(id);
    },
    [openTabs, workspacePath, closeTab]
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

  // ── Render live remote edits as Monaco decorations ───────────────────
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !activeTab) return;

    const model = editor.getModel();
    const lineCount = model ? model.getLineCount() : 1;
    const myPeerId = brainClient.getIdentity().peerId;

    // Remote edits arrive as workspace-relative paths — compare like for like.
    const relativePath = toWorkspaceRelative(activeTab.path, workspacePath);
    const edits = Object.values(remoteEdits).filter(
      (edit) => edit.filePath === relativePath && edit.agentId !== myPeerId
    );

    decorationsRef.current?.set(
      edits.map((edit) => {
        const first = edit.changes[0];
        const line = Math.min(Math.max(1, first?.range.startLineNumber || 1), lineCount);
        const token = remoteClassToken(edit.agentId);
        // Cover the whole line: Monaco only renders `after` inline content for a
        // non-empty range, so a zero-width range would drop the name badge.
        const maxColumn = model ? Math.max(1, model.getLineMaxColumn(line)) : 1;
        return {
          range: new monaco.Range(line, 1, line, maxColumn),
          options: {
            isWholeLine: true,
            className: `vc-remote-line-${token}`,
            linesDecorationsClassName: `vc-remote-gutter-${token}`,
            hoverMessage: { value: `**${edit.agentName}** is live-editing this file` },
            overviewRuler: { color: edit.color, position: 1 },
          },
        };
      })
    );

    // The teammate's name is rendered as a view zone: Monaco only draws inline
    // `after` decorations on the first visible line, but zones work anywhere.
    editor.changeViewZones((changeAccessor: any) => {
      for (const zoneId of zonesRef.current) changeAccessor.removeZone(zoneId);
      zonesRef.current = [];

      for (const edit of edits) {
        const line = Math.min(
          Math.max(1, edit.changes[0]?.range.startLineNumber || 1),
          lineCount
        );
        const token = remoteClassToken(edit.agentId);
        const node = document.createElement('div');
        node.className = `vc-remote-badge vc-remote-badge-${token}`;
        node.textContent = `\u2301 ${edit.agentName} \u00b7 live edit`;
        zonesRef.current.push(
          changeAccessor.addZone({
            afterLineNumber: Math.max(0, line - 1),
            heightInPx: 16,
            domNode: node,
            suppressMouseDown: true,
          })
        );
      }
    });

    renderRemoteStyles(edits.map((edit) => ({ agentId: edit.agentId, color: edit.color })));
  }, [remoteEdits, activeTab]);

  // ── Agent live-write: open the file and reveal code as it is written ────
  // Triggered by real `write`/`edit` tool calls from a running CLI agent.
  // The agent's own tool message in the chat shows the call; here the file it
  // touches becomes visible and fills in progressively.
  useEffect(() => {
    if (!liveWrite) return;
    const { path: filePath, fileName, kind, content, oldString, newString } = liveWrite;
    let cancelled = false;
    let finished = false;
    let rafId = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const applyContent = (text: string) => {
      const editor = editorRef.current;
      const model = editor?.getModel?.();
      const modelPath: string = model?.uri?.path || '';
      // While the written file is on screen, drive Monaco directly: no React
      // re-render per frame, and the animation stays smooth on big files.
      if (model && modelPath.endsWith(filePath)) {
        model.setValue(text);
      } else {
        setTabContentLive(filePath, text);
      }
    };

    const decorate = (startLine: number, endLine: number) => {
      applyRemoteEdit({
        agentId: liveWrite.agentId,
        agentName: liveWrite.agentName,
        color: liveWrite.color,
        filePath: toWorkspaceRelative(filePath, workspacePathRef.current),
        changes: [{
          range: { startLineNumber: startLine, startColumn: 1, endLineNumber: Math.max(startLine, endLine), endColumn: 1 },
          text: '',
          rangeLength: 0,
        }],
        timestamp: Date.now(),
      });
    };

    const run = async () => {
      // Never clobber unsaved user edits in the same file.
      const existing = useAppStore.getState().openTabs.find((t) => t.path === filePath);
      if (existing?.isDirty) return;

      agentWritingRef.current = true;
      let before = '';
      try { before = (await window.vendraAPI.fs.readFile(filePath)) || ''; } catch { before = ''; }
      if (cancelled) return;

      // Focus the file so the user sees it happen.
      openFile(filePath, fileName, before);
      setTabContentLive(filePath, before);

      if (kind === 'edit') {
        if (typeof oldString !== 'string' || typeof newString !== 'string') return;
        const idx = before.indexOf(oldString);
        const after = idx >= 0 ? before.replace(oldString, newString) : before + (before.endsWith('\n') || !before ? '' : '\n') + newString;
        applyContent(after);
        setTabContentLive(filePath, after);
        markTabClean(filePath);
        const line = Math.max(1, (idx >= 0 ? before.slice(0, idx) : before).split('\n').length);
        decorate(line, line + newString.split('\n').length);
        // The disk copy is the source of truth — re-sync right after.
        timeoutId = setTimeout(async () => {
          try {
            const real = await window.vendraAPI.fs.readFile(filePath);
            setTabContentLive(filePath, real);
            markTabClean(filePath);
          } catch { /* file vanished — leave as is */ }
          agentWritingRef.current = false;
          endLiveWrite();
        }, 1000);
        return;
      }

      // `write`: reveal from the unchanged prefix so untouched top matter
      // isn't retyped, then stream the rest in like a fast typist.
      const target = typeof content === 'string' ? content : before;
      let prefix = 0;
      const minLen = Math.min(before.length, target.length);
      while (prefix < minLen && before[prefix] === target[prefix]) prefix += 1;
      const nl = target.lastIndexOf('\n', prefix);
      prefix = nl >= 0 ? nl + 1 : 0;

      const durationMs = Math.min(2600, Math.max(650, (target.length - prefix) * 3));
      const startedAt = performance.now();
      const tick = () => {
        if (cancelled) return;
        const t = Math.min(1, (performance.now() - startedAt) / durationMs);
        applyContent(target.slice(0, prefix + Math.floor((target.length - prefix) * t)));
        if (t < 1) {
          rafId = requestAnimationFrame(tick);
          return;
        }
        finished = true;
        applyContent(target);
        setTabContentLive(filePath, target);
        markTabClean(filePath);
        decorate(
          Math.max(1, target.slice(0, prefix).split('\n').length),
          target.split('\n').length
        );
        agentWritingRef.current = false;
        // Keep the "⌁ … live edit" badge visible for a moment, then clear it.
        timeoutId = setTimeout(() => endLiveWrite(), 1500);
      };
      rafId = requestAnimationFrame(tick);
    };

    run();
    return () => {
      cancelled = true;
      agentWritingRef.current = false;
      cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);
      // Interrupted by another write / tab close: land on the real content.
      if (!finished && typeof content === 'string') {
        setTabContentLive(filePath, content);
        markTabClean(filePath);
      }
    };
  }, [liveWrite, openFile, setTabContentLive, applyRemoteEdit, markTabClean, endLiveWrite]);

  // Save on Ctrl+S globally
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const tab = activeTabRef.current;
        if (!tab) return;
        try {
          await window.vendraAPI.fs.writeFile(tab.path, tab.content);
          markTabClean(tab.id);
        } catch (err) {
          console.error('Failed to save:', err);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [markTabClean]);

  // Welcome Screen when no files open
  if (openTabs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background select-none">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm px-6"
        >
          <div className="flex justify-center mx-auto mb-4 drop-shadow-[0_0_24px_rgba(124,58,237,0.3)]">
            <VendraLogo size={52} />
          </div>
          <h2 className="text-base font-bold text-text-primary mb-1 tracking-tight font-mono">
            Vendra<strong className="text-ok font-black">Code</strong> IDE
          </h2>
          <p className="text-text-muted text-xs leading-relaxed mb-6">
            Multiplayer AI-Native Development Environment with The Shared Brain & Hermes agent skills.
          </p>

          <div className="flex flex-col gap-2 items-center">
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
                    onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id); }}
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
          <LivePeersBadge />

          <span className="hidden md:flex items-center gap-1.5 text-[10px] font-mono text-text-hint">
            Teammate edits stream into the open file automatically
          </span>
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
