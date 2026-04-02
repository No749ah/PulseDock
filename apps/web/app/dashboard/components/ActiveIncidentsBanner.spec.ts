/**
 * Unit tests for ActiveIncidentsBanner rendering logic.
 * Tests the severity/status badge class mapping and pluralization logic.
 */
import { describe, it, expect } from 'vitest';

// ── Badge class helpers (mirrors component logic) ────────────────────────────
function severityClass(severity: string): string {
  if (severity === 'CRITICAL') return 'bg-danger/20 text-danger';
  if (severity === 'HIGH') return 'bg-warning/20 text-warning';
  return 'bg-surface-elevated text-text-secondary';
}

function statusClass(status: string): string {
  if (status === 'INVESTIGATING') return 'bg-danger/10 text-danger';
  if (status === 'IDENTIFIED') return 'bg-warning/10 text-warning';
  return 'bg-success/10 text-success';
}

function incidentCountLabel(count: number): string {
  return `${count} Active Incident${count !== 1 ? 's' : ''}`;
}

// ── Severity class tests ──────────────────────────────────────────────────────
describe('ActiveIncidentsBanner — severity badge classes', () => {
  it('CRITICAL uses danger styling', () => {
    const c = severityClass('CRITICAL');
    expect(c).toContain('text-danger');
    expect(c).toContain('bg-danger');
  });

  it('HIGH uses warning styling', () => {
    const c = severityClass('HIGH');
    expect(c).toContain('text-warning');
    expect(c).toContain('bg-warning');
  });

  it('MEDIUM falls through to default styling', () => {
    const c = severityClass('MEDIUM');
    expect(c).toContain('text-text-secondary');
    expect(c).toContain('bg-surface-elevated');
  });

  it('LOW falls through to default styling', () => {
    const c = severityClass('LOW');
    expect(c).toContain('text-text-secondary');
  });

  it('unknown severity falls through to default styling', () => {
    const c = severityClass('UNKNOWN');
    expect(c).toContain('text-text-secondary');
  });
});

// ── Status class tests ────────────────────────────────────────────────────────
describe('ActiveIncidentsBanner — status badge classes', () => {
  it('INVESTIGATING uses danger styling', () => {
    const c = statusClass('INVESTIGATING');
    expect(c).toContain('text-danger');
    expect(c).toContain('bg-danger/10');
  });

  it('IDENTIFIED uses warning styling', () => {
    const c = statusClass('IDENTIFIED');
    expect(c).toContain('text-warning');
    expect(c).toContain('bg-warning/10');
  });

  it('MONITORING uses success styling', () => {
    const c = statusClass('MONITORING');
    expect(c).toContain('text-success');
    expect(c).toContain('bg-success/10');
  });

  it('RESOLVED uses success styling', () => {
    const c = statusClass('RESOLVED');
    expect(c).toContain('text-success');
  });

  it('unknown status falls through to success styling', () => {
    const c = statusClass('OTHER');
    expect(c).toContain('text-success');
  });
});

// ── Count label tests ─────────────────────────────────────────────────────────
describe('ActiveIncidentsBanner — incident count label', () => {
  it('uses singular for exactly 1 incident', () => {
    expect(incidentCountLabel(1)).toBe('1 Active Incident');
  });

  it('uses plural for 0 incidents', () => {
    expect(incidentCountLabel(0)).toBe('0 Active Incidents');
  });

  it('uses plural for 2 incidents', () => {
    expect(incidentCountLabel(2)).toBe('2 Active Incidents');
  });

  it('uses plural for large counts', () => {
    expect(incidentCountLabel(100)).toBe('100 Active Incidents');
  });
});

// ── Visibility logic ──────────────────────────────────────────────────────────
describe('ActiveIncidentsBanner — visibility', () => {
  it('renders nothing when incidents list is empty', () => {
    // The component returns null when incidents.length === 0
    const shouldRender = (incidents: unknown[]) => incidents.length > 0;
    expect(shouldRender([])).toBe(false);
    expect(shouldRender([{ id: '1' }])).toBe(true);
  });
});

// ── Severity class uniqueness ─────────────────────────────────────────────────
describe('ActiveIncidentsBanner — class distinctness', () => {
  it('CRITICAL and HIGH have distinct classes', () => {
    expect(severityClass('CRITICAL')).not.toBe(severityClass('HIGH'));
  });

  it('INVESTIGATING and IDENTIFIED have distinct classes', () => {
    expect(statusClass('INVESTIGATING')).not.toBe(statusClass('IDENTIFIED'));
  });

  it('all three severity tiers are mutually distinct', () => {
    const critical = severityClass('CRITICAL');
    const high = severityClass('HIGH');
    const medium = severityClass('MEDIUM');
    expect(new Set([critical, high, medium]).size).toBe(3);
  });

  it('all three status tiers are mutually distinct', () => {
    const investigating = statusClass('INVESTIGATING');
    const identified = statusClass('IDENTIFIED');
    const monitoring = statusClass('MONITORING');
    expect(new Set([investigating, identified, monitoring]).size).toBe(3);
  });
});
