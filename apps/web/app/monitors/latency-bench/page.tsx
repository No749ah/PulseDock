'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Gauge,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../../components/Table';
import { SortableHeader } from '../../components/SortableTable';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';
import { useTableSort } from '../../../lib/useTableSort';
import { formatMonitorType } from '../../components/timeUtils';

type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
type Trend = 'improving' | 'stable' | 'degrading' | 'new';

interface MonitorBenchmark {
  monitorId: string;
  monitorName: string;
  monitorType: string;
  target: string;
  current: {
    p50: number | null;
    p75: number | null;
    p95: number | null;
    p99: number | null;
    avg: number | null;
    min: number | null;
    max: number | null;
    samples: number;
  };
  previous: {
    p50: number | null;
    p95: number | null;
    avg: number | null;
    samples: number;
  };
  trend: Trend;
  trendPct: number | null;
  latencyAlertMs: number | null;
  budgetMs: number | null;
  p95ExceedsBudget: boolean;
  p95ExceedsAlert: boolean;
  grade: Grade | null;
}

interface BenchmarkData {
  monitors: MonitorBenchmark[];
  summary: {
    totalMonitors: number;
    monitorsWithData: number;
    fleetP50: number | null;
    fleetP95: number | null;
    gradeDistribution: { A: number; B: number; C: number; D: number; F: number };
    exceedingBudget: number;
    exceedingAlert: number;
    improvingCount: number;
    degradingCount: number;
  };
}

type SortableKey = 'monitorName' | 'p50' | 'p95' | 'p99' | 'trend' | 'grade';

const GRADE_COLORS: Record<Grade, string> = {
  A: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  B: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  C: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  D: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  F: 'text-red-400 bg-red-500/10 border-red-500/30',
};

const GRADE_BAR_COLORS: Record<Grade, string> = {
  A: 'bg-emerald-500',
  B: 'bg-blue-500',
  C: 'bg-yellow-500',
  D: 'bg-orange-500',
  F: 'bg-red-500',
};

const GRADE_LABELS: Record<Grade, string> = {
  A: '< 200ms',
  B: '200–500ms',
  C: '500–1000ms',
  D: '1–2s',
  F: '> 2s',
};

function fmtMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

function GradePill({ grade }: { grade: Grade | null }) {
  if (!grade) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-surface text-xs font-bold text-text-muted">
        —
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border text-sm font-bold ${GRADE_COLORS[grade]}`}>
      {grade}
    </span>
  );
}

function TrendBadge({ trend, trendPct }: { trend: Trend; trendPct: number | null }) {
  if (trend === 'new') {
    return <span className="text-xs text-text-muted">New</span>;
  }
  const icon =
    trend === 'improving' ? (
      <TrendingDown className="w-3 h-3 text-emerald-400" />
    ) : trend === 'degrading' ? (
      <TrendingUp className="w-3 h-3 text-red-400" />
    ) : (
      <Minus className="w-3 h-3 text-text-muted" />
    );

  const colorClass =
    trend === 'improving'
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      : trend === 'degrading'
      ? 'text-red-400 bg-red-500/10 border-red-500/20'
      : 'text-text-muted bg-surface border-border';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${colorClass}`}>
      {icon}
      {trendPct !== null ? `${trendPct > 0 ? '+' : ''}${trendPct}%` : trend}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-border bg-surface text-xs font-medium text-text-secondary">
      {formatMonitorType(type)}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'green' | 'red' | 'blue' | 'default';
}) {
  const valueColor =
    accent === 'green'
      ? 'text-emerald-400'
      : accent === 'red'
      ? 'text-red-400'
      : accent === 'blue'
      ? 'text-blue-400'
      : 'text-text-primary';

  return (
    <Card className="p-4">
      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-2xl font-bold font-mono ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-text-muted mt-1">{sub}</div>}
    </Card>
  );
}

