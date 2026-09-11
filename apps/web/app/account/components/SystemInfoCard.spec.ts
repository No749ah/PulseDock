/**
 * Unit tests for SystemInfoCard pure logic.
 * Tests formatUptime helper for various durations.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function buildSystemInfoRows(info: { version: string; nodeVersion: string; uptime: number; database: string }, brandName: string) {
  return [
    { label: `${brandName} Version`, value: info.version },
    { label: 'Node.js Version', value: info.nodeVersion },
    { label: 'Uptime', value: formatUptime(Math.round(info.uptime)) },
    { label: 'Database', value: info.database },
  ];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SystemInfoCard — formatUptime', () => {
  it('formats 0 seconds as 0m', () => {
    expect(formatUptime(0)).toBe('0m');
  });

  it('formats 60 seconds as 1m', () => {
    expect(formatUptime(60)).toBe('1m');
  });

  it('formats 59 seconds as 0m', () => {
    expect(formatUptime(59)).toBe('0m');
  });

  it('formats 3600 seconds as 1h 0m', () => {
    expect(formatUptime(3600)).toBe('1h 0m');
  });

  it('formats 3661 seconds as 1h 1m', () => {
    expect(formatUptime(3661)).toBe('1h 1m');
  });

  it('formats 86400 seconds as 1d 0m', () => {
    expect(formatUptime(86400)).toBe('1d 0m');
  });

  it('formats 86400 + 3600 seconds as 1d 1h 0m', () => {
    expect(formatUptime(86400 + 3600)).toBe('1d 1h 0m');
  });

  it('formats 2 days 3 hours 15 minutes', () => {
    const seconds = 2 * 86400 + 3 * 3600 + 15 * 60;
    expect(formatUptime(seconds)).toBe('2d 3h 15m');
  });

  it('does not include days part when less than 1 day', () => {
    expect(formatUptime(7200)).toBe('2h 0m');
    expect(formatUptime(7200)).not.toContain('d');
  });

  it('does not include hours part for sub-hour durations', () => {
    expect(formatUptime(1800)).toBe('30m');
    expect(formatUptime(1800)).not.toContain('h');
  });

  it('always includes minutes part', () => {
    expect(formatUptime(86400)).toContain('m');
    expect(formatUptime(3600)).toContain('m');
    expect(formatUptime(0)).toContain('m');
  });

  it('handles large uptime (30 days)', () => {
    const result = formatUptime(30 * 86400);
    expect(result).toBe('30d 0m');
  });

  it('formats fractional seconds by rounding', () => {
    expect(formatUptime(Math.round(61.7))).toBe('1m');
    expect(formatUptime(Math.round(3660.5))).toBe('1h 1m');
  });
});

describe('SystemInfoCard — buildSystemInfoRows', () => {
  const info = {
    version: 'v1.6.0',
    nodeVersion: 'v20.10.0',
    uptime: 7200,
    database: 'PostgreSQL 15.2',
  };

  it('returns 4 rows', () => {
    const rows = buildSystemInfoRows(info, 'PulseDock');
    expect(rows).toHaveLength(4);
  });

  it('first row uses brand name', () => {
    const rows = buildSystemInfoRows(info, 'PulseDock');
    expect(rows[0].label).toBe('PulseDock Version');
    expect(rows[0].value).toBe('v1.6.0');
  });

  it('node.js version row is second', () => {
    const rows = buildSystemInfoRows(info, 'PulseDock');
    expect(rows[1].label).toBe('Node.js Version');
    expect(rows[1].value).toBe('v20.10.0');
  });

  it('uptime row is third and formatted', () => {
    const rows = buildSystemInfoRows(info, 'PulseDock');
    expect(rows[2].label).toBe('Uptime');
    expect(rows[2].value).toBe('2h 0m');
  });

  it('database row is fourth', () => {
    const rows = buildSystemInfoRows(info, 'PulseDock');
    expect(rows[3].label).toBe('Database');
    expect(rows[3].value).toBe('PostgreSQL 15.2');
  });

  it('every row has non-empty label and value', () => {
    const rows = buildSystemInfoRows(info, 'PulseDock');
    rows.forEach((r) => {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.value.length).toBeGreaterThan(0);
    });
  });
});
