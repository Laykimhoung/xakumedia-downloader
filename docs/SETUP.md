# XakuMedia — Development Setup Guide

## 1. System Requirements

- **Operating System:** Windows 11 (64-bit)
- **Python:** Version `3.12.x` (Python 3.12.10 verified)
- **Node.js:** Version `20.x` or later (Node `v24.14.0` / npm `11.9.0` verified)
- **Git:** Version `2.40+` (`2.52.0.windows.1` verified)
- **FFmpeg & FFprobe:** Installed and accessible via system `PATH` (`4.4.2+` verified)

---

## 2. Environment Verification

Open PowerShell in the project root directory (`D:\Project\Personal\System\Xakuraii_Bulk_Downloader`) and run:

```powershell
# Verify Python
python --version

# Verify Node and npm
node --version
npm --version

# Verify Git
git --version

# Verify FFmpeg & FFprobe
ffmpeg -version
ffprobe -version
```

All commands should exit cleanly and output their respective version strings.

---

## 3. Python Virtual Environment Setup

To keep dependencies isolated, XakuMedia keeps its virtual environment inside `backend/.venv`:

```powershell
# 1. Create dedicated virtual environment inside backend/
python -m venv backend/.venv

# 2. Upgrade pip and build tools
.\backend\.venv\Scripts\python.exe -m pip install --upgrade pip setuptools wheel

# 3. Install backend engine in editable mode with development tooling
.\backend\.venv\Scripts\python.exe -m pip install -e "backend[dev]"
```

---

## 4. Frontend & Desktop Setup

Frontend dependencies are isolated inside `frontend/node_modules/`:

```powershell
# Install frontend dependencies
npm --prefix frontend install

# Run Vite development server
npm run dev:frontend
```

---

## 5. Workspace Verification & Testing Commands

Convenient root scripts allow orchestrating all subsystems from the project root:

```powershell
# Run full cross-stack test suite (Desktop smoke + all 140 Python tests)
npm test

# Run desktop smoke test (Electron + Python engine IPC handshake)
npm run test:desktop

# Run all 140 Python automated unit & regression tests
npm run test:python

# Run Python linter (cached inside backend/.ruff_cache)
npm run lint:python

# Typecheck frontend TypeScript
npm run typecheck
```

---

## 6. Database Tooling & Maintenance

```powershell
# Display table row counts and database file statistics
node scripts/db-tool.mjs stats

# Compact database (VACUUM & PRAGMA optimize)
node scripts/db-tool.mjs compact

# Clear completed, cancelled, or failed download tasks
node scripts/db-tool.mjs clear-tasks

# Export database summary as JSON
node scripts/db-tool.mjs export-summary
```

---

## 7. Windows Packaging Commands

```powershell
# Prepare all packaging assets, standalone Python runtime, and FFmpeg binaries
npm run package:prepare

# Fast unpacked directory test build
npm run package:dir

# Build Windows NSIS Installer (.exe)
npm run package:nsis

# Build Windows Portable (.exe)
npm run package:portable

# Build all Windows distribution packages
npm run package:win
```
