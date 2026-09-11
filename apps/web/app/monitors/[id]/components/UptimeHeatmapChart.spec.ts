/**
 * Tests for the UptimeHeatmapChart grid-building and cell-color logic.
 * We extract the pure logic inline here (mirroring the component implementation)
 * so we can test it without rendering the SVG in a browser environment.
 */
import { describe, it, expect } from 'vitest';

// ── Inline pure-logic extraction (mirrors UptimeHeatmapChart.tsx) ────────────

type Bucket = { ok: number; fail: number };

function buildGrid(runs: Array<{ ok: boolean; checkedAt: string }>, now: Date = new Date()): Bucket[][] {
  const DAYS = 7;
  const HOURS = 24;
  const grid: Bucket[][] = Array.from({ length: DAYS }, () =>
    Array.from({ length: HOURS }, () => ({ ok: 0, fail: 0 }))
  );

  for (const run of runs) {
    const runDate = new Date(run.checkedAt);
    const diffMs = now.getTime() - runDate.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays < 0 || diffDays >= DAYS) continue;
    const dayIdx = DAYS - 1 - diffDays;
    const hour = runDate.getUTCHours();
    if (run.ok) grid[dayIdx][hour].ok++;
    else grid[dayIdx][hour].fail++;
  }
  return grid;
}

