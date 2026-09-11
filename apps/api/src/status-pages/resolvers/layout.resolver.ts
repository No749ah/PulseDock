import { PrismaService } from '../../common/prisma.service';
import { RedisCacheService } from '../../common/redis-cache.service';
import { Widget } from '../status-pages.types';

export async function resolveLayoutWidget(
  prisma: PrismaService,
  _cache: RedisCacheService,
  userId: string,
  widget: Widget,
  _overrideDays: number | undefined,
): Promise<Record<string, unknown>> {
  switch (widget.type) {
    case 'last-updated-footer': {
      const autoRefreshSec = Math.min(Math.max((widget.config.autoRefreshSec as number) ?? 60, 0), 3600);
      return { lastUpdated: new Date().toISOString(), autoRefreshSec };
    }

    case 'collapsible-section':
    case 'divider':
      return { widgetType: widget.type, config: widget.config, fetchedAt: new Date().toISOString() };

    case 'tab-container':
      return { widgetType: widget.type, config: widget.config, fetchedAt: new Date().toISOString() };

    case 'dependency-map': {
      const depMonitorIds = widget.config.monitorIds as string[] | undefined;
      const depWhere = depMonitorIds?.length
        ? { userId, id: { in: depMonitorIds }, enabled: true }
        : { userId, enabled: true };
      const depMonitors = await prisma.monitor.findMany({
        where: depWhere,
        select: {
          id: true,
          name: true,
          type: true,
          runs: {
            orderBy: { checkedAt: 'desc' as const },
            take: 1,
            select: { level: true, checkedAt: true, latencyMs: true },
          },
        },
        orderBy: { name: 'asc' },
      });
      const nodes = depMonitors.map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        level: m.runs[0]?.level ?? 'green',
        lastChecked: m.runs[0]?.checkedAt?.toISOString() ?? null,
        latencyMs: m.runs[0]?.latencyMs ?? null,
      }));
      const edges = (widget.config.edges as Array<{ source: string; target: string; label?: string }> | undefined) ?? [];
      return { nodes, edges , fetchedAt: new Date().toISOString()};
    }

    case 'table-of-contents':
      return { items: (widget.config.items as Array<{ label: string; anchor: string }>) ?? [] , fetchedAt: new Date().toISOString()};

    case 'page-navigation': {
      const otherPages = await prisma.publicStatusPage.findMany({
        where: { userId, isPublished: true },
        select: { slug: true, title: true, description: true },
        orderBy: { title: 'asc' },
        take: 20,
      });
      return { pages: otherPages , fetchedAt: new Date().toISOString()};
    }

    case 'column-layout':
      return { columns: (widget.config.columns as number) ?? 2 , fetchedAt: new Date().toISOString()};

    case 'sticky-header': {
      const allMonitors = await prisma.monitor.findMany({
        where: { userId },
        select: { id: true },
      });
      const monitorIds = allMonitors.map((m) => m.id);
      if (monitorIds.length === 0) return { status: 'operational', monitorCount: 0 };

      const since = new Date(Date.now() - 5 * 60 * 1000);
      const latestRuns = await prisma.monitorRun.findMany({
        where: { monitorId: { in: monitorIds }, checkedAt: { gte: since } },
        orderBy: { checkedAt: 'desc' },
        distinct: ['monitorId'],
        select: { monitorId: true, level: true },
      });

      const hasDown = latestRuns.some((r) => r.level === 'red');
      const hasDegraded = latestRuns.some((r) => r.level === 'yellow');
      const status = hasDown ? 'outage' : hasDegraded ? 'degraded' : 'operational';
      return { status, monitorCount: monitorIds.length , fetchedAt: new Date().toISOString()};
    }

    case 'offline-banner': {
      return { type: 'offline-banner', config: widget.config , fetchedAt: new Date().toISOString()};
    }

    default:
      return { widgetType: widget.type, message: 'Widget data not yet implemented for this type' };
  }
}
