/**
 * VendraCode Multiplayer Brain — Cloudflare Worker
 * Subdomain: brain.vendra.uz
 * 
 * Provides global low-latency WebSocket and REST coordination for Amoeba-style
 * multi-agent sessions, shared GitHub repository synchronization, and real-time
 * file locks / live typing broadcasts across teammates.
 */

// Global active sessions registry
const sessions = new Map(); // sessionId -> { repoUrl, branch, peers: Map, locks: Map }

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS Headers for IDE and web app access
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Vendra-Token',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check endpoint
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'VendraCode Brain Coordination Layer',
        subdomain: 'brain.vendra.uz',
        edge: 'Cloudflare Workers Edge Network',
        activeSessions: sessions.size,
        timestamp: Date.now()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // WebSocket upgrade for real-time multiplayer coordination
    if (url.pathname === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }

      const sessionId = url.searchParams.get('session') || 'default-session';
      const peerName = url.searchParams.get('name') || 'Peer';
      const repoUrl = url.searchParams.get('repo') || '';

      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      server.accept();

      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
          id: sessionId,
          repoUrl,
          peers: new Map(),
          locks: new Map(),
          createdAt: Date.now(),
        });
      }

      const session = sessions.get(sessionId);
      if (repoUrl && !session.repoUrl) {
        session.repoUrl = repoUrl;
      }

      const peerId = `peer-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      session.peers.set(peerId, { socket: server, name: peerName });

      // Notify peer of session state including linked GitHub repo
      server.send(JSON.stringify({
        type: 'session:init',
        sessionId,
        repoUrl: session.repoUrl,
        peers: Array.from(session.peers.values()).map(p => p.name),
        locks: Object.fromEntries(session.locks),
      }));

      // Broadcast new peer arrival
      broadcastToSession(session, {
        type: 'peer:joined',
        peerName,
        peersCount: session.peers.size
      }, peerId);

      server.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'repo:set') {
            session.repoUrl = data.repoUrl;
            broadcastToSession(session, {
              type: 'repo:updated',
              repoUrl: data.repoUrl,
              updatedBy: peerName,
            });
          }

          if (data.type === 'presence:set') {
            // Allow a peer to announce/rename its display name after connecting
            const peer = session.peers.get(peerId);
            if (peer && typeof data.peerName === 'string' && data.peerName) {
              peer.name = data.peerName;
              broadcastToSession(session, {
                type: 'peers:list',
                peers: Array.from(session.peers.values()).map((p) => p.name),
              });
            }
          }

          if (data.type === 'typing:broadcast') {
            // Live code typing broadcast (Amoeba live stepping)
            broadcastToSession(session, {
              type: 'typing:stream',
              agentId: data.agentId || peerId,
              agentName: data.agentName || peerName,
              filePath: data.filePath,
              lineNum: data.lineNum,
              text: data.text,
              color: data.color || '#38d9a9',
            }, peerId);
          }

          if (data.type === 'diff:broadcast') {
            // Monaco `onDidChangeModelContent` payloads relayed verbatim so
            // peers can render live, line-accurate ghost edits.
            const changes = Array.isArray(data.changes) ? data.changes.slice(0, 64) : [];
            broadcastToSession(session, {
              type: 'diff:stream',
              agentId: data.agentId || peerId,
              agentName: data.agentName || peerName,
              color: data.color || '#38d9a9',
              filePath: data.filePath,
              changes,
              timestamp: data.timestamp || Date.now(),
            }, peerId);
          }

          if (data.type === 'lock:acquire') {
            session.locks.set(data.filePath, {
              peerName,
              agentName: data.agentName,
              timestamp: Date.now(),
            });
            broadcastToSession(session, {
              type: 'locks:updated',
              locks: Object.fromEntries(session.locks),
            });
          }

          if (data.type === 'lock:release') {
            session.locks.delete(data.filePath);
            broadcastToSession(session, {
              type: 'locks:updated',
              locks: Object.fromEntries(session.locks),
            });
          }
        } catch (e) {
          console.error('WS message parse error:', e);
        }
      });

      server.addEventListener('close', () => {
        session.peers.delete(peerId);
        broadcastToSession(session, {
          type: 'peer:left',
          peerName,
          peersCount: session.peers.size
        });
      });

      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: corsHeaders
      });
    }

    // REST: Get or update session info
    if (url.pathname.startsWith('/api/session/')) {
      const sessionId = url.pathname.replace('/api/session/', '').split('/')[0];
      const session = sessions.get(sessionId);

      if (request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (!sessions.has(sessionId)) {
          sessions.set(sessionId, {
            id: sessionId,
            repoUrl: body.repoUrl || '',
            peers: new Map(),
            locks: new Map(),
            createdAt: Date.now(),
          });
        }
        const s = sessions.get(sessionId);
        if (body.repoUrl) s.repoUrl = body.repoUrl;

        return new Response(JSON.stringify({
          success: true,
          sessionId,
          repoUrl: s.repoUrl,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!session) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        id: session.id,
        repoUrl: session.repoUrl,
        peerCount: session.peers.size,
        locks: Object.fromEntries(session.locks),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};

function broadcastToSession(session, message, excludePeerId = null) {
  const payload = JSON.stringify(message);
  for (const [id, peer] of session.peers.entries()) {
    if (id !== excludePeerId && peer.socket.readyState === WebSocket.OPEN) {
      try {
        peer.socket.send(payload);
      } catch (err) {}
    }
  }
}
