import React from "react";
import {
  Search,
  Film,
  Gauge,
  Layers,
  HardDrive,
  Cookie,
} from "lucide-react";

export const FeaturesSection: React.FC = () => {
  const features = [
    {
      icon: Search,
      title: "Smart URL Scanner",
      description:
        "Automatically identifies direct video links, multi-item image galleries, and supported platform channels with zero manual configuration.",
    },
    {
      icon: Film,
      title: "Lossless Stream Merging",
      description:
        "Merges separate high-definition video and audio streams using bundled FFmpeg with copy mode (-c copy). No CPU re-encoding or quality loss.",
    },
    {
      icon: Gauge,
      title: "Bandwidth Speed Limiting",
      description:
        "Cap download speeds dynamically (512 KB/s to Unlimited) so large media batches don't saturate your home or office internet connection.",
    },
    {
      icon: Layers,
      title: "Concurrent Queue & Resumption",
      description:
        "Configurable worker slots (1 to 10 downloads). Interrupted transfers resume automatically where they left off using HTTP Range requests.",
    },
    {
      icon: HardDrive,
      title: "Local SQLite Media Library",
      description:
        "Every scan, task, and bookmark is cataloged locally in SQLite with WAL mode. Search, filter by file container, and sort offline in milliseconds.",
    },
    {
      icon: Cookie,
      title: "Browser Cookie Importer",
      description:
        "Import authenticated session cookies directly from Chrome, Edge, Firefox, Brave, Opera, or Vivaldi using secure Windows DPAPI decryption.",
    },
  ];

  return (
    <section id="features" className="py-20 border-t border-neutral-200 dark:border-neutral-900 bg-neutral-100/50 dark:bg-neutral-950/40 relative transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white tracking-tight">
            Designed for speed, clarity, and control
          </h2>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400">
            Everything you need for clean bulk downloading without the bloat of web-based tools.
          </p>
        </div>

        {/* Clean 3x2 Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className="p-6 rounded-2xl border border-neutral-200/80 dark:border-neutral-800/60 bg-white dark:bg-neutral-900/20 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 hover:border-neutral-300 dark:hover:border-neutral-700/80 shadow-sm transition-all space-y-3"
              >
                <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-brand-red">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                  {feat.title}
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed font-sans">
                  {feat.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
