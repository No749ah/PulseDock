import { describe, it, expect } from 'vitest';
import {
  VERSION_TYPES,
  UPTIME_TYPES,
  SECTION_LABELS,
  type Monitor,
  type MonitorRun,
  type VersionSummaryItem,
  type SectionKey,
  type TimeRange,
} from './useDashboard';

// ── Constants ────────────────────────────────────────────────────────────────

describe('VERSION_TYPES', () => {
  it('contains GIT_RELEASE', () => expect(VERSION_TYPES.has('GIT_RELEASE')).toBe(true));
  it('contains DOCKER_IMAGE', () => expect(VERSION_TYPES.has('DOCKER_IMAGE')).toBe(true));
  it('does not contain HTTP', () => expect(VERSION_TYPES.has('HTTP')).toBe(false));
  it('has exactly 2 members', () => expect(VERSION_TYPES.size).toBe(2));
});

describe('UPTIME_TYPES', () => {
  it('contains HTTP', () => expect(UPTIME_TYPES.has('HTTP')).toBe(true));
  it('contains TCP', () => expect(UPTIME_TYPES.has('TCP')).toBe(true));
  it('contains SSL_CERT', () => expect(UPTIME_TYPES.has('SSL_CERT')).toBe(true));
  it('contains HEARTBEAT', () => expect(UPTIME_TYPES.has('HEARTBEAT')).toBe(true));
  it('contains DNS', () => expect(UPTIME_TYPES.has('DNS')).toBe(true));
  it('contains PING', () => expect(UPTIME_TYPES.has('PING')).toBe(true));
  it('contains SMTP', () => expect(UPTIME_TYPES.has('SMTP')).toBe(true));
  it('contains BROWSER', () => expect(UPTIME_TYPES.has('BROWSER')).toBe(true));
  it('contains FTP', () => expect(UPTIME_TYPES.has('FTP')).toBe(true));
  it('contains IMAP', () => expect(UPTIME_TYPES.has('IMAP')).toBe(true));
  it('contains POP3', () => expect(UPTIME_TYPES.has('POP3')).toBe(true));
  it('does not contain GIT_RELEASE', () => expect(UPTIME_TYPES.has('GIT_RELEASE')).toBe(false));
  it('does not contain DOCKER_IMAGE', () => expect(UPTIME_TYPES.has('DOCKER_IMAGE')).toBe(false));
});

describe('SECTION_LABELS', () => {
  const sections: SectionKey[] = ['uptime', 'versions', 'monitors', 'slo', 'health'];
  it.each(sections)('has label for section "%s"', (key) => {
    expect(typeof SECTION_LABELS[key]).toBe('string');
    expect(SECTION_LABELS[key].length).toBeGreaterThan(0);
  });

  it('uptime label mentions Uptime', () => expect(SECTION_LABELS.uptime).toMatch(/uptime/i));
  it('versions label mentions Version', () => expect(SECTION_LABELS.versions).toMatch(/version/i));
  it('monitors label mentions Monitor', () => expect(SECTION_LABELS.monitors).toMatch(/monitor/i));
  it('slo label mentions SLO', () => expect(SECTION_LABELS.slo).toMatch(/slo/i));
  it('health label mentions Health', () => expect(SECTION_LABELS.health).toMatch(/health/i));
});

// ── Type compatibility ────────────────────────────────────────────────────────

describe('TimeRange type', () => {
  it('accepts all valid time range values', () => {
    const ranges: TimeRange[] = ['1h', '6h', '24h', '7d', '30d'];
    expect(ranges).toHaveLength(5);
  });
});

describe('Monitor interface', () => {
  it('constructs a valid Monitor object', () => {
    const m: Monitor = { id: 'mon_1', name: 'API', type: 'HTTP', enabled: true };
    expect(m.id).toBe('mon_1');
    expect(m.enabled).toBe(true);
  });
});

describe('MonitorRun interface', () => {
  it('constructs a valid MonitorRun object', () => {
    const run: MonitorRun = {
      id: 'run_1',
      monitorId: 'mon_1',
      ok: true,
      statusCode: 200,
      message: 'OK',
      checkedAt: new Date().toISOString(),
      level: 'green',
    };
    expect(run.ok).toBe(true);
    expect(run.level).toBe('green');
  });

  it('allows undefined optional fields', () => {
    const run: MonitorRun = {
      id: 'run_2',
      monitorId: 'mon_2',
      ok: false,
      statusCode: 503,
      message: 'Service Unavailable',
      checkedAt: new Date().toISOString(),
    };
    expect(run.latencyMs).toBeUndefined();
    expect(run.monitorType).toBeUndefined();
  });
});

describe('VersionSummaryItem interface', () => {
  it('constructs valid items for each level', () => {
    const green: VersionSummaryItem = { id: 'mon_1', level: 'green' };
    const yellow: VersionSummaryItem = { id: 'mon_2', level: 'yellow' };
    const red: VersionSummaryItem = { id: 'mon_3', level: 'red' };
    expect(green.level).toBe('green');
    expect(yellow.level).toBe('yellow');
    expect(red.level).toBe('red');
  });
});

// ── Version/Uptime type classification (pure logic via type sets) ─────────────

describe('Monitor type classification', () => {
  const allTypes = [
    'HTTP', 'TCP', 'SSL_CERT', 'HEARTBEAT', 'DNS', 'PING', 'SMTP', 'BROWSER', 'FTP', 'IMAP', 'POP3',
    'GIT_RELEASE', 'DOCKER_IMAGE',
  ];

  it('every type is classified as either uptime OR version (no overlap)', () => {
    for (const t of allTypes) {
      const isUptime = UPTIME_TYPES.has(t);
      const isVersion = VERSION_TYPES.has(t);
      expect(isUptime && isVersion).toBe(false);
    }
  });

  it('uptime and version type sets are disjoint', () => {
    const overlap = [...VERSION_TYPES].filter((t) => UPTIME_TYPES.has(t));
    expect(overlap).toHaveLength(0);
  });

  it('GIT_RELEASE is a version type', () => {
    expect(VERSION_TYPES.has('GIT_RELEASE')).toBe(true);
    expect(UPTIME_TYPES.has('GIT_RELEASE')).toBe(false);
  });

  it('DOCKER_IMAGE is a version type', () => {
    expect(VERSION_TYPES.has('DOCKER_IMAGE')).toBe(true);
    expect(UPTIME_TYPES.has('DOCKER_IMAGE')).toBe(false);
  });

  it('HTTP is an uptime type', () => {
    expect(UPTIME_TYPES.has('HTTP')).toBe(true);
    expect(VERSION_TYPES.has('HTTP')).toBe(false);
  });
});
