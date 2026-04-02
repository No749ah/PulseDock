/**
 * Unit tests for MonitorsPagination pure render logic.
 * Tests visibility conditions and page boundary behaviour.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

function shouldRender(pageSize: number | 'all', totalPages: number): boolean {
  if (pageSize === 'all' || totalPages <= 1) return false;
  return true;
}

function prevPage(safePage: number): number {
  return Math.max(1, safePage - 1);
}

function nextPage(safePage: number, totalPages: number): number {
  return Math.min(totalPages, safePage + 1);
}

function prevDisabled(safePage: number): boolean {
  return safePage <= 1;
}

function nextDisabled(safePage: number, totalPages: number): boolean {
  return safePage >= totalPages;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MonitorsPagination — shouldRender', () => {
  it('hides when pageSize is "all"', () => {
    expect(shouldRender('all', 5)).toBe(false);
  });

  it('hides when totalPages is 1', () => {
    expect(shouldRender(25, 1)).toBe(false);
  });

  it('hides when totalPages is 0', () => {
    expect(shouldRender(25, 0)).toBe(false);
  });

  it('shows when pageSize is a number and totalPages > 1', () => {
    expect(shouldRender(25, 2)).toBe(true);
    expect(shouldRender(10, 10)).toBe(true);
  });
});

describe('MonitorsPagination — prevPage', () => {
  it('decrements page', () => {
    expect(prevPage(3)).toBe(2);
    expect(prevPage(5)).toBe(4);
  });

  it('clamps at 1', () => {
    expect(prevPage(1)).toBe(1);
    expect(prevPage(0)).toBe(1);
  });
});

describe('MonitorsPagination — nextPage', () => {
  it('increments page', () => {
    expect(nextPage(1, 5)).toBe(2);
    expect(nextPage(3, 5)).toBe(4);
  });

  it('clamps at totalPages', () => {
    expect(nextPage(5, 5)).toBe(5);
    expect(nextPage(6, 5)).toBe(5);
  });
});

describe('MonitorsPagination — prevDisabled', () => {
  it('is disabled on page 1', () => {
    expect(prevDisabled(1)).toBe(true);
  });

  it('is enabled beyond page 1', () => {
    expect(prevDisabled(2)).toBe(false);
    expect(prevDisabled(10)).toBe(false);
  });
});

describe('MonitorsPagination — nextDisabled', () => {
  it('is disabled on last page', () => {
    expect(nextDisabled(5, 5)).toBe(true);
    expect(nextDisabled(10, 10)).toBe(true);
  });

  it('is enabled before last page', () => {
    expect(nextDisabled(1, 5)).toBe(false);
    expect(nextDisabled(4, 5)).toBe(false);
  });
});
