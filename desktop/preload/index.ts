import { contextBridge, ipcRenderer } from "electron";
import type {
  AppPreferences,
  BatchDownloadItemParam,
  CancelAllDownloadsResult,
  CancelDownloadResult,
  ClassifyUrlResult,
  ClearCompletedDownloadsResult,
  ClearScanHistoryResult,
  ConvertFormatResult,
  DeleteDownloadedMediaResult,
  DesktopApi,
  DiscoveredMediaItem,
  DownloadQueueStateResult,
  DownloadTaskRecord,
  ExportMetadataResult,
  FFmpegInfoResult,
  GetDownloadTasksResult,
  InspectMediaResult,
  MediaFormatInfoPayload,
  MergeStreamsResult,
  PauseAllDownloadsResult,
  PauseDownloadResult,
  ProgressUpdatePayload,
  PythonBridgeStatus,
  PythonPingResult,
  PythonSystemInfoResult,
  QuerySavedMediaParams,
  RecoverySummary,
  ResumeAllDownloadsResult,
  ResumeDownloadResult,
  SavedMediaResult,
  ScanHistoryResult,
  SetDownloadConcurrencyResult,
  StartBatchDownloadResult,
  StartDownloadResult,
  SystemInfo,
  ThumbnailResult,
  ToggleSaveResult,
} from "../shared/types";

/**
 * Validated desktop bridge exposed to the renderer under window.api.
 *
 * Security Principles:
 * 1. Never expose raw ipcRenderer to the renderer.
 * 2. Only expose explicitly whitelisted, parameterized asynchronous functions.
 * 3. Keep nodeIntegration: false and contextIsolation: true in the main process.
 */
