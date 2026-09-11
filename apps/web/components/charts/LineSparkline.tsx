"use client";

import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
} from "chart.js";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler);

interface LineSparklineProps {
  data: number[];
  color?: string;
  height?: number;
}

export function LineSparkline({
  data,
  color = "#6366f1",
  height = 40,
}: LineSparklineProps) {
  if (!data || data.length === 0) {
    return <div style={{ height }} className="flex items-center"><div className="w-full border-t border-dashed border-[#30363d]" /></div>;
  }

  const chartData = {
    labels: data.map((_, i) => i),
    datasets: [
      {
        data,
        borderColor: color,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.4,
        fill: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 } as const,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
    scales: {
      x: { display: false },
      y: { display: false },
    },
    elements: {
      point: { radius: 0 },
    },
  };

  return (
    <div style={{ height, minWidth: 60 }}>
      <Line data={chartData} options={options} />
    </div>
  );
}
