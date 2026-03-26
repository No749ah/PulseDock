import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorsController } from './monitors.controller';
import { NotFoundException } from '@nestjs/common';

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

function makeBaseMockPrisma(monitor: Record<string, unknown> | null = { id: 'm-1', userId: 'user-1', name: 'Test Monitor' }) {
  return {
    monitor: {
      findFirst: vi.fn().mockResolvedValue(monitor),
      update: vi.fn().mockResolvedValue({ ...monitor }),
    },
    alertAcknowledgement: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    alertDeliveryLog: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function makeService() {
  return {
    list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(),
    runNow: vi.fn(), bulkAction: vi.fn(), testVersionConnection: vi.fn(),
    discoverCurrentVersion: vi.fn(), listPlugins: vi.fn(), getRecentRuns: vi.fn(),
    monitorRuns: vi.fn(), exportMonitorRuns: vi.fn(), monitorUptime: vi.fn(),
    monitorChart: vi.fn(), versionSummary: vi.fn(), exportMonitors: vi.fn(),
    importMonitors: vi.fn(), importExternal: vi.fn(), listMonitorAlerts: vi.fn(),
    addMonitorAlert: vi.fn(), updateMonitorAlertNotifyOn: vi.fn(), removeMonitorAlert: vi.fn(),
    listEvents: vi.fn(), createEvent: vi.fn(), deleteEvent: vi.fn(), snooze: vi.fn(),
    listDependencies: vi.fn(), addDependency: vi.fn(), removeDependency: vi.fn(),
    getHealthScore: vi.fn(), getHealthSummary: vi.fn(), getErrorBudget: vi.fn(),
  };
}

describe('Monitor Mute & Acknowledge', () => {
  let service: ReturnType<typeof makeService>;

  beforeEach(() => {
    service = makeService();
  });

  // ─── Mute ──────────────────────────────────────────────────────────────────

  it('muteMonitor() sets mutedUntil correctly', async () => {
    const now = Date.now();
    const mockPrisma = makeBaseMockPrisma();
    const mutedUntilDate = new Date(now + 30 * 60_000);
    mockPrisma.monitor.update.mockResolvedValue({ id: 'm-1', userId: 'user-1', mutedUntil: mutedUntilDate });

    const ctrl = new MonitorsController(service as never, { checkLimit: vi.fn() } as never, mockPrisma as never);
    const result = await ctrl.muteMonitor(makeReq(), 'm-1', { minutes: 30 }) as { mutedUntil: string };

    expect(mockPrisma.monitor.findFirst).toHaveBeenCalledWith({ where: { id: 'm-1', userId: 'user-1' } });
    expect(mockPrisma.monitor.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm-1' } }),
    );
    expect(result.mutedUntil).toBeDefined();
    // Should be ~30 min from now
    const mutedUntil = new Date(result.mutedUntil);
    expect(mutedUntil.getTime()).toBeGreaterThan(now + 29 * 60_000);
    expect(mutedUntil.getTime()).toBeLessThan(now + 31 * 60_000);
  });

  it('muteMonitor() throws NotFoundException when monitor not found', async () => {
    const mockPrisma = makeBaseMockPrisma(null);
    const ctrl = new MonitorsController(service as never, { checkLimit: vi.fn() } as never, mockPrisma as never);
    await expect(ctrl.muteMonitor(makeReq(), 'no-such', { minutes: 30 })).rejects.toThrow(NotFoundException);
  });

  it('unmuteMonitor() clears mutedUntil (sets to null)', async () => {
    const mockPrisma = makeBaseMockPrisma();
    mockPrisma.monitor.update.mockResolvedValue({ id: 'm-1', userId: 'user-1', mutedUntil: null });

    const ctrl = new MonitorsController(service as never, { checkLimit: vi.fn() } as never, mockPrisma as never);
    const result = await ctrl.unmuteMonitor(makeReq(), 'm-1') as { mutedUntil: null };

    expect(mockPrisma.monitor.update).toHaveBeenCalledWith({ where: { id: 'm-1' }, data: { mutedUntil: null } });
    expect(result.mutedUntil).toBeNull();
  });

  it('unmuteMonitor() throws NotFoundException when monitor not found', async () => {
    const mockPrisma = makeBaseMockPrisma(null);
    const ctrl = new MonitorsController(service as never, { checkLimit: vi.fn() } as never, mockPrisma as never);
    await expect(ctrl.unmuteMonitor(makeReq(), 'no-such')).rejects.toThrow(NotFoundException);
  });

  // ─── Acknowledge ───────────────────────────────────────────────────────────

  it('acknowledgeMonitor() creates AlertAcknowledgement record', async () => {
    const createdAck = {
      id: 'ack-1', monitorId: 'm-1', userId: 'user-1', note: 'Investigating',
      acknowledgedAt: new Date(), clearedAt: null, createdAt: new Date(),
    };
    const mockPrisma = makeBaseMockPrisma();
    mockPrisma.alertAcknowledgement.create.mockResolvedValue(createdAck);

    const ctrl = new MonitorsController(service as never, { checkLimit: vi.fn() } as never, mockPrisma as never);
    const result = await ctrl.acknowledgeMonitor(makeReq(), 'm-1', { note: 'Investigating' }) as Record<string, unknown>;

    expect(mockPrisma.alertAcknowledgement.create).toHaveBeenCalledWith({
      data: { monitorId: 'm-1', userId: 'user-1', note: 'Investigating', clearedAt: null },
    });
    expect(result['id']).toBe('ack-1');
    expect(result['clearedAt']).toBeNull();
  });

  it('acknowledgeMonitor() throws NotFoundException when monitor not found', async () => {
    const mockPrisma = makeBaseMockPrisma(null);
    const ctrl = new MonitorsController(service as never, { checkLimit: vi.fn() } as never, mockPrisma as never);
    await expect(ctrl.acknowledgeMonitor(makeReq(), 'no-such', {})).rejects.toThrow(NotFoundException);
  });

  it('clearAcknowledgement() sets clearedAt on the active ack', async () => {
    const now = new Date();
    const activeAck = { id: 'ack-1', monitorId: 'm-1', clearedAt: null };
    const updatedAck = {
      id: 'ack-1', monitorId: 'm-1', userId: 'user-1', note: null,
      acknowledgedAt: now, clearedAt: now, createdAt: now,
    };
    const mockPrisma = makeBaseMockPrisma();
    mockPrisma.alertAcknowledgement.findFirst.mockResolvedValue(activeAck);
    mockPrisma.alertAcknowledgement.update.mockResolvedValue(updatedAck);

    const ctrl = new MonitorsController(service as never, { checkLimit: vi.fn() } as never, mockPrisma as never);
    const result = await ctrl.clearAcknowledgement(makeReq(), 'm-1') as Record<string, unknown>;

    expect(mockPrisma.alertAcknowledgement.findFirst).toHaveBeenCalledWith({
      where: { monitorId: 'm-1', clearedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(mockPrisma.alertAcknowledgement.update).toHaveBeenCalledWith({
      where: { id: 'ack-1' },
      data: expect.objectContaining({ clearedAt: expect.any(Date) }),
    });
    expect(result['clearedAt']).toBeDefined();
    expect(result['clearedAt']).not.toBeNull();
  });

  it('clearAcknowledgement() throws NotFoundException when no active ack exists', async () => {
    const mockPrisma = makeBaseMockPrisma();
    mockPrisma.alertAcknowledgement.findFirst.mockResolvedValue(null);

    const ctrl = new MonitorsController(service as never, { checkLimit: vi.fn() } as never, mockPrisma as never);
    await expect(ctrl.clearAcknowledgement(makeReq(), 'm-1')).rejects.toThrow(NotFoundException);
  });

  // ─── Alert Suppression ─────────────────────────────────────────────────────

  it('muteMonitor() with minutes=1440 (max) succeeds', async () => {
    const mockPrisma = makeBaseMockPrisma();
    const ctrl = new MonitorsController(service as never, { checkLimit: vi.fn() } as never, mockPrisma as never);
    const result = await ctrl.muteMonitor(makeReq(), 'm-1', { minutes: 1440 }) as { mutedUntil: string };
    const mutedUntil = new Date(result.mutedUntil);
    const expected = Date.now() + 1440 * 60_000;
    expect(mutedUntil.getTime()).toBeGreaterThan(expected - 5000);
    expect(mutedUntil.getTime()).toBeLessThan(expected + 5000);
  });

  it('acknowledgeMonitor() with no note creates ack without note', async () => {
    const createdAck = {
      id: 'ack-2', monitorId: 'm-1', userId: 'user-1', note: null,
      acknowledgedAt: new Date(), clearedAt: null, createdAt: new Date(),
    };
    const mockPrisma = makeBaseMockPrisma();
    mockPrisma.alertAcknowledgement.create.mockResolvedValue(createdAck);

    const ctrl = new MonitorsController(service as never, { checkLimit: vi.fn() } as never, mockPrisma as never);
    const result = await ctrl.acknowledgeMonitor(makeReq(), 'm-1', {}) as Record<string, unknown>;

    expect(mockPrisma.alertAcknowledgement.create).toHaveBeenCalledWith({
      data: { monitorId: 'm-1', userId: 'user-1', note: null, clearedAt: null },
    });
    expect(result['note']).toBeNull();
  });
});
