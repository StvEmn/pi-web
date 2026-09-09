// Shared E2E test fixtures.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const timestamp = "2026-08-23T00:00:00.000Z";

export function message(id, parentId, role, content) {
  return { type: "message", id, parentId, timestamp, message: { role, content } };
}

export function writeSession(dir, id, entries, cwd) {
  const header = { type: "session", version: 3, id, timestamp, cwd };
  writeFileSync(
    join(dir, `2026-08-23T00-00-00-000Z_${id}.jsonl`),
    [header, ...entries].map((e) => JSON.stringify(e)).join("\n") + "\n",
  );
}
