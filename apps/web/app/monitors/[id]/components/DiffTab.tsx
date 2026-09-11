"use client";

import React from "react";
import { GitCompare, Activity, CheckCircle, XCircle } from "lucide-react";
import { Card } from "../../../components/Card";
import type { MonitorRun } from "./types";

interface DiffData {
  failedBody: string | null;
  baseBody: string | null;
  runId: string;
  baseRunId: string | null;
}

interface Props {
  runs: MonitorRun[];
  diffRunId: string | null;
  diffData: DiffData | null;
  diffLoading: boolean;
  diffError: string | null;
  onLoadDiff: (runId: string) => void;
}

export function DiffTab({ runs, diffRunId, diffData, diffLoading, diffError, onLoadDiff }: Props) {
  const failedRuns = runs.filter((r) => !r.ok && r.responseBody);

  const renderLineDiff = (baseBody: string, failedBody: string): React.ReactNode[] => {
    const baseLines = baseBody.split("\n");
    const failLines = failedBody.split("\n");
    const maxLen = Math.max(baseLines.length, failLines.length);
    const rows: React.ReactNode[] = [];
    for (let i = 0; i < maxLen; i++) {
      const b = baseLines[i] ?? null;
      const f = failLines[i] ?? null;
      if (b === f) {
        rows.push(
          <div key={i} className="text-text-muted px-2 py-0.5">
            {b}
          </div>,
        );
      } else {
        if (b !== null)
          rows.push(
            <div key={`b${i}`} className="text-success bg-success/10 px-2 py-0.5 rounded">
              - {b}
            </div>,
          );
        if (f !== null)
          rows.push(
            <div key={`f${i}`} className="text-danger bg-danger/10 px-2 py-0.5 rounded">
              + {f}
            </div>,
          );
      }
    }
    return rows;
  };

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <GitCompare className="w-4 h-4" />
          Response Body Diff
        </h2>
        <p className="text-xs text-text-muted mt-1">
          Compare the response body of a failed check against the last successful baseline. Select a failed run from the
          check history below.
        </p>
      </div>

      <div>
        <p className="text-xs font-medium text-text-secondary mb-2">Select a failed run to inspect:</p>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {failedRuns.length === 0 ? (
            <p className="text-xs text-text-muted italic">
              No failed runs with response body captured. Make sure the monitor has been checked recently.
            </p>
          ) : (
            failedRuns.slice(0, 20).map((r) => (
              <button
                key={r.id}
                onClick={() => onLoadDiff(r.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-colors text-left ${
                  diffRunId === r.id
                    ? "bg-danger/15 border border-danger/30 text-text-primary"
                    : "bg-surface-elevated border border-border text-text-secondary hover:border-danger/30 hover:text-text-primary"
                }`}
              >
                <XCircle className="w-3.5 h-3.5 text-danger flex-shrink-0" />
                <span className="flex-1 truncate">{r.message ?? "Check failed"}</span>
                <span className="text-text-muted flex-shrink-0">{new Date(r.checkedAt).toLocaleString()}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {diffLoading && (
        <div className="flex items-center gap-2 text-text-muted text-xs py-4">
          <Activity className="w-4 h-4 animate-pulse" />
          Loading diff…
        </div>
      )}
      {diffError && <p className="text-xs text-danger">{diffError}</p>}
      {diffData && !diffLoading && (
        <div className="space-y-3">
          {!diffData.baseBody && (
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-xs text-warning">
              No prior successful response body found to compare against. Only the failed response is shown below.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-success flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                Baseline (last OK response)
              </p>
              <pre className="text-[11px] font-mono p-3 rounded-lg bg-surface-elevated border border-border text-text-secondary overflow-x-auto whitespace-pre-wrap break-all max-h-64">
                {diffData.baseBody ?? "(no baseline captured)"}
              </pre>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-danger flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5" />
                Failed response
              </p>
              <pre className="text-[11px] font-mono p-3 rounded-lg bg-surface-elevated border border-danger/20 text-text-secondary overflow-x-auto whitespace-pre-wrap break-all max-h-64">
                {diffData.failedBody ?? "(no response body)"}
              </pre>
            </div>
          </div>
          {diffData.baseBody && diffData.failedBody && (
            <div className="p-3 rounded-lg bg-surface-elevated border border-border">
              <p className="text-xs font-semibold text-text-secondary mb-2">Line-by-line diff</p>
              <div className="font-mono text-[11px] space-y-0.5 max-h-64 overflow-y-auto">
                {renderLineDiff(diffData.baseBody, diffData.failedBody)}
              </div>
            </div>
          )}
          <p className="text-[11px] text-text-muted">
            Note: Only the first 500 characters of each response body are stored.
          </p>
        </div>
      )}
    </Card>
  );
}
