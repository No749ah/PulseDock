"use client";

import React from "react";
import { FileText, CheckCircle } from "lucide-react";
import { Card } from "../../../components/Card";
import { api } from "../../../../lib/api";
import { getUser } from "../../../../components/auth";
import type { MonitorItem, MonitorRun } from "./types";

interface Props {
  monitor: MonitorItem;
  runs: MonitorRun[];
  onMonitorUpdated: (patch: Partial<MonitorItem>) => void;
}

export function ContentTab({ monitor, runs, onMonitorUpdated }: Props) {
  const cfg = monitor.config as Record<string, unknown> | undefined;

  const handleResetBaseline = async () => {
    const u = getUser();
    if (!u) return;
    await api(`/v1/monitors/${monitor.id}/content-baseline/reset`, u.id, { method: "POST" });
    const newConfig = { ...(monitor.config as Record<string, unknown>) };
    delete newConfig.contentHash;
    delete newConfig.contentHashSetAt;
    onMonitorUpdated({ config: newConfig });
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Content Change Detection
        </h2>
      </div>

      {cfg?.contentHash ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-surface-elevated border border-border space-y-1">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Baseline Hash</p>
              <p className="text-xs font-mono text-text-primary break-all">{String(cfg.contentHash)}</p>
              {Boolean(cfg.contentHashSetAt) && (
                <p className="text-xs text-text-muted">
                  Set {new Date(String(cfg.contentHashSetAt)).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="p-4 rounded-xl bg-surface-elevated border border-border space-y-2">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Actions</p>
              <p className="text-xs text-text-secondary">
                Reset the baseline to re-capture current page content. The next successful check will establish a new
                baseline hash.
              </p>
              <button
                className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-warning/10 text-warning border border-warning/20 hover:bg-warning/20 transition-colors"
                onClick={handleResetBaseline}
              >
                Reset Baseline
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Recent Change Events
            </p>
            {runs.filter((r) => r.message?.includes("Content changed")).length > 0 ? (
              <div className="space-y-2">
                {runs
                  .filter((r) => r.message?.includes("Content changed"))
                  .slice(0, 10)
                  .map((r) => (
                    <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
                      <span className="text-warning text-sm">⚠</span>
                      <div>
                        <p className="text-sm text-text-primary font-medium">Content changed</p>
                        <p className="text-xs text-text-muted">{new Date(r.checkedAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle className="w-8 h-8 text-success opacity-50" />
                <p className="text-sm text-text-secondary">No content changes detected</p>
                <p className="text-xs text-text-muted">
                  PulseDock will alert here when the page content differs from the baseline.
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <FileText className="w-10 h-10 text-text-muted opacity-40" />
          <p className="text-sm font-medium text-text-secondary">No baseline established yet</p>
          <p className="text-xs text-text-muted max-w-xs">
            Run a check to capture the current page content as the baseline. Future checks will compare against it and
            alert on changes.
          </p>
        </div>
      )}
    </Card>
  );
}
