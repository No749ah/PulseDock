import { IncidentStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { RedisCacheService } from '../../common/redis-cache.service';
import { Widget } from '../status-pages.types';

export async function resolveMetricWidget(
  prisma: PrismaService,
  _cache: RedisCacheService,
  userId: string,
  widget: Widget,
  _overrideDays: number | undefined,
): Promise<Record<string, unknown>> {
  const monitorId = widget.config.monitorId as string | undefined;

  switch (widget.type) {
    case 'metric-counter': {
      const metricType = (widget.config.metricType as string | undefined) ?? 'uptime';
      const periodDays = Math.min(Math.max((widget.config.periodDays as number) ?? 30, 1), 365);
      const monitorId = widget.config.monitorId as string | undefined;
      const since = new Date(Date.now() - periodDays * 86_400_000);

      if (metricType === 'latency') {
        const runs = await prisma.monitorRun.findMany({
          where: {
            ...(monitorId ? { monitorId } : { monitor: { userId } }),
            checkedAt: { gte: since },
            latencyMs: { not: null },
          },
          select: { latencyMs: true },
        });
        const avgMs = runs.length > 0
          ? Math.round(runs.reduce((sum, run) => sum + (run.latencyMs as number), 0) / runs.length)
          : 0;
        return { label: (widget.config.label as string | undefined) ?? `Avg latency (${periodDays}d)`, value: avgMs, suffix: 'ms', metricType, periodDays, fetchedAt: new Date().toISOString() };
      }

      if (metricType === 'checks') {
        const total = await prisma.monitorRun.count({
          where: {
            ...(monitorId ? { monitorId } : { monitor: { userId } }),
            checkedAt: { gte: since },
          },
        });
        return { label: (widget.config.label as string | undefined) ?? `Checks (${periodDays}d)`, value: total, suffix: '', metricType, periodDays, fetchedAt: new Date().toISOString() };
      }

      if (metricType === 'incidents') {
        const total = await prisma.incident.count({
          where: {
            userId,
            createdAt: { gte: since },
            ...(monitorId ? { monitors: { some: { monitorId } } } : {}),
          },
        });
        return { label: (widget.config.label as string | undefined) ?? `Incidents (${periodDays}d)`, value: total, suffix: '', metricType, periodDays, fetchedAt: new Date().toISOString() };
      }

      // default uptime
      const runs = await prisma.monitorRun.findMany({
        where: {
          ...(monitorId ? { monitorId } : { monitor: { userId } }),
          checkedAt: { gte: since },
        },
        select: { level: true },
      });
      const total = runs.length;
      const up = runs.filter((r) => r.level === 'green').length;
      const uptimePct = total > 0 ? Math.round((up / total) * 10000) / 100 : 100;
      return { label: (widget.config.label as string | undefined) ?? `Uptime (${periodDays}d)`, value: uptimePct, suffix: '%', metricType: 'uptime', periodDays , fetchedAt: new Date().toISOString()};
    }

    case 'metric-comparison-row': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const where = monitorIds?.length
        ? { userId, id: { in: monitorIds }, enabled: true }
        : { userId, enabled: true };

      const scopeMonitors = await prisma.monitor.findMany({
        where,
        select: { id: true },
      });

      if (scopeMonitors.length === 0) {
        return { _noConfig: true };
      }

      const ids = scopeMonitors.map((m) => m.id);
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 3_600_000);
      const startOfToday = new Date(now);
      startOfToday.setUTCHours(0, 0, 0, 0);

      const [uptimeRuns, latencyRuns, todayRuns, activeIncidents] = await Promise.all([
        prisma.monitorRun.findMany({
          where: { monitorId: { in: ids }, checkedAt: { gte: thirtyDaysAgo } },
          select: { level: true },
        }),
        prisma.monitorRun.findMany({
          where: { monitorId: { in: ids }, checkedAt: { gte: twentyFourHoursAgo }, latencyMs: { not: null } },
          select: { latencyMs: true },
        }),
        prisma.monitorRun.findMany({
          where: { monitorId: { in: ids }, checkedAt: { gte: startOfToday } },
          select: { id: true },
        }),
        prisma.incident.findMany({
          where: { userId, status: { not: IncidentStatus.RESOLVED } },
          select: { id: true },
        }),
      ]);

      const uptimeTotal = uptimeRuns.length;
      const uptimeUp = uptimeRuns.filter((r) => r.level === 'green').length;
      const uptimePct = uptimeTotal > 0 ? Math.round((uptimeUp / uptimeTotal) * 10000) / 100 : 100;
      const uptimeColor = uptimePct >= 99.9 ? 'green' : uptimePct >= 99 ? 'yellow' : 'red';

      const avgMs = latencyRuns.length > 0
        ? Math.round(latencyRuns.reduce((s, r) => s + (r.latencyMs ?? 0), 0) / latencyRuns.length)
        : 0;
      const latencyColor = avgMs < 200 ? 'green' : avgMs < 800 ? 'yellow' : 'red';

      const checksToday = todayRuns.length;

      const incidentCount = activeIncidents.length;
      const incidentColor = incidentCount === 0 ? 'green' : 'red';

      return {
        metrics: [
          { key: 'uptime', label: 'Uptime (30d)', value: `${uptimePct}`, unit: '%', color: uptimeColor },
          { key: 'avg-latency', label: 'Avg Latency (24h)', value: avgMs > 0 ? String(avgMs) : 'N/A', unit: avgMs > 0 ? 'ms' : '', color: latencyColor },
          { key: 'checks-today', label: 'Checks Today', value: String(checksToday), unit: '', color: 'blue' },
          { key: 'active-incidents', label: 'Active Incidents', value: String(incidentCount), unit: '', color: incidentColor },
        ],
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'custom-metric-chart': {
      const monitorId = widget.config.monitorId as string | undefined;
      const chartType = (widget.config.chartType as string | undefined) ?? 'line';
      const timeRangeHours = Math.min(Math.max((widget.config.timeRange as number) ?? 24, 1), 720);
      const metric = (widget.config.metric as string | undefined) ?? 'latency';

      if (!monitorId) {
        return { labels: [], values: [], unit: '', chartType };
      }

      const since = new Date(Date.now() - timeRangeHours * 3_600_000);

      if (metric === 'latency') {
        const runs = await prisma.monitorRun.findMany({
          where: { monitorId, checkedAt: { gte: since }, latencyMs: { not: null } },
          select: { checkedAt: true, latencyMs: true },
          orderBy: { checkedAt: 'asc' },
        });

        const bucketMs = timeRangeHours <= 24 ? 3_600_000 : timeRangeHours <= 168 ? 6 * 3_600_000 : 24 * 3_600_000;
        const bucketCount = Math.ceil((timeRangeHours * 3_600_000) / bucketMs);
        const buckets = new Array(bucketCount).fill(null).map((_, i) => {
          const start = since.getTime() + i * bucketMs;
          return { start, sum: 0, count: 0 };
        });

        for (const run of runs) {
          const t = (run.checkedAt as Date).getTime();
          const idx = Math.floor((t - since.getTime()) / bucketMs);
          if (idx >= 0 && idx < buckets.length && run.latencyMs !== null) {
            buckets[idx].sum += run.latencyMs as number;
            buckets[idx].count++;
          }
        }

        const labels = buckets.map((b) => {
          const d = new Date(b.start);
          if (bucketMs < 24 * 3_600_000) return `${d.getUTCHours().toString().padStart(2, '0')}:00`;
          return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        });
        const values = buckets.map((b) => (b.count > 0 ? Math.round(b.sum / b.count) : 0));
        return { labels, values, unit: 'ms', chartType };
      }

      if (metric === 'uptime') {
        const runs = await prisma.monitorRun.findMany({
          where: { monitorId, checkedAt: { gte: since } },
          select: { checkedAt: true, level: true },
          orderBy: { checkedAt: 'asc' },
        });

        const bucketMs = timeRangeHours <= 24 ? 3_600_000 : timeRangeHours <= 168 ? 6 * 3_600_000 : 24 * 3_600_000;
        const bucketCount = Math.ceil((timeRangeHours * 3_600_000) / bucketMs);
        const buckets = new Array(bucketCount).fill(null).map((_, i) => ({
          start: since.getTime() + i * bucketMs, green: 0, total: 0,
        }));

        for (const run of runs) {
          const t = (run.checkedAt as Date).getTime();
          const idx = Math.floor((t - since.getTime()) / bucketMs);
          if (idx >= 0 && idx < buckets.length) {
            buckets[idx].total++;
            if (run.level === 'green') buckets[idx].green++;
          }
        }

        const labels = buckets.map((b) => {
          const d = new Date(b.start);
          if (bucketMs < 24 * 3_600_000) return `${d.getUTCHours().toString().padStart(2, '0')}:00`;
          return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        });
        const values = buckets.map((b) => (b.total > 0 ? Math.round((b.green / b.total) * 10000) / 100 : 100));
        return { labels, values, unit: '%', chartType };
      }

      if (metric === 'checks') {
        const runs = await prisma.monitorRun.findMany({
          where: { monitorId, checkedAt: { gte: since } },
          select: { checkedAt: true },
          orderBy: { checkedAt: 'asc' },
        });

        const bucketMs = timeRangeHours <= 24 ? 3_600_000 : timeRangeHours <= 168 ? 6 * 3_600_000 : 24 * 3_600_000;
        const bucketCount = Math.ceil((timeRangeHours * 3_600_000) / bucketMs);
        const buckets = new Array(bucketCount).fill(null).map((_, i) => ({
          start: since.getTime() + i * bucketMs, count: 0,
        }));

        for (const run of runs) {
          const t = (run.checkedAt as Date).getTime();
          const idx = Math.floor((t - since.getTime()) / bucketMs);
          if (idx >= 0 && idx < buckets.length) {
            buckets[idx].count++;
          }
        }

        const labels = buckets.map((b) => {
          const d = new Date(b.start);
          if (bucketMs < 24 * 3_600_000) return `${d.getUTCHours().toString().padStart(2, '0')}:00`;
          return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        });
        const values = buckets.map((b) => b.count);
        return { labels, values, unit: 'checks', chartType };
      }

      return { labels: [], values: [], unit: '', chartType , fetchedAt: new Date().toISOString()};
    }

    case 'gauge': {
      const metricType = (widget.config.metricType as string | undefined) ?? 'uptime';
      const thresholdGreen = (widget.config.thresholdGreen as number | undefined) ?? 90;
      const thresholdYellow = (widget.config.thresholdYellow as number | undefined) ?? 70;
      const periodDays = (widget.config.periodDays as number) ?? 30;
      const slaTarget = (widget.config.slaTarget as number | undefined) ?? 99.9;

      const since = new Date(Date.now() - periodDays * 86_400_000);

      const scopeWhere = (() => {
        const ids = widget.config.monitorIds as string[] | undefined;
        const singleId = widget.config.monitorId as string | undefined;
        if (ids?.length) return { userId, id: { in: ids }, enabled: true };
        if (singleId) return { userId, id: singleId, enabled: true };
        return { userId, enabled: true };
      })();

      const monitors = await prisma.monitor.findMany({
        where: scopeWhere,
        select: { id: true },
      });

      if (monitors.length === 0) {
        return { _noConfig: true };
      }

      const ids = monitors.map((m) => m.id);
      const runs = await prisma.monitorRun.findMany({
        where: { monitorId: { in: ids }, checkedAt: { gte: since }, latencyMs: { not: null } },
        select: { level: true, latencyMs: true },
      });

      let value: number;
      let label: string;

      if (metricType === 'sla') {
        const total = runs.length;
        const up = runs.filter((r) => r.level === 'green').length;
        const uptimePct = total > 0 ? (up / total) * 100 : 100;
        value = Math.round(Math.min((uptimePct / slaTarget) * 100, 100) * 10) / 10;
        label = `SLA Compliance (target ${slaTarget}%)`;
      } else if (metricType === 'apdex') {
        const satisfiedMs = (widget.config.satisfiedThresholdMs as number | undefined) ?? 200;
        const toleratingMs = (widget.config.toleratingThresholdMs as number | undefined) ?? 800;
        const total = runs.length;
        if (total === 0) {
          value = 100;
        } else {
          let satisfied = 0;
          let tolerating = 0;
          for (const r of runs) {
            const ms = r.latencyMs ?? 0;
            if (ms < satisfiedMs) satisfied++;
            else if (ms < toleratingMs) tolerating++;
          }
          value = Math.round(((satisfied + tolerating / 2) / total) * 100 * 10) / 10;
        }
        label = 'Apdex Score';
      } else {
        const total = runs.length;
        const up = runs.filter((r) => r.level === 'green').length;
        value = total > 0 ? Math.round((up / total) * 10000) / 100 : 100;
        label = `Uptime (${periodDays}d)`;
      }

      return {
        value,
        metricType,
        label,
        thresholds: { green: thresholdGreen, yellow: thresholdYellow },
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'stats-grid': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const whereMonitors = monitorIds?.length
        ? { userId, id: { in: monitorIds }, enabled: true }
        : { userId, enabled: true };

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 3_600_000);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfToday = new Date(now);
      startOfToday.setUTCHours(0, 0, 0, 0);

      const monitors = await prisma.monitor.findMany({
        where: whereMonitors,
        select: {
          id: true,
          runs: { orderBy: { checkedAt: 'desc' }, take: 1, select: { level: true } },
        },
      });

      const total = monitors.length;
      const up = monitors.filter((m) => m.runs[0]?.level === 'green').length;

      const allIds = monitors.map((m) => m.id);
      const [uptimeRuns, incidentRuns, responseRuns, todayRuns] = await Promise.all([
        prisma.monitorRun.findMany({
          where: { monitorId: { in: allIds }, checkedAt: { gte: thirtyDaysAgo } },
          select: { level: true },
        }),
        prisma.incident.findMany({
          where: { userId, createdAt: { gte: startOfMonth } },
          select: { id: true },
        }),
        prisma.monitorRun.findMany({
          where: { monitorId: { in: allIds }, checkedAt: { gte: twentyFourHoursAgo }, latencyMs: { not: null } },
          select: { latencyMs: true },
        }),
        prisma.monitorRun.findMany({
          where: { monitorId: { in: allIds }, checkedAt: { gte: startOfToday } },
          select: { id: true },
        }),
      ]);

      const uptimeTotal = uptimeRuns.length;
      const uptimeUp = uptimeRuns.filter((r) => r.level === 'green').length;
      const avgUptimePct = uptimeTotal > 0 ? Math.round((uptimeUp / uptimeTotal) * 10000) / 100 : 100;

      const avgResponseMs = responseRuns.length > 0
        ? Math.round(responseRuns.reduce((s, r) => s + (r.latencyMs ?? 0), 0) / responseRuns.length)
        : 0;

      const activeAlerts = await prisma.incident.count({
        where: { userId, status: { not: IncidentStatus.RESOLVED } },
      });

      const slaTarget = (widget.config.slaTarget as number | undefined) ?? 99.9;
      const slaCompliance = uptimeTotal > 0
        ? Math.round(Math.min((avgUptimePct / slaTarget) * 100, 100) * 10) / 10
        : 100;

      const stats = [
        { key: 'total-monitors', label: 'Total Monitors', value: String(total), icon: '📡', trend: undefined, trendDir: undefined },
        { key: 'currently-up', label: 'Currently Up', value: `${up}/${total}`, icon: '✅', trend: up === total ? 'all healthy' : `${total - up} down`, trendDir: up < total ? 'down' as const : undefined },
        { key: 'avg-uptime', label: 'Avg Uptime (30d)', value: `${avgUptimePct}%`, icon: '📈', trend: undefined, trendDir: undefined },
        { key: 'incidents-month', label: 'Incidents This Month', value: String(incidentRuns.length), icon: '🚨', trend: incidentRuns.length > 0 ? 'active' : 'clear', trendDir: incidentRuns.length > 0 ? 'down' as const : undefined },
        { key: 'avg-response', label: 'Avg Response (24h)', value: avgResponseMs > 0 ? `${avgResponseMs}ms` : 'N/A', icon: '⚡', trend: undefined, trendDir: undefined },
        { key: 'active-alerts', label: 'Active Alerts', value: String(activeAlerts), icon: '🔔', trend: activeAlerts > 0 ? 'open' : 'none', trendDir: activeAlerts > 0 ? 'down' as const : undefined },
        { key: 'checks-today', label: 'Checks Today', value: String(todayRuns.length), icon: '🔍', trend: undefined, trendDir: undefined },
        { key: 'sla-compliance', label: 'SLA Compliance', value: `${slaCompliance}%`, icon: '📋', trend: slaCompliance >= slaTarget ? 'passing' : 'failing', trendDir: slaCompliance < slaTarget ? 'down' as const : undefined },
      ];

      return { stats , fetchedAt: new Date().toISOString()};
    }

    case 'sparkline-row': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const where = monitorIds?.length
        ? { userId, id: { in: monitorIds }, enabled: true }
        : { userId, enabled: true };

      const scopeMonitors = await prisma.monitor.findMany({
        where,
        select: {
          id: true,
          name: true,
          runs: { orderBy: { checkedAt: 'desc' }, take: 1, select: { level: true } },
        },
        orderBy: { name: 'asc' },
        take: 6,
      });

      if (scopeMonitors.length === 0) {
        return { _noConfig: true };
      }

      // Batch fetch latest 24 latency runs for all monitors
      // We need the latest 24 per monitor — fetch a reasonable batch and group
      const allLatencyRuns = await prisma.monitorRun.findMany({
        where: { monitorId: { in: scopeMonitors.map((m) => m.id) }, latencyMs: { not: null } },
        orderBy: { checkedAt: 'desc' },
        select: { monitorId: true, latencyMs: true, checkedAt: true },
        // 6 monitors * 24 runs each = 144 max
        take: scopeMonitors.length * 24,
      });
      const latencyByMonitor = new Map<string, number[]>();
      const countByMonitor = new Map<string, number>();
      for (const r of allLatencyRuns) {
        const count = countByMonitor.get(r.monitorId) ?? 0;
        if (count >= 24) continue;
        countByMonitor.set(r.monitorId, count + 1);
        if (!latencyByMonitor.has(r.monitorId)) latencyByMonitor.set(r.monitorId, []);
        latencyByMonitor.get(r.monitorId)!.push(r.latencyMs ?? 0);
      }

      const monitors = scopeMonitors.map((m) => {
        const dataPoints = (latencyByMonitor.get(m.id) ?? []).reverse();
        const avgMs = dataPoints.length > 0
          ? Math.round(dataPoints.reduce((s, v) => s + v, 0) / dataPoints.length)
          : 0;
        const level = m.runs[0]?.level ?? 'green';
        const status: 'up' | 'down' | 'degraded' =
          level === 'red' ? 'down' : level === 'yellow' ? 'degraded' : 'up';
        return { id: m.id, name: m.name, dataPoints, avgMs, status };
      });

      return { monitors , fetchedAt: new Date().toISOString()};
    }

    case 'progress-ring': {
      const metricType = (widget.config.metricType as string | undefined) ?? 'uptime';
      const periodDays = (widget.config.periodDays as number) ?? 30;

      if (metricType === 'custom') {
        const customValue = Math.min(100, Math.max(0, (widget.config.customValue as number) ?? 100));
        const label = (widget.config.label as string) ?? 'Custom';
        const color = customValue >= 99 ? 'green' : customValue >= 95 ? 'yellow' : 'red';
        return { value: customValue, label, color };
      }

      const scopeWhere = (() => {
        const ids = widget.config.monitorIds as string[] | undefined;
        const singleId = widget.config.monitorId as string | undefined;
        if (ids?.length) return { userId, id: { in: ids }, enabled: true };
        if (singleId) return { userId, id: singleId, enabled: true };
        return { userId, enabled: true };
      })();

      const monitors = await prisma.monitor.findMany({
        where: scopeWhere,
        select: { id: true },
      });

      if (monitors.length === 0) {
        return { _noConfig: true };
      }

      const ids = monitors.map((m) => m.id);
      const since = new Date(Date.now() - periodDays * 86_400_000);

      const runs = await prisma.monitorRun.findMany({
        where: { monitorId: { in: ids }, checkedAt: { gte: since } },
        select: { level: true },
      });

      const total = runs.length;
      const up = runs.filter((r) => r.level === 'green').length;
      const uptimePct = total > 0 ? Math.round((up / total) * 10000) / 100 : 100;

      let value: number;
      let label: string;

      if (metricType === 'sla') {
        const slaTarget = (widget.config.slaTarget as number) ?? 99.9;
        value = Math.round(Math.min((uptimePct / slaTarget) * 100, 100) * 10) / 10;
        label = `SLA Compliance`;
      } else {
        value = uptimePct;
        label = `Uptime (${periodDays}d)`;
      }

      const color = value >= 99 ? 'green' : value >= 95 ? 'yellow' : 'red';
      return { value, label, color , fetchedAt: new Date().toISOString()};
    }

    case 'data-table':
      return { widgetType: widget.type, config: widget.config, fetchedAt: new Date().toISOString() };

    default:
      return { widgetType: widget.type, message: 'Widget data not yet implemented for this type' };
  }
}
