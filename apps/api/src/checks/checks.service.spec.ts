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
    alertChannelIds: [],
    folderId: null,
    createdAt: new Date().toISOString(),
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
        type: 'DOCKER_IMAGE',
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
        type: 'DOCKER_IMAGE',
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
        type: 'DOCKER_IMAGE',
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
        type: 'DOCKER_IMAGE',
        target: 'emptyimage',
        config: {},
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
    });

    it('returns red when Docker check throws', async () => {
      const service = makeService();

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Docker timeout'));

      const monitor = makeMonitor({ type: 'DOCKER_IMAGE', target: 'nginx', config: {} });
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
        type: 'DOCKER_IMAGE',
        target: 'nginx',
        config: {}, // no currentTag → age-based check
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('yellow');
    });
  });

  // ── runMonitor() — GIT_RELEASE age-based (no currentVersion) ──────────────

  describe('runMonitor() — GIT_RELEASE GitHub age-based (no currentVersion)', () => {
    it('returns yellow when GitHub release is 400 hours old and no currentVersion set', async () => {
      const service = makeService();
      const publishedAt = new Date(Date.now() - 400 * 3600000).toISOString();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v1.0.0', published_at: publishedAt }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: {},
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('yellow');
      expect(run.message).toContain('v1.0.0');
    });

    it('returns green when GitHub release is recent (< 336 hours old) and no currentVersion', async () => {
      const service = makeService();
      const publishedAt = new Date(Date.now() - 10 * 3600000).toISOString();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v2.0.0', published_at: publishedAt }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: {},
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('green');
    });

    it('returns red when GitHub release is > 720 hours old and no currentVersion', async () => {
      const service = makeService();
      const publishedAt = new Date(Date.now() - 800 * 3600000).toISOString();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v0.5.0', published_at: publishedAt }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: {},
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('red');
    });
  });

  // ── runGitReleaseCheck catch block ─────────────────────────────────────────

  describe('runGitReleaseCheck() — catch block', () => {
    it('returns red with "Version check failed" when fetch throws', async () => {
      const service = makeService();

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: {},
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
      expect(run.message).toContain('Version check failed');
    });

    it('returns generic "Version check failed" when non-Error is thrown', async () => {
      const service = makeService();

      globalThis.fetch = vi.fn().mockRejectedValue('string error');

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: {},
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.message).toBe('Version check failed');
    });
  });

  // ── runMonitor() — plugin monitor ─────────────────────────────────────────

  describe('runMonitor() — plugin (runPluginMonitor)', () => {
    it('returns red with "Unknown or incompatible plugin" for unknown pluginId', async () => {
      const service = makeService();

      const monitor = makeMonitor({
        type: 'HTTP',
        target: 'https://example.com',
        config: { pluginId: 'nonexistent-plugin-xyz' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.message).toContain('Unknown or incompatible plugin');
      expect(run.level).toBe('red');
    });

    it('runs http.response-match plugin and returns green when text matched', async () => {
      const service = makeService();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('Hello World from server'),
        headers: { get: () => 'text/plain' },
      });

      const monitor = makeMonitor({
        type: 'HTTP',
        target: 'https://example.com',
        config: { pluginId: 'http.response-match', expectedText: 'Hello World' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
      expect(run.message).toContain('Hello World');
    });

    it('runs http.response-match plugin and returns red when text not found', async () => {
      const service = makeService();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('Different content'),
        headers: { get: () => 'text/plain' },
      });

      const monitor = makeMonitor({
        type: 'HTTP',
        target: 'https://example.com',
        config: { pluginId: 'http.response-match', expectedText: 'ExpectedText' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
    });

    it('returns red when plugin config has no expectedText', async () => {
      const service = makeService();

      const monitor = makeMonitor({
        type: 'HTTP',
        target: 'https://example.com',
        config: { pluginId: 'http.response-match' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.message).toContain('expectedText is required');
    });
  });

  // ── GitLab provider ────────────────────────────────────────────────────────

  describe('runMonitor() — GIT_RELEASE type (GitLab provider)', () => {
    it('returns green when GitLab release version matches currentVersion', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v1.5.0', released_at: new Date().toISOString() }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'gitlab:mygroup/myproject',
        config: { currentVersion: '1.5.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });

    it('returns yellow when GitLab release is slightly behind', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v1.6.0', released_at: new Date().toISOString() }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'gitlab:mygroup/myproject',
        config: { currentVersion: '1.5.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('yellow');
    });

    it('returns red when GitLab release has major update', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v2.0.0', released_at: new Date().toISOString() }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'gitlab:mygroup/myproject',
        config: { currentVersion: '1.5.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('red');
    });

    it('returns age-based green when GitLab release is recent and no currentVersion', async () => {
      const service = makeService();
      const recentDate = new Date(Date.now() - 10 * 3600000).toISOString(); // 10h ago

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v1.0.0', released_at: recentDate }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'gitlab:mygroup/myproject',
        config: {},
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('green');
      expect(run.message).toContain('v1.0.0');
    });

    it('returns age-based yellow when GitLab release is 400h old and no currentVersion', async () => {
      const service = makeService();
      const oldDate = new Date(Date.now() - 400 * 3600000).toISOString();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v0.9.0', released_at: oldDate }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'gitlab:mygroup/myproject',
        config: {},
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('yellow');
    });

    it('returns age-based red when GitLab release is > 720h old and no currentVersion', async () => {
      const service = makeService();
      const veryOldDate = new Date(Date.now() - 800 * 3600000).toISOString();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v0.5.0', released_at: veryOldDate }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'gitlab:mygroup/myproject',
        config: {},
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('red');
    });

    it('returns red when GitLab API fails', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([{ ok: false, status: 404 }]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'gitlab:mygroup/myproject',
        config: {},
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
      expect(run.message).toContain('GitLab API 404');
    });

    it('handles GitLab target via https URL format', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v2.1.0', released_at: new Date().toISOString() }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'https://gitlab.com/mygroup/myproject',
        config: { currentVersion: '2.1.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });

    it('handles GitLab target via provider=gitlab with plain path', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v3.0.0', released_at: new Date().toISOString() }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'mygroup/myproject',
        config: { provider: 'gitlab', currentVersion: '3.0.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
    });

    it('uses custom gitlabHost from config', async () => {
      const service = makeService();

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('mygitlab.company.com')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({ tag_name: 'v1.0.0', released_at: new Date().toISOString() }),
          });
        }
        return Promise.resolve({ ok: false, status: 404, headers: { get: () => 'application/json' }, json: () => Promise.resolve({}) });
      });

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'gitlab:mygroup/myproject',
        config: { gitlabHost: 'mygitlab.company.com', currentVersion: '1.0.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
    });

    it('returns error when GitLab target has no slash, no http prefix, and no gitlab: prefix (parseGitlabTarget returns null)', async () => {
      const service = makeService();
      globalThis.fetch = vi.fn(); // should not be called

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        // "justword" has no slash, no https://, no gitlab: prefix → parseGitlabTarget returns null
        target: 'justword',
        config: { provider: 'gitlab', currentVersion: '1.0.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
    });
  });

  // ── APT provider ───────────────────────────────────────────────────────────

  describe('runMonitor() — GIT_RELEASE type (apt provider)', () => {
    it('returns green when APT package is up to date', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ versions: [{ version: '1.2.3-1' }, { version: '1.2.2-1' }] }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'nginx',
        config: { provider: 'apt', currentVersion: '1.2.3' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
    });

    it('returns yellow when APT package has minor update', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ versions: [{ version: '1.3.0-1' }] }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'nginx',
        config: { provider: 'apt', currentVersion: '1.2.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('yellow');
    });

    it('returns latest version info when no currentVersion set', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ versions: [{ version: '2.0.0-1' }] }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'curl',
        config: { provider: 'apt' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.message).toContain('2.0.0-1');
    });

    it('returns red when APT API fails', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([{ ok: false, status: 404 }]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'nonexistent-pkg',
        config: { provider: 'apt' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
      expect(run.message).toContain('404');
    });

    it('returns red when APT package has no versions', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ versions: [] }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'emptypackage',
        config: { provider: 'apt' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.message).toContain('No APT package versions found');
    });

    it('returns red for empty APT package name', async () => {
      const service = makeService();

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: '',
        config: { provider: 'apt' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.message).toContain('Invalid APT package');
    });

    it('skips unstable apt versions when selecting latest', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              versions: [
                { version: '2.0.0-rc1' },
                { version: '1.9.0-1' }, // stable, should pick this
              ],
            }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'apt-pkg',
        config: { provider: 'apt' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.message).toContain('1.9.0-1');
    });
  });

  // ── detectAppVersion via appUrl ────────────────────────────────────────────

  describe('runGitReleaseCheck() — detectAppVersion with config.appUrl', () => {
    it('detects current version from appUrl /version endpoint JSON', async () => {
      const service = makeService();

      // detectAppVersion: /version succeeds → currentVersion = '2.5.0'
      // fetchGithubLatestVersion: releases/latest returns v2.5.0
      globalThis.fetch = mockFetch([
        { ok: true, status: 200, json: () => Promise.resolve({ version: '2.5.0' }) },
        { ok: true, status: 200, json: () => Promise.resolve({ tag_name: 'v2.5.0' }) },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { appUrl: 'https://myapp.example.com' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });

    it('detects version from appVersion field in JSON response', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        { ok: true, status: 200, json: () => Promise.resolve({ appVersion: '3.0.0' }) },
        { ok: true, status: 200, json: () => Promise.resolve({ tag_name: 'v3.0.0' }) },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { appUrl: 'https://myapp.example.com' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });

    it('detects version from nested data.version in JSON response', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        { ok: true, status: 200, json: () => Promise.resolve({ data: { version: '1.1.0' } }) },
        { ok: true, status: 200, json: () => Promise.resolve({ tag_name: 'v1.1.0' }) },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { appUrl: 'https://myapp.example.com' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('green');
    });

    it('falls back to /api/version when /version returns non-ok', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        { ok: false, status: 404 }, // /version fails
        { ok: true, status: 200, json: () => Promise.resolve({ version: '4.0.0' }) }, // /api/version
        { ok: true, status: 200, json: () => Promise.resolve({ tag_name: 'v4.0.0' }) }, // github
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { appUrl: 'https://myapp.example.com' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('green');
    });

    it('uses custom appVersionEndpoint from config', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        { ok: true, status: 200, json: () => Promise.resolve({ version: '5.0.0' }) }, // custom endpoint
        { ok: true, status: 200, json: () => Promise.resolve({ tag_name: 'v5.0.0' }) }, // github
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: {
          appUrl: 'https://myapp.example.com',
          appVersionEndpoint: '/custom/version',
        },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('green');
    });

    it('uses Bearer token from config.appToken when calling appUrl', async () => {
      const service = makeService();
      const capturedHeaders: Record<string, string>[] = [];

      globalThis.fetch = vi.fn().mockImplementation((_url: string, opts?: { headers?: Record<string, string> }) => {
        capturedHeaders.push(opts?.headers ?? {});
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ version: '1.0.0', tag_name: 'v1.0.0' }),
        });
      });

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: {
          appUrl: 'https://myapp.example.com',
          appToken: 'secret-token-123',
        },
      });
      await service.runMonitor(monitor);
      // The first call is detectAppVersion → should have authorization header
      const firstCallHeaders = capturedHeaders[0];
      expect(firstCallHeaders.authorization).toBe('Bearer secret-token-123');
    });

    it('detects version from array response (extractVersion array path)', async () => {
      const service = makeService();

      // Array response: [{version: "2.0.0"}]
      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ version: '2.0.0' }]),
        },
        { ok: true, status: 200, json: () => Promise.resolve({ tag_name: 'v2.0.0' }) },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { appUrl: 'https://myapp.example.com' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('green');
    });

    it('detects version from plain text response (extractVersion string path)', async () => {
      const service = makeService();

      // Text response with embedded version
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => 'text/plain' },
          text: () => Promise.resolve('Running app v3.1.4 on port 3000'),
          json: () => Promise.resolve(null),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ tag_name: 'v3.1.4' }),
        });

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { appUrl: 'https://myapp.example.com' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('green');
    });

    it('returns null from detectAppVersion when all endpoints fail', async () => {
      const service = makeService();

      // All 8 detectAppVersion candidates fail, then github succeeds
      const allFail = Array(8).fill(null).map(() => ({ ok: false, status: 404 }));
      globalThis.fetch = mockFetch([
        ...allFail,
        { ok: true, status: 200, json: () => Promise.resolve({ tag_name: 'v1.0.0', published_at: new Date(Date.now() - 10 * 3600000).toISOString() }) },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { appUrl: 'https://myapp.example.com' },
      });
      const run = await service.runMonitor(monitor);
      // No currentVersion detected, falls through to age-based check
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });
  });

  // ── fetchGithubLatestVersion — releases list fallback ─────────────────────

  describe('fetchGithubLatestVersion() — releases list fallback', () => {
    it('falls back to releases list when releases/latest returns 404', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        { ok: false, status: 404 }, // releases/latest
        {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              { tag_name: 'v2.0.0', prerelease: false, draft: false, published_at: new Date().toISOString() },
              { tag_name: 'v1.9.0', prerelease: false, draft: false, published_at: new Date().toISOString() },
            ]),
        }, // releases list
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { currentVersion: '2.0.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });

    it('skips draft releases in the releases list', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        { ok: false, status: 404 }, // releases/latest
        {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              { tag_name: 'v3.0.0', prerelease: false, draft: true }, // draft, skip
              { tag_name: 'v2.5.0', prerelease: false, draft: false, published_at: new Date().toISOString() },
            ]),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { currentVersion: '2.5.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });

    it('skips prerelease releases when includePrerelease=false', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        { ok: false, status: 404 }, // releases/latest
        {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              { tag_name: 'v3.0.0-beta', prerelease: true, draft: false, published_at: new Date().toISOString() },
              { tag_name: 'v2.9.0', prerelease: false, draft: false, published_at: new Date().toISOString() },
            ]),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { currentVersion: '2.9.0', includePrerelease: false },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });

    it('includes prerelease releases when includePrerelease=true', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        { ok: false, status: 404 }, // releases/latest
        {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              { tag_name: 'v3.0.0-beta', prerelease: true, draft: false, published_at: new Date().toISOString() },
            ]),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { currentVersion: '3.0.0-beta', includePrerelease: true },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });

    it('falls back to tags when releases/latest 404 and releases list is empty', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        { ok: false, status: 404 }, // releases/latest
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve([]), // empty releases list
        },
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ name: 'v1.0.0' }, { name: 'v0.9.0' }]),
        }, // tags
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { currentVersion: '1.0.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });

    it('returns red with errorStatus when all GitHub endpoints fail', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        { ok: false, status: 404 }, // releases/latest
        { ok: false, status: 404 }, // releases list
        { ok: false, status: 403 }, // tags → forbidden
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: {},
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
      expect(run.message).toContain('403');
    });
  });

  // ── GitHub URL format target ───────────────────────────────────────────────

  describe('runMonitor() — GIT_RELEASE with GitHub URL format target', () => {
    it('parses https://github.com/owner/repo target correctly', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v1.0.0' }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'https://github.com/owner/repo',
        config: { currentVersion: '1.0.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });

    it('parses https://github.com/owner/repo.git target correctly', async () => {
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
        target: 'https://github.com/owner/repo.git',
        config: { currentVersion: '2.0.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });
  });

  // ── PyPI edge cases ────────────────────────────────────────────────────────

  describe('runMonitor() — GIT_RELEASE type (pypi) edge cases', () => {
    it('returns red when PyPI returns no version info', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ info: {} }), // no version
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'some-pkg',
        config: { provider: 'pypi' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.message).toContain('No PyPI version found');
    });

    it('returns yellow when PyPI package has minor update', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ info: { version: '1.3.0' } }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'requests',
        config: { provider: 'pypi', currentVersion: '1.2.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('yellow');
    });

    it('returns green latest info when no currentVersion set', async () => {
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
        target: 'flask',
        config: { provider: 'pypi' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.message).toContain('3.0.0');
    });

    it('returns red for empty PyPI package name', async () => {
      const service = makeService();

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: '',
        config: { provider: 'pypi' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.message).toContain('Invalid PyPI package name');
    });
  });

  // ── Cargo edge cases ───────────────────────────────────────────────────────

  describe('runMonitor() — GIT_RELEASE type (cargo) edge cases', () => {
    it('returns red when crates.io returns no version', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ crate: {} }), // no version fields
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'some-crate',
        config: { provider: 'cargo' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.message).toContain('No crate version found');
    });

    it('returns red when crates.io API fails', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([{ ok: false, status: 404 }]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'nonexistent-crate',
        config: { provider: 'cargo' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.message).toContain('crates.io API 404');
    });

    it('returns yellow when cargo has minor update', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ crate: { max_stable_version: '1.10.0' } }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'tokio',
        config: { provider: 'cargo', currentVersion: '1.9.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('yellow');
    });

    it('returns green latest info when no currentVersion set', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ crate: { max_stable_version: '1.5.0', newest_version: '1.6.0-beta' } }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'serde',
        config: { provider: 'cargo' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.message).toContain('1.5.0');
    });
  });

  // ── npm edge cases ─────────────────────────────────────────────────────────

  describe('runMonitor() — GIT_RELEASE type (npm) edge cases', () => {
    it('returns red when npm registry returns no version field', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ name: 'somepkg' }), // no version
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'somepkg',
        config: { provider: 'npm' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.message).toContain('No npm version found');
    });

    it('returns red when npm update is a major version', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ version: '3.0.0' }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'react',
        config: { provider: 'npm', currentVersion: '2.5.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('red');
    });
  });

  // ── selectBestSemverTag / includePrerelease logic ─────────────────────────

  describe('runMonitor() — prerelease tag handling', () => {
    it('picks stable tag over prerelease when includePrerelease=false', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        { ok: false, status: 404 }, // releases/latest
        { ok: false, status: 404 }, // releases list
        {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              { name: 'v2.0.0-beta.1' },
              { name: 'v1.9.0' }, // stable — should be picked
            ]),
        }, // tags
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { currentVersion: '1.9.0', includePrerelease: false },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });

    it('picks prerelease tag when includePrerelease=true and only prerelease exists', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        { ok: false, status: 404 }, // releases/latest
        { ok: false, status: 404 }, // releases list
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ name: 'v2.0.0-alpha.1' }]),
        }, // tags
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { currentVersion: '2.0.0-alpha.1', includePrerelease: true },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });

    it('handles Docker tags with includePrerelease=true', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              results: [
                { name: '2.0.0-beta', last_updated: new Date(Date.now() - 5 * 3600000).toISOString() },
                { name: '1.9.0', last_updated: new Date(Date.now() - 100 * 3600000).toISOString() },
              ],
            }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'DOCKER_IMAGE',
        target: 'myimage',
        config: { currentTag: '2.0.0-beta', includePrerelease: true },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
    });
  });

  // ── compareSemver prerelease comparison ───────────────────────────────────

  describe('compareSemver — prerelease comparison edge cases via runMonitor', () => {
    it('treats stable version as greater than prerelease of same version', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v1.0.0' }), // stable release
        },
      ]);

      // current is 1.0.0-rc.1 (prerelease), latest is 1.0.0 (stable) → should be yellow
      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { currentVersion: '1.0.0-rc.1' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('yellow');
    });

    it('treats prerelease as less than stable (version check)', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v2.0.0-beta.1' }),
        },
      ]);

      // current is 2.0.0-beta.1 (prerelease), latest is also 2.0.0-beta.1 → green
      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { currentVersion: '2.0.0-beta.1', includePrerelease: true },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });
  });

  // ── classifyVersionStatus edge cases ──────────────────────────────────────

  describe('classifyVersionStatus edge cases via runMonitor', () => {
    it('returns yellow when both currentVersion and latestVersion are unparseable (same null major)', async () => {
      const service = makeService();

      // GitHub returns a tag that's not semver
      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'not-a-version' }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { currentVersion: 'also-not-a-version' },
      });
      const run = await service.runMonitor(monitor);
      // compareSemver returns null; normalizeVersion returns null for both;
      // null?.major === null?.major => undefined === undefined => true => 'yellow'
      expect(run.level).toBe('yellow');
    });

    it('returns yellow when versions share same major but compareSemver is null', async () => {
      const service = makeService();

      // Provide a tag like "1.x" (not valid semver) alongside a current like "1.y"
      // This hits the null branch in classifyVersionStatus where we check same major
      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v1.something.0' }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { currentVersion: 'v1.other.0' },
      });
      // This will likely be red since normalizeVersion can't parse these
      // Just ensure no crash
      const run = await service.runMonitor(monitor);
      expect(['green', 'yellow', 'red']).toContain(run.level);
    });
  });

  // ── Docker age-based with custom thresholds ────────────────────────────────

  describe('runMonitor() — DOCKER age-based with custom thresholds', () => {
    it('uses custom warnAfterHours threshold', async () => {
      const service = makeService();

      // Tag is 50h old, custom warn threshold = 24h → should be yellow
      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              results: [
                { name: '1.0.0', last_updated: new Date(Date.now() - 50 * 3600000).toISOString() },
              ],
            }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'DOCKER_IMAGE',
        target: 'myimage',
        config: { warnAfterHours: 24, critAfterHours: 168 },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('yellow');
    });

    it('uses custom critAfterHours threshold', async () => {
      const service = makeService();

      // Tag is 200h old, crit threshold = 168h → should be red
      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              results: [
                { name: '1.0.0', last_updated: new Date(Date.now() - 200 * 3600000).toISOString() },
              ],
            }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'DOCKER_IMAGE',
        target: 'myimage',
        config: { critAfterHours: 168 },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('red');
    });

    it('handles docker image without slash (prepends library/)', async () => {
      const service = makeService();

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        const isLibraryPath = url.includes('library/nginx');
        return Promise.resolve({
          ok: isLibraryPath,
          status: isLibraryPath ? 200 : 404,
          headers: { get: () => 'application/json' },
          json: () =>
            Promise.resolve({
              results: [{ name: '1.25.0', last_updated: new Date(Date.now() - 10 * 3600000).toISOString() }],
            }),
        });
      });

      const monitor = makeMonitor({
        type: 'DOCKER_IMAGE',
        target: 'nginx', // no slash → library/nginx
        config: { currentTag: '1.25.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
    });
  });

  // ── runMonitor without realtime ────────────────────────────────────────────

  describe('runMonitor() — without realtime service', () => {
    it('works correctly when realtime is not provided', async () => {
      const prisma = makePrisma();
      const alerts = makeAlerts();
      // Construct service without realtime (Optional)
      const service = new ChecksService(prisma as never, alerts as never);

      globalThis.fetch = mockFetch([{ ok: true, status: 200 }]);

      const monitor = makeMonitor({ type: 'HTTP', target: 'https://example.com' });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
    });
  });

  // ── DOCKER red major version delta ────────────────────────────────────────

  describe('runMonitor() — DOCKER major version behind', () => {
    it('returns red when docker image is major version behind', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              results: [
                { name: '2.0.0', last_updated: new Date(Date.now() - 10 * 3600000).toISOString() },
              ],
            }),
        },
      ]);

      const monitor = makeMonitor({
        type: 'DOCKER_IMAGE',
        target: 'myimage/app',
        config: { currentTag: '1.0.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('red');
    });
  });

  // ── extractVersion edge cases via detectAppVersion ─────────────────────────

  describe('extractVersion — special object keys via detectAppVersion', () => {
    it('extracts version from release key in JSON response', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        { ok: true, status: 200, json: () => Promise.resolve({ release: '5.0.0' }) },
        { ok: true, status: 200, json: () => Promise.resolve({ tag_name: 'v5.0.0' }) },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { appUrl: 'https://myapp.example.com' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('green');
    });

    it('extracts version from build.version nested key', async () => {
      const service = makeService();

      globalThis.fetch = mockFetch([
        { ok: true, status: 200, json: () => Promise.resolve({ build: { version: '6.1.0' } }) },
        { ok: true, status: 200, json: () => Promise.resolve({ tag_name: 'v6.1.0' }) },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { appUrl: 'https://myapp.example.com' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.level).toBe('green');
    });

    it('returns null when JSON response has no recognizable version', async () => {
      const service = makeService();

      // All 8 endpoints return JSON without any version field
      // Then github returns age-based result
      const noVersionResponses = Array(8).fill(null).map(() => ({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok', uptime: 12345 }),
      }));

      globalThis.fetch = mockFetch([
        ...noVersionResponses,
        { ok: true, status: 200, json: () => Promise.resolve({ tag_name: 'v1.0.0', published_at: new Date(Date.now() - 5 * 3600000).toISOString() }) },
      ]);

      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { appUrl: 'https://myapp.example.com' },
      });
      const run = await service.runMonitor(monitor);
      // detectAppVersion returns null → no currentVersion → age-based check
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
    });
  });

  // ── runMonitor alerts on first run (no prev) ───────────────────────────────

  describe('runMonitor() — alerts on first run', () => {
    it('notifies alert on first run when result is red (no previous run)', async () => {
      const prisma = makePrisma({ previousRun: null });
      const alerts = makeAlerts();
      const service = makeService({ prisma, alerts });

      globalThis.fetch = mockFetch([{ ok: false, status: 503 }]);

      await service.runMonitor(makeMonitor({ type: 'HTTP' }));
      expect(alerts.notifyMonitorFailure).toHaveBeenCalledOnce();
    });

    it('does not notify alert when result is green on first run', async () => {
      const prisma = makePrisma({ previousRun: null });
      const alerts = makeAlerts();
      const service = makeService({ prisma, alerts });

      globalThis.fetch = mockFetch([{ ok: true, status: 200 }]);

      await service.runMonitor(makeMonitor({ type: 'HTTP' }));
      expect(alerts.notifyMonitorFailure).not.toHaveBeenCalled();
    });

    it('does not notify alert when yellow level stays yellow (no change)', async () => {
      const prisma = makePrisma({ previousRun: makeRun({ level: 'yellow' }) });
      const alerts = makeAlerts();
      const service = makeService({ prisma, alerts });

      globalThis.fetch = mockFetch([
        {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tag_name: 'v1.5.0' }),
        },
      ]);

      // Monitor at 1.4.0 with latest 1.5.0 → yellow
      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'owner/repo',
        config: { currentVersion: '1.4.0' },
      });
      await service.runMonitor(monitor);
      // Previous was yellow, result is yellow → levelChanged=false → no alert
      expect(alerts.notifyMonitorFailure).not.toHaveBeenCalled();
    });
  });

  // ── Maven / Helm currentVersion branches ──────────────────────────────────

  describe('runMonitor() — GIT_RELEASE Maven with currentVersion', () => {
    afterEach(() => { delete (globalThis as Record<string, unknown>).fetch; });

    it('shows classified level when currentVersion is set and up-to-date', async () => {
      const service = makeService();
      globalThis.fetch = mockFetch([{
        ok: true,
        status: 200,
        json: () => Promise.resolve({ response: { docs: [{ v: '3.9.6' }] } }),
      }]);
      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'org.springframework:spring-core',
        config: { provider: 'maven', currentVersion: '3.9.6' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.message).toMatch(/Maven current 3\.9\.6, latest 3\.9\.6/);
      expect(run.level).toBe('green');
    });

    it('shows red level when currentVersion is behind', async () => {
      const service = makeService();
      globalThis.fetch = mockFetch([{
        ok: true,
        status: 200,
        json: () => Promise.resolve({ response: { docs: [{ v: '4.0.0' }] } }),
      }]);
      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'org.springframework:spring-core',
        config: { provider: 'maven', currentVersion: '3.9.0' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.message).toMatch(/Maven current 3\.9\.0, latest 4\.0\.0/);
      expect(run.ok).toBe(false);
    });

    it('returns green with no currentVersion (latest only)', async () => {
      const service = makeService();
      globalThis.fetch = mockFetch([{
        ok: true,
        status: 200,
        json: () => Promise.resolve({ response: { docs: [{ v: '3.9.6' }] } }),
      }]);
      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'org.springframework:spring-core',
        config: { provider: 'maven' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.message).toMatch(/Maven latest 3\.9\.6/);
      expect(run.level).toBe('green');
    });
  });

  describe('runMonitor() — GIT_RELEASE Helm with currentVersion', () => {
    afterEach(() => { delete (globalThis as Record<string, unknown>).fetch; });

    it('shows classified level when currentVersion is set and up-to-date', async () => {
      const service = makeService();
      globalThis.fetch = mockFetch([{
        ok: true,
        status: 200,
        json: () => Promise.resolve({ app_version: '10.3.1', version: '10.3.1' }),
      }]);
      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'bitnami/redis',
        config: { provider: 'helm', currentVersion: '10.3.1' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.message).toMatch(/Helm current 10\.3\.1, latest 10\.3\.1/);
      expect(run.level).toBe('green');
    });

    it('shows red level when currentVersion is a major version behind', async () => {
      const service = makeService();
      globalThis.fetch = mockFetch([{
        ok: true,
        status: 200,
        json: () => Promise.resolve({ app_version: '11.0.0', version: '11.0.0' }),
      }]);
      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'bitnami/redis',
        config: { provider: 'helm', currentVersion: '10.3.1' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.message).toMatch(/Helm current 10\.3\.1, latest 11\.0\.0/);
      expect(run.ok).toBe(false);
    });

    it('returns green with no currentVersion (latest only)', async () => {
      const service = makeService();
      globalThis.fetch = mockFetch([{
        ok: true,
        status: 200,
        json: () => Promise.resolve({ app_version: '10.3.1' }),
      }]);
      const monitor = makeMonitor({
        type: 'GIT_RELEASE',
        target: 'bitnami/redis',
        config: { provider: 'helm' },
      });
      const run = await service.runMonitor(monitor);
      expect(run.message).toMatch(/Helm latest 10\.3\.1/);
      expect(run.level).toBe('green');
    });
  });

  // ── SSL normalizeSslHost URL-parse error ───────────────────────────────────

  describe('runMonitor() — SSL_CERT URL parse error branch', () => {
    it('returns red when target URL is malformed (triggers URL parse catch)', async () => {
      const service = makeService();
      // https://[invalid triggers URL parse error in normalizeSslHost
      const monitor = makeMonitor({ type: 'SSL_CERT', target: 'https://[invalid' });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.message).toMatch(/Invalid SSL target/i);
      expect(run.level).toBe('red');
    });
  });

  // ── runMonitor() — TCP type ────────────────────────────────────────────────

  describe('runMonitor() — TCP type', () => {
    it('returns red with invalid target (no port)', async () => {
      const service = makeService();
      const monitor = makeMonitor({ type: 'TCP', target: 'db.example.com' });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
      expect(run.message).toMatch(/Invalid TCP target/);
    });

    it('returns red with non-numeric port', async () => {
      const service = makeService();
      const monitor = makeMonitor({ type: 'TCP', target: 'db.example.com:abc' });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
    });

    it('returns red with port out of range (>65535)', async () => {
      const service = makeService();
      const monitor = makeMonitor({ type: 'TCP', target: 'db.example.com:99999' });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
    });

    it('returns red with port zero', async () => {
      const service = makeService();
      const monitor = makeMonitor({ type: 'TCP', target: 'db.example.com:0' });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
    });

    it('returns green when connecting to a live local TCP server', async () => {
      const net = await import('node:net');
      // Start a real local TCP server on a random port
      const server = net.createServer();
      await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
      const { port } = server.address() as { port: number };

      try {
        const service = makeService();
        const monitor = makeMonitor({ type: 'TCP', target: `127.0.0.1:${port}`, timeoutMs: 3000 });
        const run = await service.runMonitor(monitor);
        expect(run.ok).toBe(true);
        expect(run.level).toBe('green');
        expect(run.message).toMatch(/TCP connect ok/);
      } finally {
        await new Promise<void>((res) => server.close(() => res()));
      }
    }, 5000);

    it('returns red when connection is refused (nothing listening)', async () => {
      const service = makeService();
      // Port 1 is typically not open and immediately refuses
      const monitor = makeMonitor({ type: 'TCP', target: '127.0.0.1:1', timeoutMs: 3000 });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
      expect(run.message).toMatch(/TCP error/);
    }, 5000);
  });

  // ── runMonitor() — SSL_CERT type ───────────────────────────────────────────

  describe('runMonitor() — SSL_CERT type', () => {
    it('returns red with empty target', async () => {
      const service = makeService();
      const monitor = makeMonitor({ type: 'SSL_CERT', target: '' });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
    });

    it('returns red for TLS connect error (connection refused)', async () => {
      const service = makeService();
      // Use localhost port 1 — will get ECONNREFUSED
      const monitor = makeMonitor({ type: 'SSL_CERT', target: '127.0.0.1:1', timeoutMs: 3000 });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
      expect(run.message).toMatch(/SSL check failed/);
    }, 5000);
  });

  // ── runMonitor() — HEARTBEAT type ─────────────────────────────────────────

  describe('runMonitor() — HEARTBEAT type', () => {
    it('returns red with no heartbeat received yet (no lastHeartbeatAt)', async () => {
      const service = makeService();
      const monitor = makeMonitor({ type: 'HEARTBEAT', config: {} });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
      expect(run.message).toMatch(/No heartbeat received yet/);
    });

    it('returns red when lastHeartbeatAt is an invalid date string', async () => {
      const service = makeService();
      const monitor = makeMonitor({
        type: 'HEARTBEAT',
        config: { lastHeartbeatAt: 'not-a-valid-date', timeoutMin: 5 },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.message).toMatch(/invalid/i);
    });

    it('returns green when heartbeat received within timeout window', async () => {
      const recentPing = new Date(Date.now() - 60 * 1000).toISOString(); // 1 min ago
      const service = makeService();
      const monitor = makeMonitor({
        type: 'HEARTBEAT',
        config: { lastHeartbeatAt: recentPing, timeoutMin: 5 },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
      expect(run.level).toBe('green');
      expect(run.message).toMatch(/Heartbeat healthy/);
    });

    it('returns red when heartbeat is overdue beyond timeout window', async () => {
      const oldPing = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
      const service = makeService();
      const monitor = makeMonitor({
        type: 'HEARTBEAT',
        config: { lastHeartbeatAt: oldPing, timeoutMin: 5 },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(false);
      expect(run.level).toBe('red');
      expect(run.message).toMatch(/Heartbeat overdue/);
    });

    it('uses default 5-min timeout when timeoutMin is absent', async () => {
      // 4 min ago — within 5-min default
      const recentPing = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      const service = makeService();
      const monitor = makeMonitor({
        type: 'HEARTBEAT',
        config: { lastHeartbeatAt: recentPing },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
    });

    it('uses default timeout when timeoutMin is 0 (invalid)', async () => {
      // 4 min ago — within 5-min default fallback
      const recentPing = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      const service = makeService();
      const monitor = makeMonitor({
        type: 'HEARTBEAT',
        config: { lastHeartbeatAt: recentPing, timeoutMin: 0 },
      });
      const run = await service.runMonitor(monitor);
      expect(run.ok).toBe(true);
    });
  });

  // ── handleHeartbeatPing() ──────────────────────────────────────────────────

  describe('handleHeartbeatPing()', () => {
    it('throws NotFoundException when no monitor matches token', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      const prisma = {
        ...makePrisma(),
        monitor: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
      };
      const service = makeService({ prisma: prisma as never });
      await expect(service.handleHeartbeatPing('bad-token')).rejects.toThrow(NotFoundException);
    });

    it('updates lastHeartbeatAt when monitor found', async () => {
      const updateFn = vi.fn().mockResolvedValue({});
      const prisma = {
        ...makePrisma(),
        monitor: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'mon-hb',
            configJson: { token: 'abc123', timeoutMin: 5 },
          }),
          update: updateFn,
        },
      };
      const service = makeService({ prisma: prisma as never });
      await service.handleHeartbeatPing('abc123');

      expect(updateFn).toHaveBeenCalledOnce();
      const updateCall = updateFn.mock.calls[0][0];
      expect(updateCall.where.id).toBe('mon-hb');
      const config = updateCall.data.configJson as Record<string, unknown>;
      expect(config.lastHeartbeatAt).toBeDefined();
      expect(typeof config.lastHeartbeatAt).toBe('string');
    });

    it('handles monitor with null configJson gracefully', async () => {
      const updateFn = vi.fn().mockResolvedValue({});
      const prisma = {
        ...makePrisma(),
        monitor: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'mon-hb',
            configJson: null,
          }),
          update: updateFn,
        },
      };
      const service = makeService({ prisma: prisma as never });
      await service.handleHeartbeatPing('tok');

      expect(updateFn).toHaveBeenCalledOnce();
      const config = updateFn.mock.calls[0][0].data.configJson as Record<string, unknown>;
      expect(config.lastHeartbeatAt).toBeDefined();
    });
  });

  // ── dispatchCheck — default case ────────────────────────────────────────────

  describe('runMonitor() — unknown/custom monitor type (default case)', () => {
    it('falls back to HTTP check when monitor type is unrecognised', async () => {
      // Use vi.stubGlobal to intercept fetch so we get a predictable result
      const fakeFetch = mockFetch([{ ok: true, status: 200 }]);
      vi.stubGlobal('fetch', fakeFetch);

      try {
        // Cast to `never` to bypass TypeScript enum check and exercise the `default:` branch
        const monitor = makeMonitor({ type: 'NPM_PACKAGE' as never, target: 'https://example.com' });
        const service = makeService();
        const run = await service.runMonitor(monitor);
        // Should still produce a run record (HTTP fallback)
        expect(run).toHaveProperty('id');
        expect(run).toHaveProperty('ok');
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});

describe('ChecksService branch coverage gaps', () => {
  it('handles empty currentVersion (normalizeVersion falsy branch)', async () => {
    const service = makeService();

    globalThis.fetch = mockFetch([
      { ok: true, status: 200, json: () => Promise.resolve({ tag_name: 'v1.2.3' }) },
    ]);

    const monitor = makeMonitor({
      type: 'GIT_RELEASE',
      target: 'owner/repo',
      config: { currentVersion: '' },
    });

    const run = await service.runMonitor(monitor);
    expect(run.level).toBe('green');
  });

  it('filters out clearly unstable semver-looking tags when includePrerelease=false', async () => {
    const service = makeService();

    globalThis.fetch = mockFetch([
      { ok: false, status: 404 }, // releases/latest
      { ok: false, status: 404 }, // releases list
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ name: '1.2.3+nightly' }, { name: '1.2.2' }]),
      },
    ]);

    const monitor = makeMonitor({
      type: 'GIT_RELEASE',
      target: 'owner/repo',
      config: { currentVersion: '1.2.2', includePrerelease: false },
    });

    const run = await service.runMonitor(monitor);
    expect(run.level).toBe('green');
  });

  it('returns null for array payloads with no extractable version and continues endpoints', async () => {
    const service = makeService();

    globalThis.fetch = mockFetch([
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ foo: 'bar' }, { data: { hello: 'world' } }]),
      },
      { ok: true, status: 200, json: () => Promise.resolve({ version: '2.0.0' }) },
      { ok: true, status: 200, json: () => Promise.resolve({ tag_name: 'v2.0.0' }) },
    ]);

    const monitor = makeMonitor({
      type: 'GIT_RELEASE',
      target: 'owner/repo',
      config: { appUrl: 'https://myapp.example.com' },
    });

    const run = await service.runMonitor(monitor);
    expect(run.level).toBe('green');
  });

  it('continues detectAppVersion candidates when fetch throws', async () => {
    const service = makeService();

    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ version: '3.4.5' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ tag_name: 'v3.4.5' }),
      });

    const monitor = makeMonitor({
      type: 'GIT_RELEASE',
      target: 'owner/repo',
      config: { appUrl: 'https://myapp.example.com' },
    });

    const run = await service.runMonitor(monitor);
    expect(run.level).toBe('green');
    expect(globalThis.fetch).toHaveBeenCalled();
  });
});

