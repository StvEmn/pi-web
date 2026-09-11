/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, shell, dialog } = require("electron");
const { spawn } = require("child_process");
const net = require("net");
const path = require("path");
const fs = require("fs");

const PORT = Number(process.env.PI_WEB_PORT) || 30142;
const URL = `http://127.0.0.1:${PORT}`;

let mainWindow = null;
let serverProcess = null;

function log(...args) {
  try {
    const line = `[${new Date().toISOString()}] ${args.join(" ")}\n`;
    fs.appendFileSync(path.join(app.getPath("userData"), "pi-web.log"), line);
  } catch {
    /* best effort */
  }
}

function resolveServerEntry() {
  const prod = path.join(
    process.resourcesPath || "",
    "standalone",
    "server.js",
  );
  if (fs.existsSync(prod)) return prod;
  const dev = path.join(__dirname, "..", ".next", "standalone", "server.js");
  if (fs.existsSync(dev)) return dev;
  return null;
}

function spawnServer(entry) {
  const standaloneDir = path.dirname(entry);
  const env = {
    ...process.env,
    PORT: String(PORT),
    HOSTNAME: "127.0.0.1",
    ELECTRON_RUN_AS_NODE: "1",
  };

  const staticDst = path.join(standaloneDir, ".next", "static");
  if (!fs.existsSync(staticDst)) {
    const devStatic = path.join(__dirname, "..", ".next", "static");
    if (fs.existsSync(devStatic)) {
      fs.mkdirSync(path.join(standaloneDir, ".next"), { recursive: true });
      fs.cpSync(devStatic, staticDst, { recursive: true });
      log("[pi-web] Copied .next/static into standalone (dev fallback)");
    } else {
      log("[pi-web] WARNING: .next/static not found — static assets may fail");
    }
  }

  log("[pi-web] Spawning server:", entry, "cwd:", standaloneDir);
  const child = spawn(process.execPath, [entry], {
    env,
    cwd: standaloneDir,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (d) => log("[next]", d.toString().trimEnd()));
  child.stderr.on("data", (d) => log("[next:err]", d.toString().trimEnd()));
  child.on("error", (err) => log("[pi-web] Server spawn error:", err.message));
  child.on("exit", (code, signal) => {
    log(`[pi-web] Server exited code=${code} signal=${signal}`);
    serverProcess = null;
  });
  return child;
}

function waitForPort(port, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    (function tryConnect() {
      if (Date.now() > deadline)
        return reject(
          new Error(`Port ${port} did not open within ${timeoutMs}ms`),
        );
      const sock = net.createConnection({ port, host: "127.0.0.1" });
      sock.once("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        setTimeout(tryConnect, 300);
      });
    })();
  });
}

// Quick single-shot check: is port already listening?
function isPortOpen(port) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ port, host: "127.0.0.1" });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => {
      sock.destroy();
      resolve(false);
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Pi Web",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.removeMenu();
  mainWindow.loadURL(URL);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith("http://127.0.0.1")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function cleanup() {
  if (serverProcess) {
    serverProcess.removeAllListeners();
    // Windows: taskkill /T kills the process tree (node + children)
    try {
      spawn("taskkill", ["/PID", String(serverProcess.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {}
    serverProcess = null;
  }
}

// Single instance lock — prevent infinite process spawning
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("window-all-closed", () => {
    cleanup();
    app.quit();
  });
  app.on("before-quit", () => {
    cleanup();
  });

  app.whenReady().then(async () => {
    const entry = resolveServerEntry();
    if (!entry) {
      log("[pi-web] No standalone server — expecting dev server at " + URL);
      createWindow();
      return;
    }

    // If port is already in use (previous instance still alive), reuse it
    if (await isPortOpen(PORT)) {
      log("[pi-web] Port " + PORT + " already in use, reusing existing server");
      createWindow();
      return;
    }

    log("[pi-web] Starting server from", entry);
    serverProcess = spawnServer(entry);
    try {
      await waitForPort(PORT);
      log("[pi-web] Server ready on port", PORT);
      createWindow();
    } catch (err) {
      log("[pi-web] Failed to start server:", err.message);
      dialog.showErrorBox(
        "Pi Web — Server Error",
        `Failed to start server on port ${PORT}.\n\n${err.message}\n\nLog: ${path.join(app.getPath("userData"), "pi-web.log")}`,
      );
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
} // end single-instance else
