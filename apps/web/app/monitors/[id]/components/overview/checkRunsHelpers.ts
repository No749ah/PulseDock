export interface TimingPhase { label: string; value: number | null; color: string }

export function buildTimingPhases(timings: {
  dnsMs?: number | null;
  tcpMs?: number | null;
  tlsMs?: number | null;
  ttfbMs?: number | null;
  downloadMs?: number | null;
}): TimingPhase[] {
  return [
    { label: "DNS", value: timings.dnsMs ?? null, color: "bg-blue-500" },
    { label: "TCP", value: timings.tcpMs ?? null, color: "bg-green-500" },
    { label: "TLS", value: timings.tlsMs ?? null, color: "bg-purple-500" },
    { label: "TTFB", value: timings.ttfbMs ?? null, color: "bg-orange-500" },
    { label: "Download", value: timings.downloadMs ?? null, color: "bg-cyan-500" },
  ];
}

export function computeTotal(phases: TimingPhase[], totalMs: number | null): number {
  return totalMs ?? phases.reduce((sum, p) => sum + (p.value ?? 0), 0);
}

export function computeBarWidth(value: number, maxMs: number): number {
  return Math.max(2, (value / maxMs) * 100);
}
