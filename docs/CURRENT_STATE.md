# XakuMedia — Current Project State

**Last Updated:** October 24, 2026  
**Active Milestone:** Milestone 18 — Saved Sources, Incremental Rescan & Differential Discovery  
**Overall Status:** Saved Sources, Incremental Rescan & Differential Discovery Complete  

---

## 1. Project Purpose & Target Architecture

XakuMedia is a local-first Windows 11 desktop bulk media downloader developed under the XAKURAII identity. It enables users to discover, preview, organize, and download publicly accessible images and videos from direct URLs, galleries, and supported platforms.

The system relies on a secure 3-tier desktop architecture:
1. **Frontend (Renderer):** React + TypeScript + Vite + Tailwind CSS + Lucide Icons. In-app video/audio player modal, high-resolution image lightbox with zoom/pan/rotate, media library search/filter/sort, gallery selective bulk download toolbar, download queue slot controls, cookie profile management, custom domain headers, application settings, and diagnostics.
2. **Desktop Shell (Electron Main):** Process isolation, secure context-isolated IPC boundary, privileged `media-loader://` streaming protocol with HTTP 206 Partial Content range support, native Windows folder picker dialog (`dialog:selectFolder`), native cookie file picker dialog (`dialog:selectCookieFile`), window lifecycle, and Python engine management.
3. **Backend Engine (Python 3.12):** URL classification, extraction providers (`yt-dlp`, `gallery-dl`, `httpx`), multi-slot concurrent download manager with HTTP Range resumption, token-bucket bandwidth throttler, session cookie manager & browser extraction, subdomain-hierarchical request header synthesis, FFmpeg stream merging & media inspection, Pillow & FFmpeg local thumbnail caching, SQLite media library & query engine, persistent key-value application preferences (`app_preferences`), safe disk deletion, and metadata export.

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
| **Milestone 14** | Application Settings & Preference Management | **Completed** | Persistent SQLite `app_preferences` key-value repository methods (`get_preference`, `set_preference`, `get_all_preferences`, `update_preferences`, `reset_preferences`, `load_saved_preferences`); dynamic `default_config` synchronization and live queue concurrency updates; JSON-RPC handlers (`get_preferences`, `update_preferences`, `reset_preferences`); native Windows folder picker dialog (`dialog:selectFolder` via `dialog.showOpenDialog`); typed desktop IPC bridge (`getPreferences`, `updatePreferences`, `resetPreferences`, `selectFolder`); modern React `SettingsView.tsx` with folder picker, concurrency slider (1–10), network timeout/retries, video/image quality preferences, theme selector (dark/light/system), runtime diagnostics, and factory reset confirmation modal; 6 dedicated unit tests (90 total passing); 0 ruff errors; frontend typecheck passing; desktop smoke test verified preferences over IPC. |
| **Milestone 15** | Task Queue Crash Recovery & Interrupted Resumption | **Completed** | Task recovery service (`downloader/recovery.py`); audits SQLite tasks in `downloading`, `merging`, `scanning`, `queued` against disk `.part` files; marks finished files `completed`; updates partial byte counts and transitions to `paused`; cleans up corrupted intermediate merge outputs; auto-resumes tasks when `auto_start_downloads` is enabled; JSON-RPC handler `recover_interrupted_tasks` and dual notification `download:recovery_completed`; Electron startup audit and `python:recoverInterruptedTasks` IPC bridge; React `recoveryBanner` alert and manual "Recover" action; 7 unit tests (97 total passing); 0 ruff errors; frontend typecheck and desktop smoke test passing. |
| **Milestone 16** | Bandwidth Throttling & Network Speed Limits | **Completed** | Thread-safe token bucket rate limiter (`downloader/throttler.py`) with dynamic slice sleeping (`BandwidthThrottler`); global bandwidth rate limiting across all concurrent stream worker threads in `downloader/stream.py` and `downloader/manager.py`; dynamic live rate adjustment without transfer interruption; persistent `max_download_speed_kbps` in SQLite `app_preferences` and runtime synchronization; JSON-RPC handlers (`set_speed_limit`, `get_speed_limit`); desktop IPC bridge (`setSpeedLimit`, `getSpeedLimit`); React `SettingsView.tsx` with speed presets (Unlimited, 500 KB/s, 1 MB/s, 2 MB/s, 5 MB/s, 10 MB/s, 20 MB/s, 50 MB/s) and custom input; Downloads toolbar quick speed selector; 8 dedicated unit tests (105 total passing in 5.13s); 0 ruff errors; desktop smoke test verified speed limit get/set over IPC. |
| **Milestone 17** | Session Credentials, Custom Headers & Cookie Import | **Completed** | SQLite schema Migration V2 (`cookie_profiles`, `domain_headers`); dedicated `auth/` module (`models.py`, `cookies.py`, `headers.py`); Netscape cookie format parser & serializer with `#HttpOnly_` prefix handling; automated local browser cookie extraction (`chrome`, `edge`, `firefox`, `brave`, `opera`, `vivaldi`) via `yt-dlp`'s cookiejar engine; subdomain-hierarchical request header matching; seamless injection into `download_stream` (`httpx`), `extract_video` (`yt-dlp`), and `extract_gallery_info` (`gallery-dl`); 9 JSON-RPC handlers; desktop IPC bridge and native `.txt` file selector dialog (`dialog:selectCookieFile`); modern React controls in `SettingsView.tsx`; 9 dedicated unit tests (114 total passing in 6.40s); 0 ruff errors; desktop smoke test verified auth/cookies over IPC. |
| **Milestone 18** | Saved Sources, Incremental Rescan & Differential Discovery | **Completed** | SQLite schema Migration V3 (`saved_sources` with `url`, `platform`, `last_scanned_at` indexes); Pydantic `SavedSource`, `IncrementalScanResult`, `RescanAllSummary` models; repository CRUD and $O(1)$ known URL set resolution; differential discovery and multi-extractor rescan engine (`sources/rescan.py`); 6 JSON-RPC handlers; desktop IPC bridge (`python:saveSource`, `getSavedSources`, `getSource`, `deleteSavedSource`, `rescanSource`, `rescanAllSources`); modern React `SavedSourcesView.tsx` with search, dynamic tag filters, Add Source modal, Rescan All, source cards, and Incremental Rescan review modal with 1-click batch download of delta items; 1-click Bookmark Source button on scan result cards; 5 dedicated unit tests (119 total passing in 6.83s); 0 ruff errors; frontend typecheck (`tsc --noEmit`) and desktop smoke test passing. |

