import { describe, it, expect } from 'vitest';

// ─── Extracted pure helpers from monitors/heatmap/page.tsx ──────────────────

type HeatmapCell = {
  date: string;
  total: number;
  failed: number;
  uptimePct: number | null;
  avgLatencyMs: number | null;
};

type HeatmapMonitor = {
  id: string;
  name: string;
  type: string;
  days: HeatmapCell[];
};

function cellColor(cell: HeatmapCell): string {
  if (cell.total === 0 || cell.uptimePct === null) return 'bg-border/40';
  if (cell.uptimePct >= 99.9) return 'bg-green-500/90';
  if (cell.uptimePct >= 99) return 'bg-green-400/80';
  if (cell.uptimePct >= 95) return 'bg-yellow-400/80';
  if (cell.uptimePct >= 80) return 'bg-orange-400/80';
  return 'bg-red-500/90';
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function overallUptime(monitor: HeatmapMonitor): number | null {
  const withData = monitor.days.filter(d => d.total > 0);
  if (withData.length === 0) return null;
  const totalChecks = withData.reduce((s, d) => s + d.total, 0);
  const failedChecks = withData.reduce((s, d) => s + d.failed, 0);
  return Math.round(((totalChecks - failedChecks) / totalChecks) * 10000) / 100;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('monitors/heatmap/page — cellColor', () => {
  const makeCell = (total: number, uptimePct: number | null): HeatmapCell => ({
    date: '2026-04-01', total, failed: 0, uptimePct, avgLatencyMs: null,
  });

  it('returns bg-border/40 when total === 0', () => {
    expect(cellColor(makeCell(0, 100))).toBe('bg-border/40');
  });

  it('returns bg-border/40 when uptimePct is null', () => {
    expect(cellColor(makeCell(10, null))).toBe('bg-border/40');
  });

  it('returns bg-green-500/90 at exactly 99.9', () => {
    expect(cellColor(makeCell(10, 99.9))).toBe('bg-green-500/90');
  });

  it('returns bg-green-500/90 at 100', () => {
    expect(cellColor(makeCell(10, 100))).toBe('bg-green-500/90');
  });

  it('returns bg-green-400/80 at exactly 99', () => {
    expect(cellColor(makeCell(10, 99))).toBe('bg-green-400/80');
  });

  it('returns bg-green-400/80 at 99.8', () => {
    expect(cellColor(makeCell(10, 99.8))).toBe('bg-green-400/80');
  });

  it('returns bg-yellow-400/80 at exactly 95', () => {
    expect(cellColor(makeCell(10, 95))).toBe('bg-yellow-400/80');
  });

  it('returns bg-yellow-400/80 at 98', () => {
    expect(cellColor(makeCell(10, 98))).toBe('bg-yellow-400/80');
  });

  it('returns bg-orange-400/80 at exactly 80', () => {
    expect(cellColor(makeCell(10, 80))).toBe('bg-orange-400/80');
  });

  it('returns bg-orange-400/80 at 94', () => {
    expect(cellColor(makeCell(10, 94))).toBe('bg-orange-400/80');
  });

  it('returns bg-red-500/90 below 80 (79)', () => {
    expect(cellColor(makeCell(10, 79))).toBe('bg-red-500/90');
  });

  it('returns bg-red-500/90 at 0', () => {
    expect(cellColor(makeCell(10, 0))).toBe('bg-red-500/90');
  });
});

describe('monitors/heatmap/page — formatDate', () => {
  it('formats 2026-01-01 as Jan 1', () => {
    expect(formatDate('2026-01-01')).toBe('Jan 1');
  });

  it('formats 2026-04-03 as Apr 3', () => {
    expect(formatDate('2026-04-03')).toBe('Apr 3');
  });

  it('formats 2026-12-25 as Dec 25', () => {
    expect(formatDate('2026-12-25')).toBe('Dec 25');
  });

  it('formats 2026-03-10 as Mar 10', () => {
    expect(formatDate('2026-03-10')).toBe('Mar 10');
  });
});

describe('monitors/heatmap/page — formatShortDate', () => {
  it('formats same as formatDate for Jan 1', () => {
    expect(formatShortDate('2026-01-01')).toBe('Jan 1');
  });

  it('formats 2026-07-04 as Jul 4', () => {
    expect(formatShortDate('2026-07-04')).toBe('Jul 4');
  });
});

describe('monitors/heatmap/page — overallUptime', () => {
  const makeMonitor = (days: Array<{ total: number; failed: number }>): HeatmapMonitor => ({
    id: 'test', name: 'Test', type: 'HTTP',
    days: days.map((d, i) => ({
      date: `2026-04-0${i + 1}`,
      total: d.total,
      failed: d.failed,
      uptimePct: d.total > 0 ? ((d.total - d.failed) / d.total) * 100 : null,
      avgLatencyMs: null,
    })),
  });

  it('returns null when all days have total 0', () => {
    const monitor = makeMonitor([{ total: 0, failed: 0 }, { total: 0, failed: 0 }]);
    expect(overallUptime(monitor)).toBeNull();
  });

  it('returns 100 for perfect uptime', () => {
    const monitor = makeMonitor([{ total: 100, failed: 0 }, { total: 100, failed: 0 }]);
    expect(overallUptime(monitor)).toBe(100);
  });

  it('returns 50 for 50% uptime', () => {
    const monitor = makeMonitor([{ total: 100, failed: 50 }]);
    expect(overallUptime(monitor)).toBe(50);
  });

  it('ignores days with total 0 when computing uptime', () => {
    // 100 total, 0 failed for one day, 0 total for other day
    const monitor = makeMonitor([{ total: 100, failed: 0 }, { total: 0, failed: 0 }]);
    expect(overallUptime(monitor)).toBe(100);
  });

  it('computes correctly across multiple days', () => {
    // 200 total, 10 failed = 95.00%
    const monitor = makeMonitor([
      { total: 100, failed: 5 },
      { total: 100, failed: 5 },
    ]);
    expect(overallUptime(monitor)).toBe(95);
  });

  it('rounds to 2 decimal places', () => {
    // 300 total, 1 failed → 299/300 = 0.99666... = 99.67%
    const monitor = makeMonitor([{ total: 300, failed: 1 }]);
    expect(overallUptime(monitor)).toBe(99.67);
  });

  it('returns null for empty days array', () => {
    const monitor: HeatmapMonitor = { id: 'x', name: 'x', type: 'HTTP', days: [] };
    expect(overallUptime(monitor)).toBeNull();
  });
});
