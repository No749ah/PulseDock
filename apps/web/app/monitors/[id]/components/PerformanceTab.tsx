"use client";

import React from "react";
import { Activity, TrendingUp, Clock, AlertCircle } from "lucide-react";
import { Card } from "../../../components/Card";
import { relativeTime } from "../../../components/timeUtils";
import { formatDuration } from "./types";
import type { MonitorRun } from "./types";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface LatencyBucket {
  rangeLabel: string;
  from: number;
  to: number;
  count: number;
  pct: number;
}

export interface LatencyPercentiles {
  p50: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
}

export interface HourlyAvgEntry {
  hour: number;
  avgMs: number | null;
  p95Ms: number | null;
  count: number;
}

export interface LatencyDistributionData {
  buckets: LatencyBucket[];
  percentiles: LatencyPercentiles;
  hourlyAvg: HourlyAvgEntry[];
  totalChecks: number;
  successChecks: number;
  checkedRange: string;
}

export interface StatusTransition {
  from: string;
  to: string;
  at: string;
  message: string | null;
  latencyMs: number | null;
  durationSec: number | null;
}

export interface StatusTransitionsData {
  transitions: StatusTransition[];
  summary: {
    totalOutages: number;
    totalDowntimeSec: number;
    avgRecoveryTimeSec: number | null;
    mtbfSec: number | null;
  };
  period: string;
  checkedRange: string;
  totalRuns: number;
  currentStatus: string;
}

export interface PeriodStats {
  total: number;
  successCount: number;
  uptime: number | null;
  avgMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
}

export interface PeriodComparisonData {
  period: string;
  current: PeriodStats;
  prior: PeriodStats;
  delta: {
    uptimePct: number | null;
    avgMsPct: number | null;
    p95MsPct: number | null;
  };
}

export interface LatencyHistoryDay {
  date: string;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  avgMs: number | null;
  uptimePct: number | null;
  totalChecks: number;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  runs: MonitorRun[];
  monitorType: string;
  perfData: LatencyDistributionData | null;
  perfLoading: boolean;
  perfError: string | null;
  perfPeriod: "24h" | "7d" | "30d";
  onPerfPeriodChange: (period: "24h" | "7d" | "30d") => Promise<void>;
  transitionsData: StatusTransitionsData | null;
  perfComparison: PeriodComparisonData | null;
  latencyHistory: LatencyHistoryDay[] | null;
  latencyHistoryLoading: boolean;
  latencyHistoryDays: 14 | 30 | 60;
  onLatencyHistoryDaysChange: (days: 14 | 30 | 60) => void;
}

