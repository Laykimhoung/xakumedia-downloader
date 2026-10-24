#!/usr/bin/env node
/**
 * scripts/run-python-server.mjs
 *
 * Standalone runner for the XakuMedia Python JSON-RPC backend server.
 * Allows developers to run, test, and interact with the Python engine directly
 * without needing to launch Electron or the Vite frontend.
 *
 * Usage:
 *   node scripts/run-python-server.mjs                    # Interactive REPL mode
 *   node scripts/run-python-server.mjs ping               # One-shot ping
 *   node scripts/run-python-server.mjs system             # One-shot get_system_info
 *   node scripts/run-python-server.mjs ffmpeg             # One-shot get_ffmpeg_info
 *   node scripts/run-python-server.mjs queue              # One-shot get_download_queue_state
 *   node scripts/run-python-server.mjs classify <url>     # One-shot classify_url
 *   node scripts/run-python-server.mjs call <method> [json] # Custom RPC call
 *   node scripts/run-python-server.mjs --raw              # Raw stdio pipe mode
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// ANSI Color helper codes for beautiful terminal presentation
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

/**
 * Locate Python binary, prioritizing the project's isolated virtual environment.
 */
function resolvePythonExecutable() {
  const isWindows = process.platform === "win32";
  const venvPython = isWindows
    ? path.join(rootDir, "backend", ".venv", "Scripts", "python.exe")
    : path.join(rootDir, "backend", ".venv", "bin", "python");

  if (fs.existsSync(venvPython)) {
    return venvPython;
  }

  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
    return process.env.PYTHON_PATH;
  }

  return isWindows ? "python" : "python3";
}

/**
 * Pretty-print JSON object with syntax highlights.
 */
function highlightJson(obj) {
  const jsonStr = JSON.stringify(obj, null, 2);
  return jsonStr
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
      let cls = colors.green; // string
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = colors.cyan; // key
        }
      } else if (/true|false/.test(match)) {
        cls = colors.yellow; // boolean
      } else if (/null/.test(match)) {
        cls = colors.magenta; // null
      } else {
        cls = colors.blue; // number
      }
      return `${cls}${match}${colors.reset}`;
    });
}

class StandalonePythonServer {
  constructor(pythonExe) {
    this.pythonExe = pythonExe;
    this.process = null;
    this.requestCounter = 0;
    this.pendingCallbacks = new Map();
    this.isClosing = false;
  }

  start() {
    this.process = spawn(this.pythonExe, ["-m", "xakumedia.server"], {
      cwd: rootDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8",
      },
    });

