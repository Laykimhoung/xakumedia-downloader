# XakuMedia — Development Roadmap

This document outlines the sequential, milestone-by-milestone development path for XakuMedia. Each milestone must meet its acceptance criteria and pass verification before moving to the next.

---

## Foundation Phase (Milestones 0 – 5)

### Milestone 0: Environment and Project Inspection
- **Goal:** Verify developer toolchain (Python, Node, npm, Git, FFmpeg/FFprobe) and inspect directory state.
- **Acceptance:** Factual environment report generated without overwriting user files.

### Milestone 1: Repository Foundation
- **Goal:** Initialize Git repository, configure production-grade `.gitignore`, establish architecture documentation, and start personal learning tracking.
- **Acceptance:** Git initialized on `main`, `.gitignore` prevents leaks, docs established in `docs/`.

### Milestone 2: Runtime and Dependency Setup
- **Goal:** Create Python virtual environment (`.venv`), configure `pyproject.toml`, initialize `package.json`, and verify minimal baseline dependencies.
- **Acceptance:** Isolated environments working, dependencies successfully imported.

### Milestone 3: Minimal Electron and React Shell
- **Goal:** Establish Electron main process, secure preload bridge, React + Vite frontend, and application window.
- **Acceptance:** App window opens cleanly without CSP/console errors.

### Milestone 4: Python Engine Foundation
- **Goal:** Build the `xakumedia` Python package structure, normalized media data models, status types, and logging.
- **Acceptance:** Unit tests for data models pass; package imports cleanly.

### Milestone 5: Electron-to-Python Communication
- **Goal:** Establish a secure child-process communication boundary over stdio (JSON-RPC / structured messages).
- **Acceptance:** Ping/health-check IPC succeeds between Electron and Python.

---

## Core Extraction & Scanning Phase (Milestones 6 – 10)

### Milestone 6: Direct URL Detection
- **Goal:** Classify direct image and video URLs via HTTP HEAD/GET inspecting MIME types, headers, and sizes.
- **Acceptance:** Accurately classifies media URLs and rejects HTML/invalid endpoints.

### Milestone 7: First Real Video Extraction
- **Goal:** Integrate `yt-dlp` adapter for supported single-video sources.
- **Acceptance:** Formats, resolutions, and video metadata extracted and normalized.

### Milestone 8: Gallery Extraction
- **Goal:** Integrate `gallery-dl` adapter for multi-item image collections.
- **Acceptance:** Multi-image collections extracted with accurate order and URLs.

### Milestone 9: Scanning Service & Pagination
- **Goal:** Build background scanning coordinator with progressive event streaming and cancellation.
- **Acceptance:** UI thread unblocked during scans; partial results stream progressively.

### Milestone 10: SQLite Persistence Layer
- **Goal:** Design database schema for sources, media items, scans, and settings.
- **Acceptance:** Items persist across restarts; duplicate detection prevents duplicate rows.

---

## UI & Media Preview Phase (Milestones 11 – 12)

### Milestone 11: Initial Product UI
- **Goal:** Build persistent left sidebar, dark/light theme, URL input, and horizontal media list rows.
- **Acceptance:** UI displays real scanned items in horizontal rows (no card grids).

### Milestone 12: Media Preview & Library
- **Goal:** Image previewing, video thumbnail/player previews, thumbnail caching, and library filters.
- **Acceptance:** Previews do not download full originals; cached thumbnails load fast.

---

## Download Engine & File Management Phase (Milestones 13 – 17)

### Milestone 13: Download Engine
- **Goal:** Streaming file downloader with progress tracking, temporary `.tmp` files, and cancellation.
- **Acceptance:** Streams directly to disk without memory bloat; atomic file completion.

### Milestone 14: Destination & Sequential Filename Management
- **Goal:** Maintain `{dir}/videos/` and `{dir}/images/` with `{username}_vdo_{001}` and `{username}_img_{001}` sequential naming.
- **Acceptance:** Scans disk and DB; never overwrites existing files; handles concurrency safely.

### Milestone 15: Video Quality Controls
- **Goal:** Resolution picker (native up to 4K/1080p), container selection (MP4/WebM/MKV), and FFmpeg stream merging.
- **Acceptance:** Offers only source-supported resolutions; non-re-encoding stream merging.

### Milestone 16: Image Quality Controls
- **Goal:** Original quality preservation, format conversion (JPG/PNG/WebP/AVIF), and optional resizing.
- **Acceptance:** Lossless originals preserved by default; conversions use Pillow.

### Milestone 17: Persistent Queue & Recovery
- **Goal:** SQLite-backed task queue with crash recovery and concurrency limits.
- **Acceptance:** Interrupted tasks resume or recover gracefully on restart.

---

## Management, Polish & Packaging Phase (Milestones 18 – 24)

### Milestone 18: Saved Sources & Scan History
- **Goal:** Save favorite sources, rescan to discover only new items, and review past scans.

### Milestone 19: Standalone Windows Installer, Packaging & Build Distribution
- **Goal:** Bundle Electron, standalone Python runtime, site-packages, and FFmpeg/FFprobe into Windows NSIS installer and portable executable.
- **Status:** Completed.

### Milestone 20: End-to-End Security Audit & IPC Defense Hardening
- **Goal:** Audit SSRF protections, path traversal defenses, IPC validation, and CSP.

### Milestone 21: Performance & Reliability
- **Goal:** Benchmark 1000+ item scans, concurrent downloads, and memory stability.

### Milestone 22: Automated Testing & Regression Review
- **Goal:** Full test suite execution (pytest, typecheck, linting).

### Milestone 23: Final Release Review
- **Goal:** Complete acceptance checklist verification and release documentation.