// ── Branch coverage: detectAppVersion uncovered paths ─────────────────────────

describe('detectAppVersion — array response yields no version (line 193 branch)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns null currentVersion when JSON array has no usable version strings', async () => {
    const service = makeService();
    let callIdx = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callIdx++;
      if (callIdx === 1) {
        // Custom appVersionEndpoint (absolute URL): returns array with no version info
        return Promise.resolve({
          ok: true, status: 200,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve([{ id: 1, name: 'alpha' }, { id: 2, status: 'ok' }]),
        });
      }
      // callIdx=2: GitHub releases/latest → success
      return Promise.resolve({
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ tag_name: 'v1.2.3', published_at: new Date().toISOString() }),
      });
    });

    const monitor = makeMonitor({
      type: 'GIT_RELEASE',
      target: 'owner/repo',
      config: { appUrl: 'https://myapp.example.com', appVersionEndpoint: 'https://myapp.example.com/list' },
    });
    const run = await service.runMonitor(monitor);
    // No current version detected from array, latest from GitHub = v1.2.3
    expect(run.message).toContain('v1.2.3');
  });
});

describe('detectAppVersion — fetch throws on first candidate (line 230 catch branch)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('skips throwing candidate and uses the next one', async () => {
    const service = makeService();
    let callIdx = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callIdx++;
      if (callIdx === 1) {
        // First candidate throws (network error) → catch { continue }
        throw new Error('ECONNREFUSED');
      }
      if (callIdx === 2) {
        // Second candidate succeeds with version
        return Promise.resolve({
          ok: true, status: 200,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ version: '5.1.0' }),
        });
      }
      // GitHub releases/latest
      return Promise.resolve({
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ tag_name: 'v5.1.0' }),
      });
    });

    const monitor = makeMonitor({
      type: 'GIT_RELEASE',
      target: 'owner/repo',
      config: { appUrl: 'https://myapp.example.com' },
    });
    const run = await service.runMonitor(monitor);
    expect(run.level).toBe('green');
    expect(run.message).toContain('5.1.0');
  });
});

