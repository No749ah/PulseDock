"use client";

import { useState, useCallback, useEffect } from "react";
import { Settings, TrendingUp, Clock, Shield, AlertCircle, CheckCircle, AlertTriangle } from "lucide-react";
import { api } from "../../../../lib/api";
import type { SloReport, MonitorItem } from "./types";

interface SloTabProps {
  monitor: MonitorItem;
  userId: string;
  onMonitorUpdated: (updated: Partial<MonitorItem>) => void;
}

function StatusBadge({ status }: { status: "ok" | "warning" | "breached" }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/20">
        <CheckCircle className="w-3 h-3" />
        OK
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
        <AlertTriangle className="w-3 h-3" />
        WARNING
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/20">
      <AlertCircle className="w-3 h-3" />
      BREACHED
    </span>
  );
}

function formatMinutes(minutes: number): string {
  const abs = Math.abs(minutes);
  const sign = minutes < 0 ? "-" : "";
  if (abs < 1) return `${sign}${Math.round(abs * 60)}s`;
  if (abs < 60) return `${sign}${abs.toFixed(1)}m`;
  return `${sign}${(abs / 60).toFixed(1)}h`;
}

interface ConfigSloModalProps {
  monitor: MonitorItem;
  onClose: () => void;
  onSave: (data: {
    slaTarget: number;
    slaPeriodDays: number;
    sliLatencyTarget: number | null;
    sliLatencyWindow: number;
  }) => Promise<void>;
}

