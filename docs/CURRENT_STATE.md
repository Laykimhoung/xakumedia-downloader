# XakuMedia — Current Project State

**Last Updated:** October 17, 2026  
**Active Milestone:** Milestone 10 — Basic Download Manager Engine & Streaming  
**Overall Status:** Active Streaming Download Manager & Queue Phase  

---

## 1. Project Purpose & Target Architecture

XakuMedia is a local-first Windows 11 desktop bulk media downloader developed under the XAKURAII identity. It enables users to discover, preview, organize, and download publicly accessible images and videos from direct URLs, galleries, and supported platforms.

The system relies on a secure 3-tier desktop architecture:
1. **Frontend (Renderer):** React + TypeScript + Vite + Tailwind CSS + Lucide Icons. Renders horizontal media rows, previews, queue status, and settings.
2. **Desktop Shell (Electron Main):** Process isolation, secure context-isolated IPC boundary, window lifecycle, and Python engine management.
3. **Backend Engine (Python 3.12):** URL classification, extraction providers (`yt-dlp`, `gallery-dl`, `httpx`), FFmpeg stream merging, SQLite task queue, and atomic disk writes.

---

## 2. Milestone Progress Tracker

| Milestone | Title | Status | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **Milestone 0** | Environment and Project Inspection | **Completed** | Inspected Python 3.12.10, Node v24.14.0, npm 11.9.0, Git 2.52.0, FFmpeg/FFprobe n4.4.2. Verified intact existing instructions. |
| **Milestone 1** | Repository Foundation | **Completed** | Initialized Git on `main`; verified `.gitignore` excludes `my-learning/` and `.agents/`; created README.md, docs/ARCHITECTURE.md, docs/SETUP.md, docs/DEVELOPMENT_ROADMAP.md, and personal learning session 001. |
| **Milestone 2** | Runtime and Dependency Setup | **Completed** | Dedicated Python `.venv` created; `backend/pyproject.toml` configured with `httpx`, `platformdirs`, `pydantic`, `pillow`, `pytest`, `ruff`; editable install verified; pytest smoke test passed in 0.08s; ruff check passed; `package.json` initialized with React, Vite, TS, Tailwind, Electron; `npm install` completed (204 packages); `npx vite` (5.4.21) and `npx electron` (v33.4.11) verified. |
| **Milestone 3** | Minimal Electron & React Shell | **Completed** | Implemented secure Electron main process (`desktop/main/index.ts`) with contextIsolation, strict CSP, sandbox, and single-instance lock; created validated preload bridge (`desktop/preload/index.ts`) exposing typed `DesktopApi`; built desktop bundler (`scripts/build-desktop.mjs`) and dev orchestrator (`scripts/dev.mjs`); built polished React layout in `frontend/src/App.tsx`; verified automated startup and window paint via `npm run test:desktop`. |
| **Milestone 4** | Python Engine Foundation | **Completed** | Modular package under `backend/src/xakumedia/` (`core/`, `models/`, `utils/`, `exceptions/`); Pydantic V2 domain models (`MediaItem`, `MediaFormatInfo`, `DownloadTask`, `AppConfig`); Windows-safe sequential naming (`{user}_{vdo\|img}_{001}`) & disk sequence scanning; path traversal prevention (`validate_destination_path`); 17 unit tests passing (`npm run test:python`); 0 lint errors (`npm run lint:python`). |
| **Milestone 5** | Electron-to-Python Communication | **Completed** | Python stdio JSON-RPC 2.0 server (`xakumedia.server`); TypeScript child process manager (`desktop/main/python-bridge.ts`); validated context-isolated preload IPC bridge (`window.api.pingPython`, `getPythonSystemInfo`, `getPythonStatus`); live React UI diagnostics with round-trip ping measurement; automated smoke test verified end-to-end handshake and clean EOF shutdown without zombie processes; 24 unit tests passing. |
| **Milestone 6** | Direct URL Detection | **Completed** | Direct scanner (`scanners/direct.py`) inspecting MIME headers, content lengths, and filenames; SSRF defense (`utils/security.py`) blocking private IPs, loopbacks, and metadata endpoints; `classify_url` RPC handler exposed via IPC bridge (`window.api.classifyUrl`); interactive React scanning interface with quick presets and live media discovery preview card; 37 unit tests passing; smoke test asserting SSRF defense over IPC. |
| **Milestone 7** | First Real Video Extraction (yt-dlp) | **Completed** | Integrated `yt-dlp>=2024.8.6` into isolated Python environment; created `extractors/video.py` for metadata and stream format extraction; normalized resolutions, containers, codecs, and stream merging requirements (`requires_merge`); mapped platform errors (`PrivateMediaError`, `RateLimitError`, `DRMProtectedError`, `MediaUnavailableError`); registered `extract_video` RPC and desktop IPC bridge; interactive React format stream chips and platform video badge; 41 unit tests passing; desktop smoke test passing. |
| **Milestone 8** | First Real Gallery Extraction (gallery-dl) | **Completed** | Integrated `gallery-dl>=1.27.0` in isolated venv; created `extractors/gallery.py` using `DataJob` with `file=None` (zero stdio pollution); parsed and normalized multi-item albums into `MediaItem` collections; mapped domain errors (`PrivateMediaError`, `RateLimitError`, `MediaUnavailableError`, `UnsupportedSourceError`); unified `classify_url` and registered explicit `extract_gallery` RPC; typed `extractGallery` IPC method; rendered responsive multi-item album grids with sequential `#index` labels in React; 48 unit tests passing; desktop smoke test passing. |
| **Milestone 9** | Media Library & Local SQLite Persistence | **Completed** | Implemented relational SQLite schema with migrations (`media_items`, `scan_history`, `scan_history_items`, `download_tasks`, `app_preferences`); built thread-safe connection manager (`db/connection.py`) with WAL mode, foreign keys, busy timeouts; built repository layer (`db/repository.py`); registered database RPC handlers with auto-persistence during URL classification; exposed typed desktop IPC bridge (`getScanHistory`, `getScanItems`, `clearScanHistory`, `getSavedMedia`, `toggleSaveMedia`, `deleteMediaItem`); built interactive React Media Library and Scan History; 56 unit tests passing; desktop smoke test verified database round-trip over IPC. |
| **Milestone 10** | Basic Download Manager Engine & Streaming | **Completed** | Built chunked HTTP/HTTPS streaming I/O (`downloader/stream.py`) with atomic `.part` staging and sequential collision avoidance; built `DownloadManager` (`downloader/manager.py`) with thread pool executor and SQLite persistence; added thread-safe JSON-RPC notifications (`_stdout_lock`); registered `start_download`, `cancel_download`, `get_download_tasks` RPC handlers; exposed typed IPC bridge and desktop `openPath`; built interactive React Downloads Manager view with real-time progress bars, speed, ETA, and cancellation; 63 unit tests passing; desktop smoke test passing. |

