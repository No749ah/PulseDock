import { PrismaService } from '../../common/prisma.service';
import { RedisCacheService } from '../../common/redis-cache.service';
import { Widget } from '../status-pages.types';

export async function resolvePerformanceWidget(
  prisma: PrismaService,
  _cache: RedisCacheService,
  userId: string,
  widget: Widget,
  _overrideDays: number | undefined,
): Promise<Record<string, unknown>> {
  const monitorId = widget.config.monitorId as string | undefined;

  switch (widget.type) {
    case 'response-time-chart': {
      if (!monitorId) return { _noConfig: true };
      const points = Math.min(Math.max((widget.config.points as number) ?? 60, 10), 200);
      const periodHours = (widget.config.periodHours as number) ?? 0;
      let where: Record<string, unknown> = { monitorId };
      if (periodHours > 0) {
        const since = new Date(Date.now() - periodHours * 3_600_000);
        where = { monitorId, checkedAt: { gte: since } };
      }
      const runs = await prisma.monitorRun.findMany({
        where,
        select: { checkedAt: true, latencyMs: true, level: true },
        orderBy: { checkedAt: 'desc' },
        take: points,
      });
      runs.reverse();
      const dataPoints = runs.map((r: { checkedAt: unknown; latencyMs: number | null; level: string }) => ({
        t: (r.checkedAt as Date).toISOString(),
        ms: r.latencyMs,
        ok: r.level !== 'red',
      }));
      const withLatency = dataPoints.filter((d) => d.ms !== null);
      const avgMs =
        withLatency.length > 0
          ? Math.round(withLatency.reduce((s, d) => s + (d.ms as number), 0) / withLatency.length)
          : null;
      const p95Ms =
        withLatency.length > 0
          ? (() => {
              const sorted = [...withLatency].sort((a, b) => (a.ms as number) - (b.ms as number));
              const idx = Math.floor(sorted.length * 0.95);
              return sorted[idx]?.ms ?? sorted[sorted.length - 1]?.ms ?? null;
            })()
          : null;
      const maxMs = withLatency.length > 0 ? Math.max(...withLatency.map((d) => d.ms as number)) : null;
      return { monitorId, dataPoints, avgMs, p95Ms, maxMs , fetchedAt: new Date().toISOString()};
    }

    case 'response-time-heatmap': {
      if (!monitorId) return { _noConfig: true };
      const periodDays = Math.min(Math.max((widget.config.periodDays as number) ?? 90, 7), 365);
      const since = new Date(Date.now() - periodDays * 86_400_000);
      const runs = await prisma.monitorRun.findMany({
        where: { monitorId, checkedAt: { gte: since }, latencyMs: { not: null } },
        select: { checkedAt: true, latencyMs: true },
        orderBy: { checkedAt: 'desc' },
        take: 10_000,
      });

      const cells: Array<Array<{ sum: number; count: number }>> =
        Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ sum: 0, count: 0 })));

      for (const run of runs) {
        const d = run.checkedAt as Date;
        const dow = d.getUTCDay();
        const hour = d.getUTCHours();
        cells[dow][hour].sum += run.latencyMs as number;
        cells[dow][hour].count += 1;
      }

      const grid = cells.map((dayRow) =>
        dayRow.map((c) => (c.count > 0 ? Math.round(c.sum / c.count) : null)),
      );

      const allAvgs = grid.flat().filter((v): v is number => v !== null);
      const minMs = allAvgs.length > 0 ? Math.min(...allAvgs) : 0;
      const maxMs = allAvgs.length > 0 ? Math.max(...allAvgs) : 0;
      const avgMs = allAvgs.length > 0 ? Math.round(allAvgs.reduce((s, v) => s + v, 0) / allAvgs.length) : 0;

      return { monitorId, grid, minMs, maxMs, avgMs, periodDays , fetchedAt: new Date().toISOString()};
    }

    case 'latency-percentiles-card': {
      if (!monitorId) return { _noConfig: true };
      const periodDays = (widget.config.periodDays as number) ?? 7;
      const currentSince = new Date(Date.now() - periodDays * 86_400_000);
      const prevSince = new Date(Date.now() - 2 * periodDays * 86_400_000);
      const [currentRuns, prevRuns] = await Promise.all([
        prisma.monitorRun.findMany({
          where: { monitorId, checkedAt: { gte: currentSince }, latencyMs: { not: null } },
          select: { latencyMs: true },
        }),
        prisma.monitorRun.findMany({
          where: { monitorId, checkedAt: { gte: prevSince, lt: currentSince }, latencyMs: { not: null } },
          select: { latencyMs: true },
        }),
      ]);

      function calcPercentile(runs: { latencyMs: number | null }[], pct: number): number | null {
        const sorted = runs
          .map((r) => r.latencyMs as number)
          .filter((v) => v !== null)
          .sort((a, b) => a - b);
        if (sorted.length === 0) return null;
        const idx = Math.floor(sorted.length * pct);
        return sorted[Math.min(idx, sorted.length - 1)];
      }

      return {
        monitorId,
        periodDays,
        p50: calcPercentile(currentRuns, 0.5),
        p95: calcPercentile(currentRuns, 0.95),
        p99: calcPercentile(currentRuns, 0.99),
        prevP50: calcPercentile(prevRuns, 0.5),
        prevP95: calcPercentile(prevRuns, 0.95),
        prevP99: calcPercentile(prevRuns, 0.99),
        sampleCount: currentRuns.length,
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'performance-trend': {
      if (!monitorId) return { _noConfig: true };
      const days = 14;
      const since = new Date(Date.now() - days * 86_400_000);

      const runs = await prisma.monitorRun.findMany({
        where: { monitorId, checkedAt: { gte: since }, latencyMs: { not: null } },
        select: { latencyMs: true, checkedAt: true },
        orderBy: { checkedAt: 'asc' },
      });

      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);

      const dailyBuckets: { sum: number; count: number }[] = Array.from({ length: days }, () => ({ sum: 0, count: 0 }));

      for (const run of runs) {
        const d = run.checkedAt as Date;
        const diffMs = todayStart.getTime() - d.getTime();
        const diffDays = Math.floor(diffMs / 86_400_000);
        const dayIndex = days - 1 - diffDays;
        if (dayIndex < 0 || dayIndex >= days) continue;
        dailyBuckets[dayIndex].sum += run.latencyMs ?? 0;
        dailyBuckets[dayIndex].count++;
      }

      const dataPoints = dailyBuckets.map((b) => (b.count > 0 ? Math.round(b.sum / b.count) : 0));

      const lastWeekRuns = dataPoints.slice(0, 7).filter((v) => v > 0);
      const thisWeekRuns = dataPoints.slice(7).filter((v) => v > 0);

      const avgMs = (arr: number[]) =>
        arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;

      const thisWeekAvg = avgMs(thisWeekRuns);
      const lastWeekAvg = avgMs(lastWeekRuns);

      let changePercent = 0;
      let trend: 'up' | 'down' | 'stable' = 'stable';

      if (lastWeekAvg > 0) {
        changePercent = Math.round(((thisWeekAvg - lastWeekAvg) / lastWeekAvg) * 1000) / 10;
        if (Math.abs(changePercent) < 1) trend = 'stable';
        else if (thisWeekAvg > lastWeekAvg) trend = 'up';
        else trend = 'down';
      }

      return { thisWeekAvg, lastWeekAvg, changePercent, trend, dataPoints , fetchedAt: new Date().toISOString()};
    }

    case 'apdex-score': {
      if (!monitorId) return { _noConfig: true };
      const periodDays = Math.min(Math.max((widget.config.periodDays as number) ?? 7, 1), 90);
      const satisfiedThresholdMs = (widget.config.satisfiedThresholdMs as number) ?? 200;
      const toleratingThresholdMs = (widget.config.toleratingThresholdMs as number) ?? 800;
      const since = new Date(Date.now() - periodDays * 86_400_000);

      const runs = await prisma.monitorRun.findMany({
        where: { monitorId, checkedAt: { gte: since }, latencyMs: { not: null } },
        select: { latencyMs: true },
      });

      if (runs.length === 0) {
        return { score: null, satisfied: 0, tolerating: 0, frustrated: 0, total: 0, rating: null, fetchedAt: new Date().toISOString() };
      }

      let satisfied = 0;
      let tolerating = 0;
      let frustrated = 0;

      for (const run of runs) {
        const ms = run.latencyMs ?? 0;
        if (ms < satisfiedThresholdMs) satisfied++;
        else if (ms < toleratingThresholdMs) tolerating++;
        else frustrated++;
      }

      const total = runs.length;
      const score = Math.round(((satisfied + tolerating / 2) / total) * 100) / 100;

      let rating: string;
      if (score >= 0.94) rating = 'Excellent';
      else if (score >= 0.85) rating = 'Good';
      else if (score >= 0.70) rating = 'Fair';
      else if (score >= 0.50) rating = 'Poor';
      else rating = 'Unacceptable';

      return { score, satisfied, tolerating, frustrated, total, rating , fetchedAt: new Date().toISOString()};
    }

    case 'throughput-counter': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const since = new Date(Date.now() - 24 * 3_600_000);

      const where = monitorIds?.length
        ? { monitorId: { in: monitorIds }, checkedAt: { gte: since } }
        : { monitor: { userId }, checkedAt: { gte: since } };

      const runs = await prisma.monitorRun.findMany({
        where,
        select: { checkedAt: true },
        orderBy: { checkedAt: 'asc' },
      });

      const hourBuckets = new Map<string, number>();
      for (const run of runs) {
        const d = run.checkedAt as Date;
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}`;
        hourBuckets.set(key, (hourBuckets.get(key) ?? 0) + 1);
      }

      const nowMs = Date.now();
      const dataPoints: { hour: string; count: number }[] = [];
      for (let h = 23; h >= 0; h--) {
        const slotMs = nowMs - h * 3_600_000;
        const slotDate = new Date(slotMs);
        const key = `${slotDate.getUTCFullYear()}-${String(slotDate.getUTCMonth() + 1).padStart(2, '0')}-${String(slotDate.getUTCDate()).padStart(2, '0')}T${String(slotDate.getUTCHours()).padStart(2, '0')}`;
        const hour = `${String(slotDate.getUTCHours()).padStart(2, '0')}:00`;
        dataPoints.push({ hour, count: hourBuckets.get(key) ?? 0 });
      }

      const counts = dataPoints.map((p) => p.count);
      const current = counts[counts.length - 2] ?? 0;
      const average = Math.round(counts.reduce((s, v) => s + v, 0) / counts.length);
      const peak = Math.max(...counts);

      return { current, average, peak, dataPoints , fetchedAt: new Date().toISOString()};
    }

    case 'response-time-comparison': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const resolvedIds = monitorIds?.length
        ? monitorIds.slice(0, 8)
        : monitorId ? [monitorId] : [];
      if (resolvedIds.length === 0) return { _noConfig: true };

      const points = Math.min(Math.max((widget.config.points as number) ?? 24, 5), 100);
      const periodHours = (widget.config.periodHours as number) ?? 0;
      const PALETTE = ['#60a5fa', '#34d399', '#f472b6', '#fb923c', '#a78bfa', '#facc15', '#38bdf8', '#f87171'];

      const monitorsDb = await prisma.monitor.findMany({
        where: { id: { in: resolvedIds }, userId },
        select: { id: true, name: true },
      });

      const monitorDataList = await Promise.all(
        monitorsDb.map(async (m, idx) => {
          let where: Record<string, unknown> = { monitorId: m.id };
          if (periodHours > 0) {
            const since = new Date(Date.now() - periodHours * 3_600_000);
            where = { monitorId: m.id, checkedAt: { gte: since } };
          }
          const runs = await prisma.monitorRun.findMany({
            where,
            select: { latencyMs: true, checkedAt: true },
            orderBy: { checkedAt: 'desc' },
            take: points,
          });
          runs.reverse();
          return {
            id: m.id,
            name: m.name,
            color: PALETTE[idx % PALETTE.length],
            dataPoints: runs.map((r) => r.latencyMs ?? 0),
            timestamps: runs.map((r) => (r.checkedAt as Date).toISOString()),
          };
        }),
      );

      const longestData = monitorDataList.reduce((a, b) => (a.timestamps.length >= b.timestamps.length ? a : b), monitorDataList[0]);
      const labels = longestData.timestamps.map((ts) => {
        const d = new Date(ts);
        return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
      });

      return {
        monitors: monitorDataList.map(({ timestamps: _, ...m }) => m),
        labels,
        periodHours: periodHours || Math.round(points / 2),
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'check-history-feed': {
      const checks = await prisma.monitorRun.findMany({
        where: { userId },
        orderBy: { checkedAt: 'desc' },
        take: 50,
        include: { monitor: { select: { name: true } } },
      });
      return {
        checks: checks.map((c) => ({
          id: c.id,
          monitorId: c.monitorId,
          monitorName: c.monitor.name,
          checkedAt: c.checkedAt.toISOString(),
          ok: c.ok,
          level: c.level,
          latencyMs: c.latencyMs,
          message: c.message,
        })),
        fetchedAt: new Date().toISOString(),
      };
    }

    default:
      return { widgetType: widget.type, message: 'Widget data not yet implemented for this type' };
  }
}
