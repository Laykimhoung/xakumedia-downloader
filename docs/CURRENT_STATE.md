# XakuMedia — Current Project State

**Last Updated:** October 14, 2026  
**Active Milestone:** Milestone 1 — Repository Foundation  
**Overall Status:** Active Setup & Foundation  

---

## 1. Project Purpose & Target Architecture

XakuMedia is a local-first Windows 11 desktop bulk media downloader developed under the XAKURAII identity. It enables users to discover, preview, organize, and download publicly accessible images and videos from direct URLs, galleries, and supported platforms.

The system relies on a secure 3-tier desktop architecture:
1. **Frontend (Renderer):** React + TypeScript + Vite + Tailwind CSS + Lucide Icons. Renders horizontal media rows, previews, queue status, and settings.
2. **Desktop Shell (Electron Main):** Process isolation, secure context-isolated IPC boundary, window lifecycle, and Python engine management.
3. **Backend Engine (Python 3.12):** URL classification, extraction providers (`yt-dlp`, `gallery-dl`, `httpx`), FFmpeg stream merging, SQLite task queue, and atomic disk writes.

---

## 2. Milestone Progress Tracker

| Milestone | Title | Status | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **Milestone 0** | Environment and Project Inspection | **Completed** | Inspected Python 3.12.10, Node v24.14.0, npm 11.9.0, Git 2.52.0, FFmpeg/FFprobe n4.4.2. Verified intact existing instructions. |
| **Milestone 1** | Repository Foundation | **Completed** | Initialized Git on `main`; verified `.gitignore` excludes `my-learning/` and `.agents/`; created README.md, docs/ARCHITECTURE.md, docs/SETUP.md, docs/DEVELOPMENT_ROADMAP.md, and personal learning session 001. |
| **Milestone 2** | Runtime and Dependency Setup | **In Progress** | Python virtual environment (`.venv`), `pyproject.toml`, frontend `package.json`. |
| **Milestone 3** | Minimal Electron & React Shell | Planned | Electron main process, secure preload bridge, Vite dev server, base layout. |
| **Milestone 4** | Python Engine Foundation | Planned | Core package structure, domain models, error handling, structured logging. |
| **Milestone 5** | Electron-to-Python Communication | Planned | Validated child-process stdio/JSON-RPC IPC boundary. |

---

## 3. Verified Functionality

- **Environment Runtimes Verified:**
  - Python: `3.12.10`
  - Node.js: `v24.14.0`
  - npm: `11.9.0`
  - Git: `2.52.0.windows.1`
  - FFmpeg: `n4.4.2-4-g944ee75106-20220916`
  - FFprobe: `n4.4.2-4-g944ee75106-20220916`
- **Repository Structure:**
  - Git initialized (`main` branch).
  - Production-grade `.gitignore` protecting caches, venv, node_modules, downloads, database files, and personal learning directories.
  - Universal and project-specific agent instructions (`AGENTS.md`, `.agents/AGENTS.md`).

---

## 4. Known Bugs & Current Limitations

- No runtime packages installed yet (intentionally deferred to Milestone 2 to maintain small verifiable steps).
- Python virtual environment and frontend workspace not yet initialized.

---

## 5. Next Milestone & Acceptance Criteria

**Next Milestone:** **Milestone 2 — Runtime and Dependency Setup**

### Acceptance Criteria:
1. Dedicated Python virtual environment (`.venv`) created and verified with Python 3.12.
2. Initial `pyproject.toml` created with baseline dependencies (`httpx`, `platformdirs`, `pydantic`, `pytest`, `ruff`).
3. Root or frontend `package.json` initialized with compatible scripts and tooling.
4. Python dependencies successfully installed and verified with import tests.
5. Setup instructions documented in `docs/SETUP.md`.
