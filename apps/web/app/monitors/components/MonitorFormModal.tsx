import React from "react";
import { X } from "lucide-react";
import { API_BASE } from "../../../lib/api";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { MonitorTemplates } from "../../components/MonitorTemplates";
import type { MonitorTemplate } from "../../components/MonitorTemplates";
import { targetPlaceholder, targetHelperText } from "../../components/timeUtils";
import { HelpTooltip } from "../../../components/help-tooltip";
import { brand } from "../../../lib/brand";
import { inputClass } from "../constants";
import type { MonitorPlugin, TagItem, MonitorFormData } from "../types";

interface MonitorFormModalProps {
  isOpen: boolean;
  mode: "create" | "edit";
  showTemplates: boolean;
  formData: MonitorFormData;
  formErrors: Record<string, string>;
  formTouched: Record<string, boolean>;
  tagInput: string;
  selectedTags: string[];
  allTags: TagItem[];
  folders: { id: string; name: string }[];
  availablePlugins: MonitorPlugin[];
  selectedPlugin: MonitorPlugin | null;
  onClose: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  onSetShowTemplates: (v: boolean) => void;
  onSetFormData: (data: MonitorFormData) => void;
  onSetFormErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSetFormTouched: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onSetTagInput: (v: string) => void;
  onSetSelectedTags: React.Dispatch<React.SetStateAction<string[]>>;
  onApplyTemplate: (t: MonitorTemplate) => void;
  onCopySuccess: (msg: string) => void;
}

