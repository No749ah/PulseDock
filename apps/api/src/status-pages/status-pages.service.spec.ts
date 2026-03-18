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
    },
    incident: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    maintenanceWindow: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function makeService(prismaOverride?: ReturnType<typeof makePrisma>) {
  return new StatusPagesService((prismaOverride ?? makePrisma()) as never);
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

    it('throws UnauthorizedException when password not provided for protected page', async () => {
      prisma = makePrisma({
        page: makePage({ isPublished: true, passwordHash: '$2a$12$fakehash' }),
      });
      service = makeService(prisma);
      await expect(service.findPublic('my-status-page')).rejects.toThrow(UnauthorizedException);
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

    it('throws BadRequestException for uptime-bar without monitorId', async () => {
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
      await expect(service.getWidgetData('my-status-page', 'w1')).rejects.toThrow(
        BadRequestException,
      );
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

    it('throws BadRequestException for current-status-badge without monitorId', async () => {
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
      await expect(service.getWidgetData('my-status-page', 'w2')).rejects.toThrow(
        BadRequestException,
      );
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

    it('uptime-timeline throws BadRequestException without monitorId', async () => {
      const layout = {
        widgets: [{ id: 'wt5', type: 'uptime-timeline', config: {}, x: 0, y: 0, w: 12, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      await expect(service.getWidgetData('my-status-page', 'wt5')).rejects.toThrow(
        BadRequestException,
      );
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

    it('throws BadRequestException when monitorId is missing', async () => {
      const layout = {
        widgets: [{ id: 'rt4', type: 'response-time-chart', config: {}, x: 0, y: 0, w: 12, h: 3 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      await expect(service.getWidgetData('my-status-page', 'rt4')).rejects.toThrow(BadRequestException);
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

    it('throws BadRequestException when monitorId is missing', async () => {
      const layout = {
        widgets: [{ id: 'sla5', type: 'sla-summary', config: {}, x: 0, y: 0, w: 12, h: 2 }],
      };
      prisma = makePrisma({ page: makePage({ isPublished: true, layout }) });
      service = makeService(prisma);
      await expect(service.getWidgetData('my-status-page', 'sla5')).rejects.toThrow(BadRequestException);
    });
  });
});
