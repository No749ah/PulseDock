import { describe, it, expect } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MonitorsService } from './monitors.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRun(latencyMs: number | null, ok: boolean, daysAgo: number) {
  const checkedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return { latencyMs, ok, checkedAt };
}

function makeService(overrides: {
  monitorFindFirst?: () => unknown;
  monitorRunFindMany?: () => unknown;
}): MonitorsService {
  const prisma = {
    monitor: {
      findFirst: overrides.monitorFindFirst ?? (() => ({ id: 'mon1', userId: 'user1' })),
    },
    monitorRun: {
      findMany: overrides.monitorRunFindMany ?? (() => []),
    },
  };
  return new MonitorsService(
    prisma as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MonitorsService.latencyHistory', () => {

  // 1. Throws NotFoundException for unknown monitor
  it('throws NotFoundException when monitor not found', async () => {
    const svc = makeService({ monitorFindFirst: () => null });
    await expect(svc.latencyHistory('user1', 'bad-mon', 30)).rejects.toThrow(NotFoundException);
  });

  // 2. Returns N days of buckets even when no runs exist
  it('returns one bucket per day even with no runs', async () => {
    const svc = makeService({ monitorRunFindMany: () => [] });
    const result = await svc.latencyHistory('user1', 'mon1', 7);
    // Should have 7 date buckets
    expect(result.days).toHaveLength(7);
    result.days.forEach((d) => {
      expect(d.p50).toBeNull();
      expect(d.p95).toBeNull();
      expect(d.p99).toBeNull();
      expect(d.uptimePct).toBeNull();
      expect(d.totalChecks).toBe(0);
    });
  });

  // 3. Calculates P50 correctly for a known dataset
  it('calculates P50 (median) correctly', async () => {
    // 5 runs today: [100, 200, 300, 400, 500] → P50 = 300
    const today = new Date();
    const key = today.toISOString().split('T')[0];
    const svc = makeService({
      monitorRunFindMany: () => [
        { latencyMs: 100, ok: true, checkedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 1) },
        { latencyMs: 200, ok: true, checkedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 2) },
        { latencyMs: 300, ok: true, checkedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 3) },
        { latencyMs: 400, ok: true, checkedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 4) },
        { latencyMs: 500, ok: true, checkedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 5) },
      ],
    });
    const result = await svc.latencyHistory('user1', 'mon1', 1);
    const todayBucket = result.days.find((d) => d.date === key);
    expect(todayBucket).toBeDefined();
    expect(todayBucket!.p50).toBe(300);
  });

  // 4. Calculates P95 correctly
  it('calculates P95 correctly for 20 data points', async () => {
    // 20 latencies 10..200ms step 10 → P95 = index ceil(20*0.95)-1 = 18 → value 190
    const today = new Date();
    const runs = Array.from({ length: 20 }, (_, i) => ({
      latencyMs: (i + 1) * 10,
      ok: true,
      checkedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), i + 1),
    }));
    const svc = makeService({ monitorRunFindMany: () => runs });
    const result = await svc.latencyHistory('user1', 'mon1', 1);
    const key = today.toISOString().split('T')[0];
    const bucket = result.days.find((d) => d.date === key);
    expect(bucket!.p95).toBe(190);
  });

  // 5. Calculates uptimePct correctly
  it('calculates uptimePct correctly', async () => {
    // 3 ok + 1 failed → 75%
    const today = new Date();
    const svc = makeService({
      monitorRunFindMany: () => [
        { latencyMs: 100, ok: true, checkedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 1) },
        { latencyMs: 100, ok: true, checkedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 2) },
        { latencyMs: 100, ok: true, checkedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 3) },
        { latencyMs: null, ok: false, checkedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 4) },
      ],
    });
    const result = await svc.latencyHistory('user1', 'mon1', 1);
    const key = today.toISOString().split('T')[0];
    const bucket = result.days.find((d) => d.date === key);
    expect(bucket!.uptimePct).toBe(75);
    expect(bucket!.totalChecks).toBe(4);
  });

  // 6. Days are sorted chronologically (oldest first)
  it('returns days sorted from oldest to newest', async () => {
    const svc = makeService({ monitorRunFindMany: () => [] });
    const result = await svc.latencyHistory('user1', 'mon1', 14);
    const dates = result.days.map((d) => d.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  // 7. Clamps days to max 90
  it('clamps period to maximum 90 days', async () => {
    const svc = makeService({ monitorRunFindMany: () => [] });
    const result = await svc.latencyHistory('user1', 'mon1', 200);
    // Should be 90, not 200
    expect(result.days.length).toBeLessThanOrEqual(90);
  });

  // 8. Ignores null latencyMs when calculating percentiles
  it('ignores null latencyMs values for percentile calculation', async () => {
    const today = new Date();
    const svc = makeService({
      monitorRunFindMany: () => [
        { latencyMs: null, ok: false, checkedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 1) },
        { latencyMs: null, ok: false, checkedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 2) },
      ],
    });
    const result = await svc.latencyHistory('user1', 'mon1', 1);
    const key = today.toISOString().split('T')[0];
    const bucket = result.days.find((d) => d.date === key);
    // p50/p95/p99 should all be null since no latency data
    expect(bucket!.p50).toBeNull();
    expect(bucket!.p95).toBeNull();
    expect(bucket!.p99).toBeNull();
    // but totalChecks and uptimePct should reflect the 2 failed runs
    expect(bucket!.totalChecks).toBe(2);
    expect(bucket!.uptimePct).toBe(0);
  });
});