function ConfigSloModal({ monitor, onClose, onSave }: ConfigSloModalProps) {
  const [slaTarget, setSlaTarget] = useState(monitor.slaTarget ?? 99.9);
  const [slaPeriodDays, setSlaPeriodDays] = useState(monitor.slaPeriodDays ?? 30);
  const [sliLatencyTarget, setSliLatencyTarget] = useState<string>(
    monitor.sliLatencyTarget != null ? String(monitor.sliLatencyTarget) : ""
  );
  const [sliLatencyWindow, setSliLatencyWindow] = useState(monitor.sliLatencyWindow ?? 7);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave({
        slaTarget,
        slaPeriodDays,
        sliLatencyTarget: sliLatencyTarget !== "" ? Number(sliLatencyTarget) : null,
        sliLatencyWindow,
      });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save SLO configuration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-surface border border-white/10 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Settings className="w-5 h-5 text-accent" />
            Configure SLO
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              SLA Uptime Target (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={slaTarget}
              onChange={(e) => setSlaTarget(Number(e.target.value))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <p className="text-xs text-text-muted mt-1">e.g. 99.9 for three nines uptime</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              SLA Period (days)
            </label>
            <select
              value={slaPeriodDays}
              onChange={(e) => setSlaPeriodDays(Number(e.target.value))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              {[7, 30, 60, 90].map((d) => (
                <option key={d} value={d} className="bg-surface">
                  {d} days
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-white/5 pt-4">
            <p className="text-xs text-text-muted mb-3 font-medium uppercase tracking-wide">
              Latency SLI (optional)
            </p>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                p95 Latency Target (ms)
              </label>
              <input
                type="number"
                min={1}
                max={60000}
                placeholder="e.g. 500 — leave empty to disable"
                value={sliLatencyTarget}
                onChange={(e) => setSliLatencyTarget(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 placeholder:text-text-muted"
              />
            </div>

            <div className="mt-3">
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Latency Window (days)
              </label>
              <select
                value={sliLatencyWindow}
                onChange={(e) => setSliLatencyWindow(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                {[1, 7, 14, 30].map((d) => (
                  <option key={d} value={d} className="bg-surface">
                    {d} {d === 1 ? "day" : "days"}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-text-secondary hover:text-text-primary hover:border-white/20 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/80 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save SLO Config"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SloTab({ monitor, userId, onMonitorUpdated }: SloTabProps) {
  const [report, setReport] = useState<SloReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadReport = useCallback(async () => {
    if (loaded) return;
    setLoading(true);
    setError("");
    try {
      const data = await api<SloReport>(`/v1/monitors/${monitor.id}/slo-report`, userId);
      setReport(data);
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load SLO report");
    } finally {
      setLoading(false);
    }
  }, [monitor.id, userId, loaded]);

  // Auto-load on mount
  useEffect(() => {
    loadReport();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveConfig = async (data: {
    slaTarget: number;
    slaPeriodDays: number;
    sliLatencyTarget: number | null;
    sliLatencyWindow: number;
  }) => {
    await api(`/v1/monitors/${monitor.id}`, userId, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    onMonitorUpdated({
      slaTarget: data.slaTarget,
      slaPeriodDays: data.slaPeriodDays,
      sliLatencyTarget: data.sliLatencyTarget,
      sliLatencyWindow: data.sliLatencyWindow,
    });
    // Refresh report
    setLoaded(false);
    setReport(null);
    setTimeout(() => loadReport(), 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-text-muted">
        <div className="animate-pulse text-sm">Loading SLO report…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertCircle className="w-8 h-8 text-red-400 opacity-60" />
        <p className="text-sm text-text-muted">{error}</p>
        <button
          onClick={() => { setLoaded(false); loadReport(); }}
          className="text-xs text-accent hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">SLO / SLI Report</h3>
          {report && (
            <p className="text-xs text-text-muted mt-0.5">
              Rolling {report.period.days}-day window
            </p>
          )}
        </div>
        <button
          onClick={() => setShowConfigModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-xs text-text-secondary"
        >
          <Settings className="w-3.5 h-3.5" />
          Configure SLO
        </button>
      </div>

      {!report ? (
        <div className="flex items-center justify-center py-12 text-text-muted text-sm">
          No SLO data — configure targets above
        </div>
      ) : (
        <>
          {/* Uptime SLO Card */}
          <div className="bg-white/3 border border-white/8 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold text-text-primary">Uptime SLO</span>
              </div>
              <StatusBadge status={report.uptime.status} />
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs text-text-muted mb-0.5">Target</p>
                <p className="text-xl font-bold text-text-primary tabular-nums">{report.uptime.target}%</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-0.5">Actual</p>
                <p className={`text-xl font-bold tabular-nums ${
                  report.uptime.actual >= report.uptime.target ? "text-green-400" : "text-red-400"
                }`}>
                  {report.uptime.actual.toFixed(3)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-0.5">Checks</p>
                <p className="text-xl font-bold text-text-primary tabular-nums">
                  {report.uptime.totalChecks.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Error Budget Bar */}
            <div className="mt-3">
              <div className="flex justify-between text-xs text-text-muted mb-1.5">
                <span>Error Budget</span>
                <span>
                  {report.uptime.remainingBudgetMinutes >= 0
                    ? `${formatMinutes(report.uptime.remainingBudgetMinutes)} remaining`
                    : `${formatMinutes(Math.abs(report.uptime.remainingBudgetMinutes))} over budget`}
                </span>
              </div>
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                {(() => {
                  const total = report.errorBudget.uptimeBudgetMinutes;
                  const burned = report.errorBudget.uptimeBurnedMinutes;
                  const pct = total === 0 ? 0 : Math.min(100, (burned / total) * 100);
                  const color = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-green-500";
                  return <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />;
                })()}
              </div>
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>Burned: {formatMinutes(report.errorBudget.uptimeBurnedMinutes)}</span>
                <span>Budget: {formatMinutes(report.errorBudget.uptimeBudgetMinutes)}</span>
              </div>
            </div>
          </div>

          {/* Latency SLI Card */}
          {report.latency && (
            <div className="bg-white/3 border border-white/8 rounded-xl p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-semibold text-text-primary">Latency SLI</span>
                  <span className="text-xs text-text-muted">({report.latency.window}d window)</span>
                </div>
                <StatusBadge status={report.latency.status} />
              </div>

              <div className="grid grid-cols-4 gap-3 mb-3">
                <div className="text-center">
                  <p className="text-xs text-text-muted mb-0.5">Target (p95)</p>
                  <p className="text-lg font-bold text-accent tabular-nums">{report.latency.target}ms</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-text-muted mb-0.5">p50</p>
                  <p className="text-lg font-bold text-text-primary tabular-nums">{report.latency.p50}ms</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-text-muted mb-0.5">p95</p>
                  <p className={`text-lg font-bold tabular-nums ${
                    report.latency.p95 >= report.latency.target ? "text-red-400" : "text-text-primary"
                  }`}>
                    {report.latency.p95}ms
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-text-muted mb-0.5">p99</p>
                  <p className="text-lg font-bold text-text-primary tabular-nums">{report.latency.p99}ms</p>
                </div>
              </div>

              <div className="flex justify-between text-xs text-text-muted border-t border-white/5 pt-2">
                <span>{report.latency.exceedingChecks} of {report.latency.totalChecks} checks exceed target</span>
                <span>
                  {report.latency.totalChecks === 0
                    ? "0%"
                    : `${((report.latency.exceedingChecks / report.latency.totalChecks) * 100).toFixed(1)}% exceeding`}
                </span>
              </div>
            </div>
          )}

          {/* Error Budget Overview */}
          <div className="bg-white/3 border border-white/8 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-semibold text-text-primary">Error Budget Overview</span>
              </div>
              <StatusBadge status={report.errorBudget.overallHealth} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/3 rounded-lg p-3">
                <p className="text-xs text-text-muted mb-1">Uptime Burn Rate</p>
                <p className={`text-2xl font-bold tabular-nums ${
                  report.errorBudget.uptimeBurnRate > 1 ? "text-red-400" :
                  report.errorBudget.uptimeBurnRate > 0.8 ? "text-yellow-400" : "text-green-400"
                }`}>
                  {report.errorBudget.uptimeBurnRate.toFixed(2)}×
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {report.errorBudget.uptimeBurnRate > 1 ? "Burning faster than earning" : "Within budget"}
                </p>
              </div>

              {report.latency && (
                <div className="bg-white/3 rounded-lg p-3">
                  <p className="text-xs text-text-muted mb-1">Latency Burn Rate</p>
                  <p className={`text-2xl font-bold tabular-nums ${
                    report.errorBudget.latencyBurnRate > 1 ? "text-red-400" :
                    report.errorBudget.latencyBurnRate > 0.8 ? "text-yellow-400" : "text-green-400"
                  }`}>
                    {report.errorBudget.latencyBurnRate.toFixed(2)}×
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {report.errorBudget.latencyBurnedPct.toFixed(1)}% of {report.errorBudget.latencyBudgetPct}% budget used
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {showConfigModal && (
        <ConfigSloModal
          monitor={monitor}
          onClose={() => setShowConfigModal(false)}
          onSave={handleSaveConfig}
        />
      )}
    </div>
  );
}
