import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal MonitorsService stub for testing monitorCorrelation
const makePrisma = (monitors: { id: string; name: string; type: string }[], runs: { monitorId: string; checkedAt: Date; level: string }[]) => ({
  monitor: {
    findMany: vi.fn().mockResolvedValue(monitors),
  },
  monitorRun: {
    findMany: vi.fn().mockResolvedValue(runs),
  },
});

// Inline a self-contained version of the algorithm for unit testing
async function monitorCorrelation(
  prisma: ReturnType<typeof makePrisma>,
  userId: string,
  days: number = 7,
) {
  const clampedDays = Math.min(90, Math.max(1, days));
  const since = new Date(Date.now() - clampedDays * 86_400_000);
  const BUCKET_MS = 5 * 60 * 1000;

  const monitors = await prisma.monitor.findMany({
    where: { userId, enabled: true },
    select: { id: true, name: true, type: true },
  });

  if (monitors.length < 2) {
    return { monitors: monitors.map((m: typeof monitors[0]) => ({ id: m.id, name: m.name, type: m.type })), pairs: [], groups: [] };
  }

  const monitorIds = monitors.map((m: typeof monitors[0]) => m.id);

  const runs = await prisma.monitorRun.findMany({
    where: { monitorId: { in: monitorIds }, checkedAt: { gte: since }, level: { in: ['yellow', 'red'] } },
    select: { monitorId: true, checkedAt: true },
  });

  const failureWindows = new Map<string, Set<number>>();
  for (const id of monitorIds) failureWindows.set(id, new Set());
  for (const run of runs) {
    const bucket = Math.floor((run as { monitorId: string; checkedAt: Date }).checkedAt.getTime() / BUCKET_MS);
    failureWindows.get((run as { monitorId: string; checkedAt: Date }).monitorId)?.add(bucket);
  }

  const pairs: Array<{ aId: string; bId: string; similarity: number; sharedWindows: number; aWindows: number; bWindows: number }> = [];

  for (let i = 0; i < monitorIds.length; i++) {
    for (let j = i + 1; j < monitorIds.length; j++) {
      const aId = monitorIds[i];
      const bId = monitorIds[j];
      const aSet = failureWindows.get(aId)!;
      const bSet = failureWindows.get(bId)!;
      if (aSet.size === 0 && bSet.size === 0) continue;
      let intersection = 0;
      const [small, large] = aSet.size <= bSet.size ? [aSet, bSet] : [bSet, aSet];
      for (const key of small) { if (large.has(key)) intersection++; }
      const union = aSet.size + bSet.size - intersection;
      if (union === 0) continue;
      const similarity = intersection / union;
      if (similarity > 0.1) {
        pairs.push({ aId, bId, similarity: Math.round(similarity * 1000) / 1000, sharedWindows: intersection, aWindows: aSet.size, bWindows: bSet.size });
      }
    }
  }
  pairs.sort((a, b) => b.similarity - a.similarity);

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };
  const unionFn = (a: string, b: string) => {
    const ra = find(a); const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const p of pairs) { if (p.similarity >= 0.4) unionFn(p.aId, p.bId); }

  const groupMap = new Map<string, string[]>();
  for (const id of monitorIds) {
    if ((failureWindows.get(id)?.size ?? 0) === 0) continue;
    const root = find(id);
    if (!groupMap.has(root)) groupMap.set(root, []);
    groupMap.get(root)!.push(id);
  }

  const monitorNames = new Map(monitors.map((m: typeof monitors[0]) => [m.id, m.name]));
  const groups: Array<{ monitorIds: string[]; avgSimilarity: number; label: string }> = [];
  for (const [, members] of groupMap) {
    if (members.length < 2) continue;
    let totalSim = 0; let count = 0;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const p = pairs.find(x => (x.aId === members[i] && x.bId === members[j]) || (x.aId === members[j] && x.bId === members[i]));
        if (p) { totalSim += p.similarity; count++; }
      }
    }
    groups.push({
      monitorIds: members,
      avgSimilarity: count > 0 ? Math.round((totalSim / count) * 1000) / 1000 : 0,
      label: members.slice(0, 2).map(id => monitorNames.get(id) ?? id).join(' + ') + (members.length > 2 ? ` +${members.length - 2} more` : ''),
    });
  }
  groups.sort((a, b) => b.avgSimilarity - a.avgSimilarity);

  return { monitors: monitors.map((m: typeof monitors[0]) => ({ id: m.id, name: m.name, type: m.type })), pairs, groups };
}

