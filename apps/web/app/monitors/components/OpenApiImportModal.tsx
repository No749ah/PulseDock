'use client';

import { useState } from 'react';
import { X, FileJson, Globe, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Plus } from 'lucide-react';
import { api } from '../../../lib/api';
import { getUser } from '../../../components/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Suggestion {
  key: string;
  name: string;
  method: string;
  path: string;
  url: string;
  expectedStatus: number;
  summary?: string;
  tags?: string[];
}

interface PreviewResponse {
  suggestions: Suggestion[];
}

interface ImportResponse {
  created: number;
  monitors: { id: string; name: string }[];
}

interface Props {
  onClose: () => void;
  onImported: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { METHOD_COLORS } from './openApiImportHelpers';

const inputClass =
  'w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm';

// ─── Component ────────────────────────────────────────────────────────────────

export function OpenApiImportModal({ onClose, onImported }: Props) {
  const [step, setStep] = useState<'input' | 'preview' | 'done'>('input');
  const [specUrl, setSpecUrl] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [specJson, setSpecJson] = useState('');
  const [intervalSec, setIntervalSec] = useState(60);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);

  // ── Step 1: Preview ────────────────────────────────────────────────────────

  const handlePreview = async () => {
    if (!baseUrl.trim()) { setError('Base URL is required'); return; }
    if (!specUrl.trim() && !specJson.trim()) { setError('Provide a spec URL or paste JSON'); return; }
    setError(null);
    setLoading(true);
    try {
      const user = await getUser();
      const body: Record<string, unknown> = { baseUrl: baseUrl.trim() };
      if (specUrl.trim()) body.url = specUrl.trim();
      if (specJson.trim()) body.specJson = specJson.trim();
      const result = await api<PreviewResponse>('/v1/monitors/import-from-openapi/preview', user?.id, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setSuggestions(result.suggestions);
      setSelected(new Set(result.suggestions.map((s) => s.key)));
      setStep('preview');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to parse spec');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Import ─────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (selected.size === 0) { setError('Select at least one endpoint'); return; }
    setError(null);
    setLoading(true);
    try {
      const user = await getUser();
      const body: Record<string, unknown> = {
        baseUrl: baseUrl.trim(),
        selectedPaths: Array.from(selected),
        intervalSec,
      };
      if (specUrl.trim()) body.url = specUrl.trim();
      if (specJson.trim()) body.specJson = specJson.trim();
      const result = await api<ImportResponse>('/v1/monitors/import-from-openapi', user?.id, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setImportResult(result);
      setStep('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Toggle selection ───────────────────────────────────────────────────────

  const toggleAll = () => {
    if (selected.size === suggestions.length) setSelected(new Set());
    else setSelected(new Set(suggestions.map((s) => s.key)));
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <FileJson className="w-5 h-5 text-accent" />
            <div>
              <h2 className="text-base font-semibold text-text-primary">Import from OpenAPI / Swagger</h2>
              <p className="text-xs text-text-secondary mt-0.5">
                {step === 'input' && 'Provide a spec URL or paste JSON to preview endpoints'}
                {step === 'preview' && `${suggestions.length} endpoints found — select which to import`}
                {step === 'done' && 'Import complete'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* ── Step: Input ── */}
          {step === 'input' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  OpenAPI / Swagger spec URL
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                  <input
                    type="url"
                    value={specUrl}
                    onChange={(e) => setSpecUrl(e.target.value)}
                    placeholder="https://api.example.com/openapi.json"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </div>

              <button
                onClick={() => setShowPaste(!showPaste)}
                className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors"
              >
                {showPaste ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {showPaste ? 'Hide JSON paste' : 'Or paste JSON directly'}
              </button>

              {showPaste && (
                <textarea
                  value={specJson}
                  onChange={(e) => setSpecJson(e.target.value)}
                  placeholder={'{\n  "openapi": "3.0.0",\n  "paths": { ... }\n}'}
                  rows={6}
                  className={`${inputClass} font-mono text-xs`}
                />
              )}

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Base URL for monitors <span className="text-danger">*</span>
                </label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com"
                  className={inputClass}
                />
                <p className="text-xs text-text-muted mt-1">All monitor URLs will be built as: Base URL + path</p>
              </div>
            </div>
          )}

          {/* ── Step: Preview ── */}
          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-text-secondary">
                  {selected.size} of {suggestions.length} selected
                </label>
                <button onClick={toggleAll} className="text-xs text-accent hover:text-accent/80 transition-colors">
                  {selected.size === suggestions.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                {suggestions.map((s) => (
                  <label key={s.key} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(s.key)}
                      onChange={() => toggle(s.key)}
                      className="accent-accent w-4 h-4 shrink-0"
                    />
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${METHOD_COLORS[s.method] ?? 'bg-surface text-text-secondary border-border'}`}>
                      {s.method}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{s.name}</p>
                      <p className="text-xs text-text-secondary font-mono truncate">{s.path}</p>
                    </div>
                    <span className="text-xs text-text-muted shrink-0">{s.expectedStatus}</span>
                  </label>
                ))}
                {suggestions.length === 0 && (
                  <div className="p-6 text-center text-sm text-text-secondary">
                    No endpoints found in spec
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Check Interval</label>
                <select
                  value={intervalSec}
                  onChange={(e) => setIntervalSec(Number(e.target.value))}
                  className={inputClass}
                >
                  <option value={30}>Every 30 seconds</option>
                  <option value={60}>Every 1 minute</option>
                  <option value={300}>Every 5 minutes</option>
                  <option value={600}>Every 10 minutes</option>
                </select>
              </div>
            </div>
          )}

          {/* ── Step: Done ── */}
          {step === 'done' && importResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-success/10 border border-success/30 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                <p className="text-sm text-success font-medium">
                  Successfully created {importResult.created} monitor{importResult.created !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="space-y-1.5">
                {importResult.monitors.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 text-sm text-text-secondary">
                    <Plus className="w-3.5 h-3.5 text-success" />
                    {m.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
          {step === 'done' ? (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
                Close
              </button>
              <button
                onClick={() => { onImported(); onClose(); }}
                className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
              >
                View Monitors
              </button>
            </>
          ) : step === 'preview' ? (
            <>
              <button onClick={() => setStep('input')} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={loading || selected.size === 0}
                className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading && <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />}
                Import Selected ({selected.size})
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
                Cancel
              </button>
              <button
                onClick={handlePreview}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading && <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />}
                Preview Endpoints
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
