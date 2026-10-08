import type {
  BrainConnectionStatus,
  BrainEvent,
  RemoteDiff,
  RemoteDiffChange,
} from '@/types';

/**
 * Cloudflare Brain Client — real WSS transport to brain.vendra.uz/ws.
 *
 * Owns the single WebSocket connection used by the renderer for multiplayer
 * features:
 *   • live Monaco `onDidChangeModelContent` diff broadcast (`diff:broadcast`)
 *   • advisory file locks (`lock:acquire` / `lock:release`)
 *   • linked GitHub repository advertisement (`repo:set`)
 *   • peer presence (`peers`, `repo`, `locks`, `diff` events)
 *
 * It is transport-only: it never touches UI or the Zustand store, so it can be
 * unit-tested and reused outside React. Connections auto-retry with capped
 * exponential backoff so the IDE keeps working offline.
 */

const BRAIN_WS_URL = 'wss://brain.vendra.uz/ws';
const DEFAULT_SESSION = 'default-session';
/** Fallback colors matching the agent-lane palette used across the app. */
const PEER_COLORS = ['#7c3aed', '#38d9a9', '#4dabf7', '#f06595', '#ffa94d', '#b197fc'];

/** Outgoing payloads are capped so a big paste can't flood the edge network. */
const MAX_TEXT_CHARS = 400;

/**
 * Overrides the brain endpoint, e.g. to run against a self-hosted
 * `server/brain-server.js` (`ws://localhost:4000`) during development.
 */
let brainUrl = BRAIN_WS_URL;
export function setBrainURL(url: string): void {
  brainUrl = url || BRAIN_WS_URL;
}
export function getBrainURL(): string {
  return brainUrl;
}

export interface BrainSessionInfo {
  sessionId: string;
  repoUrl: string;
}

