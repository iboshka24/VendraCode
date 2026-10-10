/**
 * Multiplayer: does a teammate SEE what a local agent does?
 *
 * Two real IDE instances in one brain session, different workspace roots.
 * A's bound Telegram bot (fake Bot API) drives the fake OpenCode CLI, which
 * writes a real file. B must then:
 *   - see the agent's advisory file lock in the status bar (attributed to
 *     "OpenCode CLI", not to the human),
 *   - render the agent's live-edit badge in its own editor,
 *   - list the agent's tool call in Mission Control.
 *
 * Run: `npm run test:multiplayer-agent`
 */
import { WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ELECTRON = path.join(PROJECT, 'node_modules', 'electron', 'dist', 'electron');
const FIXTURES = path.join(PROJECT, 'tests', 'fixtures');
const TG_PORT = 8792;
const SESSION = `mp-agent-${Date.now().toString(36)}`;
const OUT = path.join(os.tmpdir(), 'vendracode-tests', 'multiplayer-agent');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── fake Telegram Bot API ─────────────────────────────────────────
const tgOutbox = [];
const tgQueue = [];
const tgServer = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${TG_PORT}`);
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (url.pathname === '/_inject') {
      tgQueue.push({ update_id: tgQueue.length + 1, message: {
        chat: { id: 777 }, from: { first_name: 'Ibrohim' },
        text: url.searchParams.get('text') || 'ping',
      } });
      return json(200, { ok: true });
    }
    if (url.pathname === '/_outbox') return json(200, tgOutbox);
    const m = url.pathname.match(/^\/bot([^/]+)\/(\w+)$/);
    if (!m) return json(404, { ok: false });
    const [, token, method] = m;
    if (token !== 'test-token') return json(401, { ok: false, description: 'Unauthorized' });
    let payload = {};
    try { payload = body ? JSON.parse(body) : {}; } catch { /* empty */ }
    if (method === 'getMe') return json(200, { ok: true, result: { id: 1, username: 'vendra_test_bot' } });
    if (method === 'getUpdates') {
      const updates = tgQueue.splice(0, tgQueue.length);
      if (updates.length) return json(200, { ok: true, result: updates });
      setTimeout(() => json(200, { ok: true, result: [] }), 700);
      return;
    }
    if (method === 'sendMessage') {
      tgOutbox.push({ chatId: String(payload.chat_id), text: String(payload.text || '') });
      return json(200, { ok: true, result: {} });
    }
    return json(200, { ok: true, result: {} });
  });
});
await new Promise((r) => tgServer.listen(TG_PORT, '127.0.0.1', r));

// ─── workspaces (different local roots) ────────────────────────────
function seedWorkspace(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'fake-write.js'), '// placeholder — the agent will rewrite this file\n', 'utf8');
  writeFileSync(path.join(dir, 'README.md'), `# ${dir}\n`, 'utf8');
}
const WS_A = path.join(os.tmpdir(), 'vendra-agent-a');
const WS_B = path.join(os.tmpdir(), 'vendra-agent-b');
seedWorkspace(WS_A);
seedWorkspace(WS_B);

// ─── CDP helper ────────────────────────────────────────────────────
function cdp(port) {
  let ws;
  const pending = new Map();
  let id = 0;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const m = ++id;
    pending.set(m, { resolve, reject });
    ws.send(JSON.stringify({ id: m, method, params }));
  });
  return {
    async connect() {
      let target = null;
      for (let i = 0; i < 60 && !target; i++) {
        try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up */ }
        if (!target) await sleep(400);
      }
      if (!target) throw new Error(`no CDP target on ${port}`);
      ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
      await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.id && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id);
          pending.delete(msg.id);
          msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
        }
      });
      await send('Page.enable');
      await send('Runtime.enable');
    },
    send,
    async evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || 'evaluate failed');
      return res.result.value;
    },
    async screenshot(file) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(res.data, 'base64'));
    },
  };
}

let pass = 0; let fail = 0;
const check = (ok, label) => { ok ? pass++ : fail++; console.log(`${ok ? '  ✓' : '  ✗'} ${label}`); };
const children = [];
const shutdown = () => {
  for (const c of children) { try { c.kill('SIGKILL'); } catch { /* gone */ } }
  try { tgServer.close(); } catch { /* closed */ }
};
process.on('exit', shutdown);

