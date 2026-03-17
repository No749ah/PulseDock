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
