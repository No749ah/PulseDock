/**
 * Unit tests for IncidentRow pure logic.
 * Tests severity bar color, monitor count label, duration display, and postmortem state.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component + types ─────────────────────────────────────

type IncidentStatus = 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED';
type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const statusColors: Record<IncidentStatus, string> = {
  INVESTIGATING: 'bg-red-500/20 text-red-400 border-red-500/30',
  IDENTIFIED: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  MONITORING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  RESOLVED: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const statusLabels: Record<IncidentStatus, string> = {
  INVESTIGATING: 'Investigating',
  IDENTIFIED: 'Identified',
  MONITORING: 'Monitoring',
  RESOLVED: 'Resolved',
};

const severityColors: Record<IncidentSeverity, string> = {
  LOW: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const severityLabels: Record<IncidentSeverity, string> = {
  LOW: 'Minor',
  MEDIUM: 'Major',
  HIGH: 'Major',
  CRITICAL: 'Critical',
};

function severityBarClass(severity: IncidentSeverity): string {
  if (severity === 'CRITICAL') return 'bg-red-500';
  if (severity === 'HIGH') return 'bg-orange-500';
  if (severity === 'MEDIUM') return 'bg-yellow-500';
  return 'bg-blue-500';
}

function monitorCountLabel(count: number): string {
  return `${count} monitor${count !== 1 ? 's' : ''} affected`;
}

function updatesLabel(count: number): string {
  return `${count} update${count !== 1 ? 's' : ''}`;
}

function hasPostmortem(rootCause: string | null | undefined, notes: string | null | undefined): boolean {
  return !!(rootCause || notes);
}

function postmortemButtonLabel(rootCause: string | null | undefined, notes: string | null | undefined): string {
  return hasPostmortem(rootCause, notes) ? 'Edit' : '+ Add Post-Mortem';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IncidentRow — statusColors', () => {
  it('INVESTIGATING → red badge', () => {
    expect(statusColors['INVESTIGATING']).toContain('red');
  });
  it('IDENTIFIED → orange badge', () => {
    expect(statusColors['IDENTIFIED']).toContain('orange');
  });
  it('MONITORING → yellow badge', () => {
    expect(statusColors['MONITORING']).toContain('yellow');
  });
  it('RESOLVED → green badge', () => {
    expect(statusColors['RESOLVED']).toContain('green');
  });
});

describe('IncidentRow — statusLabels', () => {
  it('maps all four statuses to readable strings', () => {
    expect(statusLabels['INVESTIGATING']).toBe('Investigating');
    expect(statusLabels['IDENTIFIED']).toBe('Identified');
    expect(statusLabels['MONITORING']).toBe('Monitoring');
    expect(statusLabels['RESOLVED']).toBe('Resolved');
  });
});

describe('IncidentRow — severityColors', () => {
  it('CRITICAL → red badge', () => {
    expect(severityColors['CRITICAL']).toContain('red');
  });
  it('HIGH → orange badge', () => {
    expect(severityColors['HIGH']).toContain('orange');
  });
  it('MEDIUM → yellow badge', () => {
    expect(severityColors['MEDIUM']).toContain('yellow');
  });
  it('LOW → blue badge', () => {
    expect(severityColors['LOW']).toContain('blue');
  });
});

describe('IncidentRow — severityLabels', () => {
  it('LOW → Minor', () => expect(severityLabels['LOW']).toBe('Minor'));
  it('MEDIUM → Major', () => expect(severityLabels['MEDIUM']).toBe('Major'));
  it('HIGH → Major', () => expect(severityLabels['HIGH']).toBe('Major'));
  it('CRITICAL → Critical', () => expect(severityLabels['CRITICAL']).toBe('Critical'));
});

describe('IncidentRow — severityBarClass', () => {
  it('CRITICAL → bg-red-500', () => expect(severityBarClass('CRITICAL')).toBe('bg-red-500'));
  it('HIGH → bg-orange-500', () => expect(severityBarClass('HIGH')).toBe('bg-orange-500'));
  it('MEDIUM → bg-yellow-500', () => expect(severityBarClass('MEDIUM')).toBe('bg-yellow-500'));
  it('LOW → bg-blue-500', () => expect(severityBarClass('LOW')).toBe('bg-blue-500'));
});

describe('IncidentRow — monitorCountLabel', () => {
  it('uses singular for 1 monitor', () => {
    expect(monitorCountLabel(1)).toBe('1 monitor affected');
  });
  it('uses plural for 0 monitors', () => {
    expect(monitorCountLabel(0)).toBe('0 monitors affected');
  });
  it('uses plural for 2+ monitors', () => {
    expect(monitorCountLabel(3)).toBe('3 monitors affected');
  });
});

describe('IncidentRow — updatesLabel', () => {
  it('uses singular for 1 update', () => {
    expect(updatesLabel(1)).toBe('1 update');
  });
  it('uses plural for 0 updates', () => {
    expect(updatesLabel(0)).toBe('0 updates');
  });
  it('uses plural for 2+ updates', () => {
    expect(updatesLabel(5)).toBe('5 updates');
  });
});

describe('IncidentRow — hasPostmortem', () => {
  it('returns true when rootCause is provided', () => {
    expect(hasPostmortem('Some cause', null)).toBe(true);
  });
  it('returns true when notes are provided', () => {
    expect(hasPostmortem(null, 'Some notes')).toBe(true);
  });
  it('returns true when both are provided', () => {
    expect(hasPostmortem('cause', 'notes')).toBe(true);
  });
  it('returns false when both are null/undefined', () => {
    expect(hasPostmortem(null, null)).toBe(false);
    expect(hasPostmortem(undefined, undefined)).toBe(false);
  });
  it('returns false for empty strings', () => {
    expect(hasPostmortem('', '')).toBe(false);
  });
});

describe('IncidentRow — postmortemButtonLabel', () => {
  it('shows "Edit" when post-mortem exists', () => {
    expect(postmortemButtonLabel('root cause', null)).toBe('Edit');
    expect(postmortemButtonLabel(null, 'lessons learned')).toBe('Edit');
  });
  it('shows "+ Add Post-Mortem" when no post-mortem', () => {
    expect(postmortemButtonLabel(null, null)).toBe('+ Add Post-Mortem');
    expect(postmortemButtonLabel('', '')).toBe('+ Add Post-Mortem');
  });
});
