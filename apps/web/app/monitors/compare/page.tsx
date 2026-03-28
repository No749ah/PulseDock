'use client';

import { useEffect, useState, useCallback } from 'react';
import { AppFrame } from '../../../components/app-frame';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { ArrowLeft, Plus, X, TrendingUp, TrendingDown, BarChart2, Activity, Zap } from 'lucide-react';
import Link from 'next/link';

// Types
type MonitorSummary = { id: string; name: string; type: string; target: string; level: string; enabled: boolean };
type CompareResult = {
  id: string;
  name: string;
  type: string;
  target: string;
  level: string;
  enabled: boolean;
  uptimePct: number;
  avgLatencyMs: number | null;
  incidents: number;
  totalDowntimeSec: number;
  mttrSec: number;
  totalChecks: number;
};

const PERIODS = ['1d', '7d', '30d', '90d'] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_LABELS: Record<Period, string> = { '1d': '24h', '7d': '7 days', '30d': '30 days', '90d': '90 days' };

function StatusDot({ level }: { level: string }) {
  const color =
    level === 'red' ? 'bg-red-500' : level === 'yellow' ? 'bg-yellow-500' : 'bg-green-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

export default function MonitorComparePage() {
  const [allMonitors, setAllMonitors] = useState<MonitorSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [period, setPeriod] = useState<Period>('30d');
  const [results, setResults] = useState<CompareResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!user) return;
    api<{ monitors?: MonitorSummary[] } | MonitorSummary[]>('/v1/monitors', user.id)
      .then((data) => {
        const monitors = Array.isArray(data) ? data : (data as { monitors?: MonitorSummary[] }).monitors ?? [];
        // Filter out version monitors
        setAllMonitors(monitors.filter((m) => m.type !== 'GIT_RELEASE' && m.type !== 'DOCKER_IMAGE'));
      })
      .catch(() => {});
  }, []);

  const runComparison = useCallback(async () => {
    if (selectedIds.length < 2) return;
    const user = getUser();
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ monitors: CompareResult[]; period: string }>(
        '/v1/monitors/compare',
        user.id,
        { method: 'POST', body: JSON.stringify({ monitorIds: selectedIds, period }) },
      );
      setResults(data.monitors);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Comparison failed');
    } finally {
      setLoading(false);
    }
  }, [selectedIds, period]);

  const addMonitor = (id: string) => {
    if (selectedIds.includes(id) || selectedIds.length >= 5) return;
    setSelectedIds((prev) => [...prev, id]);
  };

  const removeMonitor = (id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    setResults((prev) => prev.filter((r) => r.id !== id));
  };

  const sorted = [...results].sort((a, b) => b.uptimePct - a.uptimePct);

  return (
    <AppFrame title="Monitor Comparison" subtitle="Compare 2–5 monitors side by side">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/monitors"
            className="p-2 rounded-lg hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-accent" />
              Monitor Comparison
            </h1>
            <p className="text-sm text-text-secondary">Compare 2–5 monitors side by side</p>
          </div>
        </div>

        {/* Configuration */}
        <Card className="p-4 space-y-4">
          {/* Period selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-text-secondary">Period:</span>
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  period === p
                    ? 'bg-accent text-white'
                    : 'bg-surface-elevated text-text-secondary hover:text-text-primary'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>

          {/* Monitor selector */}
          <div>
            <div className="text-sm font-medium text-text-primary mb-2">
              Select monitors ({selectedIds.length}/5)
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {selectedIds.map((id) => {
                const m = allMonitors.find((x) => x.id === id);
                return m ? (
                  <div
                    key={id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/15 text-accent text-xs font-medium border border-accent/30"
                  >
                    <StatusDot level={m.level} />
                    {m.name}
                    <button
                      onClick={() => removeMonitor(id)}
                      className="hover:text-red-400 transition-colors ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : null;
              })}
              {selectedIds.length === 0 && (
                <span className="text-sm text-text-muted italic">No monitors selected</span>
              )}
            </div>

            {/* Monitor picker */}
            {selectedIds.length < 5 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-surface space-y-0.5 p-1">
                {allMonitors
                  .filter((m) => !selectedIds.includes(m.id))
                  .map((m) => (
                    <button
                      key={m.id}
                      onClick={() => addMonitor(m.id)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors text-left"
                    >
                      <StatusDot level={m.level} />
                      <span className="font-medium flex-1 truncate">{m.name}</span>
                      <span className="text-xs text-text-muted">{m.type}</span>
                      <Plus className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                    </button>
                  ))}
                {allMonitors.filter((m) => !selectedIds.includes(m.id)).length === 0 && (
                  <p className="text-xs text-text-muted p-2 text-center">All monitors selected</p>
                )}
              </div>
            )}
          </div>

          <Button
            onClick={runComparison}
            disabled={selectedIds.length < 2 || loading}
            className="w-full sm:w-auto"
          >
            {loading
              ? 'Comparing…'
              : `Compare ${selectedIds.length < 2 ? '(select 2+)' : selectedIds.length + ' monitors'}`}
          </Button>
        </Card>

        {/* Error */}
        {error && (
          <Card className="p-4 border-danger/30 bg-danger/5">
            <p className="text-sm text-danger">{error}</p>
          </Card>
        )}

        {/* Results */}
        {sorted.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
              Comparison — last {PERIOD_LABELS[period]}
            </h2>

            {/* Summary table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-text-secondary font-medium">Monitor</th>
                    <th className="text-right py-2 px-3 text-text-secondary font-medium">Uptime %</th>
                    <th className="text-right py-2 px-3 text-text-secondary font-medium">
                      Avg Latency
                    </th>
                    <th className="text-right py-2 px-3 text-text-secondary font-medium">
                      Incidents
                    </th>
                    <th className="text-right py-2 px-3 text-text-secondary font-medium">
                      Downtime
                    </th>
                    <th className="text-right py-2 px-3 text-text-secondary font-medium">MTTR</th>
                    <th className="text-right py-2 px-3 text-text-secondary font-medium">Checks</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => {
                    const uptimeColor =
                      r.uptimePct >= 99.9
                        ? 'text-success'
                        : r.uptimePct >= 99
                          ? 'text-success/80'
                          : r.uptimePct >= 95
                            ? 'text-warning'
                            : 'text-danger';
                    const isTop = i === 0;
                    const isBottom = i === sorted.length - 1 && sorted.length > 1;
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors"
                      >
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <StatusDot level={r.level} />
                            <Link
                              href={`/monitors/${r.id}`}
                              className="font-medium text-text-primary hover:text-accent transition-colors"
                            >
                              {r.name}
                            </Link>
                            {isTop && sorted.length > 1 && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-success/15 text-success flex items-center gap-0.5">
                                <TrendingUp className="w-2.5 h-2.5" /> Best
                              </span>
                            )}
                            {isBottom &&
                              sorted.length > 1 &&
                              r.uptimePct < sorted[0].uptimePct && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-danger/15 text-danger flex items-center gap-0.5">
                                  <TrendingDown className="w-2.5 h-2.5" /> Needs attention
                                </span>
                              )}
                          </div>
                          <div className="text-xs text-text-muted truncate max-w-[200px] mt-0.5">
                            {r.target}
                          </div>
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-bold tabular-nums ${uptimeColor}`}
                        >
                          {r.uptimePct}%
                        </td>
                        <td className="py-2.5 px-3 text-right text-text-primary tabular-nums">
                          {r.avgLatencyMs != null ? `${r.avgLatencyMs}ms` : '—'}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right tabular-nums ${
                            r.incidents > 0 ? 'text-danger' : 'text-success'
                          }`}
                        >
                          {r.incidents}
                        </td>
                        <td className="py-2.5 px-3 text-right text-text-secondary tabular-nums">
                          {r.totalDowntimeSec > 0 ? formatDuration(r.totalDowntimeSec) : '0s'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-text-secondary tabular-nums">
                          {r.mttrSec > 0 ? formatDuration(r.mttrSec) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-text-secondary tabular-nums">
                          {r.totalChecks}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Uptime bar chart */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Uptime Comparison
              </h3>
              <div className="space-y-3">
                {sorted.map((r) => {
                  const color =
                    r.uptimePct >= 99.9
                      ? 'bg-success'
                      : r.uptimePct >= 99
                        ? 'bg-success/70'
                        : r.uptimePct >= 95
                          ? 'bg-warning'
                          : 'bg-danger';
                  return (
                    <div key={r.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-primary font-medium">{r.name}</span>
                        <span className="text-text-secondary tabular-nums">{r.uptimePct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-elevated overflow-hidden">
                        <div
                          className={`h-full rounded-full ${color} transition-all duration-500`}
                          style={{ width: `${Math.max(r.uptimePct, 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Latency comparison */}
            {sorted.some((r) => r.avgLatencyMs != null) && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Avg Latency Comparison
                </h3>
                <div className="space-y-3">
                  {(() => {
                    const maxLatency = Math.max(...sorted.map((r) => r.avgLatencyMs ?? 0));
                    return sorted.map((r) => {
                      const lat = r.avgLatencyMs;
                      const pct =
                        maxLatency > 0 && lat != null ? (lat / maxLatency) * 100 : 0;
                      const color =
                        lat == null
                          ? 'bg-surface-elevated'
                          : lat < 500
                            ? 'bg-success'
                            : lat < 2000
                              ? 'bg-warning'
                              : 'bg-danger';
                      return (
                        <div key={r.id} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-text-primary font-medium">{r.name}</span>
                            <span className="text-text-secondary tabular-nums">
                              {lat != null ? `${lat}ms` : '—'}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-surface-elevated overflow-hidden">
                            <div
                              className={`h-full rounded-full ${color} transition-all duration-500`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppFrame>
  );
}
