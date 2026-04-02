"use client";

import React from "react";
import { Globe } from "lucide-react";
import { Card } from "../../../components/Card";
import type { MonitorItem } from "./types";

export interface GeoRegionStat {
  region: string;
  totalRuns: number;
  okRuns: number;
  uptimePct: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
}

interface Props {
  monitor: MonitorItem;
  geoStats: { regions: GeoRegionStat[]; hasGeoData: boolean } | null;
  geoStatsLoading: boolean;
  geoPeriod: 1 | 7 | 30;
  onPeriodChange: (period: 1 | 7 | 30) => void;
}

export function GeoTab({ monitor, geoStats, geoStatsLoading, geoPeriod, onPeriodChange }: Props) {
  const latencyColor = (ms: number | null) => {
    if (ms === null) return "text-text-muted";
    if (ms < 200) return "text-success";
    if (ms < 500) return "text-warning";
    return "text-danger";
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Geo Distribution
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Per-region latency and availability. Regions: {(monitor.geoRegions ?? []).join(", ")}.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted font-medium">Period:</span>
          {([1, 7, 30] as const).map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                geoPeriod === p
                  ? "bg-accent text-white"
                  : "bg-white/5 text-text-muted hover:text-text-secondary border border-white/10"
              }`}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {geoStatsLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        </div>
      ) : !geoStats || !geoStats.hasGeoData ? (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-surface-elevated/40">
          <Globe className="w-4 h-4 text-text-muted mt-0.5 flex-shrink-0" />
          <p className="text-sm text-text-secondary">
            No geo data yet. Configure geo regions in monitor settings to enable multi-region analysis.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-border">
                <th className="pb-2 pr-4 font-medium">Region</th>
                <th className="pb-2 pr-4 font-medium text-right">Checks</th>
                <th className="pb-2 pr-4 font-medium text-right">Uptime %</th>
                <th className="pb-2 pr-4 font-medium text-right">Avg Latency</th>
                <th className="pb-2 font-medium text-right">P95 Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...geoStats.regions]
                .sort((a, b) => a.uptimePct - b.uptimePct)
                .map((r) => {
                  const uptimeColor =
                    r.uptimePct >= 99 ? "text-success" : r.uptimePct >= 95 ? "text-warning" : "text-danger";
                  return (
                    <tr key={r.region} className="hover:bg-white/5 transition-colors">
                      <td className="py-2.5 pr-4 font-mono text-text-primary">{r.region}</td>
                      <td className="py-2.5 pr-4 text-right text-text-secondary tabular-nums">{r.totalRuns}</td>
                      <td className={`py-2.5 pr-4 text-right font-medium tabular-nums ${uptimeColor}`}>
                        {r.uptimePct.toFixed(1)}%
                      </td>
                      <td className={`py-2.5 pr-4 text-right tabular-nums ${latencyColor(r.avgLatencyMs)}`}>
                        {r.avgLatencyMs !== null ? `${r.avgLatencyMs}ms` : "—"}
                      </td>
                      <td className={`py-2.5 text-right tabular-nums ${latencyColor(r.p95LatencyMs)}`}>
                        {r.p95LatencyMs !== null ? `${r.p95LatencyMs}ms` : "—"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
