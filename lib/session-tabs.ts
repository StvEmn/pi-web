/**
 * Session tab state module — pure functions for the session tab bar.
 *
 * A tab is a lightweight view wrapper: `{ id, sessionId }`. Closing a tab
 * never stops the session; the session continues in the background and can be
 * re-opened from the sidebar at any time.
 *
 */

export interface SessionTab {
  /** Stable unique id for this tab (crypto.randomUUID). */
  id: string;
  /** The session displayed in this tab. Always set for non-draft tabs. */
  sessionId: string;
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
      if (
        tab &&
        typeof tab === "object" &&
        typeof (tab as SessionTab).id === "string" &&
        typeof (tab as SessionTab).sessionId === "string"
      ) {
        validTabs.push({
          id: (tab as SessionTab).id,
          sessionId: (tab as SessionTab).sessionId,
        });
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
  if (!tab) return "";
  return `?session=${encodeURIComponent(tab.sessionId)}`;
}
