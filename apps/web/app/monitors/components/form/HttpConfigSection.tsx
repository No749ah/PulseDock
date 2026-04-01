"use client";

import React from "react";
import { inputClass } from "../../constants";
import type { MonitorFormData } from "../../types";

// Extended form data with HTTP-specific fields
type HttpFormData = MonitorFormData & {
  httpMethod?: string;
  authType?: string;
  authUser?: string;
  authPassword?: string;
  authToken?: string;
  authApiKeyName?: string;
  authApiKeyValue?: string;
  authApiKeyIn?: string;
  preAuthUrl?: string;
  preAuthBody?: string;
  preAuthExtractCookie?: string;
  preAuthExtractToken?: string;
  requestHeaders?: string;
  requestBody?: string;
  expectedStatus?: number;
  bodyContains?: string;
  bodyJsonPath?: string;
  bodyJsonPathExpected?: string;
  responseTimeThresholdMs?: number;
  minResponseBodyBytes?: number;
  maxResponseBodyBytes?: number;
  assertResponseHeader?: string;
  assertResponseHeaderValue?: string;
  checkSecurityHeaders?: boolean;
  detectContentChanges?: boolean;
  trackedHeaders?: string;
  headerAssertions?: Array<{ header: string; op: string; value?: string }>;
  followRedirects?: boolean;
  maxRedirects?: number;
};

interface HttpConfigSectionProps {
  formData: HttpFormData;
  onSetFormData: (data: HttpFormData) => void;
}

