/**
 * VendraCode Multiplayer Brain — Cloudflare Worker
 * Subdomain: brain.vendra.uz
 *
 * Global multiplayer coordination for Amoeba-style multi-agent sessions:
 *   • WebSocket hub (`/ws`) backed by a Durable Object per session, using the
 *     WebSocket Hibernation API so idle sockets cost no CPU/duration.
 *   • Live Monaco diff broadcast (`diff:broadcast` → `diff:stream`).
 *   • Advisory file locks (`lock:acquire` / `lock:release`).
 *   • Peer presence (`presence:set`, `peer:joined`, `peer:left`, `peers:list`).
 *   • Shared GitHub repository link (`repo:set` / `repo:updated`).
 *
 * Why Durable Objects: Cloudflare Worker isolates do NOT share in-memory
 * state, so a plain `Map` of sessions only relays messages between peers that
 * happen to land on the same isolate. Routing every session to the same Durable
 * Object (by name) guarantees all peers of a session meet in one place.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Vendra-Token',
};

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...headers },
  });
}

// ─── Session Coordinator (one Durable Object per session) ───────────

export class SessionCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    /** Lazily loaded persisted room state (repo + locks survive hibernation). */
    this.loaded = null;
    this.repoUrl = '';
    this.locks = {};
  }

  async load() {
    if (!this.loaded) {
      this.loaded = this.state.storage.get(['repoUrl', 'locks']).then((data) => {
        this.repoUrl = data.repoUrl || '';
        this.locks = data.locks || {};
      });
    }
    return this.loaded;
  }

  /** Every socket currently attached to this session (survives hibernation). */
  sockets() {
    return this.state.getWebSockets();
  }

  attachment(socket) {
    try {
      return socket.deserializeAttachment() || {};
    } catch {
      return {};
    }
  }

  peerNames() {
    return this.sockets().map((socket) => this.attachment(socket).name || 'Peer');
  }

  async fetch(request) {
    await this.load();
    const url = new URL(request.url);

    // REST views of the room, used by the edge worker for /api/session/*
    if (url.pathname === '/info') {
      if (request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (body.repoUrl && body.repoUrl !== this.repoUrl) {
          this.repoUrl = body.repoUrl;
          await this.state.storage.put('repoUrl', this.repoUrl);
          this.broadcast({ type: 'repo:updated', repoUrl: this.repoUrl, updatedBy: 'edge-api' });
        }
        return json({
          success: true,
          sessionId: this.state.id.toString(),
          repoUrl: this.repoUrl,
        });
      }

      return json({
        id: this.state.id.toString(),
        repoUrl: this.repoUrl,
        peerCount: this.sockets().length,
        peers: this.peerNames(),
        locks: this.locks,
      });
    }

    if (url.pathname !== '/ws') return json({ error: 'Not found' }, 404);

    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return json({ error: 'Expected WebSocket upgrade' }, 426);
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    const peerId =
      url.searchParams.get('peer') || `peer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const peerName = url.searchParams.get('name') || 'Peer';
    const repoUrl = url.searchParams.get('repo') || '';
    const sessionId = url.searchParams.get('session') || 'default-session';
    if (repoUrl && !this.repoUrl) {
      this.repoUrl = repoUrl;
      await this.state.storage.put('repoUrl', this.repoUrl);
    }

    // Hibernation API: the socket is attached to the DO and survives eviction.
    // (tags must be a string[]; per-peer metadata goes on the attachment)
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ peerId, name: peerName });

    server.send(JSON.stringify({
      type: 'session:init',
      sessionId,
      repoUrl: this.repoUrl,
      peers: this.peerNames(),
      locks: this.locks,
    }));

    this.broadcast({ type: 'peer:joined', peerName, peersCount: this.sockets().length }, peerId);

    return new Response(null, { status: 101, webSocket: client, headers: CORS_HEADERS });
  }

  /** Hibernation message handler — called when a peer sends a frame. */
  async webSocketMessage(ws, message) {
    await this.load();

    let data;
    try {
      data = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      return; // Ignore malformed frames
    }
    if (!data || typeof data !== 'object') return;

    const { peerId, name: peerName } = this.attachment(ws);

    switch (data.type) {
      case 'repo:set': {
        if (data.repoUrl) {
          this.repoUrl = data.repoUrl;
          await this.state.storage.put('repoUrl', this.repoUrl);
          this.broadcast({ type: 'repo:updated', repoUrl: this.repoUrl, updatedBy: peerName });
        }
        break;
      }

      case 'presence:set': {
        if (typeof data.peerName === 'string' && data.peerName) {
          ws.serializeAttachment({ peerId, name: data.peerName });
          this.broadcast({ type: 'peers:list', peers: this.peerNames() });
        }
        break;
      }

      case 'diff:broadcast': {
        // Monaco `onDidChangeModelContent` payloads relayed verbatim so peers
        // can render live, line-accurate ghost edits.
        const changes = Array.isArray(data.changes) ? data.changes.slice(0, 64) : [];
        this.broadcast({
          type: 'diff:stream',
          agentId: data.agentId || peerId,
          agentName: data.agentName || peerName,
          color: data.color || '#38d9a9',
          filePath: data.filePath,
          changes,
          timestamp: data.timestamp || Date.now(),
        }, peerId);
        break;
      }

      case 'typing:broadcast': {
        // Legacy Amoeba word-level typing stream.
        this.broadcast({
          type: 'typing:stream',
          agentId: data.agentId || peerId,
          agentName: data.agentName || peerName,
          filePath: data.filePath,
          lineNum: data.lineNum,
          text: data.text,
          color: data.color || '#38d9a9',
        }, peerId);
        break;
      }

      case 'lock:acquire': {
        if (data.filePath) {
          this.locks[data.filePath] = {
            agentId: data.agentId || peerId,
            agentName: data.agentName || peerName,
            peerName,
            timestamp: Date.now(),
          };
          await this.state.storage.put('locks', this.locks);
          this.broadcast({ type: 'locks:updated', locks: this.locks });
        }
        break;
      }

      case 'lock:release': {
        if (data.filePath && this.locks[data.filePath]) {
          delete this.locks[data.filePath];
          await this.state.storage.put('locks', this.locks);
          this.broadcast({ type: 'locks:updated', locks: this.locks });
        }
        break;
      }

      default:
        break;
    }
  }

  async webSocketClose(ws) {
    await this.dropPeer(ws);
  }

  async webSocketError(ws) {
    await this.dropPeer(ws);
  }

  async dropPeer(ws) {
    await this.load();
    const { peerId, name: peerName } = this.attachment(ws);
    // Release every advisory lock held by the disconnecting peer.
    let changed = false;
    for (const [filePath, lock] of Object.entries(this.locks)) {
      if (lock.agentId === peerId || lock.peerName === peerName) {
        delete this.locks[filePath];
        changed = true;
      }
    }
    if (changed) await this.state.storage.put('locks', this.locks);

    this.broadcast({ type: 'peer:left', peerName, peersCount: Math.max(this.sockets().length - 1, 0) }, peerId);
    if (changed) this.broadcast({ type: 'locks:updated', locks: this.locks });
  }

  /** Sends to every attached socket except `excludePeerId`. */
  broadcast(message, excludePeerId = null) {
    const payload = JSON.stringify(message);
    for (const socket of this.sockets()) {
      if (this.attachment(socket).peerId === excludePeerId) continue;
      try {
        socket.send(payload);
      } catch {
        /* a dead socket is cleaned up by the hibernation close handler */
      }
    }
  }
}

// ─── Edge router ───────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Health check endpoint
    if (url.pathname === '/' || url.pathname === '/health') {
      return json({
        status: 'ok',
        service: 'VendraCode Brain Coordination Layer',
        subdomain: 'brain.vendra.uz',
        edge: 'Cloudflare Workers Edge Network',
        transport: 'Durable Objects + WebSocket Hibernation',
        timestamp: Date.now(),
      });
    }

    // WebSocket upgrade for real-time multiplayer coordination
    if (url.pathname === '/ws') {
      const sessionId = url.searchParams.get('session') || 'default-session';
      const id = env.SESSIONS.idFromName(sessionId);
      const stub = env.SESSIONS.get(id);
      // Forward the upgrade; all peers of a session land on the same object.
      return stub.fetch(request);
    }

    // REST: get or update session info (proxied to the session object)
    if (url.pathname.startsWith('/api/session/')) {
      const sessionId = url.pathname.replace('/api/session/', '').split('/')[0];
      if (!sessionId) return json({ error: 'Session id required' }, 400);

      const stub = env.SESSIONS.get(env.SESSIONS.idFromName(sessionId));
      const infoUrl = new URL(request.url);
      infoUrl.pathname = '/info';

      if (request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        return stub.fetch(infoUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoUrl: body.repoUrl || '' }),
        });
      }

      return stub.fetch(infoUrl);
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  },
};
