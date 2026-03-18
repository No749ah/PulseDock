"use client";

import { useMemo, useState } from "react";
import { Search, CheckSquare } from "lucide-react";

interface MonitorTag {
  id: string;
  name: string;
  color?: string;
}

interface MonitorOption {
  id: string;
  name: string;
  type: string;
  folderId?: string | null;
  tags?: MonitorTag[];
}

interface TagOption {
  id: string;
  name: string;
  color?: string;
}

interface FolderOption {
  id: string;
  name: string;
}

interface MultiMonitorPickerProps {
  monitors: MonitorOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  tags: TagOption[];
  folders: FolderOption[];
}

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "HTTP", label: "HTTP" },
  { value: "TCP", label: "TCP" },
  { value: "SSL_CERT", label: "SSL" },
  { value: "GIT_RELEASE", label: "Version" },
  { value: "HEARTBEAT", label: "Heartbeat" },
];

function normalizeType(type: string) {
  return type.toUpperCase();
}

export function MultiMonitorPicker({
  monitors,
  selectedIds,
  onChange,
  tags,
  folders,
}: MultiMonitorPickerProps) {
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const filteredMonitors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return monitors.filter((monitor) => {
      if (query && !monitor.name.toLowerCase().includes(query)) return false;

      if (tagFilter) {
        const hasTag = (monitor.tags ?? []).some((tag) => tag.name === tagFilter || tag.id === tagFilter);
        if (!hasTag) return false;
      }

      if (folderFilter && monitor.folderId !== folderFilter) return false;

      if (typeFilter && normalizeType(monitor.type) !== normalizeType(typeFilter)) return false;

      return true;
    });
  }, [folderFilter, monitors, search, tagFilter, typeFilter]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allFilteredSelected = filteredMonitors.length > 0 && filteredMonitors.every((m) => selectedSet.has(m.id));

  function toggleMonitor(id: string) {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((x) => x !== id));
      return;
    }
    onChange([...selectedIds, id]);
  }

  function selectAllFiltered() {
    const filteredIds = filteredMonitors.map((m) => m.id);
    const merged = new Set([...selectedIds, ...filteredIds]);
    onChange(Array.from(merged));
  }

  function clearAllFiltered() {
    const filteredSet = new Set(filteredMonitors.map((m) => m.id));
    onChange(selectedIds.filter((id) => !filteredSet.has(id)));
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/50 bg-bg/50 p-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium text-text-secondary">Multi-Monitor Picker</p>
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
          {selectedIds.length} selected
        </span>
      </div>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-secondary/60" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search monitors..."
          className="w-full rounded-lg border border-border bg-bg py-1 pl-6 pr-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
        />
      </label>

      <div className="grid grid-cols-3 gap-1.5">
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-2 py-1 text-[10px] text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.name}>{tag.name}</option>
          ))}
        </select>

        <select
          value={folderFilter}
          onChange={(e) => setFolderFilter(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-2 py-1 text-[10px] text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">All folders</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>{folder.name}</option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-2 py-1 text-[10px] text-text-primary focus:border-accent focus:outline-none"
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value || "all"} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={allFilteredSelected ? clearAllFiltered : selectAllFiltered}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg px-2 py-1 text-[10px] font-medium text-text-secondary transition hover:text-text-primary"
        >
          <CheckSquare className="h-3 w-3" />
          {allFilteredSelected ? "Clear filtered" : "Select all"}
        </button>
        <span className="text-[10px] text-text-secondary">
          {filteredMonitors.length} visible
        </span>
      </div>

      <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-bg p-1.5">
        {filteredMonitors.length === 0 ? (
          <p className="px-1 py-2 text-[10px] text-text-secondary">No monitors match current filters.</p>
        ) : (
          filteredMonitors.map((monitor) => {
            const checked = selectedSet.has(monitor.id);
            return (
              <label
                key={monitor.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-text-primary hover:bg-surface-elevated"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleMonitor(monitor.id)}
                  className="h-3.5 w-3.5 rounded border-border bg-bg text-accent focus:ring-accent"
                />
                <span className="min-w-0 flex-1 truncate">{monitor.name}</span>
                <span className="rounded bg-surface-elevated px-1 py-0.5 text-[10px] text-text-secondary">
                  {monitor.type}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
