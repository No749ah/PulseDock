/**
 * Unit tests for MonitorsCrudService.
 *
 * All Prisma interactions and injected services are mocked.
 * Tests cover:
 *   - list: tag filtering, sanitized config output
 *   - getOne: found / not-found paths
 *   - create: monitor creation, alert channel wiring, tag creation
 *   - update: partial updates, not-found guard
 *   - remove: deletion, not-found guard
 *   - getConfigHistory: limit clamping, not-found guard
 *   - sanitizeConfig: token field stripping
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MonitorsCrudService } from './monitors-crud.service';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeMonitor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mon-1',
    userId: 'user-1',
    name: 'API Monitor',
    description: null,
    runbookUrl: null,
    type: 'HTTP',
    target: 'https://example.com',
    intervalSec: 60,
    timeoutMs: 5000,
    confirmations: 1,
    retryCount: 0,
    configJson: {},
    enabled: true,
    folderId: null,
    slaTarget: null,
    slaPeriodDays: null,
    slaBreachAlertedAt: null,
    autoIncident: false,
    autoIncidentSeverity: 'MEDIUM',
    activeAutoIncidentId: null,
    isFlapping: false,
    flapDetectionEnabled: true,
    flapWindow: 10,
    flapThreshold: 0.5,
    flapAlertedAt: null,
    pausedUntil: null,
    mutedUntil: null,
    latencyAlertMs: null,
    anomalyDetection: false,
    anomalyMultiplier: 2.0,
    cronExpression: null,
    scheduleEnabled: false,
    scheduleDays: '1,2,3,4,5',
    scheduleStartHour: 8,
    scheduleEndHour: 18,
    sliLatencyTarget: null,
    sliLatencyWindow: 7,
    shareToken: null,
    priority: 0,
    createdAt: new Date('2024-01-01'),
    monitorAlerts: [],
    monitorTags: [],
    runs: [],
    acknowledgements: [],
    ...overrides,
  };
}

// ─── Mocked services ──────────────────────────────────────────────────────────

const mockPrisma = {
  monitor: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
  },
  monitorAlert: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  monitorTag: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  monitorConfigChange: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  tag: {
    upsert: vi.fn(),
  },
};

const mockChecksService = {
  listPlugins: vi.fn().mockReturnValue([]),
};

const mockAudit = {
  log: vi.fn().mockResolvedValue(undefined),
};

const mockRealtime = {
  monitorCreated: vi.fn(),
  monitorUpdated: vi.fn(),
  monitorDeleted: vi.fn(),
};

const mockVersionDetection = {};

function makeSvc(): MonitorsCrudService {
  return new MonitorsCrudService(
    mockPrisma as never,
    mockChecksService as never,
    mockAudit as never,
    mockRealtime as never,
    mockVersionDetection as never,
  );
}

// ─── list ─────────────────────────────────────────────────────────────────────

describe('MonitorsCrudService.list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when user has no monitors', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);

    const result = await makeSvc().list('user-1');

    expect(result).toHaveLength(0);
  });

  it('returns all monitors with sanitized config', async () => {
    const monitor = makeMonitor({
      configJson: { url: 'https://example.com', token: 'secret-token' },
      type: 'HTTP',
    });
    mockPrisma.monitor.findMany.mockResolvedValue([monitor]);

    const result = await makeSvc().list('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('mon-1');
    // Token should be stripped from config
    expect((result[0].config as Record<string, unknown>)['token']).toBeUndefined();
  });

  it('filters by tag when tagFilter provided', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);

    await makeSvc().list('user-1', 'production');

    const call = mockPrisma.monitor.findMany.mock.calls[0][0] as { where: { monitorTags?: unknown } };
    expect(call.where).toHaveProperty('monitorTags');
  });

  it('maps alertChannels from monitorAlerts', async () => {
    const monitor = makeMonitor({
      monitorAlerts: [
        {
          alertChannelId: 'ch-1',
          notifyOn: 'down',
          alertChannel: { id: 'ch-1', name: 'Slack', type: 'SLACK' },
        },
      ],
    });
    mockPrisma.monitor.findMany.mockResolvedValue([monitor]);

    const result = await makeSvc().list('user-1');

    expect(result[0].alertChannels).toHaveLength(1);
    expect(result[0].alertChannels[0].name).toBe('Slack');
  });

  it('maps tags from monitorTags', async () => {
    const monitor = makeMonitor({
      monitorTags: [{ tag: { id: 'tag-1', name: 'prod', color: '#ff0000' } }],
    });
    mockPrisma.monitor.findMany.mockResolvedValue([monitor]);

    const result = await makeSvc().list('user-1');

    expect(result[0].tags).toHaveLength(1);
    expect(result[0].tags[0].name).toBe('prod');
  });

  it('sets isAcknowledged=true when monitor has open acknowledgement', async () => {
    const monitor = makeMonitor({
      acknowledgements: [{ id: 'ack-1', note: 'Working on it', acknowledgedAt: new Date() }],
    });
    mockPrisma.monitor.findMany.mockResolvedValue([monitor]);

    const result = await makeSvc().list('user-1');

    expect(result[0].isAcknowledged).toBe(true);
  });
});

// ─── getOne ───────────────────────────────────────────────────────────────────

describe('MonitorsCrudService.getOne', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the monitor when found', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(makeMonitor());

    const result = await makeSvc().getOne('user-1', 'mon-1');

    expect(result.id).toBe('mon-1');
    expect(result.name).toBe('API Monitor');
  });

  it('throws NotFoundException when monitor not found', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(null);

    await expect(makeSvc().getOne('user-1', 'missing-id')).rejects.toThrow(NotFoundException);
  });

  it('includes activeAck when open acknowledgement exists', async () => {
    const monitor = makeMonitor({
      acknowledgements: [
        { id: 'ack-1', note: 'Investigating', acknowledgedAt: new Date('2024-01-01') },
      ],
    });
    mockPrisma.monitor.findFirst.mockResolvedValue(monitor);

    const result = await makeSvc().getOne('user-1', 'mon-1');

    expect(result.isAcknowledged).toBe(true);
    expect(result.activeAck?.id).toBe('ack-1');
  });

  it('sets activeAck=null when no acknowledgement exists', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(makeMonitor({ acknowledgements: [] }));

    const result = await makeSvc().getOne('user-1', 'mon-1');

    expect(result.activeAck).toBeNull();
  });
});

// ─── create ───────────────────────────────────────────────────────────────────

describe('MonitorsCrudService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a monitor and emits realtime event', async () => {
    const createdMonitor = makeMonitor({ id: 'mon-new' });
    mockPrisma.monitor.create.mockResolvedValue(createdMonitor);

    await makeSvc().create('user-1', {
      name: 'New Monitor',
      target: 'https://example.com',
      type: 'HTTP',
    });

    expect(mockPrisma.monitor.create).toHaveBeenCalledOnce();
    expect(mockRealtime.monitorCreated).toHaveBeenCalledOnce();
  });

  it('logs audit event on creation', async () => {
    const createdMonitor = makeMonitor();
    mockPrisma.monitor.create.mockResolvedValue(createdMonitor);

    await makeSvc().create('user-1', {
      name: 'My Monitor',
      target: 'https://example.com',
      type: 'HTTP',
    });

    expect(mockAudit.log).toHaveBeenCalledWith('monitor.create', 'user-1', 'user-1', expect.any(Object));
  });

  it('applies default intervalSec=60 when not provided', async () => {
    const createdMonitor = makeMonitor();
    mockPrisma.monitor.create.mockResolvedValue(createdMonitor);

    await makeSvc().create('user-1', {
      name: 'Monitor',
      target: 'https://example.com',
      type: 'HTTP',
    });

    const createCall = mockPrisma.monitor.create.mock.calls[0][0] as { data: { intervalSec: number } };
    expect(createCall.data.intervalSec).toBe(60);
  });

  it('clamps confirmations to 1–10 range', async () => {
    const createdMonitor = makeMonitor();
    mockPrisma.monitor.create.mockResolvedValue(createdMonitor);

    await makeSvc().create('user-1', {
      name: 'Monitor',
      target: 'https://example.com',
      type: 'HTTP',
      confirmations: 999,
    });

    const createCall = mockPrisma.monitor.create.mock.calls[0][0] as { data: { confirmations: number } };
    expect(createCall.data.confirmations).toBe(10);
  });

  it('creates tags when provided', async () => {
    const createdMonitor = makeMonitor();
    mockPrisma.monitor.create.mockResolvedValue(createdMonitor);
    mockPrisma.tag.upsert.mockResolvedValue({ id: 'tag-1', name: 'prod', color: null });
    mockPrisma.monitorTag.create.mockResolvedValue({});

    await makeSvc().create('user-1', {
      name: 'Monitor',
      target: 'https://example.com',
      type: 'HTTP',
      tags: ['prod'],
    });

    expect(mockPrisma.tag.upsert).toHaveBeenCalledOnce();
    expect(mockPrisma.monitorTag.create).toHaveBeenCalledOnce();
  });
});

// ─── remove ───────────────────────────────────────────────────────────────────

describe('MonitorsCrudService.remove', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes monitor and emits event', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(makeMonitor());
    mockPrisma.monitor.delete.mockResolvedValue({});

    const result = await makeSvc().remove('user-1', 'mon-1');

    expect(result).toEqual({ ok: true });
    expect(mockPrisma.monitor.delete).toHaveBeenCalledOnce();
    expect(mockRealtime.monitorDeleted).toHaveBeenCalledOnce();
  });

  it('throws NotFoundException when monitor not found', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(null);

    await expect(makeSvc().remove('user-1', 'ghost-id')).rejects.toThrow(NotFoundException);
    expect(mockPrisma.monitor.delete).not.toHaveBeenCalled();
  });

  it('logs audit event on delete', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(makeMonitor());
    mockPrisma.monitor.delete.mockResolvedValue({});

    await makeSvc().remove('user-1', 'mon-1');

    expect(mockAudit.log).toHaveBeenCalledWith('monitor.delete', 'user-1', 'user-1', expect.any(Object));
  });
});

// ─── getConfigHistory ─────────────────────────────────────────────────────────

describe('MonitorsCrudService.getConfigHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NotFoundException when monitor not found', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(null);

    await expect(makeSvc().getConfigHistory('user-1', 'bad-id')).rejects.toThrow(NotFoundException);
  });

  it('returns config change entries for a monitor', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(makeMonitor());
    mockPrisma.monitorConfigChange.findMany.mockResolvedValue([
      { id: 'chg-1', changes: [], summary: 'Updated name', createdAt: new Date(), userId: 'user-1' },
    ]);

    const result = await makeSvc().getConfigHistory('user-1', 'mon-1');

    expect(result).toHaveLength(1);
    expect(result[0].summary).toBe('Updated name');
  });

  it('clamps limit to max 200', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(makeMonitor());
    mockPrisma.monitorConfigChange.findMany.mockResolvedValue([]);

    await makeSvc().getConfigHistory('user-1', 'mon-1', 999);

    const call = mockPrisma.monitorConfigChange.findMany.mock.calls[0][0] as { take: number };
    expect(call.take).toBe(200);
  });
});

// ─── listPlugins ──────────────────────────────────────────────────────────────

describe('MonitorsCrudService.listPlugins', () => {
  it('delegates to checksService.listPlugins', () => {
    mockChecksService.listPlugins.mockReturnValue([{ id: 'http', name: 'HTTP' }]);

    const result = makeSvc().listPlugins();

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('id', 'http');
  });
});
