'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingDown,
  TrendingUp,
  BarChart2,
  RefreshCw,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { AppFrame } from '../../components/app-frame';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { getUser } from '../../components/auth';
import { api } from '../../lib/api';
import { FadeIn } from '../components/FadeIn';
import { useToast } from '../../components/ui/toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = '7d' | '30d' | '90d' | '365d';

interface ByMonitorEntry {
  monitorId: string;
  monitorName: string;
  mttrMinutes: number | null;
  incidentCount: number;
  resolvedCount: number;
  avgDurationMinutes: number | null;
}

interface TrendEntry {
  week: string;
  mttrMinutes: number | null;
  incidentCount: number;
}

interface MttrReport {
  overall: {
    mttrMinutes: number | null;
    mttfMinutes: number | null;
    totalIncidents: number;
    resolvedIncidents: number;
    avgDurationMinutes: number | null;
    longestIncidentMinutes: number | null;
    shortestIncidentMinutes: number | null;
  };
  byMonitor: ByMonitorEntry[];
  trend: TrendEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMinutes(min: number | null): string {
  if (min === null || min < 0) return 'N/A';
  if (min < 1) return '< 1 min';
  if (min < 60) return `${Math.round(min)} min`;
  const hours = Math.floor(min / 60);
  const mins = Math.round(min % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function mttrColor(min: number | null): string {
  if (min === null) return 'text-text-secondary';
  if (min < 15) return 'text-green-400';
  if (min < 60) return 'text-yellow-400';
  if (min < 240) return 'text-orange-400';
  return 'text-red-400';
}

function mttrBarColor(min: number | null): string {
  if (min === null) return '#6b7280';
  if (min < 15) return '#4ade80';
  if (min < 60) return '#facc15';
  if (min < 240) return '#fb923c';
  return '#f87171';
}

function mttrBadgeVariant(min: number | null): 'success' | 'warning' | 'danger' | 'default' {
  if (min === null) return 'default';
  if (min < 15) return 'success';
  if (min < 60) return 'warning';
  return 'danger';
}

function formatWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: TrendEntry }>;
}

function MttrTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0];
  return (
    <div className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-text-secondary mb-1">{formatWeek(d.payload.week)}</p>
      <p className={`font-semibold ${mttrColor(d.value)}`}>{formatMinutes(d.value)} MTTR</p>
      <p className="text-text-secondary mt-0.5">{d.payload.incidentCount} incident{d.payload.incidentCount !== 1 ? 's' : ''}</p>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  colorClass,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  colorClass?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1/60 backdrop-blur-sm p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-text-secondary" />}
        <p className="text-xs text-text-secondary uppercase tracking-wider font-medium">{label}</p>
      </div>
      <p className={`text-3xl font-bold tabular-nums ${colorClass ?? 'text-text-primary'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-text-secondary">{sub}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MttrPage() {
  const router = useRouter();
  const { error: showToast } = useToast();

  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData] = useState<MttrReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const periodDays: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
  const periodLabels: Record<Period, string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '365d': 'Last 365 days' };

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<MttrReport>(
        `/v1/incidents/mttr-report?periodDays=${periodDays[period]}`,
      );
      setData(result);
    } catch {
      showToast('Failed to load MTTR report');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace('/login'); return; }
    fetchReport();
  }, [fetchReport, router]);

  // Sort byMonitor table
  const sortedByMonitor = data
    ? [...data.byMonitor].sort((a, b) => {
        const aVal = a.mttrMinutes ?? (sortDir === 'desc' ? -1 : Infinity);
        const bVal = b.mttrMinutes ?? (sortDir === 'desc' ? -1 : Infinity);
        return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
      })
    : [];

  const overallResolutionRate =
    data && data.overall.totalIncidents > 0
      ? Math.round((data.overall.resolvedIncidents / data.overall.totalIncidents) * 100)
      : null;

  const hasTrendData = data && data.trend.length >= 2;

  return (
    <AppFrame
      title="Reliability Analytics"
      subtitle={periodLabels[period]}
      breadcrumbs={[{ label: 'Reliability Analytics' }]}
    >
      <FadeIn>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
          {/* ── Header ───────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Reliability Analytics</h1>
              <p className="text-sm text-text-secondary mt-1">
                MTTR & MTTF metrics across your monitors
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(['7d', '30d', '90d', '365d'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    period === p
                      ? 'bg-accent text-white shadow'
                      : 'bg-surface-1 text-text-secondary hover:text-text-primary hover:bg-surface-2 border border-border'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={fetchReport}
                className="p-1.5 rounded-lg bg-surface-1 border border-border text-text-secondary hover:text-text-primary transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* ── Stat Cards ────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="MTTR"
              value={loading ? '…' : formatMinutes(data?.overall.mttrMinutes ?? null)}
              sub="Mean Time to Recovery"
              colorClass={loading ? 'text-text-secondary' : mttrColor(data?.overall.mttrMinutes ?? null)}
              icon={Clock}
            />
            <StatCard
              label="MTTF"
              value={loading ? '…' : formatMinutes(data?.overall.mttfMinutes ?? null)}
              sub="Mean Time to Failure"
              colorClass={loading ? 'text-text-secondary' : mttrColor(data?.overall.mttfMinutes ?? null)}
              icon={TrendingDown}
            />
            <StatCard
              label="Total Incidents"
              value={loading ? '…' : String(data?.overall.totalIncidents ?? 0)}
              sub={`${data?.overall.resolvedIncidents ?? 0} resolved`}
              icon={AlertTriangle}
            />
            <StatCard
              label="Resolution Rate"
              value={loading ? '…' : overallResolutionRate !== null ? `${overallResolutionRate}%` : 'N/A'}
              sub={
                data
                  ? `${data.overall.resolvedIncidents} / ${data.overall.totalIncidents} incidents`
                  : undefined
              }
              colorClass={
                overallResolutionRate === null
                  ? 'text-text-secondary'
                  : overallResolutionRate >= 90
                  ? 'text-green-400'
                  : overallResolutionRate >= 70
                  ? 'text-yellow-400'
                  : 'text-red-400'
              }
              icon={CheckCircle2}
            />
          </div>

          {/* ── By Monitor Table ──────────────────────────────── */}
          <div className="rounded-xl border border-border bg-surface-1/60 backdrop-blur-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Activity className="w-4 h-4 text-text-secondary" />
              <h2 className="text-sm font-semibold text-text-primary">Per-Monitor Breakdown</h2>
            </div>

            {loading ? (
              <div className="px-5 py-8 text-center text-sm text-text-secondary">Loading…</div>
            ) : sortedByMonitor.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-text-secondary">
                No incident data for this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-text-secondary uppercase tracking-wider">
                      <th className="px-5 py-3 text-left font-medium">Monitor</th>
                      <th className="px-5 py-3 text-right font-medium">Incidents</th>
                      <th className="px-5 py-3 text-right font-medium">Resolved</th>
                      <th className="px-5 py-3 text-right font-medium">Avg Duration</th>
                      <th
                        className="px-5 py-3 text-right font-medium cursor-pointer select-none hover:text-text-primary flex items-center justify-end gap-1"
                        onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                      >
                        MTTR
                        {sortDir === 'desc' ? (
                          <ChevronDown className="w-3 h-3 inline" />
                        ) : (
                          <ChevronUp className="w-3 h-3 inline" />
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedByMonitor.map((m, i) => (
                      <tr
                        key={m.monitorId}
                        className={`border-b border-border/50 hover:bg-surface-2/40 transition-colors ${
                          i === sortedByMonitor.length - 1 ? 'border-b-0' : ''
                        }`}
                      >
                        <td className="px-5 py-3 font-medium text-text-primary">{m.monitorName}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{m.incidentCount}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{m.resolvedCount}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-text-secondary">
                          {formatMinutes(m.avgDurationMinutes)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span
                            className={`font-semibold tabular-nums ${mttrColor(m.mttrMinutes)}`}
                          >
                            {formatMinutes(m.mttrMinutes)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Weekly MTTR Trend ─────────────────────────────── */}
          <div className="rounded-xl border border-border bg-surface-1/60 backdrop-blur-sm">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-text-secondary" />
              <h2 className="text-sm font-semibold text-text-primary">Weekly MTTR Trend</h2>
            </div>

            <div className="p-5">
              {loading ? (
                <div className="h-48 flex items-center justify-center text-sm text-text-secondary">
                  Loading…
                </div>
              ) : !hasTrendData ? (
                <div className="h-48 flex flex-col items-center justify-center gap-2 text-sm text-text-secondary">
                  <TrendingUp className="w-8 h-8 opacity-30" />
                  <p>Not enough data for trend</p>
                  <p className="text-xs opacity-60">At least 2 weeks of data required</p>
                </div>
              ) : (
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data!.trend.map((t) => ({
                        ...t,
                        displayMttr: t.mttrMinutes ?? 0,
                      }))}
                      margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                      barCategoryGap="25%"
                    >
                      <XAxis
                        dataKey="week"
                        tickFormatter={formatWeek}
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `${v}m`}
                        width={40}
                      />
                      <Tooltip content={<MttrTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                      <Bar dataKey="displayMttr" radius={[4, 4, 0, 0]} isAnimationActive={false} minPointSize={4}>
                        {data!.trend.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={mttrBarColor(entry.mttrMinutes)}
                            opacity={0.85}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* ── Legend ───────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
            <span className="font-medium text-text-primary">MTTR legend:</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" />
              &lt; 15 min
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />
              15–60 min
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block" />
              1–4 h
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
              &gt; 4 h
            </span>
          </div>
        </div>
      </FadeIn>
    </AppFrame>
  );
}
