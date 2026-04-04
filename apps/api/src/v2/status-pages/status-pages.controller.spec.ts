import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V2StatusPagesController } from './status-pages.controller';
import type { PrismaService } from '../../common/prisma.service';
import type { AuthenticatedRequest } from '../v2.types';
import type { V2ListStatusPagesQuery } from './status-pages.dto';

// ─── helpers ────────────────────────────────────────────────────────────────

function makePrisma(overrides: Partial<PrismaService> = {}): PrismaService {
  return {
    publicStatusPage: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    ...overrides,
  } as unknown as PrismaService;
}

function makeReq(userId = 'user-1'): AuthenticatedRequest {
  return { user: { id: userId } } as AuthenticatedRequest;
}

function makeQuery(overrides: Partial<V2ListStatusPagesQuery & { page?: number; limit?: number }> = {}): V2ListStatusPagesQuery {
  return { page: 1, limit: 20, ...overrides } as V2ListStatusPagesQuery;
}

function makeStatusPage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sp-1',
    slug: 'my-status',
    title: 'My Status Page',
    description: null,
    isPublished: true,
    viewCount: 42,
    lastViewedAt: new Date('2026-04-01T00:00:00Z'),
    passwordHash: null,
    layout: { widgets: [{}, {}, {}] },
    createdAt: new Date('2026-03-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    _count: { subscribers: 5 },
    ...overrides,
  };
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('V2StatusPagesController', () => {
  let controller: V2StatusPagesController;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new V2StatusPagesController(prisma);
  });

  // ─── envelope shape ───────────────────────────────────────────────────────

  describe('list — envelope shape', () => {
    it('returns data array and meta object', async () => {
      const result = await controller.list(makeReq(), makeQuery());
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('meta contains total, page, limit, pages', async () => {
      (prisma.publicStatusPage.count as ReturnType<typeof vi.fn>).mockResolvedValue(50);
      const result = await controller.list(makeReq(), makeQuery({ page: 2, limit: 10 }));
      expect(result.meta).toMatchObject({ total: 50, page: 2, limit: 10, pages: 5 });
    });

    it('returns empty data when no status pages exist', async () => {
      const result = await controller.list(makeReq(), makeQuery());
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });

  // ─── response shape ───────────────────────────────────────────────────────

  describe('list — item shape', () => {
    it('maps status page to expected fields', async () => {
      const sp = makeStatusPage();
      (prisma.publicStatusPage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sp]);
      (prisma.publicStatusPage.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await controller.list(makeReq(), makeQuery());
      const item = (result.data as Record<string, unknown>[])[0];

      expect(item).toMatchObject({
        id: 'sp-1',
        slug: 'my-status',
        title: 'My Status Page',
        isPublished: true,
        viewCount: 42,
        hasPassword: false,
        subscriberCount: 5,
        widgetCount: 3,
      });
    });

    it('derives hasPassword: true when passwordHash is set', async () => {
      const sp = makeStatusPage({ passwordHash: '$bcrypt$...' });
      (prisma.publicStatusPage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sp]);
      (prisma.publicStatusPage.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await controller.list(makeReq(), makeQuery());
      expect((result.data as Record<string, unknown>[])[0].hasPassword).toBe(true);
    });

    it('widgetCount is 0 for empty layout widgets array', async () => {
      const sp = makeStatusPage({ layout: { widgets: [] } });
      (prisma.publicStatusPage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sp]);
      (prisma.publicStatusPage.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await controller.list(makeReq(), makeQuery());
      expect((result.data as Record<string, unknown>[])[0].widgetCount).toBe(0);
    });

    it('widgetCount is 0 when layout has no widgets key', async () => {
      const sp = makeStatusPage({ layout: {} });
      (prisma.publicStatusPage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sp]);
      (prisma.publicStatusPage.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await controller.list(makeReq(), makeQuery());
      expect((result.data as Record<string, unknown>[])[0].widgetCount).toBe(0);
    });

    it('widgetCount is 0 when layout is null', async () => {
      const sp = makeStatusPage({ layout: null });
      (prisma.publicStatusPage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sp]);
      (prisma.publicStatusPage.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await controller.list(makeReq(), makeQuery());
      expect((result.data as Record<string, unknown>[])[0].widgetCount).toBe(0);
    });

    it('lastViewedAt is ISO string when set', async () => {
      const date = new Date('2026-04-01T12:00:00Z');
      const sp = makeStatusPage({ lastViewedAt: date });
      (prisma.publicStatusPage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sp]);
      (prisma.publicStatusPage.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await controller.list(makeReq(), makeQuery());
      expect((result.data as Record<string, unknown>[])[0].lastViewedAt).toBe(date.toISOString());
    });

    it('lastViewedAt is null when not set', async () => {
      const sp = makeStatusPage({ lastViewedAt: null });
      (prisma.publicStatusPage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sp]);
      (prisma.publicStatusPage.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await controller.list(makeReq(), makeQuery());
      expect((result.data as Record<string, unknown>[])[0].lastViewedAt).toBeNull();
    });

    it('does not expose passwordHash, notifyWebhookUrl, or slackWebhookUrl', async () => {
      const sp = {
        ...makeStatusPage({ passwordHash: 'secret-hash' }),
        notifyWebhookUrl: 'https://hooks.example.com/xyz',
        slackWebhookUrl: 'https://hooks.slack.com/services/xxx',
        discordWebhookUrl: 'https://discord.com/api/webhooks/xxx',
      };
      (prisma.publicStatusPage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sp]);
      (prisma.publicStatusPage.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await controller.list(makeReq(), makeQuery());
      const item = (result.data as Record<string, unknown>[])[0];
      expect(item).not.toHaveProperty('passwordHash');
      expect(item).not.toHaveProperty('notifyWebhookUrl');
      expect(item).not.toHaveProperty('slackWebhookUrl');
      expect(item).not.toHaveProperty('discordWebhookUrl');
    });

    it('createdAt and updatedAt are ISO strings', async () => {
      const sp = makeStatusPage();
      (prisma.publicStatusPage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sp]);
      (prisma.publicStatusPage.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await controller.list(makeReq(), makeQuery());
      const item = (result.data as Record<string, unknown>[])[0];
      expect(typeof item.createdAt).toBe('string');
      expect(typeof item.updatedAt).toBe('string');
    });
  });

  // ─── filtering ────────────────────────────────────────────────────────────

  describe('list — filtering', () => {
    it('passes userId as where filter', async () => {
      await controller.list(makeReq('user-42'), makeQuery());
      expect(prisma.publicStatusPage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-42' }) }),
      );
    });

    it('adds isPublished filter when provided', async () => {
      await controller.list(makeReq(), makeQuery({ isPublished: true }));
      expect(prisma.publicStatusPage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isPublished: true }) }),
      );
    });

    it('adds isPublished: false filter when provided as false', async () => {
      await controller.list(makeReq(), makeQuery({ isPublished: false }));
      expect(prisma.publicStatusPage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isPublished: false }) }),
      );
    });

    it('does not add isPublished filter when undefined', async () => {
      await controller.list(makeReq(), makeQuery());
      const call = (prisma.publicStatusPage.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(call.where).not.toHaveProperty('isPublished');
    });

    it('adds OR search filter for title and slug', async () => {
      await controller.list(makeReq(), makeQuery({ search: 'my-page' }));
      const call = (prisma.publicStatusPage.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(call.where).toHaveProperty('OR');
      const or = call.where.OR as { title?: unknown; slug?: unknown }[];
      expect(or[0]).toMatchObject({ title: { contains: 'my-page', mode: 'insensitive' } });
      expect(or[1]).toMatchObject({ slug: { contains: 'my-page', mode: 'insensitive' } });
    });
  });

  // ─── sorting ──────────────────────────────────────────────────────────────

  describe('list — sorting', () => {
    it('defaults to createdAt desc', async () => {
      await controller.list(makeReq(), makeQuery());
      expect(prisma.publicStatusPage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('sorts by viewCount asc when specified', async () => {
      await controller.list(makeReq(), makeQuery({ sortBy: 'viewCount', sortDir: 'asc' }));
      expect(prisma.publicStatusPage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { viewCount: 'asc' } }),
      );
    });

    it('sorts by title asc', async () => {
      await controller.list(makeReq(), makeQuery({ sortBy: 'title', sortDir: 'asc' }));
      expect(prisma.publicStatusPage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { title: 'asc' } }),
      );
    });

    it('sorts by updatedAt desc', async () => {
      await controller.list(makeReq(), makeQuery({ sortBy: 'updatedAt', sortDir: 'desc' }));
      expect(prisma.publicStatusPage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { updatedAt: 'desc' } }),
      );
    });
  });

  // ─── pagination ───────────────────────────────────────────────────────────

  describe('list — pagination', () => {
    it('passes skip and take to findMany', async () => {
      await controller.list(makeReq(), makeQuery({ page: 3, limit: 10 }));
      expect(prisma.publicStatusPage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('meta.pages rounds up correctly', async () => {
      (prisma.publicStatusPage.count as ReturnType<typeof vi.fn>).mockResolvedValue(21);
      const result = await controller.list(makeReq(), makeQuery({ page: 1, limit: 10 }));
      expect(result.meta.pages).toBe(3);
    });

    it('meta.pages is 0 when total is 0', async () => {
      const result = await controller.list(makeReq(), makeQuery());
      // Math.ceil(0/limit) = 0 — buildMeta returns 0 for empty results
      expect(result.meta.pages).toBe(0);
    });
  });
});
