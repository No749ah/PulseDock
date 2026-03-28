"use client";

import React, { useState } from "react";
import {
  X,
  Play,
  TestTube2,
  Rocket,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Check,
  XCircle,
  ArrowRight,
  Shield,
  Clock,
  Globe,
  ExternalLink,
} from "lucide-react";
import { Button } from "../../components/Button";
import { api } from "../../../lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlaygroundTimings {
  dnsMs?: number;
  tcpMs?: number;
  tlsMs?: number;
  ttfbMs?: number;
  downloadMs?: number;
}

interface PlaygroundSslInfo {
  daysRemaining: number;
  issuer: string;
  expiresAt: string;
  valid: boolean;
}

interface PlaygroundResult {
  ok: boolean;
  statusCode: number;
  latencyMs: number;
  timings?: PlaygroundTimings;
  redirectChain?: string[];
  responseHeaders: Record<string, string>;
  bodyExcerpt: string;
  bodyJsonPathResult?: string;
  contentType?: string;
  sslInfo?: PlaygroundSslInfo;
  assertions: {
    statusOk?: boolean;
    bodyContainsOk?: boolean;
    bodyJsonPathOk?: boolean;
  };
  error?: string;
}

interface PlaygroundModalProps {
  onClose: () => void;
  onCreateMonitor?: (prefill: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    expectedStatus?: number;
    bodyContains?: string;
    bodyJsonPath?: string;
    bodyJsonPathExpected?: string;
  }) => void;
}

// ─── HTTP Methods ────────────────────────────────────────────────────────────

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

// ─── Component ───────────────────────────────────────────────────────────────

