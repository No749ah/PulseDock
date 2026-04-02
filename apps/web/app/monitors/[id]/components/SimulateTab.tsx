"use client";

import React from "react";
import { Zap, AlertCircle, CheckCircle } from "lucide-react";
import { Card } from "../../../components/Card";

export interface SimResult {
  totalRuns: number;
  totalFails: number;
  uptimePct: number;
  alertsFired: number;
  recoverysFired: number;
  flappingAlertsFired: number;
  alertsPerDay: number;
  noiseScore: "low" | "medium" | "high";
  timeline: Array<{ timestamp: string; type: "alert" | "recovery" | "flapping"; reason: string }>;
  currentConfig: { confirmations: number; flapDetection: boolean; flapWindow: number; flapThreshold: number };
}

interface Props {
  monitorId: string;
  simConfirmations: number;
  simFlapDetection: boolean;
  simFlapWindow: number;
  simFlapThreshold: number;
  simScheduleEnabled: boolean;
  simScheduleStartHour: number;
  simScheduleEndHour: number;
  simLoading: boolean;
  simError: string | null;
  simResult: SimResult | null;
  showApplyConfirm: boolean;
  applyLoading: boolean;
  onConfirmationsChange: (n: number) => void;
  onFlapDetectionChange: (v: boolean) => void;
  onFlapWindowChange: (n: number) => void;
  onFlapThresholdChange: (n: number) => void;
  onScheduleEnabledChange: (v: boolean) => void;
  onScheduleStartHourChange: (n: number) => void;
  onScheduleEndHourChange: (n: number) => void;
  onSimulate: () => Promise<void>;
  onShowApplyConfirm: (v: boolean) => void;
  onApply: () => Promise<void>;
}

