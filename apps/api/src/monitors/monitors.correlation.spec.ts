/**
 * Unit tests for MonitorsService.monitorCorrelation()
 *
 * Tests pairwise Jaccard-similarity failure-window analysis across monitors.
 */

import { describe, it, expect, vi } from 'vitest';
import { MonitorsService } from './monitors.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { VersionDetectionService } from './version-detection.service';

// ─── Factory helpers ─────────────────────────────────────────────────────────

function makeMonitorRow(id: string, name: string) {
  return { id, name, type: 'HTTP', enabled: true, userId: 'user-1' };
}

/** Build a mock run at `ts` (Date) for monitorId */
function makeRun(monitorId: string, ts: Date) {
  return { monitorId, checkedAt: ts };
}

function makePrisma(monitors: ReturnType<typeof makeMonitorRow>[], runs: ReturnType<typeof makeRun>[]) {
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
  return new MonitorsService(
    prisma as never,
    { listPlugins: vi.fn().mockReturnValue([]), runMonitor: vi.fn() } as unknown as ChecksService,
    { log: vi.fn() } as unknown as AuditService,
    { emitMonitorUpdate: vi.fn(), emitCheckResult: vi.fn() } as unknown as RealtimeEvents,
    {} as unknown as VersionDetectionService,
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build N timestamps spaced `stepMs` apart, starting from `baseMs` */
function buildTimestamps(baseMs: number, count: number, stepMs = 5 * 60 * 1000) {
  return Array.from({ length: count }, (_, i) => new Date(baseMs + i * stepMs));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MonitorsService.monitorCorrelation()', () => {
  const NOW = Date.now();
  const BASE = NOW - 3 * 86_400_000; // 3 days ago

  it('returns empty pairs when fewer than 2 monitors', async () => {
    const prisma = makePrisma([makeMonitorRow('m1', 'Alpha')], []);
    const svc = makeService(prisma);
    const result = await svc.monitorCorrelation('user-1', 7);

    expect(result.monitors).toHaveLength(1);
    expect(result.pairs).toHaveLength(0);
    expect(result.groups).toHaveLength(0);
  });

  it('returns empty pairs when no monitors exist', async () => {
    const prisma = makePrisma([], []);
    const svc = makeService(prisma);
    const result = await svc.monitorCorrelation('user-1', 7);

    expect(result.monitors).toHaveLength(0);
    expect(result.pairs).toHaveLength(0);
    expect(result.groups).toHaveLength(0);
  });

  it('returns empty pairs when both monitors have no failures', async () => {
    const prisma = makePrisma(
      [makeMonitorRow('m1', 'Alpha'), makeMonitorRow('m2', 'Beta')],
      [], // no failure runs
    );
    const svc = makeService(prisma);
    const result = await svc.monitorCorrelation('user-1', 7);

    expect(result.pairs).toHaveLength(0);
    expect(result.groups).toHaveLength(0);
  });

  it('returns high similarity (1.0) when two monitors fail in identical 5-min buckets', async () => {
    const timestamps = buildTimestamps(BASE, 10);
    const runs = [
      ...timestamps.map(ts => makeRun('m1', ts)),
      ...timestamps.map(ts => makeRun('m2', ts)),
    ];
    const prisma = makePrisma(
      [makeMonitorRow('m1', 'Alpha'), makeMonitorRow('m2', 'Beta')],
      runs,
    );
    const svc = makeService(prisma);
    const result = await svc.monitorCorrelation('user-1', 7);

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].similarity).toBe(1);
    expect(result.pairs[0].aId).toBe('m1');
    expect(result.pairs[0].bId).toBe('m2');
  });

  it('returns similarity 0 (no pair) when two monitors never fail at the same time', async () => {
    // m1 fails in first 5 buckets, m2 in next 5 completely different buckets
    const BUCKET_MS = 5 * 60 * 1000;
    const ts1 = buildTimestamps(BASE, 5, BUCKET_MS);
    const ts2 = buildTimestamps(BASE + 5 * BUCKET_MS, 5, BUCKET_MS);
    const runs = [
      ...ts1.map(ts => makeRun('m1', ts)),
      ...ts2.map(ts => makeRun('m2', ts)),
    ];
    const prisma = makePrisma(
      [makeMonitorRow('m1', 'Alpha'), makeMonitorRow('m2', 'Beta')],
      runs,
    );
    const svc = makeService(prisma);
    const result = await svc.monitorCorrelation('user-1', 7);

    // Jaccard similarity = 0 → pair should not be included (threshold 0.1)
    expect(result.pairs).toHaveLength(0);
  });

  it('filters pairs below 0.1 Jaccard threshold', async () => {
    // m1 has 100 failure buckets, m2 shares only 5 → Jaccard = 5/100 = 0.05 < 0.1
    const BUCKET_MS = 5 * 60 * 1000;
    const ts1 = buildTimestamps(BASE, 100, BUCKET_MS);
    const ts2 = ts1.slice(0, 5); // m2 only shares 5 buckets
    const runs = [
      ...ts1.map(ts => makeRun('m1', ts)),
      ...ts2.map(ts => makeRun('m2', ts)),
    ];
    const prisma = makePrisma(
      [makeMonitorRow('m1', 'Alpha'), makeMonitorRow('m2', 'Beta')],
      runs,
    );
    const svc = makeService(prisma);
    const result = await svc.monitorCorrelation('user-1', 7);

    // 5/(100+5-5) = 5/100 = 0.05 → below threshold
    expect(result.pairs).toHaveLength(0);
  });

  it('returns pair with partial overlap and correct similarity', async () => {
    const BUCKET_MS = 5 * 60 * 1000;
    const base10 = buildTimestamps(BASE, 10, BUCKET_MS);
    // m1 uses base10, m2 shares first 5 → Jaccard = 5/(10+5-5) = 5/10 = 0.5
    const runs = [
      ...base10.map(ts => makeRun('m1', ts)),
      ...base10.slice(0, 5).map(ts => makeRun('m2', ts)),
    ];
    const prisma = makePrisma(
      [makeMonitorRow('m1', 'Alpha'), makeMonitorRow('m2', 'Beta')],
      runs,
    );
    const svc = makeService(prisma);
    const result = await svc.monitorCorrelation('user-1', 7);

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].similarity).toBe(0.5);
    expect(result.pairs[0].sharedWindows).toBe(5);
    expect(result.pairs[0].aWindows).toBe(10);
    expect(result.pairs[0].bWindows).toBe(5);
  });

  it('groups highly correlated monitors (similarity >= 0.4) together', async () => {
    const timestamps = buildTimestamps(BASE, 20);
    const runs = [
      ...timestamps.map(ts => makeRun('m1', ts)),
      ...timestamps.map(ts => makeRun('m2', ts)),
      ...timestamps.map(ts => makeRun('m3', ts)),
    ];
    const prisma = makePrisma(
      [makeMonitorRow('m1', 'A'), makeMonitorRow('m2', 'B'), makeMonitorRow('m3', 'C')],
      runs,
    );
    const svc = makeService(prisma);
    const result = await svc.monitorCorrelation('user-1', 7);

    // All 3 monitors share the same failure windows → all pairs similarity = 1.0
    expect(result.pairs).toHaveLength(3);
    // They should all be grouped together
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].monitorIds).toHaveLength(3);
    expect(result.groups[0].avgSimilarity).toBe(1);
  });

  it('does not group monitors with similarity < 0.4', async () => {
    const BUCKET_MS = 5 * 60 * 1000;
    // m1 has 10 buckets, m2 shares 2 → Jaccard = 2/(10+2-2) = 2/10 = 0.2 → pair included but not grouped
    const ts1 = buildTimestamps(BASE, 10, BUCKET_MS);
    const ts2 = ts1.slice(0, 2);
    const runs = [
      ...ts1.map(ts => makeRun('m1', ts)),
      ...ts2.map(ts => makeRun('m2', ts)),
    ];
    const prisma = makePrisma(
      [makeMonitorRow('m1', 'Alpha'), makeMonitorRow('m2', 'Beta')],
      runs,
    );
    const svc = makeService(prisma);
    const result = await svc.monitorCorrelation('user-1', 7);

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].similarity).toBe(0.2);
    // similarity < 0.4 → no group
    expect(result.groups).toHaveLength(0);
  });

  it('clamps days to 1 minimum', async () => {
    const prisma = makePrisma(
      [makeMonitorRow('m1', 'A'), makeMonitorRow('m2', 'B')],
      [],
    );
    const svc = makeService(prisma);
    await svc.monitorCorrelation('user-1', 0); // should clamp to 1

    // Verify findMany was called with a since date ~1 day ago (not 0)
    const call = (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const since: Date = call.where.checkedAt.gte;
    const ageMs = Date.now() - since.getTime();
    expect(ageMs).toBeLessThan(2 * 86_400_000); // < 2 days
    expect(ageMs).toBeGreaterThan(0.5 * 86_400_000); // > 0.5 days
  });

  it('clamps days to 90 maximum', async () => {
    const prisma = makePrisma(
      [makeMonitorRow('m1', 'A'), makeMonitorRow('m2', 'B')],
      [],
    );
    const svc = makeService(prisma);
    await svc.monitorCorrelation('user-1', 999); // should clamp to 90

    const call = (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const since: Date = call.where.checkedAt.gte;
    const ageMs = Date.now() - since.getTime();
    expect(ageMs).toBeLessThan(91 * 86_400_000);
    expect(ageMs).toBeGreaterThan(89 * 86_400_000);
  });

  it('returns monitors list in result even when no pairs found', async () => {
    const prisma = makePrisma(
      [makeMonitorRow('m1', 'Alpha'), makeMonitorRow('m2', 'Beta'), makeMonitorRow('m3', 'Gamma')],
      [],
    );
    const svc = makeService(prisma);
    const result = await svc.monitorCorrelation('user-1', 7);

    expect(result.monitors).toHaveLength(3);
    expect(result.monitors.map(m => m.name)).toContain('Alpha');
    expect(result.monitors.map(m => m.name)).toContain('Beta');
  });

  it('sorts pairs by similarity descending', async () => {
    const BUCKET_MS = 5 * 60 * 1000;
    const ts = buildTimestamps(BASE, 20, BUCKET_MS);
    // m1+m2: full overlap (sim=1), m1+m3: partial (sim~0.5), m2+m3: partial (sim~0.5)
    const runs = [
      ...ts.map(t => makeRun('m1', t)),
      ...ts.map(t => makeRun('m2', t)),
      ...ts.slice(0, 10).map(t => makeRun('m3', t)),
    ];
    const prisma = makePrisma(
      [makeMonitorRow('m1', 'A'), makeMonitorRow('m2', 'B'), makeMonitorRow('m3', 'C')],
      runs,
    );
    const svc = makeService(prisma);
    const result = await svc.monitorCorrelation('user-1', 7);

    // First pair should have highest similarity
    expect(result.pairs[0].similarity).toBeGreaterThanOrEqual(result.pairs[1]?.similarity ?? 0);
    if (result.pairs.length > 2) {
      expect(result.pairs[1].similarity).toBeGreaterThanOrEqual(result.pairs[2].similarity);
    }
  });
});
