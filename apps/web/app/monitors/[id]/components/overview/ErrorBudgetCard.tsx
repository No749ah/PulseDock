"use client";

import React from "react";
import { Gauge } from "lucide-react";
import { Card } from "../../../../components/Card";
import type { MonitorItem, ErrorBudget } from "../types";

interface LatencyBudgetReport {
  monitorId: string;
  monitorName: string;
  latencyBudgetMs: number | null;
  periodStart: string;
  periodEnd: string;
  totalChecks: number;
  checksAboveBudget: number;
  budgetUsedPct: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  status: "no-budget" | "healthy" | "warning" | "exceeded";
}

interface Props {
  monitor: MonitorItem;
  errorBudget: ErrorBudget | null;
  latencyBudgetReport: LatencyBudgetReport | null;
  latencyBudgetInput: string;
  onLatencyBudgetInputChange: (v: string) => void;
  latencyBudgetSaving: boolean;
  onSaveLatencyBudget: () => Promise<void>;
}

export function ErrorBudgetCard({
  monitor,
  errorBudget,
  latencyBudgetReport,
  latencyBudgetInput,
  onLatencyBudgetInputChange,
  latencyBudgetSaving,
  onSaveLatencyBudget,
}: Props) {
  return (
    <>
      {/* SLO Error Budget */}
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
          <div>
            <div className="flex justify-between text-xs text-text-muted mb-1">
              <span>Budget consumed: {errorBudget.budgetConsumedPct.toFixed(1)}%</span>
              <span>
                {errorBudget.actualDownMinutes < 60
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

      {/* Latency Budget */}
      {(() => {
        const budgetMs = (monitor as typeof monitor & { latencyBudgetMs?: number | null }).latencyBudgetMs;
        const report = latencyBudgetReport;
        return (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                <Gauge className="w-4 h-4" />
                Latency Budget (P95)
              </h2>
              {report && report.status !== "no-budget" && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  report.status === "healthy" ? "bg-green-500/15 text-green-400" :
                  report.status === "warning" ? "bg-yellow-500/15 text-yellow-400" :
                  "bg-red-500/15 text-red-400"
                }`}>
                  {report.status === "healthy" ? "Healthy" : report.status === "warning" ? "Warning" : "Exceeded"}
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
                        report.p95LatencyMs === null ? "text-text-muted" :
                        report.latencyBudgetMs !== null && report.p95LatencyMs > report.latencyBudgetMs ? "text-danger" : "text-success"
                      }`}>
                        {report.p95LatencyMs !== null ? `${report.p95LatencyMs}ms` : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-text-secondary block mb-0.5">Budget Used</span>
                      <span className={`font-mono font-semibold ${
                        report.budgetUsedPct > 25 ? "text-danger" : report.budgetUsedPct > 10 ? "text-warning" : "text-success"
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
                          report.budgetUsedPct > 25 ? "bg-danger" :
                          report.budgetUsedPct > 10 ? "bg-warning" : "bg-success"
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
                    {latencyBudgetSaving ? "Saving…" : "Set Budget"}
                  </button>
                </div>
              </div>
            )}
          </Card>
        );
      })()}
    </>
  );
}
