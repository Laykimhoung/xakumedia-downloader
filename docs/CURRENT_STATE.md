# XakuMedia — Current Project State

**Last Updated:** October 15, 2026  
**Active Milestone:** Milestone 7 — First Real Video Extraction (yt-dlp)  
**Overall Status:** Core Extraction & Scanning Phase  

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
  - Developer tooling installed and passing: `pytest` (48 passed in 1.28s), `ruff` (all checks passed).
- **Frontend & Desktop Tooling:**
  - Modular `frontend/package.json` with React 18, Vite 5, Tailwind CSS 3, TypeScript 5, Electron 33.
  - Dependencies isolated in `frontend/node_modules/` (zero root clutter).
  - Tooling configs: `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/tailwind.config.js`, `frontend/postcss.config.js`.
  - Production build verified: `vite build` generated in 9.81s (`frontend/dist/`).
  - Strict type checking verified: `tsc --noEmit` cleanly passed.
- **Desktop Shell & Security Architecture:**
  - Electron 33 main process in `desktop/main/index.ts` with strict security defaults (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, webSecurity, custom CSP header enforcement).
  - Minimal, context-isolated preload script in `desktop/preload/index.ts` exposing typed `DesktopApi` (`ping`, `getSystemInfo`, `classifyUrl`, `extractVideo`, `extractGallery`).
  - Fast esbuild desktop compilation (`scripts/build-desktop.mjs`) generating `desktop/dist/main.cjs` and `desktop/dist/preload.cjs`.
  - Hot-reloading development orchestrator (`scripts/dev.mjs`).
  - End-to-end launch verification: `npm run test:desktop` verified window creation, DOM rendering, and graceful exit.
- **Root Workspace Orchestration:**
  - Root `package.json` acts as a zero-dependency workspace coordinator with scripts (`dev`, `start`, `test:desktop`, `dev:frontend`, `build:all`, `test:python`, `lint:python`).
- **Python Engine Foundation (Milestone 4):**
  - Package structure: `backend/src/xakumedia/` (`core/`, `exceptions/`, `models/`, `utils/`).
  - Domain models: `MediaItem`, `MediaFormatInfo`, `DownloadTask`, `ProgressUpdate`, `ClassifiedUrl`, `AppConfig` implemented with Pydantic V2.
  - Windows naming & anti-collision: `sanitize_username` trims illegal characters and boundary underscores; `format_sequential_filename` enforces `{username}_{vdo|img}_{001}.{ext}` with dynamic 4+ digit expansion; `get_next_sequence_number` scans disk so files are never overwritten.
  - Path traversal security: `validate_destination_path` enforces target paths reside strictly inside authorized roots.
- **Electron-to-Python IPC Communication (Milestone 5):**
  - Protocol: JSON-RPC 2.0 models (`JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcError`) over standard I/O (stdin / stdout).
  - Python Server: `backend/src/xakumedia/server/` with unbuffered line streaming (`server.loop`), method dispatcher (`server.dispatcher`), and clean EOF shutdown.
  - Desktop Bridge: `PythonBridge` (`desktop/main/python-bridge.ts`) managing process spawning, readline stream processing, request ID correlation, timeout handling, and graceful SIGKILL fallback.
  - Electron Preload: Secure typed bridge (`pingPython`, `getPythonSystemInfo`, `getPythonStatus`) exposed to renderer.
  - React UI: Real-time diagnostics dashboard displaying Python PID, connection state, round-trip latency, and runtime directories.
  - Automated Verification: End-to-end desktop smoke test verified handshake, ping/pong, and clean shutdown; 24 Python unit tests passing in 0.46s; 0 lint errors.
