import { app, BrowserWindow, ipcMain, session } from "electron";
import path from "path";
import type { SystemInfo } from "../shared/types";

let mainWindow: BrowserWindow | null = null;

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
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (process.env.ELECTRON_SMOKE_TEST === "1" || process.argv.includes("--smoke-test")) {
      console.log("[smoke-test] Electron window painted and ready-to-show event fired successfully!");
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

app.whenReady().then(() => {
  setupSecurityHeaders();
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
