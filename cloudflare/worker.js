const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Vendra-Token, Authorization', 'Cache-Control': 'no-store' };
const LOCK_TTL_MS = 5 * 60 * 1000;
const validSession = value => /^[a-zA-Z0-9_-]{8,128}$/.test(value || '');
const validToken = value => /^[a-zA-Z0-9_-]{32,128}$/.test(value || '');
const validPath = value => typeof value === 'string' && value.length > 0 && value.length < 1024 && !value.startsWith('/') && !value.includes('\\') && !value.includes(':') && !value.split('/').includes('..') && !value.includes('\0');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const repository = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'github.com' && !url.port && !url.username && !url.password && !url.search && !url.hash && /^\/[\w.-]+\/[\w.-]+(?:\.git)?$/.test(url.pathname); } catch { return false; }
};

export class SessionCoordinator {
  constructor(state, env) {
    this.state = state;
    this.repoUrl = '';
    this.locks = Object.create(null);
    this.tokenHash = '';
    this.ready = state.blockConcurrencyWhile(async () => {
      const saved = await state.storage.get(['repoUrl', 'locks', 'tokenHash']);
      this.repoUrl = saved.get('repoUrl') || '';
      this.locks = Object.assign(Object.create(null), saved.get('locks') || {});
      this.tokenHash = saved.get('tokenHash') || '';
    });
  }
  sockets() { return this.state.getWebSockets().filter(ws => this.attachment(ws).authorized); }
  attachment(ws) { try { return ws.deserializeAttachment() || {}; } catch { return {}; } }
  peers() { return this.sockets().map(ws => this.attachment(ws).name || 'Peer'); }
  publicLocks() {
    return Object.fromEntries(Object.entries(this.locks).filter(([,v]) => v.expiresAt > Date.now()).map(([file, lock]) => [file, { agentId: lock.agentId, agentName: lock.agentName, timestamp: lock.timestamp }]));
  }
  async persistLocks() {
    await this.state.storage.put('locks', this.locks);
    const times = Object.values(this.locks).map(lock => lock.expiresAt);
    if (times.length) await this.state.storage.setAlarm(Math.min(...times));
    else await this.state.storage.deleteAlarm();
  }
  async prune() {
    let changed = false;
    for (const [file, lock] of Object.entries(this.locks)) if (!lock.expiresAt || lock.expiresAt <= Date.now()) { delete this.locks[file]; changed = true; }
    if (changed) { await this.persistLocks(); this.broadcast({ type: 'locks:updated', locks: this.publicLocks() }); }
  }
  async alarm() { await this.ready; await this.prune(); }
  async authorize(token, create) {
    if (!validToken(token)) return false;
    const digest = await hash(token);
    return this.state.blockConcurrencyWhile(async () => {
      if (!this.tokenHash && create) { this.tokenHash = digest; await this.state.storage.put('tokenHash', digest); }
      return !!this.tokenHash && this.tokenHash === digest;
    });
  }
  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    const token = request.headers.get('X-Vendra-Token') || url.searchParams.get('token') || '';
    const create = url.pathname === '/ws' || (url.pathname === '/info' && request.method === 'POST');
    if (!await this.authorize(token, create)) return json({ error: 'Invalid invitation. Update VendraCode and ask the host for a new link.' }, 403);
    await this.prune();
    if (url.pathname === '/info') {
      if (request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (!repository(body.repoUrl)) return json({ error: 'A valid GitHub repository is required' }, 400);
        if (this.repoUrl && this.repoUrl.toLowerCase() !== body.repoUrl.toLowerCase()) return json({ error: 'This room is already linked to another repository. Create a new swarm.' }, 409);
        this.repoUrl = body.repoUrl;
        await this.state.storage.put('repoUrl', this.repoUrl);
        this.broadcast({ type: 'repo:updated', repoUrl: this.repoUrl });
      }
      return json({ repoUrl: this.repoUrl, peerCount: this.sockets().length, peers: this.peers(), locks: this.publicLocks() });
    }
    if (url.pathname !== '/ws') return json({ error: 'Not found' }, 404);
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return json({ error: 'WebSocket upgrade required' }, 426);
    const [client, ws] = Object.values(new WebSocketPair());
    const peerId = (url.searchParams.get('peer') || crypto.randomUUID()).slice(0, 128);
    const name = (url.searchParams.get('name') || 'Peer').slice(0, 80);
    const repo = url.searchParams.get('repo');
    if (repo && !this.repoUrl && repository(repo)) { this.repoUrl = repo; await this.state.storage.put('repoUrl', repo); }
    this.state.acceptWebSocket(ws);
    ws.serializeAttachment({ peerId, name, connectionId: crypto.randomUUID(), authorized: true });
    ws.send(JSON.stringify({ type: 'session:init', sessionId: url.searchParams.get('session'), repoUrl: this.repoUrl, peers: this.peers(), locks: this.publicLocks() }));
    this.broadcast({ type: 'peer:joined', peerName: name, peersCount: this.sockets().length }, ws);
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, message) {
    await this.ready;
    const owner = this.attachment(ws);
    if (!owner.authorized) { ws.close(4401, 'Update VendraCode and use a new invitation'); return; }
    if (typeof message !== 'string' || message.length > 256 * 1024) { ws.close(1009, 'Message too large'); return; }
    let data; try { data = JSON.parse(message); } catch { return; }
    if (!data || typeof data !== 'object') return;
    await this.prune();
    const who = { agentId: String(data.agentId || owner.peerId).slice(0, 128), agentName: String(data.agentName || owner.name).slice(0, 80), color: /^#[0-9a-fA-F]{6}$/.test(data.color || '') ? data.color : '#38d9a9' };
    switch (data.type) {
      case 'presence:set':
        if (typeof data.peerName === 'string' && data.peerName.trim()) { ws.serializeAttachment({ ...owner, name: data.peerName.slice(0, 80) }); this.broadcast({ type: 'peers:list', peers: this.peers() }); }
        break;
      case 'repo:set':
        if (repository(data.repoUrl) && (!this.repoUrl || this.repoUrl.toLowerCase() === data.repoUrl.toLowerCase())) {
          this.repoUrl = data.repoUrl; await this.state.storage.put('repoUrl', this.repoUrl); this.broadcast({ type: 'repo:updated', repoUrl: this.repoUrl });
        }
        break;
      case 'diff:broadcast':
        if (validPath(data.filePath) && Array.isArray(data.changes)) this.broadcast({ type: 'diff:stream', ...who, filePath: data.filePath, changes: data.changes.slice(0, 64), timestamp: Date.now() }, ws);
        break;
      case 'typing:broadcast':
        if (validPath(data.filePath)) this.broadcast({ type: 'typing:stream', ...who, filePath: data.filePath, lineNum: data.lineNum, text: String(data.text || '').slice(0, 120) }, ws);
        break;
      case 'action:broadcast':
        if (data.action && typeof data.action.tool === 'string') this.broadcast({ type: 'action:stream', ...who, action: { tool: data.action.tool.slice(0, 500), status: String(data.action.status || '').slice(0, 80), file: validPath(data.action.file) ? data.action.file : undefined }, timestamp: Date.now() }, ws);
        break;
      case 'lock:acquire': {
        if (!validPath(data.filePath)) break;
        const current = this.locks[data.filePath];
        if (current && (current.connectionId !== owner.connectionId || current.agentId !== who.agentId)) {
          ws.send(JSON.stringify({ type: 'lock:conflict', filePath: data.filePath, lockedBy: this.publicLocks()[data.filePath] })); break;
        }
        this.locks[data.filePath] = { ...who, connectionId: owner.connectionId, timestamp: Date.now(), expiresAt: Date.now() + LOCK_TTL_MS };
        await this.persistLocks(); this.broadcast({ type: 'locks:updated', locks: this.publicLocks() }); break;
      }
      case 'lock:release': {
        if (!validPath(data.filePath)) break;
        const current = this.locks[data.filePath];
        if (current && current.connectionId === owner.connectionId && current.agentId === who.agentId) {
          delete this.locks[data.filePath]; await this.persistLocks(); this.broadcast({ type: 'locks:updated', locks: this.publicLocks() });
        }
        break;
      }
    }
  }
  async dropPeer(ws) {
    await this.ready;
    const owner = this.attachment(ws);
    ws.serializeAttachment({ ...owner, authorized: false });
    for (const [file, lock] of Object.entries(this.locks)) if (lock.connectionId === owner.connectionId) delete this.locks[file];
    await this.persistLocks();
    this.broadcast({ type: 'peer:left', peerName: owner.name, peersCount: this.sockets().length }, ws);
    this.broadcast({ type: 'locks:updated', locks: this.publicLocks() });
  }
  async webSocketClose(ws) { await this.dropPeer(ws); }
  async webSocketError(ws) { await this.dropPeer(ws); }
  broadcast(message, except = null) {
    const payload = JSON.stringify(message);
    for (const ws of this.sockets()) if (ws !== except) { try { ws.send(payload); } catch {} }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/' || url.pathname === '/health') return json({ status: 'ok', service: 'VendraCode Brain', version: '1.3.0', authenticatedInvites: true, lockOwnership: true, lockTtlMs: LOCK_TTL_MS });
    if (/^\/session\/[\w-]{8,128}$/.test(url.pathname)) return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Join VendraCode Swarm</title><h1>Join your friend in VendraCode</h1><p>Open VendraCode 1.3 or newer, click Share, then Join Friend’s Swarm. Paste the complete address of this page, including its repository and token.</p><p>Keep this invitation private: anyone with the full link can join this room.</p></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" } });
    if (url.pathname === '/ws' || url.pathname.startsWith('/api/session/')) {
      const sessionId = url.pathname === '/ws' ? url.searchParams.get('session') : url.pathname.slice('/api/session/'.length);
      if (!validSession(sessionId)) return json({ error: 'Invalid session ID' }, 400);
      const token = request.headers.get('X-Vendra-Token') || url.searchParams.get('token') || '';
      if (!validToken(token)) return json({ error: 'A valid invitation token is required' }, 401);
      const stub = env.SESSIONS.get(env.SESSIONS.idFromName(sessionId));
      if (url.pathname === '/ws') return stub.fetch(request);
      const target = new URL(request.url); target.pathname = '/info';
      return stub.fetch(new Request(target, request));
    }
    return json({ error: 'Not found' }, 404);
  },
};
