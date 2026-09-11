"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown, Download, FileJson } from "lucide-react";
import type { ReactNode } from "react";
import type { SortDir, SortState } from "../../lib/useTableSort";

interface SortableHeaderProps<K extends string> {
  children: ReactNode;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  className?: string;
}

export function SortableHeader<K extends string>({
  children,
  sortKey,
  sort,
  onSort,
  className = "",
}: SortableHeaderProps<K>) {
  const active = sort.key === sortKey;
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider cursor-pointer select-none hover:text-text-primary transition-colors group ${className}`}
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span className="flex items-center gap-1">
        {children}
        {active ? (
          sort.dir === "asc" ? (
            <ChevronUp className="w-3 h-3 text-accent" />
          ) : (
            <ChevronDown className="w-3 h-3 text-accent" />
          )
        ) : (
          <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        )}
      </span>
    </th>
  );
}

interface PaginationProps {
  page: number;
  pageCount: number;
  pageSize: number | string;
  totalItems: number;
  onPage: (p: number) => void;
  onPageSize: (s: string) => void;
  pageSizeOptions?: number[];
  onExportCSV?: () => void;
  onExportJSON?: () => void;
  className?: string;
}

export function TablePagination({
  page,
  pageCount,
  pageSize,
  totalItems,
  onPage,
  onPageSize,
  pageSizeOptions = [10, 25, 50, 100],
  onExportCSV,
  onExportJSON,
  className = "",
}: PaginationProps) {
  const size = Number(pageSize);
  const start = Math.min((page - 1) * size + 1, totalItems);
  const end = Math.min(page * size, totalItems);

  return (
    <div className={`flex items-center justify-between px-4 py-3 border-t border-border bg-surface-elevated text-sm ${className}`}>
      <div className="flex items-center gap-3">
        <span className="text-text-secondary">
          {totalItems === 0 ? "0 items" : `${start}–${end} of ${totalItems}`}
        </span>
        <div className="flex items-center gap-1.5">
          <label className="text-text-secondary text-xs">Rows:</label>
          <select
            value={pageSize}
            onChange={(e) => { onPageSize(e.target.value); onPage(1); }}
            className="bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        {(onExportCSV || onExportJSON) && (
          <div className="flex items-center gap-1">
            {onExportCSV && (
              <button
                onClick={onExportCSV}
                title="Export as CSV"
                className="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
                aria-label="Export as CSV"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
            {onExportJSON && (
              <button
                onClick={onExportJSON}
                title="Export as JSON"
                className="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
                aria-label="Export as JSON"
              >
                <FileJson className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(1)}
          disabled={page === 1}
          className="px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="First page"
        >
          «
        </button>
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          ‹
        </button>
        {/* Page number buttons */}
        {Array.from({ length: Math.min(5, pageCount) }, (_, i) => {
          let p: number;
          if (pageCount <= 5) p = i + 1;
          else if (page <= 3) p = i + 1;
          else if (page >= pageCount - 2) p = pageCount - 4 + i;
          else p = page - 2 + i;
          return (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                p === page
                  ? "bg-accent text-white font-semibold"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
              }`}
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </button>
          );
        })}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === pageCount}
          className="px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          ›
        </button>
        <button
          onClick={() => onPage(pageCount)}
          disabled={page === pageCount}
          className="px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Last page"
        >
          »
        </button>
      </div>
    </div>
  );
}
