// Session flows E2E (ticket 05): fork opens a tab, subagent navigates in-tab,
// session delete closes its tab, closing all tabs shows the welcome empty state.
// Run manually: node e2e/session-flows.mjs
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
import { customEntry, message, writeSession } from "./fixtures.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, "test-results/e2e-session-flows");
mkdirSync(artifacts, { recursive: true });

const agentDir = mkdtempSync(join(tmpdir(), "pi-web-flows-e2e-"));
const project = join(agentDir, "project");
const sessionDir = join(agentDir, "sessions", "flows");
mkdirSync(project, { recursive: true });
mkdirSync(sessionDir, { recursive: true });

const PARENT = "flows-e2e-parent";
const FORKED = "flows-e2e-forked";
const SUB = "flows-e2e-subagent";
const SPARE = "flows-e2e-spare";

writeSession(
  sessionDir,
  PARENT,
  [
    message("p0", null, "user", "Parent first question"),
    message("p1", "p0", "assistant", "Parent first answer"),
    message("p2", "p1", "user", "Parent second question"),
    message("p3", "p2", "assistant", "Parent second answer"),
  ],
  project,
);

// The fork target exists on disk up front so the forked tab resolves its
// title/content like a real forked session would after pi created the file.
writeSession(
  sessionDir,
  FORKED,
  [
    message("f0", null, "user", "Forked session first message"),
    message("f1", "f0", "assistant", "Forked session answer"),
  ],
  project,
);

// Subagent of PARENT: parentSession header + the pi-web:subagent custom
// metadata entry (lib/subagents.ts) make the catalogue nest it under PARENT.
const parentPath = join(sessionDir, `2026-08-23T00-00-00-000Z_${PARENT}.jsonl`);
writeSession(
  sessionDir,
  SUB,
  [
    customEntry("meta", null, "pi-web:subagent", {
      version: 1,
      parentSessionId: PARENT,
      parentSessionPath: parentPath,
      parentToolCallId: "t-sub",
      profile: "general-purpose",
      description: "E2E subagent task",
      task: "E2E subagent task",
      runInBackground: false,
      status: "completed",
      createdAt: "2026-08-23T00:00:00.000Z",
    }),
    message("s0", "meta", "user", "E2E subagent prompt"),
    message("s1", "s0", "assistant", "Subagent final answer"),
  ],
  project,
  { parentSession: parentPath },
);

writeSession(
  sessionDir,
  SPARE,
  [
    message("x0", null, "user", "Spare session message"),
    message("x1", "x0", "assistant", "Spare session answer"),
  ],
  project,
);

let server;
let serverExited;
let browser;
const errors = [];
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

// Poll until `condition` holds (router.replace and tab effects are async).
async function waitFor(condition, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await delay(250);
  }
  assert.ok(false, `Timed out waiting for ${label}`);
}

