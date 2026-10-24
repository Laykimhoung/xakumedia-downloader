# XakuMedia

> **Local-first Windows Desktop Bulk Media Downloader**  
> Developed under the **XAKURAII** identity.

[![Python Version](https://img.shields.io/badge/python-3.12-blue.svg)](https://python.org)
[![Electron](https://img.shields.io/badge/electron-33.0-47848F.svg)](https://electronjs.org)
[![React](https://img.shields.io/badge/react-18.3-61DAFB.svg)](https://react.dev)
[![Tests](https://img.shields.io/badge/tests-140%20passing-brightgreen.svg)](docs/CURRENT_STATE.md)
[![License](https://img.shields.io/badge/license-Personal%20%26%20Private-lightgrey.svg)](#license)

---

## Overview

**XakuMedia** is a local-first Windows 11 desktop application designed to discover, preview, organize, and bulk-download publicly accessible images and videos from URLs.

Collecting media from web sources or social platforms often involves tedious manual saving, lossy compression, or unreliable browser extensions. XakuMedia provides an intuitive, high-performance workflow with fine-grained control over resolution, codecs, formats, and directory organization, storing all metadata and task history locally via SQLite without cloud dependencies.

---

## Core Capabilities

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

---

## Technical Stack

| Layer | Technology |
| :--- | :--- |
| **Desktop Shell** | Electron (Process isolation, context-isolated minimal preload API) |
| **Frontend** | React, TypeScript, Vite, Tailwind CSS, Lucide Icons |
| **Media Engine** | Python 3.12 (Modular architecture, `httpx`, `yt-dlp`, `gallery-dl`, `Pillow`) |
| **Media Processing** | FFmpeg & FFprobe (Stream merging, metadata probing) |
| **Local Storage** | SQLite 3 in WAL mode (Metadata, task queue, settings, cookies, sources) |

---

## Documentation Index

Comprehensive technical documentation is maintained in the `docs/` directory:

| Document | Description |
| :--- | :--- |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | Three-tier architecture, IPC boundary, security isolation, and data flows. |
| **[docs/CURRENT_STATE.md](docs/CURRENT_STATE.md)** | Milestone completion tracking, runtime verification records, and test results. |
| **[docs/DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md)** | Phase-by-phase development milestones and acceptance criteria. |
| **[docs/DATABASE.md](docs/DATABASE.md)** | SQLite schema (Migrations V1–V4), ERD diagram, covering indexes, and maintenance CLI. |
| **[docs/IPC_API.md](docs/IPC_API.md)** | Stdio JSON-RPC 2.0 protocol reference and Electron Preload API contracts. |
| **[docs/SECURITY.md](docs/SECURITY.md)** | Security threat model, SSRF multi-format IP defense, NTFS ADS mitigation, and CSP rules. |
| **[docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md)** | Production v0.1.0 release notes, benchmark evidence, and package distribution info. |
| **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** | Public landing page Vercel deployment and GitHub Release binary distribution workflows. |
| **[docs/SETUP.md](docs/SETUP.md)** | Developer environment setup, virtual environment commands, and build guides. |

---

## Repository Structure

```text
xakumedia/
├── AGENTS.md               # Universal shared AI agent instructions
├── README.md               # Project overview and documentation index
├── .gitignore              # Repository exclusions (venv, node_modules, cache, media)
├── package.json            # Root workspace orchestrator
├── config/                 # Build & toolchain configuration
│   └── electron-builder.yml # Windows NSIS & Portable packaging configuration
│
├── frontend/               # Vite + React + TypeScript desktop UI
│   ├── package.json        # Frontend dependencies & scripts
│   ├── index.html          # HTML application shell
│   ├── vite.config.ts      # Vite configuration & path aliases
│   ├── tsconfig.json       # TypeScript compiler settings
│   ├── tailwind.config.js  # Dark/light theme styling tokens
│   └── src/                # Modular UI source (components, hooks, styles)
│
├── desktop/                # Electron desktop shell
│   ├── main/               # Electron main process & Python process manager
│   ├── preload/            # Context-isolated secure preload bridge
│   ├── shared/             # Shared IPC types and contracts
│   └── dist/               # Bundled main and preload CJS output
│
├── backend/                # Python 3.12 media engine
│   ├── pyproject.toml      # PEP 621 package metadata & dev tooling
│   ├── .venv/              # Isolated virtual environment (gitignored)
│   ├── src/xakumedia/      # Media engine modules (auth, db, downloader, extractors, etc.)
│   └── tests/              # Pytest automated test suites (140 tests)
│
├── scripts/                # Developer, packaging, and database utilities
├── docs/                   # Technical documentation and architecture blueprints
├── .agents/                # Project agent instructions & learning system (local)
└── my-learning/            # Personal educational walkthroughs (local)
```

---

## Getting Started

### Prerequisites
- **Windows 11 or Windows 10** (64-bit)
- **Python 3.12+**
- **Node.js 20+** (Active LTS) / **npm 10+**
- **FFmpeg & FFprobe** in system PATH

For step-by-step setup instructions, refer to [docs/SETUP.md](docs/SETUP.md).

### Quick Start (Development)

```powershell
# 1. Clone repository
git clone https://github.com/Laykimhoung/xakumedia-downloader.git
cd xakumedia-downloader

# 2. Set up Python environment
python -m venv backend/.venv
.\backend\.venv\Scripts\pip install -e "backend[dev]"

# 3. Install frontend dependencies
npm --prefix frontend install

# 4. Launch development application (Hot-reload React + Electron + Python)
npm run dev
```

### Verification & Testing

```powershell
# Run full cross-stack test suite (Desktop smoke + all 140 Python tests)
npm test

# Run Python automated test suite
npm run test:python

# Check Python code formatting & linting
npm run lint:python

# Typecheck frontend TypeScript
npm run typecheck
```

---

## Windows Packaging & Distribution

XakuMedia can be packaged into standalone Windows executables with bundled Python runtimes and FFmpeg:

```powershell
# 1. Prepare standalone Python 3.12 runtime and FFmpeg binaries
npm run package:prepare

# 2. Build Windows NSIS Installer (.exe)
npm run package:nsis

# 3. Build Windows Portable Executable (.exe)
npm run package:portable

# 4. Build unpacked directory bundle
npm run package:dir
```

Output files are generated in `dist-package/`:
- `XakuMedia-Setup-0.1.0.exe` (167 MB NSIS Installer)
- `XakuMedia-Portable-0.1.0.exe` (148 MB Portable Executable)
- `win-unpacked/XakuMedia.exe` (Unpacked Directory Bundle)

---

## Development Principles

- **Non-Destructive:** Existing user downloads are never overwritten; sequential numbering scans both disk and database.
- **No Faked Features:** Incomplete or unverified features are never shown as functional.
- **Local Privacy:** No telemetry, no third-party cloud backends, no DRM bypassing.
- **Step-by-Step Delivery:** Development proceeds milestone-by-milestone with explicit verification at each step.

---

## License

Personal and Private Project — Developed under the **XAKURAII** identity.
