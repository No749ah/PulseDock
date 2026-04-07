import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V2PlaybooksController } from './playbooks.controller';

// Minimal playbook factory
function makePlaybook(
  overrides: Partial<{
    id: string;
    name: string;
    description: string | null;
    steps: object[];
    forSeverities: string[];
    monitorCount: number;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: overrides.id ?? 'pb-1',
    name: overrides.name ?? 'Default Playbook',
    description: overrides.description ?? null,
    steps: overrides.steps ?? [{ order: 1, text: 'Step 1' }],
    forSeverities: overrides.forSeverities ?? [],
    _count: { monitors: overrides.monitorCount ?? 0 },
    createdAt: overrides.createdAt ?? new Date('2024-01-01T00:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2024-06-01T00:00:00Z'),
  };
}

function makeReq(userId = 'user-1') {
  return { user: { id: userId } } as Parameters<V2PlaybooksController['list']>[0];
}

describe('V2PlaybooksController', () => {
  let controller: V2PlaybooksController;
  let prisma: { incidentPlaybook: { findMany: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    prisma = { incidentPlaybook: { findMany: vi.fn() } };
    controller = new V2PlaybooksController(prisma as never);
  });

  it('returns empty list with correct meta when no playbooks', async () => {
    prisma.incidentPlaybook.findMany.mockResolvedValue([]);
    const result = await controller.list(makeReq(), {});
    expect(result.data).toEqual([]);
    expect(result.meta).toEqual({ total: 0, page: 1, limit: 20, pages: 0 });
  });

  it('maps playbook fields correctly including derived stepCount + monitorCount', async () => {
    const pb = makePlaybook({
      id: 'pb-x',
      name: 'Test Playbook',
      description: 'desc',
      steps: [{ order: 1, text: 'A' }, { order: 2, text: 'B' }],
      forSeverities: ['CRITICAL', 'HIGH'],
      monitorCount: 3,
    });
    prisma.incidentPlaybook.findMany.mockResolvedValue([pb]);
    const result = await controller.list(makeReq(), {});
    const item = result.data[0];
    expect(item.id).toBe('pb-x');
    expect(item.name).toBe('Test Playbook');
    expect(item.description).toBe('desc');
    expect(item.stepCount).toBe(2);
    expect(item.monitorCount).toBe(3);
    expect(item.forSeverities).toEqual(['CRITICAL', 'HIGH']);
    expect(item.createdAt).toBe(pb.createdAt.toISOString());
    expect(item.updatedAt).toBe(pb.updatedAt.toISOString());
  });

  it('returns description as null when missing', async () => {
    prisma.incidentPlaybook.findMany.mockResolvedValue([makePlaybook({ description: null })]);
    const result = await controller.list(makeReq(), {});
    expect(result.data[0].description).toBeNull();
  });

  it('stepCount is 0 when steps array is empty', async () => {
    prisma.incidentPlaybook.findMany.mockResolvedValue([makePlaybook({ steps: [] })]);
    const result = await controller.list(makeReq(), {});
    expect(result.data[0].stepCount).toBe(0);
  });

  it('pagination: page=2 limit=1 returns second item', async () => {
    const pb1 = makePlaybook({ id: 'pb-1', name: 'Alpha', updatedAt: new Date('2024-01-01') });
    const pb2 = makePlaybook({ id: 'pb-2', name: 'Beta', updatedAt: new Date('2024-01-02') });
    // sorted by updatedAt desc by default → pb2 first, pb1 second
    prisma.incidentPlaybook.findMany.mockResolvedValue([pb1, pb2]);
    const result = await controller.list(makeReq(), { page: 2, limit: 1 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('pb-1');
    expect(result.meta.total).toBe(2);
    expect(result.meta.pages).toBe(2);
  });

  it('default sort is updatedAt desc (most recently updated first)', async () => {
    const older = makePlaybook({ id: 'pb-old', name: 'Old', updatedAt: new Date('2024-01-01') });
    const newer = makePlaybook({ id: 'pb-new', name: 'New', updatedAt: new Date('2024-06-01') });
    prisma.incidentPlaybook.findMany.mockResolvedValue([older, newer]);
    const result = await controller.list(makeReq(), {});
    expect(result.data[0].id).toBe('pb-new');
    expect(result.data[1].id).toBe('pb-old');
  });

  it('sortBy=name asc orders alphabetically', async () => {
    const a = makePlaybook({ id: 'a', name: 'Zebra' });
    const b = makePlaybook({ id: 'b', name: 'Apple' });
    prisma.incidentPlaybook.findMany.mockResolvedValue([a, b]);
    const result = await controller.list(makeReq(), { sortBy: 'name', sortDir: 'asc' });
    expect(result.data.map(x => x.name)).toEqual(['Apple', 'Zebra']);
  });

  it('sortBy=name desc reverses alphabetical', async () => {
    const a = makePlaybook({ id: 'a', name: 'Zebra' });
    const b = makePlaybook({ id: 'b', name: 'Apple' });
    prisma.incidentPlaybook.findMany.mockResolvedValue([a, b]);
    const result = await controller.list(makeReq(), { sortBy: 'name', sortDir: 'desc' });
    expect(result.data.map(x => x.name)).toEqual(['Zebra', 'Apple']);
  });

  it('sortBy=stepCount asc puts fewer-step playbooks first', async () => {
    const many = makePlaybook({ id: 'many', steps: [1, 2, 3, 4, 5].map(i => ({ order: i, text: `s${i}` })) });
    const few = makePlaybook({ id: 'few', steps: [{ order: 1, text: 'only' }] });
    prisma.incidentPlaybook.findMany.mockResolvedValue([many, few]);
    const result = await controller.list(makeReq(), { sortBy: 'stepCount', sortDir: 'asc' });
    expect(result.data[0].stepCount).toBe(1);
    expect(result.data[1].stepCount).toBe(5);
  });

  it('sortBy=monitorCount desc puts most-used playbooks first', async () => {
    const high = makePlaybook({ id: 'high', monitorCount: 10 });
    const low = makePlaybook({ id: 'low', monitorCount: 1 });
    prisma.incidentPlaybook.findMany.mockResolvedValue([low, high]);
    const result = await controller.list(makeReq(), { sortBy: 'monitorCount', sortDir: 'desc' });
    expect(result.data[0].monitorCount).toBe(10);
    expect(result.data[1].monitorCount).toBe(1);
  });

  it('sortBy=createdAt asc sorts by creation date', async () => {
    const old = makePlaybook({ id: 'old', createdAt: new Date('2023-01-01') });
    const fresh = makePlaybook({ id: 'fresh', createdAt: new Date('2024-01-01') });
    prisma.incidentPlaybook.findMany.mockResolvedValue([fresh, old]);
    const result = await controller.list(makeReq(), { sortBy: 'createdAt', sortDir: 'asc' });
    expect(result.data[0].id).toBe('old');
    expect(result.data[1].id).toBe('fresh');
  });

  it('severity filter keeps only playbooks with matching severity (case-insensitive)', async () => {
    const critical = makePlaybook({ id: 'crit', forSeverities: ['CRITICAL', 'HIGH'] });
    const low = makePlaybook({ id: 'low', forSeverities: ['LOW'] });
    const none = makePlaybook({ id: 'none', forSeverities: [] });
    prisma.incidentPlaybook.findMany.mockResolvedValue([critical, low, none]);
    const result = await controller.list(makeReq(), { severity: 'critical' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('crit');
  });

  it('severity filter is case-insensitive (uppercase input)', async () => {
    const pb = makePlaybook({ id: 'pb', forSeverities: ['high'] });
    prisma.incidentPlaybook.findMany.mockResolvedValue([pb]);
    const result = await controller.list(makeReq(), { severity: 'HIGH' });
    expect(result.data).toHaveLength(1);
  });

  it('severity filter returns empty when no match', async () => {
    const pb = makePlaybook({ forSeverities: ['CRITICAL'] });
    prisma.incidentPlaybook.findMany.mockResolvedValue([pb]);
    const result = await controller.list(makeReq(), { severity: 'LOW' });
    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
  });

  it('passes userId isolation to prisma where clause', async () => {
    prisma.incidentPlaybook.findMany.mockResolvedValue([]);
    await controller.list(makeReq('user-42'), {});
    const callArgs = prisma.incidentPlaybook.findMany.mock.calls[0][0];
    expect(callArgs.where.userId).toBe('user-42');
  });

  it('meta.pages rounds up correctly (ceil)', async () => {
    const playbooks = Array.from({ length: 3 }, (_, i) => makePlaybook({ id: `pb-${i}` }));
    prisma.incidentPlaybook.findMany.mockResolvedValue(playbooks);
    const result = await controller.list(makeReq(), { limit: 2 });
    expect(result.meta.pages).toBe(2); // ceil(3/2) = 2
    expect(result.meta.total).toBe(3);
  });

  it('limit defaults to 20 and is capped at 100', async () => {
    prisma.incidentPlaybook.findMany.mockResolvedValue([]);
    await controller.list(makeReq(), {});
    // meta.limit should be 20
    const result = await controller.list(makeReq(), {});
    expect(result.meta.limit).toBe(20);

    // Requesting >100 should be capped in the controller
    const result2 = await controller.list(makeReq(), { limit: 999 });
    expect(result2.meta.limit).toBe(100);
  });
});