---

## 3. Verified Functionality

- **Environment Runtimes Verified:**
  - Python: `3.12.10`
  - Node.js: `v24.14.0`
  - npm: `11.9.0`
  - Git: `2.52.0.windows.1`
  - FFmpeg: `n4.4.2-4-g944ee75106-20220916`
  - FFprobe: `n4.4.2-4-g944ee75106-20220916`
- **Repository Structure:**
  - Git initialized (`main` branch) and committed initial foundation (`5c01537`).
  - Production-grade `.gitignore` protecting caches, venv, node_modules, downloads, database files, and personal learning directories.
  - Universal and project-specific agent instructions (`AGENTS.md`, `.agents/AGENTS.md`).
- **Backend & Python Tooling:**
  - Dedicated virtual environment isolated at `backend/.venv/` (zero root clutter).
  - `backend/pyproject.toml` adhering to PEP 621.
  - Core libraries installed: `httpx>=0.27.0`, `platformdirs>=4.2.0`, `pydantic>=2.7.0`, `pillow>=10.3.0`, `yt-dlp>=2024.8.6`, `gallery-dl>=1.27.0`.
  - Developer tooling installed and passing: `pytest` (63 passed in 1.48s), `ruff` (all checks passed).
- **Frontend & Desktop Tooling:**
  - Modular `frontend/package.json` with React 18, Vite 5, Tailwind CSS 3, TypeScript 5, Electron 33.
  - Dependencies isolated in `frontend/node_modules/` (zero root clutter).
  - Production build verified: `vite build` generated in 3.57s (`frontend/dist/`).
  - Strict type checking verified: `tsc --noEmit` cleanly passed.