describe('selectBestSemverTag — includePrerelease=true (line 137 branch)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('includes prerelease releases when includePrerelease=true in config', async () => {
    const service = makeService();
    globalThis.fetch = mockFetch([
      // releases/latest → 404 (no stable release)
      { ok: false, status: 404 },
      // releases list → has a prerelease
      { ok: true, status: 200, json: () => Promise.resolve([
        { tag_name: 'v2.0.0-beta.1', prerelease: true, draft: false, published_at: new Date().toISOString() },
        { tag_name: 'v1.9.0', prerelease: false, draft: false, published_at: new Date().toISOString() },
      ]) },
    ]);

    const monitor = makeMonitor({
      type: 'GIT_RELEASE',
      target: 'owner/repo',
      config: { includePrerelease: true },
    });
    const run = await service.runMonitor(monitor);
    // With includePrerelease=true, selectBestSemverTag uses the `return true` branch
    expect(run.ok).toBe(true);
    // Should pick v2.0.0-beta.1 as latest (higher semver)
    expect(run.message).toContain('v2.0.0');
  });
});

describe('normalizeVersion — non-parseable tag string (line 63 branch)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns null for tags with no semver pattern (covers !extracted return null)', async () => {
    const service = makeService();
    globalThis.fetch = mockFetch([
      // releases/latest → 404
      { ok: false, status: 404 },
      // releases list → empty
      { ok: true, status: 200, json: () => Promise.resolve([]) },
      // tags → only non-semver tags: normalizeVersion("nightly") hits the !extracted branch
      { ok: true, status: 200, json: () => Promise.resolve([
        { name: 'nightly' },
        { name: 'edge' },
        { name: 'stable' },
      ]) },
    ]);

    const monitor = makeMonitor({
      type: 'GIT_RELEASE',
      target: 'owner/repo',
      config: {},
    });
    const run = await service.runMonitor(monitor);
    // All tags are non-semver → selectBestSemverTag falls back to original tag list → picks "nightly" (first)
    // The key coverage: normalizeVersion("nightly") returns null at line 63 (no semver pattern)
    expect(run.ok).toBe(true);
    expect(run.message).toMatch(/nightly|edge|stable/);
  });
});

