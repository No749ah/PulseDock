// Version widgets — version tracking, changelogs, outdated component alerts
import React from "react";
import {
  type WidgetProps,
  type MonitorSummary,
  LevelBadge,
  WidgetCard,
  timeAgo,
  levelLabel,
  formatRelative,
} from "./shared";

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

export function VersionStatusGrid({ monitors }: WidgetProps) {
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

export function VersionCheckBadge({ widget, monitors }: WidgetProps) {
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

export function UpdateSummary({ monitors }: WidgetProps) {
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

