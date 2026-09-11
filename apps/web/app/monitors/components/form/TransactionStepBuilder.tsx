"use client";

import React, { useState, useCallback } from "react";
import type { TransactionStep, TransactionStepAssertion } from "../../types";

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

// ── New step factory ──────────────────────────────────────────────────────────

function newStep(index: number): TransactionStep {
  return { id: crypto.randomUUID(), name: `Step ${index + 1}`, method: "GET", url: "", headers: {}, assertions: [] };
}

// ── Transaction Step Builder ──────────────────────────────────────────────────

interface TransactionStepBuilderProps {
  steps: TransactionStep[];
  onChange: (steps: TransactionStep[]) => void;
  inputClass: string;
}

export function TransactionStepBuilder({ steps, onChange, inputClass }: TransactionStepBuilderProps) {
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
