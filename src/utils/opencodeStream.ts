import type { ChatSession } from '@/types';

/**
 * Parser for `opencode run --format json` output.
 *
 * OpenCode prints one JSON object per line (NDJSON), each carrying a
 * `sessionID` we can reuse with `--session <id>` to continue the conversation
 * with full context. Every chunk from stdout may contain several lines, or a
 * partial one, so this helper is tolerant of arbitrary boundaries and of
 * non-JSON noise (plain text is shown verbatim instead of being dropped).
 */
export interface ParsedCliChunk {
  /** Human-readable text to display (undefined for meta-only events). */
  text?: string;
  /** Session id to persist for context continuation. */
  sessionId?: string;
  /** Fatal error surfaced by the CLI. */
  error?: string;
  /**
   * A tool call/status update emitted by the CLI. Rendered as its own compact
   * message instead of being glued into the surrounding text.
   */
  tool?: { id?: string; name: string; status?: string; input?: Record<string, unknown> };
}

const EVENT_LABELS: Record<string, string> = {
  step_start: '',
  step_finish: '',
  'message.part.updated': '',
};

export function parseCliChunk(raw: string): ParsedCliChunk[] {
  if (!raw) return [];

  const results: ParsedCliChunk[] = [];
  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Plain (non-JSON) output: show it so nothing gets swallowed.
    if (!trimmed.startsWith('{')) {
      results.push({ text: trimmed });
      continue;
    }

    let event: any;
    try {
      event = JSON.parse(trimmed);
    } catch {
      results.push({ text: trimmed });
      continue;
    }
    if (!event || typeof event !== 'object') continue;

    const sessionId = typeof event.sessionID === 'string' ? event.sessionID : undefined;

    if (event.type === 'error') {
      const message = event.error?.message || event.error?.type || 'Unknown CLI error';
      results.push({ sessionId, error: message });
      continue;
    }

    const part = event.part;
    if (part && typeof part === 'object') {
      // Assistant text tokens are what the user actually wants to read.
      if (typeof part.text === 'string' && part.text.trim()) {
        results.push({ sessionId, text: part.text });
        continue;
      }
      if (part.type === 'tool' && typeof part.tool === 'string') {
        results.push({
          sessionId,
          tool: {
            id: typeof part.id === 'string' ? part.id : undefined,
            name: part.tool,
            status: typeof part.state?.status === 'string' ? part.state.status : undefined,
            // Tool arguments (file path, content, old/new strings, …) — needed
            // to mirror real file writes into the editor as they happen.
            input: part.state?.input && typeof part.state.input === 'object'
              ? (part.state.input as Record<string, unknown>)
              : undefined,
          },
        });
        continue;
      }
      continue;
    }

    if (typeof event.text === 'string' && event.text.trim()) {
      results.push({ sessionId, text: event.text });
      continue;
    }

    if (sessionId) results.push({ sessionId });
  }

  // Drop label-only entries that carry no information
  return results.filter((r) => r.text !== undefined || r.error !== undefined || r.sessionId !== undefined || r.tool !== undefined);
}

/** A real file mutation performed by an agent tool. */
export interface AgentWriteInfo {
  kind: 'write' | 'edit';
  /** Absolute or workspace-relative path the agent is writing. */
  path: string;
  /** Full file content for `write` tools. */
  content?: string;
  /** Replacement pair for `edit` tools. */
  oldString?: string;
  newString?: string;
}

const WRITE_TOOL_RE = /^(write|create|write_file|create_file|writefile)$/;
const EDIT_TOOL_RE = /^(edit|edit_file|multiedit|str_replace|replace|apply_patch|patch)$/;

/**
 * Extracts the file mutation a CLI tool call performs, if any.
 * Handles the shapes OpenCode (`write`/`edit`) and Claude Code
 * (`Write`/`Edit`, snake_case args) actually emit.
 */
export function extractAgentWrite(tool: { name?: string; input?: Record<string, unknown> }): AgentWriteInfo | null {
  if (!tool?.name || !tool.input) return null;
  const name = tool.name.toLowerCase();
  const input = tool.input;

  const path = [input.path, input.filePath, input.file_path, input.absolutePath]
    .find((v): v is string => typeof v === 'string' && v.length > 0);
  if (!path) return null;

  if (WRITE_TOOL_RE.test(name)) {
    const content = [input.content, input.file_text, input.text]
      .find((v): v is string => typeof v === 'string');
    if (typeof content !== 'string') return null;
    return { kind: 'write', path, content };
  }

  if (EDIT_TOOL_RE.test(name)) {
    const oldString = [input.oldString, input.old_string, input.old_text]
      .find((v): v is string => typeof v === 'string');
    const newString = [input.newString, input.new_string, input.new_text]
      .find((v): v is string => typeof v === 'string');
    if (typeof oldString !== 'string' || typeof newString !== 'string') return null;
    return { kind: 'edit', path, oldString, newString };
  }

  return null;
}

/** Builds the CLI arguments that continue an existing OpenCode session. */
export function opencodeRunArgs(options: {
  sessionId?: string;
  model?: string;
  autoApprove?: boolean;
}): string[] {
  const args = ['run', '--format', 'json'];
  if (options.autoApprove !== false) args.push('--auto');
  if (options.sessionId) args.push('-s', options.sessionId);
  // The override is already in the CLI's own `provider/model` form (see
  // opencodeModelOverride), so it can be passed straight through.
  if (options.model) args.push('--model', options.model);
  return args;
}

/**
 * Model id to hand to `opencode run --model`, or undefined to use the CLI's
 * configured default.
 */
export function opencodeModelOverride(provider?: { baseUrl?: string; model?: string; cliModel?: boolean }): string | undefined {
  if (!provider?.model) return undefined;

  // CLI-routed providers (OpenCode Zen free models, and every other provider
  // OpenCode is logged into): the id is already `provider/model` shaped and the
  // CLI owns the credentials, so pass it straight through.
  if (provider.cliModel) return provider.model;

  if (!provider.baseUrl) return undefined;
  // Only OpenRouter-hosted providers map cleanly onto opencode's own --model.
  if (!/openrouter\.ai/i.test(provider.baseUrl)) return undefined;
  return `openrouter/${provider.model}`;
}

export const CHAT_TITLE_MAX = 48;

/** Derives a chat title from the first user message. */
export function deriveChatTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New chat';
  return clean.length > CHAT_TITLE_MAX ? `${clean.slice(0, CHAT_TITLE_MAX)}…` : clean;
}

/** Extracts the messages of a chat as plain text (used for titles/debug). */
export function chatPreview(chat: ChatSession | undefined): string {
  if (!chat || chat.messages.length === 0) return 'No messages yet';
  const last = chat.messages[chat.messages.length - 1];
  return last.content.replace(/[`*#>\n]/g, ' ').slice(0, 120) || 'No messages yet';
}

export { EVENT_LABELS };
