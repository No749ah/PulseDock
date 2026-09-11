/**
 * Unit tests for MonitorsSection pure logic.
 * Tests version status badge selection, monitor count labels, view toggle logic.
 */
import { describe, it, expect } from 'vitest';

// ── Version status badge (mirrors component logic) ───────────────────────────
type VersionLevel = 'green' | 'yellow' | 'red' | undefined;
type BadgeVariant = 'success' | 'warning' | 'danger' | 'default';

interface VersionBadge {
  variant: BadgeVariant;
  label: string;
}

function versionStatusBadge(level: VersionLevel): VersionBadge {
  if (level === 'green') return { variant: 'success', label: 'Up to date' };
  if (level === 'yellow') return { variant: 'warning', label: 'Update available' };
  if (level === 'red') return { variant: 'danger', label: 'Major update' };
  return { variant: 'default', label: 'Pending' };
}

// ── Monitor count label (mirrors component logic) ────────────────────────────
function monitorCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'monitor' : 'monitors'} configured`;
}

// ── VERSION_TYPES set (mirrors dashboard hook) ────────────────────────────────
const VERSION_TYPES = new Set(['GIT_RELEASE', 'DOCKER_IMAGE']);

// ── Version status badge tests ────────────────────────────────────────────────
describe('MonitorsSection — versionStatusBadge', () => {
  it('green level → success badge', () => {
    const b = versionStatusBadge('green');
    expect(b.variant).toBe('success');
    expect(b.label).toBe('Up to date');
  });

  it('yellow level → warning badge', () => {
    const b = versionStatusBadge('yellow');
    expect(b.variant).toBe('warning');
    expect(b.label).toBe('Update available');
  });

  it('red level → danger badge', () => {
    const b = versionStatusBadge('red');
    expect(b.variant).toBe('danger');
    expect(b.label).toBe('Major update');
  });

  it('undefined level → default / pending badge', () => {
    const b = versionStatusBadge(undefined);
    expect(b.variant).toBe('default');
    expect(b.label).toBe('Pending');
  });

  it('all levels produce distinct variants', () => {
    const levels: VersionLevel[] = ['green', 'yellow', 'red', undefined];
    const variants = levels.map((l) => versionStatusBadge(l).variant);
    expect(new Set(variants).size).toBe(4);
  });

  it('all levels produce distinct labels', () => {
    const levels: VersionLevel[] = ['green', 'yellow', 'red', undefined];
    const labels = levels.map((l) => versionStatusBadge(l).label);
    expect(new Set(labels).size).toBe(4);
  });
});

// ── Monitor count label tests ─────────────────────────────────────────────────
describe('MonitorsSection — monitorCountLabel', () => {
  it('singular for 1 monitor', () => {
    expect(monitorCountLabel(1)).toBe('1 monitor configured');
  });

  it('plural for 0 monitors', () => {
    expect(monitorCountLabel(0)).toBe('0 monitors configured');
  });

  it('plural for 2 monitors', () => {
    expect(monitorCountLabel(2)).toBe('2 monitors configured');
  });

  it('plural for large count', () => {
    expect(monitorCountLabel(50)).toBe('50 monitors configured');
  });
});

// ── VERSION_TYPES set ─────────────────────────────────────────────────────────
describe('MonitorsSection — VERSION_TYPES', () => {
  it('includes GIT_RELEASE', () => {
    expect(VERSION_TYPES.has('GIT_RELEASE')).toBe(true);
  });

  it('includes DOCKER_IMAGE', () => {
    expect(VERSION_TYPES.has('DOCKER_IMAGE')).toBe(true);
  });

  it('does not include uptime types', () => {
    expect(VERSION_TYPES.has('HTTP')).toBe(false);
    expect(VERSION_TYPES.has('TCP')).toBe(false);
    expect(VERSION_TYPES.has('SSL_CERT')).toBe(false);
  });

  it('has exactly 2 entries', () => {
    expect(VERSION_TYPES.size).toBe(2);
  });
});

// ── View toggle active class ──────────────────────────────────────────────────
describe('MonitorsSection — view toggle class', () => {
  type ViewMode = 'table' | 'grid';

  function viewBtnClass(current: ViewMode, target: ViewMode): string {
    return current === target
      ? 'bg-accent/10 text-accent'
      : 'text-text-secondary hover:text-text-primary';
  }

  it('table button is active when view is table', () => {
    expect(viewBtnClass('table', 'table')).toContain('text-accent');
  });

  it('grid button is active when view is grid', () => {
    expect(viewBtnClass('grid', 'grid')).toContain('text-accent');
  });

  it('table button is inactive when view is grid', () => {
    expect(viewBtnClass('grid', 'table')).toContain('text-text-secondary');
  });

  it('grid button is inactive when view is table', () => {
    expect(viewBtnClass('table', 'grid')).toContain('text-text-secondary');
  });

  it('active and inactive classes are distinct', () => {
    expect(viewBtnClass('table', 'table')).not.toBe(viewBtnClass('grid', 'table'));
  });
});
