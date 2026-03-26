import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { RedisCacheService } from '../common/redis-cache.service';
import { CreateStatusPageDto, UpdateStatusPageDto } from './status-pages.dto';
import { PageLayout, Widget } from './status-pages.types';
import { WidgetDataResolverService } from './widget-data-resolver.service';
import { StatusPageSubscriberService } from './subscriber.service';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly widgetResolver: WidgetDataResolverService,
    private readonly subscriberService: StatusPageSubscriberService,
  ) {}

  /**
   * Returns all status pages owned by the authenticated user.
   * Strips the passwordHash field and replaces it with a boolean `hasPassword` flag.
   *
   * @param userId - The authenticated user's ID (cuid string)
   * @returns Array of status page summaries ordered by createdAt descending
   */
  async findAll(userId: string) {
    const pages = await this.prisma.publicStatusPage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { subscribers: true } } },
    });
    return pages.map(({ passwordHash: _, _count, ...safe }) => ({
      ...safe,
      hasPassword: !!_,
      subscriberCount: _count.subscribers,
    }));
  }

  /**
   * Returns a single status page by ID, enforcing ownership.
   *
   * @param userId - The authenticated user's ID
   * @param id - The status page ID
   * @returns The status page with `hasPassword` flag (passwordHash is stripped)
   * @throws NotFoundException if the status page does not exist
   * @throws ForbiddenException if the page belongs to a different user
   */
  async findOne(userId: string, id: string) {
    const page = await this.prisma.publicStatusPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Status page not found');
    if (page.userId !== userId) throw new ForbiddenException('Access denied');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...safe } = page;
    return { ...safe, hasPassword: !!page.passwordHash };
  }

  /**
   * Returns full preview data for a status page owned by the authenticated user,
   * regardless of whether the page is published. Uses the same data pipeline as
   * `findPublic` so the preview matches the real public view exactly.
   *
   * @param userId - The authenticated user's ID
   * @param id - The status page ID
   * @returns Full public-like page data including monitors, incidents, maintenance, and recent checks
   * @throws NotFoundException if the page does not exist
   * @throws ForbiddenException if the page belongs to a different user
   */
  async findPreview(userId: string, id: string) {
    const page = await this.prisma.publicStatusPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Status page not found');
    if (page.userId !== userId) throw new ForbiddenException('Access denied');

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

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const incidents = await this.prisma.incident.findMany({
      where: { userId: page.userId, createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, title: true, status: true, severity: true, createdAt: true, resolvedAt: true,
        updates: { orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, body: true, status: true, createdAt: true } },
        monitors: { include: { monitor: { select: { id: true, name: true } } } },
      },
    });

    const maintenanceWindows = await this.prisma.maintenanceWindow.findMany({
      where: { userId: page.userId, endsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
      take: 10,
      select: {
        id: true, name: true, description: true, startsAt: true, endsAt: true,
        monitors: { include: { monitor: { select: { id: true, name: true } } } },
      },
    });

    const recentChecks = await this.prisma.monitorRun.findMany({
      where: { monitor: { userId: page.userId, enabled: true } },
      orderBy: { checkedAt: 'desc' },
      take: 50,
      select: {
        id: true, monitorId: true, checkedAt: true, ok: true, level: true, latencyMs: true, message: true,
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
        id: i.id, title: i.title, status: i.status, severity: i.severity,
        createdAt: i.createdAt, resolvedAt: i.resolvedAt,
        updates: i.updates.map(u => ({ id: u.id, message: u.body, status: u.status, createdAt: u.createdAt })),
        monitors: i.monitors.map(im => im.monitor),
      })),
      maintenance: maintenanceWindows.map(mw => ({ ...mw, monitors: mw.monitors.map(mm => mm.monitor) })),
      recentChecks: recentChecks.map(c => ({
        id: c.id, monitorId: c.monitorId, monitorName: c.monitor.name,
        checkedAt: c.checkedAt, ok: c.ok, level: c.level, latencyMs: c.latencyMs, message: c.message,
      })),
    };
  }

  /**
   * Creates a new status page for the authenticated user.
   * Auto-generates a slug from the title if not provided; appends a timestamp suffix if slug is already taken.
   *
   * @param userId - The authenticated user's ID
   * @param dto - DTO containing title, optional slug, description, and layout
   * @returns The created status page (without passwordHash)
   */
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

  /**
   * Updates an existing status page. Supports updating title, description, layout, password, and webhook URL.
   * When layout changes, the current layout is snapshotted to version history (capped at 10 snapshots).
   * If `dto.removePassword` is set the password is cleared; if `dto.password` is set it is hashed with bcrypt.
   *
   * @param userId - The authenticated user's ID
   * @param id - The status page ID to update
   * @param dto - Partial update payload
   * @returns Updated status page with `hasPassword` flag (passwordHash is stripped)
   * @throws NotFoundException if the status page does not exist
   * @throws ForbiddenException if the page belongs to a different user
   */
  async update(userId: string, id: string, dto: UpdateStatusPageDto) {
    // Gracefully handle missing/empty body — treat as no-op update
    if (!dto || typeof dto !== 'object') {
      dto = {} as UpdateStatusPageDto;
    }
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
    if (dto.title !== undefined && dto.title !== null) updateData['title'] = String(dto.title).trim();
    if (dto.description !== undefined && dto.description !== null) updateData['description'] = String(dto.description).trim();
    if (dto.layout !== undefined) updateData['layout'] = dto.layout;
    if (passwordHashUpdate !== undefined) updateData['passwordHash'] = passwordHashUpdate;
    if (dto.notifyWebhookUrl !== undefined) {
      // Empty string or null = clear the webhook
      updateData['notifyWebhookUrl'] = dto.notifyWebhookUrl ? String(dto.notifyWebhookUrl).trim() || null : null;
    }
    if (dto.slackWebhookUrl !== undefined) {
      updateData['slackWebhookUrl'] = dto.slackWebhookUrl ? String(dto.slackWebhookUrl).trim() || null : null;
    }
    if (dto.discordWebhookUrl !== undefined) {
      updateData['discordWebhookUrl'] = dto.discordWebhookUrl ? String(dto.discordWebhookUrl).trim() || null : null;
    }
    if (dto.customCss !== undefined) {
      updateData['customCss'] = dto.customCss ? String(dto.customCss).trim() || null : null;
    }

    // Snapshot current layout before overwriting (version history)
    if (dto.layout !== undefined) {
      await this.prisma.statusPageHistory.create({
        data: {
          statusPageId: id,
          layout: page.layout as Prisma.InputJsonValue,
          label: null,
        },
      });
      // Prune to last 10 snapshots
      const old = await this.prisma.statusPageHistory.findMany({
        where: { statusPageId: id },
        orderBy: { savedAt: 'desc' },
        skip: 10,
        select: { id: true },
      });
      if (old.length > 0) {
        await this.prisma.statusPageHistory.deleteMany({
          where: { id: { in: old.map((h) => h.id) } },
        });
      }
    }

    const updated = await this.prisma.publicStatusPage.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(`Status page updated: ${id} by user ${userId} (updatedAt=${updated.updatedAt.toISOString()})`);

    // Invalidate all widget cache entries for this page (layout may have changed widget configs).
    if (dto.layout !== undefined) {
      await this.cache.invalidatePattern(`widget:*`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...safe } = updated;
    return { ...safe, hasPassword: !!updated.passwordHash };
  }

  /**
   * Returns the last 10 layout history snapshots for a status page, ordered newest first.
   *
   * @param userId - The authenticated user's ID
   * @param id - The status page ID
   * @returns Array of history entries (id, savedAt, label, layout)
   * @throws NotFoundException if the status page does not exist
   * @throws ForbiddenException if the page belongs to a different user
   */
  async getHistory(userId: string, id: string) {
    const page = await this.prisma.publicStatusPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Status page not found');
    if (page.userId !== userId) throw new ForbiddenException('Access denied');

    const history = await this.prisma.statusPageHistory.findMany({
      where: { statusPageId: id },
      orderBy: { savedAt: 'desc' },
      take: 10,
      select: { id: true, savedAt: true, label: true, layout: true },
    });
    return history;
  }

  /**
   * Restores a status page layout to a specific history snapshot.
   * Before restoring, the current layout is saved as a new history entry labelled "Before restore".
   *
   * @param userId - The authenticated user's ID
   * @param pageId - The status page ID
   * @param historyId - The history snapshot ID to restore from
   * @returns Updated status page with restored layout and `hasPassword` flag
   * @throws NotFoundException if the status page or history entry does not exist
   * @throws ForbiddenException if the page belongs to a different user
   */
  async restoreHistory(userId: string, pageId: string, historyId: string) {
    const page = await this.prisma.publicStatusPage.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException('Status page not found');
    if (page.userId !== userId) throw new ForbiddenException('Access denied');

    const snapshot = await this.prisma.statusPageHistory.findUnique({ where: { id: historyId } });
    if (!snapshot || snapshot.statusPageId !== pageId) throw new NotFoundException('History entry not found');

    // Save current state as a snapshot before restoring
    await this.prisma.statusPageHistory.create({
      data: {
        statusPageId: pageId,
        layout: page.layout as Prisma.InputJsonValue,
        label: 'Before restore',
      },
    });

    const updated = await this.prisma.publicStatusPage.update({
      where: { id: pageId },
      data: { layout: snapshot.layout as Prisma.InputJsonValue },
    });

    this.logger.log(`Status page ${pageId} restored to history ${historyId} by user ${userId}`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...safe } = updated;
    return { ...safe, hasPassword: !!updated.passwordHash };
  }

  /**
   * Toggles the published state of a status page (published ↔ unpublished).
   *
   * @param userId - The authenticated user's ID
   * @param id - The status page ID
   * @returns Updated status page (without passwordHash)
   * @throws NotFoundException if the status page does not exist
   * @throws ForbiddenException if the page belongs to a different user
   */
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

  /**
   * Permanently deletes a status page and all associated data.
   *
   * @param userId - The authenticated user's ID
   * @param id - The status page ID to delete
   * @returns `{ deleted: true }` on success
   * @throws NotFoundException if the status page does not exist
   * @throws ForbiddenException if the page belongs to a different user
   */
  async remove(userId: string, id: string) {
    const page = await this.prisma.publicStatusPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Status page not found');
    if (page.userId !== userId) throw new ForbiddenException('Access denied');

    await this.prisma.publicStatusPage.delete({ where: { id } });
    this.logger.log(`Status page deleted: ${id} by user ${userId}`);
    return { deleted: true };
  }

  /**
   * Validates a slug and checks whether it is available for use.
   * Slug must be 3–50 lowercase alphanumeric characters or hyphens, with no leading/trailing hyphens.
   *
   * @param userId - The authenticated user's ID (not currently used for filtering but reserved)
   * @param slug - The candidate slug to validate and check
   * @param excludeId - Optional status page ID to exclude from uniqueness check (for edits)
   * @returns `{ available, valid, slug?, reason? }` — valid=false when format check fails
   */
  async checkSlugAvailability(userId: string, slug: string, excludeId?: string) {
    const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
    if (!slug || !SLUG_RE.test(slug)) {
      return { available: false, valid: false, reason: 'Slug must be 3-50 chars, lowercase letters/numbers/hyphens, no leading/trailing hyphens' };
    }

    const existing = await this.prisma.publicStatusPage.findUnique({ where: { slug }, select: { id: true } });
    const taken = existing !== null && existing.id !== (excludeId ?? '');
    return { available: !taken, valid: true, slug };
  }

  /**
   * Fetches the full public view of a published status page.
   * Validates the optional password if the page is password-protected.
   * Returns monitor summaries, recent incidents, active maintenance windows, and recent check history.
   *
   * @param slug - The unique public slug of the status page
   * @param password - Optional plain-text password for password-protected pages
   * @returns Public page data including monitors, incidents, maintenance windows, and recent checks
   * @throws NotFoundException if the page does not exist or is not published
   * @throws UnauthorizedException if the page is password-protected and no/incorrect password is supplied
   */
  /**
   * List all published status pages (public summary only).
   * Returns slug, title, description, and createdAt — no layout or monitor data.
   */
  async listPublicPages() {
    const pages = await this.prisma.publicStatusPage.findMany({
      where: { isPublished: true },
      select: {
        slug: true,
        title: true,
        description: true,
        layout: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Extract monitor IDs per page from layout JSON
    const pageMonitorMap = new Map<string, Set<string>>();
    const allMonitorIds = new Set<string>();

    for (const page of pages) {
      const rawLayout = page.layout as unknown;
      const layout = (typeof rawLayout === 'string' ? JSON.parse(rawLayout) : rawLayout) as PageLayout | null;
      const widgets: Widget[] = layout?.widgets ?? [];
      const ids = new Set<string>();
      for (const w of widgets) {
        if (typeof w.config?.monitorId === 'string') ids.add(w.config.monitorId);
        if (Array.isArray(w.config?.monitorIds)) {
          for (const id of w.config.monitorIds) {
            if (typeof id === 'string') ids.add(id);
          }
        }
      }
      pageMonitorMap.set(page.slug, ids);
      ids.forEach((id) => allMonitorIds.add(id));
    }

    // Single batched query for all monitors across all pages
    const monitorStatusMap = new Map<string, boolean | null>(); // id → ok (null = no runs)
    if (allMonitorIds.size > 0) {
      const monitors = await this.prisma.monitor.findMany({
        where: { id: { in: [...allMonitorIds] } },
        select: {
          id: true,
          runs: { orderBy: { checkedAt: 'desc' }, take: 1, select: { ok: true } },
        },
      });
      for (const m of monitors) {
        monitorStatusMap.set(m.id, m.runs.length > 0 ? m.runs[0].ok : null);
      }
    }

    // Compute aggregate status per page
    return pages.map((page) => {
      const ids = pageMonitorMap.get(page.slug) ?? new Set();
      let status: 'operational' | 'degraded' | 'outage' | 'unknown' = 'unknown';
      let monitorsTotal = 0;
      let monitorsUp = 0;

      if (ids.size > 0) {
        for (const id of ids) {
          const ok = monitorStatusMap.get(id);
          if (ok !== undefined) {
            monitorsTotal++;
            if (ok === true) monitorsUp++;
          }
        }
        const monitorsDown = monitorsTotal - monitorsUp;
        if (monitorsTotal === 0) {
          status = 'unknown';
        } else if (monitorsDown === 0 && monitorsUp > 0) {
          status = 'operational';
        } else if (monitorsDown === monitorsTotal) {
          status = 'outage';
        } else if (monitorsDown > 0) {
          status = 'degraded';
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { layout: _layout, ...rest } = page;
      return { ...rest, status, monitorsTotal, monitorsUp };
    });
  }

  async findPublic(slug: string, password?: string) {
    const page = await this.prisma.publicStatusPage.findUnique({ where: { slug } });
    if (!page || !page.isPublished) throw new NotFoundException('Status page not found or not published');

    if (page.passwordHash) {
      if (!password) {
        // Return a minimal "protected" response — signal the password gate UI
        throw new ForbiddenException(JSON.stringify({ protected: true, title: page.title }));
      }
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

  // ── Subscriber delegation ──────────────────────────────────────────────────

  async subscribeToStatusPage(slug: string, email: string): Promise<{ subscribed: boolean; alreadySubscribed: boolean }> {
    return this.subscriberService.subscribeToStatusPage(slug, email);
  }

  async unsubscribe(token: string): Promise<void> {
    return this.subscriberService.unsubscribe(token);
  }

  async notifySubscribersOfIncident(incidentId: string, eventType: 'created' | 'resolved'): Promise<void> {
    return this.subscriberService.notifySubscribersOfIncident(incidentId, eventType);
  }


  // ── Widget data delegation ────────────────────────────────────────────────

  /**
   * Returns live widget data for a preview (owner-only, no publish required).
   */
  async getPreviewWidgetData(userId: string, id: string, widgetId: string, range?: string) {
    const page = await this.prisma.publicStatusPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Status page not found');
    if (page.userId !== userId) throw new ForbiddenException('Access denied');
    const layout = page.layout as unknown as PageLayout;
    const widget = layout.widgets?.find((w: Widget) => w.id === widgetId);
    if (!widget) throw new NotFoundException('Widget not found');
    return this.widgetResolver.resolveWidgetData(page.userId, widget, range);
  }

  async getWidgetData(slug: string, widgetId: string, password?: string, range?: string) {
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

    return this.widgetResolver.resolveWidgetData(page.userId, widget, range);
  }

  /**
   * Returns a structured JSON summary of a published status page suitable for machine consumption (API / badges).
   * Includes overall status, per-monitor statuses, active incidents, and upcoming maintenance windows.
   *
   * @param slug - The unique public slug of the status page
   * @param password - Optional plain-text password for password-protected pages
   * @returns Structured JSON with page metadata, overall status, monitors, incidents, and maintenance
   * @throws NotFoundException if the page does not exist or is not published
   * @throws UnauthorizedException if the page is password-protected and the supplied password is wrong/missing
   */
  async getPublicJson(slug: string, password?: string): Promise<Record<string, unknown>> {
    const page = await this.prisma.publicStatusPage.findUnique({ where: { slug } });
    if (!page || !page.isPublished) throw new NotFoundException('Status page not found or not published');

    if (page.passwordHash) {
      if (!password) throw new UnauthorizedException('This status page is password-protected');
      const valid = await bcrypt.compare(password, page.passwordHash);
      if (!valid) throw new UnauthorizedException('Incorrect password');
    }

    // Fetch monitors with latest run
    const monitors = await this.prisma.monitor.findMany({
      where: { userId: page.userId, enabled: true },
      select: {
        id: true,
        name: true,
        type: true,
        isFlapping: true,
        runs: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
          select: { level: true, ok: true, latencyMs: true, checkedAt: true },
        },
      },
    });

    const monitorStatuses = monitors.map((m) => {
      const latest = m.runs[0];
      return {
        id: m.id,
        name: m.name,
        type: m.type,
        status: latest?.level ?? 'unknown',
        ok: latest?.ok ?? null,
        latencyMs: latest?.latencyMs ?? null,
        lastChecked: latest?.checkedAt ?? null,
        isFlapping: m.isFlapping ?? false,
      };
    });

    // Overall status: red if any down, yellow if any degraded, green otherwise
    const hasDown = monitorStatuses.some(m => m.status === 'red');
    const hasDegraded = monitorStatuses.some(m => m.status === 'yellow');
    const overallStatus = hasDown ? 'down' : hasDegraded ? 'degraded' : 'operational';

    // Active incidents
    const activeIncidents = await this.prisma.incident.findMany({
      where: { userId: page.userId, resolvedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        status: true,
        severity: true,
        createdAt: true,
        updates: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, status: true, createdAt: true },
        },
      },
    });

    // Upcoming maintenance
    const now = new Date();
    const upcomingMaintenance = await this.prisma.maintenanceWindow.findMany({
      where: { userId: page.userId, endsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
      take: 5,
      select: {
        id: true,
        name: true,
        description: true,
        startsAt: true,
        endsAt: true,
      },
    });

    return {
      page: { slug: page.slug, title: page.title, description: page.description },
      overallStatus,
      monitors: monitorStatuses,
      activeIncidents: activeIncidents.map(i => ({
        id: i.id,
        title: i.title,
        status: i.status,
        severity: i.severity,
        createdAt: i.createdAt,
        latestUpdate: i.updates[0] ?? null,
      })),
      upcomingMaintenance,
      generatedAt: now.toISOString(),
    };
  }

  /**
   * Generates an RSS 2.0 XML feed of recent incidents for a published status page.
   * Returns the last 20 incidents as RSS items, including their status, severity, and latest update.
   *
   * @param slug - The unique public slug of the status page
   * @returns A valid RSS 2.0 XML string
   * @throws NotFoundException if the page does not exist or is not published
   */
  async getRssFeed(slug: string): Promise<string> {
    const page = await this.prisma.publicStatusPage.findUnique({ where: { slug } });
    if (!page || !page.isPublished) throw new NotFoundException('Status page not found or not published');

    // Fetch recent incidents for this user
    const incidents = await this.prisma.incident.findMany({
      where: { userId: page.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        updates: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const pageTitle = this.escapeXml(page.title);
    const pageUrl = `${process.env.APP_URL ?? 'https://localhost'}/status/${slug}`;
    const feedUrl = `${process.env.APP_URL ?? 'https://localhost'}/v1/public/status/${slug}/feed.xml`;
    const now = new Date().toUTCString();

    const items = incidents.map((inc) => {
      const title = this.escapeXml(inc.title);
      const status = inc.resolvedAt ? 'Resolved' : 'Active';
      const lastUpdate = inc.updates[0]?.body ?? '';
      const description = this.escapeXml(
        `Status: ${status}. Severity: ${inc.severity}. ${lastUpdate}`.trim()
      );
      const pubDate = new Date(inc.createdAt).toUTCString();
      const link = `${pageUrl}#incident-${inc.id}`;
      return `    <item>
      <title>[${status}] ${title}</title>
      <link>${link}</link>
      <description>${description}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${link}</guid>
    </item>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${pageTitle} — Status Updates</title>
    <link>${pageUrl}</link>
    <description>Incident updates for ${pageTitle}</description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
${items.join('\n')}
  </channel>
</rss>`;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