describe('monitorCorrelation', () => {
  it('returns empty pairs when fewer than 2 monitors', async () => {
    const prisma = makePrisma([{ id: 'm1', name: 'A', type: 'HTTP' }], []);
    const result = await monitorCorrelation(prisma as unknown as ReturnType<typeof makePrisma>, 'u1', 7);
    expect(result.pairs).toHaveLength(0);
    expect(result.groups).toHaveLength(0);
    expect(result.monitors).toHaveLength(1);
  });

  it('returns empty pairs when no monitors have failures', async () => {
    const prisma = makePrisma(
      [{ id: 'm1', name: 'A', type: 'HTTP' }, { id: 'm2', name: 'B', type: 'HTTP' }],
      [],
    );
    const result = await monitorCorrelation(prisma as unknown as ReturnType<typeof makePrisma>, 'u1', 7);
    expect(result.pairs).toHaveLength(0);
  });

  it('computes high similarity for monitors failing at the same time', async () => {
    const BASE = 1_000_000_000_000;
    const BUCKET = 5 * 60 * 1000;
    // Both monitors fail in the same 5-minute window
    const runs = [
      { monitorId: 'm1', checkedAt: new Date(BASE + 0 * BUCKET), level: 'red' },
      { monitorId: 'm1', checkedAt: new Date(BASE + 1 * BUCKET), level: 'red' },
      { monitorId: 'm2', checkedAt: new Date(BASE + 0 * BUCKET), level: 'red' },
      { monitorId: 'm2', checkedAt: new Date(BASE + 1 * BUCKET), level: 'red' },
    ];
    const prisma = makePrisma(
      [{ id: 'm1', name: 'Alpha', type: 'HTTP' }, { id: 'm2', name: 'Beta', type: 'HTTP' }],
      runs,
    );
    const result = await monitorCorrelation(prisma as unknown as ReturnType<typeof makePrisma>, 'u1', 7);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].similarity).toBe(1); // perfect overlap
    expect(result.pairs[0].sharedWindows).toBe(2);
  });

  it('does not include pair with similarity <= 0.1', async () => {
    const BASE = 1_000_000_000_000;
    const BUCKET = 5 * 60 * 1000;
    // m1 fails in 10 buckets, m2 fails in 1 of those (Jaccard = 1/10 = 0.1 → excluded)
    const runs = Array.from({ length: 10 }, (_, i) => ({
      monitorId: 'm1', checkedAt: new Date(BASE + i * BUCKET), level: 'red' as const,
    }));
    runs.push({ monitorId: 'm2', checkedAt: new Date(BASE + 0 * BUCKET), level: 'red' });
    const prisma = makePrisma(
      [{ id: 'm1', name: 'Alpha', type: 'HTTP' }, { id: 'm2', name: 'Beta', type: 'HTTP' }],
      runs,
    );
    const result = await monitorCorrelation(prisma as unknown as ReturnType<typeof makePrisma>, 'u1', 7);
    // Jaccard = 1 / (10 + 1 - 1) = 1/10 = 0.1, excluded (> 0.1 required)
    expect(result.pairs).toHaveLength(0);
  });

  it('groups highly-correlated monitors (>=0.4 similarity) into clusters', async () => {
    const BASE = 1_000_000_000_000;
    const BUCKET = 5 * 60 * 1000;
    const shared = Array.from({ length: 5 }, (_, i) => i * BUCKET);
    const runs = [
      ...shared.map(t => ({ monitorId: 'm1', checkedAt: new Date(BASE + t), level: 'red' as const })),
      ...shared.map(t => ({ monitorId: 'm2', checkedAt: new Date(BASE + t), level: 'red' as const })),
      ...shared.map(t => ({ monitorId: 'm3', checkedAt: new Date(BASE + t), level: 'red' as const })),
    ];
    const prisma = makePrisma(
      [
        { id: 'm1', name: 'A', type: 'HTTP' },
        { id: 'm2', name: 'B', type: 'HTTP' },
        { id: 'm3', name: 'C', type: 'HTTP' },
      ],
      runs,
    );
    const result = await monitorCorrelation(prisma as unknown as ReturnType<typeof makePrisma>, 'u1', 7);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].monitorIds).toHaveLength(3);
    expect(result.groups[0].avgSimilarity).toBe(1);
    expect(result.groups[0].label).toContain('+1 more');
  });
});
