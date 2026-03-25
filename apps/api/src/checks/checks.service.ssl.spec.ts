/**
 * SSL_CERT mocked TLS paths
 *
 * Uses vi.mock('node:tls') to intercept tls.connect without real network I/O.
 * Covers branches that require a completed TLS handshake:
 *  - cert metadata unavailable (valid_to missing)
 *  - expired cert (daysLeft < 0)
 *  - cert expiring soon / yellow (10–30 days)
 *  - cert healthy / green (> 30 days)
 *  - TLS timeout event
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ── mock node:tls BEFORE importing ChecksService ──────────────────────────
vi.mock('node:tls', () => ({ connect: vi.fn() }));

import * as tls from 'node:tls';
import { ChecksService } from './checks.service';
import type { Monitor } from '../types';

// ── helpers ───────────────────────────────────────────────────────────────

function makeMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: 'mon-ssl',
    userId: 'user-1',
    name: 'SSL Test',
    type: 'SSL_CERT',
    target: 'example.com',
    enabled: true,
    intervalSec: 60,
    timeoutMs: 5000,
    confirmations: 1,
    config: {},
    alertChannelIds: [],
    folderId: null,
    description: null,
    runbookUrl: null,
    slaTarget: null,
    slaPeriodDays: null,
    slaBreachAlertedAt: null,
    autoIncident: false,
    autoIncidentSeverity: 'MEDIUM',
    activeAutoIncidentId: null,
      isFlapping: false,
      flapDetectionEnabled: true,
      flapAlertedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    monitorRun: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'run-new', ...data, checkedAt: new Date() }),
      ),
    },
    monitorDependency: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    monitor: {
      update: vi.fn().mockResolvedValue({}),
    },
    alert: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    alertChannel: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    notificationPreference: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };
  const alerts = { notifyMonitorFailure: vi.fn().mockResolvedValue(undefined) };
  return new ChecksService(prisma as never, alerts as never);
}

// Create a fake socket that calls the connect callback immediately
function makeConnectSocket(cert: Record<string, unknown>) {
  const socket = Object.assign(new EventEmitter(), {
    getPeerCertificate: vi.fn().mockReturnValue(cert),
    end: vi.fn(),
    destroy: vi.fn(),
  });
  vi.mocked(tls.connect).mockImplementation((_opts: unknown, cb?: unknown) => {
    setImmediate(() => (cb as () => void)?.call(socket));
    return socket as never;
  });
  return socket;
}

// ── tests ─────────────────────────────────────────────────────────────────

describe('ChecksService — SSL_CERT mocked TLS branches', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns red when cert.valid_to is undefined (metadata unavailable)', async () => {
    makeConnectSocket({ valid_to: undefined });
    const run = await makeService().runMonitor(makeMonitor());
    expect(run.ok).toBe(false);
    expect(run.message).toMatch(/metadata unavailable/i);
    expect(run.level).toBe('red');
  });

  it('returns red for expired cert (daysLeft < 0)', async () => {
    const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    makeConnectSocket({ valid_to: past.toUTCString() });
    const run = await makeService().runMonitor(makeMonitor());
    expect(run.ok).toBe(false);
    expect(run.message).toMatch(/EXPIRED/);
    expect(run.level).toBe('red');
  });

  it('returns yellow for cert expiring in 15 days (10 ≤ days ≤ 30)', async () => {
    const soon = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    makeConnectSocket({ valid_to: soon.toUTCString() });
    const run = await makeService().runMonitor(makeMonitor());
    expect(run.ok).toBe(true);
    expect(run.level).toBe('yellow');
    expect(run.message).toMatch(/expires in 1[45] days/i);
  });

  it('returns green for cert expiring in 60 days (days > 30)', async () => {
    const later = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    makeConnectSocket({ valid_to: later.toUTCString() });
    const run = await makeService().runMonitor(makeMonitor());
    expect(run.ok).toBe(true);
    expect(run.level).toBe('green');
    expect(run.message).toMatch(/expires in 5\d days/i);
  });

  it('returns red on TLS timeout event', async () => {
    const socket = Object.assign(new EventEmitter(), {
      getPeerCertificate: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    });
    vi.mocked(tls.connect).mockImplementation((_opts: unknown, _cb?: unknown) => {
      setImmediate(() => socket.emit('timeout'));
      return socket as never;
    });
    const run = await makeService().runMonitor(makeMonitor());
    expect(run.ok).toBe(false);
    expect(run.message).toMatch(/timeout/i);
    expect(run.level).toBe('red');
  });

  it('returns red when cert.valid_to is an empty string (invalid date)', async () => {
    makeConnectSocket({ valid_to: '' });
    const run = await makeService().runMonitor(makeMonitor());
    expect(run.ok).toBe(false);
    expect(run.message).toMatch(/metadata unavailable/i);
  });
});
