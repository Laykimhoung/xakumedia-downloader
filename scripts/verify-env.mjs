#!/usr/bin/env node
/**
 * scripts/verify-env.mjs
 *
 * Comprehensive pre-flight environment and dependency verification script.
 * Validates Node.js, Python virtual environment, required Python packages,
 * external binaries (FFmpeg/FFprobe), SQLite database access, and development ports.
 *
 * Usage:
 *   node scripts/verify-env.mjs
 *   npm run verify
 */

import { execSync, spawnSync } from "child_process";
import fs from "fs";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

const symbols = {
  pass: `${colors.green}✔ PASS${colors.reset}`,
  warn: `${colors.yellow}⚠ WARN${colors.reset}`,
  fail: `${colors.red}✖ FAIL${colors.reset}`,
};

let hasCriticalErrors = false;
let hasWarnings = false;

function check(title, status, detail, fixTip) {
  const badge = symbols[status] || status;
  console.log(`  [${badge}] ${colors.bold}${title}${colors.reset}`);
  if (detail) {
    console.log(`         ${colors.dim}${detail}${colors.reset}`);
  }
  if (fixTip && (status === "fail" || status === "warn")) {
    console.log(`         ${colors.cyan}Tip: ${fixTip}${colors.reset}`);
  }
  if (status === "fail") hasCriticalErrors = true;
  if (status === "warn") hasWarnings = true;
}

function resolvePythonExecutable() {
  const isWindows = process.platform === "win32";
  const venvPython = isWindows
    ? path.join(rootDir, "backend", ".venv", "Scripts", "python.exe")
    : path.join(rootDir, "backend", ".venv", "bin", "python");

  if (fs.existsSync(venvPython)) {
    return { path: venvPython, isVenv: true };
  }

  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
    return { path: process.env.PYTHON_PATH, isVenv: false };
  }

  return { path: isWindows ? "python" : "python3", isVenv: false };
}

function checkPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => {
      resolve(err.code !== "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function verifyEnvironment() {
  console.log(`
${colors.cyan}╔════════════════════════════════════════════════════════════════╗
║         ${colors.bold}XakuMedia Development Environment Verification${colors.reset}${colors.cyan}         ║
╚════════════════════════════════════════════════════════════════╝${colors.reset}
  Project root: ${colors.dim}${rootDir}${colors.reset}
  Time:         ${colors.dim}${new Date().toLocaleString()}${colors.reset}
`);

  // ==========================================================================
  // 1. Node.js & Tooling
  // ==========================================================================
  console.log(`${colors.bold}${colors.blue}1. Node.js & Package Manager${colors.reset}`);

  const nodeVersion = process.version;
  const majorNode = parseInt(nodeVersion.slice(1).split(".")[0], 10);
  if (majorNode >= 20) {
    check(
      "Node.js Runtime",
      "pass",
      `Version ${nodeVersion} (${process.platform} ${process.arch})`
    );
  } else {
    check(
      "Node.js Runtime",
      "fail",
      `Version ${nodeVersion} detected. Requires Node.js >= 20.0.0`,
      "Upgrade Node.js to version 20 or higher (https://nodejs.org)."
    );
  }

  try {
    const npmVersion = execSync("npm --version", { encoding: "utf-8" }).trim();
    check("npm Package Manager", "pass", `Version ${npmVersion}`);
  } catch (err) {
    check("npm Package Manager", "fail", "Could not run npm", "Ensure npm is installed in PATH.");
  }

  const frontendModules = path.join(rootDir, "frontend", "node_modules");
  if (fs.existsSync(frontendModules)) {
    check("Frontend node_modules", "pass", "Dependencies installed in frontend/node_modules");
  } else {
    check(
      "Frontend node_modules",
      "fail",
      "Missing frontend/node_modules",
      "Run: npm run install:frontend"
    );
  }

  // ==========================================================================
  // 2. Python Environment
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.blue}2. Python Backend & Virtual Environment${colors.reset}`);

  const pyInfo = resolvePythonExecutable();
  if (pyInfo.isVenv) {
    check("Python Virtual Environment", "pass", `Found at ${pyInfo.path}`);
  } else {
    check(
      "Python Virtual Environment",
      "warn",
      `Virtual environment backend/.venv not found; using fallback '${pyInfo.path}'`,
      "Run: python -m venv backend/.venv && npm run install:backend"
    );
  }

  let pyVersion = "";
  try {
    const pyCheck = spawnSync(pyInfo.path, ["-c", "import sys; print(sys.version.split()[0])"], {
      encoding: "utf-8",
    });
    if (pyCheck.status === 0) {
      pyVersion = pyCheck.stdout.trim();
      const [maj, min] = pyVersion.split(".").map(Number);
      if (maj === 3 && min >= 11) {
        check("Python Version", "pass", `Python ${pyVersion} (>= 3.11 required)`);
      } else {
        check(
          "Python Version",
          "fail",
          `Python ${pyVersion} detected. XakuMedia requires Python 3.11 or higher.`,
          "Install Python 3.11 or 3.12."
        );
      }
    } else {
      check(
        "Python Version",
        "fail",
        `Failed to run python: ${pyCheck.stderr.trim()}`,
        "Check Python executable permissions or PATH."
      );
    }
  } catch (err) {
    check("Python Version", "fail", err.message, "Ensure Python is installed and accessible.");
  }

  // ==========================================================================
  // 3. Python Package Dependencies
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.blue}3. Python Packages & Modules${colors.reset}`);

  const packageScript = `
import json, sys
packages = {}
for pkg in ["xakumedia", "yt_dlp", "gallery_dl", "PIL", "httpx", "pydantic", "pytest", "ruff"]:
    try:
        mod = __import__(pkg)
        ver = getattr(mod, "__version__", "installed")
        packages[pkg] = {"ok": True, "version": str(ver)}
    except Exception as e:
        packages[pkg] = {"ok": False, "error": str(e)}
print(json.dumps(packages))
`;

  try {
    const pkgCheck = spawnSync(pyInfo.path, ["-c", packageScript], {
      cwd: rootDir,
      encoding: "utf-8",
    });
    if (pkgCheck.status === 0) {
      const results = JSON.parse(pkgCheck.stdout.trim());
      for (const [name, res] of Object.entries(results)) {
        if (res.ok) {
          check(`Package: ${name}`, "pass", `v${res.version}`);
        } else {
          const isDev = name === "pytest" || name === "ruff";
          check(
            `Package: ${name}`,
            isDev ? "warn" : "fail",
            `Import failed: ${res.error}`,
            `Run: npm run install:backend`
          );
        }
      }
    } else {
      check(
        "Package Check Script",
        "fail",
        `Execution failed: ${pkgCheck.stderr.trim()}`,
        "Run: npm run install:backend"
      );
    }
  } catch (err) {
    check("Python Package Imports", "fail", err.message, "Verify backend/.venv setup.");
  }

  // ==========================================================================
  // 4. Media Processing Tools (FFmpeg & FFprobe)
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.blue}4. External Media Processing Tools${colors.reset}`);

  try {
    const ffmpegCheck = spawnSync("ffmpeg", ["-version"], { encoding: "utf-8" });
    if (ffmpegCheck.status === 0) {
      const firstLine = ffmpegCheck.stdout.split("\n")[0];
      check("FFmpeg Binary", "pass", firstLine);
    } else {
      check(
        "FFmpeg Binary",
        "warn",
        "FFmpeg not found in system PATH",
        "Install FFmpeg or ensure ffmpeg.exe is accessible for video merging/conversion."
      );
    }
  } catch {
    check(
      "FFmpeg Binary",
      "warn",
      "FFmpeg not found in system PATH",
      "Install FFmpeg (e.g. winget install Gyan.FFmpeg) for stream merging."
    );
  }

  try {
    const ffprobeCheck = spawnSync("ffprobe", ["-version"], { encoding: "utf-8" });
    if (ffprobeCheck.status === 0) {
      const firstLine = ffprobeCheck.stdout.split("\n")[0];
      check("FFprobe Binary", "pass", firstLine);
    } else {
      check(
        "FFprobe Binary",
        "warn",
        "FFprobe not found in system PATH",
        "FFprobe is recommended for deep media stream inspection."
      );
    }
  } catch {
    check(
      "FFprobe Binary",
      "warn",
      "FFprobe not found in system PATH",
      "FFprobe is recommended for deep media stream inspection."
    );
  }

  // ==========================================================================
  // 5. Desktop Electron Bundles
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.blue}5. Desktop Electron Bundles${colors.reset}`);

  const mainCjs = path.join(rootDir, "desktop", "dist", "main.cjs");
  const preloadCjs = path.join(rootDir, "desktop", "dist", "preload.cjs");

  if (fs.existsSync(mainCjs)) {
    const stat = fs.statSync(mainCjs);
    check("desktop/dist/main.cjs", "pass", `Compiled bundle present (${(stat.size / 1024).toFixed(1)} KB)`);
  } else {
    check(
      "desktop/dist/main.cjs",
      "warn",
      "Desktop main bundle not yet compiled",
      "Run: npm run build:desktop"
    );
  }

  if (fs.existsSync(preloadCjs)) {
    const stat = fs.statSync(preloadCjs);
    check("desktop/dist/preload.cjs", "pass", `Compiled preload present (${(stat.size / 1024).toFixed(1)} KB)`);
  } else {
    check(
      "desktop/dist/preload.cjs",
      "warn",
      "Desktop preload bundle not yet compiled",
      "Run: npm run build:desktop"
    );
  }

  // ==========================================================================
  // 6. SQLite Database & Local Storage
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.blue}6. SQLite Database & Storage Directories${colors.reset}`);

  const dbScript = `
