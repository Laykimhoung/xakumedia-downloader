# XakuMedia — IPC & JSON-RPC 2.0 API Reference

This document provides a comprehensive technical reference for the inter-process communication (IPC) boundary between the Electron desktop shell and the Python media engine.

---

## 1. IPC Architecture Overview

XakuMedia enforces strict security boundaries between the three runtime layers:

```text
┌────────────────────────────────────────────────────────┐
│ React Frontend (Chromium Renderer)                     │
│   • Sandboxed, contextIsolated: true                   │
│   • Invokes window.api.* typed asynchronous methods    │
└──────────────────────────┬─────────────────────────────┘
                           │ contextBridge (preload/index.ts)
┌──────────────────────────▼─────────────────────────────┐
│ Electron Main Process (desktop/main/index.ts)          │
│   • Validates arguments, bounds parameters             │
│   • Manages Python child process lifecycle             │
└──────────────────────────┬─────────────────────────────┘
                           │ Stdio JSON-RPC 2.0 (python-bridge.ts)
┌──────────────────────────▼─────────────────────────────┐
│ Python 3.12 Engine (server/dispatcher.py)              │
│   • Dispatches to repository, extractors, downloader   │
│   • Streams real-time notifications to stdout          │
└────────────────────────────────────────────────────────┘
```

### JSON-RPC 2.0 Message Wire Format
- **Request:** `{"jsonrpc": "2.0", "id": "req-1", "method": "classify_url", "params": {"url": "..."}}`
- **Success Response:** `{"jsonrpc": "2.0", "id": "req-1", "result": { ... }, "error": null}`
- **Error Response:** `{"jsonrpc": "2.0", "id": "req-1", "result": null, "error": {"code": -32000, "message": "...", "data": null}}`
- **Notification (No id):** `{"jsonrpc": "2.0", "method": "download:progress", "params": { ... }}`

---

## 2. JSON-RPC Method Reference

### 2.1 System & Diagnostic Methods

| Method | Parameters | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `ping` | `{}` | `{"status": "ok", "message": "pong", "version": "0.1.0"}` | Verifies stdio round-trip communication and engine health. |
| `system_info` | `{}` | `{"version": str, "python": str, "os": str, "paths": dict}` | Returns engine version, Python runtime path, and OS environment. |
| `get_ffmpeg_info` | `{}` | `{"installed": bool, "version": str, "ffmpeg_path": str, "ffprobe_path": str}` | Detects local FFmpeg and FFprobe binaries. |

---

### 2.2 URL Scanning & Extraction Methods

| Method | Parameters | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `classify_url` | `{"url": str}` | `ClassifiedUrlResult` | Probes URL, performs SSRF defense checks, classifies source, and saves scan result. |
| `extract_video` | `{"url": str, "timeout": int?}` | `VideoExtractResult` | Extracts video formats, resolutions, codecs, and stream merging requirements via `yt-dlp`. |
| `extract_gallery` | `{"url": str, "timeout": int?}` | `GalleryExtractResult` | Discovers multi-item album images/videos using `gallery-dl` via non-polluting `DataJob`. |

---

### 2.3 Download Queue & Manager Methods

| Method | Parameters | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `start_download` | `{"media_item": dict, "selected_format": dict?, "destination_path": str?}` | `DownloadTask` | Enqueues a single media item for download. |
| `start_batch_download` | `{"items": list[dict], "target_dir": str?}` | `list[DownloadTask]` | Enqueues multiple items in batch with sequential naming and slot scheduling. |
| `pause_download` | `{"task_id": str}` | `{"paused": bool}` | Signals pause for an active task, preserving partial `.part` file. |
| `resume_download` | `{"task_id": str}` | `{"resumed": bool}` | Resumes a paused download with HTTP Range byte offset. |
| `cancel_download` | `{"task_id": str}` | `{"cancelled": bool}` | Signals task cancellation and deletes temporary staging file. |
| `pause_all_downloads` | `{}` | `{"paused_count": int}` | Pauses all active and pending tasks in the queue. |
| `resume_all_downloads` | `{}` | `{"resumed_count": int}` | Resumes all paused tasks in the queue. |
| `cancel_all_downloads` | `{}` | `{"cancelled_count": int}` | Cancels all active and queued downloads. |
| `clear_completed_tasks`| `{}` | `{"cleared_count": int}` | Clears completed, cancelled, and failed tasks from the database. |
| `get_download_tasks` | `{"status": str?, "limit": int?}` | `{"tasks": list, "count": int}` | Queries download tasks from SQLite with optional status filtering. |
| `get_download_queue_state` | `{}` | `{"max_concurrent": int, "active_count": int, "pending_count": int, "counts": dict}` | Returns slot occupancy and status aggregates. |
| `recover_interrupted_tasks` | `{"auto_resume": bool?}` | `RecoverySummary` | Audits disk `.part` files against SQLite to recover interrupted downloads. |

