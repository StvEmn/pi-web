// Session tab drafts E2E: open draft tab, switch away/back without losing the
// composer, multiple coexisting drafts, close without residue, and in-place
// promotion (draft tab → real session tab) via mocked agent endpoints.
// Run manually: node e2e/session-tab-drafts.mjs
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
const artifacts = join(root, "test-results/e2e-session-tab-drafts");
mkdirSync(artifacts, { recursive: true });

const agentDir = mkdtempSync(join(tmpdir(), "pi-web-tab-drafts-e2e-"));

const projectA = join(agentDir, "project-a");
const sessionDirA = join(agentDir, "sessions", "project-a");
mkdirSync(projectA, { recursive: true });
mkdirSync(sessionDirA, { recursive: true });

const SESSION_A = "drafts-e2e-session-a";
// The real session id pi would assign after the first message. The agent
// endpoints are mocked to return it; it never exists on disk, which is fine —
// the promoted tab mirrors the client-side transient session.
const PROMOTED = "drafts-e2e-promoted";

writeSession(sessionDirA, SESSION_A, [
  message("a0", null, "user", "Session A first message"),
  message("a1", "a0", "assistant", "Session A assistant reply"),
], projectA);

let server;
let serverExited;
let browser;
let context;
const serverLog = createWriteStream(join(artifacts, "server.log"));

const interrupt = () => {
  process.exitCode = 1;
  try { server?.kill("SIGTERM"); } catch {}
  void browser?.close().catch(() => {});
};
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