- **Desktop Shell & Security Architecture:**
  - Electron 33 main process in `desktop/main/index.ts` with strict security defaults (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, webSecurity, custom CSP header enforcement).
  - Minimal, context-isolated preload script in `desktop/preload/index.ts` exposing typed `DesktopApi` (`ping`, `getSystemInfo`, `classifyUrl`, `extractVideo`, `extractGallery`, `getScanHistory`, `getScanItems`, `clearScanHistory`, `getSavedMedia`, `toggleSaveMedia`, `deleteMediaItem`, `startDownload`, `cancelDownload`, `getDownloadTasks`, `onDownloadProgress`, `onDownloadCompleted`, `openPath`).
  - Fast esbuild desktop compilation (`scripts/build-desktop.mjs`) generating `desktop/dist/main.cjs` and `desktop/dist/preload.cjs`.
  - End-to-end launch verification: `npm run test:desktop` verified window creation, DOM rendering, SSRF protection, database IPC query, downloader tasks query, and graceful exit.
- **Basic Download Manager Engine & Streaming (Milestone 10):**
  - Chunked Streaming I/O (`backend/src/xakumedia/downloader/stream.py`): Efficient 64KB buffer chunks streaming direct to disk via `httpx.stream`, polling `is_cancelled` token, computing speed (bytes/sec) and ETA, saving to `.part` extension, and atomically moving to final destination path upon complete transfer.
  - Download Manager (`backend/src/xakumedia/downloader/manager.py`): ThreadPoolExecutor managing background download threads, generating Windows-safe sequential filenames (`format_sequential_filename`), persisting state transitions in SQLite (`queued` -> `downloading` -> `completed` / `failed` / `cancelled`), and dispatching real-time notifications.
  - Stdio JSON-RPC Notifications: Thread-safe stdout locking (`_stdout_lock = threading.Lock()`) in `backend/src/xakumedia/server/loop.py` to prevent stdout collisions between synchronous request-responses and asynchronous download progress notifications.
  - Dispatcher RPC Handlers (`backend/src/xakumedia/server/dispatcher.py`): Handlers for `start_download`, `cancel_download`, and `get_download_tasks`.
  - Electron Preload & Main IPC Bridge: Added typed IPC handlers in `desktop/main/index.ts`, typed method signatures in `desktop/shared/types.ts`, and context-bridge exposure in `desktop/preload/index.ts`.
  - Windows File Explorer Integration: `shell.showItemInFolder` and `shell.openPath` via `window.api.openPath`.
  - React Downloads Manager UI (`frontend/src/App.tsx`):
    - Dedicated Downloads tab with status filter tabs (All, Active, Completed, Failed/Cancelled).
    - Real-time progress bars with animated gradient, percentage, speed in MB/s, ETA, and downloaded vs total bytes.
    - Live cancellation and retry buttons.
    - "Show File" button opening downloaded file in Windows File Explorer.
    - Immediate "Download Now" buttons on Scanner discovery cards and Media Library items.
    - Active downloads indicator in sidebar navigation and top application header.
  - Automated Verification: 7 unit tests in `backend/tests/test_downloader.py` covering chunk streaming, atomic rename, cancellation tokens, manager lifecycle, and sequential naming; all 63 pytest tests pass in 1.48s; desktop smoke test verified end-to-end IPC query for download tasks.

---

## 4. Known Bugs & Current Limitations

- Stream merging of separate video + audio tracks (e.g. YouTube 1080p formats requiring FFmpeg) is scheduled for Milestone 11.
- Batch queue orchestration and multi-item gallery downloads are scheduled for Milestone 13.

---

## 5. Next Milestone & Acceptance Criteria

**Next Milestone:** **Milestone 11 — FFmpeg Stream Merging & Format Conversion**

### Acceptance Criteria:
1. Locate and verify FFmpeg and FFprobe binaries dynamically from system PATH or configured path.
2. Implement audio/video stream multiplexing for formats tagged with `requires_merge: true` using FFmpeg subprocess without shell invocation.
3. Implement safe post-download cleanup of intermediate unmerged streams upon successful completion.
4. Expose merging progress states (`status: "merging"`) in JSON-RPC and React UI.
5. Add automated tests with synthetic test streams or mock FFmpeg wrappers.

