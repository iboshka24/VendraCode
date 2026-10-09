import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, Bot, User, Loader2, Wrench, X, Settings, ChevronDown, MessageSquare, Plus, Trash2, 
  Sparkles, Square, Globe, Camera, Cpu, Terminal, ExternalLink,
  Search, CheckCircle2, AlertCircle, FileCode, Check, Layers, Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/stores/appStore';
import type { LocalCLIDetected, ChatSession } from '@/types';
import { brainClient } from '@/services/brainClient';
import { toWorkspaceRelative } from '@/utils/workspacePath';
import { parseCliChunk, opencodeRunArgs, opencodeModelOverride, deriveChatTitle } from '@/utils/opencodeStream';
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

/** `cli-tokenharbor` → `Token Harbor` — display name for a discovered provider. */
function prettyProviderName(m: { providerId?: string; provider?: string }): string {
  const raw = (m.providerId || m.provider || 'discovered').replace(/^cli-/, '').replace(/[-_]+/g, ' ');
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

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
    upsertProvider,
    updateTabContent,
    openTabs,
    localCLIs
  } = useAppStore();

  // Chats live in the store (persisted to localStorage), so a reload or restart
  // keeps the conversation and the CLI session context.
  const chatSessions = useAppStore((s) => s.chatSessions);
  const activeChatId = useAppStore((s) => s.activeChatId);
  const createChat = useAppStore((s) => s.createChat);
  const setActiveChat = useAppStore((s) => s.setActiveChat);
  const deleteChat = useAppStore((s) => s.deleteChat);
  const renameChat = useAppStore((s) => s.renameChat);
  const setActiveChatMessages = useAppStore((s) => s.setActiveChatMessages);
  const setChatCliSession = useAppStore((s) => s.setChatCliSession);

  const activeChat: ChatSession | undefined =
    chatSessions.find((c) => c.id === activeChatId) || chatSessions[0];
  const messages = activeChat?.messages ?? [];
  const setMessages = setActiveChatMessages;

  const [isChatListOpen, setIsChatListOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<ChatAgentOption>(CHAT_AGENTS[0]);
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const [expandedToolMsgId, setExpandedToolMsgId] = useState<string | null>(null);

  // Dynamic Model Scanner state
  // `endpoint`/`apiKey`/`providerId` come from the scanner so that picking a
  // model configures the *matching* provider, not whichever one happens to be active.
  const [scannedModels, setScannedModels] = useState<Array<{
    id: string;
    name: string;
    provider?: string;
    size?: string;
    source?: string;
    providerId?: string;
    baseUrl?: string;
    apiKey?: string;
    providerName?: string;
    requiresKey?: boolean;
    keyHint?: string;
    /** Model is only callable through an installed agent CLI (no endpoint+key). */
    cliModel?: boolean;
  }>>([]);
  const [isScanningModels, setIsScanningModels] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);

  // Guarantee there is always one chat to talk in (also seeds the first run).
  useEffect(() => {
    if (chatSessions.length === 0) createChat(selectedAgent.id);
  }, [chatSessions.length, createChat, selectedAgent.id]);

  // Live CLI agent run (spawned via the main process, streamed back into chat)
  const [runningAgent, setRunningAgent] = useState<{
    agentId: string;
    messageId: string;
    bin: string;
    startedAt: number;
  } | null>(null);
  const cliStreamBufferRef = useRef('');
  const cliFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cliDetachRef = useRef<Array<() => void>>([]);
  const cliTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
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
          // Publish the edit to the swarm so teammates (and their agents) see it.
          brainClient.sendDiff(
            toWorkspaceRelative(args.path, workspacePath),
            [{
              range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
              text: String(args.content || '').split('\n')[0].slice(0, 400),
              rangeLength: 0,
            }]
          );
          brainClient.acquireLock(toWorkspaceRelative(args.path, workspacePath));
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

  /**
   * Imports a discovered model by configuring the provider it actually belongs
   * to (endpoint + credentials supplied by the scanner) and activating it.
   * Previously only the `model` field of whatever provider happened to be
   * active was overwritten, so OpenRouter / OpenCode models were routed to the
   * wrong API and every request failed.
   */
  const handleSelectModel = (m: (typeof scannedModels)[number]) => {
    const endpoint = m.baseUrl || activeProvider?.baseUrl || '';
    const providerId = m.providerId || activeProvider?.id || 'custom';
    const prettyName = m.providerName || prettyProviderName(m) || 'Discovered Provider';

    upsertProvider({
      id: providerId,
      name: prettyName,
      baseUrl: endpoint,
      apiKey: m.apiKey || '',
      model: m.id,
      // A CLI-routed model is usable without any key of ours — the agent CLI
      // owns the credentials — so it counts as connected.
      isConnected: Boolean(m.cliModel) || Boolean(m.apiKey),
      icon: prettyName.slice(0, 1).toUpperCase(),
      cliModel: Boolean(m.cliModel),
    });
    setIsModelPickerOpen(false);

    // CLI-routed models (OpenCode Zen and the other providers OpenCode is logged
    // into) expose no endpoint+key we could fetch. Rather than let the built-in
    // engine walk into an empty request, switch to the OpenCode CLI so the pick
    // actually answers.
    if (m.cliModel) {
      const cliAgent = CHAT_AGENTS.find((a) => a.type === 'cli' && a.bin === 'opencode');
      const installed = localCLIs.find((c) => c.id === 'opencode')?.isInstalled;
      if (cliAgent && installed) setSelectedAgent(cliAgent);
      setMessages((prev) => [...prev, {
        role: 'system',
        id: `sys-cli-${Date.now()}`,
        timestamp: Date.now(),
        content: [
          `⚡ **${prettyName} · ${m.id}** selected.`,
          '',
          installed
            ? 'Its credentials live inside the OpenCode CLI, so prompts now run through `opencode run --model ' + m.id + '` in this workspace.'
            : 'The OpenCode CLI is not installed on this machine, so this model cannot answer yet.',
        ].join('\n'),
      }]);
      return;
    }

    // Tell the user why a model may still fail after importing it.
    if (m.requiresKey && !m.apiKey) {
      const hint = m.keyHint || 'No API key was found for this endpoint.';
      setMessages((prev) => [...prev, {
        role: 'system',
        id: `sys-key-${Date.now()}`,
        timestamp: Date.now(),
        content: `🔑 **${prettyName} · ${m.name}** imported, but ${hint}`,
      }]);
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

  /** Tears down stream listeners/timers for a finished (or cancelled) run. */
  const cleanupCliRun = useCallback(() => {
    for (const detach of cliDetachRef.current) {
      try { detach(); } catch {}
    }
    cliDetachRef.current = [];
    if (cliFlushTimerRef.current) { clearTimeout(cliFlushTimerRef.current); cliFlushTimerRef.current = null; }
    if (cliTimeoutRef.current) { clearTimeout(cliTimeoutRef.current); cliTimeoutRef.current = null; }
    cliStreamBufferRef.current = '';
  }, []);

  // Any in-flight CLI run must be torn down when the panel unmounts
  useEffect(() => () => {
    if (cliFlushTimerRef.current) clearTimeout(cliFlushTimerRef.current);
    if (cliTimeoutRef.current) clearTimeout(cliTimeoutRef.current);
    for (const detach of cliDetachRef.current) { try { detach(); } catch {} }
    cliDetachRef.current = [];
  }, []);

  /** Stops the running CLI agent (Stop button). */
  const stopCliAgent = useCallback(async () => {
    const run = runningAgent;
    setRunningAgent(null);
    cleanupCliRun();
    if (run && window.vendraAPI?.cli) {
      try { await window.vendraAPI.cli.stopAgent(run.agentId); } catch {}
      setMessages(prev => prev.map(m => (m.id === run.messageId
        ? { ...m, content: `${m.content || ''}\n\n⏹ **Stopped by user.**` }
        : m)));
    }
  }, [runningAgent, cleanupCliRun]);

  /**
   * Runs a local CLI agent (OpenCode, Claude Code, …) as a real child process and
   * streams its output into the chat message as it arrives. The binary is
   * resolved from the detected agent list instead of a hardcoded path, the exit
   * code is reported honestly, and the run can be cancelled.
   */
  const runCliAgent = async (
    text: string,
    baseMessages: ChatMessage[],
    agent: ChatAgentOption
  ) => {
    const api = window.vendraAPI;
    if (!api?.cli) {
      setMessages(prev => [...prev, {
        role: 'assistant', id: `err-${Date.now()}`, timestamp: Date.now(),
        content: '⚠️ Agent bridge unavailable (preload API missing).',
      }]);
      setAgentStatus?.('idle');
      return;
    }

    // Resolve the real binary from the detection list; never guess a path.
    const detected: LocalCLIDetected | undefined = localCLIs.find((c) => c.id === agent.id);
    const cliBin = detected?.isInstalled ? detected.path || detected.bin : null;
    if (!cliBin) {
      setMessages(prev => [...prev, {
        role: 'assistant', id: `err-${Date.now()}`, timestamp: Date.now(),
        content: [
          `⚠️ **${agent.name} is not installed on this machine.**`,
          '',
          `Looked for \`${agent.bin}\` in PATH and the usual install locations.`,
          `Install it, then re-send — or switch the agent to **Vendra AI** (built-in engine) in the picker above.`,
        ].join('\n'),
      }]);
      setAgentStatus?.('idle');
      return;
    }

    const agentId = `${agent.id}-${Date.now()}`;
    const messageId = `cli-run-${Date.now()}`;
    const startedAt = Date.now();

    const seedMessage: ChatMessage = {
      role: 'assistant',
      id: messageId,
      timestamp: startedAt,
      content: `⚡ **${agent.name}** running in \`${cliBin}\`\n\nWorkspace: \`${workspacePath || '—'}\`\n\n\`\`\`\n(starting…)`,
    };
    setMessages([...baseMessages, seedMessage]);
    setAgentStatus?.('running');

    // ── stream plumbing ───────────────────────────────────────────
    let closed = false;
    let exitCode: number | null = null;

    const flush = () => {
      cliFlushTimerRef.current = null;
      const body = cliStreamBufferRef.current;
      if (!body) return;
      const trimmed = body.length > 6000 ? `…${body.slice(-5600)}` : body;
      setMessages(prev => prev.map(m => (m.id === messageId
        ? { ...m, content: `${seedMessage.content}\n${trimmed}\n\`\`\`` }
        : m)));
    };
    const scheduleFlush = () => {
      if (cliFlushTimerRef.current) return;
      cliFlushTimerRef.current = setTimeout(flush, 120);
    };

    const chatId = activeChat?.id;

    const detachOutput = api.cli.onAgentOutput((chunk) => {
      if (chunk.agentId !== agentId) return;

      // OpenCode prints NDJSON events: extract readable text and the session id.
      if (agent.id === 'opencode') {
        for (const parsed of parseCliChunk(chunk.text || '')) {
          if (parsed.sessionId && chatId && parsed.sessionId !== activeChat?.opencodeSessionId) {
            setChatCliSession(chatId, parsed.sessionId);
          }
          if (parsed.error) cliStreamBufferRef.current += `\n\n⚠️ ${parsed.error}\n`;
          if (parsed.text) cliStreamBufferRef.current += parsed.text;
        }
      } else {
        cliStreamBufferRef.current += chunk.text || '';
      }
      scheduleFlush();
    });
    const detachExit = api.cli.onAgentExit(({ agentId: exitedId, code }) => {
      if (exitedId !== agentId || closed) return;
      closed = true;
      exitCode = code ?? 0;
    });
    cliDetachRef.current = [detachOutput, detachExit];

    // A CLI agent may legitimately take a while; stop it after 15 minutes.
    cliTimeoutRef.current = setTimeout(async () => {
      if (closed) return;
      try { await api.cli.stopAgent(agentId); } catch {}
    }, 15 * 60 * 1000);

    // ── spawn: per-CLI argument shapes (verified against each CLI) ─
    const argsByAgent: Record<string, string[]> = {
      opencode: opencodeRunArgs({
        sessionId: activeChat?.opencodeSessionId,
        model: opencodeModelOverride(activeProvider || undefined),
      }),
      claude: ['-p', '--dangerously-skip-permissions'],
      agy: ['run', '--auto'],
      cline: ['run'],
    };
    const args = argsByAgent[agent.id] ?? [];

    let spawnOk = true;
    let spawnError = '';
    try {
      const result = await api.cli.spawnAgent({ agentId, cliBin, args, cwd: workspacePath || undefined, prompt: text });
      if (!result?.success) {
        spawnOk = false;
        spawnError = result?.error || 'spawn refused';
      }
    } catch (err: any) {
      spawnOk = false;
      spawnError = err?.message || String(err);
    }

    if (!spawnOk) {
      closed = true;
      cleanupCliRun();
      setAgentStatus?.('idle');
      setMessages(prev => prev.map(m => (m.id === messageId
        ? { ...m, content: `${seedMessage.content}\n\n⚠️ **Failed to start ${agent.name}**: ${spawnError}` }
        : m)));
      return;
    }

    setRunningAgent({ agentId, messageId, bin: cliBin, startedAt });

    // Wait for the process to finish (the exit listener above resolves it).
    await new Promise<void>((resolve) => {
      const poll = setInterval(() => {
        if (closed) { clearInterval(poll); resolve(); }
      }, 120);
      cliDetachRef.current.push(() => clearInterval(poll));
    });

    // Read the streamed body BEFORE cleanupCliRun() — it clears the buffer,
    // and reading it afterwards silently discarded everything the CLI said.
    const body = cliStreamBufferRef.current.trim();
    if (cliFlushTimerRef.current) { clearTimeout(cliFlushTimerRef.current); cliFlushTimerRef.current = null; }
    cleanupCliRun();
    setRunningAgent(null);
    setAgentStatus?.('idle');

    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    const verdict = (exitCode === 0)
      ? `✅ exit 0 · ${seconds}s`
      : `❌ exit ${exitCode ?? '?'} · ${seconds}s`;
    const tail = body && !seedMessage.content.includes(body.slice(0, 40))
      ? `\n\n\`\`\`\n${body.length > 6000 ? `…${body.slice(-5600)}` : body}\n\`\`\``
      : '';

    setMessages(prev => prev.map(m => (m.id === messageId
      ? { ...m, content: `${seedMessage.content}${tail}\n\n${verdict}` }
      : m)));

    // Real side effect: the workspace watcher refreshes the explorer for us.
    if (workspacePath && api.fs) {
      try { setFileTree(await api.fs.readDir(workspacePath)); } catch {}
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

    // A brand-new chat gets its title from the first message.
    if (activeChat && activeChat.title === 'New chat') {
      rememberChatTitle(activeChat.id, text);
    }

    let currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setInputValue('');
    setAgentStatus?.('running');

    // ─── CASE A: Local CLI Process (OpenCode, Claude Code, …) ───
    if (selectedAgent.type === 'cli') {
      await runCliAgent(text, currentMessages, selectedAgent);
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

  /** Titles a chat from its first user message once, right after it is sent. */
  const rememberChatTitle = (chatId: string, text: string) => {
    const chat = chatSessions.find((c) => c.id === chatId);
    if (!chat || chat.title !== 'New chat') return;
    renameChat(chatId, deriveChatTitle(text));
  };

  return (
    <div className="flex flex-col h-full bg-bgside border-l border-border text-text-primary select-none">
      {/* ─── VendraCode Top Header with chat, agent & model pills ─── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bgtitle shrink-0 gap-2">
        {/* Chat switcher (persistent conversations) */}
        <div className="relative">
          <button
            type="button"
            className="agentpill font-medium max-w-[190px]"
            onClick={() => { setIsChatListOpen(!isChatListOpen); setIsAgentDropdownOpen(false); setIsProviderDropdownOpen(false); }}
            title={activeChat ? `Chat: ${activeChat.title} · ${activeChat.messages.length} message(s)` : 'No chat yet'}
          >
            <MessageSquare className="w-3 h-3 text-accent shrink-0" />
            <span className="font-semibold text-text-primary text-[11px] truncate">{activeChat?.title || 'New chat'}</span>
            <span className="text-[9px] font-mono text-text-muted shrink-0">{chatSessions.length}</span>
            <ChevronDown className="w-3 h-3 text-text-muted shrink-0" />
          </button>

          {isChatListOpen && (
            <div className="absolute left-0 mt-1.5 w-72 bg-surface border border-border-light rounded-xl shadow-2xl z-50 p-1.5">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">Chats</span>
                <button
                  type="button"
                  onClick={() => { const id = createChat(selectedAgent.id); rememberChatTitle(id, ''); setIsChatListOpen(false); }}
                  className="btn btn-ghost h-6 px-2 text-[11px] gap-1"
                  title="Start a new chat (the agent keeps its own CLI context per chat)"
                >
                  <Plus className="w-3 h-3" />
                  New
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-0.5 mt-1">
                {chatSessions.length === 0 && (
                  <div className="px-2 py-3 text-[11px] text-text-muted">No chats yet.</div>
                )}
                {chatSessions.map((chat) => (
                  <div
                    key={chat.id}
                    className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                      chat.id === activeChat?.id ? 'bg-chip text-text-primary' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }`}
                    onClick={() => { setActiveChat(chat.id); setIsChatListOpen(false); }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium truncate">{chat.title}</div>
                      <div className="text-[9px] text-text-muted font-mono truncate">
                        {chat.messages.length} msg · {new Date(chat.updatedAt).toLocaleString()}
                        {chat.opencodeSessionId ? ' · ctx' : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                      className="opacity-0 group-hover:opacity-100 text-danger shrink-0"
                      title="Delete this chat"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

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
                      {agent.type === 'cli' && (
                        <span className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                          localCLIs.find((c) => c.id === agent.id)?.isInstalled
                            ? 'bg-ok/15 text-ok'
                            : 'bg-danger/15 text-danger'
                        }`}>
                          {localCLIs.find((c) => c.id === agent.id)?.isInstalled ? 'installed' : 'not found'}
                        </span>
                      )}
                      {agent.type === 'native' && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-bgdeep text-text-muted font-mono">{agent.badge}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-text-muted mt-0.5 line-clamp-1">{agent.description}</p>
                    {agent.type === 'cli' && localCLIs.find((c) => c.id === agent.id)?.isInstalled && (
                      <p className="text-[9px] text-text-hint font-mono mt-0.5 truncate" title={localCLIs.find((c) => c.id === agent.id)?.path || ''}>
                        {localCLIs.find((c) => c.id === agent.id)?.path}
                      </p>
                    )}
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
            <div className="absolute right-0 mt-1.5 w-72 bg-surface border border-border-light rounded-xl shadow-2xl z-50 p-1.5 max-h-64 overflow-y-auto">
              <div className="text-[10px] text-text-muted px-2 py-1 font-semibold uppercase tracking-wider flex justify-between items-center">
                <span>Live Discovered Models ({scannedModels.length})</span>
                <button type="button" onClick={() => setIsModelPickerOpen(false)} className="text-text-muted hover:text-text-primary text-xs">✕</button>
              </div>
              <div className="space-y-0.5 mt-1">
                {scannedModels.map((m) => {
                  let host = '';
                  try { host = m.baseUrl ? new URL(m.baseUrl).host : ''; } catch {}
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelectModel(m)}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between ${
                        activeProvider?.model === m.id
                          ? 'bg-chip text-text-primary font-bold'
                          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                      }`}
                      title={m.cliModel
                        ? `Use ${m.id} through the OpenCode CLI (credentials stay inside the CLI)`
                        : m.apiKey
                          ? `Import → ${prettyProviderName(m)} (${host || 'active provider'}) · key ready`
                          : `Import → ${prettyProviderName(m)} · ${m.keyHint || 'API key required for this endpoint'}`}
                    >
                      <div className="min-w-0 flex-1 pr-1">
                        <div className="font-mono text-[11px] truncate">{m.name || m.id}</div>
                        <div className="text-[9px] text-text-muted truncate flex items-center gap-1">
                          <span>{m.source}</span>
                          {host && <span className="opacity-70">· {host}</span>}
                          {m.cliModel && <span className="text-ok">· via CLI</span>}
                          {!m.cliModel && m.requiresKey && !m.apiKey && <span className="text-warning">· key needed</span>}
                          {!m.cliModel && m.apiKey && <span className="text-ok">· key ready</span>}
                        </div>
                      </div>
                      {activeProvider?.model === m.id && <Check size={12} className="text-ok shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <p className="text-[9px] text-text-muted px-2 py-1.5 border-t border-border mt-1 leading-snug">
                Picking a model switches the active provider to its own endpoint &amp; key (from
                opencode.json), so requests go to the right API. Models marked <em>via CLI</em>
                (OpenCode Zen and friends) have no endpoint — prompts run through
                `opencode run --model …` instead.
              </p>
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

            // Notes the app itself wants to surface (why a model runs through
            // an agent CLI, what a picked provider does, …). Rendered as a
            // quiet centered line so they read as narration, not as chat.
            if (msg.role === 'system' && msg.content) {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-center"
                >
                  <div className="text-[10px] leading-relaxed text-text-muted bg-surface/70 border border-border-light px-2.5 py-1 rounded-lg max-w-[92%] whitespace-pre-wrap text-center select-text">
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

        {/* Approval gate */}
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
            {runningAgent ? (
              <button
                type="button"
                onClick={stopCliAgent}
                className="btn btn-ghost h-7 w-7 p-0 rounded-lg text-danger hover:bg-danger/15"
                title={`Stop ${runningAgent.bin} (running for ${Math.max(0, Math.round((Date.now() - runningAgent.startedAt) / 1000))}s)`}
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : agentStatus === 'running' ? (
              <button
                type="button"
                disabled
                className="btn btn-ghost h-7 w-7 p-0 rounded-lg text-text-muted"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
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
