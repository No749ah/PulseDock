// Metric widgets — gauges, stats grids, sparklines, progress rings
import React from "react";
import {
  type WidgetProps,
  TrendArrow,
  WidgetCard,
} from "./shared";

export function Gauge({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    value: number;
    metricType: string;
    label: string;
    thresholds: { green: number; yellow: number };
  } | undefined;

  const title = (widget.config.label as string) || "Gauge";

  if (!raw) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center text-sm text-text-secondary">
        {title}
      </div>
    );
  }

  const { value, thresholds } = raw;
  const color = value >= thresholds.green ? "#4ade80" : value >= thresholds.yellow ? "#facc15" : "#f87171";

  // SVG semicircle gauge: arc from 180° → 0° (left → right)
  // radius=70, center at (100, 100), arc: 0=left (180°), 100=right (0°)
  const R = 70;
  const cx = 100;
  const cy = 100;
  const clampedValue = Math.min(Math.max(value, 0), 100);
  // Angle in radians: 0% = π (left), 100% = 0 (right)
  const startAngle = Math.PI;
  const endAngle = 0;
  const valueAngle = startAngle - (clampedValue / 100) * Math.PI; // goes from π to 0

  const polarToXY = (angle: number, r: number) => ({
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  });

  const arcPath = (fromAngle: number, toAngle: number, r: number) => {
    const start = polarToXY(fromAngle, r);
    const end = polarToXY(toAngle, r);
    const largeArc = fromAngle - toAngle > Math.PI ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };

  // Background arc: full semicircle (180° to 0°)
  const bgPath = arcPath(Math.PI, 0, R);
  // Foreground arc: from 180° to valueAngle
  const fgPath = clampedValue > 0 ? arcPath(Math.PI, valueAngle, R) : "";

  // Needle: from center toward valueAngle
  const needleTip = polarToXY(valueAngle, R - 8);
  const needleBase1 = polarToXY(valueAngle + 0.15, 12);
  const needleBase2 = polarToXY(valueAngle - 0.15, 12);

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 flex flex-col items-center space-y-2">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <svg viewBox="0 10 200 110" className="w-full max-w-[220px]" role="img" aria-label={`${title}: ${value.toFixed(1)}%`}>
        <title>{`${title}: ${value.toFixed(1)}%`}</title>
        {/* Background arc */}
        <path d={bgPath} fill="none" stroke="#374151" strokeWidth={14} strokeLinecap="round" />
        {/* Colored foreground arc */}
        {fgPath && (
          <path d={fgPath} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />
        )}
        {/* Needle */}
        <polygon
          points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
          fill={color}
          opacity={0.9}
        />
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={5} fill={color} />
        {/* Value text */}
        <text x={cx} y={cy - 14} textAnchor="middle" fill="white" fontSize={22} fontWeight="bold" fontFamily="monospace">
          {value.toFixed(1)}
        </text>
        <text x={cx} y={cy - 2} textAnchor="middle" fill="#9ca3af" fontSize={10}>
          %
        </text>
      </svg>
      <div className="text-xs text-text-secondary text-center">{raw.label}</div>
      <div className="flex items-center gap-3 text-[10px] text-text-muted">
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1 align-middle" />
          &lt;{thresholds.yellow}%
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1 align-middle" />
          {thresholds.yellow}–{thresholds.green}%
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1 align-middle" />
          ≥{thresholds.green}%
        </span>
      </div>
    </div>
  );
}

// ── Stats Grid ───────────────────────────────────────────────────────────