- **Direct Media URL Detection & SSRF Defense (Milestone 6):**
  - Direct Scanner: `scanners/direct.py` inspecting MIME types, headers (`Content-Type`, `Content-Length`, `Content-Disposition`), handling HEAD and Range GET fallbacks, and synthesizing `ClassifiedUrl` and `MediaItem` models.
  - SSRF Protections: `utils/security.py` blocking loopback, link-local, private subnets, cloud metadata IPs, and local hostnames.
  - IPC Integration: `classify_url` RPC method wired to `window.api.classifyUrl` in Electron preload bridge.
  - React UI: Interactive scanning bar with quick presets, active loading states, error cards, and rich media discovery preview cards.
  - Automated Verification: 37 unit tests passing in 0.43s; desktop smoke test asserting end-to-end SSRF defense over IPC.
- **Video Platform Extraction via yt-dlp (Milestone 7):**
  - Video Extractor: `extractors/video.py` executing `yt-dlp` in non-download metadata extraction mode (`extract_info(download=False)`).
  - Format Normalization: `normalize_formats` filtering storyboards, sorting streams from highest resolution to lowest, and flagging adaptive video-only streams (`requires_merge: true`).
  - Error Classification: `parse_yt_dlp_error` mapping raw error strings to domain exceptions (`PrivateMediaError`, `RateLimitError`, `DRMProtectedError`, `MediaUnavailableError`, `UnsupportedSourceError`).
  - Unified Dispatcher: `classify_url` automatically falling back from direct file probe to `extract_video_info`; explicit `extract_video` RPC endpoint registered.
  - Desktop Bridge & UI: `DesktopApi.extractVideo` exposed through Electron preload; React UI displays platform video badges and format stream chips (resolutions, container, merge requirements).
  - Automated Verification: 41 unit tests passing in 1.22s; desktop smoke test passing; 0 ruff lint errors.
- **Gallery & Collection Extraction via gallery-dl (Milestone 8):**
  - Gallery Extractor: `extractors/gallery.py` executing `gallery-dl` in non-download metadata extraction mode using `DataJob(file=None)` to guarantee zero stdout emission and zero JSON-RPC stdio protocol interference.
  - Multi-Item Normalization: Extracts post/album metadata, enumerates individual image/video assets, auto-titles items with sequential numbering (`"{title} - 1"`, `"{title} - 2"`), and maps container/resolution dimensions.
  - Error Mapping: `parse_gallery_dl_error` mapping `NoExtractorError`, `AuthenticationError`, `NotFoundError`, and `HttpError` (429/404/403) to clean domain exceptions.
  - Unified URL Classification Pipeline: `classify_url` hierarchically routes: 1. Direct media files -> 2. Gallery collections -> 3. Video platforms -> 4. UnsupportedSourceError.
  - Desktop Bridge & React UI: `DesktopApi.extractGallery` exposed over IPC; interactive multi-item gallery grid rendering item cards, thumbnails, containers, and batch-readiness indicators.
  - Automated Verification: 48 unit tests passing in 1.28s; desktop smoke test passing; 0 lint errors.

---

## 4. Known Bugs & Current Limitations

- Local database persistence (SQLite) for scanned history and saved collections is scheduled for Milestone 9.
- Download queuing, streaming disk writes, and FFmpeg stream merging are scheduled for Milestones 10–13.

---

## 5. Next Milestone & Acceptance Criteria

**Next Milestone:** **Milestone 9 — Media Library & Local SQLite Persistence**

### Acceptance Criteria:
1. Establish SQLite schema with migrations (`media_items`, `scan_history`, `download_tasks`, `app_preferences`).
2. Build local SQLite repository layer (`backend/src/xakumedia/db/`) supporting thread-safe connections, WAL mode, and parameterized queries.
3. Maintain relational integrity: foreign keys, indexed lookups on `source_url`, `created_at`, `media_type`.
4. Expose SQLite operations via JSON-RPC (`get_history`, `save_scan_result`, `get_saved_media`, `delete_history_item`).
5. Connect desktop IPC and preload bridge (`window.api.getHistory`, `window.api.saveMediaItem`).
6. Wire React Media Library and Scan History tabs to display live stored data from SQLite.
7. Unit test schema migrations, concurrent access, and CRUD operations; verify with `npm run test` and `npm run lint`.
