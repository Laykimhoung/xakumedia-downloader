import React, { useState, useEffect } from "react";
import {
  Download,
  Package,
  ExternalLink,
  Search,
} from "lucide-react";
import {
  RELEASE_CONFIG,
  checkGitHubReleaseStatus,
  GitHubReleaseStatus,
} from "./downloadConfig";

export const HeroSection: React.FC = () => {
  const [releaseStatus, setReleaseStatus] = useState<GitHubReleaseStatus>({
    isChecking: true,
    isPublished: false,
    assetsAvailable: false,
  });

  useEffect(() => {
    checkGitHubReleaseStatus().then((status) => {
      setReleaseStatus(status);
    });
  }, []);

  return (
    <section id="download" className="relative pt-16 pb-20 overflow-hidden">
      {/* Subtle ambient light */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-brand-red/10 blur-[130px] rounded-full pointer-events-none -z-10" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Version Badge */}
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-neutral-800 bg-neutral-900/60 backdrop-blur-sm text-xs text-neutral-400 mb-8">
          <span className="w-2 h-2 rounded-full bg-brand-red" />
          <span className="text-neutral-300 font-medium">Version {RELEASE_CONFIG.latestTag} Released</span>
          <span className="text-neutral-600">•</span>
          <span>Windows 64-bit</span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white max-w-4xl mx-auto leading-tight">
          Bulk media downloading,{" "}
          <span className="text-brand-red">made effortless.</span>
        </h1>

        {/* Subtitle */}
        <p className="mt-5 text-base sm:text-lg text-neutral-400 max-w-2xl mx-auto leading-relaxed">
          A clean, local-first Windows desktop app to discover, inspect, and batch-download videos and image galleries. No cloud tracking, no accounts, and no subscriptions.
        </p>

        {/* Clean, Simple Download Actions */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          {releaseStatus.isPublished || releaseStatus.assetsAvailable ? (
            <>
              {/* Primary Installer */}
              <a
                href={RELEASE_CONFIG.installer.downloadUrl}
                className="w-full sm:w-auto flex items-center justify-center space-x-2.5 px-6 py-3.5 rounded-xl bg-brand-red hover:bg-brand-accent text-white font-semibold text-sm shadow-lg shadow-brand-red/25 hover:shadow-brand-red/40 hover:-translate-y-0.5 active:translate-y-0 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Download for Windows</span>
                <span className="text-xs font-normal text-white/80">({RELEASE_CONFIG.installer.sizeFormatted})</span>
              </a>

              {/* Secondary Portable */}
              <a
                href={RELEASE_CONFIG.portable.downloadUrl}
                className="w-full sm:w-auto flex items-center justify-center space-x-2 px-5 py-3.5 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-neutral-200 text-sm font-medium hover:-translate-y-0.5 active:translate-y-0 transition-all"
              >
                <Package className="w-4 h-4 text-neutral-400" />
                <span>Portable .exe</span>
                <span className="text-xs text-neutral-500 font-normal">({RELEASE_CONFIG.portable.sizeFormatted})</span>
              </a>
            </>
          ) : (
            <a
              href={RELEASE_CONFIG.releasesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 px-6 py-3.5 rounded-xl bg-brand-red hover:bg-brand-accent text-white font-semibold text-sm shadow-lg shadow-brand-red/25 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Get v0.1.0 on GitHub</span>
              <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-80" />
            </a>
          )}
        </div>

        {/* Small trust indicators */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-neutral-500 font-sans">
          <span>Windows 10 / 11 (64-bit)</span>
          <span>•</span>
          <span>Python & FFmpeg Bundled</span>
          <span>•</span>
          <span>100% Local Storage</span>
          <span>•</span>
          <a
            href="#installation"
            className="text-neutral-400 hover:text-white transition-colors underline underline-offset-2"
          >
            SmartScreen Guide
          </a>
        </div>

        {/* Streamlined Desktop App Window Showcase */}
        <div className="mt-14 max-w-4xl mx-auto text-left">
          <div className="rounded-2xl border border-neutral-800/80 bg-neutral-950 shadow-2xl overflow-hidden backdrop-blur-xl">
            {/* Titlebar */}
            <div className="flex items-center justify-between px-4 py-3 bg-neutral-900/40 border-b border-neutral-800/60">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-neutral-700 inline-block" />
                <span className="w-3 h-3 rounded-full bg-neutral-700 inline-block" />
                <span className="w-3 h-3 rounded-full bg-neutral-700 inline-block" />
                <span className="ml-3 text-xs text-neutral-400 font-medium">
                  XakuMedia — Desktop Media Downloader
                </span>
              </div>
              <span className="text-[11px] text-neutral-500 font-mono">v0.1.0</span>
            </div>

            {/* Clean App Body Preview */}
            <div className="p-6 space-y-6">
              {/* Clean URL Input Bar */}
              <div className="flex items-center space-x-3 p-3 rounded-xl border border-neutral-800 bg-neutral-900/60">
                <Search className="w-4 h-4 text-neutral-500 flex-shrink-0" />
                <div className="w-full text-xs text-neutral-300 font-mono truncate">
                  https://example.com/gallery/landscape-collection-2026
                </div>
                <span className="px-3 py-1.5 rounded-lg bg-brand-red text-white text-xs font-semibold flex-shrink-0">
                  Scan URL
                </span>
              </div>

              {/* Two Column Clean Preview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Detected Media Card */}
                <div className="p-4 rounded-xl border border-neutral-800/80 bg-neutral-900/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">Discovered Collection</span>
                    <span className="px-2 py-0.5 rounded text-[11px] bg-brand-red/10 text-brand-red font-medium">
                      24 Items
                    </span>
                  </div>
                  <p className="text-neutral-400 text-xs">
                    Album detected with native 4K resolutions and lossless image streams.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="px-2 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-300 text-[11px]">
                      4K UHD (3840×2160)
                    </span>
                    <span className="px-2 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-300 text-[11px]">
                      MP4 / H.264
                    </span>
                    <span className="px-2 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-300 text-[11px]">
                      Original Photos
                    </span>
                  </div>
                </div>

                {/* Live Download Status Card */}
                <div className="p-4 rounded-xl border border-neutral-800/80 bg-neutral-900/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">Batch Download</span>
                    <span className="text-brand-red font-mono text-[11px]">18.4 MB/s</span>
                  </div>
                  {/* Progress Bar */}
                  <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-brand-red h-full rounded-full" style={{ width: "76%" }} />
                  </div>
                  <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                    <span>18 of 24 completed</span>
                    <span>Range Resumption Active</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
