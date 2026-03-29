/**
 * Unit tests for MonitorsService.getAssertionStats()
 *
 * 1. throws NotFoundException for wrong user
 * 2. returns zero stats when no assertion failures
 * 3. counts bodyContains failures correctly
 * 4. counts headerAssertion failures correctly
 * 5. recentFailures limited to 20 entries
 * 6. periodDays clamps to 1–90
 */
import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MonitorsService } from './monitors.service';

function makePrisma() {
  return {
    monitor: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    monitorRun: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    monitorTag: { findMany: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
    tag: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    alertChannel: { findMany: vi.fn() },
    monitorAlert: { findMany: vi.fn() },
    folder: { findFirst: vi.fn() },
    monitorDependency: { findMany: vi.fn() },
    monitorAnnotation: { findMany: vi.fn() },
    monitorEvent: { findMany: vi.fn(), create: vi.fn() },
    monitorConfigChange: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  };
}

function makeService(prismaOverrides?: Partial<ReturnType<typeof makePrisma>>): MonitorsService {
  const prisma = { ...makePrisma(), ...prismaOverrides };
  return new MonitorsService(prisma as never, {} as never, {} as never, {} as never, {} as never);
}

function makeRun(overrides: {
  level?: string;
  message?: string;
  latencyMs?: number | null;
  headerAssertionsFailed?: unknown;
  checkedAt?: Date;
}) {
  return {
    level: overrides.level ?? 'green',
    message: overrides.message ?? 'OK',
    latencyMs: overrides.latencyMs ?? 120,
    headerAssertionsFailed: overrides.headerAssertionsFailed ?? null,
    checkedAt: overrides.checkedAt ?? new Date('2026-03-29T10:00:00Z'),
  };
}

describe('MonitorsService.getAssertionStats()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: MonitorsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('1. throws NotFoundException for wrong user', async () => {
    prisma.monitor.findFirst.mockResolvedValue(null);
    await expect(service.getAssertionStats('wrong-user', 'monitor-1', 30)).rejects.toThrow(NotFoundException);
  });

  it('2. returns zero stats when no assertion failures', async () => {
    prisma.monitor.findFirst.mockResolvedValue({ id: 'monitor-1' });
    prisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ level: 'green', message: 'OK' }),
      makeRun({ level: 'green', message: 'OK' }),
    ]);

    const result = await service.getAssertionStats('user-1', 'monitor-1', 30);

    expect(result.totalAssertionFailures).toBe(0);
    expect(result.byType.bodyContains.failures).toBe(0);
    expect(result.byType.jsonPath.failures).toBe(0);
    expect(result.byType.headerAssertions.failures).toBe(0);
    expect(result.recentFailures).toHaveLength(0);
  });

  it('3. counts bodyContains failures correctly', async () => {
    prisma.monitor.findFirst.mockResolvedValue({ id: 'monitor-1' });
    prisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ level: 'yellow', message: 'body does not contain expected string' }),
      makeRun({ level: 'yellow', message: 'body assertion failed: expected "ok"' }),
      makeRun({ level: 'green', message: 'OK' }),
    ]);

    const result = await service.getAssertionStats('user-1', 'monitor-1', 30);

    expect(result.byType.bodyContains.failures).toBe(2);
    expect(result.totalAssertionFailures).toBe(2);
    expect(result.recentFailures[0].type).toBe('bodyContains');
  });

  it('4. counts headerAssertion failures correctly', async () => {
    prisma.monitor.findFirst.mockResolvedValue({ id: 'monitor-1' });
    prisma.monitorRun.findMany.mockResolvedValue([
      makeRun({
        level: 'yellow',
        message: 'header assertion failed',
        headerAssertionsFailed: [{ header: 'x-content-type-options', message: 'Expected nosniff' }],
      }),
      makeRun({
        level: 'yellow',
        message: 'header assertion failed',
        headerAssertionsFailed: [
          { header: 'x-frame-options', message: 'Expected DENY' },
          { header: 'x-content-type-options', message: 'Expected nosniff' },
        ],
      }),
    ]);

    const result = await service.getAssertionStats('user-1', 'monitor-1', 30);

    expect(result.byType.headerAssertions.failures).toBe(2);
    expect(result.byType.headerAssertions.topHeaders).toContain('x-content-type-options');
  });

  it('5. recentFailures limited to 20 entries', async () => {
    prisma.monitor.findFirst.mockResolvedValue({ id: 'monitor-1' });
    const manyRuns = Array.from({ length: 30 }, (_, i) =>
      makeRun({
        level: 'yellow',
        message: 'body assertion failed',
        checkedAt: new Date(Date.now() - i * 60_000),
      }),
    );
    prisma.monitorRun.findMany.mockResolvedValue(manyRuns);

    const result = await service.getAssertionStats('user-1', 'monitor-1', 30);

    expect(result.recentFailures.length).toBeLessThanOrEqual(20);
  });

  it('6. periodDays clamps to 1–90', async () => {
    prisma.monitor.findFirst.mockResolvedValue({ id: 'monitor-1' });
    prisma.monitorRun.findMany.mockResolvedValue([]);

    const tooLarge = await service.getAssertionStats('user-1', 'monitor-1', 200);
    expect(tooLarge.periodDays).toBe(90);

    const tooSmall = await service.getAssertionStats('user-1', 'monitor-1', 0);
    expect(tooSmall.periodDays).toBe(1);

    const justRight = await service.getAssertionStats('user-1', 'monitor-1', 45);
    expect(justRight.periodDays).toBe(45);
  });
});
