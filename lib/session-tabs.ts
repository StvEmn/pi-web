/**
 * Session tab state module — pure functions for the session tab bar.
 *
 * A tab is a lightweight view wrapper: `{ id, sessionId }`. Closing a tab
 * never stops the session; the session continues in the background and can be
 * re-opened from the sidebar at any time.
 *
 */

import { projectDisplayName } from "./project-groups";

export interface SessionTab {
  /** Stable unique id for this tab. For draft tabs this is the client-side
   * temporary session id, which is also the draft-store key component
   * (`new:${tempId}:${cwd}`) used by the composer. */
  id: string;
  /** The session displayed in this tab. Undefined for draft tabs. */
  sessionId?: string;
  /** Draft tab: the cwd the new session will be created in.
   * Undefined for tabs bound to a real session. */
  draftCwd?: string;
}

export interface TabState {
  tabs: SessionTab[];
  activeId: string | null;
}

// ── localStorage persistence ──────────────────────────────────────────────────

const STORAGE_KEY = "pi-web:session-tabs-v1";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Read persisted tab state. Returns empty on any parse/shape error. */
export function loadTabs(
  storage: StorageLike | null = getBrowserStorage(),
): TabState {
  if (!storage) return { tabs: [], activeId: null };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { tabs: [], activeId: null };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { tabs: [], activeId: null };
    }
    const obj = parsed as Record<string, unknown>;
    const tabs = Array.isArray(obj.tabs) ? obj.tabs : [];
    const validTabs: SessionTab[] = [];
    for (const tab of tabs) {
      if (!tab || typeof tab !== "object") continue;
      const { id, sessionId, draftCwd } = tab as SessionTab;
      if (typeof id !== "string" || id.length === 0) continue;
      if (typeof sessionId === "string") {
        validTabs.push({ id, sessionId });
      } else if (typeof draftCwd === "string") {
        // Draft tab: valid only with its cwd (a draft without one is useless).
        validTabs.push({ id, draftCwd });
      }
    }
    const activeId =
      typeof obj.activeId === "string" && obj.activeId.length > 0
        ? obj.activeId
        : null;
    // activeId must reference a valid tab
    const resolvedActiveId =
      activeId && validTabs.some((t) => t.id === activeId) ? activeId : null;
    return { tabs: validTabs, activeId: resolvedActiveId };
  } catch {
    return { tabs: [], activeId: null };
  }
}

/** Persist tab state. No-op when storage is unavailable. */
export function saveTabs(
  state: TabState,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tabs: state.tabs, activeId: state.activeId }),
    );
  } catch {
    // storage unavailable — best-effort
  }
}

// ── Pure state transitions ────────────────────────────────────────────────────

/**
 * Open a session in a new tab, or activate its existing tab.
 * Returns a new state object; never mutates the input.
 */
export function openTab(state: TabState, sessionId: string): TabState {
  const existing = state.tabs.find((t) => t.sessionId === sessionId);
  if (existing) {
    return { tabs: state.tabs, activeId: existing.id };
  }
  const newTab: SessionTab = { id: crypto.randomUUID(), sessionId };
  return { tabs: [...state.tabs, newTab], activeId: newTab.id };
}

/**
 * Close a tab and pick an adjacent one. Returns new state.
 * If the closed tab was the active one, the adjacent tab (left-preferring)
 * becomes active. If no tabs remain, activeId is null.
 */
export function closeTab(
  state: TabState,
  tabId: string,
): TabState {
  const idx = state.tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return state;
  const newTabs = state.tabs.filter((t) => t.id !== tabId);
  if (state.activeId !== tabId) {
    return { tabs: newTabs, activeId: state.activeId };
  }
  const newActiveId = pickAdjacentId(state.tabs, tabId);
  return { tabs: newTabs, activeId: newActiveId };
}

/**
 * Open a draft tab for a new session in `cwd`, or activate its existing tab.
 * The draft tab's id is the caller-provided temporary session id, so the
 * composer's draft-store key (`new:${tempId}:${cwd}`) is stable across tab
 * switches and the tab can be promoted in place later.
 */
export function openDraftTab(state: TabState, draftTabId: string, cwd: string): TabState {
  const existing = state.tabs.find((t) => t.id === draftTabId);
  if (existing) return { tabs: state.tabs, activeId: draftTabId };
  const newTab: SessionTab = { id: draftTabId, draftCwd: cwd };
  return { tabs: [...state.tabs, newTab], activeId: newTab.id };
}

/**
 * Promote a draft tab in place once pi assigned the real session id: same
 * position, same tab id, `sessionId` replaces the draft marker. If no matching
 * draft tab exists (e.g. it was closed between send and callback), falls back
 * to opening a regular tab for the session.
 */
export function promoteDraft(state: TabState, draftTabId: string, sessionId: string): TabState {
  const idx = state.tabs.findIndex(
    (t) => t.id === draftTabId && t.draftCwd !== undefined,
  );
  if (idx === -1) return openTab(state, sessionId);
  const tabs = state.tabs.slice();
  tabs[idx] = { id: draftTabId, sessionId };
  return { tabs, activeId: state.activeId };
}

