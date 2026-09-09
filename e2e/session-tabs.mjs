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

// Both sessions live in the same project, so both sit in one sidebar group.
const projectA = join(agentDir, "project-a");
const sessionDirA = join(agentDir, "sessions", "project-a");
mkdirSync(projectA, { recursive: true });
mkdirSync(sessionDirA, { recursive: true });

const SESSION_A = "tabs-e2e-session-a";
const SESSION_B = "tabs-e2e-session-b";

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
      assert.deepEqual(ids, [SESSION_A, SESSION_B].sort());
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
