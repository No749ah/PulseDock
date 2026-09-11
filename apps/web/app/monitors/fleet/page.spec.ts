/**
 * @vitest-environment node
 * Unit tests for pure helpers in monitors/fleet/page.tsx
 */

import { describe, it, expect } from 'vitest';

// ── Inline helpers from page.tsx ─────────────────────────────────────────────

function gradeCircleColor(grade: string): string {
  return grade === 'A' ? 'text-green-400 border-green-400' :
    grade === 'B' ? 'text-blue-400 border-blue-400' :
    grade === 'C' ? 'text-yellow-400 border-yellow-400' :
    grade === 'D' ? 'text-orange-400 border-orange-400' :
    'text-red-400 border-red-400';
}

function severityBadgeClass(severity: 'critical' | 'high' | 'medium'): string {
  return severity === 'critical' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
    severity === 'high' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
    'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
}

type Tier = { count: number; color: string; label: string; tier: string; monitors: unknown[] };

function computeTierTotal(tiers: Tier[]): number {
  return tiers.reduce((a, t) => a + t.count, 0);
}

function computeTierBarWidth(count: number, total: number): number {
  if (total === 0) return 0;
  return (count / total) * 100;
}

function tierColorClass(color: string): string {
  const colors: Record<string, string> = {
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
  };
  return colors[color] ?? '';
}

function tierTextColorClass(color: string): string {
  const colors: Record<string, string> = {
    green: 'text-green-400',
    blue: 'text-blue-400',
    yellow: 'text-yellow-400',
    orange: 'text-orange-400',
    red: 'text-red-400',
  };
  return colors[color] ?? '';
}

function computeSparklineHeight(count: number, max: number): number {
  return (count / max) * 40;
}

