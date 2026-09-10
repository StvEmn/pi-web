// Sidebar project group tree E2E (ticket 03): two project groups, session
// click opens a tab, group "+" opens a draft tab, FileExplorer root follows
// the active tab's project.
// Run manually: node e2e/session-sidebar-groups.mjs
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
const artifacts = join(root, "test-results/e2e-session-sidebar-groups");
mkdirSync(artifacts, { recursive: true });

const agentDir = mkdtempSync(join(tmpdir(), "pi-web-groups-e2e-"));

const projectA = join(agentDir, "project-a");
const projectB = join(agentDir, "project-b");
const sessionDirA = join(agentDir, "sessions", "a");
const sessionDirB = join(agentDir, "sessions", "b");
mkdirSync(projectA, { recursive: true });
mkdirSync(projectB, { recursive: true });
mkdirSync(sessionDirA, { recursive: true });
mkdirSync(sessionDirB, { recursive: true });

const SESSION_A = "groups-e2e-session-a";
const SESSION_B = "groups-e2e-session-b";

writeSession(
  sessionDirA,
  SESSION_A,
  [
    message("a0", null, "user", "Session A first message"),
    message("a1", "a0", "assistant", "Session A assistant reply"),
  ],
  projectA,
);

writeSession(
  sessionDirB,
  SESSION_B,
  [
    message("b0", null, "user", "Session B first message"),
    message("b1", "b0", "assistant", "Session B assistant reply"),
  ],
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

  // Track FileExplorer root listings: /api/files/<encoded cwd>?type=list.
  // The project tmp dirs are plain names, so a substring check is stable.
  const explorerRootRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname.startsWith("/api/files/") &&
      url.searchParams.get("type") === "list"
    ) {
      explorerRootRequests.push(url.pathname);
    }
  });

  await page.goto(`${base}/?session=${SESSION_A}`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByText("Session A first message", { exact: true })
    .first()
    .waitFor();

  // ── Two project groups are visible without any project switch ───────────
  const tablist = page.getByRole("tablist", { name: "Session tabs" });
  await tablist.waitFor();
  const groupA = page.getByRole("button", { name: "project-a", exact: true });
  const groupB = page.getByRole("button", { name: "project-b", exact: true });
  await groupA.waitFor();
  await groupB.waitFor();
  console.log("PASS: both project groups visible in the sidebar tree");

  // Default expansion policy: exactly one group expanded.
  const expandedA = await groupA.getAttribute("aria-expanded");
  const expandedB = await groupB.getAttribute("aria-expanded");
  assert.equal(
    (expandedA === "true" ? 1 : 0) + (expandedB === "true" ? 1 : 0),
    1,
    "Default policy: only the most recent group starts expanded",
  );
  console.log("PASS: default expansion — exactly one group expanded");

  // ── Expanding group B and clicking its session opens a tab ──────────────
  if (expandedB !== "true") await groupB.click();
  assert.equal(await groupB.getAttribute("aria-expanded"), "true");
  await page
    .getByText("Session B first message", { exact: true })
    .first()
    .click();
  const tabB = page.getByRole("tab", { name: /Session B first message/i });
  await tabB.waitFor();
  assert.equal(await tabB.getAttribute("aria-selected"), "true");
  console.log("PASS: clicking a session inside group B opens its tab");

  // ── Switching back to tab A: FileExplorer root follows the project ──────
  const tabA = page.getByRole("tab", { name: /Session A first message/i });
  await tabA.click();
  await page
    .getByText("Session A first message", { exact: true })
    .first()
    .waitFor();
  {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const last = explorerRootRequests.at(-1) ?? "";
      if (last.includes("project-a")) break;
      await delay(250);
    }
  }
  assert.ok(
    explorerRootRequests.at(-1)?.includes("project-a"),
    `FileExplorer root must follow the active tab's project, got: ${explorerRootRequests.join(", ")}`,
  );
  console.log("PASS: FileExplorer root switched to project A on tab switch");

  // ── Group header "+" opens a draft tab in that project's cwd ────────────
  const plusB = groupB
    .locator("xpath=..")
    .getByRole("button", { name: `New session in ${projectB}` });
  await plusB.click();
  const draftTab = page
    .getByRole("tablist", { name: "Session tabs" })
    .getByRole("tab", { name: "New session" });
  await draftTab.waitFor();
  assert.equal(await draftTab.getAttribute("aria-selected"), "true");
  assert.ok(
    (await draftTab.getAttribute("title"))?.includes(projectB),
    "Draft tab carries the group's cwd",
  );
  // router.replace is async — poll briefly for the URL sync effect to strip ?session.
  {
    const deadline = Date.now() + 5_000;
    while (
      Date.now() < deadline &&
      new URL(page.url()).searchParams.has("session")
    ) {
      await delay(250);
    }
  }
  assert.ok(
    !new URL(page.url()).searchParams.has("session"),
    "Draft tabs mirror no ?session param",
  );
  console.log("PASS: group + opens a draft tab for that project");

  // Draft tab title must not linger as a real session tab: 3 tabs total.
  assert.equal(await tablist.getByRole("tab").count(), 3);
  console.log("PASS: draft tab coexists with session tabs");

  // ── Remove project group via ✕ ──────────────────────────────────────
  {
    // Remove group B
    const removeB = groupB
      .locator("xpath=..")
      .getByRole("button", { name: "Remove project" });
    await removeB.click();
    // Group B must disappear
    await groupB.waitFor({ state: "detached", timeout: 5000 });
    // Group A remains
    await groupA.waitFor();
  }
  console.log("PASS: remove project hides the group");

  // Refresh — removed group stays gone
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .getByText("Session A first message", { exact: true })
    .first()
    .waitFor();
  await page
    .getByRole("button", { name: "project-a", exact: true })
    .waitFor();
  const groupBAbsent = page.getByRole(
    "button",
    { name: "project-b", exact: true },
  );
  await groupBAbsent
    .waitFor({ state: "detached", timeout: 5000 })
    .catch(() => {});
  assert.ok(
    (await groupBAbsent.count()) === 0,
    "project-b must stay removed after refresh",
  );
  console.log("PASS: removed project persists across refresh");

  // ── URL navigation restores removed project (re-flow) ─────────────────
  // project-b was removed above; navigate directly to its session via URL.
  await page.goto(`${base}/?session=${SESSION_B}`,
    { waitUntil: "domcontentloaded" },
  );
  await page
    .getByText("Session B first message", { exact: true })
    .first()
    .waitFor();
  // The group must reappear in the sidebar
  const groupBAfterUrl = page.getByRole("button", { name: "project-b", exact: true });
  await groupBAfterUrl.waitFor({ timeout: 8000 });
  console.log("PASS: URL navigation restores removed project group");

  // ── Open directory button text ────────────────────────────────────────
  const openDirBtn = page.getByRole("button", { name: "Open directory…", exact: true });
  await openDirBtn.waitFor();
  console.log("PASS: 'Open directory…' button text is correct");

  assert.deepEqual(errors, [], "No browser errors");
  console.log("\nAll sidebar group tree E2E tests passed!");

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
