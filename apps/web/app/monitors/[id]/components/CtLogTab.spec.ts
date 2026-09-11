/**
 * Unit tests for CtLogTab pure logic.
 *
 * Tests: levelColor, levelBg, levelLabel helpers, run slicing, empty state.
 */
import { describe, it, expect } from 'vitest';

// ── Pure helpers mirrored from CtLogTab ───────────────────────────────────────

function levelColor(level: string): string {
  if (level === 'green') return 'text-success';
  if (level === 'yellow') return 'text-warning';
  return 'text-error';
}

function levelBg(level: string): string {
  if (level === 'green') return 'bg-success/10 border-success/20';
  if (level === 'yellow') return 'bg-warning/10 border-warning/20';
  return 'bg-error/10 border-error/20';
}

function levelLabel(level: string): string {
  if (level === 'green') return 'No new certs';
  if (level === 'yellow') return 'New certs found';
  return 'Check failed';
}

/** Component slices last 20 runs */
function sliceRuns<T>(runs: T[]): T[] {
  return runs.slice(0, 20);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CtLogTab — levelColor', () => {
  it('green → text-success', () => {
    expect(levelColor('green')).toBe('text-success');
  });

  it('yellow → text-warning', () => {
    expect(levelColor('yellow')).toBe('text-warning');
  });

  it('red → text-error', () => {
    expect(levelColor('red')).toBe('text-error');
  });

  it('unknown → text-error (default)', () => {
    expect(levelColor('unknown')).toBe('text-error');
    expect(levelColor('')).toBe('text-error');
  });
});

describe('CtLogTab — levelBg', () => {
  it('green → success background', () => {
    expect(levelBg('green')).toContain('bg-success');
    expect(levelBg('green')).toContain('border-success');
  });

  it('yellow → warning background', () => {
    expect(levelBg('yellow')).toContain('bg-warning');
    expect(levelBg('yellow')).toContain('border-warning');
  });

  it('red → error background', () => {
    expect(levelBg('red')).toContain('bg-error');
    expect(levelBg('red')).toContain('border-error');
  });

  it('all levels return non-empty strings', () => {
    for (const level of ['green', 'yellow', 'red', 'unknown']) {
      expect(levelBg(level).length).toBeGreaterThan(0);
    }
  });
});

describe('CtLogTab — levelLabel', () => {
  it('green → No new certs', () => {
    expect(levelLabel('green')).toBe('No new certs');
  });

  it('yellow → New certs found', () => {
    expect(levelLabel('yellow')).toBe('New certs found');
  });

  it('red → Check failed', () => {
    expect(levelLabel('red')).toBe('Check failed');
  });

  it('unknown → Check failed (default)', () => {
    expect(levelLabel('unknown')).toBe('Check failed');
    expect(levelLabel('')).toBe('Check failed');
  });
});

describe('CtLogTab — run slicing', () => {
  it('slices to at most 20 runs', () => {
    const runs = Array.from({ length: 50 }, (_, i) => ({ id: `r-${i}` }));
    expect(sliceRuns(runs)).toHaveLength(20);
  });

  it('returns all runs when less than 20', () => {
    const runs = Array.from({ length: 10 }, (_, i) => ({ id: `r-${i}` }));
    expect(sliceRuns(runs)).toHaveLength(10);
  });

  it('returns empty array for no runs', () => {
    expect(sliceRuns([])).toHaveLength(0);
  });

  it('returns first 20 (most recent)', () => {
    const runs = Array.from({ length: 25 }, (_, i) => ({ id: `r-${i}` }));
    const sliced = sliceRuns(runs);
    expect(sliced[0]).toEqual({ id: 'r-0' });
    expect(sliced[19]).toEqual({ id: 'r-19' });
  });
});

describe('CtLogTab — CT log level semantics', () => {
  it('green means no new certs (nominal state)', () => {
    expect(levelLabel('green')).not.toContain('found');
    expect(levelLabel('green')).not.toContain('failed');
  });

  it('yellow means new certs were found (informational alert)', () => {
    expect(levelLabel('yellow')).toContain('found');
  });

  it('red means the check itself failed', () => {
    expect(levelLabel('red')).toContain('failed');
  });

  it('all three levels produce different labels', () => {
    const labels = [levelLabel('green'), levelLabel('yellow'), levelLabel('red')];
    expect(new Set(labels).size).toBe(3);
  });

  it('all three levels produce different colors', () => {
    const colors = [levelColor('green'), levelColor('yellow'), levelColor('red')];
    expect(new Set(colors).size).toBe(3);
  });

  it('all three levels produce different backgrounds', () => {
    const bgs = [levelBg('green'), levelBg('yellow'), levelBg('red')];
    expect(new Set(bgs).size).toBe(3);
  });
});