async function boot(name, port, dir, workspace, extraEnv = {}) {
  rmSync(dir, { recursive: true, force: true });
  const child = spawn(ELECTRON, [PROJECT, `--user-data-dir=${dir}`, `--remote-debugging-port=${port}`, '--no-sandbox'], {
    env: { ...process.env, NODE_ENV: 'production', ...extraEnv },
    stdio: 'ignore',
  });
  children.push(child);
  const c = cdp(port);
  await c.connect();
  await c.send('Page.navigate', { url: `file://${PROJECT}/dist/index.html` });
  await sleep(1200);
  await c.evaluate(`
    localStorage.setItem('vendracode-peer-name', ${JSON.stringify(name)});
    localStorage.setItem('vendracode-session', ${JSON.stringify(SESSION)});
    localStorage.setItem('vendracode-workspace', ${JSON.stringify(workspace)});
    localStorage.setItem('vendracode-chats-v1', JSON.stringify([]));
    ${extraEnv.__botSeed ? `localStorage.setItem('vendracode-bots-v1', JSON.stringify([{ id: 'bot-mp', label: 'MP bot', token: 'test-token', agentId: 'opencode', enabled: true, pairedChatId: null }]));` : ''}
    'seeded';
  `);
  await c.send('Page.reload', { ignoreCache: true });
  await sleep(6000);
  return c;
}

console.log(`session: ${SESSION}`);
console.log('booting A (agent host) + B (teammate)…');
const a = await boot('Ibrohim', 9505, path.join(os.tmpdir(), 'vc-mpa-a'), WS_A, {
  VENDRA_CLI_PATH: FIXTURES,
  VENDRA_TELEGRAM_API: `http://127.0.0.1:${TG_PORT}`,
  FAKE_OPENCODE_LINES: '120',
  FAKE_OPENCODE_FILE: 'fake-write.js',
  __botSeed: '1',
});
const b = await boot('Friend', 9506, path.join(os.tmpdir(), 'vc-mpa-b'), WS_B);
await sleep(3000);

// B opens the file the agent is about to write.
const opened = await b.evaluate(`(() => {
  const items = [...document.querySelectorAll('aside .cursor-pointer')];
  const file = items.find((el) => /fake-write\\.js/.test(el.innerText || ''));
  if (!file) return false;
  file.scrollIntoView({ block: 'center' });
  file.click();
  return true;
})()`);
check(opened, 'B открыл fake-write.js у себя');
await sleep(1500);

// Wait for A's bot, then let the agent write.
let botUp = false;
for (let i = 0; i < 25 && !botUp; i++) {
  await sleep(1000);
  const st = await a.evaluate(`window.vendraAPI.bots.status()`);
  botUp = st?.['bot-mp']?.status === 'running';
}
check(botUp, 'бот на A запущен');
await fetch(`http://127.0.0.1:${TG_PORT}/_inject?text=${encodeURIComponent('Перепиши fake-write.js через write')}`);

// Watch B while A's agent runs.
let bLockText = '';
let bLockTitle = '';
let bBadge = null;
let aDiskOk = false;
let reply = null;
for (let i = 0; i < 200; i++) {
  await sleep(250);
  const stB = await b.evaluate(`(() => {
    const footer = document.querySelector('footer')?.innerText || '';
    const lockEl = [...document.querySelectorAll('footer [title]')].find(el => /locked/i.test(el.innerText || ''));
    return { footer, lockTitle: lockEl?.getAttribute('title') || '' };
  })()`);
  if (!bLockText && /locked/.test(stB.footer)) { bLockText = stB.footer; bLockTitle = stB.lockTitle; }
  const badge = await b.evaluate(`[...document.querySelectorAll('.vc-remote-badge')].map(b => b.textContent)[0] || null`);
  if (badge) bBadge = badge;
  aDiskOk = existsSync(path.join(WS_A, 'fake-write.js'))
    && readFileSync(path.join(WS_A, 'fake-write.js'), 'utf8').includes('function mul(a, b)');
  reply = tgOutbox.find((m) => /PONG|write/i.test(m.text));
  if (bBadge && bLockText && aDiskOk && reply) break;
}

check(/locked/.test(bLockText), `B видит блокировку агента в статус-баре (${(bLockText.match(/\d+ locked/) || ['нет'])[0]})`);
check(/OpenCode CLI/.test(bLockTitle), `блокировка подписана агентом: ${bLockTitle.slice(0, 60)}`);
check(Boolean(bBadge), `B видит live-edit бейдж агента в редакторе: ${bBadge || 'не пойман'}`);
check(aDiskOk, 'агент реально перезаписал файл на A');
check(Boolean(reply), `ответ дошёл в Telegram: ${reply ? JSON.stringify(reply.text.slice(0, 50)) : 'нет'}`);

// Mission Control on B lists the agent's tool call.
await b.evaluate(`(() => {
  const btn = [...document.querySelectorAll('button, div')].find(el => /Mission Control/i.test(el.textContent || '') && el.children.length <= 3);
  if (btn) btn.click();
  return !!btn;
})()`);
await sleep(1200);
const mcText = await b.evaluate(`document.body.innerText`);
check(/OpenCode CLI/i.test(mcText), 'Mission Control у B показывает агента');
check(/write/i.test(mcText), 'Mission Control у B показывает tool-вызов write');
await b.screenshot(path.join(OUT, 'b-after-agent.png'));
await a.screenshot(path.join(OUT, 'a-after-agent.png'));

console.log(`\nИТОГ: ${pass}/${pass + fail}`);
console.log(`скриншоты: ${OUT}`);
shutdown();
process.exit(fail ? 1 : 0);
