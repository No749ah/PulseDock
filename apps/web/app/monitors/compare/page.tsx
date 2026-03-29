'use client';

import { useEffect, useState, useCallback } from 'react';
import { AppFrame } from '../../../components/app-frame';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { GitCompareArrows, Plus, X, Crown, TrendingUp, TrendingDown, Activity, Zap, BarChart2 } from 'lucide-react';
import Link from 'next/link';

const MONITOR_COLORS = ['#3b82f6', '#22c55e', '#f97316', '#a855f7'] as const;

type MonitorSummary = { id: string; name: string; type: string; target: string; level: string; enabled: boolean };

type CompareMonitor = {
  id: string;
  name: string;
  type: string;
  target: string;
  uptimePct: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  totalChecks: number;
  totalFailures: number;
  longestOutageMin: number;
  dailyUptime: Array<{ date: string; uptimePct: number; avgLatencyMs: number | null }>;
  dailyLatency: Array<{ date: string; avgMs: number | null; p95Ms: number | null }>;
};

type Correlation = {
  monitorA: string;
  monitorB: string;
  coefficient: number;
  interpretation: 'strong_positive' | 'moderate_positive' | 'weak' | 'moderate_negative' | 'strong_negative';
};

type CompareResult = {
  monitors: CompareMonitor[];
  comparison: {
    bestUptime: { monitorId: string; value: number };
    bestLatency: { monitorId: string; value: number } | null;
    mostReliable: { monitorId: string; longestOutageMin: number };
    correlations: Correlation[];
  };
  period: { days: number; from: string; to: string };
};

