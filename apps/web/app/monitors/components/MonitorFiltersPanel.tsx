"use client";

import { Filter, Search, X } from "lucide-react";
import type { TagItem } from "../types";

interface Props {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  statusFilter: "all" | "enabled" | "disabled";
  onStatusFilterChange: (value: "all" | "enabled" | "disabled") => void;
  folders: { id: string; name: string }[];
  folderFilter: string | null;
  onFolderFilterChange: (value: string | null) => void;
  showAdvancedFilters: boolean;
  activeFilterCount: number;
  onToggleAdvancedFilters: () => void;
  allTags: TagItem[];
  activeTagFilter: string | null;
  onActiveTagFilterChange: (value: string | null) => void;
}

export function MonitorFiltersPanel({
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  folders,
  folderFilter,
  onFolderFilterChange,
  showAdvancedFilters,
  activeFilterCount,
  onToggleAdvancedFilters,
  allTags,
  activeTagFilter,
  onActiveTagFilterChange,
}: Props) {
  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
          <input
            type="text"
            placeholder="Search monitors…"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchQueryChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 bg-surface-elevated border border-border rounded-lg p-1">
          {(["all", "enabled", "disabled"] as const).map((f) => (
            <button
              key={f}
              onClick={() => onStatusFilterChange(f)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors capitalize ${statusFilter === f ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"}`}
            >
              {f}
            </button>
          ))}
        </div>

        {folders.length > 0 && (
          <select
            value={folderFilter ?? ""}
            onChange={(e) => onFolderFilterChange(e.target.value || null)}
            className="px-3 py-2 bg-surface-elevated border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            aria-label="Filter by project"
          >
            <option value="">All Projects</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        )}

        <button
          onClick={onToggleAdvancedFilters}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${showAdvancedFilters || activeFilterCount > 0 ? "bg-accent/10 border-accent/40 text-accent" : "bg-surface-elevated border-border text-text-secondary hover:text-text-primary"}`}
          aria-label="Advanced filters"
        >
          <Filter className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-accent text-white text-[10px] font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {allTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onActiveTagFilterChange(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeTagFilter === null ? "bg-accent text-white" : "bg-surface-elevated text-text-secondary hover:text-text-primary"}`}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => onActiveTagFilterChange(activeTagFilter === tag.name ? null : tag.name)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-colors border"
              style={{
                backgroundColor: activeTagFilter === tag.name ? `${tag.color}40` : "transparent",
                borderColor: `${tag.color}80`,
                color: activeTagFilter === tag.name ? tag.color : undefined,
              }}
            >
              {tag.name}
              {tag.monitorCount > 0 && <span className="ml-1 opacity-60">({tag.monitorCount})</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
