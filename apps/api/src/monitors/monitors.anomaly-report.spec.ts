/**
 * Unit tests for MonitorsService.anomalyReport()
 *
 * Covers: empty fleet, no anomalies (stable monitors), uptime regression,
 * latency regression, flapping detection, failure burst, recovery, severity
 * scoring, period hour validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorsAnalyticsService } from './monitors-analytics.service';

// ── helpers ──────────────────────────────────────────────────────────────

function makeRun(opts: { monitorId: string; ok: boolean; latencyMs?: number; hoursAgo: number }) {
  const checkedAt = new Date(Date.now() - opts.hoursAgo * 3_600_000);
  return {
    monitorId: opts.monitorId,
    ok: opts.ok,
    latencyMs: opts.latencyMs ?? (opts.ok ? 100 : null),
    level: opts.ok ? 'green' : 'red',
    checkedAt,
  };
}

function makePrisma(monitors: { id: string; name: string; type: string }[], runs: ReturnType<typeof makeRun>[]) {
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
  return new (MonitorsAnalyticsService as unknown as new (...args: unknown[]) => MonitorsAnalyticsService)(prisma) as MonitorsService;
}

// ── tests ─────────────────────────────────────────────────────────────────

describe('MonitorsService.anomalyReport()', () => {
  it('returns empty result when no monitors exist', async () => {
    const prisma = makePrisma([], []);
    const svc = makeService(prisma);
    const result = await svc.anomalyReport('user1', 24);
    expect(result.totalMonitors).toBe(0);
    expect(result.anomaliesFound).toBe(0);
    expect(result.anomalies).toHaveLength(0);
  });

  it('returns no anomalies when all monitors are healthy and stable', async () => {
    const monitors = [{ id: 'm1', name: 'API', type: 'HTTP' }];
    // Current period (0–24h ago): all OK
    // Previous period (24–48h ago): all OK
    const runs = [
      ...Array.from({ length: 10 }, (_, i) => makeRun({ monitorId: 'm1', ok: true, latencyMs: 100, hoursAgo: i + 1 })),
      ...Array.from({ length: 10 }, (_, i) => makeRun({ monitorId: 'm1', ok: true, latencyMs: 100, hoursAgo: i + 25 })),
    ];
    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.anomalyReport('user1', 24);
    expect(result.anomaliesFound).toBe(0);
  });

  it('detects uptime regression when uptime drops ≥5%', async () => {
    const monitors = [{ id: 'm1', name: 'API', type: 'HTTP' }];
    // Current: 8/10 ok = 80% uptime (down from 100%)
    const currRuns = [
      ...Array.from({ length: 8 }, (_, i) => makeRun({ monitorId: 'm1', ok: true, latencyMs: 100, hoursAgo: i + 1 })),
      ...Array.from({ length: 2 }, (_, i) => makeRun({ monitorId: 'm1', ok: false, hoursAgo: i + 9 })),
    ];
    // Previous: 10/10 ok = 100% uptime
    const prevRuns = Array.from({ length: 10 }, (_, i) =>
      makeRun({ monitorId: 'm1', ok: true, latencyMs: 100, hoursAgo: i + 25 }),
    );
    const prisma = makePrisma(monitors, [...currRuns, ...prevRuns]);
    const svc = makeService(prisma);
    const result = await svc.anomalyReport('user1', 24);
    expect(result.anomaliesFound).toBeGreaterThan(0);
    const anomaly = result.anomalies[0];
    expect(anomaly.anomalyTypes).toContain('uptime_regression');
    expect(anomaly.details.find((d) => d.type === 'uptime_regression')).toBeDefined();
  });

  it('assigns critical severity when uptime < 90%', async () => {
    const monitors = [{ id: 'm1', name: 'DB', type: 'TCP' }];
    // Current: 2/10 ok = 20% uptime (critical)
    const currRuns = [
      ...Array.from({ length: 2 }, (_, i) => makeRun({ monitorId: 'm1', ok: true, latencyMs: 50, hoursAgo: i + 1 })),
      ...Array.from({ length: 8 }, (_, i) => makeRun({ monitorId: 'm1', ok: false, hoursAgo: i + 3 })),
    ];
    const prevRuns = Array.from({ length: 10 }, (_, i) =>
      makeRun({ monitorId: 'm1', ok: true, latencyMs: 50, hoursAgo: i + 25 }),
    );
    const prisma = makePrisma(monitors, [...currRuns, ...prevRuns]);
    const svc = makeService(prisma);
    const result = await svc.anomalyReport('user1', 24);
    expect(result.anomalies[0].severity).toBe('critical');
  });

  it('detects latency regression when avg latency increases ≥25%', async () => {
    const monitors = [{ id: 'm1', name: 'API', type: 'HTTP' }];
    // Current: avg 500ms; Previous: avg 200ms → +150% regression
    const currRuns = Array.from({ length: 10 }, (_, i) =>
      makeRun({ monitorId: 'm1', ok: true, latencyMs: 500, hoursAgo: i + 1 }),
    );
    const prevRuns = Array.from({ length: 10 }, (_, i) =>
      makeRun({ monitorId: 'm1', ok: true, latencyMs: 200, hoursAgo: i + 25 }),
    );
    const prisma = makePrisma(monitors, [...currRuns, ...prevRuns]);
    const svc = makeService(prisma);
    const result = await svc.anomalyReport('user1', 24);
    expect(result.anomalies[0].anomalyTypes).toContain('latency_regression');
    expect(result.anomalies[0].severity).toBe('medium');
  });

  it('does NOT flag latency regression when increase < 25%', async () => {
    const monitors = [{ id: 'm1', name: 'API', type: 'HTTP' }];
    // Current: 210ms; Previous: 200ms → +5%, not an anomaly
    const currRuns = Array.from({ length: 10 }, (_, i) =>
      makeRun({ monitorId: 'm1', ok: true, latencyMs: 210, hoursAgo: i + 1 }),
    );
    const prevRuns = Array.from({ length: 10 }, (_, i) =>
      makeRun({ monitorId: 'm1', ok: true, latencyMs: 200, hoursAgo: i + 25 }),
    );
    const prisma = makePrisma(monitors, [...currRuns, ...prevRuns]);
    const svc = makeService(prisma);
    const result = await svc.anomalyReport('user1', 24);
    expect(result.anomaliesFound).toBe(0);
  });

  it('detects flapping when status change rate ≥10% with ≥3 changes', async () => {
    const monitors = [{ id: 'm1', name: 'Flapper', type: 'HTTP' }];
    // Alternating ok/fail = very high change rate
    const currRuns = Array.from({ length: 20 }, (_, i) =>
      makeRun({ monitorId: 'm1', ok: i % 2 === 0, latencyMs: 100, hoursAgo: i * 0.1 + 1 }),
    );
    const prevRuns = Array.from({ length: 10 }, (_, i) =>
      makeRun({ monitorId: 'm1', ok: true, latencyMs: 100, hoursAgo: i + 25 }),
    );
    const prisma = makePrisma(monitors, [...currRuns, ...prevRuns]);
    const svc = makeService(prisma);
    const result = await svc.anomalyReport('user1', 24);
    const anomaly = result.anomalies.find((a) => a.anomalyTypes.includes('flapping'));
    expect(anomaly).toBeDefined();
  });

  it('detects recovery when previous uptime < 90% and current ≥ 99%', async () => {
    const monitors = [{ id: 'm1', name: 'WebApp', type: 'HTTP' }];
    // Current: all OK (100%); Previous: mostly down (20%)
    const currRuns = Array.from({ length: 10 }, (_, i) =>
      makeRun({ monitorId: 'm1', ok: true, latencyMs: 100, hoursAgo: i + 1 }),
    );
    const prevRuns = [
      ...Array.from({ length: 2 }, (_, i) => makeRun({ monitorId: 'm1', ok: true, latencyMs: 100, hoursAgo: i + 25 })),
      ...Array.from({ length: 8 }, (_, i) => makeRun({ monitorId: 'm1', ok: false, hoursAgo: i + 27 })),
    ];
    const prisma = makePrisma(monitors, [...currRuns, ...prevRuns]);
    const svc = makeService(prisma);
    const result = await svc.anomalyReport('user1', 24);
    expect(result.anomalies.some((a) => a.anomalyTypes.includes('recovered'))).toBe(true);
  });

  it('sorts anomalies: critical first, then high, medium, low', async () => {
    // m1: critical (uptime 20%), m2: medium (latency regression)
    const monitors = [
      { id: 'm1', name: 'Critical', type: 'HTTP' },
      { id: 'm2', name: 'Slow', type: 'HTTP' },
    ];
    const runs = [
      // m1 current: 20% uptime (critical)
      ...Array.from({ length: 2 }, (_, i) => makeRun({ monitorId: 'm1', ok: true, hoursAgo: i + 1 })),
      ...Array.from({ length: 8 }, (_, i) => makeRun({ monitorId: 'm1', ok: false, hoursAgo: i + 3 })),
      // m1 prev: 100%
      ...Array.from({ length: 10 }, (_, i) => makeRun({ monitorId: 'm1', ok: true, hoursAgo: i + 25 })),
      // m2 current: 100% but high latency
      ...Array.from({ length: 10 }, (_, i) => makeRun({ monitorId: 'm2', ok: true, latencyMs: 800, hoursAgo: i + 1 })),
      // m2 prev: 100% low latency
      ...Array.from({ length: 10 }, (_, i) => makeRun({ monitorId: 'm2', ok: true, latencyMs: 100, hoursAgo: i + 25 })),
    ];
    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.anomalyReport('user1', 24);
    expect(result.anomalies.length).toBeGreaterThanOrEqual(2);
    expect(result.anomalies[0].severity).toBe('critical');
    // m2 should appear after m1
    const m2idx = result.anomalies.findIndex((a) => a.monitorId === 'm2');
    const m1idx = result.anomalies.findIndex((a) => a.monitorId === 'm1');
    expect(m1idx).toBeLessThan(m2idx);
  });

  it('includes correct period hours in response', async () => {
    const prisma = makePrisma([], []);
    const svc = makeService(prisma);
    const result48 = await svc.anomalyReport('u1', 48);
    expect(result48.periodHours).toBe(48);
    const result168 = await svc.anomalyReport('u1', 168);
    expect(result168.periodHours).toBe(168);
  });

  it('skips monitors with fewer than 2 current period runs', async () => {
    const monitors = [{ id: 'm1', name: 'New', type: 'HTTP' }];
    // Only 1 run in current period
    const runs = [makeRun({ monitorId: 'm1', ok: false, hoursAgo: 1 })];
    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.anomalyReport('u1', 24);
    expect(result.anomaliesFound).toBe(0);
  });
});
