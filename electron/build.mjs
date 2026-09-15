// electron/build.mjs — run next build with a sanitized env
// __NEXT_PRIVATE_STANDALONE_CONFIG leaks from the packaged app's server
// and makes `next build` load a stale standalone config without
// generateBuildId, causing "TypeError: generate is not a function".
import { spawnSync } from "child_process";

const env = { ...process.env };
delete env.__NEXT_PRIVATE_STANDALONE_CONFIG;
delete env.__NEXT_PRIVATE_ORIGIN;

// Optional output dir override, e.g. `node electron/build.mjs dist-electron2`
// (useful when the default dir is locked by sync/AV software)
const outDir = process.argv[2] || "dist-electron";

const steps = [
  ["npx", ["next", "build"]],
  ["node", ["electron/before-pack.mjs"]],
  [
    "npx",
    [
      "electron-builder",
      ...(outDir === "dist-electron"
        ? []
        : [`--config.directories.output=${outDir}`]),
    ],
  ],
];

for (const [cmd, args] of steps) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
