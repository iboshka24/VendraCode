/**
 * Deterministic end-to-end for agent file writes + messenger bots.
 *
 * Boots the app with the fake `opencode` fixture first on PATH and with the
 * Telegram Bot API pointed at a local stub, then:
 *   1. the bound bot starts (getMe → @vendra_test_bot),
 *   2. a Telegram message is injected and must reach the agent,
 *   3. the agent (fake CLI) writes a real file through a `write` tool event —
 *      the editor must open it and reveal it live,
 *   4. the agent's answer must come back out through the bot (sendMessage).
 *
 * Run: `npm run test:agent`
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
const PORT = 9533;
const TG_PORT = 8791;
const DATA = path.join(os.tmpdir(), 'vc-agent-data');
const WS = path.join(os.tmpdir(), 'vendra-agent-ws');
const OUT = path.join(os.tmpdir(), 'vendracode-tests', 'agent');
mkdirSync(OUT, { recursive: true });
rmSync(WS, { recursive: true, force: true });
mkdirSync(WS, { recursive: true });
rmSync(DATA, { recursive: true, force: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── fake Telegram Bot API ─────────────────────────────────────────
const tgOutbox = [];
const tgQueue = [];
const tgStats = { getUpdates: 0, served: 0, getMe: 0 };
const tgServer = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${TG_PORT}`);
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const json = (code, data) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === '/_inject') {
      tgQueue.push({ update_id: tgQueue.length + 1, message: {
        chat: { id: Number(url.searchParams.get('chat') || 777) },
        from: { first_name: url.searchParams.get('from') || 'Ibrohim', username: 'iboshka24' },
        text: url.searchParams.get('text') || 'ping',
      } });
      return json(200, { ok: true, queued: tgQueue.length });
    }
    if (url.pathname === '/_outbox') return json(200, tgOutbox);
    if (url.pathname === '/_stats') return json(200, { ...tgStats, queued: tgQueue.length, outbox: tgOutbox.length });

    const m = url.pathname.match(/^\/bot([^/]+)\/(\w+)$/);
    if (!m) return json(404, { ok: false, description: 'not found' });
    const [, token, method] = m;
    if (token !== 'test-token') return json(401, { ok: false, description: 'Unauthorized', error_code: 401 });

    let payload = {};
    try { payload = body ? JSON.parse(body) : {}; } catch { /* empty */ }

    if (method === 'getMe') {
      tgStats.getMe += 1;
      return json(200, { ok: true, result: { id: 1, is_bot: true, first_name: 'VendraTest', username: 'vendra_test_bot' } });
    }
    if (method === 'getUpdates') {
      tgStats.getUpdates += 1;
      const updates = tgQueue.splice(0, tgQueue.length);
      tgStats.served += updates.length;
      if (updates.length) return json(200, { ok: true, result: updates });
      // Gentle long-poll stand-in: keep the loop from hot-spinning.
      setTimeout(() => json(200, { ok: true, result: [] }), 700);
      return;
    }
    if (method === 'sendMessage') {
      tgOutbox.push({ chatId: String(payload.chat_id), text: String(payload.text || '') });
      return json(200, { ok: true, result: { message_id: tgOutbox.length } });
    }
    return json(200, { ok: true, result: {} });
  });
});
await new Promise((r) => tgServer.listen(TG_PORT, '127.0.0.1', r));

// ─── boot the app with fixtures on PATH ────────────────────────────
const app = spawn(ELECTRON, [PROJECT, `--user-data-dir=${DATA}`, `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    VENDRA_CLI_PATH: FIXTURES,
    VENDRA_TELEGRAM_API: `http://127.0.0.1:${TG_PORT}`,
    FAKE_OPENCODE_LINES: '120',
    FAKE_OPENCODE_FILE: 'fake-write.js',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const appLog = [];
app.stdout.on('data', (d) => appLog.push(String(d)));
app.stderr.on('data', (d) => appLog.push(String(d)));
process.on('exit', () => { try { writeFileSync(path.join(OUT, 'app.log'), appLog.join('')); } catch {} });
const shutdown = () => {
  try { app.kill('SIGKILL'); } catch { /* gone */ }
  try { tgServer.close(); } catch { /* closed */ }
};
process.on('exit', shutdown);

// ─── CDP plumbing ──────────────────────────────────────────────────
let ws; const pending = new Map(); let id = 0;
const send = (method, params = {}) => new Promise((res, rej) => {
  const m = ++id; pending.set(m, { res, rej });
  ws.send(JSON.stringify({ id: m, method, params }));
});
let target = null;
for (let i = 0; i < 60 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl); } catch {}
  if (!target) await sleep(400);
}
if (!target) { console.error('FAIL: app did not start'); shutdown(); process.exit(1); }
ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id); pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  }
});
await send('Runtime.enable'); await send('Page.enable');
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'evaluate failed');
  return r.result.value;
};
const shot = async (n) => { const r = await send('Page.captureScreenshot'); writeFileSync(path.join(OUT, n), Buffer.from(r.data, 'base64')); };

