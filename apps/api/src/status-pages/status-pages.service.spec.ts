import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { StatusPagesService } from './status-pages.service';

// ── helpers ──────────────────────────────────────────────────────────────────

function makePage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'page-1',
    userId: 'user-1',
    slug: 'my-status-page',
    title: 'My Status Page',
    description: 'A test status page',
    isPublished: false,
    passwordHash: null,
    layout: { widgets: [] },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    _count: { subscribers: 0 },
    ...overrides,
  };
}

function makeMonitor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mon-1',
    name: 'Test Monitor',
    type: 'HTTP',
    folderId: null,
    folder: null,
    monitorTags: [],
    runs: [
      {
        level: 'green',
        message: 'OK',
        latencyMs: 120,
        checkedAt: new Date('2026-01-01'),
      },
    ],
    ...overrides,
  };
}

function makePrisma(opts: {
  page?: ReturnType<typeof makePage> | null;
  slugConflict?: boolean;
  monitors?: ReturnType<typeof makeMonitor>[];
  runs?: { level: string }[];
} = {}) {
  const page = opts.page !== undefined ? opts.page : makePage();
  const monitors = opts.monitors ?? [makeMonitor()];
  const runs = opts.runs ?? [
    { id: 'run-1', monitorId: 'mon-1', checkedAt: new Date(), ok: true, level: 'green', latencyMs: 100, message: 'OK', monitor: { name: 'Test Monitor' } },
  ];

  return {
    publicStatusPage: {
      findMany: vi.fn().mockResolvedValue(page ? [page] : []),
      findUnique: vi
        .fn()
        // default: return page; if slugConflict use special logic
        .mockImplementation(({ where }: { where: Record<string, string> }) => {
          if (opts.slugConflict && where.slug) return Promise.resolve(makePage());
          return Promise.resolve(page);
        }),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...makePage(),
          title: (data.title as string) ?? 'Title',
          slug: (data.slug as string) ?? 'slug',
          passwordHash: null,
        }),
      ),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...makePage(),
          ...data,
        }),
      ),
      delete: vi.fn().mockResolvedValue(page ?? makePage()),
    },
    monitor: {
      findMany: vi.fn().mockResolvedValue(monitors),
      findFirst: vi.fn().mockResolvedValue(monitors[0] ?? null),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue(runs),
      findFirst: vi.fn().mockResolvedValue(runs.length > 0 ? runs[runs.length - 1] : null),
      count: vi.fn().mockResolvedValue(runs.length),
    },
    incident: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    maintenanceWindow: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    statusPageHistory: {
      create: vi.fn().mockResolvedValue({ id: 'hist-1', statusPageId: 'page-1', savedAt: new Date(), label: null, layout: {} }),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    statusPageSubscriber: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'sub-1', statusPageId: data.statusPageId, email: data.email, unsubscribeToken: 'tok-abc', createdAt: new Date() })
      ),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
}

/** Minimal no-op RedisCacheService stub for tests (cache always misses, writes are no-ops). */
const noCacheService = { get: async () => null, set: async () => {}, invalidatePattern: async () => {}, del: async () => {}, isConnected: () => false } as never;

