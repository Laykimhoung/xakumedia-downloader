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
} from "lucide-react";
import type {
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
              Milestone 5 / Python IPC Communication
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
                  Discover, preview, and download publicly accessible images and
                  videos from URLs.
                </p>
              </div>

              {/* URL Input Bar */}
              <div className="bg-brand-dark/40 border border-brand-dark p-4 rounded-xl shadow-lg space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="Paste a direct media, gallery, or social post URL..."
                      className="w-full bg-brand-black/80 border border-brand-dark rounded-lg px-4 py-3 text-sm text-brand-white placeholder-neutral-400 focus:outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red font-mono"
                    />
                  </div>
                  <button
                    disabled
                    title="Scanning engine will be activated in Milestone 6 & 7"
                    className="px-6 py-3 bg-brand-red/50 text-white/70 rounded-lg text-sm font-medium cursor-not-allowed flex items-center space-x-2"
                  >
                    <Search className="h-4 w-4" />
                    <span>Scan</span>
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs text-neutral-400 px-1 pt-1">
                  <div className="flex items-center space-x-4">
                    <span>Supported categories:</span>
                    <span className="text-neutral-300">Direct Images</span>
                    <span>·</span>
                    <span className="text-neutral-300">Direct Videos</span>
                    <span>·</span>
                    <span className="text-neutral-300">Galleries</span>
                    <span>·</span>
                    <span className="text-neutral-300">Public Feeds</span>
                  </div>
                  <span className="text-amber-400 font-mono text-[11px]">
                    Extraction adapters active in M6/M7
                  </span>
                </div>
              </div>

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
