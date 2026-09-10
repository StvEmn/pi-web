import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appShellSource = readFileSync(
  fileURLToPath(new URL("./AppShell.tsx", import.meta.url)),
  "utf8",
);
const tabBarSource = readFileSync(
  fileURLToPath(new URL("./SessionTabBar.tsx", import.meta.url)),
  "utf8",
);

test("B1: draft tab promotion happens before the stale-draft-key guard", () => {
  const promoteIdx = appShellSource.indexOf(
    "promoteDraft(current, newSessionDraftId, session.id)",
  );
  const guardIdx = appShellSource.indexOf(
    "activeNewSessionDraftKeyRef.current !== sourceDraftKey",
  );
  assert.ok(promoteIdx > -1, "promoteDraft call not found");
  assert.ok(guardIdx > -1, "draft key guard not found");
  assert.ok(promoteIdx < guardIdx, "promoteDraft must run before the guard");
});

test("S3: session handlers own no direct ?session= router.replace", () => {
  // Scoped to the two fixed handlers: handleSelectSession still legitimately
  // calls router.replace(`?session=`) behind its isRestore guard.
  const created = appShellSource.slice(
    appShellSource.indexOf("const handleSessionCreated"),
    appShellSource.indexOf("const deliverSessionNotification"),
  );
  const forked = appShellSource.slice(
    appShellSource.indexOf("const handleSessionForked"),
    appShellSource.indexOf("const handleAskInNewChat"),
  );
  assert.doesNotMatch(created, /router\.replace\(`\?session=/);
  assert.doesNotMatch(forked, /router\.replace\(`\?session=/);
});

test("B2: stale tab prune effect is wired in AppShell", () => {
  assert.match(appShellSource, /pruneStaleTabs\(current, known\)/);
  assert.match(appShellSource, /staleTabsPrunedRef/);
});

test("S4: tab close button is removed from the tab order", () => {
  assert.match(tabBarSource, /closeTabNamed"[\s\S]{0,600}?tabIndex=\{-1\}/);
});