export interface BrainIdentity {
  peerId: string;
  peerName: string;
  color: string;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Deterministic color per peer so teammates keep a stable identity color. */
export function peerColor(seed: string): string {
  return PEER_COLORS[hashString(seed) % PEER_COLORS.length];
}

export class BrainClient {
  private ws: WebSocket | null = null;
  private status: BrainConnectionStatus = 'idle';
  private listeners = new Set<(event: BrainEvent) => void>();
  private peers: string[] = [];
  private repoUrl = '';
  private sessionId = DEFAULT_SESSION;
  private heldLocks = new Set<string>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private identity: BrainIdentity = {
    peerId: `peer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    peerName: 'You',
    color: '#7c3aed',
  };

  /** Human identity shown to teammates next to cursors/diffs. */
  setIdentity(peerName: string): void {
    this.identity = {
      peerId: this.identity.peerId,
      peerName: peerName || 'You',
      color: peerColor(peerName || this.identity.peerId),
    };
    // Re-announce to the session with the resolved display name.
    if (this.status === 'online') {
      this.send({ type: 'presence:set', peerName: this.identity.peerName });
    }
  }

  getIdentity(): BrainIdentity {
    return this.identity;
  }

  /** Switches the active session/repo; reconnects only when something changed. */
  setSession({ sessionId, repoUrl }: Partial<BrainSessionInfo>): void {
    const nextSession = sessionId || DEFAULT_SESSION;
    const nextRepo = repoUrl || '';
    const changed = nextSession !== this.sessionId || nextRepo !== this.repoUrl;
    this.sessionId = nextSession;
    this.repoUrl = nextRepo;
    if (changed) this.connect(true);
  }

  getSession(): BrainSessionInfo {
    return { sessionId: this.sessionId, repoUrl: this.repoUrl };
  }

  getStatus(): BrainConnectionStatus {
    return this.status;
  }

  getPeers(): string[] {
    return this.peers;
  }

  /** Subscribe to normalized brain events. Returns an unsubscribe function. */
  subscribe(listener: (event: BrainEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  connect(force = false): void {
    if (this.disposed) return;
    if (!force && (this.status === 'online' || this.status === 'connecting')) return;

    this.clearReconnectTimer();
    this.closeSocket();
    this.setStatus('connecting');

    const params = new URLSearchParams({
      session: this.sessionId,
      name: this.identity.peerName,
      peer: this.identity.peerId,
    });
    if (this.repoUrl) params.set('repo', this.repoUrl);

    let socket: WebSocket;
    try {
      socket = new WebSocket(`${brainUrl}?${params.toString()}`);
    } catch (err) {
      console.warn('[Brain] WebSocket construction failed:', err);
      this.setStatus('offline');
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.addEventListener('open', () => {
      if (this.ws !== socket) return;
      this.reconnectAttempts = 0;
      this.setStatus('online');
      // Re-arm advisory locks held before a reconnect.
      for (const filePath of this.heldLocks) {
        this.send({ type: 'lock:acquire', filePath, agentId: this.identity.peerId, agentName: this.identity.peerName });
      }
      if (this.repoUrl) this.send({ type: 'repo:set', repoUrl: this.repoUrl });
    });

    socket.addEventListener('message', (event) => this.handleMessage(event.data));

    socket.addEventListener('close', () => {
      if (this.ws !== socket) return;
      this.ws = null;
      if (this.disposed) return;
      this.setStatus('offline');
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // The close handler performs the actual retry scheduling.
      if (this.ws === socket && this.status !== 'offline') this.setStatus('reconnecting');
    });
  }

  disconnect(): void {
    this.clearReconnectTimer();
    this.closeSocket();
    this.reconnectAttempts = 0;
    this.peers = [];
    this.setStatus('idle');
  }

  /** Broadcasts Monaco content changes to every peer in the session. */
  sendDiff(filePath: string, changes: RemoteDiffChange[]): void {
    const normalized = changes
      .filter((change) => change && (change.text.length > 0 || change.rangeLength > 0))
      .map((change) => ({
        range: change.range,
        text: change.text.length > MAX_TEXT_CHARS ? `${change.text.slice(0, MAX_TEXT_CHARS)}…` : change.text,
        rangeLength: change.rangeLength,
      }));
    if (normalized.length === 0) return;

    this.send({
      type: 'diff:broadcast',
      agentId: this.identity.peerId,
      agentName: this.identity.peerName,
      color: this.identity.color,
      filePath,
      changes: normalized,
      timestamp: Date.now(),
    });
  }

  /** Word-level typing stream kept for backward compatibility with older peers. */
  sendTyping(filePath: string, lineNum: number, text: string): void {
    this.send({
      type: 'typing:broadcast',
      agentId: this.identity.peerId,
      filePath,
      lineNum,
      text: text.slice(0, 120),
      agentName: this.identity.peerName,
      color: this.identity.color,
    });
  }

  /** Acquires an advisory lock so teammates see the file as "in use". */
  acquireLock(filePath: string): void {
    this.heldLocks.add(filePath);
    this.send({
      type: 'lock:acquire',
      filePath,
      agentId: this.identity.peerId,
      agentName: this.identity.peerName,
    });
  }

  releaseLock(filePath: string): void {
    this.heldLocks.delete(filePath);
    this.send({ type: 'lock:release', filePath, agentId: this.identity.peerId });
  }

  /** Raw JSON send (no-op when the socket is not open). */
  send(payload: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (err) {
        console.warn('[Brain] send failed:', err);
      }
    }
  }

  // ─── Internals ────────────────────────────────────────────────────

  private handleMessage(raw: unknown): void {
    let data: any;
    try {
      data = JSON.parse(String(raw));
    } catch {
      return; // Ignore malformed frames
    }
    if (!data || typeof data !== 'object') return;

    switch (data.type) {
      case 'session:init': {
        if (typeof data.repoUrl === 'string' && data.repoUrl && data.repoUrl !== this.repoUrl) {
          this.repoUrl = data.repoUrl;
          this.emit({ type: 'repo', repoUrl: this.repoUrl });
        }
        this.setPeers(Array.isArray(data.peers) ? data.peers.filter((p: unknown) => typeof p === 'string') : []);
        if (data.locks && typeof data.locks === 'object') {
          this.emit({ type: 'locks', locks: this.normalizeLocks(data.locks) });
        }
        break;
      }

      case 'peer:joined': {
        if (typeof data.peerName === 'string' && !this.peers.includes(data.peerName)) {
          this.setPeers([...this.peers, data.peerName]);
        }
        break;
      }

      case 'peer:left': {
        if (typeof data.peerName === 'string') {
          const index = this.peers.indexOf(data.peerName);
          if (index >= 0) {
            const next = [...this.peers];
            next.splice(index, 1);
            this.setPeers(next);
          }
        }
        break;
      }

      case 'peers:list': {
        if (Array.isArray(data.peers)) {
          this.setPeers(data.peers.filter((p: unknown) => typeof p === 'string'));
        }
        break;
      }

      case 'repo:updated': {
        if (typeof data.repoUrl === 'string') {
          this.repoUrl = data.repoUrl;
          this.emit({ type: 'repo', repoUrl: this.repoUrl });
        }
        break;
      }

      case 'locks:updated': {
        if (data.locks && typeof data.locks === 'object') {
          this.emit({ type: 'locks', locks: this.normalizeLocks(data.locks) });
        }
        break;
      }

      case 'typing:stream': {
        // Legacy word-level stream: synthesize a diff so the editor UI is uniform.
        const diff = this.toDiff(data);
        if (diff) this.emit({ type: 'diff', diff });
        break;
      }

      case 'diff:stream': {
        const diff = this.toDiff(data);
        if (diff) this.emit({ type: 'diff', diff });
        break;
      }

      default:
        break;
    }
  }

  private toDiff(data: any): RemoteDiff | null {
    if (typeof data.filePath !== 'string' || !data.filePath) return null;

    let changes: RemoteDiffChange[] = [];
    if (Array.isArray(data.changes)) {
      changes = data.changes
        .filter((c: any) => c && c.range && c.range.startLineNumber)
        .map((c: any) => ({
          range: {
            startLineNumber: Number(c.range.startLineNumber) || 1,
            startColumn: Number(c.range.startColumn) || 1,
            endLineNumber: Number(c.range.endLineNumber) || Number(c.range.startLineNumber) || 1,
            endColumn: Number(c.range.endColumn) || 1,
          },
          text: typeof c.text === 'string' ? c.text : '',
          rangeLength: Number(c.rangeLength) || 0,
        }));
    } else if (typeof data.lineNum === 'number' || typeof data.lineNum === 'string') {
      const line = Math.max(1, Number(data.lineNum) || 1);
      changes = [{
        range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
        text: typeof data.text === 'string' ? data.text : '',
        rangeLength: 0,
      }];
    }

    if (changes.length === 0) return null;

    return {
      agentId: typeof data.agentId === 'string' && data.agentId ? data.agentId : `remote-${data.agentName || 'peer'}`,
      agentName: typeof data.agentName === 'string' && data.agentName ? data.agentName : 'Teammate',
      color: typeof data.color === 'string' && data.color ? data.color : peerColor(String(data.agentName || 'teammate')),
      filePath: data.filePath,
      changes,
      timestamp: Number(data.timestamp) || Date.now(),
    };
  }

  private normalizeLocks(raw: Record<string, unknown>): Record<string, any> {
    const locks: Record<string, any> = {};
    for (const [filePath, value] of Object.entries(raw)) {
      const lock = value as any;
      if (!lock) continue;
      locks[filePath] = {
        agentId: String(lock.agentId ?? lock.agentName ?? 'peer'),
        agentName: String(lock.agentName ?? lock.peerName ?? 'Teammate'),
        timestamp: Number(lock.timestamp) || Date.now(),
      };
    }
    return locks;
  }

  private setPeers(peers: string[]): void {
    this.peers = peers.filter((p) => p && p !== this.identity.peerName);
    this.emit({ type: 'peers', peers: this.peers });
  }

  private setStatus(status: BrainConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit({ type: 'status', status });
  }

  private emit(event: BrainEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[Brain] listener error:', err);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * 2 ** (this.reconnectAttempts - 1), 15000);
    this.setStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(true);
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private closeSocket(): void {
    const socket = this.ws;
    this.ws = null;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    try {
      socket.close();
    } catch {}
  }

  /** Called on app shutdown; stops all reconnection attempts. */
  dispose(): void {
    this.disposed = true;
    this.disconnect();
    this.listeners.clear();
  }
}

/** Process-wide singleton shared by the editor, status bar and mission control. */
export const brainClient = new BrainClient();
