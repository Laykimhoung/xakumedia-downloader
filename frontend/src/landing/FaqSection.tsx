import React, { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { RELEASE_CONFIG } from "./downloadConfig";

export const FaqSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: "Is XakuMedia completely free?",
      a: "Yes. XakuMedia is 100% free and open-source. There are no subscriptions, paid upgrades, or advertisements.",
    },
    {
      q: "Why does Windows SmartScreen show an unrecognized app prompt?",
      a: "XakuMedia is a community project distributed without a costly commercial Extended Validation (EV) certificate ($500+/year). Windows displays this default warning for any new unsigned binary. Simply click 'More info' and then 'Run anyway'. All code is fully open and auditable on GitHub.",
    },
    {
      q: "Do I need to install Python or FFmpeg separately?",
      a: "No. Python 3.12 embedded runtime and FFmpeg/FFprobe binaries are bundled directly inside the setup and portable executables. No configuration or PATH adjustments are needed.",
    },
    {
      q: "Can I limit the download speed?",
      a: "Yes. You can configure global speed limits (such as 512 KB/s, 2 MB/s, 10 MB/s, or Unlimited) from Settings or the active Downloads toolbar to avoid saturating your bandwidth.",
    },
    {
      q: "Can I download 4K video streams?",
      a: "Yes. When a source provides 4K or high-framerate streams, XakuMedia detects them and uses bundled FFmpeg to merge high-res video and audio tracks losslessly (-c copy) into MP4, MKV, or WebM.",
    },
    {
      q: "Where can I report bugs or suggest features?",
      a: "You can open an issue directly in our official GitHub repository. Feedback and community contributions are always welcome.",
    },
  ];

  return (
    <section id="faq" className="py-20 border-t border-neutral-200 dark:border-neutral-900 bg-neutral-100/50 dark:bg-neutral-950/40 relative transition-colors">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white tracking-tight">
            Frequently Asked Questions
          </h2>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400">
            Quick answers about installation, privacy, and media downloading.
          </p>
        </div>

        {/* Clean Accordion List */}
        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={faq.q}
                className="rounded-xl border border-neutral-200/80 dark:border-neutral-800/60 bg-white dark:bg-neutral-900/30 shadow-sm overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between p-4 sm:p-5 text-left text-sm font-semibold text-neutral-900 dark:text-white hover:text-brand-red transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ml-4 flex-shrink-0 ${
                      isOpen ? "rotate-180 text-brand-red" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed border-t border-neutral-100 dark:border-neutral-800/40 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Support Link */}
        <div className="mt-8 text-center text-xs text-neutral-500">
          Need more help?{" "}
          <a
            href={`https://github.com/${RELEASE_CONFIG.githubOwner}/${RELEASE_CONFIG.githubRepo}/issues`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-700 dark:text-neutral-300 hover:text-brand-red dark:hover:text-white underline underline-offset-2 inline-flex items-center space-x-1"
          >
            <span>Ask a question on GitHub Issues</span>
            <ExternalLink className="w-3 h-3 ml-0.5" />
          </a>
        </div>
      </div>
    </section>
  );
};
