"use client";

import React, { useState } from "react";

export interface ConfigHistoryEntry {
  id: string;
  summary: string;
  createdAt: string;
  changes: Array<{ field: string; from: unknown; to: unknown }>;
}

interface Props {
  configHistory: ConfigHistoryEntry[];
  configHistoryLoading: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  description: "Description",
  target: "Target URL",
  type: "Monitor Type",
  intervalSec: "Check Interval (s)",
  timeoutMs: "Timeout (ms)",
  confirmations: "Confirmations",
  retryCount: "Retry Count",
  enabled: "Enabled",
  slaTarget: "SLA Target (%)",
  slaPeriodDays: "SLA Period (days)",
  autoIncident: "Auto-Create Incidents",
  autoIncidentSeverity: "Incident Severity",
  flapDetectionEnabled: "Flap Detection",
  flapWindow: "Flap Window",
  flapThreshold: "Flap Threshold",
  latencyAlertMs: "Latency Alert Threshold (ms)",
  anomalyDetection: "Anomaly Detection",
  anomalyMultiplier: "Anomaly Multiplier",
  cronExpression: "Cron Expression",
  scheduleEnabled: "Business Hours Schedule",
  scheduleDays: "Schedule Days",
  scheduleStartHour: "Schedule Start Hour",
  scheduleEndHour: "Schedule End Hour",
  sliLatencyTarget: "Latency SLI Target (ms)",
  rtoMinutes: "RTO (minutes)",
  throttleMs: "Throttle (ms)",
  maxChecksPerHour: "Max Checks/Hour",
  metricPath: "Metric JSONPath",
  metricName: "Metric Name",
  metricAlertMin: "Metric Min Alert",
  metricAlertMax: "Metric Max Alert",
  graphqlQuery: "GraphQL Query",
  graphqlDataPath: "GraphQL Data Path",
  graphqlExpectedValue: "GraphQL Expected Value",
};

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v);
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}

function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ConfigEntryRow({ entry }: { entry: ConfigHistoryEntry }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const changes = (entry.changes ?? []) as Array<{ field: string; from: unknown; to: unknown }>;

  return (
    <div className="rounded-lg border border-border bg-surface/50 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-start justify-between p-3 hover:bg-surface/80 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-xs font-semibold text-brand-accent">
              {changes.length} field{changes.length !== 1 ? "s" : ""} changed
            </span>
            <span className="text-xs text-text-muted">·</span>
            <span className="text-xs text-text-muted">{relTime(entry.createdAt)}</span>
            <span className="text-xs text-text-muted">·</span>
            <span className="text-xs text-text-muted">{new Date(entry.createdAt).toLocaleString()}</span>
          </div>
          <p className="text-xs text-text-secondary truncate">{entry.summary}</p>
        </div>
        <span className="text-text-muted text-xs ml-2 mt-0.5 shrink-0">{isExpanded ? "▲" : "▼"}</span>
      </button>

      {isExpanded && (
        <div className="border-t border-border p-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-muted">
                <th className="text-left pb-2 font-medium w-1/4">Field</th>
                <th className="text-left pb-2 font-medium w-[37.5%]">Before</th>
                <th className="text-left pb-2 font-medium w-[37.5%]">After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {changes.map((change, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-3 font-medium text-text-secondary">
                    {FIELD_LABELS[change.field] ?? change.field}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-red-400/80 line-through">{formatVal(change.from)}</td>
                  <td className="py-1.5 font-mono text-green-400">{formatVal(change.to)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ConfigHistoryTab({ configHistory, configHistoryLoading }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Config Change History</h3>
        <span className="text-xs text-text-muted">
          {configHistory.length} change{configHistory.length !== 1 ? "s" : ""} recorded
        </span>
      </div>

      {configHistoryLoading && (
        <div className="text-sm text-text-muted py-8 text-center">Loading history…</div>
      )}

      {!configHistoryLoading && configHistory.length === 0 && (
        <div className="rounded-lg border border-border bg-surface/50 p-8 text-center">
          <div className="text-2xl mb-2">📋</div>
          <p className="text-sm font-medium text-text-secondary">No config changes recorded yet</p>
          <p className="text-xs text-text-muted mt-1">
            Config changes are tracked automatically when you edit this monitor.
          </p>
        </div>
      )}

      {!configHistoryLoading && configHistory.map((entry) => (
        <ConfigEntryRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
