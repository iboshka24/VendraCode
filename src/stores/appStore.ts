import { create } from 'zustand';
import type {
  FileEntry, EditorTab, ChatMessage, AgentLane, Session, ApprovalRequest,
  ProviderConfig, AppSettings, GitStatus, AgentStatus, SettingsTab
} from '@/types';
import { DEFAULT_PROVIDERS } from '@/utils/providers';
import { getLanguageFromPath } from '@/utils/providers';

// ─── App Store ─────────────────────────────────────────────────────

interface AppState {
  // View
  activeView: 'editor' | 'mission-control' | 'settings';
  setActiveView: (view: 'editor' | 'mission-control' | 'settings') => void;

  // Workspace
  workspacePath: string | null;
  setWorkspacePath: (path: string | null) => void;

  // File tree
  fileTree: FileEntry[];
  setFileTree: (tree: FileEntry[]) => void;
  toggleFolder: (path: string) => void;

  // Editor tabs
  openTabs: EditorTab[];
  activeTabId: string | null;
  openFile: (path: string, name: string, content: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  markTabClean: (id: string) => void;

  // AI Chat
  chatMessages: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  updateChatMessage: (id: string, updates: Partial<ChatMessage>) => void;
  clearChat: () => void;
  isChatOpen: boolean;
  toggleChat: () => void;

  // Active provider
  activeProvider: ProviderConfig;
  setActiveProvider: (provider: ProviderConfig) => void;

  // Agent
  agentStatus: AgentStatus;
  setAgentStatus: (status: AgentStatus) => void;

  // Agent Lanes (Mission Control)
  agentLanes: AgentLane[];
  addAgentLane: (lane: AgentLane) => void;
  updateAgentLane: (id: string, updates: Partial<AgentLane>) => void;
  removeAgentLane: (id: string) => void;

  // Sessions
  sessions: Session[];
  activeSessionId: string | null;
  setActiveSession: (id: string) => void;

  // Approvals
  approvals: ApprovalRequest[];
  addApproval: (req: ApprovalRequest) => void;
  resolveApproval: (id: string, status: 'approved' | 'denied') => void;

  // Git
  gitStatus: GitStatus | null;
  setGitStatus: (status: GitStatus | null) => void;

  // Settings
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  updateProvider: (id: string, updates: Partial<ProviderConfig>) => void;

  // Terminal
  isTerminalOpen: boolean;
  toggleTerminal: () => void;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isSearchOpen: boolean;
  toggleSearch: () => void;

  // Local CLIs & Brain Coordination
  localCLIs: LocalCLIDetected[];
  setLocalCLIs: (clis: LocalCLIDetected[]) => void;
  activeLocks: Record<string, BrainLock>;
  setActiveLocks: (locks: Record<string, BrainLock>) => void;
  brainActions: BrainAction[];
  addBrainAction: (action: BrainAction) => void;
}

const loadSettings = (): AppSettings => {
  try {
    const saved = localStorage.getItem('vendracode-settings');
    if (saved) return JSON.parse(saved);
  } catch {}
  return {
    theme: 'dark',
    fontSize: 14,
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    minimap: false,
    wordWrap: false,
    autoSave: true,
    providers: DEFAULT_PROVIDERS,
    permissions: {
      allowFileCreate: true,
      allowFileDelete: true,
      allowCommands: true,
      allowGitPush: false,
      requireApproval: true,
    },
  };
};

export const useAppStore = create<AppState>((set, get) => ({
  // View
  activeView: 'editor',
  setActiveView: (view) => set({ activeView: view }),

  // Workspace
  workspacePath: null,
  setWorkspacePath: (path) => set({ workspacePath: path }),

  // File tree
  fileTree: [],
  setFileTree: (tree) => set({ fileTree: tree }),
  toggleFolder: (path) => {
    const toggle = (entries: FileEntry[]): FileEntry[] =>
      entries.map((e) => {
        if (e.path === path) return { ...e, isExpanded: !e.isExpanded };
        if (e.children) return { ...e, children: toggle(e.children) };
        return e;
      });
    set((s) => ({ fileTree: toggle(s.fileTree) }));
  },

  // Editor tabs
  openTabs: [],
  activeTabId: null,
  openFile: (path, name, content) => {
    const { openTabs } = get();
    const existing = openTabs.find((t) => t.path === path);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const tab: EditorTab = {
      id: path,
      path,
      name,
      content,
      language: getLanguageFromPath(path),
      isDirty: false,
    };
    set({ openTabs: [...openTabs, tab], activeTabId: tab.id });
  },
  closeTab: (id) => {
    const { openTabs, activeTabId } = get();
    const idx = openTabs.findIndex((t) => t.id === id);
    const newTabs = openTabs.filter((t) => t.id !== id);
    let newActive = activeTabId;
    if (activeTabId === id) {
      newActive = newTabs[Math.min(idx, newTabs.length - 1)]?.id || null;
    }
    set({ openTabs: newTabs, activeTabId: newActive });
  },
  setActiveTab: (id) => set({ activeTabId: id }),
  updateTabContent: (id, content) =>
    set((s) => ({
      openTabs: s.openTabs.map((t) => (t.id === id ? { ...t, content, isDirty: true } : t)),
    })),
  markTabClean: (id) =>
    set((s) => ({
      openTabs: s.openTabs.map((t) => (t.id === id ? { ...t, isDirty: false } : t)),
    })),

  // AI Chat
  chatMessages: [],
  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  updateChatMessage: (id, updates) =>
    set((s) => ({
      chatMessages: s.chatMessages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  clearChat: () => set({ chatMessages: [] }),
  isChatOpen: true,
  toggleChat: () => set((s) => ({ isChatOpen: !s.isChatOpen })),

  // Active provider
  activeProvider: loadSettings().providers[0],
  setActiveProvider: (provider) => set({ activeProvider: provider }),

  // Agent status
  agentStatus: 'idle',
  setAgentStatus: (status) => set({ agentStatus: status }),

  // Agent Lanes
  agentLanes: [
    {
      id: 'user-lane',
      name: 'You',
      model: 'human',
      provider: 'custom',
      status: 'idle',
      currentTask: 'Editing code',
      filesEditing: [],
      progress: 0,
      branch: 'main',
      messages: [],
      avatar: 'IB',
      color: '#3b82f6',
    },
  ],
  addAgentLane: (lane) => set((s) => ({ agentLanes: [...s.agentLanes, lane] })),
  updateAgentLane: (id, updates) =>
    set((s) => ({
      agentLanes: s.agentLanes.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    })),
  removeAgentLane: (id) => set((s) => ({ agentLanes: s.agentLanes.filter((l) => l.id !== id) })),

  // Sessions
  sessions: [],
  activeSessionId: null,
  setActiveSession: (id) => set({ activeSessionId: id }),

  // Approvals
  approvals: [],
  addApproval: (req) => set((s) => ({ approvals: [...s.approvals, req] })),
  resolveApproval: (id, status) =>
    set((s) => ({
      approvals: s.approvals.map((a) => (a.id === id ? { ...a, status } : a)),
    })),

  // Git
  gitStatus: null,
  setGitStatus: (status) => set({ gitStatus: status }),

  // Settings
  settingsTab: 'providers',
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  settings: loadSettings(),
  updateSettings: (updates) => {
    set((s) => {
      const newSettings = { ...s.settings, ...updates };
      localStorage.setItem('vendracode-settings', JSON.stringify(newSettings));
      return { settings: newSettings };
    });
  },
  updateProvider: (id, updates) => {
    set((s) => {
      const providers = s.settings.providers.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      );
      const newSettings = { ...s.settings, providers };
      localStorage.setItem('vendracode-settings', JSON.stringify(newSettings));
      // If active provider is updated, sync it
      const activeProvider = s.activeProvider.id === id ? { ...s.activeProvider, ...updates } : s.activeProvider;
      return { settings: newSettings, activeProvider };
    });
  },

  // Terminal
  isTerminalOpen: true,
  toggleTerminal: () => set((s) => ({ isTerminalOpen: !s.isTerminalOpen })),

  // Search
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  isSearchOpen: false,
  toggleSearch: () => set((s) => ({ isSearchOpen: !s.isSearchOpen })),

  // Local CLIs & Brain Coordination
  localCLIs: [],
  setLocalCLIs: (clis) => set({ localCLIs: clis }),
  activeLocks: {},
  setActiveLocks: (locks) => set({ activeLocks: locks }),
  brainActions: [],
  addBrainAction: (action) => set((s) => ({ brainActions: [action, ...s.brainActions].slice(0, 100) })),
}));

