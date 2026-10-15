/** Reads the installed Codex catalog without exposing its login credentials. */
function listCodexModels({ binary, spawnCli, killProcessTree, timeoutMs = 30000 }) {
  return new Promise((resolve, reject) => {
    const child = spawnCli(binary, ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let pending = '';
    let settled = false;
    let requestId = 1;
    let pageId = null;
    const models = [];
    const cursors = new Set();
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.end();
      killProcessTree(child);
      error ? reject(error) : resolve(models);
    };
    const timer = setTimeout(() => finish(new Error('Codex model scan timed out. Check your Codex login and connection.')), timeoutMs);
    const send = (message) => child.stdin.write(JSON.stringify(message) + '\n');
    const page = (cursor) => {
      pageId = ++requestId;
      send({ id: pageId, method: 'model/list', params: { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) } });
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() || '';
      for (const line of lines) {
        if (settled) break;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id !== 1 && msg.id !== pageId) continue;
        if (msg.error) { finish(new Error(msg.error.message || 'Codex model scan failed')); break; }
        if (msg.id === 1) {
          send({ method: 'initialized', params: {} });
          page();
        } else {
          for (const m of msg.result?.data || []) {
            if (m.hidden || typeof m.model !== 'string' || models.some(x => x.id === m.model)) continue;
            models.push({ id: m.model, name: m.displayName || m.model, provider: 'codex', providerId: 'codex',
              providerName: 'OpenAI Codex', source: 'Codex CLI', cliModel: true,
              supportedReasoningEfforts: (m.supportedReasoningEfforts || []).map(e => e.reasoningEffort), isDefault: !!m.isDefault });
          }
          const cursor = msg.result?.nextCursor;
          if (cursor && !cursors.has(cursor)) { cursors.add(cursor); page(cursor); }
          else finish();
        }
      }
    });
    child.stdin.on('error', (error) => finish(error));
    child.on('error', (error) => finish(error));
    child.on('close', () => { if (!settled) finish(new Error('Codex exited before returning its model catalog. Run codex login and retry.')); });
    // Drain diagnostics without returning any account details to the renderer.
    child.stderr.on('data', () => {});
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'vendracode', title: 'VendraCode', version: '1.2.1' } } });
  });
}
module.exports = { listCodexModels };
