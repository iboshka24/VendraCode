/** Chat agent engines available in the sidebar and for bot binding. */
export interface ChatAgentOption {
  id: string;
  name: string;
  bin: string;
  type: 'native' | 'cli';
  icon: string;
  color: string;
  badge: string;
  description: string;
}

export const CHAT_AGENTS: ChatAgentOption[] = [
  { id: 'vendra-ai', name: 'Vendra AI', bin: 'native', type: 'native', icon: '🤖', color: '#7c3aed', badge: 'HERMES', description: 'Autonomous agent with DuckDuckGo web search & desktop screen capture' },
  { id: 'opencode', name: 'OpenCode CLI', bin: 'opencode', type: 'cli', icon: '⚡', color: '#ffa94d', badge: 'OPENCODE', description: 'Redirects prompts into local OpenCode CLI process & reflects actions in GUI' },
  { id: 'agy', name: 'Antigravity CLI', bin: 'agy', type: 'cli', icon: '🚀', color: '#38d9a9', badge: 'AGY', description: 'Google Antigravity CLI process coordinating via Brain' },
  { id: 'cline', name: 'Cline CLI', bin: 'cline', type: 'cli', icon: '💻', color: '#4dabf7', badge: 'CLINE', description: 'Autonomous coding agent CLI running in dedicated worktree' },
  { id: 'claude', name: 'Claude Code', bin: 'claude', type: 'cli', icon: '🧠', color: '#f06595', badge: 'CLAUDE', description: 'Anthropic Claude Code CLI running locally' },
];
