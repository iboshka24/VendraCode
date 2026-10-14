/**
 * Advisory file-lock store with ownership and TTL.
 *
 * Extracted from the inline lock logic in server/brain-server.js so the
 * rules are unit-testable and shared by every transport (WebSocket today,
 * REST tomorrow). Locks are advisory: they coordinate cooperating agents,
 * they do not enforce anything on the filesystem.
 *
 * A lock is { agentId, agentName, timestamp }. An expired lock (older than
 * ttlMs) is treated as absent: any owner may acquire over it, and only the
 * owning agent may release a live lock. The public view returned by list()
 * never exposes internal expiry bookkeeping, so the broadcast shape stays
 * identical to the legacy inline implementation.
 *
 * Clean-room implementation. The TTL/expiry discipline is motivated by the
 * reverse-engineering findings in docs/amoeba-reverse-engineering.md
 * (stale reservations must not wedge a shared session); no third-party
 * code was reused.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

function createLockStore({ ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
  /** filePath -> { agentId, agentName, timestamp, expiresAt } */
  const locks = new Map();

  const expired = (entry) => now() >= entry.expiresAt;

  const pub = (entry) => ({
    agentId: entry.agentId,
    agentName: entry.agentName,
    timestamp: entry.timestamp,
  });

  function acquire(filePath, owner) {
    if (typeof filePath !== 'string' || filePath.length === 0) {
      return { ok: false, error: 'filePath must be a non-empty string' };
    }
    if (!owner || typeof owner.agentId !== 'string' || owner.agentId.length === 0) {
      return { ok: false, error: 'owner.agentId must be a non-empty string' };
    }
    const current = locks.get(filePath);
    if (current && !expired(current) && current.agentId !== owner.agentId) {
      return { ok: false, lockedBy: pub(current) };
    }
    const at = now();
    locks.set(filePath, {
      agentId: owner.agentId,
      agentName: owner.agentName,
      timestamp: at,
      expiresAt: at + ttlMs,
    });
    return { ok: true, lock: pub(locks.get(filePath)) };
  }

  function release(filePath, owner) {
    const current = locks.get(filePath);
    if (!current) return { ok: true, released: false };
    const ownerId = owner && owner.agentId;
    if (!expired(current) && current.agentId !== ownerId) {
      return { ok: false, lockedBy: pub(current) };
    }
    locks.delete(filePath);
    return { ok: true, released: true };
  }

  function get(filePath) {
    const current = locks.get(filePath);
    if (!current) return null;
    if (expired(current)) {
      locks.delete(filePath);
      return null;
    }
    return pub(current);
  }

  function list() {
    const out = {};
    for (const [filePath, entry] of locks) {
      if (expired(entry)) {
        locks.delete(filePath);
      } else {
        out[filePath] = pub(entry);
      }
    }
    return out;
  }

  /** Remove expired entries. Returns the number of entries reclaimed. */
  function prune() {
    let reclaimed = 0;
    for (const [filePath, entry] of locks) {
      if (expired(entry)) {
        locks.delete(filePath);
        reclaimed += 1;
      }
    }
    return reclaimed;
  }

  return { acquire, release, get, list, prune };
}

module.exports = { createLockStore, DEFAULT_TTL_MS };
