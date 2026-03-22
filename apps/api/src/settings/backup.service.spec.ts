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
