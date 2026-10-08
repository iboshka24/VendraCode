import type { RemoteDiff } from '@/types';

/**
 * Generates per-agent CSS classes used by Monaco remote-edit decorations so
 * every teammate keeps a stable color in the editor gutter / inline badge.
 */

const STYLE_ELEMENT_ID = 'vc-remote-diff-styles';

/** Only safe CSS color values are injected into the stylesheet. */
function sanitizeColor(color: string, fallback = '#7c3aed'): string {
  if (/^#[0-9a-fA-F]{3,8}$/.test(color)) return color;
  if (/^rgba?\([\d\s.,%]+\)$/.test(color)) return color;
  return fallback;
}

/** Stable, CSS-safe class suffix derived from an agent id. */
export function remoteClassToken(agentId: string): string {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash * 31 + agentId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export interface RemoteStyleEntry {
  agentId: string;
  color: string;
}

/** Rebuilds the stylesheet for the current set of live remote agents. */
export function renderRemoteStyles(entries: RemoteStyleEntry[]): void {
  if (typeof document === 'undefined') return;

  let style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    document.head.appendChild(style);
  }

  const unique = new Map<string, string>();
  for (const entry of entries) unique.set(entry.agentId, sanitizeColor(entry.color));

  const rules: string[] = [];
  for (const [agentId, color] of unique) {
    const token = remoteClassToken(agentId);
    rules.push(`
.vc-remote-line-${token} { background: color-mix(in srgb, ${color} 14%, transparent); }
.vc-remote-gutter-${token} {
  border-left: 2px solid ${color};
  margin-left: 2px;
  cursor: pointer;
}
.vc-remote-inline-${token} {
  color: ${color};
  font-style: italic;
  opacity: 0.75;
  font-size: 0.85em;
  white-space: pre;
}
.vc-remote-badge-${token} {
  color: ${color};
  border-color: ${color};
}`);
  }

  style.textContent = rules.join('\n');
}

/** Removes the injected stylesheet (used on unmount / cleanup). */
export function clearRemoteStyles(): void {
  document.getElementById(STYLE_ELEMENT_ID)?.remove();
}

/** Groups remote diffs by agent so decorations can be rendered deterministically. */
export function groupByAgent(diffs: RemoteDiff[]): RemoteDiff[] {
  const latest = new Map<string, RemoteDiff>();
  for (const diff of diffs) {
    const existing = latest.get(diff.agentId);
    if (!existing || diff.timestamp > existing.timestamp) latest.set(diff.agentId, diff);
  }
  return [...latest.values()].sort((a, b) => a.agentName.localeCompare(b.agentName));
}
