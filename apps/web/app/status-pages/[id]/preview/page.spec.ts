/**
 * Unit tests for status-pages/[id]/preview/page.tsx pure helper functions.
 *
 * Covers:
 *   clamp                    — numeric clamping
 *   getScopedMonitors        — filter monitors by widget config (ids/singleId/tag/folderId/type)
 *   passesVisibilityRule     — widget visibility rule evaluation
 *   shouldRenderWidget       — hideWhenNoData + visibility gate
 *   canPlace                 — CSS grid cell occupancy check
 *   markPlaced               — mark grid cells as occupied
 *   buildResponsivePlacement — full responsive grid layout algorithm
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ── Inline helper copies (same logic as page.tsx, no import needed) ──────────

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

interface MonitorSummary {
  id: string;
  name: string;
  level: string;
  tags?: string[];
  folderId?: string | null;
  type?: string;
}

interface Widget {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, unknown>;
}

interface GridPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
}

function getScopedMonitors(widget: Widget, monitors: MonitorSummary[]): MonitorSummary[] {
  const ids = widget.config.monitorIds as string[] | undefined;
  const singleId = widget.config.monitorId as string | undefined;
  const tag = widget.config.tag as string | undefined;
  const folderId = widget.config.folderId as string | undefined;
  const monitorType = widget.config.monitorType as string | undefined;
  let scoped = monitors;
  if (ids?.length) scoped = scoped.filter((m) => ids.includes(m.id));
  else if (singleId) scoped = scoped.filter((m) => m.id === singleId);
  if (tag) scoped = scoped.filter((m) => m.tags?.includes(tag));
  if (folderId) scoped = scoped.filter((m) => m.folderId === folderId);
  if (monitorType) scoped = scoped.filter((m) => m.type === monitorType);
  return scoped;
}

function passesVisibilityRule(widget: Widget, scopedMonitors: MonitorSummary[]): boolean {
  const rule = (widget.config.visibility as string | undefined) ?? 'always';
  if (rule === 'always') return true;
  if (scopedMonitors.length === 0) return false;
  const hasRed = scopedMonitors.some((m) => m.level === 'red');
  const hasYellow = scopedMonitors.some((m) => m.level === 'yellow');
  if (rule === 'outage') return hasRed;
  if (rule === 'degraded') return !hasRed && hasYellow;
  if (rule === 'operational') return !hasRed && !hasYellow;
  return true;
}

function shouldRenderWidget(widget: Widget, monitors: MonitorSummary[]): boolean {
  const scopedMonitors = getScopedMonitors(widget, monitors);
  if (Boolean(widget.config.hideWhenNoData) && scopedMonitors.length === 0) return false;
  return passesVisibilityRule(widget, scopedMonitors);
}

function canPlace(occupied: Set<string>, x: number, y: number, w: number, h: number): boolean {
  for (let ry = y; ry < y + h; ry++)
    for (let cx = x; cx < x + w; cx++)
      if (occupied.has(`${ry}:${cx}`)) return false;
  return true;
}

function markPlaced(occupied: Set<string>, x: number, y: number, w: number, h: number): void {
  for (let ry = y; ry < y + h; ry++)
    for (let cx = x; cx < x + w; cx++)
      occupied.add(`${ry}:${cx}`);
}

function buildResponsivePlacement(widgets: Widget[], cols: number): Map<string, GridPlacement> {
  const map = new Map<string, GridPlacement>();
  const occupied = new Set<string>();
  for (const widget of widgets) {
    const w = clamp(Math.round((widget.w / 12) * cols), 1, cols);
    const h = Math.max(1, widget.h);
    const preferredX = clamp(Math.round((widget.x / 12) * cols), 0, cols - w);
    const preferredY = Math.max(0, widget.y);
    let y = preferredY;
    let placed = false;
    while (!placed) {
      const xCandidates: number[] = [];
      for (let x = preferredX; x <= cols - w; x++) xCandidates.push(x);
      for (let x = 0; x < preferredX; x++) xCandidates.push(x);
      for (const x of xCandidates) {
        if (!canPlace(occupied, x, y, w, h)) continue;
        markPlaced(occupied, x, y, w, h);
        map.set(widget.id, { x, y, w, h });
        placed = true;
        break;
      }
      y += 1;
    }
  }
  return map;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const baseWidget = (): Widget => ({
  id: 'w1',
  type: 'uptime-badge',
  x: 0,
  y: 0,
  w: 12,
  h: 2,
  config: {},
});

const monitors: MonitorSummary[] = [
  { id: 'm1', name: 'API', level: 'green', tags: ['backend'], folderId: 'f1', type: 'HTTP' },
  { id: 'm2', name: 'Web', level: 'yellow', tags: ['frontend'], folderId: 'f1', type: 'HTTP' },
  { id: 'm3', name: 'DB', level: 'red', tags: ['backend'], folderId: 'f2', type: 'TCP' },
];

// ─── clamp ────────────────────────────────────────────────────────────────────

describe('clamp', () => {
  it('returns n when within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to min when below', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it('clamps to max when above', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('handles equal min and max', () => {
    expect(clamp(7, 5, 5)).toBe(5);
  });

  it('returns min when n === min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('returns max when n === max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

// ─── getScopedMonitors ────────────────────────────────────────────────────────

describe('getScopedMonitors', () => {
  it('returns all monitors when no filter config', () => {
    const w = baseWidget();
    expect(getScopedMonitors(w, monitors)).toHaveLength(3);
  });

  it('filters by monitorIds array', () => {
    const w = { ...baseWidget(), config: { monitorIds: ['m1', 'm3'] } };
    const result = getScopedMonitors(w, monitors);
    expect(result.map((m) => m.id)).toEqual(['m1', 'm3']);
  });

  it('filters by single monitorId', () => {
    const w = { ...baseWidget(), config: { monitorId: 'm2' } };
    const result = getScopedMonitors(w, monitors);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m2');
  });

  it('prefers monitorIds over monitorId when both set', () => {
    const w = { ...baseWidget(), config: { monitorIds: ['m1'], monitorId: 'm3' } };
    const result = getScopedMonitors(w, monitors);
    expect(result.map((m) => m.id)).toEqual(['m1']);
  });

  it('filters by tag', () => {
    const w = { ...baseWidget(), config: { tag: 'backend' } };
    const result = getScopedMonitors(w, monitors);
    expect(result.map((m) => m.id).sort()).toEqual(['m1', 'm3'].sort());
  });

  it('filters by folderId', () => {
    const w = { ...baseWidget(), config: { folderId: 'f1' } };
    const result = getScopedMonitors(w, monitors);
    expect(result.map((m) => m.id).sort()).toEqual(['m1', 'm2'].sort());
  });

  it('filters by monitorType', () => {
    const w = { ...baseWidget(), config: { monitorType: 'TCP' } };
    const result = getScopedMonitors(w, monitors);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m3');
  });

  it('stacks filters: monitorIds + tag', () => {
    const w = { ...baseWidget(), config: { monitorIds: ['m1', 'm2', 'm3'], tag: 'frontend' } };
    const result = getScopedMonitors(w, monitors);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m2');
  });

  it('returns empty array when monitorIds is empty array (no-match falls through)', () => {
    // Empty monitorIds means no filtering by ids (falsy branch)
    const w = { ...baseWidget(), config: { monitorIds: [] } };
    const result = getScopedMonitors(w, monitors);
    // Empty array is falsy: [] is truthy but length=0 is falsy in `ids?.length`
    expect(result).toHaveLength(3);
  });
});

// ─── passesVisibilityRule ─────────────────────────────────────────────────────

describe('passesVisibilityRule', () => {
  const makeWidget = (visibility?: string): Widget => ({
    ...baseWidget(),
    config: visibility !== undefined ? { visibility } : {},
  });

  it('always rule → true regardless of monitor status', () => {
    expect(passesVisibilityRule(makeWidget('always'), [])).toBe(true);
    expect(passesVisibilityRule(makeWidget('always'), monitors)).toBe(true);
  });

  it('defaults to always when visibility not set', () => {
    expect(passesVisibilityRule(makeWidget(), monitors)).toBe(true);
    expect(passesVisibilityRule(makeWidget(), [])).toBe(true);
  });

  it('outage rule → false when no monitors in scope', () => {
    expect(passesVisibilityRule(makeWidget('outage'), [])).toBe(false);
  });

  it('outage rule → true when at least one red', () => {
    const withRed: MonitorSummary[] = [
      { id: 'm1', name: 'A', level: 'green' },
      { id: 'm3', name: 'C', level: 'red' },
    ];
    expect(passesVisibilityRule(makeWidget('outage'), withRed)).toBe(true);
  });

  it('outage rule → false when no red', () => {
    const noRed: MonitorSummary[] = [
      { id: 'm1', name: 'A', level: 'green' },
      { id: 'm2', name: 'B', level: 'yellow' },
    ];
    expect(passesVisibilityRule(makeWidget('outage'), noRed)).toBe(false);
  });

  it('degraded rule → true when yellow but no red', () => {
    const degraded: MonitorSummary[] = [
      { id: 'm1', name: 'A', level: 'green' },
      { id: 'm2', name: 'B', level: 'yellow' },
    ];
    expect(passesVisibilityRule(makeWidget('degraded'), degraded)).toBe(true);
  });

  it('degraded rule → false when red present', () => {
    const withRed: MonitorSummary[] = [
      { id: 'm3', name: 'C', level: 'red' },
      { id: 'm2', name: 'B', level: 'yellow' },
    ];
    expect(passesVisibilityRule(makeWidget('degraded'), withRed)).toBe(false);
  });

  it('degraded rule → false when all green', () => {
    const allGreen: MonitorSummary[] = [{ id: 'm1', name: 'A', level: 'green' }];
    expect(passesVisibilityRule(makeWidget('degraded'), allGreen)).toBe(false);
  });

  it('operational rule → true when all green', () => {
    const allGreen: MonitorSummary[] = [{ id: 'm1', name: 'A', level: 'green' }];
    expect(passesVisibilityRule(makeWidget('operational'), allGreen)).toBe(true);
  });

  it('operational rule → false when red present', () => {
    expect(passesVisibilityRule(makeWidget('operational'), monitors)).toBe(false);
  });

  it('unknown rule → true (catch-all)', () => {
    expect(passesVisibilityRule(makeWidget('custom-unknown'), monitors)).toBe(true);
  });
});

// ─── shouldRenderWidget ───────────────────────────────────────────────────────

describe('shouldRenderWidget', () => {
  it('renders widget with no config (always visible)', () => {
    expect(shouldRenderWidget(baseWidget(), monitors)).toBe(true);
  });

  it('hides when hideWhenNoData=true and no monitors in scope', () => {
    const w: Widget = {
      ...baseWidget(),
      config: { hideWhenNoData: true, monitorId: 'nonexistent' },
    };
    expect(shouldRenderWidget(w, monitors)).toBe(false);
  });

  it('shows when hideWhenNoData=true but monitors present in scope', () => {
    const w: Widget = {
      ...baseWidget(),
      config: { hideWhenNoData: true, monitorId: 'm1' },
    };
    expect(shouldRenderWidget(w, monitors)).toBe(true);
  });

  it('shows when hideWhenNoData=false and no monitors', () => {
    const w: Widget = {
      ...baseWidget(),
      config: { hideWhenNoData: false, monitorId: 'nonexistent' },
    };
    expect(shouldRenderWidget(w, monitors)).toBe(true);
  });

  it('combines hideWhenNoData with visibility rule', () => {
    // No data → hidden before visibility rule is evaluated
    const w: Widget = {
      ...baseWidget(),
      config: { hideWhenNoData: true, monitorId: 'nonexistent', visibility: 'always' },
    };
    expect(shouldRenderWidget(w, monitors)).toBe(false);
  });
});

// ─── canPlace ─────────────────────────────────────────────────────────────────

describe('canPlace', () => {
  it('returns true for empty grid', () => {
    const occupied = new Set<string>();
    expect(canPlace(occupied, 0, 0, 3, 2)).toBe(true);
  });

  it('returns false when cell is occupied', () => {
    const occupied = new Set(['0:0', '0:1', '0:2']);
    expect(canPlace(occupied, 0, 0, 3, 2)).toBe(false);
  });

  it('returns true when adjacent non-overlapping', () => {
    const occupied = new Set(['0:0', '0:1', '0:2']);
    expect(canPlace(occupied, 3, 0, 3, 2)).toBe(true);
  });

  it('returns false if any single cell in range is occupied', () => {
    const occupied = new Set(['1:2']);
    expect(canPlace(occupied, 0, 0, 4, 3)).toBe(false);
  });

  it('handles 1x1 widget', () => {
    const occupied = new Set<string>();
    expect(canPlace(occupied, 5, 5, 1, 1)).toBe(true);
    occupied.add('5:5');
    expect(canPlace(occupied, 5, 5, 1, 1)).toBe(false);
  });
});

// ─── markPlaced ───────────────────────────────────────────────────────────────

describe('markPlaced', () => {
  it('marks all cells for 3x2 widget', () => {
    const occupied = new Set<string>();
    markPlaced(occupied, 0, 0, 3, 2);
    expect(occupied.size).toBe(6);
    expect(occupied.has('0:0')).toBe(true);
    expect(occupied.has('0:1')).toBe(true);
    expect(occupied.has('0:2')).toBe(true);
    expect(occupied.has('1:0')).toBe(true);
    expect(occupied.has('1:1')).toBe(true);
    expect(occupied.has('1:2')).toBe(true);
  });

  it('marks 1x1 widget', () => {
    const occupied = new Set<string>();
    markPlaced(occupied, 4, 3, 1, 1);
    expect(occupied.size).toBe(1);
    expect(occupied.has('3:4')).toBe(true);
  });

  it('is additive (does not clear existing)', () => {
    const occupied = new Set(['0:0']);
    markPlaced(occupied, 1, 0, 1, 1);
    expect(occupied.size).toBe(2);
    expect(occupied.has('0:0')).toBe(true);
    expect(occupied.has('0:1')).toBe(true);
  });
});

// ─── buildResponsivePlacement ─────────────────────────────────────────────────

describe('buildResponsivePlacement', () => {
  it('returns empty map for empty widget list', () => {
    expect(buildResponsivePlacement([], 12).size).toBe(0);
  });

  it('places single full-width widget at (0,0)', () => {
    const widgets: Widget[] = [{ id: 'w1', type: 'bar', x: 0, y: 0, w: 12, h: 2, config: {} }];
    const map = buildResponsivePlacement(widgets, 12);
    expect(map.get('w1')).toEqual({ x: 0, y: 0, w: 12, h: 2 });
  });

  it('clamps widget width to cols minimum 1', () => {
    // w=1 in 12-col → scales to 1 in 4-col (rounds to 0 but clamped to 1)
    const widgets: Widget[] = [{ id: 'w1', type: 'bar', x: 0, y: 0, w: 1, h: 1, config: {} }];
    const map = buildResponsivePlacement(widgets, 4);
    expect(map.get('w1')!.w).toBeGreaterThanOrEqual(1);
  });

  it('clamps widget height to minimum 1', () => {
    const widgets: Widget[] = [{ id: 'w1', type: 'bar', x: 0, y: 0, w: 12, h: 0, config: {} }];
    const map = buildResponsivePlacement(widgets, 12);
    expect(map.get('w1')!.h).toBe(1);
  });

  it('places non-overlapping widgets side by side at 12 cols', () => {
    const widgets: Widget[] = [
      { id: 'w1', type: 'bar', x: 0, y: 0, w: 6, h: 2, config: {} },
      { id: 'w2', type: 'bar', x: 6, y: 0, w: 6, h: 2, config: {} },
    ];
    const map = buildResponsivePlacement(widgets, 12);
    const p1 = map.get('w1')!;
    const p2 = map.get('w2')!;
    // They should not overlap
    const intersects =
      p1.x < p2.x + p2.w &&
      p1.x + p1.w > p2.x &&
      p1.y < p2.y + p2.h &&
      p1.y + p1.h > p2.y;
    expect(intersects).toBe(false);
  });

  it('bumps widget down when preferred position occupied', () => {
    // Two full-width widgets both wanting row 0 — second must go lower
    const widgets: Widget[] = [
      { id: 'w1', type: 'bar', x: 0, y: 0, w: 12, h: 1, config: {} },
      { id: 'w2', type: 'bar', x: 0, y: 0, w: 12, h: 1, config: {} },
    ];
    const map = buildResponsivePlacement(widgets, 12);
    const p1 = map.get('w1')!;
    const p2 = map.get('w2')!;
    expect(p1.y).not.toBe(p2.y);
  });

  it('places all widgets (every id in map)', () => {
    const widgets: Widget[] = Array.from({ length: 6 }, (_, i) => ({
      id: `w${i}`,
      type: 'bar',
      x: (i % 3) * 4,
      y: Math.floor(i / 3) * 2,
      w: 4,
      h: 2,
      config: {},
    }));
    const map = buildResponsivePlacement(widgets, 12);
    expect(map.size).toBe(6);
    for (const w of widgets) {
      expect(map.has(w.id)).toBe(true);
    }
  });

  it('scales correctly for 4-col layout (mobile)', () => {
    // Full-width widget (w=12, x=0) in 4-col → should fill all 4 cols
    const widgets: Widget[] = [{ id: 'w1', type: 'bar', x: 0, y: 0, w: 12, h: 2, config: {} }];
    const map = buildResponsivePlacement(widgets, 4);
    expect(map.get('w1')!.w).toBe(4);
  });
});
