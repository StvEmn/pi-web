import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./SessionTabBar.tsx", import.meta.url),
  "utf8",
);

test("uses role=tablist with aria-label on the tab container", () => {
  assert.match(source, /role="tablist"/);
  assert.match(source, /aria-label=\{translate\("sessionTabs\.ariaLabel"\)\}/);
});

test("each tab uses role=tab with aria-selected", () => {
  assert.match(source, /role="tab"/);
  assert.match(source, /aria-selected=\{isActive\}/);
});

test("each tab has an aria-label for the session title", () => {
  assert.match(source, /aria-label=\{displayTitle\}/);
});

test("draft tabs render the translated \u65b0\u4f1a\u8bdd title", () => {
  assert.match(source, /const isDraft = tab\.draftCwd !== undefined;/);
  assert.match(source, /isDraft \? translate\("sessionTabs\.newTab"\)/);
});

test("close button has accessible label", () => {
  assert.match(source, /aria-label=\{translate\("sessionTabs\.closeTabNamed", \{ title: displayTitle \}\)\}/);
});

test("project prefix appears only when tabs span multiple projects", () => {
  assert.match(source, /tabDisplayTitle\(tab, titleCtx\)/);
  assert.match(source, /info\.projectPrefix\s*\n\s*\? `\$\{info\.projectPrefix\} · \$\{rawTitle\}`\s*\n\s*: rawTitle/);
});

test("sidebar toggle button has aria-label", () => {
  assert.match(
    source,
    /aria-label=\{sidebarOpen \? translate\("sidebar\.hide"\) : translate\("sidebar\.show"\)\}/,
  );
});

// ── Context menu (ticket 04) ───────────────────────────────────────────────

test("tab context menu renders role=menu with three menuitem actions", () => {
  assert.match(source, /role="menu"/);
  assert.match(source, /role="menuitem"/);
  // close / close-others / close-right, all three wired to handlers
  assert.match(source, /sessionTabs\.close"/);
  assert.match(source, /sessionTabs\.closeOthers"/);
  assert.match(source, /sessionTabs\.closeRight"/);
  assert.match(source, /onCloseOthers/);
  assert.match(source, /onCloseRight/);
});

test("context menu is keyboard-reachable via Menu or Shift+F10", () => {
  assert.match(source, /ContextMenu/);
  assert.match(source, /F10/);
});

test("context menu focuses first item on open and returns focus on Esc", () => {
  assert.match(source, /querySelector<HTMLButtonElement>\("button"\)\?\.focus\(\)/);
  assert.match(source, /closeMenu\(true\)/);
});

// ── Roving tabindex + arrow keys (ticket 04) ──────────────────────────────

test("tabs use roving tabindex with arrow-key navigation", () => {
  assert.match(source, /tabIndex=\{isActive \? 0 : -1\}/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /onActivate\(target\.id\)/);
});

// ── Running indicator (ticket 04) ──────────────────────────────────────────

test("running sessions show a labelled dot; prop branches on the session id", () => {
  assert.match(source, /runningSessionIds/);
  assert.match(source, /runningSessionIds\.has\(tab\.sessionId\)/);
  assert.match(source, /sessionTabs\.running"/);
});

// ── Overflow + tooltip (ticket 04) ───────────────────────────────────────

test("tabs keep a minimum width and the tooltip includes the full cwd", () => {
  assert.match(source, /minWidth: 36/);
  assert.match(source, /const tooltip = info\.cwd \? `\$\{displayTitle\}\\n\$\{info\.cwd\}` : displayTitle;/);
});
