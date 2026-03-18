import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
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

      default:
        return { widgetType: widget.type, message: 'Widget data not yet implemented for this type' };
    }
  }
}