export function HttpConfigSection({ formData, onSetFormData }: HttpConfigSectionProps) {
  const fd = formData as HttpFormData;
  const assertions: Array<{ header: string; op: string; value?: string }> = fd.headerAssertions ?? [];
  const setAssertions = (next: Array<{ header: string; op: string; value?: string }>) =>
    onSetFormData({ ...fd, headerAssertions: next });

  const SUGGESTIONS = [
    { header: "strict-transport-security", op: "exists" },
    { header: "x-frame-options", op: "exists" },
    { header: "content-security-policy", op: "exists" },
    { header: "x-content-type-options", op: "equals", value: "nosniff" },
  ];

  const assertionInputClass = "w-full px-2 py-1.5 text-xs bg-surface border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-accent";

  return (
    <>
      {/* HTTP Method */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">HTTP Method</label>
        <select
          value={fd.httpMethod ?? "GET"}
          onChange={(e) => onSetFormData({ ...fd, httpMethod: e.target.value })}
          className={inputClass}
        >
          {["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* Authentication */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Authentication</label>
        <select
          value={fd.authType ?? "none"}
          onChange={(e) => onSetFormData({ ...fd, authType: e.target.value })}
          className={inputClass}
        >
          <option value="none">None</option>
          <option value="basic">Basic Auth (username + password)</option>
          <option value="bearer">Bearer Token</option>
          <option value="api-key">API Key</option>
        </select>
      </div>

      {fd.authType === "basic" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Username</label>
            <input type="text" value={fd.authUser ?? ""} onChange={(e) => onSetFormData({ ...fd, authUser: e.target.value })} className={inputClass} placeholder="username" autoComplete="off" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Password</label>
            <input type="password" value={fd.authPassword ?? ""} onChange={(e) => onSetFormData({ ...fd, authPassword: e.target.value })} className={inputClass} placeholder="••••••••" autoComplete="new-password" />
          </div>
        </div>
      )}

      {fd.authType === "bearer" && (
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Bearer Token</label>
          <input type="password" value={fd.authToken ?? ""} onChange={(e) => onSetFormData({ ...fd, authToken: e.target.value })} className={inputClass} placeholder="eyJhbGciOiJIUzI1NiIs..." autoComplete="off" />
          <p className="mt-1 text-xs text-text-secondary">Sent as <code className="bg-surface-2 px-1 rounded">Authorization: Bearer &lt;token&gt;</code></p>
        </div>
      )}

      {fd.authType === "api-key" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Key Name</label>
              <input type="text" value={fd.authApiKeyName ?? ""} onChange={(e) => onSetFormData({ ...fd, authApiKeyName: e.target.value })} className={inputClass} placeholder="X-API-Key" autoComplete="off" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Key Value</label>
              <input type="password" value={fd.authApiKeyValue ?? ""} onChange={(e) => onSetFormData({ ...fd, authApiKeyValue: e.target.value })} className={inputClass} placeholder="your-secret-api-key" autoComplete="off" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Send As</label>
            <select value={fd.authApiKeyIn ?? "header"} onChange={(e) => onSetFormData({ ...fd, authApiKeyIn: e.target.value })} className={inputClass}>
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
          <input type="text" value={fd.preAuthUrl ?? ""} onChange={(e) => onSetFormData({ ...fd, preAuthUrl: e.target.value })} className={inputClass} placeholder="https://app.example.com/api/auth/login" autoComplete="off" />
        </div>
        {fd.preAuthUrl?.trim() && (
          <>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Login Payload <span className="text-[10px] text-text-muted">(JSON body)</span></label>
              <textarea rows={2} value={fd.preAuthBody ?? ""} onChange={(e) => onSetFormData({ ...fd, preAuthBody: e.target.value })} className={`${inputClass} font-mono text-xs resize-y`} placeholder={'{"email":"monitor@example.com","password":"secret"}'} spellCheck={false} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Extract Cookie <span className="text-[10px] text-text-muted">(name)</span></label>
                <input type="text" value={fd.preAuthExtractCookie ?? ""} onChange={(e) => onSetFormData({ ...fd, preAuthExtractCookie: e.target.value })} className={inputClass} placeholder="session" autoComplete="off" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Extract Token <span className="text-[10px] text-text-muted">(JSON path)</span></label>
                <input type="text" value={fd.preAuthExtractToken ?? ""} onChange={(e) => onSetFormData({ ...fd, preAuthExtractToken: e.target.value })} className={inputClass} placeholder="data.accessToken" autoComplete="off" />
              </div>
            </div>
            <p className="text-[10px] text-text-muted">Set either <em>Extract Cookie</em> (cookie name from Set-Cookie) or <em>Extract Token</em> (JSON dot-path to bearer token) — not both.</p>
          </>
        )}
      </div>

      {/* Request Headers */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Request Headers <span className="text-xs text-text-muted">(optional)</span>
        </label>
        <textarea rows={3} value={fd.requestHeaders ?? ""} onChange={(e) => onSetFormData({ ...fd, requestHeaders: e.target.value })} className={`${inputClass} font-mono text-xs resize-y`} placeholder={"Content-Type: application/json\nX-Custom-Header: value"} spellCheck={false} />
        <p className="mt-1 text-xs text-text-secondary">One header per line: <code className="bg-surface-2 px-1 rounded">Name: Value</code>. Added to every request.</p>
      </div>

      {/* Request Body */}
      {["POST", "PUT", "PATCH"].includes(fd.httpMethod ?? "GET") && (
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Request Body <span className="text-xs text-text-muted">(optional)</span>
          </label>
          <textarea rows={3} value={fd.requestBody ?? ""} onChange={(e) => onSetFormData({ ...fd, requestBody: e.target.value })} className={`${inputClass} font-mono text-xs resize-y`} placeholder={'{"key": "value"}'} spellCheck={false} />
          <p className="mt-1 text-xs text-text-secondary">Raw request body sent with POST/PUT/PATCH requests. Add <code className="bg-surface-2 px-1 rounded">Content-Type</code> header above if needed.</p>
        </div>
      )}

      {/* Expected Status Code */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Expected status code <span className="text-xs text-text-muted">(optional)</span>
        </label>
        <input
          type="number" min="100" max="599"
          value={fd.expectedStatus ?? ""}
          onChange={(e) => onSetFormData({ ...fd, expectedStatus: e.target.value === "" ? undefined : parseInt(e.target.value) })}
          className={inputClass} placeholder="Default: any 2xx"
        />
        <p className="mt-1 text-xs text-text-secondary">Leave blank to accept any 2xx response. Set to 200, 201, etc. to require an exact status.</p>
      </div>

      {/* Body Contains */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Body must contain <span className="text-xs text-text-muted">(optional)</span>
        </label>
        <input type="text" value={fd.bodyContains ?? ""} onChange={(e) => onSetFormData({ ...fd, bodyContains: e.target.value })} className={inputClass} placeholder='e.g. "ok" or "status\":\"healthy"' maxLength={500} />
        <p className="mt-1 text-xs text-text-secondary">If set, the response body must contain this string (case-insensitive). Leave blank to skip body check.</p>
      </div>

      {/* JSON Path Assertion */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          JSON path assertion <span className="text-xs text-text-muted">(optional)</span>
        </label>
        <div className="flex gap-2">
          <input type="text" value={fd.bodyJsonPath ?? ""} onChange={(e) => onSetFormData({ ...fd, bodyJsonPath: e.target.value })} className={inputClass + " flex-1"} placeholder="e.g. status or data.health" maxLength={200} aria-label="JSON path" />
          <input type="text" value={fd.bodyJsonPathExpected ?? ""} onChange={(e) => onSetFormData({ ...fd, bodyJsonPathExpected: e.target.value })} className={inputClass + " w-36"} placeholder="Expected value" maxLength={200} aria-label="Expected value" />
        </div>
        <p className="mt-1 text-xs text-text-secondary">Assert a JSON field in the response (dot-notation, e.g. <code className="bg-surface px-1 rounded">data.status</code>). Optional expected value — leave blank for a truthy check. Requires JSON response.</p>
      </div>

      {/* Response Time Threshold */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Response time threshold (ms) <span className="text-xs text-text-muted">(optional)</span>
        </label>
        <input
          type="number" min="50" max="60000"
          value={fd.responseTimeThresholdMs ?? ""}
          onChange={(e) => onSetFormData({ ...fd, responseTimeThresholdMs: e.target.value === "" ? undefined : parseInt(e.target.value) })}
          className={inputClass} placeholder="e.g. 2000"
        />
        <p className="mt-1 text-xs text-text-secondary">Mark as <span className="text-warning font-medium">degraded</span> if response takes longer than this many milliseconds. Leave blank to disable.</p>
      </div>

      {/* Response Size Bounds */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Min response size (bytes) <span className="text-xs text-text-muted">(optional)</span></label>
          <input type="number" min="0" value={fd.minResponseBodyBytes ?? ""} onChange={(e) => onSetFormData({ ...fd, minResponseBodyBytes: e.target.value === "" ? undefined : parseInt(e.target.value) })} className={inputClass} placeholder="e.g. 500" />
          <p className="mt-1 text-xs text-text-secondary">Alert if body smaller than this.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Max response size (bytes) <span className="text-xs text-text-muted">(optional)</span></label>
          <input type="number" min="0" value={fd.maxResponseBodyBytes ?? ""} onChange={(e) => onSetFormData({ ...fd, maxResponseBodyBytes: e.target.value === "" ? undefined : parseInt(e.target.value) })} className={inputClass} placeholder="e.g. 5000000" />
          <p className="mt-1 text-xs text-text-secondary">Alert if body larger than this.</p>
        </div>
      </div>

      {/* Response Header Assertion (single) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Assert header name <span className="text-xs text-text-muted">(optional)</span></label>
          <input type="text" value={fd.assertResponseHeader ?? ""} onChange={(e) => onSetFormData({ ...fd, assertResponseHeader: e.target.value || undefined })} className={inputClass} placeholder="e.g. content-type" />
          <p className="mt-1 text-xs text-text-secondary">Alert if this header is missing.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Assert header value <span className="text-xs text-text-muted">(optional)</span></label>
          <input type="text" value={fd.assertResponseHeaderValue ?? ""} onChange={(e) => onSetFormData({ ...fd, assertResponseHeaderValue: e.target.value || undefined })} className={inputClass} placeholder="e.g. application/json" disabled={!fd.assertResponseHeader} />
          <p className="mt-1 text-xs text-text-secondary">Alert if header value doesn&apos;t contain this.</p>
        </div>
      </div>

      {/* Security Headers Audit */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-2 border border-border">
        <input type="checkbox" id="checkSecurityHeaders" checked={fd.checkSecurityHeaders ?? false} onChange={(e) => onSetFormData({ ...fd, checkSecurityHeaders: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent cursor-pointer" />
        <label htmlFor="checkSecurityHeaders" className="cursor-pointer select-none">
          <span className="text-sm font-medium text-text-primary flex items-center gap-1.5">🔒 Audit security headers</span>
          <span className="text-xs text-text-secondary mt-0.5 block">Checks for HSTS, CSP, X-Frame-Options, X-Content-Type-Options and more. Grades the response A–F and stores results per run.</span>
        </label>
      </div>

      {/* Content Change Detection */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-2 border border-border">
        <input type="checkbox" id="detectContentChanges" checked={fd.detectContentChanges ?? false} onChange={(e) => onSetFormData({ ...fd, detectContentChanges: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent cursor-pointer" />
        <label htmlFor="detectContentChanges" className="cursor-pointer select-none">
          <span className="text-sm font-medium text-text-primary flex items-center gap-1.5">📄 Detect content changes</span>
          <span className="text-xs text-text-secondary mt-0.5 block">Alerts when the page content changes from the established baseline. Useful for detecting deployments, defacements, or unexpected changes.</span>
        </label>
      </div>

      {/* Response Header Tracking */}
      <div className="flex flex-col gap-2 p-3 rounded-lg bg-surface-2 border border-border">
        <div className="flex items-start gap-3">
          <input type="checkbox" id="enableHeaderTracking" checked={!!fd.trackedHeaders} onChange={(e) => onSetFormData({ ...fd, trackedHeaders: e.target.checked ? "x-frame-options,content-security-policy,server" : "" })} className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent cursor-pointer" />
          <label htmlFor="enableHeaderTracking" className="cursor-pointer select-none">
            <span className="text-sm font-medium text-text-primary flex items-center gap-1.5">📋 Track response header changes</span>
            <span className="text-xs text-text-secondary mt-0.5 block">Alerts yellow when specified response headers change from baseline. Useful for detecting security header regressions, CDN configuration changes, or server version updates.</span>
          </label>
        </div>
        {!!fd.trackedHeaders && (
          <div className="mt-1 ml-7">
            <label htmlFor="trackedHeaders" className="text-xs text-text-secondary block mb-1">Header names to track (comma-separated, case-insensitive):</label>
            <input id="trackedHeaders" type="text" value={fd.trackedHeaders ?? ""} onChange={(e) => onSetFormData({ ...fd, trackedHeaders: e.target.value })} placeholder="e.g. x-frame-options,content-security-policy,server" className="w-full px-2 py-1.5 text-xs bg-surface border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
            <p className="text-xs text-text-secondary mt-1">Common: <code className="text-accent">server</code>, <code className="text-accent">x-frame-options</code>, <code className="text-accent">content-security-policy</code>, <code className="text-accent">strict-transport-security</code>, <code className="text-accent">x-powered-by</code></p>
          </div>
        )}
      </div>

      {/* Header Assertions */}
      <div className="flex flex-col gap-2 p-3 rounded-lg bg-surface-2 border border-border">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-primary flex items-center gap-1.5">🔍 Header Assertions</span>
          {assertions.length < 10 && (
            <button type="button" onClick={() => setAssertions([...assertions, { header: "", op: "exists" }])} className="text-xs text-accent hover:text-accent/80 transition-colors font-medium">+ Add assertion</button>
          )}
        </div>
        <p className="text-xs text-text-secondary">Assert specific response headers on every check — alert yellow when a header is missing, has the wrong value, or contains unexpected content.</p>

        {assertions.length === 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {SUGGESTIONS.map((s, i) => (
              <button key={i} type="button" onClick={() => setAssertions([...assertions, s])} className="text-xs px-2 py-1 rounded bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors">
                {s.header}: {s.op}{s.value ? `: ${s.value}` : ""}
              </button>
            ))}
          </div>
        )}

        {assertions.map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="text" value={a.header} onChange={(e) => { const n = [...assertions]; n[i] = { ...n[i], header: e.target.value }; setAssertions(n); }} className={assertionInputClass + " flex-1"} placeholder="header name (e.g. x-frame-options)" />
            <select value={a.op} onChange={(e) => { const n = [...assertions]; n[i] = { ...n[i], op: e.target.value }; setAssertions(n); }} className={assertionInputClass + " w-36 shrink-0"}>
              <option value="exists">exists</option>
              <option value="not-exists">does not exist</option>
              <option value="equals">equals</option>
              <option value="contains">contains</option>
            </select>
            <input type="text" value={a.value ?? ""} onChange={(e) => { const n = [...assertions]; n[i] = { ...n[i], value: e.target.value || undefined }; setAssertions(n); }} disabled={a.op === "exists" || a.op === "not-exists"} className={assertionInputClass + " flex-1 disabled:opacity-40 disabled:cursor-not-allowed"} placeholder="expected value" />
            <button type="button" onClick={() => setAssertions(assertions.filter((_, j) => j !== i))} className="text-text-muted hover:text-danger transition-colors text-sm font-bold shrink-0 w-5" title="Remove assertion">×</button>
          </div>
        ))}
        {assertions.length > 0 && assertions.length < 10 && (
          <button type="button" onClick={() => setAssertions([...assertions, { header: "", op: "exists" }])} className="text-xs text-text-muted hover:text-accent transition-colors self-start">+ Add another</button>
        )}
      </div>

      {/* Redirect Following */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-2 border border-border">
        <input type="checkbox" id="followRedirects" checked={fd.followRedirects !== false} onChange={(e) => onSetFormData({ ...fd, followRedirects: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent cursor-pointer" />
        <label htmlFor="followRedirects" className="cursor-pointer select-none flex-1">
          <span className="text-sm font-medium text-text-primary flex items-center gap-1.5">🔀 Follow redirects</span>
          <span className="text-xs text-text-secondary mt-0.5 block">Automatically follow HTTP 3xx redirects up to the configured limit. Disable to assert the first response code directly (useful for monitoring redirect chains).</span>
          {fd.followRedirects !== false && (
            <div className="mt-2 flex items-center gap-2">
              <label htmlFor="maxRedirects" className="text-xs text-text-secondary whitespace-nowrap">Max redirects:</label>
              <input id="maxRedirects" type="number" min={1} max={20} value={fd.maxRedirects ?? 10} onChange={(e) => onSetFormData({ ...fd, maxRedirects: Math.min(20, Math.max(1, parseInt(e.target.value) || 10)) })} className="w-16 px-2 py-1 text-xs bg-surface border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
              <span className="text-xs text-text-secondary">(1–20, default 10)</span>
            </div>
          )}
        </label>
      </div>
    </>
  );
}
