import { contextBridge, ipcRenderer } from "electron";
import type {
  ClassifyUrlResult,
  DesktopApi,
  PythonBridgeStatus,
  PythonPingResult,
  PythonSystemInfoResult,
  SystemInfo,
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
};

contextBridge.exposeInMainWorld("api", api);
