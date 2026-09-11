'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart2, Clock, AlertOctagon, RefreshCw, TrendingUp, Trophy } from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

type SeverityItem = { severity: string; count: number; pct: number };
type HeatCell = { hour: number; dow: number; count: number };
type TopMonitor = { monitorId: string; monitorName: string; count: number; resolvedCount: number; avgMinutes: number | null };
type WeekBucket = { weekStart: string; total: number; critical: number; high: number; medium: number; low: number; avgResolutionMin: number | null };

type InsightsData = {
  period: { days: number; since: string };
  totals: {
    total: number;
    open: number;
    resolved: number;
    avgResolutionMinutes: number | null;
    longestIncidentMinutes: number | null;
  };
  severityBreakdown: SeverityItem[];
  hourHeatmap: HeatCell[];
  topMonitors: TopMonitor[];
  weeklyTrend: WeekBucket[];
};

const SEV_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-orange-500 text-white',
  MEDIUM: 'bg-yellow-500 text-black',
  LOW: 'bg-blue-500 text-white',
};

const SEV_BAR_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-600',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-yellow-400',
  LOW: 'bg-blue-500',
};

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatMinutes(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatWeek(ws: string): string {
  const d = new Date(ws + 'T00:00:00Z');
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
}

function HeatmapCell({ count, maxCount }: { count: number; maxCount: number }) {
  if (count === 0) return <div className="w-5 h-5 rounded-sm bg-zinc-800" />;
  const intensity = count / maxCount;
  const opacity = 0.2 + intensity * 0.8;
  return (
    <div
      className="w-5 h-5 rounded-sm bg-red-500"
      style={{ opacity }}
      title={`${count} incident${count !== 1 ? 's' : ''}`}
    />
  );
}

export default function IncidentInsightsPage() {
  const router = useRouter();
  const { error: showError } = useToast();
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(90);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace('/login'); return; }
    setLoading(true);
    api<InsightsData>(`/v1/incidents/insights?days=${period}`, user.id)
      .then(setData)
      .catch(() => showError('Failed to load incident insights'))
      .finally(() => setLoading(false));
  }, [period]);

  // Build 7×24 grid for heatmap
  const heatGrid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  data?.hourHeatmap.forEach(c => { heatGrid[c.dow][c.hour] = c.count; });
  const maxHeat = Math.max(1, ...data?.hourHeatmap.map(c => c.count) ?? [0]);

  // Weekly bar chart max
  const maxWeekly = Math.max(1, ...(data?.weeklyTrend.map(w => w.total) ?? [0]));

  return (
    <AppFrame title="Incident Insights">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10 text-red-400">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Incident Insights</h1>
              <p className="text-sm text-zinc-400">Frequency patterns, severity trends, and MTTR analytics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[30, 90, 180, 365].map(d => (
              <Button key={d} variant={period === d ? 'primary' : 'ghost'} size="sm" onClick={() => setPeriod(d)}>
                {d}d
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-500">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Loading incident insights...
          </div>
        ) : !data ? null : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide">Total</p>
                <p className="text-2xl font-bold text-white mt-1">{data.totals.total}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1">
                  <AlertOctagon className="w-3 h-3 text-red-400" /> Open
                </p>
                <p className="text-2xl font-bold text-red-400 mt-1">{data.totals.open}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide">Resolved</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{data.totals.resolved}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Avg MTTR
                </p>
                <p className="text-2xl font-bold text-white mt-1">{formatMinutes(data.totals.avgResolutionMinutes)}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide">Longest</p>
                <p className="text-2xl font-bold text-orange-400 mt-1">{formatMinutes(data.totals.longestIncidentMinutes)}</p>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Severity Breakdown */}
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-orange-400" />
                  Severity Distribution
                </h3>
                {data.severityBreakdown.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No incidents in this period.</p>
                ) : (
                  <div className="space-y-3">
                    {data.severityBreakdown.map(s => (
                      <div key={s.severity}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${SEV_COLORS[s.severity] ?? 'bg-zinc-700 text-zinc-300'}`}>
                            {s.severity}
                          </span>
                          <span className="text-sm text-zinc-300">{s.count} <span className="text-zinc-500">({s.pct}%)</span></span>
                        </div>
                        <div className="w-full bg-zinc-800 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${SEV_BAR_COLORS[s.severity] ?? 'bg-zinc-500'}`}
                            style={{ width: `${s.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Top Affected Monitors */}
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  Most Affected Monitors
                </h3>
                {data.topMonitors.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No monitor-linked incidents.</p>
                ) : (
                  <div className="space-y-2">
                    {data.topMonitors.map((m, i) => (
                      <div
                        key={m.monitorId}
                        className="flex items-center gap-3 cursor-pointer hover:bg-zinc-800/50 p-1.5 rounded transition-colors"
                        onClick={() => router.push(`/monitors/${m.monitorId}`)}
                      >
                        <span className="text-xs text-zinc-500 w-4 text-right">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-200 truncate">{m.monitorName}</p>
                          <p className="text-xs text-zinc-500">
                            {m.resolvedCount}/{m.count} resolved
                            {m.avgMinutes !== null && ` · avg ${formatMinutes(m.avgMinutes)}`}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-red-400">{m.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Weekly Trend */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                Weekly Incident Trend
              </h3>
              {data.weeklyTrend.every(w => w.total === 0) ? (
                <p className="text-zinc-500 text-sm">No incidents in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="flex items-end gap-1 h-32 min-w-0">
                    {data.weeklyTrend.map(w => {
                      const barH = w.total === 0 ? 0 : Math.max(4, Math.round((w.total / maxWeekly) * 120));
                      return (
                        <div key={w.weekStart} className="flex flex-col items-center gap-1 group" style={{ minWidth: 20 }}>
                          <div className="flex flex-col-reverse gap-0.5" style={{ height: 120 }}>
                            {barH > 0 && (
                              <div className="w-4 rounded-sm bg-red-600/80 hover:bg-red-500 transition-colors" style={{ height: barH }} title={`${w.total} incidents`} />
                            )}
                          </div>
                          <span className="text-zinc-600" style={{ fontSize: '8px', transform: 'rotate(-45deg)', transformOrigin: 'center', display: 'block', width: 24, textAlign: 'center' }}>
                            {formatWeek(w.weekStart)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>

            {/* Frequency Heatmap */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-4">
                When Do Incidents Happen? (UTC hour × day of week)
              </h3>
              {data.totals.total === 0 ? (
                <p className="text-zinc-500 text-sm">No incidents to analyze.</p>
              ) : (
                <div className="overflow-x-auto">
                  {/* Hour labels */}
                  <div className="flex gap-1 ml-12 mb-1">
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="w-5 text-center" style={{ fontSize: '9px', color: '#71717a' }}>
                        {h % 4 === 0 ? h : ''}
                      </div>
                    ))}
                  </div>
                  {DOW_LABELS.map((label, dow) => (
                    <div key={dow} className="flex items-center gap-1 mb-1">
                      <div className="w-10 text-right text-xs text-zinc-500 shrink-0">{label}</div>
                      <div className="flex gap-1">
                        {Array.from({ length: 24 }, (_, hour) => (
                          <HeatmapCell key={hour} count={heatGrid[dow][hour]} maxCount={maxHeat} />
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 mt-3 text-xs text-zinc-500">
                    <div className="w-3 h-3 rounded-sm bg-zinc-800" />
                    <span>None</span>
                    <div className="w-3 h-3 rounded-sm bg-red-500 opacity-30" />
                    <span>Low</span>
                    <div className="w-3 h-3 rounded-sm bg-red-500" />
                    <span>High</span>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </AppFrame>
  );
}
