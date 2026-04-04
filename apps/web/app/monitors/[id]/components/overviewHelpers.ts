// Pure helper functions extracted from OverviewTab for testability

export const EVENT_COLORS: Record<string, string> = {
  deploy: "#3b82f6",
  incident: "#ef4444",
  maintenance: "#f59e0b",
  config: "#a855f7",
  note: "#6b7280",
};

export type DayBucket = { date: string; ok: number; total: number };

/** Build 90 consecutive UTC date buckets ending at `now` (inclusive). */
export function build90DayBuckets(now: Date): DayBucket[] {
  const days: DayBucket[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push({ date: d.toISOString().slice(0, 10), ok: 0, total: 0 });
  }
  return days;
}

export type RunLike = { checkedAt: string; ok: boolean };

/** Fill day buckets from check runs. Mutates the provided bucket array. */
export function fillDayBuckets(days: DayBucket[], runs: RunLike[]): void {
  const dayMap = new Map(days.map((d) => [d.date, d]));
  for (const r of runs) {
    const dayKey = new Date(r.checkedAt).toISOString().slice(0, 10);
    const bucket = dayMap.get(dayKey);
    if (bucket) {
      bucket.total++;
      if (r.ok) bucket.ok++;
    }
  }
}

/** Get Tailwind color class for a 90-day calendar cell. */
export function calendarCellColor(day: DayBucket | null): string {
  if (!day || day.total === 0) return "bg-surface-elevated";
  const pct = day.ok / day.total;
  if (pct >= 1) return "bg-green-500/80";
  if (pct >= 0.9) return "bg-green-500/50";
  if (pct >= 0.5) return "bg-yellow-500/60";
  return "bg-red-500/70";
}

/** Build ISO-10 tooltip string for a calendar cell. */
export function calendarCellTooltip(day: DayBucket | null): string {
  if (!day) return "";
  if (day.total === 0) return `${day.date}: no data`;
  const pct = day.total > 0 ? Math.round((day.ok / day.total) * 100) : 0;
  return `${day.date}: ${pct}% uptime (${day.ok}/${day.total} ok)`;
}

/** Arrange 90 day buckets into calendar weeks (Sun-first grid). Pads start + end with nulls. */
export function buildCalendarWeeks(days: DayBucket[]): (DayBucket | null)[][] {
  const weeks: (DayBucket | null)[][] = [];
  let week: (DayBucket | null)[] = [];
  const firstDay = new Date(days[0].date + "T00:00:00Z");
  const startPad = firstDay.getUTCDay();
  for (let i = 0; i < startPad; i++) week.push(null);
  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

export type ChartPoint = { ts: string; avgLatencyMs: number | null; p95LatencyMs: number | null; uptimePct: number };
export type EventLike = { createdAt: string; eventType: string };
export type MappedPoint = { time: string; value: number; ok: boolean; checkedAt: string };

/** Compute average latency from chart data, or undefined if no valid points. */
export function computeChartAvg(chartData: ChartPoint[]): number | undefined {
  const valid = chartData.filter((pt) => pt.avgLatencyMs !== null);
  if (valid.length === 0) return undefined;
  const avg = valid.reduce((s, pt) => s + (pt.avgLatencyMs ?? 0), 0) / valid.length;
  return avg > 0 ? Math.round(avg) : undefined;
}

/** Compute P95 average from chart data, or undefined if no valid points. */
export function computeChartP95(chartData: ChartPoint[]): number | undefined {
  const valid = chartData.filter((pt) => pt.p95LatencyMs !== null).map((pt) => pt.p95LatencyMs as number);
  if (valid.length === 0) return undefined;
  return Math.round(valid.reduce((s, v) => s + v, 0) / valid.length);
}

/** Find the closest mapped data point (by timestamp) to a given event, for chart mark placement. */
export function findClosestPoint(mappedData: MappedPoint[], eventTs: string): MappedPoint | undefined {
  if (mappedData.length === 0) return undefined;
  const evTime = new Date(eventTs).getTime();
  let closest = mappedData[0];
  let minDiff = Infinity;
  for (const pt of mappedData) {
    const diff = Math.abs(new Date(pt.checkedAt).getTime() - evTime);
    if (diff < minDiff) {
      minDiff = diff;
      closest = pt;
    }
  }
  return closest;
}

/** Build chart event marks from events + mapped data (within chart time range). */
export function buildChartMarks(
  events: EventLike[],
  mappedData: MappedPoint[],
): Array<{ xValue: string; color: string; label: string }> {
  if (mappedData.length === 0 || events.length === 0) return [];
  const chartStart = new Date(mappedData[0].checkedAt).getTime();
  const chartEnd = new Date(mappedData[mappedData.length - 1].checkedAt).getTime();
  return events
    .filter((ev) => {
      const t = new Date(ev.createdAt).getTime();
      return t >= chartStart && t <= chartEnd;
    })
    .map((ev) => {
      const closest = findClosestPoint(mappedData, ev.createdAt);
      return {
        xValue: closest?.time ?? "",
        color: EVENT_COLORS[ev.eventType] ?? EVENT_COLORS.note,
        label: ev.eventType.slice(0, 4),
      };
    });
}
