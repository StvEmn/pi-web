import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Layout-regression source assertions for the session-tabs layout amendment:
// the tab bar lives at the top of the CENTER column (not the window), the
// sidebar toggle returned to the tool top bar, and tabs are width-capped.
const appShellSource = readFileSync(
  fileURLToPath(new URL("./AppShell.tsx", import.meta.url)),
  "utf8",
);
const tabBarSource = readFileSync(
  fileURLToPath(new URL("./SessionTabBar.tsx", import.meta.url)),
  "utf8",
);

test("layout: SessionTabBar renders inside the center column, not above the sidebar", () => {
  // The center column starts at the "Center: chat" marker; the tab bar must
  // appear after it (inside) rather than before it (window-wide row).
  const centerIdx = appShellSource.indexOf("{/* Center: chat */}");
  const tabIdx = appShellSource.indexOf("<SessionTabBar");
  assert.ok(centerIdx > -1, "center column marker not found");
  assert.ok(tabIdx > -1, "SessionTabBar usage not found");
  assert.ok(
    tabIdx > centerIdx,
    "SessionTabBar must be inside the center column (after its marker)",
  );
  // And it must not sit in the root column above the sidebar row anymore.
  const rootRowIdx = appShellSource.indexOf(
    'display: "flex", flex: 1, minHeight: 0',
  );
  assert.ok(rootRowIdx > -1, "root sidebar/center row not found");
  assert.ok(
    tabIdx > rootRowIdx,
    "SessionTabBar must come after the root row (i.e. be nested in the center column)",
  );
});

test("layout: sidebar toggle button lives in the tool top bar", () => {
  const topBarIdx = appShellSource.indexOf("{/* Top bar */}");
  assert.ok(topBarIdx > -1, "top bar marker not found");
  const slice = appShellSource.slice(topBarIdx, topBarIdx + 4000);
  assert.ok(
    slice.includes("handleSidebarToggle"),
    "tool top bar must call handleSidebarToggle",
  );
  assert.ok(
    slice.includes('translate("sidebar.hide")'),
    "tool top bar toggle must reuse the sidebar.hide/show labels",
  );
});

test("layout: SessionTabBar owns no sidebar toggle props", () => {
  assert.doesNotMatch(
    tabBarSource,
    /sidebarOpen|onSidebarToggle/,
    "SessionTabBar must not receive sidebar state or toggle props",
  );
});

test("layout: tab body is width-capped at 220px", () => {
  assert.match(
    tabBarSource,
    /maxWidth: 220/,
    "tab element style must cap width at 220px",
  );
});
