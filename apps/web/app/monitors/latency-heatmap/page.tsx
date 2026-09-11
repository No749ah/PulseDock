'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, Search, RefreshCw, TrendingDown, TrendingUp, Calendar } from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

type GradeCell = {
  date: string;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  samples: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
};

type MonitorRow = {
  id: string;
  name: string;
  type: string;
  folder: string | null;
  days: GradeCell[];
};

type HeatmapData = {
  monitors: MonitorRow[];
  dates: string[];
  summary: {
    avgFleetLatency: number | null;
    bestDay: string | null;
    worstDay: string | null;
  };
};

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-emerald-500',
  B: 'bg-green-400',
  C: 'bg-yellow-400',
  D: 'bg-orange-500',
  F: 'bg-red-600',
};

const GRADE_TEXT_COLORS: Record<string, string> = {
  A: 'text-emerald-400',
  B: 'text-green-400',
  C: 'text-yellow-400',
  D: 'text-orange-400',
  F: 'text-red-400',
};

function formatDate(d: string) {
  const parts = d.split('-');
  return `${parts[1]}/${parts[2]}`;
}

function formatMs(ms: number | null) {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function LatencyHeatmapPage() {
  const router = useRouter();
  const { error: showError } = useToast();
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);
  const [search, setSearch] = useState('');
  const [tooltip, setTooltip] = useState<{ cell: GradeCell; name: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace('/login'); return; }
    setLoading(true);
    api<HeatmapData>(`/v1/monitors/latency-heatmap?days=${period}`, user.id)
      .then(setData)
      .catch(() => showError('Failed to load latency heatmap'))
      .finally(() => setLoading(false));
  }, [period]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return q ? data.monitors.filter(m => m.name.toLowerCase().includes(q)) : data.monitors;
  }, [data, search]);

  const dates = data?.dates ?? [];

  // Show every Nth date label to avoid crowding
  const labelInterval = dates.length > 60 ? 7 : dates.length > 30 ? 3 : dates.length > 14 ? 2 : 1;

  return (
    <AppFrame title="Latency Heatmap">
      <div className="p-6 max-w-full mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Latency Heatmap</h1>
              <p className="text-sm text-zinc-400">Per-monitor average latency by day — HTTP & Browser monitors</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[7, 14, 30, 60, 90].map(d => (
              <Button
                key={d}
                variant={period === d ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setPeriod(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
        </div>

        {/* Summary Cards */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-xs text-zinc-400 uppercase tracking-wide">Fleet Avg Latency</p>
              <p className="text-2xl font-bold text-white mt-1">{formatMs(data.summary.avgFleetLatency)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-zinc-400 uppercase tracking-wide">Monitors Tracked</p>
              <p className="text-2xl font-bold text-white mt-1">{data.monitors.length}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-1 text-xs text-zinc-400 uppercase tracking-wide">
                <TrendingDown className="w-3 h-3 text-emerald-400" />
                Best Day
              </div>
              <p className="text-lg font-bold text-emerald-400 mt-1">
                {data.summary.bestDay ? formatDate(data.summary.bestDay) : '—'}
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-1 text-xs text-zinc-400 uppercase tracking-wide">
                <TrendingUp className="w-3 h-3 text-red-400" />
                Worst Day
              </div>
              <p className="text-lg font-bold text-red-400 mt-1">
                {data.summary.worstDay ? formatDate(data.summary.worstDay) : '—'}
              </p>
            </Card>
          </div>
        )}

        {/* Grade Legend */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-zinc-400 font-medium">Grade:</span>
          {(['A', 'B', 'C', 'D', 'F'] as const).map(g => (
            <div key={g} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm ${GRADE_COLORS[g]}`} />
              <span className={`${GRADE_TEXT_COLORS[g]} font-medium`}>{g}</span>
              <span className="text-zinc-500 text-xs">
                {g === 'A' ? '<200ms' : g === 'B' ? '200-500ms' : g === 'C' ? '500-1000ms' : g === 'D' ? '1-2s' : '≥2s'}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-zinc-700" />
            <span className="text-zinc-500 text-xs">No data</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            placeholder="Filter monitors..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Heatmap Grid */}
        <Card className="p-4 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              Loading heatmap...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No HTTP or Browser monitors found.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Date header */}
              <div className="flex gap-0.5 mb-1 ml-48">
                {dates.map((d, i) => (
                  <div
                    key={d}
                    className="w-4 text-center"
                    style={{ fontSize: '9px', color: '#71717a', userSelect: 'none' }}
                  >
                    {i % labelInterval === 0 ? formatDate(d).slice(0, 5) : ''}
                  </div>
                ))}
              </div>

              {/* Monitor rows */}
              <div className="space-y-0.5">
                {filtered.map(monitor => (
                  <div key={monitor.id} className="flex items-center gap-2">
                    {/* Monitor name */}
                    <div
                      className="w-48 shrink-0 truncate text-sm text-zinc-300 hover:text-white cursor-pointer"
                      title={monitor.name}
                      onClick={() => router.push(`/monitors/${monitor.id}`)}
                    >
                      {monitor.name}
                    </div>
                    {/* Cells */}
                    <div className="flex gap-0.5">
                      {monitor.days.map(cell => (
                        <div
                          key={cell.date}
                          className={`w-4 h-4 rounded-sm cursor-pointer transition-opacity hover:opacity-75 ${
                            cell.grade ? GRADE_COLORS[cell.grade] : 'bg-zinc-800'
                          }`}
                          onMouseEnter={e => {
                            const rect = (e.target as HTMLElement).getBoundingClientRect();
                            setTooltip({ cell, name: monitor.name, x: rect.left + window.scrollX, y: rect.top + window.scrollY });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Tooltip */}
              {tooltip && (
                <div
                  className="fixed z-50 pointer-events-none bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl text-xs"
                  style={{ left: tooltip.x + 20, top: tooltip.y - 10 }}
                >
                  <p className="font-semibold text-white mb-1">{tooltip.name}</p>
                  <p className="text-zinc-400">{tooltip.cell.date}</p>
                  {tooltip.cell.grade ? (
                    <>
                      <p className="mt-1">
                        <span className="text-zinc-400">Avg: </span>
                        <span className={`font-medium ${GRADE_TEXT_COLORS[tooltip.cell.grade]}`}>
                          {formatMs(tooltip.cell.avgLatencyMs)}
                        </span>
                        <span className={`ml-1 font-bold ${GRADE_TEXT_COLORS[tooltip.cell.grade]}`}>
                          ({tooltip.cell.grade})
                        </span>
                      </p>
                      <p>
                        <span className="text-zinc-400">P95: </span>
                        <span className="text-white">{formatMs(tooltip.cell.p95LatencyMs)}</span>
                      </p>
                      <p>
                        <span className="text-zinc-400">Samples: </span>
                        <span className="text-white">{tooltip.cell.samples}</span>
                      </p>
                    </>
                  ) : (
                    <p className="text-zinc-500 mt-1">No data</p>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </AppFrame>
  );
}
