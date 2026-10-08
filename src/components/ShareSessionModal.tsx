import React, { useState } from 'react';
import { Users, Copy, Check, Globe, Shield, GitBranch, X, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

export const ShareSessionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const sessionUrl = 'https://brain.vendra.uz/session/lobby-join-race?token=vd-live-8a13c2';

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(sessionUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md bg-surface border border-border-light rounded-2xl shadow-2xl overflow-hidden p-5"
      >
        <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-accent" />
            <h3 className="font-bold text-sm text-text-primary">Share Multiplayer Session</h3>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-6 w-6 p-0">
            <X size={14} />
          </button>
        </div>

        <p className="text-xs text-text-secondary leading-relaxed mb-4">
          Teammates can join this session in parallel with their own local agent CLIs (Claude Code, Codex, OpenCode). Live cursors, file locks, and git snapshots will sync automatically via The Shared Brain.
        </p>

        {/* Share Link Box */}
        <div className="p-3 bg-bgdeep rounded-xl border border-border mb-4">
          <label className="block text-[10px] text-text-muted font-semibold uppercase tracking-wider mb-1">
            Session URL (brain.vendra.uz)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={sessionUrl}
              className="w-full bg-transparent text-xs font-mono text-accent outline-none truncate"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="btn btn-primary h-7 px-2.5 text-xs shrink-0"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Teammate Permissions */}
        <div className="space-y-2 mb-5">
          <div className="flex items-center justify-between p-2.5 bg-bgside rounded-lg border border-border text-xs">
            <span className="flex items-center gap-2 text-text-primary">
              <Shield size={14} className="text-ok" />
              <span>Independent Git Worktrees</span>
            </span>
            <span className="text-[10px] text-ok font-mono font-medium">ISOLATED</span>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-bgside rounded-lg border border-border text-xs">
            <span className="flex items-center gap-2 text-text-primary">
              <Globe size={14} className="text-accent" />
              <span>Coordination Layer</span>
            </span>
            <span className="text-[10px] text-text-muted font-mono">brain.vendra.uz:4000</span>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost text-xs h-8"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
};
