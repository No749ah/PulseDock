"use client";

import React from "react";
import { Activity } from "lucide-react";
import { Badge } from "../../../components/Badge";
import { Card } from "../../../components/Card";
import { ResponseAreaChart, CheckBarChart } from "../../../../components/charts/recharts-barrel";
import { relativeTime } from "../../../components/timeUtils";
import { PERIOD_LABELS } from "./types";
import type {
  MonitorItem,
  AlertChannelInfo,
  MonitorDependency,
  MonitorRun,
  UptimePeriod,
  UptimeStats,
  ErrorBudget,
  HealthScore,
  MonitorEvent,
  ChartPoint,
} from "./types";
import nextDynamic from "next/dynamic";

// Sub-components
import { MonitorConfigCard } from "./overview/MonitorConfigCard";
import { SlaUptimeCard } from "./overview/SlaUptimeCard";
import { ErrorBudgetCard } from "./overview/ErrorBudgetCard";
import { LinkedIncidentsCard } from "./overview/LinkedIncidentsCard";
import { AdvancedSettingsCard } from "./overview/AdvancedSettingsCard";
import { ShareTokenCard } from "./overview/ShareTokenCard";
import { AlertChannelsCard } from "./overview/AlertChannelsCard";
import { DependenciesCard } from "./overview/DependenciesCard";
import { EventsTimelineCard } from "./overview/EventsTimelineCard";
import { DeliveryHistoryCard } from "./overview/DeliveryHistoryCard";
import { CheckRunsCard } from "./overview/CheckRunsCard";

const UptimeHeatmapChart = nextDynamic(() => import("./UptimeHeatmapChart").then(m => ({ default: m.UptimeHeatmapChart })), { ssr: false });
const LineSparkline = nextDynamic(() => import("../../../../components/charts/LineSparkline").then(m => ({ default: m.LineSparkline })), { ssr: false });

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

  const EVENT_COLORS: Record<string, string> = { deploy: "#3b82f6", incident: "#ef4444", maintenance: "#f59e0b", config: "#a855f7", note: "#6b7280" };

  return (
    <>
      {/* SLA & Uptime */}
      <SlaUptimeCard
        monitor={monitor} runs={runs} uptime={uptime} uptimePeriod={uptimePeriod}
        uptimeLoading={uptimeLoading} uptimeColor={uptimeColor} onUptimePeriodChange={onUptimePeriodChange}
        healthScore={healthScore} errorBudget={errorBudget}
      />

      {/* 90-day uptime calendar */}
      {runs.length > 0 && (() => {
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
          if (bucket) { bucket.total++; if (r.ok) bucket.ok++; }
        }
        const weeks: (typeof days[0] | null)[][] = [];
        let week: (typeof days[0] | null)[] = [];
        const firstDay = new Date(days[0].date + "T00:00:00Z");
        const startPad = firstDay.getUTCDay();
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
              lastRun.level === "yellow" ? <Badge variant="warning">Degraded</Badge> :
              lastRun.ok ? <Badge variant="success">OK</Badge> :
              <Badge variant="danger">Failed</Badge>
            ) : <Badge>Pending</Badge>}
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

      {/* Monitor type config card */}
      <MonitorConfigCard monitor={monitor} router={router} />

      {/* Response trend sparkline */}
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
            const p95Values = chartData.filter((pt) => pt.p95LatencyMs !== null).map((pt) => pt.p95LatencyMs as number);
            const roundedP95 = p95Values.length > 0 ? Math.round(p95Values.reduce((s, v) => s + v, 0) / p95Values.length) : undefined;
            const chartStart = mappedData.length > 0 ? new Date(mappedData[0].checkedAt as string).getTime() : 0;
            const chartEnd = mappedData.length > 0 ? new Date(mappedData[mappedData.length - 1].checkedAt as string).getTime() : 0;
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
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Check History</h2>
        <CheckBarChart
          data={runs.slice(0, 50).reverse().map((r) => ({
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
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Uptime Heatmap</h2>
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

      {/* Check runs table */}
      <CheckRunsCard
        id={id} monitor={monitor} runs={runs} runsStatusFilter={runsStatusFilter}
        runsHasMore={runsHasMore} runsTotal={runsTotal} runsLoadingMore={runsLoadingMore}
        expandedRunId={expandedRunId} onExpandedRunIdChange={onExpandedRunIdChange}
        onLoadFilteredRuns={onLoadFilteredRuns} onLoadMoreRuns={onLoadMoreRuns}
      />

      {/* Error + Latency budgets */}
      <ErrorBudgetCard
        monitor={monitor} errorBudget={errorBudget} latencyBudgetReport={latencyBudgetReport}
        latencyBudgetInput={latencyBudgetInput} onLatencyBudgetInputChange={onLatencyBudgetInputChange}
        latencyBudgetSaving={latencyBudgetSaving} onSaveLatencyBudget={onSaveLatencyBudget}
      />

      {/* Linked incidents */}
      <LinkedIncidentsCard linkedIncidents={linkedIncidents} />

      {/* Advanced settings */}
      <AdvancedSettingsCard monitor={monitor} />

      {/* Public share token */}
      <ShareTokenCard
        monitor={monitor} shareToken={shareToken} shareTokenLoading={shareTokenLoading}
        shareTokenCopied={shareTokenCopied} onGenerateShareToken={onGenerateShareToken}
        onRevokeShareToken={onRevokeShareToken} onCopyShareUrl={onCopyShareUrl}
      />

      {/* Alert channels */}
      <AlertChannelsCard alertChannels={alertChannels} onAlertChannelNotifyChange={onAlertChannelNotifyChange} />

      {/* Dependencies */}
      <DependenciesCard
        id={id} dependencies={dependencies} allMonitors={allMonitors}
        showAddDep={showAddDep} onShowAddDepChange={onShowAddDepChange}
        addingDepId={addingDepId} onAddingDepIdChange={onAddingDepIdChange}
        depLoading={depLoading} onAddDependency={onAddDependency} onRemoveDependency={onRemoveDependency}
      />

      {/* Timeline annotations */}
      <EventsTimelineCard
        events={events} newEventMsg={newEventMsg} onNewEventMsgChange={onNewEventMsgChange}
        newEventType={newEventType} onNewEventTypeChange={onNewEventTypeChange}
        addingEvent={addingEvent} eventError={eventError}
        onAddEvent={onAddEvent} onDeleteEvent={onDeleteEvent}
      />

      {/* Alert delivery history */}
      <DeliveryHistoryCard deliveryHistory={deliveryHistory} />
    </>
  );
}