---

### 2.4 Bandwidth Throttling & Network Rate Limits

| Method | Parameters | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `set_speed_limit` | `{"speed_limit_kbps": int}` | `{"speed_limit_kbps": int, "status": "updated"}` | Adjusts global download speed limit dynamically without breaking active transfers. |
| `get_speed_limit` | `{}` | `{"speed_limit_kbps": int}` | Retrieves the current active speed limit. |

---

### 2.5 Preferences & Settings

| Method | Parameters | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `get_preferences` | `{}` | `dict[str, Any]` | Fetches all persisted application preferences from SQLite. |
| `update_preferences` | `{"preferences": dict}` | `dict[str, Any]` | Merges updates into SQLite preferences and synchronizes active runtime state. |
| `reset_preferences` | `{}` | `dict[str, Any]` | Resets all settings to factory defaults. |

---

### 2.6 Session Credentials & Cookie Management

| Method | Parameters | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `save_cookie_profile` | `{"domain": str, "content": str, "browser_source": str?}` | `CookieProfileRecord` | Parses Netscape cookies and stores them securely. |
| `get_cookie_profiles` | `{}` | `{"profiles": list, "count": int}` | Lists all saved cookie profiles. |
| `delete_cookie_profile`| `{"domain": str}` | `{"deleted": bool}` | Deletes cookie profile and associated cookie file. |
| `list_browser_cookies` | `{}` | `{"browsers": list[str]}` | Lists supported installed browsers for cookie extraction. |
| `import_browser_cookies`| `{"browser": str, "domain": str}` | `CookieProfileRecord` | Extracts session cookies directly from local browser cookie stores via `yt-dlp`. |
| `set_domain_headers` | `{"domain": str, "headers": dict}` | `{"domain": str, "headers": dict}` | Saves custom HTTP headers for a target domain. |
| `get_domain_headers` | `{"domain": str?}` | `dict[str, dict]` | Retrieves custom headers for a domain or all domains. |
| `delete_domain_headers`| `{"domain": str}` | `{"deleted": bool}` | Removes custom headers for a domain. |

---

### 2.7 Saved Sources & Differential Rescanning

| Method | Parameters | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `save_source` | `{"url": str, "title": str, "platform": str, "category": str, "custom_tag": str?}` | `SavedSource` | Bookmarks a public source or profile. |
| `get_saved_sources` | `{"tag": str?, "platform": str?}` | `{"sources": list, "count": int}` | Lists bookmarked sources with optional tag/platform filtering. |
| `delete_saved_source` | `{"source_id": str}` | `{"deleted": bool}` | Removes a saved source bookmark. |
| `rescan_source` | `{"source_id": str}` | `IncrementalScanResult` | Rescans a saved source, discovering only delta items not previously scanned. |
| `rescan_all_sources` | `{}` | `RescanAllSummary` | Batch rescans all saved sources sequentially. |

---

### 2.8 Media Library & Local Persistence

| Method | Parameters | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `get_saved_media` | `{"category": str?, "format_type": str?, "limit": int?}` | `{"items": list, "count": int}` | Queries saved media library items. |
| `toggle_save_media` | `{"media_id": str, "is_saved": bool}` | `{"media_id": str, "is_saved": bool}` | Toggles media item favorite/saved status. |
| `delete_media_item` | `{"media_id": str, "delete_file": bool?}` | `{"deleted": bool}` | Deletes media item from SQLite and optionally removes local file from disk. |
| `get_scan_history` | `{"limit": int?}` | `{"history": list, "count": int}` | Retrieves previous scan sessions. |
| `get_scan_items` | `{"scan_id": str}` | `{"items": list, "count": int}` | Fetches discovered items from a specific scan session. |
| `clear_scan_history` | `{}` | `{"cleared": bool}` | Clears all scan history sessions. |

