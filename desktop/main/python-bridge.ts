import { app } from "electron";
import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import readline from "readline";
import type {
  PythonBridgeStatus,
  PythonPingResult,
  PythonSystemInfoResult,
} from "../shared/types";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
}

interface JsonRpcMessage {
  jsonrpc: string;
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export class PythonBridge {
  private process: ChildProcess | null = null;
  private projectRoot: string;
  private pendingRequests: Map<string | number, PendingRequest> = new Map();
  private requestCounter = 0;
  private isConnected = false;
  private lastError?: string;
  private cachedSystemInfo?: PythonSystemInfoResult;
  private notificationListeners: ((method: string, params: Record<string, unknown>) => void)[] = [];

  constructor(projectRoot?: string) {
    // Default project root is 2 levels up from desktop/main or dist/
    this.projectRoot =
      projectRoot || path.resolve(__dirname, "../../");
  }

  /**
   * Determine the path to the Python executable.
   * Prioritizes packaged Python runtime, then isolated project virtual environment in backend/.venv/.
   */
  public resolvePythonExecutable(): string {
    const isWindows = process.platform === "win32";

    // 1. Packaged production: check extraResources/python
    if (app && app.isPackaged) {
      const packagedDirect = isWindows
        ? path.join(process.resourcesPath, "python", "python.exe")
        : path.join(process.resourcesPath, "python", "bin", "python3");
      if (fs.existsSync(packagedDirect)) {
        return packagedDirect;
      }

      const packagedVenv = isWindows
        ? path.join(process.resourcesPath, "python", "Scripts", "python.exe")
        : path.join(process.resourcesPath, "python", "bin", "python");
      if (fs.existsSync(packagedVenv)) {
        return packagedVenv;
      }
    }

    // 2. Explicit environment override
    if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
      return process.env.PYTHON_PATH;
    }

    // 3. Isolated project virtual environment
    const venvPython = isWindows
      ? path.join(this.projectRoot, "backend", ".venv", "Scripts", "python.exe")
      : path.join(this.projectRoot, "backend", ".venv", "bin", "python");

    if (fs.existsSync(venvPython)) {
      return venvPython;
    }

    // 4. Fall back to system python in PATH
    return isWindows ? "python" : "python3";
  }

  /**
   * Spawn the Python server child process and establish stdio JSON-RPC communication.
   */
  public async start(): Promise<void> {
    if (this.process && this.isConnected) {
      return;
    }

    const pythonExe = this.resolvePythonExecutable();
    const isPackaged = app && app.isPackaged;
    const workingDir = isPackaged
      ? path.join(process.resourcesPath, "backend")
      : this.projectRoot;

    const childEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8",
    };

    if (isPackaged) {
      const backendSrc = path.join(process.resourcesPath, "backend", "src");
      childEnv.PYTHONPATH = backendSrc + (process.env.PYTHONPATH ? path.delimiter + process.env.PYTHONPATH : "");

      const packagedFfmpeg = path.join(process.resourcesPath, "bin", "ffmpeg.exe");
      const packagedFfprobe = path.join(process.resourcesPath, "bin", "ffprobe.exe");
      if (fs.existsSync(packagedFfmpeg)) {
        childEnv.FFMPEG_PATH = packagedFfmpeg;
      }
      if (fs.existsSync(packagedFfprobe)) {
        childEnv.FFPROBE_PATH = packagedFfprobe;
      }
    }

    console.log(`[python-bridge] Launching Python engine using: ${pythonExe} (cwd: ${workingDir})`);

