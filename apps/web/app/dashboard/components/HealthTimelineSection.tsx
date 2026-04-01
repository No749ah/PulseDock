"use client";

import { TrendingUp } from "lucide-react";
import { Card } from "../../components/Card";
import type { HealthTimelineEntry } from "../hooks/useDashboard";

interface Props {
  healthTimeline: HealthTimelineEntry[];
}

const MAX_BAR_H = 80;

export function HealthTimelineSection({ healthTimeline }: Props) {
  const hasData = healthTimeline.some((d) => d.healthScore !== null);
  if (!hasData) return null;

  const scores = healthTimeline.map((d) => d.healthScore ?? 0);
  const validEntries = healthTimeline.filter((d) => d.healthScore !== null);
  const avgScore = validEntries.reduce((a, d) => a + (d.healthScore ?? 0), 0) / (validEntries.length || 1);
  const trend = (() => {
    if (validEntries.length < 7) return 0;
    const recent = validEntries.slice(-7).reduce((a, d) => a + (d.healthScore ?? 0), 0) / 7;
    const earlier = validEntries.slice(-14, -7).reduce((a, d) => a + (d.healthScore ?? 0), 0) / Math.max(validEntries.slice(-14, -7).length, 1);
    return recent - earlier;
  })();

  // suppress unused warning — scores array is computed but only used for future p-tile calcs
  void scores;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-accent" />
            Infrastructure Health
          </h2>
          <p className="text-text-secondary text-sm mt-1">
            30-day uptime health score — % of monitors green per day
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className={`text-2xl font-bold tabular-nums ${avgScore >= 99 ? "text-green-400" : avgScore >= 95 ? "text-yellow-400" : "text-red-400"}`}>
              {avgScore.toFixed(1)}%
            </div>
            <div className="text-xs text-text-muted">30-day avg</div>
          </div>
          {Math.abs(trend) >= 0.5 && (
            <div className={`flex items-center gap-1 text-sm font-medium ${trend > 0 ? "text-green-400" : "text-red-400"}`}>
              <TrendingUp className={`w-4 h-4 ${trend < 0 ? "rotate-180" : ""}`} />
              {trend > 0 ? "+" : ""}{trend.toFixed(1)}%
            </div>
          )}
        </div>
      </div>
      <Card className="p-4">
        <div className="flex items-end gap-0.5 h-20" style={{ height: MAX_BAR_H }}>
          {healthTimeline.map((day) => {
            const score = day.healthScore;
            const barH = score === null ? 2 : Math.max(4, (score / 100) * MAX_BAR_H);
            const color = score === null ? "bg-border" : score >= 99 ? "bg-green-500" : score >= 90 ? "bg-yellow-500" : "bg-red-500";
            const dateLabel = new Date(day.date + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" });
            return (
              <div
                key={day.date}
                className="flex-1 flex flex-col items-center justify-end group relative cursor-default"
                style={{ height: MAX_BAR_H }}
                title={score === null ? `${dateLabel}: No data` : `${dateLabel}: ${score}% (${day.green}/${day.total} monitors green)`}
              >
                <div className={`w-full rounded-sm transition-opacity group-hover:opacity-80 ${color}`} style={{ height: barH }} />
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-surface-elevated border border-border rounded px-2 py-1 text-xs text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow-lg">
                  {dateLabel}: {score === null ? "No data" : `${score}%`}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-xs text-text-muted">
          <span>{new Date(healthTimeline[0].date + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500 inline-block" />≥99%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-yellow-500 inline-block" />90–99%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" />&lt;90%</span>
          </span>
          <span>Today</span>
        </div>
      </Card>
    </div>
  );
}
