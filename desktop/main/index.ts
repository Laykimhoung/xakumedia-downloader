import { app, BrowserWindow, ipcMain, session } from "electron";
import path from "path";
import type { SystemInfo } from "../shared/types";
import { PythonBridge } from "./python-bridge";

let mainWindow: BrowserWindow | null = null;
const pythonBridge = new PythonBridge();
let isQuitting = false;

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function setupSecurityHeaders(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: https: blob:; " +
            "font-src 'self' data:; " +
            "connect-src 'self' ws://localhost:5173 http://localhost:5173;",
        ],
      },
    });
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle("app:ping", async (): Promise<string> => {
    return "pong";
  });

  ipcMain.handle("app:getSystemInfo", async (): Promise<SystemInfo> => {
    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
    };
  });

  // Python Engine IPC Handlers
  ipcMain.handle("python:ping", async () => {
    return pythonBridge.sendRequest("ping");
  });

  ipcMain.handle("python:getSystemInfo", async () => {
    return pythonBridge.sendRequest("get_system_info");
  });

  ipcMain.handle("python:getStatus", async () => {
    return pythonBridge.getStatus();
  });
}

function createWindow(): void {
  const isDev = !app.isPackaged && Boolean(process.env.VITE_DEV_SERVER_URL);
  const preloadPath = path.join(__dirname, "preload.cjs");

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0b0c10",
    title: "XakuMedia",
    show: false, // Prevent white flash before ready-to-show
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Show window smoothly when initial frame is painted
  mainWindow.once("ready-to-show", async () => {
    mainWindow?.show();
    if (process.env.ELECTRON_SMOKE_TEST === "1" || process.argv.includes("--smoke-test")) {
      console.log("[smoke-test] Electron window painted and ready-to-show event fired!");

      // Verify Python bridge during smoke test
      const pyStatus = pythonBridge.getStatus();
      console.log(
        `[smoke-test] Python engine status: connected=${pyStatus.connected}, pid=${pyStatus.pid}`
      );

      if (!pyStatus.connected) {
        console.error("[smoke-test] FAILED: Python engine bridge is not connected!");
        process.exit(1);
      }

      try {
        const pingResponse = await pythonBridge.sendRequest<{
          status: string;
          message: string;
          version: string;
        }>("ping");
        console.log(
          `[smoke-test] Python ping round-trip verified: ${pingResponse.status} / ${pingResponse.message} (v${pingResponse.version})`
        );
      } catch (err) {
        console.error("[smoke-test] FAILED: Python ping request failed:", err);
        process.exit(1);
      }

      console.log("[smoke-test] All smoke tests passed successfully!");
      setTimeout(() => {
        app.quit();
      }, 500);
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error(`[desktop] Failed to load renderer: ${errorCode} - ${errorDescription}`);
  });

  // Security: Deny opening new windows from renderer
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });

  // Security: Block in-app navigation away from application origins
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const isLocal =
      url.startsWith("http://localhost:5173") ||
      url.startsWith("file://");
    if (!isLocal) {
      event.preventDefault();
    }
  });

  // Load the appropriate interface
  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
    mainWindow.loadURL(devUrl);
  } else {
    const prodPath = path.join(__dirname, "../../frontend/dist/index.html");
    mainWindow.loadFile(prodPath);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  setupSecurityHeaders();
  registerIpcHandlers();

  try {
    await pythonBridge.start();
  } catch (err) {
    console.error("[desktop] Failed to start Python bridge:", err);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", async (event) => {
  if (!isQuitting) {
    isQuitting = true;
    event.preventDefault();
    console.log("[desktop] Shutting down Python engine before quitting...");
    try {
      await pythonBridge.stop();
    } catch (err) {
      console.warn("[desktop] Error stopping Python engine:", err);
    } finally {
      app.quit();
    }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
