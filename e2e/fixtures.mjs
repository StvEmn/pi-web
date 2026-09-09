// Shared E2E test fixtures.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const timestamp = "2026-08-23T00:00:00.000Z";

export function message(id, parentId, role, content) {
  return {
    type: "message",
    id,
    parentId,
    timestamp,
    message: { role, content },
  };
}

export function writeSession(dir, id, entries, cwd, headerExtra = {}) {
  const header = {
    type: "session",
    version: 3,
    id,
    timestamp,
    cwd,
    ...headerExtra,
  };
  writeFileSync(
    join(dir, `2026-08-23T00-00-00-000Z_${id}.jsonl`),
    [header, ...entries].map((e) => JSON.stringify(e)).join("\n") + "\n",
  );
}

/** Custom entry — e.g. the pi-web:subagent marker that makes a session render
 *  as a nested subagent row (see lib/subagents.ts SUBAGENT_META_TYPE). */
export function customEntry(id, parentId, customType, data) {
  return { type: "custom", id, parentId, timestamp, customType, data };
}
