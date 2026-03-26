import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UpdateNotificationPreferenceDto } from './notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

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
   * Checks whether a notification should fire right now, given the user's preferences.
   * Used by the alerts service before dispatching notifications.
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

    // Frequency other than instant: don't fire immediately (digest handled separately)
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
