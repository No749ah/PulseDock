"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  AreaChart,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  Bar,
  Area,
  CartesianGrid,
} from "recharts";

interface CustomMetricChartProps {
  data: {
    labels: string[];
    values: number[];
    unit: string;
    chartType: string;
  } | undefined;
  title?: string;
  subtitle?: string;
  chartType?: string;
}

interface TooltipPayloadItem {
  value: number;
  name?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  unit: string;
}

function CustomTooltip({ active, payload, label, unit }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="text-text-secondary mb-1">{label}</p>
      <p className="font-semibold text-text-primary">
        {payload[0]?.value?.toFixed(unit === "%" ? 2 : 0)}
        <span className="ml-1 font-normal text-text-secondary">{unit}</span>
      </p>
    </div>
  );
}

export function CustomMetricChart({ data, title, subtitle, chartType }: CustomMetricChartProps) {
  const resolvedChartType = chartType ?? data?.chartType ?? "line";

  if (!data || data.labels.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        {title && (
          <div className="mb-3">
            <p className="text-sm font-semibold text-text-primary">{title}</p>
            {subtitle && <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>}
          </div>
        )}
        <div className="flex h-32 items-center justify-center rounded-lg bg-bg/40">
          <p className="text-xs text-text-secondary">No data available</p>
        </div>
      </div>
    );
  }

  const chartData = data.labels.map((label, i) => ({
    label,
    value: data.values[i] ?? 0,
  }));

  const unit = data.unit;
  const tickFormatter = (v: number) => {
    if (unit === "%") return `${v}%`;
    if (unit === "ms") return `${v}`;
    return String(v);
  };

  const stroke = "#6366f1"; // accent indigo
  const fill = "#6366f1";

  const commonProps = {
    data: chartData,
    margin: { top: 4, right: 8, left: 0, bottom: 0 },
  };

  const xAxis = (
    <XAxis
      dataKey="label"
      tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
      tickLine={false}
      axisLine={false}
      interval="preserveStartEnd"
    />
  );

  const yAxis = (
    <YAxis
      tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
      tickLine={false}
      axisLine={false}
      tickFormatter={tickFormatter}
      width={unit === "%" ? 40 : 36}
    />
  );

  const grid = (
    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
  );

  const tooltipEl = (
    <Tooltip
      content={<CustomTooltip unit={unit} />}
      cursor={{ fill: "rgba(255,255,255,0.04)" }}
    />
  );

  let chart: React.ReactNode;
  if (resolvedChartType === "bar") {
    chart = (
      <BarChart {...commonProps}>
        {grid}
        {xAxis}
        {yAxis}
        {tooltipEl}
        <Bar dataKey="value" fill={fill} opacity={0.8} radius={[2, 2, 0, 0]} />
      </BarChart>
    );
  } else if (resolvedChartType === "area") {
    chart = (
      <AreaChart {...commonProps}>
        {grid}
        {xAxis}
        {yAxis}
        {tooltipEl}
        <defs>
          <linearGradient id="cmcGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={fill} stopOpacity={0.3} />
            <stop offset="95%" stopColor={fill} stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={1.5}
          fill="url(#cmcGradient)"
          dot={false}
          activeDot={{ r: 3, fill: stroke }}
        />
      </AreaChart>
    );
  } else {
    // line (default)
    chart = (
      <LineChart {...commonProps}>
        {grid}
        {xAxis}
        {yAxis}
        {tooltipEl}
        <Line
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3, fill: stroke }}
        />
      </LineChart>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {(title || subtitle) && (
        <div className="mb-3">
          {title && <p className="text-sm font-semibold text-text-primary">{title}</p>}
          {subtitle && <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>}
        </div>
      )}
      <div className="h-36" style={{ minHeight: 144 }}>
        <ResponsiveContainer width="100%" height="100%" minHeight={144}>
          {chart as React.ReactElement}
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-text-muted">
        <span>{data.labels[0]}</span>
        <span className="capitalize">{resolvedChartType} chart · {unit}</span>
        <span>{data.labels[data.labels.length - 1]}</span>
      </div>
    </div>
  );
}
