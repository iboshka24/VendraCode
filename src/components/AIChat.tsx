import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Wrench, X, Settings, ChevronDown, Sparkles, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/stores/appStore';
import { ChatMessage, ToolCall, ProviderConfig, ApprovalRequest } from '@/types/index';
import { AGENT_TOOLS } from '@/utils/providers';

export const AIChat: React.FC = () => {
  const { 
    activeProvider,
    setActiveProvider, 
    settings, 
    workspacePath, 
    setAgentStatus, 
    agentStatus 
  } = useAppStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  
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
            agentId: 'user-lane',
            agentName: 'System',
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
        await api.brain.acquireLock({ filePath: args.path, agentId: 'vendra-ai', agentName: 'Vendra AI' });
      }

      let res: any;
      switch (name) {
        case 'create_file':
        case 'edit_file':
          await api.fs.writeFile(args.path, args.content);
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
        default:
          return { error: `Unknown tool: ${name}` };
      }

      // Brain coordination: report completed action and release lock
      if (api.brain) {
        await api.brain.reportAction({
          agentId: 'vendra-ai',
          agentName: 'Vendra AI',
          action: name,
          targetFile: args.path || args.command,
          summary: name === 'run_command' ? `Ran ${args.command}` : `Modified ${args.path}`,
        });
        if (args.path) {
          await api.brain.releaseLock({ filePath: args.path, agentId: 'vendra-ai' });
        }
      }

      return res;
    } catch (error: any) {
      return { error: error.message || 'Tool execution failed' };
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || !activeProvider) return;

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

    try {
      const systemMessage: ChatMessage = {
        id: 'system',
        role: 'system',
        timestamp: Date.now(),
        content: `You are VendraCode AI, an expert coding assistant built into the VendraCode IDE. You can create, edit, and delete files, run terminal commands, and search the codebase. Always explain what you're about to do before using tools. Be concise and helpful. The workspace directory is: ${workspacePath}`
      };

      let keepRunning = true;

      while (keepRunning) {
        const apiMessages = [systemMessage, ...currentMessages].map(m => {
          return {
            role: m.role,
            content: m.content || '',
            ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
            ...(m.toolName ? { name: m.toolName } : {}),
            ...(m.toolCalls ? { tool_calls: m.toolCalls } : {})
          };
        });

        const response = await fetch(`${activeProvider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeProvider.apiKey}`
          },
          body: JSON.stringify({
            model: activeProvider.model,
            messages: apiMessages,
            tools: AGENT_TOOLS,
            tool_choice: 'auto'
          })
        });

        if (!response.ok) {
          throw new Error(`API Error: ${response.statusText}`);
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

        currentMessages = [...currentMessages, aiMessage];
        setMessages(currentMessages);

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
            
            currentMessages = [...currentMessages, toolResultMessage];
            setMessages(currentMessages);
          }
        } else {
          keepRunning = false;
        }
      }
    } catch (error: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}`,
        id: Date.now().toString(),
        timestamp: Date.now()
      }]);
    } finally {
      setAgentStatus?.('idle');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background border-l border-border text-text-primary">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-surface">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm">AI ASSISTANT</span>
        </div>
        
        {/* Provider Selector */}
        <div className="relative">
          <button 
            className="flex items-center space-x-1 text-xs px-2 py-1 bg-surface-hover rounded border border-border hover:bg-border transition-colors"
            onClick={() => setIsProviderDropdownOpen(!isProviderDropdownOpen)}
          >
            <span>{activeProvider?.name || 'Select Provider'}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          
          {isProviderDropdownOpen && providers && (
            <div className="absolute right-0 mt-1 w-48 bg-surface border border-border rounded shadow-lg z-10">
              {providers.map(p => (
                <button
                  key={p.id}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-surface-hover ${p.id === activeProvider?.id ? 'text-primary' : 'text-text-primary'}`}
                  onClick={() => {
                    setActiveProvider?.(p);
                    setIsProviderDropdownOpen(false);
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <motion.div 
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-end"
                >
                  <div className="bg-primary/10 border border-primary/20 text-text-primary px-4 py-2 rounded-lg max-w-[85%] text-sm whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </motion.div>
              );
            }
            
            if (msg.role === 'assistant' && msg.content) {
              return (
                <motion.div 
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start space-x-2"
                >
                  <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center flex-shrink-0 border border-border">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="bg-surface border border-border text-text-primary px-4 py-2 rounded-lg max-w-[85%] text-sm whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </motion.div>
              );
            }

            if (msg.role === 'tool') {
              let parsedContent: any = {};
              try { parsedContent = JSON.parse(msg.content); } catch (e) {}
              
              return (
                <motion.div 
                  key={msg.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex justify-start ml-10"
                >
                  <div className="flex items-center space-x-2 text-xs text-text-muted bg-surface/50 border border-border/50 px-2 py-1 rounded">
                    <Wrench className="w-3 h-3" />
                    <span className="font-mono">
                      {msg.toolName} {parsedContent?.error ? '- Failed' : '- Success'}
                    </span>
                  </div>
                </motion.div>
              );
            }
            
            return null;
          })}
        </AnimatePresence>

        {/* Approval Card */}
        {pendingApproval && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex justify-start ml-10"
          >
            <div className="bg-surface border border-border rounded-lg p-3 max-w-[85%] text-sm shadow-sm space-y-3">
              <div className="font-semibold text-text-primary flex items-center space-x-2">
                <Settings className="w-4 h-4" />
                <span>Approval Required: {pendingApproval.request.action}</span>
              </div>
              <div className="font-mono text-xs bg-background p-2 rounded text-text-secondary break-all">
                {JSON.stringify(JSON.parse(pendingApproval.request.details), null, 2)}
              </div>
              <div className="flex space-x-2 justify-end">
                <button 
                  onClick={() => pendingApproval.resolve(false)}
                  className="px-3 py-1.5 text-xs text-danger bg-danger/10 hover:bg-danger/20 rounded transition-colors"
                >
                  Deny
                </button>
                <button 
                  onClick={() => pendingApproval.resolve(true)}
                  className="px-3 py-1.5 text-xs text-success bg-success/10 hover:bg-success/20 rounded transition-colors font-medium"
                >
                  Approve
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Loading Indicator */}
        {agentStatus === 'running' && !pendingApproval && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start space-x-2"
          >
            <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center flex-shrink-0 border border-border">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="bg-surface border border-border px-4 py-3 rounded-lg flex items-center space-x-1">
              <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse" />
              <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse delay-75" />
              <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse delay-150" />
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-border bg-surface">
        <div className="relative flex items-end bg-background border border-border rounded-lg focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI anything... (Ctrl+Enter to send)"
            className="w-full max-h-32 min-h-[40px] bg-transparent text-text-primary text-sm p-3 resize-none outline-none focus:outline-none scrollbar-thin"
            rows={Math.min(6, inputValue.split('\n').length)}
          />
          <div className="p-2 flex-shrink-0">
            {agentStatus === 'running' ? (
              <button
                disabled
                className="p-1.5 rounded-md text-text-muted hover:bg-surface-hover"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                onClick={() => sendMessage(inputValue)}
                disabled={!inputValue.trim()}
                className="p-1.5 rounded-md text-primary hover:bg-primary/10 disabled:text-text-muted disabled:hover:bg-transparent transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
