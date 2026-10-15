import React, { useState, useEffect } from 'react';
import { 
  Users, Copy, Check, Globe, Shield, GitBranch, X, 
  Github, Download, ArrowRight, Cloud, RefreshCw, Layers, Sparkles 
} from 'lucide-react';
import { motion } from 'framer-motion';
import { createSwarm, parseSwarmInvite, swarmInvite } from '@/utils/swarmSession';
import { useAppStore } from '@/stores/appStore';

export const ShareSessionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const { workspacePath, setWorkspacePath, setFileTree, setBrainCredentials, setBrainRepoUrl, worktrees, brainSessionId, brainSessionToken, brainRepoUrl } = useAppStore();
  const [activeTab, setActiveTab] = useState<'share' | 'join'>('share');
  const [copied, setCopied] = useState(false);
  const [githubRepoUrl, setGithubRepoUrl] = useState(brainRepoUrl || '');
  const [joinUrlInput, setJoinUrlInput] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [cloneStatus, setCloneStatus] = useState<string | null>(null);

  // Auto-detect Git remote origin from current workspace
  useEffect(() => {
    if (!isOpen || !workspacePath) return;

    if (window.vendraAPI?.os) {
      window.vendraAPI.os.exec('git remote get-url origin', workspacePath).then((res) => {
        if (res.stdout && res.stdout.trim()) {
          const origin = res.stdout.trim();
          // Convert git@github.com:user/repo.git to https://github.com/user/repo
          const httpUrl = origin
            .replace(/^git@github\.com:/, 'https://github.com/')
            .replace(/\.git$/, '');
          setGithubRepoUrl(httpUrl);
        }
      }).catch(() => {});
    }
  }, [isOpen, workspacePath]);

  if (!isOpen) return null;

  const fullSessionUrl = swarmInvite({ sessionId: brainSessionId, token: brainSessionToken }, githubRepoUrl);

  const handleCopy = async () => {
    setCloneStatus(null);
    try {
      const result = await window.vendraAPI.swarm.share({ sessionId: brainSessionId, token: brainSessionToken, repoUrl: githubRepoUrl });
      if (!result.success) throw new Error(result.error);
      setBrainRepoUrl(result.repoUrl || githubRepoUrl);
      await navigator.clipboard.writeText(swarmInvite({ sessionId: brainSessionId, token: brainSessionToken }, result.repoUrl || githubRepoUrl));
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch (error: any) { setCloneStatus(error.message); }
  };

  const handleJoinFriendSession = async () => {
    setIsCloning(true);
    setCloneStatus('Checking invitation and preparing your isolated worktree…');
    try {
      const invite = parseSwarmInvite(joinUrlInput);
      const result = await window.vendraAPI.swarm.join(invite);
      if (!result.success || !result.path) throw new Error(result.error || 'Could not prepare the shared repository.');
      const entries = await window.vendraAPI.fs.readDir(result.path);
      setBrainCredentials(invite.sessionId, invite.token);
      setBrainRepoUrl(result.repoUrl || invite.repoUrl);
      setWorkspacePath(result.path);
      localStorage.setItem('vendracode-workspace', result.path);
      setFileTree(entries);
      setCloneStatus(null);
      onClose();
    } catch (error: any) { setCloneStatus(error.message); }
    finally { setIsCloning(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-[#121316] border border-[#262837] rounded-2xl shadow-2xl overflow-hidden p-6 text-text-primary"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
              <Users size={16} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-text-primary">Share this session</h3>
              <p className="text-[11px] text-text-muted">Cloudflare Edge Subdomain · brain.vendra.uz</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-7 w-7 p-0">
            <X size={15} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-chip p-1 rounded-xl mb-4 border border-border">
          <button
            type="button"
            onClick={() => setActiveTab('share')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'share'
                ? 'bg-surface text-text-primary shadow-sm border border-border-light'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Cloud size={13} className="text-ok" />
            <span>Share My Session</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('join')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'join'
                ? 'bg-surface text-text-primary shadow-sm border border-border-light'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <ArrowRight size={13} className="text-accent" />
            <span>Join Friend's Swarm</span>
          </button>
        </div>

        {activeTab === 'share' ? (
          <div className="space-y-4">
            <p className="text-xs text-text-secondary leading-relaxed">
              Share this private room with teammates using the <strong>same GitHub repository</strong>. Each friend joins in a separate local Git worktree. Live highlights and agent activity are shared; Git push/pull transfers committed code.
            </p>

            {/* Linked Central GitHub Repo */}
            <div className="p-3 bg-bgdeep rounded-xl border border-border">
              <label className="block text-[10px] text-text-muted font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Github size={12} className="text-text-primary" />
                Linked GitHub Repository (All Friends Work on This Repo)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={githubRepoUrl}
                  onChange={(e) => setGithubRepoUrl(e.target.value)}
                  placeholder="https://github.com/username/repository"
                  className="vc-input text-xs font-mono py-1.5 h-8 flex-1"
                />
              </div>
              <span className="text-[10px] text-text-muted mt-1 block">
                Teammates who join this session will automatically clone and sync to this repo.
              </span>
            </div>

            {/* Cloudflare Session Link Box */}
            <div className="p-3 bg-bgdeep rounded-xl border border-border">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-text-muted font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Globe size={12} className="text-ok" />
                  Cloudflare Live Session URL
                </label>
                <span className="text-[9.5px] text-ok bg-ok/10 border border-ok/30 px-1.5 py-0.2 rounded font-mono">
                  Cloudflare Durable Object
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={fullSessionUrl}
                  className="w-full bg-surface/50 border border-border px-2.5 py-1.5 rounded-lg text-[11px] font-mono text-accent outline-none truncate"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="btn btn-primary h-8 px-3 text-xs shrink-0 gap-1.5 shadow-md"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copied ? 'Copied' : 'Copy Link'}</span>
                </button>
              </div>
            </div>

            {/* Subdomain & Git Info Badges */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-bgside rounded-xl border border-border flex items-center gap-2">
                <Cloud size={14} className="text-ok shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] text-text-muted font-semibold uppercase">Cloudflare Edge</div>
                  <div className="text-[11px] font-mono text-text-primary truncate">brain.vendra.uz</div>
                </div>
              </div>
              <div className="p-2.5 bg-bgside rounded-xl border border-border flex items-center gap-2">
                <Shield size={14} className="text-accent shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] text-text-muted font-semibold uppercase">Git Worktree Sync</div>
                  <div className="text-[11px] font-mono text-text-primary truncate">
                    {worktrees.length || 1} worktree{(worktrees.length || 1) === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Join Friend's Session */
          <div className="space-y-4">
            <p className="text-xs text-text-secondary leading-relaxed">
              Paste your friend's <strong>brain.vendra.uz</strong> invite link below. VendraCode will automatically connect to their session, clone the shared GitHub repository, and attach your local agents to the swarm.
            </p>

            <div className="p-3 bg-bgdeep rounded-xl border border-border">
              <label className="block text-[10px] text-text-muted font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Globe size={12} className="text-accent" />
                Friend's full invitation URL
              </label>
              <input
                type="text"
                value={joinUrlInput}
                onChange={(e) => setJoinUrlInput(e.target.value)}
                placeholder="https://brain.vendra.uz/session/<session-id>?repo=https://github.com/..."
                className="vc-input text-xs font-mono py-1.5 h-9 w-full mb-3"
              />

              <button
                type="button"
                onClick={handleJoinFriendSession}
                disabled={isCloning || !joinUrlInput.trim()}
                className="btn btn-primary w-full text-xs h-8 justify-center gap-2 shadow-md"
              >
                {isCloning ? (
                  <>
                    <RefreshCw size={13} className="animate-spin text-ok" />
                    <span>Cloning & Synchronizing...</span>
                  </>
                ) : (
                  <>
                    <Download size={13} />
                    <span>Clone Shared Repo & Join Swarm</span>
                  </>
                )}
              </button>
            </div>

            {cloneStatus && (
              <div className="p-2.5 bg-bgdeep rounded-lg border border-border text-xs font-mono text-ok">
                {cloneStatus}
              </div>
            )}
          </div>
        )}

        {cloneStatus && activeTab === 'share' && <p role="alert" className="text-xs text-warning mt-3">{cloneStatus}</p>}
        <button type="button" className="btn btn-ghost text-xs mt-3" onClick={() => { const room = createSwarm(); setBrainCredentials(room.sessionId, room.token); setCloneStatus(null); setCopied(false); }}>New private swarm</button>
        <div className="flex justify-end gap-2 mt-5 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost text-xs h-7"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};
