import { describe, it, expect } from 'vitest';

// Pure logic mirroring LinkedIncidentsCard component

function shouldRender(incidents: unknown[] | null): boolean {
  if (!incidents || incidents.length === 0) return false;
  return true;
}

function formatDuration(sec: number | null): string | null {
  if (sec === null) return null;
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  const hours = sec / 3600;
  return `${hours.toFixed(1)}h`;
}

function getSeverityClass(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return 'text-danger font-bold';
    case 'HIGH':
      return 'text-orange-400';
    case 'MEDIUM':
      return 'text-warning';
    case 'LOW':
    default:
      return 'text-surface-400';
  }
}

function getStatusDot(status: string): string {
  if (status === 'RESOLVED') return 'bg-success';
  return 'bg-danger';
}

function sliceIncidents<T>(arr: T[], max: number): { visible: T[]; moreCount: number } {
  return {
    visible: arr.slice(0, max),
    moreCount: Math.max(0, arr.length - max),
  };
}

describe('LinkedIncidentsCard — pure logic', () => {
  describe('shouldRender', () => {
    it('returns false for null', () => {
      expect(shouldRender(null)).toBe(false);
    });
    it('returns false for empty array', () => {
      expect(shouldRender([])).toBe(false);
    });
    it('returns true for array with items', () => {
      expect(shouldRender([{ id: 1 }])).toBe(true);
    });
    it('returns true for array with multiple items', () => {
      expect(shouldRender([1, 2, 3])).toBe(true);
    });
  });

  describe('formatDuration', () => {
    it('returns null for null input', () => {
      expect(formatDuration(null)).toBeNull();
    });
    it('returns "Ns" for seconds < 60', () => {
      expect(formatDuration(45)).toBe('45s');
    });
    it('returns "0s" for zero seconds', () => {
      expect(formatDuration(0)).toBe('0s');
    });
    it('returns "Nm" for seconds < 3600', () => {
      expect(formatDuration(120)).toBe('2m');
    });
    it('returns "Nm" for 59 min 59 sec', () => {
      expect(formatDuration(3599)).toBe('59m');
    });
    it('returns "N.Xh" for >= 3600 seconds', () => {
      expect(formatDuration(3600)).toBe('1.0h');
    });
    it('returns correct hours for 2h', () => {
      expect(formatDuration(7200)).toBe('2.0h');
    });
    it('returns fractional hours for 90 min', () => {
      expect(formatDuration(5400)).toBe('1.5h');
    });
  });

  describe('getSeverityClass', () => {
    it('CRITICAL contains "danger"', () => {
      expect(getSeverityClass('CRITICAL')).toContain('danger');
    });
    it('HIGH contains "orange"', () => {
      expect(getSeverityClass('HIGH')).toContain('orange');
    });
    it('MEDIUM contains "warning"', () => {
      expect(getSeverityClass('MEDIUM')).toContain('warning');
    });
    it('LOW contains "surface"', () => {
      expect(getSeverityClass('LOW')).toContain('surface');
    });
    it('unknown severity falls back to surface', () => {
      expect(getSeverityClass('UNKNOWN')).toContain('surface');
    });
  });

  describe('getStatusDot', () => {
    it('RESOLVED contains "success"', () => {
      expect(getStatusDot('RESOLVED')).toContain('success');
    });
    it('OPEN contains "danger"', () => {
      expect(getStatusDot('OPEN')).toContain('danger');
    });
    it('any non-RESOLVED status contains "danger"', () => {
      expect(getStatusDot('ONGOING')).toContain('danger');
      expect(getStatusDot('TRIGGERED')).toContain('danger');
    });
  });

  describe('sliceIncidents', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7];

    it('returns max=5 visible items', () => {
      const { visible } = sliceIncidents(arr, 5);
      expect(visible.length).toBe(5);
    });
    it('returns correct moreCount', () => {
      const { moreCount } = sliceIncidents(arr, 5);
      expect(moreCount).toBe(2);
    });
    it('returns all items when array shorter than max', () => {
      const { visible, moreCount } = sliceIncidents([1, 2], 5);
      expect(visible.length).toBe(2);
      expect(moreCount).toBe(0);
    });
    it('returns empty visible for empty array', () => {
      const { visible, moreCount } = sliceIncidents([], 5);
      expect(visible).toEqual([]);
      expect(moreCount).toBe(0);
    });
    it('first item is first element of original array', () => {
      const { visible } = sliceIncidents([10, 20, 30], 2);
      expect(visible[0]).toBe(10);
    });
    it('moreCount is 0 when array exactly equals max', () => {
      const { moreCount } = sliceIncidents([1, 2, 3, 4, 5], 5);
      expect(moreCount).toBe(0);
    });
  });
});