    const rlOut = readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity,
    });

    rlOut.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const msg = JSON.parse(trimmed);
        if (msg.id !== undefined && this.pendingCallbacks.has(msg.id)) {
          const { resolve, timer, startTime } = this.pendingCallbacks.get(msg.id);
          clearTimeout(timer);
          this.pendingCallbacks.delete(msg.id);
          const elapsed = Date.now() - startTime;
          resolve({ msg, elapsed });
        } else if (msg.method) {
          // Asynchronous server-sent notification
          console.log(
            `\n${colors.magenta}[NOTIFICATION]${colors.reset} ${colors.bold}${msg.method}${colors.reset}`
          );
          console.log(highlightJson(msg.params || {}));
        } else {
          console.log(`\n${colors.dim}[python out] ${trimmed}${colors.reset}`);
        }
      } catch {
        console.log(`${colors.dim}[python stdout] ${line}${colors.reset}`);
      }
    });

    this.process.stderr.on("data", (data) => {
      const text = data.toString();
      // Server log outputs go to stderr
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) {
          console.error(`${colors.gray}[server log] ${line}${colors.reset}`);
        }
      }
    });

    this.process.on("close", (code) => {
      if (!this.isClosing) {
        console.log(`\n${colors.yellow}[server] Process exited with code ${code}${colors.reset}`);
      }
      for (const [, { reject, timer }] of this.pendingCallbacks) {
        clearTimeout(timer);
        reject(new Error(`Server closed with exit code ${code}`));
      }
      this.pendingCallbacks.clear();
    });
  }

  sendRequest(method, params = {}, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (!this.process || this.process.killed) {
        return reject(new Error("Python server process is not running."));
      }

      const id = ++this.requestCounter;
      const payload = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      const startTime = Date.now();
      const timer = setTimeout(() => {
        if (this.pendingCallbacks.has(id)) {
          this.pendingCallbacks.delete(id);
          reject(new Error(`Request #${id} ('${method}') timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.pendingCallbacks.set(id, { resolve, reject, timer, startTime });
      this.process.stdin.write(JSON.stringify(payload) + "\n");
    });
  }

  sendRaw(rawJson, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (!this.process || this.process.killed) {
        return reject(new Error("Python server process is not running."));
      }

      let parsed;
      try {
        parsed = JSON.parse(rawJson);
      } catch (err) {
        return reject(new Error(`Invalid JSON: ${err.message}`));
      }

      const id = parsed.id ?? ++this.requestCounter;
      parsed.id = id;
      if (!parsed.jsonrpc) parsed.jsonrpc = "2.0";

      const startTime = Date.now();
      const timer = setTimeout(() => {
        if (this.pendingCallbacks.has(id)) {
          this.pendingCallbacks.delete(id);
          reject(new Error(`Raw request #${id} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.pendingCallbacks.set(id, { resolve, reject, timer, startTime });
      this.process.stdin.write(JSON.stringify(parsed) + "\n");
    });
  }

  stop() {
    this.isClosing = true;
    if (this.process && !this.process.killed) {
      try {
        this.process.stdin.end();
        this.process.kill();
      } catch {
        // ignore on cleanup
      }
    }
  }
}

// ============================================================================
// Execution Modes
// ============================================================================

async function runRawStdio(pythonExe) {
  console.log(`[runner] Launching Python engine in raw stdio pipe mode: ${pythonExe}`);
  const child = spawn(pythonExe, ["-m", "xakumedia.server"], {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8",
    },
  });

  child.on("close", (code) => process.exit(code ?? 0));
}

async function runOneShot(server, command, args) {
  server.start();

  let method = "";
  let params = {};

  switch (command.toLowerCase()) {
    case "ping":
      method = "ping";
      break;
    case "system":
    case "system-info":
    case "sys":
      method = "get_system_info";
      break;
    case "version":
    case "ver":
      method = "get_version";
      break;
    case "ffmpeg":
    case "ffmpeg-info":
      method = "get_ffmpeg_info";
      break;
    case "queue":
    case "queue-state":
      method = "get_download_queue_state";
      break;
    case "tasks":
      method = "get_download_tasks";
      params = args[0] ? { status: args[0] } : {};
      break;
    case "history":
      method = "get_scan_history";
      params = { limit: args[0] ? parseInt(args[0], 10) : 10 };
      break;
    case "saved":
      method = "get_saved_media";
      params = { limit: args[0] ? parseInt(args[0], 10) : 10 };
      break;
    case "prefs":
    case "preferences":
      method = "get_preferences";
      break;
    case "recover":
      method = "recover_interrupted_tasks";
      params = { auto_resume: false };
      break;
    case "recover-resume":
      method = "recover_interrupted_tasks";
      params = { auto_resume: true };
      break;
    case "speed":
    case "speed-limit":
      if (args[0] !== undefined) {
        method = "set_speed_limit";
        params = { speed_limit_kbps: parseInt(args[0], 10) || 0 };
      } else {
        method = "get_speed_limit";
        params = {};
      }
      break;
    case "classify": {
      const url = args[0];
      if (!url) {
        console.error(`${colors.red}Error: 'classify' requires a URL argument.${colors.reset}`);
        process.exit(1);
      }
      method = "classify_url";
      params = { url };
      break;
    }
    case "call": {
      method = args[0];
      if (!method) {
        console.error(`${colors.red}Error: 'call' requires a method name.${colors.reset}`);
        process.exit(1);
      }
      if (args[1]) {
        try {
          params = JSON.parse(args.slice(1).join(" "));
        } catch (e) {
          console.error(`${colors.red}Error parsing JSON params: ${e.message}${colors.reset}`);
          process.exit(1);
        }
      }
      break;
    }
    default:
      console.error(`${colors.red}Unknown command '${command}'. Use --help for usage.${colors.reset}`);
      server.stop();
      process.exit(1);
  }

  try {
    console.log(`${colors.cyan}Calling method:${colors.reset} ${colors.bold}${method}${colors.reset}`);
    const { msg, elapsed } = await server.sendRequest(method, params, 30000);
    console.log(`${colors.dim}(Completed in ${elapsed}ms)${colors.reset}`);

    if (msg.error) {
      console.error(`${colors.red}RPC Error [${msg.error.code}]: ${msg.error.message}${colors.reset}`);
      if (msg.error.data) {
        console.error(highlightJson(msg.error.data));
      }
      server.stop();
      process.exit(1);
    } else {
      console.log(highlightJson(msg.result));
      server.stop();
      process.exit(0);
    }
  } catch (err) {
    console.error(`${colors.red}Request failed: ${err.message}${colors.reset}`);
    server.stop();
    process.exit(1);
  }
}

async function runInteractive(server) {
  server.start();

  console.log(`
${colors.cyan}╔════════════════════════════════════════════════════════════════╗
║   ${colors.bold}XakuMedia Python Backend Server — Interactive Debug Console${colors.reset}${colors.cyan}  ║
╚════════════════════════════════════════════════════════════════╝${colors.reset}
  ${colors.dim}Python Executable:${colors.reset} ${server.pythonExe}
  ${colors.dim}Server Process PID:${colors.reset} ${server.process?.pid ?? "unknown"}
  `);

  // Quick initial ping check
  try {
    const { msg, elapsed } = await server.sendRequest("ping");
    console.log(
      `${colors.green}✔ Connected to Python RPC Server (${elapsed}ms):${colors.reset} v${msg.result?.version ?? "unknown"}`
    );
  } catch (err) {
    console.log(`${colors.red}✖ Initial ping failed: ${err.message}${colors.reset}`);
  }

  printHelp();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${colors.bold}${colors.cyan}xakumedia-rpc> ${colors.reset}`,
  });

  rl.prompt();

  rl.on("line", async (rawInput) => {
    const line = rawInput.trim();
    if (!line) {
      rl.prompt();
      return;
    }

    const [cmd, ...rest] = line.split(" ");
    const args = rest.join(" ");

    switch (cmd.toLowerCase()) {
      case "exit":
      case "quit":
      case "q":
        console.log(`${colors.dim}Shutting down server...${colors.reset}`);
        server.stop();
        rl.close();
        process.exit(0);
        break;

      case "help":
      case "?":
        printHelp();
        rl.prompt();
        break;

      case "ping":
        await executeRpc(server, "ping", {});
        break;

      case "sys":
      case "system":
        await executeRpc(server, "get_system_info", {});
        break;

      case "version":
        await executeRpc(server, "get_version", {});
        break;

      case "ffmpeg":
        await executeRpc(server, "get_ffmpeg_info", {});
        break;

      case "queue":
        await executeRpc(server, "get_download_queue_state", {});
        break;

      case "tasks": {
        const status = args.trim() || undefined;
        await executeRpc(server, "get_download_tasks", status ? { status } : {});
        break;
      }

      case "history": {
        const limit = parseInt(args.trim(), 10) || 10;
        await executeRpc(server, "get_scan_history", { limit });
        break;
      }

      case "saved": {
        const limit = parseInt(args.trim(), 10) || 10;
        await executeRpc(server, "get_saved_media", { limit });
        break;
      }

      case "prefs":
      case "preferences":
        await executeRpc(server, "get_preferences", {});
        break;

      case "recover":
        await executeRpc(server, "recover_interrupted_tasks", { auto_resume: false });
        break;

      case "recover-resume":
        await executeRpc(server, "recover_interrupted_tasks", { auto_resume: true });
        break;

      case "speed":
      case "speed-limit": {
        const val = args.trim();
        if (val) {
          await executeRpc(server, "set_speed_limit", { speed_limit_kbps: parseInt(val, 10) || 0 });
        } else {
          await executeRpc(server, "get_speed_limit", {});
        }
        break;
      }

      case "classify": {
        if (!args.trim()) {
          console.log(`${colors.yellow}Usage: classify <url>${colors.reset}`);
        } else {
          await executeRpc(server, "classify_url", { url: args.trim() });
        }
        break;
      }

      case "call": {
        const method = rest[0];
        const paramsStr = rest.slice(1).join(" ");
        if (!method) {
          console.log(`${colors.yellow}Usage: call <method> [jsonParams]${colors.reset}`);
        } else {
          let params = {};
          if (paramsStr) {
            try {
              params = JSON.parse(paramsStr);
            } catch (e) {
              console.log(`${colors.red}Invalid JSON params: ${e.message}${colors.reset}`);
              rl.prompt();
              return;
            }
          }
          await executeRpc(server, method, params);
        }
        break;
      }

      case "raw": {
        if (!args.trim()) {
          console.log(`${colors.yellow}Usage: raw <full-json-rpc-string>${colors.reset}`);
        } else {
          try {
            console.log(`${colors.dim}Sending raw JSON-RPC...${colors.reset}`);
            const { msg, elapsed } = await server.sendRaw(args.trim());
            console.log(`${colors.dim}[Response in ${elapsed}ms]:${colors.reset}`);
            console.log(highlightJson(msg));
          } catch (err) {
            console.log(`${colors.red}Error: ${err.message}${colors.reset}`);
          }
        }
        break;
      }

      default:
        console.log(
          `${colors.yellow}Unknown command '${cmd}'. Type 'help' for available commands.${colors.reset}`
        );
        break;
    }

    rl.prompt();
  });

  rl.on("close", () => {
    server.stop();
    process.exit(0);
  });
}

async function executeRpc(server, method, params) {
  try {
    console.log(`${colors.dim}Calling '${method}'...${colors.reset}`);
    const { msg, elapsed } = await server.sendRequest(method, params);
    console.log(`${colors.dim}[Response in ${elapsed}ms]:${colors.reset}`);
    if (msg.error) {
      console.log(`${colors.red}RPC Error [${msg.error.code}]: ${msg.error.message}${colors.reset}`);
      if (msg.error.data) {
        console.log(highlightJson(msg.error.data));
      }
    } else {
      console.log(highlightJson(msg.result));
    }
  } catch (err) {
    console.log(`${colors.red}Request error: ${err.message}${colors.reset}`);
  }
}

function printHelp() {
  console.log(`
${colors.bold}Available Commands:${colors.reset}
  ${colors.green}ping${colors.reset}                   Health-check server & latency
  ${colors.green}sys, system${colors.reset}            Get runtime system, python, and folder info
  ${colors.green}version${colors.reset}                Get server and engine version
  ${colors.green}ffmpeg${colors.reset}                 Check FFmpeg/FFprobe availability & codecs
  ${colors.green}queue${colors.reset}                  Check live download queue state & concurrency
  ${colors.green}tasks [status]${colors.reset}         List download tasks (optional: queued, downloading, completed)
  ${colors.green}history [limit]${colors.reset}        Show recent URL scan history records
  ${colors.green}saved [limit]${colors.reset}          List saved media items from database
  ${colors.green}classify <url>${colors.reset}         Probe and classify a URL (direct media, gallery, or video)
  ${colors.green}call <method> [json]${colors.reset}   Call any RPC method with JSON parameters
  ${colors.green}raw <json>${colors.reset}             Send raw JSON-RPC string
  ${colors.green}help, ?${colors.reset}                Show this commands list
  ${colors.green}exit, quit, q${colors.reset}          Terminate the server and exit
  `);
}

function printCliHelp() {
  console.log(`
${colors.bold}XakuMedia Python Server Standalone Runner${colors.reset}

${colors.bold}Usage:${colors.reset}
  node scripts/run-python-server.mjs [command] [args...]
  npm run server:python -- [command] [args...]

${colors.bold}Commands:${colors.reset}
  (no args)             Start interactive REPL debug session
  ping                  Run quick ping check and exit
  system, sys           Display system and storage directory information
  ffmpeg                Display FFmpeg & FFprobe tool detection info
  queue                 Display download queue state and active worker count
  tasks [status]        List download tasks (queued, downloading, completed, etc.)
  history [limit]       Display scan history items from SQLite
  saved [limit]         Display saved media items from SQLite
  speed [kbps]          Get or set global download speed limit (0 = unlimited)
  classify <url>        Classify URL through extractors and return metadata
  call <method> [json]  Execute arbitrary JSON-RPC method with parameters
  --raw, --stdio        Pass stdio directly to the Python process (pipe mode)
  --help, -h            Show this help reference
  `);
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const firstArg = args[0] || "";

  if (firstArg === "--help" || firstArg === "-h") {
    printCliHelp();
    process.exit(0);
  }

  const pythonExe = resolvePythonExecutable();

  if (firstArg === "--raw" || firstArg === "--stdio") {
    await runRawStdio(pythonExe);
    return;
  }

  const server = new StandalonePythonServer(pythonExe);

  // Clean exit on termination signals
  process.on("SIGINT", () => {
    server.stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    server.stop();
    process.exit(0);
  });

  if (args.length > 0) {
    // One-shot mode
    await runOneShot(server, firstArg, args.slice(1));
  } else {
    // Interactive REPL mode
    await runInteractive(server);
  }
}

main().catch((err) => {
  console.error(`${colors.red}[runner fatal error]${colors.reset}`, err);
  process.exit(1);
});
