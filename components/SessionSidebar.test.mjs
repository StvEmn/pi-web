import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { getSessionTreeIndices } = await jiti.import("./SessionSidebar.tsx");

const source = await readFile(
  new URL("./SessionSidebar.tsx", import.meta.url),
  "utf8",
);
const sessionItemSource = source.slice(source.indexOf("function SessionItem("));

// 5 groups × (1 header + 100 sessions), laid out like the group tree.
function treeGeometry(groups = 5, sessionsPerGroup = 100) {
  const tops = [];
  const heights = [];
  let offset = 0;
  for (let g = 0; g < groups; g++) {
    tops.push(offset);
    heights.push(32);
    offset += 32;
    for (let i = 0; i < sessionsPerGroup; i++) {
      tops.push(offset);
      heights.push(54);
      offset += 54;
    }
  }
  return { tops, heights };
}

test("scrolling keeps the focused row and the visible window mounted without expanding the whole window", () => {
  const { tops, heights } = treeGeometry();
  for (const [scrollTop, focusedIndex] of [
    [0, 504],
    [5000, 0],
  ]) {
    const indices = getSessionTreeIndices(
      tops,
      heights,
      scrollTop,
      335,
      focusedIndex,
    );
    const firstVisible = tops.findIndex(
      (top, i) => top + heights[i] > scrollTop,
    );
    const lastVisible = tops.findLastIndex((top) => top < scrollTop + 335);
    for (let index = firstVisible; index <= lastVisible; index++)
      assert.ok(indices.includes(index));
    assert.ok(indices.includes(focusedIndex));
    assert.equal(new Set(indices).size, indices.length);
    assert.deepEqual(
      indices,
      [...indices].sort((a, b) => a - b),
    );
  }
  const blurred = getSessionTreeIndices(tops, heights, 5000, 335);
  assert.ok(!blurred.includes(0));
});

test("tree windows stay valid for empty, single-row and unmeasured viewports", () => {
  assert.deepEqual(getSessionTreeIndices([], [], 80000, 335, 1999), []);
  const single = treeGeometry(1, 1);
  // A focused row beyond the window stays mounted even when nothing else is visible.
  assert.deepEqual(
    getSessionTreeIndices(single.tops, single.heights, 80000, 335, 0),
    [0],
  );
  assert.deepEqual(
    getSessionTreeIndices(single.tops, single.heights, 0, 335),
    [0, 1],
  );
  const { tops, heights } = treeGeometry();
  assert.equal(getSessionTreeIndices(tops, heights, 0, 0).length > 0, true);
});