export function PerformanceTab({
  runs,
  monitorType,
  perfData,
  perfLoading,
  perfError,
  perfPeriod,
  onPerfPeriodChange,
  transitionsData,
  perfComparison,
  latencyHistory,
  latencyHistoryLoading,
  latencyHistoryDays,
  onLatencyHistoryDaysChange,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted font-medium">Period:</span>
        {(["24h", "7d", "30d"] as const).map((p) => (
          <button
            key={p}
            onClick={() => void onPerfPeriodChange(p)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              perfPeriod === p
                ? "bg-accent text-white"
                : "bg-white/5 text-text-muted hover:text-text-secondary border border-white/10"
            }`}
          >
            {p}
          </button>
        ))}
        {perfData && (
          <span className="ml-auto text-xs text-text-muted">{perfData.checkedRange} · {perfData.successChecks} successful checks</span>
        )}
      </div>

      {perfLoading && (
        <Card className="p-8 text-center text-text-muted text-sm">Loading performance data…</Card>
      )}
      {perfError && !perfLoading && (
        <Card className="p-8 text-center text-danger text-sm">{perfError}</Card>
      )}
      {perfData && !perfLoading && (
        <>
          {/* A. Latency Distribution Histogram */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Latency Distribution</h2>
            </div>
            {perfData.successChecks === 0 ? (
              <p className="text-text-muted text-sm text-center py-4">No successful checks in this period.</p>
            ) : (
              <div className="space-y-2">
                {perfData.buckets.map((bucket) => {
                  const maxCount = Math.max(...perfData.buckets.map((b) => b.count), 1);
                  const widthPct = (bucket.count / maxCount) * 100;
                  const barColor =
                    bucket.to !== -1 && bucket.to <= 200
                      ? "bg-green-500"
                      : bucket.to !== -1 && bucket.to <= 500
                      ? "bg-yellow-500"
                      : bucket.to !== -1 && bucket.to <= 1000
                      ? "bg-orange-500"
                      : "bg-red-500";
                  return (
                    <div key={bucket.rangeLabel} className="flex items-center gap-2 text-xs">
                      <span className="w-20 text-text-muted text-right shrink-0 font-mono">{bucket.rangeLabel}</span>
                      <div className="flex-1 bg-white/5 rounded-full h-5 overflow-hidden">
                        <div
                          className={`${barColor} h-5 rounded-full transition-all`}
                          style={{ width: `${Math.max(bucket.count > 0 ? 2 : 0, widthPct)}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-text-secondary tabular-nums shrink-0">{bucket.count}</span>
                      <span className="w-12 text-right text-text-muted tabular-nums shrink-0">({bucket.pct}%)</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* B. Percentile Cards */}
          <div className="grid grid-cols-5 gap-2">
            {(["p50", "p75", "p90", "p95", "p99"] as const).map((key) => {
              const val = perfData.percentiles[key];
              const color =
                val === null
                  ? "text-text-muted"
                  : val < 200
                  ? "text-green-400"
                  : val < 500
                  ? "text-yellow-400"
                  : "text-red-400";
              return (
                <Card key={key} className="p-3 text-center">
                  <p className="text-xs text-text-muted mb-1 uppercase tracking-wider">{key.toUpperCase()}</p>
                  <p className={`text-lg font-bold tabular-nums ${color}`}>
                    {val !== null ? `${val}ms` : "—"}
                  </p>
                </Card>
              );
            })}
          </div>

          {/* C. Period Comparison */}
          {perfComparison && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                  vs. Previous {perfPeriod === "24h" ? "24 hours" : perfPeriod === "7d" ? "7 days" : "30 days"}
                </h2>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {([
                  { label: "Uptime", curr: perfComparison.current.uptime !== null ? `${perfComparison.current.uptime}%` : "—", delta: perfComparison.delta.uptimePct, higher: true },
                  { label: "Avg Latency", curr: perfComparison.current.avgMs !== null ? `${perfComparison.current.avgMs}ms` : "—", delta: perfComparison.delta.avgMsPct, higher: false },
                  { label: "P95 Latency", curr: perfComparison.current.p95Ms !== null ? `${perfComparison.current.p95Ms}ms` : "—", delta: perfComparison.delta.p95MsPct, higher: false },
                ] as Array<{ label: string; curr: string; delta: number | null; higher: boolean }>).map((metric) => {
                  const improved = metric.delta !== null && (metric.higher ? metric.delta > 0 : metric.delta < 0);
                  const degraded = metric.delta !== null && (metric.higher ? metric.delta < 0 : metric.delta > 0);
                  const deltaColor = improved ? "text-green-400" : degraded ? "text-red-400" : "text-text-muted";
                  const deltaPrefix = metric.delta !== null && metric.delta > 0 ? "+" : "";
                  return (
                    <div key={metric.label} className="text-center">
                      <p className="text-xs text-text-muted mb-1">{metric.label}</p>
                      <p className="text-lg font-bold text-text-primary tabular-nums">{metric.curr}</p>
                      {metric.delta !== null ? (
                        <p className={`text-xs font-medium tabular-nums ${deltaColor}`}>
                          {deltaPrefix}{metric.delta}%
                        </p>
                      ) : (
                        <p className="text-xs text-text-muted">No prior data</p>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-text-muted border-t border-border pt-2">
                <span>Current: {perfComparison.current.total} checks, {perfComparison.current.successCount} ok</span>
                <span>Prior: {perfComparison.prior.total} checks, {perfComparison.prior.successCount} ok</span>
              </div>
            </Card>
          )}

          {/* D. Hourly Heatmap */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Hourly Latency Pattern (UTC)</h2>
            </div>
            <div className="flex gap-1 flex-wrap">
              {perfData.hourlyAvg.map((h) => {
                const bg =
                  h.count === 0
                    ? "bg-white/5"
                    : h.avgMs === null
                    ? "bg-white/5"
                    : h.avgMs < 200
                    ? "bg-green-500/60"
                    : h.avgMs < 500
                    ? "bg-yellow-500/60"
                    : h.avgMs < 1000
                    ? "bg-orange-500/60"
                    : "bg-red-500/60";
                const tooltip =
                  h.count === 0
                    ? `Hour ${h.hour}:00 UTC — No data`
                    : `Hour ${h.hour}:00 UTC\nAvg: ${h.avgMs}ms\nP95: ${h.p95Ms}ms\nChecks: ${h.count}`;
                return (
                  <div key={h.hour} className="flex flex-col items-center gap-0.5">
                    <div
                      title={tooltip}
                      className={`w-7 h-7 rounded ${bg} cursor-default transition-colors hover:ring-1 hover:ring-white/30`}
                    />
                    {h.hour % 6 === 0 && (
                      <span className="text-[9px] text-text-muted">{h.hour}</span>
                    )}
                    {h.hour % 6 !== 0 && <span className="text-[9px] text-transparent">·</span>}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 mt-3 text-[10px] text-text-muted">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-white/5" /> No data</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-500/60" /> Fast (&lt;200ms)</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-yellow-500/60" /> Medium (200-500ms)</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-orange-500/60" /> Slow (500ms-1s)</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-500/60" /> Very Slow (&gt;1s)</span>
            </div>
          </Card>

          {/* E. Status Transitions Timeline */}
          {transitionsData && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Status Transitions</h2>
                <span className="ml-auto text-xs text-text-muted">{transitionsData.checkedRange}</span>
              </div>
              {/* Summary stats */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Outages", value: String(transitionsData.summary.totalOutages), color: transitionsData.summary.totalOutages > 0 ? "text-danger" : "text-success" },
                  { label: "Total Downtime", value: transitionsData.summary.totalDowntimeSec > 0 ? formatDuration(transitionsData.summary.totalDowntimeSec) : "0s", color: "text-text-primary" },
                  { label: "Avg Recovery (MTTR)", value: transitionsData.summary.avgRecoveryTimeSec !== null ? formatDuration(transitionsData.summary.avgRecoveryTimeSec) : "—", color: "text-text-primary" },
                  { label: "MTBF", value: transitionsData.summary.mtbfSec !== null ? formatDuration(transitionsData.summary.mtbfSec) : "—", color: "text-text-primary" },
                ].map((stat) => (
                  <div key={stat.label} className="text-center p-2 rounded-lg bg-white/3">
                    <p className="text-[10px] text-text-muted mb-1 uppercase tracking-wider">{stat.label}</p>
                    <p className={`text-sm font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
                  </div>
                ))}
              </div>
              {transitionsData.transitions.length === 0 ? (
                <p className="text-text-muted text-sm text-center py-4">No status changes in this period — monitor has been stable. ✓</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-[18px] top-0 bottom-0 w-px bg-white/10" />
                  <div className="space-y-3">
                    {transitionsData.transitions.map((t, i) => {
                      const isDown = t.to !== "green";
                      const dotColor = t.to === "green" ? "bg-success" : t.to === "yellow" ? "bg-warning" : "bg-danger";
                      const textColor = t.to === "green" ? "text-success" : t.to === "yellow" ? "text-warning" : "text-danger";
                      const arrow = `${t.from} → ${t.to}`;
                      return (
                        <div key={i} className="flex items-start gap-3 pl-1">
                          <div className={`w-4 h-4 rounded-full ${dotColor} shrink-0 mt-0.5 ring-2 ring-surface`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-semibold capitalize ${textColor}`}>{isDown ? "Outage" : "Recovery"}</span>
                              <span className="text-[10px] text-text-muted font-mono">{arrow}</span>
                              {t.durationSec !== null && (
                                <span className="text-[10px] text-text-muted">· was {t.from} for {formatDuration(t.durationSec)}</span>
                              )}
                              <span className="ml-auto text-[10px] text-text-muted shrink-0">{relativeTime(t.at)}</span>
                            </div>
                            {t.message && (
                              <p className="text-[11px] text-text-secondary mt-0.5 truncate">{t.message}</p>
                            )}
                            {t.latencyMs !== null && (
                              <p className="text-[10px] text-text-muted">{t.latencyMs}ms</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* F. Response Size Trend (HTTP/BROWSER only) */}
          {(monitorType === "HTTP" || monitorType === "BROWSER") && (() => {
            const sizeRuns = runs.filter((r) => r.responseSizeBytes != null && r.ok);
            if (sizeRuns.length < 2) return null;
            const sizes = sizeRuns.slice(0, 60).reverse().map((r) => r.responseSizeBytes as number);
            const maxSize = Math.max(...sizes, 1);
            const minSize = Math.min(...sizes);
            const avgSize = Math.round(sizes.reduce((s, v) => s + v, 0) / sizes.length);
            const latestSize = sizes[sizes.length - 1];
            const formatBytes = (b: number) =>
              b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`;
            const deltaVsAvg = avgSize > 0 ? Math.round(((latestSize - avgSize) / avgSize) * 100) : 0;
            return (
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Response Size Trend
                  </h2>
                  <span className="text-xs text-text-muted">{sizeRuns.length} samples</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "Latest", value: formatBytes(latestSize), sub: deltaVsAvg !== 0 ? `${deltaVsAvg > 0 ? "+" : ""}${deltaVsAvg}% vs avg` : "≈ avg", color: Math.abs(deltaVsAvg) > 20 ? "text-warning" : "text-success" },
                    { label: "Average", value: formatBytes(avgSize), sub: `of last ${sizes.length} checks` },
                    { label: "Range", value: formatBytes(maxSize - minSize), sub: `${formatBytes(minSize)} – ${formatBytes(maxSize)}` },
                  ].map(({ label, value, sub, color }) => (
                    <div key={label} className="p-3 rounded-lg bg-surface-2 border border-border">
                      <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
                      <p className={`text-lg font-bold tabular-nums mt-0.5 ${color ?? "text-text-primary"}`}>{value}</p>
                      <p className="text-xs text-text-muted mt-0.5">{sub}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-end gap-[2px] h-16">
                  {sizes.map((s, i) => {
                    const pct = maxSize > 0 ? (s / maxSize) * 100 : 0;
                    const isLatest = i === sizes.length - 1;
                    const devPct = avgSize > 0 ? Math.abs((s - avgSize) / avgSize) * 100 : 0;
                    const barColor = devPct > 60 ? "bg-danger" : devPct > 30 ? "bg-warning" : isLatest ? "bg-accent" : "bg-accent/40";
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-t ${barColor} transition-all`}
                        style={{ height: `${Math.max(pct, 4)}%` }}
                        title={formatBytes(s)}
                      />
                    );
                  })}
                </div>
                <p className="text-[10px] text-text-muted mt-1 text-center">Last {sizes.length} successful checks (oldest → newest)</p>
              </Card>
            );
          })()}

          {/* G. Redirect Stats (HTTP/BROWSER only) */}
          {(monitorType === "HTTP" || monitorType === "BROWSER") && (() => {
            const redirectRuns = runs.filter((r) => r.redirectChain && r.redirectChain.length > 0);
            if (redirectRuns.length === 0) return null;
            const counts: Record<string, { chain: string[]; count: number }> = {};
            for (const r of redirectRuns) {
              const key = JSON.stringify(r.redirectChain);
              if (!counts[key]) counts[key] = { chain: r.redirectChain!, count: 0 };
              counts[key].count++;
            }
            const commonChains = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5);
            const totalHops = redirectRuns.reduce((s, r) => s + (r.redirectChain?.length ?? 0), 0);
            const avgHops = Math.round((totalHops / redirectRuns.length) * 10) / 10;
            const maxHops = redirectRuns.reduce((m, r) => Math.max(m, r.redirectChain?.length ?? 0), 0);
            return (
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Redirect Stats
                  </h2>
                  <span className="text-xs text-text-muted">{redirectRuns.length} runs with redirects</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "Has Redirects", value: "Yes", sub: `${redirectRuns.length} of ${runs.length} runs` },
                    { label: "Avg Hops", value: `${avgHops}`, sub: "hops per redirected run" },
                    { label: "Max Hops", value: `${maxHops}`, sub: "most hops in a single run" },
                  ].map(({ label, value, sub }) => (
                    <div key={label} className="p-3 rounded-lg bg-surface-2 border border-border">
                      <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
                      <p className="text-lg font-bold tabular-nums mt-0.5 text-amber-400">{value}</p>
                      <p className="text-xs text-text-muted mt-0.5">{sub}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Common chains</p>
                  {commonChains.map(({ chain, count }, i) => (
                    <div key={i} className="p-2 rounded-lg bg-surface-2 border border-border text-xs font-mono text-text-secondary break-all">
                      <span className="text-amber-400 font-medium mr-2">{count}×</span>
                      {chain.map((url, j) => (
                        <span key={j}>
                          {j > 0 && <span className="text-text-muted mx-1">→</span>}
                          <span>{url}</span>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })()}

          {/* H. Daily Latency Percentile History */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Daily Latency Trends
                </h3>
                <p className="text-xs text-text-muted mt-1">P50 / P95 / P99 per day over the selected period</p>
              </div>
              <div className="flex items-center gap-1.5">
                {([14, 30, 60] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => onLatencyHistoryDaysChange(d)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      latencyHistoryDays === d
                        ? "bg-accent text-white"
                        : "bg-white/5 text-text-muted hover:text-text-secondary border border-white/10"
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            {latencyHistoryLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              </div>
            ) : !latencyHistory || latencyHistory.every((d) => d.p50 === null) ? (
              <p className="text-sm text-text-muted text-center py-6">No latency data for this period.</p>
            ) : (() => {
              const withData = latencyHistory.filter((d) => d.p50 !== null || d.p95 !== null);
              const maxVal = Math.max(...latencyHistory.map((d) => d.p99 ?? d.p95 ?? d.p50 ?? 0), 1);
              const formatDate = (iso: string) => {
                const d = new Date(iso + "T00:00:00Z");
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
              };
              const tickInterval = Math.max(1, Math.floor(latencyHistory.length / 6));

              return (
                <div>
                  <div className="relative h-40 w-full" aria-label="Latency percentile trend chart">
                    <svg viewBox={`0 0 ${latencyHistory.length * 10} 100`} className="w-full h-full" preserveAspectRatio="none">
                      {[25, 50, 75, 100].map((pct) => (
                        <line
                          key={pct}
                          x1="0" y1={100 - pct} x2={latencyHistory.length * 10} y2={100 - pct}
                          stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"
                        />
                      ))}
                      {latencyHistory.some((d) => d.p99 !== null) && (
                        <polyline
                          points={latencyHistory
                            .map((d, i) => d.p99 !== null ? `${i * 10 + 5},${100 - Math.min(98, (d.p99 / maxVal) * 98)}` : null)
                            .filter(Boolean)
                            .join(" ")}
                          fill="none"
                          stroke="rgba(248,113,113,0.5)"
                          strokeWidth="1"
                        />
                      )}
                      <polyline
                        points={latencyHistory
                          .map((d, i) => d.p95 !== null ? `${i * 10 + 5},${100 - Math.min(98, (d.p95 / maxVal) * 98)}` : null)
                          .filter(Boolean)
                          .join(" ")}
                        fill="none"
                        stroke="rgba(251,146,60,0.8)"
                        strokeWidth="1.5"
                      />
                      <polyline
                        points={latencyHistory
                          .map((d, i) => d.p50 !== null ? `${i * 10 + 5},${100 - Math.min(98, (d.p50 / maxVal) * 98)}` : null)
                          .filter(Boolean)
                          .join(" ")}
                        fill="none"
                        stroke="rgba(74,222,128,0.9)"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </div>

                  <div className="flex justify-between mt-1 px-1">
                    {latencyHistory
                      .filter((_, i) => i % tickInterval === 0 || i === latencyHistory.length - 1)
                      .map((d) => (
                        <span key={d.date} className="text-[10px] text-text-muted">{formatDate(d.date)}</span>
                      ))}
                  </div>

                  <div className="flex items-center gap-4 mt-3 text-xs text-text-secondary">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-green-400 inline-block" />P50 (median)</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-orange-400 inline-block" />P95</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-red-400 inline-block" />P99</span>
                    <span className="ml-auto text-text-muted">Peak: {maxVal}ms</span>
                  </div>

                  {withData.length > 0 && (() => {
                    const p95vals = latencyHistory.filter((d) => d.p95 !== null).map((d) => d.p95!);
                    const avgP95 = p95vals.length > 0 ? Math.round(p95vals.reduce((s, v) => s + v, 0) / p95vals.length) : null;
                    const trend = p95vals.length >= 2
                      ? p95vals[p95vals.length - 1] > p95vals[0] ? "↑ worsening" : "↓ improving"
                      : null;
                    return (
                      <div className="grid grid-cols-3 gap-3 mt-3">
                        <div className="p-2.5 rounded-lg bg-surface-2 border border-border text-center">
                          <p className="text-[10px] text-text-muted uppercase tracking-wider">Avg P95</p>
                          <p className="text-sm font-bold tabular-nums text-orange-400 mt-0.5">{avgP95 !== null ? `${avgP95}ms` : "—"}</p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-surface-2 border border-border text-center">
                          <p className="text-[10px] text-text-muted uppercase tracking-wider">Peak P99</p>
                          <p className="text-sm font-bold tabular-nums text-red-400 mt-0.5">
                            {latencyHistory.some((d) => d.p99 !== null) ? `${Math.max(...latencyHistory.filter((d) => d.p99 !== null).map((d) => d.p99!))}ms` : "—"}
                          </p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-surface-2 border border-border text-center">
                          <p className="text-[10px] text-text-muted uppercase tracking-wider">P95 Trend</p>
                          <p className={`text-sm font-bold mt-0.5 ${trend?.includes("worsening") ? "text-red-400" : trend?.includes("improving") ? "text-green-400" : "text-text-muted"}`}>
                            {trend ?? "—"}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </Card>
        </>
      )}
    </div>
  );
}
