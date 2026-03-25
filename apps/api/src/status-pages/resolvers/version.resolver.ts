import { MonitorType } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { RedisCacheService } from '../../common/redis-cache.service';
import { Widget } from '../status-pages.types';

export async function resolveVersionWidget(
  prisma: PrismaService,
  _cache: RedisCacheService,
  userId: string,
  widget: Widget,
  _overrideDays: number | undefined,
): Promise<Record<string, unknown>> {
  const monitorId = widget.config.monitorId as string | undefined;

  switch (widget.type) {
    case 'version-status-grid': {
      const monitors = await prisma.monitor.findMany({
        where: { userId, enabled: true },
        select: { id: true, name: true, type: true },
      });
      const latestRuns = await Promise.all(
        monitors.map(async (m) => {
          const run = await prisma.monitorRun.findFirst({
            where: { monitorId: m.id },
            orderBy: { checkedAt: 'desc' },
            select: { level: true, message: true, checkedAt: true, latencyMs: true },
          });
          return { ...m, run };
        }),
      );
      const versionMonitors = latestRuns.filter(
        (m) => m.run?.message && /current/i.test(m.run.message),
      );
      return {
        monitors: versionMonitors.map((m) => ({
          id: m.id,
          name: m.name,
          type: m.type,
          level: m.run?.level ?? 'green',
          message: m.run?.message ?? null,
          lastChecked: m.run?.checkedAt?.toISOString() ?? null,
        })),
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'version-check-badge': {
      if (!monitorId) return { _noConfig: true };
      const monitor = await prisma.monitor.findFirst({
        where: { id: monitorId, userId },
        include: { runs: { orderBy: { checkedAt: 'desc' }, take: 1 } },
      });
      if (!monitor) return { _noConfig: true };
      const latest = monitor.runs[0];
      const msg = latest?.message ?? '';
      const m = msg.match(/current\s+([^\s,]+)[,\s]+latest\s+([^\s,]+)/i);
      const current = m ? m[1] : null;
      const latestVersion = m ? m[2] : null;
      let diff: 'up-to-date' | 'patch' | 'minor' | 'major' = 'up-to-date';
      if (current && latestVersion) {
        const c = current.replace(/^v/i, '').split('.');
        const l = latestVersion.replace(/^v/i, '').split('.');
        if (c[0] !== l[0]) diff = 'major';
        else if (c[1] !== l[1]) diff = 'minor';
        else if (c[2] !== l[2]) diff = 'patch';
      }
      return {
        monitorId,
        name: monitor.name,
        level: latest?.level ?? 'green',
        current,
        latest: latestVersion,
        diff,
        lastChecked: latest?.checkedAt ?? null,
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'update-summary': {
      const versionTypes = ['GIT_RELEASE', 'DOCKER_IMAGE'];
      const versionMonitors = await prisma.monitor.findMany({
        where: { userId, enabled: true, type: { in: versionTypes as never[] } },
        include: { runs: { orderBy: { checkedAt: 'desc' }, take: 1 } },
      });

      let upToDate = 0, patch = 0, minor = 0, major = 0;
      const updates: Array<{ id: string; name: string; current: string | null; latest: string | null; diff: string }> = [];

      for (const m of versionMonitors) {
        const msg = m.runs[0]?.message ?? '';
        const match = msg.match(/current\s+([^\s,]+)[,\s]+latest\s+([^\s,]+)/i);
        const current = match ? match[1] : null;
        const latestVersion = match ? match[2] : null;
        if (!current || !latestVersion) { upToDate++; continue; }
        const c = current.replace(/^v/i, '').split('.');
        const l = latestVersion.replace(/^v/i, '').split('.');
        let diff: 'up-to-date' | 'patch' | 'minor' | 'major' = 'up-to-date';
        if (c[0] !== l[0]) diff = 'major';
        else if (c[1] !== l[1]) diff = 'minor';
        else if (c[2] !== l[2]) diff = 'patch';
        if (diff === 'up-to-date') upToDate++;
        else if (diff === 'major') major++;
        else if (diff === 'minor') minor++;
        else patch++;
        if (diff !== 'up-to-date') updates.push({ id: m.id, name: m.name, current, latest: latestVersion, diff });
      }

      return {
        total: versionMonitors.length,
        upToDate,
        patch,
        minor,
        major,
        updates: updates.slice(0, 20),
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'version-timeline': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const limit = Math.min(Math.max((widget.config.limit as number) ?? 20, 1), 100);

      const versionMonitors = await prisma.monitor.findMany({
        where: monitorIds?.length
          ? { userId, id: { in: monitorIds }, type: MonitorType.GIT_RELEASE }
          : { userId, type: MonitorType.GIT_RELEASE },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 50,
      });

      if (versionMonitors.length === 0) return { events: [], count: 0 };

      type VersionEvent = {
        monitorId: string;
        name: string;
        fromVersion: string;
        toVersion: string;
        detectedAt: Date;
      };

      const allEvents: VersionEvent[] = [];

      for (const monitor of versionMonitors) {
        const runs = await prisma.monitorRun.findMany({
          where: { monitorId: monitor.id, ok: true },
          select: { message: true, checkedAt: true },
          orderBy: { checkedAt: 'desc' },
          take: 200,
        });

        for (let i = 0; i < runs.length - 1; i++) {
          const current = runs[i];
          const previous = runs[i + 1];
          const currVersion = current.message?.trim() ?? '';
          const prevVersion = previous.message?.trim() ?? '';
          if (currVersion && prevVersion && currVersion !== prevVersion) {
            allEvents.push({
              monitorId: monitor.id,
              name: monitor.name,
              fromVersion: prevVersion,
              toVersion: currVersion,
              detectedAt: current.checkedAt as Date,
            });
          }
        }
      }

      allEvents.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());

      return {
        events: allEvents.slice(0, limit),
        count: allEvents.length,
        fetchedAt: new Date().toISOString(),
      };
    }

    case 'outdated-components-alert': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const where = monitorIds?.length
        ? { userId, id: { in: monitorIds }, type: MonitorType.GIT_RELEASE, enabled: true }
        : { userId, type: MonitorType.GIT_RELEASE, enabled: true };

      const versionMonitors = await prisma.monitor.findMany({
        where,
        select: {
          id: true,
          name: true,
          configJson: true,
          runs: {
            orderBy: { checkedAt: 'desc' },
            take: 1,
            select: { message: true },
          },
        },
        orderBy: { name: 'asc' },
      });

      if (versionMonitors.length === 0) {
        return { _noConfig: true };
      }

      type OutdatedEntry = {
        monitorId: string;
        name: string;
        currentVersion: string;
        latestVersion: string;
        severity: 'critical' | 'warning' | 'info';
      };

      const outdated: OutdatedEntry[] = [];
      let upToDate = 0;

      for (const m of versionMonitors) {
        const run = m.runs[0];
        const currentVersion = (run?.message ?? '').trim();
        const cfg = (m.configJson ?? {}) as Record<string, unknown>;
        const latestVersion = (
          (cfg.latestVersion as string | undefined) ?? ''
        ).trim();

        if (!currentVersion || !latestVersion) {
          upToDate++;
          continue;
        }

        if (currentVersion === latestVersion) {
          upToDate++;
          continue;
        }

        const parseSemver = (v: string) => {
          const clean = v.replace(/^[^0-9]*/, '');
          const parts = clean.split('.').map((p) => parseInt(p, 10) || 0);
          return { major: parts[0] ?? 0, minor: parts[1] ?? 0, patch: parts[2] ?? 0 };
        };

        const current = parseSemver(currentVersion);
        const latest = parseSemver(latestVersion);

        let severity: 'critical' | 'warning' | 'info';
        const majorDiff = latest.major - current.major;
        if (majorDiff > 2) {
          severity = 'critical';
        } else if (majorDiff > 0 || latest.minor !== current.minor) {
          severity = 'warning';
        } else {
          severity = 'info';
        }

        outdated.push({ monitorId: m.id, name: m.name, currentVersion, latestVersion, severity });
      }

      return { outdated, upToDate, total: versionMonitors.length , fetchedAt: new Date().toISOString()};
    }

    case 'version-comparison-table': {
      const monitorIds = widget.config.monitorIds as string[] | undefined;
      const where = monitorIds?.length
        ? { userId, id: { in: monitorIds }, type: MonitorType.GIT_RELEASE, enabled: true }
        : { userId, type: MonitorType.GIT_RELEASE, enabled: true };

      const versionMonitors = await prisma.monitor.findMany({
        where,
        select: {
          id: true,
          name: true,
          configJson: true,
          runs: {
            orderBy: { checkedAt: 'desc' },
            take: 1,
            select: { message: true, checkedAt: true },
          },
        },
        orderBy: { name: 'asc' },
      });

      if (versionMonitors.length === 0) {
        return { _noConfig: true };
      }

      const rows = versionMonitors.map((m) => {
        const run = m.runs[0];
        const current = (run?.message ?? '').trim() || 'unknown';
        const cfg = (m.configJson ?? {}) as Record<string, unknown>;
        const latest = (
          (cfg.latestVersion as string | undefined) ?? current
        ).trim();
        return {
          monitorId: m.id,
          name: m.name,
          current,
          latest,
          upToDate: current === latest,
          lastChecked: (run?.checkedAt as Date | null)?.toISOString() ?? null,
        };
      });

      return { rows , fetchedAt: new Date().toISOString()};
    }

    case 'changelog-widget':
      return { widgetType: widget.type, config: widget.config, fetchedAt: new Date().toISOString() };

    default:
      return { widgetType: widget.type, message: 'Widget data not yet implemented for this type' };
  }
}
