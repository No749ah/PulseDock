import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IncidentStatus, IncidentSeverity, MonitorType } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { CreateStatusPageDto, UpdateStatusPageDto } from './status-pages.dto';
import { PageLayout, Widget } from './status-pages.types';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function emptyLayout(): PageLayout {
  return { widgets: [] };
}

@Injectable()
export class StatusPagesService {
  private readonly logger = new Logger(StatusPagesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const pages = await this.prisma.publicStatusPage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return pages.map(({ passwordHash: _, ...safe }) => ({
      ...safe,
      hasPassword: !!_,
    }));
  }

  async findOne(userId: string, id: string) {
    const page = await this.prisma.publicStatusPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Status page not found');
    if (page.userId !== userId) throw new ForbiddenException('Access denied');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...safe } = page;
    return { ...safe, hasPassword: !!page.passwordHash };
  }

  async create(userId: string, dto: CreateStatusPageDto) {
    let slug = dto.slug?.trim() || slugify(dto.title);
    if (!slug) slug = `page-${Date.now()}`;

    // Ensure slug uniqueness by appending suffix if taken
    const existing = await this.prisma.publicStatusPage.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const layoutData: PageLayout = (dto.layout as unknown as PageLayout) ?? emptyLayout();

    const page = await this.prisma.publicStatusPage.create({
      data: {
        userId,
        slug,
        title: dto.title.trim(),
        description: dto.description?.trim(),
        layout: layoutData as unknown as Parameters<typeof this.prisma.publicStatusPage.create>[0]['data']['layout'],
      },
    });

    this.logger.log(`Status page created: ${page.id} (slug: ${slug}) by user ${userId}`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...safe } = page;
    return safe;
  }

  async update(userId: string, id: string, dto: UpdateStatusPageDto) {
    const page = await this.prisma.publicStatusPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Status page not found');
    if (page.userId !== userId) throw new ForbiddenException('Access denied');

    let passwordHashUpdate: string | null | undefined = undefined;
    if (dto.removePassword) {
      passwordHashUpdate = null;
    } else if (dto.password) {
      passwordHashUpdate = await bcrypt.hash(dto.password, 12);
    }

    const updateData: Record<string, unknown> = {};
    if (dto.title !== undefined) updateData['title'] = dto.title.trim();
    if (dto.description !== undefined) updateData['description'] = dto.description.trim();
    if (dto.layout !== undefined) updateData['layout'] = dto.layout as unknown;
    if (passwordHashUpdate !== undefined) updateData['passwordHash'] = passwordHashUpdate;

    const updated = await this.prisma.publicStatusPage.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(`Status page updated: ${id} by user ${userId}`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...safe } = updated;
    return { ...safe, hasPassword: !!updated.passwordHash };
  }

  async publish(userId: string, id: string) {
    const page = await this.prisma.publicStatusPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Status page not found');
    if (page.userId !== userId) throw new ForbiddenException('Access denied');

    const updated = await this.prisma.publicStatusPage.update({
      where: { id },
      data: { isPublished: !page.isPublished },
    });

    this.logger.log(
      `Status page ${id} ${updated.isPublished ? 'published' : 'unpublished'} by user ${userId}`,
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...safe } = updated;
    return safe;
  }

  async remove(userId: string, id: string) {
    const page = await this.prisma.publicStatusPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Status page not found');
    if (page.userId !== userId) throw new ForbiddenException('Access denied');

    await this.prisma.publicStatusPage.delete({ where: { id } });
    this.logger.log(`Status page deleted: ${id} by user ${userId}`);
    return { deleted: true };
  }

  async findPublic(slug: string, password?: string) {
    const page = await this.prisma.publicStatusPage.findUnique({ where: { slug } });
    if (!page || !page.isPublished) throw new NotFoundException('Status page not found or not published');

    if (page.passwordHash) {
      if (!password) throw new UnauthorizedException('This status page is password-protected');
      const valid = await bcrypt.compare(password, page.passwordHash);
      if (!valid) throw new UnauthorizedException('Incorrect password');
    }

    // Fetch monitor overview data for the page owner
    const monitors = await this.prisma.monitor.findMany({
      where: { userId: page.userId, enabled: true },
      include: {
        folder: { select: { id: true, name: true } },
        monitorTags: { include: { tag: { select: { id: true, name: true } } } },
        runs: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
          select: { level: true, message: true, latencyMs: true, checkedAt: true },
        },
      },
    });

    const monitorSummary = monitors.map((m) => {
      const latest = m.runs[0];
      return {
        id: m.id,
        name: m.name,
        type: m.type,
        folderId: m.folderId,
        folderName: m.folder?.name ?? null,
        tags: m.monitorTags.map(t => t.tag.name),
        level: latest?.level ?? 'green',
        lastChecked: latest?.checkedAt ?? null,
        latencyMs: latest?.latencyMs ?? null,
        message: latest?.message ?? null,
      };
    });

    // Fetch incidents for the page owner (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const incidents = await this.prisma.incident.findMany({
      where: { userId: page.userId, createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        status: true,
        severity: true,
        createdAt: true,
        resolvedAt: true,
        updates: { orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, body: true, status: true, createdAt: true } },
        monitors: { include: { monitor: { select: { id: true, name: true } } } },
      },
    });

    // Fetch active/upcoming maintenance windows
    const maintenanceWindows = await this.prisma.maintenanceWindow.findMany({
      where: { userId: page.userId, endsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
      take: 10,
      select: {
        id: true,
        name: true,
        description: true,
        startsAt: true,
        endsAt: true,
        monitors: { include: { monitor: { select: { id: true, name: true } } } },
      },
    });

    // Fetch recent check history (last 50 checks across all monitors)
    const recentChecks = await this.prisma.monitorRun.findMany({
      where: { monitor: { userId: page.userId, enabled: true } },
      orderBy: { checkedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        monitorId: true,
        checkedAt: true,
        ok: true,
        level: true,
        latencyMs: true,
        message: true,
        monitor: { select: { name: true } },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...safePage } = page;
    return {
      ...safePage,
      layout: page.layout as unknown as PageLayout,
      monitors: monitorSummary,
      incidents: incidents.map(i => ({
        id: i.id,
        title: i.title,
        status: i.status,
        severity: i.severity,
        createdAt: i.createdAt,
        resolvedAt: i.resolvedAt,
        updates: i.updates.map(u => ({ id: u.id, message: u.body, status: u.status, createdAt: u.createdAt })),
        monitors: i.monitors.map(im => im.monitor),
      })),
      maintenance: maintenanceWindows.map(mw => ({
        ...mw,
        monitors: mw.monitors.map(mm => mm.monitor),
      })),
      recentChecks: recentChecks.map(c => ({
        id: c.id,
        monitorId: c.monitorId,
        monitorName: c.monitor.name,
        checkedAt: c.checkedAt,
        ok: c.ok,
        level: c.level,
        latencyMs: c.latencyMs,
        message: c.message,
      })),
    };
  }

  async getWidgetData(slug: string, widgetId: string, password?: string) {
    const page = await this.prisma.publicStatusPage.findUnique({ where: { slug } });
    if (!page || !page.isPublished) throw new NotFoundException('Status page not found or not published');

    if (page.passwordHash) {
      if (!password) throw new UnauthorizedException('Password required');
      const valid = await bcrypt.compare(password, page.passwordHash);
      if (!valid) throw new UnauthorizedException('Incorrect password');
    }

    const layout = page.layout as unknown as PageLayout;
    const widget = layout.widgets?.find((w: Widget) => w.id === widgetId);
    if (!widget) throw new NotFoundException('Widget not found');

    return this.resolveWidgetData(page.userId, widget);
  }

  private async resolveWidgetData(userId: string, widget: Widget): Promise<Record<string, unknown>> {
    const monitorId = widget.config.monitorId as string | undefined;

    switch (widget.type) {
      case 'uptime-bar': {
        if (!monitorId) throw new BadRequestException('Widget missing monitorId config');
        const periodDays = (widget.config.periodDays as number) ?? 30;
        const since = new Date(Date.now() - periodDays * 86_400_000);
        const runs = await this.prisma.monitorRun.findMany({
          where: { monitorId, checkedAt: { gte: since } },
          select: { level: true },
        });
        const total = runs.length;
        const up = runs.filter((r: { level: string }) => r.level === 'green').length;
        const uptimePct = total > 0 ? Math.round((up / total) * 10000) / 100 : 100;
        return { monitorId, uptimePct, periodDays, total };
      }

      case 'uptime-timeline': {
        if (!monitorId) throw new BadRequestException('Widget missing monitorId config');
        const days = Math.min(Math.max((widget.config.days as number) ?? 90, 7), 365);
        const now = new Date();
        // Build day buckets: index 0 = oldest, index (days-1) = today
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
        const runs = await this.prisma.monitorRun.findMany({
          where: { monitorId, checkedAt: { gte: since } },
          select: { level: true, checkedAt: true },
          orderBy: { checkedAt: 'asc' },
        });
        // Group runs by date string
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
          // Majority-failed → red; any failure → yellow; all ok → green
          const failRate = (counts.yellow + counts.red) / total;
          const level = failRate >= 0.5 ? 'red' : failRate > 0 ? 'yellow' : 'green';
          return { date: b.date, level, counts };
        });
        return { monitorId, days, timeline };
      }

      case 'current-status-badge': {
        if (!monitorId) throw new BadRequestException('Widget missing monitorId config');
        const monitor = await this.prisma.monitor.findFirst({
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
        };
      }

      case 'overall-system-status': {
        const monitors = await this.prisma.monitor.findMany({
          where: { userId, enabled: true },
          include: { runs: { orderBy: { checkedAt: 'desc' }, take: 1 } },
        });
        const down = monitors.filter((m) => m.runs[0]?.level === 'red').length;
        const degraded = monitors.filter((m) => m.runs[0]?.level === 'yellow').length;
        const status = down > 0 ? 'outage' : degraded > 0 ? 'degraded' : 'operational';
        return { status, monitorsDown: down, monitorsDegraded: degraded, total: monitors.length };
      }

      case 'sla-summary': {
        if (!monitorId) throw new BadRequestException('Widget missing monitorId config');
        const periodDays = Math.min(Math.max((widget.config.periodDays as number) ?? 30, 1), 365);
        const slaTgt = Math.min(Math.max((widget.config.slaTarget as number) ?? 99.9, 0), 100);
        const since = new Date(Date.now() - periodDays * 86_400_000);
        const runs = await this.prisma.monitorRun.findMany({
          where: { monitorId, checkedAt: { gte: since } },
          select: { level: true },
        });
        const total = runs.length;
        const up = runs.filter((r: { level: string }) => r.level === 'green').length;
        const uptimePct = total > 0 ? Math.round((up / total) * 10000) / 100 : 100;
        const pass = uptimePct >= slaTgt;
        // Compute allowable downtime minutes remaining in period
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
        };
      }

      case 'response-time-chart': {
        if (!monitorId) throw new BadRequestException('Widget missing monitorId config');
        // Default: last 60 data points (configurable via periodHours or points)
        const points = Math.min(Math.max((widget.config.points as number) ?? 60, 10), 200);
        const periodHours = (widget.config.periodHours as number) ?? 0; // 0 = use last N points
        let where: Record<string, unknown> = { monitorId };
        if (periodHours > 0) {
          const since = new Date(Date.now() - periodHours * 3_600_000);
          where = { monitorId, checkedAt: { gte: since } };
        }
        const runs = await this.prisma.monitorRun.findMany({
          where,
          select: { checkedAt: true, latencyMs: true, level: true },
          orderBy: { checkedAt: 'desc' },
          take: points,
        });
        // Reverse to chronological order (oldest → newest)
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
        return { monitorId, dataPoints, avgMs, p95Ms, maxMs };
      }

      case 'response-time-heatmap': {
        // Hour-of-day (0-23) × Day-of-week (0=Sun … 6=Sat) latency heatmap
        // Returns avg latency per cell + overall stats for color scale
        if (!monitorId) throw new BadRequestException('Widget missing monitorId config');
        const periodDays = Math.min(Math.max((widget.config.periodDays as number) ?? 90, 7), 365);
        const since = new Date(Date.now() - periodDays * 86_400_000);
        const runs = await this.prisma.monitorRun.findMany({
          where: { monitorId, checkedAt: { gte: since }, latencyMs: { not: null } },
          select: { checkedAt: true, latencyMs: true },
          orderBy: { checkedAt: 'desc' },
          take: 10_000,
        });

        // Build 7×24 grid: cells[dayOfWeek][hour] = { sum, count }
        const cells: Array<Array<{ sum: number; count: number }>> =
          Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ sum: 0, count: 0 })));

        for (const run of runs) {
          const d = run.checkedAt as Date;
          const dow = d.getUTCDay();   // 0=Sun … 6=Sat
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

        return { monitorId, grid, minMs, maxMs, avgMs, periodDays };
      }

      case 'component-status-list': {
        // Returns per-monitor status: Operational / Degraded / Partial Outage / Major Outage
        const monitorIds = widget.config.monitorIds as string[] | undefined;
        const where = monitorIds?.length
          ? { userId, id: { in: monitorIds }, enabled: true }
          : { userId, enabled: true };
        const monitors = await this.prisma.monitor.findMany({
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
        return { components, overallStatus, total: components.length, downCount, degradedCount };
      }

      case 'rolling-uptime-cards': {
        // Returns uptime% for multiple periods: 24h / 7d / 30d / 90d
        if (!monitorId) throw new BadRequestException('Widget missing monitorId config');
        const periods = [
          { label: '24h', days: 1 },
          { label: '7d', days: 7 },
          { label: '30d', days: 30 },
          { label: '90d', days: 90 },
        ];
        const cards = await Promise.all(
          periods.map(async ({ label, days }) => {
            const since = new Date(Date.now() - days * 86_400_000);
            const runs = await this.prisma.monitorRun.findMany({
              where: { monitorId, checkedAt: { gte: since } },
              select: { level: true },
            });
            const total = runs.length;
            const up = runs.filter((r) => r.level === 'green').length;
            const uptimePct = total > 0 ? Math.round((up / total) * 10000) / 100 : 100;
            return { label, days, uptimePct, total };
          }),
        );
        return { monitorId, cards };
      }

      case 'status-history-ribbon': {
        // Per monitor: last 90 days as horizontal colored bar (like GitHub status)
        const monitorIds = (widget.config.monitorIds as string[] | undefined) ??
          (monitorId ? [monitorId] : []);
        if (monitorIds.length === 0) throw new BadRequestException('Widget missing monitorId(s) config');
        const days = Math.min(Math.max((widget.config.days as number) ?? 90, 7), 180);
        const since = new Date(Date.now() - days * 86_400_000);
        // Fetch all runs for all monitors in one query
        const runs = await this.prisma.monitorRun.findMany({
          where: { monitorId: { in: monitorIds }, checkedAt: { gte: since } },
          select: { monitorId: true, level: true, checkedAt: true },
          orderBy: { checkedAt: 'asc' },
        });
        const monitors = await this.prisma.monitor.findMany({
          where: { id: { in: monitorIds }, userId },
          select: { id: true, name: true },
        });
        // Build day buckets
        const now = new Date();
        const bucketKeys: string[] = [];
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date(now);
          d.setUTCHours(0, 0, 0, 0);
          d.setUTCDate(d.getUTCDate() - i);
          bucketKeys.push(d.toISOString().slice(0, 10));
        }
        // Group by monitorId → day key
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
        return { days, rows };
      }

      case 'uptime-percentage-card': {
        // Big number display: "99.97%" with trend arrow vs previous period
        if (!monitorId) throw new BadRequestException('Widget missing monitorId config');
        const periodDays = Math.min(Math.max((widget.config.periodDays as number) ?? 30, 1), 365);
        const currentSince = new Date(Date.now() - periodDays * 86_400_000);
        const prevSince = new Date(Date.now() - 2 * periodDays * 86_400_000);
        const [currentRuns, prevRuns] = await Promise.all([
          this.prisma.monitorRun.findMany({
            where: { monitorId, checkedAt: { gte: currentSince } },
            select: { level: true },
          }),
          this.prisma.monitorRun.findMany({
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
        return { monitorId, periodDays, uptimePct: current, previousPct: previous, trend, delta };
      }

      case 'service-health-matrix': {
        // Monitors × Dimensions (environments/regions) matrix.
        // Config: { rows: [{id, name}], columns: [{label, monitorIds: string[]}] }
        // Falls back to all monitors grouped by tags if no explicit config.
        type MatrixCol = { label: string; monitorIds: string[] };
        type MatrixRow = { id: string; name: string };
        const columns: MatrixCol[] = Array.isArray(widget.config.columns)
          ? (widget.config.columns as MatrixCol[])
          : [];
        const rows: MatrixRow[] = Array.isArray(widget.config.rows)
          ? (widget.config.rows as MatrixRow[])
          : [];

        if (columns.length === 0 || rows.length === 0) {
          // Auto-mode: rows = all monitors, one column = "Production"
          const monitors = await this.prisma.monitor.findMany({
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
          return { mode: 'auto', columns: ['Production'], matrix };
        }

        // Manual mode: explicit rows and columns
        const allMonitorIds = [...new Set(columns.flatMap((c) => c.monitorIds))];
        const dbMonitors = await this.prisma.monitor.findMany({
          where: { id: { in: allMonitorIds }, userId },
          select: {
            id: true, name: true,
            runs: { orderBy: { checkedAt: 'desc' }, take: 1, select: { level: true, latencyMs: true, checkedAt: true } },
          },
        });
        const monitorMap = new Map(dbMonitors.map((m) => [m.id, m]));

        // Per column: aggregate multiple monitors → single cell level
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
            // Find monitors for this row+column intersection
            // Convention: column.monitorIds contains monitor IDs for that column
            // Row filters by name/id matching within the column's monitors
            const cell = getCellLevel(col.monitorIds);
            return { colLabel: col.label, ...cell };
          }),
        }));

        return { mode: 'manual', columns: columns.map((c) => c.label), matrix };
      }

      case 'aggregate-health-score': {
        // Weighted score 0–100 from all (or selected) monitors.
        // Config: { monitorIds?: string[], weights?: Record<string, number> }
        const monitorIds = widget.config.monitorIds as string[] | undefined;
        const weights = (widget.config.weights ?? {}) as Record<string, number>;
        const where = monitorIds?.length
          ? { userId, id: { in: monitorIds }, enabled: true }
          : { userId, enabled: true };

        const monitors = await this.prisma.monitor.findMany({
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

        return { score, total: monitors.length, down, degraded, status, breakdown };
      }

      case 'latency-percentiles-card': {
        if (!monitorId) throw new BadRequestException('Widget missing monitorId config');
        const periodDays = (widget.config.periodDays as number) ?? 7;
        const currentSince = new Date(Date.now() - periodDays * 86_400_000);
        const prevSince = new Date(Date.now() - 2 * periodDays * 86_400_000);
        const [currentRuns, prevRuns] = await Promise.all([
          this.prisma.monitorRun.findMany({
            where: { monitorId, checkedAt: { gte: currentSince }, latencyMs: { not: null } },
            select: { latencyMs: true },
          }),
          this.prisma.monitorRun.findMany({
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
        };
      }

      case 'downtime-log': {
        const monitorIds = widget.config.monitorIds as string[] | undefined;
        const maxEntries = (widget.config.maxEntries as number) ?? 10;
        const periodDays = (widget.config.periodDays as number) ?? 30;
        const since = new Date(Date.now() - periodDays * 86_400_000);

        const where = monitorIds?.length
          ? { monitorId: { in: monitorIds }, checkedAt: { gte: since } }
          : { monitor: { userId }, checkedAt: { gte: since } };

        const runs = await this.prisma.monitorRun.findMany({
          where,
          select: { monitorId: true, level: true, checkedAt: true, message: true, monitor: { select: { name: true } } },
          orderBy: { checkedAt: 'asc' },
        });

        // Group runs by monitorId
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

        // Detect outage events: consecutive red runs per monitor
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

          // Ongoing outage
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

        // Sort by startedAt descending
        outages.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
        const total = outages.length;

        return {
          outages: outages.slice(0, maxEntries),
          total,
          periodDays,
        };
      }

      case 'active-incident-count': {
        const incidents = await this.prisma.incident.findMany({
          where: { userId, status: { not: IncidentStatus.RESOLVED } },
          select: { id: true, title: true, severity: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });
        return {
          count: incidents.length,
          incidents,
        };
      }

      case 'mttr-mttf-cards': {
        const monitorIds = widget.config.monitorIds as string[] | undefined;
        const periodDays = (widget.config.periodDays as number) ?? 30;
        const since = new Date(Date.now() - periodDays * 86_400_000);

        const where = monitorIds?.length
          ? { monitorId: { in: monitorIds }, checkedAt: { gte: since } }
          : { monitor: { userId }, checkedAt: { gte: since } };

        const runs = await this.prisma.monitorRun.findMany({
          where,
          select: { monitorId: true, level: true, checkedAt: true },
          orderBy: [{ monitorId: 'asc' }, { checkedAt: 'asc' }],
        });

        // Group by monitor
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

        const monitors = await this.prisma.monitor.findMany({
          where,
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });

        if (monitors.length === 0) {
          throw new BadRequestException('Widget missing monitorId(s) config or no monitors found');
        }

        const rows = await Promise.all(
          monitors.map(async (m) => {
            const runs = await this.prisma.monitorRun.findMany({
              where: { monitorId: m.id, checkedAt: { gte: since } },
              select: { level: true },
            });
            const total = runs.length;
            const up = runs.filter((r) => r.level === 'green').length;
            const actual = total > 0 ? Math.round((up / total) * 10000) / 100 : 100;
            const target = defaultTarget;
            const pass = actual >= target;
            return { monitorId: m.id, name: m.name, target, actual, pass };
          }),
        );

        // Sort: failing first, then by actual ascending
        rows.sort((a, b) => {
          if (a.pass !== b.pass) return a.pass ? 1 : -1;
          return a.actual - b.actual;
        });

        return { rows, periodDays, slaTarget: defaultTarget };
      }

      case 'uptime-heatmap': {
        if (!monitorId) throw new BadRequestException('Widget missing monitorId config');
        const days = 7;
        const since = new Date(Date.now() - days * 86_400_000);

        const runs = await this.prisma.monitorRun.findMany({
          where: { monitorId, checkedAt: { gte: since } },
          select: { level: true, checkedAt: true },
          orderBy: { checkedAt: 'asc' },
        });

        // Build 7 × 24 grid: [dayOffset 0-6][hour 0-23]
        // dayOffset 0 = 7 days ago, dayOffset 6 = today
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

        // Build day labels (date strings)
        const dayLabels: string[] = Array.from({ length: days }, (_, i) => {
          const d = new Date(todayStart);
          d.setUTCDate(d.getUTCDate() - (days - 1 - i));
          return d.toISOString().slice(0, 10);
        });

        return { monitorId, grid, dayLabels, days, hours: 24 };
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

        const incidents = await this.prisma.incident.findMany({
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

        return { incidents: result, total: result.length, periodDays };
      }

      case 'ssl-certificate-status': {
        const monitorIds = widget.config.monitorIds as string[] | undefined;
        const singleMonitorId = monitorId;

        const where = monitorIds?.length
          ? { userId, id: { in: monitorIds }, type: MonitorType.SSL_CERT, enabled: true }
          : singleMonitorId
            ? { userId, id: singleMonitorId, type: MonitorType.SSL_CERT, enabled: true }
            : { userId, type: MonitorType.SSL_CERT, enabled: true };

        const monitors = await this.prisma.monitor.findMany({
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
          throw new BadRequestException('No SSL monitors found — configure monitors of type SSL_CERT');
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

          // Parse issuer from message if available
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

        // Sort: expired/critical first
        certs.sort((a, b) => {
          const order = { expired: 0, critical: 1, 'expiring-soon': 2, valid: 3, unknown: 4 };
          return (order[a.status] ?? 4) - (order[b.status] ?? 4);
        });

        return { certs, total: certs.length };
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

        const incidents = await this.prisma.incident.findMany({
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

        const incidents = await this.prisma.incident.findMany({
          where: incidentWhere,
          select: { createdAt: true, resolvedAt: true },
        });

        if (incidents.length === 0) {
          return { avg: null, longest: null, shortest: null, count: 0, periodDays };
        }

        const durations = incidents.map((i) => {
          const resolved = i.resolvedAt as Date;
          return resolved.getTime() - (i.createdAt as Date).getTime();
        });

        const avg = Math.round(durations.reduce((s, v) => s + v, 0) / durations.length);
        const longest = Math.max(...durations);
        const shortest = Math.min(...durations);

        return { avg, longest, shortest, count: durations.length, periodDays };
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

        const incident = await this.prisma.incident.findFirst({
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
          return { incident: null };
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
        };
      }

      case 'performance-trend': {
        if (!monitorId) throw new BadRequestException('Widget missing monitorId config');
        const days = 14;
        const since = new Date(Date.now() - days * 86_400_000);

        const runs = await this.prisma.monitorRun.findMany({
          where: { monitorId, checkedAt: { gte: since }, latencyMs: { not: null } },
          select: { latencyMs: true, checkedAt: true },
          orderBy: { checkedAt: 'asc' },
        });

        // Build daily avg for the 14-day sparkline
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

        // Last 7 days = indices 7-13, prev 7 = indices 0-6
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

        return { thisWeekAvg, lastWeekAvg, changePercent, trend, dataPoints };
      }

      case 'apdex-score': {
        if (!monitorId) throw new BadRequestException('Widget missing monitorId config');
        const periodDays = Math.min(Math.max((widget.config.periodDays as number) ?? 7, 1), 90);
        const satisfiedThresholdMs = (widget.config.satisfiedThresholdMs as number) ?? 200;
        const toleratingThresholdMs = (widget.config.toleratingThresholdMs as number) ?? 800;
        const since = new Date(Date.now() - periodDays * 86_400_000);

        const runs = await this.prisma.monitorRun.findMany({
          where: { monitorId, checkedAt: { gte: since }, latencyMs: { not: null } },
          select: { latencyMs: true },
        });

        if (runs.length === 0) {
          return { score: null, satisfied: 0, tolerating: 0, frustrated: 0, total: 0, rating: null };
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

        return { score, satisfied, tolerating, frustrated, total, rating };
      }

      case 'throughput-counter': {
        const monitorIds = widget.config.monitorIds as string[] | undefined;
        const since = new Date(Date.now() - 24 * 3_600_000);

        const where = monitorIds?.length
          ? { monitorId: { in: monitorIds }, checkedAt: { gte: since } }
          : { monitor: { userId }, checkedAt: { gte: since } };

        const runs = await this.prisma.monitorRun.findMany({
          where,
          select: { checkedAt: true },
          orderBy: { checkedAt: 'asc' },
        });

        // Group by UTC hour
        const hourBuckets = new Map<string, number>();
        for (const run of runs) {
          const d = run.checkedAt as Date;
          const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}`;
          hourBuckets.set(key, (hourBuckets.get(key) ?? 0) + 1);
        }

        // Build 24-slot array for the last 24 hours
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
        const current = counts[counts.length - 2] ?? 0; // last complete hour
        const average = Math.round(counts.reduce((s, v) => s + v, 0) / counts.length);
        const peak = Math.max(...counts);

        return { current, average, peak, dataPoints };
      }

      default:
        return { widgetType: widget.type, message: 'Widget data not yet implemented for this type' };
    }
  }
}