export function PlaygroundModal({ onClose, onCreateMonitor }: PlaygroundModalProps) {
  // Left panel state
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<string>("GET");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAssertions, setShowAssertions] = useState(false);
  const [headerRows, setHeaderRows] = useState<Array<{ key: string; value: string }>>([]);
  const [requestBody, setRequestBody] = useState("");
  const [timeoutMs, setTimeoutMs] = useState(10000);
  const [followRedirects, setFollowRedirects] = useState(true);
  const [checkSsl, setCheckSsl] = useState(true);
  const [expectedStatus, setExpectedStatus] = useState("");
  const [bodyContains, setBodyContains] = useState("");
  const [jsonPath, setJsonPath] = useState("");
  const [jsonPathExpected, setJsonPathExpected] = useState("");

  // Right panel state
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasBody = ["POST", "PUT", "PATCH"].includes(method);

  const handleRun = async () => {
    if (!url.trim() || running) return;
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const headers: Record<string, string> = {};
      for (const row of headerRows) {
        if (row.key.trim()) headers[row.key.trim()] = row.value;
      }

      const payload: Record<string, unknown> = {
        url: url.trim(),
        method,
        timeoutMs,
        followRedirects,
        checkSsl,
      };
      if (Object.keys(headers).length > 0) payload.headers = headers;
      if (hasBody && requestBody.trim()) payload.body = requestBody;
      if (expectedStatus) payload.expectedStatus = parseInt(expectedStatus, 10);
      if (bodyContains.trim()) payload.bodyContains = bodyContains;
      if (jsonPath.trim()) payload.bodyJsonPath = jsonPath;
      if (jsonPathExpected.trim()) payload.bodyJsonPathExpected = jsonPathExpected;

      const res = await api<PlaygroundResult>("/v1/monitors/playground", undefined, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setRunning(false);
    }
  };

  const handleCreateMonitor = () => {
    if (!onCreateMonitor) return;
    const headers: Record<string, string> = {};
    for (const row of headerRows) {
      if (row.key.trim()) headers[row.key.trim()] = row.value;
    }
    onCreateMonitor({
      url: url.trim(),
      method,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: hasBody && requestBody.trim() ? requestBody : undefined,
      expectedStatus: expectedStatus ? parseInt(expectedStatus, 10) : undefined,
      bodyContains: bodyContains.trim() || undefined,
      bodyJsonPath: jsonPath.trim() || undefined,
      bodyJsonPathExpected: jsonPathExpected.trim() || undefined,
    });
  };

  // ─── Rendering helpers ─────────────────────────────────────────────────────

  const statusColor = (code: number) => {
    if (code >= 200 && code < 300) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    if (code >= 300 && code < 400) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    return "bg-red-500/20 text-red-400 border-red-500/30";
  };

  const hasAssertions = result && (result.assertions.statusOk !== undefined || result.assertions.bodyContainsOk !== undefined || result.assertions.bodyJsonPathOk !== undefined);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700/50 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-500/10">
              <TestTube2 className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Check Playground</h2>
              <p className="text-xs text-zinc-500">Test any endpoint before creating a monitor</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Body: 2-panel layout */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* ─── Left Panel: Inputs ──────────────────────────────────────── */}
          <div className="w-[45%] border-r border-zinc-800 p-5 overflow-y-auto space-y-4">
            {/* URL */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.example.com/health"
                className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/50"
                onKeyDown={(e) => { if (e.key === "Enter") handleRun(); }}
              />
            </div>

            {/* Method pills */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Method</label>
              <div className="flex gap-1.5">
                {METHODS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      method === m
                        ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                        : "bg-zinc-800 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-750 hover:text-zinc-300"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced section */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors w-full"
            >
              {showAdvanced ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Advanced
            </button>
            {showAdvanced && (
              <div className="space-y-3 pl-1">
                {/* Headers */}
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Request Headers</label>
                  {headerRows.map((row, i) => (
                    <div key={i} className="flex gap-2 mb-1.5">
                      <input
                        value={row.key}
                        onChange={(e) => {
                          const next = [...headerRows];
                          next[i] = { ...next[i], key: e.target.value };
                          setHeaderRows(next);
                        }}
                        placeholder="Key"
                        className="flex-1 px-2 py-1.5 text-xs rounded bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder:text-zinc-600"
                      />
                      <input
                        value={row.value}
                        onChange={(e) => {
                          const next = [...headerRows];
                          next[i] = { ...next[i], value: e.target.value };
                          setHeaderRows(next);
                        }}
                        placeholder="Value"
                        className="flex-1 px-2 py-1.5 text-xs rounded bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder:text-zinc-600"
                      />
                      <button onClick={() => setHeaderRows(headerRows.filter((_, j) => j !== i))} className="p-1 text-zinc-500 hover:text-red-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setHeaderRows([...headerRows, { key: "", value: "" }])} className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300">
                    <Plus className="w-3 h-3" /> Add header
                  </button>
                </div>

                {/* Request body */}
                {hasBody && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Request Body</label>
                    <textarea
                      value={requestBody}
                      onChange={(e) => setRequestBody(e.target.value)}
                      placeholder='{"key": "value"}'
                      rows={3}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder:text-zinc-600 font-mono resize-y"
                    />
                  </div>
                )}

                {/* Timeout */}
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Timeout (ms)</label>
                  <input
                    type="number"
                    value={timeoutMs}
                    onChange={(e) => setTimeoutMs(Math.min(30000, Math.max(500, parseInt(e.target.value) || 10000)))}
                    className="w-32 px-2 py-1.5 text-xs rounded bg-zinc-800 border border-zinc-700 text-zinc-200"
                  />
                </div>

                {/* Toggles */}
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={followRedirects} onChange={(e) => setFollowRedirects(e.target.checked)} className="rounded bg-zinc-800 border-zinc-600" />
                    Follow redirects
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={checkSsl} onChange={(e) => setCheckSsl(e.target.checked)} className="rounded bg-zinc-800 border-zinc-600" />
                    Check SSL
                  </label>
                </div>
              </div>
            )}

            {/* Assertions section */}
            <button
              onClick={() => setShowAssertions(!showAssertions)}
              className="flex items-center gap-2 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors w-full"
            >
              {showAssertions ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Assertions
            </button>
            {showAssertions && (
              <div className="space-y-3 pl-1">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Expected Status</label>
                  <input
                    type="number"
                    value={expectedStatus}
                    onChange={(e) => setExpectedStatus(e.target.value)}
                    placeholder="200"
                    className="w-32 px-2 py-1.5 text-xs rounded bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder:text-zinc-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Body Contains</label>
                  <input
                    type="text"
                    value={bodyContains}
                    onChange={(e) => setBodyContains(e.target.value)}
                    placeholder='e.g. "status":"ok"'
                    className="w-full px-2 py-1.5 text-xs rounded bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder:text-zinc-600"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">JSON Path</label>
                    <input
                      type="text"
                      value={jsonPath}
                      onChange={(e) => setJsonPath(e.target.value)}
                      placeholder="$.status"
                      className="w-full px-2 py-1.5 text-xs rounded bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder:text-zinc-600 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Expected Value</label>
                    <input
                      type="text"
                      value={jsonPathExpected}
                      onChange={(e) => setJsonPathExpected(e.target.value)}
                      placeholder="ok"
                      className="w-full px-2 py-1.5 text-xs rounded bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder:text-zinc-600"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-2 pt-2">
              <Button
                onClick={handleRun}
                disabled={!url.trim() || running}
                className="flex items-center justify-center gap-2"
              >
                {running ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {running ? "Running..." : "Run Check"}
              </Button>
              {result && result.ok && onCreateMonitor && (
                <Button variant="secondary" onClick={handleCreateMonitor} className="flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" />
                  Create Monitor from this
                </Button>
              )}
            </div>
          </div>

          {/* ─── Right Panel: Results ─────────────────────────────────────── */}
          <div className="flex-1 p-5 overflow-y-auto">
            {/* Empty state */}
            {!running && !result && !error && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-60">
                <Rocket className="w-12 h-12 text-zinc-600" />
                <p className="text-sm text-zinc-400 font-medium">Run a check to see results here</p>
                <p className="text-xs text-zinc-600">Test your endpoint before creating a monitor</p>
              </div>
            )}

            {/* Loading state */}
            {running && (
              <div className="space-y-4 animate-pulse">
                <div className="h-16 bg-zinc-800 rounded-xl" />
                <div className="h-10 bg-zinc-800 rounded-lg w-1/3" />
                <div className="h-24 bg-zinc-800 rounded-lg" />
                <div className="h-32 bg-zinc-800 rounded-lg" />
              </div>
            )}

            {/* Error state */}
            {error && !running && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <div className="flex items-center gap-2 mb-1 font-medium">
                  <XCircle className="w-4 h-4" /> Request Failed
                </div>
                <p className="text-xs text-red-400/80">{error}</p>
              </div>
            )}

            {/* Result state */}
            {result && !running && (
              <div className="space-y-4">
                {/* Status banner */}
                <div className={`flex items-center justify-between p-4 rounded-xl border ${
                  result.error
                    ? "bg-red-500/10 border-red-500/20"
                    : result.ok
                      ? "bg-emerald-500/10 border-emerald-500/20"
                      : "bg-amber-500/10 border-amber-500/20"
                }`}>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1.5 rounded-lg text-lg font-bold border ${
                      result.error ? "bg-red-500/20 text-red-400 border-red-500/30" : statusColor(result.statusCode)
                    }`}>
                      {result.error ? "ERR" : result.statusCode}
                    </span>
                    <div>
                      <span className={`text-sm font-semibold ${result.error ? "text-red-400" : result.ok ? "text-emerald-400" : "text-amber-400"}`}>
                        {result.error ? "Error" : result.ok ? "Pass" : "Fail"}
                      </span>
                      {result.error && <p className="text-xs text-red-400/70 mt-0.5">{result.error}</p>}
                    </div>
                  </div>
                  {/* Latency */}
                  {!result.error && (
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 text-zinc-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-2xl font-bold text-zinc-100">{result.latencyMs}</span>
                        <span className="text-xs text-zinc-500">ms</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Timing waterfall */}
                {result.timings && !result.error && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Timing Breakdown</h4>
                    <div className="space-y-1">
                      {(["dnsMs", "tcpMs", "tlsMs", "ttfbMs", "downloadMs"] as const).map((key) => {
                        const val = result.timings?.[key];
                        if (val === undefined || val === null) return null;
                        const labels: Record<string, string> = { dnsMs: "DNS", tcpMs: "TCP", tlsMs: "TLS", ttfbMs: "TTFB", downloadMs: "Download" };
                        const colors: Record<string, string> = { dnsMs: "bg-blue-500", tcpMs: "bg-cyan-500", tlsMs: "bg-violet-500", ttfbMs: "bg-amber-500", downloadMs: "bg-emerald-500" };
                        const maxMs = Math.max(
                          result.timings?.dnsMs ?? 0,
                          result.timings?.tcpMs ?? 0,
                          result.timings?.tlsMs ?? 0,
                          result.timings?.ttfbMs ?? 0,
                          result.timings?.downloadMs ?? 0,
                          1,
                        );
                        const pct = Math.max(4, (val / maxMs) * 100);
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <span className="text-[11px] text-zinc-500 w-16 text-right font-mono">{labels[key]}</span>
                            <div className="flex-1 h-5 bg-zinc-800/50 rounded-full overflow-hidden">
                              <div className={`h-full ${colors[key]} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[11px] text-zinc-400 w-14 font-mono">{val}ms</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Assertions */}
                {hasAssertions && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Assertions</h4>
                    <div className="space-y-1">
                      {result.assertions.statusOk !== undefined && (
                        <AssertionRow ok={result.assertions.statusOk} label="Status code" actual={String(result.statusCode)} expected={expectedStatus} />
                      )}
                      {result.assertions.bodyContainsOk !== undefined && (
                        <AssertionRow ok={result.assertions.bodyContainsOk} label="Body contains" actual={result.assertions.bodyContainsOk ? "Found" : "Not found"} expected={bodyContains} />
                      )}
                      {result.assertions.bodyJsonPathOk !== undefined && (
                        <AssertionRow ok={result.assertions.bodyJsonPathOk} label={`JSONPath ${jsonPath}`} actual={result.bodyJsonPathResult ?? "undefined"} expected={jsonPathExpected} />
                      )}
                    </div>
                  </div>
                )}

                {/* SSL Info */}
                {result.sslInfo && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" /> SSL Certificate
                    </h4>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-2.5 bg-zinc-800/50 rounded-lg">
                        <div className="text-[10px] text-zinc-500 mb-0.5">Days Remaining</div>
                        <div className={`text-sm font-bold ${result.sslInfo.daysRemaining > 30 ? "text-emerald-400" : result.sslInfo.daysRemaining > 7 ? "text-amber-400" : "text-red-400"}`}>
                          {result.sslInfo.daysRemaining}
                        </div>
                      </div>
                      <div className="p-2.5 bg-zinc-800/50 rounded-lg">
                        <div className="text-[10px] text-zinc-500 mb-0.5">Expires</div>
                        <div className="text-sm text-zinc-300">{result.sslInfo.expiresAt}</div>
                      </div>
                      <div className="p-2.5 bg-zinc-800/50 rounded-lg">
                        <div className="text-[10px] text-zinc-500 mb-0.5">Issuer</div>
                        <div className="text-sm text-zinc-300 truncate" title={result.sslInfo.issuer}>{result.sslInfo.issuer}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Redirect Chain */}
                {result.redirectChain && result.redirectChain.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide flex items-center gap-1.5">
                      <ExternalLink className="w-3.5 h-3.5" /> Redirect Chain ({result.redirectChain.length} hops)
                    </h4>
                    <div className="space-y-1 pl-1">
                      {result.redirectChain.map((hop, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <ArrowRight className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                          <span className="text-zinc-400 font-mono truncate">{hop}</span>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 text-xs">
                        <ArrowRight className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                        <span className="text-emerald-400 font-mono truncate">{url}</span>
                        <span className="text-zinc-600">(final)</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Response Headers */}
                {!result.error && (
                  <CollapsibleSection title="Response Headers" defaultOpen={false}>
                    <div className="space-y-0.5">
                      {Object.entries(result.responseHeaders).map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-[11px] font-mono py-0.5">
                          <span className="text-violet-400 flex-shrink-0">{k}:</span>
                          <span className="text-zinc-400 break-all">{v}</span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>
                )}

                {/* Body Preview */}
                {result.bodyExcerpt && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                      Body Preview {result.contentType && <span className="text-zinc-600 normal-case">({result.contentType})</span>}
                    </h4>
                    <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-[11px] text-zinc-300 font-mono overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {result.bodyExcerpt}
                    </pre>
                  </div>
                )}

                {/* Create Monitor CTA */}
                {result.ok && onCreateMonitor && (
                  <div className="pt-2">
                    <Button variant="secondary" onClick={handleCreateMonitor} className="w-full flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4" />
                      Create Monitor from this
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function AssertionRow({ ok, label, actual, expected }: { ok: boolean; label: string; actual: string; expected: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${ok ? "bg-emerald-500/5 border border-emerald-500/10" : "bg-red-500/5 border border-red-500/10"}`}>
      {ok ? <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
      <span className="text-zinc-300 font-medium">{label}</span>
      <span className="text-zinc-600 ml-auto">expected {expected}</span>
      <span className="text-zinc-600">→</span>
      <span className={ok ? "text-emerald-400" : "text-red-400"}>{actual}</span>
    </div>
  );
}

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-1.5">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-wide">
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {title}
      </button>
      {open && children}
    </div>
  );
}
