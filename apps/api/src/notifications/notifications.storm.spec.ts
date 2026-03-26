import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsService } from './notifications.service';

function makeService(prefOverrides: Record<string, unknown> = {}) {
  const basePref = {
    notifyOnDown: true,
    notifyOnRecovery: true,
    notifyOnDegraded: true,
    quietHoursEnabled: false,
    quietHoursStart: 22,
    quietHoursEnd: 8,
    frequency: 'instant',
    alertStormProtection: false,
    alertStormThreshold: 10,
    alertStormNotifiedAt: null,
    ...prefOverrides,
  };

  const prisma = {
    notificationPreference: {
      findUnique: vi.fn().mockResolvedValue(basePref),
      update: vi.fn().mockResolvedValue(basePref),
    },
    alertChannel: {
      findMany: vi.fn().mockResolvedValue([{ id: 'ch-1' }]),
    },
    alertDeliveryLog: {
      count: vi.fn().mockResolvedValue(0),
    },
  };

  const mailer = { sendDigestEmail: vi.fn().mockResolvedValue(undefined) };
  const service = new NotificationsService(prisma as never, mailer as never);
  return { service, prisma };
}

describe('Alert Storm Protection', () => {
  it('allows alerts when storm protection is disabled', async () => {
    const { service } = makeService({ alertStormProtection: false });
    const result = await service.shouldNotify('user-1', 'down');
    expect(result).toBe(true);
  });

  it('allows alerts when storm protection is enabled but count is below threshold', async () => {
    const { service, prisma } = makeService({ alertStormProtection: true, alertStormThreshold: 10 });
    prisma.alertDeliveryLog.count.mockResolvedValue(5); // only 5, threshold is 10
    const result = await service.shouldNotify('user-1', 'down');
    expect(result).toBe(true);
  });

  it('suppresses alerts when count reaches threshold', async () => {
    const { service, prisma } = makeService({ alertStormProtection: true, alertStormThreshold: 10 });
    prisma.alertDeliveryLog.count.mockResolvedValue(10); // exactly at threshold → suppress
    const result = await service.shouldNotify('user-1', 'down');
    expect(result).toBe(false);
  });

  it('suppresses alerts when count exceeds threshold', async () => {
    const { service, prisma } = makeService({ alertStormProtection: true, alertStormThreshold: 5 });
    prisma.alertDeliveryLog.count.mockResolvedValue(20); // way over
    const result = await service.shouldNotify('user-1', 'down');
    expect(result).toBe(false);
  });

  it('still allows alerts when no channels exist (no flood possible)', async () => {
    const { service, prisma } = makeService({ alertStormProtection: true, alertStormThreshold: 10 });
    prisma.alertChannel.findMany.mockResolvedValue([]); // no channels
    const result = await service.shouldNotify('user-1', 'down');
    expect(result).toBe(true);
  });

  it('sends storm notification on first suppression (alertStormNotifiedAt=null)', async () => {
    const { service, prisma } = makeService({
      alertStormProtection: true,
      alertStormThreshold: 3,
      alertStormNotifiedAt: null,
    });
    prisma.alertDeliveryLog.count.mockResolvedValue(5);
    await service.shouldNotify('user-1', 'down');
    expect(prisma.notificationPreference.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' }, data: expect.objectContaining({ alertStormNotifiedAt: expect.any(Date) }) }),
    );
  });

  it('does NOT re-notify about storm if already notified within 30 min', async () => {
    const recentNotify = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
    const { service, prisma } = makeService({
      alertStormProtection: true,
      alertStormThreshold: 3,
      alertStormNotifiedAt: recentNotify,
    });
    prisma.alertDeliveryLog.count.mockResolvedValue(5);
    await service.shouldNotify('user-1', 'down');
    expect(prisma.notificationPreference.update).not.toHaveBeenCalled();
  });

  it('respects notifyOnDown=false regardless of storm protection', async () => {
    const { service } = makeService({ notifyOnDown: false, alertStormProtection: true });
    const result = await service.shouldNotify('user-1', 'down');
    expect(result).toBe(false);
  });

  it('storm protection is independent of recovery notifications', async () => {
    const { service, prisma } = makeService({ alertStormProtection: true, alertStormThreshold: 3 });
    prisma.alertDeliveryLog.count.mockResolvedValue(10);
    // Recovery is suppressed too during a storm
    const result = await service.shouldNotify('user-1', 'recovery');
    expect(result).toBe(false);
  });
});
