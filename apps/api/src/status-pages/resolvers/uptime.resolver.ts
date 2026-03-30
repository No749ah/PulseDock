import { PrismaService } from '../../common/prisma.service';
import { RedisCacheService } from '../../common/redis-cache.service';
import { Widget } from '../status-pages.types';

export async function resolveUptimeWidget(
  prisma: PrismaService,
  _cache: RedisCacheService,
  userId: string,
  widget: Widget,
  overrideDays: number | undefined,
): Promise<Record<string, unknown>> {
  const monitorId = widget.config.monitorId as string | undefined;

  switch (widget.type) {
    case 'uptime-bar': {
      if (!monitorId) return { _noConfig: true };
      const periodDays = overrideDays ?? (widget.config.periodDays as number) ?? 30;
      const since = new Date(Date.now() - periodDays * 86_400_000);
      const runs = await prisma.monitorRun.findMany({
        where: { monitorId, checkedAt: { gte: since } },
        select: { level: true },
      });
      const total = runs.length;
      const up = runs.filter((r: { level: string }) => r.level === 'green').length;
      const uptimePct = total > 0 ? Math.round((up / total) * 10000) / 100 : 100;
      const latest = await prisma.monitorRun.findFirst({
        where: { monitorId },
        orderBy: { checkedAt: 'desc' },
        select: { checkedAt: true },
      });
      return { monitorId, uptimePct, periodDays, total, fetchedAt: new Date().toISOString(), lastChecked: latest?.checkedAt ?? null };
    }

    case 'uptime-timeline': {
      if (!monitorId) return { _noConfig: true };
      const days = overrideDays ?? Math.min(Math.max((widget.config.days as number) ?? 90, 7), 365);
      const now = new Date();
      const buckets: Array<{ date: string; level: 'green' | 'yellow' | 'red' | 'no-data' }> = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setUTCHours(0, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - i);
        buckets.push({
          date: d.toISOString().slice(0, 10),
          level: 'no-data',
        });
      }
      const since = new Date(now);
      since.setUTCHours(0, 0, 0, 0);
      since.setUTCDate(since.getUTCDate() - (days - 1));
      const runs = await prisma.monitorRun.findMany({
        where: { monitorId, checkedAt: { gte: since } },
        select: { level: true, checkedAt: true },
        orderBy: { checkedAt: 'asc' },
      });
      const byDate = new Map<string, { green: number; yellow: number; red: number }>();
      for (const run of runs) {
        const key = (run.checkedAt as Date).toISOString().slice(0, 10);
        const bucket = byDate.get(key) ?? { green: 0, yellow: 0, red: 0 };
        if (run.level === 'green') bucket.green++;
        else if (run.level === 'yellow') bucket.yellow++;
        else if (run.level === 'red') bucket.red++;
        byDate.set(key, bucket);
      }
      const timeline = buckets.map((b) => {
        const counts = byDate.get(b.date);
        if (!counts) return { date: b.date, level: 'no-data' as const };
        const total = counts.green + counts.yellow + counts.red;
        if (total === 0) return { date: b.date, level: 'no-data' as const };
        const failRate = (counts.yellow + counts.red) / total;
        const level = failRate >= 0.5 ? 'red' : failRate > 0 ? 'yellow' : 'green';
        return { date: b.date, level, counts };
      });
      return { monitorId, days, timeline , fetchedAt: new Date().toISOString()};
    }

    case 'rolling-uptime-cards': {
      if (!monitorId) return { _noConfig: true };
      const periods = [
        { label: '24h', days: 1 },
        { label: '7d', days: 7 },
        { label: '30d', days: 30 },
        { label: '90d', days: 90 },
      ];
      const maxDays = Math.max(...periods.map((p) => p.days));
      const earliestSince = new Date(Date.now() - maxDays * 86_400_000);
      const allRuns = await prisma.monitorRun.findMany({
        where: { monitorId, checkedAt: { gte: earliestSince } },
        select: { level: true, checkedAt: true },
      });
      const now = Date.now();
      const cards = periods.map(({ label, days }) => {
        const cutoff = now - days * 86_400_000;
        const runs = allRuns.filter((r) => (r.checkedAt as Date).getTime() >= cutoff);
        const total = runs.length;
        const up = runs.filter((r) => r.level === 'green').length;
        const uptimePct = total > 0 ? Math.round((up / total) * 10000) / 100 : 100;
        return { label, days, uptimePct, total };
      });
      return { monitorId, cards , fetchedAt: new Date().toISOString()};
    }

    case 'status-history-ribbon': {
      const monitorIds = (widget.config.monitorIds as string[] | undefined) ??
        (monitorId ? [monitorId] : []);
      if (monitorIds.length === 0) return { _noConfig: true };
      const days = Math.min(Math.max((widget.config.days as number) ?? 90, 7), 180);
      const since = new Date(Date.now() - days * 86_400_000);
      const runs = await prisma.monitorRun.findMany({
        where: { monitorId: { in: monitorIds }, checkedAt: { gte: since } },
        select: { monitorId: true, level: true, checkedAt: true },
        orderBy: { checkedAt: 'asc' },
      });
      const monitors = await prisma.monitor.findMany({
        where: { id: { in: monitorIds }, userId },
        select: { id: true, name: true },
      });
      const now = new Date();
      const bucketKeys: string[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setUTCHours(0, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - i);
        bucketKeys.push(d.toISOString().slice(0, 10));
      }
      const byMonitor = new Map<string, Map<string, { green: number; yellow: number; red: number }>>();
      for (const run of runs) {
        const key = (run.checkedAt as Date).toISOString().slice(0, 10);
        if (!byMonitor.has(run.monitorId)) byMonitor.set(run.monitorId, new Map());
        const mMap = byMonitor.get(run.monitorId)!;
        const bucket = mMap.get(key) ?? { green: 0, yellow: 0, red: 0 };
        if (run.level === 'green') bucket.green++;
        else if (run.level === 'yellow') bucket.yellow++;
        else if (run.level === 'red') bucket.red++;
        mMap.set(key, bucket);
      }
      const rows = monitors.map((m) => {
        const mMap = byMonitor.get(m.id);
        const ribbon = bucketKeys.map((date) => {
          const counts = mMap?.get(date);
          if (!counts) return { date, level: 'no-data' as const };
          const total = counts.green + counts.yellow + counts.red;
          if (total === 0) return { date, level: 'no-data' as const };
          const failRate = (counts.yellow + counts.red) / total;
          const level = failRate >= 0.5 ? 'red' as const : failRate > 0 ? 'yellow' as const : 'green' as const;
          return { date, level };
        });
        return { id: m.id, name: m.name, ribbon };
      });
      return { days, rows , fetchedAt: new Date().toISOString()};
    }

    case 'uptime-percentage-card': {
      if (!monitorId) return { _noConfig: true };
      const periodDays = Math.min(Math.max((widget.config.periodDays as number) ?? 30, 1), 365);
      const currentSince = new Date(Date.now() - periodDays * 86_400_000);
      const prevSince = new Date(Date.now() - 2 * periodDays * 86_400_000);
      const [currentRuns, prevRuns] = await Promise.all([
        prisma.monitorRun.findMany({
          where: { monitorId, checkedAt: { gte: currentSince } },
          select: { level: true },
        }),
        prisma.monitorRun.findMany({
          where: { monitorId, checkedAt: { gte: prevSince, lt: currentSince } },
          select: { level: true },
        }),
      ]);
      const toUptimePct = (runs: { level: string }[]) => {
        const t = runs.length;
        const u = runs.filter((r) => r.level === 'green').length;
        return t > 0 ? Math.round((u / t) * 10000) / 100 : 100;
      };
      const current = toUptimePct(currentRuns);
      const previous = toUptimePct(prevRuns);
      const trend = current > previous ? 'up' : current < previous ? 'down' : 'flat';
      const delta = Math.round((current - previous) * 100) / 100;
      return { monitorId, periodDays, uptimePct: current, previousPct: previous, trend, delta , fetchedAt: new Date().toISOString()};
    }

    case 'uptime-heatmap': {
      if (!monitorId) return { _noConfig: true };
      const days = 7;
      const since = new Date(Date.now() - days * 86_400_000);

      const runs = await prisma.monitorRun.findMany({
        where: { monitorId, checkedAt: { gte: since } },
        select: { level: true, checkedAt: true },
        orderBy: { checkedAt: 'asc' },
      });

      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);

      type SlotStatus = 'green' | 'yellow' | 'red' | 'no-data';
      const cells: Array<Array<{ green: number; yellow: number; red: number }>> =
        Array.from({ length: days }, () =>
          Array.from({ length: 24 }, () => ({ green: 0, yellow: 0, red: 0 })),
        );

      for (const run of runs) {
        const d = run.checkedAt as Date;
        const diffMs = todayStart.getTime() - d.getTime();
        const diffDays = Math.floor(diffMs / 86_400_000);
        const dayOffset = days - 1 - diffDays;
        if (dayOffset < 0 || dayOffset >= days) continue;
        const hour = d.getUTCHours();
        const cell = cells[dayOffset][hour];
        if (run.level === 'green') cell.green++;
        else if (run.level === 'yellow') cell.yellow++;
        else if (run.level === 'red') cell.red++;
      }

      const grid: SlotStatus[][] = cells.map((dayRow, di) => {
        const dayDate = new Date(todayStart);
        dayDate.setUTCDate(dayDate.getUTCDate() - (days - 1 - di));
        return dayRow.map((c) => {
          const total = c.green + c.yellow + c.red;
          if (total === 0) return 'no-data';
          const failRate = (c.yellow + c.red) / total;
          if (c.red === total) return 'red';
          if (failRate > 0) return 'yellow';
          return 'green';
        });
      });

      const dayLabels: string[] = Array.from({ length: days }, (_, i) => {
        const d = new Date(todayStart);
        d.setUTCDate(d.getUTCDate() - (days - 1 - i));
        return d.toISOString().slice(0, 10);
      });

      return { monitorId, grid, dayLabels, days, hours: 24 , fetchedAt: new Date().toISOString()};
    }

    case 'uptime-comparison-chart': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const resolvedIds = monitorIds?.length
        ? monitorIds
        : monitorId ? [monitorId] : [];
      if (resolvedIds.length === 0) return { _noConfig: true };

      const periodDays = Math.min(Math.max((widget.config.periodDays as number) ?? 30, 1), 365);
      const since = new Date(Date.now() - periodDays * 86_400_000);

      const monitorsDb = await prisma.monitor.findMany({
        where: { id: { in: resolvedIds }, userId },
        select: { id: true, name: true },
      });

      const allRuns = await prisma.monitorRun.findMany({
        where: { monitorId: { in: monitorsDb.map((m) => m.id) }, checkedAt: { gte: since } },
        select: { monitorId: true, level: true },
      });
      const runsByMonitor = new Map<string, { level: string }[]>();
      for (const r of allRuns) {
        if (!runsByMonitor.has(r.monitorId)) runsByMonitor.set(r.monitorId, []);
        runsByMonitor.get(r.monitorId)!.push(r);
      }
      const monitorDataList = monitorsDb.map((m) => {
        const runs = runsByMonitor.get(m.id) ?? [];
        const total = runs.length;
        const up = runs.filter((r) => r.level === 'green').length;
        const uptimePct = total > 0 ? Math.round((up / total) * 10000) / 100 : 100;
        return { id: m.id, name: m.name, uptimePct };
      });

      monitorDataList.sort((a, b) => b.uptimePct - a.uptimePct);
      return { monitors: monitorDataList, periodDays , fetchedAt: new Date().toISOString()};
    }

    default:
      return { widgetType: widget.type, message: 'Widget data not yet implemented for this type' };
  }
}
