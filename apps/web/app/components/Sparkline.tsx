"use client";

interface SparklineRun {
  ok: boolean;
  checkedAt: string;
  latencyMs?: number | null;
}

interface SparklineProps {
  runs: SparklineRun[];
  width?: number;
  height?: number;
}

export function Sparkline({ runs, width = 120, height = 32 }: SparklineProps) {
  const last30 = runs.slice(0, 30).reverse(); // oldest first
  const N = last30.length;

  if (N === 0) {
    // Empty state: dashed horizontal line at mid-height
    const midY = height / 2;
    return (
      <svg width={width} height={height} aria-label="No check history">
        <line
          x1={0}
          y1={midY}
          x2={width}
          y2={midY}
          stroke="#6b7280"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
      </svg>
    );
  }

  const gap = 1;
  const barWidth = (width - (N - 1) * gap) / N;
  const passing = last30.filter((r) => r.ok).length;

  return (
    <svg width={width} height={height} aria-label={`${passing}/${N} passing`}>
      <title>{`${passing}/${N} passing`}</title>
      {last30.map((run, i) => {
        const x = i * (barWidth + gap);
        const barHeight = run.ok ? height : height / 2;
        const y = height - barHeight;
        const fill = run.ok ? "#22c55e" : "#ef4444";
        const opacity = run.ok ? 0.7 : 0.8;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            fill={fill}
            fillOpacity={opacity}
            rx={1}
          />
        );
      })}
    </svg>
  );
}
