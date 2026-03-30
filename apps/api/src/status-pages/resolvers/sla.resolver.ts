import { PrismaService } from '../../common/prisma.service';
import { RedisCacheService } from '../../common/redis-cache.service';
import { Widget } from '../status-pages.types';

export async function resolveSlaWidget(
  prisma: PrismaService,
  _cache: RedisCacheService,
  userId: string,
  widget: Widget,
  overrideDays: number | undefined,
): Promise<Record<string, unknown>> {
  const monitorId = widget.config.monitorId as string | undefined;

  switch (widget.type) {
    case 'sla-summary': {
      if (!monitorId) return { _noConfig: true };
      const periodDays = overrideDays ?? Math.min(Math.max((widget.config.periodDays as number) ?? 30, 1), 365);
      const slaTgt = Math.min(Math.max((widget.config.slaTarget as number) ?? 99.9, 0), 100);
      const since = new Date(Date.now() - periodDays * 86_400_000);
      const runs = await prisma.monitorRun.findMany({
        where: { monitorId, checkedAt: { gte: since } },
        select: { level: true },
      });
      const total = runs.length;
      const up = runs.filter((r: { level: string }) => r.level === 'green').length;
      const uptimePct = total > 0 ? Math.round((up / total) * 10000) / 100 : 100;
      const pass = uptimePct >= slaTgt;
      const totalMinutes = periodDays * 24 * 60;
      const allowedDownMinutes = ((100 - slaTgt) / 100) * totalMinutes;
      const actualDownMinutes = total > 0 ? ((total - up) / total) * totalMinutes : 0;
      const remainingDownMinutes = Math.max(0, allowedDownMinutes - actualDownMinutes);
      return {
        monitorId,
        periodDays,
        slaTarget: slaTgt,
        uptimePct,
        total,
        up,
        down: total - up,
        pass,
        allowedDownMinutes: Math.round(allowedDownMinutes * 10) / 10,
        remainingDownMinutes: Math.round(remainingDownMinutes * 10) / 10,
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'sla-compliance-table': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const periodDays = Math.min(Math.max((widget.config.periodDays as number) ?? 30, 1), 365);
      const defaultTarget = Math.min(Math.max((widget.config.slaTarget as number) ?? 99.9, 0), 100);
      const since = new Date(Date.now() - periodDays * 86_400_000);

      const where = monitorIds?.length
        ? { userId, id: { in: monitorIds }, enabled: true }
        : { userId, enabled: true };

      const monitors = await prisma.monitor.findMany({
        where,
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });

      if (monitors.length === 0) {
        return { _noConfig: true };
      }

      // Batch fetch all runs for all monitors in one query
      const allRuns = await prisma.monitorRun.findMany({
        where: { monitorId: { in: monitors.map((m) => m.id) }, checkedAt: { gte: since } },
        select: { monitorId: true, level: true },
      });
      const runsByMonitor = new Map<string, { level: string }[]>();
      for (const r of allRuns) {
        if (!runsByMonitor.has(r.monitorId)) runsByMonitor.set(r.monitorId, []);
        runsByMonitor.get(r.monitorId)!.push(r);
      }
      const rows = monitors.map((m) => {
        const runs = runsByMonitor.get(m.id) ?? [];
        const total = runs.length;
        const up = runs.filter((r) => r.level === 'green').length;
        const actual = total > 0 ? Math.round((up / total) * 10000) / 100 : 100;
        const target = defaultTarget;
        const pass = actual >= target;
        return { monitorId: m.id, name: m.name, target, actual, pass };
      });

      rows.sort((a, b) => {
        if (a.pass !== b.pass) return a.pass ? 1 : -1;
        return a.actual - b.actual;
      });

      return { rows, periodDays, slaTarget: defaultTarget , fetchedAt: new Date().toISOString()};
    }

    case 'downtime-log': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const maxEntries = (widget.config.maxEntries as number) ?? 10;
      const periodDays = (widget.config.periodDays as number) ?? 30;
      const since = new Date(Date.now() - periodDays * 86_400_000);

      const where = monitorIds?.length
        ? { monitorId: { in: monitorIds }, checkedAt: { gte: since } }
        : { monitor: { userId }, checkedAt: { gte: since } };

      const runs = await prisma.monitorRun.findMany({
        where,
        select: { monitorId: true, level: true, checkedAt: true, message: true, monitor: { select: { name: true } } },
        orderBy: { checkedAt: 'asc' },
      });

      const byMonitor = new Map<string, { monitorId: string; monitorName: string; runs: { level: string; checkedAt: Date; message: string | null }[] }>();
      for (const run of runs) {
        if (!byMonitor.has(run.monitorId)) {
          byMonitor.set(run.monitorId, {
            monitorId: run.monitorId,
            monitorName: (run.monitor as { name: string }).name,
            runs: [],
          });
        }
        byMonitor.get(run.monitorId)!.runs.push({
          level: run.level,
          checkedAt: run.checkedAt as Date,
          message: run.message,
        });
      }

      const outages: Array<{
        monitorId: string;
        monitorName: string;
        startedAt: Date;
        resolvedAt: Date | null;
        durationMs: number | null;
        message: string | null;
      }> = [];

      for (const { monitorId: mId, monitorName, runs: mRuns } of byMonitor.values()) {
        let inOutage = false;
        let outageStart: Date | null = null;
        let outageMsg: string | null = null;

        for (const run of mRuns) {
          if (run.level === 'red') {
            if (!inOutage) {
              inOutage = true;
              outageStart = run.checkedAt;
              outageMsg = run.message;
            }
          } else {
            if (inOutage && outageStart) {
              outages.push({
                monitorId: mId,
                monitorName,
                startedAt: outageStart,
                resolvedAt: run.checkedAt,
                durationMs: run.checkedAt.getTime() - outageStart.getTime(),
                message: outageMsg,
              });
              inOutage = false;
              outageStart = null;
              outageMsg = null;
            }
          }
        }

        if (inOutage && outageStart) {
          outages.push({
            monitorId: mId,
            monitorName,
            startedAt: outageStart,
            resolvedAt: null,
            durationMs: null,
            message: outageMsg,
          });
        }
      }

      outages.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      const total = outages.length;

      return {
        outages: outages.slice(0, maxEntries),
        total,
        periodDays,
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'mttr-mttf-cards': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const periodDays = (widget.config.periodDays as number) ?? 30;
      const since = new Date(Date.now() - periodDays * 86_400_000);

      const where = monitorIds?.length
        ? { monitorId: { in: monitorIds }, checkedAt: { gte: since } }
        : { monitor: { userId }, checkedAt: { gte: since } };

      const runs = await prisma.monitorRun.findMany({
        where,
        select: { monitorId: true, level: true, checkedAt: true },
        orderBy: [{ monitorId: 'asc' }, { checkedAt: 'asc' }],
      });

      const byMonitor = new Map<string, { level: string; checkedAt: Date }[]>();
      for (const run of runs) {
        if (!byMonitor.has(run.monitorId)) byMonitor.set(run.monitorId, []);
        byMonitor.get(run.monitorId)!.push({ level: run.level, checkedAt: run.checkedAt as Date });
      }

      const redDurations: number[] = [];
      const greenDurations: number[] = [];

      for (const mRuns of byMonitor.values()) {
        let streakStart: Date | null = null;
        let streakColor: 'red' | 'green' | null = null;

        for (const run of mRuns) {
          const color = run.level === 'red' ? 'red' : 'green';
          if (color !== streakColor) {
            if (streakColor !== null && streakStart !== null) {
              const dur = run.checkedAt.getTime() - streakStart.getTime();
              if (streakColor === 'red') redDurations.push(dur);
              else greenDurations.push(dur);
            }
            streakStart = run.checkedAt;
            streakColor = color;
          }
        }
      }

      const avgMs = (arr: number[]): number | null =>
        arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;

      return {
        mttrMs: avgMs(redDurations),
        mttfMs: avgMs(greenDurations),
        recoveryCount: redDurations.length,
        failureCount: greenDurations.filter((_, i) => i < redDurations.length).length,
        periodDays,
        fetchedAt: new Date().toISOString(),
      };
    }

    default:
      return { widgetType: widget.type, message: 'Widget data not yet implemented for this type' };
  }
}
