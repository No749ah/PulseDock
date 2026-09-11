/**
 * Unit tests for MonitorsService.getSslSummary().
 *
 * Verifies correct parsing of days-remaining from run messages,
 * correct risk categorisation (expired / critical / warning / healthy),
 * sorting order (expired first, then soonest expiry),
 * and handling of HTTP monitors (no days parsed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorsDiagnosticsService } from './monitors-diagnostics.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRun(message: string, level: 'green' | 'yellow' | 'red', ok = true) {
  return { level, message, checkedAt: new Date('2026-03-28T05:00:00Z'), ok };
}

function makePrisma(monitors: unknown[]) {
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(monitors),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    monitorRun: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), count: vi.fn().mockResolvedValue(0), deleteMany: vi.fn().mockResolvedValue({ count: 0 }), groupBy: vi.fn().mockResolvedValue([]) },
    monitorRunRollup: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    alertChannel: { findMany: vi.fn().mockResolvedValue([]) },
    monitorAlert: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), delete: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    monitorTag: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), deleteMany: vi.fn() },
    tag: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    folder: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    monitorDependency: { findMany: vi.fn().mockResolvedValue([]) },
    monitorEvent: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), delete: vi.fn() },
    monitorAnnotation: { findMany: vi.fn().mockResolvedValue([]) },
    incident: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn((fns: unknown[]) => Promise.all((fns as ((tx: unknown) => Promise<unknown>)[]).map((f) => (typeof f === 'function' ? f(null) : f)))),
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

function makeMonitor(
  id: string,
  type: 'SSL_CERT' | 'HTTP' | 'BROWSER',
  runs: ReturnType<typeof makeRun>[],
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    name: `Monitor ${id}`,
    target: `https://example-${id}.com`,
    type,
    enabled: true,
    folderId: null,
    folder: null,
    runs,
    ...overrides,
  };
}

function buildService(monitors: unknown[]) {
  const prisma = makePrisma(monitors);
  return new (MonitorsDiagnosticsService as unknown as new (...args: unknown[]) => MonitorsDiagnosticsService)(prisma as never);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('MonitorsService.getSslSummary', () => {
  let service: MonitorsDiagnosticsService;

  beforeEach(() => {
    service = buildService([
      makeMonitor('expired-1', 'SSL_CERT', [makeRun('SSL cert EXPIRED 5 days ago (2026-03-23)', 'red', false)]),
      makeMonitor('critical-1', 'SSL_CERT', [makeRun('SSL cert expires in 7 days (2026-04-04)', 'red')]),
      makeMonitor('warning-1', 'SSL_CERT', [makeRun('SSL cert expires in 20 days (2026-04-17)', 'yellow')]),
      makeMonitor('healthy-1', 'SSL_CERT', [makeRun('SSL cert expires in 60 days (2026-05-27)', 'green')]),
      makeMonitor('http-1', 'HTTP', [makeRun('HTTP 200 OK — 45ms', 'green')]),
    ]);
  });

  it('returns correct total count', async () => {
    const result = await service.getSslSummary('user-1');
    expect(result.total).toBe(5);
  });

  it('counts expired certificates', async () => {
    const result = await service.getSslSummary('user-1');
    expect(result.expired).toBe(1);
  });

  it('counts critical certificates (days < 10)', async () => {
    const result = await service.getSslSummary('user-1');
    expect(result.critical).toBe(1);
  });

  it('counts warning certificates (10 <= days <= 30)', async () => {
    const result = await service.getSslSummary('user-1');
    expect(result.warning).toBe(1);
  });

  it('counts healthy certificates (days > 30)', async () => {
    const result = await service.getSslSummary('user-1');
    expect(result.healthy).toBe(1);
  });

  it('parses daysRemaining correctly from SSL_CERT run message', async () => {
    const result = await service.getSslSummary('user-1');
    const cert = result.certs.find((c) => c.monitorId === 'critical-1');
    expect(cert?.daysRemaining).toBe(7);
  });

  it('parses expiresAt date from SSL_CERT run message', async () => {
    const result = await service.getSslSummary('user-1');
    const cert = result.certs.find((c) => c.monitorId === 'critical-1');
    expect(cert?.expiresAt).toBe('2026-04-04');
  });

  it('parses negative daysRemaining for expired certs', async () => {
    const result = await service.getSslSummary('user-1');
    const cert = result.certs.find((c) => c.monitorId === 'expired-1');
    expect(cert?.daysRemaining).toBe(-5);
  });

  it('sorts expired certs first', async () => {
    const result = await service.getSslSummary('user-1');
    // Expired cert should come before critical/warning/healthy SSL_CERT certs
    const sslCerts = result.certs.filter((c) => c.type === 'SSL_CERT');
    expect(sslCerts[0].monitorId).toBe('expired-1');
  });

  it('sorts by ascending daysRemaining within SSL_CERT monitors', async () => {
    const result = await service.getSslSummary('user-1');
    const sslCerts = result.certs.filter((c) => c.type === 'SSL_CERT');
    const days = sslCerts.map((c) => c.daysRemaining ?? Infinity);
    expect(days[0]).toBeLessThanOrEqual(days[1]);
    expect(days[1]).toBeLessThanOrEqual(days[2]);
  });

  it('returns null daysRemaining for HTTP monitors', async () => {
    const result = await service.getSslSummary('user-1');
    const httpCert = result.certs.find((c) => c.monitorId === 'http-1');
    expect(httpCert?.daysRemaining).toBeNull();
    expect(httpCert?.expiresAt).toBeNull();
  });

  it('returns lastCheckedAt ISO string', async () => {
    const result = await service.getSslSummary('user-1');
    const cert = result.certs.find((c) => c.monitorId === 'healthy-1');
    expect(cert?.lastCheckedAt).toBe('2026-03-28T05:00:00.000Z');
  });

  it('returns null lastCheckedAt when no runs', async () => {
    const s = buildService([makeMonitor('no-runs', 'SSL_CERT', [])]);
    const result = await s.getSslSummary('user-1');
    expect(result.certs[0].lastCheckedAt).toBeNull();
  });

  it('handles empty monitor list', async () => {
    const s = buildService([]);
    const result = await s.getSslSummary('user-1');
    expect(result.total).toBe(0);
    expect(result.certs).toHaveLength(0);
    expect(result.expired).toBe(0);
    expect(result.healthy).toBe(0);
  });
});
