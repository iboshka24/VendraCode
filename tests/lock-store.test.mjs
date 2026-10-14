/**
 * Unit tests for server/lock-store.js (advisory locks with TTL).
 *
 * Run: node tests/lock-store.test.mjs
 */
import { createLockStore, DEFAULT_TTL_MS } from '../server/lock-store.js';

let pass = 0;
let fail = 0;
const check = (ok, label) => { ok ? pass++ : fail++; console.log(`${ok ? '  ✓' : '  ✗'} ${label}`); };

console.log('lock-store');

{
  // Controllable clock.
  let t = 1_000_000;
  const store = createLockStore({ ttlMs: 60_000, now: () => t });

  const a = store.acquire('src/app.ts', { agentId: 'a1', agentName: 'Alice' });
  check(a.ok === true, 'acquire free path succeeds');
  check(a.lock.agentId === 'a1' && typeof a.lock.timestamp === 'number', 'acquire returns public lock view');

  const b = store.acquire('src/app.ts', { agentId: 'b2', agentName: 'Bob' });
  check(b.ok === false && b.lockedBy.agentId === 'a1', 'second owner is rejected with lockedBy');

  const same = store.acquire('src/app.ts', { agentId: 'a1', agentName: 'Alice' });
  check(same.ok === true, 'same owner may re-acquire (refresh)');

  const relOther = store.release('src/app.ts', { agentId: 'b2' });
  check(relOther.ok === false, 'non-owner cannot release a live lock');

  const rel = store.release('src/app.ts', { agentId: 'a1' });
  check(rel.ok === true && rel.released === true, 'owner releases');

  const relMissing = store.release('nope.ts', { agentId: 'a1' });
  check(relMissing.ok === true && relMissing.released === false, 'releasing absent lock is a no-op success');

  check(store.get('src/app.ts') === null, 'released lock reads as absent');

  // Expiry: a stale lock never wedges the session.
  store.acquire('stale.ts', { agentId: 'old', agentName: 'Old' });
  t += 60_001;
  const over = store.acquire('stale.ts', { agentId: 'new', agentName: 'New' });
  check(over.ok === true && over.lock.agentId === 'new', 'expired lock is acquirable by another owner');
  check(store.prune() === 0, 'prune reclaims nothing when nothing is stale');

  store.acquire('x.ts', { agentId: 'o', agentName: 'O' });
  store.acquire('y.ts', { agentId: 'o', agentName: 'O' });
  t += 60_001;
  check(store.prune() === 3, 'prune reclaims expired entries');
  check(Object.keys(store.list()).length === 0, 'list hides and drops expired entries');

  // Validation.
  check(store.acquire('', { agentId: 'a' }).ok === false, 'empty path rejected');
  check(store.acquire('f.ts', {}).ok === false, 'missing agentId rejected');
}

{
  check(DEFAULT_TTL_MS === 5 * 60 * 1000, 'default TTL is 5 minutes');
  const store = createLockStore();
  store.acquire('a.ts', { agentId: 'x' });
  const view = store.list()['a.ts'];
  check(!('expiresAt' in view), 'public view never exposes expiresAt');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
