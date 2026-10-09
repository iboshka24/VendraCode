/**
 * End-to-end check of the free OpenCode Zen models — self-contained.
 *
 * Boots its own Electron instance and walks the real user flow: model scanner
 * → pick `opencode/<free-model>` → the chat must route through
 * `opencode run --model …` (credentials live inside the CLI, so a direct
 * fetch is impossible) → send a prompt → a real streamed answer must land in
 * an assistant bubble.
 *
 * The profile is seeded with a persisted chat to also cover the restart path:
 * the store must adopt the newest stored chat as active, otherwise every
 * message write is silently dropped.
 *
 * Run: `npm run test:zen` (or point it at a running app with CDP_PORT=9333).
 */
import { WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ELECTRON = path.join(PROJECT, 'node_modules', 'electron', 'dist', 'electron');
const PORT = Number(process.env.CDP_PORT || 9531);
const MODEL = process.env.ZEN_MODEL || 'opencode/nemotron-3.5-lightning-free';
const OUT_DIR = path.join(os.tmpdir(), 'vendracode-tests', 'zen');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT_DIR, { recursive: true });

// ─── boot own instance unless an external one is provided ───────────
const DATA = path.join(os.tmpdir(), 'vc-zen-data');
let app = null;
if (!process.env.CDP_PORT) {
  rmSync(DATA, { recursive: true, force: true });
  app = spawn(ELECTRON, [PROJECT, `--user-data-dir=${DATA}`, `--remote-debugging-port=${PORT}`, '--no-sandbox'],
    { env: { ...process.env, NODE_ENV: 'production' }, stdio: 'ignore' });
}
const shutdown = () => { try { app?.kill('SIGKILL'); } catch { /* already gone */ } };
process.on('exit', shutdown);

// ─── CDP plumbing ───────────────────────────────────────────────────
let ws;
const pending = new Map();
let id = 0;
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const m = ++id;
  pending.set(m, { resolve, reject });
  ws.send(JSON.stringify({ id: m, method, params }));
});

let target = null;
for (let i = 0; i < 60 && !target; i++) {
  try {
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json())
      .find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  } catch { /* app not up yet */ }
  if (!target) await sleep(400);
}
if (!target) {
  console.error(`FAIL: no app with CDP on :${PORT}`);
  shutdown();
  process.exit(1);
}

ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  }
});
await send('Runtime.enable');
await send('Page.enable');

const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'evaluate failed');
  return r.result.value;
};
const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.scrollIntoView({block:'center'}); e.click(); return true; })()`);
const shot = async (name) => {
  const r = await send('Page.captureScreenshot');
  writeFileSync(path.join(OUT_DIR, name), Buffer.from(r.data, 'base64'));
};

let pass = 0;
let fail = 0;
const check = (ok, label) => { ok ? pass++ : fail++; console.log(`${ok ? '  ✓' : '  ✗'} ${label}`); };

// ─── load the renderer and seed a persisted chat ────────────────────
await send('Page.navigate', { url: `file://${PROJECT}/dist/index.html` });
await sleep(1200);
await ev(`(() => {
  const now = Date.now();
  localStorage.setItem('vendracode-chats-v1', JSON.stringify([{
    id: 'chat-seeded', title: 'Seeded chat', agentId: 'vendra-ai',
    messages: [], createdAt: now, updatedAt: now,
  }]));
  localStorage.setItem('vendracode-peer-name', 'Ibrohim');
  return true;
})()`);
await send('Page.reload', { ignoreCache: true });
await sleep(7000);

console.log('1) сканер моделей');
check(await click('[title^="Scan live models"]'), 'пилюля сканера найдена');

// `opencode models` (557 entries) + OpenRouter both land, so wait for the
// counter to stop growing.
let rowsN = 0;
let stable = 0;
for (let i = 0; i < 30 && stable < 2; i++) {
  await sleep(1000);
  const cur = Number(await ev(`(document.body.innerText.match(/live discovered models \\((\\d+)\\)/i) || [])[1] || 0`));
  stable = cur === rowsN && cur > 0 ? stable + 1 : 0;
  rowsN = cur;
}
check(rowsN > 100, `каталог собран и стабилен: ${rowsN} моделей`);

console.log('2) выбор бесплатной Zen-модели');
const picked = await ev(`(() => {
  const btns = [...document.querySelectorAll('button')].filter(b => b.querySelector('div.font-mono'));
  const row = btns.find(b => b.innerText.includes(${JSON.stringify(MODEL.split('/').pop())}));
  if (!row) return false;
  row.scrollIntoView({block:'center'}); row.click(); return true;
})()`);
check(picked, `строка "${MODEL}" кликнута`);
await sleep(1500);

check(
  await ev(`document.body.innerText.includes(${JSON.stringify(`opencode run --model ${MODEL}`)})`),
  'чат объяснил маршрут: opencode run --model …'
);
await shot('01-picked.png');

console.log('3) реальный запрос к модели');
const PROMPT = 'Ответь ровно одним словом: PONG';
check(await ev(`(() => {
  const ta = document.querySelector('textarea[placeholder^="Ask "], textarea[placeholder*="Ask "]');
  if (!ta) return false;
  ta.focus();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, ${JSON.stringify(PROMPT)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`), 'сообщение введено в поле чата');

await ev(`(() => {
  const ta = document.querySelector('textarea[placeholder^="Ask "], textarea[placeholder*="Ask "]');
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
})()`);

let outcome = '';
let cliSpawned = false;
for (let i = 0; i < 120; i++) {
  await sleep(1000);
  const st = await ev(`(() => {
    const body = document.body.innerText;
    const nodes = [...document.querySelectorAll('div.flex.justify-start > div.bg-surface')];
    const reply = nodes.length ? nodes[nodes.length - 1].innerText : '';
    const chats = JSON.parse(localStorage.getItem('vendracode-chats-v1') || '[]');
    const seeded = chats.find((c) => c.id === 'chat-seeded') || { messages: [] };
    return { body, reply, seededMsgs: seeded.messages.length };
  })()`);
  if (/running in/i.test(st.body) && /OpenCode/i.test(st.body)) cliSpawned = true;
  if (/is not installed on this machine/i.test(st.body)) { outcome = 'CLI_NOT_INSTALLED'; break; }
  if (/agent bridge unavailable/i.test(st.body)) { outcome = 'NO_BRIDGE'; break; }
  // PONG must appear in an assistant bubble: the prompt itself contains the
  // word, so scanning the whole page would be a false positive.
  if (/\bPONG\b/i.test(st.reply)) { outcome = 'PONG'; break; }
  if (i === 20) console.log('  … ждём стриминг (opencode run поднимает сервис)');
}
check(cliSpawned, 'запуск CLI виден в чате (OpenCode … running in)');
check(outcome === 'PONG', `модель ответила в чате (итог: ${outcome || 'timeout'})`);

// The seeded persisted chat must be the one that received everything.
const landed = await ev(`(() => {
  const chats = JSON.parse(localStorage.getItem('vendracode-chats-v1') || '[]');
  const seeded = chats.find((c) => c.id === 'chat-seeded');
  return seeded ? seeded.messages.length : -1;
})()`);
check(landed >= 3, `сообщения легли в persisted-чат (${landed} записей)`);
await shot('02-answer.png');

console.log(`\nИТОГ: ${pass}/${pass + fail}`);
console.log(`скриншоты: ${OUT_DIR}`);
shutdown();
process.exit(fail ? 1 : 0);
