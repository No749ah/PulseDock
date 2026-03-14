import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsService } from './notifications.service';
import { UpdateNotificationPreferenceDto } from './notifications.dto';

const makePref = (overrides = {}) => ({
  id: 'pref-1',
  userId: 'user-1',
  notifyOnDown: true,
  notifyOnRecovery: true,
  notifyOnDegraded: true,
  quietHoursEnabled: false,
  quietHoursStart: 22,
  quietHoursEnd: 8,
  frequency: 'instant',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

function makePrisma(prefData = makePref()) {
  return {
    notificationPreference: {
      upsert: vi.fn().mockResolvedValue(prefData),
      findUnique: vi.fn().mockResolvedValue(prefData),
    },
  };
}

describe('NotificationsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new NotificationsService(prisma as never);
  });

  describe('getPreference', () => {
    it('upserts and returns preference DTO', async () => {
      const result = await service.getPreference('user-1');
      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        create: { userId: 'user-1' },
        update: {},
      });
      expect(result.id).toBe('pref-1');
      expect(result.notifyOnDown).toBe(true);
      expect(result.frequency).toBe('instant');
    });

    it('returns ISO string dates', async () => {
      const result = await service.getPreference('user-1');
      expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(result.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('updatePreference', () => {
    it('passes only provided fields to upsert', async () => {
      const dto: UpdateNotificationPreferenceDto = { notifyOnDown: false };
      await service.updatePreference('user-1', dto);
      const call = prisma.notificationPreference.upsert.mock.calls[0][0];
      expect(call.update).toEqual({ notifyOnDown: false });
      expect(call.update.notifyOnRecovery).toBeUndefined();
    });

    it('can update frequency to hourly_digest', async () => {
      const updated = makePref({ frequency: 'hourly_digest' });
      prisma.notificationPreference.upsert.mockResolvedValue(updated);
      const result = await service.updatePreference('user-1', { frequency: 'hourly_digest' });
      expect(result.frequency).toBe('hourly_digest');
    });

    it('can enable quiet hours', async () => {
      const updated = makePref({ quietHoursEnabled: true, quietHoursStart: 23, quietHoursEnd: 7 });
      prisma.notificationPreference.upsert.mockResolvedValue(updated);
      const result = await service.updatePreference('user-1', {
        quietHoursEnabled: true,
        quietHoursStart: 23,
        quietHoursEnd: 7,
      });
      expect(result.quietHoursEnabled).toBe(true);
      expect(result.quietHoursStart).toBe(23);
      expect(result.quietHoursEnd).toBe(7);
    });
  });

  describe('shouldNotify', () => {
    it('returns true when no preference record exists', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      expect(await service.shouldNotify('user-1', 'down')).toBe(true);
    });

    it('returns false when notifyOnDown is false', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(makePref({ notifyOnDown: false }));
      expect(await service.shouldNotify('user-1', 'down')).toBe(false);
    });

    it('returns false when notifyOnRecovery is false', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(makePref({ notifyOnRecovery: false }));
      expect(await service.shouldNotify('user-1', 'recovery')).toBe(false);
    });

    it('returns false when notifyOnDegraded is false', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(makePref({ notifyOnDegraded: false }));
      expect(await service.shouldNotify('user-1', 'degraded')).toBe(false);
    });

    it('returns false for non-instant frequency', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(makePref({ frequency: 'hourly_digest' }));
      expect(await service.shouldNotify('user-1', 'down')).toBe(false);
    });

    it('returns false during quiet hours (overnight window)', async () => {
      // Quiet hours 22-08, simulated current hour = 23 UTC
      const pref = makePref({ quietHoursEnabled: true, quietHoursStart: 22, quietHoursEnd: 8 });
      prisma.notificationPreference.findUnique.mockResolvedValue(pref);
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T23:00:00Z')); // hour = 23
      expect(await service.shouldNotify('user-1', 'down')).toBe(false);
      vi.useRealTimers();
    });

    it('returns true outside quiet hours (overnight window)', async () => {
      const pref = makePref({ quietHoursEnabled: true, quietHoursStart: 22, quietHoursEnd: 8 });
      prisma.notificationPreference.findUnique.mockResolvedValue(pref);
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T12:00:00Z')); // hour = 12
      expect(await service.shouldNotify('user-1', 'down')).toBe(true);
      vi.useRealTimers();
    });

    it('returns false during quiet hours (same-day window)', async () => {
      const pref = makePref({ quietHoursEnabled: true, quietHoursStart: 9, quietHoursEnd: 17 });
      prisma.notificationPreference.findUnique.mockResolvedValue(pref);
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T12:00:00Z')); // hour = 12
      expect(await service.shouldNotify('user-1', 'down')).toBe(false);
      vi.useRealTimers();
    });

    it('returns true when all defaults and frequency is instant', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(makePref());
      expect(await service.shouldNotify('user-1', 'down')).toBe(true);
      expect(await service.shouldNotify('user-1', 'recovery')).toBe(true);
      expect(await service.shouldNotify('user-1', 'degraded')).toBe(true);
    });
  });
});
