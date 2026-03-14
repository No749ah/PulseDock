import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UpdateNotificationPreferenceDto } from './notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the notification preference for a user.
   * Creates a default record if one doesn't exist yet (upsert on first access).
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
      },
      update: {
        ...(dto.notifyOnDown !== undefined && { notifyOnDown: dto.notifyOnDown }),
        ...(dto.notifyOnRecovery !== undefined && { notifyOnRecovery: dto.notifyOnRecovery }),
        ...(dto.notifyOnDegraded !== undefined && { notifyOnDegraded: dto.notifyOnDegraded }),
        ...(dto.quietHoursEnabled !== undefined && { quietHoursEnabled: dto.quietHoursEnabled }),
        ...(dto.quietHoursStart !== undefined && { quietHoursStart: dto.quietHoursStart }),
        ...(dto.quietHoursEnd !== undefined && { quietHoursEnd: dto.quietHoursEnd }),
        ...(dto.frequency !== undefined && { frequency: dto.frequency }),
      },
    });
    return this.toDto(pref);
  }

  /**
   * Checks whether a notification should fire right now, given the user's preferences.
   * Used by the alerts service before dispatching notifications.
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
      createdAt: pref.createdAt.toISOString(),
      updatedAt: pref.updatedAt.toISOString(),
    };
  }
}
