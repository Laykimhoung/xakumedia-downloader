/**
 * XakuMedia — Automated Windows Packaging Preparation Script
 * 
 * Stages:
 * 1. Application icon generation (ICO and PNG)
 * 2. Desktop (Electron) and Frontend (Vite) production builds
 * 3. FFmpeg and FFprobe binary extraction to build/bin/
 * 4. Portable Python 3.12 runtime assembly with all dependencies in build/python/
 * 5. Backend source distribution in build/backend/
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const buildDir = path.join(rootDir, "build");

function log(msg) {
  console.log(`[package-prepare] ${msg}`);
}

async function prepare() {
  log("Starting automated packaging staging...");
  fs.mkdirSync(buildDir, { recursive: true });

  // 1. Generate Application Icons if needed
  const icoPath = path.join(buildDir, "icon.ico");
  if (!fs.existsSync(icoPath)) {
    log("Generating application icons...");
    const pythonExe = path.join(rootDir, "backend/.venv/Scripts/python.exe");
    execSync(`"${pythonExe}" scripts/generate_icons.py`, { cwd: rootDir, stdio: "inherit" });
  } else {
    log("Application icons verified at build/icon.ico");
  }

  // 2. Build Desktop & Frontend bundles
  log("Building Desktop main & preload scripts...");
  execSync(`node scripts/build-desktop.mjs`, { cwd: rootDir, stdio: "inherit" });

  log("Building Frontend production bundle with Vite...");
  execSync(`npm --prefix frontend run build`, { cwd: rootDir, stdio: "inherit" });

  // 3. Stage FFmpeg & FFprobe Binaries
  const binDir = path.join(buildDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });

  const ffmpegCandidates = [
    "C:\\lib\\ffmpeg-n4.4-latest-win64-gpl-4.4\\bin\\ffmpeg.exe",
    path.join(process.env.LOCALAPPDATA || "", "Microsoft/WinGet/Links/ffmpeg.exe"),
  ];
  const ffprobeCandidates = [
    "C:\\lib\\ffmpeg-n4.4-latest-win64-gpl-4.4\\bin\\ffprobe.exe",
    path.join(process.env.LOCALAPPDATA || "", "Microsoft/WinGet/Links/ffprobe.exe"),
  ];

  let ffmpegSrc = ffmpegCandidates.find((p) => fs.existsSync(p));
  let ffprobeSrc = ffprobeCandidates.find((p) => fs.existsSync(p));

  if (!ffmpegSrc) {
    try {
      ffmpegSrc = execSync("where ffmpeg", { encoding: "utf-8" }).trim().split("\r\n")[0];
    } catch {
      // ignore
    }
  }
  if (!ffprobeSrc) {
    try {
      ffprobeSrc = execSync("where ffprobe", { encoding: "utf-8" }).trim().split("\r\n")[0];
    } catch {
      // ignore
    }
  }

  if (ffmpegSrc && fs.existsSync(ffmpegSrc)) {
    log(`Copying FFmpeg binary from: ${ffmpegSrc}`);
    fs.copyFileSync(ffmpegSrc, path.join(binDir, "ffmpeg.exe"));
  } else {
    console.warn("[package-prepare] WARNING: ffmpeg.exe not found on system!");
  }

  if (ffprobeSrc && fs.existsSync(ffprobeSrc)) {
    log(`Copying FFprobe binary from: ${ffprobeSrc}`);
    fs.copyFileSync(ffprobeSrc, path.join(binDir, "ffprobe.exe"));
  } else {
    console.warn("[package-prepare] WARNING: ffprobe.exe not found on system!");
  }

  // 4. Stage Standalone Python Runtime (build/python)
  const pythonStagingDir = path.join(buildDir, "python");
  fs.mkdirSync(pythonStagingDir, { recursive: true });

  // Determine base Python installation path from backend/.venv/pyvenv.cfg
  let basePythonDir = "C:\\Users\\CSR\\AppData\\Local\\Programs\\Python\\Python312";
  const pyvenvCfgPath = path.join(rootDir, "backend/.venv/pyvenv.cfg");
  if (fs.existsSync(pyvenvCfgPath)) {
    const lines = fs.readFileSync(pyvenvCfgPath, "utf-8").split("\n");
    for (const line of lines) {
      if (line.trim().startsWith("home =")) {
        basePythonDir = line.split("=")[1].trim();
        break;
      }
    }
  }

  log(`Staging standalone Python runtime from base: ${basePythonDir}`);

  // Copy python executables and core runtime DLLs
  const coreFiles = [
    "python.exe",
    "pythonw.exe",
    "python3.dll",
    "python312.dll",
    "vcruntime140.dll",
    "vcruntime140_1.dll",
  ];
  for (const f of coreFiles) {
    const src = path.join(basePythonDir, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(pythonStagingDir, f));
    }
  }

  // Copy DLLs folder
  const dllsSrc = path.join(basePythonDir, "DLLs");
  const dllsDest = path.join(pythonStagingDir, "DLLs");
  if (fs.existsSync(dllsSrc)) {
    log("Copying Python standard DLLs...");
    fs.cpSync(dllsSrc, dllsDest, { recursive: true });
  }

  // Copy standard library Lib (excluding site-packages)
  const libSrc = path.join(basePythonDir, "Lib");
  const libDest = path.join(pythonStagingDir, "Lib");
  if (fs.existsSync(libSrc)) {
    log("Copying Python standard library...");
    fs.cpSync(libSrc, libDest, {
      recursive: true,
      filter: (src) => {
        const basename = path.basename(src).toLowerCase();
        return basename !== "site-packages" && basename !== "__pycache__";
      },
    });
  }

  // Copy site-packages from backend/.venv/Lib/site-packages
  const venvSitePackages = path.join(rootDir, "backend/.venv/Lib/site-packages");
  const destSitePackages = path.join(libDest, "site-packages");
  fs.mkdirSync(destSitePackages, { recursive: true });

  if (fs.existsSync(venvSitePackages)) {
    log("Copying virtual environment site-packages (yt-dlp, gallery-dl, httpx, pydantic, pillow)...");
    fs.cpSync(venvSitePackages, destSitePackages, {
      recursive: true,
      filter: (src) => {
        const basename = path.basename(src);
        // Exclude test caches and development editable links
        return (
          basename !== "__pycache__" &&
          !basename.startsWith("__editable__") &&
          !basename.startsWith("pytest") &&
          basename !== ".pytest_cache"
        );
      },
    });
  }

  // Copy xakumedia source package directly into site-packages for direct module resolution
  const xakumediaSrc = path.join(rootDir, "backend/src/xakumedia");
  const xakumediaDest = path.join(destSitePackages, "xakumedia");
  log("Copying xakumedia package into bundled site-packages...");
  fs.cpSync(xakumediaSrc, xakumediaDest, {
    recursive: true,
    filter: (src) => path.basename(src) !== "__pycache__",
  });

  // Ensure pyvenv.cfg is absent so Python standard standalone directory discovery activates
  const pyvenvCfg = path.join(pythonStagingDir, "pyvenv.cfg");
  if (fs.existsSync(pyvenvCfg)) {
    fs.unlinkSync(pyvenvCfg);
  }

  // Verify bundled portable python
  const testCmd = `"${path.join(pythonStagingDir, "python.exe")}" -c "import xakumedia, httpx, pydantic, yt_dlp, gallery_dl, PIL; print('[package-prepare] Portable Python verified OK')"`;
  log("Verifying portable Python runtime...");
  execSync(testCmd, { cwd: pythonStagingDir, stdio: "inherit" });

  // 5. Stage Backend Source (build/backend)
  const backendStagingDir = path.join(buildDir, "backend");
  fs.mkdirSync(backendStagingDir, { recursive: true });
  log("Copying backend source into build/backend/src...");
  fs.cpSync(path.join(rootDir, "backend/src"), path.join(backendStagingDir, "src"), {
    recursive: true,
    filter: (src) => path.basename(src) !== "__pycache__",
  });

  log("Staging completed successfully! Ready for electron-builder packaging.");
}

prepare().catch((err) => {
  console.error("[package-prepare] FAILED:", err);
  process.exit(1);
});
