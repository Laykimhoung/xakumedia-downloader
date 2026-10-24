# XakuMedia v0.1.0 — Production Release Notes

**Release Date:** October 24, 2026  
**Identity:** Developed under the **XAKURAII** identity.  
**Target Platform:** Windows 11 / Windows 10 (64-bit)  

---

## 1. Executive Summary

We are proud to announce the **v0.1.0 Production Release** of **XakuMedia**, a local-first Windows desktop bulk media downloader.

XakuMedia was built from the ground up to solve the friction of discovering, organizing, and batch-downloading publicly accessible media. It replaces ad-ridden web downloaders and flaky browser extensions with a high-performance desktop application featuring local SQLite metadata storage, zero cloud dependencies, and process isolation.

---

## 2. Key Capabilities & Feature Highlights

### 🔍 Progressive URL Scanning & Multi-Provider Extraction
- **Direct Resource Scanner:** Probes HTTP `HEAD`/`Range GET` headers to discover direct image and video files without downloading complete bodies.
- **`yt-dlp` Video Extraction:** Detects native video resolutions (up to 4K/1080p), containers (`mp4`, `webm`, `mkv`), video/audio codecs, and stream merging requirements.
- **`gallery-dl` Album Extraction:** Discovers multi-item galleries, albums, and collections without polluting standard I/O channels.
- **SSRF Hardened:** Multi-format IP literal parser rejects private RFC 1918 addresses, loopbacks, link-local, non-global CGNAT (`100.64.0.0/10`), cloud instance metadata endpoints, and blocked internal TLDs.

### 📥 High-Performance Download Manager & Resumption
- **Worker Slot Scheduling:** Strict concurrency bounds (configurable 1–10 simultaneous downloads, default 4). Remaining tasks queue safely without OS socket exhaustion.
- **HTTP Range Resumption:** Seamlessly resumes partially downloaded `.part` files via `Range: bytes={offset}-` headers.
- **Non-Destructive Sequential Naming:** Automatically divides downloads into `videos/` and `images/` folders with sequential indices (`{username}_vdo_001.mp4`, `{username}_img_001.jpg`). Never overwrites user files on disk.
- **Token-Bucket Bandwidth Throttling:** Dynamic download speed limits (e.g., 500 KB/s, 2 MB/s, 10 MB/s, Unlimited) shared across all concurrent worker threads with micro-slice sleep scheduling.

### 🎞️ Stream Merging & Technical Media Inspection
- **Dynamic FFmpeg/FFprobe Discovery:** Auto-detects local FFmpeg installations or bundled binaries.
- **Lossless Stream Multiplexing:** Merges high-definition video-only and audio-only streams using copy mode (`-c copy`) without CPU-intensive re-encoding.
- **Container Format Conversion:** Optional post-download conversion between MP4, WebM, MKV, MP3, and AAC.

### 🖼️ In-App Preview & Media Library
- **Integrated Video/Audio Player:** Modal media player with progress bar, volume controls, and loop toggle.
- **High-Resolution Lightbox:** Image lightbox supporting keyboard navigation (Escape, +/-, 0, R), zoom (25%–400%), and 90° rotation.
- **Media Library Search & Sorting:** Real-time query search, container filters, and 5-way sorting (`newest`, `oldest`, `title`, `size_desc`, `size_asc`).
- **Pillow & FFmpeg Thumbnail Caching:** Generates and caches lightweight local thumbnails to eliminate remote image loading overhead.

### 🔐 Session Credentials & Cookie Management
- **Netscape Cookie Import:** Fault-tolerant parser supporting `#HttpOnly_` prefixes and standard 7-field formats.
- **Automated Browser Cookie Extraction:** Imports cookies directly from local browsers (`Chrome`, `Edge`, `Firefox`, `Brave`, `Opera`, `Vivaldi`) using DPAPI decryption.
- **Subdomain-Hierarchical Headers:** Merges domain-specific request headers across all extraction and download streams.

### 📑 Saved Sources & Differential Rescanning
- **One-Click Source Bookmarking:** Bookmark channels, profiles, and feeds with custom tags.
- **Incremental Rescan:** Differential engine compares discovered URLs against local database records in $O(1)$ time, allowing 1-click batch download of only new items.

### 🛡️ Crash Recovery & Fault Tolerance
- **Automatic Startup Audit:** Scans SQLite for uncompleted tasks, reconciles against `.part` files on disk, and resumes or marks tasks ready.
- **Staging Cleanup:** Orphaned or corrupted intermediate files are automatically cleaned up.

---

## 3. Performance Benchmarks

All performance metrics were verified using automated benchmark suites:

| Operation | Scale | Latency |
| :--- | :--- | :--- |
| **Batch Media Persistence** | 1,000 items in SQLite | **12ms – 18ms** (Single `executemany` transaction) |
| **Batch Queue Enqueue** | 1,000 download tasks | **< 0.35s** (persisted and scheduled) |
| **Library Task Status Lookup** | 1,000 items $\times$ 1,000 tasks | **< 1ms** ($O(1)$ `useMemo` hash map) |
| **Gallery DOM Rendering** | 1,000 items album | **60 FPS** (48 items/page windowing) |
| **Memory Footprint During Transit** | 4 GB video stream | **< 1 MB RAM** (64 KB chunked disk streaming) |

---

## 4. Distribution Artifacts

The application is distributed in three Windows packaging formats located in `dist-package/`:

1. **Windows NSIS Setup Installer:**
   - File: `dist-package/XakuMedia-Setup-0.1.0.exe` (167 MB)
   - Features: Standard Windows installation wizard, Start Menu shortcuts, Desktop icon, uninstaller.
2. **Windows Portable Executable:**
   - File: `dist-package/XakuMedia-Portable-0.1.0.exe` (148 MB)
   - Features: Single-file zero-install executable. Runs from USB drives or portable environments.
3. **Unpacked Application Bundle:**
   - Folder: `dist-package/win-unpacked/XakuMedia.exe`
   - Features: Fully bundled standalone Electron + Python 3.12 runtime + FFmpeg/FFprobe binaries.

---

## 5. Milestone Verification Record

| Phase | Milestones | Status |
| :--- | :--- | :--- |
| **Foundation & Core Shell** | Milestones 0 – 5 | **Completed** |
| **Media Detection & Extraction** | Milestones 6 – 8 | **Completed** |
| **Persistence & Basic Downloader** | Milestones 9 – 11 | **Completed** |
| **Interactive UI & Batch Queue** | Milestones 12 – 14 | **Completed** |
| **Advanced Resilience & Bandwidth** | Milestones 15 – 17 | **Completed** |
| **Saved Sources & Windows Packaging** | Milestones 18 – 19 | **Completed** |
| **Security, Performance & Regression** | Milestones 20 – 22 | **Completed** |
| **Final Release Review** | Milestone 23 | **Completed** |

**Total Automated Tests:** 140 passing in 7.41s  
**Static Analysis:** 0 Ruff errors, 0 TypeScript errors  
**Desktop Smoke Verification:** Passed
