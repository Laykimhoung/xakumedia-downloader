#!/usr/bin/env node
/**
 * scripts/clean.mjs
 *
 * Workspace cleanup script to remove build artifacts, Python bytecaches,
 * test caches, and temporary files without affecting the virtual environment,
 * node_modules, database, or downloaded user files.
 *
 * Usage:
 *   node scripts/clean.mjs            # Perform cleanup
 *   node scripts/clean.mjs --dry-run  # Preview items to be deleted
 *   npm run clean
 *   npm run clean:dry
 */

import fs from "fs";
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
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

const isDryRun = process.argv.includes("--dry-run");

let totalFilesRemoved = 0;
let totalDirsRemoved = 0;
let totalBytesReclaimed = 0;

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Calculate total size of a file or directory recursively.
 */
function getPathSize(targetPath) {
  try {
    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return stat.size;
    }
    let size = 0;
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(targetPath, entry.name);
      try {
        if (entry.isDirectory()) {
          size += getPathSize(fullPath);
        } else {
          size += fs.statSync(fullPath).size;
        }
      } catch {
        // ignore unreadable entries
      }
    }
    return size;
  } catch {
    return 0;
  }
}

/**
 * Remove a directory recursively.
 */
function removeDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const size = getPathSize(dirPath);

  if (isDryRun) {
    console.log(`  ${colors.yellow}[dry-run dir]${colors.reset} ${path.relative(rootDir, dirPath)} (${formatBytes(size)})`);
  } else {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`  ${colors.green}[removed dir]${colors.reset} ${path.relative(rootDir, dirPath)} (${formatBytes(size)})`);
    } catch (err) {
      console.error(`  ${colors.red}[failed dir]${colors.reset} ${path.relative(rootDir, dirPath)}: ${err.message}`);
      return;
    }
  }

  totalDirsRemoved++;
  totalBytesReclaimed += size;
}

/**
 * Remove a single file.
 */
function removeFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let size = 0;
  try {
    size = fs.statSync(filePath).size;
  } catch {
    // ignore
  }

  if (isDryRun) {
    console.log(`  ${colors.yellow}[dry-run file]${colors.reset} ${path.relative(rootDir, filePath)} (${formatBytes(size)})`);
  } else {
    try {
      fs.unlinkSync(filePath);
      console.log(`  ${colors.green}[removed file]${colors.reset} ${path.relative(rootDir, filePath)} (${formatBytes(size)})`);
    } catch (err) {
      console.error(`  ${colors.red}[failed file]${colors.reset} ${path.relative(rootDir, filePath)}: ${err.message}`);
      return;
    }
  }

  totalFilesRemoved++;
  totalBytesReclaimed += size;
}

/**
 * Recursively find directories matching specific names (e.g. __pycache__).
 */
function cleanRecursive(startDir, skipDirs = new Set(["node_modules", ".git", ".venv"])) {
  if (!fs.existsSync(startDir)) return;

  const entries = fs.readdirSync(startDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(startDir, entry.name);

    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) {
        continue;
      }

      // Check for Python / test cache directories
      if (
        entry.name === "__pycache__" ||
        entry.name === ".pytest_cache" ||
        entry.name === ".ruff_cache"
      ) {
        removeDir(fullPath);
      } else {
        cleanRecursive(fullPath, skipDirs);
      }
    } else if (entry.isFile()) {
      // Check for Python compiled bytecode or temp files
      if (
        entry.name.endsWith(".pyc") ||
        entry.name.endsWith(".pyo") ||
        entry.name === ".coverage" ||
        entry.name.endsWith(".part") ||
        entry.name.endsWith(".tmp")
      ) {
        removeFile(fullPath);
      }
    }
  }
}

async function runClean() {
  console.log(`
${colors.cyan}╔════════════════════════════════════════════════════════════════╗
║               ${colors.bold}XakuMedia Workspace Clean Tool${colors.reset}${colors.cyan}                  ║
╚════════════════════════════════════════════════════════════════╝${colors.reset}
  Mode: ${isDryRun ? `${colors.yellow}DRY-RUN (Preview only)${colors.reset}` : `${colors.green}ACTIVE CLEANUP${colors.reset}`}
  Root: ${colors.dim}${rootDir}${colors.reset}
`);

  console.log(`${colors.bold}${colors.cyan}1. Cleaning Desktop, Frontend & Packaging Build Outputs...${colors.reset}`);
  removeDir(path.join(rootDir, "desktop", "dist"));
  removeDir(path.join(rootDir, "frontend", "dist"));
  removeDir(path.join(rootDir, "dist-package"));
  removeDir(path.join(rootDir, "build"));

  console.log(`\n${colors.bold}${colors.cyan}2. Scanning and cleaning Python bytecode & test caches...${colors.reset}`);
  cleanRecursive(path.join(rootDir, "backend"));
  cleanRecursive(path.join(rootDir, "scripts"));

  console.log(`\n${colors.bold}─────────────────────────────────────────────────────────────────${colors.reset}`);
  if (totalDirsRemoved === 0 && totalFilesRemoved === 0) {
    console.log(`${colors.green}Workspace is already completely clean! Nothing to remove.${colors.reset}\n`);
  } else {
    const actionWord = isDryRun ? "Would remove" : "Successfully removed";
    console.log(
      `${colors.green}✔ ${actionWord}: ${totalDirsRemoved} directories, ${totalFilesRemoved} files.${colors.reset}`
    );
    console.log(
      `${colors.bold}Total space reclaimed: ${colors.cyan}${formatBytes(totalBytesReclaimed)}${colors.reset}\n`
    );
  }
}

runClean().catch((err) => {
  console.error(`${colors.red}[clean error]${colors.reset}`, err);
  process.exit(1);
});
