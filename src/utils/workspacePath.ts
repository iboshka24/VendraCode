/**
 * Workspace-relative path helpers for multiplayer broadcasts.
 *
 * Absolute paths are machine specific (`/home/ibrohim/VendraCode/src/a.ts` vs
 * `/Users/friend/VendraCode/src/a.ts`), so live diffs are broadcast as paths
 * relative to the workspace root. Teammates then refer to the same file even
 * when their local checkout lives somewhere else.
 */

/** Makes a path comparable across machines by stripping the workspace root. */
export function toWorkspaceRelative(filePath: string, workspacePath: string | null): string {
  if (!filePath) return filePath;
  if (!workspacePath) return filePath;

  const normalize = (value: string) => value.replace(/\/+$/, '');
  const root = normalize(workspacePath);
  if (filePath === root) return filePath;
  if (filePath.startsWith(`${root}/`)) return filePath.slice(root.length + 1);

  // Outside the workspace (rare): keep the raw path so it is still identifiable.
  return filePath;
}

/** Inverse of {@link toWorkspaceRelative} when the file still exists locally. */
export function toWorkspaceAbsolute(relativePath: string, workspacePath: string | null): string {
  if (!relativePath || !workspacePath) return relativePath;
  return `${workspacePath.replace(/\/+$/, '')}/${relativePath.replace(/^\/+/, '')}`;
}