---

## 3. Real-Time Telemetry & Asynchronous Events

The Python engine broadcasts real-time progress events to `stdout` as JSON-RPC notifications (without an `id`). The Electron bridge forwards these to the React renderer via typed Electron IPC:

| Event Channel | Payload | Trigger Condition |
| :--- | :--- | :--- |
| `download:progress` | `ProgressUpdate` (percent, speed, ETA, downloaded bytes) | Emitted every 150ms during active stream download. |
| `download:paused` | `{"task_id": str}` | Task paused by user or recovery service. |
| `download:resumed` | `{"task_id": str}` | Task resumed by user or recovery service. |
| `download:cancelled` | `{"task_id": str}` | Task cancelled by user. |
| `download:completed` | `{"task_id": str, "destination_path": str}` | File successfully verified and moved to target directory. |
| `download:failed` | `{"task_id": str, "error_message": str}` | Network drop, permission denial, or stream abort. |
| `queue_cleared` | `{"cleared_count": int}` | Completed tasks flushed from queue. |
| `download:recovery_completed`| `RecoverySummary` | Startup audit of interrupted downloads finished. |

---

## 4. Electron Preload API (`window.api`) Reference

In `desktop/preload/index.ts`, all methods are exposed via Electron `contextBridge`:

```typescript
export interface DesktopApi {
  // Python Engine & System
  pingPython(): Promise<PingResponse>;
  getPythonSystemInfo(): Promise<SystemInfoResponse>;
  getPythonStatus(): Promise<PythonStatus>;
  getFFmpegInfo(): Promise<FFmpegInfoResponse>;

  // Scanning & Extraction
  classifyUrl(url: string): Promise<ClassifiedUrlResult>;
  extractVideo(url: string, timeout?: number): Promise<VideoExtractResult>;
  extractGallery(url: string, timeout?: number): Promise<GalleryExtractResult>;

  // Downloader & Queue
  startDownload(item: MediaItem, format?: MediaFormatInfo, dest?: string): Promise<DownloadTask>;
  startBatchDownload(items: BatchItem[], targetDir?: string): Promise<DownloadTask[]>;
  pauseDownload(taskId: string): Promise<{ paused: boolean }>;
  resumeDownload(taskId: string): Promise<{ resumed: boolean }>;
  cancelDownload(taskId: string): Promise<{ cancelled: boolean }>;
  pauseAllDownloads(): Promise<{ paused_count: number }>;
  resumeAllDownloads(): Promise<{ resumed_count: number }>;
  cancelAllDownloads(): Promise<{ cancelled_count: number }>;
  clearCompletedTasks(): Promise<{ cleared_count: number }>;
  getDownloadTasks(status?: string, limit?: number): Promise<{ tasks: DownloadTask[]; count: number }>;
  getDownloadQueueState(): Promise<QueueState>;
  recoverInterruptedTasks(autoResume?: boolean): Promise<RecoverySummary>;

  // Throttler
  setSpeedLimit(speedLimitKbps: number): Promise<{ speed_limit_kbps: number }>;
  getSpeedLimit(): Promise<{ speed_limit_kbps: number }>;

  // Preferences
  getPreferences(): Promise<Record<string, any>>;
  updatePreferences(prefs: Record<string, any>): Promise<Record<string, any>>;
  resetPreferences(): Promise<Record<string, any>>;

  // Native Dialogs
  selectFolder(): Promise<string | null>;
  selectCookieFile(): Promise<string | null>;
  openPath(filePath: string): Promise<void>;

  // Event Listeners
  onDownloadProgress(callback: (update: ProgressUpdate) => void): () => void;
  onDownloadStatusChanged(callback: (event: StatusEvent) => void): () => void;
}
```
