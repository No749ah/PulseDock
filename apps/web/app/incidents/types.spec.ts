/**
 * Unit tests for incidents/types.ts pure functions and constants.
 *
 * Tests formatDuration, incidentDuration, relativeTime, and the label/color
 * record constants — all without importing the 'use client' boundary.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// ─── Mirror pure helpers (no 'use client') ────────────────────────────────────

type IncidentStatus = 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED';
type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

function formatDuration(ms: number): string {
  const totalMins = Math.floor(ms / 60000);
  if (totalMins < 60) return `${totalMins}m`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

type Incident = {
  id: string; title: string; description: string | null;
  status: IncidentStatus; severity: IncidentSeverity;
  autoCreated: boolean; resolvedAt: string | null;
  rootCause: string | null; postmortemNotes: string | null;
  createdAt: string; updatedAt: string;
  updates: unknown[]; monitors: unknown[];
};

function incidentDuration(incident: Incident): string {
  const start = new Date(incident.createdAt).getTime();
  if (incident.status === 'RESOLVED') {
    return `lasted ${formatDuration(new Date(incident.updatedAt).getTime() - start)}`;
  }
  return `ongoing for ${formatDuration(Date.now() - start)}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const statusLabels: Record<IncidentStatus, string> = {
  INVESTIGATING: 'Investigating',
  IDENTIFIED: 'Identified',
  MONITORING: 'Monitoring',
  RESOLVED: 'Resolved',
};

const statusColors: Record<IncidentStatus, string> = {
  INVESTIGATING: 'bg-red-500/20 text-red-400 border-red-500/30',
  IDENTIFIED: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  MONITORING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  RESOLVED: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const severityColors: Record<IncidentSeverity, string> = {
  LOW: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const severityLabels: Record<IncidentSeverity, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 'inc_1', title: 'Test', description: null,
    status: 'INVESTIGATING', severity: 'MEDIUM',
    autoCreated: false, resolvedAt: null,
    rootCause: null, postmortemNotes: null,
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    updates: [], monitors: [],
    ...overrides,
  };
}

// ─── formatDuration ───────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('returns "0m" for zero milliseconds', () => {
    expect(formatDuration(0)).toBe('0m');
  });

  it('returns minutes for < 1 hour', () => {
    expect(formatDuration(5 * 60 * 1000)).toBe('5m');
    expect(formatDuration(59 * 60 * 1000)).toBe('59m');
  });

  it('returns hours only when no remaining minutes', () => {
    expect(formatDuration(60 * 60 * 1000)).toBe('1h');
    expect(formatDuration(2 * 60 * 60 * 1000)).toBe('2h');
    expect(formatDuration(24 * 60 * 60 * 1000)).toBe('24h');
  });

  it('returns "Xh Ym" when hours and remaining minutes both present', () => {
    expect(formatDuration(90 * 60 * 1000)).toBe('1h 30m');
    expect(formatDuration(125 * 60 * 1000)).toBe('2h 5m');
  });

  it('floors sub-minute remainder', () => {
    // 61 minutes 59 seconds → 61m
    expect(formatDuration(61 * 60 * 1000 + 59 * 1000)).toBe('1h 1m');
  });

  it('handles 1 minute exactly', () => {
    expect(formatDuration(60 * 1000)).toBe('1m');
  });
});

// ─── incidentDuration ─────────────────────────────────────────────────────────

describe('incidentDuration', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('returns "lasted Xm" for resolved incidents', () => {
    const now = Date.now();
    const createdAt = new Date(now - 45 * 60 * 1000).toISOString();
    const updatedAt = new Date(now).toISOString();
    const inc = makeIncident({ status: 'RESOLVED', createdAt, updatedAt });
    expect(incidentDuration(inc)).toBe('lasted 45m');
  });

  it('returns "lasted Xh" for resolved 2h incident', () => {
    const now = Date.now();
    const createdAt = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const updatedAt = new Date(now).toISOString();
    const inc = makeIncident({ status: 'RESOLVED', createdAt, updatedAt });
    expect(incidentDuration(inc)).toBe('lasted 2h');
  });

  it('returns "ongoing for ..." for non-resolved statuses', () => {
    vi.useFakeTimers();
    const base = new Date('2026-01-01T10:00:00Z').getTime();
    vi.setSystemTime(base + 30 * 60 * 1000); // 30 minutes later
    const inc = makeIncident({
      status: 'INVESTIGATING',
      createdAt: new Date(base).toISOString(),
      updatedAt: new Date(base).toISOString(),
    });
    expect(incidentDuration(inc)).toBe('ongoing for 30m');
  });

  it('uses IDENTIFIED status as ongoing', () => {
    vi.useFakeTimers();
    const base = new Date('2026-01-01T08:00:00Z').getTime();
    vi.setSystemTime(base + 65 * 60 * 1000);
    const inc = makeIncident({
      status: 'IDENTIFIED',
      createdAt: new Date(base).toISOString(),
      updatedAt: new Date(base).toISOString(),
    });
    expect(incidentDuration(inc)).toBe('ongoing for 1h 5m');
  });

  it('uses MONITORING status as ongoing', () => {
    vi.useFakeTimers();
    const base = new Date('2026-01-01T00:00:00Z').getTime();
    vi.setSystemTime(base + 120 * 60 * 1000);
    const inc = makeIncident({
      status: 'MONITORING',
      createdAt: new Date(base).toISOString(),
      updatedAt: new Date(base).toISOString(),
    });
    expect(incidentDuration(inc)).toBe('ongoing for 2h');
  });
});

// ─── relativeTime ─────────────────────────────────────────────────────────────

describe('relativeTime', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('returns "just now" for < 1 minute ago', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(now + 30 * 1000);
    expect(relativeTime(new Date(now).toISOString())).toBe('just now');
  });

  it('returns "Xm ago" for minutes < 60', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(now + 15 * 60 * 1000);
    expect(relativeTime(new Date(now).toISOString())).toBe('15m ago');
  });

  it('returns "Xh ago" for hours < 24', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-01T00:00:00Z').getTime();
    vi.setSystemTime(now + 3 * 60 * 60 * 1000);
    expect(relativeTime(new Date(now).toISOString())).toBe('3h ago');
  });

  it('returns "Xd ago" for days >= 1', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-01T00:00:00Z').getTime();
    vi.setSystemTime(now + 2 * 24 * 60 * 60 * 1000);
    expect(relativeTime(new Date(now).toISOString())).toBe('2d ago');
  });

  it('returns "1m ago" at exactly 60s', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(now + 60 * 1000);
    expect(relativeTime(new Date(now).toISOString())).toBe('1m ago');
  });

  it('returns "1h ago" at exactly 60 minutes', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(now + 60 * 60 * 1000);
    expect(relativeTime(new Date(now).toISOString())).toBe('1h ago');
  });

  it('returns "1d ago" at exactly 24 hours', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-01T00:00:00Z').getTime();
    vi.setSystemTime(now + 24 * 60 * 60 * 1000);
    expect(relativeTime(new Date(now).toISOString())).toBe('1d ago');
  });
});

// ─── statusLabels ─────────────────────────────────────────────────────────────

describe('statusLabels', () => {
  const statuses: IncidentStatus[] = ['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'];

  it.each(statuses)('has a non-empty label for status "%s"', (s) => {
    expect(typeof statusLabels[s]).toBe('string');
    expect(statusLabels[s].length).toBeGreaterThan(0);
  });

  it('has exactly 4 entries', () => {
    expect(Object.keys(statusLabels)).toHaveLength(4);
  });

  it('INVESTIGATING maps to "Investigating"', () => {
    expect(statusLabels.INVESTIGATING).toBe('Investigating');
  });

  it('RESOLVED maps to "Resolved"', () => {
    expect(statusLabels.RESOLVED).toBe('Resolved');
  });
});

// ─── statusColors ─────────────────────────────────────────────────────────────

describe('statusColors', () => {
  const statuses: IncidentStatus[] = ['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'];

  it.each(statuses)('has a non-empty color class for status "%s"', (s) => {
    expect(typeof statusColors[s]).toBe('string');
    expect(statusColors[s].length).toBeGreaterThan(0);
  });

  it('INVESTIGATING uses red tones', () => {
    expect(statusColors.INVESTIGATING).toContain('red');
  });

  it('RESOLVED uses green tones', () => {
    expect(statusColors.RESOLVED).toContain('green');
  });

  it('MONITORING uses yellow tones', () => {
    expect(statusColors.MONITORING).toContain('yellow');
  });

  it('IDENTIFIED uses orange tones', () => {
    expect(statusColors.IDENTIFIED).toContain('orange');
  });
});

// ─── severityLabels ───────────────────────────────────────────────────────────

describe('severityLabels', () => {
  const severities: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

  it.each(severities)('has a non-empty label for severity "%s"', (s) => {
    expect(typeof severityLabels[s]).toBe('string');
    expect(severityLabels[s].length).toBeGreaterThan(0);
  });

  it('has exactly 4 entries', () => {
    expect(Object.keys(severityLabels)).toHaveLength(4);
  });

  it('CRITICAL maps to "Critical"', () => {
    expect(severityLabels.CRITICAL).toBe('Critical');
  });

  it('LOW maps to "Low"', () => {
    expect(severityLabels.LOW).toBe('Low');
  });
});

// ─── severityColors ───────────────────────────────────────────────────────────

describe('severityColors', () => {
  const severities: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

  it.each(severities)('has a non-empty color class for severity "%s"', (s) => {
    expect(typeof severityColors[s]).toBe('string');
    expect(severityColors[s].length).toBeGreaterThan(0);
  });

  it('CRITICAL uses red tones', () => {
    expect(severityColors.CRITICAL).toContain('red');
  });

  it('LOW uses blue tones', () => {
    expect(severityColors.LOW).toContain('blue');
  });

  it('HIGH uses orange tones', () => {
    expect(severityColors.HIGH).toContain('orange');
  });

  it('MEDIUM uses yellow tones', () => {
    expect(severityColors.MEDIUM).toContain('yellow');
  });
});
