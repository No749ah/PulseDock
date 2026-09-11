"use client";

import React from "react";
import { BarChart2, Activity, AlertTriangle } from "lucide-react";
import { Card } from "../../../components/Card";
import { relativeTime } from "../../../components/timeUtils";
import type { MonitorItem } from "./types";

export interface MetricPoint {
  checkedAt: string;
  value: number;
  level: string;
}

export interface MetricHistoryData {
  metricName: string | null;
  metricUnit: string | null;
  metricPath: string | null;
  metricAlertMin: number | null;
  metricAlertMax: number | null;
  points: MetricPoint[];
  stats: {
    min: number | null;
    max: number | null;
    avg: number | null;
    latest: number | null;
    count: number;
  };
}

interface Props {
  monitor: MonitorItem;
  metricData: MetricHistoryData | null;
  metricLoading: boolean;
  metricError: string | null;
  metricPeriod: number;
  onPeriodChange: (days: number, onLoad: (data: MetricHistoryData) => void, onError: () => void) => void;
}

export function MetricTab({ monitor, metricData, metricLoading, metricError, metricPeriod, onPeriodChange }: Props) {
  const metricName = metricData?.metricName ?? monitor.metricName ?? "Captured Value";
  const metricUnit = metricData?.metricUnit ?? monitor.metricUnit;

  const handlePeriodClick = (d: number) => {
    onPeriodChange(
      d,
      (data) => { void data; },
      () => {},
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-accent" />
            Custom Metric: {metricName}
            {metricUnit && <span className="text-xs text-text-muted font-normal">({metricUnit})</span>}
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Path:{" "}
            <code className="font-mono bg-surface-elevated px-1 py-0.5 rounded">
              {metricData?.metricPath ?? monitor.metricPath}
            </code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              onClick={() => handlePeriodClick(d)}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                metricPeriod === d ? "bg-accent text-white" : "bg-surface-elevated text-text-secondary hover:text-text-primary"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {metricLoading && (
        <div className="flex items-center justify-center h-40 text-text-muted">
          <Activity className="w-5 h-5 animate-spin mr-2" /> Loading metric history…
        </div>
      )}
      {metricError && (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">{metricError}</div>
      )}

      {!metricLoading && !metricError && metricData && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(
              [
                { label: "Latest", value: metricData.stats.latest, color: "text-accent" },
                { label: "Avg", value: metricData.stats.avg, color: "text-text-primary" },
                { label: "Min", value: metricData.stats.min, color: "text-success" },
                { label: "Max", value: metricData.stats.max, color: "text-warning" },
              ] as Array<{ label: string; value: number | null; color: string }>
            ).map(({ label, value, color }) => (
              <Card key={label} className="p-4 text-center">
                <p className="text-xs text-text-muted mb-1">{label}</p>
                <p className={`text-2xl font-bold tabular-nums ${color}`}>
                  {value !== null ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
                </p>
                {metricUnit && <p className="text-[11px] text-text-muted mt-0.5">{metricUnit}</p>}
              </Card>
            ))}
          </div>

          {(metricData.metricAlertMin !== null || metricData.metricAlertMax !== null) && (
            <div className="flex flex-wrap gap-3">
              {metricData.metricAlertMin !== null && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-warning/10 border border-warning/30 text-warning font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Alert when &lt; {metricData.metricAlertMin} {metricData.metricUnit ?? ""}
                </span>
              )}
              {metricData.metricAlertMax !== null && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-warning/10 border border-warning/30 text-warning font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Alert when &gt; {metricData.metricAlertMax} {metricData.metricUnit ?? ""}
                </span>
              )}
            </div>
          )}

          {metricData.points.length === 0 ? (
            <Card className="p-8 text-center">
              <BarChart2 className="w-8 h-8 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary text-sm">No metric data captured yet.</p>
              <p className="text-text-muted text-xs mt-1">
                The next HTTP check will extract the value from the configured JSONPath.
              </p>
            </Card>
          ) : (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                  Value over time{" "}
                  <span className="text-text-muted font-normal normal-case">
                    ({metricData.points.length} data points)
                  </span>
                </h3>
              </div>
              {(() => {
                const pts = [...metricData.points].reverse();
                const vals = pts.map((p) => p.value);
                const minV = Math.min(...vals);
                const maxV = Math.max(...vals);
                const range = maxV - minV || 1;
                const barW = Math.max(2, Math.min(8, Math.floor(600 / pts.length)));
                const gap = Math.max(1, barW > 4 ? 2 : 1);
                const totalW = pts.length * (barW + gap);
                const H = 120;
                const alertMin = metricData.metricAlertMin;
                const alertMax = metricData.metricAlertMax;
                const minLineY = alertMin !== null ? H - Math.round(((alertMin - minV) / range) * H) : null;
                const maxLineY = alertMax !== null ? H - Math.round(((alertMax - minV) / range) * H) : null;
                return (
                  <div className="overflow-x-auto">
                    <svg width={Math.max(totalW, 400)} height={H + 20} className="min-w-full">
                      {pts.map((p, i) => {
                        const barH = Math.max(2, Math.round(((p.value - minV) / range) * H));
                        const x = i * (barW + gap);
                        const y = H - barH;
                        const fill =
                          p.level === "red" ? "#ef4444" : p.level === "yellow" ? "#f59e0b" : "#22c55e";
                        return <rect key={i} x={x} y={y} width={barW} height={barH} fill={fill} rx="1" opacity={0.85} />;
                      })}
                      {minLineY !== null && minLineY >= 0 && minLineY <= H && (
                        <line
                          x1={0}
                          x2={Math.max(totalW, 400)}
                          y1={minLineY}
                          y2={minLineY}
                          stroke="#f59e0b"
                          strokeWidth={1}
                          strokeDasharray="4 2"
                          opacity={0.7}
                        />
                      )}
                      {maxLineY !== null && maxLineY >= 0 && maxLineY <= H && (
                        <line
                          x1={0}
                          x2={Math.max(totalW, 400)}
                          y1={maxLineY}
                          y2={maxLineY}
                          stroke="#f59e0b"
                          strokeWidth={1}
                          strokeDasharray="4 2"
                          opacity={0.7}
                        />
                      )}
                      <text x={2} y={10} fill="#6b7280" fontSize={9}>
                        {maxV.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </text>
                      <text x={2} y={H - 2} fill="#6b7280" fontSize={9}>
                        {minV.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </text>
                    </svg>
                  </div>
                );
              })()}
              <div className="flex items-center gap-4 mt-2 text-[11px] text-text-muted">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-2 rounded-sm bg-success" /> OK
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-2 rounded-sm bg-warning" /> Alert
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-2 rounded-sm bg-danger" /> Down
                </span>
              </div>
            </Card>
          )}

          {metricData.points.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
                Recent Values
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-text-muted border-b border-border">
                      <th className="pb-2 font-medium">Time</th>
                      <th className="pb-2 font-medium">Value</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricData.points.slice(0, 20).map((p, i) => {
                      const levelColor =
                        p.level === "red" ? "text-danger" : p.level === "yellow" ? "text-warning" : "text-success";
                      const levelLabel = p.level === "red" ? "Down" : p.level === "yellow" ? "Degraded" : "OK";
                      return (
                        <tr key={i} className="border-b border-border/50 hover:bg-white/2">
                          <td className="py-2 text-text-secondary">{relativeTime(p.checkedAt)}</td>
                          <td className="py-2 font-mono font-medium text-text-primary tabular-nums">
                            {p.value.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                            {metricUnit && <span className="text-text-muted ml-1 text-xs">{metricUnit}</span>}
                          </td>
                          <td className={`py-2 font-medium text-xs ${levelColor}`}>{levelLabel}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
