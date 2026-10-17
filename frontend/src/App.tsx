import React, { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Search,
  FolderArchive,
  Download,
  Bookmark,
  History,
  Settings,
  ShieldCheck,
  Radio,
  ExternalLink,
  Film,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Layers,
  Trash2,
  RefreshCw,
  Eye,
  FolderOpen,
  XCircle,
  RotateCcw,
} from "lucide-react";
import type {
  ClassifyUrlResult,
  DiscoveredMediaItem,
  DownloadTaskRecord,
  MediaFormatInfoPayload,
  ProgressUpdatePayload,
  PythonBridgeStatus,
  PythonPingResult,
  ScanHistoryRecord,
  SystemInfo,
} from "../../desktop/shared/types";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("scan");
  const [ipcStatus, setIpcStatus] = useState<string>("Checking IPC...");
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [pythonStatus, setPythonStatus] = useState<PythonBridgeStatus | null>(null);
  const [pythonPing, setPythonPing] = useState<PythonPingResult | null>(null);
  const [pythonLatency, setPythonLatency] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [urlInput, setUrlInput] = useState<string>("");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<ClassifyUrlResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // SQLite Persistence State (Media Library & Scan History)
  const [savedMediaItems, setSavedMediaItems] = useState<DiscoveredMediaItem[]>([]);
  const [savedMediaLoading, setSavedMediaLoading] = useState<boolean>(false);
  const [savedMediaFilter, setSavedMediaFilter] = useState<"all" | "image" | "video" | "audio">("all");
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  const [scanHistory, setScanHistory] = useState<ScanHistoryRecord[]>([]);
  const [scanHistoryLoading, setScanHistoryLoading] = useState<boolean>(false);
  const [selectedScanDetail, setSelectedScanDetail] = useState<{
    scan: ScanHistoryRecord;
    items: DiscoveredMediaItem[];
    loading: boolean;
  } | null>(null);

  // Download Manager State
  const [downloadTasks, setDownloadTasks] = useState<DownloadTaskRecord[]>([]);
  const [downloadTasksLoading, setDownloadTasksLoading] = useState<boolean>(false);
  const [downloadFilter, setDownloadFilter] = useState<"all" | "active" | "completed" | "failed">("all");
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [activeTaskCount, setActiveTaskCount] = useState<number>(0);

  const formatBytes = (bytes?: number | null): string => {
    if (!bytes) return "Unknown size";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatSpeed = (bytesSec?: number | null): string => {
    if (!bytesSec || bytesSec <= 0) return "0 B/s";
    return `${formatBytes(bytesSec)}/s`;
  };

  const formatEta = (seconds?: number | null): string => {
    if (seconds === undefined || seconds === null || seconds < 0) return "—";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const fetchSavedMedia = async (filter?: "all" | "image" | "video" | "audio") => {
    if (!window.api?.getSavedMedia) return;
    setSavedMediaLoading(true);
    try {
      const typeParam = filter && filter !== "all" ? filter : undefined;
      const res = await window.api.getSavedMedia(typeParam);
      setSavedMediaItems(res.items || []);
      if (!typeParam) {
        setBookmarkedIds(new Set((res.items || []).map((i) => i.id)));
      }
    } catch (err) {
      console.error("Failed to load saved media:", err);
    } finally {
      setSavedMediaLoading(false);
    }
  };

  const fetchScanHistory = async () => {
    if (!window.api?.getScanHistory) return;
    setScanHistoryLoading(true);
    try {
      const res = await window.api.getScanHistory(50, 0);
      setScanHistory(res.items || []);
    } catch (err) {
      console.error("Failed to load scan history:", err);
    } finally {
      setScanHistoryLoading(false);
    }
  };

  const handleToggleBookmark = async (item: DiscoveredMediaItem) => {
    if (!window.api?.toggleSaveMedia) return;
    try {
      const res = await window.api.toggleSaveMedia(item.id);
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        if (res.is_saved) {
          next.add(item.id);
        } else {
          next.delete(item.id);
        }
        return next;
      });
      if (activeTab === "library" || activeTab === "saved") {
        await fetchSavedMedia(savedMediaFilter);
      }
    } catch (err) {
      console.error("Failed to toggle bookmark:", err);
    }
  };

  const handleDeleteSavedMedia = async (mediaId: string) => {
    if (!window.api?.deleteMediaItem) return;
    try {
      await window.api.deleteMediaItem(mediaId);
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        next.delete(mediaId);
        return next;
      });
      setSavedMediaItems((prev) => prev.filter((i) => i.id !== mediaId));
    } catch (err) {
      console.error("Failed to delete media item:", err);
    }
  };

  const handleClearHistory = async () => {
    if (!window.api?.clearScanHistory) return;
    try {
      await window.api.clearScanHistory();
      setScanHistory([]);
      setSelectedScanDetail(null);
    } catch (err) {
      console.error("Failed to clear scan history:", err);
    }
  };

  const handleInspectScan = async (scan: ScanHistoryRecord) => {
    if (!window.api?.getScanItems) return;
    setSelectedScanDetail({ scan, items: [], loading: true });
    try {
      const res = await window.api.getScanItems(scan.id);
      setSelectedScanDetail({ scan, items: res.items || [], loading: false });
    } catch (err) {
      console.error("Failed to fetch scan items:", err);
      setSelectedScanDetail(null);
    }
  };

  const handleScanUrlWith = async (urlToScan: string) => {
    if (!urlToScan.trim() || isScanning) return;

    setIsScanning(true);
    setScanError(null);
    setScanResult(null);

    if (!window.api?.classifyUrl) {
      setScanError("Desktop API bridge is not available in browser mode.");
      setIsScanning(false);
      return;
    }

    try {
      const res = await window.api.classifyUrl(urlToScan.trim());
      setScanResult(res);
      if (!res.classified_url.is_supported) {
        setScanError(
          `The target URL (${res.classified_url.category}) could not be resolved by direct detection, yt-dlp, or gallery-dl.`
        );
      }
      // Scan event is automatically saved in SQLite repository
      fetchScanHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setScanError(msg);
    } finally {
      setIsScanning(false);
    }
  };

  const handleScanUrl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await handleScanUrlWith(urlInput);
  };

  const handleReScan = (url: string) => {
    setUrlInput(url);
    setActiveTab("scan");
    handleScanUrlWith(url);
  };

  const fetchDownloadTasks = async () => {
    if (!window.api?.getDownloadTasks) return;
    setDownloadTasksLoading(true);
    try {
      const res = await window.api.getDownloadTasks();
      setDownloadTasks(res.tasks || []);
    } catch (err) {
      console.error("Failed to load download tasks:", err);
    } finally {
      setDownloadTasksLoading(false);
    }
  };

  const handleStartDownload = async (
    item: DiscoveredMediaItem,
    format?: MediaFormatInfoPayload | null
  ) => {
    if (!window.api?.startDownload) return;
    setDownloadingIds((prev) => new Set(prev).add(item.id));
    try {
      const res = await window.api.startDownload(item, format);
      setDownloadTasks((prev) => {
        const filtered = prev.filter((t) => t.id !== res.task.id);
        return [res.task, ...filtered];
      });
      setActiveTab("downloads");
    } catch (err) {
      console.error("Failed to start download:", err);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleCancelDownload = async (taskId: string) => {
    if (!window.api?.cancelDownload) return;
    try {
      await window.api.cancelDownload(taskId);
      setDownloadTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: "cancelled" } : t))
      );
    } catch (err) {
      console.error("Failed to cancel download:", err);
    }
  };

  const handleOpenFileOrFolder = async (targetPath?: string | null) => {
    if (!targetPath || !window.api?.openPath) return;
    try {
      await window.api.openPath(targetPath);
    } catch (err) {
      console.error("Failed to open target path:", err);
    }
  };

  const pingPythonEngine = async () => {
    if (!window.api?.pingPython) return;
    setIsPinging(true);
    const start = performance.now();
    try {
      const res = await window.api.pingPython();
      const elapsed = Math.round(performance.now() - start);
      setPythonPing(res);
      setPythonLatency(elapsed);
    } catch (err) {
      console.error("Python ping failed:", err);
    } finally {
      setIsPinging(false);
    }
  };

  useEffect(() => {
    async function checkDesktopBridge() {
      if (window.api) {
        try {
          const pong = await window.api.ping();
          const info = await window.api.getSystemInfo();
          setIpcStatus(`IPC Connected (${pong})`);
          setSystemInfo(info);

          if (window.api.getPythonStatus) {
            const pyStatus = await window.api.getPythonStatus();
            setPythonStatus(pyStatus);
          }

          // Initialize bookmarks
          if (window.api.getSavedMedia) {
            try {
              const saved = await window.api.getSavedMedia();
              setBookmarkedIds(new Set((saved.items || []).map((i) => i.id)));
            } catch (err) {
              console.warn("Could not load initial saved media:", err);
            }
          }

          // Initialize downloads list
          if (window.api.getDownloadTasks) {
            try {
              const dls = await window.api.getDownloadTasks();
              setDownloadTasks(dls.tasks || []);
            } catch (err) {
              console.warn("Could not load initial download tasks:", err);
            }
          }

          await pingPythonEngine();
        } catch (err) {
          setIpcStatus(`IPC Error: ${String(err)}`);
        }
      } else {
        setIpcStatus("Browser Dev Mode (window.api unavailable)");
      }
    }

    checkDesktopBridge();
  }, []);

  // Update active task count
  useEffect(() => {
    const active = downloadTasks.filter(
      (t) => t.status === "downloading" || t.status === "queued" || t.status === "merging"
    ).length;
    setActiveTaskCount(active);
  }, [downloadTasks]);

  // Real-time JSON-RPC Progress & Completion Event Listeners
  useEffect(() => {
    if (!window.api?.onDownloadProgress) return;

    const unsubProgress = window.api.onDownloadProgress((payload: ProgressUpdatePayload) => {
      setDownloadTasks((prev) => {
        const exists = prev.some((t) => t.id === payload.task_id);
        if (!exists) {
          fetchDownloadTasks();
          return prev;
        }
        return prev.map((t) =>
          t.id === payload.task_id
            ? {
                ...t,
                status: payload.status,
                bytes_downloaded: payload.bytes_downloaded,
                total_bytes: payload.total_bytes ?? t.total_bytes,
                progress_percent: payload.progress_percent,
                speed_bytes_sec: payload.speed_bytes_sec,
                eta_seconds: payload.eta_seconds,
                error_message: payload.detail_message ?? t.error_message,
              }
            : t
        );
      });
    });

    const unsubCompleted = window.api.onDownloadCompleted?.((completedTask: DownloadTaskRecord) => {
      setDownloadTasks((prev) => {
        const exists = prev.some((t) => t.id === completedTask.id);
        if (exists) {
          return prev.map((t) => (t.id === completedTask.id ? completedTask : t));
        }
        return [completedTask, ...prev];
      });
    });

    return () => {
      unsubProgress?.();
      unsubCompleted?.();
    };
  }, []);

  useEffect(() => {
    if (activeTab === "library" || activeTab === "saved") {
      fetchSavedMedia(savedMediaFilter);
    } else if (activeTab === "history") {
      fetchScanHistory();
    } else if (activeTab === "downloads") {
      fetchDownloadTasks();
    }
  }, [activeTab, savedMediaFilter]);

  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "scan", label: "Scan Media", icon: Search },
    { id: "library", label: "Media Library", icon: FolderArchive },
    { id: "downloads", label: "Downloads", icon: Download },
    { id: "saved", label: "Saved Sources", icon: Bookmark },
    { id: "history", label: "Scan History", icon: History },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen w-screen bg-brand-black text-brand-white select-none overflow-hidden font-sans">
      {/* Persistent Left Sidebar */}
      <aside className="w-64 border-r border-brand-dark bg-brand-black/90 flex flex-col justify-between p-4">
        <div>
          {/* Identity Header */}
          <div className="flex items-center space-x-3 px-2 py-3 mb-6">
            <div className="h-4 w-4 rounded-full bg-brand-red shadow-sm shadow-brand-red/50 animate-pulse" />
            <div>
              <span className="font-extrabold tracking-wider text-sm uppercase text-brand-white">
                XakuMedia
              </span>
              <span className="block text-[10px] text-neutral-400 font-mono tracking-widest uppercase">
                by XAKURAII
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-all ${
                    isActive
                      ? "bg-brand-red text-white shadow-md shadow-brand-red/20 font-semibold"
                      : "text-neutral-400 hover:text-brand-white hover:bg-brand-dark/50"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.id === "downloads" && activeTaskCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white text-brand-red animate-pulse">
                      {activeTaskCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Runtime Diagnostics Footer */}
        <div className="border-t border-brand-dark/80 pt-4 px-2 space-y-2 text-xs font-mono text-neutral-400">
          <div className="flex items-center space-x-2 text-[11px]">
            <Radio
              className={`h-3 w-3 ${
                window.api ? "text-emerald-500" : "text-amber-500"
              }`}
            />
            <span className="truncate">{ipcStatus}</span>
          </div>
          <div className="flex items-center space-x-2 text-[11px]">
            <Radio
              className={`h-3 w-3 ${
                pythonStatus?.connected ? "text-emerald-500" : "text-amber-500"
              }`}
            />
            <span className="truncate">
              {pythonStatus?.connected
                ? `Python Engine (PID: ${pythonStatus.pid})`
                : "Python: Connecting..."}
            </span>
          </div>
          {systemInfo && (
            <div className="text-[10px] text-neutral-400">
              Platform: {systemInfo.platform} ({systemInfo.arch}) · v
              {systemInfo.version}
            </div>
          )}
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main className="flex-1 flex flex-col bg-brand-black/50 overflow-hidden">
        {/* Top App Header */}
        <header className="h-14 border-b border-brand-dark flex items-center justify-between px-8 bg-brand-black/30">
          <div className="flex items-center space-x-2">
            <span className="text-xs uppercase tracking-wider text-neutral-400 font-mono">
              Milestone 10 / Basic Download Manager & Streaming
            </span>
          </div>
          <div className="flex items-center space-x-4">
            {activeTaskCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("downloads")}
                className="flex items-center space-x-2 text-xs text-brand-red bg-red-950/40 hover:bg-red-900/50 px-3 py-1 rounded-full border border-red-800/60 transition-colors"
              >
                <span className="h-2 w-2 rounded-full bg-brand-red animate-ping" />
                <span className="font-mono font-medium">
                  {activeTaskCount} Active {activeTaskCount === 1 ? "Download" : "Downloads"}
                </span>
              </button>
            )}
            <div className="flex items-center space-x-1.5 text-xs text-neutral-300 bg-brand-dark/60 px-3 py-1 rounded-full border border-brand-dark">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Context Isolation Active</span>
            </div>
            {pythonStatus?.connected && (
              <div className="flex items-center space-x-1.5 text-xs text-emerald-300 bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-800/50">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Python Stdio IPC Online</span>
              </div>
            )}
          </div>
        </header>

        {/* Main View Content */}
        <div className="flex-1 p-8 overflow-y-auto">
          {activeTab === "scan" && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-brand-white">
                  Scan Media
                </h1>
                <p className="text-sm text-neutral-400 mt-1">
                  Discover, preview, and classify direct images and video streams from URLs.
                </p>
              </div>

              {/* URL Input Form */}
              <div className="bg-brand-dark/40 border border-brand-dark p-5 rounded-xl shadow-lg space-y-4">
                <form onSubmit={handleScanUrl} className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="Paste direct media, video, or gallery URL (e.g. YouTube, Vimeo, Imgur, ArtStation, .mp4, .jpg)..."
                      className="w-full bg-brand-black/80 border border-brand-dark rounded-lg px-4 py-3 text-sm text-brand-white placeholder-neutral-400 focus:outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!urlInput.trim() || isScanning}
                    className={`px-6 py-3 rounded-lg text-sm font-medium flex items-center space-x-2 transition-all ${
                      urlInput.trim() && !isScanning
                        ? "bg-brand-red text-white hover:bg-red-700 shadow-md shadow-brand-red/25 cursor-pointer"
                        : "bg-brand-red/40 text-white/50 cursor-not-allowed"
                    }`}
                  >
                    {isScanning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    <span>{isScanning ? "Scanning..." : "Scan URL"}</span>
                  </button>
                </form>

                {/* Quick Presets for User Testing */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] text-neutral-400 font-mono flex items-center space-x-1.5">
                    <Sparkles className="h-3 w-3 text-amber-400" />
                    <span>Quick Test Samples:</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-mono">
                    <button
                      type="button"
                      onClick={() =>
                        setUrlInput(
                          "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80"
                        )
                      }
                      className="px-2.5 py-1 bg-brand-black/60 hover:bg-brand-dark border border-brand-dark rounded text-neutral-300 hover:text-white transition-colors"
                    >
                      Direct Image (Unsplash JPG)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setUrlInput(
                          "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
                        )
                      }
                      className="px-2.5 py-1 bg-brand-black/60 hover:bg-brand-dark border border-brand-dark rounded text-neutral-300 hover:text-white transition-colors"
                    >
                      Direct Video (Google Cloud MP4)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setUrlInput("https://www.youtube.com/watch?v=aqz-KE-bpKQ")
                      }
                      className="px-2.5 py-1 bg-brand-black/60 hover:bg-brand-dark border border-brand-dark rounded text-neutral-300 hover:text-white transition-colors"
                    >
                      Platform Video (YouTube yt-dlp)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setUrlInput("https://www.artstation.com/artwork/sample")
                      }
                      className="px-2.5 py-1 bg-brand-black/60 hover:bg-brand-dark border border-brand-dark rounded text-neutral-300 hover:text-white transition-colors"
                    >
                      Gallery Album (ArtStation gallery-dl)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUrlInput("http://127.0.0.1/private_camera.mp4")}
                      className="px-2.5 py-1 bg-red-950/30 hover:bg-red-900/40 border border-red-800/40 rounded text-red-300 hover:text-red-200 transition-colors"
                    >
                      SSRF Defense (Blocked 127.0.0.1)
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-neutral-400 border-t border-brand-dark/50 pt-3">
                  <div className="flex items-center space-x-3 text-[11px]">
                    <span className="text-neutral-400">Supported in M8:</span>
                    <span className="text-emerald-400 font-medium">Direct Files</span>
                    <span>·</span>
                    <span className="text-emerald-400 font-medium">Video Platforms (yt-dlp)</span>
                    <span>·</span>
                    <span className="text-emerald-400 font-medium">Image Galleries (gallery-dl)</span>
                  </div>
                  <span className="text-neutral-400 font-mono text-[11px]">
                    SSRF & Path Traversal Guards Active
                  </span>
                </div>
              </div>

              {/* Error Message Card */}
              {scanError && (
                <div className="bg-red-950/30 border border-red-800/60 rounded-xl p-4 flex items-start space-x-3 text-red-200">
                  <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <div className="font-semibold text-red-300">Scan Rejected or Failed</div>
                    <div className="font-mono text-[11px] leading-relaxed text-red-200/90">
                      {scanError}
                    </div>
                  </div>
                </div>
              )}

              {/* Discovered Multi-Item Gallery Card */}
              {scanResult && scanResult.media_items && scanResult.media_items.length > 1 && (
                <div className="bg-brand-dark/30 border border-brand-dark rounded-xl p-5 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-brand-dark/60 pb-3">
                    <div className="flex items-center space-x-2.5">
                      <span className="px-2.5 py-1 bg-sky-950/80 border border-sky-600/50 text-sky-300 text-xs font-mono font-semibold rounded-md flex items-center space-x-1.5">
                        <Layers className="h-3.5 w-3.5" />
                        <span>GALLERY ALBUM ({scanResult.media_items.length} ITEMS)</span>
                      </span>
                      <span className="text-xs font-mono text-neutral-400">
                        {scanResult.classified_url.platform || scanResult.classified_url.domain}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1 text-xs text-emerald-400 font-mono">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Collection Discovered</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-brand-white font-sans truncate">
                      {scanResult.classified_url.title_hint ||
                        scanResult.media_items[0]?.title ||
                        "Gallery Collection"}
                    </h3>
                    <p className="text-xs font-mono text-neutral-400">
                      Author:{" "}
                      <span className="text-neutral-200">
                        {scanResult.classified_url.author_hint || "gallery"}
                      </span>{" "}
                      · Source: {scanResult.classified_url.domain}
                    </p>
                  </div>

                  {/* Grid of gallery items */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-80 overflow-y-auto pr-1">
                    {scanResult.media_items.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className="bg-brand-black/70 border border-brand-dark rounded-lg p-2 flex flex-col space-y-2 hover:border-brand-red/50 transition-colors"
                      >
                        <div className="w-full h-24 rounded bg-brand-black/90 border border-brand-dark/60 overflow-hidden flex items-center justify-center relative">
                          {item.thumbnail_url ? (
                            <img
                              src={item.thumbnail_url}
                              alt={item.title || `Item ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ) : item.media_type === "video" ? (
                            <Film className="h-6 w-6 text-neutral-400" />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-neutral-400" />
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleBookmark(item);
                            }}
                            className={`absolute top-1 left-1 p-1 rounded-md transition-all ${
                              bookmarkedIds.has(item.id)
                                ? "bg-brand-red text-white shadow-sm shadow-brand-red/40"
                                : "bg-black/60 text-neutral-300 hover:text-white"
                            }`}
                            title={bookmarkedIds.has(item.id) ? "Saved in Library" : "Bookmark to Library"}
                          >
                            <Bookmark className={`h-3 w-3 ${bookmarkedIds.has(item.id) ? "fill-current" : ""}`} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartDownload(item);
                            }}
                            disabled={downloadingIds.has(item.id)}
                            className="absolute bottom-1 left-1 p-1 rounded-md bg-black/70 hover:bg-brand-red text-neutral-300 hover:text-white transition-all shadow-sm"
                            title="Download this item"
                          >
                            {downloadingIds.has(item.id) ? (
                              <Loader2 className="h-3 w-3 animate-spin text-white" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                          </button>
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 rounded text-[9px] font-mono text-neutral-300">
                            #{idx + 1}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono space-y-0.5">
                          <p className="truncate text-brand-white font-medium">
                            {item.title || `Item ${idx + 1}`}
                          </p>
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span className="uppercase">
                              {item.available_formats[0]?.container || "IMG"}
                            </span>
                            <span>{formatBytes(item.filesize_bytes)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-brand-dark/50 pt-2 text-[11px] font-mono">
                    <span className="text-neutral-400">
                      Total {scanResult.media_items.length} items enumerated without downloading
                    </span>
                    <span className="text-emerald-400 font-medium">
                      Ready for Batch Queue (Milestone 13)
                    </span>
                  </div>
                </div>
              )}

              {/* Discovered Single Media Card */}
              {scanResult?.media_item &&
                (!scanResult.media_items || scanResult.media_items.length <= 1) && (
                  <div className="bg-brand-dark/30 border border-brand-dark rounded-xl p-5 shadow-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-brand-dark/60 pb-3">
                    <div className="flex items-center space-x-2.5">
                      {scanResult.media_item.media_type === "image" ? (
                        <span className="px-2.5 py-1 bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 text-xs font-mono font-semibold rounded-md flex items-center space-x-1.5">
                          <ImageIcon className="h-3.5 w-3.5" />
                          <span>DIRECT IMAGE</span>
                        </span>
                      ) : scanResult.classified_url.category === "direct_video" ? (
                        <span className="px-2.5 py-1 bg-purple-950/80 border border-purple-600/50 text-purple-300 text-xs font-mono font-semibold rounded-md flex items-center space-x-1.5">
                          <Film className="h-3.5 w-3.5" />
                          <span>DIRECT VIDEO</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-indigo-950/80 border border-indigo-600/50 text-indigo-300 text-xs font-mono font-semibold rounded-md flex items-center space-x-1.5">
                          <Film className="h-3.5 w-3.5" />
                          <span>PLATFORM VIDEO (yt-dlp)</span>
                        </span>
                      )}
                      <span className="text-xs font-mono text-neutral-400">
                        {scanResult.classified_url.domain}
                      </span>
                    </div>

                    <div className="flex items-center space-x-3">
                      <button
                        type="button"
                        onClick={() => handleToggleBookmark(scanResult.media_item!)}
                        className={`px-2.5 py-1 rounded text-xs font-mono font-medium flex items-center space-x-1.5 transition-all ${
                          bookmarkedIds.has(scanResult.media_item.id)
                            ? "bg-brand-red text-white shadow-sm shadow-brand-red/30"
                            : "bg-brand-black/80 hover:bg-neutral-800 text-neutral-300 border border-brand-dark"
                        }`}
                      >
                        <Bookmark
                          className={`h-3.5 w-3.5 ${
                            bookmarkedIds.has(scanResult.media_item.id) ? "fill-current" : ""
                          }`}
                        />
                        <span>
                          {bookmarkedIds.has(scanResult.media_item.id)
                            ? "Saved in Library"
                            : "Bookmark to Library"}
                        </span>
                      </button>
                      <div className="flex items-center space-x-1 text-xs text-emerald-400 font-mono">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Classified Successfully</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-5">
                    {/* Visual Preview / Thumbnail */}
                    <div className="w-48 h-32 rounded-lg bg-brand-black/80 border border-brand-dark overflow-hidden flex items-center justify-center shrink-0">
                      {scanResult.media_item.thumbnail_url ? (
                        <img
                          src={scanResult.media_item.thumbnail_url}
                          alt={scanResult.media_item.title || "Discovered media"}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-neutral-400 space-y-2">
                          <Film className="h-8 w-8 text-neutral-400" />
                          <span className="text-[10px] font-mono">Video Stream</span>
                        </div>
                      )}
                    </div>

                    {/* Metadata Column */}
                    <div className="flex-1 flex flex-col justify-between text-xs font-mono space-y-2">
                      <div>
                        <h3 className="text-base font-bold text-brand-white font-sans truncate">
                          {scanResult.media_item.title || "Untitled Media"}
                        </h3>
                        <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                          {scanResult.media_item.original_url}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-brand-black/60 p-2.5 rounded-lg border border-brand-dark text-[11px]">
                        <div>
                          <span className="text-neutral-400 block">File Size:</span>
                          <span className="text-brand-white font-semibold">
                            {formatBytes(scanResult.media_item.filesize_bytes)}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block">Container:</span>
                          <span className="text-brand-white uppercase font-semibold">
                            {scanResult.media_item.available_formats[0]?.container || "Unknown"}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block">Stream Type:</span>
                          <span className="text-emerald-400 font-semibold">
                            {scanResult.classified_url.category === "direct_video" ||
                            scanResult.classified_url.category === "direct_image"
                              ? "Direct Source"
                              : "Extracted Stream"}
                          </span>
                        </div>
                      </div>

                      {/* Detected Formats Chips */}
                      {scanResult.media_item.available_formats.length > 1 && (
                        <div className="space-y-1">
                          <span className="text-[10px] text-neutral-400 block">
                            Available Streams ({scanResult.media_item.available_formats.length} formats):
                          </span>
                          <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                            {scanResult.media_item.available_formats.slice(0, 8).map((fmt) => (
                              <span
                                key={fmt.format_id}
                                className="px-2 py-0.5 rounded bg-brand-black/80 border border-brand-dark text-[10px] text-neutral-300 flex items-center space-x-1 font-mono"
                              >
                                <span>{fmt.resolution || fmt.format_id}</span>
                                {fmt.container && (
                                  <span className="text-neutral-400 text-[9px]">({fmt.container})</span>
                                )}
                                {fmt.requires_merge && (
                                  <span className="text-amber-400 text-[9px] px-1 bg-amber-950/60 rounded">
                                    merge
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] pt-2 border-t border-brand-dark/50">
                        <span className="text-neutral-400 font-mono">
                          Discovered at: {new Date(scanResult.media_item.created_at).toLocaleTimeString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleStartDownload(scanResult.media_item!)}
                          disabled={downloadingIds.has(scanResult.media_item.id)}
                          className="px-4 py-1.5 bg-brand-red hover:bg-red-700 text-white rounded-lg text-xs font-mono font-medium flex items-center space-x-2 transition-all shadow-md shadow-brand-red/30"
                        >
                          {downloadingIds.has(scanResult.media_item.id) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          <span>Download Now</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Verification & Architecture Status Grid */}
              <div className="border border-brand-dark bg-brand-dark/20 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-brand-white font-semibold text-sm">
                    <ExternalLink className="h-4 w-4 text-brand-red" />
                    <span>3-Tier Architecture Verification Status</span>
                  </div>
                  <button
                    onClick={pingPythonEngine}
                    disabled={isPinging}
                    className="px-3 py-1 bg-brand-dark hover:bg-neutral-800 border border-brand-dark text-xs text-brand-white rounded-md transition-colors font-mono"
                  >
                    {isPinging ? "Pinging..." : "Ping Python Engine"}
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-3 text-xs font-mono">
                  <div className="bg-brand-black/60 p-3 rounded-lg border border-brand-dark">
                    <span className="text-neutral-400 block mb-1">Desktop Shell:</span>
                    <span className="text-emerald-400">Electron 33 (Isolated)</span>
                  </div>
                  <div className="bg-brand-black/60 p-3 rounded-lg border border-brand-dark">
                    <span className="text-neutral-400 block mb-1">Renderer:</span>
                    <span className="text-emerald-400">React 18 + Vite 5 + Tailwind</span>
                  </div>
                  <div className="bg-brand-black/60 p-3 rounded-lg border border-brand-dark">
                    <span className="text-neutral-400 block mb-1">Preload Bridge:</span>
                    <span className="text-emerald-400">{ipcStatus}</span>
                  </div>
                  <div className="bg-brand-black/60 p-3 rounded-lg border border-brand-dark">
                    <span className="text-neutral-400 block mb-1">Python Engine:</span>
                    <span className={pythonStatus?.connected ? "text-emerald-400" : "text-amber-400"}>
                      {pythonStatus?.connected
                        ? `Connected (${pythonLatency ?? 0}ms)`
                        : "Disconnected"}
                    </span>
                  </div>
                </div>

                {/* Python Child-Process Engine Diagnostics */}
                {pythonStatus?.info && (
                  <div className="bg-brand-black/40 border border-brand-dark/60 rounded-lg p-3 text-xs font-mono space-y-1.5 text-neutral-300">
                    <div className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold mb-2">
                      Python Engine Runtime (JSON-RPC over Stdio)
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-neutral-400">Engine Version: </span>
                        <span className="text-brand-white font-medium">
                          v{pythonPing?.version || pythonStatus.info.engine_version}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400">Python Runtime: </span>
                        <span className="text-brand-white font-medium">{pythonStatus.info.python_version}</span>
                      </div>
                      <div>
                        <span className="text-neutral-400">Process PID: </span>
                        <span className="text-emerald-400 font-medium">{pythonStatus.pid}</span>
                      </div>
                      <div>
                        <span className="text-neutral-400">Round-trip Ping: </span>
                        <span className="text-emerald-400 font-medium">
                          {pythonLatency !== null ? `${pythonLatency}ms (${pythonPing?.message || "pong"})` : "—"}
                        </span>
                      </div>
                      <div className="col-span-2 truncate">
                        <span className="text-neutral-400">Download Dir: </span>
                        <span className="text-neutral-300">{pythonStatus.info.download_dir}</span>
                      </div>
                      <div className="col-span-2 truncate">
                        <span className="text-neutral-400">Data Dir: </span>
                        <span className="text-neutral-300">{pythonStatus.info.data_dir}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Scan History View */}
          {activeTab === "history" && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-brand-white">
                    Scan History
                  </h1>
                  <p className="text-sm text-neutral-400 mt-1">
                    Local audit log of all URL scans and discovered media sources stored in SQLite.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={fetchScanHistory}
                    disabled={scanHistoryLoading}
                    className="px-3 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark rounded-md text-xs font-mono text-neutral-300 flex items-center space-x-1.5 transition-colors"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${scanHistoryLoading ? "animate-spin" : ""}`} />
                    <span>Refresh</span>
                  </button>
                  {scanHistory.length > 0 && (
                    <button
                      onClick={handleClearHistory}
                      className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 rounded-md text-xs font-mono text-red-300 flex items-center space-x-1.5 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Clear History</span>
                    </button>
                  )}
                </div>
              </div>

              {scanHistoryLoading && scanHistory.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3 text-neutral-400">
                  <Loader2 className="h-6 w-6 animate-spin text-brand-red" />
                  <span className="text-xs font-mono">Loading scan history from SQLite...</span>
                </div>
              ) : scanHistory.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3 bg-brand-dark/20 border border-brand-dark/60 rounded-xl text-center p-8">
                  <History className="h-10 w-10 text-neutral-400 stroke-1" />
                  <h3 className="text-sm font-semibold text-brand-white">No Scan History</h3>
                  <p className="text-xs text-neutral-400 max-w-sm">
                    Scanned URLs and discovered media collections are automatically recorded here.
                  </p>
                  <button
                    onClick={() => setActiveTab("scan")}
                    className="mt-2 px-4 py-2 bg-brand-red hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    Scan a URL
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {scanHistory.map((scan) => (
                    <div
                      key={scan.id}
                      className="bg-brand-dark/30 border border-brand-dark rounded-xl p-4 flex flex-col space-y-3 hover:border-brand-dark/90 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 min-w-0">
                          {/* Thumbnail / Category Icon */}
                          <div className="w-12 h-12 rounded-lg bg-brand-black/90 border border-brand-dark overflow-hidden flex items-center justify-center shrink-0">
                            {scan.preview_thumbnail ? (
                              <img
                                src={scan.preview_thumbnail}
                                alt={scan.title_hint || "Preview"}
                                className="w-full h-full object-cover"
                              />
                            ) : scan.category === "direct_video" || scan.category === "channel" ? (
                              <Film className="h-5 w-5 text-purple-400" />
                            ) : (
                              <ImageIcon className="h-5 w-5 text-emerald-400" />
                            )}
                          </div>

                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-sm text-brand-white truncate max-w-md">
                                {scan.title_hint || scan.domain || scan.raw_url}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-brand-black/80 border border-brand-dark text-neutral-300 shrink-0">
                                {scan.category.replace("_", " ")}
                              </span>
                              {scan.item_count > 0 && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-950/70 border border-sky-800/50 text-sky-300 shrink-0">
                                  {scan.item_count} items
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-3 text-xs font-mono text-neutral-400">
                              <span className="truncate max-w-sm">{scan.raw_url}</span>
                              <span>·</span>
                              <span>{new Date(scan.scanned_at).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            onClick={() => handleInspectScan(scan)}
                            className="px-3 py-1.5 bg-brand-black/80 hover:bg-neutral-800 border border-brand-dark rounded-md text-xs font-mono text-neutral-300 flex items-center space-x-1.5 transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Inspect</span>
                          </button>
                          <button
                            onClick={() => handleReScan(scan.raw_url)}
                            className="px-3 py-1.5 bg-brand-red/90 hover:bg-brand-red rounded-md text-xs font-mono text-white flex items-center space-x-1.5 transition-colors shadow-sm shadow-brand-red/20"
                          >
                            <RefreshCw className="h-3 w-3" />
                            <span>Rescan</span>
                          </button>
                        </div>
                      </div>

                      {/* Expanded items list if this scan is inspected */}
                      {selectedScanDetail?.scan.id === scan.id && (
                        <div className="border-t border-brand-dark/60 pt-3 space-y-3">
                          <div className="flex items-center justify-between text-xs font-mono text-neutral-400">
                            <span>Discovered Items in this Scan ({selectedScanDetail.items.length})</span>
                            <button
                              onClick={() => setSelectedScanDetail(null)}
                              className="text-neutral-400 hover:text-white"
                            >
                              Close
                            </button>
                          </div>
                          {selectedScanDetail.loading ? (
                            <div className="py-6 flex items-center justify-center space-x-2 text-xs font-mono text-neutral-400">
                              <Loader2 className="h-4 w-4 animate-spin text-brand-red" />
                              <span>Loading scan items from database...</span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-60 overflow-y-auto pr-1">
                              {selectedScanDetail.items.map((it, idx) => (
                                <div
                                  key={it.id || idx}
                                  className="bg-brand-black/80 border border-brand-dark/70 rounded-lg p-2 flex flex-col space-y-2 relative"
                                >
                                  <div className="w-full h-20 rounded bg-brand-black border border-brand-dark/50 overflow-hidden flex items-center justify-center relative">
                                    {it.thumbnail_url ? (
                                      <img
                                        src={it.thumbnail_url}
                                        alt={it.title || `Item ${idx + 1}`}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : it.media_type === "video" ? (
                                      <Film className="h-5 w-5 text-neutral-400" />
                                    ) : (
                                      <ImageIcon className="h-5 w-5 text-neutral-400" />
                                    )}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleBookmark(it);
                                      }}
                                      className={`absolute top-1 right-1 p-1 rounded transition-all ${
                                        bookmarkedIds.has(it.id)
                                          ? "bg-brand-red text-white shadow-sm shadow-brand-red/40"
                                          : "bg-black/60 text-neutral-300 hover:text-white"
                                      }`}
                                    >
                                      <Bookmark className={`h-3 w-3 ${bookmarkedIds.has(it.id) ? "fill-current" : ""}`} />
                                    </button>
                                  </div>
                                  <div className="text-[10px] font-mono truncate text-brand-white">
                                    {it.title || `Item #${idx + 1}`}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Media Library & Saved Sources View */}
          {(activeTab === "library" || activeTab === "saved") && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-brand-white">
                    Media Library & Bookmarks
                  </h1>
                  <p className="text-sm text-neutral-400 mt-1">
                    Saved media items stored in your local SQLite library. Preserved across sessions.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => fetchSavedMedia(savedMediaFilter)}
                    disabled={savedMediaLoading}
                    className="px-3 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark rounded-md text-xs font-mono text-neutral-300 flex items-center space-x-1.5 transition-colors"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${savedMediaLoading ? "animate-spin" : ""}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center space-x-2 border-b border-brand-dark/60 pb-3">
                {(["all", "video", "image", "audio"] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setSavedMediaFilter(filter)}
                    className={`px-3 py-1 rounded-md text-xs font-mono uppercase tracking-wider transition-all ${
                      savedMediaFilter === filter
                        ? "bg-brand-red text-white font-semibold shadow-sm shadow-brand-red/30"
                        : "bg-brand-dark/40 text-neutral-400 hover:text-white hover:bg-brand-dark"
                    }`}
                  >
                    {filter === "all" ? "All Media" : `${filter}s`}
                  </button>
                ))}
                <span className="text-xs font-mono text-neutral-400 ml-auto">
                  {savedMediaItems.length} {savedMediaItems.length === 1 ? "item" : "items"} stored
                </span>
              </div>

              {savedMediaLoading && savedMediaItems.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3 text-neutral-400">
                  <Loader2 className="h-6 w-6 animate-spin text-brand-red" />
                  <span className="text-xs font-mono">Loading saved library from SQLite...</span>
                </div>
              ) : savedMediaItems.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3 bg-brand-dark/20 border border-brand-dark/60 rounded-xl text-center p-8">
                  <FolderArchive className="h-10 w-10 text-neutral-400 stroke-1" />
                  <h3 className="text-sm font-semibold text-brand-white">Your Media Library is Empty</h3>
                  <p className="text-xs text-neutral-400 max-w-sm">
                    Bookmark media items while scanning URLs to save them to your local collection.
                  </p>
                  <button
                    onClick={() => setActiveTab("scan")}
                    className="mt-2 px-4 py-2 bg-brand-red hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    Discover Media in Scanner
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {savedMediaItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-brand-dark/30 border border-brand-dark rounded-xl p-3.5 flex flex-col justify-between space-y-3 hover:border-brand-dark/90 transition-all group"
                    >
                      <div className="space-y-2.5">
                        <div className="w-full h-36 rounded-lg bg-brand-black/90 border border-brand-dark overflow-hidden flex items-center justify-center relative">
                          {item.thumbnail_url ? (
                            <img
                              src={item.thumbnail_url}
                              alt={item.title || "Media preview"}
                              className="w-full h-full object-cover"
                            />
                          ) : item.media_type === "video" ? (
                            <Film className="h-8 w-8 text-purple-400" />
                          ) : (
                            <ImageIcon className="h-8 w-8 text-emerald-400" />
                          )}
                          <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/80 rounded text-[10px] font-mono uppercase text-neutral-200">
                            {item.media_type}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleBookmark(item)}
                            className="absolute top-2 right-2 p-1.5 rounded bg-brand-red text-white shadow-md shadow-brand-red/40 hover:bg-red-700 transition-colors"
                            title="Remove from saved library"
                          >
                            <Bookmark className="h-3.5 w-3.5 fill-current" />
                          </button>
                        </div>

                        <div className="space-y-1">
                          <h4 className="text-xs font-bold text-brand-white truncate font-sans" title={item.title || ""}>
                            {item.title || "Untitled Item"}
                          </h4>
                          <p className="text-[11px] font-mono text-neutral-400 truncate">
                            Author: <span className="text-neutral-200">{item.author || "Unknown"}</span>
                          </p>
                          <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 pt-1">
                            <span>{formatBytes(item.filesize_bytes)}</span>
                            <span>{new Date(item.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-brand-dark/60 pt-2 flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleStartDownload(item)}
                            disabled={downloadingIds.has(item.id)}
                            className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 flex items-center space-x-1"
                            title="Download this media item"
                          >
                            {downloadingIds.has(item.id) ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                            <span>Download</span>
                          </button>
                          <button
                            onClick={() => handleReScan(item.source_url)}
                            className="text-[11px] font-mono text-neutral-400 hover:text-white flex items-center space-x-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>Source</span>
                          </button>
                        </div>
                        <button
                          onClick={() => handleDeleteSavedMedia(item.id)}
                          className="text-[11px] font-mono text-red-400/80 hover:text-red-400 flex items-center space-x-1"
                          title="Permanently delete from library"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Download Manager View */}
          {activeTab === "downloads" && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-brand-white">
                    Download Manager
                  </h1>
                  <p className="text-sm text-neutral-400 mt-1">
                    Chunked HTTP/HTTPS streaming, atomic .part renaming, real-time speed &amp; ETA telemetry.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  {pythonStatus?.info?.download_dir && (
                    <button
                      onClick={() => handleOpenFileOrFolder(pythonStatus.info?.download_dir)}
                      className="px-3 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark rounded-md text-xs font-mono text-neutral-300 flex items-center space-x-1.5 transition-colors"
                      title={`Open ${pythonStatus.info.download_dir}`}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span>Open Folder</span>
                    </button>
                  )}
                  <button
                    onClick={fetchDownloadTasks}
                    disabled={downloadTasksLoading}
                    className="px-3 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark rounded-md text-xs font-mono text-neutral-300 flex items-center space-x-1.5 transition-colors"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${downloadTasksLoading ? "animate-spin" : ""}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center space-x-2 border-b border-brand-dark/60 pb-3">
                {[
                  { id: "all", label: "All Tasks", count: downloadTasks.length },
                  {
                    id: "active",
                    label: "Active",
                    count: downloadTasks.filter(
                      (t) =>
                        t.status === "downloading" ||
                        t.status === "queued" ||
                        t.status === "merging"
                    ).length,
                  },
                  {
                    id: "completed",
                    label: "Completed",
                    count: downloadTasks.filter((t) => t.status === "completed").length,
                  },
                  {
                    id: "failed",
                    label: "Failed / Cancelled",
                    count: downloadTasks.filter(
                      (t) => t.status === "failed" || t.status === "cancelled"
                    ).length,
                  },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setDownloadFilter(tab.id as typeof downloadFilter)}
                    className={`px-3 py-1 rounded-md text-xs font-mono uppercase tracking-wider transition-all flex items-center space-x-1.5 ${
                      downloadFilter === tab.id
                        ? "bg-brand-red text-white font-semibold shadow-sm shadow-brand-red/30"
                        : "bg-brand-dark/40 text-neutral-400 hover:text-white hover:bg-brand-dark"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="text-[10px] opacity-75">({tab.count})</span>
                  </button>
                ))}
              </div>

              {/* Task List */}
              {downloadTasksLoading && downloadTasks.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3 text-neutral-400">
                  <Loader2 className="h-6 w-6 animate-spin text-brand-red" />
                  <span className="text-xs font-mono">Loading download tasks from SQLite...</span>
                </div>
              ) : (() => {
                const filtered = downloadTasks.filter((t) => {
                  if (downloadFilter === "active") {
                    return (
                      t.status === "downloading" ||
                      t.status === "queued" ||
                      t.status === "merging"
                    );
                  }
                  if (downloadFilter === "completed") {
                    return t.status === "completed";
                  }
                  if (downloadFilter === "failed") {
                    return t.status === "failed" || t.status === "cancelled";
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="py-20 flex flex-col items-center justify-center space-y-3 bg-brand-dark/20 border border-brand-dark/60 rounded-xl text-center p-8">
                      <Download className="h-10 w-10 text-neutral-400 stroke-1" />
                      <h3 className="text-sm font-semibold text-brand-white">
                        {downloadFilter === "all"
                          ? "No Downloads Queued"
                          : `No ${downloadFilter} downloads`}
                      </h3>
                      <p className="text-xs text-neutral-400 max-w-sm">
                        Scan media from any supported URL or pick an item from your library to start streaming to disk.
                      </p>
                      <button
                        onClick={() => setActiveTab("scan")}
                        className="mt-2 px-4 py-2 bg-brand-red hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        Go to Scanner
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    {filtered.map((task) => {
                      const isRunning =
                        task.status === "downloading" ||
                        task.status === "queued" ||
                        task.status === "merging";
                      const isCompleted = task.status === "completed";
                      const isFailed = task.status === "failed";
                      const isCancelled = task.status === "cancelled";

                      return (
                        <div
                          key={task.id}
                          className="bg-brand-dark/30 border border-brand-dark rounded-xl p-4 flex flex-col space-y-3 hover:border-brand-dark/90 transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3 min-w-0">
                              {/* Media Thumbnail */}
                              <div className="w-14 h-14 rounded-lg bg-brand-black/90 border border-brand-dark overflow-hidden flex items-center justify-center shrink-0">
                                {task.media_item.thumbnail_url ? (
                                  <img
                                    src={task.media_item.thumbnail_url}
                                    alt={task.media_item.title || "Download"}
                                    className="w-full h-full object-cover"
                                  />
                                ) : task.media_item.media_type === "video" ? (
                                  <Film className="h-6 w-6 text-purple-400" />
                                ) : (
                                  <ImageIcon className="h-6 w-6 text-emerald-400" />
                                )}
                              </div>

                              {/* Meta info */}
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex items-center space-x-2">
                                  <span className="font-semibold text-sm text-brand-white truncate max-w-md font-sans">
                                    {task.media_item.title || "Untitled Media"}
                                  </span>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-brand-black/80 border border-brand-dark text-neutral-300 shrink-0">
                                    {task.selected_format?.container ||
                                      task.media_item.available_formats[0]?.container ||
                                      task.media_item.media_type}
                                  </span>
                                  {task.selected_format?.resolution && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-950/60 border border-purple-800/40 text-purple-300 shrink-0">
                                      {task.selected_format.resolution}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center space-x-3 text-xs font-mono text-neutral-400">
                                  <span>Author: {task.media_item.author || "Unknown"}</span>
                                  <span>·</span>
                                  <span className="truncate max-w-xs">
                                    {task.media_item.original_url}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Status Badge & Actions */}
                            <div className="flex items-center space-x-2 shrink-0">
                              {isRunning && (
                                <span className="px-2.5 py-1 rounded-md text-xs font-mono uppercase bg-amber-950/60 border border-amber-800/60 text-amber-300 flex items-center space-x-1.5">
                                  <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                                  <span>{task.status}</span>
                                </span>
                              )}
                              {isCompleted && (
                                <span className="px-2.5 py-1 rounded-md text-xs font-mono uppercase bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 flex items-center space-x-1.5">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                  <span>Completed</span>
                                </span>
                              )}
                              {isFailed && (
                                <span className="px-2.5 py-1 rounded-md text-xs font-mono uppercase bg-red-950/60 border border-red-800/60 text-red-300 flex items-center space-x-1.5">
                                  <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                                  <span>Failed</span>
                                </span>
                              )}
                              {isCancelled && (
                                <span className="px-2.5 py-1 rounded-md text-xs font-mono uppercase bg-neutral-900 border border-neutral-700 text-neutral-400 flex items-center space-x-1.5">
                                  <XCircle className="h-3.5 w-3.5 text-neutral-400" />
                                  <span>Cancelled</span>
                                </span>
                              )}

                              {/* Action Buttons */}
                              {isRunning && (
                                <button
                                  onClick={() => handleCancelDownload(task.id)}
                                  className="px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-md text-xs font-mono text-red-300 flex items-center space-x-1 transition-colors"
                                  title="Cancel active download"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  <span>Cancel</span>
                                </button>
                              )}
                              {isCompleted && task.destination_path && (
                                <button
                                  onClick={() => handleOpenFileOrFolder(task.destination_path)}
                                  className="px-2.5 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/60 rounded-md text-xs font-mono text-emerald-300 flex items-center space-x-1.5 transition-colors"
                                  title={`Show in folder: ${task.destination_path}`}
                                >
                                  <FolderOpen className="h-3.5 w-3.5" />
                                  <span>Show File</span>
                                </button>
                              )}
                              {(isFailed || isCancelled) && (
                                <button
                                  onClick={() =>
                                    handleStartDownload(
                                      task.media_item,
                                      task.selected_format
                                    )
                                  }
                                  className="px-2.5 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark rounded-md text-xs font-mono text-white flex items-center space-x-1.5 transition-colors"
                                  title="Retry download"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  <span>Retry</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="space-y-1.5">
                            <div className="w-full h-2 rounded-full bg-brand-black/90 overflow-hidden border border-brand-dark/50">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  isCompleted
                                    ? "bg-emerald-500"
                                    : isFailed
                                    ? "bg-red-500"
                                    : isCancelled
                                    ? "bg-neutral-600"
                                    : "bg-gradient-to-r from-brand-red via-purple-600 to-indigo-500"
                                }`}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.max(0, task.progress_percent)
                                  )}%`,
                                }}
                              />
                            </div>

                            {/* Telemetry line */}
                            <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                              <div className="flex items-center space-x-3">
                                <span>
                                  {formatBytes(task.bytes_downloaded)}
                                  {task.total_bytes
                                    ? ` / ${formatBytes(task.total_bytes)}`
                                    : ""}
                                </span>
                                <span>·</span>
                                <span className="font-semibold text-brand-white">
                                  {task.progress_percent.toFixed(1)}%
                                </span>
                                {isRunning &&
                                  task.speed_bytes_sec !== undefined &&
                                  task.speed_bytes_sec > 0 && (
                                    <>
                                      <span>·</span>
                                      <span className="text-emerald-400">
                                        {formatSpeed(task.speed_bytes_sec)}
                                      </span>
                                    </>
                                  )}
                                {isRunning &&
                                  task.total_bytes &&
                                  task.speed_bytes_sec &&
                                  task.speed_bytes_sec > 0 && (
                                    <>
                                      <span>·</span>
                                      <span>
                                        ETA:{" "}
                                        {formatEta(
                                          (task.total_bytes - task.bytes_downloaded) /
                                            task.speed_bytes_sec
                                        )}
                                      </span>
                                    </>
                                  )}
                              </div>

                              <div className="truncate max-w-sm text-right">
                                {task.destination_path ? (
                                  <span
                                    className="text-neutral-300"
                                    title={task.destination_path}
                                  >
                                    {task.destination_path.split(/[\\/]/).pop()}
                                  </span>
                                ) : (
                                  <span>
                                    {new Date(task.created_at).toLocaleTimeString()}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Error message detail if failed */}
                            {task.error_message && (
                              <div className="text-[11px] font-mono text-red-300 bg-red-950/40 p-2 rounded border border-red-800/40">
                                Error: {task.error_message}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {activeTab !== "scan" &&
            activeTab !== "history" &&
            activeTab !== "library" &&
            activeTab !== "saved" &&
            activeTab !== "downloads" && (
            <div className="max-w-2xl mx-auto text-center py-24 space-y-3">
              <h2 className="text-lg font-bold text-brand-white capitalize">
                {activeTab.replace("-", " ")}
              </h2>
              <p className="text-sm text-neutral-400">
                This subsystem view will be connected in its designated roadmap milestone.
              </p>
              <button
                onClick={() => setActiveTab("scan")}
                className="mt-4 px-4 py-2 bg-brand-dark text-xs text-brand-white rounded-md hover:bg-brand-dark/80"
              >
                Return to Scan Media
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
