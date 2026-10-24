import React, { useEffect, useState } from "react";
import {
  Bookmark,
  RefreshCw,
  Plus,
  Trash2,
  Download,
  Sparkles,
  Film,
  Image as ImageIcon,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  ArrowRight,
  Filter,
  X,
} from "lucide-react";
import type {
  DiscoveredMediaItem,
  IncrementalScanResult,
  RescanAllSummary,
  SavedSourceRecord,
} from "../../../desktop/shared/types";

interface SavedSourcesViewProps {
  onScanUrl: (url: string) => void;
  onBatchDownload?: (items: DiscoveredMediaItem[]) => void;
  onNavigateToDownloads?: () => void;
}

export const SavedSourcesView: React.FC<SavedSourcesViewProps> = ({
  onScanUrl,
  onBatchDownload,
  onNavigateToDownloads,
}) => {
  const [sources, setSources] = useState<SavedSourceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [activeRescanId, setActiveRescanId] = useState<string | null>(null);
  const [isRescanningAll, setIsRescanningAll] = useState<boolean>(false);
  const [rescanResult, setRescanResult] = useState<IncrementalScanResult | null>(null);
  const [rescanSummary, setRescanSummary] = useState<RescanAllSummary | null>(null);
  const [rescanModalOpen, setRescanModalOpen] = useState<boolean>(false);
  const [rescanItemTab, setRescanItemTab] = useState<"new" | "all">("new");

  // Add Source Modal State
  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
  const [addUrl, setAddUrl] = useState<string>("");
  const [addTitle, setAddTitle] = useState<string>("");
  const [addTags, setAddTags] = useState<string>("");
  const [addSaving, setAddSaving] = useState<boolean>(false);

  // Feedback toast
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showFeedback = (message: string, type: "success" | "error" = "success") => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 3500);
  };

  const loadSources = async () => {
    if (!window.api?.getSavedSources) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await window.api.getSavedSources();
      setSources(res.sources || []);
    } catch (err) {
      console.error("Failed to load saved sources:", err);
      showFeedback("Failed to load saved sources from database", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  // Compute unique tags from all sources
  const allTags = Array.from(
    new Set(sources.flatMap((s) => s.tags || []).filter(Boolean))
  ).sort();

  // Filter sources based on query and selected tag
  const filteredSources = sources.filter((s) => {
    const matchesQuery =
      searchQuery.trim() === "" ||
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.author && s.author.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesTag =
      selectedTag === "all" ||
      (s.tags && s.tags.some((t) => t.toLowerCase() === selectedTag.toLowerCase()));

    return matchesQuery && matchesTag;
  });

  const handleAddSource = async () => {
    if (!addUrl.trim()) {
      showFeedback("Source URL is required", "error");
      return;
    }
    if (!window.api?.saveSource) return;

    setAddSaving(true);
    try {
      const parsedTags = addTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const title = addTitle.trim() || addUrl.trim();
      const res = await window.api.saveSource({
        url: addUrl.trim(),
        title,
        tags: parsedTags,
      });

      showFeedback(`Source '${res.source.title}' bookmarked successfully!`);
      setAddModalOpen(false);
      setAddUrl("");
      setAddTitle("");
      setAddTags("");
      await loadSources();
    } catch (err: any) {
      showFeedback(err?.message || "Failed to save source", "error");
    } finally {
      setAddSaving(false);
    }
  };

  const handleDeleteSource = async (sourceId: string, title: string) => {
    if (!window.api?.deleteSavedSource) return;
    try {
      await window.api.deleteSavedSource(sourceId);
      showFeedback(`Deleted source '${title}'`);
      await loadSources();
    } catch (err: any) {
      showFeedback(err?.message || "Failed to delete source", "error");
    }
  };

  const handleRescanSingle = async (sourceId: string) => {
    if (!window.api?.rescanSource) return;
    setActiveRescanId(sourceId);
    try {
      const res = await window.api.rescanSource(sourceId);
      setRescanResult(res.result);
      setRescanItemTab(res.result.new_item_count > 0 ? "new" : "all");
      setRescanModalOpen(true);
      await loadSources();
    } catch (err: any) {
      showFeedback(err?.message || "Incremental rescan failed", "error");
    } finally {
      setActiveRescanId(null);
    }
  };

  const handleRescanAll = async () => {
    if (!window.api?.rescanAllSources) return;
    setIsRescanningAll(true);
    try {
      const res = await window.api.rescanAllSources(selectedTag !== "all" ? selectedTag : undefined);
      setRescanSummary(res.summary);
      showFeedback(
        `Rescanned ${res.summary.sources_checked} sources: ${res.summary.total_new_items} NEW items found!`
      );
      await loadSources();
    } catch (err: any) {
      showFeedback(err?.message || "Rescan all failed", "error");
    } finally {
      setIsRescanningAll(false);
    }
  };

  const handleDownloadAllNew = (items: DiscoveredMediaItem[]) => {
    if (onBatchDownload) {
      onBatchDownload(items);
      setRescanModalOpen(false);
      if (onNavigateToDownloads) {
        onNavigateToDownloads();
      }
    }
  };

  const formatDate = (isoStr?: string | null): string => {
    if (!isoStr) return "Never scanned";
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-brand-black overflow-y-auto p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-dark/60 pb-5">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-amber-950/60 border border-amber-800/60 flex items-center justify-center text-amber-400 shadow-md shadow-amber-950/40">
            <Bookmark className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-brand-white flex items-center space-x-2.5">
              <span>Saved Sources &amp; Incremental Rescan</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-brand-dark border border-brand-dark/80 text-amber-300">
                {sources.length} {sources.length === 1 ? "Source" : "Sources"}
              </span>
            </h1>
            <p className="text-xs text-neutral-400 font-mono">
              Bookmark channels, artist portfolios, and galleries. Run 1-click rescans to discover only new items.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={handleRescanAll}
            disabled={isRescanningAll || sources.length === 0}
            className="px-3.5 py-2 bg-brand-black hover:bg-brand-dark border border-brand-dark text-cyan-300 rounded-xl text-xs font-mono transition-colors flex items-center space-x-2 disabled:opacity-50"
            title="Rescan all saved sources to discover new uploads"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRescanningAll ? "animate-spin" : ""}`} />
            <span>{isRescanningAll ? "Rescanning All..." : "Rescan All"}</span>
          </button>

          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-xl text-xs transition-colors flex items-center space-x-1.5 shadow-md shadow-amber-600/20"
          >
            <Plus className="h-4 w-4" />
            <span>Add Source</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-mono flex items-center justify-between animate-in fade-in duration-150 ${
            feedback.type === "success"
              ? "bg-emerald-950/60 border-emerald-800/60 text-emerald-300"
              : "bg-red-950/60 border-red-800/60 text-red-300"
          }`}
        >
          <div className="flex items-center space-x-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-neutral-400 hover:text-white ml-2 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Rescan All Summary Banner */}
      {rescanSummary && (
        <div className="p-3.5 rounded-xl border border-amber-800/60 bg-amber-950/40 text-amber-200 text-xs font-mono flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-3">
            <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold text-amber-300">Rescan All Completed:</span>{" "}
              Checked {rescanSummary.sources_checked} sources ·{" "}
              <span className="text-emerald-400 font-bold">{rescanSummary.total_new_items} new items discovered</span> ·{" "}
              {rescanSummary.total_items_found} total items · {Object.keys(rescanSummary.errors).length} errors
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRescanSummary(null)}
            className="text-amber-400/80 hover:text-white p-1"
            title="Dismiss summary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-brand-dark/20 border border-brand-dark/70 rounded-2xl p-4 shadow-lg shadow-black/40">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by title, author, or URL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-brand-black border border-brand-dark rounded-xl pl-9 pr-3.5 py-2 text-xs text-neutral-200 placeholder-neutral-500 font-mono focus:border-amber-500"
          />
        </div>

        {/* Tag Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0 text-xs font-mono">
          <Filter className="h-3.5 w-3.5 text-neutral-400 shrink-0 ml-1" />
          <button
            type="button"
            onClick={() => setSelectedTag("all")}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              selectedTag === "all"
                ? "bg-amber-950/80 text-amber-300 font-bold border border-amber-800/60"
                : "bg-brand-black border border-brand-dark text-neutral-400 hover:text-white"
            }`}
          >
            All ({sources.length})
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(tag)}
              className={`px-2.5 py-1 rounded-lg transition-colors capitalize ${
                selectedTag === tag
                  ? "bg-amber-950/80 text-amber-300 font-bold border border-amber-800/60"
                  : "bg-brand-black border border-brand-dark text-neutral-400 hover:text-white"
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      {/* Sources Grid */}
      {loading ? (
        <div className="py-24 text-center text-xs font-mono text-neutral-400 flex flex-col items-center space-y-3">
          <RefreshCw className="h-6 w-6 animate-spin text-amber-400" />
          <span>Loading bookmarked sources...</span>
        </div>
      ) : filteredSources.length === 0 ? (
        <div className="py-24 text-center border border-dashed border-brand-dark rounded-2xl bg-brand-dark/10 p-8 space-y-3">
          <Bookmark className="h-8 w-8 text-neutral-600 mx-auto" />
          <h3 className="text-sm font-bold text-neutral-300">No Saved Sources Found</h3>
          <p className="text-xs text-neutral-500 font-mono max-w-md mx-auto">
            {searchQuery || selectedTag !== "all"
              ? "No sources match your active filter. Try resetting your search."
              : "Bookmark artist profiles, galleries, and channels to track new uploads and run differential rescans."}
          </p>
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="mt-2 px-3 py-1.5 bg-brand-dark hover:bg-neutral-800 border border-brand-dark text-amber-300 text-xs font-mono rounded-lg transition-colors"
          >
            + Add Your First Source
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSources.map((source) => {
            const isRescanning = activeRescanId === source.id;
            return (
              <div
                key={source.id}
                className="bg-brand-dark/20 hover:bg-brand-dark/30 border border-brand-dark/70 rounded-2xl p-5 space-y-4 shadow-lg shadow-black/40 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Top Bar: Platform & Category */}
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="px-2 py-0.5 rounded bg-brand-black border border-brand-dark text-amber-300 font-bold capitalize">
                      {source.platform || "Custom Source"}
                    </span>
                    <span className="text-neutral-500 capitalize">
                      {source.category || "Collection"}
                    </span>
                  </div>

                  {/* Title & Author */}
                  <div>
                    <h3 className="text-sm font-bold text-brand-white line-clamp-1" title={source.title}>
                      {source.title}
                    </h3>
                    {source.author && (
                      <span className="text-xs text-neutral-400 font-mono">
                        by @{source.author}
                      </span>
                    )}
                  </div>

                  {/* Target URL */}
                  <div className="bg-brand-black/60 border border-brand-dark/60 rounded-xl p-2.5 text-[11px] font-mono text-neutral-400 truncate flex items-center justify-between">
                    <span className="truncate pr-2" title={source.url}>
                      {source.url}
                    </span>
                    <button
                      type="button"
                      onClick={() => onScanUrl(source.url)}
                      className="text-cyan-400 hover:text-cyan-300 p-1 hover:bg-cyan-950/40 rounded transition-colors shrink-0"
                      title="Load in Scan Media view"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Tags */}
                  {source.tags && source.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {source.tags.map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950/40 border border-amber-800/40 text-amber-300"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bottom Metadata & Actions */}
                <div className="space-y-3 pt-3 border-t border-brand-dark/50">
                  <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400">
                    <div className="flex items-center space-x-1.5">
                      <Clock className="h-3 w-3 text-neutral-500" />
                      <span>{formatDate(source.last_scanned_at)}</span>
                    </div>
                    <span className="text-cyan-300 font-bold">
                      {source.last_item_count} {source.last_item_count === 1 ? "item" : "items"}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleRescanSingle(source.id)}
                      disabled={isRescanning}
                      className="flex-1 py-1.5 bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-800/60 text-cyan-200 rounded-xl text-xs font-mono transition-colors flex items-center justify-center space-x-1.5 shadow-sm"
                    >
                      <RefreshCw className={`h-3 w-3 ${isRescanning ? "animate-spin" : ""}`} />
                      <span>{isRescanning ? "Rescanning..." : "Rescan Now"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSource(source.id, source.title)}
                      className="p-1.5 bg-brand-black hover:bg-red-950/50 border border-brand-dark hover:border-red-800/60 text-neutral-400 hover:text-red-300 rounded-xl transition-colors"
                      title="Delete saved source"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Source Modal */}
      {addModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setAddModalOpen(false)}
        >
          <div
            className="bg-brand-black border border-brand-dark rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3 text-amber-400">
              <Bookmark className="h-5 w-5 shrink-0" />
              <h3 className="text-sm font-bold text-white">Bookmark Media Source</h3>
            </div>
            <p className="text-xs text-neutral-400 font-mono">
              Save a gallery, profile, channel, or direct collection URL for differential monitoring.
            </p>
            <div className="space-y-3 font-mono">
              <div>
                <label className="text-[10px] text-neutral-400 uppercase">Source URL *</label>
                <input
                  type="text"
                  placeholder="https://artstation.com/artist/projects or https://youtube.com/@channel"
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  className="w-full mt-1 bg-brand-dark/40 border border-brand-dark rounded-lg px-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-neutral-400 uppercase">Title / Name (Optional)</label>
                <input
                  type="text"
                  placeholder="Artist Portfolio or Channel Name"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  className="w-full mt-1 bg-brand-dark/40 border border-brand-dark rounded-lg px-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-neutral-400 uppercase">Tags (Optional, comma-separated)</label>
                <input
                  type="text"
                  placeholder="concept-art, 3d, illustrations, favorites"
                  value={addTags}
                  onChange={(e) => setAddTags(e.target.value)}
                  className="w-full mt-1 bg-brand-dark/40 border border-brand-dark rounded-lg px-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:border-amber-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="px-4 py-2 bg-brand-dark hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-xl text-xs font-mono transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddSource}
                disabled={addSaving}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-xl text-xs transition-colors flex items-center space-x-1.5"
              >
                {addSaving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>Save Source</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incremental Rescan Results Modal */}
      {rescanModalOpen && rescanResult && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setRescanModalOpen(false)}
        >
          <div
            className="bg-brand-black border border-brand-dark rounded-2xl w-full max-w-3xl max-h-[85vh] p-6 shadow-2xl space-y-4 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-brand-dark/60 pb-3">
              <div className="flex items-center space-x-2.5">
                <Sparkles className="h-5 w-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <span>Rescan Results: {rescanResult.source.title}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/80 border border-emerald-800/60 text-emerald-300 font-bold">
                      +{rescanResult.new_item_count} NEW
                    </span>
                  </h3>
                  <p className="text-[11px] text-neutral-400 font-mono truncate max-w-lg">
                    {rescanResult.source.url}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRescanModalOpen(false)}
                className="text-neutral-400 hover:text-white text-xs p-1"
              >
                ✕
              </button>
            </div>

            {/* Differential Summary Metrics */}
            <div className="grid grid-cols-3 gap-3 text-xs font-mono">
              <div className="bg-brand-dark/30 border border-brand-dark rounded-xl p-3 text-center">
                <span className="text-[10px] text-neutral-400 uppercase">Total Found</span>
                <div className="text-base font-bold text-white mt-0.5">
                  {rescanResult.total_found}
                </div>
              </div>
              <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-xl p-3 text-center">
                <span className="text-[10px] text-emerald-400 uppercase">New Since Last Visit</span>
                <div className="text-base font-bold text-emerald-300 mt-0.5">
                  +{rescanResult.new_item_count}
                </div>
              </div>
              <div className="bg-brand-dark/30 border border-brand-dark rounded-xl p-3 text-center">
                <span className="text-[10px] text-neutral-400 uppercase">Previously Known</span>
                <div className="text-base font-bold text-neutral-300 mt-0.5">
                  {rescanResult.existing_items.length}
                </div>
              </div>
            </div>

            {/* View Tabs & Batch Download CTA */}
            <div className="flex items-center justify-between border-b border-brand-dark/50 pb-2">
              <div className="flex space-x-2 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setRescanItemTab("new")}
                  className={`px-3 py-1 rounded-lg transition-colors ${
                    rescanItemTab === "new"
                      ? "bg-emerald-950/80 text-emerald-300 font-bold border border-emerald-800/60"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  New Items Only ({rescanResult.new_item_count})
                </button>
                <button
                  type="button"
                  onClick={() => setRescanItemTab("all")}
                  className={`px-3 py-1 rounded-lg transition-colors ${
                    rescanItemTab === "all"
                      ? "bg-amber-950/80 text-amber-300 font-bold border border-amber-800/60"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  All Discovered Items ({rescanResult.total_found})
                </button>
              </div>

              {rescanResult.new_item_count > 0 && (
                <button
                  type="button"
                  onClick={() => handleDownloadAllNew(rescanResult.new_items)}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-black font-bold rounded-lg text-xs font-mono transition-colors flex items-center space-x-1.5 shadow-md shadow-emerald-900/40"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download {rescanResult.new_item_count} New</span>
                </button>
              )}
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-xs">
              {(() => {
                const displayItems =
                  rescanItemTab === "new" ? rescanResult.new_items : [...rescanResult.new_items, ...rescanResult.existing_items];

                if (displayItems.length === 0) {
                  return (
                    <div className="py-12 text-center text-neutral-500">
                      No new items discovered since last scan. Everything is up to date!
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {displayItems.map((item) => {
                      const isNew = rescanResult.new_items.some((n) => n.id === item.id);
                      return (
                        <div
                          key={item.id}
                          className={`p-3 rounded-xl border flex items-center space-x-3 transition-colors ${
                            isNew
                              ? "bg-emerald-950/20 border-emerald-800/50 text-white"
                              : "bg-brand-dark/20 border-brand-dark text-neutral-300"
                          }`}
                        >
                          {item.thumbnail_url ? (
                            <img
                              src={item.thumbnail_url}
                              alt={item.title || "thumbnail"}
                              className="h-12 w-12 object-cover rounded-lg shrink-0 border border-brand-dark"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-lg bg-brand-dark flex items-center justify-center shrink-0 text-neutral-400">
                              {item.media_type === "video" ? (
                                <Film className="h-5 w-5" />
                              ) : (
                                <ImageIcon className="h-5 w-5" />
                              )}
                            </div>
                          )}

                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center space-x-1.5">
                              {isNew ? (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-950 border border-emerald-700 text-emerald-300 uppercase">
                                  NEW
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.2 rounded text-[9px] bg-brand-dark text-neutral-400 uppercase">
                                  KNOWN
                                </span>
                              )}
                              <span className="text-xs font-bold truncate block" title={item.title || item.id}>
                                {item.title || "Untitled Media"}
                              </span>
                            </div>
                            <div className="text-[10px] text-neutral-400 truncate" title={item.original_url}>
                              {item.original_url}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-brand-dark/60">
              <button
                type="button"
                onClick={() => setRescanModalOpen(false)}
                className="px-4 py-1.5 bg-brand-dark hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-xl text-xs font-mono transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
