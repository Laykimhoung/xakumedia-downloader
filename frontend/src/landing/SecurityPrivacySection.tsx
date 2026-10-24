import React from "react";
import { ServerOff, EyeOff, ShieldCheck } from "lucide-react";

export const SecurityPrivacySection: React.FC = () => {
  const pillars = [
    {
      icon: ServerOff,
      title: "100% Local-First Storage",
      desc: "All metadata, history, and queue records are stored exclusively in your local SQLite database. No external cloud backend or remote servers.",
    },
    {
      icon: EyeOff,
      title: "Zero Cloud Telemetry",
      desc: "XakuMedia has no tracking pixels, analytics SDKs, or remote diagnostic pings. Your media collection and activity remain strictly private.",
    },
    {
      icon: ShieldCheck,
      title: "Network Defense & Boundaries",
      desc: "Includes built-in SSRF protection against internal IP probing. Strictly respects content boundaries without cracking DRM or bypassing paywalls.",
    },
  ];

  return (
    <section id="security" className="py-20 border-t border-neutral-200 dark:border-neutral-900 bg-neutral-100/50 dark:bg-neutral-950/40 relative transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white tracking-tight">
            Privacy & Trust
          </h2>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400">
            Engineered to respect your privacy and protect your local system.
          </p>
        </div>

        {/* 3 Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {pillars.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="p-6 rounded-2xl border border-neutral-200/80 dark:border-neutral-800/60 bg-white dark:bg-neutral-900/20 shadow-sm space-y-3 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-brand-red">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">{item.title}</h3>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed font-sans">
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
