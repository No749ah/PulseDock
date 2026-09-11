import { IncidentStatus, IncidentSeverity } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { RedisCacheService } from '../../common/redis-cache.service';
import { Widget } from '../status-pages.types';

export async function resolveIncidentWidget(
  prisma: PrismaService,
  _cache: RedisCacheService,
  userId: string,
  widget: Widget,
  _overrideDays: number | undefined,
): Promise<Record<string, unknown>> {
  const monitorId = widget.config.monitorId as string | undefined;

  switch (widget.type) {
    case 'active-incident-banner': {
      const watchedIds = Array.isArray(widget.config.monitorIds) ? (widget.config.monitorIds as string[]) : undefined;
      const now2 = new Date();
      const [activeIncidents, downMonitors] = await Promise.all([
        prisma.incident.findMany({
          where: { userId, status: { not: 'RESOLVED' } },
          include: {
            updates: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true } },
            monitors: { include: { monitor: { select: { id: true, name: true } } } },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        prisma.monitor.findMany({
          where: {
            userId,
            enabled: true,
            ...(watchedIds?.length ? { id: { in: watchedIds } } : {}),
          },
          include: { runs: { orderBy: { checkedAt: 'desc' }, take: 1, select: { ok: true, level: true, message: true } } },
        }),
      ]);

      const down = downMonitors.filter((m) => m.runs[0]?.level === 'red').map((m) => ({
        id: m.id,
        name: m.name,
        message: m.runs[0]?.message ?? null,
      }));

      const isAllClear = activeIncidents.length === 0 && down.length === 0;

      return {
        isAllClear,
        activeIncidents: activeIncidents.map((i) => ({
          id: i.id,
          title: i.title,
          severity: i.severity,
          status: i.status,
          createdAt: i.createdAt,
          latestUpdate: i.updates[0]?.body ?? null,
          affectedMonitors: i.monitors.map((im: { monitor: { id: string; name: string } }) => ({ id: im.monitor.id, name: im.monitor.name })),
        })),
        downMonitors: down,
        checkedAt: now2.toISOString(),
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'active-incident-count': {
      const incidents = await prisma.incident.findMany({
        where: { userId, status: { not: IncidentStatus.RESOLVED } },
        select: { id: true, title: true, severity: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      return {
        count: incidents.length,
        incidents,
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'incident-history': {
      const periodDays = (widget.config.periodDays as number) ?? 30;
      const since = new Date(Date.now() - periodDays * 86_400_000);
      const incidents = await prisma.incident.findMany({
        where: { userId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          updates: { orderBy: { createdAt: 'desc' }, take: 5 },
          monitors: { include: { monitor: { select: { id: true, name: true } } } },
        },
      });
      return {
        incidents: incidents.map((i) => ({
          id: i.id,
          title: i.title,
          status: i.status,
          severity: i.severity,
          createdAt: i.createdAt.toISOString(),
          resolvedAt: i.resolvedAt?.toISOString() ?? null,
          updates: i.updates.map((u) => ({
            id: u.id,
            message: u.body,
            status: u.status,
            createdAt: u.createdAt.toISOString(),
          })),
          monitors: i.monitors.map((im) => ({ id: im.monitor.id, name: im.monitor.name })),
        })),
        total: incidents.length,
        periodDays,
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'incident-timeline': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const limit = Math.min(Math.max((widget.config.limit as number) ?? 5, 1), 20);
      const periodDays = (widget.config.periodDays as number) ?? 30;
      const since = new Date(Date.now() - periodDays * 86_400_000);

      const incidentWhere = monitorIds?.length
        ? {
            userId,
            createdAt: { gte: since },
            monitors: { some: { monitorId: { in: monitorIds } } },
          }
        : { userId, createdAt: { gte: since } };

      const incidents = await prisma.incident.findMany({
        where: incidentWhere,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          status: true,
          severity: true,
          createdAt: true,
          resolvedAt: true,
          updates: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, body: true, status: true, createdAt: true },
          },
          monitors: {
            include: { monitor: { select: { id: true, name: true } } },
          },
        },
      });

      const result = incidents.map((i) => {
        const durationMs =
          i.resolvedAt && i.createdAt
            ? i.resolvedAt.getTime() - (i.createdAt as Date).getTime()
            : null;
        return {
          id: i.id,
          title: i.title,
          status: i.status,
          severity: i.severity,
          createdAt: i.createdAt,
          resolvedAt: i.resolvedAt,
          durationMs,
          updates: i.updates.map((u) => ({
            id: u.id,
            message: u.body,
            status: u.status,
            createdAt: u.createdAt,
          })),
          monitors: i.monitors.map((im) => im.monitor),
        };
      });

      return { incidents: result, total: result.length, periodDays , fetchedAt: new Date().toISOString()};
    }

    case 'incident-severity-distribution': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const periodDays = Math.min(Math.max((widget.config.periodDays as number) ?? 30, 1), 365);
      const since = new Date(Date.now() - periodDays * 86_400_000);

      const incidentWhere = monitorIds?.length
        ? {
            userId,
            createdAt: { gte: since },
            monitors: { some: { monitorId: { in: monitorIds } } },
          }
        : { userId, createdAt: { gte: since } };

      const incidents = await prisma.incident.findMany({
        where: incidentWhere,
        select: { id: true, severity: true },
      });

      let critical = 0, major = 0, minor = 0;
      for (const inc of incidents) {
        if (inc.severity === IncidentSeverity.CRITICAL) critical++;
        else if (inc.severity === IncidentSeverity.HIGH) major++;
        else minor++;
      }

      return {
        critical,
        major,
        minor,
        total: incidents.length,
        periodDays,
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'incident-duration-stats': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const periodDays = Math.min(Math.max((widget.config.periodDays as number) ?? 30, 1), 365);
      const since = new Date(Date.now() - periodDays * 86_400_000);

      const incidentWhere = monitorIds?.length
        ? {
            userId,
            resolvedAt: { not: null },
            createdAt: { gte: since },
            monitors: { some: { monitorId: { in: monitorIds } } },
          }
        : { userId, resolvedAt: { not: null }, createdAt: { gte: since } };

      const incidents = await prisma.incident.findMany({
        where: incidentWhere,
        select: { createdAt: true, resolvedAt: true },
      });

      if (incidents.length === 0) {
        return { avg: null, longest: null, shortest: null, count: 0, periodDays, fetchedAt: new Date().toISOString() };
      }

      const durations = incidents.map((i) => {
        const resolved = i.resolvedAt as Date;
        return resolved.getTime() - (i.createdAt as Date).getTime();
      });

      const avg = Math.round(durations.reduce((s, v) => s + v, 0) / durations.length);
      const longest = Math.max(...durations);
      const shortest = Math.min(...durations);

      return { avg, longest, shortest, count: durations.length, periodDays , fetchedAt: new Date().toISOString()};
    }

    case 'post-mortem-card': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;

      const incidentWhere = monitorIds?.length
        ? {
            userId,
            resolvedAt: { not: null },
            monitors: { some: { monitorId: { in: monitorIds } } },
          }
        : { userId, resolvedAt: { not: null } };

      const incident = await prisma.incident.findFirst({
        where: incidentWhere,
        orderBy: { resolvedAt: 'desc' },
        select: {
          id: true,
          title: true,
          severity: true,
          createdAt: true,
          resolvedAt: true,
          description: true,
          updates: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, body: true, status: true, createdAt: true },
          },
          monitors: {
            include: { monitor: { select: { id: true, name: true } } },
          },
        },
      });

      if (!incident) {
        return { incident: null, fetchedAt: new Date().toISOString() };
      }

      const durationMs =
        incident.resolvedAt && incident.createdAt
          ? (incident.resolvedAt as Date).getTime() - (incident.createdAt as Date).getTime()
          : null;

      return {
        incident: {
          title: incident.title,
          severity: incident.severity,
          resolvedAt: incident.resolvedAt,
          durationMs,
          affectedMonitors: incident.monitors.map((im) => ({ name: im.monitor.name })),
          updates: incident.updates.map((u) => ({
            status: u.status,
            message: u.body,
            createdAt: u.createdAt,
          })),
        },
        fetchedAt: new Date().toISOString(),
      };
    }

    default:
      return { widgetType: widget.type, message: 'Widget data not yet implemented for this type' };
  }
}