export function MonitorFormModal({
  isOpen,
  mode,
  showTemplates,
  formData,
  formErrors,
  formTouched,
  tagInput,
  selectedTags,
  allTags,
  folders,
  availablePlugins,
  selectedPlugin,
  onClose,
  onCancel,
  onSubmit,
  onSetShowTemplates,
  onSetFormData,
  onSetFormErrors,
  onSetFormTouched,
  onSetTagInput,
  onSetSelectedTags,
  onApplyTemplate,
  onCopySuccess,
}: MonitorFormModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "create" ? "New Monitor" : "Edit Monitor"}
      size="xl"
      actions={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>
            {mode === "create" ? "Create" : "Update"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {mode === "create" && showTemplates && (
          <div className="rounded-xl border border-border/60 p-3 bg-surface-elevated/30">
            <MonitorTemplates onSelect={onApplyTemplate} />
            <div className="mt-3 pt-3 border-t border-border/40">
              <button
                type="button"
                onClick={() => onSetShowTemplates(false)}
                className="text-xs text-text-secondary hover:text-accent transition-colors"
              >
                Start from scratch →
              </button>
            </div>
          </div>
        )}

        {mode === "create" && !showTemplates && (
          <button
            type="button"
            onClick={() => onSetShowTemplates(true)}
            className="text-xs text-text-secondary hover:text-accent transition-colors flex items-center gap-1"
          >
            ← Use a template
          </button>
        )}

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Monitor Name <span className="text-danger" aria-hidden="true">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => {
              onSetFormData({ ...formData, name: e.target.value });
              if (formTouched.name) onSetFormErrors((prev) => ({ ...prev, name: e.target.value.trim().length < 2 ? "Name must be at least 2 characters" : "" }));
            }}
            onBlur={() => onSetFormTouched((t) => ({ ...t, name: true }))}
            className={`${inputClass} ${formTouched.name && formErrors.name ? "border-danger focus:ring-danger" : ""}`}
            placeholder="My API"
            aria-required="true"
            aria-invalid={formTouched.name && !!formErrors.name}
            aria-describedby={formErrors.name ? "name-error" : undefined}
          />
          {formTouched.name && formErrors.name && (
            <p id="name-error" role="alert" className="mt-1 text-xs text-danger">{formErrors.name}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Type</label>
            <select
              value={formData.type}
              onChange={(e) => {
                const nextType = e.target.value as typeof formData.type;
                onSetFormData({
                  ...formData,
                  type: nextType,
                  pluginId: "",
                  expectedText: "",
                  heartbeatTimeoutMin: nextType === "HEARTBEAT" ? formData.heartbeatTimeoutMin || 5 : formData.heartbeatTimeoutMin,
                  heartbeatToken: nextType === "HEARTBEAT" ? (formData.heartbeatToken || crypto.randomUUID()) : formData.heartbeatToken,
                });
              }}
              className={inputClass}
            >
              <option value="HTTP">HTTP Check</option>
              <option value="TCP">TCP Port</option>
              <option value="SSL_CERT">SSL Certificate</option>
              <option value="HEARTBEAT">Heartbeat</option>
              <option value="DNS">DNS Lookup</option>
              <option value="PING">ICMP Ping</option>
              <option value="SMTP">SMTP Email Server</option>
              <option value="BROWSER">Browser / Page Check</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Check Plugin</label>
            <select
              value={formData.pluginId}
              onChange={(e) => onSetFormData({ ...formData, pluginId: e.target.value, expectedText: "" })}
              className={inputClass}
            >
              <option value="">Built-in check logic</option>
              {availablePlugins.map((plugin) => (
                <option key={plugin.id} value={plugin.id}>
                  {plugin.displayName}
                </option>
              ))}
            </select>
            {selectedPlugin?.description && (
              <p className="mt-1 text-xs text-text-secondary">{selectedPlugin.description}</p>
            )}
          </div>
        </div>

        {formData.pluginId === "http.response-match" && (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Expected response text <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <input
              type="text"
              value={formData.expectedText}
              onChange={(e) => {
                onSetFormData({ ...formData, expectedText: e.target.value });
                if (formTouched.expectedText) onSetFormErrors((prev) => ({ ...prev, expectedText: !e.target.value.trim() ? "Expected text is required" : "" }));
              }}
              onBlur={() => onSetFormTouched((t) => ({ ...t, expectedText: true }))}
              className={`${inputClass} ${formTouched.expectedText && formErrors.expectedText ? "border-danger focus:ring-danger" : ""}`}
              placeholder={selectedPlugin?.configFields?.[0]?.placeholder ?? "OK"}
              aria-invalid={formTouched.expectedText && !!formErrors.expectedText}
            />
            {formTouched.expectedText && formErrors.expectedText ? (
              <p role="alert" className="mt-1 text-xs text-danger">{formErrors.expectedText}</p>
            ) : (
              <p className="mt-1 text-xs text-text-secondary">
                {selectedPlugin?.configFields?.[0]?.helpText ?? "Case-sensitive substring that must be present in the response body."}
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Target <span className="text-danger" aria-hidden="true">*</span>
          </label>
          <input
            type="text"
            value={formData.target}
            onChange={(e) => {
              onSetFormData({ ...formData, target: e.target.value });
              if (formTouched.target) {
                let err = "";
                const nextTarget = e.target.value.trim();
                if (!nextTarget) err = "Target is required";
                else if (formData.type === "HTTP") { try { new URL(nextTarget); } catch { err = "Must be a valid URL"; } }
                else if (formData.type === "TCP" && !/^[^:\s]+:\d+$/.test(nextTarget)) err = "Must be host:port";
                else if (formData.type === "SMTP" && !/^[^:\s]+:\d+$/.test(nextTarget)) err = "Must be host:port (e.g. mail.example.com:25)";
                onSetFormErrors((prev) => ({ ...prev, target: err }));
              }
            }}
            onBlur={() => onSetFormTouched((t) => ({ ...t, target: true }))}
            className={`${inputClass} ${formTouched.target && formErrors.target ? "border-danger focus:ring-danger" : ""}`}
            placeholder={targetPlaceholder(formData.type)}
            aria-required="true"
            aria-invalid={formTouched.target && !!formErrors.target}
            aria-describedby={formErrors.target ? "target-error" : "target-hint"}
          />
          {formTouched.target && formErrors.target ? (
            <p id="target-error" role="alert" className="mt-1 text-xs text-danger">{formErrors.target}</p>
          ) : (
            <p id="target-hint" className="mt-1 text-xs text-text-secondary">{targetHelperText(formData.type)}</p>
          )}
        </div>

        {formData.type === "HEARTBEAT" && (
          <>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Alert if no ping for (minutes) <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="1440"
                value={formData.heartbeatTimeoutMin}
                onChange={(e) => {
                  const value = Math.max(1, Number(e.target.value || 1));
                  onSetFormData({ ...formData, heartbeatTimeoutMin: value });
                }}
                className={inputClass}
              />
              {formErrors.heartbeatTimeoutMin && (
                <p role="alert" className="mt-1 text-xs text-danger">{formErrors.heartbeatTimeoutMin}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Ping URL</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${API_BASE}/v1/heartbeat/${formData.heartbeatToken || "<token>"}`}
                  className={`${inputClass} font-mono text-xs`}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    const url = `${API_BASE}/v1/heartbeat/${formData.heartbeatToken || "<token>"}`;
                    await navigator.clipboard.writeText(url);
                    onCopySuccess("Heartbeat URL copied");
                  }}
                >
                  Copy
                </Button>
              </div>
              <p className="mt-1 text-xs text-text-secondary">Call this URL with POST from your cron job or app to mark it healthy.</p>
            </div>
          </>
        )}

        {/* SMTP-specific config */}
        {formData.type === "SMTP" && (
          <>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">EHLO Hostname</label>
              <input
                type="text"
                value={(formData as unknown as { ehlo?: string }).ehlo ?? "pulsedock.monitor"}
                onChange={(e) => onSetFormData({ ...formData, ehlo: e.target.value } as typeof formData & { ehlo?: string })}
                placeholder="pulsedock.monitor"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-text-secondary">The hostname sent in the EHLO command (default: pulsedock.monitor).</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="smtpCheckTls"
                checked={(formData as unknown as { checkTls?: boolean }).checkTls ?? false}
                onChange={(e) => onSetFormData({ ...formData, checkTls: e.target.checked } as typeof formData & { checkTls?: boolean })}
                className="w-4 h-4 rounded border border-border bg-surface accent-accent"
              />
              <label htmlFor="smtpCheckTls" className="text-sm text-text-primary cursor-pointer">
                Test STARTTLS upgrade (port 587 / STARTTLS required)
              </label>
            </div>
            <p className="text-xs text-text-secondary -mt-1">When enabled, {brand.name} sends STARTTLS after EHLO. Warns if STARTTLS is advertised but connection fails.</p>
          </>
        )}

        {/* DNS-specific config */}
        {formData.type === "DNS" && (
          <>
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
              <p className="text-xs text-text-secondary leading-relaxed">
                <span className="font-medium text-text-primary">DNS Lookup</span> — resolves the target hostname via DNS and measures lookup latency. Optionally assert a specific value in the result.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Record Type</label>
              <select
                value={(formData as unknown as { dnsRecordType?: string }).dnsRecordType ?? "A"}
                onChange={(e) => onSetFormData({ ...formData, dnsRecordType: e.target.value } as typeof formData & { dnsRecordType?: string })}
                className={inputClass}
              >
                {["A", "AAAA", "MX", "TXT", "CNAME", "NS"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-text-secondary">DNS record type to look up. Default: A (IPv4).</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Expected value <span className="text-xs text-text-muted">(optional)</span>
              </label>
              <input
                type="text"
                value={(formData as unknown as { dnsExpectedValue?: string }).dnsExpectedValue ?? ""}
                onChange={(e) => onSetFormData({ ...formData, dnsExpectedValue: e.target.value } as typeof formData & { dnsExpectedValue?: string })}
                placeholder="e.g. 1.2.3.4 or mail.example.com."
                className={inputClass}
              />
              <p className="mt-1 text-xs text-text-secondary">Check warns if the DNS result does not contain this value. Leave blank to only verify the lookup succeeds.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Timeout <span className="text-xs text-text-muted">(ms, optional)</span>
              </label>
              <input
                type="number"
                min="500"
                max="30000"
                value={(formData as unknown as { dnsTimeoutMs?: number }).dnsTimeoutMs ?? 10000}
                onChange={(e) => onSetFormData({ ...formData, dnsTimeoutMs: Number(e.target.value) } as typeof formData & { dnsTimeoutMs?: number })}
                className={inputClass}
              />
            </div>
          </>
        )}

        {/* PING-specific config */}
        {formData.type === "PING" && (
          <>
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
              <p className="text-xs text-text-secondary leading-relaxed">
                <span className="font-medium text-text-primary">ICMP Ping</span> — sends ping packets to the target host and measures round-trip latency and packet loss.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Ping Count</label>
              <input
                type="number"
                min="1"
                max="10"
                value={(formData as unknown as { pingCount?: number }).pingCount ?? 3}
                onChange={(e) => onSetFormData({ ...formData, pingCount: Math.min(10, Math.max(1, Number(e.target.value))) } as typeof formData & { pingCount?: number })}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-text-secondary">Number of ICMP packets to send (1–10). Default: 3.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Max packet loss % before warning <span className="text-xs text-text-muted">(optional)</span>
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={(formData as unknown as { pingMaxLossPct?: number }).pingMaxLossPct ?? ""}
                onChange={(e) => onSetFormData({ ...formData, pingMaxLossPct: e.target.value === "" ? undefined : Number(e.target.value) } as typeof formData & { pingMaxLossPct?: number })}
                placeholder="e.g. 20 (any loss = warn by default)"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-text-secondary">Any packet loss triggers a warning by default. Set a threshold (0–100%) to allow some loss before alerting.</p>
            </div>
          </>
        )}

        {/* Browser check */}
        {formData.type === "BROWSER" && (
          <>
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
              <p className="text-xs text-text-secondary leading-relaxed">
                <span className="font-medium text-text-primary">Browser / Page Check</span> — fetches your URL with a browser-like User-Agent and verifies the page loads successfully (2xx/3xx). Optionally assert that a specific text or HTML element is present.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Expected text <span className="text-xs text-text-muted">(optional)</span>
              </label>
              <input
                type="text"
                value={(formData as unknown as { browserExpectedText?: string }).browserExpectedText ?? ""}
                onChange={(e) => onSetFormData({ ...formData, browserExpectedText: e.target.value } as typeof formData & { browserExpectedText?: string })}
                placeholder='e.g. "Welcome" or "Dashboard"'
                className={inputClass}
              />
              <p className="mt-1 text-xs text-text-secondary">Check fails if this text is not found in the page HTML (case-insensitive).</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                CSS selector <span className="text-xs text-text-muted">(optional)</span>
              </label>
              <input
                type="text"
                value={(formData as unknown as { browserSelector?: string }).browserSelector ?? ""}
                onChange={(e) => onSetFormData({ ...formData, browserSelector: e.target.value } as typeof formData & { browserSelector?: string })}
                placeholder='e.g. #app, .nav-bar, [data-testid="login"], main'
                className={`${inputClass} font-mono text-xs`}
              />
              <p className="mt-1 text-xs text-text-secondary">Check fails if this selector does not match any element. Supports: <code className="bg-surface-2 px-1 rounded">#id</code>, <code className="bg-surface-2 px-1 rounded">.class</code>, <code className="bg-surface-2 px-1 rounded">tag</code>, <code className="bg-surface-2 px-1 rounded">[attr]</code>, <code className="bg-surface-2 px-1 rounded">tag.class</code>, <code className="bg-surface-2 px-1 rounded">tag#id</code></p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Allowed status codes <span className="text-xs text-text-muted">(optional, default: 2xx–3xx)</span>
              </label>
              <input
                type="text"
                value={(formData as unknown as { browserStatusCodesRaw?: string }).browserStatusCodesRaw ?? ""}
                onChange={(e) => onSetFormData({ ...formData, browserStatusCodesRaw: e.target.value } as typeof formData & { browserStatusCodesRaw?: string })}
                placeholder="200, 301, 302"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-text-secondary">Comma-separated list. Leave blank to accept any 2xx or 3xx response.</p>
            </div>
          </>
        )}

        {/* HTTP-specific config */}
        {formData.type === "HTTP" && (
          <>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                HTTP Method
              </label>
              <select
                value={(formData as unknown as { httpMethod?: string }).httpMethod ?? "GET"}
                onChange={(e) => onSetFormData({ ...formData, httpMethod: e.target.value } as typeof formData & { httpMethod?: string })}
                className={inputClass}
              >
                {["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Request Headers <span className="text-xs text-text-muted">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={(formData as unknown as { requestHeaders?: string }).requestHeaders ?? ""}
                onChange={(e) => onSetFormData({ ...formData, requestHeaders: e.target.value } as typeof formData & { requestHeaders?: string })}
                className={`${inputClass} font-mono text-xs resize-y`}
                placeholder={"Authorization: Bearer <token>\nX-API-Key: your-key"}
                spellCheck={false}
              />
              <p className="mt-1 text-xs text-text-secondary">One header per line: <code className="bg-surface-2 px-1 rounded">Name: Value</code>. Added to every request.</p>
            </div>
            {["POST", "PUT", "PATCH"].includes((formData as unknown as { httpMethod?: string }).httpMethod ?? "GET") && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Request Body <span className="text-xs text-text-muted">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={(formData as unknown as { requestBody?: string }).requestBody ?? ""}
                  onChange={(e) => onSetFormData({ ...formData, requestBody: e.target.value } as typeof formData & { requestBody?: string })}
                  className={`${inputClass} font-mono text-xs resize-y`}
                  placeholder={'{"key": "value"}'}
                  spellCheck={false}
                />
                <p className="mt-1 text-xs text-text-secondary">Raw request body sent with POST/PUT/PATCH requests. Add <code className="bg-surface-2 px-1 rounded">Content-Type</code> header above if needed.</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Expected status code <span className="text-xs text-text-muted">(optional)</span>
              </label>
              <input
                type="number"
                min="100"
                max="599"
                value={(formData as unknown as { expectedStatus?: number }).expectedStatus ?? ""}
                onChange={(e) => {
                  const val = e.target.value === "" ? undefined : parseInt(e.target.value);
                  onSetFormData({ ...formData, expectedStatus: val } as typeof formData & { expectedStatus?: number });
                }}
                className={inputClass}
                placeholder="Default: any 2xx"
              />
              <p className="mt-1 text-xs text-text-secondary">Leave blank to accept any 2xx response. Set to 200, 201, etc. to require an exact status.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Body must contain <span className="text-xs text-text-muted">(optional)</span>
              </label>
              <input
                type="text"
                value={(formData as unknown as { bodyContains?: string }).bodyContains ?? ""}
                onChange={(e) => {
                  onSetFormData({ ...formData, bodyContains: e.target.value } as typeof formData & { bodyContains?: string });
                }}
                className={inputClass}
                placeholder='e.g. "ok" or "status\":\"healthy"'
                maxLength={500}
              />
              <p className="mt-1 text-xs text-text-secondary">If set, the response body must contain this string (case-insensitive). Leave blank to skip body check.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                JSON path assertion <span className="text-xs text-text-muted">(optional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={(formData as unknown as { bodyJsonPath?: string }).bodyJsonPath ?? ""}
                  onChange={(e) => {
                    onSetFormData({ ...formData, bodyJsonPath: e.target.value } as typeof formData & { bodyJsonPath?: string });
                  }}
                  className={inputClass + " flex-1"}
                  placeholder="e.g. status or data.health"
                  maxLength={200}
                  aria-label="JSON path"
                />
                <input
                  type="text"
                  value={(formData as unknown as { bodyJsonPathExpected?: string }).bodyJsonPathExpected ?? ""}
                  onChange={(e) => {
                    onSetFormData({ ...formData, bodyJsonPathExpected: e.target.value } as typeof formData & { bodyJsonPathExpected?: string });
                  }}
                  className={inputClass + " w-36"}
                  placeholder='Expected value'
                  maxLength={200}
                  aria-label="Expected value"
                />
              </div>
              <p className="mt-1 text-xs text-text-secondary">Assert a JSON field in the response (dot-notation, e.g. <code className="bg-surface px-1 rounded">data.status</code>). Optional expected value — leave blank for a truthy check. Requires JSON response.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Response time threshold (ms) <span className="text-xs text-text-muted">(optional)</span>
              </label>
              <input
                type="number"
                min="50"
                max="60000"
                value={(formData as unknown as { responseTimeThresholdMs?: number }).responseTimeThresholdMs ?? ""}
                onChange={(e) => {
                  const val = e.target.value === "" ? undefined : parseInt(e.target.value);
                  onSetFormData({ ...formData, responseTimeThresholdMs: val } as typeof formData & { responseTimeThresholdMs?: number });
                }}
                className={inputClass}
                placeholder="e.g. 2000"
              />
              <p className="mt-1 text-xs text-text-secondary">Mark as <span className="text-warning font-medium">degraded</span> if response takes longer than this many milliseconds. Leave blank to disable.</p>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Check Interval (seconds) <span className="text-danger" aria-hidden="true">*</span>
              <HelpTooltip content={`How often ${brand.name} checks your monitor. Minimum 30s, maximum 3600s (1 hour). Lower intervals catch outages faster but use more resources.`} className="ml-1 align-middle" />
            </label>
            <input
              type="number"
              min="30"
              max="3600"
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
              type="number"
              min="1"
              max="10"
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
            <select
              value={formData.retryCount ?? 0}
              onChange={(e) => onSetFormData({ ...formData, retryCount: parseInt(e.target.value) })}
              className={inputClass}
            >
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
          <input
            type="text"
            value={formData.description}
            onChange={(e) => onSetFormData({ ...formData, description: e.target.value })}
            className={inputClass}
            placeholder="Optional notes about this monitor"
          />
        </div>

        {/* Runbook URL */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Runbook URL</label>
          <input
            type="url"
            value={formData.runbookUrl}
            onChange={(e) => onSetFormData({ ...formData, runbookUrl: e.target.value })}
            className={inputClass}
            placeholder="https://wiki.example.com/runbooks/service-outage"
          />
          <p className="mt-1 text-xs text-text-secondary">Optional. Link to your incident runbook — included in alert notifications.</p>
        </div>

        {/* SLA Target */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            SLA Target (%)
          </label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            placeholder="e.g. 99.9"
            value={formData.slaTarget}
            onChange={(e) => onSetFormData({ ...formData, slaTarget: e.target.value === "" ? "" : parseFloat(e.target.value) })}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-text-secondary">Optional. Alert when rolling uptime drops below this percentage.</p>
        </div>

        {/* SLA Period */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            SLA Period
          </label>
          <select
            value={formData.slaPeriodDays}
            onChange={(e) => onSetFormData({ ...formData, slaPeriodDays: parseInt(e.target.value) })}
            className={inputClass}
          >
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
          <input
            type="number"
            min="1"
            max="60000"
            placeholder="e.g. 500 — p95 latency must be below this"
            value={formData.sliLatencyTarget ?? ""}
            onChange={(e) => onSetFormData({ ...formData, sliLatencyTarget: e.target.value === "" ? "" : parseInt(e.target.value) })}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-text-secondary">Alert when p95 response time exceeds this threshold.</p>
        </div>

        {/* Latency SLI Window */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Latency SLI Window
          </label>
          <select
            value={formData.sliLatencyWindow ?? 7}
            onChange={(e) => onSetFormData({ ...formData, sliLatencyWindow: parseInt(e.target.value) })}
            className={inputClass}
          >
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
          <p className="mt-1 text-xs text-text-secondary">Rolling window for Latency SLI measurement.</p>
        </div>

        {/* Auto-Incident */}
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-semibold text-text-primary">Auto-Create Incidents</label>
              <p className="mt-0.5 text-xs text-text-secondary">
                Automatically create &amp; resolve incidents when this monitor changes status.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={formData.autoIncident}
              onClick={() => onSetFormData({ ...formData, autoIncident: !formData.autoIncident })}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                formData.autoIncident ? "bg-accent" : "bg-surface-secondary"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                  formData.autoIncident ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          {formData.autoIncident && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Incident Severity</label>
              <select
                value={formData.autoIncidentSeverity}
                onChange={(e) => onSetFormData({ ...formData, autoIncidentSeverity: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
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
        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-semibold text-text-primary">Flap Detection</label>
              <p className="mt-0.5 text-xs text-text-secondary">
                Suppresses noisy alerts when a monitor rapidly oscillates between up and down. A single &ldquo;flapping&rdquo; alert is sent instead.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={formData.flapDetectionEnabled ?? true}
              onClick={() => onSetFormData({ ...formData, flapDetectionEnabled: !(formData.flapDetectionEnabled ?? true) })}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                (formData.flapDetectionEnabled ?? true) ? "bg-accent" : "bg-surface-secondary"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                  (formData.flapDetectionEnabled ?? true) ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Anomaly Detection */}
        {(formData.type === "HTTP" || formData.type === "TCP") && (
          <div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-text-secondary">Latency Anomaly Detection</label>
                <p className="text-xs text-text-muted mt-0.5">Alert when response time spikes above a multiple of the 7-day P95 baseline (auto-calibrating threshold).</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={formData.anomalyDetection ?? false}
                onClick={() => onSetFormData({ ...formData, anomalyDetection: !(formData.anomalyDetection ?? false) })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  (formData.anomalyDetection ?? false) ? "bg-accent" : "bg-surface-secondary"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                    (formData.anomalyDetection ?? false) ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            {(formData.anomalyDetection ?? false) && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-text-secondary mb-1">Spike Multiplier</label>
                <input
                  type="number"
                  min="1.1"
                  max="10"
                  step="0.1"
                  value={formData.anomalyMultiplier ?? 2.0}
                  onChange={(e) => onSetFormData({ ...formData, anomalyMultiplier: parseFloat(e.target.value) || 2.0 })}
                  className="w-32 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <p className="text-xs text-text-muted mt-1">
                  Alert when latency &gt; {(formData.anomalyMultiplier ?? 2.0)}× P95 baseline. Default: 2.0.
                  Requires 10+ successful checks in the past 7 days.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Business Hours Schedule */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-text-secondary">Business Hours Schedule</label>
              <p className="text-xs text-text-muted mt-0.5">Only run checks during configured days and hours (UTC). Useful for reducing noise on non-critical monitors.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={formData.scheduleEnabled ?? false}
              onClick={() => onSetFormData({ ...formData, scheduleEnabled: !(formData.scheduleEnabled ?? false) })}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                (formData.scheduleEnabled ?? false) ? "bg-accent" : "bg-surface-secondary"
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${(formData.scheduleEnabled ?? false) ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
          {(formData.scheduleEnabled ?? false) && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Days of week (UTC)</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[{d: 1, l: 'Mon'},{d: 2, l: 'Tue'},{d: 3, l: 'Wed'},{d: 4, l: 'Thu'},{d: 5, l: 'Fri'},{d: 6, l: 'Sat'},{d: 0, l: 'Sun'}].map(({d, l}) => {
                    const days = (formData.scheduleDays ?? '1,2,3,4,5').split(',').map(Number);
                    const active = days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          const next = active ? days.filter(x => x !== d) : [...days, d].sort();
                          onSetFormData({ ...formData, scheduleDays: next.join(',') });
                        }}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${active ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface text-text-secondary hover:border-accent/50'}`}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Start hour (UTC)</label>
                  <select value={formData.scheduleStartHour ?? 8} onChange={(e) => onSetFormData({ ...formData, scheduleStartHour: Number(e.target.value) })} className="px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent">
                    {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>)}
                  </select>
                </div>
                <span className="text-text-secondary text-sm mt-4">to</span>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">End hour (UTC)</label>
                  <select value={formData.scheduleEndHour ?? 18} onChange={(e) => onSetFormData({ ...formData, scheduleEndHour: Number(e.target.value) })} className="px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent">
                    {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-text-muted">Checks will only run on selected days between {String(formData.scheduleStartHour ?? 8).padStart(2,'0')}:00 and {String(formData.scheduleEndHour ?? 18).padStart(2,'0')}:00 UTC.</p>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Tags</label>
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {selectedTags.map((tag) => {
                const tagObj = allTags.find((t) => t.name === tag);
                return (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: (tagObj?.color ?? "#6366f1") + "22", color: tagObj?.color ?? "#6366f1" }}
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => onSetSelectedTags((prev) => prev.filter((t) => t !== tag))}
                      aria-label={`Remove tag ${tag}`}
                      className="hover:opacity-70"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => onSetTagInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                e.preventDefault();
                const newTag = tagInput.trim().replace(/,+$/, "").trim();
                if (newTag && !selectedTags.includes(newTag)) {
                  onSetSelectedTags((prev) => [...prev, newTag]);
                }
                onSetTagInput("");
              }
            }}
            className={inputClass}
            placeholder="Type a tag name, press Enter or comma"
          />
          {allTags.filter((t) => !selectedTags.includes(t.name)).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {allTags
                .filter((t) => !selectedTags.includes(t.name))
                .map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => onSetSelectedTags((prev) => [...prev, tag.name])}
                    className="px-2 py-0.5 rounded-full text-xs border transition-colors hover:opacity-80"
                    style={{ borderColor: tag.color + "80", color: tag.color }}
                  >
                    + {tag.name}
                  </button>
                ))}
            </div>
          )}
        </div>

        {folders.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Project</label>
            <select
              value={formData.folderId}
              onChange={(e) => onSetFormData({ ...formData, folderId: e.target.value })}
              className={inputClass}
            >
              <option value="">(No project)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        )}

        <label className="flex items-center gap-3 py-1">
          <input
            type="checkbox"
            checked={formData.enabled}
            onChange={(e) => onSetFormData({ ...formData, enabled: e.target.checked })}
            className="w-5 h-5 rounded border-border bg-surface text-accent focus:ring-accent"
          />
          <span className="text-sm text-text-primary">Enabled</span>
        </label>
      </div>
    </Modal>
  );
}
