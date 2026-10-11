/**
 * Verifies the Stop button actually stops a running CLI agent.
 * Boots the app with the fake opencode (FAKE_OPENCODE_DELAY keeps it alive),
 * starts a run, clicks Stop, and asserts the process dies and the UI reports
 * the stop.
 *
 * Run: `npm run test:stop`
 */
import { WebSocket } from 'ws';
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ELECTRON = path.join(PROJECT, 'node_modules', 'electron', 'dist', 'electron');
const FIXTURES = path.join(PROJECT, 'tests', 'fixtures');
const PORT = 9535;
const DATA = path.join(os.tmpdir(), 'vc-stop-data');
const WS = path.join(os.tmpdir(), 'vendra-stop-ws');
mkdirSync(path.join(os.tmpdir(), 'vendracode-tests', 'stop'), { recursive: true });
rmSync(WS, { recursive: true, force: true });
mkdirSync(WS, { recursive: true });
rmSync(DATA, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = spawn(ELECTRON, [PROJECT, `--user-data-dir=${DATA}`, `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  env: { ...process.env, NODE_ENV: 'production', VENDRA_CLI_PATH: FIXTURES, FAKE_OPENCODE_DELAY: '25' },
  stdio: 'ignore',
});
const shutdown = () => { try { app.kill('SIGKILL'); } catch { /* gone */ } };
process.on('exit', shutdown);

let ws; const pending = new Map(); let id = 0;
const send = (method, params = {}) => new Promise((res, rej) => {
  const m = ++id; pending.set(m, { res, rej });
  ws.send(JSON.stringify({ id: m, method, params }));
});
let target = null;
for (let i = 0; i < 60 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'fail');
  return r.result.value;
};
const shot = async (n) => {
  const r = await send('Page.captureScreenshot');
  writeFileSync(path.join(os.tmpdir(), 'vendracode-tests', 'stop', n), Buffer.from(r.data, 'base64'));
};

let pass = 0; let fail = 0;
const check = (ok, label) => { ok ? pass++ : fail++; console.log(`${ok ? '  ✓' : '  ✗'} ${label}`); };

await send('Page.navigate', { url: `file://${PROJECT}/dist/index.html` });
await sleep(1200);
await ev(`(() => {
  localStorage.setItem('vendracode-peer-name', 'Ibrohim');
  localStorage.setItem('vendracode-session', 'stop-e2e');
  localStorage.setItem('vendracode-workspace', ${JSON.stringify(WS)});
  localStorage.setItem('vendracode-chats-v1', JSON.stringify([]));
  return true;
})()`);
await send('Page.reload', { ignoreCache: true });
await sleep(7000);

// switch the agent to OpenCode CLI
const switched = await ev(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const pill = [...document.querySelectorAll('button.agentpill')].find(b => /Vendra AI/.test(b.innerText || ''));
  if (!pill) return 'нет пилюли агента';
  pill.click();
  await sleep(500);
  const item = [...document.querySelectorAll('button')].find(b => /OpenCode CLI/.test(b.innerText || ''));
  if (!item) return 'нет пункта OpenCode CLI';
  item.click();
  await sleep(300);
  return 'переключён';
})()`);
check(switched === 'переключён', `агент переключён на OpenCode CLI (${switched})`);

// start a run that would take ~25s
await ev(`(() => {
  const ta = document.querySelector('textarea[placeholder^="Ask "], textarea[placeholder*="Ask "]');
  ta.focus();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, 'long run');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  return true;
})()`);
console.log('   прогон запущен (фикстура живёт 25с)…');
await sleep(2500);

const runningProcs = Number(execSync(`pgrep -fc "[f]ixtures/opencode run" || true`).toString().trim() || 0);
check(runningProcs >= 1, `агент-процесс жив до остановки (${runningProcs})`);

const stopVisible = await ev(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /Stop .*running/i.test(b.title || ''));
  if (!btn) return false;
  btn.click();
  return true;
})()`);
check(stopVisible, 'кнопка Stop видна и нажата');
await sleep(2000);

const before = execSync(`pgrep -fa "[f]ixtures/opencode" || true`).toString().trim();
const stoppedProcs = Number(execSync(`pgrep -fc "[f]ixtures/opencode run" || true`).toString().trim() || 0);
console.log('   выжившие:', before.split('\n').filter(Boolean).join(' || ').slice(0, 300) || '(нет)');
check(stoppedProcs === 0, `процесс агента убит (осталось ${stoppedProcs})`);

const ui = await ev(`(() => {
  const body = document.body.innerText;
  const stopGone = ![...document.querySelectorAll('button')].some(b => /Stop .*running/i.test(b.title || ''));
  return { stopped: /Stopped by user/.test(body), stopGone };
})()`);
check(ui.stopped, 'в чате появилось «⏹ Stopped by user.»');
check(ui.stopGone, 'кнопка Stop исчезла (агент остановлен)');
await shot('01-stopped.png');

console.log(`\nИТОГ: ${pass}/${pass + fail}`);
shutdown();
process.exit(fail ? 1 : 0);
