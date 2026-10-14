/**
 * Loopback bearer-token auth for local automation.
 *
 * The shared brain server coordinates mutually-trusting local processes
 * (the Electron main process, CLI helpers, test harnesses). When such a
 * caller needs to prove "I run as this user on this machine" without a
 * full login flow, it presents a bearer token from a file only this user
 * can read — the same shape as the daemon-token discipline observed in
 * docs/amoeba-reverse-engineering.md (random 32-byte file token, owner-only
 * directory, constant-time comparison). Clean-room implementation; only the
 * idea (file-backed loopback token + timing-safe check) is reused.
 *
 * Layout: <home>/.vendra/daemon-token, directory mode 0700, file mode 0600.
 * Token format: base64url of 32 random bytes (43 chars, no padding).
 */

const { randomBytes, timingSafeEqual } = require('node:crypto');
const { chmod, mkdir, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');

const TOKEN_HEADER = 'x-vendra-daemon-token';
const TOKEN_BYTES = 32;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_DIR_MODE = 0o700;
const TOKEN_FILE_MODE = 0o600;

function tokenDir(homeDir) {
  const home = homeDir || process.env.VENDRA_HOME || require('node:os').homedir();
  return path.join(home, '.vendra');
}

function tokenPath(homeDir) {
  return path.join(tokenDir(homeDir), 'daemon-token');
}

function validToken(value) {
  if (typeof value !== 'string') return undefined;
  const token = value.trim();
  return TOKEN_RE.test(token) ? token : undefined;
}

function newToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Read the existing token or create one atomically-ish (single local
 * operator; concurrent first-boot races resolve to the last writer, which
 * is acceptable for a loopback secret and self-heals on next boot).
 * Returns the token string.
 */
async function ensureDaemonToken(homeDir) {
  const dir = tokenDir(homeDir);
  await mkdir(dir, { recursive: true, mode: TOKEN_DIR_MODE });
  try {
    await chmod(dir, TOKEN_DIR_MODE);
  } catch {
    // Non-POSIX filesystems (e.g. Windows profiles) enforce privacy via ACLs.
  }
  const file = tokenPath(homeDir);
  try {
    const current = validToken(await readFile(file, 'utf8'));
    if (current) return current;
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err;
  }
  const token = newToken();
  await writeFile(file, token + '\n', { mode: TOKEN_FILE_MODE });
  try {
    await chmod(file, TOKEN_FILE_MODE);
  } catch {
    // Same ACL note as above.
  }
  return token;
}

/** Constant-time bearer check. Never throws on malformed input. */
function verifyToken(provided, expected) {
  const a = validToken(provided);
  const b = validToken(expected);
  if (!a || !b) return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Framework-free header check: isAuthorized(req.headers, expectedToken). */
function isAuthorized(headers, expectedToken) {
  if (!headers || !expectedToken) return false;
  const raw = headers[TOKEN_HEADER];
  const provided = Array.isArray(raw) ? raw[0] : raw;
  return verifyToken(provided, expectedToken);
}

module.exports = {
  TOKEN_HEADER,
  TOKEN_DIR_MODE,
  TOKEN_FILE_MODE,
  tokenDir,
  tokenPath,
  ensureDaemonToken,
  verifyToken,
  isAuthorized,
};
