/** Paths sent to the swarm are portable and relative, never drive-specific. */
const normalized = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '');
export function toWorkspaceRelative(filePath: string, workspacePath: string | null): string {
  const file = normalized(filePath);
  if (!workspacePath) return file;
  const root = normalized(workspacePath);
  const windows = /^[A-Za-z]:\//.test(root) || root.startsWith('//');
  const candidate = windows ? file.toLowerCase() : file;
  const prefix = windows ? root.toLowerCase() : root;
  if (candidate === prefix) return '';
  return candidate.startsWith(prefix + '/') ? file.slice(root.length + 1) : file;
}
export function toWorkspaceAbsolute(relativePath: string, workspacePath: string | null): string {
  if (!relativePath || !workspacePath) return relativePath;
  return `${normalized(workspacePath)}/${normalized(relativePath).replace(/^\/+/, '')}`;
}
