// Widget renderer components for public status pages.
// All widgets receive widget config + live monitor data from the API.

import React from "react";
import { CheckCircle2, AlertCircle, XCircle, Activity } from "lucide-react";
import { SubscriberFormWidget } from "./SubscriberFormWidget";
import { CountdownWidget } from "./CountdownWidget";
import { AnnouncementBarClient } from "./AnnouncementBarClient";
import { RssFeedCopyButton } from "./RssFeedCopyButton";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";
import { OfflineBannerWidget } from "./OfflineBannerWidget";
import { CustomMetricChart } from "./CustomMetricChart";
import { AnimatedNumber, AnimatedUptimeCard } from "./AnimatedWidgets";

export interface MonitorSummary {
  id: string;
  name: string;
  type: string;
  level: "green" | "yellow" | "red";
  lastChecked: string | null;
  latencyMs: number | null;
  message: string | null;
  folderId?: string | null;
  folderName?: string | null;
  tags?: string[];
}

export interface Widget {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: {
    monitorId?: string;
    monitorIds?: string[];
    label?: string;
    periodDays?: number;
    text?: string;
    [key: string]: unknown;
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Returns true if the API indicated this widget has no monitor configured. */
function isNoConfig(data: unknown): boolean {
  return typeof data === 'object' && data !== null && '_noConfig' in data && (data as Record<string, unknown>)._noConfig === true;
}

/** Shown on the public page when a widget has no monitor configured. */
function NoConfigPlaceholder({ label: _label }: { label: string }) {
  return (
    <div className="rounded-2xl bg-surface border border-border p-4 flex items-center gap-2 text-text-secondary text-sm">
      <span className="opacity-40">◌</span>
      <span>Not configured</span>
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function levelLabel(level: "green" | "yellow" | "red"): string {
  return level === "green" ? "Operational" : level === "yellow" ? "Degraded" : "Outage";
}

function LevelBadge({ level }: { level: "green" | "yellow" | "red" }) {
  const cls =
    level === "green"
      ? "bg-green-500/15 text-green-400 ring-green-500/30"
      : level === "yellow"
      ? "bg-yellow-500/15 text-yellow-400 ring-yellow-500/30"
      : "bg-red-500/15 text-red-400 ring-red-500/30";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          level === "green" ? "bg-green-400" : level === "yellow" ? "bg-yellow-400" : "bg-red-400"
        }`}
      />
      {levelLabel(level)}
    </span>
  );
}

/**
 * Consistent card wrapper for all status-page widgets.
 * Provides: rounded border, surface bg, optional header row, hover state.
 */
function WidgetCard({
  title,
  meta,
  badge,
  children,
  className = "",
  headerClassName = "",
  accentColor,
}: {
  title?: string;
  meta?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  accentColor?: "green" | "yellow" | "red" | "blue" | "none";
}) {
  const borderMap = {
    green: "border-green-500/25",
    yellow: "border-yellow-500/25",
    red: "border-red-500/25",
    blue: "border-blue-500/25",
    none: "border-border",
    undefined: "border-border",
  };
  const border = borderMap[accentColor ?? "undefined"] ?? "border-border";
  const hasHeader = title ?? meta ?? badge;
  return (
    <div className={`rounded-2xl border ${border} bg-surface transition-colors hover:border-border-hover overflow-hidden ${className}`}>
      {hasHeader && (
        <div className={`flex items-center gap-2 px-4 py-2.5 border-b border-border/40 ${headerClassName}`}>
          {title && (
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider truncate flex-1">
              {title}
            </span>
          )}
          {meta && <span className="text-xs text-text-muted ml-auto flex-shrink-0">{meta}</span>}
          {badge && <span className="flex-shrink-0">{badge}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/** Compact status dot — green/yellow/red with optional pulse */
function StatusDot({ level, pulse = false }: { level: "green" | "yellow" | "red" | "no-data"; pulse?: boolean }) {
  const colorMap: Record<string, string> = {
    green: "bg-green-400",
    yellow: "bg-yellow-400",
    red: "bg-red-400",
    "no-data": "bg-border",
  };
  return (
    <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
      {pulse && level !== "no-data" && (
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${colorMap[level]}`} />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${colorMap[level]}`} />
    </span>
  );
}

/** Severity badge for incidents */
function SeverityBadge({ severity }: { severity: string }) {
  const s = severity.toUpperCase();
  const cls =
    s === "CRITICAL" ? "bg-red-500/15 text-red-400 ring-red-500/30"
    : s === "HIGH" ? "bg-orange-500/15 text-orange-400 ring-orange-500/30"
    : s === "MEDIUM" ? "bg-yellow-500/15 text-yellow-400 ring-yellow-500/30"
    : "bg-blue-500/15 text-blue-400 ring-blue-500/30";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 uppercase tracking-wide ${cls}`}>
      {s}
    </span>
  );
}

/** Trend arrow for numeric deltas */
function TrendArrow({
  trend,
  positiveIsGood = true,
  delta,
  unit = "",
}: {
  trend: "up" | "down" | "flat";
  positiveIsGood?: boolean;
  delta?: number;
  unit?: string;
}) {
  if (trend === "flat") return null;
  const isGood = (trend === "up") === positiveIsGood;
  const color = isGood ? "text-green-400" : "text-red-400";
  const arrow = trend === "up" ? "↑" : "↓";
  const deltaStr = delta !== undefined ? `${Math.abs(delta).toFixed(2)}${unit}` : "";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {arrow} {deltaStr}
    </span>
  );
}

// ── Widget Components ────────────────────────────────────────────────────

interface ExtraData {
  incidents: Array<{
    id: string; title: string; status: string; severity: string;
    createdAt: string; resolvedAt: string | null;
    updates: { id: string; message: string; status: string; createdAt: string }[];
    monitors: { id: string; name: string }[];
  }>;
  maintenance: Array<{
    id: string; name: string; description: string | null;
    startsAt: string; endsAt: string;
    monitors: { id: string; name: string }[];
  }>;
  recentChecks: Array<{
    id: string; monitorId: string; monitorName: string;
    checkedAt: string; ok: boolean; level: string;
    latencyMs: number | null; message: string | null;
  }>;
  widgetDataById: Record<string, unknown>;
}

interface WidgetProps {
  widget: Widget;
  monitors: MonitorSummary[];
  extra: ExtraData;
}

