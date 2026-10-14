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
- SQLite3 database located in standard OS user data directory via `platformdirs`.
- Tracks:
  - Application settings (theme, concurrency, default download directory).
  - Saved sources & scan histories.
  - Media metadata & thumbnails.
  - Persistent download queue with restart recovery.
