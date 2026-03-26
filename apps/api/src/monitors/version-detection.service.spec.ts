import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VersionDetectionService } from './version-detection.service';

// ── helpers ────────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    monitor: {
      findMany: vi.fn(),
    },
  } as any;
}

const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = vi.fn(handler) as any;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('VersionDetectionService', () => {
  let service: VersionDetectionService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new VersionDetectionService(prisma);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── testVersionConnection ──────────────────────────────────────────────

  describe('testVersionConnection()', () => {
    it('returns GitHub release version', async () => {
      mockFetch(async (url) => {
        if (url.includes('releases/latest')) return jsonResponse({ tag_name: 'v2.1.0' });
        return new Response('', { status: 404 });
      });
      const result = await service.testVersionConnection({ provider: 'github', target: 'owner/repo' });
      expect(result.ok).toBe(true);
      expect(result.latestVersion).toBe('v2.1.0');
    });

    it('falls back to tags when no GitHub releases', async () => {
      mockFetch(async (url) => {
        if (url.includes('releases/latest')) return new Response('', { status: 404 });
        if (url.includes('tags')) return jsonResponse([{ name: 'v1.0.0' }]);
        return new Response('', { status: 500 });
      });
      const result = await service.testVersionConnection({ provider: 'github', target: 'owner/repo' });
      expect(result.ok).toBe(true);
      expect(result.latestVersion).toBe('v1.0.0');
    });

    it('skips nightly tags and picks non-nightly', async () => {
      mockFetch(async (url) => {
        if (url.includes('releases/latest')) return new Response('', { status: 404 });
        if (url.includes('tags')) return jsonResponse([{ name: 'nightly-2026-03-24' }, { name: 'v1.5.0' }]);
        return new Response('', { status: 500 });
      });
      const result = await service.testVersionConnection({ provider: 'github', target: 'owner/repo' });
      expect(result.latestVersion).toBe('v1.5.0');
    });

    it('rejects invalid GitHub target', async () => {
      const result = await service.testVersionConnection({ provider: 'github', target: 'just-one-part' });
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Invalid GitHub');
    });

    it('returns npm version', async () => {
      mockFetch(async () => jsonResponse({ version: '5.3.1', name: 'express' }));
      const result = await service.testVersionConnection({ provider: 'npm', target: 'express' });
      expect(result.ok).toBe(true);
      expect(result.latestVersion).toBe('5.3.1');
    });

    it('returns PyPI version', async () => {
      mockFetch(async () => jsonResponse({ info: { version: '3.2.1' } }));
      const result = await service.testVersionConnection({ provider: 'pypi', target: 'flask' });
      expect(result.ok).toBe(true);
      expect(result.latestVersion).toBe('3.2.1');
    });

    it('returns Cargo version', async () => {
      mockFetch(async () => jsonResponse({ crate: { max_stable_version: '1.8.0' } }));
      const result = await service.testVersionConnection({ provider: 'cargo', target: 'serde' });
      expect(result.ok).toBe(true);
      expect(result.latestVersion).toBe('1.8.0');
    });

    it('returns Maven version', async () => {
      mockFetch(async () => jsonResponse({ response: { docs: [{ v: '5.3.24' }] } }));
      const result = await service.testVersionConnection({ provider: 'maven', target: 'org.springframework:spring-core' });
      expect(result.ok).toBe(true);
      expect(result.latestVersion).toBe('5.3.24');
    });

    it('rejects invalid Maven target', async () => {
      const result = await service.testVersionConnection({ provider: 'maven', target: 'no-colon' });
      expect(result.ok).toBe(false);
    });

    it('returns Helm version', async () => {
      mockFetch(async () => jsonResponse({ version: '1.0.0', app_version: '2.5.0' }));
      const result = await service.testVersionConnection({ provider: 'helm', target: 'bitnami/redis' });
      expect(result.ok).toBe(true);
      expect(result.latestVersion).toBe('2.5.0');
    });

    it('rejects invalid Helm target', async () => {
      const result = await service.testVersionConnection({ provider: 'helm', target: 'no-slash' });
      expect(result.ok).toBe(false);
    });

    it('returns APT version', async () => {
      mockFetch(async () => jsonResponse({ versions: [{ version: '1.2.3-1', suites: ['bookworm'] }] }));
      const result = await service.testVersionConnection({ provider: 'apt', target: 'nginx' });
      expect(result.ok).toBe(true);
      expect(result.latestVersion).toBe('1.2.3-1');
    });

    it('returns GitLab version', async () => {
      mockFetch(async () => jsonResponse({ tag_name: 'v16.0.0' }));
      const result = await service.testVersionConnection({ provider: 'gitlab', target: 'gitlab-org/gitlab' });
      expect(result.ok).toBe(true);
      expect(result.latestVersion).toBe('v16.0.0');
    });

    it('rejects invalid GitLab target', async () => {
      const result = await service.testVersionConnection({ provider: 'gitlab', target: '' });
      expect(result.ok).toBe(false);
    });

    it('returns Docker Hub version', async () => {
      mockFetch(async () => jsonResponse({ results: [{ name: 'latest' }] }));
      const result = await service.testVersionConnection({ provider: 'docker', target: 'nginx' });
      expect(result.ok).toBe(true);
      expect(result.latestVersion).toBe('latest');
    });

    it('rejects empty npm target', async () => {
      const result = await service.testVersionConnection({ provider: 'npm', target: '' });
      expect(result.ok).toBe(false);
    });

    it('rejects empty PyPI target', async () => {
      const result = await service.testVersionConnection({ provider: 'pypi', target: '' });
      expect(result.ok).toBe(false);
    });

    it('rejects empty Cargo target', async () => {
      const result = await service.testVersionConnection({ provider: 'cargo', target: '' });
      expect(result.ok).toBe(false);
    });

    it('rejects empty APT target', async () => {
      const result = await service.testVersionConnection({ provider: 'apt', target: '' });
      expect(result.ok).toBe(false);
    });

    it('handles HTTP error from GitHub', async () => {
      mockFetch(async () => new Response('', { status: 403 }));
      const result = await service.testVersionConnection({ provider: 'github', target: 'owner/repo' });
      expect(result.ok).toBe(false);
      expect(result.unauthorized).toBe(true);
    });
  });

  // ── versionSummary ─────────────────────────────────────────────────────

  describe('versionSummary()', () => {
    it('returns empty stats when no version monitors exist', async () => {
      prisma.monitor.findMany.mockResolvedValue([]);
      const result = await service.versionSummary('user1');
      expect(result.stats).toEqual({ total: 0, green: 0, yellow: 0, red: 0 });
      expect(result.items).toHaveLength(0);
    });

    it('aggregates stats correctly from monitor runs', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        {
          id: 'm1', name: 'Redis', type: 'DOCKER_IMAGE', target: 'redis',
          configJson: { currentVersion: '7.2.0' },
          runs: [{ level: 'green', message: 'Up to date', checkedAt: new Date() }],
          monitorAlerts: [],
          intervalSec: 3600, createdAt: new Date(),
        },
        {
          id: 'm2', name: 'Grafana', type: 'GIT_RELEASE', target: 'grafana/grafana',
          configJson: { currentVersion: 'v10.0.0' },
          runs: [{ level: 'yellow', message: 'Update available', checkedAt: new Date() }],
          monitorAlerts: [{ alertChannelId: 'ac1', notifyOn: 'all', alertChannel: { id: 'ac1', name: 'Slack', type: 'slack' } }],
          intervalSec: 3600, createdAt: new Date(),
        },
        {
          id: 'm3', name: 'Vault', type: 'GIT_RELEASE', target: 'hashicorp/vault',
          configJson: {},
          runs: [{ level: 'red', message: 'Check failed', checkedAt: new Date() }],
          monitorAlerts: [],
          intervalSec: 7200, createdAt: new Date(),
        },
      ]);

      const result = await service.versionSummary('user1');
      expect(result.stats).toEqual({ total: 3, green: 1, yellow: 1, red: 1 });
      expect(result.items).toHaveLength(3);
      expect(result.items[0].currentVersion).toBe('7.2.0');
      expect(result.items[1].currentVersion).toBe('10.0.0'); // v prefix stripped
      expect(result.items[1].alertChannels).toHaveLength(1);
    });

    it('handles monitors with no runs', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        {
          id: 'm1', name: 'New', type: 'GIT_RELEASE', target: 'x/y',
          configJson: null,
          runs: [],
          monitorAlerts: [],
          intervalSec: 3600, createdAt: new Date(),
        },
      ]);

      const result = await service.versionSummary('user1');
      expect(result.items[0].level).toBe('yellow');
      expect(result.items[0].latestMessage).toBe('No run yet');
      expect(result.items[0].currentVersion).toBe('');
    });
  });

  // ── discoverCurrentVersion ─────────────────────────────────────────────

  describe('discoverCurrentVersion()', () => {
    it('returns version from deployed endpoint when appUrl is provided', async () => {
      mockFetch(async (url) => {
        if (url.includes('myapp.local')) {
          return jsonResponse({ version: '3.4.5' });
        }
        return new Response('', { status: 404 });
      });

      const result = await service.discoverCurrentVersion({
        provider: 'github',
        target: 'owner/repo',
        appUrl: 'https://myapp.local',
        appVersionEndpoint: '/api/version',
        appAuthType: 'none',
      });
      expect(result.currentVersion).toBe('3.4.5');
      expect(result.strategy).toBe('deployed-endpoint');
    });

    it('returns manual strategy when appUrl endpoint fails auth', async () => {
      mockFetch(async () => new Response('', { status: 401 }));

      const result = await service.discoverCurrentVersion({
        provider: 'github',
        target: 'owner/repo',
        appUrl: 'https://secure.local',
        appVersionEndpoint: '/version',
      });
      expect(result.currentVersion).toBeNull();
      expect(result.strategy).toBe('manual');
      expect(result.authFailed).toBe(true);
    });

    it('falls back to latest-release-probe when no appUrl', async () => {
      mockFetch(async (url) => {
        if (url.includes('github.com')) return jsonResponse({ tag_name: 'v5.0.0' });
        return new Response('', { status: 404 });
      });

      const result = await service.discoverCurrentVersion({
        provider: 'github',
        target: 'owner/repo',
      });
      expect(result.currentVersion).toBe('v5.0.0');
      expect(result.strategy).toBe('latest-release-probe');
    });

    it('returns manual with suggestions when all probes fail', async () => {
      mockFetch(async () => new Response('', { status: 500 }));

      const result = await service.discoverCurrentVersion({
        provider: 'docker',
        target: 'nonexistent/image',
      });
      expect(result.currentVersion).toBeNull();
      expect(result.strategy).toBe('manual');
      expect(result.suggestions).toBeDefined();
    });

    it('returns github suggestions (not docker) for non-docker providers', async () => {
      mockFetch(async () => new Response('', { status: 500 }));

      const result = await service.discoverCurrentVersion({
        provider: 'github',
        target: 'owner/repo',
      });
      expect(result.currentVersion).toBeNull();
      expect(result.strategy).toBe('manual');
      expect(result.suggestions).toContain('v1.0.0');
      expect(result.suggestions).not.toContain('latest');
    });

    it('returns docker suggestions for docker provider', async () => {
      mockFetch(async () => new Response('', { status: 500 }));

      const result = await service.discoverCurrentVersion({
        provider: 'docker',
        target: 'myimage',
      });
      expect(result.suggestions).toContain('latest');
      expect(result.suggestions).toContain('stable');
    });
  });

  // ── testVersionConnection — additional edge cases ─────────────────────────

  describe('testVersionConnection() — additional branches', () => {
    it('returns null latestVersion for APT when only pre-release versions found', async () => {
      mockFetch(async () => jsonResponse({
        versions: [
          { version: '2.0.0-alpha', suites: ['sid'] },
          { version: '1.0.0-rc1', suites: ['testing'] },
        ],
      }));

      const svc = new (service.constructor as typeof VersionDetectionService)(makePrisma() as never);
      const result = await svc.testVersionConnection({ provider: 'apt', target: 'libssl', token: '' });
      expect(result.ok).toBe(true);
      // No stable version found, falls back to first version
      expect(result.latestVersion).toBe('2.0.0-alpha');
    });

    it('prefers stable APT version over pre-release', async () => {
      mockFetch(async () => jsonResponse({
        versions: [
          { version: '2.0.0-beta', suites: ['sid'] },
          { version: '1.9.8', suites: ['stable'] },
          { version: '1.9.7', suites: ['oldstable'] },
        ],
      }));

      const svc = new (service.constructor as typeof VersionDetectionService)(makePrisma() as never);
      const result = await svc.testVersionConnection({ provider: 'apt', target: 'libssl', token: '' });
      expect(result.ok).toBe(true);
      expect(result.latestVersion).toBe('1.9.8');
    });

    it('handles empty APT versions array', async () => {
      mockFetch(async () => jsonResponse({ versions: [] }));

      const svc = new (service.constructor as typeof VersionDetectionService)(makePrisma() as never);
      const result = await svc.testVersionConnection({ provider: 'apt', target: 'somepackage', token: '' });
      expect(result.ok).toBe(true);
      expect(result.latestVersion).toBeNull();
    });

    it('returns cargo newest_version fallback when max_stable_version is absent', async () => {
      mockFetch(async () => jsonResponse({
        crate: { newest_version: '0.9.0' },
      }));

      const svc = new (service.constructor as typeof VersionDetectionService)(makePrisma() as never);
      const result = await svc.testVersionConnection({ provider: 'cargo', target: 'tokio', token: '' });
      expect(result.ok).toBe(true);
      expect(result.latestVersion).toBe('0.9.0');
    });

    it('handles Docker Hub API error (non-ok response)', async () => {
      mockFetch(async () => new Response('{}', { status: 429 }));

      const svc = new (service.constructor as typeof VersionDetectionService)(makePrisma() as never);
      const result = await svc.testVersionConnection({ provider: 'docker', target: 'nginx', token: '' });
      expect(result.ok).toBe(false);
      expect(result.message).toContain('429');
    });

    it('adds library/ prefix for Docker Hub image without namespace', async () => {
      let requestedUrl = '';
      mockFetch(async (url) => {
        requestedUrl = url;
        return jsonResponse({ results: [{ name: 'latest' }] });
      });

      const svc = new (service.constructor as typeof VersionDetectionService)(makePrisma() as never);
      await svc.testVersionConnection({ provider: 'docker', target: 'nginx', token: '' });
      expect(requestedUrl).toContain('library/nginx');
    });

    it('uses provided namespace for Docker Hub image with slash', async () => {
      let requestedUrl = '';
      mockFetch(async (url) => {
        requestedUrl = url;
        return jsonResponse({ results: [{ name: '2.0' }] });
      });

      const svc = new (service.constructor as typeof VersionDetectionService)(makePrisma() as never);
      await svc.testVersionConnection({ provider: 'docker', target: 'bitnami/nginx', token: '' });
      expect(requestedUrl).toContain('bitnami/nginx');
      expect(requestedUrl).not.toContain('library/bitnami/nginx');
    });

    it('returns error for HTTP failure on npm', async () => {
      mockFetch(async () => new Response('{}', { status: 503 }));

      const svc = new (service.constructor as typeof VersionDetectionService)(makePrisma() as never);
      const result = await svc.testVersionConnection({ provider: 'npm', target: 'express', token: '' });
      expect(result.ok).toBe(false);
      expect(result.message).toContain('503');
    });

    it('returns error for PyPI HTTP failure', async () => {
      mockFetch(async () => new Response('{}', { status: 404 }));

      const svc = new (service.constructor as typeof VersionDetectionService)(makePrisma() as never);
      const result = await svc.testVersionConnection({ provider: 'pypi', target: 'requests', token: '' });
      expect(result.ok).toBe(false);
      expect(result.message).toContain('404');
    });

    it('returns error for Maven HTTP failure', async () => {
      mockFetch(async () => new Response('{}', { status: 500 }));

      const svc = new (service.constructor as typeof VersionDetectionService)(makePrisma() as never);
      const result = await svc.testVersionConnection({ provider: 'maven', target: 'org.springframework:spring-core', token: '' });
      expect(result.ok).toBe(false);
      expect(result.message).toContain('500');
    });

    it('returns error when Maven response has no docs', async () => {
      mockFetch(async () => jsonResponse({ response: { docs: [] } }));

      const svc = new (service.constructor as typeof VersionDetectionService)(makePrisma() as never);
      const result = await svc.testVersionConnection({ provider: 'maven', target: 'com.example:my-artifact', token: '' });
      expect(result.ok).toBe(false);
      expect(result.message).toContain('No Maven artifact');
    });

    it('returns error for Helm HTTP failure', async () => {
      mockFetch(async () => new Response('{}', { status: 404 }));

      const svc = new (service.constructor as typeof VersionDetectionService)(makePrisma() as never);
      const result = await svc.testVersionConnection({ provider: 'helm', target: 'bitnami/redis', token: '' });
      expect(result.ok).toBe(false);
      expect(result.message).toContain('404');
    });

    it('returns error when Helm response has no version', async () => {
      mockFetch(async () => jsonResponse({ readme: 'no version field here' }));

      const svc = new (service.constructor as typeof VersionDetectionService)(makePrisma() as never);
      const result = await svc.testVersionConnection({ provider: 'helm', target: 'stable/redis', token: '' });
      expect(result.ok).toBe(false);
      expect(result.message).toContain('No Helm chart version');
    });

    it('returns GitLab null latestVersion when tag_name missing', async () => {
      mockFetch(async (url) => {
        if (url.includes('gitlab')) return jsonResponse({});
        return new Response('', { status: 404 });
      });

      const svc = new (service.constructor as typeof VersionDetectionService)(makePrisma() as never);
      const result = await svc.testVersionConnection({ provider: 'gitlab', target: 'gitlab.com/org/repo', token: '' });
      expect(result.ok).toBe(true);
      expect(result.latestVersion).toBeNull();
    });
  });
});
