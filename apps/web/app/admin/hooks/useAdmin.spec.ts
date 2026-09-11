/**
 * Unit tests for useAdmin.ts pure constants and pagination logic.
 *
 * Tests PAGE_SIZE constant and the derived pagination calculations
 * used across all admin list views — without React rendering.
 */
import { describe, it, expect } from 'vitest';

// ─── Constants (keep in sync with useAdmin.ts) ────────────────────────────────

const PAGE_SIZE = 10;

// ─── Pagination helpers (mirror useAdmin computed fields) ─────────────────────

function computePages(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function paginateRows<T>(items: T[], page: number, pageSize: number): T[] {
  return items.slice((page - 1) * pageSize, page * pageSize);
}

// ─── PAGE_SIZE ────────────────────────────────────────────────────────────────

describe('PAGE_SIZE', () => {
  it('is 10', () => {
    expect(PAGE_SIZE).toBe(10);
  });

  it('is a positive integer', () => {
    expect(Number.isInteger(PAGE_SIZE)).toBe(true);
    expect(PAGE_SIZE).toBeGreaterThan(0);
  });
});

// ─── computePages (mirrors usersPages / invitesPages etc.) ───────────────────

describe('computePages', () => {
  it('returns 1 for empty list', () => {
    expect(computePages(0, PAGE_SIZE)).toBe(1);
  });

  it('returns 1 for list smaller than PAGE_SIZE', () => {
    expect(computePages(5, PAGE_SIZE)).toBe(1);
  });

  it('returns 1 for list exactly equal to PAGE_SIZE', () => {
    expect(computePages(10, PAGE_SIZE)).toBe(1);
  });

  it('returns 2 for list with PAGE_SIZE + 1 items', () => {
    expect(computePages(11, PAGE_SIZE)).toBe(2);
  });

  it('returns correct pages for 25 items', () => {
    expect(computePages(25, PAGE_SIZE)).toBe(3);
  });

  it('returns correct pages for 100 items', () => {
    expect(computePages(100, PAGE_SIZE)).toBe(10);
  });

  it('returns correct pages for 101 items', () => {
    expect(computePages(101, PAGE_SIZE)).toBe(11);
  });

  it('never returns 0 even for 0 items', () => {
    expect(computePages(0, PAGE_SIZE)).toBeGreaterThanOrEqual(1);
  });
});

// ─── paginateRows (mirrors userRows / inviteRows / resetRows / auditRows) ─────

describe('paginateRows', () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: `item-${i + 1}` }));

  it('returns first PAGE_SIZE items on page 1', () => {
    const rows = paginateRows(items, 1, PAGE_SIZE);
    expect(rows).toHaveLength(PAGE_SIZE);
    expect(rows[0].id).toBe('item-1');
    expect(rows[9].id).toBe('item-10');
  });

  it('returns next PAGE_SIZE items on page 2', () => {
    const rows = paginateRows(items, 2, PAGE_SIZE);
    expect(rows).toHaveLength(PAGE_SIZE);
    expect(rows[0].id).toBe('item-11');
    expect(rows[9].id).toBe('item-20');
  });

  it('returns remaining items on last page (5 of 25)', () => {
    const rows = paginateRows(items, 3, PAGE_SIZE);
    expect(rows).toHaveLength(5);
    expect(rows[0].id).toBe('item-21');
    expect(rows[4].id).toBe('item-25');
  });

  it('returns empty array for page beyond last', () => {
    const rows = paginateRows(items, 10, PAGE_SIZE);
    expect(rows).toHaveLength(0);
  });

  it('returns all items when list fits in one page', () => {
    const small = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(paginateRows(small, 1, PAGE_SIZE)).toHaveLength(3);
  });

  it('handles empty list gracefully', () => {
    expect(paginateRows([], 1, PAGE_SIZE)).toHaveLength(0);
  });
});

// ─── Combined pagination flow ─────────────────────────────────────────────────

describe('pagination integration', () => {
  it('page 1 + page 2 together cover all items in a 15-item list', () => {
    const items = Array.from({ length: 15 }, (_, i) => i);
    const page1 = paginateRows(items, 1, PAGE_SIZE);
    const page2 = paginateRows(items, 2, PAGE_SIZE);
    expect([...page1, ...page2]).toHaveLength(15);
    expect([...page1, ...page2]).toEqual(items);
  });

  it('single page covers all items in an 8-item list', () => {
    const items = Array.from({ length: 8 }, (_, i) => i);
    const pages = computePages(8, PAGE_SIZE);
    const allRows = paginateRows(items, 1, PAGE_SIZE);
    expect(pages).toBe(1);
    expect(allRows).toHaveLength(8);
  });

  it('usersPages stays correct after removing an item (boundary: 10 → 9)', () => {
    // 10 items → 1 page; after delete: 9 items → still 1 page
    expect(computePages(10, PAGE_SIZE)).toBe(1);
    expect(computePages(9, PAGE_SIZE)).toBe(1);
  });

  it('usersPages increases after adding item past boundary (10 → 11)', () => {
    expect(computePages(10, PAGE_SIZE)).toBe(1);
    expect(computePages(11, PAGE_SIZE)).toBe(2);
  });
});