export default function LatencyBenchPage() {
  const router = useRouter();
  const { error: toastError } = useToast();
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const { sort, toggle: handleSort, sorted: sortFn } = useTableSort<SortableKey>('p95', 'desc');

  const getSortValue = (item: MonitorBenchmark): string | number | null => {
    switch (sort.key) {
      case 'monitorName': return item.monitorName;
      case 'p50': return item.current.p50;
      case 'p95': return item.current.p95;
      case 'p99': return item.current.p99;
      case 'grade': return item.grade ?? 'Z';
      case 'trend': return item.trend;
      default: return item.current.p95;
    }
  };

  const sorted = sortFn(data?.monitors ?? [], getSortValue);

  const load = () => {
    const user = getUser();
    if (!user) { router.push('/login'); return; }
    setLoading(true);
    api<BenchmarkData>('/v1/monitors/latency-bench', user.id)
      .then(setData)
      .catch(() => toastError('Failed to load latency benchmarks'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredMonitors = sorted.filter(
    (m) => !search || m.monitorName.toLowerCase().includes(search.toLowerCase()),
  );

  const summary = data?.summary;

  if (loading) {
    return (
      <AppFrame title="Latency Benchmarks">
        <div className="flex items-center justify-center py-20 text-text-muted text-sm">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading benchmarks…
        </div>
      </AppFrame>
    );
  }

  if (!data || data.monitors.length === 0) {
    return (
      <AppFrame title="Latency Benchmarks">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Gauge className="w-12 h-12 text-text-muted mb-4" />
          <h2 className="text-lg font-semibold text-text-primary mb-2">No HTTP monitors found</h2>
          <p className="text-sm text-text-muted mb-6">
            Add HTTP or Browser monitors to see latency benchmarks here.
          </p>
          <Link
            href="/monitors"
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 transition-colors"
          >
            Go to Monitors
          </Link>
        </div>
      </AppFrame>
    );
  }

  const totalWithGrade = summary
    ? Object.values(summary.gradeDistribution).reduce((a, b) => a + b, 0)
    : 0;

  const improvingRatio =
    summary && summary.monitorsWithData > 0
      ? `${summary.improvingCount}↑ / ${summary.degradingCount}↓`
      : '—';

  return (
    <AppFrame title="Latency Benchmarks">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Latency Benchmarks</h1>
            <p className="text-sm text-text-muted mt-1">
              P50 / P75 / P95 / P99 across all HTTP monitors · Last 7 days vs previous 7 days
            </p>
          </div>
          <button
            onClick={load}
            className="p-2 rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <SummaryCard
              label="Fleet P50"
              value={fmtMs(summary.fleetP50)}
              sub="Median latency"
              accent="blue"
            />
            <SummaryCard
              label="Fleet P95"
              value={fmtMs(summary.fleetP95)}
              sub="95th percentile"
              accent={
                summary.fleetP95 === null
                  ? 'default'
                  : summary.fleetP95 < 200
                  ? 'green'
                  : summary.fleetP95 < 1000
                  ? 'default'
                  : 'red'
              }
            />
            <SummaryCard
              label="Grade A"
              value={summary.gradeDistribution.A}
              sub={`of ${summary.totalMonitors} monitors`}
              accent="green"
            />
            <SummaryCard
              label="Over Budget"
              value={summary.exceedingBudget}
              sub="P95 exceeds latency budget"
              accent={summary.exceedingBudget > 0 ? 'red' : 'default'}
            />
            <SummaryCard
              label="Trend"
              value={improvingRatio}
              sub="improving vs degrading"
            />
          </div>
        )}

        {/* Grade Distribution Bar */}
        {summary && totalWithGrade > 0 && (
          <Card className="p-4">
            <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              Grade Distribution
            </div>
            <div className="flex rounded-lg overflow-hidden h-4">
              {(['A', 'B', 'C', 'D', 'F'] as Grade[]).map((g) => {
                const pct = totalWithGrade > 0
                  ? (summary.gradeDistribution[g] / totalWithGrade) * 100
                  : 0;
                if (pct === 0) return null;
                return (
                  <div
                    key={g}
                    className={`${GRADE_BAR_COLORS[g]} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`Grade ${g}: ${summary.gradeDistribution[g]} monitors (${pct.toFixed(1)}%)`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-4 mt-3">
              {(['A', 'B', 'C', 'D', 'F'] as Grade[]).map((g) => (
                <div key={g} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-sm ${GRADE_BAR_COLORS[g]}`} />
                  <span className="text-xs text-text-muted">
                    <span className="font-semibold text-text-secondary">Grade {g}</span> {GRADE_LABELS[g]}{' '}
                    <span className="font-bold">{summary.gradeDistribution[g]}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Search */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search monitors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60 w-64"
          />
          <span className="text-xs text-text-muted ml-auto">
            {filteredMonitors.length} monitor{filteredMonitors.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Main Table */}
        <Card className="overflow-hidden">
          <Table>
            <TableHead>
              <TableRow>
                <SortableHeader sortKey="monitorName" sort={sort} onSort={handleSort} className="w-52">
                  Monitor
                </SortableHeader>
                <th className="px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider w-24">
                  Type
                </th>
                <SortableHeader sortKey="grade" sort={sort} onSort={handleSort} className="w-16 text-center">
                  Grade
                </SortableHeader>
                <SortableHeader sortKey="p50" sort={sort} onSort={handleSort} className="w-20">
                  P50
                </SortableHeader>
                <SortableHeader sortKey="p95" sort={sort} onSort={handleSort} className="w-20">
                  P95
                </SortableHeader>
                <SortableHeader sortKey="p99" sort={sort} onSort={handleSort} className="w-20">
                  P99
                </SortableHeader>
                <SortableHeader sortKey="trend" sort={sort} onSort={handleSort} className="w-32">
                  Trend
                </SortableHeader>
                <th className="px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider w-28">
                  Budget / Alert
                </th>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredMonitors.map((item) => (
                <TableRow key={item.monitorId} className="hover:bg-surface/50 transition-colors">
                  <TableCell>
                    <div>
                      <Link
                        href={`/monitors/${item.monitorId}`}
                        className="text-sm font-medium text-text-primary hover:text-accent transition-colors"
                      >
                        {item.monitorName}
                      </Link>
                      <div className="text-xs text-text-muted truncate max-w-[180px]">{item.target}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={item.monitorType} />
                  </TableCell>
                  <TableCell className="text-center">
                    <GradePill grade={item.grade} />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono text-text-secondary">{fmtMs(item.current.p50)}</span>
                  </TableCell>
                  <TableCell>
                    <span className={`text-sm font-mono font-semibold ${
                      item.current.p95 === null
                        ? 'text-text-muted'
                        : item.current.p95 < 200
                        ? 'text-emerald-400'
                        : item.current.p95 < 500
                        ? 'text-blue-400'
                        : item.current.p95 < 1000
                        ? 'text-yellow-400'
                        : item.current.p95 < 2000
                        ? 'text-orange-400'
                        : 'text-red-400'
                    }`}>
                      {fmtMs(item.current.p95)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono text-text-secondary">{fmtMs(item.current.p99)}</span>
                  </TableCell>
                  <TableCell>
                    <TrendBadge trend={item.trend} trendPct={item.trendPct} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      {item.budgetMs !== null && (
                        <div className="flex items-center gap-1">
                          {item.p95ExceedsBudget ? (
                            <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                          )}
                          <span className={`text-xs ${item.p95ExceedsBudget ? 'text-red-400' : 'text-text-muted'}`}>
                            Budget {fmtMs(item.budgetMs)}
                          </span>
                        </div>
                      )}
                      {item.latencyAlertMs !== null && (
                        <div className="flex items-center gap-1">
                          {item.p95ExceedsAlert ? (
                            <AlertTriangle className="w-3 h-3 text-orange-400 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                          )}
                          <span className={`text-xs ${item.p95ExceedsAlert ? 'text-orange-400' : 'text-text-muted'}`}>
                            Alert {fmtMs(item.latencyAlertMs)}
                          </span>
                        </div>
                      )}
                      {item.budgetMs === null && item.latencyAlertMs === null && (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Methodology Card */}
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-text-primary mb-2">Grading Methodology</div>
              <div className="text-xs text-text-muted space-y-1">
                <p>
                  Grades are based on the <span className="text-text-secondary font-medium">P95 latency</span> of
                  successful (ok=true) check runs over the last 7 days.
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2">
                  {(['A', 'B', 'C', 'D', 'F'] as Grade[]).map((g) => (
                    <span key={g} className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold border ${GRADE_COLORS[g]}`}>
                        {g}
                      </span>
                      <span>{GRADE_LABELS[g]}</span>
                    </span>
                  ))}
                </div>
                <p className="mt-2">
                  Trend is computed by comparing current P95 to the previous 7-day period.
                  <span className="text-emerald-400 font-medium"> Improving</span> = ≥5% faster,
                  <span className="text-red-400 font-medium"> Degrading</span> = ≥5% slower,
                  <span className="text-text-secondary"> Stable</span> = within ±5%.
                  Monitors with no prior period data are marked as <span className="font-medium">New</span>.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </AppFrame>
  );
}
