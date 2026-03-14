"use client";

interface ResponseTimeRun {
  ok: boolean;
  checkedAt: string;
  latencyMs: number | null;
}

interface ResponseTimeChartProps {
  runs: ResponseTimeRun[];
  height?: number;
}

export function ResponseTimeChart({ runs, height = 80 }: ResponseTimeChartProps) {
  const viewWidth = 600;
  const last50 = runs.slice(0, 50).reverse(); // oldest first
  const N = last50.length;

  const withLatency = last50.filter((r) => r.latencyMs !== null);
  const allNull = withLatency.length === 0;

  if (N === 0 || allNull) {
    return (
      <svg
        viewBox={`0 0 ${viewWidth} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        aria-label="No latency data"
      >
        <text
          x={viewWidth / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#6b7280"
          fontSize={12}
        >
          No latency data
        </text>
      </svg>
    );
  }

  const maxLatency = Math.max(...withLatency.map((r) => r.latencyMs as number));
  const avgLatency = Math.round(
    withLatency.reduce((sum, r) => sum + (r.latencyMs as number), 0) / withLatency.length
  );

  const gap = 2;
  const barWidth = (viewWidth - (N - 1) * gap) / N;
  const avgLineY = maxLatency > 0 ? height - (avgLatency / maxLatency) * height : height / 2;

  return (
    <svg
      viewBox={`0 0 ${viewWidth} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      aria-label={`Response time chart, avg ${avgLatency}ms`}
    >
      <title>{`Response time chart, avg ${avgLatency}ms`}</title>

      {last50.map((run, i) => {
        const x = i * (barWidth + gap);
        const barFill =
          run.latencyMs === null
            ? "#6b7280"
            : run.ok
            ? "#22c55e"
            : "#ef4444";
        const barH =
          run.latencyMs === null || maxLatency === 0
            ? 4
            : Math.max(2, (run.latencyMs / maxLatency) * height);
        const y = height - barH;

        return (
          <rect key={i} x={x} y={y} width={barWidth} height={barH} fill={barFill} rx={1}>
            <title>{run.latencyMs !== null ? `${run.latencyMs}ms` : "N/A"}</title>
          </rect>
        );
      })}

      {/* Dashed average line */}
      <line
        x1={0}
        y1={avgLineY}
        x2={viewWidth}
        y2={avgLineY}
        stroke="#94a3b8"
        strokeWidth={1}
        strokeDasharray="4 3"
      />

      {/* Avg label — top right, rendered in a fixed coordinate space */}
      <svg x={0} y={0} width={viewWidth} height={height} viewBox={`0 0 ${viewWidth} ${height}`} preserveAspectRatio="xMidYMid meet">
        <text
          x={viewWidth - 4}
          y={10}
          textAnchor="end"
          fill="#94a3b8"
          fontSize={10}
          fontFamily="monospace"
        >
          avg {avgLatency}ms
        </text>
      </svg>
    </svg>
  );
}
