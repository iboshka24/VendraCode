import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AgentLane, Session, ApprovalRequest, LLMProvider } from '@/types/index';
import { 
  Play, Pause, Square, Plus, AlertTriangle, CheckCircle, Clock, 
  GitBranch, File, Users, Bot, Zap, Shield, GitCommit, ArrowUpRight,
  Sparkles, Check, CheckCheck, RefreshCw, Terminal, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const MissionControl: React.FC = () => {
  const {
    agentLanes,
    approvals,
    resolveApproval,
    addAgentLane,
    updateAgentLane,
    activeLocks,
    brainActions,
    localCLIs,
    workspacePath,
  } = useAppStore();

  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentProvider, setNewAgentProvider] = useState<LLMProvider>('anthropic');
  const [newAgentModel, setNewAgentModel] = useState('claude-3-7-sonnet');
  const [hiveEnabled, setHiveEnabled] = useState(true);
  const [swarmCap, setSwarmCap] = useState(4);
  const [sharedGoal, setSharedGoal] = useState('Refactor authentication flow and coordinate lobby state with zero merge conflicts');

  // Computed file overlaps
  const fileOverlaps = useMemo(() => {
    const map: Record<string, string[]> = {};
    
    agentLanes.forEach(agent => {
      agent.filesEditing.forEach(file => {
        if (!map[file]) map[file] = [];
        if (!map[file].includes(agent.name)) map[file].push(agent.name);
      });
    });

    if (activeLocks) {
      Object.entries(activeLocks).forEach(([file, lock]) => {
        if (!map[file]) map[file] = [];
        if (!map[file].includes(lock.agentName)) map[file].push(lock.agentName);
      });
    }

    return Object.entries(map).filter(([_, agents]) => agents.length > 1);
  }, [agentLanes, activeLocks]);

  const handleCreateAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim()) return;
    
    const colors = ['#f06595', '#4dabf7', '#38d9a9', '#ffa94d', '#b197fc'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    addAgentLane({
      id: `agent-${Date.now()}`,
      name: newAgentName.trim(),
      model: newAgentModel,
      provider: newAgentProvider,
      status: 'idle',
      currentTask: 'Ready for new task in session',
      filesEditing: [],
      progress: 0,
      branch: 'session/new-feature',
      messages: [],
      avatar: newAgentName.substring(0, 2).toUpperCase(),
      color: randomColor,
    });
    
    setIsCreatingAgent(false);
    setNewAgentName('');
  };

  const handleLaunchCLI = async (cliBin: string, cliName: string) => {
    const agentId = `cli-${cliBin}-${Date.now()}`;
    addAgentLane({
      id: agentId,
      name: cliName,
      model: `${cliBin} CLI Native`,
      provider: 'custom',
      status: 'running',
      currentTask: `Active ${cliName} process coordinating with Brain`,
      filesEditing: [],
      progress: 40,
      branch: 'main',
      messages: [],
      avatar: cliBin.substring(0, 2).toUpperCase(),
      color: '#b197fc',
    });

    if (window.vendraAPI?.cli) {
      await window.vendraAPI.cli.spawnAgent({
        agentId,
        cliBin,
        cwd: workspacePath || undefined,
      });
    }
  };

  const repoName = workspacePath ? workspacePath.split('/').pop() : 'northlight/abyssal-drift-server';

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6 text-text-primary h-full select-none">
      {/* ─── Amoeba Header & Git Snapshots Bar ─────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 mb-6 border-b border-border gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-text-primary flex items-center gap-2">
              <span className="text-accent">amoeba</span>
              <span className="text-text-muted">/</span>
              <span>native harness</span>
            </h1>
            <span className="amoeba-chip text-text-secondary font-mono text-[11px]">
              {repoName}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            One layer to coordinate any agent, any model. 40% cheaper. Real-time sync.
          </p>
        </div>

        {/* Live Git Snapshots Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bgside border border-border text-xs">
            <span className="dotpulse" />
            <div className="flex flex-col">
              <span className="font-semibold text-text-primary text-[11px] leading-tight flex items-center gap-1">
                GIT SNAPSHOTS <span className="text-text-muted font-normal">Every 5s</span>
              </span>
              <span className="text-[10px] text-ok flex items-center gap-1">
                ✓ Team up to date · Zero conflicts
              </span>
            </div>
          </div>

          <button 
            type="button"
            onClick={() => setIsCreatingAgent(true)}
            className="btn btn-primary"
          >
            <Plus size={14} />
            <span>New Lane</span>
          </button>
        </div>
      </div>

      {/* ─── Overlap Warnings Banner ────────────────────────────────── */}
      {fileOverlaps.length > 0 ? (
        <div className="mb-6 p-4 bg-warning/10 border border-warning/30 rounded-xl flex items-start gap-3 text-warning">
          <AlertTriangle className="shrink-0 mt-0.5 text-warning" size={18} />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-xs text-warning tracking-wide">
                OVERLAP WARNINGS DETECTED
              </h3>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-warning/20 font-mono">
                {fileOverlaps.length} collisions
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-1 mb-2">
              Amoeba compares branches, file paths, planned work and task descriptions, and warns about possible overlap before a prompt runs.
            </p>
            <div className="space-y-1">
              {fileOverlaps.map(([file, agents]) => (
                <div key={file} className="text-xs flex items-center gap-2 font-mono bg-bgside/80 px-2.5 py-1 rounded border border-warning/20">
                  <File size={12} className="text-warning" />
                  <span className="text-text-primary">{file}</span>
                  <span className="text-text-muted">is being edited by</span>
                  <span className="text-warning font-semibold">{agents.join(', ')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6 px-4 py-2.5 bg-bgside border border-border rounded-xl flex items-center justify-between text-xs text-text-secondary">
          <div className="flex items-center gap-2">
            <CheckCheck size={16} className="text-ok" />
            <span>Advisory file locks active — zero collisions across all agent worktrees.</span>
          </div>
          <span className="font-mono text-[10px] text-text-muted">
            Brain status: SYNCED
          </span>
        </div>
      )}

      {/* ─── Swarm / Hive Controls Bar ─────────────────────────────── */}
      <div className="mb-6 p-3 bg-bgside border border-border rounded-xl flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-semibold text-text-primary">
            <Layers size={16} className="text-accent" />
            <span>Swarm Hive</span>
          </div>
          <div className="flex items-center gap-1 bg-chip p-0.5 rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setHiveEnabled(true)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                hiveEnabled ? 'bg-pop text-popfg font-semibold shadow' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              On
            </button>
            <button
              type="button"
              onClick={() => setHiveEnabled(false)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                !hiveEnabled ? 'bg-pop text-popfg font-semibold shadow' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Off
            </button>
          </div>
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-text-muted">Agent Cap:</span>
            <button 
              type="button" 
              onClick={() => setSwarmCap(Math.max(1, swarmCap - 1))}
              className="btn btn-ghost h-6 w-6 p-0 font-bold"
            >
              -
            </button>
            <span className="font-mono font-semibold px-2">{swarmCap}</span>
            <button 
              type="button" 
              onClick={() => setSwarmCap(Math.min(16, swarmCap + 1))}
              className="btn btn-ghost h-6 w-6 p-0 font-bold"
            >
              +
            </button>
          </div>
        </div>

        {/* Local CLI Quick Launchers */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-text-muted">Spawn Local Process:</span>
          {localCLIs && localCLIs.filter(c => c.isInstalled).map(cli => (
            <button
              key={cli.id}
              type="button"
              onClick={() => handleLaunchCLI(cli.bin, cli.name)}
              className="btn btn-ghost text-xs h-7 font-mono"
              title={`Spawn ${cli.name} lane inside worktree`}
            >
              <Plus size={12} className="text-accent" />
              {cli.bin}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Create Custom Lane Form ─────────────────────────────────── */}
      <AnimatePresence>
        {isCreatingAgent && (
          <motion.form 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 p-4 bg-surface border border-border-light rounded-xl flex flex-wrap gap-3 items-end overflow-hidden"
            onSubmit={handleCreateAgent}
          >
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] text-text-muted mb-1 font-medium">Teammate / Agent Name</label>
              <input 
                type="text" 
                value={newAgentName}
                onChange={e => setNewAgentName(e.target.value)}
                className="vc-input"
                placeholder="e.g. Devon or Frontend Specialist"
                autoFocus
              />
            </div>
            <div className="w-44">
              <label className="block text-[11px] text-text-muted mb-1 font-medium">Provider</label>
              <select 
                value={newAgentProvider}
                onChange={e => setNewAgentProvider(e.target.value as LLMProvider)}
                className="vc-input"
              >
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI / Codex</option>
                <option value="nvidia">NVIDIA NIM</option>
                <option value="custom">Custom Native</option>
              </select>
            </div>
            <div className="w-44">
              <label className="block text-[11px] text-text-muted mb-1 font-medium">Model</label>
              <input 
                type="text" 
                value={newAgentModel}
                onChange={e => setNewAgentModel(e.target.value)}
                className="vc-input"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary h-8">
                Add Lane
              </button>
              <button type="button" onClick={() => setIsCreatingAgent(false)} className="btn btn-ghost h-8">
                Cancel
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* ─── Amoeba Lanes Grid ──────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold tracking-wide uppercase text-text-secondary flex items-center gap-2">
            <span>Lanes in Mission Control</span>
            <span className="text-[10px] text-text-muted font-normal lowercase font-mono">
              ({agentLanes.length} active)
            </span>
          </h2>
          <span className="text-xs text-text-muted">
            Everyone’s agents, plans and changes in one place
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <AnimatePresence>
            {agentLanes.map(agent => (
              <motion.div
                key={agent.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="p-3.5 bg-bgside rounded-xl border border-border hover:border-border-light transition-all flex flex-col justify-between shadow-sm relative group"
              >
                {/* Lane Top Header */}
                <div>
                  <div className="flex items-start justify-between mb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white shadow-sm ring-2 ring-black"
                        style={{ backgroundColor: agent.color }}
                      >
                        {agent.avatar}
                      </div>
                      <div>
                        <h3 className="font-semibold text-text-primary text-xs leading-tight flex items-center gap-1.5">
                          {agent.name}
                          {agent.id === 'user-lane' && (
                            <span className="text-[9px] bg-primary/20 text-primary px-1 rounded">LOCAL</span>
                          )}
                        </h3>
                        <p className="text-[10px] text-text-muted font-mono">{agent.model}</p>
                      </div>
                    </div>

                    {/* Status badge */}
                    <div className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-chip border border-border text-text-secondary">
                      {agent.status === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />}
                      {agent.status === 'waiting' && <Clock size={10} className="text-warning" />}
                      <span className="capitalize">{agent.status}</span>
                    </div>
                  </div>

                  {/* Branch Pill */}
                  <div className="flex items-center gap-1 text-[10px] text-text-muted font-mono bg-chip/60 px-2 py-1 rounded border border-border/80 mb-2 truncate">
                    <GitBranch size={10} />
                    <span className="truncate">{agent.branch}</span>
                  </div>

                  {/* Current Task / Plan */}
                  <div className="text-xs text-text-secondary leading-relaxed line-clamp-3 mb-3">
                    {agent.currentTask}
                  </div>

                  {/* Files being edited */}
                  {agent.filesEditing.length > 0 && (
                    <div className="space-y-1 mb-3">
                      <div className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">
                        Files in Worktree:
                      </div>
                      {agent.filesEditing.map(file => (
                        <div key={file} className="text-[10px] font-mono text-accent bg-bgdeep px-1.5 py-0.5 rounded border border-border truncate">
                          {file}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Progress bar & controls */}
                <div className="mt-3 pt-2.5 border-t border-border/80">
                  {agent.status === 'running' && (
                    <div className="w-full bg-chip rounded-full h-1 mb-2.5 overflow-hidden">
                      <div 
                        className="bg-ok h-1 rounded-full transition-all duration-300"
                        style={{ width: `${agent.progress}%` }}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-text-muted font-mono">
                      {agent.status === 'running' ? `${agent.progress}% done` : 'Standby'}
                    </span>

                    <div className="flex gap-1">
                      {agent.status === 'running' ? (
                        <button 
                          type="button"
                          onClick={() => updateAgentLane(agent.id, { status: 'idle' })}
                          className="btn btn-ghost h-6 px-2 text-xs"
                          title="Pause"
                        >
                          <Pause size={12} />
                        </button>
                      ) : (
                        <button 
                          type="button"
                          onClick={() => updateAgentLane(agent.id, { status: 'running' })}
                          className="btn btn-ghost h-6 px-2 text-xs"
                          title="Resume"
                        >
                          <Play size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* ─── Amoeba Approval Gates ─────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold tracking-wide uppercase text-text-secondary flex items-center gap-2">
            <Shield size={16} className="text-warning" />
            <span>Approval Gate</span>
            {approvals.filter(a => a.status === 'pending').length > 0 && (
              <span className="bg-warning text-bgdeep text-[10px] px-1.5 py-0.2 rounded font-bold">
                {approvals.filter(a => a.status === 'pending').length} waiting
              </span>
            )}
          </h2>
          <span className="text-xs text-text-muted">
            Each person maintains approval gates for agent git pushes and disk writes
          </span>
        </div>

        <div className="space-y-3">
          {approvals.filter(a => a.status === 'pending').length === 0 ? (
            <div className="p-6 text-center text-text-muted border border-border border-dashed rounded-xl bg-bgside/40">
              <CheckCircle size={24} className="mx-auto mb-2 opacity-30 text-ok" />
              <p className="text-xs">All agent requests approved. No pending gate authorizations.</p>
            </div>
          ) : (
            <AnimatePresence>
              {approvals.filter(a => a.status === 'pending').map(approval => (
                <motion.div 
                  key={approval.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-4 bg-bgside border border-border-light rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-semibold text-xs text-text-primary">{approval.agentName}</span>
                      <span className="text-[10px] text-text-muted font-mono px-2 py-0.5 bg-chip rounded border border-border uppercase">
                        {approval.action}
                      </span>
                      <span className="text-[10px] text-text-hint font-mono">
                        {new Date(approval.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary font-mono">{approval.description}</p>
                    {approval.details && (
                      <div className="mt-2 text-[11px] font-mono text-text-muted bg-bgdeep p-2 rounded border border-border overflow-x-auto">
                        {approval.details}
                      </div>
                    )}
                  </div>
                  
                  {/* Tactile Approve / Deny Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button 
                      type="button"
                      onClick={() => resolveApproval(approval.id, 'denied')}
                      className="btn btn-danger text-xs h-8"
                    >
                      <Square size={12} />
                      Deny
                    </button>
                    <button 
                      type="button"
                      onClick={() => resolveApproval(approval.id, 'approved')}
                      className="btn btn-success text-xs h-8"
                    >
                      <Check size={14} />
                      Approve
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* ─── The Shared Brain: Pinned Files & Live Stream ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Brain Memories */}
        <div className="p-4 bg-bgside border border-border rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold tracking-wide uppercase text-text-secondary flex items-center gap-2">
              <Zap size={14} className="text-accent" />
              <span>The Shared Brain · Pinned Memories</span>
            </h3>
            <span className="text-[10px] text-text-muted font-mono">3 pinned</span>
          </div>

          <div className="space-y-2">
            <div className="p-2.5 bg-bgdeep rounded-lg border border-border text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-accent text-[11px]">src/lobby/join.ts · 8a13c2e</span>
                <span className="text-[10px] text-text-hint">Alice · 2m ago</span>
              </div>
              <p className="text-text-secondary text-[11px]">
                the seating path is pickOpenSlot, reserveSlot, retryJoin
              </p>
            </div>

            <div className="p-2.5 bg-bgdeep rounded-lg border border-border text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-accent text-[11px]">src/cart/totals.ts · 4f19b7d</span>
                <span className="text-[10px] text-text-hint">Chen · 8m ago</span>
              </div>
              <p className="text-text-secondary text-[11px]">
                cart totals recompute on promo change, do not cache
              </p>
            </div>

            <div className="p-2.5 bg-bgdeep rounded-lg border border-border text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-accent text-[11px]">src/net/session_store.ts · 8a13c2e</span>
                <span className="text-[10px] text-text-hint">Alice · 1h ago</span>
              </div>
              <p className="text-text-secondary text-[11px]">
                reserveSlot() writes without comparing, that is the bug
              </p>
            </div>
          </div>
        </div>

        {/* Live Coordination Action Feed */}
        <div className="p-4 bg-bgside border border-border rounded-xl flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold tracking-wide uppercase text-text-secondary flex items-center gap-2">
              <RefreshCw size={14} className="text-accent" />
              <span>Live Coordination Stream</span>
            </h3>
            <span className="text-[10px] text-text-muted font-mono">.vendracode/brain.json</span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-56 space-y-1.5 pr-1">
            {brainActions.length === 0 ? (
              <div className="text-xs text-text-muted text-center py-8">
                Local and CLI agents stream their file locks and thoughts in real time.
              </div>
            ) : (
              brainActions.map((act) => (
                <div key={act.id} className="text-[11px] flex items-center justify-between p-2 rounded bg-bgdeep border border-border">
                  <div className="flex items-center gap-2 truncate">
                    <span className="px-1.5 py-0.2 rounded bg-chip text-text-primary font-mono text-[10px] shrink-0">
                      {act.agentName}
                    </span>
                    <span className="text-text-primary font-medium shrink-0">{act.action}</span>
                    <span className="text-text-secondary truncate">{act.summary}</span>
                  </div>
                  <span className="text-[9px] text-text-muted font-mono shrink-0 ml-2">
                    {new Date(act.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
