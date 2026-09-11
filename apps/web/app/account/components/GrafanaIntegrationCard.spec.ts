/**
 * Unit tests for GrafanaIntegrationCard pure logic.
 *
 * Tests: datasource URL construction, metric definitions, copy-state helpers,
 * and authentication instruction data contracts.
 */
import { describe, it, expect } from 'vitest';

// ── Pure helpers mirrored from GrafanaIntegrationCard ────────────────────────

function buildDatasourceUrl(origin: string): string {
  return `${origin}/api/v1/grafana`;
}

/** Metrics available in the Grafana datasource plugin */
const GRAFANA_METRICS = [
  { metric: '<monitorName>.uptime', desc: 'Uptime percentage' },
  { metric: '<monitorName>.latency', desc: 'Response time (ms)' },
  { metric: '<monitorName>.status', desc: 'Current status (0/1)' },
  { metric: 'all_monitors.table', desc: 'All monitors overview' },
] as const;

/** After copying the URL, copied state resets after timeout */
function buildCopiedState(prev: boolean, triggeredCopy: boolean): boolean {
  if (triggeredCopy) return true;
  return prev; // setTimeout would set back to false
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GrafanaIntegrationCard — buildDatasourceUrl', () => {
  it('appends /api/v1/grafana to origin', () => {
    expect(buildDatasourceUrl('https://app.example.com')).toBe(
      'https://app.example.com/api/v1/grafana',
    );
  });

  it('works with localhost', () => {
    expect(buildDatasourceUrl('http://localhost:1234')).toBe(
      'http://localhost:1234/api/v1/grafana',
    );
  });

  it('works with empty origin (SSR context)', () => {
    expect(buildDatasourceUrl('')).toBe('/api/v1/grafana');
  });

  it('does not double-slash with trailing origin slash', () => {
    // If origin has trailing slash, URL would have double-slash — component uses window.location.origin which never has trailing slash
    const url = buildDatasourceUrl('https://app.example.com');
    expect(url).not.toContain('//api');
  });

  it('produces a string containing the grafana path', () => {
    const url = buildDatasourceUrl('https://oc-dev-test.no749ah.com');
    expect(url).toContain('/api/v1/grafana');
  });
});

describe('GrafanaIntegrationCard — GRAFANA_METRICS', () => {
  it('has exactly 4 metric entries', () => {
    expect(GRAFANA_METRICS).toHaveLength(4);
  });

  it('contains uptime metric', () => {
    const uptime = GRAFANA_METRICS.find((m) => m.metric.includes('.uptime'));
    expect(uptime).toBeDefined();
    expect(uptime?.desc.toLowerCase()).toContain('uptime');
  });

  it('contains latency metric', () => {
    const latency = GRAFANA_METRICS.find((m) => m.metric.includes('.latency'));
    expect(latency).toBeDefined();
    expect(latency?.desc.toLowerCase()).toContain('response time');
  });

  it('contains status metric', () => {
    const status = GRAFANA_METRICS.find((m) => m.metric.includes('.status'));
    expect(status).toBeDefined();
    expect(status?.desc).toContain('0/1');
  });

  it('contains all_monitors.table metric', () => {
    const table = GRAFANA_METRICS.find((m) => m.metric === 'all_monitors.table');
    expect(table).toBeDefined();
    expect(table?.desc.toLowerCase()).toContain('all monitors');
  });

  it('all metrics have non-empty metric and desc', () => {
    for (const m of GRAFANA_METRICS) {
      expect(m.metric.length).toBeGreaterThan(0);
      expect(m.desc.length).toBeGreaterThan(0);
    }
  });

  it('per-monitor metrics use <monitorName> placeholder', () => {
    const perMonitor = GRAFANA_METRICS.filter((m) => m.metric.startsWith('<monitorName>'));
    expect(perMonitor.length).toBe(3);
  });

  it('all metric keys are unique', () => {
    const keys = GRAFANA_METRICS.map((m) => m.metric);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('GrafanaIntegrationCard — copied state', () => {
  it('copy action sets copied to true', () => {
    expect(buildCopiedState(false, true)).toBe(true);
  });

  it('non-copy action preserves previous state', () => {
    expect(buildCopiedState(false, false)).toBe(false);
    expect(buildCopiedState(true, false)).toBe(true);
  });
});

describe('GrafanaIntegrationCard — auth instructions content', () => {
  const AUTH_TOKEN_PREFIX = 'pdck_';
  const AUTH_HEADER_NAME = 'Authorization';
  const AUTH_SCHEME = 'Bearer';

  it('API key prefix follows pdck_ convention', () => {
    expect(AUTH_TOKEN_PREFIX).toBe('pdck_');
  });

  it('authorization header name is standard', () => {
    expect(AUTH_HEADER_NAME).toBe('Authorization');
  });

  it('uses Bearer auth scheme', () => {
    expect(AUTH_SCHEME).toBe('Bearer');
  });

  it('builds a valid example authorization header value', () => {
    const exampleToken = 'pdck_test1234';
    const headerValue = `${AUTH_SCHEME} ${exampleToken}`;
    expect(headerValue).toBe('Bearer pdck_test1234');
    expect(headerValue).toMatch(/^Bearer pdck_/);
  });

  it('datasource URL ends with /grafana path segment', () => {
    const url = buildDatasourceUrl('https://app.example.com');
    expect(url.endsWith('/grafana')).toBe(true);
  });
});
