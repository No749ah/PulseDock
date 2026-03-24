// Performance widgets — response time charts, latency, apdex, throughput
import React from "react";
import { Activity } from "lucide-react";
import {
  type WidgetProps,
  timeAgo,
  formatRelative,
  isNoConfig,
  NoConfigPlaceholder,
  WidgetCard,
  StatusDot,
  TrendArrow,
  AnimatedNumber,
} from "./shared";

export function ResponseTimeChart({ widget, monitors, extra }: WidgetProps) {
  if (isNoConfig(extra.widgetDataById[widget.id])) return <NoConfigPlaceholder label="Response Time" />; 
  const monitor = monitors.find((m) => m.id === widget.config.monitorId) ?? monitors[0];
  const label = widget.config.label ?? monitor?.name ?? "Response Time";

  const widgetData = extra.widgetDataById[widget.id] as {
    dataPoints?: Array<{ t: string; ms: number | null; ok: boolean }>;
    avgMs?: number | null;
    p95Ms?: number | null;
    maxMs?: number | null;
  } | undefined;

  const dataPoints = widgetData?.dataPoints ?? [];
  const avgMs = widgetData?.avgMs ?? null;
  const p95Ms = widgetData?.p95Ms ?? null;
  const maxMs = widgetData?.maxMs ?? null;

  const withLatency = dataPoints.filter((d) => d.ms !== null);

  // SVG sparkline params
  const W = 600;
  const H = 80;
  const N = dataPoints.length;
  const barW = N > 0 ? Math.max(1, (W - (N - 1) * 2) / N) : 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        <div className="flex items-center gap-3">
          {avgMs !== null && (
            <span className="text-xs text-text-secondary tabular-nums">
              avg <span className="font-semibold text-text-primary">{avgMs}ms</span>
            </span>
          )}
          {p95Ms !== null && (
            <span className="text-xs text-text-secondary tabular-nums">
              p95 <span className="font-semibold text-text-primary">{p95Ms}ms</span>
            </span>
          )}
        </div>
      </div>

      {/* Chart */}
      {withLatency.length === 0 ? (
        <div className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg bg-bg/50 border border-dashed border-border px-4 text-center">
          <Activity className="w-4 h-4 text-text-muted shrink-0" />
          <span className="text-xs text-text-secondary">
            {dataPoints.length > 0
              ? "No response time data — this monitor type doesn't track latency."
              : "Waiting for check data"}
          </span>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          width="100%"
          height={H}
          aria-label={`Response time sparkline, avg ${avgMs}ms`}
          className="rounded-lg overflow-hidden"
        >
          <title>{`Response time chart — avg ${avgMs}ms, p95 ${p95Ms}ms`}</title>

          {/* Background */}
          <rect x={0} y={0} width={W} height={H} fill="transparent" />

          {/* Bars */}
          {dataPoints.map((d, i) => {
            const x = i * (barW + 2);
            const fill = d.ms === null ? "#374151" : d.ok ? "#22c55e" : "#ef4444";
            const barH =
              d.ms === null || maxMs === null || maxMs === 0
                ? 3
                : Math.max(3, (d.ms / maxMs) * (H - 4));
            const y = H - barH;
            return (
              <rect key={i} x={x} y={y} width={barW} height={barH} fill={fill} rx={1} opacity={0.85}>
                <title>{d.ms !== null ? `${new Date(d.t).toLocaleTimeString()} · ${d.ms}ms${!d.ok ? " (failed)" : ""}` : "No data"}</title>
              </rect>
            );
          })}

          {/* Average dashed line */}
          {avgMs !== null && maxMs !== null && maxMs > 0 && (
            <line
              x1={0}
              y1={H - (avgMs / maxMs) * (H - 4) - 2}
              x2={W}
              y2={H - (avgMs / maxMs) * (H - 4) - 2}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.7}
            />
          )}

          {/* P95 line */}
          {p95Ms !== null && maxMs !== null && maxMs > 0 && p95Ms !== avgMs && (
            <line
              x1={0}
              y1={H - (p95Ms / maxMs) * (H - 4) - 2}
              x2={W}
              y2={H - (p95Ms / maxMs) * (H - 4) - 2}
              stroke="#f59e0b"
              strokeWidth={1}
              strokeDasharray="2 4"
              opacity={0.5}
            />
          )}
        </svg>
      )}

      {/* Footer stats */}
      {withLatency.length > 0 && (
        <div className="mt-2 flex items-center gap-4 text-[10px] text-text-secondary">
          <span>{dataPoints.length} checks</span>
          {maxMs !== null && <span>max {maxMs}ms</span>}
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-3 rounded-full" style={{ background: "#94a3b8", opacity: 0.7 }} />
            avg
          </span>
          {p95Ms !== null && p95Ms !== avgMs && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-3 rounded-full" style={{ background: "#f59e0b", opacity: 0.5 }} />
              p95
            </span>
          )}
          {Boolean((widgetData as Record<string, unknown>)?.fetchedAt) && (
            <span className="ml-auto">{timeAgo((widgetData as Record<string,unknown>).fetchedAt as string)}</span>
          )}
        </div>
      )}
    </div>
  );
}

