# XakuMedia — Automation & Developer Scripts

This directory contains standalone automation, developer tooling, and diagnostic scripts for the XakuMedia workspace.

All scripts are written in standard Node.js ESM (`.mjs`) and require zero external dependencies beyond the workspace runtime.

---

## Script Inventory

| Script | Purpose | Common Command |
|---|---|---|
| [`run.ps1`](file:///d:/Project/Personal/System/Xakuraii_Bulk_Downloader/scripts/run.ps1) | Unified One-Click PowerShell Launcher for the full application & server | `.\scripts\run.ps1` |
| [`run-python-server.mjs`](file:///d:/Project/Personal/System/Xakuraii_Bulk_Downloader/scripts/run-python-server.mjs) | Standalone runner for Python JSON-RPC backend (Interactive REPL & CLI) | `npm run server:python` |
| [`verify-env.mjs`](file:///d:/Project/Personal/System/Xakuraii_Bulk_Downloader/scripts/verify-env.mjs) | Preflight environment, Python venv, tool, and port diagnostics | `npm run verify` |
| [`clean.mjs`](file:///d:/Project/Personal/System/Xakuraii_Bulk_Downloader/scripts/clean.mjs) | Safe workspace cleanup (builds, Python bytecode, test caches) | `npm run clean:dry` / `npm run clean` |
| [`db-tool.mjs`](file:///d:/Project/Personal/System/Xakuraii_Bulk_Downloader/scripts/db-tool.mjs) | Local SQLite database inspector & maintenance CLI | `npm run db:stats` |
| [`build-desktop.mjs`](file:///d:/Project/Personal/System/Xakuraii_Bulk_Downloader/scripts/build-desktop.mjs) | Bundles Electron Main & Preload into `desktop/dist/` | `npm run build:desktop` |
| [`dev.mjs`](file:///d:/Project/Personal/System/Xakuraii_Bulk_Downloader/scripts/dev.mjs) | Spawns Vite frontend server and boots Electron in dev mode | `npm run dev` |

---

## 1. Standalone Python Server Runner (`run-python-server.mjs`)

Enables testing, probing, and interacting with the Python engine directly without launching Electron or Vite.

### Interactive REPL Mode
```bash
npm run server:python
# or
node scripts/run-python-server.mjs
```
Provides an interactive command prompt (`xakumedia-rpc>`) with colored JSON formatting and latency tracking:
- `ping` — Check server latency and version.
- `sys` / `system` — Display runtime paths, OS, and Python executable.
- `ffmpeg` — Check detected FFmpeg & FFprobe binaries.
- `queue` — View download queue state and concurrency.
- `tasks [status]` — List download tasks.
- `history [limit]` — Show recent URL scans.
- `saved [limit]` — Show saved media items.
- `classify <url>` — Classify a URL and probe metadata.
- `call <method> [json]` — Invoke any arbitrary JSON-RPC method.
- `raw <json>` — Send raw JSON-RPC string.
- `help` — Show commands.
- `quit` / `exit` — Cleanly terminate server process.

### One-Shot CLI Mode
Execute an RPC method and print the result immediately to stdout:
```bash
node scripts/run-python-server.mjs ping
node scripts/run-python-server.mjs system
node scripts/run-python-server.mjs queue
node scripts/run-python-server.mjs classify "https://example.com/sample.jpg"
node scripts/run-python-server.mjs call get_download_tasks '{"limit": 5}'
```

### Raw Stdio Pipe Mode
Directly pass stdio for automation pipelines or external test runners:
```bash
node scripts/run-python-server.mjs --raw
```

---

## 2. Environment Verification (`verify-env.mjs`)

Performs a pre-flight checklist verifying:
1. Node.js version (>= 20) and npm installation.
2. Python virtual environment (`backend/.venv`) and Python version (>= 3.11).
3. Core Python packages (`xakumedia`, `yt_dlp`, `gallery_dl`, `PIL`, `httpx`, `pydantic`, `pytest`, `ruff`).
4. External binaries: FFmpeg and FFprobe on PATH or custom locations.
5. Desktop Electron compiled bundles (`desktop/dist/`).
6. Local SQLite database connectivity and disk writability.
7. Vite dev port (5173) availability.

```bash
npm run verify
```

---

## 3. Workspace Cleanup (`clean.mjs`)

Safely cleans temporary and generated files while strictly preserving user data, the SQLite database, user downloads, and virtual environments:

- Removes `desktop/dist/` and `frontend/dist/`.
- Recursively removes Python `__pycache__`, `.pytest_cache`, `.ruff_cache`, and `*.pyc`.
- Removes temporary `.part` or `.tmp` files.

### Preview cleanup (safe dry-run):
```bash
npm run clean:dry
```

### Perform cleanup:
```bash
npm run clean
```

---

## 4. SQLite Database Inspector (`db-tool.mjs`)

Inspect database tables, row counts, and stored records without third-party SQLite software:

```bash
# View database file location, size, and table row counts
npm run db:stats

# View recent URL scans
node scripts/db-tool.mjs scans 20

# View saved media library items
node scripts/db-tool.mjs saved 10

# View download tasks (optional filter by status: completed, failed, cancelled)
node scripts/db-tool.mjs tasks completed

# Clear scan history
node scripts/db-tool.mjs clear-scans

# Clear completed / terminal download tasks
node scripts/db-tool.mjs clear-tasks
```

---

## 5. Unified One-Click PowerShell Launcher (`run.ps1`)

The ultimate all-in-one launcher script for Windows PowerShell:

```powershell
# 1. Run the entire app (Vite + Electron + Python) and show local view URL
.\scripts\run.ps1

# 2. Run full app and automatically open local view in default web browser
.\scripts\run.ps1 -OpenBrowser

# 3. Web-only mode: Run frontend and open local browser view directly
.\scripts\run.ps1 -Web

# 4. Server-only mode: Run interactive Python backend JSON-RPC console
.\scripts\run.ps1 -Server

# 5. Run pre-flight environment diagnostics
.\scripts\run.ps1 -Verify

# 6. Clean workspace caches
.\scripts\run.ps1 -Clean
```

