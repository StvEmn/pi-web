/* eslint-disable @typescript-eslint/no-require-imports */
// electron/server-watchdog.cjs — runs in node mode (ELECTRON_RUN_AS_NODE=1)
// Spawns the Next.js standalone server and reaps it when the Electron
// parent process dies (normal exit, crash, or installer force-kill).
const { spawn, execSync } = require("child_process");
const path = require("path");

const parentPid = Number(process.env.PI_WEB_PARENT_PID) || 0;
const serverPath = process.env.PI_WEB_SERVER_PATH;
if (!serverPath) {
  console.error("[watchdog] PI_WEB_SERVER_PATH not set");
  process.exit(1);
}

const child = spawn(process.execPath, [serverPath], {
  cwd: path.dirname(serverPath),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  stdio: "inherit",
});

function reap() {
  try {
    execSync(`taskkill /PID ${child.pid} /T /F`, {
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    /* already dead */
  }
}

child.on("exit", () => process.exit(0));

if (parentPid > 0) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0); // throws when parent is gone
    } catch {
      reap();
      process.exit(0);
    }
  }, 2000);
}
