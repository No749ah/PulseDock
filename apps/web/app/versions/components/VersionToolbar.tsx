'use client';

import { Plus, Play, Download, Eye } from 'lucide-react';
import { Button } from '../../components/Button';
import type { Summary } from './types';

interface VersionToolbarProps {
  summary: Summary | null;
  sortedItems: { id: string }[];
  sortBy: 'name' | 'status' | 'lastChecked';
  sortDir: 'asc' | 'desc';
  runningAll: boolean;
  visibleCols: Record<string, boolean>;
  showColPicker: boolean;
  onRunAll: () => void;
  onRefresh: () => void;
  onExportCSV: () => void;
  onCreateOpen: () => void;
  onSortChange: (sortBy: 'name' | 'status' | 'lastChecked', sortDir: 'asc' | 'desc') => void;
  onToggleColPicker: () => void;
  onToggleCol: (col: string) => void;
}

const COL_DEFS: [string, string][] = [
  ['name', 'Name'], ['type', 'Type'], ['target', 'Target'], ['current', 'Current'],
  ['latest', 'Latest'], ['status', 'Status'], ['lastChecked', 'Last Checked'],
  ['interval', 'Interval'], ['action', 'Action'],
];

export function VersionToolbar({
  summary, sortedItems, sortBy, sortDir, runningAll,
  visibleCols, showColPicker,
  onRunAll, onRefresh, onExportCSV, onCreateOpen,
  onSortChange, onToggleColPicker, onToggleCol,
}: VersionToolbarProps) {
  return (
    <>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-text-secondary mb-1">
            <span>Dashboard</span>
            <span>/</span>
            <span className="text-text-primary font-medium">Versions</span>
          </div>
          <h2 className="text-2xl font-bold text-text-primary">Version Checks</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(summary?.items?.length ?? 0) > 0 && (
            <Button variant="secondary" size="sm" loading={runningAll} onClick={onRunAll} title="Run all version checks now">
              <span className="flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Check All</span>
              </span>
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onRefresh} title="Refresh">
            <span className="hidden sm:inline">Refresh</span>
            <span className="sm:hidden">↺</span>
          </Button>
          {sortedItems.length > 0 && (
            <Button variant="secondary" size="sm" onClick={onExportCSV} title="Export to CSV">
              <span className="flex items-center gap-1.5">
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export CSV</span>
              </span>
            </Button>
          )}
          <Button size="sm" onClick={onCreateOpen}>
            <span className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Create version check</span>
              <span className="sm:hidden">New</span>
            </span>
          </Button>
        </div>
      </div>

      {/* Summary + sort + col picker */}
      {(summary?.stats.total ?? 0) > 0 && (
        <div className="flex items-center gap-4 mb-6 text-sm flex-wrap">
          <span className="text-text-secondary">
            <span className="font-semibold text-text-primary">{summary?.stats.total ?? 0}</span> monitored
          </span>
          <span className="text-text-secondary opacity-40">·</span>
          <span className="text-text-secondary">
            <span className="font-semibold text-success">{summary?.stats.green ?? 0}</span> up to date
          </span>
          <span className="text-text-secondary opacity-40">·</span>
          <span className="text-text-secondary">
            <span className={`font-semibold ${((summary?.stats.yellow ?? 0) + (summary?.stats.red ?? 0)) > 0 ? 'text-warning' : 'text-text-primary'}`}>
              {(summary?.stats.yellow ?? 0) + (summary?.stats.red ?? 0)}
            </span>{' '}
            updates available
          </span>
          {(summary?.stats.red ?? 0) > 0 && (
            <>
              <span className="text-text-secondary opacity-40">·</span>
              <span className="text-text-secondary">
                <span className="font-semibold text-danger">{summary?.stats.red ?? 0}</span> critical
              </span>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-text-secondary">Sort by</span>
            <select
              value={`${sortBy}-${sortDir}`}
              onChange={(e) => {
                const [col, dir] = e.target.value.split('-') as ['name' | 'status' | 'lastChecked', 'asc' | 'desc'];
                onSortChange(col, dir);
              }}
              className="text-xs px-2 py-1 bg-surface-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="name-asc">Name A→Z</option>
              <option value="name-desc">Name Z→A</option>
              <option value="status-asc">Status (updates first)</option>
              <option value="status-desc">Status (ok first)</option>
              <option value="lastChecked-desc">Last checked (newest)</option>
              <option value="lastChecked-asc">Last checked (oldest)</option>
            </select>
            <div className="relative">
              <button
                onClick={onToggleColPicker}
                title="Toggle column visibility"
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${showColPicker ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated'}`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Columns</span>
              </button>
              {showColPicker && (
                <div className="absolute right-0 top-full mt-1 z-30 w-48 rounded-xl border border-border bg-surface shadow-xl shadow-black/30 p-2 space-y-1">
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-2 py-1">Visible Columns</p>
                  {COL_DEFS.map(([col, label]) => (
                    <button
                      key={col}
                      onClick={() => onToggleCol(col)}
                      className="flex items-center justify-between w-full rounded-lg px-2 py-1.5 text-xs hover:bg-surface-elevated transition-colors"
                    >
                      <span className={visibleCols[col] ? 'text-text-primary' : 'text-text-muted'}>{label}</span>
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] ${visibleCols[col] ? 'bg-accent border-accent text-white' : 'border-border'}`}>
                        {visibleCols[col] ? '✓' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
