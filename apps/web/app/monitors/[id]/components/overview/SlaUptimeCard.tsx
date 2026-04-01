"use client";

import React from "react";
import { Activity, Zap, Clock, TrendingUp, Award } from "lucide-react";
import { Card } from "../../../../components/Card";
import { PERIOD_LABELS, formatDuration } from "../types";
import type { MonitorItem, UptimePeriod, UptimeStats, HealthScore, ErrorBudget, MonitorRun } from "../types";

interface Props {
  monitor: MonitorItem;
  runs: MonitorRun[];
  uptime: UptimeStats | null;
  uptimePeriod: UptimePeriod;
  uptimeLoading: boolean;
  uptimeColor: string;
  onUptimePeriodChange: (p: UptimePeriod) => void;
  healthScore: HealthScore | null;
  errorBudget: ErrorBudget | null;
}

export function SlaUptimeCard({
  monitor,
  runs,
  uptime,
  uptimePeriod,
  uptimeLoading,
  uptimeColor,
  onUptimePeriodChange,
  healthScore,
}: Props) {
  return (
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
        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-secondary uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3" /> MTTR
          </span>
          <span className={`text-2xl font-bold tabular-nums ${uptimeLoading ? "opacity-50" : ""} text-text-primary`}>
            {uptime !== null ? (uptime.mttrSec > 0 ? formatDuration(uptime.mttrSec) : "—") : "—"}
          </span>
          <span className="text-xs text-text-secondary">mean time to recover</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-secondary uppercase tracking-wider flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Avg Latency
          </span>
          <span className={`text-2xl font-bold tabular-nums ${uptimeLoading ? "opacity-50" : ""} text-text-primary`}>
            {uptime?.avgLatencyMs != null ? `${uptime.avgLatencyMs}ms` : "N/A"}
          </span>
          <span className="text-xs text-text-secondary">last {PERIOD_LABELS[uptimePeriod]}</span>
        </div>
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

      {/* Incident list */}
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
                <span className="text-text-secondary">{new Date(inc.start).toLocaleString()}</span>
                <span className="text-danger font-medium">
                  {inc.durationSec > 0 ? `↓ ${formatDuration(inc.durationSec)}` : "↓ <1 check"}
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
  );
}
