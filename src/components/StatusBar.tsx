import React, { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AlertCircle, Wifi, WifiOff, Loader, Zap, Shield, Pencil } from 'lucide-react';
import { WorktreeSwitcher } from './WorktreeSwitcher';

const BRAIN_STATUS_LABEL: Record<string, string> = {
  idle: 'idle',
  connecting: 'connecting',
  online: 'live',
  reconnecting: 'retrying',
  offline: 'offline',
};

export function StatusBar() {
  const {
    gitStatus, setGitStatus, workspacePath, agentStatus, activeProvider,
    brainStatus, brainPeers, activeLocks, remoteEdits
  } = useAppStore();

  // Poll git status
  useEffect(() => {
    if (!workspacePath || !window.vendraAPI) return;

    const fetchGitStatus = async () => {
      try {
        const status = await window.vendraAPI.git.status(workspacePath);
        setGitStatus(status);
      } catch {
        setGitStatus(null);
      }
    };

    fetchGitStatus();
    const interval = setInterval(fetchGitStatus, 5000);
    return () => clearInterval(interval);
  }, [workspacePath, setGitStatus]);

  const modifiedCount = gitStatus?.files.length || 0;
  const lockCount = Object.keys(activeLocks).length;
  const liveEdits = Object.values(remoteEdits).filter((e) => Date.now() - e.timestamp < 15000);

  const BrainIcon = brainStatus === 'online' ? Wifi : brainStatus === 'connecting' || brainStatus === 'reconnecting' ? Loader : WifiOff;
  const brainColor =
    brainStatus === 'online' ? 'text-ok' :
    brainStatus === 'connecting' || brainStatus === 'reconnecting' ? 'text-warning' : 'text-danger';

  return (
    <footer className="h-6 border-t border-border bg-bgtitle flex items-center justify-between px-3 text-[11px] text-text-muted select-none shrink-0 font-mono">
      {/* Left */}
      <div className="flex items-center gap-3">
        {/* Git worktree switcher (branch + linked worktrees) */}
        <WorktreeSwitcher />

        {/* Modified files */}
        {modifiedCount > 0 ? (
          <span className="flex items-center gap-1 text-warning">
            <AlertCircle size={10} />
            {modifiedCount} modified
          </span>
        ) : (
          <span className="text-[10px] text-text-hint">Clean worktree</span>
        )}

        {/* Advisory Locks held by teammates */}
        {lockCount > 0 && (
          <span className="flex items-center gap-1 text-warn" title={Object.entries(activeLocks).map(([f, l]) => `${l.agentName} → ${f}`).join('\n')}>
            <Shield size={10} />
            {lockCount} locked
          </span>
        )}

        {/* Advisory lock policy (what the IDE guarantees, not a live claim) */}
        <span className="flex items-center gap-1 text-text-hint" title="Files edited by a teammate are locked for you before you touch them">
          <Shield size={10} />
          Locks: {lockCount > 0 ? `${lockCount} active` : 'none'}
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Live remote edits currently being broadcast in this session */}
        {liveEdits.length > 0 && (
          <span className="flex items-center gap-1 text-accent" title={liveEdits.map((e) => `${e.agentName} · ${e.filePath}`).join('\n')}>
            <Pencil size={10} />
            {liveEdits.length} live edit{liveEdits.length > 1 ? 's' : ''}
          </span>
        )}

        {/* Agent Status */}
        <span className={`flex items-center gap-1 ${
          agentStatus === 'running' ? 'text-ok' :
          agentStatus === 'error' ? 'text-danger' : 'text-text-secondary'
        }`}>
          <Zap size={10} className={agentStatus === 'running' ? 'text-ok animate-pulse' : ''} />
          <span>Agent: {agentStatus}</span>
        </span>

        {/* Provider */}
        <span className="flex items-center gap-1 text-text-secondary">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          <span>{activeProvider?.name || 'Local'}</span>
        </span>

        {/* Brain Live Sync (real Cloudflare edge connection state) */}
        <span
          className={`flex items-center gap-1.5 ${brainColor}`}
          title={
            brainStatus === 'online'
              ? `brain.vendra.uz · ${brainPeers.length} peer${brainPeers.length === 1 ? '' : 's'} in session`
              : `brain.vendra.uz · ${brainStatus}`
          }
        >
          <BrainIcon size={10} className={brainStatus === 'connecting' || brainStatus === 'reconnecting' ? 'animate-spin' : brainStatus === 'online' ? '' : 'opacity-80'} />
          <span>Brain: {BRAIN_STATUS_LABEL[brainStatus] || brainStatus}{brainStatus === 'online' && brainPeers.length > 0 ? ` · ${brainPeers.length}` : ''}</span>
        </span>

        <span className="text-text-hint">UTF-8</span>
      </div>
    </footer>
  );
}
