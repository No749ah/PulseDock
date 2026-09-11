import { PrismaService } from '../../common/prisma.service';
import { RedisCacheService } from '../../common/redis-cache.service';
import { Widget } from '../status-pages.types';

export async function resolveMaintenanceWidget(
  prisma: PrismaService,
  _cache: RedisCacheService,
  userId: string,
  widget: Widget,
  _overrideDays: number | undefined,
): Promise<Record<string, unknown>> {
  switch (widget.type) {
    case 'scheduled-maintenance': {
      const now = new Date();
      const windows = await prisma.maintenanceWindow.findMany({
        where: { userId, endsAt: { gte: now } },
        orderBy: { startsAt: 'asc' },
        include: {
          monitors: { include: { monitor: { select: { id: true, name: true } } } },
        },
      });
      return {
        windows: windows.map((mw) => ({
          id: mw.id,
          name: mw.name,
          description: mw.description,
          startsAt: mw.startsAt.toISOString(),
          endsAt: mw.endsAt.toISOString(),
          monitors: mw.monitors.map((m) => ({ id: m.monitor.id, name: m.monitor.name })),
        })),
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'maintenance-calendar': {
      const now3 = new Date();
      const futureLimit = new Date(now3.getTime() + 90 * 24 * 60 * 60 * 1000);
      const windows = await prisma.maintenanceWindow.findMany({
        where: {
          userId,
          endsAt: { gte: now3 },
          startsAt: { lte: futureLimit },
        },
        include: {
          monitors: { include: { monitor: { select: { id: true, name: true } } } },
        },
        orderBy: { startsAt: 'asc' },
        take: 20,
      });

      return {
        windows: windows.map((w) => ({
          id: w.id,
          name: w.name,
          description: w.description,
          startsAt: w.startsAt,
          endsAt: w.endsAt,
          isActive: w.startsAt <= now3 && w.endsAt >= now3,
          affectedMonitors: w.monitors.map((wm) => ({ id: wm.monitor.id, name: wm.monitor.name })),
        })),
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'next-maintenance-countdown': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const now = new Date();

      const whereClause = monitorIds?.length
        ? {
            userId,
            startsAt: { gt: now },
            monitors: { some: { monitorId: { in: monitorIds } } },
          }
        : { userId, startsAt: { gt: now } };

      const window = await prisma.maintenanceWindow.findFirst({
        where: whereClause,
        orderBy: { startsAt: 'asc' },
        select: {
          name: true,
          description: true,
          startsAt: true,
          endsAt: true,
          monitors: { include: { monitor: { select: { name: true } } } },
        },
      });

      if (!window) return { none: true };

      const secondsUntil = Math.max(0, Math.floor((window.startsAt.getTime() - now.getTime()) / 1000));
      return {
        name: window.name,
        description: window.description,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        affectedMonitors: window.monitors.map((m) => ({ name: m.monitor.name })),
        secondsUntil,
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'maintenance-impact-list': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 86_400_000);

      const whereClause = monitorIds?.length
        ? {
            userId,
            startsAt: { gte: now, lte: sevenDaysFromNow },
            monitors: { some: { monitorId: { in: monitorIds } } },
          }
        : { userId, startsAt: { gte: now, lte: sevenDaysFromNow } };

      const windows = await prisma.maintenanceWindow.findMany({
        where: whereClause,
        orderBy: { startsAt: 'asc' },
        take: 20,
        select: {
          name: true,
          startsAt: true,
          endsAt: true,
          description: true,
          monitors: { include: { monitor: { select: { id: true, name: true, runs: { orderBy: { checkedAt: 'desc' }, take: 1, select: { level: true } } } } } },
        },
      });

      const result = windows.map((w) => ({
        name: w.name,
        startsAt: w.startsAt,
        endsAt: w.endsAt,
        description: w.description,
        affectedMonitors: w.monitors.map((mm) => ({
          name: mm.monitor.name,
          status: mm.monitor.runs[0]?.level ?? 'green',
        })),
      }));

      return { windows: result , fetchedAt: new Date().toISOString()};
    }

    default:
      return { widgetType: widget.type, message: 'Widget data not yet implemented for this type' };
  }
}
