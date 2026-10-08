// ─── Window API Types ──────────────────────────────────────────────

export interface VendraAPI {
  fs: {
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<boolean>;
    deleteFile: (path: string) => Promise<boolean>;
    readDir: (path: string) => Promise<FileEntry[]>;
    stat: (path: string) => Promise<FileStat | null>;
    search: (dir: string, query: string) => Promise<SearchResult[]>;
  };
  terminal: {
    start: (cwd?: string) => void;
    sendInput: (data: string) => void;
    resize: (cols: number, rows: number) => void;
    onData: (callback: (data: string) => void) => () => void;
    onExit: (callback: (code: number) => void) => () => void;
  };
  os: {
    exec: (command: string, cwd?: string) => Promise<ExecResult>;
    userInfo: () => Promise<{ username: string }>;
  };
  dialog: {
    openDirectory: () => Promise<string | null>;
  };
  git: {
    status: (cwd: string) => Promise<GitStatus>;
    log: (cwd: string, count?: number) => Promise<GitLogEntry[]>;
    worktrees: (cwd: string) => Promise<GitWorktree[]>;
    worktreeAdd: (opts: { cwd: string; path: string; branch: string; create?: boolean }) => Promise<{ success: boolean; path?: string; branch?: string; error?: string }>;
    worktreeRemove: (opts: { cwd: string; path: string }) => Promise<{ success: boolean; error?: string }>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
  };
  hermes: {
    webSearch: (query: string, limit?: number) => Promise<Array<{ title: string; url: string; snippet: string }>>;
    fetchUrl: (url: string, maxLength?: number) => Promise<{ title: string; content: string; url: string; error?: string }>;
    takeScreenshot: (workspacePath?: string) => Promise<{ success: boolean; path?: string; filename?: string; error?: string; message?: string }>;
    getSystemInfo: () => Promise<Record<string, any>>;
  };
  cli: {
    detectAll: () => Promise<LocalCLIDetected[]>;
    spawnAgent: (opts: { agentId: string; cliBin: string; args?: string[]; cwd?: string; prompt?: string }) => Promise<{ success: boolean; error?: string }>;
    stopAgent: (agentId: string) => Promise<{ success: boolean; error?: string }>;
    onAgentOutput: (callback: (data: { agentId: string; type: 'stdout' | 'stderr'; text: string }) => void) => () => void;
    onAgentExit: (callback: (data: { agentId: string; code: number }) => void) => () => void;
  };
  brain: {
    acquireLock: (opts: { filePath: string; agentId: string; agentName: string }) => Promise<{ success: boolean; conflict?: boolean; lockedBy?: BrainLock; warning?: string }>;
    releaseLock: (opts: { filePath: string; agentId: string }) => Promise<{ success: boolean }>;
    reportAction: (action: Omit<BrainAction, 'id' | 'timestamp'>) => Promise<BrainAction>;
    broadcastTyping: (payload: { agentId: string; agentName: string; filePath: string; lineNum?: number; text?: string; color?: string }) => Promise<{ success: boolean }>;
    onLocksUpdated: (callback: (locks: Record<string, BrainLock>) => void) => () => void;
    onActionRecorded: (callback: (action: BrainAction) => void) => () => void;
    onAgentTyping: (callback: (payload: { agentId: string; agentName: string; filePath: string; lineNum?: number; text?: string; color?: string }) => void) => () => void;
  };
  scanner: {
    scanModels: (opts: { providerType?: string; baseUrl?: string; apiKey?: string }) => Promise<Array<{
      id: string;
      name: string;
      provider?: string;
      size?: string;
      source?: string;
      /** Provider id the model should be imported into (e.g. `cli-tokenharbor`). */
      providerId?: string;
      /** OpenAI-compatible endpoint the model lives on. */
      baseUrl?: string;
      /** Credential discovered for that endpoint (e.g. from opencode.json). */
      apiKey?: string;
      /** Display name for the provider the model belongs to (e.g. "Token Harbor"). */
      providerName?: string;
      /** True when the endpoint needs a key the app could not find. */
      requiresKey?: boolean;
      /** Human hint for a missing credential, e.g. "set NVIDIA_API_KEY in your shell". */
      keyHint?: string;
    }>>;
  };
  workspace: {
    watch: (path: string) => Promise<{ success: boolean; error?: string }>;
    onFileChanged: (callback: (event: { eventType: string; filename: string }) => void) => () => void;
  };
}

export interface LocalCLIDetected {
  id: string;
  name: string;
  bin: string;
  isInstalled: boolean;
  path: string | null;
  version: string;
}