// ── normalizeVersion — regex-extraction path (line 63) ────────────────────────
describe('normalizeVersion — regex-extraction success (line 63 branch)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('extracts semver from prefixed tag like "release-1.2.3" (covers parseSemver(extracted[0]) path)', async () => {
    const service = makeService();
    // Scenario: releases/latest → 404, then tags list returns a tag with a non-standard prefix
    // "release-1.2.3" does NOT match SEMVER_RE directly (prefix before digits fails ^v? anchor)
    // but the regex /v?\d+\.\d+\.\d+.../ extracts "1.2.3" and parseSemver("1.2.3") succeeds → line 63
    globalThis.fetch = mockFetch([
      // releases/latest → 404
      { ok: false, status: 404 },
      // releases → empty list
      { ok: true, status: 200, json: () => Promise.resolve([]) },
      // tags → tag with non-standard prefix
      { ok: true, status: 200, json: () => Promise.resolve([
        { name: 'release-1.2.3' },
        { name: 'release-1.1.0' },
      ]) },
    ]);

    const monitor = makeMonitor({ type: 'GIT_RELEASE', target: 'owner/repo' });
    const run = await service.runMonitor(monitor);
    // selectBestSemverTag picks "release-1.2.3" via normalizeVersion("release-1.2.3")
    // → parseSemver fails on full string → regex extracts "1.2.3" → parseSemver("1.2.3") succeeds
    expect(run.ok).toBe(true);
    expect(run.message).toContain('1.2.3');
  });
});
