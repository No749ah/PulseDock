import { describe, it, expect, vi } from 'vitest';
import { resolveSlaWidget } from './sla.resolver';
import type { Widget } from '../status-pages.types';

function makeWidget(type: string, config: Record<string, unknown> = {}): Widget {
  return { id: `w-${type}`, type: type as Widget['type'], x: 0, y: 0, w: 4, h: 2, config };
}

const noopCache = {} as never;
const userId = 'user-1';
const monitorId = 'mon-1';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    monitor: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as any;
}

// ── sla-summary ───────────────────────────────────────────────────────────────

describe('sla resolver — sla-summary', () => {
  it('returns _noConfig when no monitorId provided', async () => {
    const prisma = makePrisma();
    const result = await resolveSlaWidget(prisma, noopCache, userId, makeWidget('sla-summary'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('returns 100% uptime when no runs exist', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveSlaWidget(
      prisma, noopCache, userId,
      makeWidget('sla-summary', { monitorId, slaTarget: 99.9 }), undefined,
    );
    expect(result.uptimePct).toBe(100);
    expect(result.pass).toBe(true);
    expect(result.total).toBe(0);
  });

  it('calculates correct uptime% from green/red runs', async () => {
    const runs = [
      ...Array(95).fill({ level: 'green' }),
      ...Array(5).fill({ level: 'red' }),
    ];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolveSlaWidget(
      prisma, noopCache, userId,
      makeWidget('sla-summary', { monitorId, slaTarget: 99.9 }), undefined,
    );
    expect(result.uptimePct).toBe(95);
    expect(result.pass).toBe(false);
    expect(result.up).toBe(95);
    expect(result.down).toBe(5);
    expect(result.total).toBe(100);
  });

  it('passes SLA when uptime >= target', async () => {
    const runs = [...Array(999).fill({ level: 'green' }), { level: 'red' }];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolveSlaWidget(
      prisma, noopCache, userId,
      makeWidget('sla-summary', { monitorId, slaTarget: 99.9 }), undefined,
    );
    expect(result.pass).toBe(true);
    expect(result.uptimePct).toBeGreaterThanOrEqual(99.9);
  });

  it('uses overrideDays when provided', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    await resolveSlaWidget(
      prisma, noopCache, userId,
      makeWidget('sla-summary', { monitorId, periodDays: 30 }), 7,
    );
    const findArgs = (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findArgs.where.checkedAt.gte).toBeDefined();
    // overrideDays=7 should produce a date ~7 days ago
    const since = findArgs.where.checkedAt.gte as Date;
    const diffDays = (Date.now() - since.getTime()) / 86_400_000;
    expect(diffDays).toBeCloseTo(7, 0);
  });

  it('computes allowedDownMinutes and remainingDownMinutes', async () => {
    const runs = Array(100).fill({ level: 'green' });
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolveSlaWidget(
      prisma, noopCache, userId,
      makeWidget('sla-summary', { monitorId, slaTarget: 99, periodDays: 30 }), undefined,
    );
    // 1% of 30d = 432 minutes allowed
    expect(result.allowedDownMinutes).toBeCloseTo(432, 0);
    expect(result.remainingDownMinutes).toBeGreaterThan(0);
  });

  it('clamps slaTarget to 0-100', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const r = await resolveSlaWidget(
      prisma, noopCache, userId,
      makeWidget('sla-summary', { monitorId, slaTarget: 150 }), undefined,
    );
    expect(r.slaTarget).toBe(100);
  });

  it('includes fetchedAt in response', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveSlaWidget(
      prisma, noopCache, userId,
      makeWidget('sla-summary', { monitorId }), undefined,
    );
    expect(result.fetchedAt).toBeDefined();
    expect(new Date(result.fetchedAt as string).getTime()).toBeGreaterThan(0);
  });
});

// ── sla-compliance-table ──────────────────────────────────────────────────────