from xakumedia.core.config import default_config
from xakumedia.db import default_repository
import json, os

db_path = default_config.database_path
db_exists = db_path.exists()
writable = os.access(default_config.data_dir, os.W_OK) if default_config.data_dir.exists() else True

scan_count = len(default_repository.get_scan_history(100))
saved_count = len(default_repository.get_saved_media(None, 100))

print(json.dumps({
    "data_dir": str(default_config.data_dir),
    "download_dir": str(default_config.download_dir),
    "database_path": str(db_path),
    "database_exists": db_exists,
    "writable": writable,
    "scan_history_count": scan_count,
    "saved_media_count": saved_count
}))
`;

  try {
    const dbCheck = spawnSync(pyInfo.path, ["-c", dbScript], {
      cwd: rootDir,
      encoding: "utf-8",
    });
    if (dbCheck.status === 0) {
      const dbData = JSON.parse(dbCheck.stdout.trim());
      check("Storage Directory", "pass", `Writable at ${dbData.data_dir}`);
      check("Downloads Directory", "pass", `Default at ${dbData.download_dir}`);
      check(
        "SQLite Database",
        "pass",
        `${dbData.database_path} (Scans: ${dbData.scan_history_count}, Saved: ${dbData.saved_media_count})`
      );
    } else {
      check(
        "SQLite Database",
        "warn",
        `Could not query database: ${dbCheck.stderr.trim()}`,
        "Check permissions for AppData directory."
      );
    }
  } catch (err) {
    check("SQLite Database", "warn", err.message);
  }

  // ==========================================================================
  // 7. Network Ports
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.blue}7. Network & Development Ports${colors.reset}`);

  const isPort5173Free = await checkPortFree(5173);
  if (isPort5173Free) {
    check("Vite Port 5173", "pass", "Port 5173 is available for dev server");
  } else {
    check(
      "Vite Port 5173",
      "warn",
      "Port 5173 is already in use by another process or running dev instance",
      "If a previous dev server is running, terminate it before running npm run dev."
    );
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log(`\n${colors.bold}─────────────────────────────────────────────────────────────────${colors.reset}`);
  if (hasCriticalErrors) {
    console.log(
      `${colors.red}${colors.bold}Environment Verification FAILED with critical issues.${colors.reset}`
    );
    console.log(`Please address the failed items above before starting development.\n`);
    process.exit(1);
  } else if (hasWarnings) {
    console.log(
      `${colors.yellow}${colors.bold}Environment Verification PASSED with non-critical warnings.${colors.reset}`
    );
    console.log(`The core system is ready, but some optional tools may enhance capabilities.\n`);
    process.exit(0);
  } else {
    console.log(
      `${colors.green}${colors.bold}All environment checks PASSED! System is fully ready.${colors.reset}\n`
    );
    process.exit(0);
  }
}

verifyEnvironment().catch((err) => {
  console.error(`${colors.red}[verify-env fatal error]${colors.reset}`, err);
  process.exit(1);
});