/** Activate a tab by id. No-op if the tab doesn't exist. */
export function activateTab(state: TabState, tabId: string): TabState {
  if (!state.tabs.some((t) => t.id === tabId)) return state;
  return { tabs: state.tabs, activeId: tabId };
}

/** Close all tabs except the active one. */
export function closeOthers(state: TabState): TabState {
  if (!state.activeId) return { tabs: [], activeId: null };
  const active = state.tabs.find((t) => t.id === state.activeId);
  if (!active) return { tabs: [], activeId: null };
  return { tabs: [active], activeId: active.id };
}

/** Close all tabs to the right of the active one. */
export function closeRight(state: TabState): TabState {
  if (!state.activeId) return state;
  const idx = state.tabs.findIndex((t) => t.id === state.activeId);
  if (idx === -1) return state;
  return { tabs: state.tabs.slice(0, idx + 1), activeId: state.activeId };
}

/**
 * Remove tabs whose session no longer exists (e.g. deleted while the app
 * was closed). Draft tabs are always kept. Each removal goes through
 * closeTab, so a stale active tab hands activation to its left-preferring
 * neighbor. Returns the input state object when nothing is stale.
 */
export function pruneStaleTabs(
  state: TabState,
  knownSessionIds: ReadonlySet<string>,
): TabState {
  let next = state;
  for (const tab of state.tabs) {
    if (
      tab.draftCwd === undefined &&
      !knownSessionIds.has(tab.sessionId ?? "")
    ) {
      next = closeTab(next, tab.id);
    }
  }
  return next;
}

// ── Tab display titles ───────────────────────────────────────────────────────

export interface TabTitleContext {
  /** All currently open tabs — needed to detect multi-project spans. */
  tabs: readonly SessionTab[];
  /** sessionId → display name. */
  sessionNames: ReadonlyMap<string, string>;
  /** sessionId → project root (cwd). */
  sessionCwds: ReadonlyMap<string, string>;
}

export interface TabDisplayTitle {
  /** Raw title: session display name, or null for draft tabs (the caller
   * supplies the translated "New session" label). */
  title: string | null;
  /** Full cwd for the tooltip. Empty when unknown. */
  cwd: string;
  /** Project name prefix, shown only when open tabs span ≥2 distinct
   * projects. Never set for draft tabs (their title stays "New session"),
   * but draft cwds do count toward the ≥2-project determination. */
  projectPrefix?: string;
}

/**
 * Compute the display title parts for one tab. Pure: same inputs → same
 * output. Project prefix appears only when the open tabs collectively cover
 * ≥2 distinct project roots (session cwds plus draft cwds).
 */
export function tabDisplayTitle(
  tab: SessionTab,
  ctx: TabTitleContext,
): TabDisplayTitle {
  const isDraft = tab.draftCwd !== undefined;
  const cwd = isDraft ? (tab.draftCwd ?? "") : ctx.sessionCwds.get(tab.sessionId ?? "") ?? "";
  let title: string | null = null;
  if (!isDraft) {
    title =
      tab.sessionId !== undefined
        ? ctx.sessionNames.get(tab.sessionId) ?? tab.sessionId
        : "";
  }
  // Distinct project roots across all open tabs; draft cwds count too.
  const roots = new Set<string>();
  for (const t of ctx.tabs) {
    const root = t.draftCwd ?? (t.sessionId !== undefined ? ctx.sessionCwds.get(t.sessionId) : undefined);
    if (root) roots.add(root);
  }
  const projectPrefix = !isDraft && cwd && roots.size >= 2 ? projectDisplayName(cwd) : undefined;
  return { title, cwd, projectPrefix };
}

/**
 * Pick the adjacent tab id after closing `closedTabId`.
 * Left-preference: prefer left neighbor, then right, then null.
 */
export function pickAdjacentId(
  tabs: readonly SessionTab[],
  closedTabId: string,
): string | null {
  const idx = tabs.findIndex((t) => t.id === closedTabId);
  if (idx === -1) return null;
  // Prefer left, then right
  if (idx > 0) return tabs[idx - 1].id;
  if (tabs.length > 1) return tabs[1].id;
  return null;
}

// ── First-boot initialization ─────────────────────────────────────────────────

/**
 * Initialize tabs on first boot when no persisted state exists.
 * Uses the URL session param or the most recent session.
 */
export function initTabs(
  urlSessionId: string | null,
  recentSessionId: string | null,
): TabState {
  const sessionId = urlSessionId || recentSessionId;
  if (!sessionId) return { tabs: [], activeId: null };
  const tab: SessionTab = { id: crypto.randomUUID(), sessionId };
  return { tabs: [tab], activeId: tab.id };
}

/**
 * Build the URL search string that mirrors the active tab.
 * Returns `?session=<id>` or empty string when no active tab.
 */
export function buildUrlSearch(activeId: string | null, tabs: readonly SessionTab[]): string {
  if (!activeId) return "";
  const tab = tabs.find((t) => t.id === activeId);
  // Draft tabs have no session id yet — mirror no ?session param.
  if (!tab || tab.sessionId === undefined) return "";
  return `?session=${encodeURIComponent(tab.sessionId)}`;
}
