import React, { useRef, useState, useCallback } from "react";
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

// ── Transaction Step Types ────────────────────────────────────────────────────

interface TransactionStepAssertion {
  type: "status" | "body_contains" | "json_path" | "header_exists" | "latency_lt";
  value: string;
  expected?: string;
}

interface TransactionStep {
  id: string;
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  body?: string;
  extract?: Record<string, string>;
  assertions?: TransactionStepAssertion[];
  timeoutMs?: number;
}

// ── Transaction Step Builder ──────────────────────────────────────────────────

function newStep(index: number): TransactionStep {
  return { id: crypto.randomUUID(), name: `Step ${index + 1}`, method: "GET", url: "", headers: {}, assertions: [] };
}

interface TransactionStepBuilderProps {
  steps: TransactionStep[];
  onChange: (steps: TransactionStep[]) => void;
  inputClass: string;
}

function TransactionStepBuilder({ steps, onChange, inputClass }: TransactionStepBuilderProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(steps.length === 0 ? null : 0);

  const addStep = useCallback(() => {
    const updated = [...steps, newStep(steps.length)];
    onChange(updated);
    setOpenIdx(updated.length - 1);
  }, [steps, onChange]);

  const removeStep = useCallback((idx: number) => {
    const updated = steps.filter((_, i) => i !== idx);
    onChange(updated);
    setOpenIdx((prev) => (prev === idx ? null : prev !== null && prev > idx ? prev - 1 : prev));
  }, [steps, onChange]);

  const updateStep = useCallback((idx: number, patch: Partial<TransactionStep>) => {
    onChange(steps.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }, [steps, onChange]);

  const moveStep = useCallback((idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= steps.length) return;
    const updated = [...steps];
    [updated[idx], updated[next]] = [updated[next], updated[idx]];
    onChange(updated);
    setOpenIdx(next);
  }, [steps, onChange]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
        <p className="text-xs text-text-secondary leading-relaxed">
          <span className="font-medium text-text-primary">Multi-Step Transaction</span> — chain up to 10 HTTP requests.
          Extract values (e.g. auth tokens) from one step and inject them into the next via <code className="bg-surface-2 px-1 rounded">{"{{varName}}"}</code>.
          All steps must pass for the monitor to be green.
        </p>
      </div>

      {steps.length === 0 && (
        <p className="text-sm text-text-secondary text-center py-4">No steps yet. Add your first step below.</p>
      )}

      {steps.map((step, idx) => (
        <div key={step.id} className="rounded-xl border border-border bg-surface-2">
          {/* Step header */}
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-3 rounded-t-xl transition-colors"
            onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
          >
            <span className="text-xs font-mono text-accent w-6 text-center">{idx + 1}</span>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${step.method === "GET" ? "bg-green-500/20 text-green-400" : step.method === "DELETE" ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}>
              {step.method}
            </span>
            <span className="flex-1 text-sm text-text-primary truncate">{step.name || `Step ${idx + 1}`}</span>
            <span className="text-xs text-text-secondary truncate max-w-xs">{step.url || "no URL"}</span>
            <div className="flex items-center gap-1 ml-2">
              <button type="button" onClick={(e) => { e.stopPropagation(); moveStep(idx, -1); }} disabled={idx === 0} className="p-1 rounded hover:bg-surface-3 disabled:opacity-30 text-text-secondary">↑</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); moveStep(idx, 1); }} disabled={idx === steps.length - 1} className="p-1 rounded hover:bg-surface-3 disabled:opacity-30 text-text-secondary">↓</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); removeStep(idx); }} className="p-1 rounded hover:bg-surface-3 text-red-400 hover:text-red-300">✕</button>
            </div>
          </button>

          {/* Step body */}
          {openIdx === idx && (
            <div className="border-t border-border p-3 space-y-3">
              {/* Name + Method */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Step Name</label>
                  <input type="text" value={step.name} onChange={(e) => updateStep(idx, { name: e.target.value })} className={inputClass} placeholder={`Step ${idx + 1}`} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Method</label>
                  <select value={step.method} onChange={(e) => updateStep(idx, { method: e.target.value as TransactionStep["method"] })} className={inputClass}>
                    {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Timeout (ms)</label>
                  <input type="number" value={step.timeoutMs ?? 10000} onChange={(e) => updateStep(idx, { timeoutMs: parseInt(e.target.value) || 10000 })} className={inputClass} min={1000} max={60000} />
                </div>
              </div>

              {/* URL */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">URL</label>
                <input type="text" value={step.url} onChange={(e) => updateStep(idx, { url: e.target.value })} className={inputClass} placeholder="https://api.example.com/login  (supports {{varName}})" />
              </div>

              {/* Headers */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Headers</label>
                <HeaderKVEditor
                  headers={step.headers ?? {}}
                  onChange={(h) => updateStep(idx, { headers: h })}
                  inputClass={inputClass}
                />
              </div>

              {/* Body (POST/PUT/PATCH only) */}
              {["POST", "PUT", "PATCH"].includes(step.method) && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Request Body</label>
                  <textarea rows={3} value={step.body ?? ""} onChange={(e) => updateStep(idx, { body: e.target.value || undefined })} className={`${inputClass} font-mono text-xs`} placeholder='{"username":"{{user}}","password":"{{pass}}"}' />
                </div>
              )}

              {/* Extract Variables */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Extract Variables <span className="font-normal text-text-secondary">(dot-path from JSON response)</span>
                </label>
                <ExtractKVEditor
                  extract={step.extract ?? {}}
                  onChange={(e) => updateStep(idx, { extract: e })}
                  inputClass={inputClass}
                />
              </div>

              {/* Assertions */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Assertions</label>
                <AssertionEditor
                  assertions={step.assertions ?? []}
                  onChange={(a) => updateStep(idx, { assertions: a })}
                  inputClass={inputClass}
                />
              </div>
            </div>
          )}
        </div>
      ))}

      {steps.length < 10 && (
        <button type="button" onClick={addStep} className="w-full py-2 rounded-xl border border-dashed border-border text-sm text-text-secondary hover:text-text-primary hover:border-accent transition-colors">
          + Add Step
        </button>
      )}
    </div>
  );
}

// ── Headers KV Editor ─────────────────────────────────────────────────────────

