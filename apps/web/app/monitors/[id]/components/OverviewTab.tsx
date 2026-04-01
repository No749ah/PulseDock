"use client";

import React from "react";
import Link from "next/link";
import { AlertCircle, Activity, Award, Clock, TrendingUp, Zap, Settings, Plus, X, Gauge, Bookmark, Download, ChevronDown, Globe, CheckCircle, GitBranch, Trash2, Pin } from "lucide-react";
import { api } from "../../../../lib/api";
import { getUser } from "../../../../components/auth";
import { Card } from "../../../components/Card";
import { Badge } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "../../../components/Table";
import { ResponseAreaChart, CheckBarChart } from "../../../../components/charts/recharts-barrel";
import { relativeTime } from "../../../components/timeUtils";
import { PERIOD_LABELS, formatDuration } from "./types";
import type {
  MonitorItem,
  AlertChannelInfo,
  MonitorDependency,
  MonitorRun,
  RunTimings,
  UptimePeriod,
  UptimeStats,
  ErrorBudget,
  HealthScore,
  MonitorEvent,
  ChartPoint,
} from "./types";
import nextDynamic from "next/dynamic";

const UptimeHeatmapChart = nextDynamic(() => import("./UptimeHeatmapChart").then(m => ({ default: m.UptimeHeatmapChart })), { ssr: false });
const ResponseBodyViewer = nextDynamic(() => import("./ResponseBodyViewer").then(m => ({ default: m.ResponseBodyViewer })), { ssr: false });
const LineSparkline = nextDynamic(() => import("../../../../components/charts/LineSparkline").then(m => ({ default: m.LineSparkline })), { ssr: false });

// ── Timing Waterfall ─────────────────────────────────────────────────────────
interface TimingPhase { label: string; value: number | null; color: string; }

