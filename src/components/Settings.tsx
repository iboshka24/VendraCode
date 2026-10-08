import React, { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { SettingsTab, ProviderConfig, LLMProvider } from '@/types/index';
import { 
  Settings as SettingsIcon, Monitor, Palette, Shield, 
  Users, GitBranch, Check, X, Plus, Trash2, TestTube, Bot, Terminal, Key
} from 'lucide-react';
import { motion } from 'framer-motion';

export const Settings: React.FC = () => {
  const { settings, updateSettings, updateProvider, settingsTab, setSettingsTab, localCLIs } = useAppStore();
  const [testingConnection, setTestingConnection] = useState<string | null>(null);

  const tabs = [
    { id: 'providers', label: 'Agents & Providers', icon: <Bot size={16} /> },
    { id: 'permissions', label: 'Permissions & Gates', icon: <Shield size={16} /> },
    { id: 'general', label: 'General', icon: <Monitor size={16} /> },
    { id: 'editor', label: 'Editor', icon: <Palette size={16} /> },
    { id: 'sessions', label: 'Sessions', icon: <GitBranch size={16} /> },
    { id: 'team', label: 'Team', icon: <Users size={16} /> },
  ] as const;

  const handleTestConnection = async (provider: ProviderConfig) => {
    setTestingConnection(provider.id);
    try {
      const headers: Record<string, string> = {};
      if (provider.apiKey) {
        headers['Authorization'] = `Bearer ${provider.apiKey}`;
      }
      
      const res = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/models`, {
        method: 'GET',
        headers
      });
      
      const isConnected = res.ok;
      updateProvider(provider.id, { isConnected });
    } catch (err) {
      updateProvider(provider.id, { isConnected: false });
    } finally {
      setTestingConnection(null);
    }
  };

  const addCustomProvider = () => {
    const newId = `custom-${Date.now()}` as LLMProvider;
    updateSettings({
      providers: [
        ...settings.providers,
        {
          id: newId,
          name: 'NVIDIA NIM or Custom',
          baseUrl: 'https://integrate.api.nvidia.com/v1',
          apiKey: '',
          model: 'meta/llama-3.3-70b-instruct',
          isConnected: false,
          icon: 'N'
        }
      ]
    });
  };

  const removeProvider = (id: string) => {
    if (settings.providers.length <= 1) return;
    updateSettings({
      providers: settings.providers.filter(p => p.id !== id)
    });
  };

  return (
    <div className="flex h-full w-full bg-background text-text-primary overflow-hidden select-none">
      {/* Sidebar */}
      <div className="w-60 bg-bgside border-r border-border flex flex-col shrink-0">
        <div className="p-4 border-b border-border bg-bgtitle">
          <h2 className="text-sm font-bold flex items-center gap-2 text-text-primary tracking-tight">
            <SettingsIcon className="text-text-muted" size={16} />
            Preferences
          </h2>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {tabs.map(tab => {
            const isSelected = settingsTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSettingsTab(tab.id as SettingsTab)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all ${
                  isSelected 
                    ? 'bg-chip text-text-primary font-semibold border border-border-light shadow-sm' 
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          {/* ─── Providers Tab (Amoeba Agents & Providers) ─── */}
          {settingsTab === 'providers' && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              {/* Local Agent CLIs Section */}
              <div className="bg-bgside border border-border rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Bot className="text-accent" size={18} />
                    <h3 className="text-sm font-bold text-text-primary tracking-tight">
                      Supported Local Agent CLIs (Native Harness)
                    </h3>
                  </div>
                  <span className="text-[10px] bg-ok/15 text-ok border border-ok/30 px-2 py-0.5 rounded font-mono font-medium">
                    Amoeba Shared Brain Active
                  </span>
                </div>
                <p className="text-xs text-text-secondary mb-4 leading-relaxed">
                  VendraCode detects local AI coding CLIs on this machine (agy, cline, opencode, claude code) and attaches them to the shared coordination Brain with zero merge conflicts.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(localCLIs.length > 0 ? localCLIs : [
                    { id: 'agy', name: 'Antigravity CLI (agy)', bin: 'agy', isInstalled: true, path: '/home/ibrohim/.local/bin/agy' },
                    { id: 'cline', name: 'Cline CLI', bin: 'cline', isInstalled: true, path: '/usr/bin/cline' },
                    { id: 'opencode', name: 'OpenCode CLI', bin: 'opencode', isInstalled: true, path: '/home/ibrohim/.opencode/bin/opencode' },
                    { id: 'claude', name: 'Claude Code CLI', bin: 'claude', isInstalled: true, path: '/usr/bin/claude' },
                  ]).map(cli => (
                    <div key={cli.id} className="p-3 bg-bgdeep border border-border rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded bg-chip border border-border flex items-center justify-center font-mono text-[11px] font-bold text-text-primary">
                          {cli.bin.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-xs font-semibold flex items-center gap-1.5 text-text-primary">
                            {cli.name}
                            {cli.isInstalled && (
                              <span className="w-1.5 h-1.5 rounded-full bg-ok" title="Detected on host" />
                            )}
                          </div>
                          <div className="text-[10px] text-text-muted font-mono truncate max-w-[180px]">
                            {cli.path || `${cli.bin} in PATH`}
                          </div>
                        </div>
                      </div>
                      <div>
                        {cli.isInstalled ? (
                          <span className="text-[10px] bg-ok/10 text-ok border border-ok/25 px-2 py-0.5 rounded font-mono">
                            Connected
                          </span>
                        ) : (
                          <span className="text-[10px] bg-chip text-text-muted px-2 py-0.5 rounded font-mono">
                            Not Found
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* API Providers */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">API Providers & Models</h3>
                    <p className="text-xs text-text-muted">OpenAI, Anthropic, NVIDIA NIM, and custom OpenAI-compatible endpoints.</p>
                  </div>
                  <button 
                    type="button"
                    onClick={addCustomProvider}
                    className="btn btn-primary text-xs"
                  >
                    <Plus size={14} />
                    Add Provider
                  </button>
                </div>
                
                <div className="space-y-4">
                  {settings.providers.map(provider => (
                    <div key={provider.id} className="p-4 bg-bgside border border-border rounded-xl shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded bg-chip flex items-center justify-center font-bold text-xs text-text-primary border border-border">
                            {provider.icon}
                          </div>
                          <div>
                            {provider.id.startsWith('custom') ? (
                              <input 
                                type="text" 
                                value={provider.name}
                                onChange={e => updateProvider(provider.id, { name: e.target.value })}
                                className="vc-input text-xs font-semibold py-1 h-7"
                              />
                            ) : (
                              <h4 className="font-semibold text-xs text-text-primary">{provider.name}</h4>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {provider.isConnected ? (
                            <span className="flex items-center gap-1 text-[10px] text-ok bg-ok/10 px-2 py-0.5 rounded border border-ok/20 font-mono">
                              <Check size={12} /> Connected
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] text-text-muted bg-chip px-2 py-0.5 rounded border border-border font-mono">
                              <X size={12} /> Unverified
                            </span>
                          )}
                          {provider.id.startsWith('custom') && (
                            <button 
                              type="button"
                              onClick={() => removeProvider(provider.id)}
                              className="btn btn-ghost h-7 w-7 p-0 text-danger"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 text-xs">
                        <div>
                          <label className="block text-[11px] text-text-muted mb-1 font-medium">Base URL</label>
                          <input 
                            type="text" 
                            value={provider.baseUrl}
                            onChange={e => updateProvider(provider.id, { baseUrl: e.target.value })}
                            className="vc-input font-mono text-[11px]"
                            placeholder="https://api.example.com/v1"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-text-muted mb-1 font-medium">API Key</label>
                          <input 
                            type="password" 
                            value={provider.apiKey}
                            onChange={e => updateProvider(provider.id, { apiKey: e.target.value })}
                            className="vc-input font-mono text-[11px]"
                            placeholder="Bearer token or API key"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-[11px] text-text-muted mb-1 font-medium">Model ID</label>
                          <input 
                            type="text" 
                            value={provider.model}
                            onChange={e => updateProvider(provider.id, { model: e.target.value })}
                            className="vc-input font-mono text-[11px]"
                            placeholder="e.g. gpt-4o, claude-3-7-sonnet, meta/llama-3.3-70b-instruct"
                          />
                        </div>
                      </div>
                      
                      <div className="flex justify-end">
                        <button 
                          type="button"
                          onClick={() => handleTestConnection(provider)}
                          disabled={testingConnection === provider.id || !provider.baseUrl}
                          className="btn btn-ghost text-xs h-7"
                        >
                          {testingConnection === provider.id ? (
                            <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <TestTube size={13} />
                          )}
                          Test Connection
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── Permissions Tab ─── */}
          {settingsTab === 'permissions' && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <h3 className="text-sm font-bold text-text-primary">Agent Security & Approval Gates</h3>
              <p className="text-xs text-text-secondary mb-4">
                Control what autonomous agents and local CLIs are permitted to perform without human confirmation.
              </p>
              
              <div className="space-y-2">
                {[
                  { key: 'allowFileCreate', label: 'Create Files', desc: 'Allow agents to create new files in dedicated worktrees' },
                  { key: 'allowFileDelete', label: 'Delete Files', desc: 'Allow agents to delete files in the codebase' },
                  { key: 'allowCommands', label: 'Execute Shell Commands', desc: 'Allow agents to run build, test, and shell commands' },
                  { key: 'allowGitPush', label: 'Git Push', desc: 'Allow agents to push branches to origin remote' },
                  { key: 'requireApproval', label: 'Require Approval Gate', desc: 'Show interactive approval card before destructive actions' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between p-3.5 bg-bgside rounded-xl border border-border">
                    <div>
                      <div className="text-xs font-semibold text-text-primary">{label}</div>
                      <div className="text-[11px] text-text-muted">{desc}</div>
                    </div>
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 accent-pop cursor-pointer"
                      checked={settings.permissions[key as keyof typeof settings.permissions]}
                      onChange={e => updateSettings({ 
                        permissions: { ...settings.permissions, [key]: e.target.checked } 
                      })}
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ─── General Tab ─── */}
          {settingsTab === 'general' && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <h3 className="text-sm font-bold text-text-primary">General Configuration</h3>
              <div className="p-4 bg-bgside rounded-xl border border-border flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-text-primary">Theme</div>
                  <div className="text-[11px] text-text-muted">Amoeba True Dark</div>
                </div>
                <span className="amoeba-chip text-xs font-mono font-medium">Dark (Native)</span>
              </div>
              <div className="p-4 bg-bgside rounded-xl border border-border flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-text-primary">Automatic Git Snapshots</div>
                  <div className="text-[11px] text-text-muted">Captures repository worktrees every 5 seconds</div>
                </div>
                <span className="text-xs text-ok font-mono font-semibold">Enabled</span>
              </div>
            </motion.div>
          )}

          {/* ─── Editor Tab ─── */}
          {settingsTab === 'editor' && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <h3 className="text-sm font-bold text-text-primary">Editor Settings</h3>
              <div className="p-4 bg-bgside rounded-xl border border-border flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-text-primary">Font Size</div>
                  <div className="text-[11px] text-text-muted">{settings.fontSize}px</div>
                </div>
                <input 
                  type="range" 
                  min="11" max="20" 
                  value={settings.fontSize}
                  onChange={e => updateSettings({ fontSize: parseInt(e.target.value) })}
                  className="w-40 accent-pop cursor-pointer"
                />
              </div>
            </motion.div>
          )}

          {/* ─── Sessions & Team Tabs ─── */}
          {(settingsTab === 'sessions' || settingsTab === 'team') && (
            <div className="p-12 text-center text-text-muted bg-bgside rounded-xl border border-border">
              <Users size={32} className="mx-auto mb-3 opacity-30 text-accent" />
              <h4 className="text-xs font-bold text-text-primary mb-1">Multiplayer Team Synchronization</h4>
              <p className="text-xs text-text-secondary max-w-sm mx-auto leading-relaxed">
                Teammate invitations and peer-to-peer worktree synchronization managed through the Native Harness Brain layer.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
