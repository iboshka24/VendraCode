import { create } from 'zustand';
import type {
  FileEntry, EditorTab, ChatMessage, AgentLane, Session, ApprovalRequest,
  ProviderConfig, AppSettings, GitStatus, AgentStatus, SettingsTab,
  BrainConnectionStatus, RemoteDiff, GitWorktree, ChatSession,
  BrainLock, BrainAction, LocalCLIDetected
} from '@/types';
import { DEFAULT_PROVIDERS } from '@/utils/providers';
import { getLanguageFromPath } from '@/utils/providers';

// ─── App Store ─────────────────────────────────────────────────────

const CHAT_STORAGE_KEY = 'vendracode-chats-v1';
const CHAT_LIMIT = 60;

/** Loads persisted chats (newest first); the newest is always present. */
function loadChatSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => c && typeof c.id === 'string' && Array.isArray(c.messages))
      .slice(0, CHAT_LIMIT);
  } catch {
    return [];
  }
}

function persistChatSessions(sessions: ChatSession[]): void {
  try {
    // Cap the history so localStorage cannot grow without bound.
    const trimmed = sessions.slice(0, CHAT_LIMIT).map((c) => ({
      ...c,
      messages: c.messages.slice(-200),
    }));
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* storage full / private mode — keep running with in-memory chats */
  }
}

/** Session id the user last used, restored synchronously to avoid a
 *  connect → reconnect round trip on boot. */
const loadBrainSession = (): string => {
  try {
    return localStorage.getItem('vendracode-session') || 'default-session';
  } catch {
    return 'default-session';
  }
};

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

/** Resolves the provider the user last picked (survives restarts). */
const resolveActiveProvider = (): ProviderConfig => {
  const settings = loadSettings();
  try {
    const savedId = localStorage.getItem('vendracode-active-provider');
    const saved = savedId ? settings.providers.find((p) => p.id === savedId) : undefined;
    if (saved) return saved;
  } catch {}
  return settings.providers[0];
};

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

  // AI Chat (persisted sessions)
  chatSessions: ChatSession[];
  activeChatId: string | null;
  createChat: (agentId?: string) => string;
  deleteChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  setActiveChat: (id: string) => void;
  /** Replaces the message list of the currently active chat. */
  setActiveChatMessages: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  /** Stores the CLI session id so the next message continues the same context. */
  setChatCliSession: (chatId: string, sessionId?: string) => void;
  isChatOpen: boolean;
  toggleChat: () => void;

  // Active provider
  activeProvider: ProviderConfig;
  setActiveProvider: (provider: ProviderConfig) => void;

  // Agent
  agentStatus: AgentStatus;
  setAgentStatus: (status: AgentStatus) => void;

  // Agent lanes — derived from reality (detected CLIs, brain peers, live
  // remote edits). Never seeded with invented lanes.
  agentLanes: AgentLane[];
  setAgentLanes: (lanes: AgentLane[]) => void;
  addAgentLane: (lane: AgentLane) => void;
  updateAgentLane: (id: string, updates: Partial<AgentLane>) => void;
  removeAgentLane: (id: string) => void;

  // Sessions (brain session peers + worktrees)
  sessions: Session[];
  activeSessionId: string | null;
  setActiveSession: (id: string) => void;

  // Approvals (created by the agent tool approval gate)
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
  /**
   * Creates or fully replaces a provider entry. Used by the model picker to
   * import a discovered model together with its endpoint + credentials, which
   * `updateProvider` cannot do (it only patches ids that already exist).
   * The upserted provider becomes active immediately and survives restarts.
   */
  upsertProvider: (provider: ProviderConfig) => void;

  // Terminal
  isTerminalOpen: boolean;
  toggleTerminal: () => void;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isSearchOpen: boolean;
  toggleSearch: () => void;

  // Share Modal
  isShareOpen: boolean;
  toggleShare: () => void;
  setShareOpen: (open: boolean) => void;

  // Local CLIs & Brain Coordination
  localCLIs: LocalCLIDetected[];
  setLocalCLIs: (clis: LocalCLIDetected[]) => void;
  activeLocks: Record<string, BrainLock>;
  setActiveLocks: (locks: Record<string, BrainLock>) => void;
  brainActions: BrainAction[];
  addBrainAction: (action: BrainAction) => void;

  // Cloudflare Edge Brain (multiplayer live diffs)
  brainSessionId: string;
  setBrainSessionId: (id: string) => void;
  brainStatus: BrainConnectionStatus;
  setBrainStatus: (status: BrainConnectionStatus) => void;
  brainPeers: string[];
  setBrainPeers: (peers: string[]) => void;
  brainRepoUrl: string;
  setBrainRepoUrl: (url: string) => void;
  /** Live remote edits keyed by `${agentId}::${filePath}`. */
  remoteEdits: Record<string, RemoteDiff>;
  applyRemoteEdit: (diff: RemoteDiff) => void;
  pruneRemoteEdits: (maxAgeMs?: number) => void;

  // Git worktrees (multiplayer isolation)
  worktrees: GitWorktree[];
  setWorktrees: (worktrees: GitWorktree[]) => void;
}