// Poll until `condition` holds (router.replace and session restore are async).
async function waitFor(condition, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await condition()) return;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw lastError ?? new Error(`Timed out waiting for: ${label}`);
}

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
    [join(root, "node_modules/next/dist/bin/next"), "dev", "-H", "127.0.0.1", "-p", String(port)],
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
    if (response?.ok) break;
    assert.ok(Date.now() < deadline, "Server readiness timed out");
    await delay(250);
  }

  browser = await chromium.launch();
  context = await browser.newContext({
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
  await page.getByText("Session A first message", { exact: true }).first().waitFor();

  const tablist = page.getByRole("tablist", { name: "Session tabs" });
  await tablist.waitFor();
  const tabA = page.getByRole("tab", { name: /Session A first message/i });
  await tabA.waitFor();

  const newButton = page.getByRole("button", { name: "New", exact: true }).first();

  // ── Open a draft tab ───────────────────────────────────────────────────────
  await newButton.click();
  const draftTab1 = tablist.getByRole("tab", { name: "New session", exact: true });
  await draftTab1.waitFor();
  assert.equal(await draftTab1.getAttribute("aria-selected"), "true");
  await waitFor(() => new URL(page.url()).searchParams.get("session") === null, "draft tab strips ?session");
  assert.ok(
    (await draftTab1.getAttribute("title"))?.includes(projectA),
    "Draft tab tooltip shows the draft cwd",
  );
  console.log("PASS: clicking New opens an active draft tab titled 'New session', URL has no ?session");

  // Type a composer draft so we can verify it survives tab switches
  const composer = page.getByRole("textbox").first();
  await composer.fill("hello from draft one");

  // Switch to session A, then back to the draft
  await tabA.click();
  await page.getByText("Session A first message", { exact: true }).first().waitFor();
  assert.equal(await draftTab1.getAttribute("aria-selected"), "false");
  await draftTab1.click();
  await composer.waitFor();
  await waitFor(async () => (await composer.inputValue()) === "hello from draft one", "draft composer text restores");
  console.log("PASS: switching away and back keeps the draft tab and its composer input");

  // ── Two coexisting drafts in the same project, isolated inputs ──────────────
  await newButton.click();
  const draftTabs = tablist.getByRole("tab", { name: "New session", exact: true });
  await waitFor(async () => (await draftTabs.count()) === 2, "second draft tab appears");
  const draftTab2 = draftTabs.nth(1);
  assert.equal(await draftTab2.getAttribute("aria-selected"), "true");
  const composer2 = page.getByRole("textbox").first();
  await waitFor(async () => (await composer2.inputValue()) === "", "second draft starts with an empty composer");
  await composer2.fill("hello from draft two");

  // Back to draft one: its input must be intact, not crossed with draft two
  const draftTab1Ref = draftTabs.first();
  await draftTab1Ref.click();
  await waitFor(async () => (await composer.inputValue()) === "hello from draft one", "draft one input untouched by draft two");
  await draftTab2.click();
  await waitFor(async () => (await composer2.inputValue()) === "hello from draft two", "draft two input intact");
  console.log("PASS: two draft tabs coexist with isolated composer inputs");

  // ── Close draft tabs without residue ───────────────────────────────────────
  // Closing the active draft (rightmost) selects its left neighbor (draft one).
  await draftTab2.getByRole("button", { name: /Close tab/ }).click();
  await waitFor(async () => (await draftTabs.count()) === 1, "draft two closes");
  assert.equal(await draftTab1Ref.getAttribute("aria-selected"), "true");
  // Closing draft one falls back to tab A.
  await draftTab1Ref.getByRole("button", { name: /Close tab/ }).click();
  await waitFor(async () => (await draftTabs.count()) === 0, "draft one closes");
  assert.equal(await tabA.getAttribute("aria-selected"), "true");
  await waitFor(() => new URL(page.url()).searchParams.get("session") === SESSION_A, "URL back on session A");
  console.log("PASS: closing draft tabs selects the neighbor and leaves no residue");

  assert.deepEqual(errors, [], "No browser errors before promotion scenario");

  // ── Promotion: first message turns the draft tab into a real session tab ────
  // Mock the agent endpoints: ensure_session returns the real id, the prompt
  // command succeeds, and the SSE handshake completes so onSessionCreated
  // fires exactly as it would against a live pi.
  await page.route(/\/api\/agent\/new$/, (route) =>
    route.fulfill({ json: { sessionId: PROMOTED } }));
  await page.route(new RegExp(`/api/agent/${PROMOTED}/events`), (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: 'data: {"type":"connected"}\n\n',
    }));
  await page.route(new RegExp(`/api/agent/${PROMOTED}$`), (route) =>
    route.fulfill({ json: {} }));
  await page.route(new RegExp(`/api/sessions/${PROMOTED}/context`), (route) =>
    route.fulfill({ json: { context: { messages: [], entryIds: [], hasMore: false } } }));
  await page.route(new RegExp(`/api/sessions/${PROMOTED}/state`), (route) =>
    route.fulfill({ json: { running: false } }));
  await page.route(new RegExp(`/api/sessions/${PROMOTED}(\\?|$)`), (route) =>
    route.fulfill({
      json: {
        leafId: null,
        toolNames: [],
        context: { messages: [], entryIds: [], oldestEntryId: null, hasMore: false },
      },
    }));

  await newButton.click();
  await draftTab1.waitFor();
  await page.getByRole("textbox").first().fill("first message promotes this draft");
  const tabCountBefore = await tablist.getByRole("tab").count();
  await page.getByRole("textbox").first().press("Enter");

  // The draft tab must be promoted IN PLACE: same count, new title.
  const promotedTab = tablist.getByRole("tab", { name: PROMOTED });
  await promotedTab.waitFor();
  await waitFor(async () => (await tablist.getByRole("tab").count()) === tabCountBefore, "no tab rebuild on promotion");
  assert.equal(await promotedTab.getAttribute("aria-selected"), "true");
  await waitFor(() => new URL(page.url()).searchParams.get("session") === PROMOTED, "URL mirrors promoted session");
  await waitFor(async () => (await draftTabs.count()) === 0, "no 'New session' tab remains after promotion");
  console.log("PASS: sending the first message promotes the draft tab in place (title + URL update)");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  console.log("CLEANUP: stopping tracing/browser");
  await context?.tracing.stop().catch((e) => console.log("tracing stop:", e.message));
  await context?.close().catch((e) => console.log("context close:", e.message));
  console.log("CLEANUP: browser closed");
  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill("SIGTERM");
    const forceKill = setTimeout(() => {
      console.log("CLEANUP: force killing server");
      server.kill("SIGKILL");
    }, 5_000);
    await Promise.race([serverExited, delay(10_000)]);
    clearTimeout(forceKill);
    try { server.kill("SIGKILL"); } catch {}
  }
  console.log("CLEANUP: server done");
  serverLog.end();
  rmSync(agentDir, { recursive: true, force: true });
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
  // Killed dev servers can leave descendant workers whose handles keep the
  // loop alive; tests are done at this point, so exit explicitly.
  process.exit(process.exitCode || 0);
}
