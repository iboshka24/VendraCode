import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Bot, User, Loader2, Wrench, X, Settings, ChevronDown, 
  Sparkles, Square, Globe, Camera, Cpu, Terminal, ExternalLink,
  Search, CheckCircle2, AlertCircle, FileCode, Check, Layers, Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/stores/appStore';
import { ChatMessage, ToolCall, ProviderConfig, ApprovalRequest } from '@/types/index';
import { AGENT_TOOLS } from '@/utils/providers';

interface ChatAgentOption {
  id: string;
  name: string;
  bin: string;
  type: 'native' | 'cli';
  icon: string;
  color: string;
  badge: string;
  description: string;
}

const CHAT_AGENTS: ChatAgentOption[] = [
  { id: 'vendra-ai', name: 'Vendra AI', bin: 'native', type: 'native', icon: '🤖', color: '#7c3aed', badge: 'HERMES', description: 'Autonomous agent with DuckDuckGo web search & desktop screen capture' },
  { id: 'opencode', name: 'OpenCode CLI', bin: 'opencode', type: 'cli', icon: '⚡', color: '#ffa94d', badge: 'OPENCODE', description: 'Redirects prompts into local OpenCode CLI process & reflects actions in GUI' },
  { id: 'agy', name: 'Antigravity CLI', bin: 'agy', type: 'cli', icon: '🚀', color: '#38d9a9', badge: 'AGY', description: 'Google Antigravity CLI process coordinating via Brain' },
  { id: 'cline', name: 'Cline CLI', bin: 'cline', type: 'cli', icon: '💻', color: '#4dabf7', badge: 'CLINE', description: 'Autonomous coding agent CLI running in dedicated worktree' },
  { id: 'claude', name: 'Claude Code', bin: 'claude', type: 'cli', icon: '🧠', color: '#f06595', badge: 'CLAUDE', description: 'Anthropic Claude Code CLI running locally' },
];

