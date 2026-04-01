"use client";

import React from "react";
import { List, CheckCircle } from "lucide-react";
import { Card } from "../../../components/Card";
import { api } from "../../../../lib/api";
import { getUser } from "../../../../components/auth";
import type { MonitorItem, MonitorRun } from "./types";

interface MonitorWithHeaders extends MonitorItem {
  trackedHeaders?: string | null;
  headerBaseline?: Record<string, string | null> | null;
  headerBaselineSetAt?: string | null;
}

interface Props {
  monitor: MonitorItem;
  runs: MonitorRun[];
  onMonitorUpdated: (patch: Partial<MonitorItem>) => void;
}

export function HeadersTab({ monitor, runs, onMonitorUpdated }: Props) {
  const m = monitor as MonitorWithHeaders;
  const trackedNames = (m.trackedHeaders ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const baseline = m.headerBaseline as Record<string, string | null> | null | undefined;

  const handleResetBaseline = async () => {
    const u = getUser();
    if (!u) return;
    await api(`/v1/monitors/${monitor.id}/header-baseline/reset`, u.id, { method: "POST" });
    onMonitorUpdated({ headerBaseline: null, headerBaselineSetAt: null } as Partial<MonitorItem>);
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <List className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Response Header Tracking
        </h2>
      </div>
      <p className="text-xs text-text-muted">
        Tracking {trackedNames.length} header{trackedNames.length !== 1 ? "s" : ""}:{" "}
        {trackedNames.map((h) => (
          <code key={h} className="text-accent mx-0.5">
            {h}
          </code>
        ))}
        . Alerts yellow when any tracked header value changes from baseline.
      </p>

      {baseline && Object.keys(baseline).length > 0 ? (
        <>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Baseline values
              {m.headerBaselineSetAt && (
                <span className="ml-2 font-normal text-text-muted">
                  established {new Date(m.headerBaselineSetAt).toLocaleString()}
                </span>
              )}
            </p>
            <div className="rounded-xl overflow-hidden border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-elevated border-b border-border">
                    <th className="text-left px-4 py-2 font-semibold text-text-secondary uppercase tracking-wider w-1/3">
                      Header
                    </th>
                    <th className="text-left px-4 py-2 font-semibold text-text-secondary uppercase tracking-wider">
                      Baseline value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(baseline).map(([header, value]) => (
                    <tr
                      key={header}
                      className="border-b border-border/50 last:border-0 hover:bg-surface-elevated/40 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-mono text-text-secondary">{header}</td>
                      <td className="px-4 py-2.5 font-mono text-text-primary break-all">
                        {value ?? <span className="text-text-muted italic">(absent)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-surface-elevated border border-border space-y-2">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Actions</p>
            <p className="text-xs text-text-secondary">
              Reset the baseline to re-capture current header values. The next successful check will establish a new
              baseline.
            </p>
            <button
              className="mt-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-warning/10 text-warning border border-warning/20 hover:bg-warning/20 transition-colors"
              onClick={handleResetBaseline}
            >
              Reset Baseline
            </button>
          </div>

          <div>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Recent Header Change Events
            </p>
            {runs.filter((r) => r.message?.includes("Header changed")).length > 0 ? (
              <div className="space-y-2">
                {runs
                  .filter((r) => r.message?.includes("Header changed"))
                  .slice(0, 10)
                  .map((r) => (
                    <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
                      <span className="text-warning text-sm">⚠</span>
                      <div>
                        <p className="text-sm text-text-primary font-medium">Header changed</p>
                        <p className="text-xs text-text-secondary">{r.message}</p>
                        <p className="text-xs text-text-muted">{new Date(r.checkedAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle className="w-8 h-8 text-success opacity-50" />
                <p className="text-sm text-text-secondary">No header changes detected</p>
                <p className="text-xs text-text-muted">
                  PulseDock will alert here when tracked headers differ from the baseline.
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <List className="w-10 h-10 text-text-muted opacity-40" />
          <p className="text-sm font-medium text-text-secondary">No baseline established yet</p>
          <p className="text-xs text-text-muted max-w-xs">
            Run a check to capture the current header values as the baseline. Future checks will compare against them
            and alert on changes.
          </p>
        </div>
      )}
    </Card>
  );
}
