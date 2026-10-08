import { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { brainClient, setBrainURL } from '@/services/brainClient';

/**
 * Bridges the Cloudflare Brain WebSocket (brain.vendra.uz/ws) with the app store.
 *
 * Responsibilities:
 *  1. Resolve a stable local identity (OS username) once on boot.
 *  2. Detect the linked GitHub repo for the open workspace so peers share context.
 *  3. Keep `brainStatus` / `brainPeers` / `activeLocks` in sync with the edge.
 *  4. Feed incoming teammate diffs into `remoteEdits` for the editor decorations.
 *  5. Prune ghost diffs that stopped arriving.
 */
export function useBrainSync() {
  const workspacePath = useAppStore((s) => s.workspacePath);
  const brainSessionId = useAppStore((s) => s.brainSessionId);
  const brainRepoUrl = useAppStore((s) => s.brainRepoUrl);
  const setBrainStatus = useAppStore((s) => s.setBrainStatus);
  const setBrainPeers = useAppStore((s) => s.setBrainPeers);
  const setBrainRepoUrl = useAppStore((s) => s.setBrainRepoUrl);
  const setBrainSessionId = useAppStore((s) => s.setBrainSessionId);
  const setActiveLocks = useAppStore((s) => s.setActiveLocks);
  const applyRemoteEdit = useAppStore((s) => s.applyRemoteEdit);
  const pruneRemoteEdits = useAppStore((s) => s.pruneRemoteEdits);

  // 1. Local identity + brain event subscription (mount once)
  useEffect(() => {
    // Optional self-hosted/local brain endpoint (dev & tests).
    const customUrl = localStorage.getItem('vendracode-brain-url');
    if (customUrl) setBrainURL(customUrl);

    // Display name shown to teammates next to cursors/diffs. Defaults to the
    // OS username; can be overridden (also how two IDE instances on one
    // machine get distinct identities).
    const displayName = localStorage.getItem('vendracode-peer-name') || undefined;
    if (displayName) brainClient.setIdentity(displayName);

    if (window.vendraAPI?.os?.userInfo) {
      window.vendraAPI.os.userInfo()
        .then((info) => brainClient.setIdentity(displayName || info?.username || 'You'))
        .catch(() => brainClient.setIdentity(displayName || 'You'));
    }

    const unsubscribe = brainClient.subscribe((event) => {
      switch (event.type) {
        case 'status':
          setBrainStatus(event.status);
          break;
        case 'peers':
          setBrainPeers(event.peers);
          break;
        case 'repo':
          setBrainRepoUrl(event.repoUrl);
          break;
        case 'locks':
          setActiveLocks(event.locks);
          break;
        case 'diff':
          // Never render our own echoes back into the editor.
          if (event.diff.agentId !== brainClient.getIdentity().peerId) {
            applyRemoteEdit(event.diff);
          }
          break;
      }
    });

    setBrainStatus(brainClient.getStatus());
    setBrainPeers(brainClient.getPeers());

    return unsubscribe;
  }, [setBrainStatus, setBrainPeers, setBrainRepoUrl, setBrainSessionId, setActiveLocks, applyRemoteEdit]);

  // 2. Connect for the active session, advertising the linked repo
  useEffect(() => {
    brainClient.setSession({ sessionId: brainSessionId, repoUrl: brainRepoUrl });
    brainClient.connect();
  }, [brainSessionId, brainRepoUrl]);

  // 3. Detect the GitHub remote of the open workspace (source of truth for the swarm)
  useEffect(() => {
    if (!workspacePath || !window.vendraAPI?.os) return;

    let cancelled = false;
    window.vendraAPI.os.exec('git remote get-url origin', workspacePath)
      .then((res) => {
        if (cancelled) return;
        const origin = (res?.stdout || '').trim();
        if (!origin) return;
        const httpUrl = origin
          .replace(/^git@github\.com:/, 'https://github.com/')
          .replace(/\.git$/, '');
        if (httpUrl && httpUrl !== brainRepoUrl) setBrainRepoUrl(httpUrl);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [workspacePath, setBrainRepoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // 4. Prune ghost diffs whose author went quiet
  useEffect(() => {
    const interval = setInterval(() => pruneRemoteEdits(), 5000);
    return () => clearInterval(interval);
  }, [pruneRemoteEdits]);
}
