import React, { useEffect, useState, useRef, useMemo } from "react";
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
  Play,
  ZoomIn,
  ZoomOut,
  RotateCw,
  X,
  FileJson,
  Copy,
  Check,
  Filter,
  ArrowUpDown,
  Music,
  Pause,
  CheckSquare,
  Square,
  SlidersHorizontal,
  Gauge,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type {
  ClassifyUrlResult,
  DiscoveredMediaItem,
  DownloadQueueStateResult,
  DownloadTaskRecord,
  FFmpegInfoResult,
  MediaFormatInfoPayload,
  ProgressUpdatePayload,
  PythonBridgeStatus,
  PythonPingResult,
  ScanHistoryRecord,
  SystemInfo,
  ExportMetadataResult,
  RecoverySummary,
} from "../../desktop/shared/types";
import { SettingsView } from "./components/SettingsView";
import { SavedSourcesView } from "./components/SavedSourcesView";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("scan");
  const [ipcStatus, setIpcStatus] = useState<string>("Checking IPC...");
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [pythonStatus, setPythonStatus] = useState<PythonBridgeStatus | null>(null);
  const [pythonPing, setPythonPing] = useState<PythonPingResult | null>(null);
  const [pythonLatency, setPythonLatency] = useState<number | null>(null);
  const [ffmpegInfo, setFfmpegInfo] = useState<FFmpegInfoResult | null>(null);
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [urlInput, setUrlInput] = useState<string>("");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<ClassifyUrlResult | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<MediaFormatInfoPayload | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [savedSourceStatus, setSavedSourceStatus] = useState<{ message: string; isError?: boolean } | null>(null);

  // SQLite Persistence State (Media Library & Scan History)
  const [savedMediaItems, setSavedMediaItems] = useState<DiscoveredMediaItem[]>([]);
  const [savedMediaLoading, setSavedMediaLoading] = useState<boolean>(false);
  const [savedMediaFilter, setSavedMediaFilter] = useState<"all" | "image" | "video" | "audio">("all");
  const [libraryQuery, setLibraryQuery] = useState<string>("");
  const [libraryContainer, setLibraryContainer] = useState<string>("all");
  const [librarySort, setLibrarySort] = useState<"newest" | "oldest" | "title" | "size_desc" | "size_asc">("newest");
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  // Media Preview & Lightbox State
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    mediaItem: DiscoveredMediaItem | null;
    localPath?: string | null;
    mode: "player" | "lightbox";
    zoom: number;
    rotation: number;
  }>({
    isOpen: false,
    mediaItem: null,
    localPath: null,
    mode: "lightbox",
    zoom: 1,
    rotation: 0,
  });
  const mediaPlayerRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);

  // Metadata Export Modal State
  const [exportModal, setExportModal] = useState<{
    isOpen: boolean;
    mediaItem: DiscoveredMediaItem | null;
    metadata: ExportMetadataResult | null;
    loading: boolean;
    copied: boolean;
  }>({
    isOpen: false,
    mediaItem: null,
    metadata: null,
    loading: false,
    copied: false,
  });

  // Safe Deletion Confirmation State
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    mediaItem: DiscoveredMediaItem | null;
    localPath?: string | null;
    deleteDiskFile: boolean;
    loading: boolean;
  }>({
    isOpen: false,
    mediaItem: null,
    localPath: null,
    deleteDiskFile: true,
    loading: false,
  });

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
  const [downloadFilter, setDownloadFilter] = useState<"all" | "active" | "paused" | "completed" | "failed">("all");
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [activeTaskCount, setActiveTaskCount] = useState<number>(0);
  const [concurrency, setConcurrency] = useState<number>(3);
  const [speedLimitKbps, setSpeedLimitKbps] = useState<number>(0);
  const [queueState, setQueueState] = useState<DownloadQueueStateResult | null>(null);
  const [batchDownloading, setBatchDownloading] = useState<boolean>(false);
  const [selectedGalleryIds, setSelectedGalleryIds] = useState<Set<string>>(new Set());
  const [recoveryBanner, setRecoveryBanner] = useState<RecoverySummary | null>(null);
  const [isRecovering, setIsRecovering] = useState<boolean>(false);

  // Performance & Windowing State (Milestone 21)
  const [galleryPage, setGalleryPage] = useState<number>(1);
  const [queuePage, setQueuePage] = useState<number>(1);

  // Memoized completed downloads map for O(1) lookup in library grid
  const completedDownloadsMap = useMemo(() => {
    const map = new Map<string, DownloadTaskRecord>();
    for (const t of downloadTasks) {
      if (t.status === "completed") {
        if (t.media_item?.id) map.set(t.media_item.id, t);
        if (t.id) map.set(t.id, t);
      }
    }
    return map;
  }, [downloadTasks]);

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

  const fetchSavedMedia = async (
    mediaType = savedMediaFilter,
    query = libraryQuery,
    container = libraryContainer,
    sortBy = librarySort
  ) => {
    setSavedMediaLoading(true);
    try {
      if (window.api?.querySavedMedia) {
        const res = await window.api.querySavedMedia({
          media_type: mediaType === "all" ? undefined : mediaType,
          query: query.trim() || undefined,
          container: container === "all" ? undefined : container,
          sort_by: sortBy,
        });
        setSavedMediaItems(res.items || []);
        setBookmarkedIds(new Set((res.items || []).map((i) => i.id)));
      } else if (window.api?.getSavedMedia) {
        const typeParam = mediaType && mediaType !== "all" ? mediaType : undefined;
        const res = await window.api.getSavedMedia(typeParam);
        setSavedMediaItems(res.items || []);
        if (!typeParam) {
          setBookmarkedIds(new Set((res.items || []).map((i) => i.id)));
        }
      }
    } catch (err) {
      console.error("Failed to load saved media:", err);
    } finally {
      setSavedMediaLoading(false);
    }
  };

  const handleOpenPreview = (
    item: DiscoveredMediaItem,
    localPath?: string | null
  ) => {
    // If no localPath passed, check completed download tasks
    const matchingTask = downloadTasks.find(
      (t) => (t.media_item.id === item.id || t.id === item.id) && t.destination_path
    );
    const resolvedPath = localPath || matchingTask?.destination_path || null;
    const isImage = item.media_type === "image";
    setPreviewModal({
      isOpen: true,
      mediaItem: item,
      localPath: resolvedPath,
      mode: isImage ? "lightbox" : "player",
      zoom: 1,
      rotation: 0,
    });
    setPlaybackSpeed(1.0);
  };

  const handleSetPlaybackRate = (rate: number) => {
    setPlaybackSpeed(rate);
    if (mediaPlayerRef.current) {
      mediaPlayerRef.current.playbackRate = rate;
    }
  };

  const handleOpenExportModal = async (item: DiscoveredMediaItem) => {
    setExportModal({
      isOpen: true,
      mediaItem: item,
      metadata: null,
      loading: true,
      copied: false,
    });
    try {
      if (window.api?.exportMediaMetadata) {
        const res = await window.api.exportMediaMetadata(item.id);
        setExportModal((prev) => ({
          ...prev,
          metadata: res,
          loading: false,
        }));
      } else {
        setExportModal((prev) => ({
          ...prev,
          metadata: {
            media_item: item,
            download_task: null,
            exported_at: new Date().toISOString(),
          },
          loading: false,
        }));
      }
    } catch (err) {
      console.error("Failed to export metadata:", err);
      setExportModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handlePromptDelete = (
    item: DiscoveredMediaItem,
    localPath?: string | null
  ) => {
    const matchingTask = downloadTasks.find(
      (t) => (t.media_item.id === item.id || t.id === item.id) && t.destination_path
    );
    const resolvedPath = localPath || matchingTask?.destination_path || null;
    setDeleteConfirm({
      isOpen: true,
      mediaItem: item,
      localPath: resolvedPath,
      deleteDiskFile: Boolean(resolvedPath),
      loading: false,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm.mediaItem) return;
    setDeleteConfirm((prev) => ({ ...prev, loading: true }));
    const itemId = deleteConfirm.mediaItem.id;
    try {
      if (window.api?.deleteDownloadedMedia) {
        await window.api.deleteDownloadedMedia(itemId, deleteConfirm.deleteDiskFile);
      } else if (window.api?.deleteMediaItem) {
        await window.api.deleteMediaItem(itemId);
      }
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      setSavedMediaItems((prev) => prev.filter((i) => i.id !== itemId));
      setDownloadTasks((prev) =>
        prev.filter((t) => t.media_item.id !== itemId && t.id !== itemId)
      );
      setDeleteConfirm({
        isOpen: false,
        mediaItem: null,
        localPath: null,
        deleteDiskFile: true,
        loading: false,
      });
    } catch (err) {
      console.error("Failed to delete media item:", err);
      setDeleteConfirm((prev) => ({ ...prev, loading: false }));
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
        await fetchSavedMedia(savedMediaFilter, libraryQuery, libraryContainer, librarySort);
      }
    } catch (err) {
      console.error("Failed to toggle bookmark:", err);
    }
  };

  const handleSaveCurrentScanAsSource = async () => {
    if (!window.api?.saveSource || !scanResult) return;
    try {
      const url = scanResult.classified_url.normalized_url || urlInput.trim();
      const title =
        scanResult.classified_url.title_hint ||
        scanResult.media_item?.title ||
        scanResult.media_items?.[0]?.title ||
        scanResult.classified_url.domain ||
        "Saved Source";
      const author =
        scanResult.classified_url.author_hint ||
        scanResult.media_item?.author ||
        scanResult.media_items?.[0]?.author ||
        undefined;
      const platform =
        scanResult.classified_url.platform ||
        scanResult.classified_url.domain ||
        undefined;

      const tags = [platform, "bookmarked"].filter(Boolean) as string[];

      await window.api.saveSource({
        url,
        title,
        author,
        platform,
        tags,
      });
      setSavedSourceStatus({ message: `Source "${title}" saved to Saved Sources!` });
      setTimeout(() => setSavedSourceStatus(null), 3500);
    } catch (err) {
      console.error("Failed to save source:", err);
      setSavedSourceStatus({ message: `Failed to save source: ${String(err)}`, isError: true });
      setTimeout(() => setSavedSourceStatus(null), 4000);
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
      setGalleryPage(1);
      if (res.media_item?.available_formats && res.media_item.available_formats.length > 0) {
        setSelectedFormat(res.media_item.available_formats[0]);
      } else {
        setSelectedFormat(null);
      }
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
      fetchQueueState();
    } catch (err) {
      console.error("Failed to cancel download:", err);
    }
  };

  const fetchQueueState = async () => {
    if (!window.api?.getDownloadQueueState) return;
    try {
      const res = await window.api.getDownloadQueueState();
      setQueueState(res);
      setConcurrency(res.max_concurrent);
    } catch (err) {
      console.warn("Failed to fetch queue state:", err);
    }
  };

  const handleStartBatchDownload = async (
    items: DiscoveredMediaItem[],
    targetDir?: string
  ) => {
    if (!window.api?.startBatchDownload || items.length === 0) return;
    setBatchDownloading(true);
    try {
      const payload = items.map((item) => ({
        media_item: item,
        selected_format: item.available_formats?.[0] || null,
      }));
      const res = await window.api.startBatchDownload(payload, targetDir);
      setDownloadTasks((prev) => {
        const newIds = new Set(res.tasks.map((t) => t.id));
        const kept = prev.filter((t) => !newIds.has(t.id));
        return [...res.tasks, ...kept];
      });
      fetchQueueState();
      setActiveTab("downloads");
    } catch (err) {
      console.error("Failed to start batch download:", err);
    } finally {
      setBatchDownloading(false);
    }
  };

  const handlePauseDownload = async (taskId: string) => {
    if (!window.api?.pauseDownload) return;
    try {
      await window.api.pauseDownload(taskId);
      setDownloadTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: "paused" } : t))
      );
      fetchQueueState();
    } catch (err) {
      console.error("Failed to pause download:", err);
    }
  };

  const handleResumeDownload = async (taskId: string) => {
    if (!window.api?.resumeDownload) return;
    try {
      await window.api.resumeDownload(taskId);
      setDownloadTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: "queued" } : t))
      );
      fetchQueueState();
    } catch (err) {
      console.error("Failed to resume download:", err);
    }
  };

  const handlePauseAll = async () => {
    if (!window.api?.pauseAllDownloads) return;
    try {
      await window.api.pauseAllDownloads();
      fetchDownloadTasks();
      fetchQueueState();
    } catch (err) {
      console.error("Failed to pause all downloads:", err);
    }
  };

  const handleResumeAll = async () => {
    if (!window.api?.resumeAllDownloads) return;
    try {
      await window.api.resumeAllDownloads();
      fetchDownloadTasks();
      fetchQueueState();
    } catch (err) {
      console.error("Failed to resume all downloads:", err);
    }
  };

  const handleRecoverTasks = async (autoResume: boolean = true) => {
    if (!window.api?.recoverInterruptedTasks) return;
    setIsRecovering(true);
    try {
      const summary = await window.api.recoverInterruptedTasks(autoResume);
      setRecoveryBanner(summary);
      await fetchDownloadTasks();
      await fetchQueueState();
    } catch (err) {
      console.error("Failed to recover tasks:", err);
    } finally {
      setIsRecovering(false);
    }
  };

  const handleCancelAll = async () => {
    if (!window.api?.cancelAllDownloads) return;
    try {
      await window.api.cancelAllDownloads();
      fetchDownloadTasks();
      fetchQueueState();
    } catch (err) {
      console.error("Failed to cancel all downloads:", err);
    }
  };

  const handleClearCompleted = async () => {
    if (!window.api?.clearCompletedDownloads) return;
    try {
      await window.api.clearCompletedDownloads();
      setDownloadTasks((prev) =>
        prev.filter(
          (t) =>
            t.status !== "completed" &&
            t.status !== "failed" &&
            t.status !== "cancelled"
        )
      );
      fetchQueueState();
    } catch (err) {
      console.error("Failed to clear completed downloads:", err);
    }
  };

  const handleSetConcurrency = async (newVal: number) => {
    if (!window.api?.setDownloadConcurrency) return;
    try {
      const res = await window.api.setDownloadConcurrency(newVal);
      setConcurrency(res.max_concurrent);
      fetchQueueState();
    } catch (err) {
      console.error("Failed to set concurrency:", err);
    }
  };

  const handleSetSpeedLimit = async (newVal: number) => {
    if (!window.api?.setSpeedLimit) return;
    try {
      const res = await window.api.setSpeedLimit(newVal);
      setSpeedLimitKbps(res.speed_limit_kbps);
    } catch (err) {
      console.error("Failed to set speed limit:", err);
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

          if (window.api.getFFmpegInfo) {
            try {
              const ffInfo = await window.api.getFFmpegInfo();
              setFfmpegInfo(ffInfo);
            } catch (err) {
              console.warn("Could not load initial FFmpeg info:", err);
            }
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

          // Initialize speed limit
          if (window.api.getSpeedLimit) {
            try {
              const sp = await window.api.getSpeedLimit();
              setSpeedLimitKbps(sp.speed_limit_kbps);
            } catch (err) {
              console.warn("Could not load initial speed limit:", err);
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

    const unsubPaused = window.api.onDownloadPaused?.((data) => {
      setDownloadTasks((prev) =>
        prev.map((t) => (t.id === data.task_id ? { ...t, status: "paused" } : t))
      );
      fetchQueueState();
    });

    const unsubResumed = window.api.onDownloadResumed?.((data) => {
      setDownloadTasks((prev) =>
        prev.map((t) => (t.id === data.task_id ? { ...t, status: "queued" } : t))
      );
      fetchQueueState();
    });

    const unsubCleared = window.api.onQueueCleared?.(() => {
      setDownloadTasks((prev) =>
        prev.filter(
          (t) =>
            t.status !== "completed" &&
            t.status !== "failed" &&
            t.status !== "cancelled"
        )
      );
      fetchQueueState();
    });

    const unsubRecovery = window.api.onRecoveryCompleted?.((summary) => {
      if (summary.recovered_count > 0 || summary.completed_count > 0) {
        setRecoveryBanner(summary);
        fetchDownloadTasks();
        fetchQueueState();
      }
    });

    return () => {
      unsubProgress?.();
      unsubCompleted?.();
      unsubPaused?.();
      unsubResumed?.();
      unsubCleared?.();
      unsubRecovery?.();
    };
  }, []);

  // Sync gallery selection when scanResult changes
  useEffect(() => {
    if (scanResult?.media_items && scanResult.media_items.length > 0) {
      setSelectedGalleryIds(new Set(scanResult.media_items.map((i) => i.id)));
    } else {
      setSelectedGalleryIds(new Set());
    }
  }, [scanResult]);

  // Fetch queue state when switching to downloads tab
  useEffect(() => {
    if (activeTab === "downloads") {
      fetchQueueState();
    }
  }, [activeTab]);

  // Keyboard shortcut listener for Modals & Lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (previewModal.isOpen) {
        if (e.key === "Escape") {
          setPreviewModal((prev) => ({ ...prev, isOpen: false }));
        } else if (previewModal.mode === "lightbox") {
          if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            setPreviewModal((prev) => ({
              ...prev,
              zoom: Math.min(4, Number((prev.zoom + 0.25).toFixed(2))),
            }));
          } else if (e.key === "-" || e.key === "_") {
            e.preventDefault();
            setPreviewModal((prev) => ({
              ...prev,
              zoom: Math.max(0.25, Number((prev.zoom - 0.25).toFixed(2))),
            }));
          } else if (e.key === "0") {
            e.preventDefault();
            setPreviewModal((prev) => ({ ...prev, zoom: 1, rotation: 0 }));
          } else if (e.key === "r" || e.key === "R") {
            e.preventDefault();
            setPreviewModal((prev) => ({
              ...prev,
              rotation: (prev.rotation + 90) % 360,
            }));
          }
        }
      } else if (exportModal.isOpen && e.key === "Escape") {
        setExportModal((prev) => ({ ...prev, isOpen: false }));
      } else if (deleteConfirm.isOpen && e.key === "Escape") {
        setDeleteConfirm((prev) => ({ ...prev, isOpen: false }));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    previewModal.isOpen,
    previewModal.mode,
    exportModal.isOpen,
    deleteConfirm.isOpen,
  ]);

  useEffect(() => {
    if (activeTab === "library" || activeTab === "saved") {
      fetchSavedMedia(
        savedMediaFilter,
        libraryQuery,
        libraryContainer,
        librarySort
      );
    } else if (activeTab === "history") {
      fetchScanHistory();
    } else if (activeTab === "downloads") {
      fetchDownloadTasks();
    }
  }, [activeTab, savedMediaFilter, libraryContainer, librarySort]);

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
              Milestone 18 / Saved Sources &amp; Incremental Rescan
            </span>
          </div>
          <div className="flex items-center space-x-3">
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
              <span>Context Isolation</span>
            </div>
            {pythonStatus?.connected && (
              <div className="flex items-center space-x-1.5 text-xs text-emerald-300 bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-800/50">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Python IPC</span>
              </div>
            )}
            {ffmpegInfo?.installed ? (
              <div className="flex items-center space-x-1.5 text-xs text-purple-300 bg-purple-950/40 px-3 py-1 rounded-full border border-purple-800/50">
                <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                <span>FFmpeg {ffmpegInfo.version?.split("-")[0] || "Active"}</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 text-xs text-amber-300 bg-amber-950/40 px-3 py-1 rounded-full border border-amber-800/50">
                <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                <span>FFmpeg Not Detected</span>
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

              {/* Saved Source Notification Banner */}
              {savedSourceStatus && (
                <div
                  className={`p-3 rounded-xl border text-xs font-mono flex items-center justify-between transition-all shadow-md ${
                    savedSourceStatus.isError
                      ? "bg-red-950/40 border-red-800/60 text-red-200"
                      : "bg-emerald-950/40 border-emerald-800/60 text-emerald-200"
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {savedSourceStatus.isError ? (
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    )}
                    <span>{savedSourceStatus.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("saved")}
                    className="px-2.5 py-1 bg-brand-dark hover:bg-neutral-800 rounded border border-brand-dark text-[11px] text-white flex items-center space-x-1"
                  >
                    <span>View Saved Sources</span>
                    <span>→</span>
                  </button>
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

                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded bg-brand-dark/80 border border-brand-dark text-xs font-mono text-neutral-300">
                        <span className="text-brand-red font-semibold">{selectedGalleryIds.size}</span> / {scanResult.media_items.length} Selected
                      </span>
                      <button
                        type="button"
                        onClick={handleSaveCurrentScanAsSource}
                        className="px-2.5 py-1.5 bg-brand-dark/80 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-brand-dark text-xs font-mono font-medium rounded-md flex items-center space-x-1.5 transition-all"
                        title="Bookmark this gallery source to track uploads and run incremental rescans"
                      >
                        <Bookmark className="h-3.5 w-3.5 text-amber-400" />
                        <span>Bookmark Source</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const selected = scanResult.media_items!.filter((i) =>
                            selectedGalleryIds.has(i.id)
                          );
                          handleStartBatchDownload(selected);
                        }}
                        disabled={batchDownloading || selectedGalleryIds.size === 0}
                        className="px-3 py-1.5 bg-brand-red hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-mono font-semibold rounded-md flex items-center space-x-1.5 transition-all shadow-sm shadow-brand-red/30"
                      >
                        {batchDownloading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {batchDownloading
                            ? "Queuing..."
                            : `Download Selected (${selectedGalleryIds.size})`}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
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

                    {/* Selection Controls */}
                    <div className="flex items-center space-x-1.5 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedGalleryIds(
                            new Set(scanResult.media_items!.map((i) => i.id))
                          )
                        }
                        className="px-2 py-1 bg-brand-dark/70 hover:bg-neutral-800 border border-brand-dark rounded text-[11px] font-mono text-neutral-300 transition-colors"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedGalleryIds(new Set())}
                        className="px-2 py-1 bg-brand-dark/70 hover:bg-neutral-800 border border-brand-dark rounded text-[11px] font-mono text-neutral-300 transition-colors"
                      >
                        Deselect All
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set<string>();
                          scanResult.media_items!.forEach((i) => {
                            if (!selectedGalleryIds.has(i.id)) next.add(i.id);
                          });
                          setSelectedGalleryIds(next);
                        }}
                        className="px-2 py-1 bg-brand-dark/70 hover:bg-neutral-800 border border-brand-dark rounded text-[11px] font-mono text-neutral-300 transition-colors"
                      >
                        Invert
                      </button>
                    </div>
                  </div>

                  {/* Grid of gallery items (paginated for high performance) */}
                  {(() => {
                    const GALLERY_PAGE_SIZE = 48;
                    const totalGalleryPages = Math.ceil(
                      (scanResult.media_items.length || 0) / GALLERY_PAGE_SIZE
                    );
                    const pagedGalleryItems = scanResult.media_items.slice(
                      (galleryPage - 1) * GALLERY_PAGE_SIZE,
                      galleryPage * GALLERY_PAGE_SIZE
                    );

                    return (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-96 overflow-y-auto pr-1">
                          {pagedGalleryItems.map((item, pageIdx) => {
                            const globalIdx =
                              (galleryPage - 1) * GALLERY_PAGE_SIZE + pageIdx;
                            const isSelected = selectedGalleryIds.has(item.id);
                            return (
                              <div
                                key={item.id || globalIdx}
                                onClick={() => {
                                  setSelectedGalleryIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(item.id)) next.delete(item.id);
                                    else next.add(item.id);
                                    return next;
                                  });
                                }}
                                className={`rounded-lg p-2 flex flex-col space-y-2 cursor-pointer transition-all ${
                                  isSelected
                                    ? "bg-brand-red/10 border border-brand-red/80 ring-1 ring-brand-red/40"
                                    : "bg-brand-black/70 border border-brand-dark hover:border-brand-dark/90"
                                }`}
                              >
                                <div className="w-full h-24 rounded bg-brand-black/90 border border-brand-dark/60 overflow-hidden flex items-center justify-center relative">
                                  {item.thumbnail_url ? (
                                    <img
                                      src={item.thumbnail_url}
                                      alt={item.title || `Item ${globalIdx + 1}`}
                                      loading="lazy"
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
                                      setSelectedGalleryIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(item.id)) next.delete(item.id);
                                        else next.add(item.id);
                                        return next;
                                      });
                                    }}
                                    className={`absolute top-1 left-1 p-1 rounded-md transition-all ${
                                      isSelected
                                        ? "bg-brand-red text-white"
                                        : "bg-black/60 text-neutral-400 hover:text-white"
                                    }`}
                                    title={isSelected ? "Deselect item" : "Select item"}
                                  >
                                    {isSelected ? (
                                      <CheckSquare className="h-3 w-3" />
                                    ) : (
                                      <Square className="h-3 w-3" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleBookmark(item);
                                    }}
                                    className={`absolute top-1 right-8 p-1 rounded-md transition-all ${
                                      bookmarkedIds.has(item.id)
                                        ? "bg-brand-red text-white shadow-sm shadow-brand-red/40"
                                        : "bg-black/60 text-neutral-300 hover:text-white"
                                    }`}
                                    title={
                                      bookmarkedIds.has(item.id)
                                        ? "Saved in Library"
                                        : "Bookmark to Library"
                                    }
                                  >
                                    <Bookmark
                                      className={`h-3 w-3 ${
                                        bookmarkedIds.has(item.id) ? "fill-current" : ""
                                      }`}
                                    />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenPreview(item);
                                    }}
                                    className="absolute top-1 right-1 p-1 rounded-md bg-black/60 hover:bg-black/90 text-neutral-300 hover:text-white transition-all shadow-sm"
                                    title="Preview item"
                                  >
                                    <Eye className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartDownload(item);
                                    }}
                                    disabled={downloadingIds.has(item.id)}
                                    className="absolute bottom-1 left-1 p-1 rounded-md bg-black/70 hover:bg-brand-red text-neutral-300 hover:text-white transition-all shadow-sm"
                                    title="Download single item"
                                  >
                                    {downloadingIds.has(item.id) ? (
                                      <Loader2 className="h-3 w-3 animate-spin text-white" />
                                    ) : (
                                      <Download className="h-3 w-3" />
                                    )}
                                  </button>
                                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 rounded text-[9px] font-mono text-neutral-300">
                                    #{globalIdx + 1}
                                  </span>
                                </div>
                                <div className="text-[11px] font-mono space-y-0.5">
                                  <p className="truncate text-brand-white font-medium">
                                    {item.title || `Item ${globalIdx + 1}`}
                                  </p>
                                  <div className="flex items-center justify-between text-[10px] text-neutral-400">
                                    <span className="uppercase">
                                      {item.available_formats[0]?.container || "IMG"}
                                    </span>
                                    <span>{formatBytes(item.filesize_bytes)}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {totalGalleryPages > 1 && (
                          <div className="flex items-center justify-between border-t border-brand-dark/50 pt-3 text-xs font-mono">
                            <span className="text-neutral-400">
                              Showing {(galleryPage - 1) * GALLERY_PAGE_SIZE + 1}–
                              {Math.min(
                                galleryPage * GALLERY_PAGE_SIZE,
                                scanResult.media_items.length
                              )}{" "}
                              of {scanResult.media_items.length} items
                            </span>
                            <div className="flex items-center space-x-1.5">
                              <button
                                type="button"
                                disabled={galleryPage <= 1}
                                onClick={() => setGalleryPage((p) => Math.max(1, p - 1))}
                                className="px-2.5 py-1 bg-brand-dark/80 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed border border-brand-dark rounded text-neutral-300 flex items-center space-x-1 transition-all"
                              >
                                <ChevronLeft className="h-3.5 w-3.5" />
                                <span>Prev</span>
                              </button>
                              <span className="px-2.5 py-1 bg-brand-black/80 border border-brand-dark rounded text-neutral-200">
                                Page {galleryPage} / {totalGalleryPages}
                              </span>
                              <button
                                type="button"
                                disabled={galleryPage >= totalGalleryPages}
                                onClick={() =>
                                  setGalleryPage((p) =>
                                    Math.min(totalGalleryPages, p + 1)
                                  )
                                }
                                className="px-2.5 py-1 bg-brand-dark/80 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed border border-brand-dark rounded text-neutral-300 flex items-center space-x-1 transition-all"
                              >
                                <span>Next</span>
                                <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  <div className="flex items-center justify-between border-t border-brand-dark/50 pt-2 text-[11px] font-mono">
                    <span className="text-neutral-400">
                      Total {scanResult.media_items.length} items enumerated without downloading
                    </span>
                    <span className="text-emerald-400 font-medium">
                      Multi-item batch queue active
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
                        onClick={handleSaveCurrentScanAsSource}
                        className="px-2.5 py-1 rounded text-xs font-mono font-medium flex items-center space-x-1.5 transition-all bg-brand-black/80 hover:bg-neutral-800 text-neutral-300 border border-brand-dark"
                        title="Bookmark this source URL to track uploads and run incremental rescans"
                      >
                        <Bookmark className="h-3.5 w-3.5 text-amber-400" />
                        <span>Bookmark Source</span>
                      </button>
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
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Available Streams ({scanResult.media_item.available_formats.length} formats):</span>
                            {selectedFormat && (
                              <span className="text-purple-300 font-semibold">
                                Selected: {selectedFormat.resolution || selectedFormat.format_id} ({selectedFormat.container})
                                {selectedFormat.requires_merge && " [FFmpeg Merge]"}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                            {scanResult.media_item.available_formats.slice(0, 10).map((fmt) => {
                              const isSelected = selectedFormat?.format_id === fmt.format_id;
                              return (
                                <button
                                  type="button"
                                  key={fmt.format_id}
                                  onClick={() => setSelectedFormat(fmt)}
                                  className={`px-2 py-0.5 rounded text-[10px] flex items-center space-x-1 font-mono transition-all ${
                                    isSelected
                                      ? "bg-purple-900/60 border border-purple-500 text-white shadow-sm shadow-purple-900/40"
                                      : "bg-brand-black/80 hover:bg-neutral-800 border border-brand-dark text-neutral-300"
                                  }`}
                                >
                                  <span className="font-medium">{fmt.resolution || fmt.format_id}</span>
                                  {fmt.container && (
                                    <span className="text-neutral-400 text-[9px]">({fmt.container})</span>
                                  )}
                                  {fmt.requires_merge && (
                                    <span className="text-purple-300 text-[9px] px-1 bg-purple-950/80 rounded border border-purple-800/60 flex items-center space-x-0.5">
                                      <Sparkles className="h-2 w-2 text-purple-400" />
                                      <span>merge</span>
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] pt-2 border-t border-brand-dark/50">
                        <span className="text-neutral-400 font-mono">
                          Discovered at: {new Date(scanResult.media_item.created_at).toLocaleTimeString()}
                        </span>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => handleOpenPreview(scanResult.media_item!)}
                            className="px-3.5 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark text-white rounded-lg text-xs font-mono font-medium flex items-center space-x-1.5 transition-all cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Preview</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartDownload(scanResult.media_item!, selectedFormat)}
                            disabled={downloadingIds.has(scanResult.media_item.id)}
                            className="px-4 py-1.5 bg-brand-red hover:bg-red-700 text-white rounded-lg text-xs font-mono font-medium flex items-center space-x-2 transition-all shadow-md shadow-brand-red/30 cursor-pointer"
                          >
                            {downloadingIds.has(scanResult.media_item.id) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                            <span>
                              {selectedFormat?.requires_merge
                                ? "Download & Merge (FFmpeg)"
                                : "Download Now"}
                            </span>
                          </button>
                        </div>
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

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs font-mono">
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
                  <div className="bg-brand-black/60 p-3 rounded-lg border border-brand-dark">
                    <span className="text-neutral-400 block mb-1">FFmpeg Processor:</span>
                    <span className={ffmpegInfo?.installed ? "text-purple-400" : "text-amber-400"}>
                      {ffmpegInfo?.installed
                        ? `Ready (${ffmpegInfo.version?.split("-")[0] || "Active"})`
                        : "Not Installed"}
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
                      <div className="col-span-2 truncate">
                        <span className="text-neutral-400">FFmpeg Binary: </span>
                        <span className="text-purple-300 font-mono text-[10px]">
                          {ffmpegInfo?.ffmpeg_path || "Not detected in PATH"}
                        </span>
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
                    Media Library &amp; Bookmarks
                  </h1>
                  <p className="text-sm text-neutral-400 mt-1">
                    Saved media items stored in your local SQLite library. Search, filter, inspect, and preview.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() =>
                      fetchSavedMedia(
                        savedMediaFilter,
                        libraryQuery,
                        libraryContainer,
                        librarySort
                      )
                    }
                    disabled={savedMediaLoading}
                    className="px-3 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark rounded-md text-xs font-mono text-neutral-300 flex items-center space-x-1.5 transition-colors"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${
                        savedMediaLoading ? "animate-spin" : ""
                      }`}
                    />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Search & Filter Toolbar */}
              <div className="bg-brand-dark/30 border border-brand-dark p-3.5 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row gap-2.5">
                  {/* Search Bar */}
                  <div className="relative flex-1">
                    <Search className="h-4 w-4 text-neutral-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={libraryQuery}
                      onChange={(e) => {
                        setLibraryQuery(e.target.value);
                        fetchSavedMedia(
                          savedMediaFilter,
                          e.target.value,
                          libraryContainer,
                          librarySort
                        );
                      }}
                      placeholder="Search title, author, URL in library..."
                      className="w-full bg-brand-black/80 border border-brand-dark rounded-lg pl-9 pr-8 py-2 text-xs text-brand-white placeholder-neutral-400 focus:outline-none focus:border-brand-red font-mono"
                    />
                    {libraryQuery && (
                      <button
                        onClick={() => {
                          setLibraryQuery("");
                          fetchSavedMedia(
                            savedMediaFilter,
                            "",
                            libraryContainer,
                            librarySort
                          );
                        }}
                        className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Container Format Filter Dropdown */}
                  <div className="flex items-center space-x-1.5 bg-brand-black/80 border border-brand-dark rounded-lg px-2.5 py-1.5 shrink-0">
                    <Filter className="h-3.5 w-3.5 text-neutral-400" />
                    <select
                      value={libraryContainer}
                      onChange={(e) => setLibraryContainer(e.target.value)}
                      className="bg-transparent text-xs font-mono text-neutral-200 focus:outline-none cursor-pointer"
                    >
                      <option value="all" className="bg-brand-black">All Containers</option>
                      <option value="mp4" className="bg-brand-black">MP4 Video</option>
                      <option value="webm" className="bg-brand-black">WEBM Video</option>
                      <option value="mkv" className="bg-brand-black">MKV Video</option>
                      <option value="jpg" className="bg-brand-black">JPG / JPEG Image</option>
                      <option value="png" className="bg-brand-black">PNG Image</option>
                      <option value="webp" className="bg-brand-black">WEBP Image</option>
                      <option value="gif" className="bg-brand-black">GIF Image</option>
                      <option value="mp3" className="bg-brand-black">MP3 Audio</option>
                      <option value="m4a" className="bg-brand-black">M4A Audio</option>
                    </select>
                  </div>

                  {/* Sort Order Dropdown */}
                  <div className="flex items-center space-x-1.5 bg-brand-black/80 border border-brand-dark rounded-lg px-2.5 py-1.5 shrink-0">
                    <ArrowUpDown className="h-3.5 w-3.5 text-neutral-400" />
                    <select
                      value={librarySort}
                      onChange={(e) =>
                        setLibrarySort(
                          e.target.value as typeof librarySort
                        )
                      }
                      className="bg-transparent text-xs font-mono text-neutral-200 focus:outline-none cursor-pointer"
                    >
                      <option value="newest" className="bg-brand-black">Newest First</option>
                      <option value="oldest" className="bg-brand-black">Oldest First</option>
                      <option value="title" className="bg-brand-black">Title (A-Z)</option>
                      <option value="size_desc" className="bg-brand-black">Size (Largest)</option>
                      <option value="size_asc" className="bg-brand-black">Size (Smallest)</option>
                    </select>
                  </div>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center justify-between pt-1 border-t border-brand-dark/50">
                  <div className="flex items-center space-x-2">
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
                        {filter === "all" ? "All Types" : `${filter}s`}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs font-mono text-neutral-400">
                    {savedMediaItems.length} {savedMediaItems.length === 1 ? "item" : "items"} found
                  </span>
                </div>
              </div>

              {savedMediaLoading && savedMediaItems.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3 text-neutral-400">
                  <Loader2 className="h-6 w-6 animate-spin text-brand-red" />
                  <span className="text-xs font-mono">Loading saved library from SQLite...</span>
                </div>
              ) : savedMediaItems.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3 bg-brand-dark/20 border border-brand-dark/60 rounded-xl text-center p-8">
                  <FolderArchive className="h-10 w-10 text-neutral-400 stroke-1" />
                  <h3 className="text-sm font-semibold text-brand-white">No Matching Media Items</h3>
                  <p className="text-xs text-neutral-400 max-w-sm">
                    {libraryQuery || libraryContainer !== "all" || savedMediaFilter !== "all"
                      ? "No saved media match your current search and filter criteria."
                      : "Bookmark media items while scanning URLs to save them to your local collection."}
                  </p>
                  {(libraryQuery || libraryContainer !== "all" || savedMediaFilter !== "all") ? (
                    <button
                      onClick={() => {
                        setLibraryQuery("");
                        setLibraryContainer("all");
                        setSavedMediaFilter("all");
                        fetchSavedMedia("all", "", "all", librarySort);
                      }}
                      className="mt-2 px-4 py-2 bg-brand-dark hover:bg-neutral-800 text-white rounded-lg text-xs font-mono transition-colors"
                    >
                      Reset Filters
                    </button>
                  ) : (
                    <button
                      onClick={() => setActiveTab("scan")}
                      className="mt-2 px-4 py-2 bg-brand-red hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      Discover Media in Scanner
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {savedMediaItems.map((item) => {
                    const completedDl = completedDownloadsMap.get(item.id);
                    const isDownloaded = Boolean(completedDl?.destination_path);

                    return (
                      <div
                        key={item.id}
                        className="bg-brand-dark/30 border border-brand-dark rounded-xl p-3.5 flex flex-col justify-between space-y-3 hover:border-brand-dark/90 transition-all group"
                      >
                        <div className="space-y-2.5">
                          {/* Card Thumbnail with Overlay */}
                          <div
                            onClick={() =>
                              handleOpenPreview(item, completedDl?.destination_path)
                            }
                            className="w-full h-36 rounded-lg bg-brand-black/90 border border-brand-dark overflow-hidden flex items-center justify-center relative cursor-pointer group/thumb"
                          >
                            {item.thumbnail_url ? (
                              <img
                                src={item.thumbnail_url}
                                alt={item.title || "Media preview"}
                                loading="lazy"
                                className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300"
                              />
                            ) : item.media_type === "video" ? (
                              <Film className="h-8 w-8 text-purple-400" />
                            ) : item.media_type === "audio" ? (
                              <Music className="h-8 w-8 text-pink-400" />
                            ) : (
                              <ImageIcon className="h-8 w-8 text-emerald-400" />
                            )}

                            {/* Hover Preview Overlay */}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center space-x-2 transition-opacity">
                              <span className="p-2.5 rounded-full bg-brand-red/90 text-white shadow-lg shadow-brand-red/40 flex items-center justify-center">
                                {item.media_type === "image" ? (
                                  <ZoomIn className="h-4 w-4" />
                                ) : (
                                  <Play className="h-4 w-4 fill-current ml-0.5" />
                                )}
                              </span>
                              <span className="text-[11px] font-mono text-white font-semibold">
                                Preview
                              </span>
                            </div>

                            {/* Tags */}
                            <div className="absolute top-2 left-2 flex items-center space-x-1.5">
                              <span className="px-2 py-0.5 bg-black/80 rounded text-[10px] font-mono uppercase text-neutral-200">
                                {item.media_type}
                              </span>
                              {isDownloaded && (
                                <span className="px-1.5 py-0.5 bg-emerald-950/80 border border-emerald-600/60 rounded text-[9px] font-mono text-emerald-300">
                                  Saved to Disk
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleBookmark(item);
                              }}
                              className="absolute top-2 right-2 p-1.5 rounded bg-brand-red text-white shadow-md shadow-brand-red/40 hover:bg-red-700 transition-colors"
                              title="Remove from saved library"
                            >
                              <Bookmark className="h-3.5 w-3.5 fill-current" />
                            </button>
                          </div>

                          <div className="space-y-1">
                            <h4
                              className="text-xs font-bold text-brand-white truncate font-sans cursor-pointer hover:text-brand-red transition-colors"
                              title={item.title || ""}
                              onClick={() =>
                                handleOpenPreview(item, completedDl?.destination_path)
                              }
                            >
                              {item.title || "Untitled Item"}
                            </h4>
                            <p className="text-[11px] font-mono text-neutral-400 truncate">
                              Author:{" "}
                              <span className="text-neutral-200">
                                {item.author || "Unknown"}
                              </span>
                            </p>
                            <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 pt-1">
                              <span>{formatBytes(item.filesize_bytes)}</span>
                              <span>{new Date(item.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        {/* Card Actions Bar */}
                        <div className="border-t border-brand-dark/60 pt-2 flex items-center justify-between text-xs font-mono">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() =>
                                handleOpenPreview(item, completedDl?.destination_path)
                              }
                              className="text-neutral-300 hover:text-white flex items-center space-x-1"
                              title="Preview media"
                            >
                              <Eye className="h-3 w-3" />
                              <span>Preview</span>
                            </button>

                            <button
                              onClick={() => handleStartDownload(item)}
                              disabled={downloadingIds.has(item.id)}
                              className="text-emerald-400 hover:text-emerald-300 flex items-center space-x-1"
                              title={isDownloaded ? "Redownload media" : "Download media"}
                            >
                              {downloadingIds.has(item.id) ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Download className="h-3 w-3" />
                              )}
                              <span>{isDownloaded ? "Redownload" : "Download"}</span>
                            </button>

                            <button
                              onClick={() => handleOpenExportModal(item)}
                              className="text-purple-400 hover:text-purple-300 flex items-center space-x-1"
                              title="Export metadata JSON"
                            >
                              <FileJson className="h-3 w-3" />
                              <span>JSON</span>
                            </button>
                          </div>

                          <button
                            onClick={() =>
                              handlePromptDelete(item, completedDl?.destination_path)
                            }
                            className="text-red-400/80 hover:text-red-400 flex items-center space-x-1"
                            title="Delete item"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
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

                <div className="flex flex-wrap items-center gap-2">
                  {/* Concurrency Selector */}
                  <div className="flex items-center space-x-1.5 bg-brand-dark/70 border border-brand-dark px-2.5 py-1 rounded-md text-xs font-mono">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-neutral-400" />
                    <span className="text-neutral-400">Slots:</span>
                    {[1, 2, 3, 5, 8].map((num) => (
                      <button
                        key={num}
                        onClick={() => handleSetConcurrency(num)}
                        className={`px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                          concurrency === num
                            ? "bg-brand-red text-white font-bold"
                            : "text-neutral-400 hover:text-white"
                        }`}
                        title={`Set max concurrent active downloads to ${num}`}
                      >
                        {num}
                      </button>
                    ))}
                    {queueState && (
                      <span className="text-[10px] text-neutral-400 border-l border-brand-dark/80 pl-1.5">
                        {queueState.active_count} active / {queueState.pending_count} queued
                      </span>
                    )}
                  </div>

                  {/* Quick Bandwidth Speed Limit Selector */}
                  <div className="flex items-center space-x-1.5 bg-brand-dark/70 border border-brand-dark px-2.5 py-1 rounded-md text-xs font-mono">
                    <Gauge className="h-3.5 w-3.5 text-cyan-400" />
                    <span className="text-neutral-400">Limit:</span>
                    {[
                      { label: "∞", val: 0, title: "Unlimited speed" },
                      { label: "500K", val: 500, title: "500 KB/s limit" },
                      { label: "1M", val: 1024, title: "1 MB/s limit" },
                      { label: "2M", val: 2048, title: "2 MB/s limit" },
                      { label: "5M", val: 5120, title: "5 MB/s limit" },
                      { label: "10M", val: 10240, title: "10 MB/s limit" },
                    ].map((item) => (
                      <button
                        key={item.val}
                        onClick={() => handleSetSpeedLimit(item.val)}
                        className={`px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                          speedLimitKbps === item.val
                            ? "bg-cyan-600 text-white font-bold"
                            : "text-neutral-400 hover:text-white"
                        }`}
                        title={item.title}
                      >
                        {item.label}
                      </button>
                    ))}
                    {speedLimitKbps > 0 &&
                      ![500, 1024, 2048, 5120, 10240].includes(speedLimitKbps) && (
                        <span className="px-1.5 py-0.5 rounded text-[11px] bg-cyan-600 text-white font-bold">
                          {speedLimitKbps >= 1024
                            ? `${(speedLimitKbps / 1024).toFixed(1)}M`
                            : `${speedLimitKbps}K`}
                        </span>
                      )}
                  </div>

                  {/* Batch Global Actions */}
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={handlePauseAll}
                      className="px-2.5 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark rounded-md text-xs font-mono text-blue-300 flex items-center space-x-1 transition-colors"
                      title="Pause all running & queued downloads"
                    >
                      <Pause className="h-3 w-3" />
                      <span>Pause All</span>
                    </button>
                    <button
                      onClick={handleResumeAll}
                      className="px-2.5 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark rounded-md text-xs font-mono text-emerald-300 flex items-center space-x-1 transition-colors"
                      title="Resume all paused downloads"
                    >
                      <Play className="h-3 w-3" />
                      <span>Resume All</span>
                    </button>
                    <button
                      onClick={handleCancelAll}
                      className="px-2.5 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark rounded-md text-xs font-mono text-amber-300 flex items-center space-x-1 transition-colors"
                      title="Cancel all active & queued downloads"
                    >
                      <XCircle className="h-3 w-3" />
                      <span>Cancel All</span>
                    </button>
                    <button
                      onClick={handleClearCompleted}
                      className="px-2.5 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark rounded-md text-xs font-mono text-neutral-400 hover:text-red-300 flex items-center space-x-1 transition-colors"
                      title="Clear completed, failed & cancelled tasks from list"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Clear Finished</span>
                    </button>
                  </div>

                  {pythonStatus?.info?.download_dir && (
                    <button
                      onClick={() => handleOpenFileOrFolder(pythonStatus.info?.download_dir)}
                      className="px-3 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark rounded-md text-xs font-mono text-neutral-300 flex items-center space-x-1.5 transition-colors"
                      title={`Open ${pythonStatus.info.download_dir}`}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span>Folder</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      fetchDownloadTasks();
                      fetchQueueState();
                    }}
                    disabled={downloadTasksLoading}
                    className="px-3 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark rounded-md text-xs font-mono text-neutral-300 flex items-center space-x-1.5 transition-colors"
                    title="Refresh download queue"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${downloadTasksLoading ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    onClick={() => handleRecoverTasks(true)}
                    disabled={isRecovering}
                    className="px-3 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark rounded-md text-xs font-mono text-amber-300 flex items-center space-x-1.5 transition-colors"
                    title="Scan and recover interrupted download tasks from disk & database"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRecovering ? "animate-spin text-amber-400" : ""}`} />
                    <span>Recover</span>
                  </button>
                </div>
              </div>

              {/* Interrupted Tasks Crash Recovery Banner */}
              {recoveryBanner && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between gap-4 text-amber-200">
                  <div className="flex items-center gap-3">
                    <RefreshCw className="w-5 h-5 text-amber-400 flex-shrink-0 animate-pulse" />
                    <div>
                      <p className="text-sm font-semibold text-white">Session Recovery</p>
                      <p className="text-xs text-amber-300/80 mt-0.5">{recoveryBanner.message}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {recoveryBanner.paused_count > 0 && (
                      <button
                        onClick={handleResumeAll}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold shadow-md transition"
                      >
                        Resume All ({recoveryBanner.paused_count})
                      </button>
                    )}
                    <button
                      onClick={() => setRecoveryBanner(null)}
                      className="px-2.5 py-1.5 text-neutral-400 hover:text-white rounded-lg text-xs transition"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

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
                    id: "paused",
                    label: "Paused",
                    count: downloadTasks.filter((t) => t.status === "paused").length,
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
                    onClick={() => {
                      setDownloadFilter(tab.id as typeof downloadFilter);
                      setQueuePage(1);
                    }}
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
                  if (downloadFilter === "paused") {
                    return t.status === "paused";
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

                const QUEUE_PAGE_SIZE = 30;
                const totalQueuePages = Math.ceil(filtered.length / QUEUE_PAGE_SIZE);
                const pagedTasks = filtered.slice(
                  (queuePage - 1) * QUEUE_PAGE_SIZE,
                  queuePage * QUEUE_PAGE_SIZE
                );

                return (
                  <div className="space-y-3">
                    {pagedTasks.map((task) => {
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
                                    loading="lazy"
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
                              {task.status === "merging" && (
                                <span className="px-2.5 py-1 rounded-md text-xs font-mono uppercase bg-purple-950/70 border border-purple-700/80 text-purple-300 flex items-center space-x-1.5 animate-pulse shadow-sm shadow-purple-900/40">
                                  <Sparkles className="h-3 w-3 animate-spin text-purple-400" />
                                  <span>FFmpeg Merging</span>
                                </span>
                              )}
                              {(task.status === "downloading" || task.status === "queued") && (
                                <span className="px-2.5 py-1 rounded-md text-xs font-mono uppercase bg-amber-950/60 border border-amber-800/60 text-amber-300 flex items-center space-x-1.5">
                                  <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                                  <span>{task.status}</span>
                                </span>
                              )}
                              {task.status === "paused" && (
                                <span className="px-2.5 py-1 rounded-md text-xs font-mono uppercase bg-blue-950/70 border border-blue-700/80 text-blue-300 flex items-center space-x-1.5 shadow-sm shadow-blue-900/40">
                                  <Pause className="h-3.5 w-3.5 text-blue-400" />
                                  <span>Paused</span>
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
                                <div className="flex items-center space-x-1.5">
                                  <button
                                    onClick={() => handlePauseDownload(task.id)}
                                    className="px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-md text-xs font-mono text-blue-300 flex items-center space-x-1 transition-colors"
                                    title="Pause active download"
                                  >
                                    <Pause className="h-3.5 w-3.5" />
                                    <span>Pause</span>
                                  </button>
                                  <button
                                    onClick={() => handleCancelDownload(task.id)}
                                    className="px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-md text-xs font-mono text-red-300 flex items-center space-x-1 transition-colors"
                                    title="Cancel active download"
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                    <span>Cancel</span>
                                  </button>
                                </div>
                              )}
                              {task.status === "paused" && (
                                <div className="flex items-center space-x-1.5">
                                  <button
                                    onClick={() => handleResumeDownload(task.id)}
                                    className="px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-md text-xs font-mono text-emerald-300 flex items-center space-x-1 transition-colors"
                                    title="Resume paused download"
                                  >
                                    <Play className="h-3.5 w-3.5" />
                                    <span>Resume</span>
                                  </button>
                                  <button
                                    onClick={() => handleCancelDownload(task.id)}
                                    className="px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-md text-xs font-mono text-red-300 flex items-center space-x-1 transition-colors"
                                    title="Cancel paused download"
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                    <span>Cancel</span>
                                  </button>
                                </div>
                              )}
                              {isCompleted && task.destination_path && (
                                <div className="flex items-center space-x-1.5">
                                  <button
                                    onClick={() =>
                                      handleOpenPreview(
                                        task.media_item,
                                        task.destination_path
                                      )
                                    }
                                    className="px-2.5 py-1.5 bg-sky-950/40 hover:bg-sky-900/50 border border-sky-800/60 rounded-md text-xs font-mono text-sky-300 flex items-center space-x-1.5 transition-colors cursor-pointer"
                                    title="Preview downloaded file"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    <span>Preview</span>
                                  </button>
                                  <button
                                    onClick={() => handleOpenFileOrFolder(task.destination_path)}
                                    className="px-2.5 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/60 rounded-md text-xs font-mono text-emerald-300 flex items-center space-x-1.5 transition-colors cursor-pointer"
                                    title={`Show in folder: ${task.destination_path}`}
                                  >
                                    <FolderOpen className="h-3.5 w-3.5" />
                                    <span>Show File</span>
                                  </button>
                                  <button
                                    onClick={() =>
                                      handlePromptDelete(task.media_item, task.destination_path)
                                    }
                                    className="p-1.5 bg-red-950/30 hover:bg-red-900/40 border border-red-800/40 rounded-md text-red-300 flex items-center justify-center transition-colors cursor-pointer"
                                    title="Delete task and downloaded file"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
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

                            {/* Merging detail status */}
                            {task.status === "merging" && (
                              <div className="text-[11px] font-mono text-purple-300 bg-purple-950/40 p-2.5 rounded-lg border border-purple-800/50 flex items-center space-x-2">
                                <Sparkles className="h-3.5 w-3.5 text-purple-400 shrink-0 animate-spin" />
                                <span>{task.error_message || "Multiplexing separate video & audio streams using FFmpeg..."}</span>
                              </div>
                            )}

                            {/* Error message detail if failed */}
                            {task.status === "failed" && task.error_message && (
                              <div className="text-[11px] font-mono text-red-300 bg-red-950/40 p-2.5 rounded-lg border border-red-800/40">
                                Error: {task.error_message}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {totalQueuePages > 1 && (
                      <div className="flex items-center justify-between border-t border-brand-dark/50 pt-3 text-xs font-mono">
                        <span className="text-neutral-400">
                          Showing {(queuePage - 1) * QUEUE_PAGE_SIZE + 1}–
                          {Math.min(
                            queuePage * QUEUE_PAGE_SIZE,
                            filtered.length
                          )}{" "}
                          of {filtered.length} tasks
                        </span>
                        <div className="flex items-center space-x-1.5">
                          <button
                            type="button"
                            disabled={queuePage <= 1}
                            onClick={() => setQueuePage((p) => Math.max(1, p - 1))}
                            className="px-2.5 py-1 bg-brand-dark/80 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed border border-brand-dark rounded text-neutral-300 flex items-center space-x-1 transition-all"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            <span>Prev</span>
                          </button>
                          <span className="px-2.5 py-1 bg-brand-black/80 border border-brand-dark rounded text-neutral-200">
                            Page {queuePage} / {totalQueuePages}
                          </span>
                          <button
                            type="button"
                            disabled={queuePage >= totalQueuePages}
                            onClick={() =>
                              setQueuePage((p) => Math.min(totalQueuePages, p + 1))
                            }
                            className="px-2.5 py-1 bg-brand-dark/80 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed border border-brand-dark rounded text-neutral-300 flex items-center space-x-1 transition-all"
                          >
                            <span>Next</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 5: SAVED SOURCES & DIFFERENTIAL RESCAN */}
          {activeTab === "saved" && (
            <SavedSourcesView
              onScanUrl={(url) => {
                setUrlInput(url);
                setActiveTab("scan");
              }}
              onBatchDownload={(items) => {
                handleStartBatchDownload(items);
              }}
              onNavigateToDownloads={() => setActiveTab("downloads")}
            />
          )}

          {/* TAB 6: APPLICATION SETTINGS */}
          {activeTab === "settings" && (
            <SettingsView
              systemInfo={systemInfo}
              pythonStatus={pythonStatus}
              ffmpegInfo={ffmpegInfo}
              onConcurrencyChange={(val) => setConcurrency(val)}
              onSpeedLimitChange={(val) => setSpeedLimitKbps(val)}
            />
          )}

          {activeTab !== "scan" &&
            activeTab !== "history" &&
            activeTab !== "library" &&
            activeTab !== "saved" &&
            activeTab !== "downloads" &&
            activeTab !== "settings" && (
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

      {/* ========================================================= */}
      {/* MODAL 1: MEDIA PREVIEW (IMAGE LIGHTBOX & AUDIO/VIDEO PLAYER) */}
      {/* ========================================================= */}
      {previewModal.isOpen && previewModal.mediaItem && (
        <>
          {previewModal.mode === "lightbox" ? (
            /* High-Resolution Image Lightbox Modal */
            <div
              className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-6 select-none animate-in fade-in duration-200"
              onClick={() => setPreviewModal((prev) => ({ ...prev, isOpen: false }))}
            >
              {/* Lightbox Header Bar */}
              <div
                className="flex items-center justify-between z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="space-y-0.5 max-w-xl">
                  <h3 className="text-sm font-bold text-white truncate">
                    {previewModal.mediaItem.title || "Image Preview"}
                  </h3>
                  <div className="flex items-center space-x-2 text-xs font-mono text-neutral-400">
                    <span>Author: {previewModal.mediaItem.author || "Unknown"}</span>
                    <span>·</span>
                    <span className="uppercase text-emerald-400">
                      {previewModal.mediaItem.available_formats[0]?.container || "IMAGE"}
                    </span>
                    {previewModal.localPath && (
                      <span className="px-1.5 py-0.5 bg-emerald-950/80 border border-emerald-600/60 rounded text-[10px] text-emerald-300">
                        Local File
                      </span>
                    )}
                  </div>
                </div>

                {/* Toolbar Controls */}
                <div className="flex items-center space-x-2 bg-brand-black/80 border border-brand-dark rounded-xl px-3 py-1.5 shadow-xl">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewModal((prev) => ({
                        ...prev,
                        zoom: Math.max(0.25, Number((prev.zoom - 0.25).toFixed(2))),
                      }))
                    }
                    className="p-1.5 text-neutral-300 hover:text-white rounded hover:bg-brand-dark transition-colors"
                    title="Zoom Out (-)"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>

                  <span className="text-xs font-mono font-medium text-neutral-200 min-w-12 text-center">
                    {Math.round(previewModal.zoom * 100)}%
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setPreviewModal((prev) => ({
                        ...prev,
                        zoom: Math.min(4, Number((prev.zoom + 0.25).toFixed(2))),
                      }))
                    }
                    className="p-1.5 text-neutral-300 hover:text-white rounded hover:bg-brand-dark transition-colors"
                    title="Zoom In (+)"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setPreviewModal((prev) => ({ ...prev, zoom: 1, rotation: 0 }))
                    }
                    className="p-1.5 text-neutral-300 hover:text-white rounded hover:bg-brand-dark transition-colors"
                    title="Reset Zoom (0)"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setPreviewModal((prev) => ({
                        ...prev,
                        rotation: (prev.rotation + 90) % 360,
                      }))
                    }
                    className="p-1.5 text-neutral-300 hover:text-white rounded hover:bg-brand-dark transition-colors"
                    title="Rotate 90° (R)"
                  >
                    <RotateCw className="h-4 w-4" />
                  </button>

                  <div className="h-4 w-px bg-brand-dark mx-1" />

                  <button
                    type="button"
                    onClick={() => setPreviewModal((prev) => ({ ...prev, isOpen: false }))}
                    className="p-1.5 text-neutral-400 hover:text-red-400 rounded hover:bg-brand-dark transition-colors"
                    title="Close (Escape)"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Lightbox Center Image Viewport */}
              <div
                className="flex-1 flex items-center justify-center overflow-hidden p-4 cursor-grab"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={
                    previewModal.localPath && window.api?.toMediaLoaderUrl
                      ? window.api.toMediaLoaderUrl(previewModal.localPath)
                      : previewModal.mediaItem.original_url ||
                        previewModal.mediaItem.thumbnail_url ||
                        ""
                  }
                  alt={previewModal.mediaItem.title || "Preview"}
                  style={{
                    transform: `scale(${previewModal.zoom}) rotate(${previewModal.rotation}deg)`,
                    transition: "transform 0.15s ease-out",
                  }}
                  className="max-w-full max-h-[75vh] object-contain shadow-2xl rounded-md pointer-events-auto"
                />
              </div>

              {/* Lightbox Footer Bar */}
              <div
                className="flex items-center justify-between z-10 text-xs font-mono text-neutral-400 border-t border-neutral-800/80 pt-3"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center space-x-3">
                  <span>Size: {formatBytes(previewModal.mediaItem.filesize_bytes)}</span>
                  <span>·</span>
                  <span>
                    Resolution:{" "}
                    {previewModal.mediaItem.available_formats[0]?.resolution ||
                      "Original Quality"}
                  </span>
                  <span>·</span>
                  <span className="truncate max-w-sm text-neutral-400">
                    {previewModal.localPath || previewModal.mediaItem.source_url}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  {previewModal.localPath ? (
                    <button
                      type="button"
                      onClick={() => handleOpenFileOrFolder(previewModal.localPath)}
                      className="px-3 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark rounded-md text-white flex items-center space-x-1.5 transition-colors"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span>Show in Folder</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStartDownload(previewModal.mediaItem!)}
                      className="px-3 py-1.5 bg-brand-red hover:bg-red-700 text-white rounded-md flex items-center space-x-1.5 transition-colors shadow-md shadow-brand-red/30"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download Image</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOpenExportModal(previewModal.mediaItem!)}
                    className="px-3 py-1.5 bg-brand-black/80 hover:bg-brand-dark border border-brand-dark rounded-md text-purple-300 flex items-center space-x-1.5 transition-colors"
                  >
                    <FileJson className="h-3.5 w-3.5" />
                    <span>Export JSON</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Video / Audio In-App Media Player Modal */
            <div
              className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 select-none animate-in fade-in duration-200"
              onClick={() => setPreviewModal((prev) => ({ ...prev, isOpen: false }))}
            >
              <div
                className="bg-brand-black border border-brand-dark rounded-2xl w-full max-w-4xl p-6 shadow-2xl space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Player Header */}
                <div className="flex items-center justify-between border-b border-brand-dark/60 pb-3">
                  <div className="space-y-0.5 min-w-0 pr-4">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-brand-white truncate">
                        {previewModal.mediaItem.title || "Media Player"}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-brand-dark border border-brand-dark text-neutral-300 shrink-0">
                        {previewModal.mediaItem.available_formats[0]?.container ||
                          previewModal.mediaItem.media_type}
                      </span>
                      {previewModal.localPath && (
                        <span className="px-1.5 py-0.5 bg-emerald-950/80 border border-emerald-600/60 rounded text-[10px] font-mono text-emerald-300 shrink-0">
                          Direct Local Stream
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-neutral-400 truncate">
                      Author: {previewModal.mediaItem.author || "Unknown"} · Source:{" "}
                      {previewModal.mediaItem.source_url}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPreviewModal((prev) => ({ ...prev, isOpen: false }))}
                    className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-brand-dark transition-colors"
                    title="Close Player (Escape)"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Player Body */}
                <div className="flex flex-col items-center justify-center bg-black/90 rounded-xl overflow-hidden border border-brand-dark/80 min-h-64 relative">
                  {previewModal.mediaItem.media_type === "audio" ? (
                    /* Audio Player Layout */
                    <div className="py-12 px-8 w-full max-w-lg flex flex-col items-center space-y-6">
                      <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-pink-600 to-purple-600 flex items-center justify-center shadow-xl shadow-pink-900/30 animate-pulse">
                        <Music className="h-10 w-10 text-white" />
                      </div>
                      <div className="text-center space-y-1">
                        <h4 className="font-bold text-sm text-white">
                          {previewModal.mediaItem.title || "Audio Track"}
                        </h4>
                        <p className="text-xs font-mono text-neutral-400">
                          {previewModal.mediaItem.author}
                        </p>
                      </div>
                      <audio
                        ref={mediaPlayerRef as React.RefObject<HTMLAudioElement>}
                        controls
                        autoPlay
                        src={
                          previewModal.localPath && window.api?.toMediaLoaderUrl
                            ? window.api.toMediaLoaderUrl(previewModal.localPath)
                            : previewModal.mediaItem.available_formats.find((f) => f.url)?.url ||
                              previewModal.mediaItem.original_url
                        }
                        className="w-full"
                      />
                    </div>
                  ) : (
                    /* Video Player Layout */
                    <video
                      ref={mediaPlayerRef as React.RefObject<HTMLVideoElement>}
                      controls
                      autoPlay
                      src={
                        previewModal.localPath && window.api?.toMediaLoaderUrl
                          ? window.api.toMediaLoaderUrl(previewModal.localPath)
                          : previewModal.mediaItem.available_formats.find((f) => f.url)?.url ||
                            previewModal.mediaItem.original_url
                      }
                      className="w-full max-h-[62vh] rounded-xl bg-black object-contain shadow-2xl"
                    />
                  )}
                </div>

                {/* Player Controls & Diagnostics Bar */}
                <div className="flex items-center justify-between text-xs font-mono text-neutral-400 pt-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] text-neutral-400">Speed:</span>
                    {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                      <button
                        type="button"
                        key={rate}
                        onClick={() => handleSetPlaybackRate(rate)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                          playbackSpeed === rate
                            ? "bg-brand-red text-white font-semibold"
                            : "bg-brand-dark/60 text-neutral-400 hover:text-white"
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center space-x-2">
                    {previewModal.localPath ? (
                      <button
                        type="button"
                        onClick={() => handleOpenFileOrFolder(previewModal.localPath)}
                        className="px-3 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark rounded-md text-white flex items-center space-x-1.5 transition-colors"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        <span>Show File</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartDownload(previewModal.mediaItem!)}
                        className="px-3 py-1.5 bg-brand-red hover:bg-red-700 text-white rounded-md flex items-center space-x-1.5 transition-colors shadow-md shadow-brand-red/30"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download Stream</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenExportModal(previewModal.mediaItem!)}
                      className="px-3 py-1.5 bg-brand-black/80 hover:bg-brand-dark border border-brand-dark rounded-md text-purple-300 flex items-center space-x-1.5 transition-colors"
                    >
                      <FileJson className="h-3.5 w-3.5" />
                      <span>Export JSON</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: METADATA EXPORT MODAL */}
      {/* ========================================================= */}
      {exportModal.isOpen && exportModal.mediaItem && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 select-none animate-in fade-in duration-200"
          onClick={() => setExportModal((prev) => ({ ...prev, isOpen: false }))}
        >
          <div
            className="bg-brand-black border border-brand-dark rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-brand-dark/60 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-purple-950/80 border border-purple-800/60 text-purple-300">
                  <FileJson className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Media Metadata Export</h3>
                  <p className="text-xs font-mono text-neutral-400">
                    Comprehensive JSON export of media discovery details and download task state.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExportModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-brand-dark transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* JSON Code Viewer */}
            {exportModal.loading ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-3 text-neutral-400">
                <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                <span className="text-xs font-mono">Generating formatted metadata JSON...</span>
              </div>
            ) : (
              <pre className="bg-brand-dark/40 border border-brand-dark/80 rounded-xl p-4 text-xs font-mono text-emerald-300 max-h-96 overflow-y-auto whitespace-pre-wrap select-text leading-relaxed">
                {JSON.stringify(exportModal.metadata, null, 2)}
              </pre>
            )}

            {/* Actions Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-brand-dark/60">
              <span className="text-[11px] font-mono text-neutral-400">
                Item ID: {exportModal.mediaItem.id}
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!exportModal.metadata) return;
                    await navigator.clipboard.writeText(
                      JSON.stringify(exportModal.metadata, null, 2)
                    );
                    setExportModal((prev) => ({ ...prev, copied: true }));
                    setTimeout(() => {
                      setExportModal((prev) => ({ ...prev, copied: false }));
                    }, 2000);
                  }}
                  className="px-3.5 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark text-xs font-mono text-white rounded-lg flex items-center space-x-1.5 transition-colors"
                >
                  {exportModal.copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy JSON</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!exportModal.metadata) return;
                    const jsonStr = JSON.stringify(exportModal.metadata, null, 2);
                    const blob = new Blob([jsonStr], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    const safeTitle = (exportModal.mediaItem?.title || "media").replace(
                      /[^a-zA-Z0-9_-]/g,
                      "_"
                    );
                    a.download = `${safeTitle}_metadata.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="px-4 py-1.5 bg-purple-700 hover:bg-purple-600 text-xs font-mono text-white font-medium rounded-lg flex items-center space-x-1.5 transition-colors shadow-md shadow-purple-900/30"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download .json</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: SAFE DELETION CONFIRMATION MODAL */}
      {/* ========================================================= */}
      {deleteConfirm.isOpen && deleteConfirm.mediaItem && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 select-none animate-in fade-in duration-200"
          onClick={() => setDeleteConfirm((prev) => ({ ...prev, isOpen: false }))}
        >
          <div
            className="bg-brand-black border border-red-900/60 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center space-x-3 text-red-400">
              <div className="p-2 rounded-lg bg-red-950/80 border border-red-800/60">
                <AlertCircle className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-white">Delete Media Item</h3>
            </div>

            {/* Modal Details */}
            <div className="space-y-3 text-xs text-neutral-300">
              <p>
                Are you sure you want to remove this media item from your local SQLite library?
              </p>
              <div className="bg-brand-dark/40 border border-brand-dark/80 rounded-xl p-3 space-y-1">
                <p className="font-semibold text-white truncate">
                  {deleteConfirm.mediaItem.title || "Untitled Media"}
                </p>
                <p className="text-[11px] font-mono text-neutral-400 truncate">
                  Author: {deleteConfirm.mediaItem.author || "Unknown"} ·{" "}
                  {formatBytes(deleteConfirm.mediaItem.filesize_bytes)}
                </p>
              </div>

              {/* Disk deletion toggle if file exists */}
              {deleteConfirm.localPath && (
                <label className="flex items-start space-x-2.5 text-xs text-neutral-300 bg-red-950/20 border border-red-800/40 p-3 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteConfirm.deleteDiskFile}
                    onChange={(e) =>
                      setDeleteConfirm((prev) => ({
                        ...prev,
                        deleteDiskFile: e.target.checked,
                      }))
                    }
                    className="mt-0.5 rounded border-red-800 text-brand-red focus:ring-brand-red"
                  />
                  <div className="space-y-0.5 min-w-0">
                    <span className="font-medium text-red-200 block">
                      Also permanently delete file from disk
                    </span>
                    <span className="text-[11px] font-mono text-neutral-400 block truncate" title={deleteConfirm.localPath}>
                      {deleteConfirm.localPath}
                    </span>
                  </div>
                </label>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-brand-dark/60">
              <button
                type="button"
                onClick={() => setDeleteConfirm((prev) => ({ ...prev, isOpen: false }))}
                disabled={deleteConfirm.loading}
                className="px-4 py-2 bg-brand-dark hover:bg-neutral-800 border border-brand-dark text-xs font-mono text-neutral-300 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteConfirm.loading}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 text-xs font-mono font-medium text-white rounded-lg flex items-center space-x-1.5 transition-colors shadow-md shadow-red-900/30"
              >
                {deleteConfirm.loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
