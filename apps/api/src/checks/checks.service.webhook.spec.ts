/**
 * Tests for per-monitor status change webhook (statusWebhookUrl / statusWebhookSecret).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ChecksService } from './checks.service';
import { PrismaService } from '../common/prisma.service';
import { AlertsService } from '../alerts/alerts.service';
import { MailerService } from '../common/mailer.service';
import { RealtimeEvents } from '../realtime/realtime.events';

const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
vi.stubGlobal('fetch', fetchMock);

const makeMonitor = (overrides: Record<string, unknown> = {}) => ({
  id: 'mon-1',
  userId: 'user-1',
  name: 'Test Monitor',
  type: 'HTTP',
  target: 'https://example.com',
  intervalSec: 60,
  timeoutMs: 5000,
  confirmations: 1,
  retryCount: 0,
  enabled: true,
  flapDetectionEnabled: false,
  flapWindow: 10,
  flapThreshold: 0.5,
  isFlapping: false,
  flapAlertedAt: null,
  mutedUntil: null,
  pausedUntil: null,
  latencyAlertMs: null,
  anomalyDetection: false,
  anomalyMultiplier: 2.0,
  sliLatencyTarget: null,
  sliLatencyWindow: 7,
  scheduleEnabled: false,
  scheduleDays: '1,2,3,4,5',
  scheduleStartHour: 8,
  scheduleEndHour: 18,
  config: {},
  alertChannelIds: [],
  folderId: null,
  description: null,
  runbookUrl: null,
  slaTarget: null,
  slaPeriodDays: 30,
  slaBreachAlertedAt: null,
  slaBurnRateAlertedAt: null,
  autoIncident: false,
  autoIncidentSeverity: 'MEDIUM',
  activeAutoIncidentId: null,
  createdAt: new Date().toISOString(),
  statusWebhookUrl: null,
  statusWebhookSecret: null,
  ...overrides,
});

const makeRun = (level: string, latencyMs = 100) => ({
  id: 'run-1',
  monitorId: 'mon-1',
  userId: 'user-1',
  checkedAt: new Date(),
  ok: level === 'green',
  level,
  latencyMs,
  message: 'ok',
  status: 200,
  monitorType: 'HTTP',
});

describe('ChecksService — status webhook', () => {
  let service: ChecksService;
  let prisma: ReturnType<typeof makePrisma>;

  function makePrisma() {
    let callCount = 0;
    return {
      monitorRun: {
        findMany: vi.fn().mockImplementation(async () => {
          // First call: recent runs (empty = no prior state)
          // Subsequent calls: return mocked data for specific queries
          callCount++;
          if (callCount === 1) return [];
          return [];
        }),
        create: vi.fn().mockResolvedValue(makeRun('red')),
      },
      monitor: {
        findFirst: vi.fn().mockImplementation(async ({ where }: { where: { id?: string; userId?: string } }) => {
          if (where?.id === 'mon-1') return { id: 'mon-1', type: 'HTTP', target: 'https://example.com' };
          return null;
        }),
        update: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
      },
      monitorDependency: { findMany: vi.fn().mockResolvedValue([]) },
      publicStatusPage: { findMany: vi.fn().mockResolvedValue([]) },
      incident: { create: vi.fn(), update: vi.fn() },
    };
  }

  const makeAlerts = () => ({
    notifyMonitorFailure: vi.fn().mockResolvedValue(undefined),
    shouldSuppressDueToBurnRate: vi.fn().mockResolvedValue(false),
    notifyBurnRateAlert: vi.fn().mockResolvedValue(undefined),
  });

  const makeMailer = () => ({});
  const makeRealtime = () => ({
    monitorChecked: vi.fn(),
    statusPageUpdated: vi.fn(),
  });

  beforeEach(async () => {
    fetchMock.mockClear();
    prisma = makePrisma();
    const module = await Test.createTestingModule({
      providers: [
        ChecksService,
        { provide: PrismaService, useValue: prisma },
        { provide: AlertsService, useValue: makeAlerts() },
        { provide: MailerService, useValue: makeMailer() },
        { provide: RealtimeEvents, useValue: makeRealtime() },
      ],
    }).compile();
    service = module.get(ChecksService);
  });

  it('does NOT fire status webhook when level is unchanged', async () => {
    // Simulate prior green run → current green run (no change)
    prisma.monitorRun.findMany = vi.fn().mockResolvedValue([{ level: 'green' }]);
    prisma.monitorRun.create = vi.fn().mockResolvedValue(makeRun('green'));

    const monitor = makeMonitor({ statusWebhookUrl: 'https://hook.example.com/cb' });
    await service.runMonitor(monitor as Parameters<typeof service.runMonitor>[0]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fires status webhook when level changes (green → red)', async () => {
    // Prior run = green, new run = red → level changed
    prisma.monitorRun.findMany = vi.fn().mockResolvedValue([{ level: 'green' }]);
    prisma.monitorRun.create = vi.fn().mockResolvedValue(makeRun('red'));

    const monitor = makeMonitor({ statusWebhookUrl: 'https://hook.example.com/cb' });
    await service.runMonitor(monitor as Parameters<typeof service.runMonitor>[0]);

    // Allow microtasks (void async call) to resolve
    await new Promise((r) => setTimeout(r, 50));

    // Find the call to our specific webhook URL (there may be other fetch calls for alert channels, etc.)
    const webhookCalls = fetchMock.mock.calls.filter(
      (c) => (c as [string, RequestInit])[0] === 'https://hook.example.com/cb',
    );
    expect(webhookCalls.length).toBeGreaterThanOrEqual(1);
    const [url, opts] = webhookCalls[0] as [string, RequestInit];
    expect(url).toBe('https://hook.example.com/cb');
    expect(opts.method).toBe('POST');
    const parsed = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(parsed.event).toBe('monitor.status_changed');
    expect(parsed.monitorId).toBe('mon-1');
    expect(parsed.level).toBe('red');
    expect(parsed.previousLevel).toBe('green');
  });

  it('fires status webhook on recovery (red → green)', async () => {
    prisma.monitorRun.findMany = vi.fn().mockResolvedValue([{ level: 'red' }]);
    prisma.monitorRun.create = vi.fn().mockResolvedValue(makeRun('green'));

    const monitor = makeMonitor({ statusWebhookUrl: 'https://hook.example.com/cb' });
    await service.runMonitor(monitor as Parameters<typeof service.runMonitor>[0]);
    await new Promise((r) => setTimeout(r, 50));

    const webhookCall = fetchMock.mock.calls.find(
      (c) => (c as [string, RequestInit])[0] === 'https://hook.example.com/cb',
    );
    expect(webhookCall).toBeDefined();
    const parsed = JSON.parse((webhookCall as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    expect(parsed.level).toBe('green');
    expect(parsed.previousLevel).toBe('red');
  });

  it('includes X-PulseDock-Signature header when secret is set', async () => {
    prisma.monitorRun.findMany = vi.fn().mockResolvedValue([{ level: 'green' }]);
    prisma.monitorRun.create = vi.fn().mockResolvedValue(makeRun('red'));

    const monitor = makeMonitor({
      statusWebhookUrl: 'https://hook.example.com/cb',
      statusWebhookSecret: 'my-secret',
    });
    await service.runMonitor(monitor as Parameters<typeof service.runMonitor>[0]);
    await new Promise((r) => setTimeout(r, 50));

    const webhookCall = fetchMock.mock.calls.find(
      (c) => (c as [string, RequestInit])[0] === 'https://hook.example.com/cb',
    );
    expect(webhookCall).toBeDefined();
    const opts = (webhookCall as [string, RequestInit])[1];
    const sig = (opts.headers as Record<string, string>)['X-PulseDock-Signature'];
    expect(sig).toBeDefined();
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('does NOT include X-PulseDock-Signature when no secret', async () => {
    prisma.monitorRun.findMany = vi.fn().mockResolvedValue([{ level: 'green' }]);
    prisma.monitorRun.create = vi.fn().mockResolvedValue(makeRun('red'));

    const monitor = makeMonitor({ statusWebhookUrl: 'https://hook.example.com/cb' });
    await service.runMonitor(monitor as Parameters<typeof service.runMonitor>[0]);
    await new Promise((r) => setTimeout(r, 50));

    const webhookCall = fetchMock.mock.calls.find(
      (c) => (c as [string, RequestInit])[0] === 'https://hook.example.com/cb',
    );
    expect(webhookCall).toBeDefined();
    const opts = (webhookCall as [string, RequestInit])[1];
    expect((opts.headers as Record<string, string>)['X-PulseDock-Signature']).toBeUndefined();
  });

  it('does NOT fire when statusWebhookUrl is null (no webhook configured)', async () => {
    prisma.monitorRun.findMany = vi.fn().mockResolvedValue([{ level: 'green' }]);
    prisma.monitorRun.create = vi.fn().mockResolvedValue(makeRun('red'));

    const monitor = makeMonitor(); // no statusWebhookUrl
    await service.runMonitor(monitor as Parameters<typeof service.runMonitor>[0]);
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not throw when webhook URL returns non-2xx (graceful failure)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    prisma.monitorRun.findMany = vi.fn().mockResolvedValue([{ level: 'green' }]);
    prisma.monitorRun.create = vi.fn().mockResolvedValue(makeRun('red'));

    const monitor = makeMonitor({ statusWebhookUrl: 'https://hook.example.com/cb' });
    await expect(service.runMonitor(monitor as Parameters<typeof service.runMonitor>[0])).resolves.toBeDefined();
  });

  it('does not throw when webhook URL throws network error (graceful failure)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network timeout'));
    prisma.monitorRun.findMany = vi.fn().mockResolvedValue([{ level: 'green' }]);
    prisma.monitorRun.create = vi.fn().mockResolvedValue(makeRun('red'));

    const monitor = makeMonitor({ statusWebhookUrl: 'https://hook.example.com/cb' });
    await expect(service.runMonitor(monitor as Parameters<typeof service.runMonitor>[0])).resolves.toBeDefined();
  });
});
