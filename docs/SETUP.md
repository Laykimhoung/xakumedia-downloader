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

To keep dependencies isolated from your system Python installation, create a virtual environment in the `backend/` directory or project root:

```powershell
# Create dedicated virtual environment
python -m venv .venv

# Activate the virtual environment
.\.venv\Scripts\Activate.ps1

# Upgrade pip and install build tools
python -m pip install --upgrade pip setuptools wheel
```

> **Note on PowerShell Script Execution:**  
> If PowerShell blocks activating the script with an execution policy error, run:  
> `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

---

## 4. Frontend & Electron Setup

Once the project package manifest is initialized (Milestone 2/3):

```powershell
# Install Node dependencies
npm install

# Run Vite development server
npm run dev
```

---

## 5. Verification Commands

Run targeted checks to ensure your local environment is functioning:

```powershell
# Run Python linter
ruff check backend/

# Run Python unit tests
pytest backend/

# Run frontend type checking
npm run typecheck
```
