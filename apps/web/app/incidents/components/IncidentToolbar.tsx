'use client';

import { ChevronDown, ChevronUp, ChevronsUpDown, Download, Search } from 'lucide-react';

type SortCol = 'title' | 'status' | 'severity' | 'updatedAt';

interface IncidentToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortKey: SortCol;
  sortDir: 'asc' | 'desc';
  onToggleSort: (col: SortCol) => void;
  onExport: () => void;
}

function SortIcon({ col, sortKey, sortDir }: { col: SortCol; sortKey: SortCol; sortDir: 'asc' | 'desc' }) {
  if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
  return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
}

export function IncidentToolbar({ searchQuery, onSearchChange, sortKey, sortDir, onToggleSort, onExport }: IncidentToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Search incidents…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface border border-border text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {(['title', 'status', 'severity', 'updatedAt'] as const).map((col) => (
          <button
            key={col}
            onClick={() => onToggleSort(col)}
            className={`flex items-center gap-1 px-2.5 py-2 rounded-lg border text-xs font-medium transition-colors ${
              sortKey === col ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border text-text-secondary hover:text-text-primary hover:border-border-hover'
            }`}
          >
            {col === 'updatedAt' ? 'Date' : col.charAt(0).toUpperCase() + col.slice(1)}
            <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
          </button>
        ))}
        <button
          onClick={onExport}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-border text-xs font-medium text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
          title="Export to CSV"
        >
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>
    </div>
  );
}
