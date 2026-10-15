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

export interface ClassifiedUrlInfo {
  raw_url: string;
  normalized_url: string;
  category: "direct_image" | "direct_video" | "social_post" | "gallery" | "channel" | "unknown";
  domain?: string | null;
  author_hint?: string | null;
  title_hint?: string | null;
  is_supported: boolean;
  requires_auth?: boolean;
}

export interface MediaFormatInfoPayload {
  format_id: string;
  container?: string | null;
  resolution?: string | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  filesize_bytes?: number | null;
  is_direct_stream: boolean;
  url?: string | null;
}

export interface DiscoveredMediaItem {
  id: string;
  source_url: string;
  original_url: string;
  media_type: "image" | "video" | "audio";
  title?: string | null;
  author: string;
  thumbnail_url?: string | null;
  filesize_bytes?: number | null;
  available_formats: MediaFormatInfoPayload[];
  created_at: string;
}

export interface ClassifyUrlResult {
  classified_url: ClassifiedUrlInfo;
  media_item?: DiscoveredMediaItem | null;
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

  /**
   * Scan and classify a URL, discovering available media for direct streams.
   */
  classifyUrl: (url: string) => Promise<ClassifyUrlResult>;
}

declare global {
  interface Window {
    api?: DesktopApi;
  }
}
