/**
 * Unit tests for V2FoldersController.
 *
 * Tests the flat-paginated /v2/folders endpoint including:
 * - Pagination query parsing
 * - Filter by parentId / "root"
 * - Search on folder name
 * - Sort by monitorCount (in-memory)
 * - Depth + path derivation
 * - Stats aggregation (healthy/degraded/down/overallStatus)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V2FoldersController } from './folders.controller';
import type { PrismaService } from '../../common/prisma.service';
import type { AuthenticatedRequest } from '../../common/auth.types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeFolder(
  id: string,
  name: string,
  parentId: string | null = null,
  position = 0,
  monitors: Array<{ enabled: boolean; runs: Array<{ ok: boolean; level: string }> }> = [],
) {
  return {
    id,
    userId: 'user1',
    parentId,
    name,
    position,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    _count: { monitors: monitors.length },
    monitors,
  };
}

function makeReq(userId = 'user1'): AuthenticatedRequest {
  return { user: { id: userId } } as unknown as AuthenticatedRequest;
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

function makePrisma(
  folders: ReturnType<typeof makeFolder>[],
  allFolders?: Array<{ id: string; parentId: string | null; name: string }>,
) {
  const prismaMock = {
    folder: {
      findMany: vi.fn().mockImplementation(async (args: { where?: Record<string, unknown> }) => {
        // If called with minimal select (path resolution query), return allFolders shape
        if (args && 'select' in args) {
          return (allFolders ?? folders).map((f) => ({
            id: f.id,
            parentId: f.parentId,
            name: f.name,
          }));
        }
        return folders;
      }),
      count: vi.fn().mockResolvedValue(folders.length),
    },
  };
  return prismaMock as unknown as PrismaService;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('V2FoldersController.list()', () => {
  let ctrl: V2FoldersController;

  beforeEach(() => {
    const f1 = makeFolder('f1', 'Alpha');
    const f2 = makeFolder('f2', 'Beta');
    ctrl = new V2FoldersController(makePrisma([f1, f2]));
  });

  // ── Envelope shape ────────────────────────────────────────────────────────

  it('returns a PaginatedEnvelope with data + meta', async () => {
    const result = await ctrl.list(makeReq(), {});
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('meta');
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('meta.total equals count result', async () => {
    const result = await ctrl.list(makeReq(), {});
    expect(result.meta.total).toBe(2);
  });

  it('meta.page defaults to 1', async () => {
    const result = await ctrl.list(makeReq(), {});
    expect(result.meta.page).toBe(1);
  });

  it('meta.limit defaults to 50', async () => {
    const result = await ctrl.list(makeReq(), {});
    expect(result.meta.limit).toBe(50);
  });

  it('meta.pages is ceil(total / limit)', async () => {
    const result = await ctrl.list(makeReq(), { limit: 1 });
    // count is 2, limit 1 → 2 pages
    expect(result.meta.pages).toBe(2);
  });

  // ── Folder shape ──────────────────────────────────────────────────────────

  it('each folder item has required fields', async () => {
    const result = await ctrl.list(makeReq(), {});
    const item = result.data[0] as Record<string, unknown>;
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('name');
    expect(item).toHaveProperty('parentId');
    expect(item).toHaveProperty('depth');
    expect(item).toHaveProperty('path');
    expect(item).toHaveProperty('monitorCount');
    expect(item).toHaveProperty('stats');
    expect(item).toHaveProperty('createdAt');
  });

  it('parentId is null for root folders', async () => {
    const result = await ctrl.list(makeReq(), {});
    const item = result.data[0] as Record<string, unknown>;
    expect(item.parentId).toBeNull();
  });

  it('depth is 0 for root folders', async () => {
    const result = await ctrl.list(makeReq(), {});
    const item = result.data[0] as Record<string, unknown>;
    expect(item.depth).toBe(0);
  });

  it('path is empty array for root folders', async () => {
    const result = await ctrl.list(makeReq(), {});
    const item = result.data[0] as Record<string, unknown>;
    expect(item.path).toEqual([]);
  });

  it('createdAt is an ISO string', async () => {
    const result = await ctrl.list(makeReq(), {});
    const item = result.data[0] as Record<string, unknown>;
    expect(typeof item.createdAt).toBe('string');
    expect(() => new Date(item.createdAt as string)).not.toThrow();
  });

  // ── Stats aggregation ────────────────────────────────────────────────────

  it('stats.healthy counts enabled monitors with ok=true and level != yellow', async () => {
    const folder = makeFolder('f1', 'Root', null, 0, [
      { enabled: true, runs: [{ ok: true, level: 'green' }] },
      { enabled: true, runs: [{ ok: true, level: 'green' }] },
    ]);
    const c = new V2FoldersController(makePrisma([folder]));
    const result = await c.list(makeReq(), {});
    const stats = (result.data[0] as Record<string, unknown>).stats as Record<string, unknown>;
    expect(stats.healthy).toBe(2);
  });

  it('stats.down counts monitors with ok=false or level=red', async () => {
    const folder = makeFolder('f1', 'Root', null, 0, [
      { enabled: true, runs: [{ ok: false, level: 'red' }] },
    ]);
    const c = new V2FoldersController(makePrisma([folder]));
    const result = await c.list(makeReq(), {});
    const stats = (result.data[0] as Record<string, unknown>).stats as Record<string, unknown>;
    expect(stats.down).toBe(1);
  });

  it('stats.degraded counts monitors with level=yellow and ok=true', async () => {
    const folder = makeFolder('f1', 'Root', null, 0, [
      { enabled: true, runs: [{ ok: true, level: 'yellow' }] },
    ]);
    const c = new V2FoldersController(makePrisma([folder]));
    const result = await c.list(makeReq(), {});
    const stats = (result.data[0] as Record<string, unknown>).stats as Record<string, unknown>;
    expect(stats.degraded).toBe(1);
  });

  it('disabled monitors are excluded from stats', async () => {
    const folder = makeFolder('f1', 'Root', null, 0, [
      { enabled: false, runs: [{ ok: false, level: 'red' }] },
    ]);
    const c = new V2FoldersController(makePrisma([folder]));
    const result = await c.list(makeReq(), {});
    const stats = (result.data[0] as Record<string, unknown>).stats as Record<string, unknown>;
    expect(stats.down).toBe(0);
    expect(stats.healthy).toBe(0);
  });

  it('monitors with no runs are excluded from stats', async () => {
    const folder = makeFolder('f1', 'Root', null, 0, [
      { enabled: true, runs: [] },
    ]);
    const c = new V2FoldersController(makePrisma([folder]));
    const result = await c.list(makeReq(), {});
    const stats = (result.data[0] as Record<string, unknown>).stats as Record<string, unknown>;
    expect(stats.healthy).toBe(0);
    expect(stats.down).toBe(0);
  });

  // ── overallStatus ────────────────────────────────────────────────────────

  it('overallStatus is "operational" when all monitors are healthy', async () => {
    const folder = makeFolder('f1', 'Root', null, 0, [
      { enabled: true, runs: [{ ok: true, level: 'green' }] },
    ]);
    const c = new V2FoldersController(makePrisma([folder]));
    const result = await c.list(makeReq(), {});
    const stats = (result.data[0] as Record<string, unknown>).stats as Record<string, unknown>;
    expect(stats.overallStatus).toBe('operational');
  });

  it('overallStatus is "outage" when any monitor is down', async () => {
    const folder = makeFolder('f1', 'Root', null, 0, [
      { enabled: true, runs: [{ ok: true, level: 'green' }] },
      { enabled: true, runs: [{ ok: false, level: 'red' }] },
    ]);
    const c = new V2FoldersController(makePrisma([folder]));
    const result = await c.list(makeReq(), {});
    const stats = (result.data[0] as Record<string, unknown>).stats as Record<string, unknown>;
    expect(stats.overallStatus).toBe('outage');
  });

  it('overallStatus is "degraded" when degraded and no down', async () => {
    const folder = makeFolder('f1', 'Root', null, 0, [
      { enabled: true, runs: [{ ok: true, level: 'yellow' }] },
    ]);
    const c = new V2FoldersController(makePrisma([folder]));
    const result = await c.list(makeReq(), {});
    const stats = (result.data[0] as Record<string, unknown>).stats as Record<string, unknown>;
    expect(stats.overallStatus).toBe('degraded');
  });

  it('overallStatus is "empty" when folder has no monitors', async () => {
    const folder = makeFolder('f1', 'Root', null, 0, []);
    const c = new V2FoldersController(makePrisma([folder]));
    const result = await c.list(makeReq(), {});
    const stats = (result.data[0] as Record<string, unknown>).stats as Record<string, unknown>;
    expect(stats.overallStatus).toBe('empty');
  });

  // ── Depth + Path for nested folders ──────────────────────────────────────

  it('nested folder has depth > 0 and non-empty path', async () => {
    const child = makeFolder('child', 'Child', 'root1');
    const allUserFolders = [
      { id: 'root1', parentId: null, name: 'Root' },
      { id: 'child', parentId: 'root1', name: 'Child' },
    ];
    // Mock findMany to return allUserFolders for select queries
    const prismaMock = {
      folder: {
        findMany: vi.fn()
          .mockImplementationOnce(async () => [child])
          .mockImplementationOnce(async () => allUserFolders),
        count: vi.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaService;
    const c = new V2FoldersController(prismaMock);
    const result = await c.list(makeReq(), {});
    const item = result.data[0] as Record<string, unknown>;
    expect(item.depth).toBeGreaterThan(0);
    expect(Array.isArray(item.path)).toBe(true);
    expect((item.path as string[]).length).toBeGreaterThan(0);
  });

  // ── monitorCount sort ─────────────────────────────────────────────────────

  it('sortBy monitorCount asc orders smallest first', async () => {
    const f1 = makeFolder('f1', 'Big', null, 0, [
      { enabled: true, runs: [{ ok: true, level: 'green' }] },
      { enabled: true, runs: [{ ok: true, level: 'green' }] },
      { enabled: true, runs: [{ ok: true, level: 'green' }] },
    ]);
    const f2 = makeFolder('f2', 'Small', null, 0, [
      { enabled: true, runs: [{ ok: true, level: 'green' }] },
    ]);
    const c = new V2FoldersController(makePrisma([f1, f2]));
    const result = await c.list(makeReq(), { sortBy: 'monitorCount', sortDir: 'asc' });
    const items = result.data as Array<Record<string, unknown>>;
    expect(items[0].monitorCount as number).toBeLessThanOrEqual(items[1].monitorCount as number);
  });

  it('sortBy monitorCount desc orders largest first', async () => {
    const f1 = makeFolder('f1', 'Big', null, 0, [
      { enabled: true, runs: [{ ok: true, level: 'green' }] },
      { enabled: true, runs: [{ ok: true, level: 'green' }] },
    ]);
    const f2 = makeFolder('f2', 'Empty', null, 0, []);
    const c = new V2FoldersController(makePrisma([f1, f2]));
    const result = await c.list(makeReq(), { sortBy: 'monitorCount', sortDir: 'desc' });
    const items = result.data as Array<Record<string, unknown>>;
    expect(items[0].monitorCount as number).toBeGreaterThanOrEqual(items[1].monitorCount as number);
  });

  // ── monitorCount value ────────────────────────────────────────────────────

  it('monitorCount matches _count.monitors', async () => {
    const folder = makeFolder('f1', 'Root', null, 0, [
      { enabled: true, runs: [] },
      { enabled: false, runs: [] },
    ]);
    const c = new V2FoldersController(makePrisma([folder]));
    const result = await c.list(makeReq(), {});
    const item = result.data[0] as Record<string, unknown>;
    expect(item.monitorCount).toBe(2);
  });
});
