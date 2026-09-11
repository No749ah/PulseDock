"use client";

import React from "react";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { Card } from "../../../components/Card";
import { relativeTime } from "../../../components/timeUtils";

export interface FailurePattern {
  pattern: string;
  count: number;
  percentage: number;
  firstSeen: string;
  lastSeen: string;
  exampleMessage: string;
  weeklyTrend: number[];
}

export interface FailurePatternsData {
  totalFailures: number;
  uniquePatterns: number;
  patterns: FailurePattern[];
}

interface Props {
  failurePatterns: FailurePatternsData | null;
  failurePatternsLoading: boolean;
  failuresPeriod: 7 | 30 | 90;
  onPeriodChange: (period: 7 | 30 | 90) => void;
}

export function FailuresTab({ failurePatterns, failurePatternsLoading, failuresPeriod, onPeriodChange }: Props) {
  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Failure Pattern Analysis
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Normalized error patterns from failed checks. Helps identify recurring failure causes.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted font-medium">Period:</span>
          {([7, 30, 90] as const).map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                failuresPeriod === p
                  ? "bg-accent text-white"
                  : "bg-white/5 text-text-muted hover:text-text-secondary border border-white/10"
              }`}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {failurePatternsLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        </div>
      ) : !failurePatterns || failurePatterns.totalFailures === 0 ? (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-surface-elevated/40">
          <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
          <p className="text-sm text-text-secondary">
            No failures found in the last {failuresPeriod} days. This monitor is healthy!
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-surface-elevated/40 px-4 py-3">
              <p className="text-xs text-text-muted mb-1 uppercase tracking-wider">Total Failures</p>
              <p className="text-2xl font-bold tabular-nums text-danger">{failurePatterns.totalFailures}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-elevated/40 px-4 py-3">
              <p className="text-xs text-text-muted mb-1 uppercase tracking-wider">Unique Patterns</p>
              <p className="text-2xl font-bold tabular-nums text-text-primary">{failurePatterns.uniquePatterns}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-elevated/40 px-4 py-3 col-span-2 sm:col-span-1">
              <p className="text-xs text-text-muted mb-1 uppercase tracking-wider">Top Pattern %</p>
              <p className="text-2xl font-bold tabular-nums text-warning">
                {failurePatterns.patterns[0]?.percentage ?? 0}%
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-muted border-b border-border">
                  <th className="pb-2 pr-4 font-medium">Pattern</th>
                  <th className="pb-2 pr-4 font-medium text-right">Count</th>
                  <th className="pb-2 pr-4 font-medium text-right">%</th>
                  <th className="pb-2 pr-4 font-medium text-right hidden sm:table-cell">First Seen</th>
                  <th className="pb-2 font-medium text-right hidden sm:table-cell">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {failurePatterns.patterns.map((p, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors group">
                    <td className="py-3 pr-4 max-w-xs">
                      <p className="font-mono text-xs text-text-primary truncate" title={p.pattern}>
                        {p.pattern}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5 truncate" title={p.exampleMessage}>
                        e.g. {p.exampleMessage}
                      </p>
                      <div className="flex items-end gap-[2px] mt-1.5 h-4">
                        {p.weeklyTrend.map((v, wi) => {
                          const maxVal = Math.max(...p.weeklyTrend, 1);
                          const h = Math.max(2, Math.round((v / maxVal) * 16));
                          return (
                            <div
                              key={wi}
                              className="flex-1 rounded-sm"
                              style={{
                                height: h,
                                backgroundColor: v === 0 ? "rgba(255,255,255,0.08)" : `rgba(248,113,113,${0.3 + (v / maxVal) * 0.7})`,
                              }}
                              title={`Week ${wi + 1}: ${v} failures`}
                            />
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold tabular-nums text-danger">{p.count}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      <span className={`font-medium ${p.percentage > 50 ? "text-danger" : p.percentage > 20 ? "text-warning" : "text-text-secondary"}`}>
                        {p.percentage}%
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right text-text-muted text-xs tabular-nums hidden sm:table-cell">
                      {relativeTime(p.firstSeen)}
                    </td>
                    <td className="py-3 text-right text-text-muted text-xs tabular-nums hidden sm:table-cell">
                      {relativeTime(p.lastSeen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
