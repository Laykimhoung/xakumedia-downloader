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
} from "lucide-react";
import type {
  ClassifyUrlResult,
  PythonBridgeStatus,
  PythonPingResult,
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

  const handleScanUrl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!urlInput.trim() || isScanning) return;

    setIsScanning(true);
    setScanError(null);
    setScanResult(null);

    if (!window.api?.classifyUrl) {
      setScanError("Desktop API bridge is not available in browser mode.");
      setIsScanning(false);
      return;
    }

    try {
      const res = await window.api.classifyUrl(urlInput.trim());
      setScanResult(res);
      if (!res.classified_url.is_supported) {
        setScanError(
          `The target URL (${res.classified_url.category}) does not point to a supported direct file or video platform. ` +
            `Gallery extraction with gallery-dl is scheduled for Milestone 8.`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setScanError(msg);
    } finally {
      setIsScanning(false);
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
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all ${
                    isActive
                      ? "bg-brand-red text-white shadow-md shadow-brand-red/20 font-semibold"
                      : "text-neutral-400 hover:text-brand-white hover:bg-brand-dark/50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
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
              Milestone 6 / Direct URL Detection
            </span>
          </div>
          <div className="flex items-center space-x-4">
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
                      placeholder="Paste direct media or video URL (e.g. YouTube, Vimeo, direct .mp4, .jpg)..."
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
                      onClick={() => setUrlInput("http://127.0.0.1/private_camera.mp4")}
                      className="px-2.5 py-1 bg-red-950/30 hover:bg-red-900/40 border border-red-800/40 rounded text-red-300 hover:text-red-200 transition-colors"
                    >
                      SSRF Defense (Blocked 127.0.0.1)
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-neutral-400 border-t border-brand-dark/50 pt-3">
                  <div className="flex items-center space-x-3 text-[11px]">
                    <span className="text-neutral-400">Supported in M7:</span>
                    <span className="text-emerald-400 font-medium">Direct Images & Videos</span>
                    <span>·</span>
                    <span className="text-emerald-400 font-medium">Platform Videos (yt-dlp)</span>
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

              {/* Discovered Media Card */}
              {scanResult?.media_item && (
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

                    <div className="flex items-center space-x-1 text-xs text-emerald-400 font-mono">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Classified Successfully</span>
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

                      <div className="flex items-center justify-between text-[11px] pt-1">
                        <span className="text-neutral-400">
                          Discovered at: {new Date(scanResult.media_item.created_at).toLocaleTimeString()}
                        </span>
                        <span className="text-emerald-400 font-medium">
                          Ready for Download Queue (Milestone 13)
                        </span>
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

          {activeTab !== "scan" && (
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
