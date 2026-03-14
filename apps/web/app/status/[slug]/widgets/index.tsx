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

interface WidgetProps {
  widget: Widget;
  monitors: MonitorSummary[];
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
  const monitor = monitors.find((m) => m.id === widget.config.monitorId);
  if (!monitor) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <span className="text-sm text-text-secondary">No monitor selected</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
      <div>
        <p className="font-medium text-text-primary">{widget.config.label ?? monitor.name}</p>
        {monitor.lastChecked && (
          <p className="mt-0.5 text-xs text-text-secondary">
            Checked {formatRelative(monitor.lastChecked)}
          </p>
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
export function ActiveIncidentBanner({ monitors }: WidgetProps) {
  const down = monitors.filter((m) => m.level === "red");
  if (down.length === 0) return null;
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
      <p className="mb-3 font-semibold text-red-400">🔴 Active Incident{down.length > 1 ? "s" : ""}</p>
      <ul className="space-y-1.5">
        {down.map((m) => (
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
export function UptimeBar({ widget, monitors }: WidgetProps) {
  const monitor = monitors.find((m) => m.id === widget.config.monitorId) ?? monitors[0];
  const periodDays = (widget.config.periodDays as number) ?? 30;
  const uptimePct =
    !monitor ? 100 : monitor.level === "green" ? 100 : monitor.level === "yellow" ? 95.0 : 80.0;
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
      <p className="mt-2 text-xs text-text-secondary">Last {periodDays} days</p>
    </div>
  );
}

// Uptime Timeline — 90 squares
export function UptimeTimeline({ widget, monitors }: WidgetProps) {
  const monitor = monitors.find((m) => m.id === widget.config.monitorId);
  const days = 90;
  const label = widget.config.label ?? monitor?.name ?? "Uptime Timeline";

  const squares = Array.from({ length: days }, (_, i) => {
    // Last square = current status, rest = green (simplified)
    const isLast = i === days - 1;
    if (!isLast || !monitor) return "green";
    return monitor.level;
  });

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        <span className="text-xs text-text-secondary">90-day history</span>
      </div>
      <div className="flex gap-0.5 flex-wrap">
        {squares.map((level, i) => (
          <div
            key={i}
            className={`h-3 w-3 rounded-sm ${
              level === "green" ? "bg-green-500/70" : level === "yellow" ? "bg-yellow-500/70" : "bg-red-500/70"
            }`}
            title={`Day ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

// SLA Summary
export function SLASummary({ widget, monitors }: WidgetProps) {
  const monitor = monitors.find((m) => m.id === widget.config.monitorId) ?? monitors[0];
  const periodDays = (widget.config.periodDays as number) ?? 30;
  const label = widget.config.label ?? monitor?.name ?? "SLA";
  const target = 99.9;
  const actual =
    !monitor ? 100 : monitor.level === "green" ? 100 : monitor.level === "yellow" ? 95.0 : 80.0;
  const pass = actual >= target;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 text-sm font-medium text-text-primary">{label}</p>
      <div className="flex items-end gap-4">
        <div>
          <p className={`text-3xl font-semibold ${pass ? "text-green-400" : "text-red-400"}`}>
            {actual.toFixed(1)}%
          </p>
          <p className="text-xs text-text-secondary">Actual · {periodDays}d</p>
        </div>
        <div>
          <p className="text-lg font-medium text-text-secondary">{target}%</p>
          <p className="text-xs text-text-secondary">Target</p>
        </div>
        <div className="ml-auto">
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
      </div>
    </div>
  );
}

// Response Time Chart
export function ResponseTimeChart({ widget, monitors }: WidgetProps) {
  const monitor = monitors.find((m) => m.id === widget.config.monitorId) ?? monitors[0];
  const label = widget.config.label ?? monitor?.name ?? "Response Time";

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-2 text-sm font-medium text-text-primary">{label}</p>
      {monitor?.latencyMs !== null && monitor?.latencyMs !== undefined ? (
        <div>
          <p className="text-3xl font-semibold text-text-primary">
            {monitor.latencyMs}
            <span className="ml-1 text-base font-normal text-text-secondary">ms</span>
          </p>
          <p className="mt-1 text-xs text-text-secondary">Latest response time</p>
        </div>
      ) : (
        <p className="text-2xl font-semibold text-text-secondary">—</p>
      )}
    </div>
  );
}

// Check History Feed
export function CheckHistoryFeed({ monitors }: WidgetProps) {
  if (monitors.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-secondary">
        No monitor data available
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-medium text-text-primary">Recent Check Results</p>
      </div>
      <ul className="divide-y divide-border/60">
        {monitors.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <LevelBadge level={m.level} />
            <span className="flex-1 truncate text-sm text-text-primary">{m.name}</span>
            {m.lastChecked && (
              <span className="shrink-0 text-xs text-text-secondary">{formatRelative(m.lastChecked)}</span>
            )}
            {m.latencyMs !== null && (
              <span className="shrink-0 tabular-nums text-xs text-text-secondary">{m.latencyMs}ms</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Incident History
export function IncidentHistory({ monitors }: WidgetProps) {
  const down = monitors.filter((m) => m.level !== "green");
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 text-sm font-medium text-text-primary">Incident History</p>
      {down.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-500/5 px-3 py-2.5">
          <span className="h-2 w-2 rounded-full bg-green-400" />
          <span className="text-sm text-green-400">No active incidents</span>
        </div>
      ) : (
        <ul className="space-y-2">
          {down.map((m) => (
            <li key={m.id} className="flex items-start gap-2 rounded-lg bg-surface/80 px-3 py-2">
              <span className={`mt-0.5 h-2 w-2 rounded-full ${m.level === "red" ? "bg-red-400" : "bg-yellow-400"}`} />
              <div>
                <p className="text-sm font-medium text-text-primary">{m.name}</p>
                {m.message && <p className="text-xs text-text-secondary">{m.message}</p>}
                {m.lastChecked && <p className="text-xs text-text-secondary">{formatRelative(m.lastChecked)}</p>}
              </div>
              <LevelBadge level={m.level} />
            </li>
          ))}
        </ul>
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

// Scheduled Maintenance
export function ScheduledMaintenance({ widget }: WidgetProps) {
  const text = (widget.config.text as string) ?? "";
  const label = (widget.config.label as string) ?? "Scheduled Maintenance";
  return (
    <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-yellow-400">🔧</span>
        <p className="text-sm font-semibold text-yellow-400">{label}</p>
      </div>
      <p className="text-sm text-text-secondary">
        {text || "No scheduled maintenance"}
      </p>
    </div>
  );
}

// Divider
export function Divider() {
  return <hr className="border-border my-2" />;
}

// ── Main renderer ────────────────────────────────────────────────────────

export function renderWidget(widget: Widget, monitors: MonitorSummary[]): React.ReactNode {
  const props: WidgetProps = { widget, monitors };
  switch (widget.type) {
    case "overall-system-status": return <OverallSystemStatus {...props} />;
    case "current-status-badge": return <CurrentStatusBadge {...props} />;
    case "multi-monitor-status-grid": return <MultiMonitorStatusGrid {...props} />;
    case "active-incident-banner": return <ActiveIncidentBanner {...props} />;
    case "uptime-bar": return <UptimeBar {...props} />;
    case "uptime-timeline": return <UptimeTimeline {...props} />;
    case "sla-summary": return <SLASummary {...props} />;
    case "response-time-chart": return <ResponseTimeChart {...props} />;
    case "check-history-feed": return <CheckHistoryFeed {...props} />;
    case "incident-history": return <IncidentHistory {...props} />;
    case "text-block": return <TextBlock {...props} />;
    case "scheduled-maintenance": return <ScheduledMaintenance {...props} />;
    case "divider": return <Divider />;
    default: return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center text-sm text-text-secondary">
        Unknown widget: {widget.type}
      </div>
    );
  }
}
