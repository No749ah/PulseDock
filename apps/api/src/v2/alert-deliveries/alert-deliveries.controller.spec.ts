import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V2AlertDeliveriesController } from './alert-deliveries.controller';
import type { AuthenticatedRequest } from '../v2.types';

function makeReq(userId = 'u1'): AuthenticatedRequest {
  return { user: { id: userId } } as AuthenticatedRequest;
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'del-1',
    alertChannelId: 'ch-1',
    alertChannel: { name: 'Slack', type: 'slack' },
    monitorId: 'm-1',
    monitorName: 'My Monitor',
    status: 'success',
    trigger: 'monitor_failure',
    errorMessage: null,
    durationMs: 120,
    isGrouped: false,
    groupedCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('V2AlertDeliveriesController', () => {
  let ctrl: V2AlertDeliveriesController;
  let prisma: {
    alertDeliveryLog: {
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    prisma = {
      alertDeliveryLog: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
    };
    ctrl = new V2AlertDeliveriesController(prisma as never);
  });

  it('returns paginated envelope shape', async () => {
    prisma.alertDeliveryLog.count.mockResolvedValue(1);
    prisma.alertDeliveryLog.findMany.mockResolvedValue([makeRow()]);

    const result = await ctrl.list(makeReq(), {});
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('meta');
    expect(result.meta).toMatchObject({ total: 1, page: 1 });
  });

  it('maps row fields correctly', async () => {
    prisma.alertDeliveryLog.count.mockResolvedValue(1);
    prisma.alertDeliveryLog.findMany.mockResolvedValue([makeRow()]);

    const result = await ctrl.list(makeReq(), {});
    const item = result.data[0];
    expect(item.id).toBe('del-1');
    expect(item.alertChannelId).toBe('ch-1');
    expect(item.channelName).toBe('Slack');
    expect(item.channelType).toBe('slack');
    expect(item.monitorId).toBe('m-1');
    expect(item.monitorName).toBe('My Monitor');
    expect(item.status).toBe('success');
    expect(item.trigger).toBe('monitor_failure');
    expect(item.errorMessage).toBeNull();
    expect(item.durationMs).toBe(120);
    expect(item.isGrouped).toBe(false);
    expect(item.groupedCount).toBe(0);
    expect(item.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('passes status filter to where clause', async () => {
    prisma.alertDeliveryLog.count.mockResolvedValue(0);
    prisma.alertDeliveryLog.findMany.mockResolvedValue([]);

    await ctrl.list(makeReq(), { status: 'failed' });

    const where = prisma.alertDeliveryLog.count.mock.calls[0][0].where;
    expect(where.status).toBe('failed');
  });

  it('passes channelId filter to where clause', async () => {
    prisma.alertDeliveryLog.count.mockResolvedValue(0);
    prisma.alertDeliveryLog.findMany.mockResolvedValue([]);

    await ctrl.list(makeReq(), { channelId: 'ch-abc' });

    const where = prisma.alertDeliveryLog.count.mock.calls[0][0].where;
    expect(where.alertChannelId).toBe('ch-abc');
  });

  it('passes monitorId filter to where clause', async () => {
    prisma.alertDeliveryLog.count.mockResolvedValue(0);
    prisma.alertDeliveryLog.findMany.mockResolvedValue([]);

    await ctrl.list(makeReq(), { monitorId: 'm-xyz' });

    const where = prisma.alertDeliveryLog.count.mock.calls[0][0].where;
    expect(where.monitorId).toBe('m-xyz');
  });

  it('builds since/until date range filter', async () => {
    prisma.alertDeliveryLog.count.mockResolvedValue(0);
    prisma.alertDeliveryLog.findMany.mockResolvedValue([]);

    await ctrl.list(makeReq(), { since: '2026-01-01T00:00:00Z', until: '2026-01-31T23:59:59Z' });

    const where = prisma.alertDeliveryLog.count.mock.calls[0][0].where;
    expect(where.createdAt).toMatchObject({
      gte: new Date('2026-01-01T00:00:00Z'),
      lte: new Date('2026-01-31T23:59:59Z'),
    });
  });

  it('builds since-only date range filter', async () => {
    prisma.alertDeliveryLog.count.mockResolvedValue(0);
    prisma.alertDeliveryLog.findMany.mockResolvedValue([]);

    await ctrl.list(makeReq(), { since: '2026-01-01T00:00:00Z' });

    const where = prisma.alertDeliveryLog.count.mock.calls[0][0].where;
    expect(where.createdAt).toMatchObject({ gte: new Date('2026-01-01T00:00:00Z') });
    expect((where.createdAt as Record<string, unknown>)['lte']).toBeUndefined();
  });

  it('applies userId scoping via alertChannel.userId', async () => {
    prisma.alertDeliveryLog.count.mockResolvedValue(0);
    prisma.alertDeliveryLog.findMany.mockResolvedValue([]);

    await ctrl.list(makeReq('user-42'), {});

    const where = prisma.alertDeliveryLog.count.mock.calls[0][0].where;
    expect(where.alertChannel).toEqual({ userId: 'user-42' });
  });

  it('sorts by createdAt desc by default', async () => {
    prisma.alertDeliveryLog.count.mockResolvedValue(0);
    prisma.alertDeliveryLog.findMany.mockResolvedValue([]);

    await ctrl.list(makeReq(), {});

    const { orderBy } = prisma.alertDeliveryLog.findMany.mock.calls[0][0];
    expect(orderBy).toEqual({ createdAt: 'desc' });
  });

  it('sorts by durationMs asc', async () => {
    prisma.alertDeliveryLog.count.mockResolvedValue(0);
    prisma.alertDeliveryLog.findMany.mockResolvedValue([]);

    await ctrl.list(makeReq(), { sortBy: 'durationMs', sortDir: 'asc' });

    const { orderBy } = prisma.alertDeliveryLog.findMany.mock.calls[0][0];
    expect(orderBy).toEqual({ durationMs: 'asc' });
  });

  it('sorts by status desc', async () => {
    prisma.alertDeliveryLog.count.mockResolvedValue(0);
    prisma.alertDeliveryLog.findMany.mockResolvedValue([]);

    await ctrl.list(makeReq(), { sortBy: 'status', sortDir: 'desc' });

    const { orderBy } = prisma.alertDeliveryLog.findMany.mock.calls[0][0];
    expect(orderBy).toEqual({ status: 'desc' });
  });

  it('applies pagination skip/take', async () => {
    prisma.alertDeliveryLog.count.mockResolvedValue(100);
    prisma.alertDeliveryLog.findMany.mockResolvedValue([]);

    await ctrl.list(makeReq(), { page: 3, limit: 10 });

    const call = prisma.alertDeliveryLog.findMany.mock.calls[0][0];
    expect(call.skip).toBe(20);
    expect(call.take).toBe(10);
  });

  it('computes meta.pages correctly', async () => {
    prisma.alertDeliveryLog.count.mockResolvedValue(25);
    prisma.alertDeliveryLog.findMany.mockResolvedValue([]);

    const result = await ctrl.list(makeReq(), { limit: 10 });
    expect(result.meta.pages).toBe(3);
  });

  it('handles empty result set', async () => {
    prisma.alertDeliveryLog.count.mockResolvedValue(0);
    prisma.alertDeliveryLog.findMany.mockResolvedValue([]);

    const result = await ctrl.list(makeReq(), {});
    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
    expect(result.meta.pages).toBe(0);
  });

  it('handles failed delivery with errorMessage', async () => {
    prisma.alertDeliveryLog.count.mockResolvedValue(1);
    prisma.alertDeliveryLog.findMany.mockResolvedValue([
      makeRow({ status: 'failed', errorMessage: 'Connection refused', durationMs: null }),
    ]);

    const result = await ctrl.list(makeReq(), {});
    const item = result.data[0];
    expect(item.status).toBe('failed');
    expect(item.errorMessage).toBe('Connection refused');
    expect(item.durationMs).toBeNull();
  });

  it('handles grouped delivery', async () => {
    prisma.alertDeliveryLog.count.mockResolvedValue(1);
    prisma.alertDeliveryLog.findMany.mockResolvedValue([
      makeRow({ isGrouped: true, groupedCount: 5 }),
    ]);

    const result = await ctrl.list(makeReq(), {});
    const item = result.data[0];
    expect(item.isGrouped).toBe(true);
    expect(item.groupedCount).toBe(5);
  });
});