export interface BrainLock {
  agentId: string;
  agentName: string;
  timestamp: number;
}

export interface BrainAction {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  targetFile?: string;
  summary: string;
  timestamp: number;
}

// ─── Cloudflare Brain (Multiplayer Live Diff) Types ─────────────────

/** Connection state of the renderer's WebSocket to brain.vendra.uz/ws */
export type BrainConnectionStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline';

/**
 * A single Monaco-compatible text change broadcast to peers.
 * Mirrors the shape of `monaco.editor.IModelContentChange` so the renderer
 * can forward `onDidChangeModelContent` payloads without transformation.
 */
export interface RemoteDiffChange {
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  /** Text inserted at `range` start (truncated before broadcast). */
  text: string;
  /** Number of characters removed from `range` (Monaco `rangeLength`). */
  rangeLength: number;
}

/** A live edit performed by a remote teammate/agent on a file. */
export interface RemoteDiff {
  agentId: string;
  agentName: string;
  color: string;
  filePath: string;
  changes: RemoteDiffChange[];
  timestamp: number;
}

/** Events emitted by the Cloudflare brain client towards the UI. */
export type BrainEvent =
  | { type: 'status'; status: BrainConnectionStatus }
  | { type: 'peers'; peers: string[] }
  | { type: 'repo'; repoUrl: string }
  | { type: 'locks'; locks: Record<string, BrainLock> }
  | { type: 'diff'; diff: RemoteDiff };

declare global {
  interface Window {
    vendraAPI: VendraAPI;
  }
}

// ─── File System Types ─────────────────────────────────────────────

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  path: string;
  children?: FileEntry[];
  isExpanded?: boolean;
}

export interface FileStat {
  size: number;
  isDirectory: boolean;
  mtime: string;
}

export interface SearchResult {
  file: string;
  line: number;
  text: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  error: string | null;
  code: number;
}

// ─── Editor Types ──────────────────────────────────────────────────

export interface EditorTab {
  id: string;
  path: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
}

// ─── AI Agent Types ────────────────────────────────────────────────

/**
 * Known provider ids keep autocomplete; arbitrary strings are allowed so
 * providers imported from the model scanner (e.g. `cli-tokenharbor`,
 * `openrouter-free`) can be persisted in settings.
 */
export type LLMProvider = 'openai' | 'anthropic' | 'nvidia' | 'custom' | (string & {});

export interface ProviderConfig {
  id: LLMProvider;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isConnected: boolean;
  icon: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
  isStreaming?: boolean;
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

// ─── Agent / Session Types ─────────────────────────────────────────

export type AgentStatus = 'idle' | 'running' | 'waiting' | 'error' | 'completed';

export interface AgentLane {
  id: string;
  name: string;
  model: string;
  provider: LLMProvider;
  status: AgentStatus;
  currentTask: string;
  filesEditing: string[];
  progress: number;
  branch: string;
  messages: ChatMessage[];
  avatar: string;
  color: string;
}

export interface Session {
  id: string;
  name: string;
  branch: string;
  agents: AgentLane[];
  status: 'active' | 'paused' | 'completed';
  owner: TeamMember;
  createdAt: number;
}

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  color: string;
  isOnline: boolean;
}

// ─── Approval Types ────────────────────────────────────────────────

export interface ApprovalRequest {
  id: string;
  agentId: string;
  agentName: string;
  action: 'create_file' | 'edit_file' | 'delete_file' | 'run_command' | 'git_push';
  description: string;
  details: string;
  timestamp: number;
  status: 'pending' | 'approved' | 'denied';
}

// ─── Git Types ─────────────────────────────────────────────────────

export interface GitStatus {
  branch: string;
  files: { status: string; file: string }[];
}

export interface GitLogEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
}

/** A single `git worktree` entry (main checkout or linked worktree). */
export interface GitWorktree {
  path: string;
  head: string;
  /** Branch name without the `refs/heads/` prefix, or null when detached. */
  branch: string | null;
  isMain: boolean;
  isBare: boolean;
  isDetached: boolean;
}

// ─── Settings Types ────────────────────────────────────────────────

export type SettingsTab = 'general' | 'editor' | 'providers' | 'permissions' | 'sessions' | 'team';

export interface AppSettings {
  theme: 'dark' | 'light';
  fontSize: number;
  fontFamily: string;
  minimap: boolean;
  wordWrap: boolean;
  autoSave: boolean;
  providers: ProviderConfig[];
  permissions: {
    allowFileCreate: boolean;
    allowFileDelete: boolean;
    allowCommands: boolean;
    allowGitPush: boolean;
    requireApproval: boolean;
  };
}
