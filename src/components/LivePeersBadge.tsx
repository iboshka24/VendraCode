import { useAppStore } from '@/stores/appStore';
import { Users, Wifi, WifiOff, Loader } from 'lucide-react';

/**
 * Small multiplayer presence badge: shows the live brain.vendra.uz connection
 * state plus how many teammates are currently in the session.
 */
export function LivePeersBadge() {
  const brainStatus = useAppStore((s) => s.brainStatus);
  const brainPeers = useAppStore((s) => s.brainPeers);
  const activeLocks = useAppStore((s) => s.activeLocks);

  const isOnline = brainStatus === 'online';
  const isConnecting = brainStatus === 'connecting' || brainStatus === 'reconnecting';
  const lockCount = Object.keys(activeLocks).length;

  const color = isOnline ? 'text-ok' : isConnecting ? 'text-warning' : 'text-danger';
  const label = isOnline
    ? `${brainPeers.length + 1} online`
    : isConnecting
      ? 'syncing…'
      : brainStatus === 'idle' ? 'offline' : 'reconnecting…';

  const title = isOnline
    ? `Connected to brain.vendra.uz${brainPeers.length ? ` · peers: ${brainPeers.join(', ')}` : ''}${lockCount ? ` · ${lockCount} file lock(s) active` : ''}`
    : `brain.vendra.uz ${brainStatus} — retrying in the background`;

  return (
    <span
      className={`flex items-center gap-1.5 h-6 px-2 text-[11px] font-mono border border-border rounded ${color}`}
      title={title}
    >
      {isOnline ? <Wifi size={11} /> : isConnecting ? <Loader size={11} className="animate-spin" /> : <WifiOff size={11} />}
      <span className="hidden sm:inline">{label}</span>
      {isOnline && (
        <span className="flex items-center gap-0.5 text-text-muted">
          <Users size={10} />
          {brainPeers.length + 1}
        </span>
      )}
    </span>
  );
}
