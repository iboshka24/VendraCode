import type { ParsedCliChunk } from './opencodeStream';

/** One parser per process; stdout chunks can split anywhere in a JSON event. */
export function createCodexParser() {
  let pending = '';
  return (chunk: string): ParsedCliChunk[] => {
    pending += chunk;
    const lines = pending.split('\n');
    pending = lines.pop() || '';
    const result: ParsedCliChunk[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      let event: any;
      try { event = JSON.parse(line); }
      catch { result.push({ text: line + '\n' }); continue; }
      if (event.type === 'thread.started') result.push({ sessionId: event.thread_id });
      if (event.type === 'error' || event.type === 'turn.failed') {
        result.push({ error: event.message || event.error?.message || 'Codex run failed' });
      }
      const item = event.item;
      if (!item) continue;
      if (event.type === 'item.completed' && item.type === 'agent_message') {
        result.push({ text: item.text + '\n' });
      } else if (['item.started', 'item.updated', 'item.completed'].includes(event.type) &&
        ['command_execution', 'file_change', 'mcp_tool_call', 'web_search'].includes(item.type)) {
        result.push({ tool: {
          id: item.id,
          name: item.command || item.tool || item.type,
          status: item.status || (event.type === 'item.completed' ? 'completed' : 'running'),
        } });
      }
    }
    return result;
  };
}

export function codexRunArgs(options: { sessionId?: string; effort?: string; model?: string } = {}): string[] {
  const args = ['exec'];
  if (options.sessionId) args.push('resume', options.sessionId);
  args.push('--json');
  if (options.model) args.push('--model', options.model);
  // Resume inherits the sandbox policy saved with the thread.
  if (!options.sessionId) args.push('--sandbox', 'workspace-write');
  if (options.effort && options.effort !== 'default') {
    args.push('-c', `model_reasoning_effort=${JSON.stringify(options.effort)}`);
  }
  return args;
}
