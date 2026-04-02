/**
 * Unit tests for MonitorGridView pure-logic helpers.
 *
 * The component embeds several inline computations that are worth
 * testing: status dot class, type label, uptime%, interval label.
 * These are extracted and tested here without React rendering.
 */
import { describe, it, expect } from 'vitest';

// ─── Types ────────────────────────────────────────────────────────────────────

type MonitorType =
  | 'HTTP' | 'TCP' | 'SSL_CERT' | 'HEARTBEAT' | 'DNS' | 'PING' | 'SMTP'
  | 'GIT_RELEASE' | 'DOCKER_IMAGE' | 'BROWSER' | 'WHOIS' | 'FTP' | 'IMAP'
  | 'POP3' | 'CT_LOG' | 'GRAPHQL' | 'TRANSACTION';

type RunLevel = 'green' | 'yellow' | 'red';

interface MonitorRun {
  id: string; monitorId: string; ok: boolean; checkedAt: string;
  level?: RunLevel; latencyMs?: number;
}

interface MonitorItem {
  id: string; name: string; type: MonitorType; target: string;
  intervalSec: number; enabled: boolean; createdAt: string;
}

// ─── Pure logic mirrors (extracted from MonitorGridView.tsx render) ───────────

function getLevel(monitor: MonitorItem, lastRun: MonitorRun | undefined): string {
  if (!monitor.enabled) return 'paused';
  return lastRun?.level ?? 'green';
}

function getDotClass(level: string): string {
  if (level === 'green') return 'bg-success';
  if (level === 'yellow') return 'bg-warning';
  if (level === 'paused') return 'bg-text-muted/60';
  return 'bg-danger'; // red or unknown
}

function getTypeLabel(type: MonitorType): string {
  if (type === 'HTTP') return 'HTTP';
  if (type === 'TCP') return 'TCP';
  if (type === 'SSL_CERT') return 'SSL';
  if (type === 'HEARTBEAT') return 'Heartbeat';
  return type; // fallthrough: return raw type name
}

function computeUptime7d(runs: MonitorRun[]): number | null {
  if (runs.length === 0) return null;
  const upCount = runs.filter((r) => r.ok).length;
  return Math.round((upCount / runs.length) * 100);
}

function getIntervalLabel(intervalSec: number): string {
  if (intervalSec < 60) return `${intervalSec}s`;
  if (intervalSec < 3600) return `${Math.round(intervalSec / 60)}m`;
  return `${Math.round(intervalSec / 3600)}h`;
}

// ─── getLevel ────────────────────────────────────────────────────────────────

describe('MonitorGridView — getLevel', () => {
  const base: MonitorItem = {
    id: 'm-1', name: 'Test', type: 'HTTP', target: 'https://example.com',
    intervalSec: 60, enabled: true, createdAt: '2026-01-01T00:00:00Z',
  };

  it('returns "paused" when monitor is disabled regardless of run', () => {
    const run: MonitorRun = { id: 'r-1', monitorId: 'm-1', ok: false, checkedAt: '', level: 'red' };
    expect(getLevel({ ...base, enabled: false }, run)).toBe('paused');
  });

  it('returns "paused" when disabled and no run', () => {
    expect(getLevel({ ...base, enabled: false }, undefined)).toBe('paused');
  });

  it('returns run level when enabled and run exists', () => {
    const run: MonitorRun = { id: 'r-1', monitorId: 'm-1', ok: true, checkedAt: '', level: 'green' };
    expect(getLevel(base, run)).toBe('green');
  });

  it('returns "green" when enabled and no run', () => {
    expect(getLevel(base, undefined)).toBe('green');
  });

  it('propagates yellow level', () => {
    const run: MonitorRun = { id: 'r-1', monitorId: 'm-1', ok: true, checkedAt: '', level: 'yellow' };
    expect(getLevel(base, run)).toBe('yellow');
  });

  it('propagates red level', () => {
    const run: MonitorRun = { id: 'r-1', monitorId: 'm-1', ok: false, checkedAt: '', level: 'red' };
    expect(getLevel(base, run)).toBe('red');
  });
});

// ─── getDotClass ──────────────────────────────────────────────────────────────

describe('MonitorGridView — getDotClass', () => {
  it('green → bg-success', () => {
    expect(getDotClass('green')).toBe('bg-success');
  });

  it('yellow → bg-warning', () => {
    expect(getDotClass('yellow')).toBe('bg-warning');
  });

  it('paused → bg-text-muted/60', () => {
    expect(getDotClass('paused')).toBe('bg-text-muted/60');
  });

  it('red → bg-danger', () => {
    expect(getDotClass('red')).toBe('bg-danger');
  });

  it('unknown level → bg-danger (fallthrough)', () => {
    expect(getDotClass('unknown')).toBe('bg-danger');
  });
});

