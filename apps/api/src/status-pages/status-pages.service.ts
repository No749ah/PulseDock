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
import { MailerService } from '../common/mailer.service';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
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
    if (dto.notifyWebhookUrl !== undefined) {
      // Empty string = clear the webhook
      updateData['notifyWebhookUrl'] = dto.notifyWebhookUrl.trim() || null;
    }

    // Snapshot current layout before overwriting (version history)
    if (dto.layout !== undefined) {
      await this.prisma.statusPageHistory.create({
        data: {
          statusPageId: id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          layout: page.layout as any,
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

    this.logger.log(`Status page updated: ${id} by user ${userId}`);
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        layout: page.layout as any,
        label: 'Before restore',
      },
    });

    const updated = await this.prisma.publicStatusPage.update({
      where: { id: pageId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { layout: snapshot.layout as any },
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

  /**
   * Subscribes an email address to incident update notifications for a published status page.
   * Returns `alreadySubscribed: true` (without error) if the email is already subscribed.
   *
   * @param slug - The unique public slug of the status page
   * @param email - The subscriber's email address
   * @returns `{ subscribed, alreadySubscribed }` indicating the result
   * @throws NotFoundException if the page does not exist or is not published
   */
  async subscribeToStatusPage(slug: string, email: string): Promise<{ subscribed: boolean; alreadySubscribed: boolean }> {
    const page = await this.prisma.publicStatusPage.findUnique({ where: { slug } });
    if (!page || !page.isPublished) throw new NotFoundException('Status page not found or not published');

    const existing = await this.prisma.statusPageSubscriber.findUnique({
      where: { statusPageId_email: { statusPageId: page.id, email } },
    });

    if (existing) {
      return { subscribed: false, alreadySubscribed: true };
    }

    const subscriber = await this.prisma.statusPageSubscriber.create({
      data: { statusPageId: page.id, email },
    });

    this.logger.log(`New subscriber for status page ${page.id}: ${email}`);

    // Send confirmation email with unsubscribe link
    const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:4321';
    const unsubscribeUrl = `${baseUrl}/api/v1/public/status/unsubscribe?token=${subscriber.unsubscribeToken}`;
    const pageUrl = `${baseUrl}/status/${slug}`;
    await this.mailer.sendStatusPageUpdateEmail(email, {
      pageTitle: page.title,
      pageSlug: page.slug,
      pageUrl,
      subject: `You're subscribed to ${page.title} status updates`,
      headline: `Subscribed to ${page.title}`,
      body: `You'll receive email notifications when incidents are created or resolved on this status page.`,
      statusColor: '#3b82f6',
      unsubscribeUrl,
    }).catch((err) => this.logger.warn(`Failed to send subscription confirmation: ${err instanceof Error ? err.message : String(err)}`));

    return { subscribed: true, alreadySubscribed: false };
  }

  /**
   * Unsubscribes a subscriber using their unique unsubscribe token.
   *
   * @param token - The unsubscribeToken from the subscriber's record
   * @throws NotFoundException if no subscriber with this token exists
   */
  async unsubscribe(token: string): Promise<void> {
    const subscriber = await this.prisma.statusPageSubscriber.findUnique({
      where: { unsubscribeToken: token },
    });
    if (!subscriber) throw new NotFoundException('Invalid or expired unsubscribe token');

    await this.prisma.statusPageSubscriber.delete({ where: { id: subscriber.id } });
    this.logger.log(`Unsubscribed ${subscriber.email} from status page ${subscriber.statusPageId}`);
  }

  /**
   * Notifies all subscribers of a status page about an incident event.
   * Looks up status pages linked to monitors in the incident, then emails subscribers.
   *
   * @param incidentId  - The incident ID
   * @param eventType   - 'created' | 'resolved'
   */
  async notifySubscribersOfIncident(incidentId: string, eventType: 'created' | 'resolved'): Promise<void> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        monitors: { select: { monitorId: true } },
      },
    });
    if (!incident) return;

    const monitorIds = incident.monitors.map((m) => m.monitorId);
    const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:4321';

    // Find all published status pages for this user
    const statusPages = await this.prisma.publicStatusPage.findMany({
      where: { userId: incident.userId, isPublished: true },
      select: { id: true, slug: true, title: true, layout: true },
    });

    // Filter pages that contain any affected monitor
    const affectedPageIds = new Set<string>();
    for (const sp of statusPages) {
      const layoutStr = JSON.stringify(sp.layout);
      const hasMonitor = monitorIds.length === 0 || monitorIds.some((id) => layoutStr.includes(id));
      if (hasMonitor) affectedPageIds.add(sp.id);
    }

    if (affectedPageIds.size === 0) return;

    // Get all subscribers for affected pages
    const subscribers = await this.prisma.statusPageSubscriber.findMany({
      where: { statusPageId: { in: [...affectedPageIds] } },
    });

    if (subscribers.length === 0) return;

    const pageMap = new Map(statusPages.map((sp) => [sp.id, sp]));
    const severityLabel = (incident.severity ?? 'medium').toLowerCase();
    const statusColor = eventType === 'created' ? '#ef4444' : '#22c55e';
    const headline = eventType === 'created'
      ? `New incident: ${incident.title}`
      : `Resolved: ${incident.title}`;
    const body = eventType === 'created'
      ? `A new ${severityLabel} severity incident has been reported. We are investigating the issue.`
      : `The incident has been resolved. Thank you for your patience.`;

    // Send emails (fire-and-forget per subscriber)
    for (const sub of subscribers) {
      const page = pageMap.get(sub.statusPageId);
      if (!page) continue;
      const unsubscribeUrl = `${baseUrl}/api/v1/public/status/unsubscribe?token=${sub.unsubscribeToken}`;
      const pageUrl = `${baseUrl}/status/${page.slug}`;
      this.mailer.sendStatusPageUpdateEmail(sub.email, {
        pageTitle: page.title,
        pageSlug: page.slug,
        pageUrl,
        subject: headline,
        headline,
        body,
        statusColor,
        unsubscribeUrl,
      }).catch((err) => this.logger.warn(`Failed to send incident notification to ${sub.email}: ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  /**
   * Resolves and returns the data payload for a single widget on a published status page.
   * Verifies the page password if the page is password-protected, then delegates to `resolveWidgetData`.
   *
   * @param slug - The unique public slug of the status page
   * @param widgetId - The widget ID within the page layout
   * @param password - Optional plain-text password for password-protected pages
   * @returns Widget-specific data object (structure depends on `widget.type`)
   * @throws NotFoundException if the page, its publication status, or the widget is not found
   * @throws UnauthorizedException if the page is password-protected and the supplied password is wrong/missing
   */
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

  /**
   * Resolves server-side data for a single widget configuration.
   * Supports all implemented widget types and returns a widget-specific payload for rendering.
   *
   * @param userId - The owner user ID of the status page
   * @param widget - The widget configuration object from the page layout
   * @returns A widget-specific data object
   * @throws BadRequestException if required widget configuration is missing or invalid
   * @throws NotFoundException if a referenced resource (e.g. monitor) does not exist
   */
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

      case 'response-time-comparison': {
        // Up to 8 monitors, last N data points of latencyMs
        const monitorIds = widget.config.monitorIds as string[] | undefined;
        const resolvedIds = monitorIds?.length
          ? monitorIds.slice(0, 8)
          : monitorId ? [monitorId] : [];
        if (resolvedIds.length === 0) throw new BadRequestException('Widget missing monitorId(s) config');

        const points = Math.min(Math.max((widget.config.points as number) ?? 24, 5), 100);
        const periodHours = (widget.config.periodHours as number) ?? 0;
        const PALETTE = ['#60a5fa', '#34d399', '#f472b6', '#fb923c', '#a78bfa', '#facc15', '#38bdf8', '#f87171'];

        const monitorsDb = await this.prisma.monitor.findMany({
          where: { id: { in: resolvedIds }, userId },
          select: { id: true, name: true },
        });

        const monitorDataList = await Promise.all(
          monitorsDb.map(async (m, idx) => {
            let where: Record<string, unknown> = { monitorId: m.id };
            if (periodHours > 0) {
              const since = new Date(Date.now() - periodHours * 3_600_000);
              where = { monitorId: m.id, checkedAt: { gte: since } };
            }
            const runs = await this.prisma.monitorRun.findMany({
              where,
              select: { latencyMs: true, checkedAt: true },
              orderBy: { checkedAt: 'desc' },
              take: points,
            });
            runs.reverse();
            return {
              id: m.id,
              name: m.name,
              color: PALETTE[idx % PALETTE.length],
              dataPoints: runs.map((r) => r.latencyMs ?? 0),
              timestamps: runs.map((r) => (r.checkedAt as Date).toISOString()),
            };
          }),
        );

        // Build labels from the longest dataset
        const longestData = monitorDataList.reduce((a, b) => (a.timestamps.length >= b.timestamps.length ? a : b), monitorDataList[0]);
        const labels = longestData.timestamps.map((ts) => {
          const d = new Date(ts);
          return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
        });

        return {
          monitors: monitorDataList.map(({ timestamps: _, ...m }) => m),
          labels,
          periodHours: periodHours || Math.round(points / 2),
        };
      }

      case 'uptime-comparison-chart': {
        const monitorIds = widget.config.monitorIds as string[] | undefined;
        const resolvedIds = monitorIds?.length
          ? monitorIds
          : monitorId ? [monitorId] : [];
        if (resolvedIds.length === 0) throw new BadRequestException('Widget missing monitorId(s) config');

        const periodDays = Math.min(Math.max((widget.config.periodDays as number) ?? 30, 1), 365);
        const since = new Date(Date.now() - periodDays * 86_400_000);

        const monitorsDb = await this.prisma.monitor.findMany({
          where: { id: { in: resolvedIds }, userId },
          select: { id: true, name: true },
        });

        const monitorDataList = await Promise.all(
          monitorsDb.map(async (m) => {
            const runs = await this.prisma.monitorRun.findMany({
              where: { monitorId: m.id, checkedAt: { gte: since } },
              select: { level: true },
            });
            const total = runs.length;
            const up = runs.filter((r) => r.level === 'green').length;
            const uptimePct = total > 0 ? Math.round((up / total) * 10000) / 100 : 100;
            return { id: m.id, name: m.name, uptimePct };
          }),
        );

        monitorDataList.sort((a, b) => b.uptimePct - a.uptimePct);
        return { monitors: monitorDataList, periodDays };
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

        const window = await this.prisma.maintenanceWindow.findFirst({
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

        const windows = await this.prisma.maintenanceWindow.findMany({
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

        return { windows: result };
      }

      case 'version-timeline': {
        const monitorIds = widget.config.monitorIds as string[] | undefined;
        const limit = Math.min(Math.max((widget.config.limit as number) ?? 20, 1), 100);

        // Find VERSION monitors in scope
        const versionMonitors = await this.prisma.monitor.findMany({
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
          const runs = await this.prisma.monitorRun.findMany({
            where: { monitorId: monitor.id, ok: true },
            select: { message: true, checkedAt: true },
            orderBy: { checkedAt: 'desc' },
            take: 200,
          });

          // Detect version changes by comparing consecutive runs
          // message field stores version info
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

        // Sort by detectedAt descending
        allEvents.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());

        return {
          events: allEvents.slice(0, limit),
          count: allEvents.length,
        };
      }

      case 'outdated-components-alert': {
        const monitorIds = widget.config.monitorIds as string[] | undefined;
        const where = monitorIds?.length
          ? { userId, id: { in: monitorIds }, type: MonitorType.GIT_RELEASE, enabled: true }
          : { userId, type: MonitorType.GIT_RELEASE, enabled: true };

        const versionMonitors = await this.prisma.monitor.findMany({
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
          throw new BadRequestException('No VERSION monitors configured');
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

          // Parse semver components for severity calculation
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

        return { outdated, upToDate, total: versionMonitors.length };
      }

      case 'version-comparison-table': {
        const monitorIds = widget.config.monitorIds as string[] | undefined;
        const where = monitorIds?.length
          ? { userId, id: { in: monitorIds }, type: MonitorType.GIT_RELEASE, enabled: true }
          : { userId, type: MonitorType.GIT_RELEASE, enabled: true };

        const versionMonitors = await this.prisma.monitor.findMany({
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
          throw new BadRequestException('No VERSION monitors configured');
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

        return { rows };
      }

      case 'dns-resolution-time': {
        const monitorIds = widget.config.monitorIds as string[] | undefined;
        const periodHours = Math.min(Math.max((widget.config.periodHours as number) ?? 24, 1), 168);
        const since = new Date(Date.now() - periodHours * 3_600_000);

        const whereMonitors = monitorIds?.length
          ? { userId, id: { in: monitorIds }, type: MonitorType.HTTP, enabled: true }
          : { userId, type: MonitorType.HTTP, enabled: true };

        const httpMonitors = await this.prisma.monitor.findMany({
          where: whereMonitors,
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
          take: 50,
        });

        if (httpMonitors.length === 0) {
          throw new BadRequestException('No HTTP monitors configured');
        }

        type MonitorStats = { name: string; avgMs: number; trend: 'up' | 'down' | 'stable' };

        const monitorStats: MonitorStats[] = [];
        const allLatencies: number[] = [];

        for (const m of httpMonitors) {
          const runs = await this.prisma.monitorRun.findMany({
            where: { monitorId: m.id, checkedAt: { gte: since }, latencyMs: { not: null } },
            select: { latencyMs: true, checkedAt: true },
            orderBy: { checkedAt: 'asc' },
          });

          const latencies = runs.map((r) => r.latencyMs as number);
          allLatencies.push(...latencies);

          if (latencies.length === 0) continue;

          const avgMs = Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length);

          // Trend: compare first half vs second half
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

        return { avgMs, p95Ms, monitors: monitorStats, periodHours };
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

        const monitors = await this.prisma.monitor.findMany({
          where: scopeWhere,
          select: { id: true },
        });

        if (monitors.length === 0) {
          throw new BadRequestException('No monitors configured for gauge');
        }

        const ids = monitors.map((m) => m.id);
        const runs = await this.prisma.monitorRun.findMany({
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
          // uptime (default)
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

        const monitors = await this.prisma.monitor.findMany({
          where: whereMonitors,
          select: {
            id: true,
            runs: { orderBy: { checkedAt: 'desc' }, take: 1, select: { level: true } },
          },
        });

        const total = monitors.length;
        const up = monitors.filter((m) => m.runs[0]?.level === 'green').length;

        // avg uptime 30d
        const allIds = monitors.map((m) => m.id);
        const [uptimeRuns, incidentRuns, responseRuns, todayRuns] = await Promise.all([
          this.prisma.monitorRun.findMany({
            where: { monitorId: { in: allIds }, checkedAt: { gte: thirtyDaysAgo } },
            select: { level: true },
          }),
          this.prisma.incident.findMany({
            where: { userId, createdAt: { gte: startOfMonth } },
            select: { id: true },
          }),
          this.prisma.monitorRun.findMany({
            where: { monitorId: { in: allIds }, checkedAt: { gte: twentyFourHoursAgo }, latencyMs: { not: null } },
            select: { latencyMs: true },
          }),
          this.prisma.monitorRun.findMany({
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

        const activeAlerts = await this.prisma.incident.count({
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

        return { stats };
      }

      case 'metric-comparison-row': {
        const monitorIds = widget.config.monitorIds as string[] | undefined;
        const where = monitorIds?.length
          ? { userId, id: { in: monitorIds }, enabled: true }
          : { userId, enabled: true };

        const scopeMonitors = await this.prisma.monitor.findMany({
          where,
          select: { id: true },
        });

        if (scopeMonitors.length === 0) {
          throw new BadRequestException('No monitors in scope for metric-comparison-row');
        }

        const ids = scopeMonitors.map((m) => m.id);
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 3_600_000);
        const startOfToday = new Date(now);
        startOfToday.setUTCHours(0, 0, 0, 0);

        const [uptimeRuns, latencyRuns, todayRuns, activeIncidents] = await Promise.all([
          this.prisma.monitorRun.findMany({
            where: { monitorId: { in: ids }, checkedAt: { gte: thirtyDaysAgo } },
            select: { level: true },
          }),
          this.prisma.monitorRun.findMany({
            where: { monitorId: { in: ids }, checkedAt: { gte: twentyFourHoursAgo }, latencyMs: { not: null } },
            select: { latencyMs: true },
          }),
          this.prisma.monitorRun.findMany({
            where: { monitorId: { in: ids }, checkedAt: { gte: startOfToday } },
            select: { id: true },
          }),
          this.prisma.incident.findMany({
            where: { userId, status: { not: IncidentStatus.RESOLVED } },
            select: { id: true },
          }),
        ]);

        // Uptime %
        const uptimeTotal = uptimeRuns.length;
        const uptimeUp = uptimeRuns.filter((r) => r.level === 'green').length;
        const uptimePct = uptimeTotal > 0 ? Math.round((uptimeUp / uptimeTotal) * 10000) / 100 : 100;
        const uptimeColor = uptimePct >= 99.9 ? 'green' : uptimePct >= 99 ? 'yellow' : 'red';

        // Avg Latency
        const avgMs = latencyRuns.length > 0
          ? Math.round(latencyRuns.reduce((s, r) => s + (r.latencyMs ?? 0), 0) / latencyRuns.length)
          : 0;
        const latencyColor = avgMs < 200 ? 'green' : avgMs < 800 ? 'yellow' : 'red';

        // Total Checks Today
        const checksToday = todayRuns.length;

        // Active Incidents
        const incidentCount = activeIncidents.length;
        const incidentColor = incidentCount === 0 ? 'green' : 'red';

        return {
          metrics: [
            { key: 'uptime', label: 'Uptime (30d)', value: `${uptimePct}`, unit: '%', color: uptimeColor },
            { key: 'avg-latency', label: 'Avg Latency (24h)', value: avgMs > 0 ? String(avgMs) : 'N/A', unit: avgMs > 0 ? 'ms' : '', color: latencyColor },
            { key: 'checks-today', label: 'Checks Today', value: String(checksToday), unit: '', color: 'blue' },
            { key: 'active-incidents', label: 'Active Incidents', value: String(incidentCount), unit: '', color: incidentColor },
          ],
        };
      }

      case 'sparkline-row': {
        const monitorIds = widget.config.monitorIds as string[] | undefined;
        const where = monitorIds?.length
          ? { userId, id: { in: monitorIds }, enabled: true }
          : { userId, enabled: true };

        const scopeMonitors = await this.prisma.monitor.findMany({
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
          throw new BadRequestException('No monitors in scope for sparkline-row');
        }

        const monitors = await Promise.all(
          scopeMonitors.map(async (m) => {
            const latencyRuns = await this.prisma.monitorRun.findMany({
              where: { monitorId: m.id, latencyMs: { not: null } },
              orderBy: { checkedAt: 'desc' },
              take: 24,
              select: { latencyMs: true },
            });
            latencyRuns.reverse();
            const dataPoints = latencyRuns.map((r) => r.latencyMs ?? 0);
            const avgMs = dataPoints.length > 0
              ? Math.round(dataPoints.reduce((s, v) => s + v, 0) / dataPoints.length)
              : 0;
            const level = m.runs[0]?.level ?? 'green';
            const status: 'up' | 'down' | 'degraded' =
              level === 'red' ? 'down' : level === 'yellow' ? 'degraded' : 'up';
            return { id: m.id, name: m.name, dataPoints, avgMs, status };
          }),
        );

        return { monitors };
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

        const monitors = await this.prisma.monitor.findMany({
          where: scopeWhere,
          select: { id: true },
        });

        if (monitors.length === 0) {
          throw new BadRequestException('No monitors configured for progress-ring');
        }

        const ids = monitors.map((m) => m.id);
        const since = new Date(Date.now() - periodDays * 86_400_000);

        const runs = await this.prisma.monitorRun.findMany({
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
        return { value, label, color };
      }

      case 'announcement-bar': {
        const message = (widget.config.message as string) ?? '';
        const type = (widget.config.type as string) ?? 'info';
        const expiresAt = widget.config.expiresAt as string | undefined;
        const dismissable = (widget.config.dismissable as boolean) ?? false;
        const expired = expiresAt ? new Date(expiresAt) <= new Date() : false;
        return {
          message,
          type,
          expiresAt,
          dismissable,
          expired,
        };
      }

      case 'link-list': {
        const links = (widget.config.links as Array<{ label: string; url: string; icon: string; description?: string }>) ?? [];
        return { links };
      }

      case 'faq-accordion': {
        const items = (widget.config.items as Array<{ question: string; answer: string }>) ?? [];
        return { items };
      }

      case 'social-links': {
        const links = (widget.config.socialLinks as Array<{ platform: string; url: string }>) ?? [];
        return { links };
      }

      case 'embed-iframe': {
        const url = widget.config.url as string | undefined;
        if (!url) throw new BadRequestException('embed-iframe widget missing url config');
        const height = (widget.config.height as number) ?? 400;
        const title = widget.config.title as string | undefined;
        const sandbox = (widget.config.sandbox as string) ?? 'allow-scripts allow-same-origin';
        return { url, height, title, sandbox };
      }

      case 'subscriber-form': {
        return {
          title: (widget.config.title as string) ?? 'Subscribe to Updates',
          description: (widget.config.description as string) ?? 'Get notified when incidents are created or resolved.',
          buttonText: (widget.config.buttonText as string) ?? 'Subscribe',
          successMessage: (widget.config.successMessage as string) ?? 'You are subscribed!',
        };
      }

      case 'countdown': {
        const label = (widget.config.label as string) ?? 'Event';
        const targetAt = widget.config.targetAt as string | undefined;
        const hideAfterExpiry = (widget.config.hideAfterExpiry as boolean) ?? false;
        if (!targetAt) {
          return { label, targetAt: null, secondsRemaining: 0, expired: true, hideAfterExpiry };
        }
        const secondsRemaining = Math.max(0, Math.floor((new Date(targetAt).getTime() - Date.now()) / 1000));
        const expired = secondsRemaining === 0;
        return { label, targetAt, secondsRemaining, expired, hideAfterExpiry };
      }

      case 'check-history-feed': {
        // Return recent checks across all monitors for this user
        const checks = await this.prisma.monitorRun.findMany({
          where: { userId },
          orderBy: { checkedAt: 'desc' },
          take: 50,
          include: { monitor: { select: { name: true } } },
        });
        return {
          checks: checks.map((c) => ({
            id: c.id,
            monitorId: c.monitorId,
            monitorName: c.monitor.name,
            checkedAt: c.checkedAt.toISOString(),
            ok: c.ok,
            level: c.level,
            latencyMs: c.latencyMs,
            message: c.message,
          })),
        };
      }

      case 'incident-history': {
        // Return recent incidents for this user
        const periodDays = (widget.config.periodDays as number) ?? 30;
        const since = new Date(Date.now() - periodDays * 86_400_000);
        const incidents = await this.prisma.incident.findMany({
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
        };
      }

      case 'scheduled-maintenance': {
        // Return active/upcoming maintenance windows
        const now = new Date();
        const windows = await this.prisma.maintenanceWindow.findMany({
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
        };
      }

      case 'version-status-grid': {
        // Return version info from GIT_RELEASE monitors
        const monitors = await this.prisma.monitor.findMany({
          where: { userId, enabled: true },
          select: { id: true, name: true, type: true },
        });
        const latestRuns = await Promise.all(
          monitors.map(async (m) => {
            const run = await this.prisma.monitorRun.findFirst({
              where: { monitorId: m.id },
              orderBy: { checkedAt: 'desc' },
              select: { level: true, message: true, checkedAt: true, latencyMs: true },
            });
            return { ...m, run };
          }),
        );
        // Filter to monitors that have version info in their message
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
        };
      }

      case 'dependency-map': {
        const depMonitorIds = widget.config.monitorIds as string[] | undefined;
        const depWhere = depMonitorIds?.length
          ? { userId, id: { in: depMonitorIds }, enabled: true }
          : { userId, enabled: true };
        const depMonitors = await this.prisma.monitor.findMany({
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
        return { nodes, edges };
      }

      case 'multi-environment-status': {
        const envMonitors = (widget.config.envMonitors as Record<string, string[]> | undefined) ?? {};
        const allEnvIds = Object.values(envMonitors).flat();
        const envMonitorsDb = allEnvIds.length > 0
          ? await this.prisma.monitor.findMany({
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
        return { environments: result };
      }

      case 'region-status-map': {
        const regionMonitors = (widget.config.regionMonitors as Record<string, string[]> | undefined) ?? {};
        const allRegionIds = Object.values(regionMonitors).flat();
        const regionMonitorsDb = allRegionIds.length > 0
          ? await this.prisma.monitor.findMany({
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
        return { regions };
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

      case 'table-of-contents':
        // Pure content widget — no server data needed
        return { items: (widget.config.items as Array<{ label: string; anchor: string }>) ?? [] };

      case 'page-navigation': {
        // Return list of other published status pages for this user
        const otherPages = await this.prisma.publicStatusPage.findMany({
          where: { userId, isPublished: true },
          select: { slug: true, title: true, description: true },
          orderBy: { title: 'asc' },
          take: 20,
        });
        return { pages: otherPages };
      }

      case 'column-layout':
        // Pure layout widget — no server data needed
        return { columns: (widget.config.columns as number) ?? 2 };

      case 'sticky-header': {
        // Show overall system status for the page
        const allMonitors = await this.prisma.monitor.findMany({
          where: { userId },
          select: { id: true },
        });
        const monitorIds = allMonitors.map((m) => m.id);
        if (monitorIds.length === 0) return { status: 'operational', monitorCount: 0 };

        const since = new Date(Date.now() - 5 * 60 * 1000); // last 5 min
        const latestRuns = await this.prisma.monitorRun.findMany({
          where: { monitorId: { in: monitorIds }, checkedAt: { gte: since } },
          orderBy: { checkedAt: 'desc' },
          distinct: ['monitorId'],
          select: { monitorId: true, level: true },
        });

        const hasDown = latestRuns.some((r) => r.level === 'red');
        const hasDegraded = latestRuns.some((r) => r.level === 'yellow');
        const status = hasDown ? 'outage' : hasDegraded ? 'degraded' : 'operational';
        return { status, monitorCount: monitorIds.length };
      }

      case 'offline-banner': {
        // Purely client-side widget — no data fetch needed
        return { type: 'offline-banner', config: widget.config };
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
          // Bucket latency into hourly averages
          const runs = await this.prisma.monitorRun.findMany({
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
          // Bucket uptime% per period
          const runs = await this.prisma.monitorRun.findMany({
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
          // Count checks per period
          const runs = await this.prisma.monitorRun.findMany({
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

        return { labels: [], values: [], unit: '', chartType };
      }

      default:
        return { widgetType: widget.type, message: 'Widget data not yet implemented for this type' };
    }
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
