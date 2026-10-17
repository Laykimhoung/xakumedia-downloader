# XakuMedia — Current Project State

**Last Updated:** October 17, 2026  
**Active Milestone:** Milestone 9 — Media Library & Local SQLite Persistence  
**Overall Status:** Core Extraction, Local Persistence & Library Phase  

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
| **Milestone 9** | Media Library & Local SQLite Persistence | **Completed** | Implemented relational SQLite schema with migrations (`media_items`, `scan_history`, `scan_history_items`, `download_tasks`, `app_preferences`); built thread-safe connection manager (`db/connection.py`) with WAL mode, foreign keys, busy timeouts; built repository layer (`db/repository.py`); registered database RPC handlers with auto-persistence during URL classification; exposed typed desktop IPC bridge (`getScanHistory`, `getScanItems`, `clearScanHistory`, `getSavedMedia`, `toggleSaveMedia`, `deleteMediaItem`); built interactive React Media Library (filter pills, deletion, bookmark toggle) and Scan History (audit log, item inspection drawer, 1-click rescan); 56 unit tests passing; desktop smoke test verified database round-trip over IPC. |

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
  - Developer tooling installed and passing: `pytest` (56 passed in 1.04s), `ruff` (all checks passed).
- **Frontend & Desktop Tooling:**
  - Modular `frontend/package.json` with React 18, Vite 5, Tailwind CSS 3, TypeScript 5, Electron 33.
  - Dependencies isolated in `frontend/node_modules/` (zero root clutter).
  - Production build verified: `vite build` generated in 3.02s (`frontend/dist/`).
  - Strict type checking verified: `tsc --noEmit` cleanly passed.
- **Desktop Shell & Security Architecture:**
  - Electron 33 main process in `desktop/main/index.ts` with strict security defaults (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, webSecurity, custom CSP header enforcement).
  - Minimal, context-isolated preload script in `desktop/preload/index.ts` exposing typed `DesktopApi` (`ping`, `getSystemInfo`, `classifyUrl`, `extractVideo`, `extractGallery`, `getScanHistory`, `getScanItems`, `clearScanHistory`, `getSavedMedia`, `toggleSaveMedia`, `deleteMediaItem`).
  - Fast esbuild desktop compilation (`scripts/build-desktop.mjs`) generating `desktop/dist/main.cjs` and `desktop/dist/preload.cjs`.
  - Hot-reloading development orchestrator (`scripts/dev.mjs`).
  - End-to-end launch verification: `npm run test:desktop` verified window creation, DOM rendering, SSRF protection, database IPC query, and graceful exit.
- **Media Library & Local SQLite Persistence (Milestone 9):**
  - Database Schema & Migrations (`backend/src/xakumedia/db/schema.py`): Tables `schema_version`, `scan_history`, `media_items`, `scan_history_items`, `download_tasks`, `app_preferences` with foreign keys, cascading deletes, and self-healing column checks.
  - Thread-Safe Connection Management (`backend/src/xakumedia/db/connection.py`): WAL mode (`PRAGMA journal_mode = WAL`), foreign keys enabled (`PRAGMA foreign_keys = ON`), busy timeout (5000ms), and atomic transaction context manager (`get_db_session`).
  - Repository Layer (`backend/src/xakumedia/db/repository.py`): `MediaRepository` providing atomic scan persistence, URL classification history, deterministic preview thumbnail lookup, saved bookmarks CRUD, and task queue persistence.
  - Automatic Scan Logging: `classify_url` RPC automatically logs every successful direct, video, or gallery scan event to SQLite.
  - Preload & Main IPC Bridge: Added typed database methods in `desktop/shared/types.ts`, `desktop/preload/index.ts`, and `desktop/main/index.ts`.
  - React Media Library & History UI (`frontend/src/App.tsx`):
    - Media Library: Filter pills (All, Videos, Images, Audio), thumbnail cards, metadata, delete, and source re-scanning.
    - Scan History: Full audit log, preview thumbnails, item count badges, inspect scan items drawer, and 1-click rescan.
    - Bookmark Button: Discovered media cards (both single-item and multi-item gallery grids) feature live bookmark toggles updating SQLite instantly.
  - Automated Verification: 8 database unit tests in `test_database.py` (56 total tests in suite passing in 1.04s); desktop smoke test verified end-to-end IPC database query (`get_scan_history`).

---

## 4. Known Bugs & Current Limitations

- Download execution engine, chunked streaming disk writes, and pause/resume are scheduled for Milestone 10.
- FFmpeg stream merging and format conversion are scheduled for Milestone 11.

---

## 5. Next Milestone & Acceptance Criteria

**Next Milestone:** **Milestone 10 — Basic Download Manager Engine & Streaming**

### Acceptance Criteria:
1. Implement single-file HTTP/HTTPS download engine using streaming I/O (`httpx.stream`) without buffering entire files in RAM.
2. Implement atomic file writes using temporary file naming (`.part` extension) and atomic rename upon completion.
3. Emit structured real-time progress events (`bytes_downloaded`, `total_bytes`, `progress_percent`, `speed_bytes_sec`, `eta_seconds`) over JSON-RPC.
4. Integrate download task state transitions in SQLite (`queued` -> `downloading` -> `completed` / `failed`).
5. Wire Electron IPC event channel for live progress streaming from Python to renderer.
6. Connect React Downloads tab to display live downloading progress bars, speed, ETA, and cancellation controls.
7. Automated tests for chunk streaming, partial file handling, and network interruption recovery.