let pass = 0; let fail = 0;
const check = (ok, label) => { ok ? pass++ : fail++; console.log(`${ok ? '  ✓' : '  ✗'} ${label}`); };

// seed profile: temp workspace + a bound Telegram bot
await send('Page.navigate', { url: `file://${PROJECT}/dist/index.html` });
await sleep(1200);
await ev(`(() => {
  localStorage.setItem('vendracode-peer-name', 'Ibrohim');
  localStorage.setItem('vendracode-session', 'agent-e2e');
  localStorage.setItem('vendracode-workspace', ${JSON.stringify(WS)});
  localStorage.setItem('vendracode-bots-v1', JSON.stringify([{
    id: 'bot-test', label: 'Test bot', token: 'test-token', agentId: 'opencode', enabled: true, pairedChatId: null,
  }]));
  // Keep chat state out of the way of previous runs.
  localStorage.setItem('vendracode-chats-v1', JSON.stringify([]));
  return true;
})()`);
await send('Page.reload', { ignoreCache: true });
await sleep(7000);

console.log('1) бот поднимается и виден приложению');
let botStatus = null;
for (let i = 0; i < 30; i++) {
  await sleep(1000);
  botStatus = await ev(`window.vendraAPI.bots.status()`);
  if (botStatus?.['bot-test']?.status === 'running') break;
}
check(botStatus?.['bot-test']?.status === 'running', `статус бота: ${botStatus?.['bot-test']?.status}`);
check(botStatus?.['bot-test']?.username === 'vendra_test_bot', `getMe вернул @${botStatus?.['bot-test']?.username}`);

console.log('2) сообщение из Telegram уходит агенту, ответ — обратно');
await ev(`(() => { window.__botEvents = []; window.addEventListener('vendracode:bot-incoming', e => window.__botEvents.push(e.detail)); return true; })()`);
await fetch(`http://127.0.0.1:${TG_PORT}/_inject?text=${encodeURIComponent('Сделай файл fake-write.js и ответь PONG')}&chat=777`).then((r) => r.json());

// Sample the editor while the agent works (live-write reveal). The reveal
// animates the model per frame; the visible text grows first, then the
// scrollbar shrinks once the buffer passes the viewport.
const textSeries = [];
const modelSeries = [];
const lineSeries = [];
const sliderSeries = [];
let badgeSeen = null;
let tabSeen = false;
let reply = null;
let revealA = -1;
let revealB = -1;
for (let i = 0; i < 800; i++) {
  await sleep(60);
  const st = await ev(`(() => {
    const tabs = [...document.querySelectorAll('div.font-mono')].filter(x => /fake-write\\.js/.test(x.innerText || ''));
    const slider = document.querySelector('.monaco-editor .scrollbar.vertical .slider');
    const lines = document.querySelector('.monaco-editor .view-lines');
    const badge = [...document.querySelectorAll('.vc-remote-badge')].map(b => b.textContent)[0] || null;
    // Exact buffer length when Monaco is reachable, viewport text otherwise.
    let modelLen = -1;
    try {
      const model = (window.monaco?.editor?.getModels?.() || []).find(m => String(m.uri).includes('fake-write.js'));
      if (model) modelLen = model.getValueLength();
    } catch {}
    // While the buffer is shorter than the viewport, Monaco renders one DOM
    // line per model line — an exact, per-frame growth signal for the reveal.
    const lineCount = document.querySelectorAll('.monaco-editor .view-line').length;
    return { tabs: tabs.length, slider: slider ? parseFloat(slider.style.height || '0') : 0, text: (lines?.innerText || '').length, badge, modelLen, lineCount };
  })()`);
  if (st.tabs > 0 && !tabSeen) {
    tabSeen = true;
    // Freeze the reveal state twice, ~450ms apart: the visible line count must
    // grow between the two probes when the write is being animated.
    const probeLines = () => ev(`document.querySelectorAll('.monaco-editor .view-line').length`);
    revealA = await probeLines();
    await shot('00-reveal-a.png');
    await sleep(450);
    revealB = await probeLines();
    await shot('00-reveal-b.png');
  }
  if (st.badge) badgeSeen = st.badge;
  if (tabSeen && st.lineCount > 0) lineSeries.push(st.lineCount);
  if (tabSeen) {
    if (st.modelLen >= 0) modelSeries.push(st.modelLen);
    textSeries.push(st.text);
    if (st.slider > 0) sliderSeries.push(st.slider);
  }
  reply = tgOutbox.find((m) => /PONG/.test(m.text));
  // Keep watching a moment after the reply so the ending badge is caught.
  if (reply && i > 10 && badgeSeen) break;
  if (reply && i % 10 === 0 && i > 40) break;
}
check(Boolean(reply), `ответ дошёл в Telegram: ${reply ? JSON.stringify(reply.text.slice(0, 60)) : 'нет'}`);