function HeaderKVEditor({ headers, onChange, inputClass }: { headers: Record<string, string>; onChange: (h: Record<string, string>) => void; inputClass: string }) {
  const entries = Object.entries(headers);
  const update = (key: string, val: string, oldKey: string) => {
    const next = { ...headers };
    if (oldKey !== key) delete next[oldKey];
    if (key) next[key] = val;
    onChange(next);
  };
  const remove = (k: string) => { const next = { ...headers }; delete next[k]; onChange(next); };
  const add = () => { onChange({ ...headers, "": "" }); };

  return (
    <div className="space-y-1">
      {entries.map(([k, v], i) => (
        <div key={i} className="flex gap-1">
          <input type="text" value={k} onChange={(e) => update(e.target.value, v, k)} className={`${inputClass} flex-1 text-xs`} placeholder="Header-Name" />
          <input type="text" value={v} onChange={(e) => update(k, e.target.value, k)} className={`${inputClass} flex-1 text-xs`} placeholder="value (supports {{varName}})" />
          <button type="button" onClick={() => remove(k)} className="px-2 text-red-400 hover:text-red-300 text-xs">✕</button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs text-accent hover:underline">+ Add Header</button>
    </div>
  );
}

// ── Extract KV Editor ─────────────────────────────────────────────────────────

function ExtractKVEditor({ extract, onChange, inputClass }: { extract: Record<string, string>; onChange: (e: Record<string, string>) => void; inputClass: string }) {
  const entries = Object.entries(extract);
  const update = (varName: string, path: string, oldKey: string) => {
    const next = { ...extract };
    if (oldKey !== varName) delete next[oldKey];
    if (varName) next[varName] = path;
    onChange(next);
  };
  const remove = (k: string) => { const next = { ...extract }; delete next[k]; onChange(next); };
  const add = () => onChange({ ...extract, "": "" });

  return (
    <div className="space-y-1">
      {entries.map(([k, v], i) => (
        <div key={i} className="flex gap-1">
          <input type="text" value={k} onChange={(e) => update(e.target.value, v, k)} className={`${inputClass} w-28 text-xs font-mono`} placeholder="varName" />
          <input type="text" value={v} onChange={(e) => update(k, e.target.value, k)} className={`${inputClass} flex-1 text-xs font-mono`} placeholder="data.token" />
          <button type="button" onClick={() => remove(k)} className="px-2 text-red-400 hover:text-red-300 text-xs">✕</button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs text-accent hover:underline">+ Add Extractor</button>
    </div>
  );
}

// ── Assertion Editor ──────────────────────────────────────────────────────────

function AssertionEditor({ assertions, onChange, inputClass }: { assertions: TransactionStepAssertion[]; onChange: (a: TransactionStepAssertion[]) => void; inputClass: string }) {
  const update = (idx: number, patch: Partial<TransactionStepAssertion>) =>
    onChange(assertions.map((a, i) => i === idx ? { ...a, ...patch } : a));
  const remove = (idx: number) => onChange(assertions.filter((_, i) => i !== idx));
  const add = () => onChange([...assertions, { type: "status", value: "200" }]);

  return (
    <div className="space-y-1">
      {assertions.map((a, idx) => (
        <div key={idx} className="flex gap-1 items-center">
          <select value={a.type} onChange={(e) => update(idx, { type: e.target.value as TransactionStepAssertion["type"] })} className={`${inputClass} w-36 text-xs`}>
            <option value="status">Status Code</option>
            <option value="body_contains">Body Contains</option>
            <option value="json_path">JSON Path</option>
            <option value="header_exists">Header Exists</option>
            <option value="latency_lt">Latency &lt; (ms)</option>
          </select>
          <input type="text" value={a.value} onChange={(e) => update(idx, { value: e.target.value })} className={`${inputClass} flex-1 text-xs`}
            placeholder={a.type === "status" ? "200" : a.type === "body_contains" ? "ok" : a.type === "json_path" ? "data.status" : a.type === "header_exists" ? "X-Request-Id" : "1000"} />
          {a.type === "json_path" && (
            <input type="text" value={a.expected ?? ""} onChange={(e) => update(idx, { expected: e.target.value || undefined })} className={`${inputClass} flex-1 text-xs`} placeholder="expected value" />
          )}
          <button type="button" onClick={() => remove(idx)} className="px-2 text-red-400 hover:text-red-300 text-xs">✕</button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs text-accent hover:underline">+ Add Assertion</button>
    </div>
  );
}

// ── Geo Regions Tag Input ─────────────────────────────────────────────────────

interface GeoRegionsInputProps {
  regions: string[];
  onChange: (regions: string[]) => void;
}

function GeoRegionsInput({ regions, onChange }: GeoRegionsInputProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addRegion = (value: string) => {
    const trimmed = value.trim().slice(0, 50);
    if (!trimmed || regions.includes(trimmed) || regions.length >= 10) return;
    onChange([...regions, trimmed]);
  };

  const removeRegion = (region: string) => {
    onChange(regions.filter((r) => r !== region));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && inputValue.trim()) {
      e.preventDefault();
      addRegion(inputValue.replace(/,+$/, "").trim());
      setInputValue("");
    } else if (e.key === "Backspace" && !inputValue && regions.length > 0) {
      removeRegion(regions[regions.length - 1]);
    }
  };

  return (
    <div className="border-t border-border pt-4 mt-2">
      <label className="block text-sm font-semibold text-text-primary mb-2">Geo Regions</label>
      <div
        className="min-h-[42px] flex flex-wrap gap-1.5 items-center px-3 py-2 rounded-xl border border-border bg-surface focus-within:ring-1 focus-within:ring-accent cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {regions.map((region) => (
          <span
            key={region}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent/15 text-accent border border-accent/30"
          >
            {region}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeRegion(region); }}
              className="hover:text-danger transition-colors ml-0.5"
              aria-label={`Remove region ${region}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue.trim()) {
              addRegion(inputValue.trim());
              setInputValue("");
            }
          }}
          placeholder={regions.length === 0 ? "e.g. us-east-1 — press Enter or comma to add" : regions.length >= 10 ? "Max 10 regions" : "Add region…"}
          disabled={regions.length >= 10}
          className="flex-1 min-w-[140px] bg-transparent text-sm text-text-primary placeholder-text-muted outline-none"
        />
      </div>
      <p className="text-xs text-text-muted mt-1.5">
        Assign region labels to checks for multi-region analysis. Labels are applied round-robin to each check run.{" "}
        <span className="text-text-secondary">{regions.length}/10 regions · max 50 chars each</span>
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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
              <option value="FTP">FTP Server</option>
              <option value="IMAP">IMAP Mail Server</option>
              <option value="POP3">POP3 Mail Server</option>
              <option value="BROWSER">Browser / Page Check</option>
              <option value="WHOIS">WHOIS Domain Expiry</option>
              <option value="CT_LOG">CT Log Monitor</option>
              <option value="GRAPHQL">GraphQL API Monitor</option>
              <option value="TRANSACTION">Multi-Step Transaction</option>
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
            <div className="flex items-start gap-3 p-3 rounded-xl border border-border bg-surface/50">
              <input
                id="detectChanges"
                type="checkbox"
                checked={(formData as unknown as { dnsDetectChanges?: boolean }).dnsDetectChanges ?? false}
                onChange={(e) => onSetFormData({ ...formData, dnsDetectChanges: e.target.checked } as typeof formData & { dnsDetectChanges?: boolean })}
                className="mt-0.5 h-4 w-4 rounded border-border accent-accent cursor-pointer"
              />
              <div>
                <label htmlFor="detectChanges" className="block text-sm font-medium text-text-primary cursor-pointer">
                  Alert on record change
                </label>
                <p className="mt-0.5 text-xs text-text-secondary leading-relaxed">
                  Stores the current DNS records as a baseline on first check. Alerts if records change (added or removed). Useful for detecting DNS hijacking or accidental record changes.
                </p>
              </div>
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

        {/* WHOIS Domain Expiry config */}
        {formData.type === "WHOIS" && (
          <>
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
              <p className="text-xs text-text-secondary leading-relaxed">
                <span className="font-medium text-text-primary">WHOIS Domain Expiry</span> — queries the WHOIS registry to find when your domain expires. Alerts you before the expiry date so you never let a domain lapse. Enter just the domain name (e.g. <code className="bg-surface-2 px-1 rounded">example.com</code>).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Warn threshold <span className="text-xs text-text-muted">(days)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={(formData as unknown as { whoisWarnDays?: number }).whoisWarnDays ?? 30}
                  onChange={(e) => onSetFormData({ ...formData, whoisWarnDays: Math.max(1, Number(e.target.value)) } as typeof formData & { whoisWarnDays?: number })}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-text-secondary">Yellow warning when expiry is within this many days (default: 30).</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Critical threshold <span className="text-xs text-text-muted">(days)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={(formData as unknown as { whoisCriticalDays?: number }).whoisCriticalDays ?? 7}
                  onChange={(e) => onSetFormData({ ...formData, whoisCriticalDays: Math.max(1, Number(e.target.value)) } as typeof formData & { whoisCriticalDays?: number })}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-text-secondary">Red alert when expiry is within this many days (default: 7).</p>
              </div>
            </div>
          </>
        )}

        {/* FTP-specific config */}
        {formData.type === "FTP" && (
          <>
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
              <p className="text-xs text-text-secondary leading-relaxed">
                <span className="font-medium text-text-primary">FTP Server</span> — connects to the FTP server and reads the 220 banner. Optionally tests AUTH TLS support. Enter <code className="bg-surface-2 px-1 rounded">host:port</code> (default port: 21).
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="ftpCheckTls"
                checked={(formData as unknown as { checkTls?: boolean }).checkTls ?? false}
                onChange={(e) => onSetFormData({ ...formData, checkTls: e.target.checked } as typeof formData & { checkTls?: boolean })}
                className="w-4 h-4 rounded border border-border bg-surface accent-accent"
              />
              <label htmlFor="ftpCheckTls" className="text-sm text-text-primary cursor-pointer">
                Test AUTH TLS (FTPS explicit)
              </label>
            </div>
            <p className="text-xs text-text-secondary -mt-1">When enabled, sends AUTH TLS after banner. Warns if TLS is not supported, fails if connection error occurs.</p>
          </>
        )}

        {/* IMAP-specific config */}
        {formData.type === "IMAP" && (
          <>
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
              <p className="text-xs text-text-secondary leading-relaxed">
                <span className="font-medium text-text-primary">IMAP Mail Server</span> — connects to the IMAP server and reads the greeting. Optionally tests STARTTLS support. Enter <code className="bg-surface-2 px-1 rounded">host:port</code> (default port: 143 plain, 993 TLS).
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="imapCheckTls"
                checked={(formData as unknown as { checkTls?: boolean }).checkTls ?? false}
                onChange={(e) => onSetFormData({ ...formData, checkTls: e.target.checked } as typeof formData & { checkTls?: boolean })}
                className="w-4 h-4 rounded border border-border bg-surface accent-accent"
              />
              <label htmlFor="imapCheckTls" className="text-sm text-text-primary cursor-pointer">
                Test STARTTLS upgrade
              </label>
            </div>
            <p className="text-xs text-text-secondary -mt-1">When enabled, sends STARTTLS after greeting. Warns if not supported.</p>
          </>
        )}

        {/* POP3-specific config */}
        {formData.type === "POP3" && (
          <>
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
              <p className="text-xs text-text-secondary leading-relaxed">
                <span className="font-medium text-text-primary">POP3 Mail Server</span> — connects to the POP3 server and reads the +OK greeting. Optionally tests STLS support. Enter <code className="bg-surface-2 px-1 rounded">host:port</code> (default port: 110 plain, 995 TLS).
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="pop3CheckTls"
                checked={(formData as unknown as { checkTls?: boolean }).checkTls ?? false}
                onChange={(e) => onSetFormData({ ...formData, checkTls: e.target.checked } as typeof formData & { checkTls?: boolean })}
                className="w-4 h-4 rounded border border-border bg-surface accent-accent"
              />
              <label htmlFor="pop3CheckTls" className="text-sm text-text-primary cursor-pointer">
                Test STLS upgrade
              </label>
            </div>
            <p className="text-xs text-text-secondary -mt-1">When enabled, sends STLS command after greeting. Warns if not supported.</p>
          </>
        )}

        {/* CT Log-specific config */}
        {formData.type === "CT_LOG" && (
          <>
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
              <p className="text-xs text-text-secondary leading-relaxed">
                <span className="font-medium text-text-primary">CT Log Monitor</span> — watches{" "}
                <a href="https://crt.sh" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">crt.sh</a>{" "}
                (Certificate Transparency logs) for new SSL/TLS certificates issued for your domain.
                Detects unauthorized certs, new subdomains, and wildcard issuance.
                Enter just the domain name (e.g. <code className="bg-surface-2 px-1 rounded">example.com</code>).
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Lookback window (days)
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={(formData as unknown as { ctLogLookbackDays?: number }).ctLogLookbackDays ?? 7}
                onChange={(e) => onSetFormData({ ...formData, ctLogLookbackDays: Math.min(30, Math.max(1, parseInt(e.target.value, 10) || 7)) } as typeof formData & { ctLogLookbackDays?: number })}
                className={inputClass}
                placeholder="7"
              />
              <p className="text-xs text-text-secondary mt-1">Certificates issued within this window trigger a yellow alert. Range: 1–30 days.</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="ctLogAlertOnNewSubdomains"
                checked={(formData as unknown as { ctLogAlertOnNewSubdomains?: boolean }).ctLogAlertOnNewSubdomains ?? true}
                onChange={(e) => onSetFormData({ ...formData, ctLogAlertOnNewSubdomains: e.target.checked } as typeof formData & { ctLogAlertOnNewSubdomains?: boolean })}
                className="w-4 h-4 rounded border border-border bg-surface accent-accent"
              />
              <label htmlFor="ctLogAlertOnNewSubdomains" className="text-sm text-text-primary cursor-pointer">
                Alert on new subdomains
              </label>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="ctLogAlertOnWildcard"
                checked={(formData as unknown as { ctLogAlertOnWildcard?: boolean }).ctLogAlertOnWildcard ?? true}
                onChange={(e) => onSetFormData({ ...formData, ctLogAlertOnWildcard: e.target.checked } as typeof formData & { ctLogAlertOnWildcard?: boolean })}
                className="w-4 h-4 rounded border border-border bg-surface accent-accent"
              />
              <label htmlFor="ctLogAlertOnWildcard" className="text-sm text-text-primary cursor-pointer">
                Alert on wildcard certificates
              </label>
            </div>
          </>
        )}

        {/* GraphQL-specific config */}
        {formData.type === "GRAPHQL" && (
          <>
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
              <p className="text-xs text-text-secondary leading-relaxed">
                <span className="font-medium text-text-primary">GraphQL Monitor</span> — sends a POST request to your GraphQL endpoint with the configured query.
                Checks for HTTP errors, GraphQL errors in the response, and optionally validates a specific field value.
                Default query: <code className="bg-surface-2 px-1 rounded">{"{ __typename }"}</code> (introspection health check).
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                GraphQL Query
              </label>
              <textarea
                rows={4}
                value={(formData as unknown as { graphqlQuery?: string }).graphqlQuery ?? ""}
                onChange={(e) => onSetFormData({ ...formData, graphqlQuery: e.target.value || null } as typeof formData & { graphqlQuery?: string | null })}
                className={`${inputClass} font-mono text-xs`}
                placeholder={"{ __typename }"}
              />
              <p className="text-xs text-text-secondary mt-1">Leave empty to use the default introspection health check.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Variables (JSON)
              </label>
              <textarea
                rows={2}
                value={(formData as unknown as { graphqlVariables?: string }).graphqlVariables ?? ""}
                onChange={(e) => onSetFormData({ ...formData, graphqlVariables: e.target.value || null } as typeof formData & { graphqlVariables?: string | null })}
                className={`${inputClass} font-mono text-xs`}
                placeholder='{ "id": "123" }'
              />
              <p className="text-xs text-text-secondary mt-1">Optional JSON variables to pass with the query.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Expected Field (JSONPath)
              </label>
              <input
                type="text"
                value={(formData as unknown as { graphqlDataPath?: string }).graphqlDataPath ?? ""}
                onChange={(e) => onSetFormData({ ...formData, graphqlDataPath: e.target.value || null } as typeof formData & { graphqlDataPath?: string | null })}
                className={inputClass}
                placeholder="$.data.__typename"
              />
              <p className="text-xs text-text-secondary mt-1">Optional JSONPath to a field that must exist in the response (e.g. <code className="bg-surface-2 px-1 rounded">$.data.status.health</code>).</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Expected Value
              </label>
              <input
                type="text"
                value={(formData as unknown as { graphqlExpectedValue?: string }).graphqlExpectedValue ?? ""}
                onChange={(e) => onSetFormData({ ...formData, graphqlExpectedValue: e.target.value || null } as typeof formData & { graphqlExpectedValue?: string | null })}
                className={inputClass}
                placeholder="ok"
              />
              <p className="text-xs text-text-secondary mt-1">Optional: if set, the value at the field path must exactly match this string. Leave empty to just assert the field exists.</p>
            </div>
          </>
        )}

        {/* TRANSACTION-specific config */}
        {formData.type === "TRANSACTION" && (
          <TransactionStepBuilder
            steps={(formData as typeof formData & { transactionSteps?: TransactionStep[] }).transactionSteps ?? []}
            onChange={(steps) => onSetFormData({ ...formData, transactionSteps: steps } as typeof formData & { transactionSteps: TransactionStep[] })}
            inputClass={inputClass}
          />
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
            {/* Authentication */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Authentication
              </label>
              <select
                value={(formData as unknown as { authType?: string }).authType ?? "none"}
                onChange={(e) => onSetFormData({ ...formData, authType: e.target.value } as typeof formData & { authType?: string })}
                className={inputClass}
              >
                <option value="none">None</option>
                <option value="basic">Basic Auth (username + password)</option>
                <option value="bearer">Bearer Token</option>
                <option value="api-key">API Key</option>
              </select>
            </div>
            {(formData as unknown as { authType?: string }).authType === "basic" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Username</label>
                  <input
                    type="text"
                    value={(formData as unknown as { authUser?: string }).authUser ?? ""}
                    onChange={(e) => onSetFormData({ ...formData, authUser: e.target.value } as typeof formData & { authUser?: string })}
                    className={inputClass}
                    placeholder="username"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Password</label>
                  <input
                    type="password"
                    value={(formData as unknown as { authPassword?: string }).authPassword ?? ""}
                    onChange={(e) => onSetFormData({ ...formData, authPassword: e.target.value } as typeof formData & { authPassword?: string })}
                    className={inputClass}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            )}
            {(formData as unknown as { authType?: string }).authType === "bearer" && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Bearer Token</label>
                <input
                  type="password"
                  value={(formData as unknown as { authToken?: string }).authToken ?? ""}
                  onChange={(e) => onSetFormData({ ...formData, authToken: e.target.value } as typeof formData & { authToken?: string })}
                  className={inputClass}
                  placeholder="eyJhbGciOiJIUzI1NiIs..."
                  autoComplete="off"
                />
                <p className="mt-1 text-xs text-text-secondary">Sent as <code className="bg-surface-2 px-1 rounded">Authorization: Bearer &lt;token&gt;</code></p>
              </div>
            )}
            {(formData as unknown as { authType?: string }).authType === "api-key" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Key Name</label>
                    <input
                      type="text"
                      value={(formData as unknown as { authApiKeyName?: string }).authApiKeyName ?? ""}
                      onChange={(e) => onSetFormData({ ...formData, authApiKeyName: e.target.value } as typeof formData & { authApiKeyName?: string })}
                      className={inputClass}
                      placeholder="X-API-Key"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Key Value</label>
                    <input
                      type="password"
                      value={(formData as unknown as { authApiKeyValue?: string }).authApiKeyValue ?? ""}
                      onChange={(e) => onSetFormData({ ...formData, authApiKeyValue: e.target.value } as typeof formData & { authApiKeyValue?: string })}
                      className={inputClass}
                      placeholder="your-secret-api-key"
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Send As</label>
                  <select
                    value={(formData as unknown as { authApiKeyIn?: string }).authApiKeyIn ?? "header"}
                    onChange={(e) => onSetFormData({ ...formData, authApiKeyIn: e.target.value } as typeof formData & { authApiKeyIn?: string })}
                    className={inputClass}
                  >
                    <option value="header">Request Header</option>
                    <option value="query">Query Parameter</option>
                  </select>
                </div>
              </div>
            )}
            {/* Pre-Request Authentication Step */}
            <div className="space-y-3 p-3 rounded-lg border border-border/60 bg-surface-elevated/40">
              <div className="flex items-center gap-2">
                <label className="text-sm font-semibold text-text-secondary">Pre-Request Auth Step</label>
                <span className="text-[10px] uppercase tracking-wider bg-accent/10 text-accent px-1.5 py-0.5 rounded font-medium">Optional</span>
              </div>
              <p className="text-xs text-text-muted">Login first, then carry the session cookie or token to the main check. Useful for apps behind authentication.</p>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Login URL <span className="text-[10px] text-text-muted">(POST)</span></label>
                <input
                  type="text"
                  value={(formData as unknown as { preAuthUrl?: string }).preAuthUrl ?? ""}
                  onChange={(e) => onSetFormData({ ...formData, preAuthUrl: e.target.value } as typeof formData & { preAuthUrl?: string })}
                  className={inputClass}
                  placeholder="https://app.example.com/api/auth/login"
                  autoComplete="off"
                />
              </div>
              {(formData as unknown as { preAuthUrl?: string }).preAuthUrl?.trim() && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Login Payload <span className="text-[10px] text-text-muted">(JSON body)</span></label>
                    <textarea
                      rows={2}
                      value={(formData as unknown as { preAuthBody?: string }).preAuthBody ?? ""}
                      onChange={(e) => onSetFormData({ ...formData, preAuthBody: e.target.value } as typeof formData & { preAuthBody?: string })}
                      className={`${inputClass} font-mono text-xs resize-y`}
                      placeholder={'{"email":"monitor@example.com","password":"secret"}'}
                      spellCheck={false}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Extract Cookie <span className="text-[10px] text-text-muted">(name)</span></label>
                      <input
                        type="text"
                        value={(formData as unknown as { preAuthExtractCookie?: string }).preAuthExtractCookie ?? ""}
                        onChange={(e) => onSetFormData({ ...formData, preAuthExtractCookie: e.target.value } as typeof formData & { preAuthExtractCookie?: string })}
                        className={inputClass}
                        placeholder="session"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Extract Token <span className="text-[10px] text-text-muted">(JSON path)</span></label>
                      <input
                        type="text"
                        value={(formData as unknown as { preAuthExtractToken?: string }).preAuthExtractToken ?? ""}
                        onChange={(e) => onSetFormData({ ...formData, preAuthExtractToken: e.target.value } as typeof formData & { preAuthExtractToken?: string })}
                        className={inputClass}
                        placeholder="data.accessToken"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-text-muted">Set either <em>Extract Cookie</em> (cookie name from Set-Cookie) or <em>Extract Token</em> (JSON dot-path to bearer token) — not both.</p>
                </>
              )}
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
                placeholder={"Content-Type: application/json\nX-Custom-Header: value"}
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

            {/* Response Size Bounds */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Min response size (bytes) <span className="text-xs text-text-muted">(optional)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={(formData as unknown as { minResponseBodyBytes?: number }).minResponseBodyBytes ?? ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? undefined : parseInt(e.target.value);
                    onSetFormData({ ...formData, minResponseBodyBytes: val } as typeof formData & { minResponseBodyBytes?: number });
                  }}
                  className={inputClass}
                  placeholder="e.g. 500"
                />
                <p className="mt-1 text-xs text-text-secondary">Alert if body smaller than this.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Max response size (bytes) <span className="text-xs text-text-muted">(optional)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={(formData as unknown as { maxResponseBodyBytes?: number }).maxResponseBodyBytes ?? ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? undefined : parseInt(e.target.value);
                    onSetFormData({ ...formData, maxResponseBodyBytes: val } as typeof formData & { maxResponseBodyBytes?: number });
                  }}
                  className={inputClass}
                  placeholder="e.g. 5000000"
                />
                <p className="mt-1 text-xs text-text-secondary">Alert if body larger than this.</p>
              </div>
            </div>

            {/* Response Header Assertion */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Assert header name <span className="text-xs text-text-muted">(optional)</span>
                </label>
                <input
                  type="text"
                  value={(formData as unknown as { assertResponseHeader?: string }).assertResponseHeader ?? ""}
                  onChange={(e) => {
                    const val = e.target.value || undefined;
                    onSetFormData({ ...formData, assertResponseHeader: val } as typeof formData & { assertResponseHeader?: string });
                  }}
                  className={inputClass}
                  placeholder="e.g. content-type"
                />
                <p className="mt-1 text-xs text-text-secondary">Alert if this header is missing.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Assert header value <span className="text-xs text-text-muted">(optional)</span>
                </label>
                <input
                  type="text"
                  value={(formData as unknown as { assertResponseHeaderValue?: string }).assertResponseHeaderValue ?? ""}
                  onChange={(e) => {
                    const val = e.target.value || undefined;
                    onSetFormData({ ...formData, assertResponseHeaderValue: val } as typeof formData & { assertResponseHeaderValue?: string });
                  }}
                  className={inputClass}
                  placeholder="e.g. application/json"
                  disabled={!(formData as unknown as { assertResponseHeader?: string }).assertResponseHeader}
                />
                <p className="mt-1 text-xs text-text-secondary">Alert if header value doesn&apos;t contain this.</p>
              </div>
            </div>

            {/* Security Headers Audit */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-2 border border-border">
              <input
                type="checkbox"
                id="checkSecurityHeaders"
                checked={(formData as unknown as { checkSecurityHeaders?: boolean }).checkSecurityHeaders ?? false}
                onChange={(e) => onSetFormData({ ...formData, checkSecurityHeaders: e.target.checked } as typeof formData & { checkSecurityHeaders?: boolean })}
                className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent cursor-pointer"
              />
              <label htmlFor="checkSecurityHeaders" className="cursor-pointer select-none">
                <span className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                  🔒 Audit security headers
                </span>
                <span className="text-xs text-text-secondary mt-0.5 block">Checks for HSTS, CSP, X-Frame-Options, X-Content-Type-Options and more. Grades the response A–F and stores results per run.</span>
              </label>
            </div>

            {/* Content Change Detection */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-2 border border-border">
              <input
                type="checkbox"
                id="detectContentChanges"
                checked={(formData as unknown as { detectContentChanges?: boolean }).detectContentChanges ?? false}
                onChange={(e) => onSetFormData({ ...formData, detectContentChanges: e.target.checked } as typeof formData & { detectContentChanges?: boolean })}
                className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent cursor-pointer"
              />
              <label htmlFor="detectContentChanges" className="cursor-pointer select-none">
                <span className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                  📄 Detect content changes
                </span>
                <span className="text-xs text-text-secondary mt-0.5 block">Alerts when the page content changes from the established baseline. Useful for detecting deployments, defacements, or unexpected changes.</span>
              </label>
            </div>

            {/* Response Header Tracking */}
            <div className="flex flex-col gap-2 p-3 rounded-lg bg-surface-2 border border-border">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="enableHeaderTracking"
                  checked={!!((formData as unknown as { trackedHeaders?: string }).trackedHeaders)}
                  onChange={(e) => onSetFormData({ ...formData, trackedHeaders: e.target.checked ? 'x-frame-options,content-security-policy,server' : '' } as typeof formData & { trackedHeaders?: string })}
                  className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent cursor-pointer"
                />
                <label htmlFor="enableHeaderTracking" className="cursor-pointer select-none">
                  <span className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                    📋 Track response header changes
                  </span>
                  <span className="text-xs text-text-secondary mt-0.5 block">Alerts yellow when specified response headers change from baseline. Useful for detecting security header regressions, CDN configuration changes, or server version updates.</span>
                </label>
              </div>
              {!!((formData as unknown as { trackedHeaders?: string }).trackedHeaders) && (
                <div className="mt-1 ml-7">
                  <label htmlFor="trackedHeaders" className="text-xs text-text-secondary block mb-1">
                    Header names to track (comma-separated, case-insensitive):
                  </label>
                  <input
                    id="trackedHeaders"
                    type="text"
                    value={(formData as unknown as { trackedHeaders?: string }).trackedHeaders ?? ''}
                    onChange={(e) => onSetFormData({ ...formData, trackedHeaders: e.target.value } as typeof formData & { trackedHeaders?: string })}
                    placeholder="e.g. x-frame-options,content-security-policy,server"
                    className="w-full px-2 py-1.5 text-xs bg-surface border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <p className="text-xs text-text-secondary mt-1">Common: <code className="text-accent">server</code>, <code className="text-accent">x-frame-options</code>, <code className="text-accent">content-security-policy</code>, <code className="text-accent">strict-transport-security</code>, <code className="text-accent">x-powered-by</code></p>
                </div>
              )}
            </div>

            {/* Header Assertions */}
            {(() => {
              const assertions: Array<{ header: string; op: string; value?: string }> =
                (formData as unknown as { headerAssertions?: Array<{ header: string; op: string; value?: string }> }).headerAssertions ?? [];
              const setAssertions = (next: Array<{ header: string; op: string; value?: string }>) =>
                onSetFormData({ ...formData, headerAssertions: next } as typeof formData & { headerAssertions?: Array<{ header: string; op: string; value?: string }> });

              const SUGGESTIONS = [
                { header: 'strict-transport-security', op: 'exists' },
                { header: 'x-frame-options', op: 'exists' },
                { header: 'content-security-policy', op: 'exists' },
                { header: 'x-content-type-options', op: 'equals', value: 'nosniff' },
              ];

              const inputClass = "w-full px-2 py-1.5 text-xs bg-surface border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-accent";

              return (
                <div className="flex flex-col gap-2 p-3 rounded-lg bg-surface-2 border border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                      🔍 Header Assertions
                    </span>
                    {assertions.length < 10 && (
                      <button
                        type="button"
                        onClick={() => setAssertions([...assertions, { header: '', op: 'exists' }])}
                        className="text-xs text-accent hover:text-accent/80 transition-colors font-medium"
                      >
                        + Add assertion
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary">Assert specific response headers on every check — alert yellow when a header is missing, has the wrong value, or contains unexpected content.</p>

                  {/* Suggestion chips */}
                  {assertions.length === 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {SUGGESTIONS.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setAssertions([...assertions, s])}
                          className="text-xs px-2 py-1 rounded bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
                        >
                          {s.header}: {s.op}{s.value ? `: ${s.value}` : ''}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Assertion rows */}
                  {assertions.map((a, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={a.header}
                        onChange={(e) => {
                          const next = [...assertions];
                          next[i] = { ...next[i], header: e.target.value };
                          setAssertions(next);
                        }}
                        className={inputClass + " flex-1"}
                        placeholder="header name (e.g. x-frame-options)"
                      />
                      <select
                        value={a.op}
                        onChange={(e) => {
                          const next = [...assertions];
                          next[i] = { ...next[i], op: e.target.value };
                          setAssertions(next);
                        }}
                        className={inputClass + " w-36 shrink-0"}
                      >
                        <option value="exists">exists</option>
                        <option value="not-exists">does not exist</option>
                        <option value="equals">equals</option>
                        <option value="contains">contains</option>
                      </select>
                      <input
                        type="text"
                        value={a.value ?? ''}
                        onChange={(e) => {
                          const next = [...assertions];
                          next[i] = { ...next[i], value: e.target.value || undefined };
                          setAssertions(next);
                        }}
                        disabled={a.op === 'exists' || a.op === 'not-exists'}
                        className={inputClass + " flex-1 disabled:opacity-40 disabled:cursor-not-allowed"}
                        placeholder="expected value"
                      />
                      <button
                        type="button"
                        onClick={() => setAssertions(assertions.filter((_, j) => j !== i))}
                        className="text-text-muted hover:text-danger transition-colors text-sm font-bold shrink-0 w-5"
                        title="Remove assertion"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {assertions.length > 0 && assertions.length < 10 && (
                    <button
                      type="button"
                      onClick={() => setAssertions([...assertions, { header: '', op: 'exists' }])}
                      className="text-xs text-text-muted hover:text-accent transition-colors self-start"
                    >
                      + Add another
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Redirect Following */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-2 border border-border">
              <input
                type="checkbox"
                id="followRedirects"
                checked={(formData as unknown as { followRedirects?: boolean }).followRedirects !== false}
                onChange={(e) => onSetFormData({ ...formData, followRedirects: e.target.checked } as typeof formData & { followRedirects?: boolean })}
                className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent cursor-pointer"
              />
              <label htmlFor="followRedirects" className="cursor-pointer select-none flex-1">
                <span className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                  🔀 Follow redirects
                </span>
                <span className="text-xs text-text-secondary mt-0.5 block">Automatically follow HTTP 3xx redirects up to the configured limit. Disable to assert the first response code directly (useful for monitoring redirect chains).</span>
                {(formData as unknown as { followRedirects?: boolean }).followRedirects !== false && (
                  <div className="mt-2 flex items-center gap-2">
                    <label htmlFor="maxRedirects" className="text-xs text-text-secondary whitespace-nowrap">Max redirects:</label>
                    <input
                      id="maxRedirects"
                      type="number"
                      min={1}
                      max={20}
                      value={(formData as unknown as { maxRedirects?: number }).maxRedirects ?? 10}
                      onChange={(e) => {
                        const val = Math.min(20, Math.max(1, parseInt(e.target.value) || 10));
                        onSetFormData({ ...formData, maxRedirects: val } as typeof formData & { maxRedirects?: number });
                      }}
                      className="w-16 px-2 py-1 text-xs bg-surface border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <span className="text-xs text-text-secondary">(1–20, default 10)</span>
                  </div>
                )}
              </label>
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

        {/* RTO */}
        <div>
          <label className="text-sm font-medium text-white">
            Recovery Time Objective (RTO)
            <span className="ml-1 text-xs text-white/40">(optional)</span>
          </label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              min={1}
              max={10080}
              placeholder="e.g. 15"
              value={formData.rtoMinutes ?? ''}
              onChange={e => {
                const v = e.target.value === '' ? undefined : parseInt(e.target.value);
                onSetFormData({ ...formData, rtoMinutes: v });
              }}
              className="w-32 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            />
            <span className="text-sm text-white/50">minutes</span>
          </div>
          <p className="text-xs text-white/40 mt-1">Alert breach when recovery takes longer than this target</p>
        </div>

        {/* Priority */}
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-sm font-semibold text-text-primary">Priority / Criticality</label>
            <p className="mt-0.5 text-xs text-text-secondary">
              Set the business priority for this monitor. Used for sorting, filtering, and alert routing rules.
            </p>
          </div>
          <select
            value={(formData as unknown as { priority?: number }).priority ?? 0}
            onChange={e => {
              (onSetFormData as (d: typeof formData & { priority?: number }) => void)({ ...formData, priority: parseInt(e.target.value) });
            }}
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
            <p className="mt-0.5 text-xs text-text-secondary">
              Estimated business cost per hour of downtime (USD). Used to compute financial impact in reports and monitor detail.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/50">$</span>
            <input
              type="number"
              min={0}
              step={10}
              placeholder="e.g. 500"
              value={(formData as unknown as { downtimeCostPerHour?: number | null }).downtimeCostPerHour ?? ''}
              onChange={e => {
                const v = e.target.value === '' ? undefined : parseFloat(e.target.value);
                (onSetFormData as (d: typeof formData & { downtimeCostPerHour?: number | null }) => void)({ ...formData, downtimeCostPerHour: v ?? null });
              }}
              className="w-32 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            />
            <span className="text-sm text-white/50">per hour</span>
          </div>
          <p className="text-xs text-white/40">Leave blank to skip financial impact calculations</p>
        </div>

        {/* Status Webhook */}
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-sm font-semibold text-text-primary">Status Change Webhook</label>
            <p className="mt-0.5 text-xs text-text-secondary">
              POST to this URL whenever this monitor&apos;s status changes (green↔yellow/red). Useful for CI/CD integrations and automation.
            </p>
          </div>
          <div>
            <label htmlFor="statusWebhookUrl" className="text-xs text-text-secondary block mb-1">Webhook URL</label>
            <input
              id="statusWebhookUrl"
              type="url"
              placeholder="https://example.com/hooks/monitor-status"
              value={(formData as unknown as { statusWebhookUrl?: string }).statusWebhookUrl ?? ''}
              onChange={(e) => (onSetFormData as (d: typeof formData & { statusWebhookUrl?: string }) => void)({ ...formData, statusWebhookUrl: e.target.value || '' })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30"
            />
          </div>
          {!!((formData as unknown as { statusWebhookUrl?: string }).statusWebhookUrl) && (
            <div>
              <label htmlFor="statusWebhookSecret" className="text-xs text-text-secondary block mb-1">Signing Secret <span className="text-white/30">(optional — adds X-PulseDock-Signature header)</span></label>
              <input
                id="statusWebhookSecret"
                type="password"
                placeholder="Leave blank to skip signature"
                value={(formData as unknown as { statusWebhookSecret?: string }).statusWebhookSecret ?? ''}
                onChange={(e) => (onSetFormData as (d: typeof formData & { statusWebhookSecret?: string }) => void)({ ...formData, statusWebhookSecret: e.target.value || '' })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30"
              />
              <p className="text-xs text-white/40 mt-1">HMAC-SHA256: verify with <code className="bg-white/10 px-1 rounded">sha256=&lt;hex&gt;</code> from the X-PulseDock-Signature header</p>
            </div>
          )}
        </div>

        {/* Rate Limiting */}
        <div className="border border-border rounded-lg p-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-text-primary">Rate Limiting</label>
            <p className="mt-0.5 text-xs text-text-secondary">
              Prevent thundering herds and be a good citizen to monitored services.
            </p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Min. delay between checks (ms)</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1000"
                  max="3600000"
                  step="1000"
                  placeholder="e.g. 5000"
                  value={(formData as MonitorFormData).throttleMs ?? ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? null : parseInt(e.target.value, 10);
                    onSetFormData({ ...formData, throttleMs: val && val >= 1000 ? val : null });
                  }}
                  className="w-36 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <span className="text-sm text-text-muted">ms</span>
              </div>
              <p className="text-xs text-text-muted mt-1">Prevents rapid successive checks after interval drift. Min 1000ms.</p>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Max checks per hour</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="360"
                  step="1"
                  placeholder="e.g. 60"
                  value={(formData as MonitorFormData).maxChecksPerHour ?? ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? null : parseInt(e.target.value, 10);
                    onSetFormData({ ...formData, maxChecksPerHour: val && val >= 1 ? val : null });
                  }}
                  className="w-36 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
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
                <p className="mt-0.5 text-xs text-text-secondary">
                  Automatically increase check frequency when the monitor is degraded or down, then return to normal on recovery. Catches faster recovery times and reduces alert lag.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={(formData as MonitorFormData & { adaptiveIntervalEnabled?: boolean }).adaptiveIntervalEnabled ?? false}
                  onChange={(e) => onSetFormData({ ...formData, adaptiveIntervalEnabled: e.target.checked })}
                />
                <div className="w-9 h-5 bg-surface-raised rounded-full peer peer-checked:bg-accent after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4 border border-border" />
              </label>
            </div>
            {(formData as MonitorFormData & { adaptiveIntervalEnabled?: boolean }).adaptiveIntervalEnabled && (
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">When DOWN (red) — interval (sec)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="10"
                      max="3600"
                      step="5"
                      placeholder={`Default: ${Math.max(10, Math.floor(((formData as MonitorFormData).intervalSec ?? 60) / 4))}s`}
                      value={(formData as MonitorFormData & { adaptiveIntervalDownSec?: number | null }).adaptiveIntervalDownSec ?? ""}
                      onChange={(e) => {
                        const val = e.target.value === "" ? null : parseInt(e.target.value, 10);
                        onSetFormData({ ...formData, adaptiveIntervalDownSec: val && val >= 10 ? val : null });
                      }}
                      className="w-28 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <span className="text-xs text-text-muted">sec</span>
                  </div>
                  <p className="text-xs text-text-muted mt-1">Leave blank to use ¼ of normal interval</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">When DEGRADED (yellow) — interval (sec)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="15"
                      max="3600"
                      step="5"
                      placeholder={`Default: ${Math.max(15, Math.floor(((formData as MonitorFormData).intervalSec ?? 60) / 2))}s`}
                      value={(formData as MonitorFormData & { adaptiveIntervalDegradedSec?: number | null }).adaptiveIntervalDegradedSec ?? ""}
                      onChange={(e) => {
                        const val = e.target.value === "" ? null : parseInt(e.target.value, 10);
                        onSetFormData({ ...formData, adaptiveIntervalDegradedSec: val && val >= 15 ? val : null });
                      }}
                      className="w-28 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <span className="text-xs text-text-muted">sec</span>
                  </div>
                  <p className="text-xs text-text-muted mt-1">Leave blank to use ½ of normal interval</p>
                </div>
              </div>
            )}
          </div>

          {/* Geo Regions */}
          <GeoRegionsInput
            regions={(formData as MonitorFormData).geoRegions ?? []}
            onChange={(regions) => onSetFormData({ ...formData, geoRegions: regions })}
          />
        </div>

        {/* Custom Metric Capture — HTTP/BROWSER only */}
        {(formData.type === "HTTP" || formData.type === "BROWSER") && (
          <div className="border border-border rounded-lg p-4 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-text-primary">Custom Metric Capture</label>
              <p className="mt-0.5 text-xs text-text-secondary">
                Extract a numeric value from the JSON response body on every check. Track business metrics (queue depth, error count, active users) without a separate metrics system.
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">JSON Path <span className="text-white/40">(e.g. $.queue.depth, $.metrics.errors)</span></label>
                <input
                  type="text"
                  placeholder="$.queue.depth"
                  value={(formData as MonitorFormData).metricPath ?? ""}
                  onChange={(e) => onSetFormData({ ...formData, metricPath: e.target.value || null })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-white/30"
                />
              </div>
              {(formData as MonitorFormData).metricPath && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Metric Name</label>
                      <input
                        type="text"
                        placeholder="Queue Depth"
                        value={(formData as MonitorFormData).metricName ?? ""}
                        onChange={(e) => onSetFormData({ ...formData, metricName: e.target.value || null })}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-white/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Unit <span className="text-white/40">(optional)</span></label>
                      <input
                        type="text"
                        placeholder="items"
                        value={(formData as MonitorFormData).metricUnit ?? ""}
                        onChange={(e) => onSetFormData({ ...formData, metricUnit: e.target.value || null })}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-white/30"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Alert thresholds <span className="text-white/40">(optional — turns check yellow when outside range)</span></label>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">Min</span>
                        <input
                          type="number"
                          placeholder="—"
                          value={(formData as MonitorFormData).metricAlertMin ?? ""}
                          onChange={(e) => {
                            const val = e.target.value === "" ? null : parseFloat(e.target.value);
                            onSetFormData({ ...formData, metricAlertMin: val !== null && !isNaN(val) ? val : null });
                          }}
                          className="w-24 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">Max</span>
                        <input
                          type="number"
                          placeholder="—"
                          value={(formData as MonitorFormData).metricAlertMax ?? ""}
                          onChange={(e) => {
                            const val = e.target.value === "" ? null : parseFloat(e.target.value);
                            onSetFormData({ ...formData, metricAlertMax: val !== null && !isNaN(val) ? val : null });
                          }}
                          className="w-24 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

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
        <div className="border border-border rounded-lg p-4 space-y-3">
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
          {(formData.flapDetectionEnabled ?? true) && (
            <div className="space-y-3 pl-4 border-l-2 border-border">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Check Window</label>
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={formData.flapWindow ?? 10}
                  onChange={(e) => onSetFormData({ ...formData, flapWindow: parseInt(e.target.value) || 10 })}
                  className="w-24 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <p className="text-xs text-text-muted mt-1">Number of recent checks to analyze for flapping (5–50)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Flap Threshold</label>
                <select
                  value={formData.flapThreshold ?? 0.5}
                  onChange={(e) => onSetFormData({ ...formData, flapThreshold: parseFloat(e.target.value) })}
                  className="w-56 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                >
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

        {/* Fixed Latency Alert Threshold */}
        {(formData.type === "HTTP" || formData.type === "TCP" || formData.type === "DNS") && (
          <>
            <div className="border border-border rounded-lg p-4 space-y-3">
              <div>
                <label className="block text-sm font-semibold text-text-primary">Latency Alert Threshold</label>
                <p className="mt-0.5 text-xs text-text-secondary">
                  Alert when a successful check takes longer than this threshold. Leave blank to disable.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="60000"
                  step="100"
                  placeholder="e.g. 2000"
                  value={formData.latencyAlertMs ?? ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? null : parseInt(e.target.value, 10);
                    onSetFormData({ ...formData, latencyAlertMs: val && val > 0 ? val : null });
                  }}
                  className="w-36 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <span className="text-sm text-text-muted">ms</span>
                {formData.latencyAlertMs && formData.latencyAlertMs > 0 && (
                  <span className="text-xs text-warning">⚠ Alert if response &gt; {formData.latencyAlertMs}ms</span>
                )}
              </div>
            </div>

            {/* Latency Budget (P95 target) */}
            <div className="border border-border rounded-lg p-4 space-y-3">
              <div>
                <label className="block text-sm font-semibold text-text-primary">Latency Budget (P95 target, ms)</label>
                <p className="mt-0.5 text-xs text-text-secondary">
                  Monthly P95 latency budget. Tracks the % of checks that exceed this target. Used for SLO budget consumption reporting.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="100"
                  max="60000"
                  step="100"
                  placeholder="e.g. 500"
                  value={formData.latencyBudgetMs ?? ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? null : parseInt(e.target.value, 10);
                    onSetFormData({ ...formData, latencyBudgetMs: val && val >= 100 ? val : null });
                  }}
                  className="w-36 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
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
              <p className="mt-0.5 text-xs text-text-secondary">
                Override the default {formData.type === "BROWSER" ? "15,000ms" : "5,000ms"} request timeout. Useful for slow endpoints or strict SLA requirements. Leave blank to use the default.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="500"
                max="60000"
                step="500"
                placeholder={formData.type === "BROWSER" ? "15000" : "5000"}
                value={(formData as MonitorFormData).timeoutMs ?? ""}
                onChange={(e) => {
                  const val = e.target.value === "" ? null : parseInt(e.target.value, 10);
                  onSetFormData({ ...formData, timeoutMs: val && val >= 500 ? val : null });
                }}
                className="w-36 px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <span className="text-sm text-text-muted">ms</span>
              {(formData as MonitorFormData).timeoutMs && (formData as MonitorFormData).timeoutMs! > 0 && (
                <span className="text-xs text-accent">✓ Times out after {(formData as MonitorFormData).timeoutMs}ms</span>
              )}
            </div>
          </div>
        )}

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

        {/* Cron Expression Scheduling */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-text-secondary">Cron Expression Schedule</label>
              <p className="text-xs text-text-muted mt-0.5">Use a cron expression for advanced scheduling (overrides the interval above). Evaluated in UTC.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!(formData.cronExpression ?? '')}
              onClick={() => onSetFormData({ ...formData, cronExpression: formData.cronExpression ? '' : '*/5 * * * *' })}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                !!(formData.cronExpression ?? '') ? "bg-accent" : "bg-surface-secondary"
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${!!(formData.cronExpression ?? '') ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
          {!!(formData.cronExpression ?? '') && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Presets</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'Every 1 min', expr: '* * * * *' },
                    { label: 'Every 5 min', expr: '*/5 * * * *' },
                    { label: 'Every 15 min', expr: '*/15 * * * *' },
                    { label: 'Every 30 min', expr: '*/30 * * * *' },
                    { label: 'Every hour', expr: '0 * * * *' },
                    { label: 'Daily 9am UTC', expr: '0 9 * * *' },
                    { label: 'Weekdays 9am UTC', expr: '0 9 * * 1-5' },
                  ].map(({ label, expr }) => (
                    <button
                      key={expr}
                      type="button"
                      onClick={() => onSetFormData({ ...formData, cronExpression: expr })}
                      className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                        formData.cronExpression === expr
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-border bg-surface text-text-secondary hover:border-accent/50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Expression (5-field, UTC)</label>
                <input
                  type="text"
                  value={formData.cronExpression ?? ''}
                  onChange={(e) => onSetFormData({ ...formData, cronExpression: e.target.value })}
                  placeholder="*/5 * * * *"
                  className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <p className="text-xs text-text-muted mt-1.5">
                  Format: <code className="font-mono bg-surface-secondary px-1 rounded">minute hour day month weekday</code>.
                  When set, this overrides the check interval above.
                </p>
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
