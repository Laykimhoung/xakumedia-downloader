# XakuMedia — Current Project State

**Last Updated:** October 24, 2026  
**Active Milestone:** Milestone 14 — Application Settings & Preference Management  
**Overall Status:** Batch Queue Orchestration & Gallery Bulk Downloads Complete  

---

## 1. Project Purpose & Target Architecture

XakuMedia is a local-first Windows 11 desktop bulk media downloader developed under the XAKURAII identity. It enables users to discover, preview, organize, and download publicly accessible images and videos from direct URLs, galleries, and supported platforms.

The system relies on a secure 3-tier desktop architecture:
1. **Frontend (Renderer):** React + TypeScript + Vite + Tailwind CSS + Lucide Icons. In-app video/audio player modal, high-resolution image lightbox with zoom/pan/rotate, media library search/filter/sort, gallery selective bulk download toolbar, download queue slot controls, and diagnostics.
2. **Desktop Shell (Electron Main):** Process isolation, secure context-isolated IPC boundary, privileged `media-loader://` streaming protocol with HTTP 206 Partial Content range support, window lifecycle, and Python engine management.
3. **Backend Engine (Python 3.12):** URL classification, extraction providers (`yt-dlp`, `gallery-dl`, `httpx`), multi-slot concurrent download manager with HTTP Range resumption, FFmpeg stream merging & media inspection, Pillow & FFmpeg local thumbnail caching, SQLite media library & query engine, safe disk deletion, and metadata export.

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
| **Milestone 11** | FFmpeg Stream Merging & Format Conversion | **Completed** | Built dynamic binary discovery (`processor/ffmpeg.py`) for FFmpeg/FFprobe; technical media inspection (`inspect_media`); non-re-encoding stream multiplexing (`merge_video_audio`) with AAC fallback for MP4 containers; format conversion (`convert_container`); dual-track download and auto-merge in `DownloadManager` with intermediate cleanup; registered JSON-RPC handlers; desktop IPC bridge (`getFFmpegInfo`, `inspectMedia`, `mergeStreams`, `convertFormat`); React UI status badge, selectable format chips, and purple merging indicators; 70 unit tests passing; smoke test verified FFmpeg detection over IPC. |
| **Milestone 12** | Media Preview & Library Polish | **Completed** | In-app video and audio player modal supporting local and stream playback; high-resolution image lightbox modal with keyboard navigation (Escape, +/-, 0, R), zoom (25%–400%), and 90° rotation; Media Library real-time search, container dropdown filtering, and 5-way sorting (`newest`, `oldest`, `title`, `size_desc`, `size_asc`); local thumbnail generation and caching via Pillow and FFmpeg (`processor/thumbnail.py`); privileged Chromium `media-loader://` protocol handler with streaming 206 Partial Content range support; media metadata JSON viewer & exporter; safe SQLite and local disk deletion confirmation flow; 77 unit tests passing; desktop smoke test passing. |
| **Milestone 13** | Batch Queue Orchestration & Gallery Bulk Downloads | **Completed** | Multi-item selective bulk gallery downloading (Select All, Deselect All, Invert, individual checkboxes, and Bulk Download CTA); active slot worker concurrency scheduling (configurable 1–10 simultaneous downloads, default 3); in-memory `seq_tracker` sequential filename anti-collision; chunked HTTP Range resumption (`Range: bytes={existing}-`, 206 Partial Content) with `.part` preservation on pause; batch operations (`pause_all`, `resume_all`, `cancel_all`, `clear_completed`, `set_download_concurrency`, `get_download_queue_state`); real-time notifications (`download:paused`, `download:resumed`, `queue_cleared`); 84 unit tests passing; 0 ruff lint errors; frontend typecheck (`tsc --noEmit`) and desktop smoke test passing. |

---

## 3. Verified Functionality

- **Environment Runtimes Verified:**
  - Python: `3.12.10`
  - Node.js: `v24.14.0`
  - npm: `11.9.0`
  - Git: `2.52.0.windows.1`
  - FFmpeg: `n4.4.2-4-g944ee75106-20220916`
  - FFprobe: `n4.4.2-4-g944ee75106-20220916`
