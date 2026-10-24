import React from "react";
import { Info, ArrowRight } from "lucide-react";
import { RELEASE_CONFIG } from "./downloadConfig";

export const InstallationSection: React.FC = () => {
  return (
    <section id="installation" className="py-20 border-t border-neutral-900 bg-brand-black relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Installation & Setup
          </h2>
          <p className="text-sm sm:text-base text-neutral-400">
            Choose between standard desktop installation or a portable single-binary run.
          </p>
        </div>

        {/* 2 Clean Setup Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
          {/* Card 1: Installer */}
          <div className="p-6 rounded-2xl border border-neutral-800/60 bg-neutral-900/20 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Setup Installer</h3>
              <span className="text-xs font-mono text-neutral-400">{RELEASE_CONFIG.installer.sizeFormatted}</span>
            </div>
            <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
              Standard Windows setup wizard. Creates Start Menu and desktop shortcuts with an automated uninstaller.
            </p>
            <div className="pt-2">
              <a
                href={RELEASE_CONFIG.installer.downloadUrl}
                className="inline-flex items-center space-x-1.5 text-xs font-semibold text-brand-red hover:text-brand-accent transition-colors"
              >
                <span>Download {RELEASE_CONFIG.installer.filename}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Card 2: Portable */}
          <div className="p-6 rounded-2xl border border-neutral-800/60 bg-neutral-900/20 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Portable Executable</h3>
              <span className="text-xs font-mono text-neutral-400">{RELEASE_CONFIG.portable.sizeFormatted}</span>
            </div>
            <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
              Zero-install standalone binary. Run directly from any folder or USB flash drive without writing to the Windows registry.
            </p>
            <div className="pt-2">
              <a
                href={RELEASE_CONFIG.portable.downloadUrl}
                className="inline-flex items-center space-x-1.5 text-xs font-semibold text-neutral-300 hover:text-white transition-colors"
              >
                <span>Download {RELEASE_CONFIG.portable.filename}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Clean SmartScreen Guidance Box */}
        <div className="p-6 rounded-2xl border border-neutral-800/80 bg-neutral-900/40 space-y-3">
          <div className="flex items-center space-x-2 text-neutral-300 font-medium text-sm">
            <Info className="w-4 h-4 text-brand-red flex-shrink-0" />
            <span>Windows Defender SmartScreen Prompt</span>
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Because XakuMedia is an independent open-source project without a paid corporate code-signing certificate, Windows SmartScreen may show an unrecognized app banner. To start the application, click <strong className="text-neutral-200">More info</strong> and then select <strong className="text-brand-red">Run anyway</strong>. You can inspect the entire source code openly on GitHub.
          </p>
        </div>
      </div>
    </section>
  );
};
