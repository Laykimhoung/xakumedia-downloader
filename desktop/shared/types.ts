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

export interface FFmpegInfoResult {
  installed: boolean;
  version?: string | null;
  ffmpeg_path?: string | null;
  ffprobe_path?: string | null;
}

export interface MediaStreamDetail {
  codec?: string | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  channels?: number | null;
  sample_rate?: number | null;
  bitrate?: number | null;
}

export interface InspectMediaResult {
  file_path: string;
  file_name: string;
  format_name?: string | null;
  duration_seconds?: number | null;
  bitrate?: number | null;
  size_bytes?: number | null;
  video_stream?: MediaStreamDetail | null;
  audio_stream?: MediaStreamDetail | null;
}

export interface MergeStreamsResult {
  output_path: string;
  success: boolean;
}

export interface ConvertFormatResult {
  output_path: string;
  success: boolean;
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

export interface QuerySavedMediaParams {
  query?: string;
  media_type?: "all" | "image" | "video" | "audio";
  container?: string;
  sort_by?: "newest" | "oldest" | "title" | "size_desc" | "size_asc";
  limit?: number;
  offset?: number;
}

export interface ThumbnailResult {
  item_id: string;
  thumbnail_path: string;
  cached: boolean;
  size_bytes?: number;
}

export interface ExportMetadataResult {
  media_item: DiscoveredMediaItem;
  download_task?: DownloadTaskRecord | null;
  exported_at: string;
}

export interface DeleteDownloadedMediaResult {
  task_id: string;
  deleted: boolean;
  file_deleted: boolean;
  path?: string | null;
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

export interface ProgressUpdatePayload {
  task_id: string;
  status: "queued" | "downloading" | "merging" | "completed" | "failed" | "cancelled" | "paused";
  bytes_downloaded: number;
  total_bytes?: number | null;
  progress_percent: number;
  speed_bytes_sec: number;
  eta_seconds?: number | null;
  detail_message?: string | null;
}

export interface DownloadTaskRecord {
  id: string;
  media_item: DiscoveredMediaItem;
  status: "queued" | "downloading" | "merging" | "completed" | "failed" | "cancelled" | "paused";
  selected_format?: MediaFormatInfoPayload | null;
  destination_path?: string | null;
  temp_path?: string | null;
  bytes_downloaded: number;
  total_bytes?: number | null;
  progress_percent: number;
  speed_bytes_sec?: number;
  error_message?: string | null;
  retry_count: number;
  created_at: string;
  completed_at?: string | null;
}

export interface StartDownloadResult {
  task: DownloadTaskRecord;
}

export interface CancelDownloadResult {
  task_id: string;
  cancelled: boolean;
}

export interface GetDownloadTasksResult {
  tasks: DownloadTaskRecord[];
  count: number;
}

export interface BatchDownloadItemParam {
  media_item: DiscoveredMediaItem;
  selected_format?: MediaFormatInfoPayload | null;
  destination_path?: string | null;
}

export interface StartBatchDownloadResult {
  tasks: DownloadTaskRecord[];
  count: number;
}

export interface PauseDownloadResult {
  task_id: string;
  paused: boolean;
}

export interface ResumeDownloadResult {
  task_id: string;
  resumed: boolean;
}

export interface PauseAllDownloadsResult {
  paused_count: number;
}

export interface ResumeAllDownloadsResult {
  resumed_count: number;
}

export interface CancelAllDownloadsResult {
  cancelled_count: number;
}

export interface ClearCompletedDownloadsResult {
  cleared_count: number;
}

export interface SetDownloadConcurrencyResult {
  max_concurrent: number;
}

export interface DownloadQueueStateResult {
  max_concurrent: number;
  active_count: number;
  pending_count: number;
  counts: {
    queued: number;
    downloading: number;
    merging: number;
    completed: number;
    failed: number;
    cancelled: number;
    paused: number;
  };
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

  /**
   * Enqueue and begin streaming download for a media item.
   */
  startDownload: (
    mediaItem: DiscoveredMediaItem,
    selectedFormat?: MediaFormatInfoPayload | null,
    destinationPath?: string
  ) => Promise<StartDownloadResult>;

  /**
   * Cancel an active or queued download task.
   */
  cancelDownload: (taskId: string) => Promise<CancelDownloadResult>;

  /**
   * Retrieve download tasks list filtered by status.
   */
  getDownloadTasks: (status?: string, limit?: number) => Promise<GetDownloadTasksResult>;

