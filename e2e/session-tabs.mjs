// Session tabs E2E: open, switch, close, refresh restore.
// Run manually: node e2e/session-tabs.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { message, writeSession } from "./fixtures.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, "test-results/e2e-session-tabs");
mkdirSync(artifacts, { recursive: true });

const agentDir = mkdtempSync(join(tmpdir(), "pi-web-tabs-e2e-"));

// Fixture: 3 sessions — A and B in project-a, C in project-b (cross-project
// tab prefix scenario, ticket 04).
const projectA = join(agentDir, "project-a");
const projectB = join(agentDir, "project-b");
const sessionDirA = join(agentDir, "sessions", "project-a");
const sessionDirB = join(agentDir, "sessions", "project-b");
mkdirSync(projectA, { recursive: true });
mkdirSync(projectB, { recursive: true });
mkdirSync(sessionDirA, { recursive: true });
mkdirSync(sessionDirB, { recursive: true });

const SESSION_A = "tabs-e2e-session-a";
const SESSION_B = "tabs-e2e-session-b";
const SESSION_C = "tabs-e2e-session-c";
const SESSION_D = "tabs-e2e-session-d";

// Fixture: 2 sessions in different projects
const sessionAEntries = [
  message("a0", null, "user", "Session A first message"),
  message("a1", "a0", "assistant", "Session A assistant reply"),
];
for (let i = 0; i < 20; i++) {
  const parent = sessionAEntries.at(-1).id;
  // Alternate user/assistant so messages render as separate bubbles — a
  // run of assistant-only messages collapses into one ProcessDetailsGroup,
  // which makes the chat too short to scroll (breaks the scroll-restore test).
  const role = i % 2 === 0 ? "user" : "assistant";
  sessionAEntries.push(
    message(
      `a-fill-${i}`,
      parent,
      role,
      `Session A filler paragraph ${i}.\n\n`.repeat(10),
    ),
  );
}
writeSession(sessionDirA, SESSION_A, sessionAEntries, projectA);

writeSession(
  sessionDirA,
  SESSION_B,
  [
    message("b0", null, "user", "Session B first message"),
    message("b1", "b0", "assistant", "Session B assistant reply"),
  ],
  projectA,
);

writeSession(
  sessionDirB,
  SESSION_C,
  [
    message("c0", null, "user", "Session C first message"),
    message("c1", "c0", "assistant", "Session C assistant reply"),
  ],
  projectB,
);

// Long-title session for the tab width-cap assertion (layout spec).
const LONG_TITLE =
  "Session D with an extremely long first message title that deliberately exceeds the 220px tab width ceiling";
writeSession(
  sessionDirB,
  SESSION_D,
  [message("d0", null, "user", LONG_TITLE)],
  projectB,
);

let server;
let serverExited;
let browser;
const serverLog = createWriteStream(join(artifacts, "server.log"));

const interrupt = () => {
  process.exitCode = 1;
  try {
    server?.kill("SIGTERM");
  } catch {}
  void browser?.close().catch(() => {});
};
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

