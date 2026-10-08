/**
 * VendraCode Shared Brain Coordination Server
 * Subdomain: brain.vendra.uz
 * 
 * Coordinates:
 * - Real-time advisory file locks across team agents (zero conflicts)
 * - Live agent event streams (Claude Code, Codex, OpenCode, Agy, Cline)
 * - Git worktree snapshot checkpoints (every 5 seconds)
 * - Multiplayer chat and approval requests
 */

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 4000;

// In-memory state (persisted to disk periodically)
const state = {
  sessions: [
    {
      id: 'session/lobby-join-race',
      name: 'Fix the lobby join race',
      repo: 'vendra-core',
      branch: 'session/lobby-join-race',
      agents: ['Alice (Claude Code)', 'Bob (Claude Code)'],
      files: ['src/auth/token.ts', 'src/net/session_store.ts'],
      updatedAt: Date.now(),
    },
    {
      id: 'session/tick-scheduler',
      name: 'Rewrite the tick scheduler',
      repo: 'vendra-core',
      branch: 'session/tick-scheduler',
      agents: ['Chen (Codex)'],
      files: ['src/cart/totals.ts', 'src/lobby/join.ts'],
      updatedAt: Date.now(),
    }
  ],
  locks: {},        // filePath -> { agentId, agentName, timestamp }
  actions: [],      // array of recent actions
  peers: new Set(), // active WebSocket clients
};

// HTTP Server for REST & Health checks
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/' || url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'VendraCode Shared Brain',
      subdomain: 'brain.vendra.uz',
      activePeers: state.peers.size,
      activeLocks: Object.keys(state.locks).length,
      uptime: process.uptime(),
    }));
    return;
  }

  if (url.pathname === '/v1/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sessions: state.sessions }));
    return;
  }

  if (url.pathname === '/v1/locks') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ locks: state.locks }));
    return;
  }

  if (url.pathname === '/v1/actions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ actions: state.actions.slice(-50) }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// WebSocket Server for Real-Time Sync
const wss = new WebSocketServer({ server });

function broadcast(msg, senderWs = null) {
  const data = JSON.stringify(msg);
  for (const client of state.peers) {
    if (client !== senderWs && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

wss.on('connection', (ws) => {
  state.peers.add(ws);
  console.log(`[Brain] Client connected. Total peers: ${state.peers.size}`);

  // Send initial state to newly joined peer
  ws.send(JSON.stringify({
    type: 'init',
    locks: state.locks,
    sessions: state.sessions,
    recentActions: state.actions.slice(-20),
  }));

  ws.on('message', (messageRaw) => {
    try {
      const msg = JSON.parse(messageRaw);

      switch (msg.type) {
        case 'lock:acquire': {
          const { filePath, agentId, agentName } = msg;
          const currentLock = state.locks[filePath];

          if (currentLock && currentLock.agentId !== agentId) {
            ws.send(JSON.stringify({
              type: 'lock:conflict',
              filePath,
              lockedBy: currentLock,
            }));
          } else {
            state.locks[filePath] = { agentId, agentName, timestamp: Date.now() };
            broadcast({ type: 'locks:updated', locks: state.locks });
          }
          break;
        }

        case 'lock:release': {
          const { filePath, agentId } = msg;
          if (state.locks[filePath] && state.locks[filePath].agentId === agentId) {
            delete state.locks[filePath];
            broadcast({ type: 'locks:updated', locks: state.locks });
          }
          break;
        }

        case 'action:report': {
          const action = {
            id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            ...msg.action,
            timestamp: Date.now(),
          };
          state.actions.unshift(action);
          if (state.actions.length > 200) state.actions.pop();
          broadcast({ type: 'action:recorded', action });
          break;
        }

        case 'snapshot:ping': {
          broadcast({
            type: 'snapshot:checkpoint',
            timestamp: Date.now(),
            branch: msg.branch || 'main',
          });
          break;
        }

        case 'agent:stream': {
          // Relay live agent typing / cursor position
          broadcast({
            type: 'agent:stream',
            agentName: msg.agentName,
            color: msg.color,
            file: msg.file,
            line: msg.line,
            word: msg.word,
          }, ws);
          break;
        }
      }
    } catch (err) {
      console.error('[Brain] Error processing message:', err);
    }
  });

  ws.on('close', () => {
    state.peers.delete(ws);
    console.log(`[Brain] Client disconnected. Total peers: ${state.peers.size}`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🧠 VendraCode Shared Brain Server running on port ${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://0.0.0.0:${PORT}`);
  console.log(`🌐 Subdomain target:  brain.vendra.uz`);
  console.log(`======================================================\n`);
});