// Response Time Heatmap — hour-of-day × day-of-week latency grid

export function ResponseTimeHeatmap({ widget, monitors, extra }: WidgetProps) {
  if (isNoConfig(extra.widgetDataById[widget.id])) return <NoConfigPlaceholder label="Response Time Heatmap" />; 
  const monitor = monitors.find((m) => m.id === widget.config.monitorId) ?? monitors[0];
  const label = (widget.config.label as string) ?? monitor?.name ?? "Response Time Heatmap";

  const data = extra.widgetDataById[widget.id] as {
    grid?: Array<Array<number | null>>; // [dow 0-6][hour 0-23]
    minMs?: number;
    maxMs?: number;
    avgMs?: number;
    periodDays?: number;
  } | undefined;

  const grid = data?.grid;
  const minMs = data?.minMs ?? 0;
  const maxMs = data?.maxMs ?? 0;
  const avgMs = data?.avgMs ?? 0;

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  function latencyColor(ms: number | null): string {
    if (ms === null) return "#1f2937"; // empty cell
    if (maxMs === minMs) return "#22c55e";
    const t = Math.min(1, Math.max(0, (ms - minMs) / (maxMs - minMs)));
    // green (fast) → yellow → red (slow)
    if (t < 0.5) {
      const r = Math.round(34 + (250 - 34) * (t * 2));
      const g = Math.round(197 + (204 - 197) * (t * 2));
      return `rgb(${r},${g},34)`;
    } else {
      const r = Math.round(250 + (239 - 250) * ((t - 0.5) * 2));
      const g = Math.round(204 + (68 - 204) * ((t - 0.5) * 2));
      return `rgb(${r},${g},34)`;
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-semibold text-text-primary">{label}</span>
        <div className="flex items-center gap-3">
          {avgMs > 0 && <span className="text-xs text-text-secondary">avg <span className="font-semibold text-text-primary">{avgMs}ms</span></span>}
          {maxMs > 0 && <span className="text-xs text-text-secondary">peak <span className="font-semibold text-warning">{maxMs}ms</span></span>}
          {data?.periodDays && <span className="text-xs text-text-secondary">{data.periodDays}d</span>}
          {Boolean((data as Record<string, unknown>)?.fetchedAt) && <span className="text-[10px] text-text-muted">{timeAgo((data as Record<string, unknown>).fetchedAt as string)}</span>}
        </div>
      </div>

      {!grid ? (
        <div className="flex h-32 items-center justify-center rounded-lg bg-bg">
          <span className="text-xs text-text-secondary">No latency data yet</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            {/* Hour labels */}
            <div className="flex pl-8 mb-0.5">
              {HOURS.map((h) => (
                <div key={h} className="flex-1 text-center text-[9px] text-text-secondary/60 leading-none">
                  {h % 6 === 0 ? `${h}h` : ""}
                </div>
              ))}
            </div>
            {/* Grid rows */}
            {DAYS.map((day, dow) => (
              <div key={dow} className="flex items-center mb-0.5">
                <div className="w-8 text-[10px] text-text-secondary shrink-0 text-right pr-1.5">{day}</div>
                {HOURS.map((hour) => {
                  const ms = grid[dow]?.[hour] ?? null;
                  return (
                    <div
                      key={hour}
                      className="flex-1 aspect-square rounded-[2px] mx-px"
                      style={{ backgroundColor: latencyColor(ms) }}
                      title={ms !== null ? `${day} ${hour}:00 UTC — ${ms}ms avg` : `${day} ${hour}:00 UTC — no data`}
                    />
                  );
                })}
              </div>
            ))}
            {/* Legend */}
            <div className="flex items-center gap-1.5 mt-2 pl-8">
              <span className="text-[9px] text-text-secondary">fast</span>
              <div className="flex h-2 flex-1 max-w-[80px] rounded overflow-hidden">
                {Array.from({ length: 20 }, (_, i) => {
                  const t = i / 19;
                  const r = t < 0.5 ? Math.round(34 + 216 * t * 2) : Math.round(250 - 11 * (t - 0.5) * 2);
                  const g = t < 0.5 ? Math.round(197 + 7 * t * 2) : Math.round(204 - 136 * (t - 0.5) * 2);
                  return <div key={i} className="flex-1" style={{ backgroundColor: `rgb(${r},${g},34)` }} />;
                })}
              </div>
              <span className="text-[9px] text-text-secondary">slow</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Check History Feed

export function CheckHistoryFeed({ extra }: WidgetProps) {
  const checks = extra.recentChecks;
  const okCount = checks.filter(c => c.ok).length;
  const failCount = checks.length - okCount;
  if (checks.length === 0) {
    return (
      <WidgetCard title="Recent Checks">
        <div className="px-4 py-8 text-center text-sm text-text-secondary">
          No check history available yet
        </div>
      </WidgetCard>
    );
  }
  return (
    <WidgetCard
      title="Recent Checks"
      meta={
        <span className="flex items-center gap-2">
          {okCount > 0 && <span className="text-green-400 font-mono">{okCount}✓</span>}
          {failCount > 0 && <span className="text-red-400 font-mono">{failCount}✗</span>}
        </span>
      }
    >
      <ul className="divide-y divide-border/40 max-h-80 overflow-y-auto">
        {checks.slice(0, 20).map((c) => {
          const level = c.level as "green" | "yellow" | "red";
          const dotColor = level === "green" ? "bg-green-400" : level === "yellow" ? "bg-yellow-400" : "bg-red-400";
          return (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-elevated/30 transition-colors">
              <span className={`h-2 w-2 rounded-full flex-shrink-0 ${dotColor} ${level !== "green" ? "animate-pulse" : ""}`} />
              <span className="flex-1 truncate text-sm text-text-primary">{c.monitorName}</span>
              {c.message && (
                <span className="hidden sm:block truncate max-w-[150px] text-xs text-text-secondary italic">{c.message}</span>
              )}
              {c.latencyMs !== null && (
                <span className={`shrink-0 tabular-nums text-xs font-mono ${c.latencyMs > 500 ? "text-warning" : "text-text-secondary"}`}>
                  {c.latencyMs}ms
                </span>
              )}
              <span className="shrink-0 text-xs text-text-muted w-14 text-right">{formatRelative(c.checkedAt)}</span>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

// Incident History — real incidents from API

export function LatencyPercentilesCard({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    monitorId: string;
    periodDays: number;
    p50: number | null;
    p95: number | null;
    p99: number | null;
    prevP50: number | null;
    prevP95: number | null;
    prevP99: number | null;
    sampleCount: number;
  } | undefined;

  const label = widget.config.label as string | undefined;

  if (!data) {
    return (
      <WidgetCard title={label ?? "Response Latency"}>
        <div className="px-4 py-8 text-center text-sm text-text-secondary">Loading...</div>
      </WidgetCard>
    );
  }

  function latencyColor(ms: number | null): string {
    if (ms === null) return "text-text-secondary";
    if (ms < 200) return "text-green-400";
    if (ms < 500) return "text-yellow-400";
    return "text-red-400";
  }

  function latencyBg(ms: number | null): string {
    if (ms === null) return "bg-border/10";
    if (ms < 200) return "bg-green-500/8";
    if (ms < 500) return "bg-yellow-500/8";
    return "bg-red-500/8";
  }

  function latencyBorder(ms: number | null): string {
    if (ms === null) return "border-border/30";
    if (ms < 200) return "border-green-500/20";
    if (ms < 500) return "border-yellow-500/20";
    return "border-red-500/20";
  }

  function trendNode(current: number | null, prev: number | null): React.ReactNode {
    if (current === null || prev === null) return null;
    if (current > prev) return <span className="text-red-400 text-xs">↑</span>;
    if (current < prev) return <span className="text-green-400 text-xs">↓</span>;
    return <span className="text-text-muted text-xs">→</span>;
  }

  const cells: Array<{ label: string; sublabel: string; value: number | null; prev: number | null }> = [
    { label: "P50", sublabel: "Median", value: data.p50, prev: data.prevP50 },
    { label: "P95", sublabel: "95th pct", value: data.p95, prev: data.prevP95 },
    { label: "P99", sublabel: "99th pct", value: data.p99, prev: data.prevP99 },
  ];

  return (
    <WidgetCard
      title={label ?? "Response Latency"}
      meta={`${data.sampleCount.toLocaleString()} samples · ${data.periodDays}d${(data as Record<string, unknown>).fetchedAt ? ` · ${timeAgo((data as Record<string, unknown>).fetchedAt as string)}` : ''}`}
    >
      <div className="p-4 grid grid-cols-3 gap-2">
        {cells.map((c) => (
          <div key={c.label} className={`rounded-xl border ${latencyBorder(c.value)} ${latencyBg(c.value)} p-3 text-center`}>
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">{c.label}</p>
            <p className="text-[9px] text-text-muted mb-1.5">{c.sublabel}</p>
            <div className="flex items-center justify-center gap-1">
              <span className={`text-xl font-bold tabular-nums leading-none ${latencyColor(c.value)}`}>
                {c.value !== null ? c.value : "—"}
              </span>
              {c.value !== null && <span className="text-[10px] text-text-muted">ms</span>}
            </div>
            <div className="mt-1 flex justify-center">
              {trendNode(c.value, c.prev)}
            </div>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}

// DowntimeLog — chronological outage list with duration, timestamps, ongoing indicator

export function PerformanceTrend({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    thisWeekAvg: number;
    lastWeekAvg: number;
    changePercent: number;
    trend: "up" | "down" | "stable";
    dataPoints: number[];
  } | undefined;

  const label = widget.config.label as string | undefined;

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  // trend "down" = latency decreased = improvement = green
  const isImprovement = data.trend === "down";
  const isStable = data.trend === "stable";
  const trendColor = isStable ? "text-text-secondary" : isImprovement ? "text-green-400" : "text-red-400";
  const arrow = isStable ? "→" : isImprovement ? "↓" : "↑";

  // SVG sparkline (14 points)
  const pts = data.dataPoints;
  const maxVal = Math.max(...pts, 1);
  const W = 200;
  const H = 40;
  const step = W / (pts.length - 1);
  const pathD = pts
    .map((v, i) => {
      const x = i * step;
      const y = H - (v / maxVal) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {label && <p className="text-sm font-semibold text-text-primary mb-2">{label}</p>}
      <div className="flex items-center gap-4">
        <div>
          <p className={`text-4xl font-bold tabular-nums ${trendColor}`}>
            {arrow} {Math.abs(data.changePercent).toFixed(1)}%
          </p>
          <p className="text-xs text-text-secondary mt-1">vs last week</p>
          <p className="text-xs text-text-muted mt-0.5">
            {data.thisWeekAvg}ms → {data.lastWeekAvg}ms
          </p>
        </div>
        <div className="flex-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10 overflow-visible" aria-hidden="true">
            <path d={pathD} fill="none" stroke="rgba(99,102,241,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-[10px] text-text-muted text-center mt-1">14-day latency</p>
        </div>
      </div>
    </div>
  );
}

// ── Apdex Score ──────────────────────────────────────────────────────────


export function ApdexScore({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    score: number | null;
    satisfied: number;
    tolerating: number;
    frustrated: number;
    total: number;
    rating: string | null;
  } | undefined;

  const label = widget.config.label as string | undefined;

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  if (data.score === null || data.total === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-6 text-center">
        {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
        <p className="text-sm text-text-secondary">No data available</p>
      </div>
    );
  }

  const ratingColor =
    data.rating === "Excellent" ? "text-green-400"
    : data.rating === "Good" ? "text-blue-400"
    : data.rating === "Fair" ? "text-yellow-400"
    : data.rating === "Poor" ? "text-orange-400"
    : "text-red-400";

  const satisfiedPct = data.total > 0 ? (data.satisfied / data.total) * 100 : 0;
  const toleratingPct = data.total > 0 ? (data.tolerating / data.total) * 100 : 0;
  const frustratedPct = data.total > 0 ? (data.frustrated / data.total) * 100 : 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="text-5xl font-bold tabular-nums text-text-primary">{data.score.toFixed(2)}</p>
          <p className={`text-sm font-semibold mt-1 ${ratingColor}`}>{data.rating}</p>
          <p className="text-[10px] text-text-muted mt-0.5">Apdex Score</p>
        </div>
        <div className="flex-1 space-y-2">
          {/* Breakdown bar */}
          <div className="flex h-3 overflow-hidden rounded-full">
            <div className="bg-green-500" style={{ width: `${satisfiedPct}%` }} title={`Satisfied: ${data.satisfied}`} />
            <div className="bg-yellow-400" style={{ width: `${toleratingPct}%` }} title={`Tolerating: ${data.tolerating}`} />
            <div className="bg-red-500" style={{ width: `${frustratedPct}%` }} title={`Frustrated: ${data.frustrated}`} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-text-secondary flex-1">Satisfied</span>
              <span className="tabular-nums text-text-primary">{data.satisfied}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="h-2 w-2 rounded-full bg-yellow-400" />
              <span className="text-text-secondary flex-1">Tolerating</span>
              <span className="tabular-nums text-text-primary">{data.tolerating}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-text-secondary flex-1">Frustrated</span>
              <span className="tabular-nums text-text-primary">{data.frustrated}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Throughput Counter ───────────────────────────────────────────────────


export function ThroughputCounter({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    current: number;
    average: number;
    peak: number;
    dataPoints: { hour: string; count: number }[];
  } | undefined;

  const label = widget.config.label as string | undefined;

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  const maxCount = Math.max(...data.dataPoints.map((p) => p.count), 1);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {label && <p className="text-sm font-semibold text-text-primary mb-2">{label}</p>}
      <div className="flex items-end gap-4 mb-3">
        <div>
          <p className="text-4xl font-bold tabular-nums text-text-primary">{data.current}</p>
          <p className="text-xs text-text-secondary mt-0.5">Checks / Hour</p>
        </div>
        <div className="space-y-0.5 text-right">
          <p className="text-xs text-text-secondary">Avg <span className="text-text-primary font-semibold">{data.average}</span></p>
          <p className="text-xs text-text-secondary">Peak <span className="text-text-primary font-semibold">{data.peak}</span></p>
        </div>
      </div>
      {/* 24-bar sparkline */}
      <div className="flex items-end gap-0.5 h-10">
        {data.dataPoints.map((pt, i) => {
          const heightPct = maxCount > 0 ? (pt.count / maxCount) * 100 : 0;
          const isAboveAvg = pt.count >= data.average;
          return (
            <div
              key={i}
              className={`flex-1 rounded-sm min-h-[2px] ${isAboveAvg ? "bg-indigo-500" : "bg-indigo-500/40"}`}
              style={{ height: `${Math.max(heightPct, 4)}%` }}
              title={`${pt.hour}: ${pt.count}`}
            />
          );
        })}
      </div>
      <p className="text-[10px] text-text-muted mt-1">Last 24 hours</p>
    </div>
  );
}

// ── Group / Multi Widgets ────────────────────────────────────────────────

// Monitor Group — shows monitors grouped by tag or folder

export function ResponseTimeComparison({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    monitors: { id: string; name: string; color: string; dataPoints: number[] }[];
    labels: string[];
    periodHours: number;
  } | undefined;

  if (!raw || !raw.monitors?.length) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-sm text-text-secondary text-center">
        No data available
      </div>
    );
  }

  const { monitors: monitorLines, labels } = raw;
  const title = (widget.config.label as string) || "Response Time Comparison";
  const svgW = 600;
  const svgH = 160;
  const padL = 48;
  const padR = 12;
  const padT = 8;
  const padB = 28;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;

  const allPoints = monitorLines.flatMap((m) => m.dataPoints);
  const maxVal = allPoints.length > 0 ? Math.max(...allPoints) : 1;
  const minVal = 0;
  const range = maxVal - minVal || 1;

  const toX = (i: number, total: number) => padL + (i / Math.max(total - 1, 1)) * chartW;
  const toY = (v: number) => padT + chartH - ((v - minVal) / range) * chartH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(minVal + t * range));

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto" style={{ maxHeight: 180 }} role="img" aria-label={`${title} line chart`}>
        <title>{title}</title>
        {/* Y-axis ticks */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={padL} x2={svgW - padR} y1={toY(tick)} y2={toY(tick)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={padL - 4} y={toY(tick) + 4} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.35)">{tick}</text>
          </g>
        ))}
        {/* X-axis labels */}
        {labels.map((lbl, i) => {
          const total = labels.length;
          if (i % 6 !== 0 && i !== total - 1) return null;
          return (
            <text key={i} x={toX(i, total)} y={svgH - 4} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.35)">{lbl}</text>
          );
        })}
        {/* Lines */}
        {monitorLines.map((m) => {
          const pts = m.dataPoints;
          if (pts.length < 2) return null;
          const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i, pts.length)} ${toY(v)}`).join(' ');
          return <path key={m.id} d={d} stroke={m.color} strokeWidth={1.5} fill="none" strokeLinejoin="round" />;
        })}
      </svg>
      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {monitorLines.map((m) => (
          <div key={m.id} className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
            {m.name}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Uptime Comparison Chart ──────────────────────────────────────────────

