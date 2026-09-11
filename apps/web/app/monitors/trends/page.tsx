'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Activity,
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

type UptimeTrend = 'improving' | 'degrading' | 'stable' | 'new';
type LatencyTrend = 'improving' | 'degrading' | 'stable' | 'new';

type MonitorTrend = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  folder: string | null;
  currentUptimePct: number | null;
  previousUptimePct: number | null;
  uptimeDelta: number | null;
  uptimeTrend: UptimeTrend;
  currentAvgLatencyMs: number | null;
  previousAvgLatencyMs: number | null;
  latencyDeltaPct: number | null;
  latencyTrend: LatencyTrend;
  currentChecks: number;
  previousChecks: number;
};

type TrendsResponse = {
  monitors: MonitorTrend[];
  generatedAt: string;
};

function TrendBadge({ trend }: { trend: UptimeTrend | LatencyTrend }) {
  switch (trend) {
    case 'improving':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-400">
          <TrendingUp className="w-3.5 h-3.5" /> Improving
        </span>
      );
    case 'degrading':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400">
          <TrendingDown className="w-3.5 h-3.5" /> Degrading
        </span>
      );
    case 'new':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary">
          <Sparkles className="w-3.5 h-3.5" /> New
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
          <Minus className="w-3.5 h-3.5" /> Stable
        </span>
      );
  }
}

function DeltaCell({ value, unit = '', invertColors = false }: { value: number | null; unit?: string; invertColors?: boolean }) {
  if (value == null) return <span className="text-text-muted text-sm">—</span>;
  const positive = value > 0;
  const colorClass = positive
    ? (invertColors ? 'text-red-400' : 'text-green-400')
    : (invertColors ? 'text-green-400' : 'text-red-400');
  const Icon = positive ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-sm font-medium ${colorClass}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(value).toFixed(1)}{unit}
    </span>
  );
}

