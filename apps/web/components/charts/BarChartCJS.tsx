"use client";

import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

interface BarDataItem {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarDataItem[];
  height?: number;
}

export function BarChartCJS({ data, height = 200 }: BarChartProps) {
  const chartData = {
    labels: data.map((d) => d.label),
    datasets: [
      {
        data: data.map((d) => d.value),
        backgroundColor: data.map((d) => d.color ?? "#6366f1"),
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 } as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        backgroundColor: "#0d1117",
        borderColor: "#30363d",
        borderWidth: 1,
        titleColor: "#8b949e",
        bodyColor: "#e6edf3",
      },
    },
    scales: {
      x: {
        ticks: { color: "#8b949e", font: { size: 11 } },
        grid: { display: false },
        border: { color: "#30363d" },
      },
      y: {
        ticks: { color: "#8b949e", font: { size: 11 } },
        grid: { color: "#21262d" },
        border: { color: "#30363d" },
      },
    },
  };

  return (
    <div style={{ height, background: "transparent" }}>
      <Bar data={chartData} options={options} />
    </div>
  );
}