  /**
   * Subscribe to real-time progress events from the Python downloader.
   */
  onDownloadProgress: (
    callback: (progress: ProgressUpdatePayload) => void
  ) => () => void;

  /**
   * Subscribe to completed task events.
   */
  onDownloadCompleted: (
    callback: (task: DownloadTaskRecord) => void
  ) => () => void;

  /**
   * Start bulk batch download for multiple media items.
   */
  startBatchDownload?: (
    items: BatchDownloadItemParam[],
    targetDir?: string
  ) => Promise<StartBatchDownloadResult>;

  /**
   * Pause an active or queued download task.
   */
  pauseDownload?: (taskId: string) => Promise<PauseDownloadResult>;

  /**
   * Resume a paused download task.
   */
  resumeDownload?: (taskId: string) => Promise<ResumeDownloadResult>;

  /**
   * Pause all active and queued download tasks.
   */
  pauseAllDownloads?: () => Promise<PauseAllDownloadsResult>;

  /**
   * Resume all paused download tasks.
   */
  resumeAllDownloads?: () => Promise<ResumeAllDownloadsResult>;

  /**
   * Cancel all active and queued download tasks.
   */
  cancelAllDownloads?: () => Promise<CancelAllDownloadsResult>;

  /**
   * Clear completed, failed, and cancelled tasks from queue history.
   */
  clearCompletedDownloads?: () => Promise<ClearCompletedDownloadsResult>;

  /**
   * Set maximum active concurrent download workers (1-10).
   */
  setDownloadConcurrency?: (concurrency: number) => Promise<SetDownloadConcurrencyResult>;

  /**
   * Get queue worker metrics and status counts.
   */
  getDownloadQueueState?: () => Promise<DownloadQueueStateResult>;

  /**
   * Subscribe to task paused events.
   */
  onDownloadPaused?: (
    callback: (data: { task_id: string; task?: DownloadTaskRecord }) => void
  ) => () => void;

  /**
   * Subscribe to task resumed events.
   */
  onDownloadResumed?: (
    callback: (data: { task_id: string; task?: DownloadTaskRecord }) => void
  ) => () => void;

  /**
   * Subscribe to queue cleared events.
   */
  onQueueCleared?: (
    callback: (data: { cleared_count: number }) => void
  ) => () => void;

  /**
   * Open downloaded file or folder in Windows File Explorer.
   */
  openPath?: (targetPath: string) => Promise<void>;

  /**
   * Check if FFmpeg and FFprobe binaries are installed and accessible.
   */
  getFFmpegInfo: () => Promise<FFmpegInfoResult>;

  /**
   * Probe and inspect technical metadata of a local audio/video file using ffprobe.
   */
  inspectMedia?: (filePath: string) => Promise<InspectMediaResult>;

  /**
   * Multiplex separate video and audio files into a single merged container.
   */
  mergeStreams?: (
    videoPath: string,
    audioPath: string,
    outputPath: string,
    outputContainer?: string
  ) => Promise<MergeStreamsResult>;

  /**
   * Convert container or re-package media format using stream copying or transcoding.
   */
  convertFormat?: (
    inputPath: string,
    outputPath: string,
    targetFormat?: string
  ) => Promise<ConvertFormatResult>;

  /**
   * Search, filter, and sort bookmarked media items in the media library.
   */
  querySavedMedia?: (params?: QuerySavedMediaParams) => Promise<SavedMediaResult>;

  /**
   * Generate or retrieve a cached thumbnail for a local media file using Pillow or FFmpeg.
   */
  generateThumbnail?: (
    sourcePath: string,
    itemId: string,
    mediaType?: string,
    forceRegenerate?: boolean,
    timestampSec?: number
  ) => Promise<ThumbnailResult>;

  /**
   * Export comprehensive metadata and download task history for a media item as JSON.
   */
  exportMediaMetadata?: (mediaId: string) => Promise<ExportMetadataResult>;

  /**
   * Remove a download task and optionally delete its associated file from local disk.
   */
  deleteDownloadedMedia?: (
    taskId: string,
    deleteFileFromDisk?: boolean
  ) => Promise<DeleteDownloadedMediaResult>;

  /**
   * Convert local Windows file path to media-loader:// URL for in-app media playback & previews.
   */
  toMediaLoaderUrl?: (localPath: string) => string;
}

declare global {
  interface Window {
    api?: DesktopApi;
  }
}
