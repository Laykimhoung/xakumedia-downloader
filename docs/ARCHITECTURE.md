# XakuMedia — Architectural Blueprint

## 1. System Overview

XakuMedia is a desktop application designed to provide reliable, high-performance bulk media downloading from public sources. It uses a three-tier architecture ensuring clean separation of concerns, strong process isolation, and local-first data storage.

```
┌────────────────────────────────────────────────────────┐
│               Frontend (React + Vite)                  │
│  - Horizontal media result list                        │
│  - Real-time progress indicators                       │
│  - Selection, quality controls, and settings           │
└──────────────────────────┬─────────────────────────────┘
                           │ IPC via contextBridge (window.api)
┌──────────────────────────▼─────────────────────────────┐
│             Desktop Shell (Electron Main)              │
│  - Window lifecycle & native menus                     │
│  - Secure child process management                     │
│  - Strict CSP & Context Isolation                      │
└──────────────────────────┬─────────────────────────────┘
                           │ stdio (JSON-RPC / Structured Messages)
┌──────────────────────────▼─────────────────────────────┐
│                 Python 3.12 Engine                     │
│  - URL Classification & Extraction Adapters            │
│  - Stream merging & inspection (FFmpeg/FFprobe)        │
│  - SQLite Database (Metadata, queue, history)          │
│  - Atomic disk writer & sequential naming              │
└────────────────────────────────────────────────────────┘
```

---

## 2. Process Boundaries & Security Model

### 2.1 Frontend (Renderer)
- Runs inside a sandboxed Chromium renderer with `contextIsolation: true` and `nodeIntegration: false`.
- Never accesses the raw filesystem, executes child processes, or talks directly to SQLite.
- Communicates exclusively through a typed, validated bridge exposed in Electron's preload script.

### 2.2 Desktop Shell (Main Process)
- Manages the lifecycle of the Python engine process (`python.exe` inside the dedicated virtual environment).
- Acts as a message broker and coordinator.
- Implements strict Content Security Policy (CSP) headers preventing untrusted script execution.

### 2.3 Python Engine (Backend)
- Runs as an unprivileged background child process.
- Receives structured commands (e.g., `scan_url`, `start_download`, `get_queue_status`) via standard input (`stdin`) and writes structured events to standard output (`stdout`).
- Handles all heavy computational work (network I/O, extraction, file streaming, SQLite transactions).
- Keeps the UI thread completely unblocked.

---

## 3. Core Engine Subsystems

### 3.1 URL Classification & Extraction Architecture
Instead of hardcoding site logic into a monolithic script, the engine utilizes a provider-agnostic adapter pattern:
- **DirectResourceScanner:** Evaluates `HEAD`/`GET` headers and content types for direct video/image files.
- **YtDlpAdapter:** Handles video platforms, streams, and audio/video separation.
- **GalleryDlAdapter:** Handles multi-item image galleries and collections.
- **CustomScanners:** Extensible parsers for specialized public feeds.

### 3.2 File Organization & Sequential Naming
XakuMedia enforces strict directory segregation:
```text
{UserChosenDirectory}/
├── videos/
│   ├── {username}_vdo_001.mp4
│   └── {username}_vdo_002.webm
└── images/
    ├── {username}_img_001.jpg
    └── {username}_img_002.png
```

**Naming & Overwrite Protection Rules:**
1. Sequence numbers start at `001` and expand automatically.
2. The engine scans both the SQLite records **and** the actual disk before allocating an index.
3. Temporary downloads use `.tmp` extensions and atomic renames to prevent partial or corrupted files from being marked complete.
4. Concurrent downloads reserve their sequential indices safely in SQLite to prevent race conditions.

### 3.3 Quality Pipelines
- **Video Pipeline:** Discovers true source resolutions (native 4K, 1440p, 1080p, 720p). Audio and video streams are merged via FFmpeg using copy mode (`-c copy`) whenever codecs permit to avoid lossy, CPU-intensive re-encoding.
- **Image Pipeline:** Defaults to original bit-exact downloads. Optional conversions (PNG, JPG, WebP) and compression presets are performed via Pillow without claiming to restore lost source fidelity.

