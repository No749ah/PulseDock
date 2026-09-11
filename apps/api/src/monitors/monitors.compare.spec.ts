/**
 * Unit tests for MonitorsService.compareMonitors()
 *
 * Covers: validation (too few / too many IDs), correct structure, uptime
 * computation, winner identification, Pearson correlation, null latency
 * for non-HTTP, and empty data handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { MonitorsComparisonService } from './monitors-comparison.service';
import { pearsonCorrelation } from './monitors.service';

// ── helpers ──────────────────────────────────────────────────────────────

function makeRun(opts: { monitorId: string; ok: boolean; latencyMs?: number | null; daysAgo: number }) {
  const checkedAt = new Date(Date.now() - opts.daysAgo * 86_400_000);
  return {
    monitorId: opts.monitorId,
    ok: opts.ok,
    latencyMs: opts.latencyMs ?? (opts.ok ? 100 : null),
    checkedAt,
  };
}

function makePrisma(
  monitors: { id: string; name: string; type: string; target: string }[],
  runs: ReturnType<typeof makeRun>[],
) {
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(monitors),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue(runs),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new (MonitorsComparisonService as unknown as new (...args: unknown[]) => MonitorsComparisonService)(prisma) as MonitorsComparisonService;
}

// ── tests ─────────────────────────────────────────────────────────────────

describe('MonitorsService.compareMonitors()', () => {
  it('throws BadRequest when fewer than 2 monitor IDs provided', async () => {
    const prisma = makePrisma([], []);
    const svc = makeService(prisma);
    await expect(svc.compareMonitors('user1', ['m1'], 7)).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequest when more than 4 monitor IDs provided', async () => {
    const prisma = makePrisma([], []);
    const svc = makeService(prisma);
    await expect(
      svc.compareMonitors('user1', ['m1', 'm2', 'm3', 'm4', 'm5'], 7),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns comparison data for 2 monitors with correct structure', async () => {
    const monitors = [
      { id: 'm1', name: 'API', type: 'HTTP', target: 'https://api.example.com' },
      { id: 'm2', name: 'Web', type: 'HTTP', target: 'https://web.example.com' },
    ];
    const runs = [
      ...Array.from({ length: 10 }, (_, i) =>
        makeRun({ monitorId: 'm1', ok: true, latencyMs: 100, daysAgo: i * 0.5 }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        makeRun({ monitorId: 'm2', ok: true, latencyMs: 200, daysAgo: i * 0.5 }),
      ),
    ];
    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.compareMonitors('user1', ['m1', 'm2'], 7);

    // Check top-level structure
    expect(result).toHaveProperty('monitors');
    expect(result).toHaveProperty('comparison');
    expect(result).toHaveProperty('period');
    expect(result.monitors).toHaveLength(2);
    expect(result.period.days).toBe(7);

    // Check monitor structure
    const m = result.monitors[0];
    expect(m).toHaveProperty('id');
    expect(m).toHaveProperty('name');
    expect(m).toHaveProperty('type');
    expect(m).toHaveProperty('target');
    expect(m).toHaveProperty('uptimePct');
    expect(m).toHaveProperty('avgLatencyMs');
    expect(m).toHaveProperty('p95LatencyMs');
    expect(m).toHaveProperty('totalChecks');
    expect(m).toHaveProperty('totalFailures');
    expect(m).toHaveProperty('longestOutageMin');
    expect(m).toHaveProperty('dailyUptime');
    expect(m).toHaveProperty('dailyLatency');

    // Check comparison structure
    expect(result.comparison).toHaveProperty('bestUptime');
    expect(result.comparison).toHaveProperty('bestLatency');
    expect(result.comparison).toHaveProperty('mostReliable');
    expect(result.comparison).toHaveProperty('correlations');
    expect(result.comparison.correlations).toHaveLength(1); // C(2,2) = 1 pair
  });

  it('computes uptime percentages correctly', async () => {
    const monitors = [
      { id: 'm1', name: 'API', type: 'HTTP', target: 'https://api.example.com' },
      { id: 'm2', name: 'Web', type: 'HTTP', target: 'https://web.example.com' },
    ];
    // m1: 8/10 OK = 80%, m2: 10/10 OK = 100%
    const runs = [
      ...Array.from({ length: 8 }, (_, i) =>
        makeRun({ monitorId: 'm1', ok: true, latencyMs: 100, daysAgo: i * 0.5 }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        makeRun({ monitorId: 'm1', ok: false, latencyMs: null, daysAgo: 4 + i * 0.5 }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        makeRun({ monitorId: 'm2', ok: true, latencyMs: 200, daysAgo: i * 0.5 }),
      ),
    ];
    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.compareMonitors('user1', ['m1', 'm2'], 7);

    const m1 = result.monitors.find((m) => m.id === 'm1')!;
    const m2 = result.monitors.find((m) => m.id === 'm2')!;
    expect(m1.uptimePct).toBe(80);
    expect(m2.uptimePct).toBe(100);
    expect(m1.totalFailures).toBe(2);
    expect(m2.totalFailures).toBe(0);
  });

  it('identifies best uptime winner correctly', async () => {
    const monitors = [
      { id: 'm1', name: 'API', type: 'HTTP', target: 'https://api.example.com' },
      { id: 'm2', name: 'Web', type: 'HTTP', target: 'https://web.example.com' },
    ];
    // m1: 50% uptime, m2: 100% uptime
    const runs = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeRun({ monitorId: 'm1', ok: true, latencyMs: 100, daysAgo: i * 0.5 }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeRun({ monitorId: 'm1', ok: false, latencyMs: null, daysAgo: 3 + i * 0.5 }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        makeRun({ monitorId: 'm2', ok: true, latencyMs: 200, daysAgo: i * 0.5 }),
      ),
    ];
    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.compareMonitors('user1', ['m1', 'm2'], 7);

    expect(result.comparison.bestUptime.monitorId).toBe('m2');
    expect(result.comparison.bestUptime.value).toBe(100);
  });

  it('computes Pearson correlation correctly for perfectly correlated data', () => {
    // Perfectly correlated
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 6, 8, 10];
    const coeff = pearsonCorrelation(xs, ys);
    expect(coeff).toBeCloseTo(1, 5);

    // Perfectly negatively correlated
    const ys2 = [10, 8, 6, 4, 2];
    const coeff2 = pearsonCorrelation(xs, ys2);
    expect(coeff2).toBeCloseTo(-1, 5);

    // No correlation (constant)
    const ys3 = [5, 5, 5, 5, 5];
    const coeff3 = pearsonCorrelation(xs, ys3);
    expect(coeff3).toBe(0);
  });

  it('returns null latency fields for non-HTTP monitors', async () => {
    const monitors = [
      { id: 'm1', name: 'DB', type: 'TCP', target: 'db.example.com:5432' },
      { id: 'm2', name: 'Redis', type: 'TCP', target: 'redis.example.com:6379' },
    ];
    const runs = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeRun({ monitorId: 'm1', ok: true, latencyMs: 50, daysAgo: i }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeRun({ monitorId: 'm2', ok: true, latencyMs: 30, daysAgo: i }),
      ),
    ];
    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.compareMonitors('user1', ['m1', 'm2'], 7);

    for (const m of result.monitors) {
      expect(m.avgLatencyMs).toBeNull();
      expect(m.p95LatencyMs).toBeNull();
      for (const d of m.dailyLatency) {
        expect(d.avgMs).toBeNull();
        expect(d.p95Ms).toBeNull();
      }
    }
    expect(result.comparison.bestLatency).toBeNull();
  });

  it('handles monitors with no check data gracefully', async () => {
    const monitors = [
      { id: 'm1', name: 'New1', type: 'HTTP', target: 'https://new1.example.com' },
      { id: 'm2', name: 'New2', type: 'HTTP', target: 'https://new2.example.com' },
    ];
    const prisma = makePrisma(monitors, []);
    const svc = makeService(prisma);
    const result = await svc.compareMonitors('user1', ['m1', 'm2'], 7);

    for (const m of result.monitors) {
      expect(m.totalChecks).toBe(0);
      expect(m.totalFailures).toBe(0);
      expect(m.uptimePct).toBe(100); // No checks = 100% by convention
      expect(m.longestOutageMin).toBe(0);
    }
    expect(result.comparison.bestUptime.value).toBe(100);
  });
});
