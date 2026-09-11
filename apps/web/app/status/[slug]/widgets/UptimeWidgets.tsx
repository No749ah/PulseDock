// Uptime widgets — bars, timelines, heatmaps, rolling uptimes, comparisons
import React from "react";
import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import {
  type WidgetProps,
  timeAgo,
  formatRelative,
  isNoConfig,
  NoConfigPlaceholder,
  AnimatedNumber,
  AnimatedUptimeCard,
} from "./shared";

export function UptimeBar({ widget, monitors, extra }: WidgetProps) {
  if (isNoConfig(extra.widgetDataById[widget.id])) return <NoConfigPlaceholder label="Uptime Bar" />;
  const monitor = monitors.find((m) => m.id === widget.config.monitorId) ?? monitors[0];
  const widgetData = extra.widgetDataById[widget.id] as {
    uptimePct?: number;
    periodDays?: number;
    total?: number;
    lastChecked?: string | null;
  } | undefined;

  const periodDays = widgetData?.periodDays ?? (widget.config.periodDays as number) ?? 30;
  const uptimePctRaw =
    widgetData?.uptimePct ??
    (!monitor ? 100 : monitor.level === "green" ? 100 : monitor.level === "yellow" ? 95.0 : 80.0);
  const uptimePct = Math.max(0, Math.min(100, Math.round(uptimePctRaw * 100) / 100));
  const label = widget.config.label ?? monitor?.name ?? "Uptime";

  const barColor =
    uptimePct >= 99.5
      ? "bg-green-400"
      : uptimePct >= 90
      ? "bg-yellow-400"
      : "bg-red-400";

  const borderColor =
    uptimePct >= 99.5
      ? "border-green-500/20"
      : uptimePct >= 90
      ? "border-yellow-500/20"
      : "border-red-500/30";

  const pctColor =
    uptimePct >= 99.5
      ? "text-green-400"
      : uptimePct >= 90
      ? "text-yellow-400"
      : "text-red-400";

  const StatusIcon =
    uptimePct >= 99.5
      ? CheckCircle2
      : uptimePct >= 90
      ? AlertCircle
      : XCircle;

  const iconColor =
    uptimePct >= 99.5
      ? "text-green-400"
      : uptimePct >= 90
      ? "text-yellow-400"
      : "text-red-400";

  const dotColor =
    uptimePct >= 99.5
      ? "bg-green-400"
      : uptimePct >= 90
      ? "bg-yellow-400"
      : "bg-red-400";

  return (
    <div className={`rounded-xl border ${borderColor} bg-surface p-4`} role="region" aria-label={`${label}: ${uptimePct}% uptime over last ${periodDays} days`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-text-primary min-w-0">
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />
          <span className="truncate">{label}</span>
        </span>
        <span className={`text-2xl font-bold tabular-nums shrink-0 ${pctColor}`} aria-label={`${uptimePct}% uptime`}>{uptimePct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-bg" role="progressbar" aria-valuenow={uptimePct} aria-valuemin={0} aria-valuemax={100} aria-label={`${uptimePct}% uptime`}>
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${uptimePct}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-text-secondary">Last {periodDays} days</p>
        <div className="flex items-center gap-2">
          {widgetData?.lastChecked && (
            <p className="text-[10px] text-text-secondary/50 tabular-nums">Updated {formatRelative(widgetData.lastChecked)}</p>
          )}
          {typeof widgetData?.total === "number" && (
            <p className="text-xs text-text-secondary tabular-nums">Based on {widgetData.total.toLocaleString()} checks</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Uptime Timeline — per-day status bars from real MonitorRun data

export function UptimeTimeline({ widget, monitors, extra }: WidgetProps) {
  if (isNoConfig(extra.widgetDataById[widget.id])) return <NoConfigPlaceholder label="Uptime Timeline" />;
  const monitor = monitors.find((m) => m.id === widget.config.monitorId);
  const label = widget.config.label ?? monitor?.name ?? "Uptime Timeline";

  // Real data from API
  const widgetData = extra.widgetDataById[widget.id] as {
    days?: number;
    timeline?: Array<{ date: string; level: "green" | "yellow" | "red" | "no-data"; counts?: { green: number; yellow: number; red: number } }>;
  } | null | undefined;

  const days = widgetData?.days ?? (widget.config.days as number) ?? 90;
  const timeline = widgetData?.timeline;

  // Fallback: simple placeholder squares when no data yet
  const squares: Array<{ date: string; level: string; title: string }> = timeline
    ? timeline.map((d) => {
        const total = d.counts ? d.counts.green + d.counts.yellow + d.counts.red : 0;
        const failed = d.counts ? d.counts.yellow + d.counts.red : 0;
        const uptimePctDay = total > 0 ? Math.round((d.counts!.green / total) * 10000) / 100 : null;
        const countSuffix = d.counts && total > 0
          ? ` · ${d.counts.green}✓ ${d.counts.yellow}⚠ ${d.counts.red}✗ (${total} total)`
          : "";
        return {
          date: d.date,
          level: d.level,
          title: d.level === "no-data"
            ? `${d.date} — No data`
            : d.level === "green"
            ? `${d.date} — Operational${uptimePctDay !== null ? ` · ${uptimePctDay}% up` : ""}${countSuffix}`
            : d.level === "yellow"
            ? `${d.date} — Degraded${uptimePctDay !== null ? ` · ${uptimePctDay}% up` : ""}${countSuffix}${failed > 0 ? ` · ${failed} failed` : ""}`
            : `${d.date} — Outage${uptimePctDay !== null ? ` · ${uptimePctDay}% up` : ""}${countSuffix}${failed > 0 ? ` · ${failed} failed` : ""}`,
        };
      })
    : Array.from({ length: days }, (_, i) => ({
        date: `Day ${i + 1}`,
        level: "no-data",
        title: `Day ${i + 1} — No data`,
      }));

  const upDays = squares.filter((s) => s.level === "green").length;
  const dataDays = squares.filter((s) => s.level !== "no-data").length;
  const uptimePct = dataDays > 0 ? Math.round((upDays / dataDays) * 1000) / 10 : null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4" role="region" aria-label={`${label}: ${days}-day uptime timeline${uptimePct !== null ? `, ${uptimePct}% uptime` : ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        <span className="text-xs text-text-secondary" aria-live="polite">
          {days}-day history{uptimePct !== null ? ` · ${uptimePct}% up` : ""}{(widgetData as Record<string,unknown>)?.fetchedAt ? ` · ${timeAgo((widgetData as Record<string,unknown>).fetchedAt as string)}` : ""}
        </span>
      </div>
      <div className="flex gap-[2px] flex-wrap" role="img" aria-label={`${days}-day uptime history chart: ${squares.filter(s => s.level === "green").length} days up, ${squares.filter(s => s.level === "red").length} days down`}>
        {squares.map((s, i) => (
          <div
            key={i}
            className={`h-5 w-2 rounded-sm transition-opacity hover:opacity-80 ${
              s.level === "green"
                ? "bg-green-500"
                : s.level === "yellow"
                ? "bg-yellow-500"
                : s.level === "red"
                ? "bg-red-500"
                : "bg-border"
            }`}
            title={s.title}
            aria-label={s.title}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-text-secondary" aria-hidden="true">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-green-500" />Up</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-yellow-500" />Degraded</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-red-500" />Down</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-border" />No data</span>
      </div>
    </div>
  );
}

// SLA Summary

export function RollingUptimeCards({ widget, extra }: WidgetProps) {
  if (isNoConfig(extra.widgetDataById[widget.id])) return <NoConfigPlaceholder label="Rolling Uptime" />; 
  const data = extra.widgetDataById[widget.id] as {
    monitorId: string;
    cards: Array<{ label: string; days: number; uptimePct: number; total: number }>;
  } | undefined;

  const label = widget.config.label as string | undefined;
  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
        <p className="text-sm text-text-secondary text-center py-4">Loading...</p>
      </div>
    );
  }

  const uptimeColor = (pct: number) =>
    pct >= 99.9 ? "text-green-400" : pct >= 99 ? "text-yellow-400" : "text-red-400";
  const uptimeBg = (pct: number) =>
    pct >= 99.9 ? "bg-green-500/8" : pct >= 99 ? "bg-yellow-500/8" : "bg-red-500/8";
  const uptimeBorder = (pct: number) =>
    pct >= 99.9 ? "border-green-500/20" : pct >= 99 ? "border-yellow-500/20" : "border-red-500/20";

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        {label && <p className="text-sm font-semibold text-text-primary">{label}</p>}
        {Boolean((data as Record<string, unknown>)?.fetchedAt) && (
          <span className="text-[10px] text-text-muted ml-auto">{timeAgo((data as Record<string,unknown>).fetchedAt as string)}</span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {data.cards.map((c) => (
          <AnimatedUptimeCard key={c.label} card={c} uptimeColor={uptimeColor} uptimeBg={uptimeBg} uptimeBorder={uptimeBorder} />
        
        ))}
      </div>
    </div>
  );
}

// Status History Ribbon — per monitor: last N days as horizontal colored bar (like GitHub status)

export function StatusHistoryRibbon({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    days: number;
    rows: Array<{
      id: string;
      name: string;
      ribbon: Array<{ date: string; level: "green" | "yellow" | "red" | "no-data" }>;
    }>;
  } | undefined;

  const label = widget.config.label as string | undefined;

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
        <p className="text-sm text-text-secondary text-center py-4">Loading...</p>
      </div>
    );
  }

  const dayColor = (level: string) =>
    level === "green" ? "bg-green-500/70"
    : level === "yellow" ? "bg-yellow-500/70"
    : level === "red" ? "bg-red-500/70"
    : "bg-border/40";

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        {label && <p className="text-sm font-semibold text-text-primary">{label}</p>}
        {Boolean((data as Record<string, unknown>)?.fetchedAt) && (
          <span className="text-[10px] text-text-muted ml-auto">{timeAgo((data as Record<string,unknown>).fetchedAt as string)}</span>
        )}
      </div>
      {data.rows.map((row) => {
        const upDays = row.ribbon.filter((d) => d.level === "green").length;
        const pct = row.ribbon.filter((d) => d.level !== "no-data").length > 0
          ? Math.round((upDays / row.ribbon.filter((d) => d.level !== "no-data").length) * 1000) / 10
          : 100;
        return (
          <div key={row.id}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-text-primary truncate">{row.name}</span>
              <span className="text-xs text-text-secondary ml-2 flex-shrink-0">{pct.toFixed(1)}%</span>
            </div>
            <div className="flex gap-px w-full overflow-hidden rounded-sm">
              {row.ribbon.map((day) => (
                <div
                  key={day.date}
                  className={`flex-1 h-4 ${dayColor(day.level)} rounded-[1px]`}
                  title={`${day.date}: ${day.level === "no-data" ? "No data" : day.level === "green" ? "Operational" : day.level === "yellow" ? "Degraded" : "Outage"}`}
                />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
              <span>{data.days}d ago</span>
              <span>Today</span>
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-3 pt-1 border-t border-border/30">
        <div className="flex items-center gap-1"><div className="h-2.5 w-2.5 rounded-sm bg-green-500/70" /><span className="text-[10px] text-text-muted">Up</span></div>
        <div className="flex items-center gap-1"><div className="h-2.5 w-2.5 rounded-sm bg-yellow-500/70" /><span className="text-[10px] text-text-muted">Degraded</span></div>
        <div className="flex items-center gap-1"><div className="h-2.5 w-2.5 rounded-sm bg-red-500/70" /><span className="text-[10px] text-text-muted">Down</span></div>
        <div className="flex items-center gap-1"><div className="h-2.5 w-2.5 rounded-sm bg-border/40" /><span className="text-[10px] text-text-muted">No data</span></div>
      </div>
    </div>
  );
}

// Uptime Percentage Card — big number display with trend arrow

export function UptimePercentageCard({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    monitorId: string;
    periodDays: number;
    uptimePct: number;
    previousPct: number;
    trend: "up" | "down" | "flat";
    delta: number;
  } | undefined;

  const label = widget.config.label as string | undefined;

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  const uptimeColor = data.uptimePct >= 99.9 ? "text-green-400" : data.uptimePct >= 99 ? "text-yellow-400" : "text-red-400";
  const trendColor = data.trend === "up" ? "text-green-400" : data.trend === "down" ? "text-red-400" : "text-text-secondary";
  const trendArrow = data.trend === "up" ? "↑" : data.trend === "down" ? "↓" : "→";
  const trendLabel = data.trend === "flat"
    ? "No change"
    : `${data.trend === "up" ? "+" : ""}${data.delta.toFixed(2)}% vs prev ${data.periodDays}d`;

  return (
    <div
      className="rounded-xl border border-border bg-surface p-6 text-center"
      role="region"
      aria-label={`${label ?? "Uptime"}: ${data.uptimePct.toFixed(2)}% over last ${data.periodDays} days. Trend: ${trendLabel}`}
    >
      <div className="flex items-center justify-between mb-3">
        {label && <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{label}</p>}
        {Boolean((data as Record<string, unknown>)?.fetchedAt) && (
          <span className="text-[10px] text-text-muted ml-auto">{timeAgo((data as Record<string,unknown>).fetchedAt as string)}</span>
        )}
      </div>
      <div className={`text-5xl font-bold tabular-nums ${uptimeColor}`} aria-label={`${data.uptimePct.toFixed(2)}% uptime`}>
        <AnimatedNumber value={data.uptimePct} decimals={2} duration={1400} suffix="%" />
      </div>
      <div className="text-xs text-text-secondary mt-2">
        Uptime — last {data.periodDays}d
      </div>
      {data.trend !== "flat" || data.previousPct !== 100 ? (
        <div className={`mt-2 text-sm font-medium ${trendColor}`} aria-label={trendLabel}>
          <span aria-hidden="true">{trendArrow}</span> {trendLabel}
        </div>
      ) : null}
    </div>
  );
}

// ── P1 New Widgets ──────────────────────────────────────────────────────

// Service Health Matrix — monitors × environments/regions matrix table

export function UptimeHeatmap({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    monitorId: string;
    grid: Array<Array<"green" | "yellow" | "red" | "no-data">>;
    dayLabels: string[];
    days: number;
    hours: number;
  } | undefined;

  const label = widget.config.label as string | undefined;

  const HOUR_LABELS = [0, 6, 12, 18, 23];
  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function cellColor(status: string): string {
    if (status === "green") return "bg-green-500/70";
    if (status === "yellow") return "bg-yellow-500/70";
    if (status === "red") return "bg-red-500/70";
    return "bg-border/30";
  }

  function statusLabel(status: string): string {
    if (status === "green") return "All OK";
    if (status === "yellow") return "Some failures";
    if (status === "red") return "All failed";
    return "No data";
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
        <p className="text-sm text-text-secondary text-center py-4">Loading...</p>
      </div>
    );
  }

  // Map day labels to Mon-Sun labels
  const dayRows = data.grid.map((row, i) => {
    const dateStr = data.dayLabels[i] ?? "";
    const date = dateStr ? new Date(dateStr) : null;
    const dayIdx = date ? date.getUTCDay() : i; // 0=Sun
    // Convert Sun=0 to Mon=0 for display
    const dayLabel = DAY_NAMES[(dayIdx + 6) % 7] ?? `D${i}`;
    return { row, dayLabel, dateStr };
  });

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        {label && <p className="text-sm font-semibold text-text-primary">{label}</p>}
        {Boolean((data as Record<string, unknown>)?.fetchedAt) && (
          <span className="text-[10px] text-text-muted ml-auto">{timeAgo((data as Record<string,unknown>).fetchedAt as string)}</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Hour labels */}
          <div className="flex pl-10 mb-1">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex-1 text-center text-[9px] text-text-secondary/60 leading-none">
                {HOUR_LABELS.includes(h) ? `${h}` : ""}
              </div>
            ))}
          </div>
          {/* Grid */}
          {dayRows.map(({ row, dayLabel, dateStr }, di) => (
            <div key={di} className="flex items-center mb-0.5">
              <div className="w-10 text-[10px] text-text-secondary text-right pr-2 shrink-0">{dayLabel}</div>
              {row.map((status, h) => (
                <div
                  key={h}
                  className={`flex-1 aspect-square rounded-[2px] mx-px ${cellColor(status)} hover:opacity-80 transition-opacity`}
                  title={`${dateStr} ${String(h).padStart(2, "0")}:00 UTC — ${statusLabel(status)}`}
                />
              ))}
            </div>
          ))}
          {/* Legend */}
          <div className="flex items-center gap-3 mt-2 pl-10">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-green-500/70 inline-block" /><span className="text-[10px] text-text-secondary">Up</span></span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-yellow-500/70 inline-block" /><span className="text-[10px] text-text-secondary">Partial</span></span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-500/70 inline-block" /><span className="text-[10px] text-text-secondary">Down</span></span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-border/30 inline-block" /><span className="text-[10px] text-text-secondary">No data</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Incident Timeline

export function UptimeComparisonChart({ widget, extra }: WidgetProps) {
  if (isNoConfig(extra.widgetDataById?.[widget.id])) return <NoConfigPlaceholder label="Uptime Comparison" />;
  const raw = extra.widgetDataById?.[widget.id] as {
    monitors: { id: string; name: string; uptimePct: number }[];
    periodDays: number;
  } | undefined;

  const title = (widget.config.label as string) || "Uptime Comparison";

  if (!raw || !raw.monitors?.length) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-sm text-text-secondary text-center">
        No data available
      </div>
    );
  }

  const { monitors: monitorBars, periodDays } = raw;

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="text-xs text-text-secondary">{periodDays}d</div>
      </div>
      <div className="space-y-2">
        {monitorBars.map((m) => {
          const barColor =
            m.uptimePct >= 99.9
              ? "bg-green-500"
              : m.uptimePct >= 99
              ? "bg-yellow-400"
              : "bg-red-500";
          const pctLabel = m.uptimePct.toFixed(2);
          const cappedWidth = Math.min(m.uptimePct, 96);
          return (
            <div key={m.id} className="flex items-center gap-2">
              <div className="w-28 flex-shrink-0 text-xs text-text-secondary truncate text-right">{m.name}</div>
              <div className="flex-1 h-4 rounded bg-white/5 relative">
                <div
                  className={`h-full rounded ${barColor} transition-all`}
                  style={{ width: `${cappedWidth}%` }}
                />
              </div>
              <div className="w-14 flex-shrink-0 text-xs font-mono text-text-primary text-right">{pctLabel}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Next Maintenance Countdown ───────────────────────────────────────────