const finalState = await ev(`(() => {
  const chats = JSON.parse(localStorage.getItem('vendracode-chats-v1') || '[]');
  const msgs = chats[0]?.messages || [];
  const pills = [...document.querySelectorAll('svg')].filter(s => (s.getAttribute('class')||'').includes('wrench')).length;
  return {
    note: msgs.some(m => /messenger bot/.test(m.content || '')),
    assistantPong: msgs.some(m => m.role === 'assistant' && /PONG/.test(m.content || '') && !m.id.startsWith('cli-run-')),
    pills,
    msgs: msgs.length,
  };
})()`);

console.log('3) живопись агента в редакторе');
check(tabSeen, 'вкладка fake-write.js открылась сама');
const distinctSliders = [...new Set(sliderSeries)].sort((a, b) => b - a);
check(revealB > revealA && revealA >= 0,
  `наполнение видно в реальном времени: ${revealA} строк → ${revealB} строк за 450мс (скроллбар ${distinctSliders.slice(0, 4).join('→')}px)`);
check(Boolean(badgeSeen), `бейдж живой правки: ${badgeSeen || 'не пойман'}`);
await shot('01-final.png');

console.log('4) файл на диске — тот самый контент');
const wsFile = path.join(WS, 'fake-write.js');
const onDisk = existsSync(wsFile) ? readFileSync(wsFile, 'utf8') : '';
check(onDisk.includes('function mul(a, b)'), 'диск: функция mul записана');
check(onDisk.split('\n').length >= 120, `диск: ${onDisk.split('\n').length} строк (большой файл)`);

console.log('5) чат');
check(finalState.note, 'в чате есть заметка 📨 про мессенджер-бота');
check(finalState.assistantPong, 'ответ агента PONG виден в чате');
check(finalState.pills >= 1, `tool-вызов отдельным сообщением (${finalState.pills})`);

const diag = await ev(`({ botEvents: window.__botEvents || [], last: JSON.parse(localStorage.getItem('vendracode-chats-v1')||'[]')[0]?.messages?.slice(-4).map(m => m.role + ': ' + (m.content||'').replace(/\\n/g,' ').slice(0,80)) || [] })`).catch(() => ({}));
const stats = await fetch(`http://127.0.0.1:${TG_PORT}/_stats`).then(r => r.json()).catch(() => ({}));
console.log(`раскрытие: ${revealA} строк → через 450мс ${revealB} строк`);
console.log('серия строк (первые 30):', JSON.stringify(lineSeries.slice(0, 30)));
console.log('серия скроллбара (первые 30):', JSON.stringify(sliderSeries.slice(0, 30)));
console.log('\n--- диагностика ---');
console.log('события на странице:', JSON.stringify(diag.botEvents).slice(0, 300));
console.log('последние сообщения чата:', JSON.stringify(diag.last, null, 1).slice(0, 400));
console.log('статистика Telegram-стаба:', JSON.stringify(stats));
console.log('хвост лога приложения:', appLog.join('').split('\n').filter(l => l && !/gpu|dbus|Fontconfig|vsync|EGL|GLES|vaapi/i.test(l)).slice(-6).join('\n').slice(0, 600));

console.log(`\nИТОГ: ${pass}/${pass + fail}`);
console.log(`скриншоты: ${OUT}`);
shutdown();
process.exit(fail ? 1 : 0);
