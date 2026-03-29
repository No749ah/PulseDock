import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MonitorsService } from './monitors.service';

function makePrisma() {
  return {
    monitor: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), count: vi.fn() },
    monitorRun: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn(), create: vi.fn() },
    monitorEvent: { findMany: vi.fn(), create: vi.fn() },
    monitorDependency: { findMany: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
    monitorAnnotation: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findFirst: vi.fn() },
    alertChannel: { findMany: vi.fn(), findFirst: vi.fn() },
    monitorAlert: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
    monitorConfigChange: { findMany: vi.fn(), create: vi.fn() },
    tag: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    folder: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<{
  id: string;
  monitorId: string;
  userId: string;
  checkedAt: Date;
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  message: string | null;
  level: string;
  responseSizeBytes: number | null;
  monitor: { id: string; name: string; type: string; target: string };
}> = {}) {
  return {
    id: overrides.id ?? 'run-1',
    monitorId: overrides.monitorId ?? 'mon-1',
    userId: overrides.userId ?? 'user-1',
    checkedAt: overrides.checkedAt ?? new Date('2026-01-01T00:00:00Z'),
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    latencyMs: Object.prototype.hasOwnProperty.call(overrides, 'latencyMs') ? (overrides.latencyMs ?? null) : 123,
    message: overrides.message ?? null,
    level: overrides.level ?? 'green',
    responseSizeBytes: overrides.responseSizeBytes ?? null,
    monitor: overrides.monitor ?? { id: 'mon-1', name: 'Test Monitor', type: 'HTTP', target: 'https://example.com' },
  };
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('MonitorsService.liveFeed()', () => {
  let service: MonitorsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new MonitorsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('returns empty items and zeroed stats when no runs', async () => {
    prisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await service.liveFeed('user-1');

    expect(result.items).toHaveLength(0);
    expect(result.stats.totalRuns).toBe(0);
    expect(result.stats.failedRuns).toBe(0);
    expect(result.stats.failureRatePct).toBe(0);
    expect(result.stats.avgLatencyMs).toBeNull();
    expect(result.stats.checksPerMin).toBeNull();
    expect(result.latestCheckedAt).toBeNull();
  });

  it('maps run fields correctly', async () => {
    const run = makeRun({
      id: 'run-abc',
      monitorId: 'mon-xyz',
      ok: false,
      level: 'red',
      status: 503,
      latencyMs: 4200,
      message: 'Connection refused',
      responseSizeBytes: 512,
      monitor: { id: 'mon-xyz', name: 'My API', type: 'HTTP', target: 'https://api.example.com' },
    });
    prisma.monitorRun.findMany.mockResolvedValue([run]);

    const result = await service.liveFeed('user-1');

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.id).toBe('run-abc');
    expect(item.monitorId).toBe('mon-xyz');
    expect(item.monitorName).toBe('My API');
    expect(item.monitorType).toBe('HTTP');
    expect(item.monitorUrl).toBe('https://api.example.com');
    expect(item.ok).toBe(false);
    expect(item.statusCode).toBe(503);
    expect(item.latencyMs).toBe(4200);
    expect(item.message).toBe('Connection refused');
    expect(item.level).toBe('red');
    expect(item.responseSizeBytes).toBe(512);
  });

  it('computes failure stats correctly', async () => {
    const runs = [
      makeRun({ id: 'r1', level: 'green', ok: true, latencyMs: 100 }),
      makeRun({ id: 'r2', level: 'red', ok: false, latencyMs: 500 }),
      makeRun({ id: 'r3', level: 'yellow', ok: false, latencyMs: 300 }),
      makeRun({ id: 'r4', level: 'green', ok: true, latencyMs: 200 }),
    ];
    prisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await service.liveFeed('user-1');

    expect(result.stats.totalRuns).toBe(4);
    expect(result.stats.failedRuns).toBe(1);
    expect(result.stats.degradedRuns).toBe(1);
    expect(result.stats.successRuns).toBe(2);
    expect(result.stats.failureRatePct).toBe(25);
    expect(result.stats.avgLatencyMs).toBe(275); // (100+500+300+200)/4
  });

  it('returns null avgLatencyMs when all latencies are null', async () => {
    const runs = [
      makeRun({ id: 'r1', level: 'red', ok: false, latencyMs: null }),
    ];
    prisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await service.liveFeed('user-1');
    expect(result.stats.avgLatencyMs).toBeNull();
  });

  it('sets latestCheckedAt to most recent item checkedAt', async () => {
    const runs = [
      makeRun({ id: 'r1', checkedAt: new Date('2026-01-01T12:00:00Z') }),
      makeRun({ id: 'r2', checkedAt: new Date('2026-01-01T11:00:00Z') }),
    ];
    prisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await service.liveFeed('user-1');
    expect(result.latestCheckedAt).toBe('2026-01-01T12:00:00.000Z');
  });

  it('passes since param as gt filter when provided', async () => {
    prisma.monitorRun.findMany.mockResolvedValue([]);

    await service.liveFeed('user-1', { since: '2026-01-01T06:00:00Z' });

    const call = prisma.monitorRun.findMany.mock.calls[0][0];
    expect(call.where.checkedAt).toEqual({ gt: new Date('2026-01-01T06:00:00Z') });
  });

  it('passes level filter to query when provided', async () => {
    prisma.monitorRun.findMany.mockResolvedValue([]);

    await service.liveFeed('user-1', { level: 'red' });

    const call = prisma.monitorRun.findMany.mock.calls[0][0];
    expect(call.where.level).toBe('red');
  });

  it('clamps limit to max 200', async () => {
    prisma.monitorRun.findMany.mockResolvedValue([]);

    await service.liveFeed('user-1', { limit: 9999 });

    const call = prisma.monitorRun.findMany.mock.calls[0][0];
    expect(call.take).toBe(200);
  });

  it('computes checksPerMin from timestamp spread', async () => {
    const now = Date.now();
    // 60 runs over 60 seconds → 1 check/min... but let's do 10 runs over 60s → should be ~10/min
    const runs = Array.from({ length: 10 }, (_, i) =>
      makeRun({
        id: `r${i}`,
        checkedAt: new Date(now - i * 6000), // 6 seconds apart → 10 runs in 54 seconds
      }),
    );
    prisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await service.liveFeed('user-1');
    // 10 items over ~54 seconds = ~11 checks/min, should be > 0
    expect(result.stats.checksPerMin).not.toBeNull();
    expect(result.stats.checksPerMin!).toBeGreaterThan(0);
  });
});
