"use client";

import React from "react";
import { Shield, CheckCircle, XCircle } from "lucide-react";
import { Card } from "../../../components/Card";
import type { MonitorRun } from "./types";

interface SecurityHeader {
  name: string;
  present: boolean;
  value: string | null;
  severity: string;
  description: string;
  recommendation?: string;
}

interface SecurityAudit {
  grade: string;
  score: number;
  headers: SecurityHeader[];
}

interface SecurityRun extends MonitorRun {
  securityAuditJson?: SecurityAudit | null;
}

interface Props {
  runs: MonitorRun[];
}

function gradeColor(g: string): string {
  if (g === "A") return "text-success";
  if (g === "B") return "text-emerald-400";
  if (g === "C") return "text-yellow-400";
  if (g === "D") return "text-orange-400";
  return "text-danger";
}

function gradeBg(g: string): string {
  if (g === "A") return "bg-success/10 border-success/30";
  if (g === "B") return "bg-emerald-400/10 border-emerald-400/30";
  if (g === "C") return "bg-yellow-400/10 border-yellow-400/30";
  if (g === "D") return "bg-orange-400/10 border-orange-400/30";
  return "bg-danger/10 border-danger/30";
}

function severityBadge(s: string): string {
  if (s === "critical") return "bg-danger/10 text-danger border border-danger/20";
  if (s === "warning") return "bg-yellow-400/10 text-yellow-400 border border-yellow-400/20";
  return "bg-white/5 text-text-muted border border-white/10";
}

export function SecurityTab({ runs }: Props) {
  const auditRun = (runs as SecurityRun[]).find((r) => r.securityAuditJson);
  const audit = auditRun?.securityAuditJson ?? null;

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Security Headers Audit
        </h2>
        {auditRun && (
          <span className="text-xs text-text-muted">
            Last checked{" "}
            {new Date(auditRun.checkedAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>

      {!audit ? (
        <div className="text-center py-8 space-y-2">
          <Shield className="w-8 h-8 text-text-muted mx-auto opacity-40" />
          <p className="text-sm text-text-muted">No audit data yet.</p>
          <p className="text-xs text-text-muted opacity-75">
            Run a check to populate security header audit results.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-6">
            <div className={`flex items-center justify-center w-20 h-20 rounded-2xl border-2 ${gradeBg(audit.grade)}`}>
              <span className={`text-4xl font-bold ${gradeColor(audit.grade)}`}>{audit.grade}</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">
                {audit.score}
                <span className="text-base font-normal text-text-muted">/100</span>
              </p>
              <p className="text-sm text-text-secondary mt-0.5">Security Score</p>
              <div className="mt-2 w-48 h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    audit.score >= 75 ? "bg-success" : audit.score >= 55 ? "bg-yellow-400" : "bg-danger"
                  }`}
                  style={{ width: `${audit.score}%` }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Header Checks</p>
            <div className="space-y-2">
              {audit.headers.map((h) => (
                <div
                  key={h.name}
                  className="flex items-start gap-3 p-3 rounded-lg bg-surface-2 border border-border"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {h.present ? (
                      <CheckCircle className="w-4 h-4 text-success" />
                    ) : (
                      <XCircle className="w-4 h-4 text-danger" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text-primary font-mono">{h.name}</span>
                      {!h.present && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${severityBadge(h.severity)}`}>
                          {h.severity}
                        </span>
                      )}
                    </div>
                    {h.present && h.value && (
                      <p className="text-xs text-text-muted mt-0.5 font-mono truncate" title={h.value}>
                        {h.value}
                      </p>
                    )}
                    {!h.present && (
                      <>
                        <p className="text-xs text-text-secondary mt-0.5">{h.description}</p>
                        {h.recommendation && (
                          <p className="text-xs text-text-muted mt-1 font-mono bg-white/3 px-2 py-1 rounded">
                            {h.recommendation}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
