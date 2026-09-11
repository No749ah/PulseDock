import React from "react";
import { X, Bookmark, BookmarkPlus } from "lucide-react";
import type { TagItem } from "../types";

interface FilterPreset {
  name: string;
  filters: Record<string, string>;
}

interface AdvancedFiltersPanelProps {
  filterStatuses: Set<string>;
  filterTypes: Set<string>;
  filterTags: Set<string>;
  allTags: TagItem[];
  savedPresets: FilterPreset[];
  activeFilterCount: number;
  onSetFilterStatuses: React.Dispatch<React.SetStateAction<Set<string>>>;
  onSetFilterTypes: React.Dispatch<React.SetStateAction<Set<string>>>;
  onSetFilterTags: React.Dispatch<React.SetStateAction<Set<string>>>;
  onSavePreset: () => void;
  onApplyPreset: (preset: FilterPreset) => void;
  onDeletePreset: (idx: number) => void;
  onClearFilters: () => void;
}

export function AdvancedFiltersPanel({
  filterStatuses,
  filterTypes,
  filterTags,
  allTags,
  savedPresets,
  activeFilterCount,
  onSetFilterStatuses,
  onSetFilterTypes,
  onSetFilterTags,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  onClearFilters,
}: AdvancedFiltersPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-text-primary">Filters</span>
        <div className="flex items-center gap-2">
          {savedPresets.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {savedPresets.map((preset, idx) => (
                <div key={idx} className="flex items-center gap-0.5 bg-surface-elevated border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => onApplyPreset(preset)}
                    className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <Bookmark className="w-3 h-3 inline mr-1" />
                    {preset.name}
                  </button>
                  <button
                    onClick={() => onDeletePreset(idx)}
                    className="px-1.5 py-1 text-text-muted hover:text-danger transition-colors"
                    aria-label={`Delete preset ${preset.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={onSavePreset}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-surface-elevated text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            Save
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={onClearFilters}
              className="text-xs text-danger/70 hover:text-danger transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Status filter */}
        <div className="space-y-2">
          <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Status</span>
          <div className="space-y-1.5">
            {([
              { key: "up", label: "Up", color: "text-success" },
              { key: "down", label: "Down", color: "text-danger" },
              { key: "degraded", label: "Degraded", color: "text-warning" },
              { key: "paused", label: "Paused", color: "text-text-secondary" },
            ] as const).map(({ key, label, color }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={filterStatuses.has(key)}
                  onChange={() => {
                    onSetFilterStatuses((prev) => {
                      const next = new Set(prev);
                      next.has(key) ? next.delete(key) : next.add(key);
                      return next;
                    });
                  }}
                  className="w-3.5 h-3.5 rounded border-border bg-surface accent-accent"
                />
                <span className={`text-xs font-medium ${color} group-hover:opacity-80`}>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Type filter */}
        <div className="space-y-2">
          <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Type</span>
          <div className="space-y-1.5">
            {([
              { key: "HTTP", label: "HTTP" },
              { key: "TCP", label: "TCP" },
              { key: "SSL_CERT", label: "SSL" },
              { key: "HEARTBEAT", label: "Heartbeat" },
              { key: "DNS", label: "DNS" },
              { key: "PING", label: "Ping" },
              { key: "SMTP", label: "SMTP" },
              { key: "BROWSER", label: "Browser" },
              { key: "GIT_RELEASE", label: "Git Release" },
              { key: "DOCKER_IMAGE", label: "Docker" },
              { key: "WHOIS", label: "WHOIS" },
              { key: "FTP", label: "FTP" },
              { key: "IMAP", label: "IMAP" },
              { key: "POP3", label: "POP3" },
              { key: "CT_LOG", label: "CT Log" },
              { key: "GRAPHQL", label: "GraphQL" },
              { key: "TRANSACTION", label: "Transaction" },
            ] as const).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={filterTypes.has(key)}
                  onChange={() => {
                    onSetFilterTypes((prev) => {
                      const next = new Set(prev);
                      next.has(key) ? next.delete(key) : next.add(key);
                      return next;
                    });
                  }}
                  className="w-3.5 h-3.5 rounded border-border bg-surface accent-accent"
                />
                <span className="text-xs text-text-primary group-hover:opacity-80">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Tags</span>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => {
                    onSetFilterTags((prev) => {
                      const next = new Set(prev);
                      next.has(tag.name) ? next.delete(tag.name) : next.add(tag.name);
                      return next;
                    });
                  }}
                  className="px-2 py-1 rounded-full text-xs font-medium transition-all border"
                  style={{
                    backgroundColor: filterTags.has(tag.name) ? tag.color + "40" : "transparent",
                    borderColor: tag.color + "80",
                    color: filterTags.has(tag.name) ? tag.color : undefined,
                    opacity: filterTags.has(tag.name) ? 1 : 0.6,
                  }}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
