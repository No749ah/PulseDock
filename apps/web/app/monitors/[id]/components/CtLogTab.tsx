"use client";

import React from "react";
import { Card } from "../../../components/Card";
import type { MonitorRun } from "./types";

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

function levelLabel(level: string): string {
  if (level === "green") return "No new certs";
  if (level === "yellow") return "New certs found";
  return "Check failed";
}

export function CtLogTab({ runs }: Props) {
  const ctRuns = runs.slice(0, 20);

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Certificate Transparency Log History
        </h2>
        <p className="text-xs text-text-muted mt-1">
          Showing the last {ctRuns.length} CT log check results. Yellow = new certificates detected, Green = no new
          certs, Red = check failed.
        </p>
      </div>

      {ctRuns.length === 0 && (
        <div className="text-center py-6 text-text-muted text-sm">
          No checks yet — trigger a manual check to see CT log data.
        </div>
      )}

      <div className="space-y-2">
        {ctRuns.map((run, i) => {
          const level = (run as MonitorRun & { level?: string }).level ?? "green";
          const msg = (run as MonitorRun & { message?: string }).message ?? "";
          const checkedAt = (run as MonitorRun & { checkedAt?: string }).checkedAt;

          return (
            <div key={i} className={`rounded-lg border p-3 flex items-start gap-3 ${levelBg(level)}`}>
              <div className="mt-0.5 shrink-0">
                {level === "green" && <div className="w-2 h-2 rounded-full bg-success" />}
                {level === "yellow" && <div className="w-2 h-2 rounded-full bg-warning" />}
                {level === "red" && <div className="w-2 h-2 rounded-full bg-error" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold ${levelColor(level)}`}>{levelLabel(level)}</span>
                  {checkedAt && (
                    <span className="text-xs text-text-muted">{new Date(checkedAt).toLocaleString()}</span>
                  )}
                </div>
                {msg && <p className="text-xs text-text-secondary mt-1 leading-relaxed">{msg}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
