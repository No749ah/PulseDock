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
      select: {
        id: true,
        name: true,
        type: true,
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
        level: latest?.level ?? 'green',
        lastChecked: latest?.checkedAt ?? null,
        latencyMs: latest?.latencyMs ?? null,
        message: latest?.message ?? null,
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...safePage } = page;
    return {
      ...safePage,
      layout: page.layout as unknown as PageLayout,
      monitors: monitorSummary,
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

      default:
        return { widgetType: widget.type, message: 'Widget data not yet implemented for this type' };
    }
  }
}
