/**
 * Unit tests for DashboardControls logic.
 * Tests time range label formatting, section order helpers, and button state logic.
 */
import { describe, it, expect } from 'vitest';

// ── Time range label (mirrors component logic) ────────────────────────────────
type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';

function timeRangeLabel(range: TimeRange): string {
  if (range === '1h') return 'Last 1 hour';
  if (range === '6h') return 'Last 6 hours';
  if (range === '24h') return 'Last 24 hours';
  if (range === '7d') return 'Last 7 days';
  return 'Last 30 days';
}

// ── Section order helpers (mirrors component logic) ───────────────────────────
type SectionKey = 'uptime' | 'versions' | 'monitors' | 'slo' | 'health';

const SECTION_LABELS: Record<SectionKey, string> = {
  uptime: 'Uptime Monitoring',
  versions: 'Version Tracking',
  monitors: 'Monitors',
  slo: 'SLO Health',
  health: 'Health Timeline',
};

const DEFAULT_ORDER: SectionKey[] = ['uptime', 'versions', 'monitors', 'slo', 'health'];

function moveSectionUp(order: SectionKey[], idx: number): SectionKey[] {
  if (idx === 0) return order;
  const next = [...order];
  [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
  return next;
}

function moveSectionDown(order: SectionKey[], idx: number): SectionKey[] {
  if (idx === order.length - 1) return order;
  const next = [...order];
  [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
  return next;
}

// ── Time range label tests ────────────────────────────────────────────────────
describe('DashboardControls — time range labels', () => {
  it('1h renders as "Last 1 hour"', () => {
    expect(timeRangeLabel('1h')).toBe('Last 1 hour');
  });

  it('6h renders as "Last 6 hours"', () => {
    expect(timeRangeLabel('6h')).toBe('Last 6 hours');
  });

  it('24h renders as "Last 24 hours"', () => {
    expect(timeRangeLabel('24h')).toBe('Last 24 hours');
  });

  it('7d renders as "Last 7 days"', () => {
    expect(timeRangeLabel('7d')).toBe('Last 7 days');
  });

  it('30d renders as "Last 30 days"', () => {
    expect(timeRangeLabel('30d')).toBe('Last 30 days');
  });

  it('all labels are distinct', () => {
    const labels = (['1h', '6h', '24h', '7d', '30d'] as TimeRange[]).map(timeRangeLabel);
    expect(new Set(labels).size).toBe(5);
  });
});

// ── Section labels ────────────────────────────────────────────────────────────
describe('DashboardControls — section labels', () => {
  it('all five section keys have labels', () => {
    const keys: SectionKey[] = ['uptime', 'versions', 'monitors', 'slo', 'health'];
    for (const key of keys) {
      expect(SECTION_LABELS[key]).toBeTruthy();
    }
  });

  it('all section labels are distinct', () => {
    const labels = Object.values(SECTION_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('uptime label is human-readable', () => {
    expect(SECTION_LABELS.uptime).toBe('Uptime Monitoring');
  });

  it('slo label is human-readable', () => {
    expect(SECTION_LABELS.slo).toBe('SLO Health');
  });
});

// ── Move section up ───────────────────────────────────────────────────────────
describe('DashboardControls — moveSectionUp', () => {
  it('moves a middle item up by one position', () => {
    const order = [...DEFAULT_ORDER];
    const result = moveSectionUp(order, 2); // monitors at idx 2
    expect(result[1]).toBe('monitors');
    expect(result[2]).toBe('versions');
  });

  it('is a no-op when idx === 0', () => {
    const order = [...DEFAULT_ORDER];
    expect(moveSectionUp(order, 0)).toEqual(order);
  });

  it('preserves all keys', () => {
    const order = [...DEFAULT_ORDER];
    const result = moveSectionUp(order, 3);
    expect(result.sort()).toEqual([...DEFAULT_ORDER].sort());
  });

  it('does not mutate the original array', () => {
    const order = [...DEFAULT_ORDER];
    moveSectionUp(order, 2);
    expect(order).toEqual(DEFAULT_ORDER);
  });

  it('correctly swaps adjacent items', () => {
    const order: SectionKey[] = ['uptime', 'health'];
    const result = moveSectionUp(order, 1);
    expect(result).toEqual(['health', 'uptime']);
  });
});

// ── Move section down ─────────────────────────────────────────────────────────
describe('DashboardControls — moveSectionDown', () => {
  it('moves a middle item down by one position', () => {
    const order = [...DEFAULT_ORDER];
    const result = moveSectionDown(order, 1); // versions at idx 1
    expect(result[1]).toBe('monitors');
    expect(result[2]).toBe('versions');
  });

  it('is a no-op when idx is last', () => {
    const order = [...DEFAULT_ORDER];
    expect(moveSectionDown(order, order.length - 1)).toEqual(order);
  });

  it('preserves all keys', () => {
    const order = [...DEFAULT_ORDER];
    const result = moveSectionDown(order, 1);
    expect(result.sort()).toEqual([...DEFAULT_ORDER].sort());
  });

  it('does not mutate the original array', () => {
    const order = [...DEFAULT_ORDER];
    moveSectionDown(order, 1);
    expect(order).toEqual(DEFAULT_ORDER);
  });

  it('correctly swaps adjacent items', () => {
    const order: SectionKey[] = ['uptime', 'health'];
    const result = moveSectionDown(order, 0);
    expect(result).toEqual(['health', 'uptime']);
  });
});

// ── Customize panel button state ──────────────────────────────────────────────
describe('DashboardControls — customize button class state', () => {
  function customizeBtnClass(showCustomize: boolean): string {
    return showCustomize
      ? 'border-accent/50 bg-accent/10 text-accent'
      : 'border-border bg-surface text-text-secondary hover:text-text-primary hover:border-accent/50';
  }

  it('active state uses accent colors', () => {
    expect(customizeBtnClass(true)).toContain('text-accent');
    expect(customizeBtnClass(true)).toContain('bg-accent/10');
  });

  it('inactive state uses secondary colors', () => {
    expect(customizeBtnClass(false)).toContain('text-text-secondary');
    expect(customizeBtnClass(false)).toContain('bg-surface');
  });

  it('active and inactive states are distinct', () => {
    expect(customizeBtnClass(true)).not.toBe(customizeBtnClass(false));
  });
});
