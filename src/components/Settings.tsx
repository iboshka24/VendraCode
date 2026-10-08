import React, { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { SettingsTab, ProviderConfig, LLMProvider } from '@/types/index';
import { 
  Settings as SettingsIcon, Monitor, Palette, Shield, 
  Users, GitBranch, Check, X, Plus, Trash2, TestTube, Bot, Terminal 
} from 'lucide-react';
import { motion } from 'framer-motion';
import { DEFAULT_PROVIDERS } from '@/utils/providers';

export const Settings: React.FC = () => {
  const { settings, updateSettings, updateProvider, settingsTab, setSettingsTab, localCLIs } = useAppStore();
  const [testingConnection, setTestingConnection] = useState<string | null>(null);

  const tabs = [
    { id: 'general', label: 'General', icon: <Monitor size={18} /> },
    { id: 'editor', label: 'Editor', icon: <Palette size={18} /> },
    { id: 'providers', label: 'Providers & Models', icon: <TestTube size={18} /> },
    { id: 'permissions', label: 'Permissions', icon: <Shield size={18} /> },
    { id: 'sessions', label: 'Sessions', icon: <GitBranch size={18} /> },
    { id: 'team', label: 'Team', icon: <Users size={18} /> },
  ] as const;

  const handleTestConnection = async (provider: ProviderConfig) => {
    setTestingConnection(provider.id);
    try {
      // Simulate connection test
      const headers: Record<string, string> = {};
      if (provider.apiKey) {
        headers['Authorization'] = provider.apiKey;
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
          name: 'New Custom Provider',
          baseUrl: 'https://',
          apiKey: '',
          model: '',
          isConnected: false,
          icon: 'C'
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
    <div className="flex h-full w-full bg-background text-text-primary overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-surface border-r border-border flex flex-col">
        <div className="p-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <SettingsIcon className="text-text-muted" />
            Settings
          </h2>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSettingsTab(tab.id as SettingsTab)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                settingsTab === tab.id 
                  ? 'bg-surface-hover text-text-primary font-medium' 
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-hover/50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl">
          {settingsTab === 'general' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-4">Appearance</h3>
                <div className="flex items-center justify-between p-4 bg-surface rounded-xl border border-border">
                  <div>
                    <div className="font-medium">Theme</div>
                    <div className="text-sm text-text-muted">Select your preferred color theme</div>
                  </div>
                  <select 
                    value={settings.theme}
                    onChange={e => updateSettings({ theme: e.target.value as 'dark' | 'light' })}
                    className="bg-background border border-border rounded px-3 py-1.5 outline-none focus:border-primary text-sm"
                  >
                    <option value="dark">Dark</option>
                    <option value="light" disabled>Light (Coming Soon)</option>
                  </select>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-4">Workspace</h3>
                <div className="flex items-center justify-between p-4 bg-surface rounded-xl border border-border">
                  <div>
                    <div className="font-medium">Auto-save Files</div>
                    <div className="text-sm text-text-muted">Automatically save changes when switching tabs</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={settings.autoSave}
                      onChange={e => updateSettings({ autoSave: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
              </div>
            </motion.div>
          )}

          {settingsTab === 'editor' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <h3 className="text-lg font-medium mb-4">Editor Configuration</h3>
              <div className="space-y-4">
                <div className="p-4 bg-surface rounded-xl border border-border flex items-center justify-between">
                  <div>
                    <div className="font-medium">Font Size</div>
                    <div className="text-sm text-text-muted">{settings.fontSize}px</div>
                  </div>
                  <input 
                    type="range" 
                    min="10" max="24" 
                    value={settings.fontSize}
                    onChange={e => updateSettings({ fontSize: parseInt(e.target.value) })}
                    className="w-48 accent-primary"
                  />
                </div>
                <div className="p-4 bg-surface rounded-xl border border-border flex flex-col gap-3">
                  <div>
                    <div className="font-medium">Font Family</div>
                  </div>
                  <input 
                    type="text" 
                    value={settings.fontFamily}
                    onChange={e => updateSettings({ fontFamily: e.target.value })}
                    className="w-full bg-background border border-border rounded p-2 focus:border-primary outline-none font-mono text-sm"
                  />
                </div>
                <div className="flex items-center justify-between p-4 bg-surface rounded-xl border border-border">
                  <div>
                    <div className="font-medium">Minimap</div>
                    <div className="text-sm text-text-muted">Show code minimap on the right side</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={settings.minimap}
                      onChange={e => updateSettings({ minimap: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between p-4 bg-surface rounded-xl border border-border">
                  <div>
                    <div className="font-medium">Word Wrap</div>
                    <div className="text-sm text-text-muted">Wrap lines that exceed editor width</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={settings.wordWrap}
                      onChange={e => updateSettings({ wordWrap: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
              </div>
            </motion.div>
          )}

          {settingsTab === 'providers' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              {/* Local Agent CLIs Section */}
              <div className="bg-surface border border-border rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Bot className="text-primary" size={20} />
                    <h3 className="text-lg font-semibold">Local Agent CLIs (Native Harness)</h3>
                  </div>
                  <span className="text-xs bg-primary/20 text-primary px-2.5 py-1 rounded-full font-medium">
                    Amoeba Shared Brain
                  </span>
                </div>
                <p className="text-sm text-text-muted mb-4">
                  VendraCode automatically detects local AI coding CLIs installed on this machine and connects them to the shared coordination Brain with zero conflicts and live file synchronization.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(localCLIs.length > 0 ? localCLIs : [
                    { id: 'agy', name: 'Antigravity CLI (agy)', bin: 'agy', isInstalled: true, path: '/home/ibrohim/.local/bin/agy' },
                    { id: 'cline', name: 'Cline CLI', bin: 'cline', isInstalled: true, path: '/usr/bin/cline' },
                    { id: 'opencode', name: 'OpenCode CLI', bin: 'opencode', isInstalled: true, path: '/home/ibrohim/.opencode/bin/opencode' },
                    { id: 'claude', name: 'Claude Code CLI', bin: 'claude', isInstalled: true, path: '/usr/bin/claude' },
                  ]).map(cli => (
                    <div key={cli.id} className="p-3 bg-background border border-border rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-surface border border-border flex items-center justify-center font-mono text-xs font-bold text-primary">
                          {cli.bin.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium flex items-center gap-2">
                            {cli.name}
                            {cli.isInstalled ? (
                              <span className="w-2 h-2 rounded-full bg-success" title="Detected on this machine" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-text-muted" title="Not detected" />
                            )}
                          </div>
                          <div className="text-xs text-text-muted font-mono truncate max-w-[200px]">
                            {cli.path || `${cli.bin} (not in PATH)`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {cli.isInstalled ? (
                          <span className="text-xs bg-success/15 text-success border border-success/30 px-2 py-0.5 rounded font-medium">
                            Connected
                          </span>
                        ) : (
                          <span className="text-xs bg-border text-text-muted px-2 py-0.5 rounded">
                            Install CLI
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">API Providers & Models</h3>
                <button 
                  onClick={addCustomProvider}
                  className="flex items-center gap-2 px-3 py-1.5 bg-surface hover:bg-surface-hover border border-border rounded-lg text-sm transition-colors"
                >
                  <Plus size={16} />
                  Add Custom Provider
                </button>
              </div>
              
              <div className="space-y-6">
                {settings.providers.map(provider => (
                  <div key={provider.id} className="p-5 bg-surface border border-border rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-background flex items-center justify-center font-bold text-primary border border-border">
                          {provider.icon}
                        </div>
                        <div>
                          {provider.id.startsWith('custom') ? (
                            <input 
                              type="text" 
                              value={provider.name}
                              onChange={e => updateProvider(provider.id, { name: e.target.value })}
                              className="bg-background border border-border rounded px-2 py-1 text-sm font-semibold outline-none focus:border-primary"
                            />
                          ) : (
                            <h4 className="font-semibold">{provider.name}</h4>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {provider.isConnected ? (
                          <span className="flex items-center gap-1.5 text-xs text-success bg-success/10 px-2 py-1 rounded border border-success/20">
                            <Check size={14} /> Connected
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs text-text-muted bg-background px-2 py-1 rounded border border-border">
                            <X size={14} /> Disconnected
                          </span>
                        )}
                        {provider.id.startsWith('custom') && (
                          <button 
                            onClick={() => removeProvider(provider.id)}
                            className="text-text-muted hover:text-danger p-1"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-xs text-text-muted mb-1">Base URL</label>
                        <input 
                          type="text" 
                          value={provider.baseUrl}
                          onChange={e => updateProvider(provider.id, { baseUrl: e.target.value })}
                          className="w-full bg-background border border-border rounded p-2 text-sm focus:border-primary outline-none"
                          placeholder="https://api.example.com/v1"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-1">API Key</label>
                        <input 
                          type="password" 
                          value={provider.apiKey}
                          onChange={e => updateProvider(provider.id, { apiKey: e.target.value })}
                          className="w-full bg-background border border-border rounded p-2 text-sm focus:border-primary outline-none"
                          placeholder="sk-..."
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs text-text-muted mb-1">Default Model</label>
                        <input 
                          type="text" 
                          value={provider.model}
                          onChange={e => updateProvider(provider.id, { model: e.target.value })}
                          className="w-full bg-background border border-border rounded p-2 text-sm focus:border-primary outline-none"
                          placeholder="Model ID (e.g. gpt-4o)"
                        />
                      </div>
                    </div>
                    
                    <div className="flex justify-end">
                      <button 
                        onClick={() => handleTestConnection(provider)}
                        disabled={testingConnection === provider.id || !provider.baseUrl}
                        className="flex items-center gap-2 px-4 py-1.5 bg-background hover:bg-surface-hover border border-border rounded text-sm transition-colors disabled:opacity-50"
                      >
                        {testingConnection === provider.id ? (
                          <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <TestTube size={16} className="text-text-muted" />
                        )}
                        Test Connection
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {settingsTab === 'permissions' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <h3 className="text-lg font-medium mb-4">Agent Permissions</h3>
              <p className="text-sm text-text-muted mb-6">Control what AI agents are allowed to do autonomously in your workspace.</p>
              
              <div className="space-y-2">
                {[
                  { key: 'allowFileCreate', label: 'Create Files', desc: 'Allow agents to create new files and folders' },
                  { key: 'allowFileDelete', label: 'Delete Files', desc: 'Allow agents to delete existing files and folders' },
                  { key: 'allowCommands', label: 'Execute Commands', desc: 'Allow agents to run shell commands' },
                  { key: 'allowGitPush', label: 'Git Push', desc: 'Allow agents to push commits to remotes' },
                  { key: 'requireApproval', label: 'Require Approval', desc: 'Pause agent execution and ask for manual approval before destructive actions' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between p-4 bg-surface rounded-xl border border-border">
                    <div>
                      <div className="font-medium">{label}</div>
                      <div className="text-sm text-text-muted">{desc}</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={settings.permissions[key as keyof typeof settings.permissions]}
                        onChange={e => updateSettings({ 
                          permissions: { ...settings.permissions, [key]: e.target.checked } 
                        })}
                      />
                      <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {(settingsTab === 'sessions' || settingsTab === 'team') && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-20 text-text-muted">
              {settingsTab === 'sessions' ? <GitBranch size={48} className="mb-4 opacity-20" /> : <Users size={48} className="mb-4 opacity-20" />}
              <h3 className="text-xl font-medium text-text-primary mb-2">Coming Soon</h3>
              <p className="max-w-md text-center">
                This feature is currently in development and will be available in a future update.
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};
