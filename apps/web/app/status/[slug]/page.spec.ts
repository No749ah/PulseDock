/**
 * Unit tests for pure helpers in app/status/[slug]/page.tsx.
 *
 * Covers: clamp, getScopedMonitors (monitorIds/singleId/tag/folderId/type),
 * passesVisibilityRule (always/outage/degraded/operational/empty),
 * shouldRenderWidget (hideWhenNoData + visibility),
 * canPlace/markPlaced/buildResponsivePlacement grid layout logic.
 */
import { describe, it, expect } from 'vitest';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MonitorSummary {
  id: string;
  type: string;
  level: 'green' | 'yellow' | 'red';
  tags?: string[];
  folderId?: string | null;
}

interface Widget {
  id: string;
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

// ── Inline-reproduced helpers ─────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
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
  for (let ry = y; ry < y + h; ry++) {
    for (let cx = x; cx < x + w; cx++) {
      if (occupied.has(`${ry}:${cx}`)) return false;
    }
  }
  return true;
}

function markPlaced(occupied: Set<string>, x: number, y: number, w: number, h: number): void {
  for (let ry = y; ry < y + h; ry++) {
    for (let cx = x; cx < x + w; cx++) {
      occupied.add(`${ry}:${cx}`);
    }
  }
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

// ── Monitor fixtures ──────────────────────────────────────────────────────────

const monitors: MonitorSummary[] = [
  { id: 'm1', type: 'HTTP', level: 'green', tags: ['api', 'prod'], folderId: 'folder-1' },
  { id: 'm2', type: 'TCP', level: 'yellow', tags: ['db'], folderId: 'folder-1' },
  { id: 'm3', type: 'HTTP', level: 'red', tags: ['api'], folderId: 'folder-2' },
  { id: 'm4', type: 'DNS', level: 'green', tags: [], folderId: null },
];

function makeWidget(config: Record<string, unknown> = {}, id = 'w1'): Widget {
  return { id, x: 0, y: 0, w: 6, h: 2, config };
}

// ── clamp ─────────────────────────────────────────────────────────────────────

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to min', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });

  it('clamps to max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns min when min === max', () => {
    expect(clamp(5, 3, 3)).toBe(3);
  });
});

// ── getScopedMonitors ─────────────────────────────────────────────────────────

describe('getScopedMonitors', () => {
  it('returns all monitors when no filter configured', () => {
    const w = makeWidget({});
    expect(getScopedMonitors(w, monitors)).toHaveLength(4);
  });

  it('filters by monitorIds array', () => {
    const w = makeWidget({ monitorIds: ['m1', 'm3'] });
    const result = getScopedMonitors(w, monitors);
    expect(result.map((m) => m.id)).toEqual(['m1', 'm3']);
  });

  it('filters by singleId when no monitorIds', () => {
    const w = makeWidget({ monitorId: 'm2' });
    const result = getScopedMonitors(w, monitors);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m2');
  });

  it('monitorIds takes priority over singleId', () => {
    const w = makeWidget({ monitorIds: ['m1'], monitorId: 'm2' });
    const result = getScopedMonitors(w, monitors);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m1');
  });

  it('filters by tag', () => {
    const w = makeWidget({ tag: 'api' });
    const result = getScopedMonitors(w, monitors);
    expect(result.map((m) => m.id).sort()).toEqual(['m1', 'm3'].sort());
  });

  it('filters by folderId', () => {
    const w = makeWidget({ folderId: 'folder-1' });
    const result = getScopedMonitors(w, monitors);
    expect(result.map((m) => m.id).sort()).toEqual(['m1', 'm2'].sort());
  });

  it('filters by monitorType', () => {
    const w = makeWidget({ monitorType: 'HTTP' });
    const result = getScopedMonitors(w, monitors);
    expect(result.map((m) => m.id).sort()).toEqual(['m1', 'm3'].sort());
  });

  it('combines monitorIds + tag filter', () => {
    const w = makeWidget({ monitorIds: ['m1', 'm3'], tag: 'prod' });
    const result = getScopedMonitors(w, monitors);
    // m1 has prod tag, m3 doesn't
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m1');
  });

  it('returns empty array when no monitors match', () => {
    const w = makeWidget({ monitorIds: ['nonexistent'] });
    expect(getScopedMonitors(w, monitors)).toHaveLength(0);
  });
});

// ── passesVisibilityRule ──────────────────────────────────────────────────────

describe('passesVisibilityRule', () => {
  it('always rule → always true', () => {
    const w = makeWidget({ visibility: 'always' });
    expect(passesVisibilityRule(w, [])).toBe(true);
    expect(passesVisibilityRule(w, monitors)).toBe(true);
  });

  it('default (no visibility) → always true', () => {
    const w = makeWidget({});
    expect(passesVisibilityRule(w, monitors)).toBe(true);
  });

  it('outage rule → true when any monitor is red', () => {
    const w = makeWidget({ visibility: 'outage' });
    const withRed = monitors.filter((m) => m.id === 'm3');
    expect(passesVisibilityRule(w, withRed)).toBe(true);
  });

  it('outage rule → false when no red monitors', () => {
    const w = makeWidget({ visibility: 'outage' });
    const noRed = monitors.filter((m) => m.level !== 'red');
    expect(passesVisibilityRule(w, noRed)).toBe(false);
  });

  it('outage rule → false when empty monitors', () => {
    const w = makeWidget({ visibility: 'outage' });
    expect(passesVisibilityRule(w, [])).toBe(false);
  });

  it('degraded rule → true when yellow and no red', () => {
    const w = makeWidget({ visibility: 'degraded' });
    const yellowOnly = [{ id: 'm2', type: 'TCP', level: 'yellow' as const }];
    expect(passesVisibilityRule(w, yellowOnly)).toBe(true);
  });

  it('degraded rule → false when red present', () => {
    const w = makeWidget({ visibility: 'degraded' });
    const withRed = monitors.filter((m) => ['m2', 'm3'].includes(m.id));
    expect(passesVisibilityRule(w, withRed)).toBe(false);
  });

  it('operational rule → true when all green', () => {
    const w = makeWidget({ visibility: 'operational' });
    const allGreen = monitors.filter((m) => m.level === 'green');
    expect(passesVisibilityRule(w, allGreen)).toBe(true);
  });

  it('operational rule → false when any yellow or red', () => {
    const w = makeWidget({ visibility: 'operational' });
    expect(passesVisibilityRule(w, monitors)).toBe(false);
  });
});

