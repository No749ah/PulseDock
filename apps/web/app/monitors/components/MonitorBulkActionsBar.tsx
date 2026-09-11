"use client";

import { PauseCircle, PlayCircle, Power, PowerOff, Settings, Tag, Trash2, X } from "lucide-react";
import { Button } from "../../components/Button";
import type { TagItem } from "../types";

interface Props {
  selectedCount: number;
  bulkLoading: boolean;
  allTags: TagItem[];
  bulkTagId: string;
  onBulkTagIdChange: (value: string) => void;
  bulkValue: string;
  onBulkValueChange: (value: string) => void;
  onBulkAction: (action: "enable" | "disable" | "delete" | "run" | "add-tag" | "remove-tag" | "update-interval" | "update-timeout" | "update-confirmations" | "pause") => void;
  onOpenBulkEdit: () => void;
  onClearSelection: () => void;
}

export function MonitorBulkActionsBar({
  selectedCount,
  bulkLoading,
  allTags,
  bulkTagId,
  onBulkTagIdChange,
  bulkValue,
  onBulkValueChange,
  onBulkAction,
  onOpenBulkEdit,
  onClearSelection,
}: Props) {
  if (selectedCount === 0) return null;

  return (
    <div className="mb-3 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-2.5">
      <span className="text-sm font-medium text-text-primary mr-1">{selectedCount} selected</span>
      <Button size="sm" variant="secondary" onClick={() => onBulkAction("enable")} disabled={bulkLoading} className="flex items-center gap-1.5">
        <Power className="w-3.5 h-3.5" />Enable
      </Button>
      <Button size="sm" variant="secondary" onClick={() => onBulkAction("disable")} disabled={bulkLoading} className="flex items-center gap-1.5">
        <PowerOff className="w-3.5 h-3.5" />Disable
      </Button>
      <Button size="sm" variant="secondary" onClick={() => onBulkAction("run")} disabled={bulkLoading} className="flex items-center gap-1.5">
        <PlayCircle className="w-3.5 h-3.5" />Run now
      </Button>
      <Button size="sm" variant="secondary" onClick={() => onBulkAction("pause")} disabled={bulkLoading} className="flex items-center gap-1.5" title={`Pause for ${bulkValue || 60} minutes`}>
        <PauseCircle className="w-3.5 h-3.5" />Pause
      </Button>

      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-border">
          <Tag className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <select
            value={bulkTagId}
            onChange={(e) => onBulkTagIdChange(e.target.value)}
            className="text-xs px-2 py-1 bg-bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
            aria-label="Select tag for bulk action"
          >
            <option value="">Select tag…</option>
            {allTags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
          <Button size="sm" variant="secondary" onClick={() => onBulkAction("add-tag")} disabled={bulkLoading || !bulkTagId} className="flex items-center gap-1 text-xs">
            + Tag
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onBulkAction("remove-tag")} disabled={bulkLoading || !bulkTagId} className="flex items-center gap-1 text-xs">
            − Tag
          </Button>
        </div>
      )}

      <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-border">
        <input
          type="number"
          value={bulkValue}
          onChange={(e) => onBulkValueChange(e.target.value)}
          placeholder="value"
          className="w-16 text-xs px-2 py-1 bg-bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
          aria-label="Bulk update value"
        />
        <Button size="sm" variant="secondary" onClick={() => onBulkAction("update-interval")} disabled={bulkLoading || !bulkValue} className="text-xs" title="Set check interval (seconds)">
          Set interval
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onBulkAction("update-confirmations")} disabled={bulkLoading || !bulkValue} className="text-xs" title="Set required confirmations (1-10)">
          Set confirms
        </Button>
      </div>

      <Button size="sm" variant="secondary" onClick={onOpenBulkEdit} disabled={bulkLoading} className="flex items-center gap-1.5 ml-1 pl-2 border-l border-border">
        <Settings className="w-3.5 h-3.5" />Bulk Edit
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onBulkAction("delete")} disabled={bulkLoading} className="flex items-center gap-1.5 text-danger hover:text-danger ml-auto">
        <Trash2 className="w-3.5 h-3.5" />Delete
      </Button>
      <button onClick={onClearSelection} className="ml-1 p-1 rounded hover:bg-surface-elevated text-text-secondary hover:text-text-primary" aria-label="Clear selection">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
