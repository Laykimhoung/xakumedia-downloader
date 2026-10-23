#!/usr/bin/env node
/**
 * scripts/db-tool.mjs
 *
 * Standalone SQLite database inspection and maintenance tool for XakuMedia.
 * Query scan history, saved media items, download queue tasks, and statistics
 * directly from the command line without third-party SQLite viewers.
 *
 * Usage:
 *   node scripts/db-tool.mjs stats
 *   node scripts/db-tool.mjs scans [limit]
 *   node scripts/db-tool.mjs saved [limit]
 *   node scripts/db-tool.mjs tasks [status]
 *   node scripts/db-tool.mjs clear-scans
 *   node scripts/db-tool.mjs clear-tasks
 */

import { spawnSync } from "child_process";
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
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

function resolvePython() {
  const isWindows = process.platform === "win32";
  const venvPython = isWindows
    ? path.join(rootDir, "backend", ".venv", "Scripts", "python.exe")
    : path.join(rootDir, "backend", ".venv", "bin", "python");

  if (fs.existsSync(venvPython)) return venvPython;
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
  return isWindows ? "python" : "python3";
}

function runPythonDbSnippet(snippet) {
  const pythonExe = resolvePython();
  const res = spawnSync(pythonExe, ["-c", snippet], {
    cwd: rootDir,
    encoding: "utf-8",
  });

  if (res.status !== 0) {
    console.error(`${colors.red}Python execution error:${colors.reset}\n`, res.stderr);
    process.exit(1);
  }

  return res.stdout.trim();
}

function showStats() {
  const snippet = `
from xakumedia.core.config import default_config
from xakumedia.db import default_repository
from xakumedia.db.connection import get_db_connection
import json, os

db_path = default_config.database_path
db_exists = db_path.exists()
file_size = db_path.stat().st_size if db_exists else 0

with get_db_connection(db_path) as conn:
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
    tables = [row["name"] for row in cursor.fetchall()]

    counts = {}
    for tbl in tables:
        cursor.execute(f"SELECT COUNT(*) as cnt FROM {tbl}")
        counts[tbl] = cursor.fetchone()["cnt"]

print(json.dumps({
    "db_path": str(db_path),
    "exists": db_exists,
    "size_bytes": file_size,
    "tables": counts
}))
`;

  const output = runPythonDbSnippet(snippet);
  const data = JSON.parse(output);

  console.log(`
${colors.cyan}╔════════════════════════════════════════════════════════════════╗
║               ${colors.bold}XakuMedia Database Statistics${colors.reset}${colors.cyan}                    ║
╚════════════════════════════════════════════════════════════════╝${colors.reset}
  Database Path: ${colors.bold}${data.db_path}${colors.reset}
  File Exists:   ${data.exists ? `${colors.green}Yes${colors.reset}` : `${colors.red}No${colors.reset}`}
  File Size:     ${colors.cyan}${(data.size_bytes / 1024).toFixed(2)} KB${colors.reset}
  
${colors.bold}Table Record Counts:${colors.reset}`);

  for (const [tbl, cnt] of Object.entries(data.tables)) {
    console.log(`  • ${colors.cyan}${tbl.padEnd(20)}${colors.reset}: ${colors.bold}${cnt}${colors.reset} records`);
  }
  console.log();
}

function showScans(limit = 10) {
  const snippet = `
from xakumedia.db import default_repository
import json

items = default_repository.get_scan_history(limit=${limit})
print(json.dumps(items))
`;

  const output = runPythonDbSnippet(snippet);
  const items = JSON.parse(output);

  console.log(`\n${colors.bold}Recent Scan History (limit: ${limit}):${colors.reset}`);
  if (items.length === 0) {
    console.log(`  ${colors.dim}No scans recorded yet.${colors.reset}\n`);
    return;
  }

  for (const item of items) {
    console.log(`  [${colors.cyan}${item.category}${colors.reset}] ${colors.bold}${item.url}${colors.reset}`);
    console.log(`     ${colors.dim}Scan ID: ${item.id} | Items: ${item.item_count} | ${item.scanned_at}${colors.reset}`);
  }
  console.log();
}

