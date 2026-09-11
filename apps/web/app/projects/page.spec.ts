import { describe, it, expect } from 'vitest';
import { flattenTree, uptimeBarColor, STATUS_LABELS, type FolderNode } from './helpers';

function node(id: string, children: FolderNode[] = []): FolderNode {
  return { id, name: id, children };
}

describe('flattenTree', () => {
  it('returns [] for empty input', () => {
    expect(flattenTree([])).toEqual([]);
  });

  it('returns 1 item for single root with no children', () => {
    expect(flattenTree([node('a')])).toHaveLength(1);
  });

  it('flattens depth-first: parent before children', () => {
    const tree = [node('a', [node('b')])];
    const result = flattenTree(tree);
    expect(result.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('handles 2 roots each with 1 child → 4 items in DFS order', () => {
    const tree = [node('a', [node('b')]), node('c', [node('d')])];
    const result = flattenTree(tree);
    expect(result.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('flattens 3-level nesting → 5 nodes in order', () => {
    const tree = [
      node('a', [
        node('b', [
          node('c'),
        ]),
        node('d'),
      ]),
    ];
    // Expected DFS: a, b, c, d — but wait, a has children b (with child c) and d
    // DFS: a → b → c → d
    const result = flattenTree(tree);
    expect(result.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(result).toHaveLength(4);
  });

  it('flattens deep 3-level nesting → 5 nodes (chain)', () => {
    const tree = [
      node('r1', [
        node('r2', [
          node('r3', [
            node('r4', [
              node('r5'),
            ]),
          ]),
        ]),
      ]),
    ];
    const result = flattenTree(tree);
    expect(result).toHaveLength(5);
    expect(result.map((n) => n.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
  });
});

describe('uptimeBarColor', () => {
  it('100 → bg-success', () => {
    expect(uptimeBarColor(100)).toBe('bg-success');
  });

  it('99 → bg-success (boundary)', () => {
    expect(uptimeBarColor(99)).toBe('bg-success');
  });

  it('98 → bg-warning', () => {
    expect(uptimeBarColor(98)).toBe('bg-warning');
  });

  it('95 → bg-warning (boundary)', () => {
    expect(uptimeBarColor(95)).toBe('bg-warning');
  });

  it('94 → bg-danger', () => {
    expect(uptimeBarColor(94)).toBe('bg-danger');
  });

  it('0 → bg-danger', () => {
    expect(uptimeBarColor(0)).toBe('bg-danger');
  });
});

describe('STATUS_LABELS', () => {
  it('has exactly 4 entries', () => {
    expect(Object.keys(STATUS_LABELS)).toHaveLength(4);
  });

  it('operational → "Operational"', () => {
    expect(STATUS_LABELS['operational']).toBe('Operational');
  });

  it('degraded → "Degraded"', () => {
    expect(STATUS_LABELS['degraded']).toBe('Degraded');
  });

  it('outage → "Outage"', () => {
    expect(STATUS_LABELS['outage']).toBe('Outage');
  });

  it('empty → "No monitors"', () => {
    expect(STATUS_LABELS['empty']).toBe('No monitors');
  });
});
