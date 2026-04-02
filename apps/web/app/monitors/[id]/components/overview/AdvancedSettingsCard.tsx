"use client";

import React from "react";
import { Settings } from "lucide-react";
import { Card } from "../../../../components/Card";
import type { MonitorItem } from "../types";

type ExtendedMonitor = MonitorItem & {
  latencyAlertMs?: number | null;
  statusWebhookUrl?: string | null;
};

interface Props {
  monitor: MonitorItem;
}

export function AdvancedSettingsCard({ monitor }: Props) {
  const m = monitor as ExtendedMonitor;
  const hasSettings =
    (m.retryCount != null && m.retryCount > 0) ||
    m.anomalyDetection ||
    m.latencyAlertMs ||
    m.scheduleEnabled ||
    (m.confirmations != null && m.confirmations > 1) ||
    m.autoIncident ||
    m.runbookUrl ||
    m.statusWebhookUrl ||
    (m.timeoutMs && m.timeoutMs > 0);

  if (!hasSettings) return null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Advanced Settings
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        {m.confirmations != null && m.confirmations > 1 && (
          <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-surface-elevated/60 border border-border/60">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Confirmations</span>
            <span className="text-text-primary font-medium">{m.confirmations}× before alert</span>
            <span className="text-[10px] text-text-secondary">Reduces false positives</span>
          </div>
        )}
        {m.retryCount != null && m.retryCount > 0 && (
          <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-surface-elevated/60 border border-border/60">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Retries</span>
            <span className="text-text-primary font-medium">{m.retryCount}× on failure</span>
            <span className="text-[10px] text-text-secondary">Exponential backoff</span>
          </div>
        )}
        {m.latencyAlertMs && (
          <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <span className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wider">Latency Threshold</span>
            <span className="text-text-primary font-medium">&gt; {m.latencyAlertMs}ms</span>
            <span className="text-[10px] text-text-secondary">Alert on slow responses</span>
          </div>
        )}
        {m.anomalyDetection && (
          <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider">Anomaly Detection</span>
            <span className="text-text-primary font-medium">{m.anomalyMultiplier ?? 2}× P95 baseline</span>
            <span className="text-[10px] text-text-secondary">Dynamic latency alerting</span>
          </div>
        )}
        {m.scheduleEnabled && (
          <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Business Hours</span>
            <span className="text-text-primary font-medium">
              {m.scheduleStartHour ?? 8}:00 – {m.scheduleEndHour ?? 18}:00 UTC
            </span>
            <span className="text-[10px] text-text-secondary">
              {(m.scheduleDays ?? "1,2,3,4,5").split(",").map((d) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][parseInt(d)] ?? d).join(", ")}
            </span>
          </div>
        )}
        {m.autoIncident && (
          <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <span className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider">Auto Incidents</span>
            <span className="text-text-primary font-medium capitalize">{(m.autoIncidentSeverity ?? "MEDIUM").toLowerCase()} severity</span>
            <span className="text-[10px] text-text-secondary">Auto-creates on outage</span>
          </div>
        )}
        {m.timeoutMs && m.timeoutMs > 0 && (
          <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-surface-elevated/60 border border-border/60">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Request Timeout</span>
            <span className="text-text-primary font-medium">{m.timeoutMs}ms</span>
            <span className="text-[10px] text-text-secondary">Custom timeout override</span>
          </div>
        )}
        {m.runbookUrl && (
          <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-surface-elevated/60 border border-border/60">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Runbook</span>
            <a
              href={m.runbookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline text-xs truncate"
              title={m.runbookUrl}
            >
              Open runbook →
            </a>
          </div>
        )}
        {m.statusWebhookUrl && (
          <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-surface-elevated/60 border border-border/60">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Status Webhook</span>
            <span className="text-xs text-text-secondary truncate" title={m.statusWebhookUrl}>
              🔔 Active — fires on status change
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