const DAYS_OPTIONS = [
  { value: 1, label: '24h' },
  { value: 7, label: '7d' },
  { value: 14, label: '14d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
];

function StatusDot({ level }: { level: string }) {
  const color = level === 'red' ? 'bg-red-500' : level === 'yellow' ? 'bg-yellow-500' : 'bg-green-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

const interpLabels: Record<string, { label: string; color: string }> = {
  strong_positive: { label: 'Strong +', color: 'text-green-400' },
  moderate_positive: { label: 'Moderate +', color: 'text-green-300' },
  weak: { label: 'Weak', color: 'text-text-muted' },
  moderate_negative: { label: 'Moderate −', color: 'text-orange-400' },
  strong_negative: { label: 'Strong −', color: 'text-red-400' },
};

export default function MonitorComparePage() {
  const [allMonitors, setAllMonitors] = useState<MonitorSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [days, setDays] = useState(7);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!user) return;
    api<{ monitors?: MonitorSummary[] } | MonitorSummary[]>('/v1/monitors', user.id)
      .then((data) => {
        const monitors = Array.isArray(data) ? data : (data as { monitors?: MonitorSummary[] }).monitors ?? [];
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
      const ids = selectedIds.join(',');
      const data = await api<CompareResult>(`/v1/monitors/compare?ids=${ids}&days=${days}`, user.id);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Comparison failed');
    } finally {
      setLoading(false);
    }
  }, [selectedIds, days]);

  const addMonitor = (id: string) => {
    if (selectedIds.includes(id) || selectedIds.length >= 4) return;
    setSelectedIds((prev) => [...prev, id]);
  };

  const removeMonitor = (id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  const getMonitorColor = (id: string) => {
    const idx = result?.monitors.findIndex((m) => m.id === id) ?? 0;
    return MONITOR_COLORS[idx % MONITOR_COLORS.length];
  };

  const getMonitorName = (id: string) => result?.monitors.find((m) => m.id === id)?.name ?? id;

  return (
    <AppFrame title="Monitor Comparison" subtitle="Side-by-side performance analysis of your monitors">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <GitCompareArrows className="w-5 h-5 text-accent" />
            Monitor Comparison
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Select 2–4 monitors to compare side-by-side with statistical analysis
          </p>
        </div>

        {/* Configuration */}
        <Card className="p-4 space-y-4">
          {/* Period selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-text-secondary">Period:</span>
            {DAYS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDays(opt.value)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  days === opt.value
                    ? 'bg-accent text-white'
                    : 'bg-surface-elevated text-text-secondary hover:text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Selected monitors */}
          <div>
            <div className="text-sm font-medium text-text-primary mb-2">
              Monitors ({selectedIds.length}/4)
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {selectedIds.map((id, idx) => {
                const m = allMonitors.find((x) => x.id === id);
                return m ? (
                  <div
                    key={id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
                    style={{ borderColor: MONITOR_COLORS[idx], color: MONITOR_COLORS[idx], backgroundColor: `${MONITOR_COLORS[idx]}15` }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MONITOR_COLORS[idx] }} />
                    {m.name}
                    <button onClick={() => removeMonitor(id)} className="hover:text-red-400 ml-0.5">
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
            {selectedIds.length < 4 && (
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
              </div>
            )}
          </div>

          <Button onClick={runComparison} disabled={selectedIds.length < 2 || loading} className="w-full sm:w-auto">
            {loading ? 'Comparing…' : selectedIds.length < 2 ? 'Select at least 2 monitors' : `Compare ${selectedIds.length} monitors`}
          </Button>
        </Card>

        {error && (
          <Card className="p-4 border-danger/30 bg-danger/5">
            <p className="text-sm text-danger">{error}</p>
          </Card>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Metric comparison cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Uptime */}
              <Card className="p-4">
                <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Uptime</div>
                <div className="space-y-2">
                  {result.monitors.map((m, idx) => (
                    <div key={m.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MONITOR_COLORS[idx] }} />
                        <span className="text-xs text-text-secondary truncate max-w-[80px]">{m.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold tabular-nums text-text-primary">{m.uptimePct}%</span>
                        {result.comparison.bestUptime.monitorId === m.id && <Crown className="w-3 h-3 text-yellow-400" />}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Avg Latency */}
              <Card className="p-4">
                <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Avg Latency</div>
                <div className="space-y-2">
                  {result.monitors.map((m, idx) => (
                    <div key={m.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MONITOR_COLORS[idx] }} />
                        <span className="text-xs text-text-secondary truncate max-w-[80px]">{m.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold tabular-nums text-text-primary">{m.avgLatencyMs != null ? `${m.avgLatencyMs}ms` : '—'}</span>
                        {result.comparison.bestLatency?.monitorId === m.id && <Crown className="w-3 h-3 text-yellow-400" />}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* P95 Latency */}
              <Card className="p-4">
                <div className="text-xs text-text-muted uppercase tracking-wider mb-2">P95 Latency</div>
                <div className="space-y-2">
                  {result.monitors.map((m, idx) => (
                    <div key={m.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MONITOR_COLORS[idx] }} />
                        <span className="text-xs text-text-secondary truncate max-w-[80px]">{m.name}</span>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-text-primary">{m.p95LatencyMs != null ? `${m.p95LatencyMs}ms` : '—'}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Failures */}
              <Card className="p-4">
                <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Failures</div>
                <div className="space-y-2">
                  {result.monitors.map((m, idx) => (
                    <div key={m.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MONITOR_COLORS[idx] }} />
                        <span className="text-xs text-text-secondary truncate max-w-[80px]">{m.name}</span>
                      </div>
                      <span className={`text-sm font-bold tabular-nums ${m.totalFailures > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {m.totalFailures}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Longest Outage */}
              <Card className="p-4">
                <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Longest Outage</div>
                <div className="space-y-2">
                  {result.monitors.map((m, idx) => (
                    <div key={m.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MONITOR_COLORS[idx] }} />
                        <span className="text-xs text-text-secondary truncate max-w-[80px]">{m.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold tabular-nums text-text-primary">
                          {m.longestOutageMin > 0 ? `${m.longestOutageMin}m` : '0'}
                        </span>
                        {result.comparison.mostReliable.monitorId === m.id && <Crown className="w-3 h-3 text-yellow-400" />}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Uptime Overlay Chart */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4" /> Daily Uptime
              </h3>
              <div className="relative h-48">
                {result.monitors[0]?.dailyUptime.length > 0 && (() => {
                  const allDates = result.monitors[0].dailyUptime;
                  const width = 100 / Math.max(allDates.length - 1, 1);
                  return (
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
                      {/* Grid lines */}
                      {[100, 99, 98, 95, 90].map((pct) => {
                        const y = 100 - pct;
                        return <line key={pct} x1="0" y1={y} x2="100" y2={y} stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.2" />;
                      })}
                      {/* Lines for each monitor */}
                      {result.monitors.map((m, idx) => {
                        const points = m.dailyUptime
                          .map((d, i) => `${(i / Math.max(allDates.length - 1, 1)) * 100},${100 - d.uptimePct}`)
                          .join(' ');
                        return (
                          <polyline
                            key={m.id}
                            points={points}
                            fill="none"
                            stroke={MONITOR_COLORS[idx]}
                            strokeWidth="0.8"
                            strokeLinejoin="round"
                          />
                        );
                      })}
                    </svg>
                  );
                })()}
                {/* Date labels */}
                {result.monitors[0]?.dailyUptime.length > 0 && (
                  <div className="flex justify-between text-[10px] text-text-muted mt-1">
                    <span>{result.monitors[0].dailyUptime[0]?.date}</span>
                    <span>{result.monitors[0].dailyUptime[result.monitors[0].dailyUptime.length - 1]?.date}</span>
                  </div>
                )}
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-4 mt-3">
                {result.monitors.map((m, idx) => (
                  <div key={m.id} className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <span className="w-3 h-0.5 rounded" style={{ backgroundColor: MONITOR_COLORS[idx] }} />
                    {m.name}
                  </div>
                ))}
              </div>
            </Card>

            {/* Latency Overlay Chart */}
            {result.monitors.some((m) => m.avgLatencyMs != null) && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4" /> Daily Latency
                </h3>
                <div className="relative h-48">
                  {(() => {
                    const allLatencies = result.monitors.flatMap((m) => m.dailyLatency.map((d) => d.avgMs).filter((v): v is number => v != null));
                    const maxLat = Math.max(...allLatencies, 1);
                    const allDates = result.monitors[0]?.dailyLatency ?? [];
                    return (
                      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
                        {result.monitors.map((m, idx) => {
                          const points = m.dailyLatency
                            .map((d, i) => {
                              const y = d.avgMs != null ? 100 - (d.avgMs / maxLat) * 90 : 100;
                              return `${(i / Math.max(allDates.length - 1, 1)) * 100},${y}`;
                            })
                            .join(' ');
                          return (
                            <polyline
                              key={m.id}
                              points={points}
                              fill="none"
                              stroke={MONITOR_COLORS[idx]}
                              strokeWidth="0.8"
                              strokeLinejoin="round"
                            />
                          );
                        })}
                        {/* P95 dashed lines */}
                        {result.monitors.map((m, idx) => {
                          const points = m.dailyLatency
                            .map((d, i) => {
                              const y = d.p95Ms != null ? 100 - (d.p95Ms / maxLat) * 90 : 100;
                              return `${(i / Math.max(allDates.length - 1, 1)) * 100},${y}`;
                            })
                            .join(' ');
                          return (
                            <polyline
                              key={`p95-${m.id}`}
                              points={points}
                              fill="none"
                              stroke={MONITOR_COLORS[idx]}
                              strokeWidth="0.4"
                              strokeDasharray="2,2"
                              strokeLinejoin="round"
                              opacity={0.6}
                            />
                          );
                        })}
                      </svg>
                    );
                  })()}
                  {result.monitors[0]?.dailyLatency.length > 0 && (
                    <div className="flex justify-between text-[10px] text-text-muted mt-1">
                      <span>{result.monitors[0].dailyLatency[0]?.date}</span>
                      <span>{result.monitors[0].dailyLatency[result.monitors[0].dailyLatency.length - 1]?.date}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-4 mt-3">
                  {result.monitors.map((m, idx) => (
                    <div key={m.id} className="flex items-center gap-1.5 text-xs text-text-secondary">
                      <span className="w-3 h-0.5 rounded" style={{ backgroundColor: MONITOR_COLORS[idx] }} />
                      {m.name} (solid=avg, dashed=p95)
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Correlation Matrix */}
            {result.comparison.correlations.length > 0 && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4" /> Uptime Correlation
                </h3>
                <p className="text-xs text-text-muted mb-3">
                  High positive correlation suggests monitors share infrastructure or dependencies.
                </p>
                <div className="space-y-2">
                  {result.comparison.correlations.map((c) => {
                    const interp = interpLabels[c.interpretation] ?? interpLabels.weak;
                    return (
                      <div key={`${c.monitorA}-${c.monitorB}`} className="flex items-center gap-3 text-sm">
                        <span className="text-text-primary font-medium" style={{ color: getMonitorColor(c.monitorA) }}>
                          {getMonitorName(c.monitorA)}
                        </span>
                        <span className="text-text-muted">↔</span>
                        <span className="text-text-primary font-medium" style={{ color: getMonitorColor(c.monitorB) }}>
                          {getMonitorName(c.monitorB)}
                        </span>
                        <span className="ml-auto font-bold tabular-nums text-text-primary">{c.coefficient.toFixed(3)}</span>
                        <span className={`text-xs font-medium ${interp.color}`}>{interp.label}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Full Stats Table */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
                Full Statistics
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-text-secondary font-medium">Monitor</th>
                      <th className="text-right py-2 px-3 text-text-secondary font-medium">Uptime</th>
                      <th className="text-right py-2 px-3 text-text-secondary font-medium">Avg Latency</th>
                      <th className="text-right py-2 px-3 text-text-secondary font-medium">P95 Latency</th>
                      <th className="text-right py-2 px-3 text-text-secondary font-medium">Checks</th>
                      <th className="text-right py-2 px-3 text-text-secondary font-medium">Failures</th>
                      <th className="text-right py-2 px-3 text-text-secondary font-medium">Longest Outage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.monitors.map((m, idx) => (
                      <tr key={m.id} className="border-b border-border/50 hover:bg-surface-elevated/50">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MONITOR_COLORS[idx] }} />
                            <Link href={`/monitors/${m.id}`} className="font-medium text-text-primary hover:text-accent transition-colors">
                              {m.name}
                            </Link>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-elevated text-text-muted">{m.type}</span>
                          </div>
                        </td>
                        <td className={`py-2.5 px-3 text-right font-bold tabular-nums ${m.uptimePct >= 99.9 ? 'text-green-400' : m.uptimePct >= 95 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {m.uptimePct}%
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-text-primary">
                          {m.avgLatencyMs != null ? `${m.avgLatencyMs}ms` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-text-primary">
                          {m.p95LatencyMs != null ? `${m.p95LatencyMs}ms` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-text-secondary">{m.totalChecks}</td>
                        <td className={`py-2.5 px-3 text-right tabular-nums ${m.totalFailures > 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {m.totalFailures}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-text-secondary">
                          {m.longestOutageMin > 0 ? `${m.longestOutageMin}min` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <Card className="p-8 text-center">
            <GitCompareArrows className="w-12 h-12 text-text-muted mx-auto mb-3" />
            <p className="text-text-secondary">Select 2–4 monitors above and click Compare to see side-by-side analysis</p>
          </Card>
        )}
      </div>
    </AppFrame>
  );
}
