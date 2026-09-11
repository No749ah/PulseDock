import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { MailerService } from '../common/mailer.service';

@Injectable()
export class StatusPageSubscriberService {
  private readonly logger = new Logger(StatusPageSubscriberService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

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
}
