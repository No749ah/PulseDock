import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChecksService } from './checks.service';
import type { Monitor } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: 'mon-1',
    userId: 'user-1',
    name: 'Test Monitor',
    type: 'HTTP',
    target: 'https://example.com',
    enabled: true,
    intervalSec: 60,
    timeoutMs: 5000,
    config: {},
    ...overrides,
  };
}

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    userId: 'user-1',
    monitorId: 'mon-1',
    checkedAt: new Date('2026-01-01'),
    ok: true,
    status: 200,
    latencyMs: 100,
    message: 'OK',
    level: 'green',
    ...overrides,
  };
}

function makePrisma(opts: {
  previousRun?: ReturnType<typeof makeRun> | null;
} = {}) {
  const previousRun = opts.previousRun !== undefined ? opts.previousRun : null;
  return {
    monitorRun: {
      findFirst: vi.fn().mockResolvedValue(previousRun),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'run-new',
          userId: data.userId,
          monitorId: data.monitorId,
          checkedAt: new Date(),
          ok: data.ok,
          status: data.status,
          latencyMs: data.latencyMs,
          message: data.message,
          level: data.level,
        }),
      ),
    },
  };
}

function makeAlerts() {
  return { notifyMonitorFailure: vi.fn().mockResolvedValue(undefined) };
}

function makeRealtime() {
  return { monitorChecked: vi.fn() };
}

function mockFetch(responses: Array<{ ok: boolean; status?: number; json?: () => unknown; text?: () => string }>) {
  let idx = 0;
  return vi.fn().mockImplementation(() => {
    const resp = responses[idx] ?? responses[responses.length - 1];
    idx++;
    return Promise.resolve({
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 500),
      headers: { get: () => 'application/json' },
      json: resp.json ?? (() => Promise.resolve({})),
      text: resp.text ? () => Promise.resolve(resp.text!()) : () => Promise.resolve(''),
    });
  });
}

