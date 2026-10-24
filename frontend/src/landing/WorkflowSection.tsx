import React from "react";
import { Search, CheckSquare, SlidersHorizontal, Download } from "lucide-react";

export const WorkflowSection: React.FC = () => {
  const steps = [
    {
      num: "1",
      icon: Search,
      title: "Paste URL",
      desc: "Paste any video, album, or direct media link. XakuMedia scans the source in seconds.",
    },
    {
      num: "2",
      icon: CheckSquare,
      title: "Inspect & Select",
      desc: "Preview thumbnail cards, check video resolutions or codecs, and select individual files.",
    },
    {
      num: "3",
      icon: SlidersHorizontal,
      title: "Choose Quality",
      desc: "Pick your preferred resolution (up to 4K), container format, and destination directory.",
    },
    {
      num: "4",
      icon: Download,
      title: "Download",
      desc: "Files stream directly to your disk with range resumption and are cataloged in your library.",
    },
  ];

  return (
    <section id="workflow" className="py-20 border-t border-neutral-200 dark:border-neutral-900 bg-white dark:bg-brand-black relative transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white tracking-tight">
            How it works
          </h2>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400">
            Four simple steps from URL to organized local media.
          </p>
        </div>

        {/* 4 Steps Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.num}
                className="p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800/60 bg-neutral-50 dark:bg-neutral-900/20 space-y-3 shadow-sm transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-brand-red">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-mono font-bold text-neutral-400 dark:text-neutral-600">
                    STEP {s.num}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">{s.title}</h3>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed font-sans">
                  {s.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
