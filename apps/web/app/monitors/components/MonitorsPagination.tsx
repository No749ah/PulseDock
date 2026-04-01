"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  pageSize: number | "all";
  totalPages: number;
  safePage: number;
  onPageChange: (page: number) => void;
}

export function MonitorsPagination({ pageSize, totalPages, safePage, onPageChange }: Props) {
  if (pageSize === "all" || totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/60">
      <button
        onClick={() => onPageChange(Math.max(1, safePage - 1))}
        disabled={safePage <= 1}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Previous
      </button>
      <div className="text-xs text-text-secondary">Page {safePage} of {totalPages}</div>
      <button
        onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
        disabled={safePage >= totalPages}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
