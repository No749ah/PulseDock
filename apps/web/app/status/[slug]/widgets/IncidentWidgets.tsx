// Incident & maintenance widgets — banners, history, timelines, countdowns
import React from "react";
import {
  type WidgetProps,
  timeAgo,
  formatRelative,
  StatusDot,
  SeverityBadge,
  WidgetCard,
  TrendArrow,
  AnimatedNumber,
} from "./shared";
import { CountdownWidget } from "./CountdownWidget";

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

export function ActiveIncidentCount({ widget, extra }: WidgetProps) {
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

export function IncidentTimeline({ widget, extra }: WidgetProps) {
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

export function IncidentSeverityDistribution({ widget, extra }: WidgetProps) {
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


export function IncidentDurationStats({ widget, extra }: WidgetProps) {
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


export function PostMortemCard({ widget, extra }: WidgetProps) {
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

