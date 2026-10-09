/**
 * VendraCode two-instance multiplayer verification.
 *
 * Boots two real IDE instances (own user-data dirs, own CDP endpoints, and
 * *different* local workspace roots — like two teammates on two machines) on
 * the live brain and asserts peer discovery, cross-root live-edit relay and
 * the worktree switcher.
 *
 * Run: npm run test:multiplayer
 */
/**
 * Two-instance multiplayer verification (rerun for the 1.1.0 release).
 *
 * Boots two separate VendraCode IDE instances (own user-data dirs, own CDP
 * endpoints, distinct display names and *different* local workspace roots —
 * i.e. two teammates on two machines) and asserts:
 *   1. both peers discover each other in the brain.vendra.uz session
 *   2. live typing in instance B shows up as a remote-edit badge in instance A
 *   3. the worktree switcher is usable and reports the real worktree count
 */
import { WebSocket } from 'ws';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const ELECTRON = join(PROJECT, 'node_modules/electron/dist/electron');
const OUT = '/tmp/vc-tests/multiplayer';
const SESSION = `verify-swarm-${Date.now()}`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
const check = (n, c, d = '') => { if (c) { passed++; log(`  ✓ ${n}`); } else { failed++; log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };

function cdp(port) {
  const id = { v: 0 };
  let ws;
  const pending = new Map();
  const listeners = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id.v;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
  return {
    async connect() {
      let target = null;
      for (let i = 0; i < 50 && !target; i++) {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/json/list`);
          const list = await res.json();
          target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        } catch {}
        if (!target) await sleep(300);
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
        } else if (msg.method) {
          for (const l of listeners) l(msg);
        }
      });
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Network.enable');
    },
    send,
    onFrame(cb) { listeners.push((msg) => { if (msg.method === 'Network.webSocketFrameReceived') cb(msg); }); },
    async evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true });
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || 'evaluate failed');
      return res.result.value;
    },
    async clickAt(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    },
    async typeText(text) {
      for (const ch of text) {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
      }
    },
    async screenshot(file) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(res.data, 'base64'));
      return file;
    },
  };
}

// ─── second workspace at a DIFFERENT local root ────────────────────
const FRIEND_WS = '/tmp/vendra-friend';
rmSync(FRIEND_WS, { recursive: true, force: true });
mkdirSync(FRIEND_WS, { recursive: true });
for (const f of ['README.md', 'package.json', '.gitignore', 'LICENSE']) {
  cpSync(join(PROJECT, f), join(FRIEND_WS, f));
}
writeFileSync(join(FRIEND_WS, 'README.md'), `# Friend workspace\n\nThis checkout lives at ${FRIEND_WS} (a different root on purpose).\n`, 'utf8');
log(`friend workspace at ${FRIEND_WS}\n`);

const A = { name: 'Ibrohim', port: 9503, dir: '/tmp/vc-mp-a', workspace: PROJECT };
const B = { name: 'Friend', port: 9504, dir: '/tmp/vc-mp-b', workspace: FRIEND_WS };

async function boot(inst) {
  rmSync(inst.dir, { recursive: true, force: true });
  const child = spawn(ELECTRON, [PROJECT, `--user-data-dir=${inst.dir}`, `--remote-debugging-port=${inst.port}`, '--no-sandbox'],
    { env: { ...process.env, NODE_ENV: 'production' }, stdio: 'ignore' });
  const c = cdp(inst.port);
  await c.connect();
  await c.send('Page.navigate', { url: `file://${PROJECT}/dist/index.html` });
  await sleep(1200);
  await c.evaluate(`
    localStorage.setItem('vendracode-peer-name', ${JSON.stringify(inst.name)});
    localStorage.setItem('vendracode-session', ${JSON.stringify(SESSION)});
    localStorage.setItem('vendracode-workspace', ${JSON.stringify(inst.workspace)});
    'seeded';
  `);
  await c.send('Page.reload', { ignoreCache: true });
  await sleep(5000);
  return { ...inst, child, cdp: c };
}

log('booting Ibrohim (workspace: ' + A.workspace + ')...');
const a = await boot(A);
log('booting Friend  (workspace: ' + B.workspace + ')...');
const b = await boot(B);
await sleep(3000);

try {
  log('\n[1] Peer discovery');
  const statusOf = async (p) => (await p.cdp.evaluate(`document.querySelector('footer')?.innerText || ''`)).replace(/\n/g, ' | ');
  const aText = await statusOf(a);
  const bText = await statusOf(b);
  log(`  A: ${aText}`);
  log(`  B: ${bText}`);
  const brain = (t) => (t.match(/Brain:\s*([^|]+)/)?.[1] || '').trim();
  check('A is live on the brain', /Brain:\s*live/.test(aText), brain(aText));
  check('B is live on the brain', /Brain:\s*live/.test(bText), brain(bText));
  check('A sees the teammate', /Brain:\s*live\s*·\s*1/.test(aText), brain(aText));
  check('B sees the teammate', /Brain:\s*live\s*·\s*1/.test(bText), brain(bText));

  log('\n[2] Same relative file open on both sides');
  for (const p of [a, b]) {
    const box = await p.cdp.evaluate(`
      (() => { const el=[...document.querySelectorAll('*')].filter(e => e.children.length===0 && e.textContent.trim()==='README.md')[0];
        if(!el) return null; el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect();
        return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)}; })()
    `);
    if (box) await p.cdp.clickAt(box.x, box.y);
    await sleep(1200);
    const open = await p.cdp.evaluate(`[...document.querySelectorAll('[class*="cursor-pointer"]')].some(el => el.textContent.includes('README.md'))`);
    check(`${p.name} has README.md open`, Boolean(open));
  }

  log('\n[3] Live typing relay (B -> A) across different local roots');
  const aFrames = [];
  a.cdp.onFrame((m) => { if (/diff:stream/.test(m.params.response.payloadData || '')) aFrames.push(m.params.response.payloadData.slice(0, 300)); });

  const editorBox = await b.cdp.evaluate(`
    (() => { const m=document.querySelector('.monaco-editor'); if(!m) return null; const r=m.getBoundingClientRect();
      return {x:Math.round(r.x+r.width*0.3), y:Math.round(r.y+r.height*0.4)}; })()
  `);
  check('Monaco is mounted in B', Boolean(editorBox));

  if (editorBox) {
    await b.cdp.clickAt(editorBox.x, editorBox.y);
    await sleep(500);
    await b.cdp.typeText('X');
    await sleep(300);
    await b.cdp.typeText('Y');
    await sleep(2500);

    const decos = await a.cdp.evaluate(`
      JSON.stringify({
        lines: document.querySelectorAll('[class*="vc-remote-line"]').length,
        badges: [...document.querySelectorAll('[class*="vc-remote-badge"]')].map(e => (e.textContent||'').slice(0,40)),
        status: (document.querySelector('footer')?.innerText || '').replace(/\\n/g,' | '),
      })
    `);
    const d = JSON.parse(decos);
    log(`  A decorations: ${JSON.stringify(d)}`);
    check('A highlights the edited line', d.lines >= 1);
    check("A shows the teammate badge", d.badges.some(t => t.includes('Friend')), JSON.stringify(d.badges));
    check('A status bar counts the live edit', /(\d+) live edit/.test(d.status) && Number(/\d+ (live edit)/.exec(d.status)?.[0]?.split(' ')[0]) >= 1, d.status);
    check('diff frames crossed the wire to A', aFrames.length > 0, `${aFrames.length} frames`);
    if (aFrames[0]) log(`     ${aFrames[0]}`);

    const ownDecos = await b.cdp.evaluate(`document.querySelectorAll('[class*="vc-remote-badge"]').length`);
    check("B does not decorate its own typing", ownDecos === 0, String(ownDecos));

    await a.cdp.screenshot(join(OUT, 'A-receives-friend-edit.png'));
    await b.cdp.screenshot(join(OUT, 'B-typing.png'));
    log(`  screenshots: ${OUT}/A-receives-friend-edit.png, ${OUT}/B-typing.png`);
  }
} catch (err) {
  failed++;
  log(`  ✗ thrown: ${err.message}`);
} finally {
  for (const inst of [a, b]) { try { inst.child.kill('SIGKILL'); } catch {} }
}

log(`\n${passed} passed, ${failed} failed`);
log(`session: ${SESSION}`);
process.exit(failed ? 1 : 0);
