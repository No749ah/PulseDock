import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BackupService } from './backup.service';
import { PrismaService } from '../common/prisma.service';
import { BadRequestException } from '@nestjs/common';

const makePrisma = () => ({
  monitor: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  folder: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  tag: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  alertChannel: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  publicStatusPage: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  userSettings: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  monitorTag: {
    create: vi.fn(),
  },
});

describe('BackupService', () => {
  let service: BackupService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<BackupService>(BackupService);
    vi.clearAllMocks();
  });

  // ── exportBackup ──────────────────────────────────────────────────────────

  describe('exportBackup()', () => {
    it('returns a version-2 backup document with all user data', async () => {
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.folder.findMany.mockResolvedValue([]);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.alertChannel.findMany.mockResolvedValue([]);
      prisma.publicStatusPage.findMany.mockResolvedValue([]);
      prisma.userSettings.findUnique.mockResolvedValue(null);

      const doc = await service.exportBackup('user-1');

      expect(doc.version).toBe('2');
      expect(doc.exportedAt).toBeTruthy();
      expect(Array.isArray(doc.monitors)).toBe(true);
      expect(Array.isArray(doc.folders)).toBe(true);
      expect(Array.isArray(doc.tags)).toBe(true);
      expect(Array.isArray(doc.alertChannels)).toBe(true);
      expect(Array.isArray(doc.statusPages)).toBe(true);
    });

    it('includes monitor data with tags', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        {
          id: 'm1', name: 'My API', type: 'HTTP', target: 'https://api.example.com',
          intervalSec: 60, timeoutMs: 5000, confirmations: 1, enabled: true,
          configJson: { method: 'GET' }, description: 'Health check',
          slaTarget: null, slaPeriodDays: null, folderId: null,
          folder: null,
          monitorTags: [{ tag: { name: 'production' } }],
        },
      ]);
      prisma.folder.findMany.mockResolvedValue([]);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.alertChannel.findMany.mockResolvedValue([]);
      prisma.publicStatusPage.findMany.mockResolvedValue([]);
      prisma.userSettings.findUnique.mockResolvedValue(null);

      const doc = await service.exportBackup('user-1');

      expect(doc.monitors).toHaveLength(1);
      expect(doc.monitors[0].name).toBe('My API');
      expect((doc.monitors[0] as unknown as Record<string, unknown>).tagNames).toEqual(['production']);
    });

    it('includes folders and tags', async () => {
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.folder.findMany.mockResolvedValue([{ id: 'f1', name: 'Production', userId: 'u1', createdAt: new Date() }]);
      prisma.tag.findMany.mockResolvedValue([{ id: 't1', name: 'prod', color: '#22c55e', userId: 'u1' }]);
      prisma.alertChannel.findMany.mockResolvedValue([]);
      prisma.publicStatusPage.findMany.mockResolvedValue([]);
      prisma.userSettings.findUnique.mockResolvedValue(null);

      const doc = await service.exportBackup('user-1');

      expect(doc.folders).toEqual([{ name: 'Production' }]);
      expect(doc.tags).toEqual([{ name: 'prod', color: '#22c55e' }]);
    });

    it('includes settings when present', async () => {
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.folder.findMany.mockResolvedValue([]);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.alertChannel.findMany.mockResolvedValue([]);
      prisma.publicStatusPage.findMany.mockResolvedValue([]);
      prisma.userSettings.findUnique.mockResolvedValue({
        userId: 'user-1', retentionDays: 90, rollupEnabled: true,
        workspaceName: 'My Workspace', workspaceSlug: null, workspaceLogo: null, workspaceWebsite: null,
      });

      const doc = await service.exportBackup('user-1');

      expect(doc.settings).toBeTruthy();
      expect(doc.settings?.retentionDays).toBe(90);
    });
  });

  // ── restoreBackup ─────────────────────────────────────────────────────────

  describe('restoreBackup()', () => {
    it('throws BadRequestException for invalid backup document (missing version)', async () => {
      await expect(
        service.restoreBackup('user-1', { exportedAt: '2026-01-01', monitors: [] } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when monitors is not an array', async () => {
      await expect(
        service.restoreBackup('user-1', { version: '2', exportedAt: '2026-01-01', monitors: 'bad' as never } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns zeroed result for empty backup', async () => {
      prisma.folder.findMany.mockResolvedValue([]);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.alertChannel.findMany.mockResolvedValue([]);
      prisma.publicStatusPage.findMany.mockResolvedValue([]);
      prisma.userSettings.findUnique.mockResolvedValue(null);

      const result = await service.restoreBackup('user-1', {
        version: '2',
        exportedAt: '2026-01-01T00:00:00Z',
        monitors: [],
        folders: [],
        tags: [],
        alertChannels: [],
        statusPages: [],
      } as never);

      expect(result.monitors.created).toBe(0);
      expect(result.monitors.skipped).toBe(0);
      expect(result.folders.created).toBe(0);
      expect(result.tags.created).toBe(0);
    });

    it('creates new folders and skips existing ones', async () => {
      prisma.folder.findMany
        .mockResolvedValueOnce([{ name: 'Production' }]) // existing folders
        .mockResolvedValue([]); // other calls
      prisma.folder.findFirst.mockResolvedValue({ id: 'existing-f1' });
      prisma.folder.create.mockResolvedValue({ id: 'new-f1', name: 'Staging' });
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.alertChannel.findMany.mockResolvedValue([]);
      prisma.publicStatusPage.findMany.mockResolvedValue([]);
      prisma.userSettings.findUnique.mockResolvedValue(null);

      const result = await service.restoreBackup('user-1', {
        version: '2',
        exportedAt: '2026-01-01T00:00:00Z',
        monitors: [],
        folders: [{ name: 'Production' }, { name: 'Staging' }],
        tags: [],
      } as never);

      expect(result.folders.created).toBe(1); // Staging
      expect(result.folders.skipped).toBe(1); // Production
    });

    it('creates new tags and skips existing ones', async () => {
      prisma.folder.findMany.mockResolvedValue([]);
      prisma.tag.findMany.mockResolvedValue([{ name: 'prod', id: 'tag-1' }]);
      prisma.tag.create.mockResolvedValue({ id: 'tag-2', name: 'staging', color: '#999' });
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.alertChannel.findMany.mockResolvedValue([]);
      prisma.publicStatusPage.findMany.mockResolvedValue([]);
      prisma.userSettings.findUnique.mockResolvedValue(null);

      const result = await service.restoreBackup('user-1', {
        version: '2',
        exportedAt: '2026-01-01T00:00:00Z',
        monitors: [],
        folders: [],
        tags: [{ name: 'prod', color: '#22c55e' }, { name: 'staging', color: '#999' }],
      } as never);

      expect(result.tags.created).toBe(1);
      expect(result.tags.skipped).toBe(1);
    });

    it('creates new monitors and skips existing by type:target key', async () => {
      prisma.folder.findMany.mockResolvedValue([]);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.monitor.findMany.mockResolvedValue([
        { target: 'https://existing.com', type: 'HTTP' },
      ]);
      prisma.monitor.create.mockResolvedValue({ id: 'new-mon' });
      prisma.monitorTag.create.mockResolvedValue({});
      prisma.alertChannel.findMany.mockResolvedValue([]);
      prisma.publicStatusPage.findMany.mockResolvedValue([]);
      prisma.userSettings.findUnique.mockResolvedValue(null);

      const result = await service.restoreBackup('user-1', {
        version: '2',
        exportedAt: '2026-01-01T00:00:00Z',
        monitors: [
          { name: 'Existing', type: 'HTTP', target: 'https://existing.com', intervalSec: 60, enabled: true },
          { name: 'New API', type: 'HTTP', target: 'https://new.com', intervalSec: 60, enabled: true },
        ],
        folders: [],
        tags: [],
      } as never);

      expect(result.monitors.skipped).toBe(1);
      expect(result.monitors.created).toBe(1);
    });

    it('creates alert channels and skips existing by type:name key', async () => {
      prisma.folder.findMany.mockResolvedValue([]);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.alertChannel.findMany.mockResolvedValue([
        { name: 'Slack', type: 'slack' },
      ]);
      prisma.alertChannel.create.mockResolvedValue({ id: 'ac-new' });
      prisma.publicStatusPage.findMany.mockResolvedValue([]);
      prisma.userSettings.findUnique.mockResolvedValue(null);

      const result = await service.restoreBackup('user-1', {
        version: '2',
        exportedAt: '2026-01-01T00:00:00Z',
        monitors: [],
        folders: [],
        tags: [],
        alertChannels: [
          { name: 'Slack', type: 'slack', config: {} },
          { name: 'Discord', type: 'discord', config: { webhookUrl: 'https://discord.com/hook' } },
        ],
        statusPages: [],
      } as never);

      expect(result.alertChannels.skipped).toBe(1); // Slack exists
      expect(result.alertChannels.created).toBe(1); // Discord new
    });

    it('creates status pages and skips existing by slug or title', async () => {
      prisma.folder.findMany.mockResolvedValue([]);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.alertChannel.findMany.mockResolvedValue([]);
      prisma.publicStatusPage.findFirst
        .mockResolvedValueOnce({ id: 'sp-existing' }) // first page exists by slug
        .mockResolvedValueOnce(null)  // second page not found by slug/title
        .mockResolvedValueOnce(null); // slug not taken either
      prisma.publicStatusPage.create.mockResolvedValue({ id: 'sp-new' });
      prisma.userSettings.findUnique.mockResolvedValue(null);

      const result = await service.restoreBackup('user-1', {
        version: '2',
        exportedAt: '2026-01-01T00:00:00Z',
        monitors: [],
        folders: [],
        tags: [],
        alertChannels: [],
        statusPages: [
          { title: 'Existing Page', slug: 'existing', isPublished: true, layout: {} },
          { title: 'New Page', slug: 'new-page', isPublished: true, layout: { widgets: [] } },
        ],
      } as never);

      expect(result.statusPages.skipped).toBe(1);
      expect(result.statusPages.created).toBe(1);
    });

    it('suffixes slug with -restored when slug is taken by another user', async () => {
      prisma.folder.findMany.mockResolvedValue([]);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.alertChannel.findMany.mockResolvedValue([]);
      prisma.publicStatusPage.findFirst
        .mockResolvedValueOnce(null)  // not found by slug OR title for this user
        .mockResolvedValueOnce({ id: 'sp-conflict' }); // slug taken by someone else
      prisma.publicStatusPage.create.mockResolvedValue({ id: 'sp-restored' });
      prisma.userSettings.findUnique.mockResolvedValue(null);

      const result = await service.restoreBackup('user-1', {
        version: '2',
        exportedAt: '2026-01-01T00:00:00Z',
        monitors: [],
        folders: [],
        tags: [],
        alertChannels: [],
        statusPages: [
          { title: 'My Status', slug: 'taken-slug', isPublished: true, layout: {} },
        ],
      } as never);

      expect(result.statusPages.created).toBe(1);
      expect(prisma.publicStatusPage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'taken-slug-restored' }),
        }),
      );
    });

    it('restores settings with valid retentionDays', async () => {
      prisma.folder.findMany.mockResolvedValue([]);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.alertChannel.findMany.mockResolvedValue([]);
      prisma.publicStatusPage.findMany.mockResolvedValue([]);
      prisma.userSettings.upsert.mockResolvedValue({});

      const result = await service.restoreBackup('user-1', {
        version: '2',
        exportedAt: '2026-01-01T00:00:00Z',
        monitors: [],
        folders: [],
        tags: [],
        alertChannels: [],
        statusPages: [],
        settings: { retentionDays: 30 },
      } as never);

      expect(result.settings.updated).toBe(true);
      expect(prisma.userSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ retentionDays: 30 }),
          update: expect.objectContaining({ retentionDays: 30 }),
        }),
      );
    });

    it('falls back to 90 days when retentionDays is not a valid value', async () => {
      prisma.folder.findMany.mockResolvedValue([]);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.alertChannel.findMany.mockResolvedValue([]);
      prisma.publicStatusPage.findMany.mockResolvedValue([]);
      prisma.userSettings.upsert.mockResolvedValue({});

      const result = await service.restoreBackup('user-1', {
        version: '2',
        exportedAt: '2026-01-01T00:00:00Z',
        monitors: [],
        folders: [],
        tags: [],
        alertChannels: [],
        statusPages: [],
        settings: { retentionDays: 42 }, // not in validValues
      } as never);

      expect(result.settings.updated).toBe(true);
      expect(prisma.userSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ retentionDays: 90 }),
        }),
      );
    });

    it('does not update settings when retentionDays is falsy', async () => {
      prisma.folder.findMany.mockResolvedValue([]);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.alertChannel.findMany.mockResolvedValue([]);
      prisma.publicStatusPage.findMany.mockResolvedValue([]);

      const result = await service.restoreBackup('user-1', {
        version: '2',
        exportedAt: '2026-01-01T00:00:00Z',
        monitors: [],
        folders: [],
        tags: [],
        alertChannels: [],
        statusPages: [],
        settings: { retentionDays: 0 },
      } as never);

      expect(result.settings.updated).toBe(false);
      expect(prisma.userSettings.upsert).not.toHaveBeenCalled();
    });

    it('creates monitors with folder and tag associations', async () => {
      prisma.folder.findMany.mockResolvedValue([]);
      prisma.folder.create.mockResolvedValue({ id: 'folder-1', name: 'Prod' });
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.tag.create.mockResolvedValue({ id: 'tag-1', name: 'critical' });
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.monitor.create.mockResolvedValue({ id: 'mon-1' });
      prisma.monitorTag.create.mockResolvedValue({});
      prisma.alertChannel.findMany.mockResolvedValue([]);
      prisma.publicStatusPage.findMany.mockResolvedValue([]);
      prisma.userSettings.findUnique.mockResolvedValue(null);

      const result = await service.restoreBackup('user-1', {
        version: '2',
        exportedAt: '2026-01-01T00:00:00Z',
        monitors: [{
          name: 'API',
          type: 'HTTP',
          target: 'https://api.example.com',
          intervalSec: 60,
          timeoutMs: 5000,
          confirmations: 1,
          enabled: true,
          config: {},
          folderName: 'Prod',
          tagNames: ['critical'],
        }],
        folders: [{ name: 'Prod' }],
        tags: [{ name: 'critical' }],
        alertChannels: [],
        statusPages: [],
      } as never);

      expect(result.folders.created).toBe(1);
      expect(result.tags.created).toBe(1);
      expect(result.monitors.created).toBe(1);
      expect(prisma.monitorTag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ monitorId: 'mon-1', tagId: 'tag-1' }),
        }),
      );
    });

    it('includes alert channel and status page data in export', async () => {
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.folder.findMany.mockResolvedValue([]);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.alertChannel.findMany.mockResolvedValue([
        { id: 'ac-1', name: 'Slack', type: 'slack', configJson: { webhookUrl: 'https://hook' }, userId: 'u1', createdAt: new Date() },
      ]);
      prisma.publicStatusPage.findMany.mockResolvedValue([
        { title: 'Status', slug: 'status', description: 'desc', isPublished: true, layout: { widgets: [] } },
      ]);
      prisma.userSettings.findUnique.mockResolvedValue(null);

      const doc = await service.exportBackup('user-1');

      expect(doc.alertChannels).toHaveLength(1);
      expect(doc.alertChannels[0].name).toBe('Slack');
      expect(doc.statusPages).toHaveLength(1);
      expect(doc.statusPages[0].slug).toBe('status');
    });

    it('records monitor errors without throwing', async () => {
      prisma.folder.findMany.mockResolvedValue([]);
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.monitor.create.mockRejectedValue(new Error('DB constraint'));
      prisma.alertChannel.findMany.mockResolvedValue([]);
      prisma.publicStatusPage.findMany.mockResolvedValue([]);
      prisma.userSettings.findUnique.mockResolvedValue(null);

      const result = await service.restoreBackup('user-1', {
        version: '2',
        exportedAt: '2026-01-01T00:00:00Z',
        monitors: [{ name: 'Broken', type: 'HTTP', target: 'https://fail.com', intervalSec: 60, enabled: true }],
        folders: [],
        tags: [],
      } as never);

      expect(result.monitors.errors).toHaveLength(1);
      expect(result.monitors.errors[0]).toContain('Broken');
    });
  });
});
