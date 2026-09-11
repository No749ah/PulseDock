import { describe, it, expect } from 'vitest';

// ── Inline helpers (mirrored from layoutWidgetHelpers.ts) ──────────────────

function dependencyMapLevelColor(lvl: string): { ring: string; bg: string; text: string } {
  if (lvl === 'green') return { ring: '#4ade80', bg: '#052e16', text: '#4ade80' };
  if (lvl === 'yellow') return { ring: '#facc15', bg: '#1c1a00', text: '#facc15' };
  return { ring: '#f87171', bg: '#2d0a0a', text: '#f87171' };
}

function computeGridCols(nodeCount: number): number {
  return Math.ceil(Math.sqrt(nodeCount || 1));
}

function computeNodePosition(
  index: number,
  cols: number,
  nodeW: number,
  nodeH: number,
  colGap: number,
  rowGap: number,
  offsetX = 20,
  offsetY = 20,
): { x: number; y: number } {
  return {
    x: (index % cols) * (nodeW + colGap) + offsetX,
    y: Math.floor(index / cols) * (nodeH + rowGap) + offsetY,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('dependencyMapLevelColor', () => {
  it('returns correct colors for green level', () => {
    expect(dependencyMapLevelColor('green')).toEqual({
      ring: '#4ade80',
      bg: '#052e16',
      text: '#4ade80',
    });
  });

  it('returns correct colors for yellow level', () => {
    expect(dependencyMapLevelColor('yellow')).toEqual({
      ring: '#facc15',
      bg: '#1c1a00',
      text: '#facc15',
    });
  });

  it('returns red colors for red level', () => {
    expect(dependencyMapLevelColor('red')).toEqual({
      ring: '#f87171',
      bg: '#2d0a0a',
      text: '#f87171',
    });
  });

  it('returns red colors for unknown/unrecognized level', () => {
    expect(dependencyMapLevelColor('unknown')).toEqual({
      ring: '#f87171',
      bg: '#2d0a0a',
      text: '#f87171',
    });
  });

  it('returns red colors for empty string', () => {
    expect(dependencyMapLevelColor('')).toEqual({
      ring: '#f87171',
      bg: '#2d0a0a',
      text: '#f87171',
    });
  });

  it('returns all required keys (ring, bg, text) for each level', () => {
    for (const lvl of ['green', 'yellow', 'red', 'other']) {
      const result = dependencyMapLevelColor(lvl);
      expect(result).toHaveProperty('ring');
      expect(result).toHaveProperty('bg');
      expect(result).toHaveProperty('text');
    }
  });
});

describe('computeGridCols', () => {
  it('returns 1 for 0 nodes (treats 0 as 1)', () => {
    expect(computeGridCols(0)).toBe(1);
  });

  it('returns 1 for 1 node', () => {
    expect(computeGridCols(1)).toBe(1);
  });

  it('returns 2 for 4 nodes (2x2)', () => {
    expect(computeGridCols(4)).toBe(2);
  });

  it('returns 2 for 3 nodes (ceil(sqrt(3)) = 2)', () => {
    expect(computeGridCols(3)).toBe(2);
  });

  it('returns 3 for 9 nodes (3x3)', () => {
    expect(computeGridCols(9)).toBe(3);
  });

  it('returns 3 for 7 nodes (ceil(sqrt(7)) = 3)', () => {
    expect(computeGridCols(7)).toBe(3);
  });

  it('returns 4 for 16 nodes (4x4)', () => {
    expect(computeGridCols(16)).toBe(4);
  });

  it('returns 4 for 10 nodes (ceil(sqrt(10)) = 4)', () => {
    expect(computeGridCols(10)).toBe(4);
  });

  it('returns 5 for 25 nodes', () => {
    expect(computeGridCols(25)).toBe(5);
  });

  it('returns ceil(sqrt(N)) for large N', () => {
    expect(computeGridCols(100)).toBe(10);
    expect(computeGridCols(50)).toBe(Math.ceil(Math.sqrt(50)));
  });
});

describe('computeNodePosition', () => {
  const nodeW = 80;
  const nodeH = 60;
  const colGap = 20;
  const rowGap = 15;

  it('places first node (index 0) at offsetX, offsetY', () => {
    const pos = computeNodePosition(0, 3, nodeW, nodeH, colGap, rowGap);
    expect(pos).toEqual({ x: 20, y: 20 });
  });

  it('places second node (index 1) in first row at col 1', () => {
    const pos = computeNodePosition(1, 3, nodeW, nodeH, colGap, rowGap);
    expect(pos).toEqual({ x: 20 + (nodeW + colGap), y: 20 });
  });

  it('places fourth node (index 3) in second row at col 0', () => {
    const pos = computeNodePosition(3, 3, nodeW, nodeH, colGap, rowGap);
    expect(pos).toEqual({ x: 20, y: 20 + (nodeH + rowGap) });
  });

  it('places fifth node (index 4) in second row at col 1', () => {
    const pos = computeNodePosition(4, 3, nodeW, nodeH, colGap, rowGap);
    expect(pos).toEqual({ x: 20 + (nodeW + colGap), y: 20 + (nodeH + rowGap) });
  });

  it('respects custom offsetX and offsetY', () => {
    const pos = computeNodePosition(0, 3, nodeW, nodeH, colGap, rowGap, 50, 100);
    expect(pos).toEqual({ x: 50, y: 100 });
  });

  it('returns correct x for all nodes in a single-column layout', () => {
    for (let i = 0; i < 5; i++) {
      const pos = computeNodePosition(i, 1, nodeW, nodeH, colGap, rowGap);
      expect(pos.x).toBe(20); // col 0 always
      expect(pos.y).toBe(20 + i * (nodeH + rowGap));
    }
  });

  it('returns correct positions with 2 columns', () => {
    const pos0 = computeNodePosition(0, 2, 100, 50, 10, 10);
    const pos1 = computeNodePosition(1, 2, 100, 50, 10, 10);
    const pos2 = computeNodePosition(2, 2, 100, 50, 10, 10);
    const pos3 = computeNodePosition(3, 2, 100, 50, 10, 10);

    expect(pos0).toEqual({ x: 20, y: 20 });          // row 0, col 0
    expect(pos1).toEqual({ x: 20 + 110, y: 20 });    // row 0, col 1
    expect(pos2).toEqual({ x: 20, y: 20 + 60 });     // row 1, col 0
    expect(pos3).toEqual({ x: 20 + 110, y: 20 + 60 }); // row 1, col 1
  });
});