async function urlSessionId(page) {
  const match = page.url().match(/[?&]session=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Click via the DOM: the windowed tree remounts rows on focus, which can
 *  swallow a synthetic mousedown+mouseup pair. el.click() delivers one event. */
async function clickRowButton(locator) {
  await locator.evaluate((el) => el.click());
}

async function deleteSessionRow(page, title) {
  // Move the mouse away first: after a deletion the remaining rows shift up
  // under the stationary pointer, and a hover without a boundary crossing
  // fires no mouseenter — the row's hover-only delete button never mounts.
  await page.mouse.move(5, 400);
  const row = page
    .locator("#session-sidebar")
    .getByText(title, { exact: true })
    .first();
  await row.hover();
  // Shift+click deletes without the confirmation step.
  await page
    .locator("#session-sidebar")
    .getByRole("button", {
      name: "Delete (Shift+click to delete without confirmation)",
    })
    .first()
    .click({ modifiers: ["Shift"] });
}

try {
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

  const deadline = Date.now() + 120_000;
  while (true) {
    assert.equal(server.exitCode, null, "Server exited before readiness");
    const response = await fetch(`${base}/api/sessions`, {
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    if (response?.ok) {
      const { sessions } = await response.json();
      const ids = sessions.map((s) => s.id).sort();
      assert.deepEqual(ids, [PARENT, FORKED, SUB, SPARE].sort());
      break;
    }
    assert.ok(Date.now() < deadline, "Server readiness timed out");
    await delay(250);
  }
  // The subagent must be catalogued as a nested subagent session.
  {
    const { sessions } = await (await fetch(`${base}/api/sessions`)).json();
    const sub = sessions.find((s) => s.id === SUB);
    assert.equal(sub?.relation?.kind, "subagent", "fixture must be a subagent");
    assert.equal(sub.relation.parentSessionId, PARENT);
  }

  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (event) => {
    if (event.type() !== "error") return;
    // Viewing a session with no live agent runtime 404s /state by design;
    // useAgentSession handles it (logs and continues). The paired generic
    // "Failed to load resource" browser line is the same expected 404.
    if (/Failed to load agent state: Error: HTTP 404/.test(event.text()))
      return;
    if (/Failed to load resource: .*404/.test(event.text())) return;
    errors.push(event.text());
  });
  page.on("response", (response) => {
    if (response.url().startsWith(base) && response.status() >= 500) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });

  const tablist = page.getByRole("tablist", { name: "Session tabs" });
  const tabCount = () => tablist.getByRole("tab").count();

  // ── ① Fork → new tab opened and activated, original tab kept ────────────
  await page.goto(`${base}/?session=${PARENT}`, {
    waitUntil: "domcontentloaded",
  });
  const tabParent = page.getByRole("tab", { name: /Parent first question/i });
  await tabParent.waitFor();
  assert.equal(await tabParent.getAttribute("aria-selected"), "true");
  await page.getByText("Parent second answer", { exact: true }).waitFor();

  // Mock the fork command; every other agent request answers empty.
  await page.route(new RegExp(`/api/agent/${PARENT}$`), (route) =>
    route.request().method() === "POST"
      ? // sendAgentCommand unwraps { data } — see lib/agent-client.ts.
        route.fulfill({ json: { data: { newSessionId: FORKED } } })
      : route.fulfill({ json: {} }),
  );
  // The fork button lives in the hover actions of the second user message.
  await page.getByText("Parent second question", { exact: true }).hover();
  await page.getByRole("button", { name: "New session", exact: true }).click();
  const tabForked = page.getByRole("tab", {
    name: /Forked session first message/i,
  });
  await tabForked.waitFor();
  assert.equal(await tabForked.getAttribute("aria-selected"), "true");
  assert.equal(await tabParent.getAttribute("aria-selected"), "false");
  assert.equal(await tabCount(), 2, "fork must add exactly one tab");
  await page.getByText("Forked session answer", { exact: true }).waitFor();
  await waitFor(
    async () => (await urlSessionId(page)) === FORKED,
    "fork URL mirror",
  );
  await page.unroute(new RegExp(`/api/agent/${PARENT}$`));
  console.log("PASS: fork opens and activates a new tab, original tab kept");

  // ── ② Subagent click → in-tab navigation, tab count unchanged ───────────
  await tabParent.click();
  await page.getByText("Parent second answer", { exact: true }).waitFor();
  // Expand the family row's subagent children in the sidebar group tree.
  await clickRowButton(page.getByRole("button", { name: "Expand subagents" }));
  const subRow = page
    .locator("#session-sidebar")
    .getByText("E2E subagent prompt", { exact: true });
  await subRow.waitFor();
  await subRow.click();
  await page.getByText("Subagent final answer", { exact: true }).waitFor();
  assert.equal(
    await page.getByText("Parent second answer", { exact: true }).count(),
    0,
    "parent content must be replaced by the subagent view",
  );
  assert.equal(await tabCount(), 2, "subagent navigation must not add a tab");
  assert.equal(
    await tabParent.getAttribute("aria-selected"),
    "true",
    "the family tab stays selected — the subagent lives inside it",
  );
  assert.equal(await tabForked.getAttribute("aria-selected"), "false");
  await waitFor(
    async () => (await urlSessionId(page)) === SUB,
    "subagent URL mirror",
  );
  console.log("PASS: subagent click navigates inside the family tab");

  // ── ③ Deleting a session closes its tab ────────────────────────────────
  // Non-active first: delete FORKED while the PARENT tab is active (showing
  // the subagent view) — the view and tab selection must not move.
  await deleteSessionRow(page, "Forked session first message");
  await tabForked.waitFor({ state: "detached" });
  assert.equal(await tabCount(), 1);
  assert.equal(await tabParent.getAttribute("aria-selected"), "true");
  await page.getByText("Subagent final answer", { exact: true }).waitFor();
  console.log("PASS: deleting a background session closes its tab");

  // Active session: deleting PARENT closes the last tab → welcome empty state.
  await deleteSessionRow(page, "Parent first question");
  await tabParent.waitFor({ state: "detached" });
  assert.equal(await tabCount(), 0);
  console.log("PASS: deleting the active session closes the last tab");

  // ── ④ Welcome empty state: logo, hint, keyboard-reachable open action ──
  const welcome = page.locator("[data-welcome-empty='true']");
  await welcome.waitFor();
  await welcome.getByText("Get Started", { exact: true }).waitFor();
  await welcome
    .getByText(/All session tabs are closed/, { exact: false })
    .waitFor();
  const openRecent = welcome.getByRole("button", {
    name: "Open most recent session",
  });
  await openRecent.waitFor();
  // Sidebar stays operable; wait for the refreshed catalogue (only SPARE left).
  await page
    .getByText("Spare session message", { exact: true })
    .first()
    .waitFor();
  // Keyboard: Tab to the button, Enter opens the most recent session.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await waitFor(async () => {
    await page.keyboard.press("Tab");
    return openRecent.evaluate((el) => el === document.activeElement);
  }, "keyboard focus reaching the welcome action").catch(async () => {
    assert.ok(false, "Open most recent session must be keyboard-reachable");
  });
  await page.keyboard.press("Enter");
  const tabSpare = page.getByRole("tab", { name: /Spare session message/i });
  await tabSpare.waitFor();
  assert.equal(await tabSpare.getAttribute("aria-selected"), "true");
  await page.getByText("Spare session answer", { exact: true }).waitFor();
  await waitFor(
    async () => (await urlSessionId(page)) === SPARE,
    "spare URL mirror",
  );
  await page.screenshot({ path: join(artifacts, "welcome-and-reopen.png") });
  console.log(
    "PASS: welcome empty state shows after drain and Enter reopens a session",
  );

  assert.deepEqual(errors, [], "No browser errors");
  console.log("\nAll session flows E2E tests passed!");

  await context.tracing.stop();
  await context.close();
} catch (error) {
  console.error(error);
  try {
    console.error("Browser errors:", errors);
    await page?.screenshot({ path: join(artifacts, "failure.png") });
  } catch {}
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
