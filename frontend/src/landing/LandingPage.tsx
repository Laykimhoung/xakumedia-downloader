import React, { useEffect, useState } from "react";
import { Navbar } from "./Navbar";
import { HeroSection } from "./HeroSection";
import { FeaturesSection } from "./FeaturesSection";
import { WorkflowSection } from "./WorkflowSection";
import { RequirementsSection } from "./RequirementsSection";
import { InstallationSection } from "./InstallationSection";
import { SecurityPrivacySection } from "./SecurityPrivacySection";
import { ReleaseChangelogSection } from "./ReleaseChangelogSection";
import { FaqSection } from "./FaqSection";
import { LandingFooter } from "./LandingFooter";
import { ChevronUp } from "lucide-react";

export const LandingPage: React.FC = () => {
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 400) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-brand-black text-brand-white font-sans selection:bg-brand-red selection:text-white antialiased">
      {/* Top Navigation */}
      <Navbar />

      {/* Main Sections */}
      <main>
        {/* 1. Hero & Download Section */}
        <HeroSection />

        {/* 2. Key Features */}
        <FeaturesSection />

        {/* 3. Workflow - How it works */}
        <WorkflowSection />

        {/* 4. Windows System Requirements */}
        <RequirementsSection />

        {/* 5. Installation & Troubleshooting (SmartScreen Guide) */}
        <InstallationSection />

        {/* 6. Security, Privacy & Limits */}
        <SecurityPrivacySection />

        {/* 7. Current Version & Changelog */}
        <ReleaseChangelogSection />

        {/* 8. Frequently Asked Questions */}
        <FaqSection />
      </main>

      {/* Footer */}
      <LandingFooter />

      {/* Floating Scroll to Top Button */}
      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 p-3 rounded-full bg-neutral-900/90 border border-neutral-700/80 text-neutral-300 hover:text-white hover:bg-neutral-800 shadow-xl backdrop-blur-md transition-all z-40 group hover:scale-110 active:scale-95"
          aria-label="Scroll to top"
        >
          <ChevronUp className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
        </button>
      )}
    </div>
  );
};