test("only Shift+click bypasses session deletion confirmation", () => {
  assert.match(
    sessionItemSource,
    /const handleDeleteClick[\s\S]*?if \(e\.shiftKey\) \{\s*void performDelete\(\);\s*\} else \{\s*setConfirmDelete\(true\);/,
  );
});

test("does not register row-level session deletion shortcuts", () => {
  assert.doesNotMatch(sessionItemSource, /const handleKeyDown/);
  assert.doesNotMatch(sessionItemSource, /onKeyDown=\{handleKeyDown\}/);
  assert.doesNotMatch(sessionItemSource, /tabIndex=\{0\}/);
});

test("polls running sessions only while the tab is visible", () => {
  assert.doesNotMatch(
    source,
    /new EventSource\("\/api\/agent\/running\/events"\)/,
  );
  assert.match(source, /fetch\("\/api\/agent\/running"/);
  assert.match(source, /document\.visibilityState !== "visible"/);
  assert.match(
    source,
    /document\.addEventListener\("visibilitychange", onVisibilityChange\)/,
  );
});

test("exposes the polled running-session set to the shell", () => {
  assert.match(
    source,
    /onRunningSessionIdsChange\?: \(ids: Set<string>\) => void/,
  );
  assert.match(source, /onRunningSessionIdsChange\?\.\(runningSessionIds\)/);
});

test("exposes the loaded session catalog to the shell", () => {
  assert.match(
    source,
    /onSessionsChange\?: \(sessions: SessionInfo\[\]\) => void/,
  );
  assert.match(source, /onSessionsChange\?\.\(allSessions\)/);
});

test("subagent completion stays silent and never becomes unread", () => {
  assert.match(
    source,
    /completionNotificationSuppressedSessionIds\?: string\[\]/,
  );
  assert.match(
    source,
    /completedWithNotifications = completedInBackground\.filter\([\s\S]*?!previousSuppressedCompletionSessionIdsRef\.current\.has\(id\)[\s\S]*?!knownSubagentIds\.has\(id\)/,
  );
  assert.match(
    source,
    /completedWithNotifications\.forEach\(\(id\) => next\.add\(id\)\)/,
  );
  assert.match(
    source,
    /if \(completedWithNotifications\.length > 0\) \{\s*onBackgroundTaskDone\?\.\(\)/,
  );
  assert.match(
    source,
    /filter\(\(session\) => session\.relation\?\.kind !== "subagent"\)[\s\S]*?unreadEligibleIds\.has\(id\)/,
  );
});

test("includes project activity counts in accessible labels", () => {
  assert.match(
    source,
    /aria-label=\{`\$\{t\("sidebar\.agentRunning"\)\} \(\$\{activity\.running\}\)`\}/,
  );
  assert.match(
    source,
    /aria-label=\{`\$\{t\("sidebar\.newSessionActivity"\)\} \(\$\{activity\.unread\}\)`\}/,
  );
});

test("formats session timestamps with the active locale", () => {
  assert.match(
    source,
    /import \{ formatRelativeTime \} from "@\/lib\/i18n\/format"/,
  );
  assert.match(sessionItemSource, /const \{ locale, t \} = useI18n\(\)/);
  assert.match(
    sessionItemSource,
    /formatRelativeTime\(session\.modified, locale\)/,
  );
});

test("does not persist an unchanged fallback title ending in whitespace", () => {
  assert.match(
    sessionItemSource,
    /const name = renameValue\.trim\(\);[\s\S]*?if \(renameValue === title \|\| name === \(session\.name \?\? ""\)\) return;/,
  );
});

test("offers the downstream context-menu hook only on a normal session row", () => {
  assert.match(
    sessionItemSource,
    /const handleContextMenu[\s\S]*?dispatchSessionRowContextMenu\(\{/,
  );
  assert.match(
    sessionItemSource,
    /onContextMenu=\{confirmDelete \|\| renaming \? undefined : handleContextMenu\}/,
  );
});

test("lifecycle refreshes bypass the cache while cross-window polling reuses it", () => {
  assert.match(
    source,
    /force \? "\/api\/sessions\?force=1" : "\/api\/sessions"/,
  );
  assert.match(source, /cache: "no-store"/);
  assert.match(source, /loadSessions\(isFirst, !isFirst\)/);
  assert.match(
    source,
    /data\.sessionListVersion !== sessionListVersionRef\.current[\s\S]*?await loadSessions\(\)/,
  );
  assert.doesNotMatch(
    source,
    /sessionRefreshDone|sessionRefreshTimerRef|title=\{t\("sidebar\.refresh"\)\}/,
  );
  assert.match(
    source,
    /loadSessions\(false, true\);[\s\S]*?onBackgroundTaskDone/,
  );
});

test("does not expose disk-backed actions for transient sessions", () => {
  assert.match(sessionItemSource, /if \(session\.transient\) return;/);
  assert.match(sessionItemSource, /\{hovered && !session\.transient && \(/);
});

test("renders an all-projects group tree instead of the project dropdown", () => {
  assert.doesNotMatch(
    source,
    /dropdownOpen|projectFilter|filteredSessions|hasOtherWorkspaceActivity/,
  );
  assert.match(
    source,
    /getRecentProjects\(allSessions\)\.map\(\(project\) => \(\{/,
  );
  assert.match(
    source,
    /listSessionFamilies\(\s*sessionsForProject\(allSessions, project\.key\),?\s*\)/,
  );
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /projectDisplayName\(row\.group\.root\)/);
  assert.match(source, /toggleGroup\(row\.group\.key\)/);
  assert.match(source, /loadExpandedGroupKeys\(\)/);
  assert.match(source, /pi-web:sidebar-expanded-groups-v1/);
  assert.match(
    source,
    /expandedGroupKeys \? expandedGroupKeys\.has\(key\) : index === 0/,
  );
});

test("group header + opens a draft tab in that project's cwd", () => {
  assert.match(source, /handleGroupNewSession\(row\.group\.root\)/);
  assert.match(source, /onNewSession\?\.\(createTempSessionId\(\), cwd\)/);
});

test("custom path and default directory entries survive the dropdown removal", () => {
  assert.match(source, /onClick=\{handleCustomPathClick\}/);
  assert.match(source, /onClick=\{handleDefaultCwd\}/);
  assert.match(source, /initialPath=\{customPathValue\}/);
});

test("hides subagent rows and aggregates their state into the main session row", () => {
  assert.match(
    source,
    /familySessions\.some\(\s*\(session\) => session\.id === selectedSessionId,?\s*\)/,
  );
  assert.match(
    source,
    /familySessions\.some\(\(session\) =>\s*runningSessionIds\.has\(session\.id\),?\s*\)/,
  );
  assert.doesNotMatch(source, /function SessionTreeItem/);
});