export function SimulateTab({
  simConfirmations,
  simFlapDetection,
  simFlapWindow,
  simFlapThreshold,
  simScheduleEnabled,
  simScheduleStartHour,
  simScheduleEndHour,
  simLoading,
  simError,
  simResult,
  showApplyConfirm,
  applyLoading,
  onConfirmationsChange,
  onFlapDetectionChange,
  onFlapWindowChange,
  onFlapThresholdChange,
  onScheduleEnabledChange,
  onScheduleStartHourChange,
  onScheduleEndHourChange,
  onSimulate,
  onShowApplyConfirm,
  onApply,
}: Props) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: settings */}
        <Card className="p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Alert Rule Settings
            </h2>
            <p className="text-xs text-text-muted mt-1">Adjust settings to see how many alerts would have fired over the last 7 days.</p>
          </div>

          {/* Confirmations */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-text-primary">Confirmations</label>
              <span className="text-sm font-mono text-accent">{simConfirmations}</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              value={simConfirmations}
              onChange={(e) => onConfirmationsChange(Number(e.target.value))}
              className="w-full accent-accent"
            />
            <p className="text-xs text-text-muted">Consecutive failures required before alerting.</p>
          </div>

          {/* Flap Detection */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">Flap Detection</p>
              <p className="text-xs text-text-muted">Suppress alerts when monitor is rapidly toggling.</p>
            </div>
            <button
              onClick={() => onFlapDetectionChange(!simFlapDetection)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${simFlapDetection ? "bg-accent" : "bg-surface-elevated border border-border"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${simFlapDetection ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          {simFlapDetection && (
            <div className="pl-4 border-l border-border space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-text-secondary">Flap Window</label>
                  <span className="text-sm font-mono text-accent">{simFlapWindow} runs</span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={10}
                  value={simFlapWindow}
                  onChange={(e) => onFlapWindowChange(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-text-secondary">Flap Threshold</label>
                  <span className="text-sm font-mono text-accent">{simFlapThreshold} changes</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={5}
                  value={simFlapThreshold}
                  onChange={(e) => onFlapThresholdChange(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
            </div>
          )}

          {/* Business Hours Filter */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">Business Hours Only</p>
              <p className="text-xs text-text-muted">Only alert during specific UTC hours.</p>
            </div>
            <button
              onClick={() => onScheduleEnabledChange(!simScheduleEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${simScheduleEnabled ? "bg-accent" : "bg-surface-elevated border border-border"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${simScheduleEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          {simScheduleEnabled && (
            <div className="pl-4 border-l border-border flex items-center gap-4">
              <div>
                <label className="text-xs text-text-muted block mb-1">Start Hour (UTC)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={simScheduleStartHour}
                  onChange={(e) => onScheduleStartHourChange(Number(e.target.value))}
                  className="w-20 px-2 py-1 text-sm rounded-lg border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">End Hour (UTC)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={simScheduleEndHour}
                  onChange={(e) => onScheduleEndHourChange(Number(e.target.value))}
                  className="w-20 px-2 py-1 text-sm rounded-lg border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
          )}

          <button
            onClick={onSimulate}
            disabled={simLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            <Zap className="w-4 h-4" />
            {simLoading ? "Simulating…" : "Simulate"}
          </button>

          {simError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/20">
              <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
              <span className="text-xs text-danger">{simError}</span>
            </div>
          )}
        </Card>

        {/* Right: results */}
        <div className="space-y-4">
          {!simResult && !simLoading && (
            <Card className="p-8 flex flex-col items-center gap-3 text-center">
              <Zap className="w-10 h-10 text-text-muted opacity-30" />
              <p className="text-sm font-medium text-text-secondary">No simulation yet</p>
              <p className="text-xs text-text-muted">Configure settings and click Simulate to see results.</p>
            </Card>
          )}

          {simLoading && (
            <Card className="p-8 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            </Card>
          )}

          {simResult && !simLoading && (
            <>
              {/* Noise score badge */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Simulation Results</h3>
                  <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                    simResult.noiseScore === "low"
                      ? "bg-green-500/15 text-green-400 border-green-500/30"
                      : simResult.noiseScore === "medium"
                      ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                      : "bg-red-500/15 text-red-400 border-red-500/30"
                  }`}>
                    {simResult.noiseScore === "low" ? "🟢" : simResult.noiseScore === "medium" ? "🟡" : "🔴"}
                    {simResult.noiseScore.charAt(0).toUpperCase() + simResult.noiseScore.slice(1)} noise
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Alerts", value: simResult.alertsFired, color: simResult.alertsFired > 0 ? "text-danger" : "text-success" },
                    { label: "Recoveries", value: simResult.recoverysFired, color: "text-blue-400" },
                    { label: "Flapping", value: simResult.flappingAlertsFired, color: simResult.flappingAlertsFired > 0 ? "text-warning" : "text-text-secondary" },
                    { label: "Per day avg", value: `${simResult.alertsPerDay}`, color: "text-text-primary" },
                  ].map((stat) => (
                    <div key={stat.label} className="text-center p-2 rounded-lg bg-surface-elevated border border-border">
                      <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{stat.label}</p>
                      <p className={`text-lg font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: "Total Runs", value: simResult.totalRuns },
                    { label: "Total Fails", value: simResult.totalFails },
                    { label: "Uptime", value: `${simResult.uptimePct}%` },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <p className="text-[10px] text-text-muted uppercase tracking-wider">{stat.label}</p>
                      <p className="text-sm font-semibold text-text-primary tabular-nums">{stat.value}</p>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Apply to monitor button */}
              <button
                onClick={() => onShowApplyConfirm(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 font-medium text-sm transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Apply to Monitor
              </button>

              {/* Timeline */}
              {simResult.timeline.length > 0 ? (
                <Card className="p-4">
                  <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Alert Timeline</h3>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {simResult.timeline.map((event, i) => {
                      const typeConfig = {
                        alert: { color: "text-danger", bg: "bg-danger/10 border-danger/20", label: "Alert" },
                        recovery: { color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20", label: "Recovery" },
                        flapping: { color: "text-warning", bg: "bg-warning/10 border-warning/20", label: "Flapping" },
                      }[event.type];
                      return (
                        <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs ${typeConfig.bg}`}>
                          <span className={`font-semibold shrink-0 ${typeConfig.color}`}>{typeConfig.label}</span>
                          <span className="text-text-secondary flex-1">{event.reason}</span>
                          <span className="text-text-muted shrink-0 font-mono">
                            {new Date(event.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ) : (
                <Card className="p-4 text-center text-sm text-text-muted">
                  No alerts would have fired with these settings. ✓
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* Apply to monitor confirmation dialog */}
      {showApplyConfirm && simResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => onShowApplyConfirm(false)}>
          <div className="w-full max-w-md mx-4 rounded-2xl border border-border bg-surface-elevated shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-text-primary mb-1">Apply Simulated Config?</h2>
            <p className="text-sm text-text-secondary mb-4">
              This will update the monitor with the following settings:
            </p>
            <div className="space-y-2 mb-4 text-sm">
              <div className="flex justify-between"><span className="text-text-muted">Confirmations</span><span className="text-text-primary font-medium">{simConfirmations}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Flap Detection</span><span className="text-text-primary font-medium">{simFlapDetection ? "Enabled" : "Disabled"}</span></div>
              {simFlapDetection && <>
                <div className="flex justify-between"><span className="text-text-muted">Flap Window</span><span className="text-text-primary font-medium">{simFlapWindow} runs</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Flap Threshold</span><span className="text-text-primary font-medium">{simFlapThreshold} changes</span></div>
              </>}
              <div className="flex justify-between"><span className="text-text-muted">Business Hours</span><span className="text-text-primary font-medium">{simScheduleEnabled ? `${simScheduleStartHour}:00–${simScheduleEndHour}:00 UTC` : "All hours"}</span></div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => onShowApplyConfirm(false)} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
              <button
                onClick={onApply}
                disabled={applyLoading}
                className="px-4 py-2 text-sm font-medium rounded-xl bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {applyLoading ? "Applying…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
