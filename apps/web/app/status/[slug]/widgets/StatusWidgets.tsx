// Status widgets — overall status, badges, grids, component lists, health scores
import React from "react";
import { CheckCircle2 } from "lucide-react";
import {
  type WidgetProps,
  type MonitorSummary,
  LevelBadge,
  StatusDot,
  SeverityBadge,
  WidgetCard,
  timeAgo,
  formatRelative,
  isNoConfig,
  NoConfigPlaceholder,
} from "./shared";

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
        <span className="text-[10px] text-text-secondary/50 mt-0.5">
          as of {new Date().toISOString().slice(11, 16)} UTC
        </span>
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

export function ComponentStatusList({ widget, extra }: WidgetProps) {
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
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${dotColor(data.downCount > 0 ? "red" : data.degradedCount > 0 ? "yellow" : "green")}`} aria-hidden="true" />
            <span className={`text-sm font-bold ${overallColor(data.overallStatus)}`}>
              {headerLabel}
            </span>
          </div>
          {Boolean((data as Record<string, unknown>)?.fetchedAt) && (
            <span className="text-[10px] text-text-muted">{timeAgo((data as Record<string,unknown>).fetchedAt as string)}</span>
          )}
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

export function ServiceHealthMatrix({ widget, extra }: WidgetProps) {
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
      <div className="flex items-center justify-between mb-3">
        {label && <p className="text-sm font-semibold text-text-primary">{label}</p>}
        {Boolean((data as Record<string, unknown>)?.fetchedAt) && (
          <span className="text-[10px] text-text-muted ml-auto">{timeAgo((data as Record<string,unknown>).fetchedAt as string)}</span>
        )}
      </div>
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

export function AggregateHealthScore({ widget, extra }: WidgetProps) {
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
      <div className="flex items-center justify-between mb-3">
        {label && <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider text-center flex-1">{label}</p>}
        {Boolean((data as Record<string, unknown>)?.fetchedAt) && (
          <span className="text-[10px] text-text-muted ml-auto">{timeAgo((data as Record<string,unknown>).fetchedAt as string)}</span>
        )}
      </div>
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

export function MonitorGroup({ widget, monitors }: WidgetProps) {
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

export function MultiStatusBadges({ widget, monitors }: WidgetProps) {
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


export function SSLCertificateStatus({ widget, extra }: WidgetProps) {
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