// Overall System Status — hero banner
export function OverallSystemStatus({ monitors }: WidgetProps) {
  const hasRed = monitors.some((m) => m.level === "red");
  const hasYellow = monitors.some((m) => m.level === "yellow");
  const level: "green" | "yellow" | "red" = hasRed ? "red" : hasYellow ? "yellow" : "green";

  const degradedCount = monitors.filter((m) => m.level === "yellow").length;
  const outageCount = monitors.filter((m) => m.level === "red").length;
  const affectedCount = degradedCount + outageCount;
  const operationalCount = monitors.filter((m) => m.level === "green").length;

  const config = {
    green: {
      label: "All Systems Operational",
      subLabel: monitors.length > 0 ? `${monitors.length} monitor${monitors.length !== 1 ? "s" : ""} online` : null,
      bg: "bg-green-500/10 border-green-500/20",
      text: "text-green-400",
      subText: "text-green-400/60",
      dot: "bg-green-400",
    },
    yellow: {
      label: "Partial Degradation",
      subLabel: `${affectedCount} monitor${affectedCount !== 1 ? "s" : ""} degraded`,
      bg: "bg-yellow-500/10 border-yellow-500/20",
      text: "text-yellow-400",
      subText: "text-yellow-400/70",
      dot: "bg-yellow-400",
    },
    red: {
      label: "Major Outage",
      subLabel: `${outageCount} monitor${outageCount !== 1 ? "s" : ""} down${degradedCount > 0 ? `, ${degradedCount} degraded` : ""}`,
      bg: "bg-red-500/10 border-red-500/20",
      text: "text-red-400",
      subText: "text-red-400/70",
      dot: "bg-red-400",
    },
  }[level];

  return (
    <div
      className={`flex items-center gap-5 rounded-2xl border p-6 ${config.bg}`}
      role="status"
      aria-label={`System status: ${config.label}. ${operationalCount} of ${monitors.length} services operational.`}
      aria-live="polite"
    >
      {level === "green" ? (
        <CheckCircle2 className="h-8 w-8 shrink-0 text-green-400" aria-hidden="true" />
      ) : (
        <span className="relative flex h-7 w-7 shrink-0" aria-hidden="true">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${config.dot}`} />
          <span className={`relative inline-flex h-7 w-7 rounded-full animate-pulse ${config.dot}`} />
        </span>
      )}
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className={`text-2xl font-bold leading-tight ${config.text}`}>{config.label}</span>
        {config.subLabel && (
          <span className={`text-sm font-medium ${config.subText}`}>{config.subLabel}</span>
        )}
      </div>
      <span className="ml-auto shrink-0 text-sm font-semibold text-text-secondary" aria-label={`${operationalCount} of ${monitors.length} services operational`}>
        {operationalCount}<span className="text-text-muted">/{monitors.length}</span>
      </span>
    </div>
  );
}

// Current Status Badge — single monitor
export function CurrentStatusBadge({ widget, monitors }: WidgetProps) {
  // Support single monitorId or multiple monitorIds
  const ids = widget.config.monitorIds as string[] | undefined;
  const singleId = widget.config.monitorId as string | undefined;
  const selected = ids?.length
    ? monitors.filter(m => ids.includes(m.id))
    : singleId
      ? monitors.filter(m => m.id === singleId)
      : monitors.slice(0, 1);

  if (selected.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <span className="text-sm text-text-secondary">No monitor selected</span>
      </div>
    );
  }

  // Single monitor — detailed badge
  if (selected.length === 1) {
    const monitor = selected[0];
    return (
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
        <div>
          <p className="font-medium text-text-primary">{widget.config.label ?? monitor.name}</p>
          {monitor.lastChecked && (
            <p className="mt-0.5 text-xs text-text-secondary">Checked {formatRelative(monitor.lastChecked)}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <LevelBadge level={monitor.level} />
          {monitor.latencyMs !== null && (
            <span className="text-xs tabular-nums text-text-secondary">{monitor.latencyMs}ms</span>
          )}
        </div>
      </div>
    );
  }

  // Multiple monitors — compact list
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {widget.config.label && <p className="text-sm font-semibold text-text-primary mb-2">{widget.config.label as string}</p>}
      <div className="space-y-1.5">
        {selected.map(m => (
          <div key={m.id} className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full flex-shrink-0 ${m.level === "green" ? "bg-success" : m.level === "yellow" ? "bg-warning" : "bg-danger"}`} aria-hidden="true" />
            <span className="text-sm text-text-primary flex-1 truncate">{m.name}</span>
            {m.latencyMs !== null && <span className="text-xs font-mono text-text-secondary">{m.latencyMs}ms</span>}
            <LevelBadge level={m.level} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Multi-Monitor Status Grid
export function MultiMonitorStatusGrid({ monitors }: WidgetProps) {
  const downCount = monitors.filter(m => m.level === "red").length;
  const degradedCount = monitors.filter(m => m.level === "yellow").length;
  const metaText = downCount > 0 ? `${downCount} down` : degradedCount > 0 ? `${degradedCount} degraded` : `${monitors.length} operational`;
  const accentColor = downCount > 0 ? "red" : degradedCount > 0 ? "yellow" : "green";

  if (monitors.length === 0) {
    return (
      <WidgetCard title="Monitor Status">
        <div className="px-4 py-6 text-center text-sm text-text-secondary">No monitors configured</div>
      </WidgetCard>
    );
  }
  return (
    <WidgetCard title="Monitor Status" meta={metaText} accentColor={accentColor}>
      <div className="p-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {monitors.map((m) => (
          <div key={m.id} className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-surface-elevated/20 hover:bg-surface-elevated/40 px-3 py-2 transition-colors">
            <StatusDot level={m.level} pulse={m.level === "red"} />
            <span className="truncate text-sm font-medium text-text-primary flex-1">{m.name}</span>
            {m.latencyMs !== null && (
              <span className="text-xs text-text-muted tabular-nums flex-shrink-0">{m.latencyMs}ms</span>
            )}
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}

// Active Incident Banner
export function ActiveIncidentBanner({ monitors, extra }: WidgetProps) {
  const activeIncidents = extra.incidents.filter(i => i.status !== "resolved");
  const down = monitors.filter((m) => m.level === "red");

  if (activeIncidents.length === 0 && down.length === 0) {
    return (
      <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-4 flex items-center gap-3" role="status" aria-label="All systems operational — no active incidents" aria-live="polite">
        <span className="h-3 w-3 rounded-full bg-success" aria-hidden="true" />
        <span className="text-sm font-medium text-success">All systems operational — no active incidents</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5" role="alert" aria-live="assertive" aria-label={`Active incidents: ${activeIncidents.length + down.length}`}>
      <p className="mb-3 font-semibold text-red-400"><span aria-hidden="true">🔴 </span>Active Incident{(activeIncidents.length + down.length) > 1 ? "s" : ""}</p>
      <ul className="space-y-2">
        {activeIncidents.map((i) => (
          <li key={i.id} className="flex items-start gap-2 text-sm">
            <span className="mt-1 h-2 w-2 rounded-full bg-red-400 animate-pulse flex-shrink-0" />
            <div>
              <span className="font-medium text-text-primary">{i.title}</span>
              <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${i.severity === "critical" ? "bg-danger/15 text-danger" : "bg-warning/15 text-warning"}`}>{i.severity}</span>
              {i.monitors.length > 0 && <p className="text-xs text-text-secondary">Affected: {i.monitors.map(m => m.name).join(", ")}</p>}
              {i.updates[0] && <p className="text-xs text-text-secondary mt-0.5">{i.updates[0].message}</p>}
            </div>
          </li>
        ))}
        {down.filter(m => !activeIncidents.some(i => i.monitors.some(im => im.id === m.id))).map((m) => (
          <li key={m.id} className="flex items-center gap-2 text-sm text-text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            {m.name}
            {m.message && <span className="text-xs text-text-secondary"> — {m.message}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Uptime Bar — simplified stat
export function UptimeBar({ widget, monitors, extra }: WidgetProps) {
  if (isNoConfig(extra.widgetDataById[widget.id])) return <NoConfigPlaceholder label="Uptime Bar" />;
  const monitor = monitors.find((m) => m.id === widget.config.monitorId) ?? monitors[0];
  const widgetData = extra.widgetDataById[widget.id] as {
    uptimePct?: number;
    periodDays?: number;
    total?: number;
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
        {typeof widgetData?.total === "number" && (
          <p className="text-xs text-text-secondary tabular-nums">Based on {widgetData.total.toLocaleString()} checks</p>
        )}
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
          {days}-day history{uptimePct !== null ? ` · ${uptimePct}% up` : ""}
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
export function SLASummary({ widget, monitors, extra }: WidgetProps) {
  if (isNoConfig(extra.widgetDataById[widget.id])) return <NoConfigPlaceholder label="SLA Summary" />; 
  const monitor = monitors.find((m) => m.id === widget.config.monitorId) ?? monitors[0];
  const label = widget.config.label ?? monitor?.name ?? "SLA";

  const widgetData = extra.widgetDataById[widget.id] as {
    uptimePct?: number;
    periodDays?: number;
    slaTarget?: number;
    total?: number;
    up?: number;
    down?: number;
    pass?: boolean;
    allowedDownMinutes?: number;
    remainingDownMinutes?: number;
  } | undefined;

  const periodDays = widgetData?.periodDays ?? (widget.config.periodDays as number) ?? 30;
  const target = widgetData?.slaTarget ?? (widget.config.slaTarget as number) ?? 99.9;
  const actual = widgetData?.uptimePct ?? (
    !monitor ? 100 : monitor.level === "green" ? 100 : monitor.level === "yellow" ? 95.0 : 80.0
  );
  const pass = widgetData?.pass ?? (actual >= target);
  const totalChecks = widgetData?.total ?? null;
  const remainingDownMin = widgetData?.remainingDownMinutes ?? null;
  const allowedDownMin = widgetData?.allowedDownMinutes ?? null;


  function formatMinutes(min: number): string {
    if (min < 1) return `${Math.round(min * 60)}s`;
    if (min < 60) return `${Math.round(min)}m`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  // Progress bar: how much of the allowed downtime budget is used
  const budgetUsed = allowedDownMin !== null && remainingDownMin !== null && allowedDownMin > 0
    ? Math.min(100, Math.round(((allowedDownMin - remainingDownMin) / allowedDownMin) * 100))
    : null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-primary truncate">{label}</p>
        <span
          className={`shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold tracking-wide ${
            pass
              ? "bg-green-500/20 text-green-400 ring-1 ring-green-500/30"
              : "bg-red-500/20 text-red-400 ring-1 ring-red-500/30"
          }`}
        >
          {pass ? "✓ SLA Met" : "✗ SLA Breached"}
        </span>
      </div>
      {/* Big number + target */}
      <div className="flex items-end gap-5 mb-4">
        <div>
          <p className={`text-4xl font-bold tabular-nums leading-none ${pass ? "text-green-400" : "text-red-400"}`}>
            <AnimatedNumber value={actual} decimals={2} duration={1200} suffix="%" />
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            Actual uptime · {periodDays}d{totalChecks !== null ? ` · ${totalChecks.toLocaleString()} checks` : ""}
          </p>
        </div>
        <div className="pb-0.5 border-l border-border pl-5">
          <p className="text-2xl font-semibold tabular-nums text-text-secondary">{target}%</p>
          <p className="text-xs text-text-secondary">SLA target</p>
        </div>
      </div>
      {/* Downtime budget bar */}
      {budgetUsed !== null && allowedDownMin !== null && (
        <div>
          <div className="flex justify-between text-[10px] text-text-secondary mb-1">
            <span>Downtime budget used</span>
            <span className="tabular-nums">{budgetUsed}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-bg">
            <div
              className={`h-full rounded-full transition-all ${budgetUsed >= 90 ? "bg-red-400" : budgetUsed >= 60 ? "bg-yellow-400" : "bg-green-400"}`}
              style={{ width: `${budgetUsed}%` }}
            />
          </div>
          {remainingDownMin !== null && (
            <p className="mt-1 text-[10px] text-text-secondary text-right tabular-nums">
              {formatMinutes(remainingDownMin)} remaining of {formatMinutes(allowedDownMin)} allowed
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Response Time Chart — real SVG sparkline from MonitorRun latencyMs values
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
export function IncidentHistory({ extra }: WidgetProps) {
  const incidents = extra.incidents;
  const active = incidents.filter(i => i.status !== "resolved");
  const resolved = incidents.filter(i => i.status === "resolved");
  const accentColor = active.length > 0 ? "red" : "green";

  return (
    <WidgetCard
      title="Incident History"
      meta={`${incidents.length} total`}
      accentColor={accentColor}
    >
      <div className="p-4">
      {incidents.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl bg-green-500/8 border border-green-500/20 px-4 py-3">
          <StatusDot level="green" />
          <span className="text-sm font-medium text-green-400">No incidents in the last 30 days</span>
        </div>
      ) : (
        <div className="space-y-4">
          {active.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="h-1.5 w-1.5 rounded-full bg-danger animate-pulse" />
                <p className="text-[10px] font-bold text-danger uppercase tracking-widest">Active</p>
              </div>
              {active.map(i => (
                <div key={i.id} className="rounded-xl bg-danger/5 border border-danger/25 px-3 py-3">
                  <div className="flex items-start gap-2 flex-wrap">
                    <StatusDot level="red" pulse />
                    <span className="text-sm font-semibold text-text-primary flex-1">{i.title}</span>
                    <SeverityBadge severity={i.severity} />
                    <span className="text-xs text-text-muted w-full sm:w-auto sm:ml-auto pl-4 sm:pl-0">{formatRelative(i.createdAt)}</span>
                  </div>
                  {i.monitors.length > 0 && (
                    <p className="text-xs text-text-secondary mt-2 pl-4">
                      <span className="font-medium">Affected:</span> {i.monitors.map(m => m.name).join(", ")}
                    </p>
                  )}
                  {i.updates[0] && (
                    <p className="text-xs text-text-secondary mt-1.5 pl-4 italic">{i.updates[0].message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {resolved.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                <p className="text-[10px] font-bold text-success uppercase tracking-widest">Resolved</p>
              </div>
              {resolved.slice(0, 5).map(i => (
                <div key={i.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-elevated/20 hover:bg-surface-elevated/40 transition-colors">
                  <span className="h-2 w-2 rounded-full bg-success/60 flex-shrink-0" />
                  <span className="text-sm text-text-primary flex-1 truncate">{i.title}</span>
                  <SeverityBadge severity={i.severity} />
                  <span className="text-xs text-text-muted flex-shrink-0">{formatRelative(i.resolvedAt ?? i.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </WidgetCard>
  );
}

// Text Block
export function TextBlock({ widget }: WidgetProps) {
  const text = (widget.config.text as string) ?? "";
  const label = widget.config.label as string | undefined;
  if (!text && !label) return null;
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {label && <p className="mb-2 text-sm font-semibold text-text-primary">{label}</p>}
      {text && <p className="whitespace-pre-wrap text-sm text-text-secondary">{text}</p>}
    </div>
  );
}

// Scheduled Maintenance — real maintenance windows from API
export function ScheduledMaintenance({ extra }: WidgetProps) {
  const windows = extra.maintenance;
  const now = Date.now();

  if (windows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <span className="text-success">🔧</span>
          <p className="text-sm font-semibold text-text-primary">Scheduled Maintenance</p>
        </div>
        <p className="mt-2 text-sm text-text-secondary">No upcoming maintenance scheduled</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-yellow-400">🔧</span>
        <p className="text-sm font-semibold text-yellow-400">Scheduled Maintenance</p>
      </div>
      {windows.map(mw => {
        const start = new Date(mw.startsAt).getTime();
        const end = new Date(mw.endsAt).getTime();
        const isActive = now >= start && now <= end;
        const isUpcoming = now < start;
        return (
          <div key={mw.id} className={`rounded-lg px-3 py-2.5 ${isActive ? "bg-warning/10 border border-warning/20" : "bg-surface-elevated/30"}`}>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${isActive ? "bg-warning animate-pulse" : "bg-text-secondary/40"}`} />
              <span className="text-sm font-medium text-text-primary">{mw.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isActive ? "bg-warning/15 text-warning" : "bg-surface-elevated text-text-secondary"}`}>
                {isActive ? "In Progress" : isUpcoming ? "Upcoming" : "Completed"}
              </span>
            </div>
            {mw.description && <p className="mt-1 text-xs text-text-secondary">{mw.description}</p>}
            <p className="mt-1 text-xs text-text-muted">
              {new Date(mw.startsAt).toLocaleString()} — {new Date(mw.endsAt).toLocaleString()}
            </p>
            {mw.monitors.length > 0 && <p className="mt-1 text-xs text-text-secondary">Affected: {mw.monitors.map(m => m.name).join(", ")}</p>}
          </div>
        );
      })}
    </div>
  );
}

// Divider
export function Divider() {
  return <hr className="border-border my-2" />;
}

// ── New P1 Widgets ───────────────────────────────────────────────────────

// Component Status List — per-component status: Operational / Degraded / Partial Outage / Major Outage
function ComponentStatusList({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    components: Array<{
      id: string; name: string; type: string;
      status: string; level: "green" | "yellow" | "red";
      lastChecked: string | null; latencyMs: number | null;
    }>;
    overallStatus: string;
    total: number;
    downCount: number;
    degradedCount: number;
  } | undefined;

  const label = widget.config.label as string | undefined;

  const overallLabel = (s: string) =>
    s === "major-outage" ? "Major Outage"
    : s === "partial-outage" ? "Partial Outage"
    : s === "degraded" ? "Degraded"
    : "All Systems Operational";

  const overallColor = (s: string) =>
    s === "major-outage" ? "text-red-400"
    : s === "partial-outage" || s === "degraded" ? "text-yellow-400"
    : "text-green-400";

  const overallBorder = (s: string) =>
    s === "major-outage" ? "border-red-500/30"
    : s === "partial-outage" || s === "degraded" ? "border-yellow-500/30"
    : "border-green-500/30";

  const overallBg = (s: string) =>
    s === "major-outage" ? "bg-red-500/5"
    : s === "partial-outage" || s === "degraded" ? "bg-yellow-500/5"
    : "bg-green-500/5";

  const componentStatus = (status: string) =>
    status === "major-outage" ? "Major Outage"
    : status === "partial-outage" ? "Partial Outage"
    : status === "degraded" ? "Degraded"
    : "Operational";

  const componentColor = (status: string) =>
    status === "major-outage" ? "text-red-400"
    : status === "degraded" ? "text-yellow-400"
    : "text-green-400";

  const dotColor = (level: string) =>
    level === "red" ? "bg-danger animate-pulse"
    : level === "yellow" ? "bg-warning"
    : "bg-success";

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
        <p className="text-sm text-text-secondary text-center py-4">Loading component status...</p>
      </div>
    );
  }

  const headerLabel = label ?? overallLabel(data.overallStatus);
  return (
    <div
      className={`rounded-xl border ${overallBorder(data.overallStatus)} ${overallBg(data.overallStatus)} overflow-hidden`}
      role="region"
      aria-label={`${headerLabel}: ${data.total} components, ${data.downCount} down, ${data.degradedCount} degraded`}
    >
      {/* Overall header */}
      <div className="px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${dotColor(data.downCount > 0 ? "red" : data.degradedCount > 0 ? "yellow" : "green")}`} aria-hidden="true" />
          <span className={`text-sm font-bold ${overallColor(data.overallStatus)}`}>
            {headerLabel}
          </span>
        </div>
      </div>
      {/* Component rows */}
      <ul className="divide-y divide-border/30" role="list" aria-label="Component list">
        {data.components.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-2.5" aria-label={`${c.name}: ${componentStatus(c.status)}${c.latencyMs !== null ? `, ${c.latencyMs}ms` : ""}`}>
            <div className={`h-2 w-2 rounded-full flex-shrink-0 ${dotColor(c.level)}`} aria-hidden="true" />
            <span className="text-sm text-text-primary flex-1 truncate">{c.name}</span>
            {c.latencyMs !== null && (
              <span className="text-xs font-mono text-text-secondary" aria-label={`${c.latencyMs} milliseconds`}>{c.latencyMs}ms</span>
            )}
            <span className={`text-xs font-medium ${componentColor(c.status)}`}>
              {componentStatus(c.status)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Rolling Uptime Cards — row of cards: 24h / 7d / 30d / 90d uptime%
function RollingUptimeCards({ widget, extra }: WidgetProps) {
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
      {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {data.cards.map((c) => (
          <AnimatedUptimeCard key={c.label} card={c} uptimeColor={uptimeColor} uptimeBg={uptimeBg} uptimeBorder={uptimeBorder} />
        
        ))}
      </div>
    </div>
  );
}

// Status History Ribbon — per monitor: last N days as horizontal colored bar (like GitHub status)
function StatusHistoryRibbon({ widget, extra }: WidgetProps) {
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
      {label && <p className="text-sm font-semibold text-text-primary">{label}</p>}
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
function UptimePercentageCard({ widget, extra }: WidgetProps) {
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
      {label && <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">{label}</p>}
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
function ServiceHealthMatrix({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    mode: "auto" | "manual";
    columns: string[];
    matrix: Array<{
      rowId: string;
      rowName: string;
      cells: Array<{ colLabel: string; level: string; latencyMs: number | null; lastChecked: unknown }>;
    }>;
  } | undefined;

  const label = widget.config.label as string | undefined;

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  if (data.matrix.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
        <p className="text-sm text-text-secondary text-center py-4">No monitors configured</p>
      </div>
    );
  }

  const cellBg = (level: string) =>
    level === "green" ? "bg-green-500/15 text-green-400"
    : level === "yellow" ? "bg-yellow-500/15 text-yellow-400"
    : level === "red" ? "bg-red-500/15 text-red-400"
    : "bg-border/20 text-text-muted";

  const cellDot = (level: string) =>
    level === "green" ? "bg-green-400"
    : level === "yellow" ? "bg-yellow-400"
    : level === "red" ? "bg-red-400 animate-pulse"
    : "bg-border";

  const cellLabel = (level: string) =>
    level === "green" ? "Operational"
    : level === "yellow" ? "Degraded"
    : level === "red" ? "Outage"
    : "No data";

  return (
    <div className="rounded-xl border border-border bg-surface p-4 overflow-x-auto">
      {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
      <table className="w-full text-xs border-collapse" aria-label={label ?? "Service health matrix"}>
        <thead>
          <tr>
            <th scope="col" className="text-left py-2 pr-4 text-text-secondary font-medium w-40">Service</th>
            {data.columns.map((col) => (
              <th key={col} scope="col" className="text-center py-2 px-2 text-text-secondary font-medium min-w-[100px]">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {data.matrix.map((row) => (
            <tr key={row.rowId} className="group">
              <td className="py-2.5 pr-4 font-medium text-text-primary truncate max-w-[160px]" title={row.rowName}>
                {row.rowName}
              </td>
              {row.cells.map((cell, ci) => (
                <td key={ci} className="py-2.5 px-2 text-center">
                  <div
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${cellBg(cell.level)}`}
                    title={cell.latencyMs ? `${cell.latencyMs}ms` : undefined}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${cellDot(cell.level)}`} />
                    <span>{cellLabel(cell.level)}</span>
                    {cell.latencyMs && <span className="text-[10px] opacity-70">{cell.latencyMs}ms</span>}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3 pt-3 border-t border-border/30 mt-2">
        <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-green-400" /><span className="text-[10px] text-text-muted">Operational</span></div>
        <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-yellow-400" /><span className="text-[10px] text-text-muted">Degraded</span></div>
        <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-red-400" /><span className="text-[10px] text-text-muted">Outage</span></div>
      </div>
    </div>
  );
}

// Aggregate Health Score — weighted score 0-100 with gauge visualization
function AggregateHealthScore({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    score: number;
    total: number;
    down: number;
    degraded: number;
    status: "healthy" | "degraded" | "critical";
    breakdown: Array<{ id: string; name: string; level: string; points: number; weight: number }>;
  } | undefined;

  const label = widget.config.label as string | undefined;
  const showBreakdown = widget.config.showBreakdown as boolean | undefined;

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  const scoreColor = data.score >= 90 ? "text-green-400" : data.score >= 70 ? "text-yellow-400" : "text-red-400";
  const scoreStroke = data.score >= 90 ? "#4ade80" : data.score >= 70 ? "#facc15" : "#f87171";
  const statusLabel = data.status === "healthy" ? "All Systems Healthy" : data.status === "degraded" ? "Degraded" : "Critical Issues";
  const statusColor = data.status === "healthy" ? "text-green-400" : data.status === "degraded" ? "text-yellow-400" : "text-red-400";

  // SVG gauge: arc from -225deg to +45deg (270deg sweep)
  const r = 52;
  const cx = 70;
  const cy = 70;
  const circumference = 2 * Math.PI * r;
  const sweep = (data.score / 100) * (270 / 360) * circumference;
  const dashArray = `${sweep} ${circumference}`;
  // -225deg start = 135deg in SVG coords
  const startAngle = 135 * (Math.PI / 180);
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {label && <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3 text-center">{label}</p>}
      <div className="flex items-center gap-6">
        {/* Gauge */}
        <div className="relative flex-shrink-0">
          <svg width="140" height="140" viewBox="0 0 140 140" className="rotate-0" role="img" aria-label={`Health score: ${Math.round(data.score)} out of 100 — ${statusLabel}`}>
            <title>{`Health score: ${Math.round(data.score)}/100 — ${statusLabel}`}</title>
            {/* Track arc */}
            <circle
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="10"
              strokeDasharray={`${(270 / 360) * circumference} ${circumference}`}
              strokeDashoffset={0}
              strokeLinecap="round"
              transform={`rotate(135 ${cx} ${cy})`}
            />
            {/* Score arc */}
            <circle
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={scoreStroke}
              strokeWidth="10"
              strokeDasharray={dashArray}
              strokeDashoffset={0}
              strokeLinecap="round"
              transform={`rotate(135 ${cx} ${cy})`}
              style={{ transition: "stroke-dasharray 0.8s ease" }}
            />
            {/* Score text */}
            <text x={cx} y={cy - 4} textAnchor="middle" className="fill-current" style={{ fill: scoreStroke, fontSize: 26, fontWeight: 700, fontFamily: "inherit" }}>
              {Math.round(data.score)}
            </text>
            <text x={cx} y={cy + 14} textAnchor="middle" style={{ fill: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: "inherit" }}>
              /100
            </text>
          </svg>
        </div>
        {/* Stats */}
        <div className="flex-1 space-y-2">
          <div className={`text-sm font-semibold ${statusColor}`}>{statusLabel}</div>
          <div className="text-xs text-text-secondary">{data.total} monitor{data.total !== 1 ? "s" : ""} tracked</div>
          {data.down > 0 && (
            <div className="text-xs text-red-400 font-medium">{data.down} down</div>
          )}
          {data.degraded > 0 && (
            <div className="text-xs text-yellow-400 font-medium">{data.degraded} degraded</div>
          )}
          {data.down === 0 && data.degraded === 0 && (
            <div className="text-xs text-green-400 font-medium">All operational ✓</div>
          )}
        </div>
      </div>
      {showBreakdown && data.breakdown.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/30 space-y-1.5">
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium mb-2">Breakdown</p>
          {data.breakdown.map((b) => (
            <div key={b.id} className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full flex-shrink-0 ${b.level === "green" ? "bg-green-400" : b.level === "yellow" ? "bg-yellow-400" : "bg-red-400"}`} />
              <span className="text-xs text-text-primary flex-1 truncate">{b.name}</span>
              <span className={`text-xs font-medium ${b.level === "green" ? "text-green-400" : b.level === "yellow" ? "text-yellow-400" : "text-red-400"}`}>{b.points}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── New P1 Widgets (latency, downtime, incidents, MTTR/MTTF) ─────────────

// LatencyPercentilesCard — P50/P95/P99 big-number display with trend arrows
function LatencyPercentilesCard({ widget, extra }: WidgetProps) {
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
      meta={`${data.sampleCount.toLocaleString()} samples · ${data.periodDays}d`}
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
function DowntimeLog({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    outages: Array<{
      monitorId: string;
      monitorName: string;
      startedAt: string;
      resolvedAt: string | null;
      durationMs: number | null;
      message: string | null;
    }>;
    total: number;
    periodDays: number;
  } | undefined;

  const label = widget.config.label as string | undefined;

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-text-secondary text-center py-4">Loading...</p>
      </div>
    );
  }

  function formatDur(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">{label ?? "Downtime Log"}</p>
        <span className="text-xs text-text-secondary">{data.total} event{data.total !== 1 ? "s" : ""} · {data.periodDays}d</span>
      </div>
      {data.outages.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-6 justify-center">
          <span className="h-3 w-3 rounded-full bg-green-400" />
          <span className="text-sm text-green-400 font-medium">No downtime recorded</span>
        </div>
      ) : (
        <ul className="divide-y divide-border/40 max-h-80 overflow-y-auto">
          {data.outages.map((o, i) => {
            const ongoing = o.resolvedAt === null;
            return (
              <li
                key={i}
                className={`flex items-start gap-3 px-4 py-3 ${ongoing ? "border-l-2 border-red-500" : ""}`}
              >
                <span
                  className={`mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                    ongoing ? "bg-red-400 animate-pulse" : "bg-red-400/60"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text-primary truncate">{o.monitorName}</span>
                    {o.durationMs !== null && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                        {formatDur(o.durationMs)}
                      </span>
                    )}
                    {ongoing && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                        Ongoing
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {new Date(o.startedAt).toLocaleString()}
                    {o.resolvedAt && ` → ${new Date(o.resolvedAt).toLocaleString()}`}
                  </p>
                  {o.message && <p className="text-xs text-text-muted mt-0.5 truncate">{o.message}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ActiveIncidentCount — animated big-number counter
function ActiveIncidentCount({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    count: number;
    incidents: Array<{ id: string; title: string; severity: string; status: string; createdAt: string }>;
  } | undefined;

  const label = widget.config.label as string | undefined;

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  const countColor =
    data.count === 0 ? "text-green-400" : data.count === 1 ? "text-yellow-400" : "text-red-400";
  const pulse = data.count > 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-6 text-center">
      {label && <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">{label ?? "Active Incidents"}</p>}
      <div className={`text-6xl font-bold tabular-nums ${countColor} ${pulse ? "animate-pulse" : ""}`}>
        {data.count}
      </div>
      <p className="text-xs text-text-secondary mt-2">Active Incidents</p>
      {data.count === 0 ? (
        <p className="mt-3 text-sm text-green-400 font-medium">All systems go ✓</p>
      ) : (
        <ul className="mt-3 space-y-1 text-left">
          {data.incidents.slice(0, 3).map((inc) => (
            <li key={inc.id} className="flex items-center gap-2 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0" />
              <span className="text-text-primary truncate">{inc.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// MttrMttfCards — MTTR + MTTF side-by-side cards
function MttrMttfCards({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    mttrMs: number | null;
    mttfMs: number | null;
    recoveryCount: number;
    failureCount: number;
    periodDays: number;
  } | undefined;

  const label = widget.config.label as string | undefined;

  function formatDuration(ms: number | null): string {
    if (ms === null) return "—";
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h${m % 60 > 0 ? ` ${m % 60}m` : ""}`;
  }

  if (!data) {
    return (
      <WidgetCard title={label ?? "MTTR / MTTF"}>
        <div className="px-4 py-8 text-center text-sm text-text-secondary">Loading...</div>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard title={label ?? "Reliability Metrics"} meta={`Last ${data.periodDays}d`}>
      <div className="p-4 grid grid-cols-2 gap-3">
        {/* MTTR */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-center">
          <p className="text-[10px] font-bold text-blue-400/70 uppercase tracking-widest mb-2">MTTR</p>
          <p className="text-3xl font-bold tabular-nums text-blue-400 leading-none">{formatDuration(data.mttrMs)}</p>
          <p className="text-[10px] text-text-muted mt-2 leading-tight">Mean Time<br/>to Recovery</p>
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-surface/60 px-2 py-0.5 text-[10px] text-text-secondary">
            {data.recoveryCount} event{data.recoveryCount !== 1 ? "s" : ""}
          </div>
        </div>
        {/* MTTF */}
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 text-center">
          <p className="text-[10px] font-bold text-purple-400/70 uppercase tracking-widest mb-2">MTTF</p>
          <p className="text-3xl font-bold tabular-nums text-purple-400 leading-none">{formatDuration(data.mttfMs)}</p>
          <p className="text-[10px] text-text-muted mt-2 leading-tight">Mean Time<br/>to Failure</p>
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-surface/60 px-2 py-0.5 text-[10px] text-text-secondary">
            {data.failureCount} event{data.failureCount !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}

// ── New P1 Status-Page Widgets ───────────────────────────────────────────

// SLA Compliance Table
function SLAComplianceTable({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    rows: Array<{ monitorId: string; name: string; target: number; actual: number; pass: boolean }>;
    periodDays: number;
    slaTarget: number;
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

  function actualColor(actual: number, target: number): string {
    const diff = actual - target;
    if (diff >= 0) return "text-green-400";
    if (diff >= -1) return "text-yellow-400";
    return "text-red-400";
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">
          {label ?? `SLA Compliance — Last ${data.periodDays}d`}
        </p>
        <span className="text-xs text-text-secondary">
          {data.rows.filter((r) => r.pass).length}/{data.rows.length} passing
        </span>
      </div>
      {data.rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-text-secondary">No monitors configured</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" aria-label={label ?? "SLA compliance table"}>
            <thead>
              <tr className="border-b border-border/30">
                <th scope="col" className="text-left px-4 py-2 text-text-secondary font-medium">Monitor</th>
                <th scope="col" className="text-right px-4 py-2 text-text-secondary font-medium">Target</th>
                <th scope="col" className="text-right px-4 py-2 text-text-secondary font-medium">Actual</th>
                <th scope="col" className="text-center px-4 py-2 text-text-secondary font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {data.rows.map((row) => (
                <tr key={row.monitorId} className="hover:bg-surface-elevated/20 transition-colors">
                  <td className="px-4 py-2.5 text-text-primary font-medium truncate max-w-[180px]">{row.name}</td>
                  <td className="px-4 py-2.5 text-right text-text-secondary tabular-nums">{row.target}%</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${actualColor(row.actual, row.target)}`}>
                    {row.actual.toFixed(2)}%
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {row.pass ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 text-green-400 ring-1 ring-green-500/30 px-2 py-0.5 text-xs font-semibold">
                        ✓ Pass
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-400 ring-1 ring-red-500/30 px-2 py-0.5 text-xs font-semibold">
                        ✗ Fail
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Uptime Heatmap — 7 days × 24 hours GitHub-style grid
function UptimeHeatmap({ widget, extra }: WidgetProps) {
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
      {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
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
function IncidentTimeline({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    incidents: Array<{
      id: string;
      title: string;
      status: string;
      severity: string;
      createdAt: string;
      resolvedAt: string | null;
      durationMs: number | null;
      updates: Array<{ id: string; message: string; status: string; createdAt: string }>;
      monitors: Array<{ id: string; name: string }>;
    }>;
    total: number;
    periodDays: number;
  } | undefined;

  const label = widget.config.label as string | undefined;

  function severityColor(s: string): string {
    if (s === "CRITICAL") return "bg-red-500/15 text-red-400 ring-red-500/30";
    if (s === "HIGH") return "bg-orange-500/15 text-orange-400 ring-orange-500/30";
    if (s === "MEDIUM") return "bg-yellow-500/15 text-yellow-400 ring-yellow-500/30";
    return "bg-blue-500/15 text-blue-400 ring-blue-500/30";
  }

  function statusIcon(s: string): string {
    if (s === "RESOLVED") return "✓";
    if (s === "MONITORING") return "◎";
    if (s === "IDENTIFIED") return "⚑";
    return "◉";
  }

  function formatDuration(ms: number): string {
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
        <p className="text-sm text-text-secondary text-center py-4">Loading...</p>
      </div>
    );
  }

  if (data.incidents.length === 0) {
    return (
      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-6 text-center">
        {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
        <span className="text-2xl">✓</span>
        <p className="text-sm text-green-400 font-medium mt-2">No incidents in the last {data.periodDays} days</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50">
        <p className="text-sm font-semibold text-text-primary">{label ?? "Incident Timeline"}</p>
        <p className="text-xs text-text-secondary mt-0.5">{data.total} incident{data.total !== 1 ? "s" : ""} · last {data.periodDays}d</p>
      </div>
      <div className="divide-y divide-border/30 max-h-[480px] overflow-y-auto">
        {data.incidents.map((inc) => (
          <div key={inc.id} className="p-4">
            {/* Incident header */}
            <div className="flex items-start gap-3 mb-3">
              <div className={`mt-0.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${inc.status !== "RESOLVED" ? "bg-red-400 animate-pulse" : "bg-green-400"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-text-primary">{inc.title}</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${severityColor(inc.severity)}`}>
                    {inc.severity}
                  </span>
                  {inc.durationMs !== null && (
                    <span className="text-[10px] text-text-secondary">{formatDuration(inc.durationMs)}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-text-secondary">{formatRelative(inc.createdAt)}</span>
                  {inc.monitors.length > 0 && (
                    <span className="text-xs text-text-secondary">· {inc.monitors.map((m) => m.name).join(", ")}</span>
                  )}
                </div>
              </div>
            </div>
            {/* Update timeline */}
            {inc.updates.length > 0 && (
              <div className="ml-5 pl-3 border-l border-border/40 space-y-2">
                {inc.updates.map((u) => (
                  <div key={u.id} className="flex items-start gap-2">
                    <span className="text-xs mt-0.5 text-text-secondary flex-shrink-0">{statusIcon(u.status)}</span>
                    <div className="min-w-0">
                      <span className="text-[10px] font-medium text-text-secondary uppercase tracking-wide">{u.status}</span>
                      <p className="text-xs text-text-primary mt-0.5">{u.message}</p>
                      <p className="text-[10px] text-text-muted mt-0.5">{formatRelative(u.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// SSL Certificate Status Widget
function SSLCertificateStatus({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    certs: Array<{
      monitorId: string;
      domain: string;
      daysRemaining: number | null;
      expiresAt: string | null;
      issuer: string | null;
      grade: string;
      status: "valid" | "expiring-soon" | "critical" | "expired" | "unknown";
      lastChecked: string | null;
    }>;
    total: number;
  } | undefined;

  const label = widget.config.label as string | undefined;

  function daysColor(days: number | null, status: string): string {
    if (status === "expired" || (days !== null && days <= 0)) return "text-red-400";
    if (status === "critical" || (days !== null && days < 10)) return "text-red-400";
    if (status === "expiring-soon" || (days !== null && days < 30)) return "text-yellow-400";
    return "text-green-400";
  }

  function statusBadge(status: string): { label: string; cls: string } {
    if (status === "expired") return { label: "Expired", cls: "bg-red-500/15 text-red-400 ring-red-500/30" };
    if (status === "critical") return { label: "Critical", cls: "bg-red-500/15 text-red-400 ring-red-500/30" };
    if (status === "expiring-soon") return { label: "Expiring Soon", cls: "bg-yellow-500/15 text-yellow-400 ring-yellow-500/30" };
    if (status === "valid") return { label: "Valid", cls: "bg-green-500/15 text-green-400 ring-green-500/30" };
    return { label: "Unknown", cls: "bg-border/15 text-text-secondary ring-border/30" };
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
        <p className="text-sm text-text-secondary text-center py-4">Loading...</p>
      </div>
    );
  }

  if (data.certs.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
        <p className="text-sm text-text-secondary">No SSL monitors configured</p>
      </div>
    );
  }

  // Single cert — detailed card
  if (data.certs.length === 1) {
    const cert = data.certs[0];
    const badge = statusBadge(cert.status);
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        {label && <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">{label}</p>}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-text-primary">{cert.domain}</p>
            {cert.issuer && <p className="text-xs text-text-secondary mt-0.5">Issuer: {cert.issuer}</p>}
            {cert.expiresAt && <p className="text-xs text-text-secondary mt-0.5">Expires: {cert.expiresAt}</p>}
            {cert.lastChecked && <p className="text-xs text-text-muted mt-0.5">Checked {formatRelative(cert.lastChecked)}</p>}
          </div>
          <div className="text-right flex-shrink-0">
            <div className={`text-4xl font-bold tabular-nums ${daysColor(cert.daysRemaining, cert.status)}`}>
              {cert.daysRemaining !== null ? cert.daysRemaining : "—"}
            </div>
            <div className="text-xs text-text-secondary mt-0.5">days remaining</div>
            <div className="mt-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${badge.cls}`}>
                {badge.label}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Multiple certs — table
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50">
        <p className="text-sm font-semibold text-text-primary">{label ?? "SSL Certificates"}</p>
      </div>
      <div className="divide-y divide-border/30">
        {data.certs.map((cert) => {
          const badge = statusBadge(cert.status);
          return (
            <div key={cert.monitorId} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{cert.domain}</p>
                {cert.issuer && <p className="text-[10px] text-text-secondary truncate">{cert.issuer}</p>}
              </div>
              <div className={`text-lg font-bold tabular-nums flex-shrink-0 ${daysColor(cert.daysRemaining, cert.status)}`}>
                {cert.daysRemaining !== null ? `${cert.daysRemaining}d` : "—"}
              </div>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 flex-shrink-0 ${badge.cls}`}>
                {badge.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Incident Severity Distribution — SVG donut chart
function IncidentSeverityDistribution({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    critical: number;
    major: number;
    minor: number;
    total: number;
    periodDays: number;
  } | undefined;

  const label = widget.config.label as string | undefined;

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  if (data.total === 0) {
    return (
      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-6 text-center">
        {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
        <div className="text-3xl mb-2">✓</div>
        <p className="text-sm text-green-400 font-semibold">No incidents</p>
        <p className="text-xs text-text-secondary mt-1">Last {data.periodDays} days</p>
      </div>
    );
  }

  // SVG donut chart using stroke-dasharray technique
  const r = 40;
  const cx = 60;
  const cy = 60;
  const circumference = 2 * Math.PI * r;

  const segments = [
    { key: "critical", label: "Critical", value: data.critical, color: "#ef4444" },
    { key: "major", label: "Major", value: data.major, color: "#f97316" },
    { key: "minor", label: "Minor", value: data.minor, color: "#3b82f6" },
  ].filter((s) => s.value > 0);

  let offset = 0;
  const arcs = segments.map((seg) => {
    const fraction = seg.value / data.total;
    const dash = fraction * circumference;
    const gap = circumference - dash;
    const arc = { ...seg, dash, gap, offset };
    offset += dash;
    return arc;
  });

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
      <div className="flex items-center gap-6">
        {/* Donut */}
        <div className="relative flex-shrink-0">
          <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={`Incident severity distribution: ${data.critical} critical, ${data.major} major, ${data.minor} minor`}>
            <title>{`Incident severity: ${data.critical} critical, ${data.major} major, ${data.minor} minor`}</title>
            {/* Track */}
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" />
            {/* Segments */}
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke={arc.color}
                strokeWidth="14"
                strokeDasharray={`${arc.dash} ${arc.gap}`}
                strokeDashoffset={-arc.offset}
                transform={`rotate(-90 ${cx} ${cy})`}
                strokeLinecap="butt"
              />
            ))}
            {/* Center total */}
            <text x={cx} y={cy - 4} textAnchor="middle" style={{ fill: "rgba(255,255,255,0.9)", fontSize: 20, fontWeight: 700 }}>
              {data.total}
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" style={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }}>
              total
            </text>
          </svg>
        </div>
        {/* Legend */}
        <div className="space-y-2.5 flex-1">
          {data.critical > 0 && (
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500 flex-shrink-0" />
              <span className="text-xs text-text-primary flex-1">Critical</span>
              <span className="text-sm font-bold tabular-nums text-red-400">{data.critical}</span>
            </div>
          )}
          {data.major > 0 && (
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-orange-500 flex-shrink-0" />
              <span className="text-xs text-text-primary flex-1">Major</span>
              <span className="text-sm font-bold tabular-nums text-orange-400">{data.major}</span>
            </div>
          )}
          {data.minor > 0 && (
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-blue-500 flex-shrink-0" />
              <span className="text-xs text-text-primary flex-1">Minor</span>
              <span className="text-sm font-bold tabular-nums text-blue-400">{data.minor}</span>
            </div>
          )}
          <p className="text-[10px] text-text-muted pt-1 border-t border-border/30">Last {data.periodDays} days</p>
        </div>
      </div>
    </div>
  );
}

// ── Incident Duration Stats ──────────────────────────────────────────────

function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function IncidentDurationStats({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    avg: number | null;
    longest: number | null;
    shortest: number | null;
    count: number;
    periodDays: number;
  } | undefined;

  const label = widget.config.label as string | undefined;

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  if (data.count === 0 || data.avg === null) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-6 text-center">
        {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
        <p className="text-sm text-text-secondary">No resolved incidents in the last {data.periodDays} days</p>
      </div>
    );
  }

  const cards = [
    { title: "Average", value: data.avg, color: "text-blue-400" },
    { title: "Longest", value: data.longest!, color: "text-red-400" },
    { title: "Shortest", value: data.shortest!, color: "text-green-400" },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
      <div className="grid grid-cols-3 gap-3">
        {cards.map((card) => (
          <div key={card.title} className="rounded-lg border border-border/50 bg-surface/60 p-3 text-center">
            <p className="text-xs text-text-secondary mb-1">{card.title}</p>
            <p className={`text-lg font-bold tabular-nums ${card.color}`}>{formatDuration(card.value)}</p>
            <p className="text-[10px] text-text-muted mt-1">{data.count} incident{data.count !== 1 ? "s" : ""}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-text-muted mt-2 text-right">Last {data.periodDays} days</p>
    </div>
  );
}

// ── Post-Mortem Card ─────────────────────────────────────────────────────

function PostMortemCard({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    incident: {
      title: string;
      severity: string;
      resolvedAt: string;
      durationMs: number | null;
      affectedMonitors: { name: string }[];
      updates: { status: string; message: string; createdAt: string }[];
    } | null;
  } | undefined;

  const label = widget.config.label as string | undefined;

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  if (!data.incident) {
    return (
      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-6 text-center">
        {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
        <div className="text-3xl mb-2">✓</div>
        <p className="text-sm text-green-400 font-semibold">No resolved incidents</p>
      </div>
    );
  }

  const inc = data.incident;
  const severityColor =
    inc.severity === "CRITICAL" ? "bg-red-500/20 text-red-400 border-red-500/30"
    : inc.severity === "HIGH" ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
    : "bg-blue-500/20 text-blue-400 border-blue-500/30";

  const statusColors: Record<string, string> = {
    INVESTIGATING: "bg-yellow-500",
    IDENTIFIED: "bg-orange-500",
    MONITORING: "bg-blue-500",
    RESOLVED: "bg-green-500",
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      {label && <p className="text-sm font-semibold text-text-primary">{label}</p>}
      {/* Header */}
      <div className="flex items-start gap-2">
        <p className="text-sm font-semibold text-text-primary flex-1">{inc.title}</p>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${severityColor}`}>
          {inc.severity}
        </span>
      </div>
      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-text-secondary">
        {inc.durationMs !== null && <span>⏱ {formatDuration(inc.durationMs)}</span>}
        <span>✓ {new Date(inc.resolvedAt).toLocaleDateString()}</span>
      </div>
      {/* Affected monitors */}
      {inc.affectedMonitors.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {inc.affectedMonitors.map((m) => (
            <span key={m.name} className="text-[10px] px-2 py-0.5 rounded-full bg-surface/80 border border-border/60 text-text-secondary">
              {m.name}
            </span>
          ))}
        </div>
      )}
      {/* Updates timeline */}
      {inc.updates.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-border/30">
          {inc.updates.map((u, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${statusColors[u.status] ?? "bg-surface"}`} />
              <div>
                <p className="text-[10px] font-semibold text-text-secondary uppercase">{u.status}</p>
                <p className="text-xs text-text-primary">{u.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Performance Trend ────────────────────────────────────────────────────

function PerformanceTrend({ widget, extra }: WidgetProps) {
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

function ApdexScore({ widget, extra }: WidgetProps) {
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

function ThroughputCounter({ widget, extra }: WidgetProps) {
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
function MonitorGroup({ widget, monitors }: WidgetProps) {
  const groupBy = (widget.config.groupBy as string) ?? "folder";
  const filterTag = widget.config.tag as string | undefined;
  const filterFolder = widget.config.folderId as string | undefined;
  const label = widget.config.label as string | undefined;

  let filtered = monitors;
  if (filterTag) filtered = monitors.filter(m => m.tags?.includes(filterTag));
  if (filterFolder) filtered = monitors.filter(m => m.folderId === filterFolder);

  // Group monitors
  const groups = new Map<string, MonitorSummary[]>();
  for (const m of filtered) {
    const key = groupBy === "tag"
      ? (m.tags?.[0] ?? "Untagged")
      : (m.folderName ?? "Ungrouped");
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }

  if (groups.size === 0 && filtered.length > 0) {
    groups.set(label ?? "All Monitors", filtered);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
      {Array.from(groups.entries()).map(([groupName, items]) => {
        const allGreen = items.every(m => m.level === "green");
        const hasRed = items.some(m => m.level === "red");
        return (
          <div key={groupName}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`h-2.5 w-2.5 rounded-full ${hasRed ? "bg-danger" : allGreen ? "bg-success" : "bg-warning"}`} />
              <span className="text-sm font-semibold text-text-primary">{groupName}</span>
              <span className="text-xs text-text-secondary ml-auto">{items.filter(m => m.level === "green").length}/{items.length} operational</span>
            </div>
            <div className="space-y-1">
              {items.map(m => (
                <div key={m.id} className="flex items-center gap-2 pl-5">
                  <div className={`h-1.5 w-1.5 rounded-full ${m.level === "green" ? "bg-success" : m.level === "yellow" ? "bg-warning" : "bg-danger"}`} />
                  <span className="text-sm text-text-primary flex-1 truncate">{m.name}</span>
                  {m.latencyMs !== null && <span className="text-xs font-mono text-text-secondary">{m.latencyMs}ms</span>}
                  <span className="text-xs text-text-secondary">{m.lastChecked ? formatRelative(m.lastChecked) : ""}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Multi Status Badges — compact grid of all monitors with status
function MultiStatusBadges({ widget, monitors }: WidgetProps) {
  const filterTag = widget.config.tag as string | undefined;
  const filterFolder = widget.config.folderId as string | undefined;
  const filterType = widget.config.monitorType as string | undefined;
  let filtered = monitors;
  if (filterTag) filtered = filtered.filter(m => m.tags?.includes(filterTag));
  if (filterFolder) filtered = filtered.filter(m => m.folderId === filterFolder);
  if (filterType) filtered = filtered.filter(m => m.type === filterType);

  const label = widget.config.label as string | undefined;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {filtered.map(m => (
          <div key={m.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
            m.level === "green" ? "border-success/20 bg-success/5" : m.level === "yellow" ? "border-warning/20 bg-warning/5" : "border-danger/20 bg-danger/5"
          }`}>
            <div className={`h-2 w-2 rounded-full flex-shrink-0 ${m.level === "green" ? "bg-success" : m.level === "yellow" ? "bg-warning" : "bg-danger"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-text-primary truncate">{m.name}</p>
              {m.latencyMs !== null && <p className="text-[10px] font-mono text-text-secondary">{m.latencyMs}ms</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Version Widgets ──────────────────────────────────────────────────────

function parseVersionFromMessage(msg: string | null): { current: string | null; latest: string | null } {
  if (!msg) return { current: null, latest: null };
  const m = msg.match(/current\s+([^\s,]+)[,\s]+latest\s+([^\s,]+)/i);
  return m ? { current: m[1], latest: m[2] } : { current: null, latest: null };
}

function classifyVersionDiff(current: string, latest: string): "up-to-date" | "patch" | "minor" | "major" {
  const c = current.replace(/^v/i, "").split(".");
  const l = latest.replace(/^v/i, "").split(".");
  if (c[0] !== l[0]) return "major";
  if (c[1] !== l[1]) return "minor";
  if (c[2] !== l[2]) return "patch";
  return "up-to-date";
}

// Version Status Grid — table showing all monitors with version info
function VersionStatusGrid({ monitors }: WidgetProps) {
  const versionMonitors = monitors.filter(m => m.message && /current/i.test(m.message));
  if (versionMonitors.length === 0) return <div className="p-4 text-sm text-text-secondary text-center">No version checks configured</div>;

  const upToDate = versionMonitors.filter(m => m.level === "green").length;
  const updates = versionMonitors.length - upToDate;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Version Status</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-success font-medium">{upToDate} up to date</span>
          {updates > 0 && <span className="text-warning font-medium">{updates} update{updates > 1 ? "s" : ""} available</span>}
        </div>
      </div>
      <div className="divide-y divide-border/50">
        {versionMonitors.map(m => {
          const { current, latest } = parseVersionFromMessage(m.message);
          const diff = current && latest ? classifyVersionDiff(current, latest) : "up-to-date";
          const diffColor = diff === "major" ? "text-danger" : diff === "minor" ? "text-warning" : diff === "patch" ? "text-accent" : "text-success";
          const diffBg = diff === "major" ? "bg-danger/10" : diff === "minor" ? "bg-warning/10" : diff === "patch" ? "bg-accent/10" : "bg-success/10";
          return (
            <div key={m.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <div className={`h-2 w-2 rounded-full flex-shrink-0 ${m.level === "green" ? "bg-success" : m.level === "yellow" ? "bg-warning" : "bg-danger"}`} aria-hidden="true" />
              <span className="sr-only">{levelLabel(m.level)}</span>
              <span className="text-sm text-text-primary font-medium flex-1 truncate">{m.name}</span>
              {current && <span className="text-xs font-mono text-text-secondary">{current}</span>}
              {current && latest && current !== latest && (
                <>
                  <span className="text-xs text-text-muted">→</span>
                  <span className={`text-xs font-mono font-medium ${diffColor}`}>{latest}</span>
                </>
              )}
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${diffBg} ${diffColor}`}>
                {diff === "up-to-date" ? "✓ Current" : diff.charAt(0).toUpperCase() + diff.slice(1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Version Check Badge — single monitor version status
function VersionCheckBadge({ widget, monitors }: WidgetProps) {
  const monitor = widget.config.monitorId ? monitors.find(m => m.id === widget.config.monitorId) : monitors.find(m => m.message && /current/i.test(m.message ?? ""));
  if (!monitor) return <div className="rounded-xl border border-border bg-surface p-3 text-xs text-text-secondary">No version data</div>;
  const { current, latest } = parseVersionFromMessage(monitor.message);
  const diff = current && latest ? classifyVersionDiff(current, latest) : "up-to-date";
  const statusColor = diff === "up-to-date" ? "text-success" : diff === "major" ? "text-danger" : "text-warning";
  const statusBg = diff === "up-to-date" ? "bg-success/10" : diff === "major" ? "bg-danger/10" : "bg-warning/10";
  return (
    <div className={`rounded-xl border border-border ${statusBg} p-4 flex items-center gap-3`}>
      <div className={`h-3 w-3 rounded-full flex-shrink-0 ${diff === "up-to-date" ? "bg-success" : diff === "major" ? "bg-danger" : "bg-warning"}`} aria-hidden="true" />
      <span className="sr-only">{diff === "up-to-date" ? "Up to date" : diff === "major" ? "Major update available" : "Update available"}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-text-primary">{widget.config.label || monitor.name}</span>
        <span className="ml-2 text-xs font-mono text-text-secondary">{current ?? "?"}</span>
      </div>
      <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusBg} ${statusColor}`}>
        {diff === "up-to-date" ? "✓ Up to date" : `${latest} available`}
      </span>
    </div>
  );
}

// Update Summary — counts of up-to-date / minor / major
function UpdateSummary({ monitors }: WidgetProps) {
  const versionMonitors = monitors.filter(m => m.message && /current/i.test(m.message));
  let upToDate = 0, minor = 0, major = 0, patch = 0;
  for (const m of versionMonitors) {
    const { current, latest } = parseVersionFromMessage(m.message);
    if (!current || !latest) { upToDate++; continue; }
    const diff = classifyVersionDiff(current, latest);
    if (diff === "up-to-date") upToDate++;
    else if (diff === "major") major++;
    else if (diff === "minor") minor++;
    else patch++;
  }
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-center gap-8">
        <div className="text-center">
          <div className="text-2xl font-bold text-success tabular-nums">{upToDate}</div>
          <div className="text-xs text-text-secondary mt-0.5">Up to date</div>
        </div>
        {patch > 0 && (
          <div className="text-center">
            <div className="text-2xl font-bold text-accent tabular-nums">{patch}</div>
            <div className="text-xs text-text-secondary mt-0.5">Patch</div>
          </div>
        )}
        <div className="text-center">
          <div className="text-2xl font-bold text-warning tabular-nums">{minor}</div>
          <div className="text-xs text-text-secondary mt-0.5">Minor</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-danger tabular-nums">{major}</div>
          <div className="text-xs text-text-secondary mt-0.5">Major</div>
        </div>
      </div>
    </div>
  );
}

// ── Response Time Comparison ─────────────────────────────────────────────

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

export function NextMaintenanceCountdown({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    none?: boolean;
    name?: string;
    description?: string | null;
    startsAt?: string;
    endsAt?: string;
    affectedMonitors?: { name: string }[];
    secondsUntil?: number;
  } | undefined;

  const title = (widget.config.label as string) || "Next Maintenance";

  if (!raw || raw.none) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center space-y-2">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="flex items-center justify-center gap-2 text-green-400">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">No upcoming maintenance</span>
        </div>
      </div>
    );
  }

  const seconds = raw.secondsUntil ?? 0;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const dateStr = raw.startsAt ? new Date(raw.startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="text-base font-bold text-text-primary">{raw.name}</div>
      <div className="flex gap-3 justify-center">
        {[{ v: days, u: "d" }, { v: hours, u: "h" }, { v: minutes, u: "m" }].map(({ v, u }) => (
          <div key={u} className="flex flex-col items-center bg-white/5 rounded-lg px-3 py-2 min-w-[3rem]">
            <span className="text-xl font-bold tabular-nums text-accent">{v}</span>
            <span className="text-[10px] text-text-secondary">{u}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-text-secondary text-center">{dateStr}</div>
      {raw.affectedMonitors && raw.affectedMonitors.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-center">
          {raw.affectedMonitors.map((m) => (
            <span key={m.name} className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-xs text-text-secondary ring-1 ring-white/10">
              {m.name}
            </span>
          ))}
        </div>
      )}
      {raw.description && <div className="text-xs text-text-secondary">{raw.description}</div>}
    </div>
  );
}

// ── Maintenance Impact List ──────────────────────────────────────────────

export function MaintenanceImpactList({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    windows: Array<{
      name: string;
      startsAt: string;
      endsAt: string;
      description: string | null;
      affectedMonitors: { name: string; status: string }[];
    }>;
  } | undefined;

  const title = (widget.config.label as string) || "Maintenance Impact";

  if (!raw || !raw.windows?.length) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center space-y-2">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="text-sm text-text-secondary">No scheduled maintenance</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="space-y-3">
        {raw.windows.map((w, i) => {
          const start = new Date(w.startsAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
          const end = new Date(w.endsAt).toLocaleString(undefined, { timeStyle: "short" });
          return (
            <div key={i} className="rounded-lg border border-border bg-white/3 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium text-text-primary">{w.name}</div>
                <div className="text-xs text-text-secondary flex-shrink-0">{start} – {end}</div>
              </div>
              {w.description && <div className="text-xs text-text-secondary">{w.description}</div>}
              <div className="flex flex-wrap gap-1.5">
                {w.affectedMonitors.map((m) => {
                  const dot = m.status === "green" ? "bg-green-400" : m.status === "yellow" ? "bg-yellow-400" : "bg-red-400";
                  return (
                    <span key={m.name} className="flex items-center gap-1 text-xs text-text-secondary bg-white/5 rounded px-1.5 py-0.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                      {m.name}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Version Timeline ─────────────────────────────────────────────────────

export function VersionTimeline({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    events: Array<{
      monitorId: string;
      name: string;
      fromVersion: string;
      toVersion: string;
      detectedAt: string;
    }>;
    count: number;
  } | undefined;

  const title = (widget.config.label as string) || "Version Timeline";

  if (!raw || !raw.events?.length) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center space-y-2">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="text-sm text-text-secondary">No version changes recorded</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="text-xs text-text-secondary">{raw.count} changes</div>
      </div>
      <div className="relative">
        <div className="absolute left-2 top-0 bottom-0 w-px bg-white/10" />
        <div className="space-y-4 pl-7">
          {raw.events.map((ev, i) => {
            const when = formatRelative(ev.detectedAt);
            return (
              <div key={i} className="relative">
                <div className="absolute -left-5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />
                <div className="text-xs font-medium text-text-primary mb-0.5">{ev.name}</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono bg-white/5 text-text-secondary ring-1 ring-white/10">
                    {ev.fromVersion}
                  </span>
                  <svg className="h-3 w-3 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono bg-accent/15 text-accent ring-1 ring-accent/30">
                    {ev.toVersion}
                  </span>
                </div>
                <div className="text-[10px] text-text-muted mt-0.5">{when}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Outdated Components Alert ────────────────────────────────────────────

export function OutdatedComponentsAlert({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    outdated: Array<{
      monitorId: string;
      name: string;
      currentVersion: string;
      latestVersion: string;
      severity: "critical" | "warning" | "info";
    }>;
    upToDate: number;
    total: number;
  } | undefined;

  const title = (widget.config.label as string) || "Outdated Components";

  if (!raw) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center text-sm text-text-secondary">
        {title}
      </div>
    );
  }

  if (raw.outdated.length === 0) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 flex items-center gap-3">
        <span className="text-green-400 text-xl">✓</span>
        <div>
          <div className="text-sm font-semibold text-green-400">All components up to date</div>
          <div className="text-xs text-text-secondary">{raw.total} monitor{raw.total !== 1 ? "s" : ""} checked</div>
        </div>
      </div>
    );
  }

  const severityBadge = (s: "critical" | "warning" | "info") => {
    const cfg = s === "critical"
      ? "bg-red-500/15 text-red-400 ring-red-500/30"
      : s === "warning"
      ? "bg-yellow-500/15 text-yellow-400 ring-yellow-500/30"
      : "bg-blue-500/15 text-blue-400 ring-blue-500/30";
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${cfg}`}>
        {s}
      </span>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span className="text-red-400 font-medium">{raw.outdated.length} outdated</span>
          <span>·</span>
          <span className="text-green-400">{raw.upToDate} up to date</span>
        </div>
      </div>
      <div className="space-y-2">
        {raw.outdated.map((item) => (
          <div key={item.monitorId} className="flex items-center justify-between gap-2 rounded-lg bg-white/3 border border-border px-3 py-2">
            <div className="text-sm font-medium text-text-primary truncate">{item.name}</div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <code className="text-xs bg-white/5 rounded px-1.5 py-0.5 text-text-secondary font-mono">{item.currentVersion}</code>
              <svg className="h-3 w-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <code className="text-xs bg-accent/15 rounded px-1.5 py-0.5 text-accent font-mono ring-1 ring-accent/30">{item.latestVersion}</code>
              {severityBadge(item.severity)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Version Comparison Table ─────────────────────────────────────────────

export function VersionComparisonTable({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    rows: Array<{
      monitorId: string;
      name: string;
      current: string;
      latest: string;
      upToDate: boolean;
      lastChecked: string | null;
    }>;
  } | undefined;

  const title = (widget.config.label as string) || "Version Comparison";

  if (!raw?.rows?.length) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center text-sm text-text-secondary">
        {title} — no data
      </div>
    );
  }

  const lastChecked = raw.rows.map((r) => r.lastChecked).filter(Boolean)[0];

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" aria-label={title}>
          <thead>
            <tr className="border-b border-border text-text-secondary">
              <th scope="col" className="text-left py-1.5 pr-3 font-medium">Service</th>
              <th scope="col" className="text-left py-1.5 pr-3 font-medium">Current</th>
              <th scope="col" className="text-left py-1.5 pr-3 font-medium">Latest</th>
              <th scope="col" className="text-left py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {raw.rows.map((row) => (
              <tr key={row.monitorId} className="hover:bg-white/2">
                <td className="py-2 pr-3 text-text-primary font-medium">{row.name}</td>
                <td className="py-2 pr-3">
                  <code className="bg-white/5 rounded px-1.5 py-0.5 font-mono text-text-secondary ring-1 ring-white/10">{row.current}</code>
                </td>
                <td className="py-2 pr-3">
                  <code className={`rounded px-1.5 py-0.5 font-mono ring-1 ${row.upToDate ? "bg-white/5 text-text-secondary ring-white/10" : "bg-accent/15 text-accent ring-accent/30"}`}>{row.latest}</code>
                </td>
                <td className="py-2">
                  {row.upToDate ? (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-green-500/15 text-green-400 ring-1 ring-green-500/30">Up to date</span>
                  ) : (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30">Update available</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lastChecked && (
        <div className="text-[10px] text-text-muted">Last checked {formatRelative(lastChecked)}</div>
      )}
    </div>
  );
}

// ── DNS Resolution Time ──────────────────────────────────────────────────

export function DNSResolutionTime({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    avgMs: number;
    p95Ms: number;
    monitors: Array<{ name: string; avgMs: number; trend: "up" | "down" | "stable" }>;
    periodHours: number;
  } | undefined;

  const title = (widget.config.label as string) || "DNS Resolution Time";

  if (!raw) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center text-sm text-text-secondary">
        {title}
      </div>
    );
  }

  const trendIcon = (t: "up" | "down" | "stable") => {
    if (t === "up") return <span className="text-red-400">↑</span>;
    if (t === "down") return <span className="text-green-400">↓</span>;
    return <span className="text-text-muted">–</span>;
  };

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="text-xs text-text-secondary">Last {raw.periodHours}h</div>
      </div>
      <div className="flex items-end gap-6">
        <div>
          <div className="text-3xl font-bold text-text-primary tabular-nums">{raw.avgMs}<span className="text-base font-normal text-text-secondary ml-1">ms</span></div>
          <div className="text-xs text-text-secondary mt-0.5">Avg Response (incl. DNS)</div>
        </div>
        <div className="pb-1">
          <div className="text-lg font-semibold text-text-secondary tabular-nums">{raw.p95Ms}<span className="text-xs font-normal ml-1">ms</span></div>
          <div className="text-[10px] text-text-muted">p95</div>
        </div>
      </div>
      {raw.monitors.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs text-text-secondary font-medium mb-1">Per monitor</div>
          {raw.monitors.map((m, i) => (
            <div key={i} className="flex items-center justify-between text-xs rounded bg-white/3 px-2.5 py-1.5">
              <span className="text-text-primary truncate mr-2">{m.name}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="tabular-nums text-text-secondary">{m.avgMs}ms</span>
                {trendIcon(m.trend)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Gauge / Speedometer ──────────────────────────────────────────────────

export function Gauge({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    value: number;
    metricType: string;
    label: string;
    thresholds: { green: number; yellow: number };
  } | undefined;

  const title = (widget.config.label as string) || "Gauge";

  if (!raw) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center text-sm text-text-secondary">
        {title}
      </div>
    );
  }

  const { value, thresholds } = raw;
  const color = value >= thresholds.green ? "#4ade80" : value >= thresholds.yellow ? "#facc15" : "#f87171";

  // SVG semicircle gauge: arc from 180° → 0° (left → right)
  // radius=70, center at (100, 100), arc: 0=left (180°), 100=right (0°)
  const R = 70;
  const cx = 100;
  const cy = 100;
  const clampedValue = Math.min(Math.max(value, 0), 100);
  // Angle in radians: 0% = π (left), 100% = 0 (right)
  const startAngle = Math.PI;
  const endAngle = 0;
  const valueAngle = startAngle - (clampedValue / 100) * Math.PI; // goes from π to 0

  const polarToXY = (angle: number, r: number) => ({
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  });

  const arcPath = (fromAngle: number, toAngle: number, r: number) => {
    const start = polarToXY(fromAngle, r);
    const end = polarToXY(toAngle, r);
    const largeArc = fromAngle - toAngle > Math.PI ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };

  // Background arc: full semicircle (180° to 0°)
  const bgPath = arcPath(Math.PI, 0, R);
  // Foreground arc: from 180° to valueAngle
  const fgPath = clampedValue > 0 ? arcPath(Math.PI, valueAngle, R) : "";

  // Needle: from center toward valueAngle
  const needleTip = polarToXY(valueAngle, R - 8);
  const needleBase1 = polarToXY(valueAngle + 0.15, 12);
  const needleBase2 = polarToXY(valueAngle - 0.15, 12);

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 flex flex-col items-center space-y-2">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <svg viewBox="0 10 200 110" className="w-full max-w-[220px]" role="img" aria-label={`${title}: ${value.toFixed(1)}%`}>
        <title>{`${title}: ${value.toFixed(1)}%`}</title>
        {/* Background arc */}
        <path d={bgPath} fill="none" stroke="#374151" strokeWidth={14} strokeLinecap="round" />
        {/* Colored foreground arc */}
        {fgPath && (
          <path d={fgPath} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />
        )}
        {/* Needle */}
        <polygon
          points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
          fill={color}
          opacity={0.9}
        />
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={5} fill={color} />
        {/* Value text */}
        <text x={cx} y={cy - 14} textAnchor="middle" fill="white" fontSize={22} fontWeight="bold" fontFamily="monospace">
          {value.toFixed(1)}
        </text>
        <text x={cx} y={cy - 2} textAnchor="middle" fill="#9ca3af" fontSize={10}>
          %
        </text>
      </svg>
      <div className="text-xs text-text-secondary text-center">{raw.label}</div>
      <div className="flex items-center gap-3 text-[10px] text-text-muted">
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1 align-middle" />
          &lt;{thresholds.yellow}%
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1 align-middle" />
          {thresholds.yellow}–{thresholds.green}%
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1 align-middle" />
          ≥{thresholds.green}%
        </span>
      </div>
    </div>
  );
}

// ── Stats Grid ───────────────────────────────────────────────────────────

export function StatsGrid({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    stats: Array<{
      key: string;
      label: string;
      value: string;
      icon: string;
      trend?: string;
      trendDir?: "up" | "down";
    }>;
  } | undefined;

  const title = (widget.config.label as string) || "Stats Grid";
  const visibleKeys = widget.config.visibleStats as string[] | undefined;

  if (!raw?.stats?.length) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center text-sm text-text-secondary">
        {title} — no data
      </div>
    );
  }

  const stats = visibleKeys?.length
    ? raw.stats.filter((s) => visibleKeys.includes(s.key))
    : raw.stats;

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {stats.map((stat) => (
          <div
            key={stat.key}
            className="rounded-lg border border-border/60 bg-white/3 backdrop-blur-sm p-3 space-y-1 hover:bg-white/5 transition-colors"
            style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.2)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-base leading-none">{stat.icon}</span>
              {stat.trend && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${stat.trendDir === "down" ? "bg-red-500/15 text-red-400" : "bg-green-500/15 text-green-400"}`}>
                  {stat.trendDir === "down" ? "↓" : "↑"} {stat.trend}
                </span>
              )}
            </div>
            <div className="text-lg font-bold text-text-primary tabular-nums leading-tight">{stat.value}</div>
            <div className="text-[10px] text-text-secondary leading-tight">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Metric Comparison Row ────────────────────────────────────────────────

export function MetricComparisonRow({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    metrics: Array<{
      key: string;
      label: string;
      value: string;
      unit: string;
      color: "green" | "yellow" | "red" | "blue" | "default";
    }>;
  } | undefined;

  const title = (widget.config.label as string) || "Metrics";

  if (!data?.metrics?.length) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center text-sm text-text-secondary">
        {title} — no data
      </div>
    );
  }

  const colorMap: Record<string, string> = {
    green: "text-green-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
    blue: "text-blue-400",
    default: "text-text-primary",
  };

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="grid grid-cols-2 sm:flex sm:flex-row gap-3">
        {data.metrics.map((m) => (
          <div
            key={m.key}
            className="flex-1 rounded-lg border border-border/60 bg-white/3 backdrop-blur-sm p-3 space-y-1 text-center"
          >
            <div className="text-[10px] text-text-secondary uppercase tracking-wider leading-tight">{m.label}</div>
            <div className={`text-2xl font-bold tabular-nums leading-tight ${colorMap[m.color] ?? colorMap.default}`}>
              {m.value}
              {m.unit && <span className="text-sm font-normal ml-0.5 text-text-secondary">{m.unit}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sparkline Row ────────────────────────────────────────────────────────

function MiniSparkline({ dataPoints, color }: { dataPoints: number[]; color: string }) {
  const points = dataPoints.length > 0 ? dataPoints : [0];
  const w = 80;
  const h = 40;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = points.length > 1 ? w / (points.length - 1) : w;

  const coords = points.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden="true">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SparklineRow({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    monitors: Array<{
      id: string;
      name: string;
      dataPoints: number[];
      avgMs: number;
      status: "up" | "down" | "degraded";
    }>;
  } | undefined;

  const title = (widget.config.label as string) || "Sparklines";

  if (!data?.monitors?.length) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center text-sm text-text-secondary">
        {title} — no data
      </div>
    );
  }

  const statusColor = (s: "up" | "down" | "degraded") =>
    s === "up" ? "#4ade80" : s === "degraded" ? "#facc15" : "#f87171";
  const statusDot = (s: "up" | "down" | "degraded") =>
    s === "up" ? "bg-green-400" : s === "degraded" ? "bg-yellow-400" : "bg-red-400";

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="flex flex-wrap gap-3">
        {data.monitors.map((m) => (
          <div
            key={m.id}
            className="flex-1 min-w-[120px] rounded-lg border border-border/60 bg-white/3 p-3 space-y-1"
          >
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full flex-shrink-0 ${statusDot(m.status)}`} />
              <span className="text-xs font-medium text-text-primary truncate">{m.name}</span>
            </div>
            <div className="flex justify-center">
              <MiniSparkline dataPoints={m.dataPoints} color={statusColor(m.status)} />
            </div>
            <div className="text-[10px] text-text-secondary text-center">
              avg {m.avgMs > 0 ? `${m.avgMs}ms` : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Progress Ring ────────────────────────────────────────────────────────

export function ProgressRing({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    value: number;
    label: string;
    color: "green" | "yellow" | "red";
  } | undefined;

  const title = (widget.config.label as string) || "Progress Ring";

  if (data === undefined) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center text-sm text-text-secondary">
        {title} — no data
      </div>
    );
  }

  const { value, label, color } = data;
  const radius = 54;
  const cx = 70;
  const cy = 70;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, value));
  const strokeDashoffset = circumference * (1 - pct / 100);

  const strokeColor =
    color === "green" ? "#4ade80" : color === "yellow" ? "#facc15" : "#f87171";

  const periodDays = (widget.config.periodDays as number) ?? 30;
  const metricType = (widget.config.metricType as string) ?? "uptime";
  const periodLabel = metricType === "custom" ? "" : `Last ${periodDays}d`;

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 flex flex-col items-center space-y-2">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <svg width={140} height={140} viewBox="0 0 140 140" role="img" aria-label={`${title}: ${pct.toFixed(1)}% ${label}`}>
        <title>{`${title}: ${pct.toFixed(1)}% ${label}`}</title>
        {/* Track */}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={12} />
        {/* Progress */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        {/* Center value */}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="white" fontSize={22} fontWeight="bold" fontFamily="monospace">
          {value.toFixed(value % 1 === 0 ? 0 : 1)}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="white" fontSize={12} opacity={0.7}>
          %
        </text>
        <text x={cx} y={cy + 26} textAnchor="middle" fill="#9ca3af" fontSize={9}>
          {label}
        </text>
      </svg>
      {periodLabel && (
        <div className="text-[10px] text-text-secondary">{periodLabel}</div>
      )}
    </div>
  );
}

// ── Announcement Bar ─────────────────────────────────────────────────────

export function AnnouncementBar({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    message: string;
    type: "info" | "warning" | "danger" | "success";
    expiresAt?: string;
    dismissable: boolean;
    expired: boolean;
  } | undefined;

  if (!data || data.expired || !data.message) return null;

  return (
    <AnnouncementBarClient
      message={data.message}
      type={data.type}
      dismissable={data.dismissable}
    />
  );
}

// ── Link List ────────────────────────────────────────────────────────────

export function LinkList({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    links: Array<{ label: string; url: string; icon: string; description?: string }>;
  } | undefined;

  const title = (widget.config.label as string) || "Links";
  const isEditor = (widget.config._editor as boolean) ?? false;

  if (!data?.links?.length) {
    if (isEditor) {
      return (
        <div className="rounded-xl border border-dashed border-border bg-surface/30 p-4 text-center text-sm text-text-secondary">
          No links configured. Add links in the widget settings.
        </div>
      );
    }
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="divide-y divide-border/50">
        {data.links.map((link, i) => (
          <a
            key={i}
            href={link.url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-3 py-2.5 hover:bg-white/5 rounded-lg px-2 -mx-2 transition-colors group"
          >
            <span className="text-xl flex-shrink-0">{link.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-text-primary group-hover:text-white transition-colors">{link.label}</div>
              {link.description && (
                <div className="text-[11px] text-text-secondary truncate">{link.description}</div>
              )}
            </div>
            <span className="text-text-secondary group-hover:text-white transition-colors flex-shrink-0">→</span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── FAQ Accordion ────────────────────────────────────────────────────────

export function FaqAccordion({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    items: Array<{ question: string; answer: string }>;
  } | undefined;

  const items = data?.items ?? (widget.config.items as Array<{ question: string; answer: string }> | undefined) ?? [];
  const title = (widget.config.label as string) || undefined;
  const isEditor = (widget.config._editor as boolean) ?? false;

  if (!items.length) {
    if (isEditor) {
      return (
        <div className="rounded-xl border border-dashed border-border bg-surface/30 p-4 text-center text-sm text-text-secondary">
          No FAQ items configured. Add Q&A pairs in the widget settings.
        </div>
      );
    }
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4">
      {title && <div className="mb-3 text-sm font-semibold text-text-primary">{title}</div>}
      <div className="space-y-0">
        {items.map((item, i) => (
          <details
            key={i}
            className="group border-b border-border/50 last:border-0"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-left text-sm font-medium text-text-primary hover:text-white transition-colors select-none">
              <span>{item.question}</span>
              <svg
                className="h-4 w-4 flex-shrink-0 text-text-secondary transition-transform duration-200 group-open:rotate-180"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="pb-3">
              <p className="text-sm text-text-secondary leading-relaxed">{item.answer}</p>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ── Social Links ─────────────────────────────────────────────────────────

type SocialPlatform = "github" | "twitter" | "discord" | "linkedin" | "youtube" | "mastodon" | "bluesky" | "website";

const SOCIAL_CONFIG: Record<SocialPlatform, { color: string; label: string; svgPath: string }> = {
  github: {
    color: "bg-neutral-700 hover:bg-neutral-600",
    label: "GitHub",
    svgPath: "M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.92.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z",
  },
  twitter: {
    color: "bg-sky-700 hover:bg-sky-600",
    label: "Twitter / X",
    svgPath: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  discord: {
    color: "bg-indigo-700 hover:bg-indigo-600",
    label: "Discord",
    svgPath: "M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z",
  },
  linkedin: {
    color: "bg-blue-800 hover:bg-blue-700",
    label: "LinkedIn",
    svgPath: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
  youtube: {
    color: "bg-red-700 hover:bg-red-600",
    label: "YouTube",
    svgPath: "M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
  mastodon: {
    color: "bg-purple-700 hover:bg-purple-600",
    label: "Mastodon",
    svgPath: "M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 00.023-.043v-1.809a.052.052 0 00-.02-.041.053.053 0 00-.046-.01 20.282 20.282 0 01-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 01-.319-1.433.053.053 0 01.066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z",
  },
  bluesky: {
    color: "bg-sky-600 hover:bg-sky-500",
    label: "Bluesky",
    svgPath: "M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 01-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.204-.659-.299-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z",
  },
  website: {
    color: "bg-gray-700 hover:bg-gray-600",
    label: "Website",
    svgPath: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
  },
};

export function SocialLinks({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    links: Array<{ platform: string; url: string }>;
  } | undefined;

  const links = data?.links ?? (widget.config.socialLinks as Array<{ platform: string; url: string }> | undefined) ?? [];
  const isEditor = (widget.config._editor as boolean) ?? false;

  if (!links.length) {
    if (isEditor) {
      return (
        <div className="rounded-xl border border-dashed border-border bg-surface/30 p-4 text-center text-sm text-text-secondary">
          No social links configured. Add platforms in the widget settings.
        </div>
      );
    }
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4">
      <div className="flex flex-wrap gap-2">
        {links.map((link, i) => {
          const platform = link.platform as SocialPlatform;
          const cfg = SOCIAL_CONFIG[platform] ?? SOCIAL_CONFIG.website;
          return (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
              title={cfg.label}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${cfg.color}`}
            >
              <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24" aria-hidden="true">
                <path d={cfg.svgPath} />
              </svg>
              <span className="sr-only">{cfg.label}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ── Embed / iFrame Block ──────────────────────────────────────────────────

export function EmbedIframe({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    url: string;
    height: number;
    title?: string;
    sandbox: string;
  } | undefined;

  const url = data?.url ?? (widget.config.url as string | undefined) ?? "";
  const height = data?.height ?? (widget.config.height as number | undefined) ?? 400;
  const title = data?.title ?? (widget.config.title as string | undefined) ?? "Embedded content";
  const sandbox = data?.sandbox ?? (widget.config.sandbox as string | undefined) ?? "allow-scripts allow-same-origin";

  if (!url) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/30 p-4 text-center text-sm text-text-secondary">
        No URL configured for embed.
      </div>
    );
  }

  const isHttps = url.startsWith("https://");

  return (
    <div className="rounded-xl border border-border bg-surface/50 overflow-hidden">
      {!isHttps && (
        <div className="flex items-center gap-2 bg-yellow-500/10 border-b border-yellow-500/30 px-3 py-2 text-xs text-yellow-400">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Non-HTTPS URL — content may be blocked by browsers.
        </div>
      )}
      <div style={{ height }}>
        <iframe
          src={url}
          title={title}
          sandbox={sandbox}
          className="w-full border-0 bg-surface/30"
          style={{ height }}
          loading="lazy"
        />
      </div>
    </div>
  );
}

// ── Subscriber Form ───────────────────────────────────────────────────────

export function SubscriberForm({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    title: string;
    description: string;
    buttonText: string;
    successMessage: string;
  } | undefined;

  const slug = (widget.config._slug as string | undefined) ?? "";
  const title = data?.title ?? (widget.config.title as string | undefined) ?? "Subscribe to Updates";
  const description = data?.description ?? (widget.config.description as string | undefined) ?? "Get notified when incidents are created or resolved.";
  const buttonText = data?.buttonText ?? (widget.config.buttonText as string | undefined) ?? "Subscribe";
  const successMessage = data?.successMessage ?? (widget.config.successMessage as string | undefined) ?? "You are subscribed!";

  return (
    <SubscriberFormWidget
      slug={slug}
      title={title}
      description={description}
      buttonText={buttonText}
      successMessage={successMessage}
    />
  );
}

// ── Countdown ─────────────────────────────────────────────────────────────

export function Countdown({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    label: string;
    targetAt: string | null;
    secondsRemaining: number;
    expired: boolean;
    hideAfterExpiry: boolean;
  } | undefined;

  const label = data?.label ?? (widget.config.label as string | undefined) ?? "Event";
  const targetAt = data?.targetAt ?? (widget.config.targetAt as string | undefined) ?? null;
  const hideAfterExpiry = data?.hideAfterExpiry ?? (widget.config.hideAfterExpiry as boolean | undefined) ?? false;
  const initialSeconds = data?.secondsRemaining ?? (
    targetAt ? Math.max(0, Math.floor((new Date(targetAt).getTime() - Date.now()) / 1000)) : 0
  );

  return (
    <CountdownWidget
      label={label}
      targetAt={targetAt}
      initialSecondsRemaining={initialSeconds}
      hideAfterExpiry={hideAfterExpiry}
    />
  );
}

// ── Maintenance Calendar ──────────────────────────────────────────────────

export function MaintenanceCalendar({ widget, extra }: WidgetProps) {
  const monthOffset = (widget.config.monthOffset as number | undefined) ?? 0;
  const showPast = (widget.config.showPast as boolean | undefined) ?? true;

  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = target.getFullYear();
  const month = target.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0

  const monthName = target.toLocaleString("en-US", { month: "long" });

  const maintenanceDays = new Set<number>();
  const pastDays = new Set<number>();

  for (const m of extra.maintenance) {
    const start = new Date(m.startsAt);
    const end = new Date(m.endsAt);
    const isPast = end < now;
    if (isPast && !showPast) continue;

    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month, d);
      if (day >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
          day <= new Date(end.getFullYear(), end.getMonth(), end.getDate())) {
        maintenanceDays.add(d);
        if (isPast) pastDays.add(d);
      }
    }
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const today = now.getDate();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month;

  return (
    <div className="bg-surface/50 border border-border rounded-xl p-4">
      <div className="mb-3 text-center font-semibold text-text-primary">
        {monthName} {year}
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {dayLabels.map((l) => (
          <div key={l} className="text-center text-[10px] text-text-secondary font-medium py-1">{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (d === null) return <div key={`e-${i}`} />;
          const hasMaint = maintenanceDays.has(d);
          const isPast = pastDays.has(d);
          const isToday = isCurrentMonth && d === today;
          return (
            <div
              key={d}
              className={[
                "text-center text-xs py-1.5 rounded-md font-medium",
                hasMaint && isPast ? "bg-purple-500/20 text-purple-300" :
                hasMaint ? "bg-blue-500/20 text-blue-300" :
                isToday ? "ring-1 ring-border text-text-primary" :
                "text-text-secondary",
              ].filter(Boolean).join(" ")}
            >
              {d}
              {hasMaint && (
                <div className={`mx-auto mt-0.5 w-1 h-1 rounded-full ${isPast ? "bg-purple-400" : "bg-blue-400"}`} />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-3 text-[10px] text-text-secondary">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />Upcoming</span>
        {showPast && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />Past</span>}
      </div>
    </div>
  );
}

// ── Changelog Widget ──────────────────────────────────────────────────────

export function ChangelogWidget({ widget, monitors }: WidgetProps) {
  const monitorId = widget.config.monitorId as string | undefined;
  const showLastChecked = (widget.config.showLastChecked as boolean | undefined) ?? true;

  const monitor = monitorId
    ? monitors.find((m) => m.id === monitorId) ?? monitors[0]
    : monitors[0];

  if (!monitor) {
    return (
      <div className="bg-surface/50 border border-border rounded-xl p-4 text-center text-sm text-text-secondary">
        Connect a version monitor to track changelog updates
      </div>
    );
  }

  let currentVersion: string | null = null;
  let latestVersion: string | null = null;

  if (monitor.message) {
    const currentMatch = monitor.message.match(/current[:\s]+([^\s/]+)/i);
    const latestMatch = monitor.message.match(/latest[:\s]+([^\s/]+)/i);
    if (currentMatch) currentVersion = currentMatch[1];
    if (latestMatch) latestVersion = latestMatch[1];
    if (!currentVersion) currentVersion = monitor.message.trim().split(/[\s/]/)[0] ?? null;
  }

  const isUpToDate = currentVersion && latestVersion && currentVersion === latestVersion;
  const hasUpdate = currentVersion && latestVersion && currentVersion !== latestVersion;

  return (
    <div className="bg-surface/50 border border-border rounded-xl p-4 space-y-3">
      <div className="font-semibold text-text-primary">{monitor.name}</div>
      <div className="flex flex-wrap gap-2 items-center">
        {currentVersion && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-text-secondary">
            Current: <span className="font-mono text-text-primary">{currentVersion}</span>
          </span>
        )}
        {latestVersion && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${
            hasUpdate ? "bg-yellow-500/10 border border-yellow-500/30 text-yellow-300" :
            "bg-surface border border-border text-text-secondary"
          }`}>
            Latest: {latestVersion}
          </span>
        )}
        {isUpToDate && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/30 text-green-300">
            Up to date
          </span>
        )}
        {hasUpdate && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-300">
            Update available
          </span>
        )}
      </div>
      {showLastChecked && monitor.lastChecked && (
        <div className="text-[11px] text-text-secondary">Last checked {formatRelative(monitor.lastChecked)}</div>
      )}
    </div>
  );
}

// ── Image / Banner ────────────────────────────────────────────────────────

export function ImageBanner({ widget }: WidgetProps) {
  const imageUrl = widget.config.imageUrl as string | undefined;
  const altText = (widget.config.altText as string | undefined) ?? "";
  const linkUrl = widget.config.linkUrl as string | undefined;
  const maxHeight = (widget.config.maxHeight as number | undefined) ?? 200;
  const caption = widget.config.caption as string | undefined;

  if (!imageUrl) {
    return (
      <div className="bg-surface/50 border border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-text-secondary" style={{ minHeight: 80 }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
        <span className="text-sm">Add image URL in config</span>
      </div>
    );
  }

  const imgEl = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={altText}
      style={{ maxHeight, objectFit: "cover", width: "100%", borderRadius: "0.75rem" }}
    />
  );

  return (
    <div className="bg-surface/50 border border-border rounded-xl overflow-hidden">
      {linkUrl ? (
        <a href={linkUrl} target="_blank" rel="noreferrer noopener">
          {imgEl}
        </a>
      ) : imgEl}
      {caption && (
        <p className="px-4 py-2 text-sm text-text-secondary">{caption}</p>
      )}
    </div>
  );
}

// ── Data Table ────────────────────────────────────────────────────────────

export function DataTable({ widget, monitors }: WidgetProps) {
  const columns = (widget.config.columns as string[] | undefined) ?? ["name", "status", "latency", "lastChecked"];
  const maxRows = (widget.config.maxRows as number | undefined) ?? 20;
  const showHeader = (widget.config.showHeader as boolean | undefined) ?? true;

  const rows = monitors.slice(0, maxRows);

  const colLabel: Record<string, string> = {
    name: "Name",
    status: "Status",
    latency: "Latency",
    lastChecked: "Last Checked",
    type: "Type",
    message: "Message",
  };

  const levelDot: Record<string, string> = {
    green: "bg-green-400",
    yellow: "bg-yellow-400",
    red: "bg-red-400",
  };

  return (
    <div className="bg-surface/50 border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm" aria-label="Monitor status table">
        {showHeader && (
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th key={col} scope="col" className="px-3 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wide">
                  {colLabel[col] ?? col}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-4 text-center text-text-secondary text-xs">
                No monitors configured
              </td>
            </tr>
          ) : rows.map((m) => (
            <tr key={m.id} className="border-b border-border/50 last:border-0 hover:bg-surface/80">
              {columns.map((col) => (
                <td key={col} className="px-3 py-2 text-text-primary">
                  {col === "status" ? (
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${levelDot[m.level] ?? "bg-gray-400"}`} />
                      <span className="text-xs">{levelLabel(m.level)}</span>
                    </span>
                  ) : col === "latency" ? (
                    <span className="text-xs font-mono">{m.latencyMs != null ? `${m.latencyMs}ms` : "—"}</span>
                  ) : col === "lastChecked" ? (
                    <span className="text-xs text-text-secondary">{m.lastChecked ? formatRelative(m.lastChecked) : "—"}</span>
                  ) : col === "name" ? (
                    <span className="font-medium text-xs">{m.name}</span>
                  ) : col === "type" ? (
                    <span className="text-xs text-text-secondary">{m.type}</span>
                  ) : col === "message" ? (
                    <span className="text-xs text-text-secondary truncate max-w-xs block">{m.message ?? "—"}</span>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── RSS Feed Widget ───────────────────────────────────────────────────────

export function RssFeedWidget({ widget }: WidgetProps) {
  const feedTitle = (widget.config.feedTitle as string | undefined) ?? "Status Updates";
  const slugOverride = widget.config.slugOverride as string | undefined;

  const feedUrl = slugOverride
    ? `https://your-domain.com/status/${slugOverride}/feed.xml`
    : "Configure slug in widget settings";
  const isPlaceholder = !slugOverride;

  return (
    <div className="bg-surface/50 border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-400" aria-hidden="true">
          <path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" />
        </svg>
        <span className="font-semibold text-text-primary">{feedTitle}</span>
      </div>
      <div className="rounded-lg bg-surface border border-border p-2 flex items-center justify-between gap-2">
        <code className="text-xs font-mono text-text-secondary truncate">{feedUrl}</code>
        {!isPlaceholder && <RssFeedCopyButton feedUrl={feedUrl} />}
      </div>
      <p className="text-xs text-text-secondary">Subscribe in your RSS reader to receive status updates.</p>
    </div>
  );
}

// ── Content widgets ──────────────────────────────────────────────────────

export function CodeBlock({ widget }: WidgetProps) {
  const code = (widget.config.code as string) ?? "";
  const language = (widget.config.language as string) ?? "bash";
  const label = (widget.config.label as string) ?? "Code";

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-text-secondary">{label}</span>
        <span className="text-xs bg-surface-elevated border border-border/60 px-2 py-0.5 rounded font-mono text-text-muted">{language}</span>
      </div>
      <pre className="bg-bg/80 rounded-lg p-4 overflow-x-auto">
        <code className="text-xs font-mono text-text-primary whitespace-pre">{code || "# Add code in the config panel"}</code>
      </pre>
    </div>
  );
}

export function VideoEmbed({ widget }: WidgetProps) {
  const url = (widget.config.videoUrl as string) ?? "";
  const label = (widget.config.label as string) ?? "";
  const height = (widget.config.height as number) ?? 300;

  function toEmbedUrl(rawUrl: string): string | null {
    if (!rawUrl) return null;
    try {
      const u = new URL(rawUrl);
      if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
        return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
      }
      if (u.hostname.includes('youtu.be')) {
        return `https://www.youtube.com/embed${u.pathname}`;
      }
      if (u.hostname.includes('vimeo.com')) {
        const id = u.pathname.split('/').filter(Boolean).pop();
        return `https://player.vimeo.com/video/${id}`;
      }
      return rawUrl;
    } catch {
      return null;
    }
  }

  const embedUrl = toEmbedUrl(url);

  return (
    <div className="rounded-xl border border-border bg-surface/50 overflow-hidden">
      {label && <div className="px-4 py-2 border-b border-border text-sm font-medium text-text-secondary">{label}</div>}
      {embedUrl ? (
        <iframe
          src={embedUrl}
          style={{ height: `${height}px`, width: '100%' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="block"
          title={label || "Video"}
        />
      ) : (
        <div className="flex items-center justify-center text-text-muted text-sm" style={{ height: `${height}px` }}>
          Add a YouTube or Vimeo URL in config
        </div>
      )}
    </div>
  );
}

export function CollapsibleSection({ widget }: WidgetProps) {
  const title = (widget.config.title as string) ?? "Section";
  const description = (widget.config.description as string) ?? "";
  const defaultOpen = (widget.config.defaultOpen as boolean) ?? true;

  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-border bg-surface/50 overflow-hidden"
    >
      <summary className="flex cursor-pointer select-none items-center justify-between px-5 py-4 font-semibold text-text-primary hover:bg-surface-elevated/40 transition-colors list-none">
        <span>{title}</span>
        <svg
          className="h-4 w-4 text-text-secondary transition-transform duration-200 group-open:rotate-180"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="border-t border-border px-5 py-4 text-sm text-text-secondary leading-relaxed">
        {description.split("\n").map((line, i) => (
          <span key={i}>{line}{i < description.split("\n").length - 1 && <br />}</span>
        ))}
        {!description && <span className="italic text-text-muted">No content configured.</span>}
      </div>
    </details>
  );
}

// ── Tab Container ────────────────────────────────────────────────────────

export function TabContainer({ widget }: WidgetProps) {
  const tabs = (widget.config.tabs as Array<{ title: string; content: string }> | undefined) ?? [
    { title: "Tab 1", content: "" },
    { title: "Tab 2", content: "" },
  ];
  const label = widget.config.label as string | undefined;
  const [active, setActive] = React.useState(0);
  const activeIndex = Math.min(active, tabs.length - 1);
  const tab = tabs[activeIndex];

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {label && <p className="text-sm font-semibold text-text-primary px-4 pt-4">{label}</p>}
      {/* Tab bar */}
      <div className="flex border-b border-border bg-surface-elevated/40 overflow-x-auto">
        {tabs.map((t, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={[
              "relative shrink-0 px-4 py-2.5 text-sm font-medium transition-colors select-none",
              i === activeIndex
                ? "text-text-primary"
                : "text-text-muted hover:text-text-secondary",
            ].join(" ")}
          >
            {t.title || `Tab ${i + 1}`}
            {i === activeIndex && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent rounded-full" />
            )}
          </button>
        ))}
      </div>
      {/* Tab content */}
      <div className="px-5 py-4 min-h-[60px]">
        {tab?.content ? (
          <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{tab.content}</div>
        ) : (
          <p className="text-sm text-text-muted italic">No content configured for this tab.</p>
        )}
      </div>
    </div>
  );
}

// ── Dependency Map ───────────────────────────────────────────────────────

export function DependencyMap({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    nodes: Array<{ id: string; name: string; type: string; level: string; latencyMs: number | null }>;
    edges: Array<{ source: string; target: string; label?: string }>;
  } | undefined;

  const label = widget.config.label as string | undefined;

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-sm text-text-secondary">Loading dependency map…</p>
      </div>
    );
  }

  const nodeLevel = (id: string) => data.nodes.find((n) => n.id === id)?.level ?? "green";
  const levelColor = (lvl: string) =>
    lvl === "green" ? { ring: "#4ade80", bg: "#052e16", text: "#4ade80" }
    : lvl === "yellow" ? { ring: "#facc15", bg: "#1c1a00", text: "#facc15" }
    : { ring: "#f87171", bg: "#2d0a0a", text: "#f87171" };

  // Simple grid layout: space nodes evenly
  const cols = Math.ceil(Math.sqrt(data.nodes.length || 1));
  const NODE_W = 120;
  const NODE_H = 52;
  const COL_GAP = 60;
  const ROW_GAP = 50;
  const positions = data.nodes.map((n, i) => ({
    id: n.id,
    x: (i % cols) * (NODE_W + COL_GAP) + 20,
    y: Math.floor(i / cols) * (NODE_H + ROW_GAP) + 20,
  }));
  const totalW = cols * (NODE_W + COL_GAP) + 40;
  const totalH = (Math.ceil(data.nodes.length / cols)) * (NODE_H + ROW_GAP) + 40;
  const posMap = new Map(positions.map((p) => [p.id, p]));

  return (
    <div className="rounded-xl border border-border bg-surface p-4 overflow-auto">
      {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
      {data.nodes.length === 0 ? (
        <p className="text-sm text-text-secondary text-center py-4">No monitors configured. Add monitors in the config panel.</p>
      ) : (
        <svg width={totalW} height={totalH} className="block mx-auto" style={{ minHeight: 80 }} role="img" aria-label={label ?? "Service dependency map"}>
          {/* Edges */}
          {data.edges.map((e, i) => {
            const src = posMap.get(e.source);
            const tgt = posMap.get(e.target);
            if (!src || !tgt) return null;
            const x1 = src.x + NODE_W / 2;
            const y1 = src.y + NODE_H / 2;
            const x2 = tgt.x + NODE_W / 2;
            const y2 = tgt.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const lvl = nodeLevel(e.source);
            const c = lvl === "green" ? "#4ade80" : lvl === "yellow" ? "#facc15" : "#f87171";
            return (
              <g key={i}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={1.5} strokeOpacity={0.5} strokeDasharray={lvl === "red" ? "4 3" : undefined} />
                {e.label && (
                  <text x={mx} y={my - 4} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.45)">{e.label}</text>
                )}
              </g>
            );
          })}
          {/* Nodes */}
          {data.nodes.map((n) => {
            const pos = posMap.get(n.id);
            if (!pos) return null;
            const c = levelColor(n.level);
            return (
              <g key={n.id}>
                <rect
                  x={pos.x} y={pos.y} width={NODE_W} height={NODE_H} rx={8}
                  fill={c.bg} stroke={c.ring} strokeWidth={1.5}
                />
                <circle cx={pos.x + 14} cy={pos.y + 14} r={4} fill={c.ring} className={n.level === "red" ? "animate-pulse" : ""} />
                <text x={pos.x + 24} y={pos.y + 18} fontSize={10} fill={c.text} fontWeight={600}>{n.name.length > 14 ? n.name.slice(0, 14) + "…" : n.name}</text>
                <text x={pos.x + 10} y={pos.y + 36} fontSize={9} fill="rgba(255,255,255,0.45)">{n.type}</text>
                {n.latencyMs != null && (
                  <text x={pos.x + NODE_W - 8} y={pos.y + 36} fontSize={9} fill="rgba(255,255,255,0.35)" textAnchor="end">{n.latencyMs}ms</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// ── Multi-Environment Status ──────────────────────────────────────────────

export function MultiEnvironmentStatus({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    environments: Array<{
      env: string;
      summary: "operational" | "degraded" | "outage";
      total: number;
      up: number;
      monitors: Array<{ id: string; name: string; level: string }>;
    }>;
  } | undefined;

  const label = widget.config.label as string | undefined;
  const showMonitors = widget.config.showMonitors as boolean | undefined;

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-sm text-text-secondary">Loading…</p>
      </div>
    );
  }

  const summaryStyle = (s: string) =>
    s === "operational" ? "bg-green-500/15 text-green-400 border-green-500/30"
    : s === "degraded" ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
    : "bg-red-500/15 text-red-400 border-red-500/30";

  const dotColor = (lvl: string) =>
    lvl === "green" ? "bg-green-400" : lvl === "yellow" ? "bg-yellow-400" : "bg-red-400";

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
      {data.environments.length === 0 ? (
        <p className="text-sm text-text-secondary text-center py-4">No environments configured. Set envMonitors in config.</p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(200px, 1fr))` }}>
          {data.environments.map((env) => (
            <div key={env.env} className="rounded-lg border border-border bg-surface-elevated p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-text-primary capitalize">{env.env}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${summaryStyle(env.summary)}`}>
                  {env.summary}
                </span>
              </div>
              <p className="text-xs text-text-muted mb-2">{env.up}/{env.total} services up</p>
              {showMonitors && env.monitors.length > 0 && (
                <div className="space-y-1 mt-2 pt-2 border-t border-border/50">
                  {env.monitors.map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotColor(m.level)}`} />
                      <span className="text-xs text-text-secondary truncate">{m.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Region Status Map ────────────────────────────────────────────────────

export function RegionStatusMap({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    regions: { region: string; status: "operational" | "degraded" | "outage"; monitorCount: number; upCount: number }[];
  } | undefined;

  const title = (widget.config.label as string) || "Region Status";

  if (!raw || !raw.regions?.length) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-6 text-center space-y-2">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="text-xs text-text-secondary">No regions configured. Add regionMonitors in widget config.</div>
      </div>
    );
  }

  const statusConfig = {
    operational: { color: "bg-green-500", textColor: "text-green-400", label: "Operational", dot: "●" },
    degraded: { color: "bg-yellow-400", textColor: "text-yellow-400", label: "Degraded", dot: "●" },
    outage: { color: "bg-red-500", textColor: "text-red-400", label: "Outage", dot: "●" },
  } as const;

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {raw.regions.map((r) => {
          const cfg = statusConfig[r.status];
          return (
            <div key={r.region} className="rounded-lg border border-border/60 bg-surface-elevated/30 p-3 space-y-1">
              <div className="text-xs font-medium text-text-primary truncate">{r.region}</div>
              <div className={`text-xs font-semibold ${cfg.textColor} flex items-center gap-1`}>
                <span className="text-[10px]">{cfg.dot}</span>
                {cfg.label}
              </div>
              <div className="text-xs text-text-muted">{r.upCount}/{r.monitorCount} up</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Third-Party Dependencies ─────────────────────────────────────────────

export function ThirdPartyDependencies({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    services: { name: string; url: string; status: "up" | "down" | "unknown"; httpStatus: number; responseMs: number }[];
    checkedAt: string;
  } | undefined;

  const title = (widget.config.label as string) || "Third-Party Dependencies";

  if (!raw || !raw.services?.length) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-6 text-center space-y-2">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="text-xs text-text-secondary">No services configured. Add services array in widget config.</div>
      </div>
    );
  }

  const getDomain = (url: string) => {
    try { return new URL(url).hostname; } catch { return url; }
  };

  const statusDot = (s: "up" | "down" | "unknown") => {
    if (s === "up") return <span className="text-green-400 text-sm">●</span>;
    if (s === "down") return <span className="text-red-400 text-sm">●</span>;
    return <span className="text-gray-400 text-sm">●</span>;
  };

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        {raw.checkedAt && (
          <div className="text-xs text-text-muted">
            {new Date(raw.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>
      <div className="space-y-2">
        {raw.services.map((svc, i) => (
          <div key={i} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
            <div className="flex-shrink-0">{statusDot(svc.status)}</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-text-primary truncate">{svc.name}</div>
              <div className="text-xs text-text-muted truncate">{getDomain(svc.url)}</div>
            </div>
            <div className="flex-shrink-0 text-right">
              {svc.httpStatus > 0 && (
                <div className={`text-xs font-mono ${svc.httpStatus < 400 ? "text-green-400" : "text-red-400"}`}>
                  {svc.httpStatus}
                </div>
              )}
              {svc.responseMs > 0 && (
                <div className="text-xs text-text-muted">{svc.responseMs}ms</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Security Advisory ────────────────────────────────────────────────────

export function SecurityAdvisory({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    advisories: { ghsaId: string; summary: string; severity: "critical" | "high" | "medium" | "low"; publishedAt: string; link: string }[];
    checkedAt: string;
    packageName: string;
    error?: string;
  } | undefined;

  const title = (widget.config.label as string) || "Security Advisories";

  if (!raw) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-sm text-text-secondary text-center">
        No data available
      </div>
    );
  }

  const severityConfig = {
    critical: { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30", label: "Critical" },
    high: { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30", label: "High" },
    medium: { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30", label: "Medium" },
    low: { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30", label: "Low" },
  } as const;

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        {raw.packageName && <div className="text-xs text-text-muted font-mono">{raw.packageName}</div>}
      </div>
      {raw.error && (
        <div className="text-xs text-yellow-400 bg-yellow-500/10 rounded-lg px-3 py-2">{raw.error}</div>
      )}
      {raw.advisories.length === 0 && !raw.error && (
        <div className="flex items-center gap-2 text-green-400 py-2">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">No known vulnerabilities</span>
        </div>
      )}
      {raw.advisories.length > 0 && (
        <div className="space-y-2">
          {raw.advisories.map((a) => {
            const cfg = severityConfig[a.severity] ?? severityConfig.low;
            return (
              <div key={a.ghsaId} className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3 space-y-1`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-bold uppercase ${cfg.text}`}>{cfg.label}</span>
                  <span className="text-xs font-mono text-text-muted">{a.ghsaId}</span>
                </div>
                <div className="text-xs text-text-primary leading-relaxed line-clamp-2">{a.summary}</div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">{new Date(a.publishedAt).toLocaleDateString()}</span>
                  <a href={a.link} target="_blank" rel="noreferrer noopener" className="text-xs text-accent hover:underline">
                    View →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Table of Contents ────────────────────────────────────────────────────

export function TableOfContents({ widget }: WidgetProps) {
  const title = (widget.config.label as string) || "Contents";
  const items = (widget.config.items as Array<{ label: string; anchor: string }>) ?? [];

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-sm text-text-secondary text-center">
        No items configured. Add items via the config panel.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-2">
      <div className="text-sm font-semibold text-text-primary mb-3">{title}</div>
      <ol className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 group">
            <span className="w-5 h-5 rounded-full bg-accent/10 text-accent text-xs font-semibold flex items-center justify-center flex-shrink-0">
              {i + 1}
            </span>
            <a
              href={`#${item.anchor}`}
              className="text-sm text-text-secondary hover:text-accent transition-colors group-hover:underline underline-offset-2"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Page Navigation ───────────────────────────────────────────────────────

export function PageNavigation({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    pages?: Array<{ slug: string; title: string; description: string | null }>;
  } | undefined;

  const title = (widget.config.label as string) || "Other Status Pages";
  const pages = raw?.pages ?? [];

  if (pages.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center space-y-1">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="text-xs text-text-secondary">No other published pages found.</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
        {pages.map((page) => (
          <a
            key={page.slug}
            href={`/status/${page.slug}`}
            className="group flex items-center gap-3 rounded-lg border border-border/60 bg-bg/40 px-3 py-2.5 hover:border-accent/40 hover:bg-accent/5 transition-all"
          >
            <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors truncate">{page.title}</div>
              {page.description && (
                <div className="text-xs text-text-secondary truncate">{page.description}</div>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Column Layout ────────────────────────────────────────────────────────

export function ColumnLayout({ widget }: WidgetProps) {
  const columns = Math.min(Math.max((widget.config.columns as number) ?? 2, 2), 4);
  const title = (widget.config.label as string) || "";
  const items = (widget.config.items as Array<{ heading?: string; body: string }>) ?? [];

  const gridClass =
    columns === 2
      ? "grid-cols-1 sm:grid-cols-2"
      : columns === 3
      ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
      : "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      {title && <div className="text-sm font-semibold text-text-primary">{title}</div>}
      <div className={`grid gap-4 ${gridClass}`}>
        {items.length > 0 ? (
          items.map((col, i) => (
            <div key={i} className="space-y-1.5">
              {col.heading && (
                <div className="text-xs font-semibold text-accent uppercase tracking-wide">{col.heading}</div>
              )}
              <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">{col.body}</p>
            </div>
          ))
        ) : (
          Array.from({ length: columns }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border/60 bg-bg/40 p-3 min-h-[80px] flex items-center justify-center">
              <span className="text-xs text-text-secondary">Column {i + 1}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Sticky Header ─────────────────────────────────────────────────────────

export function StickyHeader({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    status?: "operational" | "degraded" | "outage";
    monitorCount?: number;
  } | undefined;

  const title = (widget.config.label as string) || "System Status";
  const status = raw?.status ?? "operational";

  const statusConfig = {
    operational: { label: "All Systems Operational", color: "text-green-400", dot: "bg-green-400", bg: "bg-green-400/10" },
    degraded: { label: "Partial Degradation", color: "text-yellow-400", dot: "bg-yellow-400", bg: "bg-yellow-400/10" },
    outage: { label: "Major Outage", color: "text-red-400", dot: "bg-red-400 animate-pulse", bg: "bg-red-400/10" },
  };

  const cfg = statusConfig[status];

  return (
    <div className={`rounded-xl border border-border ${cfg.bg} px-5 py-3 flex items-center justify-between gap-4`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
        <span className="text-sm font-semibold text-text-primary truncate">{title}</span>
      </div>
      <span className={`text-sm font-medium flex-shrink-0 ${cfg.color}`}>{cfg.label}</span>
    </div>
  );
}

// ── Main renderer ────────────────────────────────────────────────────────

function getScopedMonitors(widget: Widget, monitors: MonitorSummary[]): MonitorSummary[] {
  const ids = widget.config.monitorIds as string[] | undefined;
  const singleId = widget.config.monitorId as string | undefined;
  const tag = widget.config.tag as string | undefined;
  const folderId = widget.config.folderId as string | undefined;
  const monitorType = widget.config.monitorType as string | undefined;

  let scoped = monitors;
  if (ids?.length) scoped = scoped.filter((m) => ids.includes(m.id));
  else if (singleId) scoped = scoped.filter((m) => m.id === singleId);
  if (tag) scoped = scoped.filter((m) => m.tags?.includes(tag));
  if (folderId) scoped = scoped.filter((m) => m.folderId === folderId);
  if (monitorType) scoped = scoped.filter((m) => m.type === monitorType);
  return scoped;
}

function passesVisibilityRule(widget: Widget, scopedMonitors: MonitorSummary[]): boolean {
  const rule = (widget.config.visibility as string | undefined) ?? "always";
  if (rule === "always") return true;
  if (scopedMonitors.length === 0) return false;

  const hasRed = scopedMonitors.some((m) => m.level === "red");
  const hasYellow = scopedMonitors.some((m) => m.level === "yellow");

  if (rule === "outage") return hasRed;
  if (rule === "degraded") return !hasRed && hasYellow;
  if (rule === "operational") return !hasRed && !hasYellow;
  return true;
}

function monitorDetailHref(widget: Widget, scopedMonitors: MonitorSummary[]): string | null {
  const singleId = widget.config.monitorId as string | undefined;
  const firstId = singleId ?? (widget.config.monitorIds as string[] | undefined)?.[0] ?? scopedMonitors[0]?.id;
  return firstId ? `/monitors/${firstId}` : null;
}

export function renderWidget(widget: Widget, monitors: MonitorSummary[], extra?: Partial<ExtraData>): React.ReactNode {
  const fullExtra: ExtraData = { incidents: [], maintenance: [], recentChecks: [], widgetDataById: {}, ...extra };
  const props: WidgetProps = { widget, monitors, extra: fullExtra };
  const scopedMonitors = getScopedMonitors(widget, monitors);

  if (Boolean(widget.config.hideWhenNoData) && scopedMonitors.length === 0) {
    return null;
  }
  if (!passesVisibilityRule(widget, scopedMonitors)) {
    return null;
  }

  let content: React.ReactNode;
  // Wrap in error boundary so one broken widget doesn't crash the page
  const wrapError = (node: React.ReactNode) => (
    <WidgetErrorBoundary widgetType={widget.type}>{node}</WidgetErrorBoundary>
  );
  switch (widget.type) {
    case "overall-status":
    case "overall-system-status":
      content = <OverallSystemStatus {...props} />;
      break;
    case "current-status-badge":
      content = <CurrentStatusBadge {...props} />;
      break;
    case "multi-monitor-status-grid":
      content = <MultiMonitorStatusGrid {...props} />;
      break;
    case "active-incident-banner":
      content = <ActiveIncidentBanner {...props} />;
      break;
    case "uptime-bar":
      content = <UptimeBar {...props} />;
      break;
    case "uptime-timeline":
      content = <UptimeTimeline {...props} />;
      break;
    case "sla-summary":
      content = <SLASummary {...props} />;
      break;
    case "response-time-chart":
      content = <ResponseTimeChart {...props} />;
      break;
    case "response-time-heatmap":
      content = <ResponseTimeHeatmap {...props} />;
      break;
    case "check-history-feed":
      content = <CheckHistoryFeed {...props} />;
      break;
    case "incident-history":
      content = <IncidentHistory {...props} />;
      break;
    case "text-block":
      content = <TextBlock {...props} />;
      break;
    case "scheduled-maintenance":
      content = <ScheduledMaintenance {...props} />;
      break;
    case "monitor-group":
    case "monitor-group-status":
      content = <MonitorGroup {...props} />;
      break;
    case "multi-status-badges":
      content = <MultiStatusBadges {...props} />;
      break;
    case "version-status-grid":
      content = <VersionStatusGrid {...props} />;
      break;
    case "version-check-badge":
      content = <VersionCheckBadge {...props} />;
      break;
    case "update-summary":
      content = <UpdateSummary {...props} />;
      break;
    case "component-status-list":
      content = <ComponentStatusList {...props} />;
      break;
    case "rolling-uptime-cards":
      content = <RollingUptimeCards {...props} />;
      break;
    case "status-history-ribbon":
      content = <StatusHistoryRibbon {...props} />;
      break;
    case "uptime-percentage-card":
      content = <UptimePercentageCard {...props} />;
      break;
    case "service-health-matrix":
      content = <ServiceHealthMatrix {...props} />;
      break;
    case "aggregate-health-score":
      content = <AggregateHealthScore {...props} />;
      break;
    case "latency-percentiles-card":
      content = <LatencyPercentilesCard {...props} />;
      break;
    case "downtime-log":
      content = <DowntimeLog {...props} />;
      break;
    case "active-incident-count":
      content = <ActiveIncidentCount {...props} />;
      break;
    case "mttr-mttf-cards":
      content = <MttrMttfCards {...props} />;
      break;
    case "sla-compliance-table":
      content = <SLAComplianceTable {...props} />;
      break;
    case "uptime-heatmap":
      content = <UptimeHeatmap {...props} />;
      break;
    case "incident-timeline":
      content = <IncidentTimeline {...props} />;
      break;
    case "ssl-certificate-status":
      content = <SSLCertificateStatus {...props} />;
      break;
    case "incident-severity-distribution":
      content = <IncidentSeverityDistribution {...props} />;
      break;
    case "incident-duration-stats":
      content = <IncidentDurationStats {...props} />;
      break;
    case "post-mortem-card":
      content = <PostMortemCard {...props} />;
      break;
    case "performance-trend":
      content = <PerformanceTrend {...props} />;
      break;
    case "apdex-score":
      content = <ApdexScore {...props} />;
      break;
    case "throughput-counter":
      content = <ThroughputCounter {...props} />;
      break;
    case "response-time-comparison":
      content = <ResponseTimeComparison {...props} />;
      break;
    case "uptime-comparison-chart":
      content = <UptimeComparisonChart {...props} />;
      break;
    case "next-maintenance-countdown":
      content = <NextMaintenanceCountdown {...props} />;
      break;
    case "maintenance-impact-list":
      content = <MaintenanceImpactList {...props} />;
      break;
    case "version-timeline":
      content = <VersionTimeline {...props} />;
      break;
    case "outdated-components-alert":
      content = <OutdatedComponentsAlert {...props} />;
      break;
    case "version-comparison-table":
      content = <VersionComparisonTable {...props} />;
      break;
    case "dns-resolution-time":
      content = <DNSResolutionTime {...props} />;
      break;
    case "gauge":
      content = <Gauge {...props} />;
      break;
    case "stats-grid":
      content = <StatsGrid {...props} />;
      break;
    case "metric-counter": {
      const widgetData = fullExtra.widgetDataById[widget.id] as {
        label?: string;
        value?: string | number;
        suffix?: string;
      } | undefined;
      const value = widgetData?.value ?? '—';
      const suffix = widgetData?.suffix ?? '';
      const label = (widgetData?.label as string | undefined) ?? (widget.config.label as string | undefined) ?? 'Metric';
      content = (
        <div className="rounded-xl border border-border bg-surface p-4 text-center">
          <div className="text-3xl font-bold tabular-nums text-text-primary">
            {value}{suffix ? <span className="ml-1 text-sm text-text-secondary">{suffix}</span> : null}
          </div>
          <div className="mt-1 text-xs text-text-secondary">{label}</div>
        </div>
      );
      break;
    }
    case "metric-comparison-row":
      content = <MetricComparisonRow {...props} />;
      break;
    case "sparkline-row":
      content = <SparklineRow {...props} />;
      break;
    case "progress-ring":
      content = <ProgressRing {...props} />;
      break;
    case "announcement-bar":
      content = <AnnouncementBar {...props} />;
      break;
    case "link-list":
      content = <LinkList {...props} />;
      break;
    case "faq-accordion":
      content = <FaqAccordion {...props} />;
      break;
    case "social-links":
      content = <SocialLinks {...props} />;
      break;
    case "embed-iframe":
      content = <EmbedIframe {...props} />;
      break;
    case "subscriber-form":
      content = <SubscriberForm {...props} />;
      break;
    case "countdown":
      content = <Countdown {...props} />;
      break;
    case "last-updated-footer": {
      const widgetData = fullExtra.widgetDataById[widget.id] as {
        lastUpdated?: string;
        autoRefreshSec?: number;
      } | undefined;
      const ts = widgetData?.lastUpdated;
      const rel = ts ? formatRelative(ts) : 'just now';
      const every = widgetData?.autoRefreshSec;
      content = (
        <div className="text-center text-xs text-text-secondary">
          Last updated {rel}{typeof every === 'number' && every > 0 ? ` · refreshes every ${every}s` : ''}
        </div>
      );
      break;
    }
    case "divider":
      content = <Divider />;
      break;
    case "maintenance-calendar":
      content = <MaintenanceCalendar {...props} />;
      break;
    case "changelog-widget":
      content = <ChangelogWidget {...{ ...props, monitors: scopedMonitors }} />;
      break;
    case "image-banner":
      content = <ImageBanner {...props} />;
      break;
    case "data-table":
      content = <DataTable {...{ ...props, monitors: scopedMonitors }} />;
      break;
    case "rss-feed-widget":
      content = <RssFeedWidget {...props} />;
      break;
    case "code-block":
      content = <CodeBlock {...props} />;
      break;
    case "video-embed":
      content = <VideoEmbed {...props} />;
      break;
    case "collapsible-section":
      content = <CollapsibleSection {...props} />;
      break;
    case "dependency-map":
      content = <DependencyMap {...props} />;
      break;
    case "multi-environment-status":
      content = <MultiEnvironmentStatus {...props} />;
      break;
    case "tab-container":
      content = <TabContainer {...props} />;
      break;
    case "region-status-map":
      content = <RegionStatusMap {...props} />;
      break;
    case "third-party-dependencies":
      content = <ThirdPartyDependencies {...props} />;
      break;
    case "security-advisory":
      content = <SecurityAdvisory {...props} />;
      break;
    case "column-layout":
      content = <ColumnLayout {...props} />;
      break;
    case "sticky-header":
      content = <StickyHeader {...props} />;
      break;
    case "table-of-contents":
      content = <TableOfContents {...props} />;
      break;
    case "page-navigation":
      content = <PageNavigation {...props} />;
      break;
    case "offline-banner": {
      const widgetData = fullExtra.widgetDataById[widget.id] as { config?: Record<string, unknown> } | undefined;
      const cfg = widgetData?.config ?? widget.config;
      content = (
        <OfflineBannerWidget
          message={(cfg.message as string | undefined)}
          bgColor={(cfg.bgColor as string | undefined)}
          textColor={(cfg.textColor as string | undefined)}
        />
      );
      break;
    }
    case "custom-metric-chart": {
      const widgetData = fullExtra.widgetDataById[widget.id] as {
        labels: string[];
        values: number[];
        unit: string;
        chartType: string;
      } | undefined;
      content = (
        <CustomMetricChart
          data={widgetData}
          title={(widget.config.title as string | undefined)}
          subtitle={(widget.config.subtitle as string | undefined)}
          chartType={(widget.config.chartType as string | undefined)}
        />
      );
      break;
    }
    default:
      content = (
        <div className="rounded-xl border border-border bg-surface/50 p-4 text-center text-sm text-text-secondary">
          Unknown widget: {widget.type}
        </div>
      );
      break;
  }

  const clickAction = (widget.config.clickAction as string | undefined) ?? "none";
  const clickUrl = widget.config.clickUrl as string | undefined;
  const href = clickAction === "external-url"
    ? clickUrl
    : clickAction === "monitor-detail"
      ? monitorDetailHref(widget, scopedMonitors)
      : undefined;

  const mobileBehavior = (widget.config.mobileBehavior as string | undefined) ?? "normal";
  const mobileClass =
    mobileBehavior === "hidden"
      ? "max-sm:hidden"
      : mobileBehavior === "full-width"
        ? "max-sm:w-full"
        : mobileBehavior === "collapsed"
          ? "max-sm:[&>*]:max-h-28 max-sm:[&>*]:overflow-hidden"
          : "";

  const wrapperStyle: React.CSSProperties = {
    borderRadius: typeof widget.config.borderRadius === "number" ? `${widget.config.borderRadius}px` : undefined,
    padding: typeof widget.config.padding === "number" ? `${widget.config.padding}px` : undefined,
  };

  const wrapperClass = [
    mobileClass,
    widget.config.showBorder === true ? "border border-border" : "",
    href ? "cursor-pointer" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const wrapped = <div className={wrapperClass} style={wrapperStyle}>{wrapError(content)}</div>;

  if (!href) return wrapped;

  const external = clickAction === "external-url";
  return (
    <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer noopener" : undefined}>
      {wrapped}
    </a>
  );
}