try {
  // Find an available port
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  const base = `http://127.0.0.1:${port}`;

  // Start dev server
  server = spawn(
    process.execPath,
    [
      join(root, "node_modules/next/dist/bin/next"),
      "dev",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: agentDir,
        PI_WEB_PASSWORD: "",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.once("error", (error) => {
    throw error;
  });
  serverExited = once(server, "exit");
  server.stdout.pipe(serverLog, { end: false });
  server.stderr.pipe(serverLog, { end: false });

  // Wait for readiness
  const deadline = Date.now() + 120_000;
  while (true) {
    assert.equal(server.exitCode, null, "Server exited before readiness");
    const response = await fetch(`${base}/api/sessions`, {
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    if (response?.ok) {
      const { sessions } = await response.json();
      const ids = sessions.map((s) => s.id).sort();
      assert.deepEqual(ids, [SESSION_A, SESSION_B, SESSION_C, SESSION_D].sort());
      break;
    }
    assert.ok(Date.now() < deadline, "Server readiness timed out");
    await delay(250);
  }

  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (event) => {
    if (event.type() === "error") errors.push(event.text());
  });

  // Start on session A
  await page.goto(`${base}/?session=${SESSION_A}`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByText("Session A first message", { exact: true })
    .first()
    .waitFor();

  // Verify tab bar appeared with session A tab
  const tablist = page.getByRole("tablist", { name: "Session tabs" });
  await tablist.waitFor();
  const tabA = page.getByRole("tab", { name: /Session A first message/i });
  await tabA.waitFor();
  assert.equal(await tabA.getAttribute("aria-selected"), "true");
  console.log("PASS: session A opens in a tab");

  // Click session B in the sidebar
  await page
    .getByText("Session B first message", { exact: true })
    .first()
    .click();
  await page
    .getByText("Session B first message", { exact: true })
    .first()
    .waitFor();

  // Verify two tabs exist
  const tabB = page.getByRole("tab", { name: /Session B first message/i });
  await tabB.waitFor();
  assert.equal(await tabB.getAttribute("aria-selected"), "true");
  assert.equal(await tabA.getAttribute("aria-selected"), "false");
  console.log("PASS: session B opens as second tab, A deactivated");

  // Click tab A to reactivate. User messages never collapse into process
  // groups, so the first user message is the stable visibility anchor.
  await tabA.click();
  await page
    .getByText("Session A first message", { exact: true })
    .first()
    .waitFor();
  assert.equal(await tabA.getAttribute("aria-selected"), "true");
  assert.equal(await tabB.getAttribute("aria-selected"), "false");
  console.log("PASS: clicking tab A reactivates it, content correct");

  // Re-click session B in sidebar — should activate existing tab, not create new
  await page
    .getByText("Session B first message", { exact: true })
    .first()
    .click();
  await page
    .getByText("Session B first message", { exact: true })
    .first()
    .waitFor();
  const allTabs = tablist.getByRole("tab");
  assert.equal(
    await allTabs.count(),
    2,
    "Re-clicking must not create a third tab",
  );
  console.log("PASS: sidebar re-click activates existing tab");

  // Close tab B via its close button
  const closeB = tabB.getByRole("button", { name: /Close tab/i });
  await closeB.click();
  // Tab B should be removed, tab A should be active
  await tabB.waitFor({ state: "detached" });
  await tabA.waitFor();
  assert.equal(await tabA.getAttribute("aria-selected"), "true");
  assert.equal(await allTabs.count(), 1);
  console.log("PASS: closing tab B selects tab A (left adjacent)");

  // Refresh and verify tab list restores
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .getByText("Session A first message", { exact: true })
    .first()
    .waitFor();
  const restoredTabA = page
    .getByRole("tablist", { name: "Session tabs" })
    .getByRole("tab", { name: /Session A first message/i });
  await restoredTabA.waitFor();
  // selectedSession restore is async (catalog + workspace-memory); poll for
  // the tab to actually become selected instead of asserting immediately.
  {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const sel = await restoredTabA.getAttribute("aria-selected");
      const url = new URL(page.url());
      if (sel === "true" && url.searchParams.get("session") === SESSION_A)
        break;
      await delay(250);
    }
  }
  assert.equal(await restoredTabA.getAttribute("aria-selected"), "true");
  // The closed session must not resurrect: exactly one tab survives reload.
  assert.equal(
    await allTabs.count(),
    1,
    "Closed session tab must not resurrect on reload",
  );
  console.log("PASS: refresh restores tab list and active state");

  // Verify URL mirrors active tab
  const url = new URL(page.url());
  assert.equal(url.searchParams.get("session"), SESSION_A);
  console.log("PASS: URL mirrors active tab session");

  // ── Scroll restoration across tab switch ────────────────────────────────
  // Open session B in a second tab
  await page
    .getByText("Session B first message", { exact: true })
    .first()
    .click();
  await page
    .getByText("Session B first message", { exact: true })
    .first()
    .waitFor();

  // Switch back to session A and scroll to a specific position.
  // Chat auto-scrolls to the live tail on mount, so wait for any A-owned
  // message text (the tail fillers are reliably rendered) before scrolling.
  await page.getByRole("tab", { name: /Session A first message/i }).click();
  await page
    .getByText("Session A filler paragraph 19", { exact: false })
    .first()
    .waitFor();

  const scrollContainer = page.locator(".overflow-y-auto").first();
  await scrollContainer.evaluate((el) => {
    el.scrollTop = el.scrollHeight / 3;
  });
  await delay(200);
  const scrollTopBefore = await scrollContainer.evaluate((el) => el.scrollTop);
  assert.ok(scrollTopBefore > 0, "Must have scrolled down");

  // Switch to session B
  await page.getByRole("tab", { name: /Session B first message/i }).click();
  await page
    .getByText("Session B first message", { exact: true })
    .first()
    .waitFor();

  // Switch back to session A — scroll must restore
  await page.getByRole("tab", { name: /Session A first message/i }).click();
  await page
    .getByText("Session A filler paragraph 19", { exact: false })
    .first()
    .waitFor();
  const scrollTopAfter = await scrollContainer.evaluate((el) => el.scrollTop);
  assert.ok(
    Math.abs(scrollTopAfter - scrollTopBefore) < 50,
    `Scroll position must restore (before=${scrollTopBefore}, after=${scrollTopAfter})`,
  );
  console.log("PASS: scroll position restores after tab switch");

  // ── Keyboard: roving tabindex + arrow keys (ticket 04) ────────────────
  // Tabs are [A, B], A active. Tab onto the tablist, then arrow around.
  await tabA.focus();
  assert.equal(await tabA.getAttribute("aria-selected"), "true");
  await page.keyboard.press("ArrowRight");
  await page
    .getByText("Session B first message", { exact: true })
    .first()
    .waitFor();
  assert.equal(await tabB.getAttribute("aria-selected"), "true");
  assert.equal(await tabA.getAttribute("aria-selected"), "false");
  await page.keyboard.press("Home");
  await page
    .getByText("Session A first message", { exact: true })
    .first()
    .waitFor();
  assert.equal(await tabA.getAttribute("aria-selected"), "true");
  await page.keyboard.press("End");
  await page
    .getByText("Session B first message", { exact: true })
    .first()
    .waitFor();
  assert.equal(await tabB.getAttribute("aria-selected"), "true");
  await page.keyboard.press("ArrowLeft");
  await page
    .getByText("Session A first message", { exact: true })
    .first()
    .waitFor();
  assert.equal(await tabA.getAttribute("aria-selected"), "true");
  console.log("PASS: arrow keys / Home / End move tab selection");

  // ── Layout: tab bar lives below the tool top bar (second row) in the center column (layout spec) ──
  {
    const tablistBox = await tablist.boundingBox();
    const sidebarBox = await page.locator("#session-sidebar").boundingBox();
    assert.ok(
      tablistBox.x >= sidebarBox.x + sidebarBox.width - 1,
      `tab bar must start at/beyond the sidebar's right edge (tab x=${tablistBox.x}, sidebar right=${sidebarBox.x + sidebarBox.width})`,
    );
    const toggle = page.getByRole("button", { name: "Hide sidebar", exact: true });
    const topBar = await toggle.boundingBox();
    assert.ok(topBar, "sidebar toggle must exist in the tool top bar");
    assert.ok(
      topBar.y + topBar.height <= tablistBox.y + 1,
      `tool top bar (with sidebar toggle) must sit above the tab bar (topBar bottom=${topBar.y + topBar.height}, tab top=${tablistBox.y})`,
    );
    assert.ok(
      Math.abs(topBar.x - tablistBox.x) < 1,
      `sidebar toggle must sit at the left end of the center column (toggle x=${topBar.x}, tablist x=${tablistBox.x})`,
    );
    // Collapse the sidebar: the tab bar must reach the window's left edge.
    await toggle.click();
    await page.waitForTimeout(300); // sidebar collapse transition
    const collapsedBox = await tablist.boundingBox();
    assert.ok(
      collapsedBox.x <= 1,
      `tab bar must touch the window's left edge when the sidebar is collapsed (x=${collapsedBox.x})`,
    );
    // Restore for the later sidebar-click scenarios.
    await page.getByRole("button", { name: "Show sidebar", exact: true }).click();
    await page.locator("#session-sidebar").waitFor();
  }
  console.log("PASS: tab bar sits at the top of the center column");

  // ── Cross-project title prefix (ticket 04) ───────────────────────────
  // Same-project tabs [A, B]: no prefix. Tooltip shows full title + cwd.
  {
    const titleAttr = await tabA.getAttribute("title");
    assert.ok(!titleAttr.includes("·"), "single-project tab must have no prefix");
    assert.ok(titleAttr.includes(projectA), `tooltip must include cwd: ${titleAttr}`);
  }
  // Open session C (project-b) — tabs now span 2 projects → prefix appears.
  // The sidebar groups by project and starts with one group expanded; expand
  // the project-b group first (ticket 03's group tree).
  const groupB = page.getByRole("button", { name: "project-b", exact: true });
  await groupB.waitFor();
  if ((await groupB.getAttribute("aria-expanded")) !== "true") await groupB.click();
  await page
    .getByText("Session C first message", { exact: true })
    .first()
    .click();
  await page
    .getByText("Session C first message", { exact: true })
    .first()
    .waitFor();
  const tabC = page.getByRole("tab", { name: /Session C first message/i });
  await tabC.waitFor();
  assert.equal(await tabC.getAttribute("aria-selected"), "true");
  {
    const titleA = await tabA.getAttribute("title");
    assert.ok(
      titleA.startsWith("project-a · "),
      `cross-project tab A must carry a project prefix: ${titleA}`,
    );
    assert.ok(titleA.includes(projectA), "tooltip still includes cwd");
    const titleC = await tabC.getAttribute("title");
    assert.ok(
      titleC.startsWith("project-b · "),
      `cross-project tab C must carry a project prefix: ${titleC}`,
    );
  }
  console.log("PASS: cross-project tabs show a project name prefix");

  // ── Tab width cap at 220px with a long title (layout spec) ──────────
  {
    // Open the long-title session D (project-b group is already expanded).
    // The sidebar truncates titles to 50 chars; the tab keeps the full title.
    await page
      .getByText(LONG_TITLE.slice(0, 50), { exact: true })
      .first()
      .click();
    const tabD = page.getByRole("tab", { name: new RegExp(LONG_TITLE.slice(0, 30), "i") });
    await tabD.waitFor();
    const box = await tabD.boundingBox();
    assert.ok(
      Math.abs(box.width - 220) < 1,
      `long-title tab must be exactly at the 220px cap (got ${box.width})`,
    );
    // Ellipsis: the title span's content is clipped (scroll > client).
    const clipped = await tabD.locator("span").first().evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    assert.ok(clipped, "long title must be clipped with ellipsis");
    // Tooltip still carries the full title.
    const titleAttr = await tabD.getAttribute("title");
    assert.ok(titleAttr.includes(LONG_TITLE), "tooltip must keep the full title");
    // Close D to restore the [A, B, C] state for the context-menu scenarios.
    await tabD.getByRole("button", { name: /Close tab/i }).click();
    await tabD.waitFor({ state: "detached" });
  }
  console.log("PASS: long title capped at 220px, ellipsized, full tooltip");

  // ── Context menu: close right (ticket 04) ─────────────────────────
  // Tabs are [A, B, C]; right-click the middle tab (B) → only its left side stays.
  await tabB.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Tab actions" });
  await menu.waitFor();
  assert.equal(await menu.getByRole("menuitem").count(), 3, "menu has three actions");
  await menu.getByRole("menuitem", { name: "Close tabs to the right" }).click();
  await tabC.waitFor({ state: "detached" });
  assert.equal(await tablist.getByRole("tab").count(), 2, "close-right leaves the left 2 tabs");
  {
    // Back to a single project → prefix must disappear.
    const titleA = await tabA.getAttribute("title");
    assert.ok(!titleA.includes("·"), `prefix must disappear when back to one project: ${titleA}`);
  }
  console.log("PASS: context menu close-right leaves left tabs and drops the prefix");

  // ── Context menu: close others (ticket 04) ──────────────────────────
  await tabB.click({ button: "right" });
  await page.getByRole("menu", { name: "Tab actions" }).waitFor();
  await page.getByRole("menuitem", { name: "Close other tabs" }).click();
  await tabA.waitFor({ state: "detached" });
  assert.equal(await tablist.getByRole("tab").count(), 1, "close-others leaves only the target tab");
  assert.equal(await tabB.getAttribute("aria-selected"), "true");
  console.log("PASS: context menu close-others keeps only the right-clicked tab");

  assert.deepEqual(errors, [], "No browser errors");
  console.log("\nAll session tabs E2E tests passed!");

  await context.tracing.stop();
  await context.close();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill("SIGTERM");
    const forceKill = setTimeout(() => server.kill("SIGKILL"), 10_000);
    await serverExited;
    clearTimeout(forceKill);
  }
  serverLog.end();
  rmSync(agentDir, { recursive: true, force: true });
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
}
