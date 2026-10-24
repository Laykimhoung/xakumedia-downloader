import React from "react";
import { ExternalLink } from "lucide-react";
import { RELEASE_CONFIG } from "./downloadConfig";

export const LandingFooter: React.FC = () => {
  return (
    <footer className="border-t border-neutral-200 dark:border-neutral-900 bg-neutral-50 dark:bg-brand-black text-neutral-600 dark:text-neutral-400 text-xs transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-8 border-b border-neutral-200 dark:border-neutral-900">
          {/* Brand Info */}
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <img
                src="/icon.png"
                alt="XakuMedia"
                className="w-6 h-6 rounded-md shadow-sm"
              />
              <span className="font-bold text-neutral-900 dark:text-white text-sm tracking-wide">
                XakuMedia
              </span>
              <span className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500">
                {RELEASE_CONFIG.latestTag}
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              Local-first Windows bulk media downloader by XAKURAII.
            </p>
          </div>

          {/* Quick Links */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <a href="#features" className="hover:text-neutral-900 dark:hover:text-white transition-colors">
              Features
            </a>
            <a href="#workflow" className="hover:text-white transition-colors">
              How It Works
            </a>
            <a href="#requirements" className="hover:text-white transition-colors">
              Requirements
            </a>
            <a href="#installation" className="hover:text-white transition-colors">
              Installation
            </a>
            <a href="#security" className="hover:text-white transition-colors">
              Privacy
            </a>
            <a href="#faq" className="hover:text-white transition-colors">
              FAQ
            </a>
            <a
              href={`https://github.com/${RELEASE_CONFIG.githubOwner}/${RELEASE_CONFIG.githubRepo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-neutral-900 dark:hover:text-white transition-colors inline-flex items-center space-x-1"
            >
              <span>GitHub</span>
              <ExternalLink className="w-3 h-3 text-neutral-400 dark:text-neutral-500" />
            </a>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-neutral-500 dark:text-neutral-600">
          <div>Copyright © 2026 XAKURAII. Open source.</div>
          <div>For personal media archiving. Not affiliated with third-party platforms.</div>
        </div>
      </div>
    </footer>
  );
};
