# XakuMedia

> **Local-first Windows Desktop Bulk Media Downloader**  
> Developed under the **XAKURAII** identity.

---

## Overview

**XakuMedia** is a local-first Windows 11 desktop application designed to discover, preview, organize, and bulk-download publicly accessible images and videos from URLs.

Collecting media from web sources or social platforms often involves tedious manual saving, lossy compression, or unreliable browser extensions. XakuMedia provides an intuitive, high-performance workflow with fine-grained control over resolution, codecs, formats, and directory organization, storing all metadata and task history locally via SQLite without cloud dependencies.

---

## Core Capabilities

- **Intelligent URL Identification:** Classifies pasted URLs (direct image, direct video, social media post, multi-item gallery, or public channel).
- **Progressive Scanning & Preview:** Discovers media items incrementally with low-overhead thumbnail caching and non-blocking background scanning.
- **Horizontal Media List:** Clean, compact list rows providing selection controls, dimensions, codec/format info, and real-time progress.
- **Separated Quality Pipelines:**
  - **Video:** Resolution selection (native up to 4K/1080p), container preferences (MP4, WebM, MKV), stream merging via FFmpeg without unnecessary re-encoding.
  - **Image:** Original quality preservation, lossless/lossy formats (JPG, PNG, WebP, AVIF), optional resizing, and metadata retention options.
- **Sequential File Organization:** Safe file management strictly dividing media into user-chosen `videos/` and `images/` folders with conflict-proof sequential naming:
  - `{username}_vdo_{001}.{ext}`
  - `{username}_img_{001}.{ext}`
- **Crash Recovery & Persistence:** SQLite-backed queue that safely restores pending and eligible interrupted downloads upon application restart.

---

## Technical Stack

| Layer | Technology |
| :--- | :--- |
| **Desktop Shell** | Electron (Process isolation, context-isolated minimal preload API) |
| **Frontend** | React, TypeScript, Vite, Tailwind CSS, Lucide Icons |
| **Media Engine** | Python 3.12 (Modular architecture, `httpx`, `yt-dlp`, `gallery-dl`, `Pillow`) |
| **Media Processing** | FFmpeg & FFprobe (Stream merging, metadata probing) |
| **Local Storage** | SQLite3 (Settings, scan history, media metadata, task queue) |

---

## Repository Structure

```text
xakumedia/
├── AGENTS.md               # Universal AI agent instructions
├── README.md               # Project overview and instructions
├── .gitignore              # Repository exclusions (venv, node_modules, cache, media)
├── package.json            # Root workspace orchestrator (zero dependencies)
│
├── frontend/               # Vite + React + TypeScript desktop UI
│   ├── package.json        # Frontend dependencies & scripts
│   ├── package-lock.json   # Frontend dependency lockfile
│   ├── index.html          # HTML application shell
│   ├── vite.config.ts      # Vite configuration & path aliases
│   ├── tsconfig.json       # TypeScript compiler settings
│   ├── tailwind.config.js  # Dark/light brand theme configuration
│   ├── postcss.config.js   # CSS transformation plugins
│   ├── public/             # Static public assets
│   └── src/                # Modular UI source (components, features, styles)
│
├── desktop/                # Electron desktop shell
│   ├── main/               # Electron main process
│   ├── preload/            # Context-isolated secure preload bridge
│   └── shared/             # Shared IPC types and contracts
│
├── backend/                # Python 3.12 media engine
│   ├── pyproject.toml      # Python package metadata (PEP 621)
│   ├── .venv/              # Isolated virtual environment (gitignored)
│   ├── src/xakumedia/      # Media engine modules
│   └── tests/              # Pytest automated test suite
│
├── scripts/                # Developer & automation scripts
├── docs/                   # Architectural blueprints & roadmap
│   ├── CURRENT_STATE.md    # Active milestone status & verification records
│   ├── ARCHITECTURE.md     # System boundaries & IPC design
│   ├── SETUP.md            # Environment setup & developer guide
│   └── DEVELOPMENT_ROADMAP.md # Detailed milestone milestones & acceptance criteria
│
├── .agents/                # Project agent instructions & learning system (local)
└── my-learning/            # Personal educational walkthroughs (local)
```

---

## Getting Started

### Prerequisites
- **Windows 11**
- **Python 3.12+**
- **Node.js 20+** (Active LTS) / **npm 10+**
- **FFmpeg & FFprobe** in system PATH

For detailed installation and setup instructions, refer to [docs/SETUP.md](docs/SETUP.md).

---

## Development Principles

- **No Overwriting:** Existing user downloads are never overwritten; sequential numbering scans both disk and database.
- **No Faked Features:** Incomplete or unverified features are never shown as functional.
- **Local Privacy:** No telemetry, no third-party cloud backends, no DRM bypassing.
- **Step-by-Step Delivery:** Development proceeds milestone-by-milestone with explicit verification at each step.

---

## License

Personal and Private Project — Developed under the **XAKURAII** identity.
