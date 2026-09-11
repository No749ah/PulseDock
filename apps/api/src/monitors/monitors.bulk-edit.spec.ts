/**
 * Unit tests for MonitorsService.bulkEdit()
 *
 * Tests multi-field bulk update across selected monitors.
 */
import { describe, it, expect, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { MonitorsCrudService } from './monitors-crud.service';
import { VersionDetectionService } from './version-detection.service';
import { PrismaService } from '../common/prisma.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';

function buildPrismaMock(ownedMonitorIds: string[]) {
  const monitorUpdateMany = vi.fn().mockResolvedValue({ count: ownedMonitorIds.length });
  const monitorAlertDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const monitorAlertCreateMany = vi.fn().mockResolvedValue({ count: 0 });

  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(ownedMonitorIds.map((id) => ({ id }))),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: monitorUpdateMany,
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    monitorAlert: {
      deleteMany: monitorAlertDeleteMany,
      createMany: monitorAlertCreateMany,
      findMany: vi.fn().mockResolvedValue([]),
    },
    monitorDependency: { findMany: vi.fn().mockResolvedValue([]) },
    monitorTag: { findMany: vi.fn().mockResolvedValue([]) },
    incident: { count: vi.fn().mockResolvedValue(0) },
    incidentMonitor: { groupBy: vi.fn().mockResolvedValue([]) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    _monitorUpdateMany: monitorUpdateMany,
    _monitorAlertDeleteMany: monitorAlertDeleteMany,
    _monitorAlertCreateMany: monitorAlertCreateMany,
  };
}

async function buildService(prisma: object): Promise<MonitorsCrudService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MonitorsCrudService,
      { provide: PrismaService, useValue: prisma },
      {
        provide: ChecksService,
        useValue: { listPlugins: vi.fn().mockReturnValue([]), runCheck: vi.fn() },
      },
      { provide: AuditService, useValue: { log: vi.fn() } },
      { provide: RealtimeEvents, useValue: { monitorUpdated: vi.fn(), emit: vi.fn() } },
      { provide: VersionDetectionService, useValue: {} },
    ],
  }).compile();
  return module.get<MonitorsCrudService>(MonitorsCrudService);
}

describe('MonitorsService – bulkEdit', () => {

  // ── 1. Returns 0 affected when ids list is empty ────────────────────────────
  it('returns affected=0 immediately for empty ids list', async () => {
    const prisma = buildPrismaMock([]);
    const svc = await buildService(prisma);
    const result = await svc.bulkEdit('user1', { ids: [] });
    expect(result.affected).toBe(0);
    expect(result.ok).toBe(true);
  });

  // ── 2. Updates interval and confirmations for owned monitors ────────────────
  it('updates intervalSec and confirmations on all owned monitors', async () => {
    const ownedIds = ['m1', 'm2', 'm3'];
    const prisma = buildPrismaMock(ownedIds);
    const svc = await buildService(prisma);

    const result = await svc.bulkEdit('user1', {
      ids: ownedIds,
      intervalSec: 120,
      confirmations: 2,
    });

    expect(result.ok).toBe(true);
    expect(result.affected).toBe(3);
    expect((prisma as ReturnType<typeof buildPrismaMock>)._monitorUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ intervalSec: 120, confirmations: 2 }),
      })
    );
  });

  // ── 3. Replaces alert channels for all monitors when alertChannelIds provided ─
  it('replaces alert channels for all owned monitors when alertChannelIds provided', async () => {
    const ownedIds = ['m1', 'm2'];
    const prisma = buildPrismaMock(ownedIds);
    const svc = await buildService(prisma);

    await svc.bulkEdit('user1', {
      ids: ownedIds,
      alertChannelIds: ['ch1', 'ch2'],
    });

    // Should delete and recreate for each monitor
    expect((prisma as ReturnType<typeof buildPrismaMock>)._monitorAlertDeleteMany).toHaveBeenCalledTimes(2);
    expect((prisma as ReturnType<typeof buildPrismaMock>)._monitorAlertCreateMany).toHaveBeenCalledTimes(2);
  });

  // ── 4. Clears alert channels when alertChannelIds is empty array ────────────
  it('clears all alert channels when alertChannelIds is empty array', async () => {
    const ownedIds = ['m1'];
    const prisma = buildPrismaMock(ownedIds);
    const svc = await buildService(prisma);

    await svc.bulkEdit('user1', {
      ids: ownedIds,
      alertChannelIds: [],
    });

    expect((prisma as ReturnType<typeof buildPrismaMock>)._monitorAlertDeleteMany).toHaveBeenCalledWith({ where: { monitorId: 'm1' } });
    // createMany should NOT be called (no channels to add)
    expect((prisma as ReturnType<typeof buildPrismaMock>)._monitorAlertCreateMany).not.toHaveBeenCalled();
  });

  // ── 5. Skips update when no fields provided (only alertChannelIds optional) ──
  it('does not call updateMany when no scalar fields are provided', async () => {
    const ownedIds = ['m1'];
    const prisma = buildPrismaMock(ownedIds);
    const svc = await buildService(prisma);

    // No scalar fields, no alertChannelIds
    await svc.bulkEdit('user1', { ids: ownedIds });

    expect((prisma as ReturnType<typeof buildPrismaMock>)._monitorUpdateMany).not.toHaveBeenCalled();
  });
});