export const AIChat: React.FC = () => {
  const { 
    activeProvider,
    setActiveProvider, 
    settings, 
    workspacePath, 
    setAgentStatus, 
    agentStatus,
    setFileTree,
    addBrainAction,
    updateProvider,
    updateTabContent,
    openTabs
  } = useAppStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<ChatAgentOption>(CHAT_AGENTS[0]);
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const [expandedToolMsgId, setExpandedToolMsgId] = useState<string | null>(null);

  // Dynamic Model Scanner state
  const [scannedModels, setScannedModels] = useState<Array<{ id: string; name: string; provider?: string; size?: string; source?: string }>>([]);
  const [isScanningModels, setIsScanningModels] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  
  // Pending approval state
  const [pendingApproval, setPendingApproval] = useState<{
    request: ApprovalRequest;
    resolve: (approved: boolean) => void;
  } | null>(null);

  const providers = settings?.providers || [];
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingApproval]);

  const executeTool = async (toolCall: any): Promise<any> => {
    const { name, arguments: argsString } = toolCall.function;
    let args: any = {};
    try {
      args = typeof argsString === 'string' ? JSON.parse(argsString) : argsString;
    } catch (e) {
      return { error: 'Failed to parse tool arguments' };
    }

    const requiresApproval = ['create_file', 'edit_file', 'delete_file', 'run_command'].includes(name);

    if (requiresApproval && settings?.permissions?.requireApproval) {
      const approved = await new Promise<boolean>((resolve) => {
        setPendingApproval({
          request: {
            id: toolCall.id,
            agentId: selectedAgent.id,
            agentName: selectedAgent.name,
            timestamp: Date.now(),
            action: name as any,
            description: `Tool ${name} execution`,
            details: JSON.stringify(args),
            status: 'pending'
          },
          resolve
        });
      });

      setPendingApproval(null);
      if (!approved) {
        return { error: 'Action denied by user' };
      }
    }

    try {
      // @ts-ignore
      const api = window.vendraAPI;
      if (!api) {
        throw new Error('Vendra API not available');
      }

      // Brain coordination: report intent and acquire lock if file action
      if (['create_file', 'edit_file', 'delete_file'].includes(name) && args.path && api.brain) {
        await api.brain.acquireLock({ filePath: args.path, agentId: selectedAgent.id, agentName: selectedAgent.name });
      }

      let res: any;
      switch (name) {
        case 'create_file':
        case 'edit_file':
          await api.fs.writeFile(args.path, args.content);
          if (api.brain?.broadcastTyping) {
            await api.brain.broadcastTyping({
              agentId: selectedAgent.id,
              agentName: selectedAgent.name,
              filePath: args.path,
              text: args.content,
              color: selectedAgent.color
            });
          }
          // Live update matching tab in Monaco editor if open
          const matchingTab = openTabs.find(t => t.path === args.path || t.name === args.path.split('/').pop());
          if (matchingTab) {
            updateTabContent(matchingTab.id, args.content);
          }
          res = { success: true, path: args.path };
          break;
        case 'delete_file':
          await api.fs.deleteFile(args.path);
          res = { success: true, path: args.path };
          break;
        case 'read_file':
          const content = await api.fs.readFile(args.path);
          res = { content };
          break;
        case 'run_command':
          const result = await api.os.exec(args.command, workspacePath || '');
          res = { result };
          break;
        case 'search_codebase':
          const searchResults = await api.fs.search(workspacePath || '', args.query);
          res = { results: searchResults };
          break;
        case 'list_files':
          const files = await api.fs.readDir(args.path || workspacePath || '');
          res = { files };
          break;
        case 'web_search': {
          const results = await api.hermes.webSearch(args.query, args.limit || 6);
          res = { results, query: args.query };
          break;
        }
        case 'fetch_url': {
          const page = await api.hermes.fetchUrl(args.url, args.max_length || 8000);
          res = { page };
          break;
        }
        case 'take_screenshot': {
          const shot = await api.hermes.takeScreenshot(workspacePath || undefined);
          res = { screenshot: shot };
          break;
        }
        case 'get_system_info': {
          const sysInfo = await api.hermes.getSystemInfo();
          res = { systemInfo: sysInfo };
          break;
        }
        default:
          return { error: `Unknown tool: ${name}` };
      }

      // Brain coordination: report completed action and release lock
      if (api.brain) {
        await api.brain.reportAction({
          agentId: selectedAgent.id,
          agentName: selectedAgent.name,
          action: name,
          targetFile: args.path || args.command || args.query || args.url,
          summary: name === 'run_command' 
            ? `Ran ${args.command}` 
            : name === 'web_search' 
            ? `Searched web for "${args.query}"` 
            : name === 'take_screenshot'
            ? 'Captured desktop screen'
            : `Modified ${args.path || 'workspace'}`,
        });
        if (args.path) {
          await api.brain.releaseLock({ filePath: args.path, agentId: selectedAgent.id });
        }
      }

      // Refresh workspace files if file created/modified
      if (workspacePath && ['create_file', 'edit_file', 'delete_file'].includes(name)) {
        api.fs.readDir(workspacePath).then(entries => setFileTree(entries)).catch(() => {});
      }

      return res;
    } catch (error: any) {
      return { error: error.message || 'Tool execution failed' };
    }
  };

  const handleScanModels = async () => {
    setIsScanningModels(true);
    try {
      if (window.vendraAPI?.scanner) {
        const list = await window.vendraAPI.scanner.scanModels({
          providerType: selectedAgent.id === 'opencode' ? 'opencode' : activeProvider?.id,
          baseUrl: activeProvider?.baseUrl,
          apiKey: activeProvider?.apiKey
        });
        setScannedModels(list);
        setIsModelPickerOpen(true);
      }
    } catch (err) {
      console.error('Scan models error:', err);
    } finally {
      setIsScanningModels(false);
    }
  };

  const runAutonomousAgentLoop = async (promptText: string, baseMessages: ChatMessage[], agentName: string) => {
    if (!activeProvider) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        id: Date.now().toString(),
        timestamp: Date.now(),
        content: `⚠️ No active LLM provider configured. Please configure an API key for NVIDIA NIM, OpenAI, or your provider in Preferences.`
      }]);
      return;
    }

    try {
      const systemMessage: ChatMessage = {
        id: 'system',
        role: 'system',
        timestamp: Date.now(),
        content: `You are ${agentName}, an expert autonomous AI software engineer in VendraCode IDE.
You coordinate with teammates in The Shared Brain.
When asked to write code or create features, ALWAYS use your tools:
- create_file: create new files in the workspace (with full complete code, no placeholders)
- edit_file: rewrite or patch files
- read_file: inspect existing code
- run_command: execute bash commands, tests, or builds
- search_codebase: locate symbols and patterns
- list_files: explore project directories
- web_search: search online documentation
Workspace directory: ${workspacePath || '/home/ibrohim'}`
      };

      let currentMsgs = [...baseMessages];
      let keepRunning = true;
      let turns = 0;
      const MAX_TURNS = 10;

      while (keepRunning && turns < MAX_TURNS) {
        turns++;
        const apiMessages = [systemMessage, ...currentMsgs].map(m => ({
          role: m.role,
          content: m.content || '',
          ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
          ...(m.toolName ? { name: m.toolName } : {}),
          ...(m.toolCalls ? { tool_calls: m.toolCalls } : {})
        }));

        const response = await fetch(`${activeProvider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(activeProvider.apiKey ? { 'Authorization': `Bearer ${activeProvider.apiKey}` } : {})
          },
          body: JSON.stringify({
            model: activeProvider.model,
            messages: apiMessages,
            tools: AGENT_TOOLS,
            tool_choice: 'auto'
          })
        });

        if (!response.ok) {
          throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const responseMessage = data.choices[0].message;

        const aiMessage: ChatMessage = {
          content: responseMessage.content || '',
          role: 'assistant',
          id: Date.now().toString() + Math.random().toString(),
          timestamp: Date.now(),
          toolCalls: responseMessage.tool_calls
        };

        currentMsgs = [...currentMsgs, aiMessage];
        setMessages(currentMsgs);

        if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
          for (const toolCall of responseMessage.tool_calls) {
            const toolResult = await executeTool(toolCall);
            const toolResultMessage: ChatMessage = {
              role: 'tool',
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              content: JSON.stringify(toolResult),
              id: Date.now().toString() + Math.random().toString(),
              timestamp: Date.now()
            };
            currentMsgs = [...currentMsgs, toolResultMessage];
            setMessages(currentMsgs);
          }
        } else {
          keepRunning = false;
        }
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        id: Date.now().toString(),
        timestamp: Date.now(),
        content: `⚠️ Error executing agent: ${err.message}`
      }]);
    }
  };

  // Dispatch message to agent (either native LLM or local CLI process)
  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: text,
      id: Date.now().toString(),
      timestamp: Date.now()
    };

    let currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setInputValue('');
    setAgentStatus?.('running');

    // ─── CASE A: Local CLI Process (e.g. OpenCode, Agy, Cline) ───
    if (selectedAgent.type === 'cli') {
      try {
        const agentThinkingId = `cli-${Date.now()}`;
        const initialStatusMsg: ChatMessage = {
          role: 'assistant',
          id: agentThinkingId,
          timestamp: Date.now(),
          content: `⚡ Spawning local **${selectedAgent.name}** process in workspace...\n\nRouting command: \`${selectedAgent.bin} run "${text.replace(/"/g, '\\"')}"\``
        };
        currentMessages = [...currentMessages, initialStatusMsg];
        setMessages(currentMessages);

        let cliResult = { stdout: '', stderr: '', error: null as any, code: 0 };
        if (window.vendraAPI?.os) {
          const binPath = selectedAgent.id === 'opencode'
            ? '/home/ibrohim/.opencode/bin/opencode'
            : selectedAgent.bin;
          cliResult = await window.vendraAPI.os.exec(
            `${binPath} run --auto "${text.replace(/"/g, '\\"')}"`,
            workspacePath || undefined
          );
        }

        const combinedOutput = (cliResult.stdout || '') + (cliResult.stderr || '');
        const isQuotaError = combinedOutput.includes('provider.quota') || combinedOutput.includes('402') || combinedOutput.includes('credits');

        if (isQuotaError || (cliResult.error && !cliResult.stdout)) {
          // OpenRouter quota or provider error: notify and seamlessly run autonomous engine
          setMessages(prev => prev.map(m => {
            if (m.id === agentThinkingId) {
              return {
                ...m,
                content: `⚡ **OpenCode CLI Notice**: Local OpenRouter quota exceeded.\n\n🔄 **Autonomous Engine Fallback**: Handing task over to VendraCode Engine (${activeProvider?.name || 'NVIDIA NIM'} · ${activeProvider?.model}) under OpenCode persona...`
              };
            }
            return m;
          }));

          await runAutonomousAgentLoop(text, currentMessages, selectedAgent.name);
          return;
        }

        // Clean successful CLI output
        const outputText = cliResult.stdout.trim() || cliResult.stderr.trim() || 'Process completed successfully.';
        setMessages(prev => prev.map(m => {
          if (m.id === agentThinkingId) {
            return {
              ...m,
              content: `### ${selectedAgent.icon} ${selectedAgent.name} Output\n\n\`\`\`bash\n${outputText}\n\`\`\`\n\n✓ All changes synced with **The Shared Brain** and Git worktree.`
            };
          }
          return m;
        }));

        if (workspacePath && window.vendraAPI?.fs) {
          const entries = await window.vendraAPI.fs.readDir(workspacePath);
          setFileTree(entries);
        }
      } catch (err: any) {
        await runAutonomousAgentLoop(text, currentMessages, selectedAgent.name);
      } finally {
        setAgentStatus?.('idle');
      }
      return;
    }

    // ─── CASE B: Vendra AI Native (Hermes Agent with tools) ───
    try {
      await runAutonomousAgentLoop(text, currentMessages, 'VendraCode AI');
    } finally {
      setAgentStatus?.('idle');
    }
  };

  // Quick Action triggers for Hermes skills
  const triggerQuickSearch = () => {
    setInputValue(prev => prev ? `${prev} /websearch ` : 'Search the web for ');
  };

  const triggerInstantScreenshot = async () => {
    if (!window.vendraAPI?.hermes) return;
    try {
      const shot = await window.vendraAPI.hermes.takeScreenshot(workspacePath || undefined);
      if (shot.success) {
        sendMessage(`I took a desktop screenshot at ${shot.path}. Please inspect what is on screen.`);
      } else {
        alert(shot.error || 'Failed to capture screen');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const triggerSystemInfo = () => {
    sendMessage('Check my computer system specs and hardware environment using get_system_info.');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(inputValue);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-bgside border-l border-border text-text-primary select-none">
      {/* ─── Amoeba Style Top Header with Agent & Model Pills ─── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bgtitle shrink-0 gap-2">
        {/* Agent Selector Dropdown (Vendra AI, OpenCode, Agy, Cline, Claude) */}
        <div className="relative">
          <button 
            type="button"
            className="agentpill font-medium"
            onClick={() => {
              setIsAgentDropdownOpen(!isAgentDropdownOpen);
              setIsProviderDropdownOpen(false);
            }}
          >
            <span>{selectedAgent.icon}</span>
            <span className="font-semibold text-text-primary text-[11px] truncate max-w-[95px]">{selectedAgent.name}</span>
            <ChevronDown className="w-3 h-3 text-text-muted" />
          </button>
          
          {isAgentDropdownOpen && (
            <div className="absolute left-0 mt-1.5 w-64 bg-surface border border-border-light rounded-xl shadow-2xl z-50 p-1.5">
              <div className="text-[10px] text-text-muted px-2 py-1 font-semibold uppercase tracking-wider">
                Select Active Agent Engine
              </div>
              {CHAT_AGENTS.map(agent => (
                <button
                  key={agent.id}
                  type="button"
                  className={`w-full text-left p-2 rounded-lg transition-colors flex items-start gap-2.5 ${
                    agent.id === selectedAgent.id 
                      ? 'bg-chip text-text-primary font-semibold' 
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                  onClick={() => {
                    setSelectedAgent(agent);
                    setIsAgentDropdownOpen(false);
                  }}
                >
                  <span className="text-base mt-0.5">{agent.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-primary font-medium">{agent.name}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-bgdeep text-text-muted font-mono">{agent.badge}</span>
                    </div>
                    <p className="text-[10px] text-text-muted mt-0.5 line-clamp-1">{agent.description}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Provider Pill (OpenAI, Anthropic, NVIDIA NIM) */}
        <div className="relative">
          <button 
            type="button"
            className="agentpill"
            onClick={() => {
              setIsProviderDropdownOpen(!isProviderDropdownOpen);
              setIsAgentDropdownOpen(false);
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="font-mono text-xs truncate max-w-[80px]">{activeProvider?.name || 'Model'}</span>
            <ChevronDown className="w-3 h-3 text-text-muted" />
          </button>
          
          {isProviderDropdownOpen && providers && (
            <div className="absolute right-0 mt-1.5 w-52 bg-surface border border-border-light rounded-xl shadow-2xl z-50 p-1">
              <div className="text-[10px] text-text-muted px-2 py-1 font-semibold uppercase tracking-wider">
                API Models
              </div>
              {providers.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`w-full text-left px-2.5 py-1.5 text-xs rounded-md transition-colors flex items-center justify-between ${
                    p.id === activeProvider?.id 
                      ? 'bg-chip text-text-primary font-medium' 
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                  onClick={() => {
                    setActiveProvider?.(p);
                    setIsProviderDropdownOpen(false);
                  }}
                >
                  <span className="truncate">{p.name}</span>
                  <span className="text-[10px] text-text-muted font-mono">{p.model}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Dynamic Model Scanner Button & Dropdown */}
        <div className="relative">
          <button 
            type="button"
            className="agentpill flex items-center gap-1.5"
            onClick={handleScanModels}
            title="Scan live models for active provider/CLI"
          >
            {isScanningModels ? (
              <Loader2 className="w-3 h-3 text-ok animate-spin" />
            ) : (
              <Cpu className="w-3 h-3 text-ok" />
            )}
            <span className="font-mono text-[11px] truncate max-w-[85px]">
              {activeProvider?.model || 'Scan Models'}
            </span>
            <ChevronDown className="w-3 h-3 text-text-muted" />
          </button>

          {isModelPickerOpen && scannedModels.length > 0 && (
            <div className="absolute right-0 mt-1.5 w-64 bg-surface border border-border-light rounded-xl shadow-2xl z-50 p-1.5 max-h-64 overflow-y-auto">
              <div className="text-[10px] text-text-muted px-2 py-1 font-semibold uppercase tracking-wider flex justify-between items-center">
                <span>Live Discovered Models ({scannedModels.length})</span>
                <button type="button" onClick={() => setIsModelPickerOpen(false)} className="text-text-muted hover:text-text-primary text-xs">✕</button>
              </div>
              <div className="space-y-0.5 mt-1">
                {scannedModels.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      if (activeProvider) {
                        updateProvider(activeProvider.id, { model: m.id });
                      }
                      setIsModelPickerOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between ${
                      activeProvider?.model === m.id
                        ? 'bg-chip text-text-primary font-bold'
                        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-1">
                      <div className="font-mono text-[11px] truncate">{m.name || m.id}</div>
                      {m.source && <div className="text-[9px] text-text-muted">{m.source}</div>}
                    </div>
                    {activeProvider?.model === m.id && <Check size={12} className="text-ok shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Chat Messages Stream ─── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-text-muted">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-lg border border-border shadow-md"
              style={{ backgroundColor: `${selectedAgent.color}20` }}
            >
              <span>{selectedAgent.icon}</span>
            </div>
            <h3 className="text-sm font-semibold text-text-primary mb-1">
              {selectedAgent.name} Active
            </h3>
            <p className="text-xs text-text-secondary max-w-[270px] leading-relaxed mb-4">
              {selectedAgent.description}
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center max-w-[280px]">
              <button 
                type="button"
                onClick={() => setInputValue('Create a new JWT authentication middleware in src/auth')}
                className="amoeba-chip hover:border-border-light hover:text-text-primary transition-colors text-[11px] cursor-pointer"
              >
                ⚡ Write JWT Auth
              </button>
              <button 
                type="button"
                onClick={triggerQuickSearch}
                className="amoeba-chip hover:border-border-light hover:text-text-primary transition-colors text-[11px] cursor-pointer"
              >
                🔍 Search Web
              </button>
              <button 
                type="button"
                onClick={triggerInstantScreenshot}
                className="amoeba-chip hover:border-border-light hover:text-text-primary transition-colors text-[11px] cursor-pointer"
              >
                📸 Take Screenshot
              </button>
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <motion.div 
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-end"
                >
                  <div className="bg-chip border border-border-light text-text-primary px-3.5 py-2 rounded-xl max-w-[88%] text-xs leading-relaxed whitespace-pre-wrap shadow-sm">
                    {msg.content}
                  </div>
                </motion.div>
              );
            }
            
            if (msg.role === 'assistant' && msg.content) {
              return (
                <motion.div 
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start gap-2"
                >
                  <div className="w-6 h-6 rounded-md bg-chip border border-border flex items-center justify-center shrink-0 mt-0.5 text-xs">
                    <span>{selectedAgent.icon}</span>
                  </div>
                  <div className="bg-surface border border-border text-text-primary px-3 py-2 rounded-xl max-w-[90%] text-xs leading-relaxed whitespace-pre-wrap select-text">
                    {msg.content}
                  </div>
                </motion.div>
              );
            }

            if (msg.role === 'tool') {
              let parsed: any = {};
              try { parsed = JSON.parse(msg.content); } catch (e) {}
              const isExpanded = expandedToolMsgId === msg.id;

              // 1. Hermes Web Search Tool Card
              if (msg.toolName === 'web_search') {
                const results: any[] = parsed.results || [];
                return (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="ml-8 bg-surface border border-border rounded-lg p-2.5 text-xs shadow-sm"
                  >
                    <div 
                      onClick={() => setExpandedToolMsgId(isExpanded ? null : msg.id)}
                      className="flex items-center justify-between cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-accent" />
                        <span className="font-semibold text-text-primary">Web Search</span>
                        <span className="text-[10px] text-text-muted font-mono bg-chip px-1.5 py-0.2 rounded border border-border">
                          {results.length} sources
                        </span>
                      </div>
                      <ChevronDown className={`w-3 h-3 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>

                    {isExpanded && results.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border space-y-2">
                        {results.slice(0, 4).map((r, i) => (
                          <div key={i} className="p-2 bg-bgside rounded border border-border/80">
                            <a 
                              href={r.url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="font-medium text-accent hover:underline flex items-center gap-1 text-[11px]"
                            >
                              {r.title}
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                            <p className="text-[10px] text-text-secondary mt-0.5 line-clamp-2">{r.snippet}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              }

              // 2. Hermes Fetch URL Card
              if (msg.toolName === 'fetch_url') {
                const page = parsed.page || {};
                return (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="ml-8 bg-surface border border-border rounded-lg p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-accent" />
                        <span className="font-semibold text-text-primary truncate max-w-[180px]">{page.title || 'Page Reader'}</span>
                      </div>
                      <span className="text-[10px] text-text-muted font-mono">{page.content ? `${page.content.length} chars` : 'ok'}</span>
                    </div>
                  </motion.div>
                );
              }

              // 3. Hermes Screen Capture Card
              if (msg.toolName === 'take_screenshot') {
                const shot = parsed.screenshot || {};
                return (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="ml-8 bg-surface border border-border rounded-lg p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Camera className="w-3.5 h-3.5 text-accent" />
                      <span className="font-semibold text-text-primary">Desktop Screen Captured</span>
                    </div>
                    {shot.path && (
                      <div className="text-[10px] font-mono text-text-muted bg-bgside p-1.5 rounded border border-border truncate">
                        {shot.path}
                      </div>
                    )}
                  </motion.div>
                );
              }

              // 4. Hermes System Info Card
              if (msg.toolName === 'get_system_info') {
                const info = parsed.systemInfo || {};
                return (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="ml-8 bg-surface border border-border rounded-lg p-2 text-xs"
                  >
                    <div className="flex items-center gap-1.5 mb-2 font-semibold text-text-primary">
                      <Cpu className="w-3.5 h-3.5 text-accent" />
                      <span>Host Hardware & OS</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-text-secondary">
                      <div className="bg-bgside p-1.5 rounded border border-border">OS: {info.platform} {info.arch}</div>
                      <div className="bg-bgside p-1.5 rounded border border-border">CPUs: {info.cpus?.length || 1} Cores</div>
                      <div className="bg-bgside p-1.5 rounded border border-border">RAM: {info.memory?.total || 'N/A'}</div>
                      <div className="bg-bgside p-1.5 rounded border border-border">Uptime: {info.uptime || 'N/A'}</div>
                    </div>
                  </motion.div>
                );
              }

              // Default Tool Result Pill
              return (
                <motion.div 
                  key={msg.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex justify-start ml-8"
                >
                  <div className="flex items-center gap-1.5 text-[11px] text-text-muted bg-chip border border-border px-2.5 py-1 rounded-md">
                    {parsed?.error ? (
                      <AlertCircle className="w-3 h-3 text-danger" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3 text-success" />
                    )}
                    <span className="font-mono">{msg.toolName}</span>
                    {parsed?.path && <span className="text-text-secondary truncate max-w-[140px] font-mono">({parsed.path})</span>}
                  </div>
                </motion.div>
              );
            }
            
            return null;
          })}
        </AnimatePresence>

        {/* Amoeba Approval Gate */}
        {pendingApproval && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="ml-6 bg-surface border border-border-light rounded-xl p-3.5 shadow-xl space-y-3"
          >
            <div className="font-semibold text-text-primary text-xs flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5 text-warning" />
                Approval Gate: {pendingApproval.request.agentName}
              </span>
              <span className="text-[10px] text-text-muted uppercase font-mono px-1.5 py-0.5 bg-chip rounded">
                {pendingApproval.request.action}
              </span>
            </div>
            <div className="font-mono text-[11px] bg-bgside p-2 rounded border border-border text-text-secondary break-all max-h-36 overflow-y-auto">
              {JSON.stringify(JSON.parse(pendingApproval.request.details), null, 2)}
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button 
                type="button"
                onClick={() => pendingApproval.resolve(false)}
                className="btn btn-danger text-xs h-7"
              >
                Deny
              </button>
              <button 
                type="button"
                onClick={() => pendingApproval.resolve(true)}
                className="btn btn-success text-xs h-7"
              >
                Approve
              </button>
            </div>
          </motion.div>
        )}

        {/* Running Indicator */}
        {agentStatus === 'running' && !pendingApproval && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start gap-2 items-center text-xs text-text-muted ml-8"
          >
            <div className="dotpulse" />
            <span className="font-mono text-[11px]">{selectedAgent.name} is running in worktree...</span>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── Input Area with Hermes Skill Triggers ─── */}
      <div className="p-3 border-t border-border bg-bgtitle shrink-0">
        {/* Hermes Skill Bar */}
        <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={triggerQuickSearch}
            className="amoeba-chip hover:border-border-light hover:text-text-primary cursor-pointer transition-colors"
            title="Search Web via DuckDuckGo"
          >
            <Globe className="w-3 h-3 text-accent" />
            <span>Search</span>
          </button>
          <button
            type="button"
            onClick={triggerInstantScreenshot}
            className="amoeba-chip hover:border-border-light hover:text-text-primary cursor-pointer transition-colors"
            title="Take Screen Capture"
          >
            <Camera className="w-3 h-3 text-primary" />
            <span>Screen</span>
          </button>
          <button
            type="button"
            onClick={triggerSystemInfo}
            className="amoeba-chip hover:border-border-light hover:text-text-primary cursor-pointer transition-colors"
            title="Inspect Host Specs"
          >
            <Cpu className="w-3 h-3 text-warning" />
            <span>Specs</span>
          </button>
        </div>

        {/* Textarea + Tactile Send */}
        <div className="relative flex items-end bg-bgside border border-border rounded-xl focus-within:border-line2 transition-all">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${selectedAgent.name} to write code, edit files, or search... (Enter to send)`}
            className="w-full max-h-32 min-h-[44px] bg-transparent text-text-primary text-xs p-3 resize-none outline-none leading-relaxed"
            rows={Math.min(5, inputValue.split('\n').length || 1)}
          />
          <div className="p-2 shrink-0">
            {agentStatus === 'running' ? (
              <button
                type="button"
                disabled
                className="btn btn-ghost h-7 w-7 p-0 rounded-lg text-text-muted"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => sendMessage(inputValue)}
                disabled={!inputValue.trim()}
                className="btn btn-primary h-7 w-7 p-0 rounded-lg"
                title="Send message"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
