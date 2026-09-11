"use client";

import React, { useState } from "react";
import { Card } from "../../../components/Card";
import type { MonitorRun } from "./types";

interface TransactionStep {
  stepId: string;
  name: string;
  ok: boolean;
  statusCode?: number;
  latencyMs: number;
  assertionFailures: string[];
  error?: string;
}

interface TransactionResult {
  steps: TransactionStep[];
}

interface TransactionRun extends MonitorRun {
  metadata?: {
    transactionResult?: TransactionResult;
  };
}

interface Props {
  runs: MonitorRun[];
}

function levelColor(level: string): string {
  if (level === "green") return "text-success";
  if (level === "yellow") return "text-warning";
  return "text-error";
}

function levelBg(level: string): string {
  if (level === "green") return "bg-success/10 border-success/20";
  if (level === "yellow") return "bg-warning/10 border-warning/20";
  return "bg-error/10 border-error/20";
}

function TransactionRunRow({ run }: { run: TransactionRun }) {
  const [expanded, setExpanded] = useState(false);
  const txResult = run.metadata?.transactionResult;
  const level = run.level ?? "red";

  return (
    <div className={`rounded-lg border ${levelBg(level)} overflow-hidden`}>
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:brightness-110 transition-all"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`text-xs font-bold uppercase ${levelColor(level)}`}>{level}</span>
        <span className="text-xs text-text-primary">
          {new Date(run.checkedAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span className="text-xs text-text-secondary ml-auto">
          {run.latencyMs != null ? `${run.latencyMs}ms total` : "—"}
        </span>
        <span className="text-xs text-text-muted">
          {txResult
            ? `${txResult.steps.filter((s) => s.ok).length}/${txResult.steps.length} steps passed`
            : run.message}
        </span>
        <span className="text-text-muted text-xs ml-1">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && txResult && (
        <div className="border-t border-current/10 p-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-muted">
                <th className="text-left py-1 pr-3">#</th>
                <th className="text-left py-1 pr-3">Step</th>
                <th className="text-left py-1 pr-3">Status</th>
                <th className="text-left py-1 pr-3">Latency</th>
                <th className="text-left py-1">Issues</th>
              </tr>
            </thead>
            <tbody>
              {txResult.steps.map((step, si) => (
                <tr key={step.stepId} className="border-t border-current/5">
                  <td className="py-1.5 pr-3 text-text-muted">{si + 1}</td>
                  <td className="py-1.5 pr-3 font-medium text-text-primary">{step.name}</td>
                  <td className={`py-1.5 pr-3 font-bold ${step.ok ? "text-success" : "text-error"}`}>
                    {step.ok ? "✓" : "✗"} {step.statusCode ?? "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-text-secondary">{step.latencyMs}ms</td>
                  <td className="py-1.5 text-text-muted">
                    {step.error && <span className="text-error">{step.error}</span>}
                    {step.assertionFailures.map((f, fi) => (
                      <div key={fi} className="text-warning">
                        {f}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function TransactionTab({ runs }: Props) {
  const txRuns = runs.slice(0, 20) as TransactionRun[];

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Transaction Run History</h2>
        <p className="text-xs text-text-muted mt-1">
          Last {txRuns.length} transaction runs. Expand a row to see per-step details.
        </p>
      </div>

      {txRuns.length === 0 && (
        <div className="text-center py-6 text-text-muted text-sm">
          No transaction runs yet — trigger a manual check to see step-by-step results.
        </div>
      )}

      <div className="space-y-2">
        {txRuns.map((run) => (
          <TransactionRunRow key={run.id} run={run} />
        ))}
      </div>
    </Card>
  );
}