- **Batch Queue Orchestration & Gallery Bulk Downloads (Milestone 13):**
  - **Selective Gallery Bulk Download UI (`frontend/src/App.tsx`):**
    - Multi-item gallery results render interactive checkboxes on each discovered item.
    - Global selection controls: **Select All**, **Deselect All**, and **Invert Selection**.
    - Selected item count badge (`N / total Selected`) and prominent "Download Selected (N)" CTA button.
    - Card selection toggle on click with glowing red active border highlight.
  - **Active Slot Concurrency Scheduling (`downloader/manager.py`):**
    - Configurable active worker slots (clamped 1–10, default 3).
    - `_pending_queue` holds waiting tasks with `TaskStatus.QUEUED`.
    - `_schedule_next()` launches waiting tasks whenever active worker count drops below `max_concurrent`.
    - Dynamic concurrency adjustment (`set_concurrency`) immediately schedules waiting tasks when capacity increases.
  - **Sequential Naming Anti-Collision (`downloader/manager.py`):**
    - Batch submissions across the same author employ an in-memory `seq_tracker` to allocate sequential numbers (`{user}_{type}_{seq:03d}`) without race conditions or overwriting.
  - **Pause & Resume with Chunked Range Resumption (`downloader/stream.py` & `downloader/manager.py`):**
    - Active streaming tasks respond immediately to `pause_event.set()` by raising `DownloadPausedError`.
    - Preserves existing `.part` files on disk without unlinking.
    - Resuming requests HTTP `Range: bytes={existing_bytes}-`, handles HTTP 206 Partial Content in append mode (`"ab"`), and handles HTTP 416 (file already complete).
    - Global batch controls: `pause_all()`, `resume_all()`, `cancel_all()`, `clear_completed()`, `get_queue_state()`.
    - Real-time dual-format notifications: `download:paused`, `download:resumed`, `queue_cleared`.
  - **Desktop Shell & Preload Contracts (`desktop/shared/types.ts`, `desktop/main/index.ts`, `desktop/preload/index.ts`):**
    - Typed IPC methods: `startBatchDownload`, `pauseDownload`, `resumeDownload`, `pauseAllDownloads`, `resumeAllDownloads`, `cancelAllDownloads`, `clearCompletedDownloads`, `setDownloadConcurrency`, `getDownloadQueueState`.
    - Typed listeners: `onDownloadPaused`, `onDownloadResumed`, `onQueueCleared`.
  - **Automated Verification:**
    - 7 comprehensive unit tests in `backend/tests/test_batch_queue.py` testing sequential naming, worker throttling, pause & resume with partial files, pause/resume all, cancel all, clear completed, and JSON-RPC dispatching.
    - 84 total pytest tests passing in 4.43s.
    - 0 ruff lint errors (`ruff check backend`).
    - Frontend TypeScript check (`npm run typecheck`) cleanly passes with 0 errors.
    - Production bundle (`npm run build:frontend`) builds successfully.
    - Desktop Electron smoke test (`npm run test:desktop`) cleanly passes.

---

## 4. Known Bugs & Current Limitations

- Application settings UI (configuring download directory, custom quality preferences, default concurrency, theme toggling) is scheduled for Milestone 14.
- Automated update checks and packaging (electron-builder installer) are scheduled for later milestones.

---

## 5. Next Milestone & Acceptance Criteria

**Next Milestone:** **Milestone 14 — Application Settings & Preference Management**

### Acceptance Criteria:
1. Implement persistent configuration service storing user settings in SQLite `app_preferences`.
2. Provide frontend Settings tab:
   - Configurable download directories for images and videos with native Windows folder picker dialog (`dialog.showOpenDialog`).
   - Default concurrency slider / selector (1–10).
   - Preferred video quality (resolution limits, container preference, audio codec preference).
   - Preferred image quality/format options.
3. IPC bridge methods for reading and writing user preferences with backend synchronization.
4. Comprehensive automated unit and integration tests.
5. Documentation update in `docs/CURRENT_STATE.md` and personal learning walkthrough in `my-learning/`.
