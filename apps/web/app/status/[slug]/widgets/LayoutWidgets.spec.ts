import { describe, it, expect } from 'vitest';
import { dependencyMapLevelColor, computeGridCols, computeNodePosition } from './layoutWidgetHelpers';

describe('dependencyMapLevelColor', () => {
  it('green returns green colors', () => {
    const c = dependencyMapLevelColor('green');
    expect(c.ring).toBe('#4ade80');
    expect(c.bg).toBe('#052e16');
    expect(c.text).toBe('#4ade80');
  });

  it('yellow returns yellow colors', () => {
    const c = dependencyMapLevelColor('yellow');
    expect(c.ring).toBe('#facc15');
    expect(c.bg).toBe('#1c1a00');
    expect(c.text).toBe('#facc15');
  });

  it('red (default) returns red colors', () => {
    const c = dependencyMapLevelColor('red');
    expect(c.ring).toBe('#f87171');
    expect(c.bg).toBe('#2d0a0a');
    expect(c.text).toBe('#f87171');
  });

  it('unknown level falls through to red', () => {
    const c = dependencyMapLevelColor('unknown');
    expect(c.ring).toBe('#f87171');
  });
});

describe('computeGridCols', () => {
  it('1 node → 1 col', () => {
    expect(computeGridCols(1)).toBe(1);
  });

  it('0 nodes → 1 col (guard for empty)', () => {
    expect(computeGridCols(0)).toBe(1);
  });

  it('4 nodes → 2 cols (2×2)', () => {
    expect(computeGridCols(4)).toBe(2);
  });

  it('9 nodes → 3 cols (3×3)', () => {
    expect(computeGridCols(9)).toBe(3);
  });

  it('5 nodes → 3 cols (ceil(√5)=3)', () => {
    expect(computeGridCols(5)).toBe(3);
  });
});

describe('computeNodePosition', () => {
  const W = 120, H = 52, CG = 60, RG = 50;

  it('first node (index 0) at offset position', () => {
    const pos = computeNodePosition(0, 2, W, H, CG, RG);
    expect(pos.x).toBe(20); // 0 * (120+60) + 20
    expect(pos.y).toBe(20); // floor(0/2) * (52+50) + 20
  });

  it('second node (index 1, 2 cols) in same row', () => {
    const pos = computeNodePosition(1, 2, W, H, CG, RG);
    expect(pos.x).toBe(20 + 180); // 1 * 180 + 20
    expect(pos.y).toBe(20);       // row 0
  });

  it('third node (index 2, 2 cols) starts second row', () => {
    const pos = computeNodePosition(2, 2, W, H, CG, RG);
    expect(pos.x).toBe(20);       // col 0
    expect(pos.y).toBe(20 + 102); // row 1: 1*(52+50)+20
  });

  it('custom offsets work correctly', () => {
    const pos = computeNodePosition(0, 3, W, H, CG, RG, 10, 5);
    expect(pos.x).toBe(10);
    expect(pos.y).toBe(5);
  });
});
