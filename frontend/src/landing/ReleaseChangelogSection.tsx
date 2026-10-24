import React from "react";
import { Tag, Check, ExternalLink } from "lucide-react";
import { RELEASE_CONFIG } from "./downloadConfig";

export const ReleaseChangelogSection: React.FC = () => {
  const highlights = [
    "Process-isolated Python engine with typed JSON-RPC 2.0 stdio communication",
    "Multi-provider extraction integrating direct HTTP probes, yt-dlp, and gallery-dl",
    "Lossless FFmpeg stream multiplexing (video + audio copy mode with zero re-encoding)",
    "Token-bucket bandwidth rate limiter for dynamic network speed regulation",
    "Local SQLite database (V1-V4 migrations) with automated interrupted task recovery",
    "Complete automated regression suite with 140 passing test cases",
  ];

  return (
    <section id="changelog" className="py-20 border-t border-neutral-200 dark:border-neutral-900 bg-white dark:bg-brand-black relative transition-colors">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white tracking-tight">
            Release Notes
          </h2>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400">
            Current version capabilities and architectural highlights.
          </p>
        </div>

        {/* Clean Release Card */}
        <div className="p-6 sm:p-8 rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-50 dark:bg-neutral-900/30 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-neutral-200 dark:border-neutral-800/60">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-brand-red/10 text-brand-red">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-bold text-neutral-900 dark:text-white">XakuMedia {RELEASE_CONFIG.latestTag}</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-brand-red/20 text-brand-red font-medium">
                    Latest
                  </span>
                </div>
                <div className="text-xs text-neutral-500 font-mono mt-0.5">
                  Published {RELEASE_CONFIG.releaseDate} • Windows 64-bit
                </div>
              </div>
            </div>

            <a
              href={RELEASE_CONFIG.releasesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white text-xs font-mono shadow-sm transition-colors"
            >
              <span>GitHub Releases</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Clean Highlights */}
          <div className="space-y-3">
            {highlights.map((item) => (
              <div key={item} className="flex items-start space-x-3 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300">
                <Check className="w-4 h-4 text-brand-red flex-shrink-0 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