/** Chats read once at boot; the store and the initial active id share them. */
const INITIAL_CHATS = loadChatSessions();

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

  // AI Chat (persisted sessions; everything is written to localStorage)
  chatSessions: INITIAL_CHATS,
  // The newest persisted chat is shown by the UI, so it must also be the one
  // writes land on. Leaving this null made every setActiveChatMessages() call
  // a silent no-op after a restart (chat looked alive, updates went nowhere).
  activeChatId: INITIAL_CHATS[0]?.id ?? null,
  createChat: (agentId) => {
    const now = Date.now();
    const chat: ChatSession = {
      id: `chat-${now}-${Math.random().toString(36).slice(2, 6)}`,
      title: 'New chat',
      agentId: agentId || 'vendra-ai',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    set((s) => {
      const sessions = [chat, ...s.chatSessions];
      persistChatSessions(sessions);
      return { chatSessions: sessions, activeChatId: chat.id };
    });
    return chat.id;
  },
  deleteChat: (id) =>
    set((s) => {
      const sessions = s.chatSessions.filter((c) => c.id !== id);
      const activeChatId = s.activeChatId === id ? (sessions[0]?.id ?? null) : s.activeChatId;
      persistChatSessions(sessions);
      return { chatSessions: sessions, activeChatId };
    }),
  renameChat: (id, title) =>
    set((s) => {
      const sessions = s.chatSessions.map((c) => (c.id === id ? { ...c, title, updatedAt: Date.now() } : c));
      persistChatSessions(sessions);
      return { chatSessions: sessions };
    }),
  setActiveChat: (id) => set({ activeChatId: id }),
  setActiveChatMessages: (updater) =>
    set((s) => {
      // Write to the active chat; if that id is missing or stale (e.g. it was
      // deleted, or the state predates the id being set) fall back to the chat
      // the UI actually renders — the newest one — instead of silently
      // dropping the update.
      const targetId = s.chatSessions.some((c) => c.id === s.activeChatId)
        ? s.activeChatId
        : (s.chatSessions[0]?.id ?? null);
      if (!targetId) return {};
      const sessions = s.chatSessions.map((c) => {
        if (c.id !== targetId) return c;
        const next = typeof updater === 'function' ? updater(c.messages) : updater;
        return { ...c, messages: next, updatedAt: Date.now() };
      });
      persistChatSessions(sessions);
      return { chatSessions: sessions, activeChatId: targetId };
    }),
  setChatCliSession: (chatId, sessionId) =>
    set((s) => {
      const sessions = s.chatSessions.map((c) =>
        c.id === chatId ? { ...c, opencodeSessionId: sessionId || undefined, updatedAt: Date.now() } : c
      );
      persistChatSessions(sessions);
      return { chatSessions: sessions };
    }),
  isChatOpen: true,
  toggleChat: () => set((s) => ({ isChatOpen: !s.isChatOpen })),

  // Active provider
  activeProvider: resolveActiveProvider(),
  setActiveProvider: (provider) => {
    try {
      localStorage.setItem('vendracode-active-provider', provider.id);
    } catch {}
    set({ activeProvider: provider });
  },

  // Agent status
  agentStatus: 'idle',
  setAgentStatus: (status) => set({ agentStatus: status }),

  // Agent lanes — real data only
  agentLanes: [],
  setAgentLanes: (lanes) => set({ agentLanes: lanes }),
  addAgentLane: (lane) => set((s) => ({ agentLanes: [...s.agentLanes, lane] })),
  updateAgentLane: (id, updates) =>
    set((s) => ({
      agentLanes: s.agentLanes.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    })),
  removeAgentLane: (id) => set((s) => ({ agentLanes: s.agentLanes.filter((l) => l.id !== id) })),

  // Sessions — populated from the brain session (peers + worktrees)
  sessions: [],
  activeSessionId: null,
  setActiveSession: (id) => set({ activeSessionId: id }),

  // Approvals — real requests only
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
  upsertProvider: (provider) => {
    set((s) => {
      const exists = s.settings.providers.some((p) => p.id === provider.id);
      const providers = exists
        ? s.settings.providers.map((p) => (p.id === provider.id ? provider : p))
        : [...s.settings.providers, provider];
      const newSettings = { ...s.settings, providers };
      localStorage.setItem('vendracode-settings', JSON.stringify(newSettings));
      try {
        localStorage.setItem('vendracode-active-provider', provider.id);
      } catch {}
      return { settings: newSettings, activeProvider: provider };
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

  // Share Modal
  isShareOpen: false,
  toggleShare: () => set((s) => ({ isShareOpen: !s.isShareOpen })),
  setShareOpen: (open) => set({ isShareOpen: open }),

  // Local CLIs & Brain Coordination
  localCLIs: [],
  setLocalCLIs: (clis) => set({ localCLIs: clis }),
  activeLocks: {},
  setActiveLocks: (locks) => set({ activeLocks: locks }),
  brainActions: [],
  addBrainAction: (action) => set((s) => ({ brainActions: [action, ...s.brainActions].slice(0, 100) })),

  // Cloudflare Edge Brain (multiplayer live diffs)
  brainSessionId: loadBrainSession(),
  setBrainSessionId: (id) => {
    const value = id || 'default-session';
    try { localStorage.setItem('vendracode-session', value); } catch {}
    set({ brainSessionId: value });
  },
  brainStatus: 'idle',
  setBrainStatus: (status) => set({ brainStatus: status }),
  brainPeers: [],
  setBrainPeers: (peers) => set({ brainPeers: peers }),
  brainRepoUrl: '',
  setBrainRepoUrl: (url) => set({ brainRepoUrl: url }),
  // Live remote edits keyed by `${agentId}::${filePath}`.
  remoteEdits: {},
  applyRemoteEdit: (diff) =>
    set((s) => {
      const next = { ...s.remoteEdits, [`${diff.agentId}::${diff.filePath}`]: diff };
      // Drop stale entries so ghost decorations disappear when a peer stops.
      const now = Date.now();
      for (const [key, value] of Object.entries(next)) {
        if (now - value.timestamp > 15000) delete next[key];
      }
      return { remoteEdits: next };
    }),
  pruneRemoteEdits: (maxAgeMs = 15000) =>
    set((s) => {
      const now = Date.now();
      const entries = Object.entries(s.remoteEdits).filter(([, v]) => now - v.timestamp <= maxAgeMs);
      if (entries.length === Object.keys(s.remoteEdits).length) return {};
      return { remoteEdits: Object.fromEntries(entries) };
    }),

  // Git worktrees (multiplayer isolation)
  worktrees: [],
  setWorktrees: (worktrees) => set({ worktrees }),
}));
