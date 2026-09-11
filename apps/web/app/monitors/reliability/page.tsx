'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, Minus, Sparkles, Search, RefreshCw, Star } from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

type WeekData = {
  weekStart: string;
  uptimePct: number | null;
  avgLatencyMs: number | null;
  checksTotal: number;
  checksFailed: number;
  incidents: number;
  score: number | null;
};

type MonitorTrend = {
  id: string;
  name: string;
  type: string;
  folder: string | null;
  currentScore: number | null;
  trend: 'improving' | 'degrading' | 'stable' | 'new';
  deltaPct: number | null;
  weeks: WeekData[];
};

type ReliabilityData = {
  monitors: MonitorTrend[];
  weekStarts: string[];
  summary: {
    improving: number;
    degrading: number;
    stable: number;
    avgCurrentScore: number | null;
  };
};

function scoreColor(score: number | null): string {
  if (score === null) return 'bg-zinc-700';
  if (score >= 95) return 'bg-emerald-500';
  if (score >= 80) return 'bg-green-400';
  if (score >= 60) return 'bg-yellow-400';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-red-600';
}

function scoreTextColor(score: number | null): string {
  if (score === null) return 'text-zinc-500';
  if (score >= 95) return 'text-emerald-400';
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function formatWeek(ws: string): string {
  const d = new Date(ws + 'T00:00:00Z');
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
}

function MiniTrendChart({ weeks, height = 32 }: { weeks: WeekData[]; height?: number }) {
  const scores = weeks.map(w => w.score);
  const valid = scores.filter((s): s is number => s !== null);
  if (valid.length < 2) {
    return <div className="flex items-center justify-center text-zinc-600 text-xs" style={{ height }}>—</div>;
  }
  const min = Math.max(0, Math.min(...valid) - 5);
  const max = Math.min(100, Math.max(...valid) + 5);
  const range = max - min || 1;
  const w = 4;
  const gap = 2;
  const totalW = scores.length * (w + gap) - gap;

  return (
    <svg width={totalW} height={height} style={{ display: 'block' }}>
      {scores.map((s, i) => {
        const barH = s === null ? 4 : Math.max(4, Math.round(((s - min) / range) * (height - 4)));
        const x = i * (w + gap);
        const y = height - barH;
        const color = s === null ? '#3f3f46' : s >= 95 ? '#10b981' : s >= 80 ? '#4ade80' : s >= 60 ? '#facc15' : s >= 40 ? '#f97316' : '#dc2626';
        return <rect key={i} x={x} y={y} width={w} height={barH} rx={1} fill={color} opacity={s === null ? 0.4 : 1} />;
      })}
    </svg>
  );
}

export default function ReliabilityPage() {
  const router = useRouter();
  const { error: showError } = useToast();
  const [data, setData] = useState<ReliabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState(12);
  const [search, setSearch] = useState('');
  const [trendFilter, setTrendFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'score' | 'trend'>('score');
  const [tooltip, setTooltip] = useState<{ m: MonitorTrend; w: WeekData; x: number; y: number } | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace('/login'); return; }
    setLoading(true);
    api<ReliabilityData>(`/v1/monitors/reliability?weeks=${weeks}`, user.id)
      .then(setData)
      .catch(() => showError('Failed to load reliability data'))
      .finally(() => setLoading(false));
  }, [weeks]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.monitors;
    if (search) list = list.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
    if (trendFilter !== 'all') list = list.filter(m => m.trend === trendFilter);
    if (sortBy === 'score') list = [...list].sort((a, b) => (b.currentScore ?? -1) - (a.currentScore ?? -1));
    else if (sortBy === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'trend') {
      const order = { degrading: 0, stable: 1, new: 2, improving: 3 };
      list = [...list].sort((a, b) => order[a.trend] - order[b.trend]);
    }
    return list;
  }, [data, search, trendFilter, sortBy]);

  const weekStarts = data?.weekStarts ?? [];
  const labelInterval = weekStarts.length > 16 ? 4 : weekStarts.length > 8 ? 2 : 1;

  return (
    <AppFrame title="Reliability Trends">
      <div className="p-6 max-w-full mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Reliability Trends</h1>
              <p className="text-sm text-zinc-400">Weekly health score history — is each monitor getting better or worse?</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[4, 8, 12, 26].map(w => (
              <Button key={w} variant={weeks === w ? 'primary' : 'ghost'} size="sm" onClick={() => setWeeks(w)}>
                {w}w
              </Button>
            ))}
          </div>
        </div>

        {/* Summary Cards */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-xs text-zinc-400 uppercase tracking-wide">Avg Fleet Score</p>
              <p className={`text-2xl font-bold mt-1 ${scoreTextColor(data.summary.avgCurrentScore)}`}>
                {data.summary.avgCurrentScore !== null ? `${data.summary.avgCurrentScore}` : '—'}
              </p>
            </Card>
            <div
              className="cursor-pointer hover:ring-1 hover:ring-emerald-500/30 transition-all rounded-2xl"
              onClick={() => setTrendFilter(trendFilter === 'improving' ? 'all' : 'improving')}
            >
              <Card className="p-4">
                <div className="flex items-center gap-1 text-xs text-zinc-400 uppercase tracking-wide">
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                  Improving
                </div>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{data.summary.improving}</p>
              </Card>
            </div>
            <div
              className="cursor-pointer hover:ring-1 hover:ring-red-500/30 transition-all rounded-2xl"
              onClick={() => setTrendFilter(trendFilter === 'degrading' ? 'all' : 'degrading')}
            >
              <Card className="p-4">
                <div className="flex items-center gap-1 text-xs text-zinc-400 uppercase tracking-wide">
                  <TrendingDown className="w-3 h-3 text-red-400" />
                  Degrading
                </div>
                <p className="text-2xl font-bold text-red-400 mt-1">{data.summary.degrading}</p>
              </Card>
            </div>
            <div
              className="cursor-pointer hover:ring-1 hover:ring-zinc-500/30 transition-all rounded-2xl"
              onClick={() => setTrendFilter(trendFilter === 'stable' ? 'all' : 'stable')}
            >
              <Card className="p-4">
                <div className="flex items-center gap-1 text-xs text-zinc-400 uppercase tracking-wide">
                  <Minus className="w-3 h-3 text-zinc-400" />
                  Stable
                </div>
                <p className="text-2xl font-bold text-zinc-400 mt-1">{data.summary.stable}</p>
              </Card>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              className="pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 w-64"
              placeholder="Filter monitors..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-500">Sort:</span>
            {(['score', 'name', 'trend'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-3 py-1 rounded-md capitalize transition-colors ${sortBy === s ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Main Table */}
        <Card className="p-4 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              Loading reliability data...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              <Star className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No monitors found.</p>
            </div>
          ) : (
            <div className="space-y-1 min-w-0">
              {/* Header row */}
              <div className="flex items-center gap-3 mb-3 ml-52">
                {weekStarts.map((ws, i) => (
                  <div
                    key={ws}
                    className="text-center shrink-0"
                    style={{ width: 24, fontSize: '9px', color: '#71717a', userSelect: 'none' }}
                  >
                    {i % labelInterval === 0 ? formatWeek(ws) : ''}
                  </div>
                ))}
                <div style={{ width: 60 }} />
              </div>

              {filtered.map(m => (
                <div key={m.id} className="flex items-center gap-3 group">
                  {/* Monitor name */}
                  <div
                    className="w-48 shrink-0 truncate text-sm text-zinc-300 group-hover:text-white cursor-pointer transition-colors"
                    title={m.name}
                    onClick={() => router.push(`/monitors/${m.id}`)}
                  >
                    {m.name}
                  </div>

                  {/* Week cells */}
                  <div className="flex gap-1">
                    {m.weeks.map(w => (
                      <div
                        key={w.weekStart}
                        className={`w-6 h-6 rounded cursor-pointer transition-opacity hover:opacity-75 ${scoreColor(w.score)}`}
                        style={{ opacity: w.score === null ? 0.25 : 1 }}
                        onMouseEnter={e => {
                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                          setTooltip({ m, w, x: rect.left + window.scrollX, y: rect.top + window.scrollY });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    ))}
                  </div>

                  {/* Trend + score */}
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <span className={`text-sm font-bold ${scoreTextColor(m.currentScore)}`}>
                      {m.currentScore !== null ? m.currentScore : '—'}
                    </span>
                    {m.trend === 'improving' && <TrendingUp className="w-4 h-4 text-emerald-400" />}
                    {m.trend === 'degrading' && <TrendingDown className="w-4 h-4 text-red-400" />}
                    {m.trend === 'stable' && <Minus className="w-4 h-4 text-zinc-400" />}
                    {m.deltaPct !== null && (
                      <span className={`text-xs ${m.deltaPct > 0 ? 'text-emerald-400' : m.deltaPct < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                        {m.deltaPct > 0 ? '+' : ''}{m.deltaPct}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Sparkline detail panel */}
        {data && filtered.length > 0 && !loading && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-zinc-300 mb-4">Weekly Score Sparklines</h3>
            <div className="space-y-2">
              {filtered.slice(0, 20).map(m => (
                <div key={m.id} className="flex items-center gap-3">
                  <div
                    className="w-44 shrink-0 truncate text-xs text-zinc-400 cursor-pointer hover:text-white transition-colors"
                    onClick={() => router.push(`/monitors/${m.id}`)}
                    title={m.name}
                  >
                    {m.name}
                  </div>
                  <MiniTrendChart weeks={m.weeks} height={28} />
                  <span className={`text-xs font-medium ml-2 ${scoreTextColor(m.currentScore)}`}>
                    {m.currentScore !== null ? `${m.currentScore}/100` : 'No data'}
                  </span>
                </div>
              ))}
              {filtered.length > 20 && (
                <p className="text-xs text-zinc-500 mt-2">Showing 20 of {filtered.length} monitors</p>
              )}
            </div>
          </Card>
        )}

        {/* Tooltip */}
        {tooltip && (
          <div
            className="fixed z-50 pointer-events-none bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl text-xs"
            style={{ left: tooltip.x + 20, top: tooltip.y - 10 }}
          >
            <p className="font-semibold text-white mb-1">{tooltip.m.name}</p>
            <p className="text-zinc-400 mb-1">Week of {tooltip.w.weekStart}</p>
            {tooltip.w.score !== null ? (
              <>
                <p><span className="text-zinc-400">Score: </span><span className={`font-bold ${scoreTextColor(tooltip.w.score)}`}>{tooltip.w.score}/100</span></p>
                <p><span className="text-zinc-400">Uptime: </span><span className="text-white">{tooltip.w.uptimePct}%</span></p>
                {tooltip.w.avgLatencyMs !== null && (
                  <p><span className="text-zinc-400">Avg latency: </span><span className="text-white">{tooltip.w.avgLatencyMs}ms</span></p>
                )}
                <p><span className="text-zinc-400">Checks: </span><span className="text-white">{tooltip.w.checksTotal} ({tooltip.w.checksFailed} failed)</span></p>
                {tooltip.w.incidents > 0 && (
                  <p><span className="text-zinc-400">Incidents: </span><span className="text-red-400">{tooltip.w.incidents}</span></p>
                )}
              </>
            ) : (
              <p className="text-zinc-500">No data this week</p>
            )}
          </div>
        )}
      </div>
    </AppFrame>
  );
}