function TimingWaterfall({ timings, totalMs }: { timings: RunTimings; totalMs: number | null }) {
  const phases: TimingPhase[] = [
    { label: "DNS", value: timings.dnsMs, color: "bg-blue-500" },
    { label: "TCP", value: timings.tcpMs, color: "bg-green-500" },
    { label: "TLS", value: timings.tlsMs, color: "bg-purple-500" },
    { label: "TTFB", value: timings.ttfbMs, color: "bg-orange-500" },
    { label: "Download", value: timings.downloadMs, color: "bg-cyan-500" },
  ];
  const total = totalMs ?? phases.reduce((sum, p) => sum + (p.value ?? 0), 0);
  const maxMs = Math.max(...phases.map((p) => p.value ?? 0), 1);
  return (
    <div className="my-2 p-3 rounded-lg bg-surface-elevated border border-border text-xs">
      <p className="text-text-muted mb-2 font-medium uppercase tracking-wide text-[10px]">Timing Breakdown</p>
      <div className="space-y-1.5">
        {phases.map((phase) => (
          <div key={phase.label} className="flex items-center gap-2">
            <span className="w-16 text-text-secondary text-right shrink-0">{phase.label}</span>
            <div className="flex-1 flex items-center gap-2">
              {phase.value !== null ? (
                <>
                  <div className="flex-1 bg-surface rounded-full h-2 overflow-hidden">
                    <div className={`${phase.color} h-2 rounded-full transition-all`} style={{ width: `${Math.max(2, (phase.value / maxMs) * 100)}%` }} />
                  </div>
                  <span className="text-text-primary font-mono w-14 text-right shrink-0">{phase.value}ms</span>
                </>
              ) : (
                <>
                  <div className="flex-1 bg-surface rounded-full h-2" />
                  <span className="text-text-muted font-mono w-14 text-right shrink-0">N/A</span>
                </>
              )}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1 border-t border-border mt-1">
          <span className="w-16 text-text-muted text-right shrink-0">Total</span>
          <div className="flex-1" />
          <span className="text-text-primary font-mono font-semibold w-14 text-right shrink-0">{total}ms</span>
        </div>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface LatencyBudgetReport {
  monitorId: string; monitorName: string; latencyBudgetMs: number | null;
  periodStart: string; periodEnd: string; totalChecks: number;
  checksAboveBudget: number; budgetUsedPct: number; avgLatencyMs: number | null;
  p95LatencyMs: number | null; status: "no-budget" | "healthy" | "warning" | "exceeded";
}

interface Props {
  id: string;
  monitor: MonitorItem;
  runs: MonitorRun[];
  uptime: UptimeStats | null;
  uptimePeriod: UptimePeriod;
  uptimeLoading: boolean;
  uptimeColor: string;
  onUptimePeriodChange: (p: UptimePeriod) => void;
  chartPeriod: UptimePeriod;
  onChartPeriodChange: (p: UptimePeriod) => void;
  chartData: ChartPoint[];
  chartLoading: boolean;
  healthScore: HealthScore | null;
  errorBudget: ErrorBudget | null;
  latencyBudgetReport: LatencyBudgetReport | null;
  latencyBudgetInput: string;
  onLatencyBudgetInputChange: (v: string) => void;
  latencyBudgetSaving: boolean;
  onSaveLatencyBudget: () => Promise<void>;
  onMonitorUpdated: (patch: Partial<MonitorItem>) => void;
  alertChannels: AlertChannelInfo[];
  onAlertChannelNotifyChange: (channelId: string, notifyOn: string) => Promise<void>;
  dependencies: MonitorDependency[];
  allMonitors: MonitorItem[];
  showAddDep: boolean;
  onShowAddDepChange: (v: boolean) => void;
  addingDepId: string;
  onAddingDepIdChange: (v: string) => void;
  depLoading: boolean;
  onAddDependency: () => Promise<void>;
  onRemoveDependency: (dependsOnId: string) => Promise<void>;
  linkedIncidents: Array<{
    id: string; title: string; status: string; severity: string;
    autoCreated: boolean; createdAt: string; resolvedAt: string | null; durationSec: number | null;
  }> | null;
  deliveryHistory: {
    total: number; successCount: number; failedCount: number;
    deliveries: Array<{
      id: string; channelId: string; channelName: string; channelType: string;
      status: "success" | "failed"; trigger: string | null; errorMessage: string | null;
      durationMs: number | null; createdAt: string;
    }>;
  } | null;
  events: MonitorEvent[];
  newEventMsg: string;
  onNewEventMsgChange: (v: string) => void;
  newEventType: "deploy" | "note" | "incident" | "maintenance" | "config";
  onNewEventTypeChange: (v: "deploy" | "note" | "incident" | "maintenance" | "config") => void;
  addingEvent: boolean;
  eventError: string;
  onAddEvent: () => Promise<void>;
  onDeleteEvent: (id: string) => Promise<void>;
  runsStatusFilter: "all" | "ok" | "failed" | "degraded";
  runsHasMore: boolean;
  runsTotal: number | null;
  runsLoadingMore: boolean;
  expandedRunId: string | null;
  onExpandedRunIdChange: (id: string | null) => void;
  onLoadFilteredRuns: (filter: "all" | "ok" | "failed" | "degraded") => Promise<void>;
  onLoadMoreRuns: () => Promise<void>;
  shareToken: string | null;
  shareTokenLoading: boolean;
  shareTokenCopied: boolean;
  onGenerateShareToken: () => Promise<void>;
  onRevokeShareToken: () => Promise<void>;
  onCopyShareUrl: (token: string) => void;
  streakLabel: string;
  lastRun: MonitorRun | null;
  router: { refresh: () => void };
}

export function OverviewTab(props: Props) {
  const {
    id, monitor, runs, uptime, uptimePeriod, uptimeLoading, uptimeColor, onUptimePeriodChange,
    chartPeriod, onChartPeriodChange, chartData, chartLoading,
    healthScore, errorBudget, latencyBudgetReport, latencyBudgetInput, onLatencyBudgetInputChange,
    latencyBudgetSaving, onSaveLatencyBudget,
    alertChannels, onAlertChannelNotifyChange, dependencies, allMonitors,
    showAddDep, onShowAddDepChange, addingDepId, onAddingDepIdChange, depLoading,
    onAddDependency, onRemoveDependency,
    linkedIncidents, deliveryHistory, events,
    newEventMsg, onNewEventMsgChange, newEventType, onNewEventTypeChange,
    addingEvent, eventError, onAddEvent, onDeleteEvent,
    runsStatusFilter, runsHasMore, runsTotal, runsLoadingMore, expandedRunId, onExpandedRunIdChange,
    onLoadFilteredRuns, onLoadMoreRuns,
    shareToken, shareTokenLoading, shareTokenCopied, onGenerateShareToken, onRevokeShareToken, onCopyShareUrl,
    streakLabel, lastRun, router,
  } = props;

  return (
    <>
        <Card className="p-4 space-y-4">
          {/* Period selector */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4" />
              SLA &amp; Uptime
            </h2>
            <div className="flex gap-1">
              {(["1d", "7d", "30d", "90d"] as UptimePeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => onUptimePeriodChange(p)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    uptimePeriod === p
                      ? "bg-accent text-white"
                      : "bg-surface-elevated text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Health Score card */}
          {healthScore && (
            <div className="flex items-center gap-4 p-3 rounded-xl bg-surface border border-border/60 mb-1">
              <div className="flex flex-col items-center justify-center">
                {(() => {
                  const gradeColor =
                    healthScore.grade === "A" ? "border-success text-success" :
                    healthScore.grade === "B" ? "border-success/70 text-success/80" :
                    healthScore.grade === "C" ? "border-warning text-warning" :
                    healthScore.grade === "D" ? "border-orange-400 text-orange-400" :
                    "border-danger text-danger";
                  return (
                    <div className={`w-16 h-16 rounded-full border-4 flex flex-col items-center justify-center ${gradeColor}`}>
                      <span className="text-2xl font-bold tabular-nums leading-none">{healthScore.score}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">/{100}</span>
                    </div>
                  );
                })()}
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary">Health Score</span>
                  {(() => {
                    const gradeBg =
                      healthScore.grade === "A" ? "bg-success/15 text-success" :
                      healthScore.grade === "B" ? "bg-success/10 text-success/80" :
                      healthScore.grade === "C" ? "bg-warning/15 text-warning" :
                      healthScore.grade === "D" ? "bg-orange-500/15 text-orange-400" :
                      "bg-danger/15 text-danger";
                    return (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${gradeBg}`}>
                        {healthScore.grade}
                      </span>
                    );
                  })()}
                </div>
                <span className="text-xs text-text-secondary">
                  Uptime {healthScore.breakdown.uptime}/40 · Latency {healthScore.breakdown.latency}/20 · SLA {healthScore.breakdown.sla}/20 · Streak {healthScore.breakdown.streak}/20
                </span>
              </div>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Uptime */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary uppercase tracking-wider">Uptime</span>
              <span className={`text-2xl font-bold tabular-nums ${uptimeLoading ? "opacity-50" : ""} ${uptimeColor}`}>
                {uptime !== null ? `${uptime.uptimePct}%` : "—"}
              </span>
              <span className="text-xs text-text-secondary">last {PERIOD_LABELS[uptimePeriod]}</span>
              {monitor?.slaTarget != null && uptime !== null && (
                <span className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold w-fit ${uptime.uptimePct >= monitor.slaTarget ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                  {uptime.uptimePct >= monitor.slaTarget ? "SLA MET ✓" : "SLA BREACHED ✗"}
                </span>
              )}
              {monitor?.slaTarget != null && (
                <span className="text-xs text-text-secondary">Target: {monitor.slaTarget}% over {monitor.slaPeriodDays ?? 30}d</span>
              )}
            </div>

            {/* Incidents */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary uppercase tracking-wider flex items-center gap-1">
                <Zap className="w-3 h-3" /> Incidents
              </span>
              <span className={`text-2xl font-bold tabular-nums ${uptimeLoading ? "opacity-50" : ""} ${uptime && uptime.incidents > 0 ? "text-danger" : "text-text-primary"}`}>
                {uptime !== null ? uptime.incidents : "—"}
              </span>
              <span className="text-xs text-text-secondary">
                {uptime && uptime.totalDowntimeSec > 0
                  ? `${formatDuration(uptime.totalDowntimeSec)} downtime`
                  : "no downtime"}
              </span>
            </div>

            {/* MTTR */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3" /> MTTR
              </span>
              <span className={`text-2xl font-bold tabular-nums ${uptimeLoading ? "opacity-50" : ""} text-text-primary`}>
                {uptime !== null ? (uptime.mttrSec > 0 ? formatDuration(uptime.mttrSec) : "—") : "—"}
              </span>
              <span className="text-xs text-text-secondary">mean time to recover</span>
            </div>

            {/* Avg Latency */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Avg Latency
              </span>
              <span className={`text-2xl font-bold tabular-nums ${uptimeLoading ? "opacity-50" : ""} text-text-primary`}>
                {uptime?.avgLatencyMs != null ? `${uptime.avgLatencyMs}ms` : "N/A"}
              </span>
              <span className="text-xs text-text-secondary">last {PERIOD_LABELS[uptimePeriod]}</span>
            </div>

            {/* Financial Impact */}
            {monitor.downtimeCostPerHour != null && uptime != null && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-secondary uppercase tracking-wider flex items-center gap-1">
                  <Award className="w-3 h-3" /> Est. Cost
                </span>
                <span className={`text-2xl font-bold tabular-nums ${uptimeLoading ? "opacity-50" : ""} ${uptime.totalDowntimeSec > 0 ? "text-danger" : "text-success"}`}>
                  {uptime.totalDowntimeSec > 0
                    ? `$${((uptime.totalDowntimeSec / 3600) * monitor.downtimeCostPerHour).toFixed(0)}`
                    : "$0"}
                </span>
                <span className="text-xs text-text-secondary">
                  @${monitor.downtimeCostPerHour}/hr · last {PERIOD_LABELS[uptimePeriod]}
                </span>
              </div>
            )}
          </div>

          {/* Checks today */}
          {(() => {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const checksToday = runs.filter((r) => new Date(r.checkedAt) >= todayStart).length;
            return (
              <div className="flex items-center gap-6 pt-2 border-t border-border/60">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-text-secondary uppercase tracking-wider">Checks Today</span>
                  <span className="text-lg font-bold text-text-primary tabular-nums">{checksToday}</span>
                </div>
                {uptime && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-text-secondary uppercase tracking-wider">Total Checks ({PERIOD_LABELS[uptimePeriod]})</span>
                    <span className="text-lg font-bold text-text-primary tabular-nums">{uptime.totalChecks}</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Incident list (collapsed by default, shows if any exist) */}
          {uptime && uptime.incidentList.length > 0 && (
            <details className="group">
              <summary className="text-xs text-text-secondary hover:text-accent cursor-pointer select-none flex items-center gap-1">
                <span className="group-open:hidden">▶</span>
                <span className="hidden group-open:inline">▼</span>
                {uptime.incidentList.length} incident{uptime.incidentList.length !== 1 ? "s" : ""} in this period
              </summary>
              <div className="mt-2 space-y-1">
                {uptime.incidentList.slice(0, 10).map((inc, i) => (
                  <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-surface-elevated">
                    <span className="text-text-secondary">{relativeTime(inc.start)}</span>
                    <span className="text-danger font-medium">
                      {inc.durationSec > 0 ? `↓ ${formatDuration(inc.durationSec)}` : "↓ &lt;1 check"}
                    </span>
                  </div>
                ))}
                {uptime.incidentList.length > 10 && (
                  <p className="text-xs text-text-secondary text-center py-1">
                    + {uptime.incidentList.length - 10} more incidents
                  </p>
                )}
              </div>
            </details>
          )}
        </Card>

        {/* 90-day uptime heatmap — GitHub-contributions style */}
        {runs.length > 0 && (() => {
          // Build a day-bucket map from existing runs (up to 90 days back)
          const now = new Date();
          const days: { date: string; ok: number; total: number }[] = [];
          for (let i = 89; i >= 0; i--) {
            const d = new Date(now);
            d.setUTCDate(d.getUTCDate() - i);
            days.push({ date: d.toISOString().slice(0, 10), ok: 0, total: 0 });
          }
          const dayMap = new Map(days.map(d => [d.date, d]));
          for (const r of runs) {
            const dayKey = new Date(r.checkedAt).toISOString().slice(0, 10);
            const bucket = dayMap.get(dayKey);
            if (bucket) {
              bucket.total++;
              if (r.ok) bucket.ok++;
            }
          }
          const weeks: (typeof days[0] | null)[][] = [];
          let week: (typeof days[0] | null)[] = [];
          // Pad start to align with Sunday
          const firstDay = new Date(days[0].date + "T00:00:00Z");
          const startPad = firstDay.getUTCDay(); // 0=Sun
          for (let i = 0; i < startPad; i++) week.push(null);
          for (const day of days) {
            week.push(day);
            if (week.length === 7) { weeks.push(week); week = []; }
          }
          if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }

          const getColor = (d: typeof days[0] | null) => {
            if (!d || d.total === 0) return "bg-surface-elevated";
            const pct = d.ok / d.total;
            if (pct >= 1) return "bg-green-500/80";
            if (pct >= 0.9) return "bg-green-500/50";
            if (pct >= 0.5) return "bg-yellow-500/60";
            return "bg-red-500/70";
          };

          return (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  90-Day Uptime Calendar
                </h2>
                <div className="flex items-center gap-1.5 text-xs text-text-muted">
                  <span className="w-2.5 h-2.5 rounded-sm bg-surface-elevated inline-block" /> No data
                  <span className="w-2.5 h-2.5 rounded-sm bg-green-500/80 inline-block ml-1" /> 100%
                  <span className="w-2.5 h-2.5 rounded-sm bg-yellow-500/60 inline-block" /> Degraded
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-500/70 inline-block" /> Down
                </div>
              </div>
              <div className="flex gap-0.5 overflow-x-auto">
                {weeks.map((wk, wi) => (
                  <div key={wi} className="flex flex-col gap-0.5">
                    {wk.map((day, di) => (
                      <div
                        key={di}
                        title={day ? `${day.date}: ${day.total === 0 ? "no data" : `${day.total > 0 ? Math.round(day.ok / day.total * 100) : 0}% uptime (${day.ok}/${day.total} ok)`}` : ""}
                        className={`w-3 h-3 rounded-sm transition-opacity hover:opacity-75 ${getColor(day)}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <p className="text-xs text-text-muted mt-2">Based on check runs in local history. Only includes runs loaded in the current session.</p>
            </Card>
          );
        })()}

      {/* Quick status row */}

        <div className="grid grid-cols-2 gap-4">
          <Card className="flex flex-col gap-1 p-4">
            <span className="text-xs text-text-secondary uppercase tracking-wider">Last Status</span>
            <div className="mt-1">
              {lastRun ? (
                lastRun.level === "yellow" ? (
                  <Badge variant="warning">Degraded</Badge>
                ) : lastRun.ok ? (
                  <Badge variant="success">OK</Badge>
                ) : (
                  <Badge variant="danger">Failed</Badge>
                )
              ) : (
                <Badge>Pending</Badge>
              )}
            </div>
            <span className="text-xs text-text-secondary">
              {lastRun ? relativeTime(lastRun.checkedAt) : "no runs yet"}
            </span>
          </Card>
          <Card className="flex flex-col gap-1 p-4">
            <span className="text-xs text-text-secondary uppercase tracking-wider">Streak</span>
            <span className="text-sm font-semibold text-text-primary mt-1">{streakLabel}</span>
            <span className="text-xs text-text-secondary">consecutive {runs[0]?.ok ? "successes" : "failures"}</span>
          </Card>
        </div>


      {/* HTTP Configuration card */}
      {monitor.type === "HTTP" && monitor.config && (

          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Settings className="w-4 h-4" />
              HTTP Configuration
            </h2>
            {(() => {
              const cfg = monitor.config as Record<string, unknown>;
              const method = typeof cfg.method === "string" ? cfg.method : null;
              const expectedStatus = cfg.expectedStatus;
              const responseTimeMs = typeof cfg.responseTimeThresholdMs === "number" ? cfg.responseTimeThresholdMs : null;
              const confirmations = typeof cfg.confirmations === "number" ? cfg.confirmations : null;
              const bodyContains = typeof cfg.bodyContains === "string" ? cfg.bodyContains : null;
              const requestBody = typeof cfg.requestBody === "string" ? cfg.requestBody : null;
              const requestHeaders = cfg.requestHeaders && typeof cfg.requestHeaders === "object" ? cfg.requestHeaders as Record<string, string> : null;
              return (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                    {method && method !== "GET" && (
                      <div>
                        <span className="text-xs text-text-secondary block mb-0.5">Method</span>
                        <span className="font-mono font-medium text-accent">{method}</span>
                      </div>
                    )}
                    {expectedStatus != null && (
                      <div>
                        <span className="text-xs text-text-secondary block mb-0.5">Expected Status</span>
                        <span className="font-mono text-text-primary">
                          {Array.isArray(expectedStatus) ? (expectedStatus as number[]).join(", ") : String(expectedStatus)}
                        </span>
                      </div>
                    )}
                    {responseTimeMs != null && (
                      <div>
                        <span className="text-xs text-text-secondary block mb-0.5">Slow Threshold</span>
                        <span className="font-mono text-warning">{responseTimeMs}ms</span>
                      </div>
                    )}
                    {confirmations != null && confirmations > 1 && (
                      <div>
                        <span className="text-xs text-text-secondary block mb-0.5">Confirmations</span>
                        <span className="font-mono text-text-primary">{confirmations} checks</span>
                      </div>
                    )}
                  </div>
                  {bodyContains && (
                    <div>
                      <span className="text-xs text-text-secondary block mb-1">Body Must Contain</span>
                      <code className="text-xs bg-surface-elevated rounded px-2 py-1 text-text-primary block font-mono">
                        {bodyContains}
                      </code>
                    </div>
                  )}
                  {requestBody && (
                    <div>
                      <span className="text-xs text-text-secondary block mb-1">Request Body</span>
                      <code className="text-xs bg-surface-elevated rounded px-2 py-1 text-text-primary block font-mono break-all">
                        {requestBody}
                      </code>
                    </div>
                  )}
                  {requestHeaders && Object.keys(requestHeaders).length > 0 && (
                    <div>
                      <span className="text-xs text-text-secondary block mb-1">Request Headers</span>
                      <div className="space-y-1">
                        {Object.entries(requestHeaders).map(([k, v]) => (
                          <div key={k} className="flex gap-2 text-xs font-mono bg-surface-elevated rounded px-2 py-1">
                            <span className="text-accent">{k}:</span>
                            <span className="text-text-primary truncate">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </Card>

      )}

      {/* SSL Certificate config */}
      {monitor.type === "SSL_CERT" && (

          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Settings className="w-4 h-4" />
              SSL Configuration
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Host</span>
                <span className="font-mono text-text-primary">{monitor.target}</span>
              </div>
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Warning Threshold</span>
                <span className="font-mono text-warning">
                  {monitor.config && typeof (monitor.config as Record<string, unknown>).warnDays === "number"
                    ? `${String((monitor.config as Record<string, unknown>).warnDays)} days`
                    : "30 days"}
                </span>
              </div>
            </div>
          </Card>

      )}

      {/* TCP port config */}
      {monitor.type === "TCP" && (

          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Settings className="w-4 h-4" />
              TCP Configuration
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Host</span>
                <span className="font-mono text-text-primary">
                  {monitor.target.includes(":") ? monitor.target.split(":")[0] : monitor.target}
                </span>
              </div>
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Port</span>
                <span className="font-mono text-accent">
                  {monitor.target.includes(":") ? monitor.target.split(":").pop() : "—"}
                </span>
              </div>
            </div>
          </Card>

      )}

      {/* Heartbeat info card */}
      {monitor.type === "HEARTBEAT" && (

          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Heartbeat Config</h2>
            <div className="space-y-2">
              <div>
                <span className="text-xs text-text-secondary">Ping URL</span>
                <p className="font-mono text-xs text-text-primary bg-surface-elevated rounded px-2 py-1 mt-1 break-all">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/api/v1/heartbeat/${monitor.config?.token ?? "—"}`
                    : `…/v1/heartbeat/${monitor.config?.token ?? "—"}`}
                </p>
                <p className="text-xs text-text-secondary mt-1">
                  Send a POST to this URL from your cron job or service to mark it healthy.
                </p>
              </div>
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-xs text-text-secondary block">Timeout</span>
                  <span className="font-medium text-text-primary">{String(monitor.config?.timeoutMin ?? 5)} min</span>
                </div>
              </div>
            </div>
          </Card>

      )}

      {/* DNS config */}
      {monitor.type === "DNS" && (
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Settings className="w-4 h-4" />
            DNS Configuration
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Hostname</span>
              <span className="font-mono text-text-primary">{monitor.target}</span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Record Type</span>
              <span className="font-mono text-accent uppercase">
                {String(monitor.config?.recordType ?? "A")}
              </span>
            </div>
            {Boolean(monitor.config?.expectedValue) && (
              <div className="col-span-2">
                <span className="text-xs text-text-secondary block mb-0.5">Expected Value</span>
                <span className="font-mono text-text-primary text-xs bg-surface-elevated px-2 py-1 rounded break-all">
                  {String(monitor.config?.expectedValue ?? "")}
                </span>
              </div>
            )}
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Timeout</span>
              <span className="font-medium text-text-primary">
                {String(monitor.config?.timeoutMs ? `${Math.round(Number(monitor.config.timeoutMs) / 1000)}s` : "10s")}
              </span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Change Detection</span>
              <span className={`font-medium ${monitor.config?.detectChanges ? "text-success" : "text-text-secondary"}`}>
                {monitor.config?.detectChanges ? "✓ Enabled" : "Disabled"}
              </span>
            </div>
          </div>
          {!!monitor.config?.detectChanges && (
            <div className="mt-2 pt-3 border-t border-border">
              {Array.isArray(monitor.config?.dnsBaseline) && (monitor.config.dnsBaseline as string[]).length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Baseline Records</span>
                    <div className="flex items-center gap-2">
                      {!!monitor.config?.dnsBaselineSetAt && (
                        <span className="text-xs text-text-muted">
                          Set {new Date(String(monitor.config.dnsBaselineSetAt)).toLocaleDateString()}
                        </span>
                      )}
                      <button
                        onClick={async () => {
                          if (!confirm("Reset DNS baseline? The next check will establish a new baseline.")) return;
                          const u = getUser();
                          if (!u) return;
                          try {
                            await api(`/v1/monitors/${monitor.id}/dns-baseline/reset`, u.id, { method: "POST" });
                            router.refresh();
                          } catch (e) {
                            alert(e instanceof Error ? e.message : "Failed to reset baseline");
                          }
                        }}
                        className="text-xs text-warning hover:text-warning/80 border border-warning/30 hover:border-warning/60 px-2 py-0.5 rounded transition-colors"
                        title="Reset baseline — next successful check will set a new one"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {(monitor.config.dnsBaseline as string[]).map((record, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-surface-elevated">
                        <span className="w-2 h-2 rounded-full bg-success shrink-0" />
                        <span className="font-mono text-xs text-text-primary break-all">{record}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-text-muted">
                    Alerts will fire if any records are added or removed from this baseline.
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
                  <span className="text-warning text-sm">⏳</span>
                  <p className="text-xs text-text-secondary">
                    Baseline not set yet — will be captured on the next successful check.
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* PING config */}
      {monitor.type === "PING" && (
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4" />
            ICMP Ping Configuration
          </h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Host</span>
              <span className="font-mono text-text-primary">{monitor.target}</span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Ping Count</span>
              <span className="font-medium text-text-primary">{String(monitor.config?.pingCount ?? 3)} packets</span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Loss Threshold</span>
              <span className="font-medium text-text-primary">
                {monitor.config?.maxPacketLossPct !== undefined
                  ? `>${String(monitor.config.maxPacketLossPct)}% = fail`
                  : "Any loss = warn"}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* SMTP config */}
      {monitor.type === "SMTP" && (
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Settings className="w-4 h-4" />
            SMTP Configuration
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Host</span>
              <span className="font-mono text-text-primary">
                {monitor.target.includes(":") ? monitor.target.split(":")[0] : monitor.target}
              </span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Port</span>
              <span className="font-mono text-accent">
                {monitor.target.includes(":") ? monitor.target.split(":").pop() : "25"}
              </span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">STARTTLS</span>
              <span className={`font-medium ${monitor.config?.requireStarttls ? "text-success" : "text-text-secondary"}`}>
                {monitor.config?.requireStarttls ? "Required" : "Optional"}
              </span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Timeout</span>
              <span className="font-medium text-text-primary">
                {monitor.config?.timeoutMs ? `${Math.round(Number(monitor.config.timeoutMs) / 1000)}s` : "10s"}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* FTP config */}
      {monitor.type === "FTP" && (
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Settings className="w-4 h-4" />
            FTP Configuration
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Host</span>
              <span className="font-mono text-text-primary">
                {monitor.target.includes(":") ? monitor.target.split(":")[0] : monitor.target}
              </span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Port</span>
              <span className="font-mono text-accent">
                {monitor.target.includes(":") ? monitor.target.split(":").pop() : "21"}
              </span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">AUTH TLS (FTPS)</span>
              <span className={`font-medium ${monitor.config?.checkTls ? "text-success" : "text-text-secondary"}`}>
                {monitor.config?.checkTls ? "Tested" : "Not tested"}
              </span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Protocol</span>
              <span className="font-medium text-text-primary">
                {monitor.config?.checkTls ? "FTPS Explicit" : "Plain FTP"}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* IMAP config */}
      {monitor.type === "IMAP" && (
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Settings className="w-4 h-4" />
            IMAP Configuration
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Host</span>
              <span className="font-mono text-text-primary">
                {monitor.target.includes(":") ? monitor.target.split(":")[0] : monitor.target}
              </span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Port</span>
              <span className="font-mono text-accent">
                {monitor.target.includes(":") ? monitor.target.split(":").pop() : "143"}
              </span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">STARTTLS</span>
              <span className={`font-medium ${monitor.config?.checkTls ? "text-success" : "text-text-secondary"}`}>
                {monitor.config?.checkTls ? "Tested" : "Not tested"}
              </span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Encryption</span>
              <span className="font-medium text-text-primary">
                {monitor.config?.checkTls ? "STARTTLS" : "Plain (port 143) or IMAPS (port 993)"}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* POP3 config */}
      {monitor.type === "POP3" && (
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Settings className="w-4 h-4" />
            POP3 Configuration
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Host</span>
              <span className="font-mono text-text-primary">
                {monitor.target.includes(":") ? monitor.target.split(":")[0] : monitor.target}
              </span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Port</span>
              <span className="font-mono text-accent">
                {monitor.target.includes(":") ? monitor.target.split(":").pop() : "110"}
              </span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">STLS</span>
              <span className={`font-medium ${monitor.config?.checkTls ? "text-success" : "text-text-secondary"}`}>
                {monitor.config?.checkTls ? "Tested" : "Not tested"}
              </span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Encryption</span>
              <span className="font-medium text-text-primary">
                {monitor.config?.checkTls ? "STLS" : "Plain (port 110) or POP3S (port 995)"}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Browser / Page Check config */}
      {monitor.type === "BROWSER" && (
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Browser Check Configuration
          </h2>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Target URL</span>
              <span className="font-mono text-xs text-text-primary bg-surface-elevated px-2 py-1 rounded break-all">
                {monitor.target}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Allowed Status Codes</span>
                <span className="font-mono text-text-primary">
                  {monitor.config?.allowedStatusCodes
                    ? (monitor.config.allowedStatusCodes as number[]).join(", ")
                    : "200–299, 301, 302"}
                </span>
              </div>
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Timeout</span>
                <span className="font-medium text-text-primary">
                  {monitor.config?.timeoutMs ? `${Math.round(Number(monitor.config.timeoutMs) / 1000)}s` : "10s"}
                </span>
              </div>
            </div>
            {Boolean(monitor.config?.expectedText) && (
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Expected Text</span>
                <span className="font-mono text-xs text-text-primary bg-surface-elevated px-2 py-1 rounded break-all">
                  {String(monitor.config?.expectedText ?? "")}
                </span>
              </div>
            )}
            {Boolean(monitor.config?.expectedSelector) && (
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">CSS Selector</span>
                <span className="font-mono text-xs text-accent bg-surface-elevated px-2 py-1 rounded">
                  {String(monitor.config?.expectedSelector ?? "")}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* GraphQL config */}
      {monitor.type === "GRAPHQL" && (
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Settings className="w-4 h-4" />
            GraphQL Configuration
          </h2>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Endpoint</span>
              <span className="font-mono text-xs text-text-primary bg-surface-elevated px-2 py-1 rounded break-all block">
                {monitor.target}
              </span>
            </div>
            {Boolean(monitor.graphqlQuery) && (
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Query</span>
                <pre className="font-mono text-xs text-text-primary bg-surface-elevated px-2 py-1.5 rounded overflow-x-auto whitespace-pre-wrap break-all">
                  {monitor.graphqlQuery ?? ""}
                </pre>
              </div>
            )}
            {Boolean(monitor.graphqlDataPath) && (
              <div className="flex flex-wrap gap-6">
                <div>
                  <span className="text-xs text-text-secondary block mb-0.5">Data Path</span>
                  <span className="font-mono text-xs text-accent bg-surface-elevated px-2 py-1 rounded">
                    {monitor.graphqlDataPath ?? ""}
                  </span>
                </div>
                {Boolean(monitor.graphqlExpectedValue) && (
                  <div>
                    <span className="text-xs text-text-secondary block mb-0.5">Expected Value</span>
                    <span className="font-mono text-xs text-emerald-400 bg-surface-elevated px-2 py-1 rounded">
                      {monitor.graphqlExpectedValue ?? ""}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Response time trend (LineSparkline) — only for monitors that produce latency */}
      {!["HEARTBEAT", "GIT_RELEASE", "DOCKER_IMAGE"].includes(monitor.type) && (

          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Response Trend</h2>
              <span className="text-xs text-text-muted">Last {Math.min(runs.filter((r) => r.latencyMs !== null).length, 50)} checks</span>
            </div>
            <LineSparkline
              data={runs.slice(0, 50).reverse().filter((r) => r.latencyMs !== null).map((r) => r.latencyMs as number)}
              color="#6366f1"
              height={56}
            />
          </Card>

      )}

      {/* Response time area chart */}

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
              {monitor.type === "HEARTBEAT" ? "Heartbeat History" : "Response Time"}
            </h2>
            <div className="flex gap-1">
              {(["1d", "7d", "30d", "90d"] as UptimePeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => onChartPeriodChange(p)}
                  className={`text-xs px-2 py-0.5 rounded transition-colors ${chartPeriod === p ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          {chartLoading ? (
            <div className="h-40 flex items-center justify-center text-text-muted text-sm">Loading chart…</div>
          ) : chartData.length > 0 ? (
            (() => {
              const mappedData = chartData.map((pt) => ({
                time: new Date(pt.ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
                value: pt.avgLatencyMs ?? 0,
                ok: pt.uptimePct === 100,
                checkedAt: pt.ts,
              }));
              const avg = chartData.filter((pt) => pt.avgLatencyMs !== null).reduce((s, pt, _, a) => s + (pt.avgLatencyMs ?? 0) / a.length, 0);
              const roundedAvg = avg > 0 ? Math.round(avg) : undefined;
              // Compute overall P95 from chart points
              const p95Values = chartData.filter((pt) => pt.p95LatencyMs !== null).map((pt) => pt.p95LatencyMs as number);
              const roundedP95 = p95Values.length > 0 ? Math.round(p95Values.reduce((s, v) => s + v, 0) / p95Values.length) : undefined;
              // Map events to nearest bucket
              const chartStart = mappedData.length > 0 ? new Date(mappedData[0].checkedAt as string).getTime() : 0;
              const chartEnd = mappedData.length > 0 ? new Date(mappedData[mappedData.length - 1].checkedAt as string).getTime() : 0;
              const EVENT_COLORS: Record<string, string> = { deploy: "#3b82f6", incident: "#ef4444", maintenance: "#f59e0b", config: "#a855f7", note: "#6b7280" };
              const marks = events
                .filter((ev) => { const t = new Date(ev.createdAt).getTime(); return t >= chartStart && t <= chartEnd; })
                .map((ev) => {
                  const evTime = new Date(ev.createdAt).getTime();
                  let closest = mappedData[0];
                  let minDiff = Infinity;
                  for (const pt of mappedData) {
                    const diff = Math.abs(new Date(pt.checkedAt as string).getTime() - evTime);
                    if (diff < minDiff) { minDiff = diff; closest = pt; }
                  }
                  return { xValue: closest?.time ?? "", color: EVENT_COLORS[ev.eventType] ?? EVENT_COLORS.note, label: ev.eventType.slice(0, 4) };
                });
              return (
                <ResponseAreaChart
                  data={mappedData}
                  height={160}
                  avgLine={roundedAvg}
                  p95Line={roundedP95}
                  color="#58a6ff"
                  marks={marks.length > 0 ? marks : undefined}
                />
              );
            })()
          ) : (
            (() => {
              // Fall back to last 50 raw runs if chart data unavailable
              const chartRuns = runs.slice(0, 50).reverse().filter((r) => r.latencyMs !== null);
              const fallbackData = chartRuns.map((r) => ({
                time: new Date(r.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                value: r.latencyMs as number,
                ok: r.ok,
                checkedAt: r.checkedAt,
              }));
              const avg = fallbackData.length > 0 ? Math.round(fallbackData.reduce((s, d) => s + d.value, 0) / fallbackData.length) : undefined;
              return fallbackData.length > 0 ? (
                <ResponseAreaChart data={fallbackData} height={160} avgLine={avg} color="#58a6ff" />
              ) : (
                <div className="h-40 flex items-center justify-center text-text-muted text-sm">No data yet</div>
              );
            })()
          )}
          {events.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
              {[{ key: "deploy", color: "#3b82f6" }, { key: "incident", color: "#ef4444" }, { key: "maintenance", color: "#f59e0b" }, { key: "config", color: "#a855f7" }, { key: "note", color: "#6b7280" }]
                .filter(({ key }) => events.some((e) => e.eventType === key))
                .map(({ key, color }) => (
                  <span key={key} className="flex items-center gap-1 text-[10px] text-text-muted">
                    <span className="inline-block w-2 h-2 rounded-sm" style={{ background: color }} />
                    {key}
                  </span>
                ))}
            </div>
          )}
        </Card>


      {/* Check history bar chart */}

        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Check History
          </h2>
          <CheckBarChart
            data={runs
              .slice(0, 50)
              .reverse()
              .map((r) => ({
                time: new Date(r.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                value: r.latencyMs ?? 0,
                ok: r.ok,
              }))}
            height={80}
          />
        </Card>


      {/* 7×24 Uptime Heatmap */}
      {runs.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
              Uptime Heatmap
            </h2>
            <div className="flex items-center gap-3 text-[10px] text-text-muted">
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#22c55e" }} />OK</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#f59e0b" }} />Degraded</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#ef4444" }} />Down</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-surface-elevated opacity-50" />No data</span>
            </div>
          </div>
          <p className="text-xs text-text-muted">7 days × 24 hours (UTC). Hover cells for details.</p>
          <UptimeHeatmapChart runs={runs} />
        </Card>
      )}

      {/* Run history table */}
        <Card className="p-0">
          <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                Check History
              </h2>
              {runsTotal !== null && (
                <span className="text-xs text-text-muted">
                  {runs.length} of {runsTotal} {runsStatusFilter !== "all" ? `(${runsStatusFilter} only)` : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Status filter pills */}
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-surface">
                {(["all", "ok", "degraded", "failed"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => onLoadFilteredRuns(f)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      runsStatusFilter === f
                        ? "bg-surface-elevated text-text-primary shadow-sm"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    {f === "all" ? "All" : f === "ok" ? "OK" : f === "degraded" ? "Degraded" : "Failed"}
                  </button>
                ))}
              </div>
              {/* Export CSV */}
              {runs.length > 0 && (
                <button
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated border border-border hover:border-border-strong transition-colors"
                  title="Export all check history as CSV (up to 10,000 runs)"
                  onClick={async () => {
                    try {
                      const { API_BASE } = await import('../../../../lib/api');
                      const fetchRes = await fetch(`${API_BASE}/v1/monitors/${id}/runs/export`, {
                        credentials: 'include',
                        cache: 'no-store',
                      });
                      if (!fetchRes.ok) return;
                      const blob = await fetchRes.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      const monitorName = monitor?.name ?? id;
                      const dateStr = new Date().toISOString().slice(0, 10);
                      a.href = url;
                      a.download = `pulsedock-runs-${monitorName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${dateStr}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch {
                      // silently fail
                    }
                  }}
                >
                  <Download className="w-3 h-3" />
                  Export CSV
                </button>
              )}
            </div>
          </div>
          <div>
            {runs.length === 0 ? (
              <div className="text-center py-12 text-text-secondary text-sm">
                {runsStatusFilter !== "all"
                  ? `No ${runsStatusFilter === "ok" ? "successful" : runsStatusFilter === "degraded" ? "degraded" : "failed"} checks found.`
                  : "No runs yet — this monitor hasn't checked yet."}
              </div>
            ) : (
              <>
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeader>Time</TableHeader>
                      <TableHeader>Status</TableHeader>
                      <TableHeader>Latency</TableHeader>
                      <TableHeader>HTTP Code</TableHeader>
                      {(monitor?.type === "HTTP" || monitor?.type === "BROWSER") && (
                        <TableHeader className="hidden md:table-cell">Size</TableHeader>
                      )}
                      {(monitor?.type === "HTTP" || monitor?.type === "BROWSER") && (
                        <TableHeader className="hidden md:table-cell">Redirects</TableHeader>
                      )}
                      <TableHeader>Message</TableHeader>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {runs.map((run) => {
                      const isExpanded = expandedRunId === run.id;
                      const hasTimings = run.timings && (
                        run.timings.dnsMs !== null ||
                        run.timings.tcpMs !== null ||
                        run.timings.tlsMs !== null ||
                        run.timings.ttfbMs !== null ||
                        run.timings.downloadMs !== null
                      );
                      const showWaterfall = hasTimings && (monitor?.type === "HTTP" || monitor?.type === "BROWSER");
                      const hasRedirectChain = !!(run.redirectChain && run.redirectChain.length > 0);
                      const hasHeaderAssertionFailures = !!(run.headerAssertionsFailed && run.headerAssertionsFailed.length > 0);
                      const isExpandable = showWaterfall || hasRedirectChain || hasHeaderAssertionFailures;
                      return (
                      <React.Fragment key={run.id}>
                      <TableRow
                        className={isExpandable ? "cursor-pointer hover:bg-surface-elevated/50 transition-colors" : ""}
                        onClick={isExpandable ? () => onExpandedRunIdChange(isExpanded ? null : run.id) : undefined}
                      >
                        <TableCell className="text-xs text-text-secondary whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            {relativeTime(run.checkedAt)}
                            {isExpandable && (
                              <ChevronDown className={`w-3 h-3 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          {run.level === "yellow" ? (
                            <Badge variant="warning">Degraded</Badge>
                          ) : run.ok ? (
                            <Badge variant="success">OK</Badge>
                          ) : (
                            <Badge variant="danger">Failed</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-text-secondary">
                          {run.latencyMs !== null ? `${run.latencyMs}ms` : "—"}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-text-secondary">
                          {run.statusCode || "—"}
                        </TableCell>
                        {(monitor?.type === "HTTP" || monitor?.type === "BROWSER") && (
                          <TableCell className="text-sm font-mono text-text-muted hidden md:table-cell whitespace-nowrap">
                            {run.responseSizeBytes != null
                              ? run.responseSizeBytes >= 1048576
                                ? `${(run.responseSizeBytes / 1048576).toFixed(1)} MB`
                                : run.responseSizeBytes >= 1024
                                  ? `${(run.responseSizeBytes / 1024).toFixed(1)} KB`
                                  : `${run.responseSizeBytes} B`
                              : "—"}
                          </TableCell>
                        )}
                        {(monitor?.type === "HTTP" || monitor?.type === "BROWSER") && (
                          <TableCell className="text-sm font-mono hidden md:table-cell whitespace-nowrap">
                            {run.redirectChain && run.redirectChain.length > 0 ? (
                              <span className="text-amber-400 font-medium">→ {run.redirectChain.length}</span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell
                          className="text-sm text-text-secondary max-w-[300px] truncate"
                          title={run.message}
                        >
                          {run.message.length > 60 ? run.message.slice(0, 60) + "…" : run.message}
                        </TableCell>
                      </TableRow>
                      {isExpanded && showWaterfall && run.timings && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-0 pb-2 px-4">
                            <TimingWaterfall timings={run.timings} totalMs={run.latencyMs} />
                          </TableCell>
                        </TableRow>
                      )}
                      {isExpanded && run.redirectChain && run.redirectChain.length > 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-0 pb-2 px-4">
                            <div className="text-xs text-text-secondary py-1">
                              <span className="font-medium text-amber-400 mr-2">Redirect chain:</span>
                              <span className="font-mono break-all">
                                {run.redirectChain.map((url, i) => (
                                  <span key={i}>
                                    {i > 0 && <span className="text-text-muted mx-1">→</span>}
                                    <span>{url}</span>
                                  </span>
                                ))}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      {run.headerAssertionsFailed && run.headerAssertionsFailed.length > 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-0 pb-2 px-4">
                            <div className="text-xs py-1.5">
                              <span className="font-medium text-amber-400 mr-2">
                                ⚠ {run.headerAssertionsFailed.length} header assertion{run.headerAssertionsFailed.length === 1 ? '' : 's'} failed
                              </span>
                              <ul className="mt-1 space-y-0.5">
                                {run.headerAssertionsFailed.map((f, i) => (
                                  <li key={i} className="text-text-secondary font-mono">
                                    {f.message}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      {run.responseBody && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-0 pb-2 px-4">
                            <ResponseBodyViewer body={run.responseBody} />
                          </TableCell>
                        </TableRow>
                      )}
                      </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
                {runsHasMore && (
                  <div className="px-4 py-3 border-t border-border flex items-center justify-center">
                    <button
                      onClick={onLoadMoreRuns}
                      disabled={runsLoadingMore}
                      className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated border border-border hover:border-border-strong transition-colors disabled:opacity-50"
                    >
                      <ChevronDown className="w-4 h-4" />
                      {runsLoadingMore ? "Loading…" : "Load more"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>

      {/* SLO Error Budget — only shown when slaTarget is set */}
      {monitor.slaTarget != null && errorBudget && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Gauge className="w-4 h-4" />
              SLO Error Budget (30d)
            </h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              errorBudget.budgetRemainingPct > 30
                ? "bg-green-500/15 text-green-400"
                : errorBudget.budgetRemainingPct > 10
                ? "bg-yellow-500/15 text-yellow-400"
                : "bg-red-500/15 text-red-400"
            }`}>
              {errorBudget.budgetRemainingPct.toFixed(1)}% remaining
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">SLA Target</span>
              <span className="font-mono text-text-primary">{errorBudget.slaTarget}%</span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Allowed Down</span>
              <span className="font-mono text-text-primary">
                {errorBudget.allowedDownMinutes < 60
                  ? `${Math.round(errorBudget.allowedDownMinutes)}m`
                  : `${(errorBudget.allowedDownMinutes / 60).toFixed(1)}h`}
              </span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Remaining</span>
              <span className={`font-mono font-semibold ${errorBudget.remainingDownMinutes <= 0 ? "text-danger" : "text-success"}`}>
                {errorBudget.remainingDownMinutes <= 0
                  ? "Budget exhausted"
                  : errorBudget.remainingDownMinutes < 60
                  ? `${Math.round(errorBudget.remainingDownMinutes)}m`
                  : `${(errorBudget.remainingDownMinutes / 60).toFixed(1)}h`}
              </span>
            </div>
          </div>
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-text-muted mb-1">
              <span>Budget consumed: {errorBudget.budgetConsumedPct.toFixed(1)}%</span>
              <span>{errorBudget.actualDownMinutes < 60
                ? `${Math.round(errorBudget.actualDownMinutes)}m down`
                : `${(errorBudget.actualDownMinutes / 60).toFixed(1)}h down`}
              </span>
            </div>
            <div className="w-full h-2 bg-surface-elevated rounded-full overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all ${
                  errorBudget.budgetConsumedPct > 90 ? "bg-danger" :
                  errorBudget.budgetConsumedPct > 60 ? "bg-warning" : "bg-success"
                }`}
                style={{ width: `${Math.min(errorBudget.budgetConsumedPct, 100)}%` }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Latency Budget — only shown when latencyBudgetMs is set or can be set */}
      {monitor && (() => {
        const budgetMs = (monitor as typeof monitor & { latencyBudgetMs?: number | null }).latencyBudgetMs;
        const report = latencyBudgetReport;
        return (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                <Gauge className="w-4 h-4" />
                Latency Budget (P95)
              </h2>
              {report && report.status !== 'no-budget' && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  report.status === 'healthy' ? 'bg-green-500/15 text-green-400' :
                  report.status === 'warning' ? 'bg-yellow-500/15 text-yellow-400' :
                  'bg-red-500/15 text-red-400'
                }`}>
                  {report.status === 'healthy' ? 'Healthy' : report.status === 'warning' ? 'Warning' : 'Exceeded'}
                </span>
              )}
            </div>

            {budgetMs ? (
              report ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-xs text-text-secondary block mb-0.5">Budget Target</span>
                      <span className="font-mono text-text-primary">{report.latencyBudgetMs}ms</span>
                    </div>
                    <div>
                      <span className="text-xs text-text-secondary block mb-0.5">Current P95</span>
                      <span className={`font-mono font-semibold ${
                        report.p95LatencyMs === null ? 'text-text-muted' :
                        report.latencyBudgetMs !== null && report.p95LatencyMs > report.latencyBudgetMs ? 'text-danger' : 'text-success'
                      }`}>
                        {report.p95LatencyMs !== null ? `${report.p95LatencyMs}ms` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-text-secondary block mb-0.5">Budget Used</span>
                      <span className={`font-mono font-semibold ${
                        report.budgetUsedPct > 25 ? 'text-danger' : report.budgetUsedPct > 10 ? 'text-warning' : 'text-success'
                      }`}>
                        {report.budgetUsedPct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-text-muted">
                    {report.checksAboveBudget} of {report.totalChecks} checks exceeded budget this month
                  </div>
                  <div>
                    <div className="w-full h-2 bg-surface-elevated rounded-full overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          report.budgetUsedPct > 25 ? 'bg-danger' :
                          report.budgetUsedPct > 10 ? 'bg-warning' : 'bg-success'
                        }`}
                        style={{ width: `${Math.min(report.budgetUsedPct * 4, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-text-muted mt-1">
                      <span>0%</span>
                      <span>25% threshold</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-text-muted">Loading budget report…</p>
              )
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-text-secondary">No latency budget configured. Set a P95 target to track monthly budget consumption.</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="100"
                    max="60000"
                    step="100"
                    placeholder="e.g. 500"
                    value={latencyBudgetInput}
                    onChange={(e) => onLatencyBudgetInputChange(e.target.value)}
                    className="w-32 px-3 py-1.5 text-sm rounded-lg border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <span className="text-xs text-text-muted">ms</span>
                  <button
                    disabled={latencyBudgetSaving || !latencyBudgetInput || parseInt(latencyBudgetInput, 10) < 100}
                    onClick={onSaveLatencyBudget}
                    className="px-3 py-1.5 text-xs rounded-lg bg-accent text-white font-medium hover:bg-accent/80 disabled:opacity-50 transition-colors"
                  >
                    {latencyBudgetSaving ? 'Saving…' : 'Set Budget'}
                  </button>
                </div>
              </div>
            )}
          </Card>
        );
      })()}

      {/* Linked Incidents */}
      {linkedIncidents !== null && linkedIncidents.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Linked Incidents</h2>
            <a href="/incidents" className="text-xs text-accent hover:underline">View all →</a>
          </div>
          <div className="space-y-2">
            {linkedIncidents.slice(0, 5).map((inc) => (
              <a
                key={inc.id}
                href="/incidents"
                className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg bg-surface-elevated/50 border border-border hover:border-border-strong hover:bg-surface-elevated transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${inc.status === "RESOLVED" ? "bg-success" : "bg-danger animate-pulse"}`} />
                    <span className="text-xs font-medium text-text-primary truncate">{inc.title}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${inc.severity === "CRITICAL" ? "bg-danger/15 text-danger" : inc.severity === "HIGH" ? "bg-orange-500/15 text-orange-400" : inc.severity === "MEDIUM" ? "bg-warning/15 text-warning" : "bg-surface text-text-muted border border-border"}`}>{inc.severity}</span>
                    <span>{inc.status === "RESOLVED" ? "Resolved" : "Open"}</span>
                    {inc.autoCreated && <span className="text-text-muted">· auto</span>}
                    {inc.durationSec !== null && <span>· {inc.durationSec < 60 ? `${inc.durationSec}s` : inc.durationSec < 3600 ? `${Math.round(inc.durationSec / 60)}m` : `${(inc.durationSec / 3600).toFixed(1)}h`}</span>}
                  </div>
                </div>
                <span className="text-xs text-text-muted whitespace-nowrap pt-0.5">{relativeTime(inc.createdAt)}</span>
              </a>
            ))}
            {linkedIncidents.length > 5 && (
              <p className="text-xs text-text-muted text-center py-1">+ {linkedIncidents.length - 5} more</p>
            )}
          </div>
        </Card>
      )}

      {/* Advanced Settings Summary */}
      {(monitor.retryCount != null && monitor.retryCount > 0) ||
       monitor.anomalyDetection ||
       (monitor as typeof monitor & { latencyAlertMs?: number | null }).latencyAlertMs ||
       monitor.scheduleEnabled ||
       (monitor.confirmations != null && monitor.confirmations > 1) ||
       monitor.autoIncident ||
       monitor.runbookUrl ||
       (monitor as typeof monitor & { statusWebhookUrl?: string | null }).statusWebhookUrl ||
       (monitor.timeoutMs && monitor.timeoutMs > 0) ? (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Advanced Settings
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            {monitor.confirmations != null && monitor.confirmations > 1 && (
              <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-surface-elevated/60 border border-border/60">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Confirmations</span>
                <span className="text-text-primary font-medium">{monitor.confirmations}× before alert</span>
                <span className="text-[10px] text-text-secondary">Reduces false positives</span>
              </div>
            )}
            {monitor.retryCount != null && monitor.retryCount > 0 && (
              <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-surface-elevated/60 border border-border/60">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Retries</span>
                <span className="text-text-primary font-medium">{monitor.retryCount}× on failure</span>
                <span className="text-[10px] text-text-secondary">Exponential backoff</span>
              </div>
            )}
            {(monitor as typeof monitor & { latencyAlertMs?: number | null }).latencyAlertMs && (
              <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <span className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wider">Latency Threshold</span>
                <span className="text-text-primary font-medium">&gt; {(monitor as typeof monitor & { latencyAlertMs?: number | null }).latencyAlertMs}ms</span>
                <span className="text-[10px] text-text-secondary">Alert on slow responses</span>
              </div>
            )}
            {monitor.anomalyDetection && (
              <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider">Anomaly Detection</span>
                <span className="text-text-primary font-medium">{monitor.anomalyMultiplier ?? 2}× P95 baseline</span>
                <span className="text-[10px] text-text-secondary">Dynamic latency alerting</span>
              </div>
            )}
            {monitor.scheduleEnabled && (
              <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Business Hours</span>
                <span className="text-text-primary font-medium">
                  {monitor.scheduleStartHour ?? 8}:00 – {monitor.scheduleEndHour ?? 18}:00 UTC
                </span>
                <span className="text-[10px] text-text-secondary">
                  {(monitor.scheduleDays ?? "1,2,3,4,5").split(",").map((d) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][parseInt(d)] ?? d).join(", ")}
                </span>
              </div>
            )}
            {monitor.autoIncident && (
              <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <span className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider">Auto Incidents</span>
                <span className="text-text-primary font-medium capitalize">{(monitor.autoIncidentSeverity ?? "MEDIUM").toLowerCase()} severity</span>
                <span className="text-[10px] text-text-secondary">Auto-creates on outage</span>
              </div>
            )}
            {monitor.timeoutMs && monitor.timeoutMs > 0 && (
              <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-surface-elevated/60 border border-border/60">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Request Timeout</span>
                <span className="text-text-primary font-medium">{monitor.timeoutMs}ms</span>
                <span className="text-[10px] text-text-secondary">Custom timeout override</span>
              </div>
            )}
            {monitor.runbookUrl && (
              <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-surface-elevated/60 border border-border/60">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Runbook</span>
                <a
                  href={monitor.runbookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline text-xs truncate"
                  title={monitor.runbookUrl}
                >
                  Open runbook →
                </a>
              </div>
            )}
            {(monitor as typeof monitor & { statusWebhookUrl?: string | null }).statusWebhookUrl && (
              <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-surface-elevated/60 border border-border/60">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Status Webhook</span>
                <span className="text-xs text-text-secondary truncate" title={(monitor as typeof monitor & { statusWebhookUrl?: string | null }).statusWebhookUrl!}>
                  🔔 Active — fires on status change
                </span>
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {/* Share Token (Public Status URL) */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Public Status URL
          </h2>
        </div>
        <p className="text-xs text-text-secondary">
          Generate a share token to expose this monitor&apos;s status publicly — no API key needed.
          Share a human-readable status page, embed a JSON endpoint in README files or CI/CD pipelines.
        </p>
        {monitor.shareToken ? (
          <div className="space-y-2">
            {/* Public status page link */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-success/5 border border-success/20">
              <Globe className="w-3.5 h-3.5 text-success flex-shrink-0" />
              <a
                href={`/public/monitor/${monitor.shareToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-success hover:underline truncate flex-1 font-medium"
              >
                {`/public/monitor/${monitor.shareToken}`}
              </a>
              <span className="text-[10px] text-success/60 flex-shrink-0">Status page ↗</span>
            </div>
            {/* JSON API endpoint */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-elevated border border-border font-mono text-[11px] text-text-secondary overflow-hidden">
              <span className="truncate flex-1">{`/v1/public/monitor/${monitor.shareToken}/status.json`}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onCopyShareUrl(monitor.shareToken!)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${shareTokenCopied ? "bg-success/20 text-success border border-success/30" : "bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20"}`}
              >
                {shareTokenCopied ? <CheckCircle className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                {shareTokenCopied ? "Copied!" : "Copy JSON URL"}
              </button>
              <button
                onClick={onRevokeShareToken}
                disabled={shareTokenLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-danger/70 border border-danger/20 hover:bg-danger/10 transition-colors disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
                Revoke
              </button>
            </div>
            <p className="text-[11px] text-text-muted">Status page: human-readable HTML with history + sparkline. JSON: status, level, latency, 30d uptime%. Both cached 30s.</p>
          </div>
        ) : (
          <button
            onClick={onGenerateShareToken}
            disabled={shareTokenLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-surface-elevated border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors disabled:opacity-50"
          >
            <Globe className="w-3.5 h-3.5" />
            {shareTokenLoading ? "Generating…" : "Generate Share Token"}
          </button>
        )}
      </Card>

      {/* Alert Channels */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Alert Channels</h2>
          <a href="/alerts" className="text-xs text-accent hover:underline">Manage →</a>
        </div>
        {alertChannels.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-text-secondary">No alert channels assigned</p>
            <a href="/alerts" className="text-xs text-accent hover:underline">Add an alert channel →</a>
          </div>
        ) : (
          <div className="space-y-2">
            {alertChannels.map((ac) => {
              const typeColors: Record<string, string> = {
                email: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
                slack: "text-green-400 bg-green-400/10 border-green-400/20",
                discord: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20",
                webhook: "text-blue-400 bg-blue-400/10 border-blue-400/20",
                telegram: "text-sky-400 bg-sky-400/10 border-sky-400/20",
              };
              const notifyLabels: Record<string, string> = {
                ON_CHANGE: "On change",
                ALWAYS: "Always",
                FIRST_ONLY: "First only",
                DAILY_DIGEST: "Daily digest",
                VERSION_ANY: "Any version",
                VERSION_MAJOR: "Major only",
              };
              const colorClass = typeColors[ac.alertChannel.type] ?? "text-text-secondary bg-surface-elevated border-border";
              return (
                <div key={ac.alertChannelId} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-elevated border border-border">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase ${colorClass} shrink-0`}>
                    {ac.alertChannel.type}
                  </span>
                  <span className="text-sm text-text-primary flex-1 truncate">{ac.alertChannel.name}</span>
                  <select
                    value={ac.notifyOn}
                    onChange={async (e) => { await onAlertChannelNotifyChange(ac.alertChannelId, e.target.value); }}
                    className="text-xs text-text-muted bg-transparent border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent rounded"
                    title="Change notification trigger"
                  >
                    {Object.entries(notifyLabels).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                  </select>
                  {ac.escalationPolicy && (
                    <span className="text-[10px] text-purple-400 bg-purple-400/10 border border-purple-400/20 rounded-full px-1.5 py-0.5 shrink-0" title={`Escalation: ${ac.escalationPolicy.name}`}>
                      ↗ {ac.escalationPolicy.name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Monitor Dependencies */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-text-secondary" />
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Dependencies</h2>
          </div>
          <button
            onClick={() => onShowAddDepChange(!showAddDep)}
            className="flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>

        <p className="text-xs text-text-muted">
          Alerts on this monitor are suppressed while any dependency is down. Useful when an app monitor depends on a database or infrastructure monitor.
        </p>

        {showAddDep && (
          <div className="flex gap-2">
            <select
              className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              value={addingDepId}
              onChange={(e) => onAddingDepIdChange(e.target.value)}
            >
              <option value="">Select a monitor to depend on…</option>
              {allMonitors
                .filter((m) => m.id !== id && !dependencies.some((d) => d.dependsOnId === m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.type})
                  </option>
                ))}
            </select>
            <button
              onClick={onAddDependency}
              disabled={!addingDepId || depLoading}
              className="px-3 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-accent/90 transition-colors"
            >
              {depLoading ? "…" : "Add"}
            </button>
            <button
              onClick={() => { onShowAddDepChange(false); onAddingDepIdChange(""); }}
              className="px-2 py-2 text-text-muted hover:text-text-primary rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {dependencies.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <p className="text-sm text-text-secondary">No dependencies configured</p>
            <p className="text-xs text-text-muted">Add a dependency to suppress false alerts during infrastructure outages</p>
          </div>
        ) : (
          <div className="space-y-2">
            {dependencies.map((dep) => (
              <div key={dep.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-elevated border border-border">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dep.dependsOn.enabled ? 'bg-success' : 'bg-text-muted'}`} />
                <div className="flex-1 min-w-0">
                  <Link href={`/monitors/${dep.dependsOnId}`} className="text-sm text-text-primary hover:text-accent truncate block">
                    {dep.dependsOn.name}
                  </Link>
                  <span className="text-xs text-text-muted truncate block">{dep.dependsOn.target}</span>
                </div>
                <span className="text-xs text-text-muted bg-surface px-1.5 py-0.5 rounded border border-border flex-shrink-0">
                  {dep.dependsOn.type}
                </span>
                <button
                  onClick={() => onRemoveDependency(dep.dependsOnId)}
                  className="text-text-muted hover:text-danger transition-colors flex-shrink-0"
                  aria-label="Remove dependency"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Timeline Events / Annotations */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Bookmark className="w-4 h-4" />
            Timeline Annotations
          </h2>
          <span className="text-xs text-text-muted">{events.length} event{events.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Add event form */}
        <div className="flex gap-2 items-start">
          <select
            value={newEventType}
            onChange={(e) => onNewEventTypeChange(e.target.value as "deploy" | "note" | "incident" | "maintenance" | "config")}
            className="text-xs rounded-lg border border-border bg-surface px-2 py-1.5 text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="note">Note</option>
            <option value="deploy">Deploy</option>
            <option value="incident">Incident</option>
            <option value="maintenance">Maintenance</option>
            <option value="config">Config</option>
          </select>
          <input
            type="text"
            value={newEventMsg}
            onChange={(e) => onNewEventMsgChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void onAddEvent(); } }}
            placeholder="Add annotation… (e.g. Deployed v2.3.1)"
            className="flex-1 text-sm rounded-lg border border-border bg-surface px-3 py-1.5 text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <Button
            size="sm"
            variant="primary"
            onClick={() => void onAddEvent()}
            disabled={addingEvent || !newEventMsg.trim()}
            className="flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            {addingEvent ? "Saving…" : "Add"}
          </Button>
        </div>
        {eventError && <p className="text-xs text-danger">{eventError}</p>}

        {/* Event list */}
        {events.length === 0 ? (
          <p className="text-xs text-text-muted text-center py-4">No annotations yet. Mark deploys, config changes, or incidents above.</p>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => {
              const typeColors: Record<string, string> = {
                deploy: "bg-blue-500/15 text-blue-400 border-blue-500/30",
                note: "bg-surface-elevated text-text-muted border-border",
                incident: "bg-red-500/15 text-red-400 border-red-500/30",
                maintenance: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
                config: "bg-purple-500/15 text-purple-400 border-purple-500/30",
              };
              const cls = typeColors[ev.eventType] ?? typeColors.note;
              return (
                <div key={ev.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-elevated border border-border group">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider flex-shrink-0 ${cls}`}>
                    {ev.eventType}
                  </span>
                  <span className="flex-1 text-sm text-text-primary truncate">{ev.message}</span>
                  <span className="text-xs text-text-muted flex-shrink-0">{relativeTime(ev.createdAt)}</span>
                  <button
                    onClick={() => void onDeleteEvent(ev.id)}
                    className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-all flex-shrink-0"
                    aria-label="Delete event"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Alert Delivery History */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Notifications
          </h2>
          {deliveryHistory && (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span className="text-success">{deliveryHistory.successCount} ok</span>
              {deliveryHistory.failedCount > 0 && (
                <span className="text-error">{deliveryHistory.failedCount} failed</span>
              )}
              <span>/ {deliveryHistory.total} total</span>
            </div>
          )}
        </div>

        {!deliveryHistory || deliveryHistory.deliveries.length === 0 ? (
          <p className="text-xs text-text-muted text-center py-4">No alert deliveries yet for this monitor.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Timestamp</TableHeader>
                  <TableHeader>Channel</TableHeader>
                  <TableHeader>Type</TableHeader>
                  <TableHeader>Trigger</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Duration</TableHeader>
                  <TableHeader>Error</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {deliveryHistory.deliveries.map((d) => {
                  const triggerLabel =
                    d.trigger === "monitor_failure" ? "Failure"
                    : d.trigger === "monitor_recovery" ? "Recovery"
                    : d.trigger === "test" ? "Test"
                    : d.trigger ? d.trigger.charAt(0).toUpperCase() + d.trigger.slice(1)
                    : "—";

                  const channelTypeBadgeColors: Record<string, string> = {
                    slack: "bg-green-500/15 text-green-400 border-green-500/30",
                    discord: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
                    email: "bg-blue-500/15 text-blue-400 border-blue-500/30",
                    webhook: "bg-orange-500/15 text-orange-400 border-orange-500/30",
                    telegram: "bg-sky-500/15 text-sky-400 border-sky-500/30",
                    pagerduty: "bg-green-600/15 text-green-500 border-green-600/30",
                    opsgenie: "bg-orange-600/15 text-orange-500 border-orange-600/30",
                    sms: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                  };
                  const channelTypeCls = channelTypeBadgeColors[d.channelType] ?? "bg-surface-elevated text-text-muted border-border";

                  return (
                    <TableRow key={d.id}>
                      <TableCell className="text-xs text-text-muted whitespace-nowrap">{relativeTime(d.createdAt)}</TableCell>
                      <TableCell className="text-sm text-text-primary">{d.channelName}</TableCell>
                      <TableCell>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider ${channelTypeCls}`}>
                          {d.channelType}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-text-secondary">{triggerLabel}</TableCell>
                      <TableCell>
                        {d.status === "success" ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider bg-success/15 text-success border-success/30">
                            Success
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider bg-error/15 text-error border-error/30">
                            Failed
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-text-muted">
                        {d.durationMs != null ? `${d.durationMs}ms` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-error max-w-[200px] truncate" title={d.errorMessage ?? undefined}>
                        {d.errorMessage ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

    </>
  );
}