    return new Promise<void>((resolve, reject) => {
      let startupResolved = false;

      try {
        this.process = spawn(pythonExe, ["-m", "xakumedia.server"], {
          cwd: workingDir,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
          env: childEnv,
        });
      } catch (err) {
        this.lastError = `Failed to spawn Python process: ${err}`;
        reject(new Error(this.lastError));
        return;
      }

      const pid = this.process.pid;
      console.log(`[python-bridge] Python process spawned with PID: ${pid}`);

      // Handle standard error stream for engine logs
      this.process.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) {
          console.log(`[python-engine] ${text}`);
        }
      });

      // Handle standard output stream line-by-line via readline
      if (this.process.stdout) {
        const rl = readline.createInterface({
          input: this.process.stdout,
          crlfDelay: Infinity,
        });

        rl.on("line", (line: string) => {
          this.handleStdoutLine(line);
        });
      }

      this.process.on("error", (err: Error) => {
        console.error(`[python-bridge] Child process error: ${err.message}`);
        this.lastError = err.message;
        this.cleanupPendingRequests(new Error(`Python process error: ${err.message}`));
        if (!startupResolved) {
          startupResolved = true;
          reject(err);
        }
      });

      this.process.on("exit", (code: number | null, signal: string | null) => {
        console.log(
          `[python-bridge] Python engine exited with code: ${code}, signal: ${signal}`
        );
        this.isConnected = false;
        this.process = null;
        this.cleanupPendingRequests(
          new Error(`Python process exited with code ${code}`)
        );
      });

      // Send initial ping to verify readiness
      const startupTimer = setTimeout(() => {
        if (!startupResolved) {
          startupResolved = true;
          this.lastError = "Python engine startup probe timed out";
          reject(new Error(this.lastError));
        }
      }, 8000);

      this.sendRequest<PythonPingResult>("ping")
        .then(async (pingResult) => {
          this.isConnected = true;
          console.log(
            `[python-bridge] Python engine verified: ${pingResult.version} (${pingResult.message})`
          );
          // Pre-fetch system info
          try {
            this.cachedSystemInfo = await this.sendRequest<PythonSystemInfoResult>(
              "get_system_info"
            );
          } catch (e) {
            console.warn(`[python-bridge] Could not fetch system info on startup: ${e}`);
          }

          if (!startupResolved) {
            startupResolved = true;
            clearTimeout(startupTimer);
            resolve();
          }
        })
        .catch((err) => {
          if (!startupResolved) {
            startupResolved = true;
            clearTimeout(startupTimer);
            this.lastError = `Initial ping failed: ${err.message}`;
            reject(err);
          }
        });
    });
  }

  /**
   * Process a parsed line received from Python's standard output.
   */
  private handleStdoutLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let message: JsonRpcMessage;
    try {
      message = JSON.parse(trimmed) as JsonRpcMessage;
    } catch (err) {
      console.warn(`[python-bridge] Invalid JSON line received: ${trimmed} (${err})`);
      return;
    }

    // Correlate response with pending request by ID
    if (message.id !== undefined && message.id !== null) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (message.method) {
      // Async one-way notification from Python engine
      for (const listener of this.notificationListeners) {
        try {
          listener(message.method, (message.params as Record<string, unknown>) || {});
        } catch (err) {
          console.error(
            `[python-bridge] Notification listener error for ${message.method}:`,
            err
          );
        }
      }
    }
  }

  /**
   * Subscribe to one-way JSON-RPC notifications from the Python engine.
   */
  public onNotification(
    listener: (method: string, params: Record<string, unknown>) => void
  ): () => void {
    this.notificationListeners.push(listener);
    return () => {
      this.notificationListeners = this.notificationListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Send a JSON-RPC 2.0 request to the Python process and await the response.
   */
  public sendRequest<T>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 15000
  ): Promise<T> {
    if (!this.process || this.process.killed) {
      return Promise.reject(new Error("Python engine process is not running"));
    }

    const id = ++this.requestCounter;
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new Error(`Request '${method}' (id: ${id}) timed out after ${timeoutMs}ms`)
        );
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: resolve as (val: unknown) => void,
        reject,
        timer,
      });

      try {
        this.process?.stdin?.write(payload + "\n");
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  /**
   * Stop the Python child process gracefully, falling back to SIGKILL.
   */
  public async stop(): Promise<void> {
    if (!this.process) return;

    this.cleanupPendingRequests(new Error("Python bridge is shutting down"));

    return new Promise<void>((resolve) => {
      const proc = this.process;
      if (!proc) {
        resolve();
        return;
      }

      const killTimeout = setTimeout(() => {
        if (proc && !proc.killed) {
          console.warn("[python-bridge] Forcing Python engine shutdown with kill()");
          proc.kill("SIGKILL");
        }
        resolve();
      }, 2000);

      proc.once("exit", () => {
        clearTimeout(killTimeout);
        this.process = null;
        this.isConnected = false;
        resolve();
      });

      // Closing stdin prompts the Python loop's clean exit
      try {
        proc.stdin?.end();
      } catch {
        proc.kill();
      }
    });
  }

  /**
   * Returns current status information for diagnostics and UI.
   */
  public getStatus(): PythonBridgeStatus {
    return {
      connected: this.isConnected && Boolean(this.process && !this.process.killed),
      pid: this.process?.pid ?? null,
      error: this.lastError,
      info: this.cachedSystemInfo,
    };
  }

  private cleanupPendingRequests(reason: Error): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(reason);
    }
    this.pendingRequests.clear();
  }
}
