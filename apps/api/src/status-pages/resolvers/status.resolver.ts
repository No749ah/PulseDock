import { NotFoundException } from '@nestjs/common';
import { MonitorType } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { RedisCacheService } from '../../common/redis-cache.service';
import { Widget } from '../status-pages.types';

export async function resolveStatusWidget(
  prisma: PrismaService,
  _cache: RedisCacheService,
  userId: string,
  widget: Widget,
  _overrideDays: number | undefined,
): Promise<Record<string, unknown>> {
  const monitorId = widget.config.monitorId as string | undefined;

  switch (widget.type) {
    case 'current-status-badge': {
      if (!monitorId) return { _noConfig: true };
      const monitor = await prisma.monitor.findFirst({
        where: { id: monitorId, userId },
        include: { runs: { orderBy: { checkedAt: 'desc' }, take: 1 } },
      });
      if (!monitor) throw new NotFoundException('Monitor not found');
      const latest = monitor.runs[0];
      return {
        monitorId,
        name: monitor.name,
        level: latest?.level ?? 'green',
        lastChecked: latest?.checkedAt ?? null,
        latencyMs: latest?.latencyMs ?? null,
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'overall-system-status': {
      const monitors = await prisma.monitor.findMany({
        where: { userId, enabled: true },
        include: { runs: { orderBy: { checkedAt: 'desc' }, take: 1 } },
      });
      const down = monitors.filter((m) => m.runs[0]?.level === 'red').length;
      const degraded = monitors.filter((m) => m.runs[0]?.level === 'yellow').length;
      const status = down > 0 ? 'outage' : degraded > 0 ? 'degraded' : 'operational';
      return { status, monitorsDown: down, monitorsDegraded: degraded, total: monitors.length , fetchedAt: new Date().toISOString()};
    }

    case 'monitor-group':
    case 'monitor-group-status': {
      return { type: widget.type };
    }

    case 'component-status-list': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const where = monitorIds?.length
        ? { userId, id: { in: monitorIds }, enabled: true }
        : { userId, enabled: true };
      const monitors = await prisma.monitor.findMany({
        where,
        select: {
          id: true,
          name: true,
          type: true,
          runs: {
            orderBy: { checkedAt: 'desc' },
            take: 1,
            select: { level: true, checkedAt: true, latencyMs: true },
          },
        },
        orderBy: { name: 'asc' },
      });
      const components = monitors.map((m) => {
        const run = m.runs[0];
        const level = run?.level ?? 'green';
        const status =
          level === 'red' ? 'major-outage'
          : level === 'yellow' ? 'degraded'
          : 'operational';
        return {
          id: m.id,
          name: m.name,
          type: m.type,
          status,
          level,
          lastChecked: run?.checkedAt ?? null,
          latencyMs: run?.latencyMs ?? null,
        };
      });
      const downCount = components.filter((c) => c.status === 'major-outage').length;
      const degradedCount = components.filter((c) => c.status === 'degraded').length;
      const overallStatus =
        downCount > 0 ? 'major-outage'
        : degradedCount > 0 ? 'partial-outage'
        : 'operational';
      return { components, overallStatus, total: components.length, downCount, degradedCount , fetchedAt: new Date().toISOString()};
    }

    case 'service-health-matrix': {
      type MatrixCol = { label: string; monitorIds: string[] };
      type MatrixRow = { id: string; name: string };
      const columns: MatrixCol[] = Array.isArray(widget.config.columns)
        ? (widget.config.columns as MatrixCol[])
        : [];
      const rows: MatrixRow[] = Array.isArray(widget.config.rows)
        ? (widget.config.rows as MatrixRow[])
        : [];

      if (columns.length === 0 || rows.length === 0) {
        const monitors = await prisma.monitor.findMany({
          where: { userId, enabled: true },
          select: {
            id: true, name: true,
            runs: { orderBy: { checkedAt: 'desc' }, take: 1, select: { level: true, latencyMs: true, checkedAt: true } },
          },
          orderBy: { name: 'asc' },
          take: 50,
        });
        const matrix = monitors.map((m) => {
          const run = m.runs[0];
          const level = (run?.level ?? 'green') as string;
          return {
            rowId: m.id,
            rowName: m.name,
            cells: [{
              colLabel: 'Production',
              level,
              latencyMs: run?.latencyMs ?? null,
              lastChecked: run?.checkedAt ?? null,
            }],
          };
        });
        return { mode: 'auto', columns: ['Production'], matrix, fetchedAt: new Date().toISOString() };
      }

      const allMonitorIds = [...new Set(columns.flatMap((c) => c.monitorIds))];
      const dbMonitors = await prisma.monitor.findMany({
        where: { id: { in: allMonitorIds }, userId },
        select: {
          id: true, name: true,
          runs: { orderBy: { checkedAt: 'desc' }, take: 1, select: { level: true, latencyMs: true, checkedAt: true } },
        },
      });
      const monitorMap = new Map(dbMonitors.map((m) => [m.id, m]));

      const getCellLevel = (monitorIds: string[]): { level: string; latencyMs: number | null; lastChecked: unknown } => {
        const monitors = monitorIds.map((id) => monitorMap.get(id)).filter(Boolean);
        if (monitors.length === 0) return { level: 'no-data', latencyMs: null, lastChecked: null };
        const levels = monitors.map((m) => m!.runs[0]?.level ?? 'green');
        const level = levels.includes('red') ? 'red' : levels.includes('yellow') ? 'yellow' : 'green';
        const latencies = monitors.map((m) => m!.runs[0]?.latencyMs ?? null).filter((v): v is number => v !== null);
        const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length) : null;
        const lastChecked = monitors.map((m) => m!.runs[0]?.checkedAt ?? null).filter(Boolean)[0] ?? null;
        return { level, latencyMs: avgLatency, lastChecked };
      };

      const matrix = rows.map((row) => ({
        rowId: row.id,
        rowName: row.name,
        cells: columns.map((col) => {
          const cell = getCellLevel(col.monitorIds);
          return { colLabel: col.label, ...cell };
        }),
      }));

      return { mode: 'manual', columns: columns.map((c) => c.label), matrix , fetchedAt: new Date().toISOString()};
    }

    case 'aggregate-health-score': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const weights = (widget.config.weights ?? {}) as Record<string, number>;
      const where = monitorIds?.length
        ? { userId, id: { in: monitorIds }, enabled: true }
        : { userId, enabled: true };

      const monitors = await prisma.monitor.findMany({
        where,
        select: {
          id: true, name: true,
          runs: { orderBy: { checkedAt: 'desc' }, take: 1, select: { level: true, latencyMs: true } },
        },
        orderBy: { name: 'asc' },
      });

      if (monitors.length === 0) return { score: 100, total: 0, breakdown: [] };

      const breakdown = monitors.map((m) => {
        const run = m.runs[0];
        const level = run?.level ?? 'green';
        const pts = level === 'green' ? 100 : level === 'yellow' ? 50 : 0;
        const weight = weights[m.id] ?? 1;
        return { id: m.id, name: m.name, level, points: pts, weight };
      });

      const totalWeight = breakdown.reduce((s, b) => s + b.weight, 0);
      const weightedScore = totalWeight > 0
        ? breakdown.reduce((s, b) => s + b.points * b.weight, 0) / totalWeight
        : 100;
      const score = Math.round(weightedScore * 10) / 10;

      const down = breakdown.filter((b) => b.level === 'red').length;
      const degraded = breakdown.filter((b) => b.level === 'yellow').length;
      const status = down > 0 ? (down > monitors.length * 0.5 ? 'critical' : 'degraded') : degraded > 0 ? 'degraded' : 'healthy';

      return { score, total: monitors.length, down, degraded, status, breakdown , fetchedAt: new Date().toISOString()};
    }

    case 'multi-monitor-status-grid':
    case 'multi-status-badges': {
      const monitorIds = Array.isArray(widget.config.monitorIds) ? (widget.config.monitorIds as string[]) : undefined;
      const filterType = widget.config.monitorType as string | undefined;

      const dbMonitors = await prisma.monitor.findMany({
        where: {
          userId,
          enabled: true,
          ...(monitorIds?.length ? { id: { in: monitorIds } } : {}),
          ...(filterType ? { type: filterType as never } : {}),
        },
        include: {
          runs: { orderBy: { checkedAt: 'desc' }, take: 1, select: { level: true, latencyMs: true, checkedAt: true } },
          monitorTags: { include: { tag: true } },
        },
        orderBy: { name: 'asc' },
      });

      const items = dbMonitors.map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        level: (m.runs[0]?.level ?? 'green') as string,
        latencyMs: m.runs[0]?.latencyMs ?? null,
        lastChecked: m.runs[0]?.checkedAt ?? null,
        tags: m.monitorTags.map((t: { tag: { name: string } }) => t.tag.name),
      }));

      const down = items.filter((i) => i.level === 'red').length;
      const degraded = items.filter((i) => i.level === 'yellow').length;

      return {
        monitors: items,
        summary: {
          total: items.length,
          down,
          degraded,
          healthy: items.length - down - degraded,
        },
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'ssl-certificate-status': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const singleMonitorId = monitorId;

      const where = monitorIds?.length
        ? { userId, id: { in: monitorIds }, type: MonitorType.SSL_CERT, enabled: true }
        : singleMonitorId
          ? { userId, id: singleMonitorId, type: MonitorType.SSL_CERT, enabled: true }
          : { userId, type: MonitorType.SSL_CERT, enabled: true };

      const monitors = await prisma.monitor.findMany({
        where,
        select: {
          id: true,
          name: true,
          target: true,
          runs: {
            orderBy: { checkedAt: 'desc' },
            take: 1,
            select: { level: true, latencyMs: true, message: true, checkedAt: true },
          },
        },
        take: 20,
      });

      if (monitors.length === 0) {
        return { _noConfig: true };
      }

      const certs = monitors.map((m) => {
        const run = m.runs[0];
        const domain = m.target ?? m.name;
        const daysRemaining = run?.latencyMs ?? null;
        const level = run?.level ?? 'green';

        let status: 'valid' | 'expiring-soon' | 'critical' | 'expired' | 'unknown' = 'unknown';
        if (daysRemaining !== null) {
          if (daysRemaining <= 0) status = 'expired';
          else if (daysRemaining < 10) status = 'critical';
          else if (daysRemaining < 30) status = 'expiring-soon';
          else status = 'valid';
        }

        let issuer: string | null = null;
        let expiresAt: string | null = null;
        if (run?.message) {
          const issuerMatch = run.message.match(/issuer[:\s]+([^\n,;]+)/i);
          if (issuerMatch) issuer = issuerMatch[1].trim();
          const expiresMatch = run.message.match(/expires?[:\s]+([^\n,;]+)/i);
          if (expiresMatch) expiresAt = expiresMatch[1].trim();
        }

        return {
          monitorId: m.id,
          domain,
          daysRemaining,
          expiresAt,
          issuer,
          grade: level === 'green' ? 'A' : level === 'yellow' ? 'B' : 'F',
          status,
          lastChecked: run?.checkedAt ?? null,
        };
      });

      certs.sort((a, b) => {
        const order = { expired: 0, critical: 1, 'expiring-soon': 2, valid: 3, unknown: 4 };
        return (order[a.status] ?? 4) - (order[b.status] ?? 4);
      });

      return { certs, total: certs.length , fetchedAt: new Date().toISOString()};
    }

    case 'dns-resolution-time': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const periodHours = Math.min(Math.max((widget.config.periodHours as number) ?? 24, 1), 168);
      const since = new Date(Date.now() - periodHours * 3_600_000);

      const whereMonitors = monitorIds?.length
        ? { userId, id: { in: monitorIds }, type: MonitorType.HTTP, enabled: true }
        : { userId, type: MonitorType.HTTP, enabled: true };

      const httpMonitors = await prisma.monitor.findMany({
        where: whereMonitors,
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 50,
      });

      if (httpMonitors.length === 0) {
        return { _noConfig: true };
      }

      type MonitorStats = { name: string; avgMs: number; trend: 'up' | 'down' | 'stable' };

      const monitorStats: MonitorStats[] = [];
      const allLatencies: number[] = [];

      for (const m of httpMonitors) {
        const runs = await prisma.monitorRun.findMany({
          where: { monitorId: m.id, checkedAt: { gte: since }, latencyMs: { not: null } },
          select: { latencyMs: true, checkedAt: true },
          orderBy: { checkedAt: 'asc' },
        });

        const latencies = runs.map((r) => r.latencyMs as number);
        allLatencies.push(...latencies);

        if (latencies.length === 0) continue;

        const avgMs = Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length);

        const mid = Math.floor(latencies.length / 2);
        const firstHalf = latencies.slice(0, mid);
        const secondHalf = latencies.slice(mid);
        const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length : avgMs;
        const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length : avgMs;
        const diff = secondAvg - firstAvg;
        const trend: 'up' | 'down' | 'stable' = Math.abs(diff) < firstAvg * 0.05 ? 'stable' : diff > 0 ? 'up' : 'down';

        monitorStats.push({ name: m.name, avgMs, trend });
      }

      const avgMs = allLatencies.length > 0
        ? Math.round(allLatencies.reduce((s, v) => s + v, 0) / allLatencies.length)
        : 0;

      const sorted = [...allLatencies].sort((a, b) => a - b);
      const p95Ms = sorted.length > 0
        ? sorted[Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1)]
        : 0;

      return { avgMs, p95Ms, monitors: monitorStats, periodHours , fetchedAt: new Date().toISOString()};
    }

    case 'multi-environment-status': {
      const envMonitors = (widget.config.envMonitors as Record<string, string[]> | undefined) ?? {};
      const allEnvIds = Object.values(envMonitors).flat();
      const envMonitorsDb = allEnvIds.length > 0
        ? await prisma.monitor.findMany({
            where: { userId, id: { in: allEnvIds } },
            select: {
              id: true,
              name: true,
              runs: {
                orderBy: { checkedAt: 'desc' as const },
                take: 1,
                select: { level: true },
              },
            },
          })
        : [];
      const statusMap = new Map(envMonitorsDb.map((m) => [m.id, m.runs[0]?.level ?? 'green']));
      const nameMap = new Map(envMonitorsDb.map((m) => [m.id, m.name]));
      const result = Object.entries(envMonitors).map(([env, ids]) => {
        const rows = ids
          .map((id) => ({ id, name: nameMap.get(id) ?? id, level: statusMap.get(id) ?? 'green' }));
        const total = rows.length;
        const down = rows.filter((r) => r.level === 'red').length;
        const degraded = rows.filter((r) => r.level === 'yellow').length;
        const summary: 'operational' | 'degraded' | 'outage' =
          down > 0 ? (down === total ? 'outage' : 'degraded') : degraded > 0 ? 'degraded' : 'operational';
        return { env, summary, total, up: total - down, monitors: rows };
      });
      return { environments: result , fetchedAt: new Date().toISOString()};
    }

    case 'region-status-map': {
      const regionMonitors = (widget.config.regionMonitors as Record<string, string[]> | undefined) ?? {};
      const allRegionIds = Object.values(regionMonitors).flat();
      const regionMonitorsDb = allRegionIds.length > 0
        ? await prisma.monitor.findMany({
            where: { userId, id: { in: allRegionIds } },
            select: {
              id: true,
              name: true,
              runs: {
                orderBy: { checkedAt: 'desc' as const },
                take: 1,
                select: { level: true },
              },
            },
          })
        : [];
      const statusMap = new Map(regionMonitorsDb.map((m) => [m.id, m.runs[0]?.level ?? 'green']));
      const regions = Object.entries(regionMonitors).map(([region, ids]) => {
        const monitors = ids.map((id) => ({ id, level: statusMap.get(id) ?? 'green' }));
        const total = monitors.length;
        const downCount = monitors.filter((m) => m.level === 'red').length;
        const degradedCount = monitors.filter((m) => m.level === 'yellow').length;
        const status: 'operational' | 'degraded' | 'outage' =
          downCount > 0 ? (downCount === total ? 'outage' : 'degraded') : degradedCount > 0 ? 'degraded' : 'operational';
        return { region, status, monitorCount: total, upCount: total - downCount };
      });
      return { regions , fetchedAt: new Date().toISOString()};
    }

    case 'third-party-dependencies': {
      const services = (widget.config.services as Array<{ name: string; url: string; expectedStatus?: number }> | undefined) ?? [];
      if (services.length === 0) return { services: [], checkedAt: new Date().toISOString() };

      const results = await Promise.allSettled(
        services.map(async (svc) => {
          const start = Date.now();
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(svc.url, { method: 'HEAD', signal: controller.signal as AbortSignal });
            clearTimeout(timeoutId);
            const responseMs = Date.now() - start;
            const svcStatus: 'up' | 'down' = res.status < 400 ? 'up' : 'down';
            return { name: svc.name, url: svc.url, status: svcStatus, httpStatus: res.status, responseMs };
          } catch {
            return { name: svc.name, url: svc.url, status: 'down' as const, httpStatus: 0, responseMs: Date.now() - start };
          }
        }),
      );

      const serviceResults = results.map((r, i) =>
        r.status === 'fulfilled'
          ? r.value
          : { name: services[i]?.name ?? '', url: services[i]?.url ?? '', status: 'unknown' as const, httpStatus: 0, responseMs: 0 },
      );
      return { services: serviceResults, checkedAt: new Date().toISOString() };
    }

    case 'security-advisory': {
      const packageName = (widget.config.packageName as string | undefined) ?? '';
      if (!packageName) return { advisories: [], checkedAt: new Date().toISOString(), packageName: '' };

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(
          `https://api.github.com/advisories?affects=${encodeURIComponent(packageName)}&type=reviewed&per_page=5`,
          {
            signal: controller.signal as AbortSignal,
            headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PulseDock/1.0' },
          },
        );
        clearTimeout(timeoutId);

        if (!res.ok) return { advisories: [], checkedAt: new Date().toISOString(), packageName, error: `GitHub API returned ${res.status}` };

        const data = await res.json() as Array<{
          ghsa_id: string;
          summary: string;
          severity: string;
          published_at: string;
          html_url: string;
        }>;

        const advisories = (Array.isArray(data) ? data : []).map((a) => ({
          ghsaId: a.ghsa_id,
          summary: a.summary,
          severity: a.severity as 'critical' | 'high' | 'medium' | 'low',
          publishedAt: a.published_at,
          link: a.html_url,
        }));
        return { advisories, checkedAt: new Date().toISOString(), packageName };
      } catch {
        return { advisories: [], checkedAt: new Date().toISOString(), packageName, error: 'Failed to fetch advisories' };
      }
    }

    default:
      return { widgetType: widget.type, message: 'Widget data not yet implemented for this type' };
  }
}
