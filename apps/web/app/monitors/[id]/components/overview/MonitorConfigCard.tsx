"use client";

import React from "react";
import { Settings, Activity } from "lucide-react";
import { Card } from "../../../../components/Card";
import { api } from "../../../../../lib/api";
import { getUser } from "../../../../../components/auth";
import type { MonitorItem } from "../types";

interface Props {
  monitor: MonitorItem;
  router: { refresh: () => void };
}

export function MonitorConfigCard({ monitor, router }: Props) {
  // Only renders for monitors that have config to show
  if (monitor.type === "HTTP" && monitor.config) {
    const cfg = monitor.config as Record<string, unknown>;
    const method = typeof cfg.method === "string" ? cfg.method : null;
    const expectedStatus = cfg.expectedStatus;
    const responseTimeMs = typeof cfg.responseTimeThresholdMs === "number" ? cfg.responseTimeThresholdMs : null;
    const confirmations = typeof cfg.confirmations === "number" ? cfg.confirmations : null;
    const bodyContains = typeof cfg.bodyContains === "string" ? cfg.bodyContains : null;
    const requestBody = typeof cfg.requestBody === "string" ? cfg.requestBody : null;
    const requestHeaders = cfg.requestHeaders && typeof cfg.requestHeaders === "object" ? cfg.requestHeaders as Record<string, string> : null;
    return (
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Settings className="w-4 h-4" />
          HTTP Configuration
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {method && method !== "GET" && (
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Method</span>
              <span className="font-mono font-medium text-accent">{method}</span>
            </div>
          )}
          {expectedStatus != null && (
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Expected Status</span>
              <span className="font-mono text-text-primary">
                {Array.isArray(expectedStatus) ? (expectedStatus as number[]).join(", ") : String(expectedStatus)}
              </span>
            </div>
          )}
          {responseTimeMs != null && (
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Slow Threshold</span>
              <span className="font-mono text-warning">{responseTimeMs}ms</span>
            </div>
          )}
          {confirmations != null && confirmations > 1 && (
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Confirmations</span>
              <span className="font-mono text-text-primary">{confirmations} checks</span>
            </div>
          )}
        </div>
        {bodyContains && (
          <div>
            <span className="text-xs text-text-secondary block mb-1">Body Must Contain</span>
            <code className="text-xs bg-surface-elevated rounded px-2 py-1 text-text-primary block font-mono">
              {bodyContains}
            </code>
          </div>
        )}
        {requestBody && (
          <div>
            <span className="text-xs text-text-secondary block mb-1">Request Body</span>
            <code className="text-xs bg-surface-elevated rounded px-2 py-1 text-text-primary block font-mono break-all">
              {requestBody}
            </code>
          </div>
        )}
        {requestHeaders && Object.keys(requestHeaders).length > 0 && (
          <div>
            <span className="text-xs text-text-secondary block mb-1">Request Headers</span>
            <div className="space-y-1">
              {Object.entries(requestHeaders).map(([k, v]) => (
                <div key={k} className="flex gap-2 text-xs font-mono bg-surface-elevated rounded px-2 py-1">
                  <span className="text-accent">{k}:</span>
                  <span className="text-text-primary truncate">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    );
  }

  if (monitor.type === "SSL_CERT") {
    return (
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Settings className="w-4 h-4" />
          SSL Configuration
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Host</span>
            <span className="font-mono text-text-primary">{monitor.target}</span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Warning Threshold</span>
            <span className="font-mono text-warning">
              {monitor.config && typeof (monitor.config as Record<string, unknown>).warnDays === "number"
                ? `${String((monitor.config as Record<string, unknown>).warnDays)} days`
                : "30 days"}
            </span>
          </div>
        </div>
      </Card>
    );
  }

  if (monitor.type === "TCP") {
    return (
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Settings className="w-4 h-4" />
          TCP Configuration
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Host</span>
            <span className="font-mono text-text-primary">
              {monitor.target.includes(":") ? monitor.target.split(":")[0] : monitor.target}
            </span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Port</span>
            <span className="font-mono text-accent">
              {monitor.target.includes(":") ? monitor.target.split(":").pop() : "—"}
            </span>
          </div>
        </div>
      </Card>
    );
  }

  if (monitor.type === "HEARTBEAT") {
    return (
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Heartbeat Config</h2>
        <div className="space-y-2">
          <div>
            <span className="text-xs text-text-secondary">Ping URL</span>
            <p className="font-mono text-xs text-text-primary bg-surface-elevated rounded px-2 py-1 mt-1 break-all">
              {typeof window !== "undefined"
                ? `${window.location.origin}/api/v1/heartbeat/${monitor.config?.token ?? "—"}`
                : `…/v1/heartbeat/${monitor.config?.token ?? "—"}`}
            </p>
            <p className="text-xs text-text-secondary mt-1">
              Send a POST to this URL from your cron job or service to mark it healthy.
            </p>
          </div>
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-xs text-text-secondary block">Timeout</span>
              <span className="font-medium text-text-primary">{String(monitor.config?.timeoutMin ?? 5)} min</span>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  if (monitor.type === "DNS") {
    return (
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Settings className="w-4 h-4" />
          DNS Configuration
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Hostname</span>
            <span className="font-mono text-text-primary">{monitor.target}</span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Record Type</span>
            <span className="font-mono text-accent uppercase">{String(monitor.config?.recordType ?? "A")}</span>
          </div>
          {Boolean(monitor.config?.expectedValue) && (
            <div className="col-span-2">
              <span className="text-xs text-text-secondary block mb-0.5">Expected Value</span>
              <span className="font-mono text-text-primary text-xs bg-surface-elevated px-2 py-1 rounded break-all">
                {String(monitor.config?.expectedValue ?? "")}
              </span>
            </div>
          )}
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Timeout</span>
            <span className="font-medium text-text-primary">
              {String(monitor.config?.timeoutMs ? `${Math.round(Number(monitor.config.timeoutMs) / 1000)}s` : "10s")}
            </span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Change Detection</span>
            <span className={`font-medium ${monitor.config?.detectChanges ? "text-success" : "text-text-secondary"}`}>
              {monitor.config?.detectChanges ? "✓ Enabled" : "Disabled"}
            </span>
          </div>
        </div>
        {!!monitor.config?.detectChanges && (
          <div className="mt-2 pt-3 border-t border-border">
            {Array.isArray(monitor.config?.dnsBaseline) && (monitor.config.dnsBaseline as string[]).length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Baseline Records</span>
                  <div className="flex items-center gap-2">
                    {!!monitor.config?.dnsBaselineSetAt && (
                      <span className="text-xs text-text-muted">
                        Set {new Date(String(monitor.config.dnsBaselineSetAt)).toLocaleDateString()}
                      </span>
                    )}
                    <button
                      onClick={async () => {
                        if (!confirm("Reset DNS baseline? The next check will establish a new baseline.")) return;
                        const u = getUser();
                        if (!u) return;
                        try {
                          await api(`/v1/monitors/${monitor.id}/dns-baseline/reset`, u.id, { method: "POST" });
                          router.refresh();
                        } catch (e) {
                          alert(e instanceof Error ? e.message : "Failed to reset baseline");
                        }
                      }}
                      className="text-xs text-warning hover:text-warning/80 border border-warning/30 hover:border-warning/60 px-2 py-0.5 rounded transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  {(monitor.config.dnsBaseline as string[]).map((record, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-surface-elevated">
                      <span className="w-2 h-2 rounded-full bg-success shrink-0" />
                      <span className="font-mono text-xs text-text-primary break-all">{record}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  Alerts will fire if any records are added or removed from this baseline.
                </p>
              </>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
                <span className="text-warning text-sm">⏳</span>
                <p className="text-xs text-text-secondary">
                  Baseline not set yet — will be captured on the next successful check.
                </p>
              </div>
            )}
          </div>
        )}
      </Card>
    );
  }

  if (monitor.type === "PING") {
    return (
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4" />
          ICMP Ping Configuration
        </h2>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Host</span>
            <span className="font-mono text-text-primary">{monitor.target}</span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Ping Count</span>
            <span className="font-medium text-text-primary">{String(monitor.config?.pingCount ?? 3)} packets</span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Loss Threshold</span>
            <span className="font-medium text-text-primary">
              {monitor.config?.maxPacketLossPct !== undefined
                ? `>${String(monitor.config.maxPacketLossPct)}% = fail`
                : "Any loss = warn"}
            </span>
          </div>
        </div>
      </Card>
    );
  }

  if (monitor.type === "SMTP") {
    return (
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Settings className="w-4 h-4" />
          SMTP Configuration
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Host</span>
            <span className="font-mono text-text-primary">
              {monitor.target.includes(":") ? monitor.target.split(":")[0] : monitor.target}
            </span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Port</span>
            <span className="font-mono text-accent">
              {monitor.target.includes(":") ? monitor.target.split(":").pop() : "25"}
            </span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">STARTTLS</span>
            <span className={`font-medium ${monitor.config?.requireStarttls ? "text-success" : "text-text-secondary"}`}>
              {monitor.config?.requireStarttls ? "Required" : "Optional"}
            </span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Timeout</span>
            <span className="font-medium text-text-primary">
              {monitor.config?.timeoutMs ? `${Math.round(Number(monitor.config.timeoutMs) / 1000)}s` : "10s"}
            </span>
          </div>
        </div>
      </Card>
    );
  }

  if (monitor.type === "FTP") {
    return (
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Settings className="w-4 h-4" />
          FTP Configuration
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Host</span>
            <span className="font-mono text-text-primary">
              {monitor.target.includes(":") ? monitor.target.split(":")[0] : monitor.target}
            </span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Port</span>
            <span className="font-mono text-accent">
              {monitor.target.includes(":") ? monitor.target.split(":").pop() : "21"}
            </span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">AUTH TLS (FTPS)</span>
            <span className={`font-medium ${monitor.config?.checkTls ? "text-success" : "text-text-secondary"}`}>
              {monitor.config?.checkTls ? "Tested" : "Not tested"}
            </span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Protocol</span>
            <span className="font-medium text-text-primary">
              {monitor.config?.checkTls ? "FTPS Explicit" : "Plain FTP"}
            </span>
          </div>
        </div>
      </Card>
    );
  }

  if (monitor.type === "IMAP") {
    return (
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Settings className="w-4 h-4" />
          IMAP Configuration
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Host</span>
            <span className="font-mono text-text-primary">
              {monitor.target.includes(":") ? monitor.target.split(":")[0] : monitor.target}
            </span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Port</span>
            <span className="font-mono text-accent">
              {monitor.target.includes(":") ? monitor.target.split(":").pop() : "143"}
            </span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">STARTTLS</span>
            <span className={`font-medium ${monitor.config?.checkTls ? "text-success" : "text-text-secondary"}`}>
              {monitor.config?.checkTls ? "Tested" : "Not tested"}
            </span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Encryption</span>
            <span className="font-medium text-text-primary">
              {monitor.config?.checkTls ? "STARTTLS" : "Plain (port 143) or IMAPS (port 993)"}
            </span>
          </div>
        </div>
      </Card>
    );
  }

  if (monitor.type === "POP3") {
    return (
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Settings className="w-4 h-4" />
          POP3 Configuration
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Host</span>
            <span className="font-mono text-text-primary">
              {monitor.target.includes(":") ? monitor.target.split(":")[0] : monitor.target}
            </span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Port</span>
            <span className="font-mono text-accent">
              {monitor.target.includes(":") ? monitor.target.split(":").pop() : "110"}
            </span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">STLS</span>
            <span className={`font-medium ${monitor.config?.checkTls ? "text-success" : "text-text-secondary"}`}>
              {monitor.config?.checkTls ? "Tested" : "Not tested"}
            </span>
          </div>
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Encryption</span>
            <span className="font-medium text-text-primary">
              {monitor.config?.checkTls ? "STLS" : "Plain (port 110) or POP3S (port 995)"}
            </span>
          </div>
        </div>
      </Card>
    );
  }

  if (monitor.type === "BROWSER") {
    return (
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Browser Check Configuration
        </h2>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Target URL</span>
            <span className="font-mono text-xs text-text-primary bg-surface-elevated px-2 py-1 rounded break-all">
              {monitor.target}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Allowed Status Codes</span>
              <span className="font-mono text-text-primary">
                {monitor.config?.allowedStatusCodes
                  ? (monitor.config.allowedStatusCodes as number[]).join(", ")
                  : "200–299, 301, 302"}
              </span>
            </div>
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Timeout</span>
              <span className="font-medium text-text-primary">
                {monitor.config?.timeoutMs ? `${Math.round(Number(monitor.config.timeoutMs) / 1000)}s` : "10s"}
              </span>
            </div>
          </div>
          {Boolean(monitor.config?.expectedText) && (
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Expected Text</span>
              <span className="font-mono text-xs text-text-primary bg-surface-elevated px-2 py-1 rounded break-all">
                {String(monitor.config?.expectedText ?? "")}
              </span>
            </div>
          )}
          {Boolean(monitor.config?.expectedSelector) && (
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">CSS Selector</span>
              <span className="font-mono text-xs text-accent bg-surface-elevated px-2 py-1 rounded">
                {String(monitor.config?.expectedSelector ?? "")}
              </span>
            </div>
          )}
        </div>
      </Card>
    );
  }

  if (monitor.type === "GRAPHQL") {
    return (
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Settings className="w-4 h-4" />
          GraphQL Configuration
        </h2>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-xs text-text-secondary block mb-0.5">Endpoint</span>
            <span className="font-mono text-xs text-text-primary bg-surface-elevated px-2 py-1 rounded break-all block">
              {monitor.target}
            </span>
          </div>
          {Boolean(monitor.graphqlQuery) && (
            <div>
              <span className="text-xs text-text-secondary block mb-0.5">Query</span>
              <pre className="font-mono text-xs text-text-primary bg-surface-elevated px-2 py-1.5 rounded overflow-x-auto whitespace-pre-wrap break-all">
                {monitor.graphqlQuery ?? ""}
              </pre>
            </div>
          )}
          {Boolean(monitor.graphqlDataPath) && (
            <div className="flex flex-wrap gap-6">
              <div>
                <span className="text-xs text-text-secondary block mb-0.5">Data Path</span>
                <span className="font-mono text-xs text-accent bg-surface-elevated px-2 py-1 rounded">
                  {monitor.graphqlDataPath ?? ""}
                </span>
              </div>
              {Boolean(monitor.graphqlExpectedValue) && (
                <div>
                  <span className="text-xs text-text-secondary block mb-0.5">Expected Value</span>
                  <span className="font-mono text-xs text-emerald-400 bg-surface-elevated px-2 py-1 rounded">
                    {monitor.graphqlExpectedValue ?? ""}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    );
  }

  return null;
}
