const path = require('node:path');
const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash, randomUUID } = require('node:crypto');
const runFile = promisify(execFile);

function githubRepo(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Use an HTTPS GitHub repository URL.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || !/^\/[\w.-]+\/[\w.-]+(?:\.git)?\/?$/.test(url.pathname)) {
    throw new Error('Use an HTTPS GitHub repository URL, without credentials or query parameters.');
  }
  return `https://github.com${url.pathname.replace(/\/$/, '').replace(/\.git$/, '')}`;
}

/** Never pulls, resets or overwrites an existing user's checkout. */
async function prepareWorktree({ repoUrl, sessionId, baseDir, runGit }) {
  const repo = githubRepo(repoUrl);
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(sessionId)) throw new Error('Invalid swarm session ID.');
  const git = runGit || (async (args) => (await runFile('git', args, {
    windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })).stdout.trim());
  const key = createHash('sha256').update(repo.toLowerCase()).digest('hex').slice(0, 20);
  const cache = path.join(baseDir, 'repositories', key + '.git');
  await fs.mkdir(path.dirname(cache), { recursive: true });
  try { await fs.access(cache); await git(['--git-dir', cache, 'fetch', '--prune', 'origin']); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await git(['clone', '--bare', '--', repo, cache]);
  }
  // Use the remote default branch, including repositories whose default isn't main.
  const remoteHead = await git(['ls-remote', '--symref', repo, 'HEAD']);
  const ref = remoteHead.match(/^ref: (refs\/heads\/[^\s]+)\s+HEAD/m)?.[1];
  if (!ref) throw new Error('The shared repository has no default branch or is empty.');
  await git(['--git-dir', cache, 'fetch', 'origin', `${ref}:${ref}`]);
  const id = randomUUID().slice(0, 12);
  const branch = `swarm/${sessionId}/${id}`;
  const worktreePath = path.join(baseDir, 'sessions', sessionId, repo.split('/').pop(), id);
  await fs.mkdir(path.dirname(worktreePath), { recursive: true });
  await git(['--git-dir', cache, 'worktree', 'add', '-b', branch, worktreePath, ref]);
  return { path: worktreePath, branch, repoUrl: repo };
}

async function joinSwarm({ sessionId, token, repoUrl, baseDir, fetchImpl = fetch, runGit }) {
  const repo = githubRepo(repoUrl);
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(sessionId) || !/^[a-zA-Z0-9_-]{32,128}$/.test(token)) throw new Error('This invitation is incomplete. Ask your friend for a new invite link.');
  const response = await fetchImpl(`https://brain.vendra.uz/api/session/${sessionId}`, {
    headers: { 'X-Vendra-Token': token }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'This invitation is invalid. Ask your friend for a new link.' : 'The swarm server is unavailable. Please retry.');
  const info = await response.json();
  if (info.repoUrl && githubRepo(info.repoUrl).toLowerCase() !== repo.toLowerCase()) throw new Error('The invitation repository does not match the swarm. Ask your friend for a new link.');
  return prepareWorktree({ repoUrl: repo, sessionId, baseDir, runGit });
}
async function shareSwarm({ sessionId, token, repoUrl, fetchImpl = fetch }) {
  const repo = githubRepo(repoUrl);
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(sessionId) || !/^[a-zA-Z0-9_-]{32,128}$/.test(token)) throw new Error('Invalid swarm credentials.');
  const response = await fetchImpl('https://brain.vendra.uz/api/session/' + sessionId, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Vendra-Token': token },
    body: JSON.stringify({ repoUrl: repo }), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(response.status === 409 ? 'This room uses another repository. Click New private swarm first.' : 'Could not register this invitation. Please retry.');
  return { repoUrl: repo };
}
module.exports = { githubRepo, prepareWorktree, joinSwarm, shareSwarm };
