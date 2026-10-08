import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AgentLane, Session, ApprovalRequest, LLMProvider } from '@/types/index';
import { 
  Play, Pause, Square, Plus, AlertTriangle, CheckCircle, Clock, 
  GitBranch, File, Users, Bot, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const MissionControl: React.FC = () => {
  const {
    agentLanes,
    approvals,
    resolveApproval,
    addAgentLane,
    updateAgentLane
  } = useAppStore();

  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentProvider, setNewAgentProvider] = useState<LLMProvider>('openai');
  const [newAgentModel, setNewAgentModel] = useState('gpt-4o');

  const fileOverlaps = useMemo(() => {
    const map: Record<string, string[]> = {};
    agentLanes.forEach(agent => {
      agent.filesEditing.forEach(file => {
        if (!map[file]) map[file] = [];
        map[file].push(agent.name);
      });
    });
    return Object.entries(map).filter(([_, agents]) => agents.length > 1);
  }, [agentLanes]);

  const handleCreateAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim()) return;
    
    addAgentLane({
      id: `agent-${Date.now()}`,
      name: newAgentName.trim(),
      model: newAgentModel,
      provider: newAgentProvider,
      status: 'idle',
      currentTask: 'Ready for new task',
      filesEditing: [],
      progress: 0,
      branch: 'main',
      messages: [],
      avatar: newAgentName.substring(0, 2).toUpperCase(),
      color: '#' + Math.floor(Math.random()*16777215).toString(16),
    });
    
    setIsCreatingAgent(false);
    setNewAgentName('');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-success';
      case 'waiting': return 'text-warning';
      case 'error': return 'text-danger';
      case 'completed': return 'text-accent';
      default: return 'text-text-muted';
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-background p-6 text-text-primary h-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Zap className="text-primary" />
          Mission Control
        </h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg transition-colors">
          <Plus size={18} />
          New Session
        </button>
      </div>

      {fileOverlaps.length > 0 && (
        <div className="mb-6 p-4 bg-warning/10 border border-warning/30 rounded-lg flex items-start gap-3 text-warning">
          <AlertTriangle className="shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="font-semibold mb-1">File Overlap Warning</h3>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {fileOverlaps.map(([file, agents]) => (
                <li key={file}>
                  <span className="font-mono text-text-primary">{file}</span> is being edited by {agents.join(', ')}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Bot size={20} />
            Active Agents
          </h2>
          <button 
            onClick={() => setIsCreatingAgent(true)}
            className="flex items-center gap-2 text-sm px-3 py-1.5 bg-primary/20 text-primary hover:bg-primary/30 rounded-lg transition-colors"
          >
            <Plus size={16} />
            Create New Agent
          </button>
        </div>

        {isCreatingAgent && (
          <motion.form 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-surface border border-border rounded-xl flex gap-4 items-end"
            onSubmit={handleCreateAgent}
          >
            <div className="flex-1">
              <label className="block text-xs text-text-muted mb-1">Agent Name</label>
              <input 
                type="text" 
                value={newAgentName}
                onChange={e => setNewAgentName(e.target.value)}
                className="w-full bg-background border border-border rounded p-2 text-sm focus:border-primary outline-none"
                placeholder="e.g. Frontend Wizard"
                autoFocus
              />
            </div>
            <div className="w-48">
              <label className="block text-xs text-text-muted mb-1">Provider</label>
              <select 
                value={newAgentProvider}
                onChange={e => setNewAgentProvider(e.target.value as LLMProvider)}
                className="w-full bg-background border border-border rounded p-2 text-sm focus:border-primary outline-none"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="nvidia">NVIDIA</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="w-48">
              <label className="block text-xs text-text-muted mb-1">Model</label>
              <input 
                type="text" 
                value={newAgentModel}
                onChange={e => setNewAgentModel(e.target.value)}
                className="w-full bg-background border border-border rounded p-2 text-sm focus:border-primary outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded font-medium transition-colors">
                Add
              </button>
              <button type="button" onClick={() => setIsCreatingAgent(false)} className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded transition-colors">
                Cancel
              </button>
            </div>
          </motion.form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {agentLanes.map(agent => (
              <motion.div
                key={agent.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`p-4 bg-surface rounded-xl border ${
                  agent.status === 'running' 
                    ? 'border-t-2 border-t-primary border-border hover:border-border-light shadow-[0_0_15px_rgba(124,58,237,0.15)]' 
                    : 'border-border hover:border-border-light'
                } transition-all flex flex-col h-full`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm"
                      style={{ backgroundColor: agent.color }}
                    >
                      {agent.avatar}
                    </div>
                    <div>
                      <h3 className="font-semibold text-text-primary leading-tight">{agent.name}</h3>
                      <p className="text-xs text-text-muted">{agent.model}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full bg-background border border-border ${getStatusColor(agent.status)}`}>
                    {agent.status === 'running' && <span className="w-2 h-2 rounded-full bg-success animate-pulse" />}
                    {agent.status === 'waiting' && <Clock size={12} />}
                    {agent.status === 'idle' && <Square size={12} />}
                    {agent.status === 'error' && <AlertTriangle size={12} />}
                    <span className="capitalize">{agent.status}</span>
                  </div>
                </div>

                <div className="flex-1 mb-4">
                  <p className="text-sm text-text-secondary line-clamp-2 mb-2">
                    {agent.currentTask}
                  </p>
                  
                  {agent.filesEditing.length > 0 && (
                    <div className="space-y-1 mt-3">
                      <div className="text-xs text-text-muted flex items-center gap-1 mb-1.5">
                        <File size={12} /> Editing Files
                      </div>
                      {agent.filesEditing.map(file => (
                        <div key={file} className="text-xs bg-background/50 border border-border px-2 py-1 rounded font-mono truncate">
                          {file}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-auto">
                  {agent.status === 'running' && (
                    <div className="w-full bg-background rounded-full h-1.5 mb-3 overflow-hidden">
                      <div 
                        className="bg-primary h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${agent.progress}%` }}
                      />
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="flex items-center gap-1.5 text-xs text-text-muted bg-background px-2 py-1 rounded">
                      <GitBranch size={12} />
                      <span className="truncate max-w-[100px]">{agent.branch}</span>
                    </div>
                    
                    <div className="flex gap-1.5">
                      {agent.status === 'running' ? (
                        <button 
                          onClick={() => updateAgentLane(agent.id, { status: 'idle' })}
                          className="p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 rounded transition-colors"
                          title="Pause Agent"
                        >
                          <Pause size={16} />
                        </button>
                      ) : (
                        <button 
                          onClick={() => updateAgentLane(agent.id, { status: 'running' })}
                          className="p-1.5 text-text-muted hover:text-success hover:bg-success/10 rounded transition-colors"
                          title="Start Agent"
                        >
                          <Play size={16} />
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

      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
          <AlertTriangle className="text-warning" size={20} />
          Pending Approvals
          {approvals.filter(a => a.status === 'pending').length > 0 && (
            <span className="bg-warning text-warning-900 text-xs px-2 py-0.5 rounded-full font-bold ml-2">
              {approvals.filter(a => a.status === 'pending').length}
            </span>
          )}
        </h2>

        <div className="space-y-3">
          {approvals.filter(a => a.status === 'pending').length === 0 ? (
            <div className="p-8 text-center text-text-muted border border-border border-dashed rounded-xl bg-surface/50">
              <CheckCircle size={32} className="mx-auto mb-3 opacity-20" />
              <p>No pending approvals</p>
            </div>
          ) : (
            <AnimatePresence>
              {approvals.filter(a => a.status === 'pending').map(approval => (
                <motion.div 
                  key={approval.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="p-4 bg-surface border border-border rounded-xl flex items-center gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-text-primary">{approval.agentName}</span>
                      <span className="text-xs text-text-muted px-2 py-0.5 bg-background rounded-full border border-border capitalize">
                        {approval.action.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-text-secondary">{approval.description}</p>
                    {approval.details && (
                      <div className="mt-2 text-xs font-mono text-text-muted bg-background p-2 rounded border border-border overflow-x-auto">
                        {approval.details}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => resolveApproval(approval.id, 'denied')}
                      className="px-3 py-1.5 text-sm text-danger hover:bg-danger/10 border border-danger/30 hover:border-danger rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Square size={14} /> Deny
                    </button>
                    <button 
                      onClick={() => resolveApproval(approval.id, 'approved')}
                      className="px-3 py-1.5 text-sm text-success hover:bg-success/10 border border-success/30 hover:border-success rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <CheckCircle size={14} /> Approve
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
};

