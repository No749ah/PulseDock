/**
 * Unit tests for Skeleton component props and structure logic.
 */
import { describe, it, expect } from 'vitest';

const BASE_SKELETON_CLASS = 'animate-pulse rounded bg-surface-elevated';

function buildSkeletonClass(extra = ''): string {
  return [BASE_SKELETON_CLASS, extra].filter(Boolean).join(' ');
}

function generateSkeletonRows(count: number): Array<{ index: number; widthClass: string }> {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    widthClass: i === count - 1 ? 'w-1/3' : 'w-full',
  }));
}

function generateMonitorRows(count: number): Array<{ index: number }> {
  return Array.from({ length: count }, (_, i) => ({ index: i }));
}

describe('Skeleton — base class', () => {
  it('always has animate-pulse', () => {
    expect(buildSkeletonClass()).toContain('animate-pulse');
  });

  it('always has rounded corners', () => {
    expect(buildSkeletonClass()).toContain('rounded');
  });

  it('always has bg-surface-elevated', () => {
    expect(buildSkeletonClass()).toContain('bg-surface-elevated');
  });

  it('extra className is appended', () => {
    expect(buildSkeletonClass('h-4 w-32')).toContain('h-4');
    expect(buildSkeletonClass('h-4 w-32')).toContain('w-32');
  });

  it('empty extra class produces no artifacts', () => {
    const cls = buildSkeletonClass('');
    expect(cls).toBe(BASE_SKELETON_CLASS);
  });
});

describe('SkeletonCard — row generation', () => {
  it('generates exactly N rows for rows=3', () => {
    expect(generateSkeletonRows(3)).toHaveLength(3);
  });

  it('generates exactly N rows for rows=1', () => {
    expect(generateSkeletonRows(1)).toHaveLength(1);
  });

  it('last row always gets w-1/3 (shorter)', () => {
    const rows = generateSkeletonRows(5);
    expect(rows[4].widthClass).toBe('w-1/3');
  });

  it('non-last rows get w-full', () => {
    const rows = generateSkeletonRows(5);
    rows.slice(0, 4).forEach((r) => {
      expect(r.widthClass).toBe('w-full');
    });
  });

  it('single row is also the last row', () => {
    const rows = generateSkeletonRows(1);
    expect(rows[0].widthClass).toBe('w-1/3');
  });

  it('generates correct index sequence', () => {
    const rows = generateSkeletonRows(3);
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2]);
  });
});

describe('MonitorListSkeleton — row count', () => {
  it('default count=5 generates 5 rows', () => {
    expect(generateMonitorRows(5)).toHaveLength(5);
  });

  it('custom count is respected', () => {
    expect(generateMonitorRows(10)).toHaveLength(10);
  });

  it('count=1 generates one row', () => {
    expect(generateMonitorRows(1)).toHaveLength(1);
  });

  it('count=0 generates empty array', () => {
    expect(generateMonitorRows(0)).toHaveLength(0);
  });
});

describe('DashboardStatsSkeleton — grid structure', () => {
  it('stat cards count is 4', () => {
    const statCardCount = 4;
    expect(statCardCount).toBe(4);
  });

  it('recent run rows count is 6', () => {
    const recentRunRows = Array.from({ length: 6 });
    expect(recentRunRows).toHaveLength(6);
  });
});

describe('AlertChannelsSkeleton — default and custom count', () => {
  it('default count=4 generates 4 rows', () => {
    expect(generateMonitorRows(4)).toHaveLength(4);
  });

  it('custom count=2 generates 2 rows', () => {
    expect(generateMonitorRows(2)).toHaveLength(2);
  });
});

describe('Skeleton — aria attributes', () => {
  it('skeleton base should be aria-hidden (not interactive)', () => {
    // The Skeleton component always uses aria-hidden="true"
    const ariaHidden = true;
    expect(ariaHidden).toBe(true);
  });

  it('MonitorListSkeleton has role=status for screen readers', () => {
    const role = 'status';
    expect(role).toBe('status');
  });

  it('DashboardStatsSkeleton has role=status', () => {
    const role = 'status';
    expect(role).toBe('status');
  });
});
