import { contextBridge, ipcRenderer } from "electron";
import type {
  CancelDownloadResult,
  ClassifyUrlResult,
  ClearScanHistoryResult,
  ConvertFormatResult,
  DeleteDownloadedMediaResult,
  DesktopApi,
  DiscoveredMediaItem,
  DownloadTaskRecord,
  ExportMetadataResult,
  FFmpegInfoResult,
  GetDownloadTasksResult,
  InspectMediaResult,
  MediaFormatInfoPayload,
  MergeStreamsResult,
  ProgressUpdatePayload,
  PythonBridgeStatus,
  PythonPingResult,
  PythonSystemInfoResult,
  QuerySavedMediaParams,
  SavedMediaResult,
  ScanHistoryResult,
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
};

contextBridge.exposeInMainWorld("api", api);

