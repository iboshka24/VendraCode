import React, { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { GitBranch, AlertCircle, Wifi, WifiOff, Zap, Shield } from 'lucide-react';

export function StatusBar() {
  const { gitStatus, setGitStatus, workspacePath, agentStatus, activeProvider } = useAppStore();

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

  return (
    <footer className="h-6 border-t border-border bg-bgtitle flex items-center justify-between px-3 text-[11px] text-text-muted select-none shrink-0 font-mono">
      {/* Left */}
      <div className="flex items-center gap-3">
        {/* Git Branch */}
        <span className="flex items-center gap-1 text-text-secondary hover:text-text-primary cursor-pointer transition">
          <GitBranch size={11} />
          <span>{gitStatus?.branch || 'main'}</span>
        </span>

        {/* Modified files */}
        {modifiedCount > 0 ? (
          <span className="flex items-center gap-1 text-warning">
            <AlertCircle size={10} />
            {modifiedCount} modified
          </span>
        ) : (
          <span className="text-[10px] text-text-hint">Clean worktree</span>
        )}

        {/* Advisory Locks */}
        <span className="flex items-center gap-1 text-text-hint">
          <Shield size={10} />
          Zero Conflicts
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
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

        {/* Brain Live Sync */}
        <span className="flex items-center gap-1.5 text-text-secondary">
          <span className="dotpulse" />
          <span>Brain: Live</span>
        </span>

        <span className="text-text-hint">UTF-8</span>
      </div>
    </footer>
  );
}