// ─── getTypeLabel ──────────────────────────────────────────────────────────────

describe('MonitorGridView — getTypeLabel', () => {
  it('HTTP → "HTTP"', () => expect(getTypeLabel('HTTP')).toBe('HTTP'));
  it('TCP → "TCP"', () => expect(getTypeLabel('TCP')).toBe('TCP'));
  it('SSL_CERT → "SSL"', () => expect(getTypeLabel('SSL_CERT')).toBe('SSL'));
  it('HEARTBEAT → "Heartbeat"', () => expect(getTypeLabel('HEARTBEAT')).toBe('Heartbeat'));

  it('other types fall through to raw type name', () => {
    const other: MonitorType[] = ['DNS', 'PING', 'SMTP', 'GIT_RELEASE', 'DOCKER_IMAGE', 'BROWSER', 'WHOIS', 'FTP', 'IMAP', 'POP3', 'CT_LOG', 'GRAPHQL', 'TRANSACTION'];
    for (const t of other) {
      expect(getTypeLabel(t)).toBe(t);
    }
  });

  it('all monitored types produce non-empty labels', () => {
    const all: MonitorType[] = ['HTTP', 'TCP', 'SSL_CERT', 'HEARTBEAT', 'DNS', 'PING', 'SMTP', 'GIT_RELEASE', 'DOCKER_IMAGE', 'BROWSER', 'WHOIS', 'FTP', 'IMAP', 'POP3', 'CT_LOG', 'GRAPHQL', 'TRANSACTION'];
    for (const t of all) {
      expect(getTypeLabel(t).length).toBeGreaterThan(0);
    }
  });
});

// ─── computeUptime7d ──────────────────────────────────────────────────────────

describe('MonitorGridView — computeUptime7d', () => {
  function makeRun(id: string, ok: boolean): MonitorRun {
    return { id, monitorId: 'm-1', ok, checkedAt: '2026-04-01T00:00:00Z' };
  }

  it('returns null for empty runs', () => {
    expect(computeUptime7d([])).toBeNull();
  });

  it('100% when all runs are ok', () => {
    const runs = [makeRun('1', true), makeRun('2', true), makeRun('3', true)];
    expect(computeUptime7d(runs)).toBe(100);
  });

  it('0% when all runs failed', () => {
    const runs = [makeRun('1', false), makeRun('2', false)];
    expect(computeUptime7d(runs)).toBe(0);
  });

  it('50% when half pass', () => {
    const runs = [makeRun('1', true), makeRun('2', false)];
    expect(computeUptime7d(runs)).toBe(50);
  });

  it('rounds to nearest integer', () => {
    // 2/3 = 66.67 → rounds to 67
    const runs = [makeRun('1', true), makeRun('2', true), makeRun('3', false)];
    expect(computeUptime7d(runs)).toBe(67);
  });

  it('1 run ok → 100%', () => {
    expect(computeUptime7d([makeRun('1', true)])).toBe(100);
  });

  it('1 run failed → 0%', () => {
    expect(computeUptime7d([makeRun('1', false)])).toBe(0);
  });
});

// ─── getIntervalLabel ─────────────────────────────────────────────────────────

describe('MonitorGridView — getIntervalLabel', () => {
  it('seconds label for < 60s', () => {
    expect(getIntervalLabel(30)).toBe('30s');
    expect(getIntervalLabel(1)).toBe('1s');
    expect(getIntervalLabel(59)).toBe('59s');
  });

  it('minutes label for 60s–3599s', () => {
    expect(getIntervalLabel(60)).toBe('1m');
    expect(getIntervalLabel(300)).toBe('5m');
    expect(getIntervalLabel(3540)).toBe('59m');
  });

  it('hours label for ≥ 3600s', () => {
    expect(getIntervalLabel(3600)).toBe('1h');
    expect(getIntervalLabel(7200)).toBe('2h');
    expect(getIntervalLabel(86400)).toBe('24h');
  });

  it('rounds minutes correctly', () => {
    // 90 / 60 = 1.5 → rounds to 2
    expect(getIntervalLabel(90)).toBe('2m');
  });

  it('rounds hours correctly', () => {
    // 5400 / 3600 = 1.5 → rounds to 2
    expect(getIntervalLabel(5400)).toBe('2h');
  });
});