export function StatsGrid({ widget, extra }: WidgetProps) {
  const raw = extra.widgetDataById?.[widget.id] as {
    stats: Array<{
      key: string;
      label: string;
      value: string;
      icon: string;
      trend?: string;
      trendDir?: "up" | "down";
    }>;
  } | undefined;

  const title = (widget.config.label as string) || "Stats Grid";
  const visibleKeys = widget.config.visibleStats as string[] | undefined;

  if (!raw?.stats?.length) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center text-sm text-text-secondary">
        {title} — no data
      </div>
    );
  }

  const stats = visibleKeys?.length
    ? raw.stats.filter((s) => visibleKeys.includes(s.key))
    : raw.stats;

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {stats.map((stat) => (
          <div
            key={stat.key}
            className="rounded-lg border border-border/60 bg-white/3 backdrop-blur-sm p-3 space-y-1 hover:bg-white/5 transition-colors"
            style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.2)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-base leading-none">{stat.icon}</span>
              {stat.trend && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${stat.trendDir === "down" ? "bg-red-500/15 text-red-400" : "bg-green-500/15 text-green-400"}`}>
                  {stat.trendDir === "down" ? "↓" : "↑"} {stat.trend}
                </span>
              )}
            </div>
            <div className="text-lg font-bold text-text-primary tabular-nums leading-tight">{stat.value}</div>
            <div className="text-[10px] text-text-secondary leading-tight">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Metric Comparison Row ────────────────────────────────────────────────


export function MetricComparisonRow({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    metrics: Array<{
      key: string;
      label: string;
      value: string;
      unit: string;
      color: "green" | "yellow" | "red" | "blue" | "default";
    }>;
  } | undefined;

  const title = (widget.config.label as string) || "Metrics";

  if (!data?.metrics?.length) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center text-sm text-text-secondary">
        {title} — no data
      </div>
    );
  }

  const colorMap: Record<string, string> = {
    green: "text-green-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
    blue: "text-blue-400",
    default: "text-text-primary",
  };

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="grid grid-cols-2 sm:flex sm:flex-row gap-3">
        {data.metrics.map((m) => (
          <div
            key={m.key}
            className="flex-1 rounded-lg border border-border/60 bg-white/3 backdrop-blur-sm p-3 space-y-1 text-center"
          >
            <div className="text-[10px] text-text-secondary uppercase tracking-wider leading-tight">{m.label}</div>
            <div className={`text-2xl font-bold tabular-nums leading-tight ${colorMap[m.color] ?? colorMap.default}`}>
              {m.value}
              {m.unit && <span className="text-sm font-normal ml-0.5 text-text-secondary">{m.unit}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sparkline Row ────────────────────────────────────────────────────────


function MiniSparkline({ dataPoints, color }: { dataPoints: number[]; color: string }) {
  const points = dataPoints.length > 0 ? dataPoints : [0];
  const w = 80;
  const h = 40;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = points.length > 1 ? w / (points.length - 1) : w;

  const coords = points.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden="true">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}


export function SparklineRow({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    monitors: Array<{
      id: string;
      name: string;
      dataPoints: number[];
      avgMs: number;
      status: "up" | "down" | "degraded";
    }>;
  } | undefined;

  const title = (widget.config.label as string) || "Sparklines";

  if (!data?.monitors?.length) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center text-sm text-text-secondary">
        {title} — no data
      </div>
    );
  }

  const statusColor = (s: "up" | "down" | "degraded") =>
    s === "up" ? "#4ade80" : s === "degraded" ? "#facc15" : "#f87171";
  const statusDot = (s: "up" | "down" | "degraded") =>
    s === "up" ? "bg-green-400" : s === "degraded" ? "bg-yellow-400" : "bg-red-400";

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="flex flex-wrap gap-3">
        {data.monitors.map((m) => (
          <div
            key={m.id}
            className="flex-1 min-w-[120px] rounded-lg border border-border/60 bg-white/3 p-3 space-y-1"
          >
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full flex-shrink-0 ${statusDot(m.status)}`} />
              <span className="text-xs font-medium text-text-primary truncate">{m.name}</span>
            </div>
            <div className="flex justify-center">
              <MiniSparkline dataPoints={m.dataPoints} color={statusColor(m.status)} />
            </div>
            <div className="text-[10px] text-text-secondary text-center">
              avg {m.avgMs > 0 ? `${m.avgMs}ms` : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Progress Ring ────────────────────────────────────────────────────────


export function ProgressRing({ widget, extra }: WidgetProps) {
  const data = extra.widgetDataById[widget.id] as {
    value: number;
    label: string;
    color: "green" | "yellow" | "red";
  } | undefined;

  const title = (widget.config.label as string) || "Progress Ring";

  if (data === undefined) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-center text-sm text-text-secondary">
        {title} — no data
      </div>
    );
  }

  const { value, label, color } = data;
  const radius = 54;
  const cx = 70;
  const cy = 70;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, value));
  const strokeDashoffset = circumference * (1 - pct / 100);

  const strokeColor =
    color === "green" ? "#4ade80" : color === "yellow" ? "#facc15" : "#f87171";

  const periodDays = (widget.config.periodDays as number) ?? 30;
  const metricType = (widget.config.metricType as string) ?? "uptime";
  const periodLabel = metricType === "custom" ? "" : `Last ${periodDays}d`;

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 flex flex-col items-center space-y-2">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <svg width={140} height={140} viewBox="0 0 140 140" role="img" aria-label={`${title}: ${pct.toFixed(1)}% ${label}`}>
        <title>{`${title}: ${pct.toFixed(1)}% ${label}`}</title>
        {/* Track */}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={12} />
        {/* Progress */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        {/* Center value */}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="white" fontSize={22} fontWeight="bold" fontFamily="monospace">
          {value.toFixed(value % 1 === 0 ? 0 : 1)}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="white" fontSize={12} opacity={0.7}>
          %
        </text>
        <text x={cx} y={cy + 26} textAnchor="middle" fill="#9ca3af" fontSize={9}>
          {label}
        </text>
      </svg>
      {periodLabel && (
        <div className="text-[10px] text-text-secondary">{periodLabel}</div>
      )}
    </div>
  );
}

// ── Announcement Bar ─────────────────────────────────────────────────────

