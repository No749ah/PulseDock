/**
 * Unit tests for MonitorsExportService.
 *
 * All Prisma interactions and injected services are mocked.
 * Tests cover:
 *   - exportMonitors: JSON export envelope structure
 *   - importMonitors: batch creation, error collection
 *   - exportMonitorsConfig: JSON/YAML format, filtered export
 *   - importMonitorsConfig: JSON parsing, create/skip/update/dryRun
 *   - importExternal: uptime-robot, better-uptime, csv parsing + dedup
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { MonitorsExportService } from './monitors-export.service';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeMonitor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mon-1',
    name: 'API Monitor',
    type: 'HTTP',
    target: 'https://example.com',
    intervalSec: 60,
    timeoutMs: 5000,
    confirmations: 1,
    retryCount: 0,
    enabled: true,
    folderId: null,
    slaTarget: null,
    configJson: {},
    config: {},
    alertChannelIds: [],
    alertChannels: [],
    tags: [],
    monitorAlerts: [],
    monitorTags: [],
    folder: null,
    ...overrides,
  };
}

// ─── Mocked dependencies ──────────────────────────────────────────────────────

const mockPrisma = {
  monitor: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

const mockAudit = {
  log: vi.fn().mockResolvedValue(undefined),
};

const mockCrud = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

function makeSvc(): MonitorsExportService {
  return new MonitorsExportService(
    mockPrisma as never,
    mockAudit as never,
    mockCrud as never,
  );
}

// ─── exportMonitors ───────────────────────────────────────────────────────────

describe('MonitorsExportService.exportMonitors', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns export envelope with version and monitors array', async () => {
    mockCrud.list.mockResolvedValue([makeMonitor()]);

    const result = await makeSvc().exportMonitors('user-1');

    expect(result).toHaveProperty('version', '1');
    expect(result).toHaveProperty('exportedAt');
    expect(result).toHaveProperty('monitors');
    expect((result as { monitors: unknown[] }).monitors).toHaveLength(1);
  });

  it('exports correct monitor fields', async () => {
    mockCrud.list.mockResolvedValue([makeMonitor({ name: 'Test Monitor', type: 'HTTP', target: 'https://test.com' })]);

    const result = (await makeSvc().exportMonitors('user-1')) as { monitors: Record<string, unknown>[] };

    expect(result.monitors[0].name).toBe('Test Monitor');
    expect(result.monitors[0].type).toBe('HTTP');
    expect(result.monitors[0].target).toBe('https://test.com');
  });

  it('returns empty monitors array when user has no monitors', async () => {
    mockCrud.list.mockResolvedValue([]);

    const result = (await makeSvc().exportMonitors('user-1')) as { monitors: unknown[] };

    expect(result.monitors).toHaveLength(0);
  });

  it('exportMonitorsConfig returns JSON format with filename', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      makeMonitor({ monitorAlerts: [], monitorTags: [], folder: null }),
    ]);

    const result = await makeSvc().exportMonitors('user-1', { format: 'json', includeAlertChannels: false });

    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('contentType', 'application/json');
    expect((result as { filename: string }).filename).toMatch(/\.json$/);
  });
});

// ─── importMonitors ───────────────────────────────────────────────────────────

describe('MonitorsExportService.importMonitors', () => {
  beforeEach(() => vi.clearAllMocks());

  it('imports monitors and returns count', async () => {
    mockCrud.create.mockResolvedValue(makeMonitor({ id: 'mon-new' }));

    const result = await makeSvc().importMonitors('user-1', [
      { name: 'New Monitor', target: 'https://example.com', type: 'HTTP' },
    ]);

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('collects errors for failed imports without stopping batch', async () => {
    mockCrud.create
      .mockResolvedValueOnce(makeMonitor({ id: 'mon-1' }))
      .mockRejectedValueOnce(new Error('Duplicate monitor'));

    const result = await makeSvc().importMonitors('user-1', [
      { name: 'Good Monitor', target: 'https://good.com', type: 'HTTP' },
      { name: 'Bad Monitor', target: 'https://bad.com', type: 'HTTP' },
    ]);

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].name).toBe('Bad Monitor');
  });

  it('returns zero imported for empty input', async () => {
    const result = await makeSvc().importMonitors('user-1', []);

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('disables monitor after import when enabled=false', async () => {
    const createdMonitor = makeMonitor({ id: 'mon-created' });
    mockCrud.create.mockResolvedValue(createdMonitor);
    mockCrud.update.mockResolvedValue({ ...createdMonitor, enabled: false });

    await makeSvc().importMonitors('user-1', [
      { name: 'Disabled Monitor', target: 'https://example.com', type: 'HTTP', enabled: false },
    ]);

    expect(mockCrud.update).toHaveBeenCalledWith('user-1', 'mon-created', { enabled: false });
  });

  it('logs audit event after import', async () => {
    mockCrud.create.mockResolvedValue(makeMonitor());

    await makeSvc().importMonitors('user-1', [
      { name: 'Monitor', target: 'https://example.com', type: 'HTTP' },
    ]);

    expect(mockAudit.log).toHaveBeenCalledWith('monitor.import', 'user-1', 'user-1', expect.any(Object));
  });
});

// ─── importMonitorsConfig ─────────────────────────────────────────────────────

describe('MonitorsExportService.importMonitorsConfig', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws BadRequestException for invalid JSON', async () => {
    await expect(
      makeSvc().importMonitorsConfig('user-1', { format: 'json', content: 'not-json' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when monitors array is missing', async () => {
    await expect(
      makeSvc().importMonitorsConfig('user-1', {
        format: 'json',
        content: JSON.stringify({ version: '1', items: [] }),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates monitors from valid JSON config', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(null); // no existing
    mockPrisma.monitor.create.mockResolvedValue(makeMonitor({ id: 'mon-new' }));

    const config = {
      version: '1',
      monitors: [{ name: 'Imported', type: 'HTTP', target: 'https://imported.com', enabled: true }],
    };

    const result = await makeSvc().importMonitorsConfig('user-1', {
      format: 'json',
      content: JSON.stringify(config),
    });

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('skips existing monitors when overwriteExisting=false', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(makeMonitor({ name: 'Existing' }));

    const config = {
      version: '1',
      monitors: [{ name: 'Existing', type: 'HTTP', target: 'https://existing.com', enabled: true }],
    };

    const result = await makeSvc().importMonitorsConfig('user-1', {
      format: 'json',
      content: JSON.stringify(config),
      overwriteExisting: false,
    });

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
  });

  it('dryRun returns actions without creating anything', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(null);

    const config = {
      version: '1',
      monitors: [{ name: 'DryRun Monitor', type: 'HTTP', target: 'https://dryrun.com', enabled: true }],
    };

    const result = await makeSvc().importMonitorsConfig('user-1', {
      format: 'json',
      content: JSON.stringify(config),
      dryRun: true,
    });

    expect(result.monitors[0].action).toBe('created');
    expect(mockPrisma.monitor.create).not.toHaveBeenCalled();
  });

  it('errors entries with missing required fields', async () => {
    const config = {
      version: '1',
      monitors: [{ name: 'Incomplete' }], // missing type, target
    };

    const result = await makeSvc().importMonitorsConfig('user-1', {
      format: 'json',
      content: JSON.stringify(config),
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Missing required fields');
  });
});

// ─── importExternal ───────────────────────────────────────────────────────────

describe('MonitorsExportService.importExternal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns zero imported for empty uptime-robot data', async () => {
    const result = await makeSvc().importExternal('user-1', 'uptime-robot', { monitors: [] });

    expect(result.imported).toBe(0);
    expect(result.message).toBeTruthy();
  });

  it('imports valid uptime-robot monitors', async () => {
    const payload = {
      monitors: [
        { friendly_name: 'My Site', url: 'https://mysite.com', type: 1, interval: 300, status: 2 },
      ],
    };
    mockPrisma.monitor.findFirst.mockResolvedValue(null); // no existing
    mockCrud.create.mockResolvedValue(makeMonitor({ target: 'https://mysite.com' }));

    const result = await makeSvc().importExternal('user-1', 'uptime-robot', payload);

    expect(result.imported).toBe(1);
  });

  it('skips uptime-robot monitors with non-HTTP type', async () => {
    const payload = {
      monitors: [
        { friendly_name: 'Ping Monitor', url: 'https://ping.com', type: 3 }, // type 3 = Ping
      ],
    };

    const result = await makeSvc().importExternal('user-1', 'uptime-robot', payload);

    expect(result.imported).toBe(0);
  });

  it('skips duplicate targets on external import', async () => {
    const payload = {
      monitors: [
        { friendly_name: 'Existing Site', url: 'https://existing.com', type: 1, status: 2 },
      ],
    };
    // Existing monitor with same target
    mockPrisma.monitor.findFirst.mockResolvedValue(makeMonitor({ target: 'https://existing.com' }));

    const result = await makeSvc().importExternal('user-1', 'uptime-robot', payload);

    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
  });

  it('parses CSV format correctly', async () => {
    const csv = 'name,url,interval\nSite A,https://site-a.com,60\nSite B,https://site-b.com,120';
    mockPrisma.monitor.findFirst.mockResolvedValue(null);
    mockCrud.create.mockResolvedValue(makeMonitor());

    const result = await makeSvc().importExternal('user-1', 'csv', csv);

    expect(result.imported).toBe(2);
  });

  it('returns no-monitors message for empty CSV', async () => {
    const result = await makeSvc().importExternal('user-1', 'csv', '');

    expect(result.imported).toBe(0);
    expect(result.message).toContain('No importable monitors');
  });

  it('imports better-uptime monitors from nested format', async () => {
    const payload = {
      data: [
        {
          attributes: {
            url: 'https://betteruptime.com/site',
            pronounceable_name: 'My BU Monitor',
            check_type: 'status',
            paused: false,
            request_interval_seconds: 180,
          },
        },
      ],
    };
    mockPrisma.monitor.findFirst.mockResolvedValue(null);
    mockCrud.create.mockResolvedValue(makeMonitor());

    const result = await makeSvc().importExternal('user-1', 'better-uptime', payload);

    expect(result.imported).toBe(1);
  });
});
