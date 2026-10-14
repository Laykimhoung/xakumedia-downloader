# XakuMedia — Current Project State

**Last Updated:** October 14, 2026  
**Active Milestone:** Milestone 2 — Runtime and Dependency Setup  
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
| **Milestone 2** | Runtime and Dependency Setup | **Completed** | Dedicated Python `.venv` created; `backend/pyproject.toml` configured with `httpx`, `platformdirs`, `pydantic`, `pillow`, `pytest`, `ruff`; editable install verified; pytest smoke test passed in 0.08s; ruff check passed; `package.json` initialized with React, Vite, TS, Tailwind, Electron; `npm install` completed (204 packages); `npx vite` (5.4.21) and `npx electron` (v33.4.11) verified. |
| **Milestone 3** | Minimal Electron & React Shell | **In Progress** | Electron main process, secure preload bridge, Vite dev server, base layout. |
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
  - Git initialized (`main` branch) and committed initial foundation (`5c01537`).
  - Production-grade `.gitignore` protecting caches, venv, node_modules, downloads, database files, and personal learning directories.
  - Universal and project-specific agent instructions (`AGENTS.md`, `.agents/AGENTS.md`).
- **Backend & Python Tooling:**
  - Dedicated virtual environment isolated at `backend/.venv/` (zero root clutter).
  - `backend/pyproject.toml` adhering to PEP 621.
  - Core libraries installed: `httpx>=0.27.0`, `platformdirs>=4.2.0`, `pydantic>=2.7.0`, `pillow>=10.3.0`.
  - Developer tooling installed and passing: `pytest` (1 passed in 0.02s), `ruff` (all checks passed).
- **Frontend & Desktop Tooling:**
  - Modular `frontend/package.json` with React 18, Vite 5, Tailwind CSS 3, TypeScript 5, Electron 33.
  - Dependencies isolated in `frontend/node_modules/` (zero root clutter).
  - Tooling configs: `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/tailwind.config.js`, `frontend/postcss.config.js`.
  - Production build verified: `vite build` generated in 1.14s (`frontend/dist/`).
  - Strict type checking verified: `tsc --noEmit` cleanly passed.
- **Root Workspace Orchestration:**
  - Root `package.json` acts as a zero-dependency workspace coordinator with scripts (`dev:frontend`, `build:frontend`, `typecheck:frontend`, `test:python`, `lint:python`).
  - Skeleton modular directories established with `.gitkeep`: `desktop/{main,preload,shared}`, `scripts/`, `frontend/src/{components,features,layouts,pages,hooks,services,types,utils,styles}`.

---

## 4. Known Bugs & Current Limitations

- Electron main process script (`desktop/main/index.ts`) and preload bridge (`desktop/preload/index.ts`) not yet implemented (scheduled for Milestone 3).
- Electron dev runner to launch Electron and Vite simultaneously is scheduled for Milestone 3.

---

## 5. Next Milestone & Acceptance Criteria

**Next Milestone:** **Milestone 3 — Minimal Electron and React Shell**

### Acceptance Criteria:
1. Establish Electron main process script with secure defaults (`contextIsolation: true`, `nodeIntegration: false`).
2. Establish secure preload script with validated IPC bridge.
3. Establish React entry point (`index.html`, `frontend/src/app/App.tsx`, `frontend/src/index.css`).
4. Establish Vite build and dev configuration for desktop development.
5. Application launches and renders the base window without console or security errors.
