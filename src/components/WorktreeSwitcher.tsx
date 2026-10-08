import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { GitBranch, Layers, Plus, RefreshCw, Trash2, FolderTree, Check, AlertCircle } from 'lucide-react';

/** Git worktrees live next to the main checkout so the repo tree stays tidy. */
const WORKTREE_DIR = 'worktrees';

const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/;

/**
 * Active Git worktree switcher for the status bar.
 *
 * Each multiplayer session attaches to its own linked worktree, so switching is
 * just a workspace swap (the editor/terminal reload from the new root) while the
 * underlying repository stays a single object shared by every teammate.
 */
export function WorktreeSwitcher() {
  const { workspacePath, setWorkspacePath, worktrees, setWorktrees, setFileTree, setGitStatus } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const [newBranch, setNewBranch] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!workspacePath || !window.vendraAPI?.git?.worktrees) return;
    try {
      const list = await window.vendraAPI.git.worktrees(workspacePath);
      setWorktrees(Array.isArray(list) ? list : []);
    } catch {
      setWorktrees([]);
    }
  }, [workspacePath, setWorktrees]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const activeWorktree = useMemo(
    () => worktrees.find((wt) => workspacePath && wt.path === workspacePath) || null,
    [worktrees, workspacePath]
  );

  const switchTo = useCallback(async (path: string) => {
    setWorkspacePath(path);
    localStorage.setItem('vendracode-workspace', path);
    setIsOpen(false);
    try {
      const [entries, status] = await Promise.all([
        window.vendraAPI.fs.readDir(path),
        window.vendraAPI.git.status(path),
      ]);
      setFileTree(entries || []);
      setGitStatus(status || null);
    } catch {
      /* workspace loads lazily anyway */
    }
  }, [setWorkspacePath, setFileTree, setGitStatus]);

  const handleCreate = async () => {
    const branch = newBranch.trim();
    if (!branch || !workspacePath || !BRANCH_PATTERN.test(branch)) {
      setError('Invalid branch name (letters, numbers, . _ / - only)');
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const parent = workspacePath.split('/').slice(0, -1).join('/') || '/';
      const target = `${parent}/${WORKTREE_DIR}/${branch.replace(/\//g, '-')}`;
      const res = await window.vendraAPI.git.worktreeAdd({ cwd: workspacePath, path: target, branch, create: true });
      if (res?.success) {
        setNewBranch('');
        await refresh();
        await switchTo(target);
      } else {
        setError(res?.error || 'git worktree add failed');
      }
    } catch (err: any) {
      setError(err?.message || 'git worktree add failed');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemove = async (path: string) => {
    if (!workspacePath) return;
    setIsBusy(true);
    setError(null);
    try {
      const res = await window.vendraAPI.git.worktreeRemove({ cwd: workspacePath, path });
      if (!res?.success) setError(res?.error || 'git worktree remove failed');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'git worktree remove failed');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => { setIsOpen((v) => !v); if (!isOpen) refresh(); }}
        className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary transition cursor-pointer"
        title={`Active worktree: ${activeWorktree?.path || workspacePath || 'none'} — click to switch`}
      >
        <GitBranch size={11} />
        <span>{activeWorktree?.branch || 'main'}</span>
        <span className="flex items-center gap-0.5 text-text-hint">
          <Layers size={10} />
          {worktrees.length || 1}
        </span>
      </button>

      {isOpen && (
        <div className="absolute bottom-7 left-0 z-50 w-80 bg-[#121316] border border-[#262837] rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-text-primary uppercase tracking-wide">
              <FolderTree size={12} className="text-accent" />
              Git Worktrees
            </span>
            <button type="button" onClick={refresh} className="text-text-muted hover:text-text-primary" title="Refresh worktrees">
              <RefreshCw size={11} className={isBusy ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Worktree list */}
          <div className="max-h-56 overflow-y-auto py-1">
            {worktrees.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-text-muted">
                No linked worktrees yet — this repository uses a single checkout.
              </div>
            )}
            {worktrees.map((wt) => {
              const isActive = wt.path === workspacePath;
              return (
                <div
                  key={wt.path}
                  className={`group flex items-center gap-2 px-3 py-1.5 text-[11px] cursor-pointer transition ${
                    isActive ? 'bg-accent/10 text-text-primary' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                  onClick={() => !isActive && switchTo(wt.path)}
                  title={wt.path}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-ok' : 'bg-text-hint'}`} />
                  <span className="font-mono truncate flex-1">{wt.branch || (wt.isDetached ? `detached ${wt.head.slice(0, 7)}` : 'bare')}</span>
                  {wt.isMain && <span className="text-[9px] px-1 rounded bg-chip border border-border text-text-muted shrink-0">main</span>}
                  {isActive && <Check size={11} className="text-ok shrink-0" />}
                  {!wt.isMain && !isActive && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemove(wt.path); }}
                      className="opacity-0 group-hover:opacity-100 text-danger shrink-0"
                      title={`Remove worktree ${wt.path}`}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Create new worktree */}
          <div className="px-3 py-2 border-t border-border space-y-1.5">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                placeholder="session/feature-branch"
                className="vc-input text-[11px] font-mono h-7 flex-1 px-2"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={isBusy || !newBranch.trim()}
                className="btn btn-primary h-7 px-2 text-[11px] shrink-0 disabled:opacity-50"
                title="Create worktree from HEAD and switch to it"
              >
                <Plus size={11} />
                <span>New</span>
              </button>
            </div>
            {error && (
              <div className="flex items-center gap-1 text-[10px] text-danger font-mono">
                <AlertCircle size={10} />
                <span className="truncate">{error}</span>
              </div>
            )}
            <p className="text-[9.5px] text-text-hint leading-snug">
              Creates <span className="font-mono">../{WORKTREE_DIR}/&lt;branch&gt;</span> from HEAD and switches the workspace there.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
