import { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { GitBranch, AlertCircle, Wifi, WifiOff, Zap } from 'lucide-react';

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
    <footer className="h-6 border-t border-border bg-surface flex items-center justify-between px-3 text-[11px] text-text-muted select-none shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3">
        {/* Git Branch */}
        <span className="flex items-center gap-1 hover:text-text-primary cursor-pointer transition">
          <GitBranch size={12} />
          {gitStatus?.branch || 'no repo'}
        </span>

        {/* Modified files */}
        {modifiedCount > 0 && (
          <span className="flex items-center gap-1 text-warning">
            <AlertCircle size={11} />
            {modifiedCount} modified
          </span>
        )}

        {/* Errors */}
        <span className="hover:text-text-primary cursor-pointer transition">
          0 Errors, 0 Warnings
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Agent Status */}
        <span className={`flex items-center gap-1 ${
          agentStatus === 'running' ? 'text-success' :
          agentStatus === 'error' ? 'text-danger' : 'text-text-muted'
        }`}>
          <Zap size={11} />
          Agent: {agentStatus}
        </span>

        {/* Provider */}
        <span className="flex items-center gap-1">
          {activeProvider.isConnected ? (
            <Wifi size={11} className="text-success" />
          ) : (
            <WifiOff size={11} className="text-text-muted" />
          )}
          {activeProvider.name}
        </span>

        {/* Sync */}
        <span className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${
            workspacePath ? 'bg-success animate-pulse' : 'bg-text-muted'
          }`} />
          {workspacePath ? 'Live Sync' : 'No workspace'}
        </span>

        <span>UTF-8</span>
      </div>
    </footer>
  );
}
