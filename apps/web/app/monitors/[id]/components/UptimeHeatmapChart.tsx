"use client";

import type { MonitorRun } from "./types";

/**
 * Renders a 7-day × 24-hour uptime heatmap from run history.
 * Each cell is colored green (all ok), yellow (some fail), red (majority fail), or grey (no data).
 */
export function UptimeHeatmapChart({ runs }: { runs: MonitorRun[] }) {
  const DAYS = 7;
  const HOURS = 24;
  const CELL_W = 20;
  const CELL_H = 14;
  const LABEL_W = 28;
  const LABEL_H = 18;

  // Build 7×24 bucket grid: [dayOffset][hour] = { ok: n, fail: n }
  const now = new Date();
  type Bucket = { ok: number; fail: number };
  const grid: Bucket[][] = Array.from({ length: DAYS }, () =>
    Array.from({ length: HOURS }, () => ({ ok: 0, fail: 0 }))
  );

  for (const run of runs) {
    const runDate = new Date(run.checkedAt);
    const diffMs = now.getTime() - runDate.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays < 0 || diffDays >= DAYS) continue;
    const dayIdx = DAYS - 1 - diffDays; // 0 = oldest, 6 = today
    const hour = runDate.getUTCHours();
    if (run.ok) grid[dayIdx][hour].ok++;
    else grid[dayIdx][hour].fail++;
  }

  const cellColor = (b: Bucket) => {
    const total = b.ok + b.fail;
    if (total === 0) return "#1e2430"; // no data
    const failRate = b.fail / total;
    if (failRate === 0) return "#22c55e"; // all ok
    if (failRate < 0.5) return "#f59e0b"; // some fail
    return "#ef4444"; // mostly fail
  };

  const dayLabels = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (DAYS - 1 - i));
    return d.toLocaleDateString([], { weekday: "short" }).slice(0, 3);
  });

  const hourLabels = [0, 6, 12, 18, 23];
  const svgW = LABEL_W + HOURS * CELL_W + 4;
  const svgH = LABEL_H + DAYS * CELL_H + 4;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${svgW} ${svgH}`}
      role="img"
      aria-label="Uptime heatmap: 7 days × 24 hours"
      className="block"
    >
      {/* Hour axis labels */}
      {hourLabels.map((h) => (
        <text
          key={h}
          x={LABEL_W + h * CELL_W + CELL_W / 2}
          y={12}
          fontSize={8}
          fill="#6b7280"
          textAnchor="middle"
          fontFamily="inherit"
        >
          {h.toString().padStart(2, "0")}h
        </text>
      ))}

      {/* Grid cells + day labels */}
      {grid.map((dayBuckets, dayIdx) => (
        <g key={dayIdx}>
          <text
            x={LABEL_W - 4}
            y={LABEL_H + dayIdx * CELL_H + CELL_H / 2 + 3}
            fontSize={8}
            fill="#6b7280"
            textAnchor="end"
            fontFamily="inherit"
          >
            {dayLabels[dayIdx]}
          </text>
          {dayBuckets.map((bucket, hour) => (
            <rect
              key={hour}
              x={LABEL_W + hour * CELL_W + 1}
              y={LABEL_H + dayIdx * CELL_H + 1}
              width={CELL_W - 2}
              height={CELL_H - 2}
              rx={2}
              fill={cellColor(bucket)}
              opacity={bucket.ok + bucket.fail === 0 ? 0.3 : 0.85}
            >
              <title>
                {dayLabels[dayIdx]} {hour.toString().padStart(2, "0")}:00 —{" "}
                {bucket.ok + bucket.fail === 0
                  ? "No data"
                  : `${bucket.ok} ok, ${bucket.fail} fail (${Math.round((bucket.fail / (bucket.ok + bucket.fail)) * 100)}% fail rate)`}
              </title>
            </rect>
          ))}
        </g>
      ))}
    </svg>
  );
}