function UptimePct({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-text-muted text-sm">—</span>;
  const color = pct >= 99 ? 'text-green-400' : pct >= 95 ? 'text-yellow-400' : 'text-red-400';
  return <span className={`text-sm font-semibold ${color}`}>{pct.toFixed(1)}%</span>;
}

function LatencyMs({ ms }: { ms: number | null }) {
  if (ms == null) return <span className="text-text-muted text-sm">—</span>;
  const color = ms < 500 ? 'text-green-400' : ms < 1500 ? 'text-yellow-400' : 'text-red-400';
  return <span className={`text-sm font-medium ${color}`}>{ms}ms</span>;
}

export default function MonitorTrendsPage() {
  const router = useRouter();
  const { error: toastError } = useToast();
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const { sort, toggle } = useTableSort<'name' | 'uptimeTrend' | 'currentUptimePct' | 'uptimeDelta' | 'latencyTrend' | 'currentAvgLatencyMs' | 'latencyDeltaPct'>('uptimeTrend');

  useEffect(() => {
    const u = getUser();
    if (!u) router.push('/login');
  }, [router]);

  async function load() {
    setLoading(true);
    try {
      const result = await api<TrendsResponse>('/v1/monitors/trends');
      setData(result);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to load trends');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const sorted = (() => {
    if (!data) return [];
    const trendOrder: Record<string, number> = { degrading: 0, new: 1, stable: 2, improving: 3 };
    const rows = [...data.monitors];
    rows.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sort.key) {
        case 'name': av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case 'uptimeTrend': av = trendOrder[a.uptimeTrend] ?? 2; bv = trendOrder[b.uptimeTrend] ?? 2; break;
        case 'currentUptimePct': av = a.currentUptimePct ?? -1; bv = b.currentUptimePct ?? -1; break;
        case 'uptimeDelta': av = a.uptimeDelta ?? 0; bv = b.uptimeDelta ?? 0; break;
        case 'latencyTrend': av = trendOrder[a.latencyTrend] ?? 2; bv = trendOrder[b.latencyTrend] ?? 2; break;
        case 'currentAvgLatencyMs': av = a.currentAvgLatencyMs ?? 999999; bv = b.currentAvgLatencyMs ?? 999999; break;
        case 'latencyDeltaPct': av = a.latencyDeltaPct ?? 0; bv = b.latencyDeltaPct ?? 0; break;
      }
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  })();

  const degradingCount = data?.monitors.filter(m => m.uptimeTrend === 'degrading' || m.latencyTrend === 'degrading').length ?? 0;
  const improvingCount = data?.monitors.filter(m => m.uptimeTrend === 'improving' || m.latencyTrend === 'improving').length ?? 0;
  const newCount = data?.monitors.filter(m => m.uptimeTrend === 'new').length ?? 0;
  const totalCount = data?.monitors.length ?? 0;

  return (
    <AppFrame
      title="Monitor Trends"
      subtitle="Week-over-week uptime and latency trends — current 7 days vs prior 7 days"
    >
      {loading ? (
        <Card>
          <div className="flex items-center justify-center py-16 text-text-secondary gap-3">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Analyzing trends…</span>
          </div>
        </Card>
      ) : !data || data.monitors.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-text-secondary gap-3">
            <Activity className="w-12 h-12 opacity-30" />
            <p className="text-lg font-medium">No monitors yet</p>
            <p className="text-sm">Create monitors to see week-over-week trend analysis.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <div className="px-4 py-3">
                <p className="text-xs text-text-secondary mb-1">Total Monitors</p>
                <p className="text-2xl font-bold text-text-primary">{totalCount}</p>
              </div>
            </Card>
            <Card>
              <div className="px-4 py-3">
                <p className="text-xs text-text-secondary mb-1">Degrading</p>
                <p className={`text-2xl font-bold ${degradingCount > 0 ? 'text-red-400' : 'text-text-primary'}`}>{degradingCount}</p>
              </div>
            </Card>
            <Card>
              <div className="px-4 py-3">
                <p className="text-xs text-text-secondary mb-1">Improving</p>
                <p className={`text-2xl font-bold ${improvingCount > 0 ? 'text-green-400' : 'text-text-primary'}`}>{improvingCount}</p>
              </div>
            </Card>
            <Card>
              <div className="px-4 py-3">
                <p className="text-xs text-text-secondary mb-1">New (no baseline)</p>
                <p className="text-2xl font-bold text-text-primary">{newCount}</p>
              </div>
            </Card>
          </div>

          {/* Trend table */}
          <Card>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-text-primary">All Monitors — 7d vs Prior 7d</h2>
              <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <Table>
              <TableHead>
                <tr>
                  <SortableHeader sortKey="name" sort={sort} onSort={toggle}>Monitor</SortableHeader>
                  <SortableHeader sortKey="uptimeTrend" sort={sort} onSort={toggle}>Uptime Trend</SortableHeader>
                  <SortableHeader sortKey="currentUptimePct" sort={sort} onSort={toggle}>Current</SortableHeader>
                  <SortableHeader sortKey="uptimeDelta" sort={sort} onSort={toggle}>Δ vs Prior</SortableHeader>
                  <SortableHeader sortKey="latencyTrend" sort={sort} onSort={toggle}>Latency Trend</SortableHeader>
                  <SortableHeader sortKey="currentAvgLatencyMs" sort={sort} onSort={toggle}>Avg Latency</SortableHeader>
                  <SortableHeader sortKey="latencyDeltaPct" sort={sort} onSort={toggle}>Δ Latency</SortableHeader>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Checks</th>
                </tr>
              </TableHead>
              <TableBody>
                {sorted.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex flex-col min-w-0">
                        <a href={`/monitors/${m.id}`} className="font-medium text-text-primary hover:text-accent truncate">
                          {m.name}
                        </a>
                        <span className="text-xs text-text-muted">{m.folder ?? m.type}</span>
                      </div>
                    </TableCell>
                    <TableCell><TrendBadge trend={m.uptimeTrend} /></TableCell>
                    <TableCell><UptimePct pct={m.currentUptimePct} /></TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <DeltaCell value={m.uptimeDelta} unit="pp" />
                        {m.previousUptimePct != null && (
                          <span className="text-[10px] text-text-muted">prev {m.previousUptimePct.toFixed(1)}%</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell><TrendBadge trend={m.latencyTrend} /></TableCell>
                    <TableCell><LatencyMs ms={m.currentAvgLatencyMs} /></TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <DeltaCell value={m.latencyDeltaPct} unit="%" invertColors />
                        {m.previousAvgLatencyMs != null && (
                          <span className="text-[10px] text-text-muted">prev {m.previousAvgLatencyMs}ms</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-text-secondary">{m.currentChecks} / {m.previousChecks}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data.generatedAt && (
              <div className="px-4 py-2 border-t border-border text-[10px] text-text-muted">
                Generated {new Date(data.generatedAt).toLocaleString()} · Compares last 7 days vs prior 7 days
              </div>
            )}
          </Card>
        </div>
      )}
    </AppFrame>
  );
}
