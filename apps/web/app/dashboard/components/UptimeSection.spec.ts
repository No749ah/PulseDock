/**
 * Unit tests for UptimeSection pure logic.
 * Tests uptime percentage display, status color thresholds, and monitor type filtering.
 */
import { describe, it, expect } from 'vitest';

// ── UPTIME_TYPES (from dashboard hook) ────────────────────────────────────────
const UPTIME_TYPES = new Set([
  'HTTP', 'TCP', 'SSL_CERT', 'HEARTBEAT', 'DNS', 'PING', 'SMTP', 'BROWSER', 'FTP', 'IMAP', 'POP3',
]);

// ── Uptime colour threshold (mirrors component logic) ────────────────────────
function uptimeColor(pct: number): string {
  if (pct >= 99.9) return 'text-success';
  if (pct >= 95) return 'text-yellow-400';
  return 'text-danger';
}

// ── Uptime percentage formatting (mirrors display pattern) ───────────────────
function formatUptimePct(pct: number): string {
  return pct.toFixed(2) + '%';
}

// ── Status count label ────────────────────────────────────────────────────────
function statusSummary(green: number, yellow: number, red: number): string {
  return `${green} up · ${yellow} degraded · ${red} down`;
}

// ── UPTIME_TYPES tests ────────────────────────────────────────────────────────
describe('UptimeSection — UPTIME_TYPES', () => {
  it('includes HTTP', () => expect(UPTIME_TYPES.has('HTTP')).toBe(true));
  it('includes TCP', () => expect(UPTIME_TYPES.has('TCP')).toBe(true));
  it('includes SSL_CERT', () => expect(UPTIME_TYPES.has('SSL_CERT')).toBe(true));
  it('includes HEARTBEAT', () => expect(UPTIME_TYPES.has('HEARTBEAT')).toBe(true));
  it('includes DNS', () => expect(UPTIME_TYPES.has('DNS')).toBe(true));
  it('includes BROWSER', () => expect(UPTIME_TYPES.has('BROWSER')).toBe(true));

  it('does not include version types', () => {
    expect(UPTIME_TYPES.has('GIT_RELEASE')).toBe(false);
    expect(UPTIME_TYPES.has('DOCKER_IMAGE')).toBe(false);
  });

  it('has 11 entries', () => {
    expect(UPTIME_TYPES.size).toBe(11);
  });
});

// ── Uptime color tests ────────────────────────────────────────────────────────
describe('UptimeSection — uptimeColor', () => {
  it('success for 100%', () => {
    expect(uptimeColor(100)).toBe('text-success');
  });

  it('success for 99.9%', () => {
    expect(uptimeColor(99.9)).toBe('text-success');
  });

  it('yellow for 99.8%', () => {
    expect(uptimeColor(99.8)).toBe('text-yellow-400');
  });

  it('yellow for 95%', () => {
    expect(uptimeColor(95)).toBe('text-yellow-400');
  });

  it('danger for 94.9%', () => {
    expect(uptimeColor(94.9)).toBe('text-danger');
  });

  it('danger for 0%', () => {
    expect(uptimeColor(0)).toBe('text-danger');
  });

  it('three tiers are mutually distinct', () => {
    const colors = [uptimeColor(100), uptimeColor(97), uptimeColor(90)];
    expect(new Set(colors).size).toBe(3);
  });
});

// ── Uptime percentage formatting ──────────────────────────────────────────────
describe('UptimeSection — formatUptimePct', () => {
  it('formats 100 as "100.00%"', () => {
    expect(formatUptimePct(100)).toBe('100.00%');
  });

  it('formats 99.9 as "99.90%"', () => {
    expect(formatUptimePct(99.9)).toBe('99.90%');
  });

  it('formats 0 as "0.00%"', () => {
    expect(formatUptimePct(0)).toBe('0.00%');
  });

  it('formats 95.123 to 2 decimal places', () => {
    expect(formatUptimePct(95.123)).toBe('95.12%');
  });

  it('always ends with %', () => {
    expect(formatUptimePct(50)).toMatch(/%$/);
  });
});

// ── Status summary label ──────────────────────────────────────────────────────
describe('UptimeSection — statusSummary', () => {
  it('formats all-zero state', () => {
    expect(statusSummary(0, 0, 0)).toBe('0 up · 0 degraded · 0 down');
  });

  it('formats mixed state correctly', () => {
    expect(statusSummary(10, 2, 1)).toBe('10 up · 2 degraded · 1 down');
  });

  it('contains "up", "degraded", "down" labels', () => {
    const s = statusSummary(5, 3, 1);
    expect(s).toContain('up');
    expect(s).toContain('degraded');
    expect(s).toContain('down');
  });
});

// ── DashboardStats uptime field expectations ──────────────────────────────────
describe('UptimeSection — stats field invariants', () => {
  interface DashboardStats {
    totalMonitors: number;
    uptimeMonitors: number;
    uptimePct: number;
    uptimeGreen: number;
    uptimeYellow: number;
    uptimeRed: number;
    versionMonitors: number;
    versionUpToDate: number;
    versionUpdateAvailable: number;
    versionMajorBehind: number;
  }

  function validateStats(stats: DashboardStats): string[] {
    const errors: string[] = [];
    if (stats.uptimePct < 0 || stats.uptimePct > 100) errors.push('uptimePct out of range');
    if (stats.uptimeGreen + stats.uptimeYellow + stats.uptimeRed > stats.uptimeMonitors) {
      errors.push('status counts exceed total');
    }
    return errors;
  }

  it('valid stats produce no errors', () => {
    const stats: DashboardStats = {
      totalMonitors: 10, uptimeMonitors: 8, uptimePct: 99.5,
      uptimeGreen: 7, uptimeYellow: 1, uptimeRed: 0,
      versionMonitors: 2, versionUpToDate: 1, versionUpdateAvailable: 1, versionMajorBehind: 0,
    };
    expect(validateStats(stats)).toHaveLength(0);
  });

  it('detects uptimePct > 100', () => {
    const stats: DashboardStats = {
      totalMonitors: 1, uptimeMonitors: 1, uptimePct: 101,
      uptimeGreen: 1, uptimeYellow: 0, uptimeRed: 0,
      versionMonitors: 0, versionUpToDate: 0, versionUpdateAvailable: 0, versionMajorBehind: 0,
    };
    expect(validateStats(stats)).toContain('uptimePct out of range');
  });
});