const api: DesktopApi = {
  ping: async (): Promise<string> => {
    return ipcRenderer.invoke("app:ping");
  },
  getSystemInfo: async (): Promise<SystemInfo> => {
    return ipcRenderer.invoke("app:getSystemInfo");
  },
  pingPython: async (): Promise<PythonPingResult> => {
    return ipcRenderer.invoke("python:ping");
  },
  getPythonSystemInfo: async (): Promise<PythonSystemInfoResult> => {
    return ipcRenderer.invoke("python:getSystemInfo");
  },
  getPythonStatus: async (): Promise<PythonBridgeStatus> => {
    return ipcRenderer.invoke("python:getStatus");
  },
  classifyUrl: async (url: string): Promise<ClassifyUrlResult> => {
    return ipcRenderer.invoke("python:classifyUrl", url);
  },
  extractVideo: async (url: string): Promise<ClassifyUrlResult> => {
    return ipcRenderer.invoke("python:extractVideo", url);
  },
  extractGallery: async (url: string): Promise<ClassifyUrlResult> => {
    return ipcRenderer.invoke("python:extractGallery", url);
  },
  getScanHistory: async (limit?: number, offset?: number): Promise<ScanHistoryResult> => {
    return ipcRenderer.invoke("python:getScanHistory", limit, offset);
  },
  getScanItems: async (scanId: string): Promise<{ items: DiscoveredMediaItem[] }> => {
    return ipcRenderer.invoke("python:getScanItems", scanId);
  },
  clearScanHistory: async (scanId?: string): Promise<ClearScanHistoryResult> => {
    return ipcRenderer.invoke("python:clearScanHistory", scanId);
  },
  getSavedMedia: async (mediaType?: string, limit?: number, offset?: number): Promise<SavedMediaResult> => {
    return ipcRenderer.invoke("python:getSavedMedia", mediaType, limit, offset);
  },
  toggleSaveMedia: async (mediaId: string): Promise<ToggleSaveResult> => {
    return ipcRenderer.invoke("python:toggleSaveMedia", mediaId);
  },
  deleteMediaItem: async (mediaId: string): Promise<{ id: string; deleted: boolean }> => {
    return ipcRenderer.invoke("python:deleteMediaItem", mediaId);
  },
  startDownload: async (
    mediaItem: DiscoveredMediaItem,
    selectedFormat?: MediaFormatInfoPayload | null,
    destinationPath?: string
  ): Promise<StartDownloadResult> => {
    return ipcRenderer.invoke(
      "python:startDownload",
      mediaItem,
      selectedFormat,
      destinationPath
    );
  },
  cancelDownload: async (taskId: string): Promise<CancelDownloadResult> => {
    return ipcRenderer.invoke("python:cancelDownload", taskId);
  },
  getDownloadTasks: async (
    status?: string,
    limit?: number
  ): Promise<GetDownloadTasksResult> => {
    return ipcRenderer.invoke("python:getDownloadTasks", status, limit);
  },
  onDownloadProgress: (
    callback: (progress: ProgressUpdatePayload) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: ProgressUpdatePayload
    ) => callback(data);
    ipcRenderer.on("download:progress", handler);
    return () => {
      ipcRenderer.removeListener("download:progress", handler);
    };
  },
  onDownloadCompleted: (
    callback: (task: DownloadTaskRecord) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: DownloadTaskRecord
    ) => callback(data);
    ipcRenderer.on("download:completed", handler);
    return () => {
      ipcRenderer.removeListener("download:completed", handler);
    };
  },
  startBatchDownload: async (
    items: BatchDownloadItemParam[],
    targetDir?: string
  ): Promise<StartBatchDownloadResult> => {
    return ipcRenderer.invoke("python:startBatchDownload", items, targetDir);
  },
  pauseDownload: async (taskId: string): Promise<PauseDownloadResult> => {
    return ipcRenderer.invoke("python:pauseDownload", taskId);
  },
  resumeDownload: async (taskId: string): Promise<ResumeDownloadResult> => {
    return ipcRenderer.invoke("python:resumeDownload", taskId);
  },
  pauseAllDownloads: async (): Promise<PauseAllDownloadsResult> => {
    return ipcRenderer.invoke("python:pauseAllDownloads");
  },
  resumeAllDownloads: async (): Promise<ResumeAllDownloadsResult> => {
    return ipcRenderer.invoke("python:resumeAllDownloads");
  },
  cancelAllDownloads: async (): Promise<CancelAllDownloadsResult> => {
    return ipcRenderer.invoke("python:cancelAllDownloads");
  },
  clearCompletedDownloads: async (): Promise<ClearCompletedDownloadsResult> => {
    return ipcRenderer.invoke("python:clearCompletedDownloads");
  },
  setDownloadConcurrency: async (
    concurrency: number
  ): Promise<SetDownloadConcurrencyResult> => {
    return ipcRenderer.invoke("python:setDownloadConcurrency", concurrency);
  },
  setSpeedLimit: async (
    speedLimitKbps: number
  ): Promise<{ speed_limit_kbps: number }> => {
    return ipcRenderer.invoke("python:setSpeedLimit", speedLimitKbps);
  },
  getSpeedLimit: async (): Promise<{ speed_limit_kbps: number }> => {
    return ipcRenderer.invoke("python:getSpeedLimit");
  },
  getDownloadQueueState: async (): Promise<DownloadQueueStateResult> => {
    return ipcRenderer.invoke("python:getDownloadQueueState");
  },
  onDownloadPaused: (
    callback: (data: { task_id: string; task?: DownloadTaskRecord }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { task_id: string; task?: DownloadTaskRecord }
    ) => callback(data);
    ipcRenderer.on("download:paused", handler);
    return () => {
      ipcRenderer.removeListener("download:paused", handler);
    };
  },
  onDownloadResumed: (
    callback: (data: { task_id: string; task?: DownloadTaskRecord }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { task_id: string; task?: DownloadTaskRecord }
    ) => callback(data);
    ipcRenderer.on("download:resumed", handler);
    return () => {
      ipcRenderer.removeListener("download:resumed", handler);
    };
  },
  onQueueCleared: (
    callback: (data: { cleared_count: number }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { cleared_count: number }
    ) => callback(data);
    ipcRenderer.on("queue_cleared", handler);
    return () => {
      ipcRenderer.removeListener("queue_cleared", handler);
    };
  },
  recoverInterruptedTasks: async (autoResume?: boolean): Promise<RecoverySummary> => {
    return ipcRenderer.invoke("python:recoverInterruptedTasks", autoResume);
  },
  onRecoveryCompleted: (
    callback: (summary: RecoverySummary) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      summary: RecoverySummary
    ) => callback(summary);
    ipcRenderer.on("download:recovery_completed", handler);
    return () => {
      ipcRenderer.removeListener("download:recovery_completed", handler);
    };
  },
  openPath: async (targetPath: string): Promise<void> => {
    return ipcRenderer.invoke("app:openPath", targetPath);
  },
  getFFmpegInfo: async (): Promise<FFmpegInfoResult> => {
    return ipcRenderer.invoke("python:getFFmpegInfo");
  },
  inspectMedia: async (filePath: string): Promise<InspectMediaResult> => {
    return ipcRenderer.invoke("python:inspectMedia", filePath);
  },
  mergeStreams: async (
    videoPath: string,
    audioPath: string,
    outputPath: string,
    outputContainer?: string
  ): Promise<MergeStreamsResult> => {
    return ipcRenderer.invoke(
      "python:mergeStreams",
      videoPath,
      audioPath,
      outputPath,
      outputContainer
    );
  },
  convertFormat: async (
    inputPath: string,
    outputPath: string,
    targetFormat?: string
  ): Promise<ConvertFormatResult> => {
    return ipcRenderer.invoke(
      "python:convertFormat",
      inputPath,
      outputPath,
      targetFormat
    );
  },
  querySavedMedia: async (params?: QuerySavedMediaParams): Promise<SavedMediaResult> => {
    return ipcRenderer.invoke("python:querySavedMedia", params);
  },
  generateThumbnail: async (
    sourcePath: string,
    itemId: string,
    mediaType?: string,
    forceRegenerate?: boolean,
    timestampSec?: number
  ): Promise<ThumbnailResult> => {
    return ipcRenderer.invoke(
      "python:generateThumbnail",
      sourcePath,
      itemId,
      mediaType,
      forceRegenerate,
      timestampSec
    );
  },
  exportMediaMetadata: async (mediaId: string): Promise<ExportMetadataResult> => {
    return ipcRenderer.invoke("python:exportMediaMetadata", mediaId);
  },
  deleteDownloadedMedia: async (
    taskId: string,
    deleteFileFromDisk?: boolean
  ): Promise<DeleteDownloadedMediaResult> => {
    return ipcRenderer.invoke("python:deleteDownloadedMedia", taskId, deleteFileFromDisk);
  },
  toMediaLoaderUrl: (localPath: string): string => {
    if (!localPath) return "";
    const normalized = localPath.replace(/\\/g, "/");
    return `media-loader://local/${normalized.startsWith("/") ? normalized.slice(1) : normalized}`;
  },
  getPreferences: async (): Promise<AppPreferences> => {
    return ipcRenderer.invoke("preferences:get");
  },
  updatePreferences: async (preferences: Partial<AppPreferences>): Promise<AppPreferences> => {
    return ipcRenderer.invoke("preferences:update", preferences);
  },
  resetPreferences: async (): Promise<AppPreferences> => {
    return ipcRenderer.invoke("preferences:reset");
  },
  selectFolder: async (defaultPath?: string): Promise<string | null> => {
    return ipcRenderer.invoke("dialog:selectFolder", defaultPath);
  },
};

contextBridge.exposeInMainWorld("api", api);

