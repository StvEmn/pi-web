import { spawn } from "child_process";
import net from "net";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const PORT = Number(process.env.PI_WEB_PORT) || 30142;

function waitForPort(port) {
  return new Promise((resolve) => {
    (function tryConnect() {
      const sock = net.createConnection({ port, host: "127.0.0.1" });
      sock.once("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        setTimeout(tryConnect, 500);
      });
    })();
  });
}

const nextDev = spawn(
  "npx",
  ["next", "dev", "-H", "127.0.0.1", "-p", String(PORT)],
  {
    cwd: projectRoot,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, PI_WEB_PORT: String(PORT) },
  },
);

waitForPort(PORT).then(() => {
  console.log(
    `[electron:dev] Next.js ready on :${PORT}, launching Electron...`,
  );
  const electronBin = join(
    projectRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "electron.cmd" : "electron",
  );
  const electron = spawn(electronBin, [join(__dirname, "main.cjs")], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, PI_WEB_PORT: String(PORT), NODE_ENV: "development" },
  });
  electron.on("close", () => {
    nextDev.kill();
    process.exit(0);
  });
});
