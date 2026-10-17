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
  platform?: string | null;
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
  requires_merge?: boolean;
  format_note?: string | null;
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

export interface ScanHistoryRecord {
  id: string;
  raw_url: string;
  normalized_url: string;
  category: string;
  platform?: string | null;
  domain?: string | null;
  title_hint?: string | null;
  author_hint?: string | null;
  item_count: number;
  is_supported: boolean;
  scanned_at: string;
  preview_thumbnail?: string | null;
}

export interface ScanHistoryResult {
  items: ScanHistoryRecord[];
  count: number;
}

export interface SavedMediaResult {
  items: DiscoveredMediaItem[];
  count: number;
}

export interface ToggleSaveResult {
  id: string;
  is_saved: boolean;
}

export interface ClearScanHistoryResult {
  deleted_count: number;
}

export interface ClassifyUrlResult {
  scan_id?: string | null;
  classified_url: ClassifiedUrlInfo;
  media_item?: DiscoveredMediaItem | null;
  media_items?: DiscoveredMediaItem[];
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

  /**
   * Extract video stream info and formats using yt-dlp.
   */
  extractVideo?: (url: string) => Promise<ClassifyUrlResult>;

  /**
   * Extract gallery or multi-image collection items using gallery-dl.
   */
  extractGallery?: (url: string) => Promise<ClassifyUrlResult>;

  /**
   * Retrieve recent URL scan history records from local SQLite.
   */
  getScanHistory: (limit?: number, offset?: number) => Promise<ScanHistoryResult>;

  /**
   * Retrieve all items discovered in a particular scan event.
   */
  getScanItems: (scanId: string) => Promise<{ items: DiscoveredMediaItem[] }>;

  /**
   * Clear all scan history or a specific scan history entry.
   */
  clearScanHistory: (scanId?: string) => Promise<ClearScanHistoryResult>;

  /**
   * Retrieve bookmarked/saved media library items.
   */
  getSavedMedia: (mediaType?: string, limit?: number, offset?: number) => Promise<SavedMediaResult>;

  /**
   * Bookmark or un-bookmark a media item.
   */
  toggleSaveMedia: (mediaId: string) => Promise<ToggleSaveResult>;

  /**
   * Remove a media item from the database.
   */
  deleteMediaItem: (mediaId: string) => Promise<{ id: string; deleted: boolean }>;
}

declare global {
  interface Window {
    api?: DesktopApi;
  }
}
