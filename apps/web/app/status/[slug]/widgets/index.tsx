// Widget renderer components for public status pages.
// All widgets receive widget config + live monitor data from the API.

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

  const config = {
    green: {
      label: "All Systems Operational",
      bg: "bg-green-500/10 border-green-500/20",
      text: "text-green-400",
      dot: "bg-green-400",
    },
    yellow: {
      label: "Partial Degradation",
      bg: "bg-yellow-500/10 border-yellow-500/20",
      text: "text-yellow-400",
      dot: "bg-yellow-400",
    },
    red: {
      label: "Major Outage",
      bg: "bg-red-500/10 border-red-500/20",
      text: "text-red-400",
      dot: "bg-red-400",
    },
  }[level];

  return (
    <div className={`flex items-center gap-4 rounded-2xl border p-6 ${config.bg}`}>
      <span className="relative flex h-4 w-4 shrink-0">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${config.dot}`} />
        <span className={`relative inline-flex h-4 w-4 rounded-full ${config.dot}`} />
      </span>
      <span className={`text-xl font-semibold ${config.text}`}>{config.label}</span>
      <span className="ml-auto text-sm text-text-secondary">
        {monitors.filter((m) => m.level === "green").length}/{monitors.length} operational
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
            <div className={`h-2 w-2 rounded-full flex-shrink-0 ${m.level === "green" ? "bg-success" : m.level === "yellow" ? "bg-warning" : "bg-danger"}`} />
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
  if (monitors.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-secondary">
        No monitors configured
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {monitors.map((m) => (
        <div key={m.id} className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2.5">
          <span className="truncate pr-2 text-sm font-medium text-text-primary">{m.name}</span>
          <LevelBadge level={m.level} />
        </div>
      ))}
    </div>
  );
}

// Active Incident Banner
export function ActiveIncidentBanner({ monitors, extra }: WidgetProps) {
  const activeIncidents = extra.incidents.filter(i => i.status !== "resolved");
  const down = monitors.filter((m) => m.level === "red");

  if (activeIncidents.length === 0 && down.length === 0) {
    return (
      <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-4 flex items-center gap-3">
        <span className="h-3 w-3 rounded-full bg-success" />
        <span className="text-sm font-medium text-success">All systems operational — no active incidents</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
      <p className="mb-3 font-semibold text-red-400">🔴 Active Incident{(activeIncidents.length + down.length) > 1 ? "s" : ""}</p>
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

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        <span className="text-sm font-semibold text-text-primary">{uptimePct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-bg">
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${uptimePct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-text-secondary">Last {periodDays} days{typeof widgetData?.total === "number" ? ` · ${widgetData.total} checks` : ""}</p>
    </div>
  );
}

// Uptime Timeline — per-day status bars from real MonitorRun data
export function UptimeTimeline({ widget, monitors, extra }: WidgetProps) {
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
    ? timeline.map((d) => ({
        date: d.date,
        level: d.level,
        title: d.level === "no-data"
          ? `${d.date}: No data`
          : d.level === "green"
          ? `${d.date}: All checks passed${d.counts ? ` (${d.counts.green} ok)` : ""}`
          : d.level === "yellow"
          ? `${d.date}: Some failures${d.counts ? ` (${d.counts.yellow + d.counts.red} failed / ${d.counts.green + d.counts.yellow + d.counts.red} checks)` : ""}`
          : `${d.date}: Majority failed${d.counts ? ` (${d.counts.red + d.counts.yellow} failed / ${d.counts.green + d.counts.yellow + d.counts.red} checks)` : ""}`,
      }))
    : Array.from({ length: days }, (_, i) => ({
        date: `Day ${i + 1}`,
        level: "no-data",
        title: `Day ${i + 1}: No data`,
      }));

  const upDays = squares.filter((s) => s.level === "green").length;
  const dataDays = squares.filter((s) => s.level !== "no-data").length;
  const uptimePct = dataDays > 0 ? Math.round((upDays / dataDays) * 1000) / 10 : null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        <span className="text-xs text-text-secondary">
          {days}-day history{uptimePct !== null ? ` · ${uptimePct}% up` : ""}
        </span>
      </div>
      <div className="flex gap-[3px] flex-wrap">
        {squares.map((s, i) => (
          <div
            key={i}
            className={`h-3 w-3 rounded-sm transition-opacity hover:opacity-80 ${
              s.level === "green"
                ? "bg-green-500"
                : s.level === "yellow"
                ? "bg-yellow-500"
                : s.level === "red"
                ? "bg-red-500"
                : "bg-border"
            }`}
            title={s.title}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-text-secondary">
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
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            pass
              ? "bg-green-500/15 text-green-400"
              : "bg-red-500/15 text-red-400"
          }`}
        >
          {pass ? "✓ Met" : "✗ Missed"}
        </span>
      </div>
      <div className="flex items-end gap-4 mb-3">
        <div>
          <p className={`text-3xl font-semibold tabular-nums ${pass ? "text-green-400" : "text-red-400"}`}>
            {actual.toFixed(2)}%
          </p>
          <p className="text-xs text-text-secondary">
            Actual · {periodDays}d
            {totalChecks !== null ? ` · ${totalChecks} checks` : ""}
          </p>
        </div>
        <div className="pb-0.5">
          <p className="text-lg font-medium text-text-secondary tabular-nums">{target}%</p>
          <p className="text-xs text-text-secondary">Target</p>
        </div>
      </div>
      {/* Downtime budget bar */}
      {budgetUsed !== null && allowedDownMin !== null && (
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg mb-1">
            <div
              className={`h-full rounded-full transition-all ${budgetUsed >= 90 ? "bg-red-400" : budgetUsed >= 60 ? "bg-yellow-400" : "bg-green-400"}`}
              style={{ width: `${budgetUsed}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-text-secondary">
            <span>Budget used: {budgetUsed}%</span>
            {remainingDownMin !== null && (
              <span>{formatMinutes(remainingDownMin)} remaining of {formatMinutes(allowedDownMin)} allowed</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Response Time Chart — real SVG sparkline from MonitorRun latencyMs values
export function ResponseTimeChart({ widget, monitors, extra }: WidgetProps) {
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
        <div className="flex h-20 items-center justify-center rounded-lg bg-bg">
          <span className="text-xs text-text-secondary">No latency data yet</span>
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
  if (checks.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-secondary">
        No check history available yet
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-medium text-text-primary">Recent Check Results</p>
      </div>
      <ul className="divide-y divide-border/60 max-h-80 overflow-y-auto">
        {checks.slice(0, 20).map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
            <LevelBadge level={c.level as "green" | "yellow" | "red"} />
            <span className="flex-1 truncate text-sm text-text-primary">{c.monitorName}</span>
            {c.message && <span className="truncate max-w-[200px] text-xs text-text-secondary">{c.message}</span>}
            {c.latencyMs !== null && (
              <span className="shrink-0 tabular-nums text-xs text-text-secondary">{c.latencyMs}ms</span>
            )}
            <span className="shrink-0 text-xs text-text-secondary">{formatRelative(c.checkedAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Incident History — real incidents from API
export function IncidentHistory({ extra }: WidgetProps) {
  const incidents = extra.incidents;
  const active = incidents.filter(i => i.status !== "resolved");
  const resolved = incidents.filter(i => i.status === "resolved");

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 text-sm font-medium text-text-primary">Incident History</p>
      {incidents.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-500/5 px-3 py-2.5">
          <span className="h-2 w-2 rounded-full bg-green-400" />
          <span className="text-sm text-green-400">No incidents in the last 30 days</span>
        </div>
      ) : (
        <div className="space-y-3">
          {active.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-danger uppercase tracking-wide">Active</p>
              {active.map(i => (
                <div key={i.id} className="rounded-lg bg-danger/5 border border-danger/20 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-danger animate-pulse" />
                    <span className="text-sm font-medium text-text-primary">{i.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${i.severity === "critical" ? "bg-danger/15 text-danger" : i.severity === "major" ? "bg-warning/15 text-warning" : "bg-accent/15 text-accent"}`}>{i.severity}</span>
                    <span className="ml-auto text-xs text-text-secondary">{formatRelative(i.createdAt)}</span>
                  </div>
                  {i.monitors.length > 0 && <p className="text-xs text-text-secondary mt-1">Affected: {i.monitors.map(m => m.name).join(", ")}</p>}
                  {i.updates[0] && <p className="text-xs text-text-secondary mt-1">{i.updates[0].message}</p>}
                </div>
              ))}
            </div>
          )}
          {resolved.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-success uppercase tracking-wide">Resolved</p>
              {resolved.slice(0, 5).map(i => (
                <div key={i.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-elevated/30">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  <span className="text-sm text-text-primary flex-1 truncate">{i.title}</span>
                  <span className="text-xs text-text-secondary">{formatRelative(i.resolvedAt ?? i.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
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

  return (
    <div className={`rounded-xl border ${overallBorder(data.overallStatus)} ${overallBg(data.overallStatus)} overflow-hidden`}>
      {/* Overall header */}
      <div className="px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${dotColor(data.downCount > 0 ? "red" : data.degradedCount > 0 ? "yellow" : "green")}`} />
          <span className={`text-sm font-bold ${overallColor(data.overallStatus)}`}>
            {label ?? overallLabel(data.overallStatus)}
          </span>
        </div>
      </div>
      {/* Component rows */}
      <div className="divide-y divide-border/30">
        {data.components.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className={`h-2 w-2 rounded-full flex-shrink-0 ${dotColor(c.level)}`} />
            <span className="text-sm text-text-primary flex-1 truncate">{c.name}</span>
            {c.latencyMs !== null && (
              <span className="text-xs font-mono text-text-secondary">{c.latencyMs}ms</span>
            )}
            <span className={`text-xs font-medium ${componentColor(c.status)}`}>
              {componentStatus(c.status)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Rolling Uptime Cards — row of cards: 24h / 7d / 30d / 90d uptime%
function RollingUptimeCards({ widget, extra }: WidgetProps) {
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
          <div key={c.label} className={`rounded-lg border ${uptimeBorder(c.uptimePct)} ${uptimeBg(c.uptimePct)} p-3 text-center`}>
            <div className={`text-xl font-bold tabular-nums ${uptimeColor(c.uptimePct)}`}>
              {c.uptimePct.toFixed(c.uptimePct >= 99.9 ? 2 : 1)}%
            </div>
            <div className="text-xs text-text-secondary mt-0.5 font-medium">{c.label}</div>
            {c.total > 0 && (
              <div className="text-[10px] text-text-muted mt-0.5">{c.total} checks</div>
            )}
          </div>
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
    <div className="rounded-xl border border-border bg-surface p-6 text-center">
      {label && <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">{label}</p>}
      <div className={`text-5xl font-bold tabular-nums ${uptimeColor}`}>
        {data.uptimePct.toFixed(2)}%
      </div>
      <div className="text-xs text-text-secondary mt-2">
        Uptime — last {data.periodDays}d
      </div>
      {data.trend !== "flat" || data.previousPct !== 100 ? (
        <div className={`mt-2 text-sm font-medium ${trendColor}`}>
          {trendArrow} {trendLabel}
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
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="text-left py-2 pr-4 text-text-secondary font-medium w-40">Service</th>
            {data.columns.map((col) => (
              <th key={col} className="text-center py-2 px-2 text-text-secondary font-medium min-w-[100px]">{col}</th>
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
          <svg width="140" height="140" viewBox="0 0 140 140" className="rotate-0">
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
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  function latencyColor(ms: number | null): string {
    if (ms === null) return "text-text-secondary";
    if (ms < 200) return "text-green-400";
    if (ms < 500) return "text-yellow-400";
    return "text-red-400";
  }

  function trend(current: number | null, prev: number | null): React.ReactNode {
    if (current === null || prev === null) return null;
    if (current > prev) return <span className="text-red-400 text-sm">↑</span>;
    if (current < prev) return <span className="text-green-400 text-sm">↓</span>;
    return null;
  }

  const cells: Array<{ label: string; value: number | null; prev: number | null }> = [
    { label: "P50", value: data.p50, prev: data.prevP50 },
    { label: "P95", value: data.p95, prev: data.prevP95 },
    { label: "P99", value: data.p99, prev: data.prevP99 },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
      <div className="grid grid-cols-3 gap-3">
        {cells.map((c) => (
          <div key={c.label} className="text-center">
            <p className="text-xs font-medium text-text-secondary mb-1">{c.label}</p>
            <div className="flex items-center justify-center gap-1">
              <span className={`text-2xl font-bold tabular-nums ${latencyColor(c.value)}`}>
                {c.value !== null ? `${c.value}ms` : "—"}
              </span>
              {trend(c.value, c.prev)}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-text-muted text-center">
        {data.sampleCount} samples · last {data.periodDays}d
      </p>
    </div>
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
    return `${h}h${m % 60 > 0 ? `${m % 60}m` : ""}`;
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {label && <p className="text-sm font-semibold text-text-primary mb-3">{label}</p>}
      <div className="grid grid-cols-2 gap-3">
        {/* MTTR */}
        <div className="rounded-lg border border-border/50 bg-surface/50 p-4 text-center">
          <p className="text-xs font-medium text-text-secondary mb-1">MTTR</p>
          <p className="text-3xl font-bold tabular-nums text-text-primary">{formatDuration(data.mttrMs)}</p>
          <p className="text-[10px] text-text-muted mt-1">Mean Time to Recovery</p>
          <p className="text-[10px] text-text-muted">{data.recoveryCount} event{data.recoveryCount !== 1 ? "s" : ""}</p>
        </div>
        {/* MTTF */}
        <div className="rounded-lg border border-border/50 bg-surface/50 p-4 text-center">
          <p className="text-xs font-medium text-text-secondary mb-1">MTTF</p>
          <p className="text-3xl font-bold tabular-nums text-text-primary">{formatDuration(data.mttfMs)}</p>
          <p className="text-[10px] text-text-muted mt-1">Mean Time to Failure</p>
          <p className="text-[10px] text-text-muted">{data.failureCount} event{data.failureCount !== 1 ? "s" : ""}</p>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-text-muted text-center">Last {data.periodDays}d</p>
    </div>
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
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left px-4 py-2 text-text-secondary font-medium">Monitor</th>
                <th className="text-right px-4 py-2 text-text-secondary font-medium">Target</th>
                <th className="text-right px-4 py-2 text-text-secondary font-medium">Actual</th>
                <th className="text-center px-4 py-2 text-text-secondary font-medium">Status</th>
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
          <svg width="120" height="120" viewBox="0 0 120 120">
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
              <div className={`h-2 w-2 rounded-full flex-shrink-0 ${m.level === "green" ? "bg-success" : m.level === "yellow" ? "bg-warning" : "bg-danger"}`} />
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
      <div className={`h-3 w-3 rounded-full flex-shrink-0 ${diff === "up-to-date" ? "bg-success" : diff === "major" ? "bg-danger" : "bg-warning"}`} />
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
    case "divider":
      content = <Divider />;
      break;
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

  const wrapped = <div className={wrapperClass} style={wrapperStyle}>{content}</div>;

  if (!href) return wrapped;

  const external = clickAction === "external-url";
  return (
    <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer noopener" : undefined}>
      {wrapped}
    </a>
  );
}
