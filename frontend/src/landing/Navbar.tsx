import React, { useState } from "react";
import { Download, Github, Menu, X, Sun, Moon } from "lucide-react";
import { RELEASE_CONFIG } from "./downloadConfig";
import { useTheme } from "./useTheme";

export const Navbar: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#workflow" },
    { label: "Requirements", href: "#requirements" },
    { label: "Installation", href: "#installation" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-white/90 dark:bg-brand-black/90 border-b border-neutral-200/80 dark:border-neutral-900 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <a href="#" className="flex items-center space-x-2.5">
          <img
            src="/icon.png"
            alt="XakuMedia Logo"
            className="w-7 h-7 rounded-lg shadow-sm"
          />
          <span className="font-bold text-base tracking-wide text-neutral-900 dark:text-white">
            Xaku<span className="text-brand-red">Media</span>
          </span>
        </a>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center space-x-6 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          {navLinks.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="hover:text-neutral-900 dark:hover:text-white transition-colors duration-150 py-1"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Right Action Buttons */}
        <div className="hidden md:flex items-center space-x-2.5">
          {/* Light / Dark Mode Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-neutral-900 transition-all"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-neutral-600" />
            )}
          </button>

          {/* GitHub Repo Link */}
          <a
            href={`https://github.com/${RELEASE_CONFIG.githubOwner}/${RELEASE_CONFIG.githubRepo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-neutral-900 transition-all"
            title="GitHub Repository"
          >
            <Github className="w-4 h-4" />
          </a>

          {/* Download CTA */}
          <a
            href="#download"
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-brand-red hover:bg-brand-accent text-white font-medium text-xs shadow-sm shadow-brand-red/20 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </a>
        </div>

        {/* Mobile menu trigger */}
        <div className="flex md:hidden items-center space-x-1.5">
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-neutral-600" />
            )}
          </button>
          <a
            href="#download"
            className="p-2 rounded-lg bg-brand-red text-white text-xs"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-neutral-200 dark:border-neutral-900 bg-white/95 dark:bg-brand-black/95 px-4 pt-2 pb-5 space-y-3">
          <div className="flex flex-col space-y-1">
            {navLinks.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-md text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-neutral-900"
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="pt-2 border-t border-neutral-200 dark:border-neutral-900 flex items-center justify-between px-3">
            <a
              href={`https://github.com/${RELEASE_CONFIG.githubOwner}/${RELEASE_CONFIG.githubRepo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white flex items-center space-x-1"
            >
              <Github className="w-4 h-4" />
              <span>GitHub</span>
            </a>
            <a
              href="#download"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-1.5 rounded-lg bg-brand-red text-white text-xs font-medium"
            >
              Download {RELEASE_CONFIG.latestTag}
            </a>
          </div>
        </div>
      )}
    </header>
  );
};
