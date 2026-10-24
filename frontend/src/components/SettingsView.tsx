import React, { useEffect, useState } from "react";
import {
  Folder,
  FolderOpen,
  HardDrive,
  Sliders,
  Cpu,
  Film,
  Image as ImageIcon,
  Sun,
  Moon,
  Monitor,
  RotateCcw,
  Check,
  AlertCircle,
  Settings as SettingsIcon,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Gauge,
} from "lucide-react";
import type { AppPreferences, FFmpegInfoResult, PythonBridgeStatus, SystemInfo } from "../../../desktop/shared/types";

interface SettingsViewProps {
  systemInfo: SystemInfo | null;
  pythonStatus: PythonBridgeStatus | null;
  ffmpegInfo: FFmpegInfoResult | null;
  onConcurrencyChange?: (val: number) => void;
  onSpeedLimitChange?: (val: number) => void;
}

const DEFAULT_PREFERENCES: AppPreferences = {
  download_dir: "",
  image_download_dir: "",
  video_download_dir: "",
  max_concurrent_downloads: 4,
  max_download_speed_kbps: 0,
  max_retries: 3,
  request_timeout_seconds: 30,
  default_video_resolution: "1080p",
  default_video_container: "mp4",
  default_image_format: "original",
  theme: "dark",
  log_level: "INFO",
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  systemInfo,
  pythonStatus,
  ffmpegInfo,
  onConcurrencyChange,
  onSpeedLimitChange,
}) => {
  const [prefs, setPrefs] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState<boolean>(false);

  // Load preferences from SQLite on mount
  useEffect(() => {
    async function loadPreferences() {
      if (!window.api?.getPreferences) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const data = await window.api.getPreferences();
        setPrefs(data);
      } catch (err) {
        console.error("Failed to load application preferences:", err);
      } finally {
        setLoading(false);
      }
    }

    loadPreferences();
  }, []);

  const showSaveNotice = (msg: string = "Settings saved to local SQLite") => {
    setSavedToast(msg);
    setTimeout(() => {
      setSavedToast(null);
    }, 2800);
  };

  const handleUpdate = async (updates: Partial<AppPreferences>) => {
    const next = { ...prefs, ...updates };
    setPrefs(next);

    if (updates.max_concurrent_downloads && onConcurrencyChange) {
      onConcurrencyChange(updates.max_concurrent_downloads);
    }
    if (updates.max_download_speed_kbps !== undefined && onSpeedLimitChange) {
      onSpeedLimitChange(updates.max_download_speed_kbps);
    }

    if (!window.api?.updatePreferences) return;

    try {
      setSaving(true);
      const updated = await window.api.updatePreferences(updates);
      setPrefs(updated);
      showSaveNotice();
    } catch (err) {
      console.error("Failed to persist preferences:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleSelectFolder = async () => {
    if (!window.api?.selectFolder) return;
    try {
      const selected = await window.api.selectFolder(prefs.download_dir);
      if (selected && selected !== prefs.download_dir) {
        await handleUpdate({ download_dir: selected });
      }
    } catch (err) {
      console.error("Failed to select directory:", err);
    }
  };

  const handleOpenFolder = async () => {
    if (!prefs.download_dir || !window.api?.openPath) return;
    try {
      await window.api.openPath(prefs.download_dir);
    } catch (err) {
      console.error("Failed to open directory:", err);
    }
  };

  const handleResetToDefaults = async () => {
    if (!window.api?.resetPreferences) return;
    try {
      setSaving(true);
      const defaults = await window.api.resetPreferences();
      setPrefs(defaults);
      setResetConfirmOpen(false);
      if (onConcurrencyChange) {
        onConcurrencyChange(defaults.max_concurrent_downloads);
      }
      if (onSpeedLimitChange) {
        onSpeedLimitChange(defaults.max_download_speed_kbps ?? 0);
      }
      showSaveNotice("Preferences reset to factory defaults");
    } catch (err) {
      console.error("Failed to reset preferences:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-3">
        <RefreshCw className="h-8 w-8 text-brand-red animate-spin" />
        <p className="text-xs font-mono text-neutral-400">Loading settings from local database...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16 animate-in fade-in duration-200">
      {/* Settings Header */}
      <div className="flex items-center justify-between border-b border-brand-dark/80 pb-5">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <SettingsIcon className="h-6 w-6 text-brand-red" />
            <h1 className="text-xl font-bold tracking-tight text-brand-white">Application Settings</h1>
          </div>
          <p className="text-xs text-neutral-400">
            Configure local download paths, worker concurrency limits, format preferences, and theme styling.
          </p>
        </div>

        {/* Save indicator toast */}
        <div className="flex items-center space-x-3">
          {savedToast && (
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-emerald-950/80 border border-emerald-600/60 rounded-lg text-emerald-300 text-xs font-mono animate-in fade-in duration-150">
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span>{savedToast}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setResetConfirmOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark rounded-lg text-xs font-mono text-neutral-300 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5 text-neutral-400" />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. Storage & Download Directories */}
      {/* ========================================================================= */}
      <section className="bg-brand-dark/20 border border-brand-dark/70 rounded-2xl p-6 space-y-4 shadow-lg shadow-black/40">
        <div className="flex items-center justify-between border-b border-brand-dark/50 pb-3">
          <div className="flex items-center space-x-2.5">
            <HardDrive className="h-5 w-5 text-brand-red" />
            <div>
              <h2 className="text-sm font-semibold text-brand-white">Storage & Download Directory</h2>
              <p className="text-[11px] text-neutral-400 font-mono">
                Primary directory where images, videos, and multi-part files are saved.
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/70 border border-emerald-800/60 text-emerald-300">
            Local Disk Only
          </span>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-medium text-neutral-300">Default Download Location</label>
          <div className="flex items-center space-x-2">
            <div className="flex-1 bg-brand-black border border-brand-dark rounded-xl px-4 py-2.5 flex items-center space-x-3 text-xs font-mono text-neutral-200 overflow-hidden">
              <Folder className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="truncate select-all" title={prefs.download_dir}>
                {prefs.download_dir || "Resolving system default..."}
              </span>
            </div>
            <button
              type="button"
              onClick={handleSelectFolder}
              className="px-4 py-2.5 bg-brand-red hover:bg-red-700 text-white rounded-xl text-xs font-medium flex items-center space-x-2 transition-colors shrink-0 shadow-md shadow-brand-red/30"
            >
              <FolderOpen className="h-4 w-4" />
              <span>Change Folder...</span>
            </button>
            <button
              type="button"
              onClick={handleOpenFolder}
              className="p-2.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark rounded-xl text-neutral-300 hover:text-white transition-colors shrink-0"
              title="Open folder in File Explorer"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div className="bg-brand-black/60 border border-brand-dark/60 rounded-xl p-3 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center space-x-2 text-neutral-400">
                <Film className="h-4 w-4 text-purple-400" />
                <span>Video Subdirectory:</span>
              </div>
              <span className="text-neutral-200 font-bold">\videos</span>
            </div>
            <div className="bg-brand-black/60 border border-brand-dark/60 rounded-xl p-3 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center space-x-2 text-neutral-400">
                <ImageIcon className="h-4 w-4 text-emerald-400" />
                <span>Image Subdirectory:</span>
              </div>
              <span className="text-neutral-200 font-bold">\images</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. Download Concurrency & Queue Scheduling */}
      {/* ========================================================================= */}
      <section className="bg-brand-dark/20 border border-brand-dark/70 rounded-2xl p-6 space-y-5 shadow-lg shadow-black/40">
        <div className="flex items-center justify-between border-b border-brand-dark/50 pb-3">
          <div className="flex items-center space-x-2.5">
            <Sliders className="h-5 w-5 text-purple-400" />
            <div>
              <h2 className="text-sm font-semibold text-brand-white">Concurrency & Queue Scheduling</h2>
              <p className="text-[11px] text-neutral-400 font-mono">
                Control active download slots, request timeouts, and automatic retry limits.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded text-xs font-mono bg-purple-950/70 border border-purple-800/60 text-purple-300">
            {prefs.max_concurrent_downloads} Active Slots
          </span>
        </div>

        {/* Concurrency Slider & Stepper */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-neutral-300">Simultaneous Active Downloads</span>
            <span className="font-mono text-purple-300 font-bold">{prefs.max_concurrent_downloads} slots</span>
          </div>

          <div className="flex items-center space-x-4">
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={prefs.max_concurrent_downloads}
              onChange={(e) => handleUpdate({ max_concurrent_downloads: parseInt(e.target.value, 10) })}
              className="w-full h-2 bg-brand-dark rounded-lg appearance-none cursor-pointer accent-brand-red"
            />
          </div>

          {/* Quick slot chips */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[1, 2, 3, 4, 5, 6, 8, 10].map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => handleUpdate({ max_concurrent_downloads: slot })}
                className={`px-3 py-1 rounded-lg text-xs font-mono border transition-all ${
                  prefs.max_concurrent_downloads === slot
                    ? "bg-brand-red border-brand-red text-white shadow-sm shadow-brand-red/40"
                    : "bg-brand-black/70 border-brand-dark text-neutral-400 hover:text-white hover:border-neutral-700"
                }`}
              >
                {slot} {slot === 1 ? "Slot" : "Slots"}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-neutral-400 leading-relaxed font-mono">
            Tasks exceeding this limit stay safely queued in SQLite and start automatically as slots open up.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-brand-dark/40">
          {/* Timeout */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-neutral-300">Network Timeout:</span>
              <span className="text-neutral-400">{prefs.request_timeout_seconds} seconds</span>
            </div>
            <select
              value={prefs.request_timeout_seconds}
              onChange={(e) => handleUpdate({ request_timeout_seconds: parseFloat(e.target.value) })}
              className="w-full bg-brand-black border border-brand-dark rounded-xl px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-brand-red"
            >
              <option value="15">15 seconds (Fast fail)</option>
              <option value="30">30 seconds (Recommended standard)</option>
              <option value="60">60 seconds (Large files)</option>
              <option value="120">120 seconds (Slow connections)</option>
            </select>
          </div>

          {/* Retries */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-neutral-300">Max Auto-Retries:</span>
              <span className="text-neutral-400">{prefs.max_retries} attempts</span>
            </div>
            <select
              value={prefs.max_retries}
              onChange={(e) => handleUpdate({ max_retries: parseInt(e.target.value, 10) })}
              className="w-full bg-brand-black border border-brand-dark rounded-xl px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-brand-red"
            >
              <option value="0">0 (No retries)</option>
              <option value="1">1 attempt</option>
              <option value="3">3 attempts (Recommended)</option>
              <option value="5">5 attempts (Aggressive recovery)</option>
            </select>
          </div>
        </div>

        {/* Global Bandwidth Throttling & Speed Limit */}
        <div className="pt-4 border-t border-brand-dark/40 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <Gauge className="h-4 w-4 text-cyan-400" />
              <span className="font-semibold text-neutral-200">Global Bandwidth Speed Limit</span>
            </div>
            <span className="font-mono text-cyan-300 font-bold">
              {prefs.max_download_speed_kbps && prefs.max_download_speed_kbps > 0
                ? prefs.max_download_speed_kbps >= 1024
                  ? `${(prefs.max_download_speed_kbps / 1024).toFixed(1)} MB/s`
                  : `${prefs.max_download_speed_kbps} KB/s`
                : "Unlimited (Full Speed)"}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {[
              { label: "Unlimited", value: 0 },
              { label: "500 KB/s", value: 500 },
              { label: "1 MB/s", value: 1024 },
              { label: "2 MB/s", value: 2048 },
              { label: "5 MB/s", value: 5120 },
              { label: "10 MB/s", value: 10240 },
              { label: "20 MB/s", value: 20480 },
              { label: "50 MB/s", value: 51200 },
            ].map((preset) => {
              const active = (prefs.max_download_speed_kbps || 0) === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => handleUpdate({ max_download_speed_kbps: preset.value })}
                  className={`px-3 py-1 rounded-lg text-xs font-mono border transition-all ${
                    active
                      ? "bg-cyan-600 border-cyan-400 text-white shadow-sm shadow-cyan-600/40"
                      : "bg-brand-black/70 border-brand-dark text-neutral-400 hover:text-white hover:border-neutral-700"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center space-x-3 pt-1">
            <span className="text-[11px] font-mono text-neutral-400">Custom Limit (KB/s):</span>
            <input
              type="number"
              min="0"
              max="1000000"
              step="100"
              value={prefs.max_download_speed_kbps ?? 0}
              onChange={(e) => {
                const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                handleUpdate({ max_download_speed_kbps: val });
              }}
              placeholder="0 = unlimited"
              className="w-36 bg-brand-black border border-brand-dark rounded-xl px-3 py-1.5 text-xs font-mono text-neutral-200 focus:outline-none focus:border-cyan-500"
            />
            <span className="text-[11px] text-neutral-500 font-mono">
              Applies globally across all active workers in real time.
            </span>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. Video Quality & Format Preferences */}
      {/* ========================================================================= */}
      <section className="bg-brand-dark/20 border border-brand-dark/70 rounded-2xl p-6 space-y-5 shadow-lg shadow-black/40">
        <div className="flex items-center justify-between border-b border-brand-dark/50 pb-3">
          <div className="flex items-center space-x-2.5">
            <Film className="h-5 w-5 text-purple-400" />
            <div>
              <h2 className="text-sm font-semibold text-brand-white">Default Video Pipeline Preferences</h2>
              <p className="text-[11px] text-neutral-400 font-mono">
                Preferred maximum resolution and container format for video downloads.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded text-xs font-mono bg-brand-black border border-brand-dark text-neutral-300 uppercase">
            {prefs.default_video_resolution} · {prefs.default_video_container}
          </span>
        </div>

        {/* Video Resolution */}
        <div className="space-y-2.5">
          <label className="text-xs font-medium text-neutral-300">Default Video Resolution</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {[
              { id: "best", label: "Best Available", desc: "Max Source" },
              { id: "2160p", label: "4K UHD", desc: "2160p" },
              { id: "1440p", label: "2K QHD", desc: "1440p" },
              { id: "1080p", label: "Full HD", desc: "1080p (Standard)" },
              { id: "720p", label: "HD", desc: "720p" },
              { id: "480p", label: "SD", desc: "480p" },
            ].map((res) => (
              <button
                key={res.id}
                type="button"
                onClick={() => handleUpdate({ default_video_resolution: res.id })}
                className={`p-2.5 rounded-xl border text-left flex flex-col transition-all ${
                  prefs.default_video_resolution === res.id
                    ? "bg-purple-950/70 border-purple-600 text-white shadow-sm shadow-purple-900/50"
                    : "bg-brand-black/70 border-brand-dark text-neutral-400 hover:text-white hover:border-neutral-700"
                }`}
              >
                <span className="text-xs font-bold text-brand-white">{res.label}</span>
                <span className="text-[10px] font-mono text-neutral-400">{res.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Video Container */}
        <div className="space-y-2.5">
          <label className="text-xs font-medium text-neutral-300">Default Video Container</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: "mp4", label: "MP4", desc: "Universal Compatibility" },
              { id: "mkv", label: "MKV", desc: "Multi-track & Subtitles" },
              { id: "webm", label: "WebM", desc: "VP9 / Opus Open Web" },
              { id: "original", label: "Original", desc: "Preserve Source Stream" },
            ].map((fmt) => (
              <button
                key={fmt.id}
                type="button"
                onClick={() => handleUpdate({ default_video_container: fmt.id })}
                className={`p-2.5 rounded-xl border text-left flex flex-col transition-all ${
                  prefs.default_video_container === fmt.id
                    ? "bg-purple-950/70 border-purple-600 text-white shadow-sm shadow-purple-900/50"
                    : "bg-brand-black/70 border-brand-dark text-neutral-400 hover:text-white hover:border-neutral-700"
                }`}
              >
                <span className="text-xs font-bold uppercase text-brand-white">{fmt.label}</span>
                <span className="text-[10px] font-mono text-neutral-400">{fmt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="text-[11px] font-mono text-neutral-400 bg-brand-black/60 p-3 rounded-xl border border-brand-dark/60 flex items-start space-x-2">
          <Sparkles className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
          <span>
            Non-destructive multiplexing: Separate video and audio streams are muxed without lossy re-encoding whenever supported by FFmpeg.
          </span>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. Image Quality & Format Preferences */}
      {/* ========================================================================= */}
      <section className="bg-brand-dark/20 border border-brand-dark/70 rounded-2xl p-6 space-y-4 shadow-lg shadow-black/40">
        <div className="flex items-center justify-between border-b border-brand-dark/50 pb-3">
          <div className="flex items-center space-x-2.5">
            <ImageIcon className="h-5 w-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-semibold text-brand-white">Default Image Pipeline Preferences</h2>
              <p className="text-[11px] text-neutral-400 font-mono">
                Preferred format for single image downloads and bulk gallery exports.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded text-xs font-mono bg-brand-black border border-brand-dark text-neutral-300 uppercase">
            {prefs.default_image_format}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { id: "original", label: "Original", desc: "Bit-for-bit Source Stream" },
            { id: "png", label: "PNG", desc: "Lossless Graphics" },
            { id: "jpg", label: "JPG", desc: "Universal Photo Standard" },
            { id: "webp", label: "WebP", desc: "Compact Modern Format" },
          ].map((fmt) => (
            <button
              key={fmt.id}
              type="button"
              onClick={() => handleUpdate({ default_image_format: fmt.id })}
              className={`p-2.5 rounded-xl border text-left flex flex-col transition-all ${
                prefs.default_image_format === fmt.id
                  ? "bg-emerald-950/70 border-emerald-600 text-white shadow-sm shadow-emerald-900/50"
                  : "bg-brand-black/70 border-brand-dark text-neutral-400 hover:text-white hover:border-neutral-700"
              }`}
            >
              <span className="text-xs font-bold uppercase text-brand-white">{fmt.label}</span>
              <span className="text-[10px] font-mono text-neutral-400">{fmt.desc}</span>
            </button>
          ))}
        </div>

        <p className="text-[11px] text-neutral-400 font-mono">
          Original preserves original EXIF metadata, ICC color profiles, and native compression without alteration.
        </p>
      </section>

      {/* ========================================================================= */}
      {/* 5. Appearance & Diagnostics */}
      {/* ========================================================================= */}
      <section className="bg-brand-dark/20 border border-brand-dark/70 rounded-2xl p-6 space-y-4 shadow-lg shadow-black/40">
        <div className="flex items-center justify-between border-b border-brand-dark/50 pb-3">
          <div className="flex items-center space-x-2.5">
            <Moon className="h-5 w-5 text-amber-400" />
            <div>
              <h2 className="text-sm font-semibold text-brand-white">Theme & Appearance</h2>
              <p className="text-[11px] text-neutral-400 font-mono">
                Select visual color palette and application interface theme.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded text-xs font-mono bg-brand-black border border-brand-dark text-neutral-300 capitalize">
            {prefs.theme}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { id: "dark", label: "Dark Theme", desc: "XAKURAII Signature Black", icon: Moon },
            { id: "light", label: "Light Theme", desc: "Clean High Contrast", icon: Sun },
            { id: "system", label: "System Sync", desc: "Follow OS Settings", icon: Monitor },
          ].map((theme) => {
            const Icon = theme.icon;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => handleUpdate({ theme: theme.id as any })}
                className={`p-3 rounded-xl border text-left flex flex-col space-y-1 transition-all ${
                  prefs.theme === theme.id
                    ? "bg-amber-950/60 border-amber-600 text-white shadow-sm shadow-amber-900/40"
                    : "bg-brand-black/70 border-brand-dark text-neutral-400 hover:text-white hover:border-neutral-700"
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Icon className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-bold text-brand-white">{theme.label}</span>
                </div>
                <span className="text-[10px] font-mono text-neutral-400">{theme.desc}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. System Runtime Diagnostics */}
      {/* ========================================================================= */}
      <section className="bg-brand-dark/20 border border-brand-dark/70 rounded-2xl p-6 space-y-4 shadow-lg shadow-black/40">
        <div className="flex items-center justify-between border-b border-brand-dark/50 pb-3">
          <div className="flex items-center space-x-2.5">
            <Cpu className="h-5 w-5 text-cyan-400" />
            <div>
              <h2 className="text-sm font-semibold text-brand-white">Runtime System Diagnostics</h2>
              <p className="text-[11px] text-neutral-400 font-mono">
                Environment runtimes, tool detection, and local SQLite database path.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded text-xs font-mono bg-emerald-950/70 border border-emerald-800/60 text-emerald-300">
            All Systems Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
          <div className="bg-brand-black/60 border border-brand-dark/60 rounded-xl p-3 space-y-1">
            <span className="text-neutral-400 text-[10px] uppercase">Python Engine</span>
            <div className="text-neutral-200 font-bold">
              Python {pythonStatus?.info?.python_version || "3.12.x"} (PID: {pythonStatus?.pid || "Active"})
            </div>
            <div className="text-[10px] text-neutral-500 truncate" title={pythonStatus?.info?.python_executable}>
              {pythonStatus?.info?.python_executable}
            </div>
          </div>

          <div className="bg-brand-black/60 border border-brand-dark/60 rounded-xl p-3 space-y-1">
            <span className="text-neutral-400 text-[10px] uppercase">Media Processing (FFmpeg)</span>
            <div className="text-neutral-200 font-bold">
              {ffmpegInfo?.installed ? `FFmpeg ${ffmpegInfo.version || "Installed"}` : "Not Detected"}
            </div>
            <div className="text-[10px] text-neutral-500 truncate" title={ffmpegInfo?.ffmpeg_path || "System PATH"}>
              {ffmpegInfo?.ffmpeg_path || "System PATH"}
            </div>
          </div>

          <div className="bg-brand-black/60 border border-brand-dark/60 rounded-xl p-3 space-y-1">
            <span className="text-neutral-400 text-[10px] uppercase">Electron Shell</span>
            <div className="text-neutral-200 font-bold">
              Electron v{systemInfo?.version || "33.x"} ({systemInfo?.platform || "win32"} {systemInfo?.arch || "x64"})
            </div>
            <div className="text-[10px] text-neutral-500">Local-First Desktop Architecture</div>
          </div>

          <div className="bg-brand-black/60 border border-brand-dark/60 rounded-xl p-3 space-y-1">
            <span className="text-neutral-400 text-[10px] uppercase">Local Data Directory</span>
            <div className="text-neutral-200 font-bold truncate">
              {pythonStatus?.info?.data_dir || "%LOCALAPPDATA%\\XakuMedia"}
            </div>
            <div className="text-[10px] text-neutral-500">Persistent SQLite Database</div>
          </div>
        </div>
      </section>

      {/* Confirmation Modal for Reset Defaults */}
      {resetConfirmOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setResetConfirmOpen(false)}
        >
          <div
            className="bg-brand-black border border-brand-dark rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3 text-amber-400">
              <AlertCircle className="h-6 w-6 shrink-0" />
              <h3 className="text-base font-bold text-white">Reset Preferences to Factory Defaults?</h3>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed font-mono">
              This will restore the standard download folder, 4-worker concurrency limit, 1080p MP4 defaults, and dark theme. Your downloaded files and scan history will NOT be deleted.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setResetConfirmOpen(false)}
                className="px-4 py-2 bg-brand-dark hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-xl text-xs font-mono transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetToDefaults}
                disabled={saving}
                className="px-4 py-2 bg-brand-red hover:bg-red-700 text-white rounded-xl text-xs font-medium transition-colors shadow-md shadow-brand-red/30 flex items-center space-x-1.5"
              >
                {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>Confirm Reset</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
