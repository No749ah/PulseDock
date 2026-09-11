"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface BarDataPoint {
  time: string;
  value: number;
  ok: boolean;
}

interface CheckBarChartProps {
  data: BarDataPoint[];
  height?: number;
  className?: string;
}

interface TooltipPayloadItem {
  value: number;
  payload: BarDataPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0];
  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-[#8b949e] mb-1">{point.payload.time}</p>
      <p
        className="font-semibold"
        style={{ color: point.payload.ok ? "#3fb950" : "#f85149" }}
      >
        {point.payload.ok ? "OK" : "Failed"}
      </p>
      {point.value > 0 && (
        <p className="text-[#8b949e] mt-0.5">{point.value}ms</p>
      )}
    </div>
  );
}

export function CheckBarChart({ data, height = 80, className }: CheckBarChartProps) {
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
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="20%">
          <XAxis dataKey="time" hide />
          <YAxis hide />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false} minPointSize={4}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.ok ? "#3fb950" : "#f85149"}
                opacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
