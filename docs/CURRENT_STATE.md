# XakuMedia — Current Project State

**Last Updated:** October 23, 2026  
**Active Milestone:** Milestone 13 — Batch Queue Orchestration & Gallery Bulk Downloads  
**Overall Status:** Media Preview, Lightbox & Library Polish Complete  

---

## 1. Project Purpose & Target Architecture

XakuMedia is a local-first Windows 11 desktop bulk media downloader developed under the XAKURAII identity. It enables users to discover, preview, organize, and download publicly accessible images and videos from direct URLs, galleries, and supported platforms.

The system relies on a secure 3-tier desktop architecture:
1. **Frontend (Renderer):** React + TypeScript + Vite + Tailwind CSS + Lucide Icons. In-app video/audio player modal, high-resolution image lightbox with zoom/pan/rotate, media library search/filter/sort, format selector, and diagnostics.
2. **Desktop Shell (Electron Main):** Process isolation, secure context-isolated IPC boundary, privileged `media-loader://` streaming protocol with HTTP 206 Partial Content range support, window lifecycle, and Python engine management.
3. **Backend Engine (Python 3.12):** URL classification, extraction providers (`yt-dlp`, `gallery-dl`, `httpx`), FFmpeg stream merging & media inspection, Pillow & FFmpeg local thumbnail caching, SQLite media library & query engine, safe disk deletion, and metadata export.

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
| **Milestone 12** | Media Preview & Library Polish | **Completed** | In-app video and audio player modal supporting local and stream playback; high-resolution image lightbox modal with keyboard navigation (Escape, +/-, 0, R), zoom (25%–400%), and 90° rotation; Media Library real-time search, container dropdown filtering, and 5-way sorting (`newest`, `oldest`, `title`, `size_desc`, `size_asc`); local thumbnail generation and caching via Pillow and FFmpeg (`processor/thumbnail.py`); privileged Chromium `media-loader://` protocol handler with streaming 206 Partial Content range support; media metadata JSON viewer & exporter; safe SQLite and local disk deletion confirmation flow; 77 unit tests passing (`npm run test:python`); 0 ruff lint errors; frontend typecheck (`tsc --noEmit`) and desktop smoke test passing. |

---

## 3. Verified Functionality

- **Environment Runtimes Verified:**
  - Python: `3.12.10`
  - Node.js: `v24.14.0`
  - npm: `11.9.0`
  - Git: `2.52.0.windows.1`
  - FFmpeg: `n4.4.2-4-g944ee75106-20220916`
  - FFprobe: `n4.4.2-4-g944ee75106-20220916`
- **Media Preview, Lightbox & Library Polish (Milestone 12):**
  - **In-App Video & Audio Player Modal (`frontend/src/App.tsx`):**
    - Responsive modal with backdrop blur supporting local downloaded files and direct streams.
    - Custom playback speed selector (`0.5x`, `0.75x`, `1.0x`, `1.25x`, `1.5x`, `2.0x`).
    - Dedicated audio player UI with album artwork and waveform animations.
    - Direct actions: Show in folder, download stream, export metadata JSON.
  - **High-Resolution Image Lightbox Modal (`frontend/src/App.tsx`):**
    - Fullscreen lightbox overlay with dark blur background.
    - Smooth CSS transforms for zoom (25% to 400%) and 90-degree clockwise rotation.
    - Keyboard shortcut listener: `Escape` to close, `+`/`=` to zoom in, `-` to zoom out, `0` to reset zoom, `R` to rotate.
    - Floating toolbar with zoom controls, reset, rotate, and direct folder/download actions.
    - Comprehensive metadata footer displaying image dimensions, container, filesize, and author.
  - **Privileged Streaming Media Protocol (`desktop/main/index.ts`):**
    - Registered standard, secure `media-loader://` scheme in Electron with `stream: true`, `supportFetchAPI: true`.
    - Handled via `net.fetch(pathToFileURL(filePath).toString())`, providing native Chromium HTTP 206 Partial Content range requests for video seeking and high-res image decoding without disabling `webSecurity`.
    - CSP updated with `media-loader:` directive.
  - **Thumbnail Generation & Caching Module (`backend/src/xakumedia/processor/thumbnail.py`):**
    - Generates high-quality JPEG thumbnails using Pillow for image files and FFmpeg frame extraction (`-ss 00:00:01 -vframes 1`) for video files.
    - MD5 cache hashing under `thumbnails_dir`; avoids redundant re-processing on repeated visits.
  - **Media Library Advanced Search, Filter & Sort (`backend/src/xakumedia/db/repository.py`):**
    - Added `query_saved_media` supporting text search (`title`, `original_url`, `author`), media type filter, container format filter, and sorting (`newest`, `oldest`, `title`, `size_desc`, `size_asc`).
  - **Safe Disk Deletion & Metadata Export:**
    - `delete_downloaded_media` in repository deletes SQLite records and provides an optional safe file unlink with error resilience.
    - `export_media_metadata` exports complete JSON payloads combining media discovery details and download task state.
    - Frontend includes confirmation dialog with "Also delete from disk" checkbox and JSON viewer modal with clipboard copy and `.json` file download.
  - **Automated Verification:**
    - 7 comprehensive unit tests in `backend/tests/test_library_and_thumbnail.py` (image downscaling, video frame capture, cache hit mechanics, database query sorting/filtering, safe file deletion, and JSON-RPC dispatching).
    - 77 total pytest tests passing in 4.38s.
    - 0 ruff lint errors.
    - Frontend TypeScript check (`npm run typecheck`) cleanly passes with 0 errors.
    - Desktop Electron smoke test (`npm run test:desktop`) cleanly passes.

---

## 4. Known Bugs & Current Limitations

- Batch queue orchestration, concurrent worker pooling, and bulk multi-item gallery downloads are scheduled for Milestone 13.
- Advanced settings UI (configuring download directory, max concurrent downloads, default quality preferences) is scheduled for Milestone 14.

---

## 5. Next Milestone & Acceptance Criteria

**Next Milestone:** **Milestone 13 — Batch Queue Orchestration & Gallery Bulk Downloads**

### Acceptance Criteria:
1. Implement multi-item batch queue manager supporting bulk selection from gallery discovery results.
2. Provide configurable concurrency worker pool (e.g. 1–5 simultaneous downloads) with active queue scheduling.
3. Add batch operations: Pause All, Resume All, Cancel All, and Clear Completed.
4. Support selective bulk download (select all, deselect all, invert selection, range select).
5. Comprehensive automated tests for queue orchestration and concurrency handling.
6. Documentation update in `docs/CURRENT_STATE.md` and personal learning notes in `my-learning/`.