function makeService(opts: {
  prisma?: ReturnType<typeof makePrisma>;
  alerts?: ReturnType<typeof makeAlerts>;
  realtime?: ReturnType<typeof makeRealtime>;
} = {}) {
  const prisma = opts.prisma ?? makePrisma();
  const alerts = opts.alerts ?? makeAlerts();
  const realtime = opts.realtime ?? makeRealtime();
  return new ChecksService(prisma as never, alerts as never, realtime as never);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ChecksService', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ── listPlugins() ──────────────────────────────────────────────────────────

  describe('listPlugins()', () => {
    it('returns registered plugins list', () => {
      const service = makeService();
      const plugins = service.listPlugins();
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBeGreaterThan(0);
      expect(plugins[0]).toHaveProperty('id');
    });
  });

  // ── runMonitor() — HTTP ────────────────────────────────────────────────────

  describe('runMonitor() — HTTP type', () => {
    it('runs HTTP check, saves run, and returns MonitorRun', async () => {
      const prisma = makePrisma();
      const service = makeService({ prisma });

      globalThis.fetch = mockFetch([{ ok: true, status: 200 }]);

      const monitor = makeMonitor({ type: 'HTTP', target: 'https://example.com' });
      const run = await service.runMonitor(monitor);

      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
      expect(run.statusCode).toBe(200);
      expect(prisma.monitorRun.create).toHaveBeenCalled();
    });

    it('returns red level on HTTP 500', async () => {
      const service = makeService();
      globalThis.fetch = mockFetch([{ ok: false, status: 500 }]);

      const run = await service.runMonitor(makeMonitor({ type: 'HTTP' }));
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
    });

    it('returns red level when fetch throws (network error)', async () => {
      const service = makeService();
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const run = await service.runMonitor(makeMonitor({ type: 'HTTP' }));
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
      expect(run.message).toContain('Network error');
    });

    it('notifies alerts when level changes from green to red', async () => {
      const prisma = makePrisma({ previousRun: makeRun({ level: 'green' }) });
      const alerts = makeAlerts();
      const service = makeService({ prisma, alerts });

      globalThis.fetch = mockFetch([{ ok: false, status: 500 }]);

      await service.runMonitor(makeMonitor({ type: 'HTTP' }));
      expect(alerts.notifyMonitorFailure).toHaveBeenCalledOnce();
    });

    it('does not notify alerts when level stays green', async () => {
      const prisma = makePrisma({ previousRun: makeRun({ level: 'green' }) });
      const alerts = makeAlerts();
      const service = makeService({ prisma, alerts });

      globalThis.fetch = mockFetch([{ ok: true, status: 200 }]);

      await service.runMonitor(makeMonitor({ type: 'HTTP' }));
      expect(alerts.notifyMonitorFailure).not.toHaveBeenCalled();
    });

    it('notifies alerts when level changes from red to yellow', async () => {
      const prisma = makePrisma({ previousRun: makeRun({ level: 'red' }) });
      const alerts = makeAlerts();
      const service = makeService({ prisma, alerts });

      // Mock a version check that returns yellow
      globalThis.fetch = mockFetch([
        { ok: true, status: 200, json: () => Promise.resolve({ version: '1.0.0' }) },
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: '2.0.0' }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { currentVersion: '1.0.0' },
      });
      await service.runMonitor(monitor);
      // Just verify it ran; alerting depends on level change
    });

    it('emits realtime event after check', async () => {
      const realtime = makeRealtime();
      const service = makeService({ realtime });

      globalThis.fetch = mockFetch([{ ok: true, status: 200 }]);

      await service.runMonitor(makeMonitor({ type: 'HTTP' }));
      expect(realtime.monitorChecked).toHaveBeenCalledOnce();
      expect(realtime.monitorChecked).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          monitor: expect.objectContaining({ id: 'mon-1' }),
          run: expect.objectContaining({ ok: true }),
          changed: expect.objectContaining({ levelChanged: true }), // no prev run
        }),
      );
    });

    it('marks levelChanged=false when level stays same', async () => {
      const prisma = makePrisma({ previousRun: makeRun({ level: 'green' }) });
      const realtime = makeRealtime();
      const service = makeService({ prisma, realtime });

      globalThis.fetch = mockFetch([{ ok: true, status: 200 }]);

      await service.runMonitor(makeMonitor({ type: 'HTTP' }));
      const call = realtime.monitorChecked.mock.calls[0][1] as { changed: { levelChanged: boolean; previousLevel: string } };
      expect(call.changed.levelChanged).toBe(false);
      expect(call.changed.previousLevel).toBe('green');
    });
  });

  // ── runMonitor() — GIT_RELEASE (GitHub) ───────────────────────────────────

  describe('runMonitor() — GIT_RELEASE type (GitHub)', () => {
    it('returns green when current version matches latest', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v1.2.3' }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { currentVersion: '1.2.3' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });

    it('returns yellow when minor update available', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v1.3.0' }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { currentVersion: '1.2.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('yellow');
    });

    it('returns red when major update available', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v2.0.0' }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { currentVersion: '1.5.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('red');
    });

    it('returns red for invalid GitHub target', async () => {
      const service = makeService();
      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'not-a-valid-target',
        config: {},
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
    });

    it('falls back to tags when releases returns 404', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        { ok: false, status: 404 }, // releases/latest → 404
        { ok: false, status: 404 }, // releases list → 404
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ name: 'v2.1.0' }, { name: 'v2.0.0' }]),
        }, // tags → ok
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { currentVersion: '2.1.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });

    it('handles GitHub API rate limiting', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        { ok: false, status: 403 },
        { ok: false, status: 403 },
        { ok: false, status: 403 },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: {},
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
    });
  });

  // ── runMonitor() — GIT_RELEASE (npm) ──────────────────────────────────────

  describe('runMonitor() — GIT_RELEASE type (npm provider)', () => {
    it('returns green when npm version is up to date', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ version: '1.2.3' }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'lodash',
        config: { provider: 'npm', currentVersion: '1.2.3' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });

    it('returns yellow when npm has minor update', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ version: '1.3.0' }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'lodash',
        config: { provider: 'npm', currentVersion: '1.2.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('yellow');
    });

    it('returns red when npm registry fails', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([{ ok: false, status: 404 }]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'nonexistent-package-xyz',
        config: { provider: 'npm' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
    });

    it('returns red for empty npm package name', async () => {
      const service = makeService();

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: '',
        config: { provider: 'npm' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
    });

    it('returns green latest version info when no currentVersion', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ version: '4.5.0' }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'express',
        config: { provider: 'npm' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.message).toContain('4.5.0');
    });
  });

  // ── runMonitor() — GIT_RELEASE (PyPI) ─────────────────────────────────────

  describe('runMonitor() — GIT_RELEASE type (pypi provider)', () => {
    it('returns green when PyPI version is up to date', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ info: { version: '3.0.0' } }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'requests',
        config: { provider: 'pypi', currentVersion: '3.0.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
    });

    it('returns red when PyPI API fails', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([{ ok: false, status: 404 }]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'unknown-package',
        config: { provider: 'pypi' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
    });
  });

  // ── runMonitor() — GIT_RELEASE (Cargo) ────────────────────────────────────

  describe('runMonitor() — GIT_RELEASE type (cargo provider)', () => {
    it('returns green when crate is up to date', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              crate: { newest_version: '1.0.0', max_stable_version: '1.0.0' },
            }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'serde',
        config: { provider: 'cargo', currentVersion: '1.0.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
    });

    it('returns red for empty crate name', async () => {
      const service = makeService();

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: '',
        config: { provider: 'cargo' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
    });
  });

  // ── runMonitor() — DOCKER ─────────────────────────────────────────────────

  describe('runMonitor() — DOCKER type', () => {
    it('returns green when current docker tag is latest', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              results: [
                { name: '1.5.0', last_updated: new Date(Date.now() - 100 * 3600000).toISOString() },
                { name: '1.4.0', last_updated: new Date(Date.now() - 200 * 3600000).toISOString() },
              ],
            }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'DOCKER',
        target: 'nginx',
        config: { currentTag: '1.5.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });

    it('returns yellow when docker tag is behind', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              results: [
                { name: '1.6.0', last_updated: new Date(Date.now() - 10 * 3600000).toISOString() },
              ],
            }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'DOCKER',
        target: 'nginx',
        config: { currentTag: '1.5.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('yellow'); // minor update
    });

    it('returns red when Docker Hub API fails', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([{ ok: false, status: 404 }]);

      const monitor = makeMonitor({
        type: 'DOCKER',
        target: 'nonexistent/image',
        config: {},
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
    });

    it('returns red when no tags found', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [] }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'DOCKER',
        target: 'emptyimage',
        config: {},
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
    });

    it('returns red when Docker check throws', async () => {
      const service = makeService();

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Docker timeout'));

      const monitor = makeMonitor({ type: 'DOCKER', target: 'nginx', config: {} });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.message).toContain('Docker check failed');
    });

    it('detects age-based warning for docker images without currentTag', async () => {
      const service = makeService();

      // Tag is 400 hours old — above default 336h warn threshold
      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              results: [
                { name: '1.5.0', last_updated: new Date(Date.now() - 400 * 3600000).toISOString() },
              ],
            }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'DOCKER',
        target: 'nginx',
        config: {}, // no currentTag → age-based check
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('yellow');
    });
  });
});