// ── shouldRenderWidget ────────────────────────────────────────────────────────

describe('shouldRenderWidget', () => {
  it('renders when monitors match and no special config', () => {
    const w = makeWidget({});
    expect(shouldRenderWidget(w, monitors)).toBe(true);
  });

  it('hides when hideWhenNoData=true and no monitors match', () => {
    const w = makeWidget({ hideWhenNoData: true, monitorIds: ['nonexistent'] });
    expect(shouldRenderWidget(w, monitors)).toBe(false);
  });

  it('shows when hideWhenNoData=false even with no monitors', () => {
    const w = makeWidget({ hideWhenNoData: false, monitorIds: ['nonexistent'] });
    expect(shouldRenderWidget(w, monitors)).toBe(true);
  });

  it('combines hideWhenNoData check with visibility rule', () => {
    const w = makeWidget({ hideWhenNoData: true, visibility: 'outage', monitorIds: ['m1'] });
    // m1 is green → outage rule = false
    expect(shouldRenderWidget(w, monitors)).toBe(false);
  });
});

// ── canPlace / markPlaced ─────────────────────────────────────────────────────

describe('canPlace', () => {
  it('returns true for empty occupied set', () => {
    const occupied = new Set<string>();
    expect(canPlace(occupied, 0, 0, 3, 2)).toBe(true);
  });

  it('returns false when any cell is occupied', () => {
    const occupied = new Set(['1:2']); // row 1, col 2
    expect(canPlace(occupied, 0, 0, 4, 3)).toBe(false); // covers row 0-2, col 0-3
  });

  it('returns true when occupied cells are outside placement area', () => {
    const occupied = new Set(['5:5']);
    expect(canPlace(occupied, 0, 0, 3, 2)).toBe(true);
  });
});

describe('markPlaced', () => {
  it('marks all cells in the placement rectangle', () => {
    const occupied = new Set<string>();
    markPlaced(occupied, 2, 1, 3, 2); // x=2, y=1, w=3, h=2
    // Should mark: (1,2),(1,3),(1,4),(2,2),(2,3),(2,4)
    expect(occupied.has('1:2')).toBe(true);
    expect(occupied.has('1:3')).toBe(true);
    expect(occupied.has('1:4')).toBe(true);
    expect(occupied.has('2:2')).toBe(true);
    expect(occupied.has('2:3')).toBe(true);
    expect(occupied.has('2:4')).toBe(true);
    expect(occupied.size).toBe(6);
  });
});

// ── buildResponsivePlacement ──────────────────────────────────────────────────

describe('buildResponsivePlacement', () => {
  it('places a single widget without collision', () => {
    const w: Widget = { id: 'w1', x: 0, y: 0, w: 6, h: 2, config: {} };
    const result = buildResponsivePlacement([w], 4);
    expect(result.has('w1')).toBe(true);
    const p = result.get('w1')!;
    expect(p.w).toBeGreaterThanOrEqual(1);
    expect(p.w).toBeLessThanOrEqual(4);
    expect(p.h).toBeGreaterThanOrEqual(1);
  });

  it('places all widgets with unique IDs', () => {
    const widgets: Widget[] = [
      { id: 'w1', x: 0, y: 0, w: 6, h: 2, config: {} },
      { id: 'w2', x: 6, y: 0, w: 6, h: 2, config: {} },
    ];
    const result = buildResponsivePlacement(widgets, 12);
    expect(result.size).toBe(2);
    expect(result.has('w1')).toBe(true);
    expect(result.has('w2')).toBe(true);
  });

  it('no two widgets occupy the same cell', () => {
    const widgets: Widget[] = [
      { id: 'w1', x: 0, y: 0, w: 6, h: 2, config: {} },
      { id: 'w2', x: 0, y: 0, w: 6, h: 2, config: {} }, // Same preferred position
      { id: 'w3', x: 6, y: 0, w: 6, h: 2, config: {} },
    ];
    const result = buildResponsivePlacement(widgets, 12);

    // Build cell set for each widget and check no overlaps
    const allCells = new Set<string>();
    let overlaps = 0;
    for (const [, p] of result) {
      for (let ry = p.y; ry < p.y + p.h; ry++) {
        for (let cx = p.x; cx < p.x + p.w; cx++) {
          const key = `${ry}:${cx}`;
          if (allCells.has(key)) overlaps++;
          allCells.add(key);
        }
      }
    }
    expect(overlaps).toBe(0);
  });

  it('handles 1-col layout by clamping widths to 1', () => {
    const w: Widget = { id: 'w1', x: 0, y: 0, w: 12, h: 2, config: {} };
    const result = buildResponsivePlacement([w], 1);
    const p = result.get('w1')!;
    expect(p.w).toBe(1);
  });

  it('empty widgets array returns empty map', () => {
    const result = buildResponsivePlacement([], 12);
    expect(result.size).toBe(0);
  });
});
