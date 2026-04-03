/**
 * @vitest-environment node
 * Unit tests for pure helpers in monitors/correlation/page.tsx
 */

import { describe, it, expect } from 'vitest';

// ── Inline helpers from page.tsx ─────────────────────────────────────────────

function similarityColor(sim: number): string {
  if (sim >= 0.7) return 'bg-red-500/20 text-red-400 border-red-500/30';
  if (sim >= 0.4) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  if (sim >= 0.2) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
}

function similarityLabel(sim: number): string {
  if (sim >= 0.7) return 'High';
  if (sim >= 0.4) return 'Medium';
  if (sim >= 0.2) return 'Low';
  return 'Weak';
}

function similarityBarColor(value: number): string {
  return value >= 0.7 ? 'bg-red-500' :
    value >= 0.4 ? 'bg-amber-500' :
    value >= 0.2 ? 'bg-yellow-500' :
    'bg-blue-500';
}

function similarityBarPct(value: number): number {
  return Math.round(value * 100);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('monitors/correlation/page — similarityColor', () => {
  it('returns red classes at 0.7 (high threshold)', () => {
    expect(similarityColor(0.7)).toContain('red-400');
  });

  it('returns red classes above 0.7', () => {
    expect(similarityColor(0.8)).toContain('red-400');
    expect(similarityColor(1.0)).toContain('red-400');
  });

  it('returns amber classes at 0.4', () => {
    expect(similarityColor(0.4)).toContain('amber-400');
  });

  it('returns amber classes between 0.4 and 0.69', () => {
    expect(similarityColor(0.5)).toContain('amber-400');
    expect(similarityColor(0.69)).toContain('amber-400');
  });

  it('returns yellow classes at 0.2', () => {
    expect(similarityColor(0.2)).toContain('yellow-400');
  });

  it('returns yellow classes between 0.2 and 0.39', () => {
    expect(similarityColor(0.3)).toContain('yellow-400');
    expect(similarityColor(0.39)).toContain('yellow-400');
  });

  it('returns blue classes for values < 0.2', () => {
    expect(similarityColor(0.19)).toContain('blue-400');
    expect(similarityColor(0.0)).toContain('blue-400');
  });

  it('all 4 bands return distinct class strings', () => {
    const a = similarityColor(0.8);  // red
    const b = similarityColor(0.5);  // amber
    const c = similarityColor(0.3);  // yellow
    const d = similarityColor(0.1);  // blue
    expect(new Set([a, b, c, d]).size).toBe(4);
  });
});

describe('monitors/correlation/page — similarityLabel', () => {
  it('returns High at 0.7', () => {
    expect(similarityLabel(0.7)).toBe('High');
  });

  it('returns High above 0.7', () => {
    expect(similarityLabel(1.0)).toBe('High');
    expect(similarityLabel(0.9)).toBe('High');
  });

  it('returns Medium at 0.4', () => {
    expect(similarityLabel(0.4)).toBe('Medium');
  });

  it('returns Medium between 0.4 and 0.69', () => {
    expect(similarityLabel(0.55)).toBe('Medium');
    expect(similarityLabel(0.69)).toBe('Medium');
  });

  it('returns Low at 0.2', () => {
    expect(similarityLabel(0.2)).toBe('Low');
  });

  it('returns Low between 0.2 and 0.39', () => {
    expect(similarityLabel(0.25)).toBe('Low');
    expect(similarityLabel(0.39)).toBe('Low');
  });

  it('returns Weak below 0.2', () => {
    expect(similarityLabel(0.19)).toBe('Weak');
    expect(similarityLabel(0.0)).toBe('Weak');
  });
});

describe('monitors/correlation/page — similarityBarColor', () => {
  it('returns red at 0.7', () => {
    expect(similarityBarColor(0.7)).toBe('bg-red-500');
  });

  it('returns amber at 0.4', () => {
    expect(similarityBarColor(0.4)).toBe('bg-amber-500');
  });

  it('returns yellow at 0.2', () => {
    expect(similarityBarColor(0.2)).toBe('bg-yellow-500');
  });

  it('returns blue below 0.2', () => {
    expect(similarityBarColor(0.1)).toBe('bg-blue-500');
    expect(similarityBarColor(0.0)).toBe('bg-blue-500');
  });

  it('similarityColor and similarityBarColor use the same color at each band', () => {
    // Verify that the badge color and bar color share the same semantic color name
    const bands = [
      { sim: 0.8, color: 'red' },
      { sim: 0.5, color: 'amber' },
      { sim: 0.3, color: 'yellow' },
      { sim: 0.1, color: 'blue' },
    ];
    for (const { sim, color } of bands) {
      expect(similarityColor(sim)).toContain(color);
      expect(similarityBarColor(sim)).toContain(color);
    }
  });
});

describe('monitors/correlation/page — similarityBarPct', () => {
  it('converts 0.0 to 0%', () => {
    expect(similarityBarPct(0.0)).toBe(0);
  });

  it('converts 1.0 to 100%', () => {
    expect(similarityBarPct(1.0)).toBe(100);
  });

  it('converts 0.5 to 50%', () => {
    expect(similarityBarPct(0.5)).toBe(50);
  });

  it('rounds fractional percentages', () => {
    expect(similarityBarPct(0.333)).toBe(33);
    expect(similarityBarPct(0.666)).toBe(67);
  });

  it('converts 0.7 to 70%', () => {
    expect(similarityBarPct(0.7)).toBe(70);
  });

  it('converts 0.4 to 40%', () => {
    expect(similarityBarPct(0.4)).toBe(40);
  });
});
