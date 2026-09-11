import React from "react";
import { Clock, Pencil, Trash2, Tag } from "lucide-react";
import { relativeTime } from "../../components/timeUtils";
import type { MonitorItem, MonitorRun } from "../types";

interface MonitorGridViewProps {
  monitors: MonitorItem[];
  runs: MonitorRun[];
  onEdit: (monitor: MonitorItem) => void;
  onDelete: (id: string) => void;
}

export function MonitorGridView({ monitors, runs, onEdit, onDelete }: MonitorGridViewProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {monitors.map((monitor) => {
        const lastRun = runs.find((r) => r.monitorId === monitor.id);
        const level = !monitor.enabled ? "paused" : (lastRun?.level ?? "green");
        const dotCls = level === "green" ? "bg-success" : level === "yellow" ? "bg-warning" : level === "paused" ? "bg-text-muted/60" : "bg-danger";
        const typeLabel = monitor.type === "HTTP" ? "HTTP" : monitor.type === "TCP" ? "TCP" : monitor.type === "SSL_CERT" ? "SSL" : monitor.type === "HEARTBEAT" ? "Heartbeat" : monitor.type;
        const monitorRuns = runs.filter((r) => r.monitorId === monitor.id);
        const upCount = monitorRuns.filter((r) => r.ok).length;
        const uptime7d = monitorRuns.length > 0 ? Math.round((upCount / monitorRuns.length) * 100) : null;
        const lastCheckText = lastRun ? relativeTime(lastRun.checkedAt) : null;
        const intervalLabel = monitor.intervalSec < 60 ? `${monitor.intervalSec}s` : monitor.intervalSec < 3600 ? `${Math.round(monitor.intervalSec / 60)}m` : `${Math.round(monitor.intervalSec / 3600)}h`;
        return (
          <div key={monitor.id} className="rounded-2xl border border-border bg-surface p-6 transition-all hover:border-border-hover group">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${dotCls}`} />
                <p className="font-semibold text-text-primary truncate text-sm">{monitor.name}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-elevated border border-border/60 text-text-muted shrink-0">{typeLabel}</span>
            </div>
            <p className="text-xs text-text-secondary font-mono truncate mb-3" title={monitor.target}>{monitor.target}</p>
            <div className="flex items-center gap-3 text-xs text-text-secondary mb-3">
              {lastCheckText && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 opacity-60" />
                  {lastCheckText}
                </span>
              )}
              {uptime7d !== null && (
                <span className={`font-medium ${uptime7d >= 99 ? "text-success" : uptime7d >= 90 ? "text-warning" : "text-danger"}`}>
                  {uptime7d}% up
                </span>
              )}
              {lastRun?.latencyMs != null && (
                <span className="font-mono">{lastRun.latencyMs}ms</span>
              )}
            </div>
            {monitor.tags && monitor.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {monitor.tags.slice(0, 3).map((t: { id: string; name: string; color: string }) => (
                  <span key={t.id} className="text-xs px-1.5 py-0.5 rounded-full border" style={{ borderColor: t.color + "80", color: t.color, backgroundColor: t.color + "22" }}>{t.name}</span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 pt-3 border-t border-border/60">
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-elevated border border-border/60 text-text-muted">{intervalLabel}</span>
              <div className="flex items-center gap-1 ml-auto">
                <button
                  onClick={() => onEdit(monitor)}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-surface-elevated border border-border/60 text-text-secondary hover:text-accent hover:border-accent/50 transition-colors"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
                <button
                  onClick={() => onDelete(monitor.id)}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-surface-elevated border border-border/60 text-danger/70 hover:text-danger hover:border-danger/50 transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface MonitorGroupedViewProps {
  monitors: MonitorItem[];
  runs: MonitorRun[];
}

export function MonitorGroupedView({ monitors, runs }: MonitorGroupedViewProps) {
  const groups = new Map<string, MonitorItem[]>();
  for (const m of monitors) {
    const groupKey = m.tags && m.tags.length > 0 ? m.tags[0].name : "Untagged";
    const existing = groups.get(groupKey) ?? [];
    existing.push(m);
    groups.set(groupKey, existing);
  }
  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
    if (a === "Untagged") return 1;
    if (b === "Untagged") return -1;
    return a.localeCompare(b);
  });

  if (sortedGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-muted">
        <Tag className="w-8 h-8 mb-3 opacity-40" />
        <p className="text-sm">No monitors match your filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sortedGroups.map(([groupName, groupMonitors]) => {
        const allGreen = groupMonitors.every((m) => {
          const lastRun = runs.find((r) => r.monitorId === m.id);
          return m.enabled && (lastRun?.level === "green" || !lastRun);
        });
        const anyRed = groupMonitors.some((m) => {
          const lastRun = runs.find((r) => r.monitorId === m.id);
          return m.enabled && lastRun?.level === "red";
        });
        const groupStatus = !allGreen && anyRed ? "red" : !allGreen ? "yellow" : "green";
        const statusDot = groupStatus === "green" ? "bg-success" : groupStatus === "yellow" ? "bg-warning" : "bg-danger";
        return (
          <div key={groupName}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${statusDot}`} />
              <h3 className="text-sm font-semibold text-text-primary">{groupName}</h3>
              <span className="text-xs text-text-muted">({groupMonitors.length})</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {groupMonitors.map((monitor) => {
                const lastRun = runs.find((r) => r.monitorId === monitor.id);
                const level = !monitor.enabled ? "paused" : (lastRun?.level ?? "green");
                const dotCls = level === "green" ? "bg-success" : level === "yellow" ? "bg-warning" : level === "paused" ? "bg-text-muted/60" : "bg-danger";
                const intervalLabel = monitor.intervalSec < 60 ? `${monitor.intervalSec}s` : monitor.intervalSec < 3600 ? `${Math.round(monitor.intervalSec / 60)}m` : `${Math.round(monitor.intervalSec / 3600)}h`;
                const lastCheckText = lastRun ? relativeTime(lastRun.checkedAt) : null;
                return (
                  <div key={monitor.id} className="rounded-xl border border-border bg-surface p-4 hover:border-border-hover transition-colors group">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${dotCls}`} />
                        <p className="font-medium text-text-primary truncate text-sm">{monitor.name}</p>
                      </div>
                      <span className="text-xs text-text-muted shrink-0 font-mono">{intervalLabel}</span>
                    </div>
                    <p className="text-xs text-text-muted truncate mb-2 pl-4">{monitor.target}</p>
                    <div className="flex items-center justify-between pl-4">
                      {lastRun?.latencyMs != null && (
                        <span className="text-xs text-text-secondary">{lastRun.latencyMs}ms</span>
                      )}
                      {lastCheckText && (
                        <span className="text-xs text-text-muted ml-auto">{lastCheckText}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
