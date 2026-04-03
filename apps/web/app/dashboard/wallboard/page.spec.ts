/**
 * Unit tests for dashboard/wallboard/page.tsx pure helper functions.
 *
 * Covers:
 *   statusOrder — maps monitor level string to sort priority (lower = higher priority)
 */
import { describe, it, expect } from 'vitest';

// ── Inline copy of helper (same logic as page.tsx) ────────────────────────────

function statusOrder(level: string): number {
  if (level === 'red') return 0;
  if (level === 'yellow') return 1;
  if (level === 'green') return 2;
  return 3; // unknown
}

// ─── statusOrder ──────────────────────────────────────────────────────────────

describe('statusOrder (wallboard)', () => {
  it('red → 0 (highest priority)', () => {
    expect(statusOrder('red')).toBe(0);
  });

  it('yellow → 1 (degraded)', () => {
    expect(statusOrder('yellow')).toBe(1);
  });

  it('green → 2 (operational)', () => {
    expect(statusOrder('green')).toBe(2);
  });

  it('unknown → 3 (lowest priority)', () => {
    expect(statusOrder('unknown')).toBe(3);
  });

  it('empty string → 3 (falls through to unknown)', () => {
    expect(statusOrder('')).toBe(3);
  });

  it('unrecognized value → 3', () => {
    expect(statusOrder('purple')).toBe(3);
  });

  it('priority order: red < yellow < green < unknown', () => {
    const levels = ['green', 'unknown', 'red', 'yellow'];
    const sorted = [...levels].sort((a, b) => statusOrder(a) - statusOrder(b));
    expect(sorted).toEqual(['red', 'yellow', 'green', 'unknown']);
  });

  it('all distinct priorities', () => {
    const priorities = ['red', 'yellow', 'green', 'unknown'].map(statusOrder);
    const unique = new Set(priorities);
    expect(unique.size).toBe(4);
  });
});