function computeSparklineMinHeight(count: number): number {
  return count > 0 ? 4 : 2;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('monitors/fleet/page — gradeCircleColor', () => {
  it('returns green for A', () => {
    expect(gradeCircleColor('A')).toBe('text-green-400 border-green-400');
  });

  it('returns blue for B', () => {
    expect(gradeCircleColor('B')).toBe('text-blue-400 border-blue-400');
  });

  it('returns yellow for C', () => {
    expect(gradeCircleColor('C')).toBe('text-yellow-400 border-yellow-400');
  });

  it('returns orange for D', () => {
    expect(gradeCircleColor('D')).toBe('text-orange-400 border-orange-400');
  });

  it('returns red for F', () => {
    expect(gradeCircleColor('F')).toBe('text-red-400 border-red-400');
  });

  it('returns red for any unknown grade (fallback)', () => {
    expect(gradeCircleColor('E')).toBe('text-red-400 border-red-400');
    expect(gradeCircleColor('X')).toBe('text-red-400 border-red-400');
  });
});

describe('monitors/fleet/page — severityBadgeClass', () => {
  it('returns red classes for critical', () => {
    expect(severityBadgeClass('critical')).toContain('red-400');
  });

  it('returns orange classes for high', () => {
    expect(severityBadgeClass('high')).toContain('orange-400');
  });

  it('returns yellow classes for medium', () => {
    expect(severityBadgeClass('medium')).toContain('yellow-400');
  });

  it('each severity has distinct classes', () => {
    const critical = severityBadgeClass('critical');
    const high = severityBadgeClass('high');
    const medium = severityBadgeClass('medium');
    expect(critical).not.toBe(high);
    expect(high).not.toBe(medium);
    expect(critical).not.toBe(medium);
  });
});

describe('monitors/fleet/page — computeTierTotal', () => {
  it('returns 0 for empty array', () => {
    expect(computeTierTotal([])).toBe(0);
  });

  it('sums counts across tiers', () => {
    const tiers: Tier[] = [
      { count: 10, color: 'green', label: 'Elite', tier: 'elite', monitors: [] },
      { count: 5, color: 'blue', label: 'Strong', tier: 'strong', monitors: [] },
      { count: 3, color: 'yellow', label: 'Fair', tier: 'fair', monitors: [] },
    ];
    expect(computeTierTotal(tiers)).toBe(18);
  });

  it('handles single tier', () => {
    expect(computeTierTotal([{ count: 42, color: 'green', label: 'X', tier: 'x', monitors: [] }])).toBe(42);
  });

  it('handles all-zero tiers', () => {
    const tiers: Tier[] = [
      { count: 0, color: 'red', label: 'None', tier: 'none', monitors: [] },
    ];
    expect(computeTierTotal(tiers)).toBe(0);
  });
});

describe('monitors/fleet/page — computeTierBarWidth', () => {
  it('returns 0 if total is 0', () => {
    expect(computeTierBarWidth(0, 0)).toBe(0);
    expect(computeTierBarWidth(5, 0)).toBe(0);
  });

  it('returns 100% for full tier', () => {
    expect(computeTierBarWidth(10, 10)).toBe(100);
  });

  it('returns 50% for half', () => {
    expect(computeTierBarWidth(5, 10)).toBe(50);
  });

  it('returns correct fractional percentage', () => {
    expect(computeTierBarWidth(1, 3)).toBeCloseTo(33.33, 1);
    expect(computeTierBarWidth(2, 3)).toBeCloseTo(66.67, 1);
  });

  it('returns 0 for count=0', () => {
    expect(computeTierBarWidth(0, 10)).toBe(0);
  });
});

describe('monitors/fleet/page — tierColorClass', () => {
  it('maps all 5 colors correctly', () => {
    expect(tierColorClass('green')).toBe('bg-green-500');
    expect(tierColorClass('blue')).toBe('bg-blue-500');
    expect(tierColorClass('yellow')).toBe('bg-yellow-500');
    expect(tierColorClass('orange')).toBe('bg-orange-500');
    expect(tierColorClass('red')).toBe('bg-red-500');
  });

  it('returns empty string for unknown color', () => {
    expect(tierColorClass('purple')).toBe('');
    expect(tierColorClass('')).toBe('');
  });
});

describe('monitors/fleet/page — tierTextColorClass', () => {
  it('maps all 5 colors to text classes', () => {
    expect(tierTextColorClass('green')).toBe('text-green-400');
    expect(tierTextColorClass('blue')).toBe('text-blue-400');
    expect(tierTextColorClass('yellow')).toBe('text-yellow-400');
    expect(tierTextColorClass('orange')).toBe('text-orange-400');
    expect(tierTextColorClass('red')).toBe('text-red-400');
  });

  it('parity: tierColorClass and tierTextColorClass use same color names', () => {
    for (const color of ['green', 'blue', 'yellow', 'orange', 'red']) {
      const bg = tierColorClass(color);
      const text = tierTextColorClass(color);
      expect(bg).toContain(color);
      expect(text).toContain(color);
    }
  });
});

describe('monitors/fleet/page — computeSparklineHeight', () => {
  it('returns 0 for 0 count', () => {
    expect(computeSparklineHeight(0, 10)).toBe(0);
  });

  it('returns 40 for max count', () => {
    expect(computeSparklineHeight(10, 10)).toBe(40);
  });

  it('returns proportional height', () => {
    expect(computeSparklineHeight(5, 10)).toBe(20);
    expect(computeSparklineHeight(1, 4)).toBe(10);
  });

  it('scales correctly relative to max=1 guard', () => {
    // max is Math.max(...counts, 1) so min max is 1
    expect(computeSparklineHeight(1, 1)).toBe(40);
  });
});

describe('monitors/fleet/page — computeSparklineMinHeight', () => {
  it('returns 4 for count > 0', () => {
    expect(computeSparklineMinHeight(1)).toBe(4);
    expect(computeSparklineMinHeight(100)).toBe(4);
  });

  it('returns 2 for count = 0', () => {
    expect(computeSparklineMinHeight(0)).toBe(2);
  });
});