function makeService(prismaOverride?: ReturnType<typeof makePrisma>) {
  return new StatusPagesService((prismaOverride ?? makePrisma()) as never, {} as never, noCacheService);
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('StatusPagesService', () => {
  let service: StatusPagesService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  // ── findAll() ──────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns pages for the given userId', async () => {
      const result = await service.findAll('user-1');
      expect(prisma.publicStatusPage.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { subscribers: true } } },
      });
      expect(result).toHaveLength(1);
    });

    it('strips passwordHash and adds hasPassword=false', async () => {
      const result = await service.findAll('user-1');
      expect(result[0]).not.toHaveProperty('passwordHash');
      expect(result[0].hasPassword).toBe(false);
    });

    it('sets hasPassword=true when passwordHash present', async () => {
      prisma = makePrisma({ page: makePage({ passwordHash: '$2a$12$hashedpassword' }) });
      service = makeService(prisma);
      const result = await service.findAll('user-1');
      expect(result[0].hasPassword).toBe(true);
      expect(result[0]).not.toHaveProperty('passwordHash');
    });

    it('returns empty array when user has no pages', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      const result = await service.findAll('user-1');
      expect(result).toEqual([]);
    });
  });

  // ── findOne() ──────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns a page for the owner', async () => {
      const result = await service.findOne('user-1', 'page-1');
      expect(result.id).toBe('page-1');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws NotFoundException when page not found', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      await expect(service.findOne('user-1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when page belongs to another user', async () => {
      prisma = makePrisma({ page: makePage({ userId: 'user-2' }) });
      service = makeService(prisma);
      await expect(service.findOne('user-1', 'page-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── create() ──────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates a page with auto-generated slug from title', async () => {
      prisma = makePrisma({ page: null }); // no slug conflict
      service = makeService(prisma);
      const result = await service.create('user-1', { title: 'My New Page' });
      expect(result).not.toHaveProperty('passwordHash');
      expect(prisma.publicStatusPage.create).toHaveBeenCalled();
    });

    it('uses provided slug when given', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      await service.create('user-1', { title: 'Test', slug: 'custom-slug' });
      const callArgs = prisma.publicStatusPage.create.mock.calls[0][0];
      expect(callArgs.data.slug).toBe('custom-slug');
    });

    it('appends timestamp suffix when slug already exists', async () => {
      prisma = makePrisma({ slugConflict: true });
      service = makeService(prisma);
      // findUnique returns existing page (conflict) then null for the id-based calls
      await service.create('user-1', { title: 'Conflict Page' });
      const callArgs = prisma.publicStatusPage.create.mock.calls[0][0];
      // slug should have been modified to avoid conflict
      expect(callArgs.data.slug).not.toBe('conflict-page');
    });

    it('strips passwordHash from returned page', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      const result = await service.create('user-1', { title: 'Test' });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('uses page-<timestamp> slug when title produces empty slug', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      // Empty title → slugify('') returns '' → !slug is true → fallback to page-<ts>
      await service.create('user-1', { title: '' });
      const callArgs = prisma.publicStatusPage.create.mock.calls[0][0];
      expect(callArgs.data.slug).toMatch(/^page-/);
    });

    it('uses emptyLayout when dto.layout is not provided', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      await service.create('user-1', { title: 'No Layout' });
      const callArgs = prisma.publicStatusPage.create.mock.calls[0][0];
      // layout should be the empty layout structure { widgets: [] }
      expect(callArgs.data.layout).toMatchObject({ widgets: [] });
    });
  });

  // ── update() ──────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('throws NotFoundException when page not found', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      await expect(service.update('user-1', 'missing', { title: 'New Title' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException for wrong owner', async () => {
      prisma = makePrisma({ page: makePage({ userId: 'user-2' }) });
      service = makeService(prisma);
      await expect(service.update('user-1', 'page-1', { title: 'New' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('updates title when provided', async () => {
      const result = await service.update('user-1', 'page-1', { title: 'Updated Title' });
      expect(prisma.publicStatusPage.update).toHaveBeenCalled();
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('sets passwordHash to null when removePassword=true', async () => {
      await service.update('user-1', 'page-1', { removePassword: true });
      const callArgs = prisma.publicStatusPage.update.mock.calls[0][0];
      expect(callArgs.data.passwordHash).toBeNull();
    });

    it('sets hashed password when password provided', async () => {
      await service.update('user-1', 'page-1', { password: 'NewSecure@Pass1' });
      const callArgs = prisma.publicStatusPage.update.mock.calls[0][0];
      expect(typeof callArgs.data.passwordHash).toBe('string');
      expect(callArgs.data.passwordHash).not.toBe('NewSecure@Pass1');
    });

    it('returns hasPassword=true when page has passwordHash after update', async () => {
      prisma.publicStatusPage.update = vi.fn().mockResolvedValue(
        makePage({ passwordHash: '$2a$12$somehash' }),
      );
      const result = await service.update('user-1', 'page-1', { title: 'X' });
      expect(result.hasPassword).toBe(true);
    });

    it('updates description when provided', async () => {
      await service.update('user-1', 'page-1', { description: 'New description' });
      const callArgs = prisma.publicStatusPage.update.mock.calls[0][0];
      expect(callArgs.data.description).toBe('New description');
    });

    it('updates layout when provided', async () => {
      const newLayout = { widgets: [{ id: 'w1', type: 'uptime-bar', config: {}, x: 0, y: 0, w: 4, h: 2 }] };
      await service.update('user-1', 'page-1', { layout: newLayout as never });
      const callArgs = prisma.publicStatusPage.update.mock.calls[0][0];
      expect(callArgs.data.layout).toEqual(newLayout);
    });
  });

  // ── publish() ─────────────────────────────────────────────────────────────

  describe('publish()', () => {
    it('throws NotFoundException when page not found', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      await expect(service.publish('user-1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong owner', async () => {
      prisma = makePrisma({ page: makePage({ userId: 'user-2' }) });
      service = makeService(prisma);
      await expect(service.publish('user-1', 'page-1')).rejects.toThrow(ForbiddenException);
    });

    it('toggles isPublished from false to true', async () => {
      await service.publish('user-1', 'page-1');
      expect(prisma.publicStatusPage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isPublished: true }, // page was false, so toggles to true
        }),
      );
    });

    it('toggles isPublished from true to false', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      service = makeService(prisma);
      await service.publish('user-1', 'page-1');
      expect(prisma.publicStatusPage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isPublished: false },
        }),
      );
    });

    it('strips passwordHash from returned page', async () => {
      const result = await service.publish('user-1', 'page-1');
      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  // ── remove() ──────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('throws NotFoundException when page not found', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      await expect(service.remove('user-1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong owner', async () => {
      prisma = makePrisma({ page: makePage({ userId: 'user-2' }) });
      service = makeService(prisma);
      await expect(service.remove('user-1', 'page-1')).rejects.toThrow(ForbiddenException);
    });

    it('deletes the page and returns { deleted: true }', async () => {
      const result = await service.remove('user-1', 'page-1');
      expect(prisma.publicStatusPage.delete).toHaveBeenCalledWith({ where: { id: 'page-1' } });
      expect(result).toEqual({ deleted: true });
    });
  });

  // ── findPublic() ──────────────────────────────────────────────────────────

  describe('findPublic()', () => {
    it('throws NotFoundException when page not found', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      await expect(service.findPublic('missing-slug')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when page is not published', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: false }) });
      service = makeService(prisma);
      await expect(service.findPublic('my-status-page')).rejects.toThrow(NotFoundException);
    });

    it('returns page data with monitors when published and no password', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      service = makeService(prisma);
      const result = await service.findPublic('my-status-page');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.monitors).toBeDefined();
      expect(Array.isArray(result.monitors)).toBe(true);
    });

    it('throws ForbiddenException when password not provided for protected page', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      prisma = makePrisma({
        page: makePage({ isPublished: true, passwordHash: '$2a$12$fakehash' }),
      });
      service = makeService(prisma);
      await expect(service.findPublic('my-status-page')).rejects.toThrow(ForbiddenException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const realBcrypt = await import('bcryptjs');
      const hash = await realBcrypt.hash('correct-password', 12);
      prisma = makePrisma({
        page: makePage({ isPublished: true, passwordHash: hash }),
      });
      service = makeService(prisma);
      await expect(service.findPublic('my-status-page', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns data with correct password', async () => {
      const realBcrypt = await import('bcryptjs');
      const hash = await realBcrypt.hash('correct-password', 12);
      prisma = makePrisma({
        page: makePage({ isPublished: true, passwordHash: hash }),
      });
      service = makeService(prisma);
      const result = await service.findPublic('my-status-page', 'correct-password');
      expect(result.monitors).toBeDefined();
    });

    it('maps monitors correctly including null last run', async () => {
      prisma = makePrisma({
        page: makePage({ isPublished: true }),
        monitors: [makeMonitor({ runs: [] })],
      });
      service = makeService(prisma);
      const result = await service.findPublic('my-status-page');
      expect(result.monitors[0].level).toBe('green');
      expect(result.monitors[0].lastChecked).toBeNull();
    });

    it('maps monitor tags from monitorTags relation', async () => {
      prisma = makePrisma({
        page: makePage({ isPublished: true }),
        monitors: [makeMonitor({ monitorTags: [{ tag: { name: 'production' } }, { tag: { name: 'api' } }] })],
      });
      service = makeService(prisma);
      const result = await service.findPublic('my-status-page');
      expect(result.monitors[0].tags).toEqual(['production', 'api']);
    });

    it('maps incidents with updates and monitor links', async () => {
      const page = makePage({ isPublished: true });
      prisma = makePrisma({ page });
      prisma.incident.findMany = vi.fn().mockResolvedValue([
        {
          id: 'inc-1',
          title: 'API Down',
          status: 'investigating',
          severity: 'critical',
          createdAt: new Date('2026-03-01'),
          resolvedAt: null,
          updates: [{ id: 'upd-1', body: 'Looking into it', status: 'investigating', createdAt: new Date('2026-03-01') }],
          monitors: [{ monitor: { id: 'mon-1', name: 'API Monitor' } }],
        },
      ]);
      service = makeService(prisma);
      const result = await service.findPublic('my-status-page');
      expect(result.incidents).toHaveLength(1);
      expect(result.incidents[0].title).toBe('API Down');
      expect(result.incidents[0].updates[0].message).toBe('Looking into it');
      expect(result.incidents[0].monitors[0].name).toBe('API Monitor');
    });

    it('maps maintenance windows with monitor links', async () => {
      const page = makePage({ isPublished: true });
      prisma = makePrisma({ page });
      prisma.maintenanceWindow.findMany = vi.fn().mockResolvedValue([
        {
          id: 'mw-1',
          name: 'DB Maintenance',
          description: 'Scheduled downtime',
          startsAt: new Date('2026-04-01T00:00:00Z'),
          endsAt: new Date('2026-04-01T02:00:00Z'),
          monitors: [{ monitor: { id: 'mon-1', name: 'DB Monitor' } }],
        },
      ]);
      service = makeService(prisma);
      const result = await service.findPublic('my-status-page');
      expect(result.maintenance).toHaveLength(1);
      expect(result.maintenance[0].name).toBe('DB Maintenance');
      expect(result.maintenance[0].monitors[0].name).toBe('DB Monitor');
    });

    it('maps recentChecks with monitor name', async () => {
      const page = makePage({ isPublished: true });
      prisma = makePrisma({ page });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        {
          id: 'run-1',
          monitorId: 'mon-1',
          checkedAt: new Date('2026-03-17'),
          ok: true,
          level: 'green',
          latencyMs: 55,
          message: 'OK',
          monitor: { name: 'Web Monitor' },
        },
      ]);
      service = makeService(prisma);
      const result = await service.findPublic('my-status-page');
      expect(result.recentChecks).toHaveLength(1);
      expect(result.recentChecks[0].monitorName).toBe('Web Monitor');
      expect(result.recentChecks[0].latencyMs).toBe(55);
    });
  });

  // ── getWidgetData() ───────────────────────────────────────────────────────

  describe('getWidgetData()', () => {
    it('throws NotFoundException when page not found or not published', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      await expect(service.getWidgetData('missing-slug', 'widget-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for non-existent widget', async () => {
      prisma = makePrisma({
        page: makePage({ isPublished: true, layout: { widgets: [] } }),
      });
      service = makeService(prisma);
      await expect(service.getWidgetData('my-status-page', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('resolves uptime-bar widget data', async () => {
      const layout = {
        widgets: [
          {
            id: 'w1',
            type: 'uptime-bar',
            config: { monitorId: 'mon-1', periodDays: 7 },
            x: 0,
            y: 0,
            w: 4,
            h: 2,
          },
        ],
      };
      prisma = makePrisma({
        page: makePage({ isPublished: true, layout }),
        runs: [{ level: 'green' }, { level: 'green' }, { level: 'red' }],
      });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'w1');
      expect(result).toHaveProperty('uptimePct');
      expect(result.monitorId).toBe('mon-1');
      expect(result.periodDays).toBe(7);
    });

    it('returns _noConfig for uptime-bar without monitorId', async () => {
      const layout = {
        widgets: [
          {
            id: 'w1',
            type: 'uptime-bar',
            config: {},
            x: 0,
            y: 0,
            w: 4,
            h: 2,
          },
        ],
      };
      prisma = makePrisma({
        page: makePage({ isPublished: true, layout }),
      });
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'w1');
      expect(_result).toMatchObject({ _noConfig: true });
    });

    it('resolves current-status-badge widget data', async () => {
      const layout = {
        widgets: [
          {
            id: 'w2',
            type: 'current-status-badge',
            config: { monitorId: 'mon-1' },
            x: 0,
            y: 0,
            w: 4,
            h: 2,
          },
        ],
      };
      prisma = makePrisma({
        page: makePage({ isPublished: true, layout }),
        monitors: [makeMonitor()],
      });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'w2');
      expect(result).toHaveProperty('level');
      expect(result.monitorId).toBe('mon-1');
    });

    it('returns _noConfig for current-status-badge without monitorId', async () => {
      const layout = {
        widgets: [
          {
            id: 'w2',
            type: 'current-status-badge',
            config: {},
            x: 0,
            y: 0,
            w: 4,
            h: 2,
          },
        ],
      };
      prisma = makePrisma({
        page: makePage({ isPublished: true, layout }),
      });
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'w2');
      expect(_result).toMatchObject({ _noConfig: true });
    });

    it('throws NotFoundException for current-status-badge when monitor not found', async () => {
      const layout = {
        widgets: [
          {
            id: 'w2',
            type: 'current-status-badge',
            config: { monitorId: 'mon-999' },
            x: 0,
            y: 0,
            w: 4,
            h: 2,
          },
        ],
      };
      prisma = makePrisma({
        page: makePage({ isPublished: true, layout }),
        monitors: [],
      });
      prisma.monitor.findFirst = vi.fn().mockResolvedValue(null);
      service = makeService(prisma);
      await expect(service.getWidgetData('my-status-page', 'w2')).rejects.toThrow(NotFoundException);
    });

    it('resolves overall-system-status widget data', async () => {
      const layout = {
        widgets: [
          {
            id: 'w3',
            type: 'overall-system-status',
            config: {},
            x: 0,
            y: 0,
            w: 12,
            h: 2,
          },
        ],
      };
      prisma = makePrisma({
        page: makePage({ isPublished: true, layout }),
        monitors: [
          makeMonitor({ runs: [{ level: 'green', message: 'OK', latencyMs: 100, checkedAt: new Date() }] }),
          makeMonitor({ id: 'mon-2', name: 'Down Monitor', runs: [{ level: 'red', message: 'Down', latencyMs: null, checkedAt: new Date() }] }),
        ],
      });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'w3');
      expect(result.status).toBe('outage');
      expect(result.monitorsDown).toBe(1);
    });

    it('returns default data for unimplemented widget types', async () => {
      const layout = {
        widgets: [
          {
            id: 'w4',
            type: 'custom-unknown-type',
            config: {},
            x: 0,
            y: 0,
            w: 4,
            h: 2,
          },
        ],
      };
      prisma = makePrisma({
        page: makePage({ isPublished: true, layout }),
      });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'w4');
      expect(result.widgetType).toBe('custom-unknown-type');
    });

    it('overall-system-status returns degraded when only yellow monitors', async () => {
      const layout = { widgets: [{ id: 'w3', type: 'overall-system-status', config: {}, x: 0, y: 0, w: 12, h: 2 }] };
      prisma = makePrisma({
        page: makePage({ isPublished: true, layout }),
        monitors: [
          makeMonitor({ runs: [{ level: 'yellow', message: 'Slow', latencyMs: 2000, checkedAt: new Date() }] }),
        ],
      });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'w3');
      expect(result.status).toBe('degraded');
      expect(result.monitorsDegraded).toBe(1);
      expect(result.monitorsDown).toBe(0);
    });

    it('overall-system-status returns operational when all monitors green', async () => {
      const layout = { widgets: [{ id: 'w3', type: 'overall-system-status', config: {}, x: 0, y: 0, w: 12, h: 2 }] };
      prisma = makePrisma({
        page: makePage({ isPublished: true, layout }),
        monitors: [
          makeMonitor({ runs: [{ level: 'green', message: 'OK', latencyMs: 50, checkedAt: new Date() }] }),
        ],
      });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'w3');
      expect(result.status).toBe('operational');
    });

    it('current-status-badge returns green with null lastChecked when monitor has no runs', async () => {
      const layout = { widgets: [{ id: 'w2', type: 'current-status-badge', config: { monitorId: 'mon-1' }, x: 0, y: 0, w: 4, h: 2 }] };
      prisma = makePrisma({
        page: makePage({ isPublished: true, layout }),
        monitors: [makeMonitor({ runs: [] })],
      });
      // monitor.findFirst returns monitor with no runs
      prisma.monitor.findFirst = vi.fn().mockResolvedValue(makeMonitor({ runs: [] }));
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'w2');
      expect(result.level).toBe('green');
      expect(result.lastChecked).toBeNull();
      expect(result.latencyMs).toBeNull();
    });

    it('calculates uptimePct=100 when no runs exist', async () => {
      const layout = {
        widgets: [
          {
            id: 'w1',
            type: 'uptime-bar',
            config: { monitorId: 'mon-1' },
            x: 0,
            y: 0,
            w: 4,
            h: 2,
          },
        ],
      };
      prisma = makePrisma({
        page: makePage({ isPublished: true, layout }),
        runs: [],
      });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'w1');
      expect(result.uptimePct).toBe(100);
    });

    it('throws UnauthorizedException for password-protected page with no password', async () => {
      const layout = {
        widgets: [{ id: 'w1', type: 'uptime-bar', config: { monitorId: 'mon-1' }, x: 0, y: 0, w: 4, h: 2 }],
      };
      prisma = makePrisma({
        page: makePage({ isPublished: true, passwordHash: '$2a$12$fakehash', layout }),
      });
      service = makeService(prisma);
      await expect(service.getWidgetData('my-status-page', 'w1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for password-protected page with wrong password', async () => {
      const realBcrypt = await import('bcryptjs');
      const hash = await realBcrypt.hash('correct-password', 12);
      const layout = {
        widgets: [{ id: 'w1', type: 'uptime-bar', config: { monitorId: 'mon-1' }, x: 0, y: 0, w: 4, h: 2 }],
      };
      prisma = makePrisma({
        page: makePage({ isPublished: true, passwordHash: hash, layout }),
        runs: [{ level: 'green' }],
      });
      service = makeService(prisma);
      await expect(service.getWidgetData('my-status-page', 'w1', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns widget data for password-protected page with correct password', async () => {
      const realBcrypt = await import('bcryptjs');
      const hash = await realBcrypt.hash('correct-password', 12);
      const layout = {
        widgets: [{ id: 'w1', type: 'uptime-bar', config: { monitorId: 'mon-1', periodDays: 7 }, x: 0, y: 0, w: 4, h: 2 }],
      };
      prisma = makePrisma({
        page: makePage({ isPublished: true, passwordHash: hash, layout }),
        runs: [{ level: 'green' }, { level: 'green' }],
      });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'w1', 'correct-password');
      expect(result).toHaveProperty('uptimePct');
      expect(result.uptimePct).toBe(100);
    });

    it('throws NotFoundException when page is not published (getWidgetData)', async () => {
      prisma = makePrisma({
        page: makePage({ isPublished: false }),
      });
      service = makeService(prisma);
      await expect(service.getWidgetData('my-status-page', 'w1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('uptime-timeline returns timeline with correct level for all-green day', async () => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const layout = {
        widgets: [{ id: 'wt1', type: 'uptime-timeline', config: { monitorId: 'mon-1', days: 7 }, x: 0, y: 0, w: 12, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { level: 'green', checkedAt: today },
        { level: 'green', checkedAt: today },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'wt1');
      expect(result.days).toBe(7);
      expect(Array.isArray(result.timeline)).toBe(true);
      const timeline = result.timeline as Array<{ date: string; level: string }>;
      expect(timeline).toHaveLength(7);
      const todayKey = today.toISOString().slice(0, 10);
      const todayEntry = timeline.find((t) => t.date === todayKey);
      expect(todayEntry?.level).toBe('green');
    });

    it('uptime-timeline marks day as red when majority of checks failed', async () => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const layout = {
        widgets: [{ id: 'wt2', type: 'uptime-timeline', config: { monitorId: 'mon-1', days: 7 }, x: 0, y: 0, w: 12, h: 2 }],
      };
      const runsForToday = [
        { level: 'red', checkedAt: today },
        { level: 'red', checkedAt: today },
        { level: 'green', checkedAt: today },
      ];
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue(runsForToday);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'wt2');
      const timeline = result.timeline as Array<{ date: string; level: string }>;
      const todayKey = today.toISOString().slice(0, 10);
      const todayEntry = timeline.find((t) => t.date === todayKey);
      expect(todayEntry?.level).toBe('red');
    });

    it('uptime-timeline marks day as yellow when minority of checks failed', async () => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const layout = {
        widgets: [{ id: 'wt3', type: 'uptime-timeline', config: { monitorId: 'mon-1', days: 7 }, x: 0, y: 0, w: 12, h: 2 }],
      };
      const runsForToday = [
        { level: 'red', checkedAt: today },
        { level: 'green', checkedAt: today },
        { level: 'green', checkedAt: today },
        { level: 'green', checkedAt: today },
      ];
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue(runsForToday);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'wt3');
      const timeline = result.timeline as Array<{ date: string; level: string }>;
      const todayKey = today.toISOString().slice(0, 10);
      const todayEntry = timeline.find((t) => t.date === todayKey);
      expect(todayEntry?.level).toBe('yellow');
    });

    it('uptime-timeline returns no-data for days with no runs', async () => {
      const layout = {
        widgets: [{ id: 'wt4', type: 'uptime-timeline', config: { monitorId: 'mon-1', days: 7 }, x: 0, y: 0, w: 12, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'wt4');
      const timeline = result.timeline as Array<{ date: string; level: string }>;
      expect(timeline.every((t) => t.level === 'no-data')).toBe(true);
    });

    it('uptime-timeline returns _noConfig without monitorId', async () => {
      const layout = {
        widgets: [{ id: 'wt5', type: 'uptime-timeline', config: {}, x: 0, y: 0, w: 12, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'wt5');
      expect(_result).toMatchObject({ _noConfig: true });
    });
  });

  describe('getWidgetData — response-time-chart', () => {
    it('returns dataPoints with avgMs, p95Ms, maxMs from MonitorRun latencyMs', async () => {
      const now = new Date();
      const runs = [
        { checkedAt: new Date(now.getTime() - 5000), latencyMs: 100, level: 'green' },
        { checkedAt: new Date(now.getTime() - 4000), latencyMs: 200, level: 'green' },
        { checkedAt: new Date(now.getTime() - 3000), latencyMs: 300, level: 'green' },
        { checkedAt: new Date(now.getTime() - 2000), latencyMs: 400, level: 'red' },
        { checkedAt: new Date(now.getTime() - 1000), latencyMs: 500, level: 'green' },
      ];
      const layout = {
        widgets: [{ id: 'rt1', type: 'response-time-chart', config: { monitorId: 'mon-1', points: 5 }, x: 0, y: 0, w: 12, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([...runs].reverse()); // desc order from DB
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'rt1');
      expect(result.monitorId).toBe('mon-1');
      const dp = result.dataPoints as Array<{ t: string; ms: number | null; ok: boolean }>;
      expect(dp).toHaveLength(5);
      expect(dp[0].ms).toBe(100);
      expect(dp[3].ok).toBe(false); // red level
      expect(result.avgMs).toBe(300); // (100+200+300+400+500)/5
      expect(result.maxMs).toBe(500);
      expect(result.p95Ms).toBe(500); // 95th percentile of [100,200,300,400,500]
    });

    it('returns null stats when all latencyMs are null', async () => {
      const runs = [
        { checkedAt: new Date(), latencyMs: null, level: 'green' },
        { checkedAt: new Date(), latencyMs: null, level: 'green' },
      ];
      const layout = {
        widgets: [{ id: 'rt2', type: 'response-time-chart', config: { monitorId: 'mon-1' }, x: 0, y: 0, w: 12, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue(runs);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'rt2');
      expect(result.avgMs).toBeNull();
      expect(result.p95Ms).toBeNull();
      expect(result.maxMs).toBeNull();
    });

    it('returns empty dataPoints when no runs exist', async () => {
      const layout = {
        widgets: [{ id: 'rt3', type: 'response-time-chart', config: { monitorId: 'mon-1' }, x: 0, y: 0, w: 12, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'rt3');
      expect(result.dataPoints).toHaveLength(0);
      expect(result.avgMs).toBeNull();
    });

    it('returns _noConfig when monitorId is missing', async () => {
      const layout = {
        widgets: [{ id: 'rt4', type: 'response-time-chart', config: {}, x: 0, y: 0, w: 12, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'rt4');
      expect(_result).toMatchObject({ _noConfig: true });
    });

    it('respects periodHours config to filter by time range', async () => {
      const layout = {
        widgets: [{ id: 'rt5', type: 'response-time-chart', config: { monitorId: 'mon-1', periodHours: 1 }, x: 0, y: 0, w: 12, h: 3 }],
      };
      const runs = [{ checkedAt: new Date(), latencyMs: 150, level: 'green' }];
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue(runs);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'rt5');
      // Verify findMany was called with a time filter (gte)
      const call = (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
        where: { checkedAt?: { gte: Date } };
      };
      expect(call.where.checkedAt?.gte).toBeDefined();
      expect(result.avgMs).toBe(150);
    });
  });

  describe('getWidgetData — sla-summary', () => {
    it('returns pass=true with correct uptimePct when all checks green', async () => {
      const runs = Array.from({ length: 100 }, () => ({ level: 'green' }));
      const layout = {
        widgets: [{ id: 'sla1', type: 'sla-summary', config: { monitorId: 'mon-1', periodDays: 30, slaTarget: 99.9 }, x: 0, y: 0, w: 12, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue(runs);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sla1');
      expect(result.uptimePct).toBe(100);
      expect(result.pass).toBe(true);
      expect(result.total).toBe(100);
      expect(result.up).toBe(100);
      expect(result.down).toBe(0);
      expect(result.slaTarget).toBe(99.9);
    });

    it('returns pass=false when uptime is below SLA target', async () => {
      // 95 green + 5 red = 95% uptime, target is 99.9%
      const runs = [
        ...Array.from({ length: 95 }, () => ({ level: 'green' })),
        ...Array.from({ length: 5 }, () => ({ level: 'red' })),
      ];
      const layout = {
        widgets: [{ id: 'sla2', type: 'sla-summary', config: { monitorId: 'mon-1', periodDays: 30, slaTarget: 99.9 }, x: 0, y: 0, w: 12, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue(runs);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sla2');
      expect(result.uptimePct).toBe(95);
      expect(result.pass).toBe(false);
      expect(result.down).toBe(5);
    });

    it('returns uptimePct=100 with no checks (empty dataset)', async () => {
      const layout = {
        widgets: [{ id: 'sla3', type: 'sla-summary', config: { monitorId: 'mon-1' }, x: 0, y: 0, w: 12, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sla3');
      expect(result.uptimePct).toBe(100);
      expect(result.total).toBe(0);
      expect(result.pass).toBe(true); // 100 >= 99.9 default
    });

    it('computes allowedDownMinutes correctly for 30-day period at 99.9% SLA', async () => {
      const layout = {
        widgets: [{ id: 'sla4', type: 'sla-summary', config: { monitorId: 'mon-1', periodDays: 30, slaTarget: 99.9 }, x: 0, y: 0, w: 12, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sla4');
      // 30d × 24h × 60min × 0.001 = 43.2 minutes
      expect(result.allowedDownMinutes).toBe(43.2);
      expect(result.remainingDownMinutes).toBe(43.2); // no down time used
    });

    it('returns _noConfig when monitorId is missing', async () => {
      const layout = {
        widgets: [{ id: 'sla5', type: 'sla-summary', config: {}, x: 0, y: 0, w: 12, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'sla5');
      expect(_result).toMatchObject({ _noConfig: true });
    });
  });

  // ── New P1 Widget Tests ────────────────────────────────────────────────────

  describe('getWidgetData — component-status-list', () => {
    it('returns components with operational status when all monitors green', async () => {
      const monitors = [
        { id: 'mon-1', name: 'API', type: 'http', runs: [{ level: 'green', checkedAt: new Date(), latencyMs: 42 }] },
        { id: 'mon-2', name: 'DB', type: 'tcp', runs: [{ level: 'green', checkedAt: new Date(), latencyMs: 12 }] },
      ];
      const layout = {
        widgets: [{ id: 'csl1', type: 'component-status-list', config: {}, x: 0, y: 0, w: 8, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue(monitors);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'csl1');
      expect(result.overallStatus).toBe('operational');
      expect(result.total).toBe(2);
      expect(result.downCount).toBe(0);
      expect((result.components as Array<{ status: string }>)[0].status).toBe('operational');
    });

    it('returns major-outage when any monitor is red', async () => {
      const monitors = [
        { id: 'mon-1', name: 'API', type: 'http', runs: [{ level: 'red', checkedAt: new Date(), latencyMs: null }] },
      ];
      const layout = {
        widgets: [{ id: 'csl2', type: 'component-status-list', config: { monitorIds: ['mon-1'] }, x: 0, y: 0, w: 8, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue(monitors);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'csl2');
      expect(result.overallStatus).toBe('major-outage');
      expect(result.downCount).toBe(1);
    });
  });

  describe('getWidgetData — rolling-uptime-cards', () => {
    it('returns 4 cards (24h, 7d, 30d, 90d) with 100% uptime when all green', async () => {
      const runs = Array.from({ length: 10 }, () => ({ level: 'green' }));
      const layout = {
        widgets: [{ id: 'ruc1', type: 'rolling-uptime-cards', config: { monitorId: 'mon-1' }, x: 0, y: 0, w: 12, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue(runs);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'ruc1');
      expect((result.cards as Array<{ label: string }>)).toHaveLength(4);
      expect((result.cards as Array<{ label: string; uptimePct: number }>)[0].label).toBe('24h');
      expect((result.cards as Array<{ uptimePct: number }>)[0].uptimePct).toBe(100);
    });

    it('returns _noConfig when monitorId is missing', async () => {
      const layout = {
        widgets: [{ id: 'ruc2', type: 'rolling-uptime-cards', config: {}, x: 0, y: 0, w: 12, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'ruc2');
      expect(_result).toMatchObject({ _noConfig: true });
    });
  });

  describe('getWidgetData — status-history-ribbon', () => {
    it('returns rows with ribbon data per monitor', async () => {
      const monitors = [{ id: 'mon-1', name: 'API' }];
      const runs = [
        { monitorId: 'mon-1', level: 'green', checkedAt: new Date() },
      ];
      const layout = {
        widgets: [{ id: 'shr1', type: 'status-history-ribbon', config: { monitorIds: ['mon-1'] }, x: 0, y: 0, w: 12, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue(runs);
      prisma.monitor.findMany = vi.fn().mockResolvedValue(monitors);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'shr1');
      expect(result.days).toBe(90);
      expect((result.rows as Array<{ id: string }>)).toHaveLength(1);
      const row = (result.rows as Array<{ id: string; ribbon: Array<{ level: string }> }>)[0];
      expect(row.id).toBe('mon-1');
      expect(row.ribbon).toHaveLength(90);
    });

    it('returns _noConfig when no monitorIds provided', async () => {
      const layout = {
        widgets: [{ id: 'shr2', type: 'status-history-ribbon', config: {}, x: 0, y: 0, w: 12, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'shr2');
      expect(_result).toMatchObject({ _noConfig: true });
    });
  });

  describe('getWidgetData — uptime-percentage-card', () => {
    it('returns current uptimePct and trend=up when current > previous', async () => {
      const layout = {
        widgets: [{ id: 'upc1', type: 'uptime-percentage-card', config: { monitorId: 'mon-1', periodDays: 30 }, x: 0, y: 0, w: 4, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      // Current period: all green (100%), prev period: some red (90%)
      prisma.monitorRun.findMany = vi.fn()
        .mockResolvedValueOnce(Array.from({ length: 100 }, () => ({ level: 'green' }))) // current
        .mockResolvedValueOnce([
          ...Array.from({ length: 90 }, () => ({ level: 'green' })),
          ...Array.from({ length: 10 }, () => ({ level: 'red' })),
        ]); // previous
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'upc1');
      expect(result.uptimePct).toBe(100);
      expect(result.previousPct).toBe(90);
      expect(result.trend).toBe('up');
    });

    it('returns _noConfig when monitorId is missing', async () => {
      const layout = {
        widgets: [{ id: 'upc2', type: 'uptime-percentage-card', config: {}, x: 0, y: 0, w: 4, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'upc2');
      expect(_result).toMatchObject({ _noConfig: true });
    });
  });

  describe('getWidgetData — service-health-matrix', () => {
    it('returns auto-mode matrix when no columns/rows configured', async () => {
      const layout = {
        widgets: [{ id: 'shm1', type: 'service-health-matrix', config: {}, x: 0, y: 0, w: 12, h: 4 }],
      };
      prisma = makePrisma({
        page: makePage({ isPublished: true, layout }),
        monitors: [
          makeMonitor({ id: 'mon-1', name: 'API', runs: [{ level: 'green', checkedAt: new Date(), latencyMs: 45 }] }),
          makeMonitor({ id: 'mon-2', name: 'DB', runs: [{ level: 'red', checkedAt: new Date(), latencyMs: null }] }),
        ],
      });
      service = makeService(prisma);
      const data = await service.getWidgetData('my-status-page', 'shm1');
      expect(data).toMatchObject({ mode: 'auto', columns: ['Production'] });
      expect(Array.isArray((data as { matrix: unknown[] }).matrix)).toBe(true);
      expect((data as { matrix: unknown[] }).matrix).toHaveLength(2);
    });

    it('returns empty matrix gracefully when no monitors', async () => {
      const layout = {
        widgets: [{ id: 'shm2', type: 'service-health-matrix', config: {}, x: 0, y: 0, w: 12, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }), monitors: [] });
      service = makeService(prisma);
      const data = await service.getWidgetData('my-status-page', 'shm2');
      expect(data).toMatchObject({ mode: 'auto', matrix: [] });
    });
  });

  describe('getWidgetData — aggregate-health-score', () => {
    it('returns 100 score when all monitors are green', async () => {
      const layout = {
        widgets: [{ id: 'ahs1', type: 'aggregate-health-score', config: {}, x: 0, y: 0, w: 4, h: 3 }],
      };
      prisma = makePrisma({
        page: makePage({ isPublished: true, layout }),
        monitors: [
          makeMonitor({ id: 'mon-1', name: 'API', runs: [{ level: 'green', latencyMs: 50 }] }),
          makeMonitor({ id: 'mon-2', name: 'DB', runs: [{ level: 'green', latencyMs: 10 }] }),
        ],
      });
      service = makeService(prisma);
      const data = await service.getWidgetData('my-status-page', 'ahs1');
      expect(data).toMatchObject({ score: 100, status: 'healthy', down: 0, degraded: 0 });
    });

    it('returns score 0 when all monitors are red', async () => {
      const layout = {
        widgets: [{ id: 'ahs2', type: 'aggregate-health-score', config: {}, x: 0, y: 0, w: 4, h: 3 }],
      };
      prisma = makePrisma({
        page: makePage({ isPublished: true, layout }),
        monitors: [
          makeMonitor({ id: 'mon-1', name: 'API', runs: [{ level: 'red', latencyMs: null }] }),
          makeMonitor({ id: 'mon-2', name: 'DB', runs: [{ level: 'red', latencyMs: null }] }),
        ],
      });
      service = makeService(prisma);
      const data = await service.getWidgetData('my-status-page', 'ahs2');
      expect(data).toMatchObject({ score: 0, status: 'critical', down: 2 });
    });

    it('returns healthy score 100 when no monitors configured', async () => {
      const layout = {
        widgets: [{ id: 'ahs3', type: 'aggregate-health-score', config: {}, x: 0, y: 0, w: 4, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }), monitors: [] });
      service = makeService(prisma);
      const data = await service.getWidgetData('my-status-page', 'ahs3');
      expect(data).toMatchObject({ score: 100, total: 0 });
    });

    it('returns degraded status with 75 score when one green one yellow', async () => {
      const layout = {
        widgets: [{ id: 'ahs4', type: 'aggregate-health-score', config: {}, x: 0, y: 0, w: 4, h: 3 }],
      };
      prisma = makePrisma({
        page: makePage({ isPublished: true, layout }),
        monitors: [
          makeMonitor({ id: 'mon-1', name: 'API', runs: [{ level: 'green', latencyMs: 50 }] }),
          makeMonitor({ id: 'mon-2', name: 'DB', runs: [{ level: 'yellow', latencyMs: 200 }] }),
        ],
      });
      service = makeService(prisma);
      const data = await service.getWidgetData('my-status-page', 'ahs4');
      expect(data).toMatchObject({ status: 'degraded', degraded: 1, down: 0 });
      expect((data as { score: number }).score).toBe(75); // (100 + 50) / 2
    });
  });

  // ── New P1 Widget Tests (latency-percentiles-card, downtime-log, active-incident-count, mttr-mttf-cards) ──

  describe('getWidgetData — latency-percentiles-card', () => {
    it('returns _noConfig when monitorId is missing', async () => {
      const layout = {
        widgets: [{ id: 'lp1', type: 'latency-percentiles-card', config: {}, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'lp1');
      expect(_result).toMatchObject({ _noConfig: true });
    });

    it('returns percentile data with sampleCount', async () => {
      const layout = {
        widgets: [{ id: 'lp2', type: 'latency-percentiles-card', config: { monitorId: 'mon-1', periodDays: 7 }, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { latencyMs: 100 },
        { latencyMs: 200 },
        { latencyMs: 300 },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'lp2');
      expect(result).toHaveProperty('p50');
      expect(result).toHaveProperty('p95');
      expect(result).toHaveProperty('p99');
      expect(result.sampleCount).toBe(3);
      expect(result.periodDays).toBe(7);
    });
  });

  describe('getWidgetData — downtime-log', () => {
    it('returns empty outages when no runs', async () => {
      const layout = {
        widgets: [{ id: 'dl1', type: 'downtime-log', config: {}, x: 0, y: 0, w: 8, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'dl1');
      expect(result.outages).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('detects outage events from consecutive red runs', async () => {
      const t0 = new Date('2026-03-18T10:00:00Z');
      const t1 = new Date('2026-03-18T10:05:00Z');
      const t2 = new Date('2026-03-18T10:10:00Z');
      const layout = {
        widgets: [{ id: 'dl2', type: 'downtime-log', config: {}, x: 0, y: 0, w: 8, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { monitorId: 'mon-1', level: 'red', checkedAt: t0, message: 'Down', monitor: { name: 'API' } },
        { monitorId: 'mon-1', level: 'red', checkedAt: t1, message: 'Down', monitor: { name: 'API' } },
        { monitorId: 'mon-1', level: 'green', checkedAt: t2, message: 'OK', monitor: { name: 'API' } },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'dl2');
      const outages = result.outages as Array<{ monitorName: string; resolvedAt: unknown; durationMs: number }>;
      expect(outages).toHaveLength(1);
      expect(outages[0].monitorName).toBe('API');
      expect(outages[0].resolvedAt).not.toBeNull();
      expect(outages[0].durationMs).toBe(t2.getTime() - t0.getTime());
    });
  });

  describe('getWidgetData — active-incident-count', () => {
    it('returns 0 count when no active incidents', async () => {
      const layout = {
        widgets: [{ id: 'ai1', type: 'active-incident-count', config: {}, x: 0, y: 0, w: 4, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      // incident.findMany already returns [] in makePrisma
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'ai1');
      expect(result.count).toBe(0);
      expect(result.incidents).toEqual([]);
    });

    it('returns correct count when active incidents exist', async () => {
      const layout = {
        widgets: [{ id: 'ai2', type: 'active-incident-count', config: {}, x: 0, y: 0, w: 4, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.incident.findMany = vi.fn().mockResolvedValue([
        { id: 'inc-1', title: 'API Down', severity: 'critical', status: 'investigating', createdAt: new Date() },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'ai2');
      expect(result.count).toBe(1);
      expect((result.incidents as unknown[]).length).toBe(1);
    });
  });

  describe('getWidgetData — mttr-mttf-cards', () => {
    it('returns null mttrMs when no outage runs', async () => {
      const layout = {
        widgets: [{ id: 'mttf1', type: 'mttr-mttf-cards', config: {}, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      // Default runs in makePrisma: one green run → no red streaks
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'mttf1');
      expect(result.mttrMs).toBeNull();
      expect(result.periodDays).toBe(30);
    });

    it('computes mttrMs from red streaks', async () => {
      const layout = {
        widgets: [{ id: 'mttf2', type: 'mttr-mttf-cards', config: { periodDays: 7 }, x: 0, y: 0, w: 6, h: 3 }],
      };
      const t0 = new Date('2026-03-18T10:00:00Z');
      const t1 = new Date('2026-03-18T10:10:00Z');
      const t2 = new Date('2026-03-18T10:20:00Z');
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { monitorId: 'mon-1', level: 'green', checkedAt: t0 },
        { monitorId: 'mon-1', level: 'red', checkedAt: t1 },
        { monitorId: 'mon-1', level: 'green', checkedAt: t2 },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'mttf2');
      // Red streak: t1→t2 = 10 minutes = 600000ms
      expect(result.mttrMs).toBe(600000);
    });
  });

  // ── sla-compliance-table ─────────────────────────────────────────────────

  describe('getWidgetData — sla-compliance-table', () => {
    it('returns _noConfig when no monitors found', async () => {
      const layout = {
        widgets: [{ id: 'sct1', type: 'sla-compliance-table', config: { monitorIds: ['nonexistent'] }, x: 0, y: 0, w: 12, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'sct1');
      expect(_result).toMatchObject({ _noConfig: true });
    });

    it('returns rows sorted by pass=false first with correct pass/fail logic', async () => {
      const layout = {
        widgets: [{ id: 'sct2', type: 'sla-compliance-table', config: { slaTarget: 99.9, periodDays: 7 }, x: 0, y: 0, w: 12, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-a', name: 'Monitor A' },
        { id: 'mon-b', name: 'Monitor B' },
      ]);
      // mon-a: 100% uptime (pass), mon-b: 50% uptime (fail)
      prisma.monitorRun.findMany = vi.fn()
        .mockResolvedValueOnce([{ level: 'green' }, { level: 'green' }])   // mon-a
        .mockResolvedValueOnce([{ level: 'green' }, { level: 'red' }]);    // mon-b
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sct2');
      const rows = result.rows as Array<{ monitorId: string; pass: boolean; actual: number }>;
      expect(rows).toHaveLength(2);
      // Fail first
      expect(rows[0].pass).toBe(false);
      expect(rows[0].actual).toBe(50);
      expect(rows[1].pass).toBe(true);
    });
  });

  // ── uptime-heatmap ───────────────────────────────────────────────────────

  describe('getWidgetData — uptime-heatmap', () => {
    it('returns _noConfig when monitorId missing', async () => {
      const layout = {
        widgets: [{ id: 'uh1', type: 'uptime-heatmap', config: {}, x: 0, y: 0, w: 12, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'uh1');
      expect(_result).toMatchObject({ _noConfig: true });
    });

    it('returns 7×24 grid with correct shape', async () => {
      const layout = {
        widgets: [{ id: 'uh2', type: 'uptime-heatmap', config: { monitorId: 'mon-1' }, x: 0, y: 0, w: 12, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'uh2');
      expect(result.days).toBe(7);
      expect(result.hours).toBe(24);
      const grid = result.grid as string[][];
      expect(grid).toHaveLength(7);
      expect(grid[0]).toHaveLength(24);
      // All no-data when no runs
      expect(grid[0][0]).toBe('no-data');
    });
  });

  // ── incident-timeline ────────────────────────────────────────────────────

  describe('getWidgetData — incident-timeline', () => {
    it('returns empty array when no incidents', async () => {
      const layout = {
        widgets: [{ id: 'it1', type: 'incident-timeline', config: {}, x: 0, y: 0, w: 8, h: 5 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'it1');
      expect(result.incidents).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns incidents with durationMs computed from createdAt/resolvedAt', async () => {
      const layout = {
        widgets: [{ id: 'it2', type: 'incident-timeline', config: { limit: 3 }, x: 0, y: 0, w: 8, h: 5 }],
      };
      const createdAt = new Date('2026-03-18T08:00:00Z');
      const resolvedAt = new Date('2026-03-18T10:00:00Z');
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.incident.findMany = vi.fn().mockResolvedValue([
        {
          id: 'inc-1',
          title: 'Test Incident',
          status: 'RESOLVED',
          severity: 'HIGH',
          createdAt,
          resolvedAt,
          updates: [{ id: 'u1', body: 'Identified', status: 'IDENTIFIED', createdAt }],
          monitors: [],
        },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'it2');
      const incidents = result.incidents as Array<{ id: string; durationMs: number }>;
      expect(incidents).toHaveLength(1);
      expect(incidents[0].id).toBe('inc-1');
      expect(incidents[0].durationMs).toBe(7_200_000); // 2 hours
    });
  });

  // ── ssl-certificate-status ───────────────────────────────────────────────

  describe('getWidgetData — ssl-certificate-status', () => {
    it('throws BadRequestException when no SSL monitors found', async () => {
      const layout = {
        widgets: [{ id: 'ssl1', type: 'ssl-certificate-status', config: {}, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'ssl1');
      expect(_result).toMatchObject({ _noConfig: true });
    });

    it('returns cert status with daysRemaining from latencyMs', async () => {
      const layout = {
        widgets: [{ id: 'ssl2', type: 'ssl-certificate-status', config: {}, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        {
          id: 'ssl-mon-1',
          name: 'example.com',
          config: { target: 'example.com' },
          runs: [{ level: 'green', latencyMs: 45, message: null, checkedAt: new Date() }],
        },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'ssl2');
      const certs = result.certs as Array<{ domain: string; daysRemaining: number; status: string }>;
      expect(certs).toHaveLength(1);
      expect(certs[0].domain).toBe('example.com');
      expect(certs[0].daysRemaining).toBe(45);
      expect(certs[0].status).toBe('valid');
    });
  });

  // ── incident-severity-distribution ──────────────────────────────────────

  describe('getWidgetData — incident-severity-distribution', () => {
    it('returns zero counts when no incidents', async () => {
      const layout = {
        widgets: [{ id: 'isd1', type: 'incident-severity-distribution', config: {}, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'isd1');
      expect(result.total).toBe(0);
      expect(result.critical).toBe(0);
      expect(result.major).toBe(0);
      expect(result.minor).toBe(0);
    });

    it('counts incidents by severity correctly', async () => {
      const layout = {
        widgets: [{ id: 'isd2', type: 'incident-severity-distribution', config: { periodDays: 7 }, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.incident.findMany = vi.fn().mockResolvedValue([
        { id: 'i1', severity: 'CRITICAL' },
        { id: 'i2', severity: 'CRITICAL' },
        { id: 'i3', severity: 'HIGH' },
        { id: 'i4', severity: 'MEDIUM' },
        { id: 'i5', severity: 'LOW' },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'isd2');
      expect(result.total).toBe(5);
      expect(result.critical).toBe(2); // CRITICAL
      expect(result.major).toBe(1);    // HIGH
      expect(result.minor).toBe(2);   // MEDIUM + LOW
      expect(result.periodDays).toBe(7);
    });
  });

  // ── incident-duration-stats ──────────────────────────────────────────────

  describe('getWidgetData — incident-duration-stats', () => {
    it('returns zero count when no resolved incidents', async () => {
      const layout = {
        widgets: [{ id: 'ids1', type: 'incident-duration-stats', config: {}, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'ids1');
      expect(result.count).toBe(0);
      expect(result.avg).toBeNull();
      expect(result.longest).toBeNull();
      expect(result.shortest).toBeNull();
    });

    it('computes avg/longest/shortest from resolved incidents', async () => {
      const layout = {
        widgets: [{ id: 'ids2', type: 'incident-duration-stats', config: { periodDays: 30 }, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      const base = new Date('2026-01-01T00:00:00Z');
      prisma.incident.findMany = vi.fn().mockResolvedValue([
        { createdAt: base, resolvedAt: new Date(base.getTime() + 3_600_000) },       // 1h
        { createdAt: base, resolvedAt: new Date(base.getTime() + 7_200_000) },       // 2h
        { createdAt: base, resolvedAt: new Date(base.getTime() + 1_800_000) },       // 30m
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'ids2');
      expect(result.count).toBe(3);
      expect(result.longest).toBe(7_200_000);
      expect(result.shortest).toBe(1_800_000);
      expect(result.avg).toBe(4_200_000); // (3_600_000 + 7_200_000 + 1_800_000) / 3
    });
  });

  // ── post-mortem-card ─────────────────────────────────────────────────────

  describe('getWidgetData — post-mortem-card', () => {
    it('returns null incident when none resolved', async () => {
      const layout = {
        widgets: [{ id: 'pmc1', type: 'post-mortem-card', config: {}, x: 0, y: 0, w: 8, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.incident.findFirst = vi.fn().mockResolvedValue(null);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'pmc1');
      expect(result.incident).toBeNull();
    });

    it('returns latest resolved incident with updates and monitors', async () => {
      const layout = {
        widgets: [{ id: 'pmc2', type: 'post-mortem-card', config: {}, x: 0, y: 0, w: 8, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      const createdAt = new Date('2026-01-01T10:00:00Z');
      const resolvedAt = new Date('2026-01-01T12:30:00Z');
      prisma.incident.findFirst = vi.fn().mockResolvedValue({
        id: 'inc-1',
        title: 'DB Outage',
        severity: 'CRITICAL',
        createdAt,
        resolvedAt,
        description: 'Database went down',
        updates: [
          { id: 'u1', body: 'Investigating', status: 'INVESTIGATING', createdAt: new Date('2026-01-01T10:05:00Z') },
          { id: 'u2', body: 'Fixed', status: 'RESOLVED', createdAt: new Date('2026-01-01T12:30:00Z') },
        ],
        monitors: [{ monitor: { id: 'mon-1', name: 'DB Monitor' } }],
      });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'pmc2');
      const incident = result.incident as { title: string; durationMs: number; affectedMonitors: unknown[]; updates: unknown[] };
      expect(incident).not.toBeNull();
      expect(incident.title).toBe('DB Outage');
      expect(incident.durationMs).toBe(9_000_000);
      expect(incident.affectedMonitors).toHaveLength(1);
      expect(incident.updates).toHaveLength(2);
    });
  });

  // ── performance-trend ────────────────────────────────────────────────────

  describe('getWidgetData — performance-trend', () => {
    it('returns _noConfig when no monitorId', async () => {
      const layout = {
        widgets: [{ id: 'pt1', type: 'performance-trend', config: {}, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'pt1');
      expect(_result).toMatchObject({ _noConfig: true });
    });

    it('returns trend data with dataPoints array of length 14', async () => {
      const layout = {
        widgets: [{ id: 'pt2', type: 'performance-trend', config: { monitorId: 'mon-1' }, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'pt2');
      expect(result.dataPoints).toHaveLength(14);
      expect(result.trend).toBe('stable');
    });
  });

  // ── apdex-score ──────────────────────────────────────────────────────────

  describe('getWidgetData — apdex-score', () => {
    it('returns _noConfig when no monitorId', async () => {
      const layout = {
        widgets: [{ id: 'as1', type: 'apdex-score', config: {}, x: 0, y: 0, w: 4, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'as1');
      expect(_result).toMatchObject({ _noConfig: true });
    });

    it('computes Apdex score correctly', async () => {
      const layout = {
        widgets: [{ id: 'as2', type: 'apdex-score', config: { monitorId: 'mon-1', satisfiedThresholdMs: 200, toleratingThresholdMs: 800 }, x: 0, y: 0, w: 4, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      // 8 satisfied (<200ms), 2 tolerating (200-799ms), 0 frustrated — score = (8 + 2/2)/10 = 0.9
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        ...Array.from({ length: 8 }, () => ({ latencyMs: 100 })),
        ...Array.from({ length: 2 }, () => ({ latencyMs: 400 })),
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'as2');
      expect(result.score).toBe(0.9);
      expect(result.satisfied).toBe(8);
      expect(result.tolerating).toBe(2);
      expect(result.frustrated).toBe(0);
      expect(result.rating).toBe('Good');
    });
  });

  // ── throughput-counter ───────────────────────────────────────────────────

  describe('getWidgetData — throughput-counter', () => {
    it('returns 24-slot dataPoints array', async () => {
      const layout = {
        widgets: [{ id: 'tc1', type: 'throughput-counter', config: {}, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'tc1');
      expect(result.dataPoints).toHaveLength(24);
      expect(result.current).toBe(0);
      expect(result.average).toBe(0);
      expect(result.peak).toBe(0);
    });

    it('counts runs per hour correctly', async () => {
      const layout = {
        widgets: [{ id: 'tc2', type: 'throughput-counter', config: {}, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      // Create 5 runs all in the same hour (2 hours ago)
      const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue(
        Array.from({ length: 5 }, () => ({ checkedAt: twoHoursAgo })),
      );
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'tc2');
      expect(result.dataPoints).toHaveLength(24);
      expect(result.peak).toBe(5);
    });
  });

  // ── response-time-comparison ─────────────────────────────────────────────

  describe('getWidgetData — response-time-comparison', () => {
    it('returns _noConfig when no monitorIds configured', async () => {
      const layout = {
        widgets: [{ id: 'rtc1', type: 'response-time-comparison', config: {}, x: 0, y: 0, w: 12, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'rtc1');
      expect(_result).toMatchObject({ _noConfig: true });
    });

    it('returns monitors with dataPoints and labels', async () => {
      const layout = {
        widgets: [{
          id: 'rtc2', type: 'response-time-comparison',
          config: { monitorIds: ['mon-1', 'mon-2'] },
          x: 0, y: 0, w: 12, h: 4,
        }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', name: 'API' },
        { id: 'mon-2', name: 'Web' },
      ]);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { latencyMs: 100, checkedAt: new Date('2026-01-01T10:00:00Z') },
        { latencyMs: 120, checkedAt: new Date('2026-01-01T11:00:00Z') },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'rtc2');
      expect(result.monitors).toHaveLength(2);
      expect((result.monitors as { id: string; name: string; color: string; dataPoints: number[] }[])[0].color).toBeDefined();
      expect(result.labels).toBeDefined();
    });
  });

  // ── uptime-comparison-chart ──────────────────────────────────────────────

  describe('getWidgetData — uptime-comparison-chart', () => {
    it('returns _noConfig when no monitorIds configured', async () => {
      const layout = {
        widgets: [{ id: 'ucc1', type: 'uptime-comparison-chart', config: {}, x: 0, y: 0, w: 8, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'ucc1');
      expect(_result).toMatchObject({ _noConfig: true });
    });

    it('returns monitors sorted by uptimePct descending', async () => {
      const layout = {
        widgets: [{
          id: 'ucc2', type: 'uptime-comparison-chart',
          config: { monitorIds: ['mon-1', 'mon-2'] },
          x: 0, y: 0, w: 8, h: 4,
        }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', name: 'API' },
        { id: 'mon-2', name: 'Web' },
      ]);
      // mon-1: 3/3 green = 100%, mon-2: 2/3 green = 66.67%
      prisma.monitorRun.findMany = vi.fn()
        .mockResolvedValueOnce([{ level: 'green' }, { level: 'green' }, { level: 'green' }])
        .mockResolvedValueOnce([{ level: 'green' }, { level: 'green' }, { level: 'red' }]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'ucc2');
      const mons = result.monitors as { id: string; uptimePct: number }[];
      expect(mons[0].uptimePct).toBeGreaterThan(mons[1].uptimePct);
      expect(result.periodDays).toBe(30);
    });
  });

  // ── next-maintenance-countdown ───────────────────────────────────────────

  describe('getWidgetData — next-maintenance-countdown', () => {
    it('returns none: true when no upcoming maintenance', async () => {
      const layout = {
        widgets: [{ id: 'nmc1', type: 'next-maintenance-countdown', config: {}, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.maintenanceWindow = { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) } as unknown as typeof prisma.maintenanceWindow;
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'nmc1');
      expect(result.none).toBe(true);
    });

    it('returns countdown data when maintenance exists', async () => {
      const layout = {
        widgets: [{ id: 'nmc2', type: 'next-maintenance-countdown', config: {}, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      const futureStart = new Date(Date.now() + 3_600_000); // 1 hour from now
      const futureEnd = new Date(Date.now() + 7_200_000);
      prisma.maintenanceWindow = {
        findFirst: vi.fn().mockResolvedValue({
          name: 'DB Upgrade',
          description: 'Upgrading database',
          startsAt: futureStart,
          endsAt: futureEnd,
          monitors: [{ monitor: { name: 'DB Monitor' } }],
        }),
        findMany: vi.fn().mockResolvedValue([]),
      } as unknown as typeof prisma.maintenanceWindow;
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'nmc2');
      expect(result.name).toBe('DB Upgrade');
      expect(result.secondsUntil).toBeGreaterThan(0);
      expect((result.affectedMonitors as { name: string }[])).toHaveLength(1);
    });
  });

  // ── maintenance-impact-list ──────────────────────────────────────────────

  describe('getWidgetData — maintenance-impact-list', () => {
    it('returns empty windows when none scheduled', async () => {
      const layout = {
        widgets: [{ id: 'mil1', type: 'maintenance-impact-list', config: {}, x: 0, y: 0, w: 8, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'mil1');
      expect(result.windows).toHaveLength(0);
    });

    it('returns windows with affected monitors and status', async () => {
      const layout = {
        widgets: [{ id: 'mil2', type: 'maintenance-impact-list', config: {}, x: 0, y: 0, w: 8, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      const futureStart = new Date(Date.now() + 3_600_000);
      const futureEnd = new Date(Date.now() + 7_200_000);
      prisma.maintenanceWindow.findMany = vi.fn().mockResolvedValue([{
        name: 'Planned Maintenance',
        startsAt: futureStart,
        endsAt: futureEnd,
        description: 'Routine maintenance',
        monitors: [
          { monitor: { id: 'mon-1', name: 'API', runs: [{ level: 'green' }] } },
          { monitor: { id: 'mon-2', name: 'DB', runs: [] } },
        ],
      }]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'mil2');
      const windows = result.windows as { name: string; affectedMonitors: { name: string; status: string }[] }[];
      expect(windows).toHaveLength(1);
      expect(windows[0].name).toBe('Planned Maintenance');
      expect(windows[0].affectedMonitors).toHaveLength(2);
    });
  });

  // ── version-timeline ─────────────────────────────────────────────────────

  describe('getWidgetData — version-timeline', () => {
    it('returns empty events when no VERSION monitors', async () => {
      const layout = {
        widgets: [{ id: 'vt1', type: 'version-timeline', config: {}, x: 0, y: 0, w: 8, h: 5 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'vt1');
      expect(result.events).toHaveLength(0);
      expect(result.count).toBe(0);
    });

    it('detects version changes from consecutive monitor runs', async () => {
      const layout = {
        widgets: [{ id: 'vt2', type: 'version-timeline', config: {}, x: 0, y: 0, w: 8, h: 5 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', name: 'MyApp' },
      ]);
      // Runs ordered desc: latest first (v2.0.0 → v1.9.0)
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { message: 'v2.0.0', checkedAt: new Date('2026-01-03T10:00:00Z') },
        { message: 'v1.9.0', checkedAt: new Date('2026-01-02T10:00:00Z') },
        { message: 'v1.9.0', checkedAt: new Date('2026-01-01T10:00:00Z') },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'vt2');
      const events = result.events as { fromVersion: string; toVersion: string; name: string }[];
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].fromVersion).toBe('v1.9.0');
      expect(events[0].toVersion).toBe('v2.0.0');
    });
  });

  // ── outdated-components-alert ────────────────────────────────────────────

  describe('getWidgetData — outdated-components-alert', () => {
    it('throws BadRequestException when no VERSION monitors configured', async () => {
      const layout = {
        widgets: [{ id: 'oca1', type: 'outdated-components-alert', config: {}, x: 0, y: 0, w: 8, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'oca1');
      expect(_result).toMatchObject({ _noConfig: true });
    });

    it('returns outdated list and upToDate count when versions differ', async () => {
      const layout = {
        widgets: [{ id: 'oca2', type: 'outdated-components-alert', config: {}, x: 0, y: 0, w: 8, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', name: 'API', configJson: { latestVersion: 'v2.0.0' }, runs: [{ message: 'v1.9.0' }] },
        { id: 'mon-2', name: 'Web', configJson: { latestVersion: 'v1.5.0' }, runs: [{ message: 'v1.5.0' }] },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'oca2');
      expect(result.total).toBe(2);
      expect(result.upToDate).toBe(1);
      const outdated = result.outdated as { name: string; severity: string }[];
      expect(outdated).toHaveLength(1);
      expect(outdated[0].name).toBe('API');
    });
  });

  // ── version-comparison-table ─────────────────────────────────────────────

  describe('getWidgetData — version-comparison-table', () => {
    it('throws BadRequestException when no VERSION monitors configured', async () => {
      const layout = {
        widgets: [{ id: 'vct1', type: 'version-comparison-table', config: {}, x: 0, y: 0, w: 10, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'vct1');
      expect(_result).toMatchObject({ _noConfig: true });
    });

    it('returns rows with upToDate flag and lastChecked', async () => {
      const layout = {
        widgets: [{ id: 'vct2', type: 'version-comparison-table', config: {}, x: 0, y: 0, w: 10, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      const checkedAt = new Date('2026-03-01T00:00:00Z');
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', name: 'API', configJson: { latestVersion: 'v2.0.0' }, runs: [{ message: 'v1.9.0', checkedAt }] },
        { id: 'mon-2', name: 'Web', configJson: { latestVersion: 'v1.5.0' }, runs: [{ message: 'v1.5.0', checkedAt }] },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'vct2');
      const rows = result.rows as { name: string; upToDate: boolean; current: string }[];
      expect(rows).toHaveLength(2);
      const apiRow = rows.find((r) => r.name === 'API');
      const webRow = rows.find((r) => r.name === 'Web');
      expect(apiRow?.upToDate).toBe(false);
      expect(webRow?.upToDate).toBe(true);
    });
  });

  // ── dns-resolution-time ──────────────────────────────────────────────────

  describe('getWidgetData — dns-resolution-time', () => {
    it('throws BadRequestException when no HTTP monitors configured', async () => {
      const layout = {
        widgets: [{ id: 'dns1', type: 'dns-resolution-time', config: {}, x: 0, y: 0, w: 6, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'dns1');
      expect(_result).toMatchObject({ _noConfig: true });
    });

    it('returns avgMs, p95Ms, and per-monitor breakdown', async () => {
      const layout = {
        widgets: [{ id: 'dns2', type: 'dns-resolution-time', config: { periodHours: 24 }, x: 0, y: 0, w: 6, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', name: 'API' },
      ]);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { latencyMs: 100, checkedAt: new Date('2026-03-01T00:00:00Z') },
        { latencyMs: 200, checkedAt: new Date('2026-03-01T01:00:00Z') },
        { latencyMs: 300, checkedAt: new Date('2026-03-01T02:00:00Z') },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'dns2');
      expect(result.avgMs).toBe(200);
      expect(result.p95Ms).toBeGreaterThanOrEqual(200);
      expect((result.monitors as { name: string }[])[0].name).toBe('API');
    });
  });

  // ── gauge ────────────────────────────────────────────────────────────────

  describe('getWidgetData — gauge', () => {
    it('returns _noConfig when no monitors configured', async () => {
      const layout = {
        widgets: [{ id: 'g1', type: 'gauge', config: { monitorId: 'nonexistent' }, x: 0, y: 0, w: 4, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'g1');
      expect(_result).toMatchObject({ _noConfig: true });
    });

    it('returns value, metricType, label, and thresholds for uptime', async () => {
      const layout = {
        widgets: [{ id: 'g2', type: 'gauge', config: { metricType: 'uptime' }, x: 0, y: 0, w: 4, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([{ id: 'mon-1' }]);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { level: 'green', latencyMs: 100 },
        { level: 'green', latencyMs: 120 },
        { level: 'red', latencyMs: 500 },
        { level: 'red', latencyMs: 400 },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'g2');
      expect(result.value).toBe(50);
      expect(result.metricType).toBe('uptime');
      expect(result.thresholds).toMatchObject({ green: 90, yellow: 70 });
    });
  });

  // ── metric-comparison-row ─────────────────────────────────────────────────

  describe('getWidgetData — metric-comparison-row', () => {
    it('returns 4 metrics with correct keys', async () => {
      const layout = {
        widgets: [{ id: 'mcr1', type: 'metric-comparison-row', config: {}, x: 0, y: 0, w: 12, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([{ id: 'mon-1' }]);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { level: 'green', latencyMs: 100 },
        { level: 'green', latencyMs: 200 },
      ]);
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'mcr1');
      const metrics = result.metrics as { key: string }[];
      expect(metrics).toHaveLength(4);
      expect(metrics.map((m) => m.key)).toEqual(['uptime', 'avg-latency', 'checks-today', 'active-incidents']);
    });

    it('colors active incidents red when count > 0', async () => {
      const layout = {
        widgets: [{ id: 'mcr2', type: 'metric-comparison-row', config: {}, x: 0, y: 0, w: 12, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([{ id: 'mon-1' }]);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      prisma.incident.findMany = vi.fn().mockResolvedValue([{ id: 'inc-1' }, { id: 'inc-2' }]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'mcr2');
      const metrics = result.metrics as { key: string; value: string; color: string }[];
      const incMetric = metrics.find((m) => m.key === 'active-incidents');
      expect(incMetric?.value).toBe('2');
      expect(incMetric?.color).toBe('red');
    });
  });

  // ── sparkline-row ─────────────────────────────────────────────────────────

  describe('getWidgetData — sparkline-row', () => {
    it('returns monitors with dataPoints and status', async () => {
      const layout = {
        widgets: [{ id: 'spr1', type: 'sparkline-row', config: {}, x: 0, y: 0, w: 12, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', name: 'API', runs: [{ level: 'green' }] },
        { id: 'mon-2', name: 'DB', runs: [{ level: 'red' }] },
      ]);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { latencyMs: 100 }, { latencyMs: 200 },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'spr1');
      const monitors = result.monitors as { id: string; status: string }[];
      expect(monitors).toHaveLength(2);
      expect(monitors[0].status).toBe('up');
      expect(monitors[1].status).toBe('down');
    });

    it('returns _noConfig when no monitors in scope', async () => {
      const layout = {
        widgets: [{ id: 'spr2', type: 'sparkline-row', config: {}, x: 0, y: 0, w: 12, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'spr2');
      expect(_result).toMatchObject({ _noConfig: true });
    });
  });

  // ── progress-ring ─────────────────────────────────────────────────────────

  describe('getWidgetData — progress-ring', () => {
    it('returns uptime value with green color for 100% uptime', async () => {
      const layout = {
        widgets: [{ id: 'pr1', type: 'progress-ring', config: { metricType: 'uptime' }, x: 0, y: 0, w: 4, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([{ id: 'mon-1' }]);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { level: 'green' }, { level: 'green' }, { level: 'green' },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'pr1');
      expect(result.value).toBe(100);
      expect(result.color).toBe('green');
    });

    it('returns custom value directly for metricType=custom', async () => {
      const layout = {
        widgets: [{ id: 'pr2', type: 'progress-ring', config: { metricType: 'custom', customValue: 97, label: 'Score' }, x: 0, y: 0, w: 4, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'pr2');
      expect(result.value).toBe(97);
      expect(result.label).toBe('Score');
      expect(result.color).toBe('yellow');
    });
  });

  // ── announcement-bar ──────────────────────────────────────────────────────

  describe('getWidgetData — announcement-bar', () => {
    it('returns config as data with expired=false when no expiresAt', async () => {
      const layout = {
        widgets: [{ id: 'ab1', type: 'announcement-bar', config: { message: 'Hello world', type: 'info', dismissable: true }, x: 0, y: 0, w: 12, h: 1 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'ab1');
      expect(result.message).toBe('Hello world');
      expect(result.type).toBe('info');
      expect(result.dismissable).toBe(true);
      expect(result.expired).toBe(false);
    });

    it('sets expired=true when expiresAt is in the past', async () => {
      const layout = {
        widgets: [{ id: 'ab2', type: 'announcement-bar', config: { message: 'Old message', type: 'warning', dismissable: false, expiresAt: '2020-01-01T00:00:00Z' }, x: 0, y: 0, w: 12, h: 1 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'ab2');
      expect(result.expired).toBe(true);
    });
  });

  // ── link-list ─────────────────────────────────────────────────────────────

  describe('getWidgetData — link-list', () => {
    it('returns links array from config', async () => {
      const links = [
        { label: 'Docs', url: 'https://docs.example.com', icon: '📚', description: 'Documentation' },
        { label: 'Support', url: 'https://support.example.com', icon: '💬' },
      ];
      const layout = {
        widgets: [{ id: 'll1', type: 'link-list', config: { links }, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'll1');
      expect(result.links).toHaveLength(2);
      expect((result.links as { label: string }[])[0].label).toBe('Docs');
    });

    it('returns empty links array when config has no links', async () => {
      const layout = {
        widgets: [{ id: 'll2', type: 'link-list', config: {}, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'll2');
      expect(result.links).toEqual([]);
    });
  });

  // ── stats-grid ───────────────────────────────────────────────────────────

  describe('getWidgetData — stats-grid', () => {
    it('returns all 8 stats', async () => {
      const layout = {
        widgets: [{ id: 'sg1', type: 'stats-grid', config: {}, x: 0, y: 0, w: 12, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', runs: [{ level: 'green' }] },
        { id: 'mon-2', runs: [{ level: 'red' }] },
      ]);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      prisma.incident = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      } as unknown as typeof prisma.incident;
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sg1');
      const stats = result.stats as { key: string }[];
      expect(stats).toHaveLength(8);
      const keys = stats.map((s) => s.key);
      expect(keys).toContain('total-monitors');
      expect(keys).toContain('currently-up');
      expect(keys).toContain('sla-compliance');
    });

    it('includes correct total monitor count and up/down values', async () => {
      const layout = {
        widgets: [{ id: 'sg2', type: 'stats-grid', config: {}, x: 0, y: 0, w: 12, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', runs: [{ level: 'green' }] },
        { id: 'mon-2', runs: [{ level: 'green' }] },
        { id: 'mon-3', runs: [{ level: 'red' }] },
      ]);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      prisma.incident = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(1),
      } as unknown as typeof prisma.incident;
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sg2');
      const stats = result.stats as { key: string; value: string }[];
      const totalStat = stats.find((s) => s.key === 'total-monitors');
      const upStat = stats.find((s) => s.key === 'currently-up');
      expect(totalStat?.value).toBe('3');
      expect(upStat?.value).toBe('2/3');
    });
  });

  // ── faq-accordion ─────────────────────────────────────────────────────────

  describe('getWidgetData — faq-accordion', () => {
    it('returns items array from config', async () => {
      const items = [
        { question: 'What is PulseDock?', answer: 'An uptime monitoring tool.' },
        { question: 'How do I add a monitor?', answer: 'Go to the monitors section.' },
      ];
      const layout = {
        widgets: [{ id: 'faq1', type: 'faq-accordion', config: { items }, x: 0, y: 0, w: 8, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'faq1');
      expect((result.items as { question: string }[])).toHaveLength(2);
      expect((result.items as { question: string }[])[0].question).toBe('What is PulseDock?');
    });

    it('returns empty items array when no items configured', async () => {
      const layout = {
        widgets: [{ id: 'faq2', type: 'faq-accordion', config: {}, x: 0, y: 0, w: 8, h: 4 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'faq2');
      expect(result.items).toEqual([]);
    });
  });

  // ── social-links ──────────────────────────────────────────────────────────

  describe('getWidgetData — social-links', () => {
    it('returns socialLinks as links from config', async () => {
      const socialLinks = [
        { platform: 'github', url: 'https://github.com/example' },
        { platform: 'twitter', url: 'https://twitter.com/example' },
      ];
      const layout = {
        widgets: [{ id: 'sl1', type: 'social-links', config: { socialLinks }, x: 0, y: 0, w: 6, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sl1');
      expect((result.links as { platform: string }[])).toHaveLength(2);
      expect((result.links as { platform: string }[])[0].platform).toBe('github');
    });

    it('returns empty links array when no socialLinks configured', async () => {
      const layout = {
        widgets: [{ id: 'sl2', type: 'social-links', config: {}, x: 0, y: 0, w: 6, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sl2');
      expect(result.links).toEqual([]);
    });
  });

  // ── embed-iframe ──────────────────────────────────────────────────────────

  describe('getWidgetData — embed-iframe', () => {
    it('returns url, height, sandbox from config', async () => {
      const layout = {
        widgets: [{ id: 'ei1', type: 'embed-iframe', config: { url: 'https://grafana.example.com/d/abc', height: 600, sandbox: 'allow-scripts' }, x: 0, y: 0, w: 12, h: 6 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'ei1');
      expect(result.url).toBe('https://grafana.example.com/d/abc');
      expect(result.height).toBe(600);
      expect(result.sandbox).toBe('allow-scripts');
    });

    it('throws BadRequestException when url is missing', async () => {
      const layout = {
        widgets: [{ id: 'ei2', type: 'embed-iframe', config: {}, x: 0, y: 0, w: 12, h: 6 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const _result = await service.getWidgetData('my-status-page', 'ei2');
      expect(_result).toMatchObject({ _noConfig: true });
    });
  });

  // ── subscriber-form ───────────────────────────────────────────────────────

  describe('getWidgetData — subscriber-form', () => {
    it('returns form config with defaults when no config provided', async () => {
      const layout = {
        widgets: [{ id: 'sf1', type: 'subscriber-form', config: {}, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sf1');
      expect(typeof result.title).toBe('string');
      expect(typeof result.description).toBe('string');
      expect(typeof result.buttonText).toBe('string');
      expect(typeof result.successMessage).toBe('string');
    });

    it('returns form config from widget config when set', async () => {
      const layout = {
        widgets: [{ id: 'sf2', type: 'subscriber-form', config: { title: 'Get Notified', buttonText: 'Sign Up', successMessage: 'Thanks!', description: 'Stay in the loop.' }, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sf2');
      expect(result.title).toBe('Get Notified');
      expect(result.buttonText).toBe('Sign Up');
      expect(result.successMessage).toBe('Thanks!');
    });
  });

  // ── countdown ─────────────────────────────────────────────────────────────

  describe('getWidgetData — countdown', () => {
    it('returns expired=false and positive secondsRemaining for future targetAt', async () => {
      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
      const layout = {
        widgets: [{ id: 'cd1', type: 'countdown', config: { label: 'Launch', targetAt: futureDate, hideAfterExpiry: false }, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'cd1');
      expect(result.expired).toBe(false);
      expect((result.secondsRemaining as number) > 0).toBe(true);
      expect(result.label).toBe('Launch');
    });

    it('returns expired=true and secondsRemaining=0 for past targetAt', async () => {
      const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
      const layout = {
        widgets: [{ id: 'cd2', type: 'countdown', config: { label: 'Old event', targetAt: pastDate, hideAfterExpiry: true }, x: 0, y: 0, w: 6, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'cd2');
      expect(result.expired).toBe(true);
      expect(result.secondsRemaining).toBe(0);
      expect(result.hideAfterExpiry).toBe(true);
    });
  });

  // ── getPublicJson ─────────────────────────────────────────────────────────

  describe('getPublicJson', () => {
    it('throws NotFoundException for unpublished page', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: false }) });
      service = makeService(prisma);
      await expect(service.getPublicJson('my-status-page')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for missing page', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      await expect(service.getPublicJson('missing-slug')).rejects.toThrow(NotFoundException);
    });

    it('returns structured JSON for published page with monitors', async () => {
      const publishedPage = makePage({ isPublished: true });
      const monitors = [
        makeMonitor({ id: 'mon-1', name: 'API', runs: [{ level: 'green', ok: true, latencyMs: 100, checkedAt: new Date() }] }),
        makeMonitor({ id: 'mon-2', name: 'DB', runs: [{ level: 'red', ok: false, latencyMs: 500, checkedAt: new Date() }] }),
      ];
      prisma = makePrisma({ page: publishedPage, monitors });
      service = makeService(prisma);

      const result = await service.getPublicJson('my-status-page');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('overallStatus');
      expect(result).toHaveProperty('monitors');
      expect(result).toHaveProperty('generatedAt');
      // One monitor is red => overall status should be 'down'
      expect(result.overallStatus).toBe('down');
    });

    it('returns operational status when all monitors are green', async () => {
      const publishedPage = makePage({ isPublished: true });
      const monitors = [
        makeMonitor({ id: 'mon-1', name: 'API', runs: [{ level: 'green', ok: true, latencyMs: 50, checkedAt: new Date() }] }),
      ];
      prisma = makePrisma({ page: publishedPage, monitors });
      service = makeService(prisma);

      const result = await service.getPublicJson('my-status-page');
      expect(result.overallStatus).toBe('operational');
    });
  });

  // ── active-incident-banner ────────────────────────────────────────────────

  describe('getWidgetData — active-incident-banner', () => {
    it('returns isAllClear=true when no incidents and no down monitors', async () => {
      const layout = {
        widgets: [{ id: 'aib1', type: 'active-incident-banner', config: {}, x: 0, y: 0, w: 12, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      (prisma.incident.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', enabled: true, runs: [{ ok: true, level: 'green', message: 'OK' }] },
      ]);
      service = makeService(prisma);

      const result = await service.getWidgetData('my-status-page', 'aib1');
      expect(result.isAllClear).toBe(true);
      expect(result.activeIncidents).toHaveLength(0);
      expect(result.downMonitors).toHaveLength(0);
    });

    it('returns isAllClear=false with active incidents', async () => {
      const layout = {
        widgets: [{ id: 'aib2', type: 'active-incident-banner', config: {}, x: 0, y: 0, w: 12, h: 2 }],
      };
      const incident = {
        id: 'inc-1', title: 'Outage', severity: 'critical', status: 'INVESTIGATING', createdAt: new Date(),
        updates: [{ body: 'Working on it' }],
        monitors: [{ monitor: { id: 'mon-1', name: 'API' } }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      (prisma.incident.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([incident]);
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', enabled: true, runs: [{ ok: false, level: 'red', message: 'Down' }] },
      ]);
      service = makeService(prisma);

      const result = await service.getWidgetData('my-status-page', 'aib2');
      expect(result.isAllClear).toBe(false);
      expect(result.activeIncidents).toHaveLength(1);
      expect((result.activeIncidents as { title: string }[])[0].title).toBe('Outage');
    });
  });

  // ── maintenance-calendar ──────────────────────────────────────────────────

  describe('getWidgetData — maintenance-calendar', () => {
    it('returns empty windows when none scheduled', async () => {
      const layout = {
        widgets: [{ id: 'mc1', type: 'maintenance-calendar', config: {}, x: 0, y: 0, w: 12, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      (prisma.maintenanceWindow.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      service = makeService(prisma);

      const result = await service.getWidgetData('my-status-page', 'mc1');
      expect(result.windows).toHaveLength(0);
    });

    it('returns upcoming maintenance windows with isActive flag', async () => {
      const layout = {
        widgets: [{ id: 'mc2', type: 'maintenance-calendar', config: {}, x: 0, y: 0, w: 12, h: 3 }],
      };
      const now = new Date();
      const activeWindow = {
        id: 'mw-1', name: 'DB Maintenance', description: 'Planned downtime',
        startsAt: new Date(now.getTime() - 10_000), // started 10s ago
        endsAt: new Date(now.getTime() + 3_600_000), // ends in 1h
        monitors: [{ monitor: { id: 'mon-1', name: 'DB' } }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      (prisma.maintenanceWindow.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([activeWindow]);
      service = makeService(prisma);

      const result = await service.getWidgetData('my-status-page', 'mc2');
      expect(result.windows).toHaveLength(1);
      expect((result.windows as { isActive: boolean; name: string }[])[0].isActive).toBe(true);
      expect((result.windows as { name: string }[])[0].name).toBe('DB Maintenance');
    });
  });

  // ── multi-monitor-status-grid / multi-status-badges ───────────────────────

  describe('getWidgetData — multi-monitor-status-grid', () => {
    it('returns monitor status summary', async () => {
      const layout = {
        widgets: [{ id: 'mmsg1', type: 'multi-monitor-status-grid', config: {}, x: 0, y: 0, w: 12, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', name: 'API', type: 'HTTP', enabled: true, runs: [{ level: 'green', latencyMs: 42, checkedAt: new Date() }], monitorTags: [] },
        { id: 'mon-2', name: 'DB', type: 'TCP', enabled: true, runs: [{ level: 'red', latencyMs: null, checkedAt: new Date() }], monitorTags: [] },
      ]);
      service = makeService(prisma);

      const result = await service.getWidgetData('my-status-page', 'mmsg1');
      expect(result.monitors).toHaveLength(2);
      const summary = result.summary as { down: number; healthy: number };
      expect(summary.down).toBe(1);
      expect(summary.healthy).toBe(1);
    });
  });

  // ── version-check-badge ───────────────────────────────────────────────────

  describe('getWidgetData — version-check-badge', () => {
    it('returns _noConfig when no monitorId configured', async () => {
      const layout = {
        widgets: [{ id: 'vcb1', type: 'version-check-badge', config: {}, x: 0, y: 0, w: 6, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findFirst = vi.fn().mockResolvedValue(null);
      service = makeService(prisma);

      const result = await service.getWidgetData('my-status-page', 'vcb1');
      expect(result._noConfig).toBe(true);
    });

    it('returns up-to-date diff for matching versions', async () => {
      const layout = {
        widgets: [{ id: 'vcb2', type: 'version-check-badge', config: { monitorId: 'mon-1' }, x: 0, y: 0, w: 6, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findFirst = vi.fn().mockResolvedValue({
        id: 'mon-1', name: 'Grafana',
        runs: [{ level: 'green', message: 'current v10.0.0, latest v10.0.0', latencyMs: null, checkedAt: new Date() }],
      });
      service = makeService(prisma);

      const result = await service.getWidgetData('my-status-page', 'vcb2');
      expect(result.diff).toBe('up-to-date');
      expect(result.current).toBe('v10.0.0');
    });
  });

  // ── update-summary ────────────────────────────────────────────────────────

  describe('getWidgetData — update-summary', () => {
    it('returns zeroed counts when no version monitors', async () => {
      const layout = {
        widgets: [{ id: 'us1', type: 'update-summary', config: {}, x: 0, y: 0, w: 12, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);

      const result = await service.getWidgetData('my-status-page', 'us1');
      expect(result.total).toBe(0);
      expect(result.upToDate).toBe(0);
      expect(result.major).toBe(0);
    });

    it('classifies major/minor updates correctly', async () => {
      const layout = {
        widgets: [{ id: 'us2', type: 'update-summary', config: {}, x: 0, y: 0, w: 12, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'm1', name: 'App A', type: 'GIT_RELEASE', runs: [{ message: 'current v1.0.0, latest v2.0.0', level: 'yellow' }] },
        { id: 'm2', name: 'App B', type: 'GIT_RELEASE', runs: [{ message: 'current v2.1.0, latest v2.1.0', level: 'green' }] },
      ]);
      service = makeService(prisma);

      const result = await service.getWidgetData('my-status-page', 'us2');
      expect(result.total).toBe(2);
      expect(result.major).toBe(1);
      expect(result.upToDate).toBe(1);
    });
  });

  // ── content-only widgets (echo resolvers) ─────────────────────────────────

  describe('getWidgetData — content-only widgets', () => {
    const contentTypes = ['text-block', 'code-block', 'image-banner', 'video-embed', 'divider', 'rss-feed-widget'];

    for (const wtype of contentTypes) {
      it(`returns config echo for ${wtype}`, async () => {
        const layout = {
          widgets: [{ id: 'cw1', type: wtype, config: { someField: 'test' }, x: 0, y: 0, w: 12, h: 2 }],
        };
        prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
        service = makeService(prisma);

        const result = await service.getWidgetData('my-status-page', 'cw1');
        expect(result.widgetType).toBe(wtype);
        expect((result.config as Record<string, unknown>).someField).toBe('test');
      });
    }
  });

  // ── unsubscribe ───────────────────────────────────────────────────────────

  describe('unsubscribe', () => {
    it('throws NotFoundException for invalid token', async () => {
      prisma = makePrisma();
      (prisma.statusPageSubscriber.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      service = makeService(prisma);
      await expect(service.unsubscribe('bad-token')).rejects.toThrow(NotFoundException);
    });

    it('deletes subscriber for valid token', async () => {
      prisma = makePrisma();
      const sub = { id: 'sub-1', statusPageId: 'page-1', email: 'user@example.com', unsubscribeToken: 'valid-tok', createdAt: new Date() };
      (prisma.statusPageSubscriber.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sub);
      (prisma.statusPageSubscriber.delete as ReturnType<typeof vi.fn>).mockResolvedValue(sub);
      service = makeService(prisma);
      await expect(service.unsubscribe('valid-tok')).resolves.toBeUndefined();
      expect(prisma.statusPageSubscriber.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
    });
  });

  // ── getHistory() ──────────────────────────────────────────────────────────

  describe('getHistory()', () => {
    it('returns history entries for the page', async () => {
      const history = [
        { id: 'h1', savedAt: new Date(), label: 'Snap 1', layout: { widgets: [] } },
        { id: 'h2', savedAt: new Date(), label: null, layout: { widgets: [] } },
      ];
      prisma.statusPageHistory.findMany = vi.fn().mockResolvedValue(history);
      const result = await service.getHistory('user-1', 'page-1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('h1');
    });

    it('throws NotFoundException when page not found', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      await expect(service.getHistory('user-1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong owner', async () => {
      prisma = makePrisma({ page: makePage({ userId: 'user-2' }) });
      service = makeService(prisma);
      await expect(service.getHistory('user-1', 'page-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── restoreHistory() ──────────────────────────────────────────────────────

  describe('restoreHistory()', () => {
    it('throws NotFoundException when page not found', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      await expect(service.restoreHistory('user-1', 'missing', 'h1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong owner', async () => {
      prisma = makePrisma({ page: makePage({ userId: 'user-2' }) });
      service = makeService(prisma);
      await expect(service.restoreHistory('user-1', 'page-1', 'h1')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when history entry not found', async () => {
      prisma.statusPageHistory.findUnique = vi.fn().mockResolvedValue(null);
      await expect(service.restoreHistory('user-1', 'page-1', 'h-missing')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when history belongs to different page', async () => {
      prisma.statusPageHistory.findUnique = vi.fn().mockResolvedValue({ id: 'h1', statusPageId: 'other-page', layout: { widgets: [] } });
      await expect(service.restoreHistory('user-1', 'page-1', 'h1')).rejects.toThrow(NotFoundException);
    });

    it('restores layout and saves current state as snapshot', async () => {
      const snapshotLayout = { widgets: [{ id: 'w99', type: 'divider', config: {}, x: 0, y: 0, w: 12, h: 1 }] };
      prisma.statusPageHistory.findUnique = vi.fn().mockResolvedValue({ id: 'h1', statusPageId: 'page-1', layout: snapshotLayout });
      prisma.publicStatusPage.update = vi.fn().mockResolvedValue(makePage({ layout: snapshotLayout }));
      const result = await service.restoreHistory('user-1', 'page-1', 'h1');
      expect(prisma.statusPageHistory.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ statusPageId: 'page-1', label: 'Before restore' }),
      }));
      expect(prisma.publicStatusPage.update).toHaveBeenCalled();
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).toHaveProperty('hasPassword');
    });
  });

  // ── checkSlugAvailability() ───────────────────────────────────────────────

  describe('checkSlugAvailability()', () => {
    it('returns invalid for empty slug', async () => {
      const result = await service.checkSlugAvailability('user-1', '');
      expect(result.valid).toBe(false);
      expect(result.available).toBe(false);
    });

    it('returns invalid for slug with uppercase', async () => {
      const result = await service.checkSlugAvailability('user-1', 'MyPage');
      expect(result.valid).toBe(false);
    });

    it('returns invalid for slug with leading hyphen', async () => {
      const result = await service.checkSlugAvailability('user-1', '-my-page');
      expect(result.valid).toBe(false);
    });

    it('returns invalid for too-short slug', async () => {
      const result = await service.checkSlugAvailability('user-1', 'ab');
      expect(result.valid).toBe(false);
    });

    it('returns available=true for unused valid slug', async () => {
      prisma.publicStatusPage.findUnique = vi.fn().mockResolvedValue(null);
      const result = await service.checkSlugAvailability('user-1', 'my-new-page');
      expect(result.valid).toBe(true);
      expect(result.available).toBe(true);
    });

    it('returns available=false for taken slug', async () => {
      prisma.publicStatusPage.findUnique = vi.fn().mockResolvedValue({ id: 'other-page' });
      const result = await service.checkSlugAvailability('user-1', 'my-new-page');
      expect(result.valid).toBe(true);
      expect(result.available).toBe(false);
    });

    it('returns available=true when excludeId matches existing page', async () => {
      prisma.publicStatusPage.findUnique = vi.fn().mockResolvedValue({ id: 'page-1' });
      const result = await service.checkSlugAvailability('user-1', 'my-new-page', 'page-1');
      expect(result.valid).toBe(true);
      expect(result.available).toBe(true);
    });
  });

  // ── getPublicJson() ───────────────────────────────────────────────────────

  describe('getPublicJson()', () => {
    it('throws NotFoundException when page not found', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      await expect(service.getPublicJson('missing')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when page is not published', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: false }) });
      service = makeService(prisma);
      await expect(service.getPublicJson('my-status-page')).rejects.toThrow(NotFoundException);
    });

    it('throws UnauthorizedException for password-protected page without password', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true, passwordHash: '$2a$12$hashedvalue' }) });
      service = makeService(prisma);
      await expect(service.getPublicJson('my-status-page')).rejects.toThrow(UnauthorizedException);
    });

    it('returns structured JSON for published page', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      prisma.maintenanceWindow.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getPublicJson('my-status-page');
      expect(result.page).toHaveProperty('slug', 'my-status-page');
      expect(result.page).toHaveProperty('title', 'My Status Page');
      expect(result).toHaveProperty('overallStatus');
      expect(result).toHaveProperty('monitors');
      expect(result).toHaveProperty('activeIncidents');
      expect(result).toHaveProperty('upcomingMaintenance');
      expect(result).toHaveProperty('generatedAt');
    });

    it('reports operational status when all monitors green', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'm1', name: 'A', type: 'HTTP', runs: [{ level: 'green', ok: true, latencyMs: 100, checkedAt: new Date() }] },
      ]);
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      prisma.maintenanceWindow.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getPublicJson('my-status-page');
      expect(result.overallStatus).toBe('operational');
    });

    it('reports down status when any monitor is red', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'm1', name: 'A', type: 'HTTP', runs: [{ level: 'red', ok: false, latencyMs: 0, checkedAt: new Date() }] },
        { id: 'm2', name: 'B', type: 'HTTP', runs: [{ level: 'green', ok: true, latencyMs: 100, checkedAt: new Date() }] },
      ]);
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      prisma.maintenanceWindow.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getPublicJson('my-status-page');
      expect(result.overallStatus).toBe('down');
    });

    it('reports degraded status when monitor is yellow', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'm1', name: 'A', type: 'HTTP', runs: [{ level: 'yellow', ok: true, latencyMs: 500, checkedAt: new Date() }] },
      ]);
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      prisma.maintenanceWindow.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getPublicJson('my-status-page');
      expect(result.overallStatus).toBe('degraded');
    });
  });

  // ── getRssFeed() ──────────────────────────────────────────────────────────

  describe('getRssFeed()', () => {
    it('throws NotFoundException when page not found', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      await expect(service.getRssFeed('missing')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when page is not published', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: false }) });
      service = makeService(prisma);
      await expect(service.getRssFeed('my-status-page')).rejects.toThrow(NotFoundException);
    });

    it('returns valid RSS XML for published page', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const xml = await service.getRssFeed('my-status-page');
      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain('<rss version="2.0"');
      expect(xml).toContain('My Status Page');
    });

    it('includes incident items in RSS feed', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      prisma.incident.findMany = vi.fn().mockResolvedValue([
        {
          id: 'inc-1', title: 'API Outage', severity: 'high', status: 'ACTIVE',
          createdAt: new Date('2026-01-15'), resolvedAt: null,
          updates: [{ body: 'Investigating the issue' }],
        },
      ]);
      service = makeService(prisma);
      const xml = await service.getRssFeed('my-status-page');
      expect(xml).toContain('API Outage');
      expect(xml).toContain('<item>');
      expect(xml).toContain('[Active]');
    });

    it('marks resolved incidents in RSS', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      prisma.incident.findMany = vi.fn().mockResolvedValue([
        {
          id: 'inc-2', title: 'DB Slow', severity: 'medium', status: 'RESOLVED',
          createdAt: new Date('2026-01-10'), resolvedAt: new Date('2026-01-11'),
          updates: [],
        },
      ]);
      service = makeService(prisma);
      const xml = await service.getRssFeed('my-status-page');
      expect(xml).toContain('[Resolved]');
    });

    it('escapes XML special characters', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true, title: 'Page <with> & "special" chars' }) });
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const xml = await service.getRssFeed('my-status-page');
      expect(xml).toContain('&lt;with&gt;');
      expect(xml).toContain('&amp;');
    });
  });

  // ── subscribeToStatusPage() ───────────────────────────────────────────────

  describe('subscribeToStatusPage()', () => {
    it('throws NotFoundException for missing page', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      await expect(service.subscribeToStatusPage('missing', 'test@example.com')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for unpublished page', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: false }) });
      service = makeService(prisma);
      await expect(service.subscribeToStatusPage('my-status-page', 'test@example.com')).rejects.toThrow(NotFoundException);
    });

    it('returns alreadySubscribed when email exists', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      (prisma.statusPageSubscriber.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'sub-1', email: 'test@example.com' });
      service = makeService(prisma);
      const result = await service.subscribeToStatusPage('my-status-page', 'test@example.com');
      expect(result.subscribed).toBe(false);
      expect(result.alreadySubscribed).toBe(true);
    });

    it('creates subscriber and sends confirmation email', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      (prisma.statusPageSubscriber.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const mockMailer = { sendStatusPageUpdateEmail: vi.fn().mockResolvedValue(undefined) };
      service = new StatusPagesService(prisma as never, mockMailer as never, noCacheService);
      const result = await service.subscribeToStatusPage('my-status-page', 'new@example.com');
      expect(result.subscribed).toBe(true);
      expect(result.alreadySubscribed).toBe(false);
      expect(prisma.statusPageSubscriber.create).toHaveBeenCalled();
      expect(mockMailer.sendStatusPageUpdateEmail).toHaveBeenCalledWith('new@example.com', expect.objectContaining({
        pageTitle: 'My Status Page',
      }));
    });

    it('handles mailer failure gracefully', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      (prisma.statusPageSubscriber.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const mockMailer = { sendStatusPageUpdateEmail: vi.fn().mockRejectedValue(new Error('SMTP fail')) };
      service = new StatusPagesService(prisma as never, mockMailer as never, noCacheService);
      // Should not throw even though mailer fails
      const result = await service.subscribeToStatusPage('my-status-page', 'new@example.com');
      expect(result.subscribed).toBe(true);
    });
  });

  // ── notifySubscribersOfIncident() ─────────────────────────────────────────

  describe('notifySubscribersOfIncident()', () => {
    function makePrismaForNotify() {
      const p = makePrisma({ page: makePage({ isPublished: true }) });
      (p.incident as Record<string, unknown>).findUnique = vi.fn().mockResolvedValue({
        id: 'inc-1', userId: 'user-1', title: 'API Down', severity: 'high',
        monitors: [{ monitorId: 'mon-1' }],
      });
      p.publicStatusPage.findMany = vi.fn().mockResolvedValue([
        { id: 'page-1', slug: 'my-status-page', title: 'My Status Page', layout: { widgets: [{ config: { monitorId: 'mon-1' } }] } },
      ]);
      (p as Record<string, unknown>).statusPageSubscriber = {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([
          { id: 'sub-1', statusPageId: 'page-1', email: 'sub@example.com', unsubscribeToken: 'tok-1' },
        ]),
        create: vi.fn(),
        delete: vi.fn(),
      };
      return p;
    }

    it('does nothing when incident not found', async () => {
      const p = makePrisma();
      (p.incident as Record<string, unknown>).findUnique = vi.fn().mockResolvedValue(null);
      service = makeService(p);
      await expect(service.notifySubscribersOfIncident('missing', 'created')).resolves.toBeUndefined();
    });

    it('does nothing when no affected pages', async () => {
      const p = makePrisma();
      (p.incident as Record<string, unknown>).findUnique = vi.fn().mockResolvedValue({
        id: 'inc-1', userId: 'user-1', title: 'Down', severity: 'high',
        monitors: [{ monitorId: 'mon-999' }],
      });
      p.publicStatusPage.findMany = vi.fn().mockResolvedValue([
        { id: 'page-1', slug: 's', title: 'T', layout: { widgets: [{ config: { monitorId: 'mon-other' } }] } },
      ]);
      service = makeService(p);
      await expect(service.notifySubscribersOfIncident('inc-1', 'created')).resolves.toBeUndefined();
    });

    it('does nothing when no subscribers', async () => {
      const p = makePrismaForNotify();
      (p as Record<string, unknown>).statusPageSubscriber = {
        ...p.statusPageSubscriber,
        findMany: vi.fn().mockResolvedValue([]),
      };
      service = makeService(p);
      await expect(service.notifySubscribersOfIncident('inc-1', 'created')).resolves.toBeUndefined();
    });

    it('sends emails to subscribers for created incidents', async () => {
      const p = makePrismaForNotify();
      const mockMailer = { sendStatusPageUpdateEmail: vi.fn().mockResolvedValue(undefined) };
      service = new StatusPagesService(p as never, mockMailer as never, noCacheService);
      await service.notifySubscribersOfIncident('inc-1', 'created');
      expect(mockMailer.sendStatusPageUpdateEmail).toHaveBeenCalledWith('sub@example.com', expect.objectContaining({
        headline: expect.stringContaining('New incident'),
      }));
    });

    it('sends resolved notification', async () => {
      const p = makePrismaForNotify();
      const mockMailer = { sendStatusPageUpdateEmail: vi.fn().mockResolvedValue(undefined) };
      service = new StatusPagesService(p as never, mockMailer as never, noCacheService);
      await service.notifySubscribersOfIncident('inc-1', 'resolved');
      expect(mockMailer.sendStatusPageUpdateEmail).toHaveBeenCalledWith('sub@example.com', expect.objectContaining({
        headline: expect.stringContaining('Resolved'),
      }));
    });
  });

  // ── getPreviewWidgetData() ────────────────────────────────────────────────

  describe('getPreviewWidgetData()', () => {
    it('throws NotFoundException when page not found', async () => {
      prisma = makePrisma({ page: null });
      service = makeService(prisma);
      await expect(service.getPreviewWidgetData('user-1', 'missing', 'w1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong owner', async () => {
      prisma = makePrisma({ page: makePage({ userId: 'user-2', layout: { widgets: [] } }) });
      service = makeService(prisma);
      await expect(service.getPreviewWidgetData('user-1', 'page-1', 'w1')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when widget not in layout', async () => {
      prisma = makePrisma({ page: makePage({ layout: { widgets: [{ id: 'w1', type: 'divider', config: {} }] } }) });
      service = makeService(prisma);
      await expect(service.getPreviewWidgetData('user-1', 'page-1', 'w-nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('returns widget data for valid request', async () => {
      const layout = { widgets: [{ id: 'w1', type: 'divider', config: {}, x: 0, y: 0, w: 12, h: 1 }] };
      prisma = makePrisma({ page: makePage({ layout }) });
      service = makeService(prisma);
      const result = await service.getPreviewWidgetData('user-1', 'page-1', 'w1');
      expect(result.widgetType).toBe('divider');
    });
  });

  // ── getPublicJson() — password branches ─────────────────────────────────

  describe('getPublicJson() — password-protected', () => {
    it('throws UnauthorizedException for wrong password on protected page', async () => {
      // Use a real bcrypt hash for 'correct-password'
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('correct-password', 10);
      prisma = makePrisma({ page: makePage({ isPublished: true, passwordHash: hash }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([]);
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      prisma.maintenanceWindow.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      await expect(service.getPublicJson('my-status-page', 'wrong-password')).rejects.toThrow(UnauthorizedException);
    });

    it('returns data with correct password on protected page', async () => {
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('correct-password', 10);
      prisma = makePrisma({ page: makePage({ isPublished: true, passwordHash: hash }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([]);
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      prisma.maintenanceWindow.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getPublicJson('my-status-page', 'correct-password');
      expect(result.overallStatus).toBe('operational');
    });

    it('includes active incidents in response', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([]);
      prisma.incident.findMany = vi.fn().mockResolvedValue([
        { id: 'inc-1', title: 'Outage', status: 'INVESTIGATING', severity: 'high', createdAt: new Date(), updates: [{ body: 'Looking', status: 'INVESTIGATING', createdAt: new Date() }] },
      ]);
      prisma.maintenanceWindow.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getPublicJson('my-status-page');
      expect((result.activeIncidents as unknown[]).length).toBe(1);
    });

    it('includes upcoming maintenance in response', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([]);
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      prisma.maintenanceWindow.findMany = vi.fn().mockResolvedValue([
        { id: 'mw-1', name: 'DB Upgrade', description: 'Upgrading', startsAt: new Date(), endsAt: new Date(Date.now() + 3600000) },
      ]);
      service = makeService(prisma);
      const result = await service.getPublicJson('my-status-page');
      expect((result.upcomingMaintenance as unknown[]).length).toBe(1);
    });

    it('handles monitors with no runs', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'm1', name: 'A', type: 'HTTP', runs: [] },
      ]);
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      prisma.maintenanceWindow.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getPublicJson('my-status-page');
      const monitors = result.monitors as Array<{ status: string; ok: unknown }>;
      expect(monitors[0].status).toBe('unknown');
      expect(monitors[0].ok).toBeNull();
    });
  });

  // ── Widget: metric-counter ────────────────────────────────────────────────

  describe('getWidgetData — metric-counter', () => {
    function setupMetricCounter(config: Record<string, unknown>) {
      const layout = { widgets: [{ id: 'mc1', type: 'metric-counter', config, x: 0, y: 0, w: 4, h: 2 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      return prisma;
    }

    it('returns uptime by default', async () => {
      const p = setupMetricCounter({});
      p.monitorRun.findMany = vi.fn().mockResolvedValue([
        { level: 'green' }, { level: 'green' }, { level: 'red' },
      ]);
      service = makeService(p);
      const result = await service.getWidgetData('my-status-page', 'mc1');
      expect(result.metricType).toBe('uptime');
      expect(result.suffix).toBe('%');
      expect(typeof result.value).toBe('number');
    });

    it('returns latency metric', async () => {
      const p = setupMetricCounter({ metricType: 'latency' });
      p.monitorRun.findMany = vi.fn().mockResolvedValue([
        { latencyMs: 100 }, { latencyMs: 200 },
      ]);
      service = makeService(p);
      const result = await service.getWidgetData('my-status-page', 'mc1');
      expect(result.metricType).toBe('latency');
      expect(result.suffix).toBe('ms');
      expect(result.value).toBe(150);
    });

    it('returns 0 avg latency when no runs', async () => {
      const p = setupMetricCounter({ metricType: 'latency' });
      p.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(p);
      const result = await service.getWidgetData('my-status-page', 'mc1');
      expect(result.value).toBe(0);
    });

    it('returns checks count', async () => {
      const p = setupMetricCounter({ metricType: 'checks' });
      p.monitorRun.count = vi.fn().mockResolvedValue(42);
      service = makeService(p);
      const result = await service.getWidgetData('my-status-page', 'mc1');
      expect(result.metricType).toBe('checks');
      expect(result.value).toBe(42);
    });

    it('returns incidents count', async () => {
      const p = setupMetricCounter({ metricType: 'incidents' });
      (p.incident as Record<string, unknown>).count = vi.fn().mockResolvedValue(5);
      service = makeService(p);
      const result = await service.getWidgetData('my-status-page', 'mc1');
      expect(result.metricType).toBe('incidents');
      expect(result.value).toBe(5);
    });

    it('uses custom label when configured', async () => {
      const p = setupMetricCounter({ metricType: 'uptime', label: 'My Custom Label' });
      p.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(p);
      const result = await service.getWidgetData('my-status-page', 'mc1');
      expect(result.label).toBe('My Custom Label');
    });
  });

  // ── Widget: monitor-group / monitor-group-status ──────────────────────────

  describe('getWidgetData — monitor-group / monitor-group-status', () => {
    it('returns type echo for monitor-group', async () => {
      const layout = { widgets: [{ id: 'mg1', type: 'monitor-group', config: {}, x: 0, y: 0, w: 12, h: 2 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'mg1');
      expect(result.type).toBe('monitor-group');
    });

    it('returns type echo for monitor-group-status', async () => {
      const layout = { widgets: [{ id: 'mgs1', type: 'monitor-group-status', config: {}, x: 0, y: 0, w: 12, h: 2 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'mgs1');
      expect(result.type).toBe('monitor-group-status');
    });
  });

  // ── Widget: last-updated-footer ───────────────────────────────────────────

  describe('getWidgetData — last-updated-footer', () => {
    it('returns lastUpdated and default autoRefreshSec', async () => {
      const layout = { widgets: [{ id: 'luf1', type: 'last-updated-footer', config: {}, x: 0, y: 0, w: 12, h: 1 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'luf1');
      expect(result.lastUpdated).toBeDefined();
      expect(result.autoRefreshSec).toBe(60);
    });

    it('uses configured autoRefreshSec', async () => {
      const layout = { widgets: [{ id: 'luf2', type: 'last-updated-footer', config: { autoRefreshSec: 120 }, x: 0, y: 0, w: 12, h: 1 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'luf2');
      expect(result.autoRefreshSec).toBe(120);
    });

    it('clamps autoRefreshSec to max 3600', async () => {
      const layout = { widgets: [{ id: 'luf3', type: 'last-updated-footer', config: { autoRefreshSec: 9999 }, x: 0, y: 0, w: 12, h: 1 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'luf3');
      expect(result.autoRefreshSec).toBe(3600);
    });
  });

  // ── Widget: response-time-heatmap ─────────────────────────────────────────

  describe('getWidgetData — response-time-heatmap', () => {
    it('returns _noConfig when no monitorId', async () => {
      const layout = { widgets: [{ id: 'rth1', type: 'response-time-heatmap', config: {}, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'rth1');
      expect(result._noConfig).toBe(true);
    });

    it('returns 7x24 grid with latency data', async () => {
      const layout = { widgets: [{ id: 'rth2', type: 'response-time-heatmap', config: { monitorId: 'mon-1' }, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      const now = new Date();
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { checkedAt: now, latencyMs: 120 },
        { checkedAt: now, latencyMs: 180 },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'rth2');
      expect(result.grid).toBeDefined();
      expect((result.grid as number[][]).length).toBe(7); // 7 days of week
      expect((result.grid as number[][])[0].length).toBe(24); // 24 hours
      expect(result.monitorId).toBe('mon-1');
    });

    it('returns zero stats when no runs', async () => {
      const layout = { widgets: [{ id: 'rth3', type: 'response-time-heatmap', config: { monitorId: 'mon-1' }, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'rth3');
      expect(result.minMs).toBe(0);
      expect(result.maxMs).toBe(0);
      expect(result.avgMs).toBe(0);
    });
  });

  // ── Widget: check-history-feed ────────────────────────────────────────────

  describe('getWidgetData — check-history-feed', () => {
    it('returns recent checks', async () => {
      const layout = { widgets: [{ id: 'chf1', type: 'check-history-feed', config: {}, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { id: 'r1', monitorId: 'mon-1', checkedAt: new Date(), ok: true, level: 'green', latencyMs: 100, message: 'OK', monitor: { name: 'Test' } },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'chf1');
      expect(result.checks).toBeDefined();
      expect((result.checks as unknown[]).length).toBe(1);
    });

    it('returns empty checks when none exist', async () => {
      const layout = { widgets: [{ id: 'chf2', type: 'check-history-feed', config: {}, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'chf2');
      expect((result.checks as unknown[]).length).toBe(0);
    });
  });

  // ── Widget: incident-history ──────────────────────────────────────────────

  describe('getWidgetData — incident-history', () => {
    it('returns incidents with updates and monitors', async () => {
      const layout = { widgets: [{ id: 'ih1', type: 'incident-history', config: {}, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.incident.findMany = vi.fn().mockResolvedValue([
        {
          id: 'inc-1', title: 'Outage', status: 'RESOLVED', severity: 'high',
          createdAt: new Date(), resolvedAt: new Date(),
          updates: [{ id: 'u1', body: 'Fixed', status: 'RESOLVED', createdAt: new Date() }],
          monitors: [{ monitor: { id: 'mon-1', name: 'API' } }],
        },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'ih1');
      expect(result.incidents).toBeDefined();
      expect((result.incidents as unknown[]).length).toBe(1);
      expect(result.periodDays).toBe(30);
    });

    it('uses custom periodDays', async () => {
      const layout = { widgets: [{ id: 'ih2', type: 'incident-history', config: { periodDays: 7 }, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'ih2');
      expect(result.periodDays).toBe(7);
    });
  });

  // ── Widget: scheduled-maintenance ─────────────────────────────────────────

  describe('getWidgetData — scheduled-maintenance', () => {
    it('returns upcoming maintenance windows', async () => {
      const layout = { widgets: [{ id: 'sm1', type: 'scheduled-maintenance', config: {}, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      const future = new Date(Date.now() + 86400000);
      prisma.maintenanceWindow.findMany = vi.fn().mockResolvedValue([
        {
          id: 'mw-1', name: 'DB Upgrade', description: 'Upgrading DB',
          startsAt: future, endsAt: new Date(future.getTime() + 7200000),
          monitors: [{ monitor: { id: 'mon-1', name: 'API' } }],
        },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sm1');
      expect(result.windows).toBeDefined();
      expect((result.windows as unknown[]).length).toBe(1);
    });

    it('returns empty windows when none scheduled', async () => {
      const layout = { widgets: [{ id: 'sm2', type: 'scheduled-maintenance', config: {}, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.maintenanceWindow.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sm2');
      expect((result.windows as unknown[]).length).toBe(0);
    });
  });

  // ── Widget: version-status-grid ───────────────────────────────────────────

  describe('getWidgetData — version-status-grid', () => {
    it('returns version monitors', async () => {
      const layout = { widgets: [{ id: 'vsg1', type: 'version-status-grid', config: {}, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', name: 'Grafana', type: 'GIT_RELEASE' },
      ]);
      prisma.monitorRun.findFirst = vi.fn().mockResolvedValue({
        level: 'green', message: 'current v10.0.0, latest v10.0.0', checkedAt: new Date(), latencyMs: 50,
      });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'vsg1');
      expect(result.monitors).toBeDefined();
    });

    it('filters to monitors with version info in message', async () => {
      const layout = { widgets: [{ id: 'vsg2', type: 'version-status-grid', config: {}, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', name: 'Has Version', type: 'GIT_RELEASE' },
        { id: 'mon-2', name: 'No Version', type: 'HTTP' },
      ]);
      prisma.monitorRun.findFirst = vi.fn()
        .mockResolvedValueOnce({ level: 'green', message: 'current v1.0.0, latest v1.0.0', checkedAt: new Date(), latencyMs: 50 })
        .mockResolvedValueOnce({ level: 'green', message: 'OK', checkedAt: new Date(), latencyMs: 50 });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'vsg2');
      expect((result.monitors as unknown[]).length).toBe(1);
    });
  });

  // ── Widget: dependency-map ────────────────────────────────────────────────

  describe('getWidgetData — dependency-map', () => {
    it('returns nodes and edges', async () => {
      const layout = { widgets: [{ id: 'dm1', type: 'dependency-map', config: { edges: [{ source: 'mon-1', target: 'mon-2' }] }, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', name: 'API', type: 'HTTP', runs: [{ level: 'green', checkedAt: new Date(), latencyMs: 100 }] },
        { id: 'mon-2', name: 'DB', type: 'TCP', runs: [{ level: 'green', checkedAt: new Date(), latencyMs: 50 }] },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'dm1');
      expect(result.nodes).toBeDefined();
      expect((result.nodes as unknown[]).length).toBe(2);
      expect(result.edges).toBeDefined();
    });

    it('uses specified monitorIds when configured', async () => {
      const layout = { widgets: [{ id: 'dm2', type: 'dependency-map', config: { monitorIds: ['mon-1'] }, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', name: 'API', type: 'HTTP', runs: [{ level: 'green', checkedAt: new Date(), latencyMs: 100 }] },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'dm2');
      expect(prisma.monitor.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['mon-1'] } }),
      }));
    });
  });

  // ── Widget: multi-environment-status ──────────────────────────────────────

  describe('getWidgetData — multi-environment-status', () => {
    it('returns environments with status summary', async () => {
      const layout = { widgets: [{ id: 'mes1', type: 'multi-environment-status', config: { envMonitors: { prod: ['mon-1'], staging: ['mon-2'] } }, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', name: 'Prod API', runs: [{ level: 'green' }] },
        { id: 'mon-2', name: 'Staging API', runs: [{ level: 'yellow' }] },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'mes1');
      expect(result.environments).toBeDefined();
      const envs = result.environments as Array<{ env: string; summary: string }>;
      expect(envs.length).toBe(2);
      expect(envs.find(e => e.env === 'prod')?.summary).toBe('operational');
      expect(envs.find(e => e.env === 'staging')?.summary).toBe('degraded');
    });

    it('returns empty environments when no envMonitors configured', async () => {
      const layout = { widgets: [{ id: 'mes2', type: 'multi-environment-status', config: {}, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'mes2');
      expect((result.environments as unknown[]).length).toBe(0);
    });

    it('reports outage when all monitors in env are down', async () => {
      const layout = { widgets: [{ id: 'mes3', type: 'multi-environment-status', config: { envMonitors: { prod: ['mon-1'] } }, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', name: 'Prod API', runs: [{ level: 'red' }] },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'mes3');
      const envs = result.environments as Array<{ env: string; summary: string }>;
      expect(envs[0].summary).toBe('outage');
    });
  });

  // ── Widget: region-status-map ─────────────────────────────────────────────

  describe('getWidgetData — region-status-map', () => {
    it('returns regions with status', async () => {
      const layout = { widgets: [{ id: 'rsm1', type: 'region-status-map', config: { regionMonitors: { 'us-east': ['mon-1'], 'eu-west': ['mon-2'] } }, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', name: 'US API', runs: [{ level: 'green' }] },
        { id: 'mon-2', name: 'EU API', runs: [{ level: 'red' }] },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'rsm1');
      const regions = result.regions as Array<{ region: string; status: string }>;
      expect(regions.length).toBe(2);
    });

    it('returns empty regions when no config', async () => {
      const layout = { widgets: [{ id: 'rsm2', type: 'region-status-map', config: {}, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'rsm2');
      expect((result.regions as unknown[]).length).toBe(0);
    });
  });

  // ── Widget: table-of-contents ─────────────────────────────────────────────

  describe('getWidgetData — table-of-contents', () => {
    it('returns items from config', async () => {
      const layout = { widgets: [{ id: 'toc1', type: 'table-of-contents', config: { items: [{ label: 'Section 1', anchor: '#s1' }] }, x: 0, y: 0, w: 12, h: 2 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'toc1');
      expect((result.items as unknown[]).length).toBe(1);
    });

    it('returns empty items when not configured', async () => {
      const layout = { widgets: [{ id: 'toc2', type: 'table-of-contents', config: {}, x: 0, y: 0, w: 12, h: 2 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'toc2');
      expect((result.items as unknown[]).length).toBe(0);
    });
  });

  // ── Widget: page-navigation ───────────────────────────────────────────────

  describe('getWidgetData — page-navigation', () => {
    it('returns other published pages', async () => {
      const layout = { widgets: [{ id: 'pn1', type: 'page-navigation', config: {}, x: 0, y: 0, w: 12, h: 2 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.publicStatusPage.findMany = vi.fn().mockResolvedValue([
        { slug: 'page-a', title: 'Page A', description: 'First page' },
        { slug: 'page-b', title: 'Page B', description: 'Second page' },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'pn1');
      expect((result.pages as unknown[]).length).toBe(2);
    });
  });

  // ── Widget: column-layout ─────────────────────────────────────────────────

  describe('getWidgetData — column-layout', () => {
    it('returns default 2 columns', async () => {
      const layout = { widgets: [{ id: 'cl1', type: 'column-layout', config: {}, x: 0, y: 0, w: 12, h: 2 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'cl1');
      expect(result.columns).toBe(2);
    });

    it('uses configured columns', async () => {
      const layout = { widgets: [{ id: 'cl2', type: 'column-layout', config: { columns: 3 }, x: 0, y: 0, w: 12, h: 2 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'cl2');
      expect(result.columns).toBe(3);
    });
  });

  // ── Widget: sticky-header ─────────────────────────────────────────────────

  describe('getWidgetData — sticky-header', () => {
    it('returns operational when no monitors down', async () => {
      const layout = { widgets: [{ id: 'sh1', type: 'sticky-header', config: {}, x: 0, y: 0, w: 12, h: 1 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([{ id: 'mon-1' }]);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([{ monitorId: 'mon-1', level: 'green' }]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sh1');
      expect(result.status).toBe('operational');
      expect(result.monitorCount).toBe(1);
    });

    it('returns outage when monitor is red', async () => {
      const layout = { widgets: [{ id: 'sh2', type: 'sticky-header', config: {}, x: 0, y: 0, w: 12, h: 1 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([{ id: 'mon-1' }]);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([{ monitorId: 'mon-1', level: 'red' }]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sh2');
      expect(result.status).toBe('outage');
    });

    it('returns degraded when monitor is yellow', async () => {
      const layout = { widgets: [{ id: 'sh3', type: 'sticky-header', config: {}, x: 0, y: 0, w: 12, h: 1 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([{ id: 'mon-1' }]);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([{ monitorId: 'mon-1', level: 'yellow' }]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sh3');
      expect(result.status).toBe('degraded');
    });

    it('returns operational with 0 monitors when none exist', async () => {
      const layout = { widgets: [{ id: 'sh4', type: 'sticky-header', config: {}, x: 0, y: 0, w: 12, h: 1 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sh4');
      expect(result.status).toBe('operational');
      expect(result.monitorCount).toBe(0);
    });
  });

  // ── Widget: offline-banner ────────────────────────────────────────────────

  describe('getWidgetData — offline-banner', () => {
    it('returns config echo', async () => {
      const layout = { widgets: [{ id: 'ob1', type: 'offline-banner', config: { message: 'You are offline' }, x: 0, y: 0, w: 12, h: 1 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'ob1');
      expect(result.type).toBe('offline-banner');
      expect((result.config as Record<string, unknown>).message).toBe('You are offline');
    });
  });

  // ── Widget: custom-metric-chart ───────────────────────────────────────────

  describe('getWidgetData — custom-metric-chart', () => {
    it('returns empty when no monitorId', async () => {
      const layout = { widgets: [{ id: 'cmc1', type: 'custom-metric-chart', config: {}, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'cmc1');
      expect(result.labels).toEqual([]);
      expect(result.values).toEqual([]);
    });

    it('returns latency buckets for metric=latency', async () => {
      const layout = { widgets: [{ id: 'cmc2', type: 'custom-metric-chart', config: { monitorId: 'mon-1', metric: 'latency', timeRange: 24 }, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { checkedAt: new Date(), latencyMs: 100 },
        { checkedAt: new Date(), latencyMs: 200 },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'cmc2');
      expect(result.unit).toBe('ms');
      expect(result.labels).toBeDefined();
      expect(result.values).toBeDefined();
    });

    it('returns uptime buckets for metric=uptime', async () => {
      const layout = { widgets: [{ id: 'cmc3', type: 'custom-metric-chart', config: { monitorId: 'mon-1', metric: 'uptime', timeRange: 24 }, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { checkedAt: new Date(), level: 'green' },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'cmc3');
      expect(result.unit).toBe('%');
    });

    it('returns checks count buckets for metric=checks', async () => {
      const layout = { widgets: [{ id: 'cmc4', type: 'custom-metric-chart', config: { monitorId: 'mon-1', metric: 'checks', timeRange: 24 }, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { checkedAt: new Date() },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'cmc4');
      expect(result.unit).toBe('checks');
    });

    it('returns empty for unknown metric', async () => {
      const layout = { widgets: [{ id: 'cmc5', type: 'custom-metric-chart', config: { monitorId: 'mon-1', metric: 'unknown-metric' }, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'cmc5');
      expect(result.labels).toEqual([]);
      expect(result.values).toEqual([]);
    });

    it('uses 6h buckets for weekly time range', async () => {
      const layout = { widgets: [{ id: 'cmc6', type: 'custom-metric-chart', config: { monitorId: 'mon-1', metric: 'latency', timeRange: 168 }, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'cmc6');
      // 168h / 6h buckets = 28 labels
      expect((result.labels as string[]).length).toBe(28);
    });

    it('uses daily buckets for monthly time range', async () => {
      const layout = { widgets: [{ id: 'cmc7', type: 'custom-metric-chart', config: { monitorId: 'mon-1', metric: 'latency', timeRange: 720 }, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'cmc7');
      // 720h / 24h buckets = 30 labels
      expect((result.labels as string[]).length).toBe(30);
    });
  });

  // ── Widget: multi-status-badges ───────────────────────────────────────────

  describe('getWidgetData — multi-status-badges', () => {
    it('returns monitors for multi-status-badges type', async () => {
      const layout = { widgets: [{ id: 'msb1', type: 'multi-status-badges', config: {}, x: 0, y: 0, w: 12, h: 2 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', name: 'API', type: 'HTTP', runs: [{ level: 'green', latencyMs: 100, checkedAt: new Date() }], monitorTags: [{ tag: { name: 'prod' } }] },
      ]);
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'msb1');
      expect(result.monitors).toBeDefined();
      expect(result.summary).toBeDefined();
    });
  });

  // ── Widget: security-advisory ─────────────────────────────────────────────

  describe('getWidgetData — security-advisory', () => {
    it('returns empty advisories when no packageName', async () => {
      const layout = { widgets: [{ id: 'sa1', type: 'security-advisory', config: {}, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'sa1');
      expect(result.advisories).toEqual([]);
      expect(result.packageName).toBe('');
    });
  });

  // ── Widget: third-party-dependencies ──────────────────────────────────────

  describe('getWidgetData — third-party-dependencies', () => {
    it('returns empty when no services configured', async () => {
      const layout = { widgets: [{ id: 'tpd1', type: 'third-party-dependencies', config: {}, x: 0, y: 0, w: 12, h: 4 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'tpd1');
      expect(result.services).toEqual([]);
    });
  });

  // ── Content-only widgets (additional types) ───────────────────────────────

  describe('getWidgetData — additional content-only widgets', () => {
    const additionalContentTypes = ['tab-container', 'collapsible-section', 'data-table', 'changelog-widget'];

    for (const wtype of additionalContentTypes) {
      it(`returns config echo for ${wtype}`, async () => {
        const layout = {
          widgets: [{ id: 'acw1', type: wtype, config: { field: 'value' }, x: 0, y: 0, w: 12, h: 2 }],
        };
        prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
        service = makeService(prisma);
        const result = await service.getWidgetData('my-status-page', 'acw1');
        expect(result.widgetType).toBe(wtype);
        expect((result.config as Record<string, unknown>).field).toBe('value');
      });
    }
  });

  // ── Widget: default case (unknown type) ───────────────────────────────────

  describe('getWidgetData — unknown widget type', () => {
    it('returns not-implemented message for unknown type', async () => {
      const layout = { widgets: [{ id: 'unk1', type: 'totally-unknown-widget', config: {}, x: 0, y: 0, w: 12, h: 2 }] };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      const result = await service.getWidgetData('my-status-page', 'unk1');
      expect(result.message).toContain('not yet implemented');
    });
  });

  // ── findPublic() — additional branches ────────────────────────────────────

  describe('findPublic() — additional branches', () => {
    it('returns monitorSummary with correct shape', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        {
          id: 'mon-1', name: 'API', type: 'HTTP', folderId: 'f1',
          folder: { id: 'f1', name: 'Production' },
          monitorTags: [{ tag: { id: 't1', name: 'critical' } }],
          runs: [{ level: 'green', message: 'OK', latencyMs: 120, checkedAt: new Date() }],
        },
      ]);
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      prisma.maintenanceWindow.findMany = vi.fn().mockResolvedValue([]);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.findPublic('my-status-page');
      expect(result.monitors[0].folderName).toBe('Production');
      expect(result.monitors[0].tags).toContain('critical');
    });

    it('returns maintenance windows with mapped monitors', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([]);
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      prisma.maintenanceWindow.findMany = vi.fn().mockResolvedValue([
        {
          id: 'mw-1', name: 'DB Upgrade', description: 'Upgrading',
          startsAt: new Date(), endsAt: new Date(Date.now() + 3600000),
          monitors: [{ monitor: { id: 'mon-1', name: 'API' } }],
        },
      ]);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.findPublic('my-status-page');
      expect(result.maintenance[0].monitors[0].name).toBe('API');
    });

    it('returns recentChecks with correct shape', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([]);
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      prisma.maintenanceWindow.findMany = vi.fn().mockResolvedValue([]);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { id: 'r1', monitorId: 'mon-1', checkedAt: new Date(), ok: true, level: 'green', latencyMs: 100, message: 'OK', monitor: { name: 'API' } },
      ]);
      service = makeService(prisma);
      const result = await service.findPublic('my-status-page');
      expect(result.recentChecks[0].monitorName).toBe('API');
    });

    it('handles monitor with no runs', async () => {
      prisma = makePrisma({ page: makePage({ isPublished: true }) });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'mon-1', name: 'API', type: 'HTTP', folderId: null, folder: null, monitorTags: [], runs: [] },
      ]);
      prisma.incident.findMany = vi.fn().mockResolvedValue([]);
      prisma.maintenanceWindow.findMany = vi.fn().mockResolvedValue([]);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([]);
      service = makeService(prisma);
      const result = await service.findPublic('my-status-page');
      expect(result.monitors[0].level).toBe('green');
      expect(result.monitors[0].lastChecked).toBeNull();
    });
  });
});