function showSaved(limit = 10) {
  const snippet = `
from xakumedia.db import default_repository
import json

items = default_repository.get_saved_media(limit=${limit})
print(json.dumps([i.model_dump(mode="json") for i in items]))
`;

  const output = runPythonDbSnippet(snippet);
  const items = JSON.parse(output);

  console.log(`\n${colors.bold}Saved Media Items (limit: ${limit}):${colors.reset}`);
  if (items.length === 0) {
    console.log(`  ${colors.dim}No saved media items found in database.${colors.reset}\n`);
    return;
  }

  for (const item of items) {
    console.log(`  [${colors.cyan}${item.media_type}${colors.reset}] ${colors.bold}${item.title || "Untitled"}${colors.reset}`);
    console.log(`     ${colors.dim}ID: ${item.id} | Author: ${item.author || "Unknown"} | Created: ${item.created_at}${colors.reset}`);
  }
  console.log();
}

function showTasks(status = null) {
  const statusParam = status ? `"${status}"` : "None";
  const snippet = `
from xakumedia.db import default_repository
from xakumedia.models.queue import TaskStatus
import json

st = TaskStatus(${statusParam}) if ${statusParam} else None
tasks = default_repository.get_download_tasks(status=st, limit=20)
print(json.dumps([t.model_dump(mode="json") for t in tasks]))
`;

  const output = runPythonDbSnippet(snippet);
  const tasks = JSON.parse(output);

  console.log(`\n${colors.bold}Download Tasks ${status ? `(status: ${status})` : ""}:${colors.reset}`);
  if (tasks.length === 0) {
    console.log(`  ${colors.dim}No download tasks found.${colors.reset}\n`);
    return;
  }

  for (const task of tasks) {
    const stColor = task.status === "completed" ? colors.green : task.status === "failed" ? colors.red : colors.yellow;
    console.log(`  [${stColor}${task.status}${colors.reset}] ${colors.bold}${task.media_title || task.id}${colors.reset}`);
    console.log(`     ${colors.dim}ID: ${task.id} | Dest: ${task.destination_path} | Progress: ${task.progress_percent}%${colors.reset}`);
  }
  console.log();
}

function clearScans() {
  const snippet = `
from xakumedia.db import default_repository
deleted = default_repository.clear_scan_history()
print(deleted)
`;
  const deleted = runPythonDbSnippet(snippet);
  console.log(`\n${colors.green}✔ Cleared ${deleted} scan history records.${colors.reset}\n`);
}

function clearTasks() {
  const snippet = `
from xakumedia.downloader import default_download_manager
cleared = default_download_manager.clear_completed()
print(cleared)
`;
  const cleared = runPythonDbSnippet(snippet);
  console.log(`\n${colors.green}✔ Cleared ${cleared} completed/terminal tasks.${colors.reset}\n`);
}

function printHelp() {
  console.log(`
${colors.bold}XakuMedia Database Tool (db-tool.mjs)${colors.reset}

${colors.bold}Usage:${colors.reset}
  node scripts/db-tool.mjs [command] [args...]
  npm run db:status

${colors.bold}Commands:${colors.reset}
  stats, status       Display database path, tables, and row counts
  scans [limit]       List recent scanned URLs (default: 10)
  saved [limit]       List saved media items (default: 10)
  tasks [status]      List download tasks (optional: queued, completed, etc.)
  clear-scans         Clear all scan history entries from SQLite
  clear-tasks         Clear completed/terminal download tasks
  help, -h            Show this help reference
  `);
}

const args = process.argv.slice(2);
const cmd = args[0] || "stats";

switch (cmd.toLowerCase()) {
  case "stats":
  case "status":
    showStats();
    break;
  case "scans":
  case "history":
    showScans(args[1] ? parseInt(args[1], 10) : 10);
    break;
  case "saved":
    showSaved(args[1] ? parseInt(args[1], 10) : 10);
    break;
  case "tasks":
    showTasks(args[1] || null);
    break;
  case "clear-scans":
    clearScans();
    break;
  case "clear-tasks":
    clearTasks();
    break;
  case "help":
  case "--help":
  case "-h":
    printHelp();
    break;
  default:
    console.error(`${colors.red}Unknown command '${cmd}'.${colors.reset}`);
    printHelp();
    process.exit(1);
}
