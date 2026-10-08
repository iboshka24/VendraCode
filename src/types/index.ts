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
  };
  dialog: {
    openDirectory: () => Promise<string | null>;
  };
  git: {
    status: (cwd: string) => Promise<GitStatus>;
    log: (cwd: string, count?: number) => Promise<GitLogEntry[]>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
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
    onLocksUpdated: (callback: (locks: Record<string, BrainLock>) => void) => () => void;
    onActionRecorded: (callback: (action: BrainAction) => void) => () => void;
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

export type LLMProvider = 'openai' | 'anthropic' | 'nvidia' | 'custom';

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
