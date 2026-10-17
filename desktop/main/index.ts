import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import fs from "fs";
import path from "path";
import type {
  DiscoveredMediaItem,
  MediaFormatInfoPayload,
  SystemInfo,
} from "../shared/types";
import { PythonBridge } from "./python-bridge";

let mainWindow: BrowserWindow | null = null;
const pythonBridge = new PythonBridge();
let isQuitting = false;

// Forward real-time Python notifications to the renderer window
pythonBridge.onNotification((method, params) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(method, params);
  }
});

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

  ipcMain.handle("python:classifyUrl", async (_event, url: string) => {
    return pythonBridge.sendRequest("classify_url", { url });
  });

  ipcMain.handle("python:extractVideo", async (_event, url: string) => {
    return pythonBridge.sendRequest("extract_video", { url });
  });

  ipcMain.handle("python:extractGallery", async (_event, url: string) => {
    return pythonBridge.sendRequest("extract_gallery", { url });
  });

  // Local SQLite Media Library & Scan History IPC Handlers
  ipcMain.handle("python:getScanHistory", async (_event, limit?: number, offset?: number) => {
    return pythonBridge.sendRequest("get_scan_history", { limit, offset });
  });

  ipcMain.handle("python:getScanItems", async (_event, scanId: string) => {
    return pythonBridge.sendRequest("get_scan_items", { scan_id: scanId });
  });

  ipcMain.handle("python:clearScanHistory", async (_event, scanId?: string) => {
    return pythonBridge.sendRequest("clear_scan_history", { scan_id: scanId });
  });

  ipcMain.handle(
    "python:getSavedMedia",
    async (_event, mediaType?: string, limit?: number, offset?: number) => {
      return pythonBridge.sendRequest("get_saved_media", {
        media_type: mediaType,
        limit,
        offset,
      });
    }
  );

  ipcMain.handle("python:toggleSaveMedia", async (_event, mediaId: string) => {
    return pythonBridge.sendRequest("toggle_save_media", { media_id: mediaId });
  });

  ipcMain.handle("python:deleteMediaItem", async (_event, mediaId: string) => {
    return pythonBridge.sendRequest("delete_media_item", { media_id: mediaId });
  });

  // Download Manager IPC Handlers
  ipcMain.handle(
    "python:startDownload",
    async (
      _event,
      mediaItem: DiscoveredMediaItem,
      selectedFormat?: MediaFormatInfoPayload | null,
      destinationPath?: string
    ) => {
      return pythonBridge.sendRequest("start_download", {
        media_item: mediaItem,
        selected_format: selectedFormat,
        destination_path: destinationPath,
      });
    }
  );

  ipcMain.handle("python:cancelDownload", async (_event, taskId: string) => {
    return pythonBridge.sendRequest("cancel_download", { task_id: taskId });
  });

  ipcMain.handle("python:getDownloadTasks", async (_event, status?: string, limit?: number) => {
    return pythonBridge.sendRequest("get_download_tasks", { status, limit });
  });

  // Media Processor & FFmpeg IPC Handlers
  ipcMain.handle("python:getFFmpegInfo", async () => {
    return pythonBridge.sendRequest("get_ffmpeg_info");
  });

  ipcMain.handle("python:inspectMedia", async (_event, filePath: string) => {
    return pythonBridge.sendRequest("inspect_media", { file_path: filePath });
  });

  ipcMain.handle(
    "python:mergeStreams",
    async (
      _event,
      videoPath: string,
      audioPath: string,
      outputPath: string,
      outputContainer?: string
    ) => {
      return pythonBridge.sendRequest("merge_streams", {
        video_path: videoPath,
        audio_path: audioPath,
        output_path: outputPath,
        output_container: outputContainer,
      });
    }
  );

  ipcMain.handle(
    "python:convertFormat",
    async (
      _event,
      inputPath: string,
      outputPath: string,
      targetFormat?: string
    ) => {
      return pythonBridge.sendRequest("convert_format", {
        input_path: inputPath,
        output_path: outputPath,
        target_format: targetFormat,
      });
    }
  );

  ipcMain.handle("app:openPath", async (_event, targetPath: string) => {
    if (!targetPath) return;
    try {
      if (fs.existsSync(targetPath)) {
        const stat = fs.statSync(targetPath);
        if (stat.isDirectory()) {
          await shell.openPath(targetPath);
        } else {
          shell.showItemInFolder(targetPath);
        }
      } else {
        await shell.openPath(path.dirname(targetPath));
      }
    } catch (err) {
      console.warn(`[desktop] Failed to open path ${targetPath}:`, err);
    }
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

        // Verify SSRF defense over IPC
        try {
          await pythonBridge.sendRequest("classify_url", {
            url: "http://127.0.0.1/local_video.mp4",
          });
          console.error("[smoke-test] FAILED: SSRF check did not block loopback address!");
          process.exit(1);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`[smoke-test] SSRF IPC defense verified: ${msg}`);
        }

        // Verify database query over IPC
        const historyResponse = await pythonBridge.sendRequest<{
          items: unknown[];
          count: number;
        }>("get_scan_history", { limit: 5 });
        console.log(
          `[smoke-test] Database scan history query verified over IPC: count=${historyResponse.count}`
        );

        // Verify download tasks query over IPC
        const tasksResponse = await pythonBridge.sendRequest<{
          tasks: unknown[];
          count: number;
        }>("get_download_tasks", { limit: 5 });
        console.log(
          `[smoke-test] Downloader tasks query verified over IPC: count=${tasksResponse.count}`
        );

        // Verify FFmpeg detection over IPC
        const ffmpegResponse = await pythonBridge.sendRequest<{
          installed: boolean;
          version?: string | null;
          ffmpeg_path?: string | null;
        }>("get_ffmpeg_info");
        console.log(
          `[smoke-test] FFmpeg detection verified over IPC: installed=${ffmpegResponse.installed}, version=${ffmpegResponse.version}`
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
