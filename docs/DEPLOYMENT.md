# XakuMedia — Website Deployment & GitHub Release Guide

This document describes the manual deployment of the public landing page to **Vercel** and the distribution of Windows desktop binaries via **GitHub Releases**.

---

## 1. Public Landing Page Architecture

The public landing page for XakuMedia is a lightweight, static Single Page Application (SPA). It is built directly from the `frontend/` directory and decoupled from the Electron desktop runtime and Python backend.

### Dual-Mode Runtime Isolation

- **Electron Desktop Environment:** When launched inside Electron, the preload bridge exposes `window.api`, causing `frontend/src/main.tsx` to automatically render the desktop downloader application (`<App />`).
- **Standard Web Browser:** When visitors access the website in any browser, `window.api` is `undefined`. `frontend/src/main.tsx` automatically renders the clean public landing page (`<LandingPage />`).
- **Testing Override:** You can force rendering either view in any environment using URL query parameters:
  - `http://localhost:5173/?view=landing` — Forces landing page preview.
  - `http://localhost:5173/?view=app` — Forces desktop application preview.

---

## 2. Manual Deployment to Vercel

No `vercel.json` configuration file is required. You can deploy manually using any of the following methods:

### Method 1: Manual CLI Deploy (Recommended)

Build the production bundle and deploy the output folder directly:

```powershell
# 1. Build the production frontend bundle
npm run build:frontend

# 2. Deploy the dist folder directly with Vercel CLI
npx vercel deploy frontend/dist --prod
```

### Method 2: Vercel Dashboard Manual Deploy

1. Run `npm run build:frontend`.
2. Open [Vercel Dashboard](https://vercel.com).
3. If importing via Git, set **Root Directory** to `frontend`.
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Click **Deploy**.

---

## 3. GitHub Releases & Binary Distribution

Binary executables are **never** committed to Git. Instead, production binaries are built locally on Windows and uploaded to GitHub Releases for the corresponding version tag.

### Build Production Binaries

Run the packaging pipeline on a 64-bit Windows machine:

```powershell
# Prepare runtime and bundle both NSIS Installer and Portable binaries
npm run package:win
```

This creates verified distribution assets in `dist-package/`:

| Asset File | Distribution Format | Verified Size | Description |
| :--- | :--- | :--- | :--- |
| `XakuMedia-Setup-0.1.0.exe` | NSIS Windows Setup Wizard | ~167 MB | Desktop shortcuts, Start menu icon, auto-uninstaller |
| `XakuMedia-Portable-0.1.0.exe` | Single Standalone Binary | ~148 MB | Zero installation, registry-free portable executable |

### Publishing via GitHub CLI (`gh`)

```powershell
gh release create v0.1.0 `
  dist-package/XakuMedia-Setup-0.1.0.exe `
  dist-package/XakuMedia-Portable-0.1.0.exe `
  --title "XakuMedia v0.1.0 Production Release" `
  --notes-file docs/RELEASE_NOTES.md
```

### Publishing via GitHub Web Interface

1. Navigate to: `https://github.com/Laykimhoung/xakumedia-downloader/releases/new`
2. Set **Tag version:** `v0.1.0` (create tag on publish).
3. Set **Release title:** `XakuMedia v0.1.0 — Production Release`.
4. Copy the contents of `docs/RELEASE_NOTES.md` into the release description.
5. Drag and drop both executables from `dist-package/`:
   - `XakuMedia-Setup-0.1.0.exe`
   - `XakuMedia-Portable-0.1.0.exe`
6. Click **Publish release**.

---

## 4. Release Verification Checklist

- [x] Landing page builds statically without Python dependencies (`npm run build:frontend`).
- [x] TypeScript compiler passes without errors (`npm run typecheck`).
- [x] Desktop smoke test verifies unchanged Electron application behavior (`npm run test:desktop`).
- [x] Landing page provides verified download links pointing directly to `v0.1.0` release assets.
- [x] Unused placeholder directories in `frontend/src` removed.
- [x] `vercel.json` files removed for clean manual deployments.
