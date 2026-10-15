import React, { useEffect, useState } from 'react';
import type { McpServerConfig } from '@/types';

export const McpSettings: React.FC = () => {
  const [target, setTarget] = useState<'native' | 'codex'>('native');
  const [servers, setServers] = useState<any[]>([]);
  const [draft, setDraft] = useState('{\n  "name": "my-server",\n  "url": "https://example.com/mcp"\n}');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tools, setTools] = useState<Array<{ name: string; description: string }>>([]);
  const refresh = async () => setServers(target === 'native' ? await window.vendraAPI.mcp.list() : await window.vendraAPI.mcp.codexList());
  useEffect(() => { setMessage(''); setTools([]); void refresh().catch(e => setMessage(e.message)); }, [target]);
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true); setMessage('');
    try { await fn(); await refresh(); }
    catch (error: any) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4 text-xs">
    <h3 className="text-base font-semibold">MCP servers</h3>
    <p className="text-text-secondary">Connect external tools to your agent. Servers are configured on this computer; swarm invitations do not share their credentials.</p>
    <label className="block">Agent <select aria-label="MCP agent" className="vc-input ml-2" value={target} onChange={e => setTarget(e.target.value as 'native' | 'codex')}><option value="native">Vendra AI</option><option value="codex">Codex CLI</option></select></label>
    {message && <p role="alert" className="text-warning whitespace-pre-wrap">{message}</p>}
    <div className="space-y-2">
      {servers.length === 0 && <p className="text-text-muted">No MCP servers configured for this agent.</p>}
      {servers.map(server => <div key={server.name} className="border border-border rounded-xl p-3 space-y-2">
        <div className="flex justify-between"><strong>{server.name}</strong><span>{target === 'native' ? `${server.enabled === false ? 'disabled' : server.status}${server.toolCount !== undefined ? ` · ${server.toolCount} tools` : ''}` : `${server.enabled ? 'enabled' : 'disabled'} · ${server.authStatus || 'Codex managed'}`}</span></div>
        <p className="font-mono break-all">{server.url || server.command}</p>
        {server.error && <p className="text-warning">{server.error}</p>}
        <div className="flex gap-2">
          {target === 'native' && <>
            <button disabled={busy || server.enabled === false} className="btn btn-primary" onClick={() => void action(async () => { setTools(await window.vendraAPI.mcp.test(server.name)); setMessage('Connected to '+server.name); })}>Test connection</button>
            <button disabled={busy} className="btn btn-ghost" onClick={() => { const { status, error, toolCount, ...config } = server; setDraft(JSON.stringify(config, null, 2)); }}>Edit</button>
            <button disabled={busy} className="btn btn-ghost" onClick={() => void action(() => window.vendraAPI.mcp.save({ ...server, enabled: server.enabled === false }))}>{server.enabled === false ? 'Enable' : 'Disable'}</button>
          </>}
          <button disabled={busy} className="btn btn-ghost" onClick={() => void action(() => target === 'native' ? window.vendraAPI.mcp.remove(server.name) : window.vendraAPI.mcp.codexRemove(server.name))}>Remove</button>
        </div>
      </div>)}
    </div>
    {tools.length > 0 && <div className="border border-border rounded-lg p-3"><h4 className="font-semibold mb-2">Discovered tools ({tools.length})</h4>{tools.map(tool => <p key={tool.name} className="mb-1"><strong className="font-mono">{tool.name}</strong> — {tool.description}</p>)}</div>}
    <div className="border border-border rounded-xl p-4 space-y-3">
      <h4 className="font-semibold">Add or replace a server</h4>
      <p className="text-text-muted">HTTP: name, url, optional bearerTokenEnvVar. Local stdio: name, command, args (array), optional env (object). HTTP authentication for Vendra AI uses the named environment variable; restart the IDE after setting it. Codex manages its own authentication with codex mcp login.</p>
      <textarea aria-label="MCP server JSON" className="vc-input w-full font-mono min-h-48" spellCheck={false} value={draft} onChange={e => setDraft(e.target.value)} />
      <button disabled={busy} className="btn btn-primary" onClick={() => void action(async () => { const config = JSON.parse(draft) as McpServerConfig; if (target === 'native') await window.vendraAPI.mcp.save(config); else await window.vendraAPI.mcp.codexAdd(config); setTools([]); setMessage('Saved. '+(target === 'native' ? 'Test the connection or send a prompt to Vendra AI.' : 'Start a new Codex run to use this server.')); })}>{busy ? 'Working…' : `Save to ${target === 'native' ? 'Vendra AI' : 'Codex CLI'}`}</button>
    </div>
  </div>;
};
