import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { MailerService } from '../common/mailer.service';
import { UpdateNotificationPreferenceDto } from './notifications.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * Returns the notification preference for a user.
   * Creates a default record if one doesn't exist yet (upsert on first access).
   *
   * @param userId - Authenticated user ID
   * @returns Notification preference DTO (all fields serialised to plain objects)
   */
  async getPreference(userId: string) {
    const pref = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return this.toDto(pref);
  }

  /**
   * Updates the notification preference for a user (partial update).
   * Creates a default record first if one doesn't exist.
   *
   * @param userId - Authenticated user ID
   * @param dto    - Partial preference update payload (all fields optional)
   * @returns Updated notification preference DTO
   */
  async updatePreference(userId: string, dto: UpdateNotificationPreferenceDto) {
    const pref = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...(dto.notifyOnDown !== undefined && { notifyOnDown: dto.notifyOnDown }),
        ...(dto.notifyOnRecovery !== undefined && { notifyOnRecovery: dto.notifyOnRecovery }),
        ...(dto.notifyOnDegraded !== undefined && { notifyOnDegraded: dto.notifyOnDegraded }),
        ...(dto.quietHoursEnabled !== undefined && { quietHoursEnabled: dto.quietHoursEnabled }),
        ...(dto.quietHoursStart !== undefined && { quietHoursStart: dto.quietHoursStart }),
        ...(dto.quietHoursEnd !== undefined && { quietHoursEnd: dto.quietHoursEnd }),
        ...(dto.frequency !== undefined && { frequency: dto.frequency }),
        ...(dto.alertStormProtection !== undefined && { alertStormProtection: dto.alertStormProtection }),
        ...(dto.alertStormThreshold !== undefined && { alertStormThreshold: dto.alertStormThreshold }),
      },
      update: {
        ...(dto.notifyOnDown !== undefined && { notifyOnDown: dto.notifyOnDown }),
        ...(dto.notifyOnRecovery !== undefined && { notifyOnRecovery: dto.notifyOnRecovery }),
        ...(dto.notifyOnDegraded !== undefined && { notifyOnDegraded: dto.notifyOnDegraded }),
        ...(dto.quietHoursEnabled !== undefined && { quietHoursEnabled: dto.quietHoursEnabled }),
        ...(dto.quietHoursStart !== undefined && { quietHoursStart: dto.quietHoursStart }),
        ...(dto.quietHoursEnd !== undefined && { quietHoursEnd: dto.quietHoursEnd }),
        ...(dto.frequency !== undefined && { frequency: dto.frequency }),
        ...(dto.alertStormProtection !== undefined && { alertStormProtection: dto.alertStormProtection }),
        ...(dto.alertStormThreshold !== undefined && { alertStormThreshold: dto.alertStormThreshold }),
      },
    });
    return this.toDto(pref);
  }

  /**
   * Enqueue a notification for digest delivery.
   * Called when frequency is hourly_digest or daily_digest — instead of dropping the notification,
   * we persist it so the cron job can batch-deliver it later.
   *
   * @param userId     - Authenticated user ID
   * @param eventType  - Type of event
   * @param monitorId  - Optional monitor ID
   * @param monitorName - Optional monitor name
   * @param message    - Human-readable alert message
   */
  async enqueueForDigest(
    userId: string,
    eventType: 'down' | 'recovery' | 'degraded' | 'flapping',
    monitorId: string | null,
    monitorName: string | null,
    message: string,
  ): Promise<void> {
    try {
      await this.prisma.notificationQueueItem.create({
        data: {
          userId,
          eventType,
          monitorId,
          monitorName,
          message,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to enqueue notification for user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Checks whether a notification should fire right now, given the user's preferences.
   * Used by the alerts service before dispatching notifications.
   *
   * IMPORTANT: When this returns false due to frequency != 'instant', the caller should call
   * enqueueForDigest() to persist the notification for later batch delivery.
   *
   * @param userId    - Authenticated user ID
   * @param eventType - Type of event: 'down', 'recovery', or 'degraded'
   * @returns `true` if a notification should be dispatched; `false` if suppressed by preference,
   *          frequency setting, or quiet hours
   */
  async shouldNotify(userId: string, eventType: 'down' | 'recovery' | 'degraded'): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({ where: { userId } });

    // If no preferences exist yet, default to "always notify"
    if (!pref) return true;

    // Check event type preference
    if (eventType === 'down' && !pref.notifyOnDown) return false;
    if (eventType === 'recovery' && !pref.notifyOnRecovery) return false;
    if (eventType === 'degraded' && !pref.notifyOnDegraded) return false;

    // Frequency other than instant: don't fire immediately (digest queued separately)
    if (pref.frequency !== 'instant') return false;

    // Check quiet hours (UTC-based comparison)
    if (pref.quietHoursEnabled) {
      const nowHour = new Date().getUTCHours();
      const start = pref.quietHoursStart;
      const end = pref.quietHoursEnd;

      // Handle overnight window (e.g. 22–08)
      const inQuiet =
        start <= end
          ? nowHour >= start && nowHour < end        // same-day window (e.g. 09–17)
          : nowHour >= start || nowHour < end;       // overnight window (e.g. 22–08)

      if (inQuiet) return false;
    }

    // Alert storm protection: if enabled, suppress alerts when too many have fired recently
    if (pref.alertStormProtection) {
      const threshold = pref.alertStormThreshold ?? 10;
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

      // Count recent successful deliveries for this user in last 10 minutes
      const recentAlertChannels = await this.prisma.alertChannel.findMany({
        where: { userId },
        select: { id: true },
      });
      const channelIds = recentAlertChannels.map((c) => c.id);

      if (channelIds.length > 0) {
        const recentCount = await this.prisma.alertDeliveryLog.count({
          where: {
            alertChannelId: { in: channelIds },
            status: 'success',
            createdAt: { gte: tenMinAgo },
          },
        });

        if (recentCount >= threshold) {
          // Storm detected — optionally notify once per 30 min
          const stormNotifiedAt = pref.alertStormNotifiedAt;
          const shouldNotifyStorm = !stormNotifiedAt || (Date.now() - stormNotifiedAt.getTime() > 30 * 60 * 1000);

          if (shouldNotifyStorm) {
            await this.prisma.notificationPreference.update({
              where: { userId },
              data: { alertStormNotifiedAt: new Date() },
            }).catch(() => { /* non-critical */ });
          }

          return false;
        }
      }
    }

    return true;
  }

  /**
   * Returns pending (unsent) digest queue items for a user.
   * Used by the cron jobs to fetch items to batch-deliver.
   *
   * @param userId     - User to fetch for
   * @param since      - Optional lower-bound cutoff (for hourly digest: 1h ago)
   * @returns Array of pending items sorted oldest-first
   */
  async getPendingDigestItems(userId: string, since?: Date) {
    return this.prisma.notificationQueueItem.findMany({
      where: {
        userId,
        sentAt: null,
        ...(since && { createdAt: { gte: since } }),
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Returns both pending (unsent) and recently sent (last 20) digest queue items for a user.
   * Used by the frontend Digest Queue card on the account page.
   *
   * @param userId - Authenticated user ID
   * @returns { pending: DigestQueueItem[], sent: DigestQueueItem[] }
   */
  async getDigestQueue(userId: string) {
    const [pending, sent] = await Promise.all([
      this.prisma.notificationQueueItem.findMany({
        where: { userId, sentAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.notificationQueueItem.findMany({
        where: { userId, sentAt: { not: null } },
        orderBy: { sentAt: 'desc' },
        take: 20,
      }),
    ]);
    return { pending, sent };
  }

  /**
   * Mark a list of queue items as sent (stamp sentAt = now).
   *
   * @param ids - Queue item IDs to mark sent
   */
  async markDigestItemsSent(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.notificationQueueItem.updateMany({
      where: { id: { in: ids } },
      data: { sentAt: new Date() },
    });
  }

  /**
   * Hourly digest cron: runs every hour at :05 past.
   * Collects all unsent notifications for users with hourly_digest preference
   * and delivers them as a single batched email.
   */
  @Cron('5 * * * *')
  async sendHourlyDigests(): Promise<void> {
    await this.sendDigests('hourly_digest');
  }

  /**
   * Daily digest cron: runs every day at 07:05 UTC.
   * Collects all unsent notifications for users with daily_digest preference
   * and delivers them as a single batched email.
   */
  @Cron('5 7 * * *')
  async sendDailyDigests(): Promise<void> {
    await this.sendDigests('daily_digest');
  }

  /**
   * Prune old sent queue items older than 30 days (nightly cleanup at 04:00 UTC).
   */
  @Cron('0 4 * * *')
  async pruneDigestQueue(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    try {
      const result = await this.prisma.notificationQueueItem.deleteMany({
        where: { sentAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        this.logger.log(`Pruned ${result.count} sent digest queue items older than 30 days`);
      }
    } catch (err) {
      this.logger.error('Failed to prune digest queue', err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Core digest sender: finds all users with the given frequency preference,
   * fetches their unsent queue items, and logs a structured digest summary.
   * In production, this would send an email via the email service; for now it
   * logs and marks items as sent (email service is SMTP-optional and may be unconfigured).
   *
   * @param frequency - 'hourly_digest' | 'daily_digest'
   */
  private async sendDigests(frequency: 'hourly_digest' | 'daily_digest'): Promise<void> {
    try {
      // Find users with this frequency preference who have unsent queue items
      const usersWithPending = await this.prisma.notificationQueueItem.groupBy({
        by: ['userId'],
        where: { sentAt: null },
      });

      if (usersWithPending.length === 0) return;

      // Filter to users with matching frequency preference
      const userIds = usersWithPending.map((u) => u.userId);
      const matchingPrefs = await this.prisma.notificationPreference.findMany({
        where: { userId: { in: userIds }, frequency },
        select: { userId: true },
      });

      if (matchingPrefs.length === 0) return;

      const digestUserIds = new Set(matchingPrefs.map((p) => p.userId));

      // Fetch user email addresses
      const users = await this.prisma.user.findMany({
        where: { id: { in: [...digestUserIds] } },
        select: { id: true, email: true },
      });

      let totalSent = 0;
      for (const user of users) {
        const items = await this.prisma.notificationQueueItem.findMany({
          where: { userId: user.id, sentAt: null },
          orderBy: { createdAt: 'asc' },
        });

        if (items.length === 0) continue;

        // Build digest summary
        const downCount = items.filter((i) => i.eventType === 'down').length;
        const recoveryCount = items.filter((i) => i.eventType === 'recovery').length;
        const degradedCount = items.filter((i) => i.eventType === 'degraded').length;
        const flappingCount = items.filter((i) => i.eventType === 'flapping').length;

        this.logger.log(
          `[${frequency}] Digest for ${user.email}: ${items.length} events ` +
          `(down=${downCount}, recovery=${recoveryCount}, degraded=${degradedCount}, flapping=${flappingCount})`
        );

        // Send digest email (fire-and-forget; log but don't fail if SMTP is unconfigured)
        try {
          await this.mailer.sendDigestEmail(
            user.email,
            frequency,
            items.map((i) => ({
              eventType: i.eventType as 'down' | 'recovery' | 'degraded' | 'flapping',
              monitorName: i.monitorName,
              message: i.message,
              createdAt: i.createdAt,
            })),
          );
          this.logger.log(`[${frequency}] Digest email sent to ${user.email}`);
        } catch (mailErr) {
          this.logger.warn(
            `[${frequency}] Failed to send digest email to ${user.email}: ${mailErr instanceof Error ? mailErr.message : String(mailErr)}`
          );
        }

        // Mark all items as sent
        await this.markDigestItemsSent(items.map((i) => i.id));
        totalSent += items.length;
      }

      if (totalSent > 0) {
        this.logger.log(`[${frequency}] Sent digests for ${matchingPrefs.length} users, ${totalSent} items total`);
      }
    } catch (err) {
      this.logger.error(`[${frequency}] Digest delivery failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private toDto(pref: {
    id: string;
    notifyOnDown: boolean;
    notifyOnRecovery: boolean;
    notifyOnDegraded: boolean;
    quietHoursEnabled: boolean;
    quietHoursStart: number;
    quietHoursEnd: number;
    frequency: string;
    alertStormProtection?: boolean;
    alertStormThreshold?: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: pref.id,
      notifyOnDown: pref.notifyOnDown,
      notifyOnRecovery: pref.notifyOnRecovery,
      notifyOnDegraded: pref.notifyOnDegraded,
      quietHoursEnabled: pref.quietHoursEnabled,
      quietHoursStart: pref.quietHoursStart,
      quietHoursEnd: pref.quietHoursEnd,
      frequency: pref.frequency,
      alertStormProtection: pref.alertStormProtection ?? false,
      alertStormThreshold: pref.alertStormThreshold ?? 10,
      createdAt: pref.createdAt.toISOString(),
      updatedAt: pref.updatedAt.toISOString(),
    };
  }
}
