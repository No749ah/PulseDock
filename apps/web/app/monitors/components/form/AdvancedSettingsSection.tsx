"use client";

import React from "react";
import { HelpTooltip } from "../../../../components/help-tooltip";
import { brand } from "../../../../lib/brand";
import { inputClass } from "../../constants";
import type { MonitorFormData } from "../../types";
import { GeoRegionsInput } from "./GeoRegionsInput";

type AdvancedFormData = MonitorFormData & {
  adaptiveIntervalEnabled?: boolean;
  adaptiveIntervalDownSec?: number | null;
  adaptiveIntervalDegradedSec?: number | null;
  statusWebhookUrl?: string;
  statusWebhookSecret?: string;
  priority?: number;
  downtimeCostPerHour?: number | null;
};

interface AdvancedSettingsSectionProps {
  formData: AdvancedFormData;
  formErrors: Record<string, string>;
  formTouched: Record<string, boolean>;
  onSetFormData: (data: AdvancedFormData) => void;
  onSetFormErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSetFormTouched: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

export function AdvancedSettingsSection({
  formData,
  formErrors,
  formTouched,
  onSetFormData,
  onSetFormErrors,
  onSetFormTouched,
}: AdvancedSettingsSectionProps) {
  return (
    <>
      {/* Interval + Confirmations + Retries */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Check Interval (seconds) <span className="text-danger" aria-hidden="true">*</span>
            <HelpTooltip content={`How often ${brand.name} checks your monitor. Minimum 30s, maximum 3600s (1 hour). Lower intervals catch outages faster but use more resources.`} className="ml-1 align-middle" />
          </label>
          <input
            type="number" min="30" max="3600"
            value={formData.intervalSec}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              onSetFormData({ ...formData, intervalSec: val });
              if (formTouched.interval) onSetFormErrors((prev) => ({ ...prev, interval: val < 30 ? "Min 30s" : val > 3600 ? "Max 3600s" : "" }));
            }}
            onBlur={() => onSetFormTouched((t) => ({ ...t, interval: true }))}
            className={`${inputClass} ${formTouched.interval && formErrors.interval ? "border-danger focus:ring-danger" : ""}`}
            aria-invalid={formTouched.interval && !!formErrors.interval}
          />
          {formTouched.interval && formErrors.interval ? (
            <p role="alert" className="mt-1 text-xs text-danger">{formErrors.interval}</p>
          ) : (
            <p className="mt-1 text-xs text-text-secondary">Between 30 and 3600 seconds</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Failure confirmations <span className="text-danger" aria-hidden="true">*</span>
            <HelpTooltip content="Number of consecutive failures before triggering an alert. Set to 1 for immediate alerts, or higher to reduce false positives from transient errors. Range: 1–10." className="ml-1 align-middle" />
          </label>
          <input
            type="number" min="1" max="10"
            value={formData.confirmations}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              onSetFormData({ ...formData, confirmations: val });
              if (formTouched.confirmations) onSetFormErrors((prev) => ({ ...prev, confirmations: val < 1 ? "Min 1" : val > 10 ? "Max 10" : "" }));
            }}
            onBlur={() => onSetFormTouched((t) => ({ ...t, confirmations: true }))}
            className={`${inputClass} ${formTouched.confirmations && formErrors.confirmations ? "border-danger focus:ring-danger" : ""}`}
            aria-invalid={formTouched.confirmations && !!formErrors.confirmations}
          />
          {formTouched.confirmations && formErrors.confirmations ? (
            <p role="alert" className="mt-1 text-xs text-danger">{formErrors.confirmations}</p>
          ) : (
            <p className="mt-1 text-xs text-text-secondary">Consecutive failures before alerting (1-10).</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Retries on failure
            <HelpTooltip content="Automatically retry failed checks before recording as failed. Uses exponential backoff: 500ms, 1s, 2s. Prevents false alerts from transient network blips. Range: 0–3." className="ml-1 align-middle" />
          </label>
          <select value={formData.retryCount ?? 0} onChange={(e) => onSetFormData({ ...formData, retryCount: parseInt(e.target.value) })} className={inputClass}>
            <option value={0}>0 — No retries (alert immediately)</option>
            <option value={1}>1 retry (500ms backoff)</option>
            <option value={2}>2 retries (500ms + 1s backoff)</option>
            <option value={3}>3 retries (500ms + 1s + 2s backoff)</option>
          </select>
          <p className="mt-1 text-xs text-text-secondary">Retries before recording failure (0–3).</p>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Description</label>
        <input type="text" value={formData.description} onChange={(e) => onSetFormData({ ...formData, description: e.target.value })} className={inputClass} placeholder="Optional notes about this monitor" />
      </div>

      {/* Runbook URL */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Runbook URL</label>
        <input type="url" value={formData.runbookUrl} onChange={(e) => onSetFormData({ ...formData, runbookUrl: e.target.value })} className={inputClass} placeholder="https://wiki.example.com/runbooks/service-outage" />
        <p className="mt-1 text-xs text-text-secondary">Optional. Link to your incident runbook — included in alert notifications.</p>
      </div>

      {/* SLA Target */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">SLA Target (%)</label>
        <input type="number" min="0" max="100" step="0.01" placeholder="e.g. 99.9" value={formData.slaTarget} onChange={(e) => onSetFormData({ ...formData, slaTarget: e.target.value === "" ? "" : parseFloat(e.target.value) })} className={inputClass} />
        <p className="mt-1 text-xs text-text-secondary">Optional. Alert when rolling uptime drops below this percentage.</p>
      </div>

      {/* SLA Period */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">SLA Period</label>
        <select value={formData.slaPeriodDays} onChange={(e) => onSetFormData({ ...formData, slaPeriodDays: parseInt(e.target.value) })} className={inputClass}>
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
        <p className="mt-1 text-xs text-text-secondary">Rolling window for SLA uptime calculation.</p>
      </div>

      {/* Latency SLI */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Latency SLI Target (ms) <span className="text-text-muted font-normal">— optional</span>
        </label>
        <input type="number" min="1" max="60000" placeholder="e.g. 500 — p95 latency must be below this" value={formData.sliLatencyTarget ?? ""} onChange={(e) => onSetFormData({ ...formData, sliLatencyTarget: e.target.value === "" ? "" : parseInt(e.target.value) })} className={inputClass} />
        <p className="mt-1 text-xs text-text-secondary">Alert when p95 response time exceeds this threshold.</p>
      </div>

      {/* Latency SLI Window */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Latency SLI Window</label>
        <select value={formData.sliLatencyWindow ?? 7} onChange={(e) => onSetFormData({ ...formData, sliLatencyWindow: parseInt(e.target.value) })} className={inputClass}>
          <option value={1}>1 day</option>
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
        </select>
        <p className="mt-1 text-xs text-text-secondary">Rolling window for Latency SLI measurement.</p>
      </div>

      {/* RTO */}
      <div>
        <label className="text-sm font-medium text-white">
          Recovery Time Objective (RTO) <span className="ml-1 text-xs text-white/40">(optional)</span>
        </label>
        <div className="flex items-center gap-2 mt-1">
          <input type="number" min={1} max={10080} placeholder="e.g. 15" value={formData.rtoMinutes ?? ""} onChange={(e) => onSetFormData({ ...formData, rtoMinutes: e.target.value === "" ? undefined : parseInt(e.target.value) })} className="w-32 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
          <span className="text-sm text-white/50">minutes</span>
        </div>
        <p className="text-xs text-white/40 mt-1">Alert breach when recovery takes longer than this target</p>
      </div>

      {/* Priority */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-sm font-semibold text-text-primary">Priority / Criticality</label>
          <p className="mt-0.5 text-xs text-text-secondary">Set the business priority for this monitor. Used for sorting, filtering, and alert routing rules.</p>
        </div>
        <select
          value={formData.priority ?? 0}
          onChange={(e) => onSetFormData({ ...formData, priority: parseInt(e.target.value) })}
          className="w-48 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value={0}>Unset</option>
          <option value={1}>P1 — Critical</option>
          <option value={2}>P2 — High</option>
          <option value={3}>P3 — Medium</option>
          <option value={4}>P4 — Low</option>
        </select>
      </div>

      {/* Downtime Cost */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-sm font-semibold text-text-primary">Downtime Cost</label>
          <p className="mt-0.5 text-xs text-text-secondary">Estimated business cost per hour of downtime (USD). Used to compute financial impact in reports and monitor detail.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/50">$</span>
          <input type="number" min={0} step={10} placeholder="e.g. 500" value={formData.downtimeCostPerHour ?? ""} onChange={(e) => onSetFormData({ ...formData, downtimeCostPerHour: e.target.value === "" ? null : parseFloat(e.target.value) })} className="w-32 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
          <span className="text-sm text-white/50">per hour</span>
        </div>
        <p className="text-xs text-white/40">Leave blank to skip financial impact calculations</p>
      </div>

      {/* Status Webhook */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-sm font-semibold text-text-primary">Status Change Webhook</label>
          <p className="mt-0.5 text-xs text-text-secondary">POST to this URL whenever this monitor&apos;s status changes (green↔yellow/red). Useful for CI/CD integrations and automation.</p>
        </div>
        <div>
          <label htmlFor="statusWebhookUrl" className="text-xs text-text-secondary block mb-1">Webhook URL</label>
          <input id="statusWebhookUrl" type="url" placeholder="https://example.com/hooks/monitor-status" value={formData.statusWebhookUrl ?? ""} onChange={(e) => onSetFormData({ ...formData, statusWebhookUrl: e.target.value || "" })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30" />
        </div>
        {!!formData.statusWebhookUrl && (
          <div>
            <label htmlFor="statusWebhookSecret" className="text-xs text-text-secondary block mb-1">Signing Secret <span className="text-white/30">(optional — adds X-{brand.name}-Signature header)</span></label>
            <input id="statusWebhookSecret" type="password" placeholder="Leave blank to skip signature" value={formData.statusWebhookSecret ?? ""} onChange={(e) => onSetFormData({ ...formData, statusWebhookSecret: e.target.value || "" })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30" />
            <p className="text-xs text-white/40 mt-1">HMAC-SHA256: verify with <code className="bg-white/10 px-1 rounded">sha256=&lt;hex&gt;</code> from the X-{brand.name}-Signature header</p>
          </div>
        )}
      </div>

      {/* Rate Limiting */}
      <div className="border border-border rounded-lg p-4 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-text-primary">Rate Limiting</label>
          <p className="mt-0.5 text-xs text-text-secondary">Prevent thundering herds and be a good citizen to monitored services.</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Min. delay between checks (ms)</label>
            <div className="flex items-center gap-3">
              <input type="number" min="1000" max="3600000" step="1000" placeholder="e.g. 5000" value={formData.throttleMs ?? ""} onChange={(e) => { const val = e.target.value === "" ? null : parseInt(e.target.value, 10); onSetFormData({ ...formData, throttleMs: val && val >= 1000 ? val : null }); }} className="w-36 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
              <span className="text-sm text-text-muted">ms</span>
            </div>
            <p className="text-xs text-text-muted mt-1">Prevents rapid successive checks after interval drift. Min 1000ms.</p>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Max checks per hour</label>
            <div className="flex items-center gap-3">
              <input type="number" min="1" max="360" step="1" placeholder="e.g. 60" value={formData.maxChecksPerHour ?? ""} onChange={(e) => { const val = e.target.value === "" ? null : parseInt(e.target.value, 10); onSetFormData({ ...formData, maxChecksPerHour: val && val >= 1 ? val : null }); }} className="w-36 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
              <span className="text-sm text-text-muted">checks/hr</span>
            </div>
            <p className="text-xs text-text-muted mt-1">Hard cap regardless of interval. Max 360.</p>
          </div>
        </div>

        {/* Adaptive Check Interval */}
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-semibold text-text-primary">Adaptive Check Interval</label>
              <p className="mt-0.5 text-xs text-text-secondary">Automatically increase check frequency when the monitor is degraded or down, then return to normal on recovery. Catches faster recovery times and reduces alert lag.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
              <input type="checkbox" className="sr-only peer" checked={formData.adaptiveIntervalEnabled ?? false} onChange={(e) => onSetFormData({ ...formData, adaptiveIntervalEnabled: e.target.checked })} />
              <div className="w-9 h-5 bg-surface-raised rounded-full peer peer-checked:bg-accent after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4 border border-border" />
            </label>
          </div>
          {formData.adaptiveIntervalEnabled && (
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">When DOWN (red) — interval (sec)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="10" max="3600" step="5" placeholder={`Default: ${Math.max(10, Math.floor((formData.intervalSec ?? 60) / 4))}s`} value={formData.adaptiveIntervalDownSec ?? ""} onChange={(e) => { const val = e.target.value === "" ? null : parseInt(e.target.value, 10); onSetFormData({ ...formData, adaptiveIntervalDownSec: val && val >= 10 ? val : null }); }} className="w-28 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
                  <span className="text-xs text-text-muted">sec</span>
                </div>
                <p className="text-xs text-text-muted mt-1">Leave blank to use ¼ of normal interval</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">When DEGRADED (yellow) — interval (sec)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="15" max="3600" step="5" placeholder={`Default: ${Math.max(15, Math.floor((formData.intervalSec ?? 60) / 2))}s`} value={formData.adaptiveIntervalDegradedSec ?? ""} onChange={(e) => { const val = e.target.value === "" ? null : parseInt(e.target.value, 10); onSetFormData({ ...formData, adaptiveIntervalDegradedSec: val && val >= 15 ? val : null }); }} className="w-28 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
                  <span className="text-xs text-text-muted">sec</span>
                </div>
                <p className="text-xs text-text-muted mt-1">Leave blank to use ½ of normal interval</p>
              </div>
            </div>
          )}
        </div>

        {/* Geo Regions */}
        <GeoRegionsInput
          regions={formData.geoRegions ?? []}
          onChange={(regions) => onSetFormData({ ...formData, geoRegions: regions })}
        />
      </div>

      {/* Auto-Incident */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-semibold text-text-primary">Auto-Create Incidents</label>
            <p className="mt-0.5 text-xs text-text-secondary">Automatically create &amp; resolve incidents when this monitor changes status.</p>
          </div>
          <button type="button" role="switch" aria-checked={formData.autoIncident} onClick={() => onSetFormData({ ...formData, autoIncident: !formData.autoIncident })} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${formData.autoIncident ? "bg-accent" : "bg-surface-secondary"}`}>
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${formData.autoIncident ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
        {formData.autoIncident && (
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Incident Severity</label>
            <select value={formData.autoIncidentSeverity} onChange={(e) => onSetFormData({ ...formData, autoIncidentSeverity: e.target.value })} className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent">
              <option value="CRITICAL">🔴 Critical</option>
              <option value="HIGH">🟠 High</option>
              <option value="MEDIUM">🟡 Medium</option>
              <option value="LOW">🔵 Low</option>
            </select>
            <p className="mt-1 text-xs text-text-secondary">Severity assigned to auto-created incidents.</p>
          </div>
        )}
      </div>

      {/* Flap Detection */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-semibold text-text-primary">Flap Detection</label>
            <p className="mt-0.5 text-xs text-text-secondary">Suppresses noisy alerts when a monitor rapidly oscillates between up and down. A single &ldquo;flapping&rdquo; alert is sent instead.</p>
          </div>
          <button type="button" role="switch" aria-checked={formData.flapDetectionEnabled ?? true} onClick={() => onSetFormData({ ...formData, flapDetectionEnabled: !(formData.flapDetectionEnabled ?? true) })} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${(formData.flapDetectionEnabled ?? true) ? "bg-accent" : "bg-surface-secondary"}`}>
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${(formData.flapDetectionEnabled ?? true) ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
        {(formData.flapDetectionEnabled ?? true) && (
          <div className="space-y-3 pl-4 border-l-2 border-border">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Check Window</label>
              <input type="number" min={5} max={50} value={formData.flapWindow ?? 10} onChange={(e) => onSetFormData({ ...formData, flapWindow: parseInt(e.target.value) || 10 })} className="w-24 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
              <p className="text-xs text-text-muted mt-1">Number of recent checks to analyze for flapping (5–50)</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Flap Threshold</label>
              <select value={formData.flapThreshold ?? 0.5} onChange={(e) => onSetFormData({ ...formData, flapThreshold: parseFloat(e.target.value) })} className="w-56 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent">
                <option value={0.3}>30% changes (sensitive)</option>
                <option value={0.4}>40% changes</option>
                <option value={0.5}>50% changes (default)</option>
                <option value={0.6}>60% changes</option>
                <option value={0.7}>70% changes (conservative)</option>
              </select>
              <p className="text-xs text-text-muted mt-1">Fraction of state changes in the window required to detect flapping</p>
            </div>
          </div>
        )}
      </div>

      {/* Latency Alert Threshold (HTTP/TCP/DNS) */}
      {(formData.type === "HTTP" || formData.type === "TCP" || formData.type === "DNS") && (
        <>
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div>
              <label className="block text-sm font-semibold text-text-primary">Latency Alert Threshold</label>
              <p className="mt-0.5 text-xs text-text-secondary">Alert when a successful check takes longer than this threshold. Leave blank to disable.</p>
            </div>
            <div className="flex items-center gap-3">
              <input type="number" min="1" max="60000" step="100" placeholder="e.g. 2000" value={formData.latencyAlertMs ?? ""} onChange={(e) => { const val = e.target.value === "" ? null : parseInt(e.target.value, 10); onSetFormData({ ...formData, latencyAlertMs: val && val > 0 ? val : null }); }} className="w-36 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
              <span className="text-sm text-text-muted">ms</span>
              {formData.latencyAlertMs && formData.latencyAlertMs > 0 && (
                <span className="text-xs text-warning">⚠ Alert if response &gt; {formData.latencyAlertMs}ms</span>
              )}
            </div>
          </div>

          <div className="border border-border rounded-lg p-4 space-y-3">
            <div>
              <label className="block text-sm font-semibold text-text-primary">Latency Budget (P95 target, ms)</label>
              <p className="mt-0.5 text-xs text-text-secondary">Monthly P95 latency budget. Tracks the % of checks that exceed this target. Used for SLO budget consumption reporting.</p>
            </div>
            <div className="flex items-center gap-3">
              <input type="number" min="100" max="60000" step="100" placeholder="e.g. 500" value={formData.latencyBudgetMs ?? ""} onChange={(e) => { const val = e.target.value === "" ? null : parseInt(e.target.value, 10); onSetFormData({ ...formData, latencyBudgetMs: val && val >= 100 ? val : null }); }} className="w-36 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
              <span className="text-sm text-text-muted">ms</span>
              {formData.latencyBudgetMs && formData.latencyBudgetMs >= 100 && (
                <span className="text-xs text-accent">P95 budget: {formData.latencyBudgetMs}ms</span>
              )}
            </div>
          </div>
        </>
      )}

      {/* Request Timeout Override */}
      {(formData.type === "HTTP" || formData.type === "TCP" || formData.type === "SSL_CERT" || formData.type === "BROWSER") && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-sm font-semibold text-text-primary">Request Timeout</label>
            <p className="mt-0.5 text-xs text-text-secondary">Override the default {formData.type === "BROWSER" ? "15,000ms" : "5,000ms"} request timeout. Useful for slow endpoints or strict SLA requirements. Leave blank to use the default.</p>
          </div>
          <div className="flex items-center gap-3">
            <input type="number" min="500" max="60000" step="500" placeholder={formData.type === "BROWSER" ? "15000" : "5000"} value={formData.timeoutMs ?? ""} onChange={(e) => { const val = e.target.value === "" ? null : parseInt(e.target.value, 10); onSetFormData({ ...formData, timeoutMs: val && val >= 500 ? val : null }); }} className="w-36 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
            <span className="text-sm text-text-muted">ms</span>
            {formData.timeoutMs && formData.timeoutMs > 0 && (
              <span className="text-xs text-accent">✓ Times out after {formData.timeoutMs}ms</span>
            )}
          </div>
        </div>
      )}

      {/* Anomaly Detection (HTTP/TCP) */}
      {(formData.type === "HTTP" || formData.type === "TCP") && (
        <div>
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-text-secondary">Latency Anomaly Detection</label>
              <p className="text-xs text-text-muted mt-0.5">Alert when response time spikes above a multiple of the 7-day P95 baseline (auto-calibrating threshold).</p>
            </div>
            <button type="button" role="switch" aria-checked={formData.anomalyDetection ?? false} onClick={() => onSetFormData({ ...formData, anomalyDetection: !(formData.anomalyDetection ?? false) })} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${(formData.anomalyDetection ?? false) ? "bg-accent" : "bg-surface-secondary"}`}>
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${(formData.anomalyDetection ?? false) ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
          {(formData.anomalyDetection ?? false) && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-text-secondary mb-1">Spike Multiplier</label>
              <input type="number" min="1.1" max="10" step="0.1" value={formData.anomalyMultiplier ?? 2.0} onChange={(e) => onSetFormData({ ...formData, anomalyMultiplier: parseFloat(e.target.value) || 2.0 })} className="w-32 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
              <p className="text-xs text-text-muted mt-1">Alert when latency &gt; {(formData.anomalyMultiplier ?? 2.0)}× P95 baseline. Default: 2.0. Requires 10+ successful checks in the past 7 days.</p>
            </div>
          )}
        </div>
      )}

      {/* Custom Metric Capture (HTTP/BROWSER) */}
      {(formData.type === "HTTP" || formData.type === "BROWSER") && (
        <div className="border border-border rounded-lg p-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-text-primary">Custom Metric Capture</label>
            <p className="mt-0.5 text-xs text-text-secondary">Extract a numeric value from the JSON response body on every check. Track business metrics (queue depth, error count, active users) without a separate metrics system.</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">JSON Path <span className="text-white/40">(e.g. $.queue.depth, $.metrics.errors)</span></label>
              <input type="text" placeholder="$.queue.depth" value={formData.metricPath ?? ""} onChange={(e) => onSetFormData({ ...formData, metricPath: e.target.value || null })} className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-white/30" />
            </div>
            {formData.metricPath && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Metric Name</label>
                    <input type="text" placeholder="Queue Depth" value={formData.metricName ?? ""} onChange={(e) => onSetFormData({ ...formData, metricName: e.target.value || null })} className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-white/30" />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Unit <span className="text-white/40">(optional)</span></label>
                    <input type="text" placeholder="items" value={formData.metricUnit ?? ""} onChange={(e) => onSetFormData({ ...formData, metricUnit: e.target.value || null })} className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-white/30" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Alert thresholds <span className="text-white/40">(optional — turns check yellow when outside range)</span></label>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">Min</span>
                      <input type="number" placeholder="—" value={formData.metricAlertMin ?? ""} onChange={(e) => { const val = e.target.value === "" ? null : parseFloat(e.target.value); onSetFormData({ ...formData, metricAlertMin: val !== null && !isNaN(val) ? val : null }); }} className="w-24 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">Max</span>
                      <input type="number" placeholder="—" value={formData.metricAlertMax ?? ""} onChange={(e) => { const val = e.target.value === "" ? null : parseFloat(e.target.value); onSetFormData({ ...formData, metricAlertMax: val !== null && !isNaN(val) ? val : null }); }} className="w-24 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Cron Expression */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-text-secondary">Cron Expression Schedule</label>
            <p className="text-xs text-text-muted mt-0.5">Use a cron expression for advanced scheduling (overrides the interval above). Evaluated in UTC.</p>
          </div>
          <button type="button" role="switch" aria-checked={!!(formData.cronExpression ?? "")} onClick={() => onSetFormData({ ...formData, cronExpression: formData.cronExpression ? "" : "*/5 * * * *" })} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${!!(formData.cronExpression ?? "") ? "bg-accent" : "bg-surface-secondary"}`}>
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${!!(formData.cronExpression ?? "") ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
        {!!(formData.cronExpression ?? "") && (
          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Presets</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "Every 1 min", expr: "* * * * *" },
                  { label: "Every 5 min", expr: "*/5 * * * *" },
                  { label: "Every 15 min", expr: "*/15 * * * *" },
                  { label: "Every 30 min", expr: "*/30 * * * *" },
                  { label: "Every hour", expr: "0 * * * *" },
                  { label: "Daily 9am UTC", expr: "0 9 * * *" },
                  { label: "Weekdays 9am UTC", expr: "0 9 * * 1-5" },
                ].map(({ label, expr }) => (
                  <button key={expr} type="button" onClick={() => onSetFormData({ ...formData, cronExpression: expr })} className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${formData.cronExpression === expr ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface text-text-secondary hover:border-accent/50"}`}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Expression (5-field, UTC)</label>
              <input type="text" value={formData.cronExpression ?? ""} onChange={(e) => onSetFormData({ ...formData, cronExpression: e.target.value })} placeholder="*/5 * * * *" className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
              <p className="text-xs text-text-muted mt-1.5">Format: <code className="font-mono bg-surface-secondary px-1 rounded">minute hour day month weekday</code>. When set, this overrides the check interval above.</p>
            </div>
          </div>
        )}
      </div>

      {/* Business Hours Schedule */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-text-secondary">Business Hours Schedule</label>
            <p className="text-xs text-text-muted mt-0.5">Only run checks during configured days and hours (UTC). Useful for reducing noise on non-critical monitors.</p>
          </div>
          <button type="button" role="switch" aria-checked={formData.scheduleEnabled ?? false} onClick={() => onSetFormData({ ...formData, scheduleEnabled: !(formData.scheduleEnabled ?? false) })} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${(formData.scheduleEnabled ?? false) ? "bg-accent" : "bg-surface-secondary"}`}>
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${(formData.scheduleEnabled ?? false) ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
        {(formData.scheduleEnabled ?? false) && (
          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Days of week (UTC)</label>
              <div className="flex gap-1.5 flex-wrap">
                {[{d: 1, l: "Mon"},{d: 2, l: "Tue"},{d: 3, l: "Wed"},{d: 4, l: "Thu"},{d: 5, l: "Fri"},{d: 6, l: "Sat"},{d: 0, l: "Sun"}].map(({d, l}) => {
                  const days = (formData.scheduleDays ?? "1,2,3,4,5").split(",").map(Number);
                  const active = days.includes(d);
                  return (
                    <button key={d} type="button" onClick={() => { const next = active ? days.filter(x => x !== d) : [...days, d].sort(); onSetFormData({ ...formData, scheduleDays: next.join(",") }); }} className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${active ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface text-text-secondary hover:border-accent/50"}`}>{l}</button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Start hour (UTC)</label>
                <select value={formData.scheduleStartHour ?? 8} onChange={(e) => onSetFormData({ ...formData, scheduleStartHour: Number(e.target.value) })} className="px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent">
                  {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}
                </select>
              </div>
              <span className="text-text-secondary text-sm mt-4">to</span>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">End hour (UTC)</label>
                <select value={formData.scheduleEndHour ?? 18} onChange={(e) => onSetFormData({ ...formData, scheduleEndHour: Number(e.target.value) })} className="px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent">
                  {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-text-muted">Checks will only run on selected days between {String(formData.scheduleStartHour ?? 8).padStart(2, "0")}:00 and {String(formData.scheduleEndHour ?? 18).padStart(2, "0")}:00 UTC.</p>
          </div>
        )}
      </div>
    </>
  );
}
