/**
 * Tests for NotificationsService digest queue functionality.
 * Covers: enqueueForDigest, getPendingDigestItems, getDigestQueue, markDigestItemsSent,
 * sendHourlyDigests, sendDailyDigests, pruneDigestQueue.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsService } from './notifications.service';

const makeQueueItem = (overrides = {}) => ({
  id: 'qi-1',
  userId: 'user-1',
  eventType: 'down',
  monitorId: 'mon-1',
  monitorName: 'API Monitor',
  message: '🚨 API Monitor: timeout',
  sentAt: null,
  createdAt: new Date('2026-03-26T12:00:00Z'),
  ...overrides,
});

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
  alertStormProtection: false,
  alertStormThreshold: 10,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

function makePrisma() {
  return {
    notificationPreference: {
      upsert: vi.fn().mockResolvedValue(makePref()),
      findUnique: vi.fn().mockResolvedValue(makePref()),
      findMany: vi.fn().mockResolvedValue([]),
    },
    notificationQueueItem: {
      create: vi.fn().mockResolvedValue(makeQueueItem()),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    alertChannel: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    alertDeliveryLog: {
      count: vi.fn().mockResolvedValue(0),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('NotificationsService — Digest Queue', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: NotificationsService;
  let mailer: { sendDigestEmail: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = makePrisma();
    mailer = { sendDigestEmail: vi.fn().mockResolvedValue(undefined) };
    service = new NotificationsService(prisma as never, mailer as never);
  });

  describe('enqueueForDigest', () => {
    it('creates a queue item with correct fields', async () => {
      await service.enqueueForDigest('user-1', 'down', 'mon-1', 'API Monitor', '🚨 API Monitor: timeout');
      expect(prisma.notificationQueueItem.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          eventType: 'down',
          monitorId: 'mon-1',
          monitorName: 'API Monitor',
          message: '🚨 API Monitor: timeout',
        },
      });
    });

    it('enqueues recovery event', async () => {
      await service.enqueueForDigest('user-1', 'recovery', 'mon-2', 'DB Monitor', '✅ DB Monitor: recovered');
      const call = prisma.notificationQueueItem.create.mock.calls[0][0];
      expect(call.data.eventType).toBe('recovery');
      expect(call.data.monitorName).toBe('DB Monitor');
    });

    it('handles null monitorId and monitorName gracefully', async () => {
      await service.enqueueForDigest('user-1', 'degraded', null, null, '⚠️ degraded event');
      const call = prisma.notificationQueueItem.create.mock.calls[0][0];
      expect(call.data.monitorId).toBeNull();
      expect(call.data.monitorName).toBeNull();
    });

    it('does not throw if prisma.create fails', async () => {
      prisma.notificationQueueItem.create.mockRejectedValue(new Error('DB error'));
      await expect(
        service.enqueueForDigest('user-1', 'down', 'mon-1', 'Monitor', 'msg'),
      ).resolves.toBeUndefined();
    });
  });

  describe('getPendingDigestItems', () => {
    it('fetches pending (unsent) items for a user', async () => {
      const items = [makeQueueItem()];
      prisma.notificationQueueItem.findMany.mockResolvedValue(items);

      const result = await service.getPendingDigestItems('user-1');
      expect(prisma.notificationQueueItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', sentAt: null },
          orderBy: { createdAt: 'asc' },
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('applies since cutoff when provided', async () => {
      const since = new Date('2026-03-26T11:00:00Z');
      await service.getPendingDigestItems('user-1', since);
      const call = prisma.notificationQueueItem.findMany.mock.calls[0][0];
      expect(call.where.createdAt).toEqual({ gte: since });
    });

    it('returns empty array when no pending items', async () => {
      prisma.notificationQueueItem.findMany.mockResolvedValue([]);
      const result = await service.getPendingDigestItems('user-1');
      expect(result).toEqual([]);
    });
  });

  describe('getDigestQueue', () => {
    it('returns pending and sent items', async () => {
      const pending = [makeQueueItem({ id: 'qi-pending', sentAt: null })];
      const sent = [makeQueueItem({ id: 'qi-sent', sentAt: new Date() })];
      prisma.notificationQueueItem.findMany
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(sent);

      const result = await service.getDigestQueue('user-1');
      expect(result.pending).toHaveLength(1);
      expect(result.sent).toHaveLength(1);
      expect(result.pending[0].id).toBe('qi-pending');
      expect(result.sent[0].id).toBe('qi-sent');
    });

    it('returns empty arrays when no items exist', async () => {
      prisma.notificationQueueItem.findMany.mockResolvedValue([]);
      const result = await service.getDigestQueue('user-1');
      expect(result.pending).toEqual([]);
      expect(result.sent).toEqual([]);
    });
  });

  describe('markDigestItemsSent', () => {
    it('updates all given IDs with sentAt timestamp', async () => {
      const ids = ['qi-1', 'qi-2', 'qi-3'];
      await service.markDigestItemsSent(ids);
      const call = prisma.notificationQueueItem.updateMany.mock.calls[0][0];
      expect(call.where.id).toEqual({ in: ids });
      expect(call.data.sentAt).toBeInstanceOf(Date);
    });

    it('does nothing when ids array is empty', async () => {
      await service.markDigestItemsSent([]);
      expect(prisma.notificationQueueItem.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('sendHourlyDigests', () => {
    it('does nothing when no pending items exist', async () => {
      prisma.notificationQueueItem.groupBy.mockResolvedValue([]);
      await service.sendHourlyDigests();
      expect(prisma.notificationPreference.findMany).not.toHaveBeenCalled();
    });

    it('skips users whose frequency does not match hourly_digest', async () => {
      prisma.notificationQueueItem.groupBy.mockResolvedValue([{ userId: 'user-1' }]);
      // User has daily_digest, not hourly
      prisma.notificationPreference.findMany.mockResolvedValue([]);
      await service.sendHourlyDigests();
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('marks items as sent for matching users', async () => {
      prisma.notificationQueueItem.groupBy.mockResolvedValue([{ userId: 'user-1' }]);
      prisma.notificationPreference.findMany.mockResolvedValue([{ userId: 'user-1' }]);
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', email: 'user@example.com' }]);
      prisma.notificationQueueItem.findMany.mockResolvedValue([
        makeQueueItem({ id: 'qi-1', eventType: 'down' }),
        makeQueueItem({ id: 'qi-2', eventType: 'recovery' }),
      ]);

      await service.sendHourlyDigests();

      expect(prisma.notificationQueueItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['qi-1', 'qi-2'] } } }),
      );
    });

    it('calls mailer.sendDigestEmail with correct args', async () => {
      prisma.notificationQueueItem.groupBy.mockResolvedValue([{ userId: 'user-1' }]);
      prisma.notificationPreference.findMany.mockResolvedValue([{ userId: 'user-1' }]);
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', email: 'digest@example.com' }]);
      const item = makeQueueItem({ id: 'qi-1', eventType: 'down' });
      prisma.notificationQueueItem.findMany.mockResolvedValue([item]);

      await service.sendHourlyDigests();

      expect(mailer.sendDigestEmail).toHaveBeenCalledWith(
        'digest@example.com',
        'hourly_digest',
        expect.arrayContaining([
          expect.objectContaining({ eventType: 'down', monitorName: 'API Monitor' }),
        ]),
      );
    });

    it('still marks items sent even if mailer throws', async () => {
      prisma.notificationQueueItem.groupBy.mockResolvedValue([{ userId: 'user-1' }]);
      prisma.notificationPreference.findMany.mockResolvedValue([{ userId: 'user-1' }]);
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', email: 'fail@example.com' }]);
      prisma.notificationQueueItem.findMany.mockResolvedValue([makeQueueItem({ id: 'qi-99' })]);
      mailer.sendDigestEmail.mockRejectedValueOnce(new Error('SMTP error'));

      await service.sendHourlyDigests();

      // Items should still be marked sent even when email fails
      expect(prisma.notificationQueueItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['qi-99'] } } }),
      );
    });
  });

  describe('sendDailyDigests', () => {
    it('does nothing when no pending items exist', async () => {
      prisma.notificationQueueItem.groupBy.mockResolvedValue([]);
      await service.sendDailyDigests();
      expect(prisma.notificationPreference.findMany).not.toHaveBeenCalled();
    });

    it('sends digests for daily_digest users with pending items', async () => {
      prisma.notificationQueueItem.groupBy.mockResolvedValue([{ userId: 'user-1' }]);
      prisma.notificationPreference.findMany.mockResolvedValue([{ userId: 'user-1' }]);
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', email: 'user@example.com' }]);
      prisma.notificationQueueItem.findMany.mockResolvedValue([
        makeQueueItem({ id: 'qi-1', eventType: 'degraded' }),
        makeQueueItem({ id: 'qi-2', eventType: 'flapping' }),
        makeQueueItem({ id: 'qi-3', eventType: 'down' }),
      ]);

      await service.sendDailyDigests();
      expect(prisma.notificationQueueItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['qi-1', 'qi-2', 'qi-3'] } } }),
      );
    });
  });

  describe('pruneDigestQueue', () => {
    it('deletes sent items older than 30 days', async () => {
      prisma.notificationQueueItem.deleteMany.mockResolvedValue({ count: 5 });
      await service.pruneDigestQueue();
      const call = prisma.notificationQueueItem.deleteMany.mock.calls[0][0];
      expect(call.where.sentAt.lt).toBeInstanceOf(Date);
      const cutoffAge = Date.now() - call.where.sentAt.lt.getTime();
      // Cutoff should be ~30 days ago (allow 5s tolerance)
      expect(cutoffAge).toBeGreaterThan(29.9 * 24 * 60 * 60 * 1000);
    });

    it('does not throw if prisma.deleteMany fails', async () => {
      prisma.notificationQueueItem.deleteMany.mockRejectedValue(new Error('DB error'));
      await expect(service.pruneDigestQueue()).resolves.toBeUndefined();
    });
  });
});
