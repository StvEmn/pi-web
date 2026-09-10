import type { SessionInfo } from "./types";
import { workspaceKeyOf } from "./workspace-memory";

export interface RecentProject {
  /** Stable server-provided identity used for comparison and Map keys. */
  key: string;
  /** Original project path used for display and filesystem operations. */
  root: string;
}

/** Projects sorted by most recent activity and deduplicated by stable key. */
export function getRecentProjects(
  sessions: readonly SessionInfo[],
): RecentProject[] {
  const latestByProject = new Map<string, { root: string; modified: string }>();
  for (const session of sessions) {
    const root = session.projectRoot ?? session.cwd;
    if (!root) continue;
    const key = workspaceKeyOf(session);
    const previous = latestByProject.get(key);
    if (!previous || session.modified > previous.modified) {
      latestByProject.set(key, { root, modified: session.modified });
    }
  }
  return [...latestByProject.entries()]
    .sort((a, b) => b[1].modified.localeCompare(a[1].modified))
    .map(([key, { root }]) => ({ key, root }));
}

export function getProjectActivity(
  sessions: readonly SessionInfo[],
  runningSessionIds: ReadonlySet<string>,
  unreadSessionIds: ReadonlySet<string>,
): Map<string, { running: number; unread: number }> {
  const counts = new Map<string, { running: number; unread: number }>();
  for (const session of sessions) {
    const key = workspaceKeyOf(session);
    if (!key) continue;
    let entry = counts.get(key);
    if (!entry) {
      entry = { running: 0, unread: 0 };
      counts.set(key, entry);
    }
    if (runningSessionIds.has(session.id)) entry.running++;
    if (unreadSessionIds.has(session.id)) entry.unread++;
  }
  return counts;
}

/** Last path segment of a project root, for compact group headers. */
export function projectDisplayName(root: string): string {
  const segments = root.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? root;
}

export function sessionsForProject(
  sessions: readonly SessionInfo[],
  projectKey: string,
): SessionInfo[] {
  return sessions.filter((session) => workspaceKeyOf(session) === projectKey);
}

export function excludeRemovedProjects(
  projects: readonly RecentProject[],
  removedKeys: ReadonlySet<string>,
): RecentProject[] {
  if (removedKeys.size === 0) return [...projects];
  return projects.filter((p) => !removedKeys.has(p.key));
}

// ── Removed-projects persistence (sidebar removal, pi-web:removed-projects-v1) ──

const REMOVED_PROJECTS_KEY = "pi-web:removed-projects-v1";

export function loadRemovedProjects(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(REMOVED_PROJECTS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

export function saveRemovedProjects(keys: ReadonlySet<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REMOVED_PROJECTS_KEY, JSON.stringify([...keys]));
  } catch {}
}

/** Remove a project key from the removed set and persist. Returns the updated set. */
export function unhideProject(
  current: ReadonlySet<string>,
  key: string,
): Set<string> {
  if (!current.has(key)) return current as Set<string>;  // no-op, preserve reference
  const next = new Set(current);
  next.delete(key);
  saveRemovedProjects(next);
  return next;
}
