/**
 * Unit tests for MonitorsService.togglePin().
 *
 * Tests confirm pin/unpin toggling, NotFoundException for missing monitors,
 * and correct return type { pinned: boolean }.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MonitorsService } from './monitors.service';

// ── Minimal monitor factory ───────────────────────────────────────────────────

function makeMonitor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'monitor-1',
    userId: 'user-1',
    name: 'Test Monitor',
    type: 'HTTP',
    target: 'https://example.com',
    intervalSec: 60,
    timeoutMs: 5000,
    configJson: {},
    folderId: null,
    enabled: true,
    pinned: false,
    createdAt: new Date('2026-01-01'),
    monitorAlerts: [],
    monitorTags: [],
    ...overrides,
  };
}

// ── Minimal Prisma mock factory ───────────────────────────────────────────────

function makePrisma(monitor: ReturnType<typeof makeMonitor> | null = makeMonitor()) {
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(monitor ? [monitor] : []),
      findFirst: vi.fn().mockResolvedValue(monitor),
      create: vi.fn(),
      update: vi.fn().mockImplementation(({ data }: { data: { pinned?: boolean } }) =>
        Promise.resolve({ ...monitor, pinned: data.pinned ?? false }),
      ),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    monitorAlert: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    monitorTag: {
      deleteMany: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
    tag: {
      upsert: vi.fn().mockResolvedValue({ id: 'tag-1', name: 'test', color: '#aaa' }),
    },
    alertChannel: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    folder: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MonitorsService — togglePin()', () => {
  let service: MonitorsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new MonitorsService(
      prisma as never,
      {} as never, // ChecksService (not needed for pin tests)
      {} as never, // AuditService (not needed for pin tests)
      {} as never, // RealtimeEvents (not needed for pin tests)
      {} as never, // VersionDetectionService (not needed for pin tests)
    );
  });

  // ── Test 1: pin when currently unpinned ───────────────────────────────────
  it('sets pinned=true when monitor is currently unpinned', async () => {
    const unpinned = makeMonitor({ pinned: false });
    prisma.monitor.findFirst.mockResolvedValue(unpinned);
    prisma.monitor.update.mockResolvedValue({ ...unpinned, pinned: true });

    const result = await service.togglePin('user-1', 'monitor-1');

    expect(result).toEqual({ pinned: true });
    expect(prisma.monitor.update).toHaveBeenCalledWith({
      where: { id: 'monitor-1' },
      data: { pinned: true },
    });
  });

  // ── Test 2: unpin when currently pinned ───────────────────────────────────
  it('sets pinned=false when monitor is currently pinned (unpin)', async () => {
    const pinned = makeMonitor({ pinned: true });
    prisma.monitor.findFirst.mockResolvedValue(pinned);
    prisma.monitor.update.mockResolvedValue({ ...pinned, pinned: false });

    const result = await service.togglePin('user-1', 'monitor-1');

    expect(result).toEqual({ pinned: false });
    expect(prisma.monitor.update).toHaveBeenCalledWith({
      where: { id: 'monitor-1' },
      data: { pinned: false },
    });
  });

  // ── Test 3: NotFoundException for missing monitor or wrong userId ──────────
  it('throws NotFoundException when monitor is not found', async () => {
    prisma.monitor.findFirst.mockResolvedValue(null);

    await expect(service.togglePin('user-1', 'nonexistent-monitor')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when monitor belongs to a different user', async () => {
    // findFirst with userId constraint returns null → NotFoundException
    prisma.monitor.findFirst.mockImplementation(({ where }: { where: { userId?: string } }) => {
      if (where.userId !== 'user-1') return Promise.resolve(null);
      return Promise.resolve(makeMonitor());
    });

    await expect(service.togglePin('other-user', 'monitor-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  // ── Test 4: return shape is correct ──────────────────────────────────────
  it('returns an object with only { pinned: boolean }', async () => {
    const monitor = makeMonitor({ pinned: false });
    prisma.monitor.findFirst.mockResolvedValue(monitor);
    prisma.monitor.update.mockResolvedValue({ ...monitor, pinned: true });

    const result = await service.togglePin('user-1', 'monitor-1');

    // Should only have the pinned key
    expect(result).toStrictEqual({ pinned: true });
    expect(typeof result.pinned).toBe('boolean');
  });
});
