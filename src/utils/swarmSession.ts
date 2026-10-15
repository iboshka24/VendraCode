export interface SwarmCredentials { sessionId: string; token: string }
const key = (id: string) => `vendracode-swarm-token:${id}`;
export function createSwarm(): SwarmCredentials {
  return { sessionId: `swarm-${crypto.randomUUID()}`, token: Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('') };
}
export function saveSwarm(value: SwarmCredentials): void {
  localStorage.setItem(key(value.sessionId), value.token);
  localStorage.setItem('vendracode-session', value.sessionId);
}
export function loadSwarm(): SwarmCredentials {
  const sessionId = localStorage.getItem('vendracode-session') || '';
  const token = localStorage.getItem(key(sessionId)) || '';
  if (/^[\w-]{8,128}$/.test(sessionId) && /^[\w-]{32,128}$/.test(token)) return { sessionId, token };
  // Old unauthenticated/default rooms are replaced with a private room.
  const fresh = createSwarm(); saveSwarm(fresh); return fresh;
}
export function parseSwarmInvite(value: string): SwarmCredentials & { repoUrl: string } {
  const url = new URL(value.trim());
  if (url.origin !== 'https://brain.vendra.uz' || !/^\/session\/[\w-]{8,128}$/.test(url.pathname)) throw new Error('Paste the full brain.vendra.uz invitation from your friend.');
  const token = url.searchParams.get('token') || '';
  const repoUrl = url.searchParams.get('repo') || '';
  if (!/^[\w-]{32,128}$/.test(token) || !repoUrl) throw new Error('This invitation is incomplete or from an older version. Ask your friend for a new link.');
  return { sessionId: url.pathname.split('/')[2], token, repoUrl };
}
export function swarmInvite(value: SwarmCredentials, repoUrl: string): string {
  const url = new URL(`https://brain.vendra.uz/session/${value.sessionId}`);
  url.searchParams.set('repo', repoUrl); url.searchParams.set('token', value.token);
  return url.href;
}