describe('sla resolver — sla-compliance-table', () => {
  it('returns _noConfig when no monitors found', async () => {
    const prisma = makePrisma({ monitor: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveSlaWidget(prisma, noopCache, userId, makeWidget('sla-compliance-table'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('returns compliance rows for each monitor', async () => {
    const monitors = [
      { id: 'm1', name: 'API' },
      { id: 'm2', name: 'DB' },
    ];
    const monitorFindMany = vi.fn().mockResolvedValue(monitors);
    // Batched: all runs for all monitors in one array
    const runFindMany = vi.fn().mockResolvedValue([
      ...Array(100).fill({ monitorId: 'm1', level: 'green' }), // m1: 100%
      ...Array(90).fill({ monitorId: 'm2', level: 'green' }),
      ...Array(10).fill({ monitorId: 'm2', level: 'red' }), // m2: 90%
    ]);

    const prisma = {
      monitor: { findMany: monitorFindMany },
      monitorRun: { findMany: runFindMany },
    } as unknown as any;

    const result = await resolveSlaWidget(prisma, noopCache, userId, makeWidget('sla-compliance-table'), undefined);
    const rows = result.rows as any[];
    expect(rows).toHaveLength(2);
    // Rows are sorted: failing first
    const m2Row = rows.find((r: any) => r.name === 'DB');
    const m1Row = rows.find((r: any) => r.name === 'API');
    expect(m1Row.pass).toBe(true);
    expect(m2Row.pass).toBe(false);
  });

  it('uses custom slaTarget and periodDays from config', async () => {
    const monitors = [{ id: 'm1', name: 'API' }];
    const findMany = vi.fn()
      .mockResolvedValueOnce(monitors)
      .mockResolvedValueOnce([]);

    const prisma = { monitor: { findMany }, monitorRun: { findMany } } as unknown as any;
    const result = await resolveSlaWidget(
      prisma, noopCache, userId,
      makeWidget('sla-compliance-table', { slaTarget: 95, periodDays: 90 }), undefined,
    );
    expect(result.slaTarget).toBe(95);
    expect(result.periodDays).toBe(90);
  });

  it('filters by monitorIds when provided', async () => {
    const prisma = makePrisma({ monitor: { findMany: vi.fn().mockResolvedValue([]) } });
    await resolveSlaWidget(
      prisma, noopCache, userId,
      makeWidget('sla-compliance-table', { monitorIds: ['m1', 'm2'] }), undefined,
    );
    const findArgs = (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findArgs.where.id).toEqual({ in: ['m1', 'm2'] });
  });

  it('sorts failing monitors first then by actual uptime ascending', async () => {
    const monitors = [
      { id: 'm1', name: 'Healthy' },
      { id: 'm2', name: 'Worse' },
      { id: 'm3', name: 'Bad' },
    ];
    const monitorFindMany = vi.fn().mockResolvedValue(monitors);
    const runFindMany = vi.fn().mockResolvedValue([
      ...Array(100).fill({ monitorId: 'm1', level: 'green' }), // m1: 100% - passes
      ...Array(80).fill({ monitorId: 'm2', level: 'green' }),
      ...Array(20).fill({ monitorId: 'm2', level: 'red' }), // m2: 80% - fails
      ...Array(70).fill({ monitorId: 'm3', level: 'green' }),
      ...Array(30).fill({ monitorId: 'm3', level: 'red' }), // m3: 70% - fails worse
    ]);

    const prisma = { monitor: { findMany: monitorFindMany }, monitorRun: { findMany: runFindMany } } as unknown as any;
    const result = await resolveSlaWidget(prisma, noopCache, userId, makeWidget('sla-compliance-table'), undefined);
    const rows = result.rows as any[];
    // Failing rows first, sorted by actual uptime ascending
    expect(rows[0].pass).toBe(false);
    expect(rows[1].pass).toBe(false);
    expect(rows[0].actual).toBeLessThan(rows[1].actual);
    expect(rows[2].pass).toBe(true);
  });
});

// ── downtime-log ──────────────────────────────────────────────────────────────

describe('sla resolver — downtime-log', () => {
  it('returns empty outages when all runs are green', async () => {
    const runs = [
      { monitorId: 'm1', level: 'green', checkedAt: new Date(), message: null, monitor: { name: 'API' } },
      { monitorId: 'm1', level: 'green', checkedAt: new Date(), message: null, monitor: { name: 'API' } },
    ];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolveSlaWidget(prisma, noopCache, userId, makeWidget('downtime-log'), undefined);
    expect(result.outages).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('detects a completed outage and calculates durationMs', async () => {
    const t1 = new Date('2026-03-25T10:00:00Z');
    const t2 = new Date('2026-03-25T10:30:00Z');
    const t3 = new Date('2026-03-25T11:00:00Z');
    const runs = [
      { monitorId: 'm1', level: 'green', checkedAt: t1, message: null, monitor: { name: 'API' } },
      { monitorId: 'm1', level: 'red',   checkedAt: t2, message: 'timeout', monitor: { name: 'API' } },
      { monitorId: 'm1', level: 'green', checkedAt: t3, message: null, monitor: { name: 'API' } },
    ];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolveSlaWidget(prisma, noopCache, userId, makeWidget('downtime-log'), undefined);
    expect(result.outages).toHaveLength(1);
    const o = (result.outages as any[])[0];
    expect(o.monitorName).toBe('API');
    expect(o.durationMs).toBe(30 * 60 * 1000); // 30 minutes
    expect(o.resolvedAt).toEqual(t3);
    expect(o.message).toBe('timeout');
  });

  it('marks still-active outages with resolvedAt=null and durationMs=null', async () => {
    const t1 = new Date('2026-03-25T10:00:00Z');
    const t2 = new Date('2026-03-25T10:30:00Z');
    const runs = [
      { monitorId: 'm1', level: 'green', checkedAt: t1, message: null, monitor: { name: 'API' } },
      { monitorId: 'm1', level: 'red',   checkedAt: t2, message: 'down', monitor: { name: 'API' } },
    ];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolveSlaWidget(prisma, noopCache, userId, makeWidget('downtime-log'), undefined);
    expect(result.outages).toHaveLength(1);
    const o = (result.outages as any[])[0];
    expect(o.resolvedAt).toBeNull();
    expect(o.durationMs).toBeNull();
  });

  it('limits outages output to maxEntries', async () => {
    // Create multiple outage periods for same monitor
    const runs: any[] = [];
    for (let i = 0; i < 20; i++) {
      const base = new Date('2026-03-01T00:00:00Z').getTime() + i * 3 * 3600 * 1000;
      runs.push({ monitorId: 'm1', level: 'green', checkedAt: new Date(base), message: null, monitor: { name: 'API' } });
      runs.push({ monitorId: 'm1', level: 'red',   checkedAt: new Date(base + 3600_000), message: 'down', monitor: { name: 'API' } });
      runs.push({ monitorId: 'm1', level: 'green', checkedAt: new Date(base + 2 * 3600_000), message: null, monitor: { name: 'API' } });
    }
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolveSlaWidget(
      prisma, noopCache, userId,
      makeWidget('downtime-log', { maxEntries: 5 }), undefined,
    );
    expect((result.outages as any[]).length).toBeLessThanOrEqual(5);
    expect(result.total).toBe(20);
  });

  it('tracks outages for multiple monitors independently', async () => {
    const t1 = new Date('2026-03-25T10:00:00Z');
    const t2 = new Date('2026-03-25T10:30:00Z');
    const t3 = new Date('2026-03-25T11:00:00Z');
    const runs = [
      { monitorId: 'm1', level: 'red',   checkedAt: t1, message: 'm1 down', monitor: { name: 'API' } },
      { monitorId: 'm1', level: 'green', checkedAt: t2, message: null, monitor: { name: 'API' } },
      { monitorId: 'm2', level: 'red',   checkedAt: t2, message: 'm2 down', monitor: { name: 'DB' } },
      { monitorId: 'm2', level: 'green', checkedAt: t3, message: null, monitor: { name: 'DB' } },
    ];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolveSlaWidget(prisma, noopCache, userId, makeWidget('downtime-log'), undefined);
    expect(result.total).toBe(2);
  });

  it('includes fetchedAt in response', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveSlaWidget(prisma, noopCache, userId, makeWidget('downtime-log'), undefined);
    expect(result.fetchedAt).toBeDefined();
  });
});

// ── mttr-mttf-cards ───────────────────────────────────────────────────────────

describe('sla resolver — mttr-mttf-cards', () => {
  it('returns null metrics when no runs exist', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveSlaWidget(prisma, noopCache, userId, makeWidget('mttr-mttf-cards'), undefined);
    expect(result.mttrMs).toBeNull();
    expect(result.mttfMs).toBeNull();
    expect(result.recoveryCount).toBe(0);
    expect(result.fetchedAt).toBeDefined();
  });

  it('calculates MTTR from red streaks', async () => {
    // Pattern: green → red (30 min) → green → red (60 min) → green
    const t = (isoOffset: string) => new Date(`2026-03-25T${isoOffset}Z`);
    const runs = [
      { monitorId: 'm1', level: 'green', checkedAt: t('10:00:00') },
      { monitorId: 'm1', level: 'red',   checkedAt: t('10:30:00') }, // red streak starts
      { monitorId: 'm1', level: 'green', checkedAt: t('11:00:00') }, // 30min red streak ends → MTTR sample
      { monitorId: 'm1', level: 'red',   checkedAt: t('11:30:00') }, // red streak starts
      { monitorId: 'm1', level: 'green', checkedAt: t('12:30:00') }, // 60min red streak ends → MTTR sample
    ];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolveSlaWidget(prisma, noopCache, userId, makeWidget('mttr-mttf-cards'), undefined);
    // avg MTTR = (30+60)/2 = 45 min
    expect(result.mttrMs).toBe(45 * 60 * 1000);
    expect(result.recoveryCount).toBe(2);
  });

  it('calculates MTTF from green streaks', async () => {
    const t = (isoOffset: string) => new Date(`2026-03-25T${isoOffset}Z`);
    const runs = [
      { monitorId: 'm1', level: 'green', checkedAt: t('10:00:00') }, // green streak starts
      { monitorId: 'm1', level: 'red',   checkedAt: t('11:00:00') }, // 60min green → red
      { monitorId: 'm1', level: 'green', checkedAt: t('11:30:00') },
      { monitorId: 'm1', level: 'red',   checkedAt: t('12:30:00') }, // 60min green → red
    ];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolveSlaWidget(prisma, noopCache, userId, makeWidget('mttr-mttf-cards'), undefined);
    expect(result.mttfMs).toBe(60 * 60 * 1000); // 60 min
  });

  it('handles all-green runs (no MTTR)', async () => {
    const runs = Array(10).fill(null).map((_, i) => ({
      monitorId: 'm1',
      level: 'green',
      checkedAt: new Date(Date.now() - (10 - i) * 3600_000),
    }));
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolveSlaWidget(prisma, noopCache, userId, makeWidget('mttr-mttf-cards'), undefined);
    expect(result.mttrMs).toBeNull();
    expect(result.recoveryCount).toBe(0);
  });

  it('groups runs by monitor independently', async () => {
    const t = (isoOffset: string) => new Date(`2026-03-25T${isoOffset}Z`);
    const runs = [
      { monitorId: 'm1', level: 'green', checkedAt: t('10:00:00') },
      { monitorId: 'm1', level: 'red',   checkedAt: t('11:00:00') },
      { monitorId: 'm1', level: 'green', checkedAt: t('12:00:00') },
      { monitorId: 'm2', level: 'green', checkedAt: t('10:00:00') },
      { monitorId: 'm2', level: 'red',   checkedAt: t('10:30:00') },
      { monitorId: 'm2', level: 'green', checkedAt: t('11:00:00') },
    ];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolveSlaWidget(prisma, noopCache, userId, makeWidget('mttr-mttf-cards'), undefined);
    // Two recoveries: m1 (60min) + m2 (30min) → avg 45min
    expect(result.recoveryCount).toBe(2);
    expect(result.mttrMs).toBe(45 * 60 * 1000);
  });
});

// ── default / unknown type ────────────────────────────────────────────────────

describe('sla resolver — unknown widget type', () => {
  it('returns fallback message for unrecognized type', async () => {
    const prisma = makePrisma();
    const result = await resolveSlaWidget(prisma, noopCache, userId, makeWidget('unknown-sla-widget'), undefined);
    expect(result.message).toContain('not yet implemented');
  });
});
