import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { MonitorsExportService } from './monitors-export.service';

// Minimal mock setup for the service
function makeService(prismaMock: Record<string, unknown>) {
  return new (MonitorsExportService as unknown as new (...args: unknown[]) => MonitorsExportService)(prismaMock, // checksService
    {} as never, {} as never);
}

const mockMonitor = {
  id: 'mon-1',
  userId: 'user-1',
  name: 'My API',
  type: 'HTTP',
  target: 'https://api.example.com/health',
  intervalSec: 60,
  enabled: true,
  timeoutMs: 5000,
  retryCount: 0,
  confirmations: 1,
  folder: { name: 'Production' },
  configJson: { expectedStatus: 200 },
  slaTarget: 99.9,
  createdAt: new Date('2026-01-01'),
  monitorTags: [{ tag: { name: 'production' } }, { tag: { name: 'api' } }],
  monitorAlerts: [
    { alertChannel: { name: 'Slack #alerts' } },
    { alertChannel: { name: 'PagerDuty' } },
  ],
};

describe('MonitorsService — exportMonitorsConfig', () => {
  it('returns correct JSON structure with version, exportedAt, and monitors array', async () => {
    const prisma = {
      monitor: {
        findMany: vi.fn().mockResolvedValue([mockMonitor]),
      },
    };
    const service = makeService(prisma);

    const result = await service.exportMonitorsConfig('user-1', {
      format: 'json',
      includeAlertChannels: false,
    });

    const parsed = JSON.parse(result.content);
    expect(parsed.version).toBe('1');
    expect(typeof parsed.exportedAt).toBe('string');
    expect(Array.isArray(parsed.monitors)).toBe(true);
    expect(parsed.monitors).toHaveLength(1);
    expect(parsed.monitors[0].name).toBe('My API');
    expect(parsed.monitors[0].type).toBe('HTTP');
    expect(result.contentType).toBe('application/json');
    expect(result.filename).toMatch(/pulsedock-monitors-.+\.json/);
  });

  it('filters by ids when provided', async () => {
    const prisma = {
      monitor: {
        findMany: vi.fn().mockResolvedValue([mockMonitor]),
      },
    };
    const service = makeService(prisma);

    await service.exportMonitorsConfig('user-1', {
      format: 'json',
      ids: ['mon-1'],
      includeAlertChannels: false,
    });

    expect(prisma.monitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', id: { in: ['mon-1'] } },
      }),
    );
  });

  it('includes alertChannelNames when includeAlertChannels is true', async () => {
    const prisma = {
      monitor: {
        findMany: vi.fn().mockResolvedValue([mockMonitor]),
      },
    };
    const service = makeService(prisma);

    const result = await service.exportMonitorsConfig('user-1', {
      format: 'json',
      includeAlertChannels: true,
    });

    const parsed = JSON.parse(result.content);
    expect(parsed.monitors[0].alertChannelNames).toEqual(['Slack #alerts', 'PagerDuty']);
  });
});

describe('MonitorsService — importMonitorsConfig', () => {
  it('creates new monitors from valid JSON config', async () => {
    const createdMonitor = { id: 'new-mon-1', name: 'My API' };
    const prisma = {
      monitor: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdMonitor),
      },
    };
    const service = makeService(prisma);

    const config = JSON.stringify({
      version: '1',
      exportedAt: new Date().toISOString(),
      monitors: [
        {
          name: 'My API',
          type: 'HTTP',
          target: 'https://api.example.com/health',
          intervalSec: 60,
          enabled: true,
          timeoutMs: 5000,
          retryCount: 0,
          confirmations: 1,
          config: {},
        },
      ],
    });

    const result = await service.importMonitorsConfig('user-1', {
      format: 'json',
      content: config,
      dryRun: false,
      overwriteExisting: false,
    });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.monitors[0].action).toBe('created');
    expect(result.monitors[0].id).toBe('new-mon-1');
  });

  it('skips existing monitors when overwriteExisting is false', async () => {
    const existingMonitor = { id: 'existing-1', name: 'My API' };
    const prisma = {
      monitor: {
        findFirst: vi.fn().mockResolvedValue(existingMonitor),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
    const service = makeService(prisma);

    const config = JSON.stringify({
      version: '1',
      exportedAt: new Date().toISOString(),
      monitors: [
        {
          name: 'My API',
          type: 'HTTP',
          target: 'https://api.example.com/health',
        },
      ],
    });

    const result = await service.importMonitorsConfig('user-1', {
      format: 'json',
      content: config,
      dryRun: false,
      overwriteExisting: false,
    });

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(result.monitors[0].action).toBe('skipped');
    expect(prisma.monitor.create).not.toHaveBeenCalled();
    expect(prisma.monitor.update).not.toHaveBeenCalled();
  });

  it('dryRun returns results without creating anything', async () => {
    const prisma = {
      monitor: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
    const service = makeService(prisma);

    const config = JSON.stringify({
      version: '1',
      exportedAt: new Date().toISOString(),
      monitors: [
        {
          name: 'Dry Run Monitor',
          type: 'HTTP',
          target: 'https://example.com',
        },
      ],
    });

    const result = await service.importMonitorsConfig('user-1', {
      format: 'json',
      content: config,
      dryRun: true,
      overwriteExisting: false,
    });

    expect(result.monitors[0].action).toBe('created');
    expect(prisma.monitor.create).not.toHaveBeenCalled();
    expect(prisma.monitor.update).not.toHaveBeenCalled();
    // dryRun doesn't count toward created/updated — it shows what would happen
    expect(result.monitors[0].name).toBe('Dry Run Monitor');
  });
});
