'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Activity, AlertTriangle, CheckCircle2, Layers, Search, X } from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Button } from '../../components/Button';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

// ─── Types ───────────────────────────────────────────────────────────────────

interface HeatmapCell {
  date: string;
  uptimePct: number | null;
  total: number;
  failed: number;
}

interface HeatmapMonitor {
  id: string;
  name: string;
  type: string;
  folder: string | null;
  days: HeatmapCell[];
}

interface HeatmapData {
  monitors: HeatmapMonitor[];
  dates: string[];
}

type DayRange = 7 | 14 | 30 | 60 | 90;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cellColor(cell: HeatmapCell): string {
  if (cell.total === 0 || cell.uptimePct === null) return 'bg-border/40';
  if (cell.uptimePct >= 99.9) return 'bg-green-500/90';
  if (cell.uptimePct >= 99) return 'bg-green-400/80';
  if (cell.uptimePct >= 95) return 'bg-yellow-400/80';
  if (cell.uptimePct >= 80) return 'bg-orange-400/80';
  return 'bg-red-500/90';
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function overallUptime(monitor: HeatmapMonitor): number | null {
  const withData = monitor.days.filter(d => d.total > 0);
  if (withData.length === 0) return null;
  const totalChecks = withData.reduce((s, d) => s + d.total, 0);
  const failedChecks = withData.reduce((s, d) => s + d.failed, 0);
  return Math.round(((totalChecks - failedChecks) / totalChecks) * 10000) / 100;
}

function UptimePill({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted">—</span>;
  const color = pct >= 99.9 ? 'text-green-400' : pct >= 99 ? 'text-green-300' : pct >= 95 ? 'text-yellow-400' : 'text-red-400';
  return <span className={`text-xs font-mono font-semibold ${color}`}>{pct.toFixed(2)}%</span>;
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function CellTooltip({ cell, monitorName }: { cell: HeatmapCell; monitorName: string }) {
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 pointer-events-none">
      <div className="bg-surface border border-border rounded-lg shadow-xl px-3 py-2 text-xs whitespace-nowrap">
        <div className="font-semibold text-primary mb-1">{monitorName}</div>
        <div className="text-muted">{formatDate(cell.date)}</div>
        {cell.total === 0 ? (
          <div className="text-muted mt-1">No checks</div>
        ) : (
          <>
            <div className="mt-1">
              <span className={cell.uptimePct !== null && cell.uptimePct >= 99.9 ? 'text-green-400' : 'text-red-400'}>
                {cell.uptimePct?.toFixed(2) ?? '—'}%
              </span>
              {' '}uptime
            </div>
            <div className="text-muted">{cell.total - cell.failed}/{cell.total} checks passed</div>
          </>
        )}
      </div>
      <div className="w-2 h-2 bg-surface border-r border-b border-border rotate-45 mx-auto -mt-1" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HeatmapPage() {
  const router = useRouter();
  const { error: toastError } = useToast();

  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<DayRange>(30);
  const [search, setSearch] = useState('');
  const [hoveredCell, setHoveredCell] = useState<{ monitorId: string; dateIdx: number } | null>(null);
  const [groupByFolder, setGroupByFolder] = useState(false);

  const user = typeof window !== 'undefined' ? (() => { try { return JSON.parse(localStorage.getItem('pulsedock_user') ?? 'null'); } catch { return null; } })() : null;

  useEffect(() => {
    const u = getUser();
    if (!u) { router.push('/login'); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  async function load() {
    setLoading(true);
    try {
      const d = await api<HeatmapData>(`/v1/monitors/heatmap?days=${days}`, user?.id);
      setData(d);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to load heatmap');
    } finally {
      setLoading(false);
    }
  }

  const filtered = data?.monitors.filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) || (m.folder ?? '').toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  // Determine which column dates to show labels for (every ~7 days)
  const dateLabels = data?.dates ?? [];
  const labelInterval = days <= 14 ? 1 : days <= 30 ? 3 : days <= 60 ? 7 : 10;

  // Group by folder if enabled
  const grouped: { folder: string | null; monitors: HeatmapMonitor[] }[] = [];
  if (groupByFolder) {
    const folderMap = new Map<string, HeatmapMonitor[]>();
    for (const m of filtered) {
      const key = m.folder ?? '__none__';
      if (!folderMap.has(key)) folderMap.set(key, []);
      folderMap.get(key)!.push(m);
    }
    // Sort: named folders first, then unfiled
    const keys = Array.from(folderMap.keys()).sort((a, b) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      return a.localeCompare(b);
    });
    for (const k of keys) {
      grouped.push({ folder: k === '__none__' ? null : k, monitors: folderMap.get(k)! });
    }
  } else {
    grouped.push({ folder: null, monitors: filtered });
  }

  // Summary stats
  const allWithUptime = filtered.map(m => overallUptime(m)).filter((v): v is number => v !== null);
  const avgUptime = allWithUptime.length > 0
    ? Math.round((allWithUptime.reduce((s, v) => s + v, 0) / allWithUptime.length) * 100) / 100
    : null;
  const worstMonitor = filtered.length > 0
    ? filtered.reduce((worst, m) => {
        const u = overallUptime(m);
        const wu = overallUptime(worst);
        if (u === null) return worst;
        if (wu === null) return m;
        return u < wu ? m : worst;
      }, filtered[0])
    : null;

  return (
    <AppFrame title="Uptime Heatmap" breadcrumbs={[{ label: 'Monitors', href: '/monitors' }, { label: 'Heatmap' }]}>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
              <Layers className="w-6 h-6 text-accent" />
              Uptime Heatmap
            </h1>
            <p className="text-sm text-muted mt-1">Per-monitor daily uptime over the last {days} days</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Day range selector */}
            {([7, 14, 30, 60, 90] as DayRange[]).map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${days === d ? 'bg-accent text-white' : 'bg-surface border border-border text-muted hover:text-primary hover:border-accent/40'}`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Summary cards */}
        {!loading && data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs text-muted uppercase tracking-wide">Monitors</p>
              <p className="text-2xl font-bold text-primary mt-1">{filtered.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs text-muted uppercase tracking-wide">Avg Uptime</p>
              <p className="text-2xl font-bold mt-1">
                <UptimePill pct={avgUptime} />
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs text-muted uppercase tracking-wide">Perfect Days</p>
              <p className="text-2xl font-bold text-green-400 mt-1">
                {data.dates.filter(date =>
                  filtered.every(m => {
                    const cell = m.days.find(d => d.date === date);
                    return !cell || cell.total === 0 || (cell.uptimePct !== null && cell.uptimePct >= 99.9);
                  })
                ).length}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs text-muted uppercase tracking-wide">Most Issues</p>
              {worstMonitor ? (
                <Link href={`/monitors/${worstMonitor.id}`} className="text-sm font-semibold text-primary hover:text-accent truncate block mt-1">
                  {worstMonitor.name}
                </Link>
              ) : (
                <p className="text-sm text-muted mt-1">—</p>
              )}
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search monitors or folders…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setGroupByFolder(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${groupByFolder ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-accent/40 hover:text-primary'}`}
          >
            <Layers className="w-4 h-4" />
            Group by folder
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted flex-wrap">
          <span className="font-medium text-secondary">Uptime:</span>
          {[
            { color: 'bg-green-500/90', label: '≥ 99.9%' },
            { color: 'bg-green-400/80', label: '99–99.9%' },
            { color: 'bg-yellow-400/80', label: '95–99%' },
            { color: 'bg-orange-400/80', label: '80–95%' },
            { color: 'bg-red-500/90', label: '< 80%' },
            { color: 'bg-border/40', label: 'No data' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm ${color}`} />
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* Heatmap Grid */}
        {loading ? (
          <div className="rounded-xl border border-border bg-surface p-8 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
          </div>
        ) : !data || filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-12 text-center">
            <Activity className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-secondary font-medium">{search ? 'No monitors match your search' : 'No uptime monitors found'}</p>
            {!search && (
              <Link href="/monitors" className="mt-2 inline-block text-sm text-accent hover:underline">
                Create your first monitor →
              </Link>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface overflow-x-auto">
            {/* Date header */}
            <div className="sticky top-0 z-10 bg-surface border-b border-border">
              <div className="flex" style={{ minWidth: `${200 + dateLabels.length * 18}px` }}>
                {/* Monitor name column */}
                <div className="w-48 shrink-0 px-4 py-2 text-xs text-muted font-medium">Monitor</div>
                {/* Uptime column */}
                <div className="w-16 shrink-0 px-2 py-2 text-xs text-muted font-medium text-right">Uptime</div>
                {/* Date columns */}
                <div className="flex-1 flex">
                  {dateLabels.map((date, i) => (
                    <div
                      key={date}
                      className="flex-none text-center"
                      style={{ width: '18px' }}
                    >
                      {i % labelInterval === 0 && (
                        <span className="text-[10px] text-muted rotate-0 block truncate" title={formatDate(date)}>
                          {formatShortDate(date).split(' ')[1]}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Monitor rows */}
            {grouped.map(({ folder, monitors: groupMonitors }, gi) => (
              <div key={gi}>
                {/* Folder header when grouping */}
                {groupByFolder && (
                  <div className="px-4 py-2 bg-bg/50 border-b border-border/50 flex items-center gap-2" style={{ minWidth: `${200 + dateLabels.length * 18}px` }}>
                    <Layers className="w-3.5 h-3.5 text-muted shrink-0" />
                    <span className="text-xs font-semibold text-secondary">{folder ?? 'Unfiled'}</span>
                    <span className="text-xs text-muted">({groupMonitors.length})</span>
                  </div>
                )}

                {groupMonitors.map(monitor => {
                  const uptimePct = overallUptime(monitor);
                  return (
                    <div
                      key={monitor.id}
                      className="flex items-center border-b border-border/30 hover:bg-surface-1/50 transition-colors"
                      style={{ minWidth: `${200 + dateLabels.length * 18}px` }}
                    >
                      {/* Monitor name */}
                      <div className="w-48 shrink-0 px-4 py-1.5">
                        <Link
                          href={`/monitors/${monitor.id}`}
                          className="text-sm text-secondary hover:text-accent truncate block font-medium"
                          title={monitor.name}
                        >
                          {monitor.name}
                        </Link>
                        {!groupByFolder && monitor.folder && (
                          <span className="text-[10px] text-muted block truncate">{monitor.folder}</span>
                        )}
                      </div>

                      {/* Overall uptime */}
                      <div className="w-16 shrink-0 px-2 py-1.5 text-right">
                        <UptimePill pct={uptimePct} />
                      </div>

                      {/* Day cells */}
                      <div className="flex-1 flex py-1">
                        {monitor.days.map((cell, di) => (
                          <div
                            key={cell.date}
                            className="relative flex-none"
                            style={{ width: '18px' }}
                            onMouseEnter={() => setHoveredCell({ monitorId: monitor.id, dateIdx: di })}
                            onMouseLeave={() => setHoveredCell(null)}
                          >
                            <div
                              className={`mx-px my-0.5 rounded-sm cursor-default transition-transform hover:scale-125 ${cellColor(cell)}`}
                              style={{ width: '14px', height: '14px' }}
                            />
                            {hoveredCell?.monitorId === monitor.id && hoveredCell?.dateIdx === di && (
                              <CellTooltip cell={cell} monitorName={monitor.name} />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Footer note */}
        {!loading && data && data.monitors.length > 0 && (
          <p className="text-xs text-muted text-center">
            Showing {days}-day window. Hover over any cell for details. Click a monitor name to view its detail page.
          </p>
        )}
      </div>
    </AppFrame>
  );
}