### 3.4 Local Storage & Persistence
- SQLite3 database in WAL mode located in standard OS user data directory via `platformdirs`.
- Tracks:
  - Application settings (`app_preferences`).
  - Saved sources & scan histories (`saved_sources`, `scan_history`, `scan_history_items`).
  - Media metadata & thumbnails (`media_items`).
  - Persistent download queue with restart recovery (`download_tasks`).
  - Session cookies and custom headers (`cookie_profiles`, `domain_headers`).
- Detailed documentation: [docs/DATABASE.md](DATABASE.md).

### 3.5 Token-Bucket Bandwidth Throttling
- Thread-safe token-bucket rate limiter (`BandwidthThrottler` in `downloader/throttler.py`).
- Global bandwidth quota dynamically divided across all active download threads.
- Sub-50ms micro-sliced sleep scheduling allows instant pause, resume, and cancellation responsiveness.

### 3.6 Session Credentials & Cookie Management
- Fault-tolerant Netscape 7-field parser supporting `#HttpOnly_` prefixes.
- Direct DPAPI decryption for local browser cookie extraction (`Chrome`, `Edge`, `Firefox`, `Brave`, `Opera`, `Vivaldi`).
- Subdomain-hierarchical request header synthesis (`auth/headers.py`).

### 3.7 Saved Sources & Differential Rescanning
- Bookmarking engine for public channels, profiles, and feeds (`sources/rescan.py`).
- Differential detection resolves new delta items in $O(1)$ time by cross-referencing discovered URLs against SQLite.

### 3.8 Task Queue Crash Recovery
- Automated startup audit (`downloader/recovery.py`) checks SQLite task statuses against on-disk `.part` files.
- Automatically marks completed files, preserves partial byte counts, cleans up orphaned merge staging, and resumes queue processing.

### 3.9 Standalone Windows Packaging Architecture
- Automated packaging pipeline (`scripts/package-prepare.mjs`) builds self-contained distributions.
- Bundles standalone Python 3.12 runtime, pre-installed wheel dependencies, and static FFmpeg/FFprobe binaries into `dist-package/`.

---

## 4. Directory Layout & Modular Workspaces

XakuMedia enforces strict filesystem modularity to avoid root-level clutter:

```text
xakumedia/
├── AGENTS.md               # Universal shared project instructions
├── README.md               # Project overview & essential usage
├── .gitignore              # Multi-tier exclusion rules
├── package.json            # Root workspace orchestrator
├── config/                 # Toolchain & build configuration
│   └── electron-builder.yml # Windows NSIS & Portable packaging settings
│
├── frontend/               # Self-contained React + Vite frontend
│   ├── package.json        # Frontend manifest & build scripts
│   ├── package-lock.json   # Frontend dependency lockfile
│   ├── node_modules/       # Frontend dependencies (gitignored)
│   ├── index.html          # SPA entry HTML
│   ├── vite.config.ts      # Vite configuration & path aliases
│   ├── tsconfig.json       # TypeScript compiler options
│   ├── tailwind.config.js  # Brand styling tokens
│   ├── postcss.config.js   # CSS transformation plugins
│   ├── public/             # Static public assets
│   └── src/                # Modular UI source
│       ├── assets/         # Embedded images, icons, fonts
│       ├── components/     # Reusable UI primitives
│       ├── features/       # Feature-specific components (scanner, library)
│       ├── layouts/        # Shell layouts (sidebar, titlebar)
│       ├── pages/          # Application views
│       ├── hooks/          # Custom React hooks
│       ├── services/       # Desktop IPC bridge wrappers
│       ├── types/          # Frontend TypeScript contracts
│       ├── utils/          # Formatting and helper utilities
│       └── styles/         # Global styles & Tailwind directives
│
├── desktop/                # Electron desktop shell
│   ├── main/               # Electron main process & child-process manager
│   ├── preload/            # Context-isolated secure preload bridge
│   └── shared/             # Shared IPC types and contracts
│
├── backend/                # Python 3.12 media engine
│   ├── pyproject.toml      # PEP 621 package metadata & dev tooling
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

**Key Architectural Separation:**
1. **Zero Root Dependencies:** Root `package.json` contains no packages, only delegation scripts (`npm --prefix frontend ...`).
2. **Encapsulated Dependencies:** Node packages are strictly contained in `frontend/node_modules/`; Python packages are strictly contained in `backend/.venv/`.
3. **Independent Lifecycles:** Frontend and backend can be tested and built independently without dependency cross-talk.