---

## 3. Verified Functionality

- **Environment Runtimes Verified:**
  - Python: `3.12.10`
  - Node.js: `v24.14.0`
  - npm: `11.9.0`
  - Git: `2.52.0.windows.1`
  - FFmpeg: `n4.4.2-4-g944ee75106-20220916`
  - FFprobe: `n4.4.2-4-g944ee75106-20220916`
- **Session Credentials, Custom Headers & Cookie Import (Milestone 17):**
  - **Database Migration V2 (`db/schema.py`):**
    - `cookie_profiles`: `id` (TEXT PRIMARY KEY), `domain` (TEXT), `browser_source` (TEXT), `cookie_file_path` (TEXT), `cookie_count` (INTEGER), `created_at` (TIMESTAMP), `updated_at` (TIMESTAMP). Domain indexing enabled.
    - `domain_headers`: `domain` (TEXT PRIMARY KEY), `headers_json` (TEXT), `updated_at` (TIMESTAMP).
    - Upgraded `CURRENT_SCHEMA_VERSION = 2`.
  - **Netscape Cookie Engine (`auth/cookies.py`):**
    - `parse_netscape_cookies`: parses tab-delimited Netscape format with `#HttpOnly_` prefix support, skipping comments and blank lines.
    - `format_netscape_cookies`: serializes `CookieEntry` objects with standard `# Netscape HTTP Cookie File` header.
    - `save_cookies_text`: persists sanitized cookie files in `%LOCALAPPDATA%\XakuMedia\auth\cookies\`.
    - `import_cookies_file`: imports external `.txt` cookie files with automatic domain inference.
    - `extract_browser_cookies`: extracts cookies directly from Edge, Chrome, Firefox, Brave, Opera, and Vivaldi profiles using `yt-dlp`'s Windows DPAPI-backed cookiejar engine.
  - **Domain Header Resolution & Hierarchy (`auth/headers.py`):**
    - Subdomain hierarchy fallback: e.g. `v.redd.it` falls back to `redd.it` when specific child rules are absent.
    - `build_request_headers_for_url`: merges default browser headers (User-Agent, CORS) with custom domain overrides (Authorization tokens, Referer).
  - **Extractor & Downloader Integration:**
    - `downloader/stream.py`: loads cookies dictionary from active profile and passes to `httpx.Client(cookies=req_cookies, headers=req_headers)`.
    - `extractors/video.py`: queries `get_cookie_profile_for_domain` and injects `cookiefile` and `http_headers` into `yt-dlp` options.
    - `extractors/gallery.py`: sets `gallery_dl.config.set(("extractor",), "cookies", cookie_path)`.
  - **JSON-RPC Server Handlers (`server/dispatcher.py`):**
    - `list_supported_browsers`, `import_browser_cookies`, `save_cookies_text`, `import_cookies_file`, `list_cookie_profiles`, `delete_cookie_profile`, `get_domain_headers`, `set_domain_headers`, `delete_domain_headers`.
  - **Desktop IPC Bridge & Native Dialog (`desktop/main/index.ts`, `desktop/preload/index.ts`, `desktop/shared/types.ts`):**
    - Registered 9 IPC handlers.
    - `dialog:selectCookieFile` with `.txt` filter via `dialog.showOpenDialog`.
    - Context-isolated preload bindings under `window.api`.
  - **Frontend UI Controls (`frontend/src/components/SettingsView.tsx`):**
    - Card: "Session Credentials & Custom Headers" with tabbed view (Cookie Profiles vs Domain Headers).
    - One-click browser extractor with dropdown and domain filter.
    - Native file import button (`.txt`) and paste text modal.
    - Active profiles table with domain, source badge, cookie count, and delete action.
    - Domain headers table with Add/Delete modal.
  - **Automated Verification:**
    - 9 dedicated unit tests in `backend/tests/test_auth.py` (all passing).
    - 114 total pytest tests passing across 17 test modules in 6.40s.
    - 0 ruff lint errors (`ruff check backend/`).
    - Frontend TypeScript check (`npm run typecheck`) cleanly passes with 0 errors.
    - Production bundle (`npm run build:frontend`) builds in 7.30s.
    - Desktop Electron smoke test (`npm run test:desktop`) passes with `[smoke-test] Auth/cookies verified over IPC: browsers=6, profiles=0`.
- **Saved Sources, Incremental Rescan & Differential Discovery (Milestone 18):**
  - **Database Migration V3 (`db/schema.py`):**
    - `saved_sources`: `id` (TEXT PRIMARY KEY), `url` (TEXT UNIQUE NOT NULL), `title` (TEXT NOT NULL), `platform` (TEXT), `category` (TEXT), `author` (TEXT), `thumbnail_url` (TEXT), `tags_json` (TEXT DEFAULT '[]'), `last_scanned_at` (TIMESTAMP), `last_item_count` (INTEGER DEFAULT 0), `created_at` (TIMESTAMP), `updated_at` (TIMESTAMP).
    - Multi-column indexes: `idx_saved_sources_url`, `idx_saved_sources_platform`, `idx_saved_sources_last_scanned`.
    - Upgraded `CURRENT_SCHEMA_VERSION = 3`.
  - **Pydantic Domain Models (`models/source.py`):**
    - `SavedSource`, `IncrementalScanResult`, `RescanAllSummary`.
  - **Differential Discovery & Rescan Engine (`sources/rescan.py`):**
    - `scan_source_url`: sequentially probes direct scanner, `gallery-dl`, and `yt-dlp` to enumerate items.
    - `get_known_item_urls_for_source`: queries `media_items` joined with `scan_history_items` and `scan_history` to build $O(1)$ set of known URLs.
    - `incremental_rescan_source`: partitions items into `new_items` vs `existing_items`, updates source telemetry, and creates a scan history record.
    - `rescan_all_sources`: iterates across saved sources, handles individual errors gracefully, and returns aggregated `RescanAllSummary`.
  - **JSON-RPC Server Handlers (`server/dispatcher.py`):**
    - `save_source`, `get_saved_sources`, `get_source`, `delete_saved_source`, `rescan_source`, `rescan_all_sources`.
  - **Desktop IPC Bridge (`desktop/main/index.ts`, `desktop/preload/index.ts`, `desktop/shared/types.ts`):**
    - Registered 6 IPC handlers (`python:saveSource`, `getSavedSources`, `getSource`, `deleteSavedSource`, `rescanSource`, `rescanAllSources`).
    - Exposed methods under `window.api`.
  - **Frontend UI (`frontend/src/components/SavedSourcesView.tsx` & `App.tsx`):**
    - `SavedSourcesView` component connected to `activeTab === "saved"`.
    - Real-time search filter and dynamic tag pills.
    - Source cards with thumbnail, metadata, tags, rescan button, scan tab launcher, and delete confirmation.
    - "Add Source" modal for manual bookmark creation with custom tags.
    - "Rescan All" button with telemetry summary banner.
    - Incremental Rescan modal showing diff overview (`X new items / Y total`), "New Items Only" vs "All Items" tabs, and 1-click "Download All New Items" batch CTA.
    - 1-click "Bookmark Source" CTA on gallery and single-item scan result cards in `App.tsx` with confirmation notification banner.
  - **Automated Verification:**
    - 5 dedicated unit tests in `backend/tests/test_sources.py` (all passing).
    - 119 total pytest tests passing across 18 test modules in 6.83s.
    - 0 ruff lint errors (`ruff check backend/`).
    - Frontend TypeScript check (`npm run typecheck`) cleanly passes with 0 errors.
    - Production bundle (`npm run build:frontend`) builds in 4.52s.
    - Desktop Electron smoke test (`npm run test:desktop`) passes with `[smoke-test] Saved sources verified over IPC: count=0`.

---

## 4. Known Bugs & Current Limitations

- Packaging as a standalone Windows installer (.exe / MSI via electron-builder) is scheduled for Milestone 19.

---

## 5. Next Milestone & Acceptance Criteria

**Next Milestone:** **Milestone 19 — Standalone Windows Installer, Packaging & Build Distribution**

### Acceptance Criteria:
1. Configure `electron-builder` for automated Windows x64 desktop packaging (configuration isolated in `config/electron-builder.yml`).
2. Bundle the Python runtime and dependencies into the packaged application distribution via `scripts/package-prepare.mjs`.
3. Package FFmpeg/FFprobe binaries alongside the desktop shell for zero-configuration user installation.
4. Generate both a Windows NSIS Installer (`.exe`) and a Portable executable.
5. Provide desktop application icons (`.ico`, `.png`) matching the XAKURAII brand identity.
6. Verify packaged application launch, clean background engine lifecycle, and smoke test execution on production bundles.
7. Document installation and packaging procedures in `docs/` and personal learning notes in `my-learning/`.

