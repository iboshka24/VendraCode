/**
 * Unit tests for server/daemon-token.js (loopback bearer tokens).
 *
 * Run: node tests/daemon-token.test.mjs
 */
import { mkdtempSync } from 'node:fs';
import { readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  TOKEN_HEADER,
  isAuthorized,
  tokenPath,
  verifyToken,
  ensureDaemonToken,
} from '../server/daemon-token.js';

let pass = 0;
let fail = 0;
const check = (ok, label) => { ok ? pass++ : fail++; console.log(`${ok ? '  ✓' : '  ✗'} ${label}`); };

console.log('daemon-token');

check(TOKEN_HEADER === 'x-vendra-daemon-token', 'header name is stable');

{
  const home = mkdtempSync(path.join(tmpdir(), 'vendra-token-'));
  const t1 = await ensureDaemonToken(home);
  check(/^[A-Za-z0-9_-]{43}$/.test(t1), 'issued token is 43-char base64url');
  const t2 = await ensureDaemonToken(home);
  check(t1 === t2, 'second boot reuses the stored token');

  const st = statSync(tokenPath(home));
  if (process.platform !== 'win32') {
    check((st.mode & 0o777) === 0o600, 'token file is owner-only (0600)');
    check((statSync(path.dirname(tokenPath(home))).mode & 0o777) === 0o700, 'token dir is owner-only (0700)');
  } else {
    check(true, 'permission bits skipped on Windows (ACLs apply)');
  }

  // Corrupt the file: next boot must rotate, not crash.
  const { writeFileSync } = await import('node:fs');
  writeFileSync(tokenPath(home), 'garbage\n');
  const t3 = await ensureDaemonToken(home);
  check(t3 !== t1 && /^[A-Za-z0-9_-]{43}$/.test(t3), 'corrupt token file is rotated');

  check(readFileSync(tokenPath(home), 'utf8').trim() === t3, 'rotated token is persisted');

  void home;
}

check(verifyToken('a'.repeat(43), 'a'.repeat(43)) === true, 'matching tokens verify');
check(verifyToken('a'.repeat(43), 'b'.repeat(43)) === false, 'mismatched tokens fail');
check(verifyToken('', 'a'.repeat(43)) === false, 'empty input fails closed');
check(verifyToken(undefined, 'a'.repeat(43)) === false, 'missing input fails closed');
check(verifyToken('short', 'short') === false, 'malformed tokens never verify, even equal ones');

{
  const good = 'a'.repeat(43);
  check(isAuthorized({ [TOKEN_HEADER]: good }, good) === true, 'correct header authorizes');
  check(isAuthorized({ [TOKEN_HEADER]: 'b'.repeat(43) }, good) === false, 'wrong header rejected');
  check(isAuthorized({}, good) === false, 'missing header rejected');
  check(isAuthorized({ [TOKEN_HEADER]: good }, undefined) === false, 'missing expected token fails closed');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
