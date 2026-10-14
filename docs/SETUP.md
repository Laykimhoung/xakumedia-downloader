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

## 5. Workspace Verification Commands

Convenient root scripts allow orchestrating all subsystems from the project root:

```powershell
# Typecheck frontend
npm run typecheck:frontend

# Build frontend production bundle
npm run build:frontend

# Run Python automated tests
npm run test:python

# Run Python linter
npm run lint:python
```
