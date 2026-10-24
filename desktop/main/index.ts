import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } from "electron";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type {
  AppPreferences,
  DiscoveredMediaItem,
  MediaFormatInfoPayload,
  QuerySavedMediaParams,
  SystemInfo,
} from "../shared/types";
import { PythonBridge } from "./python-bridge";

// Register media-loader custom scheme before app is ready for local media streaming
protocol.registerSchemesAsPrivileged([
  {
    scheme: "media-loader",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
    },
  },
]);

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
            "img-src 'self' data: https: blob: media-loader:; " +
            "media-src 'self' data: https: blob: media-loader:; " +
            "font-src 'self' data:; " +
            "connect-src 'self' ws://localhost:5173 http://localhost:5173; " +
            "object-src 'none'; " +
            "base-uri 'self'; " +
            "form-action 'self'; " +
            "frame-ancestors 'none';",
        ],
        "X-Content-Type-Options": ["nosniff"],
        "X-Frame-Options": ["DENY"],
        "Referrer-Policy": ["no-referrer"],
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

  ipcMain.handle(
    "python:startBatchDownload",
    async (_event, items: any[], targetDir?: string) => {
      return pythonBridge.sendRequest("start_batch_download", {
        items,
        target_dir: targetDir,
      });
    }
  );

  ipcMain.handle("python:pauseDownload", async (_event, taskId: string) => {
    return pythonBridge.sendRequest("pause_download", { task_id: taskId });
  });

  ipcMain.handle("python:resumeDownload", async (_event, taskId: string) => {
    return pythonBridge.sendRequest("resume_download", { task_id: taskId });
  });

  ipcMain.handle("python:pauseAllDownloads", async () => {
    return pythonBridge.sendRequest("pause_all_downloads");
  });

  ipcMain.handle("python:resumeAllDownloads", async () => {
    return pythonBridge.sendRequest("resume_all_downloads");
  });

  ipcMain.handle("python:cancelAllDownloads", async () => {
    return pythonBridge.sendRequest("cancel_all_downloads");
  });

  ipcMain.handle("python:clearCompletedDownloads", async () => {
    return pythonBridge.sendRequest("clear_completed_downloads");
  });

  ipcMain.handle("python:setDownloadConcurrency", async (_event, concurrency: number) => {
    return pythonBridge.sendRequest("set_download_concurrency", { concurrency });
  });

  ipcMain.handle("python:setSpeedLimit", async (_event, speedLimitKbps: number) => {
    return pythonBridge.sendRequest("set_speed_limit", { speed_limit_kbps: speedLimitKbps });
  });

  ipcMain.handle("python:getSpeedLimit", async () => {
    return pythonBridge.sendRequest("get_speed_limit");
  });

  ipcMain.handle("python:getDownloadQueueState", async () => {
    return pythonBridge.sendRequest("get_download_queue_state");
  });

  ipcMain.handle("python:recoverInterruptedTasks", async (_event, autoResume?: boolean) => {
    return pythonBridge.sendRequest("recover_interrupted_tasks", {
      auto_resume: autoResume,
    });
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

  ipcMain.handle("python:querySavedMedia", async (_event, params?: QuerySavedMediaParams) => {
    return pythonBridge.sendRequest("query_saved_media", params || {});
  });

  ipcMain.handle(
    "python:generateThumbnail",
    async (
      _event,
      sourcePath: string,
      itemId: string,
      mediaType?: string,
      forceRegenerate?: boolean,
      timestampSec?: number
    ) => {
      return pythonBridge.sendRequest("generate_thumbnail", {
        source_path: sourcePath,
        item_id: itemId,
        media_type: mediaType,
        force_regenerate: forceRegenerate,
        timestamp_sec: timestampSec,
      });
    }
  );

  ipcMain.handle("python:exportMediaMetadata", async (_event, mediaId: string) => {
    return pythonBridge.sendRequest("export_media_metadata", { media_id: mediaId });
  });

  ipcMain.handle(
    "python:deleteDownloadedMedia",
    async (_event, taskId: string, deleteFileFromDisk?: boolean) => {
      return pythonBridge.sendRequest("delete_downloaded_media", {
        task_id: taskId,
        delete_file_from_disk: deleteFileFromDisk ?? true,
      });
    }
  );

  ipcMain.handle("app:openPath", async (_event, targetPath: string) => {
    if (!targetPath || typeof targetPath !== "string") return;
    const trimmed = targetPath.trim();
    // Reject UNC paths to prevent remote SMB credential leaks
    if (trimmed.startsWith("\\\\") || trimmed.startsWith("//")) {
      console.warn(`[desktop] Blocked UNC path in openPath: ${trimmed}`);
      return;
    }
    // Only accept absolute paths
    if (!path.isAbsolute(trimmed)) {
      console.warn(`[desktop] Blocked non-absolute path in openPath: ${trimmed}`);
      return;
    }

    try {
      const normalized = path.normalize(trimmed);
      if (fs.existsSync(normalized)) {
        const stat = fs.statSync(normalized);
        if (stat.isDirectory()) {
          await shell.openPath(normalized);
        } else {
          // Never execute non-directory files with shell.openPath (which could execute .exe/.bat);
          // showItemInFolder safely selects and reveals the media file in Windows Explorer.
          shell.showItemInFolder(normalized);
        }
      } else {
        const parentDir = path.dirname(normalized);
        if (fs.existsSync(parentDir) && fs.statSync(parentDir).isDirectory()) {
          await shell.openPath(parentDir);
        }
      }
    } catch (err) {
      console.warn(`[desktop] Failed to open path ${targetPath}:`, err);
    }
  });

  // Application Preferences & Native Folder Selector
  ipcMain.handle("dialog:selectFolder", async (_event, defaultPath?: string): Promise<string | null> => {
    const focusedWindow = BrowserWindow.getFocusedWindow() || mainWindow;
    const result = await dialog.showOpenDialog(focusedWindow || (undefined as any), {
      title: "Select Download Directory",
      defaultPath: defaultPath || undefined,
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle("preferences:get", async () => {
    return pythonBridge.sendRequest("get_preferences");
  });

  ipcMain.handle("preferences:update", async (_event, preferences: Partial<AppPreferences>) => {
    return pythonBridge.sendRequest("update_preferences", { preferences });
  });

  ipcMain.handle("preferences:reset", async () => {
    return pythonBridge.sendRequest("reset_preferences");
  });

  // Authentication, Cookies & Custom Request Headers
  ipcMain.handle("python:listSupportedBrowsers", async () => {
    return pythonBridge.sendRequest("list_supported_browsers");
  });

  ipcMain.handle(
    "python:importBrowserCookies",
    async (_event, browser: string, domain?: string) => {
      return pythonBridge.sendRequest("import_browser_cookies", { browser, domain });
    }
  );

  ipcMain.handle(
    "python:saveCookiesText",
    async (_event, domain: string, content: string) => {
      return pythonBridge.sendRequest("save_cookies_text", { domain, content });
    }
  );

  ipcMain.handle(
    "python:importCookiesFile",
    async (_event, filePath: string, domain?: string) => {
      return pythonBridge.sendRequest("import_cookies_file", { file_path: filePath, domain });
    }
  );

  ipcMain.handle("python:listCookieProfiles", async () => {
    return pythonBridge.sendRequest("list_cookie_profiles");
  });

  ipcMain.handle("python:deleteCookieProfile", async (_event, profileId: string) => {
    return pythonBridge.sendRequest("delete_cookie_profile", { profile_id: profileId });
  });

  ipcMain.handle("python:getDomainHeaders", async (_event, domain?: string) => {
    return pythonBridge.sendRequest("get_domain_headers", domain ? { domain } : {});
  });

  ipcMain.handle(
    "python:setDomainHeaders",
    async (_event, domain: string, headers: Record<string, string>) => {
      return pythonBridge.sendRequest("set_domain_headers", { domain, headers });
    }
  );

  ipcMain.handle("python:deleteDomainHeaders", async (_event, domain: string) => {
    return pythonBridge.sendRequest("delete_domain_headers", { domain });
  });

  ipcMain.handle(
    "dialog:selectCookieFile",
    async (_event, defaultPath?: string): Promise<string | null> => {
      const focusedWindow = BrowserWindow.getFocusedWindow() || mainWindow;
      const result = await dialog.showOpenDialog(focusedWindow || (undefined as any), {
        title: "Select Netscape Cookie File",
        defaultPath: defaultPath || undefined,
        properties: ["openFile"],
        filters: [
          { name: "Cookie Files (*.txt)", extensions: ["txt"] },
          { name: "All Files (*.*)", extensions: ["*"] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths[0];
    }
  );

  // Saved Sources & Incremental Rescan
  ipcMain.handle("python:saveSource", async (_event, sourceData: any) => {
    return pythonBridge.sendRequest("save_source", sourceData);
  });

  ipcMain.handle("python:getSavedSources", async (_event, tag?: string) => {
    return pythonBridge.sendRequest("get_saved_sources", tag ? { tag } : {});
  });

  ipcMain.handle(
    "python:getSource",
    async (_event, params: { source_id?: string; url?: string }) => {
      return pythonBridge.sendRequest("get_source", params);
    }
  );

  ipcMain.handle("python:deleteSavedSource", async (_event, sourceId: string) => {
    return pythonBridge.sendRequest("delete_saved_source", { source_id: sourceId });
  });

  ipcMain.handle("python:rescanSource", async (_event, sourceId: string) => {
    return pythonBridge.sendRequest("rescan_source", { source_id: sourceId });
  });

  ipcMain.handle("python:rescanAllSources", async (_event, tag?: string) => {
    return pythonBridge.sendRequest("rescan_all_sources", tag ? { tag } : {});
  });
}

function createWindow(): void {
  const isDev = !app.isPackaged && Boolean(process.env.VITE_DEV_SERVER_URL);
  const preloadPath = path.join(__dirname, "preload.cjs");

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.join(__dirname, "../../build/icon.ico");
  const fallbackIcon = app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(__dirname, "../../build/icon.png");
  const windowIcon = fs.existsSync(iconPath)
    ? iconPath
    : fs.existsSync(fallbackIcon)
    ? fallbackIcon
    : undefined;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0b0c10",
    title: "XakuMedia",
    icon: windowIcon,
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

        // Verify preferences over IPC
        const prefsResponse = await pythonBridge.sendRequest<AppPreferences>("get_preferences");
        console.log(
          `[smoke-test] Preferences query verified over IPC: theme=${prefsResponse.theme}, max_concurrent=${prefsResponse.max_concurrent_downloads}`
        );

        // Verify task recovery over IPC
        const recoveryResponse = await pythonBridge.sendRequest<{
          recovered_count: number;
          resumed_count: number;
          message: string;
        }>("recover_interrupted_tasks", { auto_resume: false });
        console.log(
          `[smoke-test] Task recovery verified over IPC: recovered=${recoveryResponse.recovered_count}`
        );

        // Verify speed limit controls over IPC
        const speedSetResponse = await pythonBridge.sendRequest<{
          speed_limit_kbps: number;
        }>("set_speed_limit", { speed_limit_kbps: 512 });
        const speedGetResponse = await pythonBridge.sendRequest<{
          speed_limit_kbps: number;
        }>("get_speed_limit");
        await pythonBridge.sendRequest("set_speed_limit", { speed_limit_kbps: 0 });
        console.log(
          `[smoke-test] Speed limit verified over IPC: set=${speedSetResponse.speed_limit_kbps}, got=${speedGetResponse.speed_limit_kbps}`
        );

        // Verify Cookie Profile and Supported Browsers over IPC
        const browserResponse = await pythonBridge.sendRequest<{ browsers: string[] }>(
          "list_supported_browsers"
        );
        const cookieProfilesResponse = await pythonBridge.sendRequest<{
          profiles: unknown[];
          count: number;
        }>("list_cookie_profiles");
        console.log(
          `[smoke-test] Auth/cookies verified over IPC: browsers=${browserResponse.browsers.length}, profiles=${cookieProfilesResponse.count}`
        );

        // Verify Saved Sources and Incremental Rescan over IPC
        const savedSourcesResponse = await pythonBridge.sendRequest<{
          sources: unknown[];
          count: number;
        }>("get_saved_sources");
        console.log(
          `[smoke-test] Saved sources verified over IPC: count=${savedSourcesResponse.count}`
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
    const candidates = [
      path.join(__dirname, "../../frontend/dist/index.html"),
      path.join(__dirname, "../frontend/dist/index.html"),
      path.join(app.getAppPath(), "frontend/dist/index.html"),
    ];
    const prodPath = candidates.find((p) => fs.existsSync(p)) || candidates[0];
    mainWindow.loadFile(prodPath);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  setupSecurityHeaders();
  registerIpcHandlers();

  // Allowed media file extensions for privileged streaming protocol
  const ALLOWED_MEDIA_EXTENSIONS = new Set([
    ".mp4",
    ".webm",
    ".mkv",
    ".avi",
    ".mov",
    ".flv",
    ".ts",
    ".mp3",
    ".m4a",
    ".wav",
    ".aac",
    ".flac",
    ".ogg",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".ico",
    ".bmp",
    ".avif",
    ".svg",
    ".part",
    ".tmp",
  ]);

  // Register protocol handler for streaming local video, audio, and images to renderer
  protocol.handle("media-loader", (request) => {
    try {
      const parsed = new URL(request.url);
      let filePath = "";
      if (parsed.searchParams.has("path")) {
        filePath = decodeURIComponent(parsed.searchParams.get("path") || "");
      } else {
        let p = decodeURIComponent(parsed.pathname);
        if (p.startsWith("/") && p.length > 2 && p[2] === ":") {
          p = p.slice(1);
        }
        filePath = p;
      }

      if (!filePath || typeof filePath !== "string") {
        return new Response("Invalid media path parameter", { status: 400 });
      }

      // Reject UNC paths to prevent remote network / SMB hash leaking
      if (filePath.startsWith("\\\\") || filePath.startsWith("//")) {
        console.warn(`[security] Blocked UNC path in media-loader: ${filePath}`);
        return new Response("Forbidden network path", { status: 403 });
      }

      // Reject null bytes and NTFS Alternate Data Streams (colons in filename)
      if (filePath.includes("\0") || path.basename(filePath).includes(":")) {
        console.warn(`[security] Blocked malformed / ADS path in media-loader: ${filePath}`);
        return new Response("Forbidden path syntax", { status: 403 });
      }

      const normalized = path.normalize(filePath);
      if (!path.isAbsolute(normalized)) {
        return new Response("Path must be absolute", { status: 400 });
      }

      // Enforce strict media extension whitelist
      const ext = path.extname(normalized).toLowerCase();
      if (!ALLOWED_MEDIA_EXTENSIONS.has(ext)) {
        console.warn(`[security] Blocked non-media file extension in media-loader: ${ext}`);
        return new Response("Forbidden file extension: only media files can be streamed", { status: 403 });
      }

      if (!fs.existsSync(normalized)) {
        return new Response("Not found", { status: 404 });
      }

      const stat = fs.statSync(normalized);
      if (!stat.isFile()) {
        return new Response("Resource is not a file", { status: 400 });
      }

      return net.fetch(pathToFileURL(normalized).toString());
    } catch (err) {
      console.warn("[desktop] media-loader request failed:", err);
      return new Response("Internal error", { status: 500 });
    }
  });

  try {
    await pythonBridge.start();
    try {
      const rec = await pythonBridge.sendRequest<any>("recover_interrupted_tasks", {});
      console.log(
        `[desktop] Interrupted task recovery check: ${rec.recovered_count} recovered, ` +
          `${rec.resumed_count} resumed, ${rec.paused_count} paused.`
      );
    } catch (recErr) {
      console.warn("[desktop] Interrupted task recovery startup check failed:", recErr);
    }
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
