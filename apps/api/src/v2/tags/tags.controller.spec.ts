import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V2TagsController } from './tags.controller';
import type { PrismaService } from '../../common/prisma.service';
import type { AuthenticatedRequest } from '../v2.types';
import type { V2ListTagsQuery } from './tags.dto';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeTag(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tag-1',
    name: 'production',
    color: '#ef4444',
    createdAt: new Date('2026-01-01'),
    _count: { monitorTags: 3 },
    ...overrides,
  };
}

function makePrisma(overrides: Partial<PrismaService> = {}): PrismaService {
  return {
    tag: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    ...overrides,
  } as unknown as PrismaService;
}

function makeReq(userId = 'user-1'): AuthenticatedRequest {
  return { user: { id: userId } } as AuthenticatedRequest;
}

function makeQuery(overrides: Partial<V2ListTagsQuery> = {}): V2ListTagsQuery {
  return { page: 1, limit: 20, ...overrides } as V2ListTagsQuery;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('V2TagsController.list()', () => {
  let controller: V2TagsController;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new V2TagsController(prisma);
  });

  it('returns empty paginated response when no tags exist', async () => {
    const result = await controller.list(makeReq(), makeQuery());
    expect(result.data).toEqual([]);
    expect(result.meta).toEqual({ total: 0, page: 1, limit: 20, pages: 0 });
  });

  it('returns tag data with correct shape', async () => {
    const tag = makeTag();
    (prisma.tag.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([tag]);
    (prisma.tag.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const result = await controller.list(makeReq(), makeQuery());

    expect(result.data).toHaveLength(1);
    const item = result.data[0] as Record<string, unknown>;
    expect(item.id).toBe('tag-1');
    expect(item.name).toBe('production');
    expect(item.color).toBe('#ef4444');
    expect(item.monitorCount).toBe(3);
    expect(typeof item.createdAt).toBe('string');
  });

  it('passes through color value as-is', async () => {
    const tag = makeTag({ color: '#10b981' });
    (prisma.tag.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([tag]);
    (prisma.tag.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const result = await controller.list(makeReq(), makeQuery());
    const item = result.data[0] as Record<string, unknown>;
    expect(item.color).toBe('#10b981');
  });

  it('returns pagination meta correctly', async () => {
    (prisma.tag.count as ReturnType<typeof vi.fn>).mockResolvedValue(45);
    (prisma.tag.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await controller.list(makeReq(), makeQuery({ page: 2, limit: 10 }));
    expect(result.meta).toEqual({ total: 45, page: 2, limit: 10, pages: 5 });
  });

  it('passes search filter to prisma where clause', async () => {
    await controller.list(makeReq(), makeQuery({ search: 'prod' }));
    const callArgs = (prisma.tag.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.where.name).toEqual({ contains: 'prod', mode: 'insensitive' });
  });

  it('uses default sort by name asc', async () => {
    await controller.list(makeReq(), makeQuery());
    const callArgs = (prisma.tag.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.orderBy).toEqual({ name: 'asc' });
  });

  it('sorts by createdAt desc when specified', async () => {
    await controller.list(makeReq(), makeQuery({ sortBy: 'createdAt', sortDir: 'desc' }));
    const callArgs = (prisma.tag.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('performs in-memory sort by monitorCount ascending', async () => {
    const tags = [
      makeTag({ id: 't1', name: 'alpha', _count: { monitorTags: 5 } }),
      makeTag({ id: 't2', name: 'beta', _count: { monitorTags: 1 } }),
      makeTag({ id: 't3', name: 'gamma', _count: { monitorTags: 10 } }),
    ];
    (prisma.tag.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(tags);
    (prisma.tag.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);

    const result = await controller.list(makeReq(), makeQuery({ sortBy: 'monitorCount', sortDir: 'asc' }));
    const counts = (result.data as Array<{ monitorCount: number }>).map((t) => t.monitorCount);
    expect(counts).toEqual([1, 5, 10]);
  });

  it('performs in-memory sort by monitorCount descending', async () => {
    const tags = [
      makeTag({ id: 't1', name: 'alpha', _count: { monitorTags: 5 } }),
      makeTag({ id: 't2', name: 'beta', _count: { monitorTags: 1 } }),
      makeTag({ id: 't3', name: 'gamma', _count: { monitorTags: 10 } }),
    ];
    (prisma.tag.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(tags);
    (prisma.tag.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);

    const result = await controller.list(makeReq(), makeQuery({ sortBy: 'monitorCount', sortDir: 'desc' }));
    const counts = (result.data as Array<{ monitorCount: number }>).map((t) => t.monitorCount);
    expect(counts).toEqual([10, 5, 1]);
  });

  it('slices monitorCount-sorted results per page', async () => {
    // 5 tags — request page 2 with limit 2 → should return items 3+4 (0-indexed 2+3)
    const tags = [5, 3, 8, 1, 6].map((count, i) =>
      makeTag({ id: `t${i}`, name: `tag${i}`, _count: { monitorTags: count } }),
    );
    (prisma.tag.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(tags);
    (prisma.tag.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);

    const result = await controller.list(makeReq(), makeQuery({ sortBy: 'monitorCount', sortDir: 'asc', page: 2, limit: 2 }));
    // Sorted asc: 1,3,5,6,8 → page 2 limit 2 → [5,6]
    const counts = (result.data as Array<{ monitorCount: number }>).map((t) => t.monitorCount);
    expect(counts).toEqual([5, 6]);
  });

  it('scopes query to the authenticated user', async () => {
    await controller.list(makeReq('user-abc'), makeQuery());
    const callArgs = (prisma.tag.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.where.userId).toBe('user-abc');
    const countArgs = (prisma.tag.count as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(countArgs.where.userId).toBe('user-abc');
  });

  it('calls findMany with skip/take for non-monitorCount sorts', async () => {
    await controller.list(makeReq(), makeQuery({ page: 3, limit: 5 }));
    const callArgs = (prisma.tag.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.skip).toBe(10); // (page-1)*limit = 2*5
    expect(callArgs.take).toBe(5);
  });

  it('does not pass skip/take for monitorCount sort (fetches all for in-memory sort)', async () => {
    (prisma.tag.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.tag.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    await controller.list(makeReq(), makeQuery({ sortBy: 'monitorCount' }));
    const callArgs = (prisma.tag.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.skip).toBeUndefined();
    expect(callArgs.take).toBeUndefined();
  });

  it('includes _count.monitorTags in findMany include clause', async () => {
    await controller.list(makeReq(), makeQuery());
    const callArgs = (prisma.tag.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.include).toEqual({ _count: { select: { monitorTags: true } } });
  });
});
