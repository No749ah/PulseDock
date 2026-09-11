"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";

interface SparkDataPoint {
  value: number;
  ok?: boolean;
}

interface MiniSparklineProps {
  data: SparkDataPoint[];
  height?: number;
  color?: string;
  className?: string;
}

export function MiniSparkline({
  data,
  height = 32,
  color = "#58a6ff",
  className,
}: MiniSparklineProps) {
  if (data.length === 0) {
    return (
      <div
        className={`flex items-center ${className ?? ""}`}
        style={{ height }}
      >
        <div className="w-full border-t border-dashed border-[#30363d]" />
      </div>
    );
  }

  return (
    <div className={className} style={{ height, minHeight: typeof height === 'number' ? height : 36 }}>
      <ResponsiveContainer width="100%" height="100%" minHeight={typeof height === 'number' ? height : 36}>
        <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
