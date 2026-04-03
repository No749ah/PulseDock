// SLA widgets — SLA summaries, compliance tables, downtime logs, MTTR/MTTF
import React from "react";
import {
  type WidgetProps,
  timeAgo,
  isNoConfig,
  NoConfigPlaceholder,
  AnimatedNumber,
  TrendArrow,
  WidgetCard,
} from "./shared";
import { formatMinutes, computeBudgetUsed } from "./slaWidgetHelpers";

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


  // Progress bar: how much of the allowed downtime budget is used
  const budgetUsed = computeBudgetUsed(allowedDownMin, remainingDownMin);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-primary truncate">{label}</p>
        <div className="flex items-center gap-2 shrink-0">
          {Boolean((widgetData as Record<string, unknown>)?.fetchedAt) && (
            <span className="text-[10px] text-text-muted">{timeAgo((widgetData as Record<string,unknown>).fetchedAt as string)}</span>
          )}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold tracking-wide ${
              pass
                ? "bg-green-500/20 text-green-400 ring-1 ring-green-500/30"
                : "bg-red-500/20 text-red-400 ring-1 ring-red-500/30"
            }`}
          >
            {pass ? "✓ SLA Met" : "✗ SLA Breached"}
          </span>
        </div>
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

export function DowntimeLog({ widget, extra }: WidgetProps) {
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
        <div className="flex items-center gap-2">
          {Boolean((data as Record<string, unknown>)?.fetchedAt) && (
            <span className="text-[10px] text-text-muted">{timeAgo((data as Record<string,unknown>).fetchedAt as string)}</span>
          )}
          <span className="text-xs text-text-secondary">{data.total} event{data.total !== 1 ? "s" : ""} · {data.periodDays}d</span>
        </div>
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

export function MttrMttfCards({ widget, extra }: WidgetProps) {
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
    <WidgetCard title={label ?? "Reliability Metrics"} meta={`Last ${data.periodDays}d${(data as Record<string, unknown>).fetchedAt ? ` · ${timeAgo((data as Record<string, unknown>).fetchedAt as string)}` : ''}`}>
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

export function SLAComplianceTable({ widget, extra }: WidgetProps) {
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
        <div className="flex items-center gap-2">
          {Boolean((data as Record<string, unknown>)?.fetchedAt) && (
            <span className="text-[10px] text-text-muted">{timeAgo((data as Record<string,unknown>).fetchedAt as string)}</span>
          )}
          <span className="text-xs text-text-secondary">
            {data.rows.filter((r) => r.pass).length}/{data.rows.length} passing
          </span>
        </div>
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
