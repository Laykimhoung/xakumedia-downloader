import { contextBridge, ipcRenderer } from "electron";
import type {
  ClassifyUrlResult,
  ClearScanHistoryResult,
  DesktopApi,
  DiscoveredMediaItem,
  PythonBridgeStatus,
  PythonPingResult,
  PythonSystemInfoResult,
  SavedMediaResult,
  ScanHistoryResult,
  SystemInfo,
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
};

contextBridge.exposeInMainWorld("api", api);

