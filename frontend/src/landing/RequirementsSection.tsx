import React from "react";
import { Monitor, Cpu, Box } from "lucide-react";

export const RequirementsSection: React.FC = () => {
  const specs = [
    {
      icon: Monitor,
      title: "Operating System",
      main: "Windows 10 / 11 (64-bit)",
      detail: "Windows 10 Build 1809 or higher. 64-bit x86_64 architecture required.",
    },
    {
      icon: Cpu,
      title: "System Resources",
      main: "4 GB RAM • 350 MB Space",
      detail: "8 GB RAM recommended for parallel 4K video stream merges.",
    },
    {
      icon: Box,
      title: "Bundled Runtimes",
      main: "Zero External Installs",
      detail: "Includes embedded Python 3.12 and FFmpeg/FFprobe binaries out of the box.",
    },
  ];

  return (
    <section id="requirements" className="py-20 border-t border-neutral-200 dark:border-neutral-900 bg-neutral-100/50 dark:bg-neutral-950/40 relative transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white tracking-tight">
            System Requirements
          </h2>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400">
            Self-contained desktop application ready to run out of the box.
          </p>
        </div>

        {/* 3 Clean Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {specs.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="p-6 rounded-2xl border border-neutral-200/80 dark:border-neutral-800/60 bg-white dark:bg-neutral-900/20 shadow-sm space-y-3 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-brand-red">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-neutral-500 font-medium">{item.title}</div>
                  <div className="text-base font-semibold text-neutral-900 dark:text-white mt-0.5">{item.main}</div>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed font-sans">
                  {item.detail}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