function cellColor(b: Bucket): string {
  const total = b.ok + b.fail;
  if (total === 0) return '#1e2430';
  const failRate = b.fail / total;
  if (failRate === 0) return '#22c55e';
  if (failRate < 0.5) return '#f59e0b';
  return '#ef4444';
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('UptimeHeatmapChart — buildGrid', () => {
  const NOW = new Date('2026-03-26T12:00:00.000Z');

  it('returns a 7×24 grid of empty buckets for no runs', () => {
    const grid = buildGrid([], NOW);
    expect(grid).toHaveLength(7);
    for (const day of grid) {
      expect(day).toHaveLength(24);
      for (const bucket of day) {
        expect(bucket).toEqual({ ok: 0, fail: 0 });
      }
    }
  });

  it('places today\'s run in the last row (index 6)', () => {
    const run = { ok: true, checkedAt: '2026-03-26T10:00:00.000Z' }; // same day as NOW
    const grid = buildGrid([run], NOW);
    expect(grid[6][10]).toEqual({ ok: 1, fail: 0 });
  });

  it('places yesterday\'s run in row 5', () => {
    const run = { ok: false, checkedAt: '2026-03-25T08:00:00.000Z' }; // 1 day ago
    const grid = buildGrid([run], NOW);
    expect(grid[5][8]).toEqual({ ok: 0, fail: 1 });
  });

  it('places a run 6 days ago in row 0', () => {
    // NOW=12:00, so 2026-03-20T11:00 is exactly 6d1h before NOW → diffDays=6 → dayIdx=0
    const run = { ok: true, checkedAt: '2026-03-20T11:00:00.000Z' };
    const grid = buildGrid([run], NOW);
    expect(grid[0][11]).toEqual({ ok: 1, fail: 0 });
  });

  it('ignores runs older than 7 days', () => {
    const run = { ok: true, checkedAt: '2026-03-18T12:00:00.000Z' }; // 8 days ago
    const grid = buildGrid([run], NOW);
    let total = 0;
    for (const day of grid) for (const b of day) total += b.ok + b.fail;
    expect(total).toBe(0);
  });

  it('ignores runs with future timestamps', () => {
    const run = { ok: true, checkedAt: '2026-03-27T12:00:00.000Z' }; // tomorrow
    const grid = buildGrid([run], NOW);
    let total = 0;
    for (const day of grid) for (const b of day) total += b.ok + b.fail;
    expect(total).toBe(0);
  });

  it('accumulates multiple runs in the same bucket', () => {
    const runs = [
      { ok: true, checkedAt: '2026-03-26T10:00:00.000Z' },
      { ok: true, checkedAt: '2026-03-26T10:30:00.000Z' },
      { ok: false, checkedAt: '2026-03-26T10:45:00.000Z' },
    ];
    const grid = buildGrid(runs, NOW);
    expect(grid[6][10]).toEqual({ ok: 2, fail: 1 });
  });

  it('correctly assigns runs to different hours', () => {
    // NOW=2026-03-26T12:00Z. All runs must be <= NOW (past/same time).
    const runs = [
      { ok: true,  checkedAt: '2026-03-26T00:00:00.000Z' }, // today, hour 0
      { ok: true,  checkedAt: '2026-03-26T06:00:00.000Z' }, // today, hour 6
      { ok: true,  checkedAt: '2026-03-26T11:00:00.000Z' }, // today, hour 11
      { ok: false, checkedAt: '2026-03-25T08:00:00.000Z' }, // yesterday, hour 8
    ];
    const grid = buildGrid(runs, NOW);
    expect(grid[6][0]).toEqual({ ok: 1, fail: 0 });
    expect(grid[6][6]).toEqual({ ok: 1, fail: 0 });
    expect(grid[6][11]).toEqual({ ok: 1, fail: 0 });
    expect(grid[5][8]).toEqual({ ok: 0, fail: 1 });
  });

  it('uses UTC hours for bucket assignment', () => {
    // 2026-03-25T23:30:00.000Z → UTC hour 23, 1 day before NOW
    const run = { ok: true, checkedAt: '2026-03-25T23:30:00.000Z' };
    const grid = buildGrid([run], NOW);
    // diffDays = Math.floor((NOW - 2026-03-25T23:30) / 86400000) = Math.floor(0.52d) = 0 → dayIdx=6
    expect(grid[6][23]).toEqual({ ok: 1, fail: 0 });
  });

  it('handles runs at exactly the 7-day boundary (exactly 6 days before)', () => {
    // 2026-03-20T12:00:00.000Z is exactly 6 days before NOW → diffDays=6 → dayIdx=0, hour=12
    const run = { ok: true, checkedAt: '2026-03-20T12:00:00.000Z' };
    const grid = buildGrid([run], NOW);
    expect(grid[0][12]).toEqual({ ok: 1, fail: 0 });
  });

  it('spreads multiple failed runs across different days', () => {
    const runs = [
      { ok: false, checkedAt: '2026-03-26T05:00:00.000Z' }, // today → row 6
      { ok: false, checkedAt: '2026-03-24T05:00:00.000Z' }, // 2 days ago → row 4
      { ok: true,  checkedAt: '2026-03-23T05:00:00.000Z' }, // 3 days ago → row 3
    ];
    const grid = buildGrid(runs, NOW);
    expect(grid[6][5]).toEqual({ ok: 0, fail: 1 });
    expect(grid[4][5]).toEqual({ ok: 0, fail: 1 });
    expect(grid[3][5]).toEqual({ ok: 1, fail: 0 });
  });
});

describe('UptimeHeatmapChart — cellColor', () => {
  it('returns no-data color for empty bucket', () => {
    expect(cellColor({ ok: 0, fail: 0 })).toBe('#1e2430');
  });

  it('returns green for all-ok bucket', () => {
    expect(cellColor({ ok: 10, fail: 0 })).toBe('#22c55e');
  });

  it('returns green for single ok check', () => {
    expect(cellColor({ ok: 1, fail: 0 })).toBe('#22c55e');
  });

  it('returns yellow when fail rate < 50%', () => {
    // 1 fail out of 3 = 33%
    expect(cellColor({ ok: 2, fail: 1 })).toBe('#f59e0b');
  });

  it('returns yellow at 49% fail rate', () => {
    // 49 fails out of 100 = 49%
    expect(cellColor({ ok: 51, fail: 49 })).toBe('#f59e0b');
  });

  it('returns red at exactly 50% fail rate', () => {
    // 50% is not < 0.5
    expect(cellColor({ ok: 1, fail: 1 })).toBe('#ef4444');
  });

  it('returns red when fail rate > 50%', () => {
    expect(cellColor({ ok: 1, fail: 9 })).toBe('#ef4444');
  });

  it('returns red for all-fail bucket', () => {
    expect(cellColor({ ok: 0, fail: 5 })).toBe('#ef4444');
  });

  it('returns red for single fail check', () => {
    expect(cellColor({ ok: 0, fail: 1 })).toBe('#ef4444');
  });
});
