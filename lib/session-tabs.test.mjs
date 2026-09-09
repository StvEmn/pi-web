import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  loadTabs,
  saveTabs,
  openTab,
  closeTab,
  activateTab,
  closeOthers,
  closeRight,
  pickAdjacentId,
  initTabs,
  buildUrlSearch,
} = await jiti.import("./session-tabs.ts");

// ponytail: crypto.randomUUID polyfill for Node < 22
if (typeof crypto === "undefined" || !crypto.randomUUID) {
  const { webcrypto } = await import("node:crypto");
  globalThis.crypto = webcrypto;
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

const STORAGE_KEY = "pi-web:session-tabs-v1";

// ── loadTabs ─────────────────────────────────────────────────────────────────

test("loadTabs returns empty state when storage is null", () => {
  assert.deepEqual(loadTabs(null), { tabs: [], activeId: null });
});

test("loadTabs returns empty state when no persisted data", () => {
  assert.deepEqual(loadTabs(createStorage()), { tabs: [], activeId: null });
});

test("loadTabs round-trips a valid state", () => {
  const storage = createStorage();
  const state = { tabs: [{ id: "t1", sessionId: "s1" }], activeId: "t1" };
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
  assert.deepEqual(loadTabs(storage), state);
});

test("loadTabs ignores corrupt JSON", () => {
  const storage = createStorage({ [STORAGE_KEY]: "{not-json" });
  assert.deepEqual(loadTabs(storage), { tabs: [], activeId: null });
});

test("loadTabs ignores wrong-shaped data", () => {
  const storage = createStorage({ [STORAGE_KEY]: `"just a string"` });
  assert.deepEqual(loadTabs(storage), { tabs: [], activeId: null });
});

test("loadTabs ignores array-shaped data", () => {
  const storage = createStorage({ [STORAGE_KEY]: "[]" });
  assert.deepEqual(loadTabs(storage), { tabs: [], activeId: null });
});

test("loadTabs filters out malformed tabs", () => {
  const state = {
    tabs: [
      { id: "t1", sessionId: "s1" },
      { id: "t2" }, // missing sessionId → invalid
      { sessionId: "s3" }, // missing id → invalid
      null,
      42,
    ],
    activeId: "t1",
  };
  const storage = createStorage({ [STORAGE_KEY]: JSON.stringify(state) });
  const loaded = loadTabs(storage);
  assert.equal(loaded.tabs.length, 1);
  assert.equal(loaded.tabs[0].id, "t1");
  assert.equal(loaded.tabs[0].sessionId, "s1");
  assert.equal(loaded.activeId, "t1");
});

test("loadTabs resolves activeId to null when it references no valid tab", () => {
  const state = {
    tabs: [{ id: "t1", sessionId: "s1" }],
    activeId: "nonexistent",
  };
  const storage = createStorage({ [STORAGE_KEY]: JSON.stringify(state) });
  assert.equal(loadTabs(storage).activeId, null);
});

test("loadTabs resolves activeId to null when empty string", () => {
  const state = {
    tabs: [{ id: "t1", sessionId: "s1" }],
    activeId: "",
  };
  const storage = createStorage({ [STORAGE_KEY]: JSON.stringify(state) });
  assert.equal(loadTabs(storage).activeId, null);
});

// ── saveTabs ─────────────────────────────────────────────────────────────────

test("saveTabs persists state to storage", () => {
  const storage = createStorage();
  const state = { tabs: [{ id: "t1", sessionId: "s1" }], activeId: "t1" };
  saveTabs(state, storage);
  assert.deepEqual(JSON.parse(storage.values.get(STORAGE_KEY)), state);
});

test("saveTabs is a no-op when storage is null", () => {
  assert.doesNotThrow(() =>
    saveTabs({ tabs: [{ id: "t1", sessionId: "s1" }], activeId: "t1" }, null),
  );
});

test("saveTabs survives storage errors", () => {
  const broken = {
    getItem() { return null; },
    setItem() { throw new Error("blocked"); },
    removeItem() {},
  };
  assert.doesNotThrow(() =>
    saveTabs({ tabs: [{ id: "t1", sessionId: "s1" }], activeId: "t1" }, broken),
  );
});

test("loadTabs survives storage errors", () => {
  const broken = {
    getItem() { throw new Error("blocked"); },
    setItem() {},
    removeItem() {},
  };
  assert.deepEqual(loadTabs(broken), { tabs: [], activeId: null });
});

// ── openTab ──────────────────────────────────────────────────────────────────

test("openTab creates a new tab when session not already open", () => {
  const state = { tabs: [], activeId: null };
  const result = openTab(state, "s1");
  assert.equal(result.tabs.length, 1);
  assert.equal(result.tabs[0].sessionId, "s1");
  assert.equal(result.activeId, result.tabs[0].id);
});

test("openTab activates existing tab when session is already open", () => {
  const tab = { id: "t1", sessionId: "s1" };
  const state = { tabs: [tab], activeId: null };
  const result = openTab(state, "s1");
  assert.equal(result.tabs.length, 1);
  assert.equal(result.tabs[0].id, "t1");
  assert.equal(result.activeId, "t1");
});

test("openTab does not mutate the input state", () => {
  const state = { tabs: [], activeId: null };
  openTab(state, "s1");
  assert.equal(state.tabs.length, 0);
});

// ── closeTab ─────────────────────────────────────────────────────────────────

test("closeTab removes the tab and picks left adjacent", () => {
  const tabs = [
    { id: "t1", sessionId: "s1" },
    { id: "t2", sessionId: "s2" },
    { id: "t3", sessionId: "s3" },
  ];
  const state = { tabs, activeId: "t2" };
  const result = closeTab(state, "t2");
  assert.equal(result.tabs.length, 2);
  assert.equal(result.tabs[0].id, "t1");
  assert.equal(result.tabs[1].id, "t3");
  assert.equal(result.activeId, "t1"); // left-preference
});

test("closeTab picks right when no left neighbor", () => {
  const tabs = [
    { id: "t1", sessionId: "s1" },
    { id: "t2", sessionId: "s2" },
  ];
  const state = { tabs, activeId: "t1" };
  const result = closeTab(state, "t1");
  assert.equal(result.tabs.length, 1);
  assert.equal(result.activeId, "t2");
});

test("closeTab sets activeId to null when last tab closed", () => {
  const tabs = [{ id: "t1", sessionId: "s1" }];
  const state = { tabs, activeId: "t1" };
  const result = closeTab(state, "t1");
  assert.deepEqual(result.tabs, []);
  assert.equal(result.activeId, null);
});

test("closeTab preserves activeId when closing a non-active tab", () => {
  const tabs = [
    { id: "t1", sessionId: "s1" },
    { id: "t2", sessionId: "s2" },
  ];
  const state = { tabs, activeId: "t2" };
  const result = closeTab(state, "t1");
  assert.equal(result.tabs.length, 1);
  assert.equal(result.activeId, "t2");
});

test("closeTab is a no-op for unknown tab id", () => {
  const tabs = [{ id: "t1", sessionId: "s1" }];
  const state = { tabs, activeId: "t1" };
  const result = closeTab(state, "unknown");
  assert.deepEqual(result, state);
});

// ── activateTab ──────────────────────────────────────────────────────────────

test("activateTab changes the active tab", () => {
  const tabs = [
    { id: "t1", sessionId: "s1" },
    { id: "t2", sessionId: "s2" },
  ];
  const state = { tabs, activeId: "t1" };
  assert.equal(activateTab(state, "t2").activeId, "t2");
});

test("activateTab is a no-op for unknown tab id", () => {
  const tabs = [{ id: "t1", sessionId: "s1" }];
  const state = { tabs, activeId: "t1" };
  assert.deepEqual(activateTab(state, "unknown"), state);
});

// ── closeOthers ──────────────────────────────────────────────────────────────

test("closeOthers keeps only the active tab", () => {
  const tabs = [
    { id: "t1", sessionId: "s1" },
    { id: "t2", sessionId: "s2" },
    { id: "t3", sessionId: "s3" },
  ];
  const state = { tabs, activeId: "t2" };
  const result = closeOthers(state);
  assert.equal(result.tabs.length, 1);
  assert.equal(result.tabs[0].id, "t2");
  assert.equal(result.activeId, "t2");
});

test("closeOthers returns empty when no active tab", () => {
  const tabs = [{ id: "t1", sessionId: "s1" }];
  const result = closeOthers({ tabs, activeId: null });
  assert.deepEqual(result.tabs, []);
  assert.equal(result.activeId, null);
});

// ── closeRight ───────────────────────────────────────────────────────────────

test("closeRight removes tabs to the right of active", () => {
  const tabs = [
    { id: "t1", sessionId: "s1" },
    { id: "t2", sessionId: "s2" },
    { id: "t3", sessionId: "s3" },
  ];
  const state = { tabs, activeId: "t2" };
  const result = closeRight(state);
  assert.equal(result.tabs.length, 2);
  assert.equal(result.tabs[0].id, "t1");
  assert.equal(result.tabs[1].id, "t2");
  assert.equal(result.activeId, "t2");
});

test("closeRight is a no-op when active is last", () => {
  const tabs = [
    { id: "t1", sessionId: "s1" },
    { id: "t2", sessionId: "s2" },
  ];
  const state = { tabs, activeId: "t2" };
  assert.deepEqual(closeRight(state), state);
});

// ── pickAdjacentId ───────────────────────────────────────────────────────────

test("pickAdjacentId prefers left neighbor", () => {
  const tabs = [
    { id: "t1", sessionId: "s1" },
    { id: "t2", sessionId: "s2" },
    { id: "t3", sessionId: "s3" },
  ];
  assert.equal(pickAdjacentId(tabs, "t2"), "t1");
});

test("pickAdjacentId picks right when no left", () => {
  const tabs = [
    { id: "t1", sessionId: "s1" },
    { id: "t2", sessionId: "s2" },
  ];
  assert.equal(pickAdjacentId(tabs, "t1"), "t2");
});

test("pickAdjacentId returns null for single tab", () => {
  const tabs = [{ id: "t1", sessionId: "s1" }];
  assert.equal(pickAdjacentId(tabs, "t1"), null);
});

test("pickAdjacentId returns null for unknown id", () => {
  const tabs = [{ id: "t1", sessionId: "s1" }];
  assert.equal(pickAdjacentId(tabs, "unknown"), null);
});

// ── initTabs ─────────────────────────────────────────────────────────────────

test("initTabs creates single tab from URL session", () => {
  const result = initTabs("url-session", null);
  assert.equal(result.tabs.length, 1);
  assert.equal(result.tabs[0].sessionId, "url-session");
  assert.equal(result.activeId, result.tabs[0].id);
});

test("initTabs falls back to recent session when no URL session", () => {
  const result = initTabs(null, "recent-session");
  assert.equal(result.tabs.length, 1);
  assert.equal(result.tabs[0].sessionId, "recent-session");
  assert.equal(result.activeId, result.tabs[0].id);
});

test("initTabs prefers URL session over recent session", () => {
  const result = initTabs("url-session", "recent-session");
  assert.equal(result.tabs[0].sessionId, "url-session");
});

test("initTabs returns empty when no session available", () => {
  const result = initTabs(null, null);
  assert.deepEqual(result.tabs, []);
  assert.equal(result.activeId, null);
});

// ── buildUrlSearch ───────────────────────────────────────────────────────────

test("buildUrlSearch returns ?session= for active tab", () => {
  const tabs = [
    { id: "t1", sessionId: "s1" },
    { id: "t2", sessionId: "s2" },
  ];
  assert.equal(buildUrlSearch("t2", tabs), "?session=s2");
});

test("buildUrlSearch returns empty for null activeId", () => {
  assert.equal(buildUrlSearch(null, []), "");
});

test("buildUrlSearch returns empty for unknown activeId", () => {
  assert.equal(buildUrlSearch("unknown", [{ id: "t1", sessionId: "s1" }]), "");
});

test("buildUrlSearch encodes special characters", () => {
  const tabs = [{ id: "t1", sessionId: "has space&special" }];
  assert.equal(
    buildUrlSearch("t1", tabs),
    "?session=has%20space%26special",
  );
});

// ── Integration: load → mutate → save → load round-trip ──────────────────────

test("full round-trip: open, open, close, save, load", () => {
  const storage = createStorage();
  let state = { tabs: [], activeId: null };
  state = openTab(state, "s1");
  state = openTab(state, "s2");
  state = openTab(state, "s1"); // activate, don't duplicate
  assert.equal(state.tabs.length, 2);
  state = closeTab(state, state.tabs.find((t) => t.sessionId === "s1").id);
  assert.equal(state.tabs.length, 1);
  assert.equal(state.tabs[0].sessionId, "s2");
  saveTabs(state, storage);
  const loaded = loadTabs(storage);
  assert.deepEqual(loaded, state);
});
