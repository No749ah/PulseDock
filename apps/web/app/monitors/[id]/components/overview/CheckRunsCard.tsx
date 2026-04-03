"use client";

import React from "react";
import { ChevronDown, Download } from "lucide-react";
import { Card } from "../../../../components/Card";
import { Badge } from "../../../../components/Badge";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "../../../../components/Table";
import { relativeTime } from "../../../../components/timeUtils";
import type { MonitorItem, MonitorRun, RunTimings } from "../types";
import nextDynamic from "next/dynamic";
import { buildTimingPhases, computeTotal, computeBarWidth } from "./checkRunsHelpers";

const ResponseBodyViewer = nextDynamic(
  () => import("../ResponseBodyViewer").then((m) => ({ default: m.ResponseBodyViewer })),
  { ssr: false }
);

function TimingWaterfall({ timings, totalMs }: { timings: RunTimings; totalMs: number | null }) {
  const phases = buildTimingPhases(timings);
  const total = computeTotal(phases, totalMs);
  const maxMs = Math.max(...phases.map((p) => p.value ?? 0), 1);
  return (
    <div className="my-2 p-3 rounded-lg bg-surface-elevated border border-border text-xs">
      <p className="text-text-muted mb-2 font-medium uppercase tracking-wide text-[10px]">Timing Breakdown</p>
      <div className="space-y-1.5">
        {phases.map((phase) => (
          <div key={phase.label} className="flex items-center gap-2">
            <span className="w-16 text-text-secondary text-right shrink-0">{phase.label}</span>
            <div className="flex-1 flex items-center gap-2">
              {phase.value !== null ? (
                <>
                  <div className="flex-1 bg-surface rounded-full h-2 overflow-hidden">
                    <div className={`${phase.color} h-2 rounded-full transition-all`} style={{ width: `${computeBarWidth(phase.value, maxMs)}%` }} />
                  </div>
                  <span className="text-text-primary font-mono w-14 text-right shrink-0">{phase.value}ms</span>
                </>
              ) : (
                <>
                  <div className="flex-1 bg-surface rounded-full h-2" />
                  <span className="text-text-muted font-mono w-14 text-right shrink-0">N/A</span>
                </>
              )}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1 border-t border-border mt-1">
          <span className="w-16 text-text-muted text-right shrink-0">Total</span>
          <div className="flex-1" />
          <span className="text-text-primary font-mono font-semibold w-14 text-right shrink-0">{total}ms</span>
        </div>
      </div>
    </div>
  );
}

interface Props {
  id: string;
  monitor: MonitorItem;
  runs: MonitorRun[];
  runsStatusFilter: "all" | "ok" | "failed" | "degraded";
  runsHasMore: boolean;
  runsTotal: number | null;
  runsLoadingMore: boolean;
  expandedRunId: string | null;
  onExpandedRunIdChange: (id: string | null) => void;
  onLoadFilteredRuns: (filter: "all" | "ok" | "failed" | "degraded") => Promise<void>;
  onLoadMoreRuns: () => Promise<void>;
}

export function CheckRunsCard({
  id,
  monitor,
  runs,
  runsStatusFilter,
  runsHasMore,
  runsTotal,
  runsLoadingMore,
  expandedRunId,
  onExpandedRunIdChange,
  onLoadFilteredRuns,
  onLoadMoreRuns,
}: Props) {
  const isHttpLike = monitor?.type === "HTTP" || monitor?.type === "BROWSER";

  return (
    <Card className="p-0">
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Check History</h2>
          {runsTotal !== null && (
            <span className="text-xs text-text-muted">
              {runs.length} of {runsTotal} {runsStatusFilter !== "all" ? `(${runsStatusFilter} only)` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-surface">
            {(["all", "ok", "degraded", "failed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => onLoadFilteredRuns(f)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  runsStatusFilter === f
                    ? "bg-surface-elevated text-text-primary shadow-sm"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {f === "all" ? "All" : f === "ok" ? "OK" : f === "degraded" ? "Degraded" : "Failed"}
              </button>
            ))}
          </div>
          {runs.length > 0 && (
            <button
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated border border-border hover:border-border-strong transition-colors"
              title="Export all check history as CSV (up to 10,000 runs)"
              onClick={async () => {
                try {
                  const { API_BASE } = await import("../../../../../lib/api");
                  const fetchRes = await fetch(`${API_BASE}/v1/monitors/${id}/runs/export`, {
                    credentials: "include",
                    cache: "no-store",
                  });
                  if (!fetchRes.ok) return;
                  const blob = await fetchRes.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  const monitorName = monitor?.name ?? id;
                  const dateStr = new Date().toISOString().slice(0, 10);
                  a.href = url;
                  a.download = `pulsedock-runs-${monitorName.replace(/[^a-z0-9]/gi, "_").toLowerCase()}-${dateStr}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch {
                  // silently fail
                }
              }}
            >
              <Download className="w-3 h-3" />
              Export CSV
            </button>
          )}
        </div>
      </div>
      <div>
        {runs.length === 0 ? (
          <div className="text-center py-12 text-text-secondary text-sm">
            {runsStatusFilter !== "all"
              ? `No ${runsStatusFilter === "ok" ? "successful" : runsStatusFilter === "degraded" ? "degraded" : "failed"} checks found.`
              : "No runs yet — this monitor hasn't checked yet."}
          </div>
        ) : (
          <>
            <Table>
              <TableHead>
                <tr>
                  <TableHeader>Time</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Latency</TableHeader>
                  <TableHeader>HTTP Code</TableHeader>
                  {isHttpLike && <TableHeader className="hidden md:table-cell">Size</TableHeader>}
                  {isHttpLike && <TableHeader className="hidden md:table-cell">Redirects</TableHeader>}
                  <TableHeader>Message</TableHeader>
                </tr>
              </TableHead>
              <TableBody>
                {runs.map((run) => {
                  const isExpanded = expandedRunId === run.id;
                  const hasTimings = run.timings && (
                    run.timings.dnsMs !== null ||
                    run.timings.tcpMs !== null ||
                    run.timings.tlsMs !== null ||
                    run.timings.ttfbMs !== null ||
                    run.timings.downloadMs !== null
                  );
                  const showWaterfall = hasTimings && isHttpLike;
                  const hasRedirectChain = !!(run.redirectChain && run.redirectChain.length > 0);
                  const hasHeaderAssertionFailures = !!(run.headerAssertionsFailed && run.headerAssertionsFailed.length > 0);
                  const isExpandable = showWaterfall || hasRedirectChain || hasHeaderAssertionFailures;
                  return (
                    <React.Fragment key={run.id}>
                      <TableRow
                        className={isExpandable ? "cursor-pointer hover:bg-surface-elevated/50 transition-colors" : ""}
                        onClick={isExpandable ? () => onExpandedRunIdChange(isExpanded ? null : run.id) : undefined}
                      >
                        <TableCell className="text-xs text-text-secondary whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            {relativeTime(run.checkedAt)}
                            {isExpandable && (
                              <ChevronDown className={`w-3 h-3 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          {run.level === "yellow" ? (
                            <Badge variant="warning">Degraded</Badge>
                          ) : run.ok ? (
                            <Badge variant="success">OK</Badge>
                          ) : (
                            <Badge variant="danger">Failed</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-text-secondary">
                          {run.latencyMs !== null ? `${run.latencyMs}ms` : "—"}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-text-secondary">
                          {run.statusCode || "—"}
                        </TableCell>
                        {isHttpLike && (
                          <TableCell className="text-sm font-mono text-text-muted hidden md:table-cell whitespace-nowrap">
                            {run.responseSizeBytes != null
                              ? run.responseSizeBytes >= 1048576
                                ? `${(run.responseSizeBytes / 1048576).toFixed(1)} MB`
                                : run.responseSizeBytes >= 1024
                                  ? `${(run.responseSizeBytes / 1024).toFixed(1)} KB`
                                  : `${run.responseSizeBytes} B`
                              : "—"}
                          </TableCell>
                        )}
                        {isHttpLike && (
                          <TableCell className="text-sm font-mono hidden md:table-cell whitespace-nowrap">
                            {run.redirectChain && run.redirectChain.length > 0 ? (
                              <span className="text-amber-400 font-medium">→ {run.redirectChain.length}</span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell
                          className="text-sm text-text-secondary max-w-[300px] truncate"
                          title={run.message}
                        >
                          {run.message.length > 60 ? run.message.slice(0, 60) + "…" : run.message}
                        </TableCell>
                      </TableRow>
                      {isExpanded && showWaterfall && run.timings && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-0 pb-2 px-4">
                            <TimingWaterfall timings={run.timings} totalMs={run.latencyMs} />
                          </TableCell>
                        </TableRow>
                      )}
                      {isExpanded && run.redirectChain && run.redirectChain.length > 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-0 pb-2 px-4">
                            <div className="text-xs text-text-secondary py-1">
                              <span className="font-medium text-amber-400 mr-2">Redirect chain:</span>
                              <span className="font-mono break-all">
                                {run.redirectChain.map((url, i) => (
                                  <span key={i}>
                                    {i > 0 && <span className="text-text-muted mx-1">→</span>}
                                    <span>{url}</span>
                                  </span>
                                ))}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      {run.headerAssertionsFailed && run.headerAssertionsFailed.length > 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-0 pb-2 px-4">
                            <div className="text-xs py-1.5">
                              <span className="font-medium text-amber-400 mr-2">
                                ⚠ {run.headerAssertionsFailed.length} header assertion{run.headerAssertionsFailed.length === 1 ? "" : "s"} failed
                              </span>
                              <ul className="mt-1 space-y-0.5">
                                {run.headerAssertionsFailed.map((f, i) => (
                                  <li key={i} className="text-text-secondary font-mono">{f.message}</li>
                                ))}
                              </ul>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      {run.responseBody && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-0 pb-2 px-4">
                            <ResponseBodyViewer body={run.responseBody} />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
            {runsHasMore && (
              <div className="px-4 py-3 border-t border-border flex items-center justify-center">
                <button
                  onClick={onLoadMoreRuns}
                  disabled={runsLoadingMore}
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated border border-border hover:border-border-strong transition-colors disabled:opacity-50"
                >
                  <ChevronDown className="w-4 h-4" />
                  {runsLoadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
