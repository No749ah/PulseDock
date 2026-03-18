"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface DataPoint {
  time: string;
  value: number;
  ok?: boolean;
}

interface AreaChartProps {
  data: DataPoint[];
  height?: number;
  color?: string;
  showGrid?: boolean;
  showTooltip?: boolean;
  avgLine?: number;
  p95Line?: number;
  unit?: string;
  className?: string;
}

interface TooltipPayloadItem {
  value: number;
  payload: DataPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  unit: string;
}

function CustomTooltip({ active, payload, label, unit }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0];
  const ok = point.payload.ok;
  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-[#8b949e] mb-1">{label}</p>
      <p
        className="font-semibold"
        style={{ color: ok === false ? "#f85149" : "#58a6ff" }}
      >
        {point.value}
        {unit}
      </p>
    </div>
  );
}

export function ResponseAreaChart({
  data,
  height = 160,
  color = "#58a6ff",
  showGrid = true,
  showTooltip = true,
  avgLine,
  p95Line,
  unit = "ms",
  className,
}: AreaChartProps) {
  const gradientId = `area-gradient-${color.replace("#", "")}`;

  if (data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-xs text-[#8b949e] ${className ?? ""}`}
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {showGrid && (
            <CartesianGrid stroke="#1e2d3d" strokeDasharray="3 3" vertical={false} />
          )}

          <XAxis
            dataKey="time"
            tick={{ fill: "#8b949e", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "#8b949e", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={35}
            tickFormatter={(v: number) => `${v}`}
          />

          {showTooltip && (
            <Tooltip
              content={<CustomTooltip unit={unit} />}
              cursor={{ stroke: "#30363d", strokeWidth: 1 }}
            />
          )}

          {avgLine !== undefined && (
            <ReferenceLine
              y={avgLine}
              stroke="#8b949e"
              strokeDasharray="4 3"
              label={{
                value: `avg ${avgLine}${unit}`,
                fill: "#8b949e",
                fontSize: 9,
                position: "insideTopRight",
              }}
            />
          )}

          {p95Line !== undefined && (
            <ReferenceLine
              y={p95Line}
              stroke="#e3b341"
              strokeDasharray="4 3"
              label={{
                value: `p95 ${p95Line}${unit}`,
                fill: "#e3b341",
                fontSize: 9,
                position: "insideTopRight",
              }}
            />
          )}

          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
