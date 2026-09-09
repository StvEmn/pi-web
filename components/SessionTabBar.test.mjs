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
  assert.match(source, /aria-label=\{title\}/);
});

test("close button has accessible label", () => {
  assert.match(source, /aria-label=\{translate\("sessionTabs\.closeTabNamed", \{ title \}\)\}/);
});

test("sidebar toggle button has aria-label", () => {
  assert.match(
    source,
    /aria-label=\{sidebarOpen \? translate\("sidebar\.hide"\) : translate\("sidebar\.show"\)\}/,
  );
});
