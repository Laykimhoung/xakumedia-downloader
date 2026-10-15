/**
 * Shared types and IPC interface contracts between Electron Main, Preload, and Renderer.
 */

export interface SystemInfo {
  version: string;
  platform: string;
  arch: string;
}

export interface PythonPingResult {
  status: string;
  message: string;
  version: string;
  timestamp: string;
}

export interface PythonSystemInfoResult {
  engine_version: string;
  python_version: string;
  python_executable: string;
  platform: string;
  system: string;
  machine: string;
  data_dir: string;
  cache_dir: string;
  download_dir: string;
}

export interface PythonBridgeStatus {
  connected: boolean;
  pid: number | null;
  error?: string;
  info?: PythonSystemInfoResult;
}

export interface DesktopApi {
  /**
   * Simple connectivity probe between renderer and Electron main process.
   */
  ping: () => Promise<string>;

  /**
   * Retrieve core application and system runtime information.
   */
  getSystemInfo: () => Promise<SystemInfo>;

  /**
   * Ping the Python engine child process over stdio JSON-RPC.
   */
  pingPython: () => Promise<PythonPingResult>;

  /**
   * Retrieve runtime and environment info from the Python engine.
   */
  getPythonSystemInfo: () => Promise<PythonSystemInfoResult>;

  /**
   * Get current connection status of the Python engine child process.
   */
  getPythonStatus: () => Promise<PythonBridgeStatus>;
}

declare global {
  interface Window {
    api?: DesktopApi;
  }
}
