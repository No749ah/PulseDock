import { describe, it, expect } from 'vitest';
import { parsePagination, buildMeta } from './v2.types';

describe('v2.types', () => {
  describe('parsePagination', () => {
    it('returns defaults when no query params', () => {
      const result = parsePagination({});
      expect(result).toEqual({ page: 1, limit: 20, skip: 0 });
    });

    it('respects page and limit params', () => {
      const result = parsePagination({ page: 3, limit: 10 });
      expect(result).toEqual({ page: 3, limit: 10, skip: 20 });
    });

    it('clamps page to minimum 1', () => {
      const result = parsePagination({ page: -5 });
      expect(result.page).toBe(1);
    });

    it('clamps limit to minimum 1', () => {
      const result = parsePagination({ limit: 0 });
      expect(result.limit).toBe(1);
    });

    it('clamps limit to maxLimit', () => {
      const result = parsePagination({ limit: 999 });
      expect(result.limit).toBe(100);
    });

    it('accepts custom maxLimit', () => {
      const result = parsePagination({ limit: 150 }, 200);
      expect(result.limit).toBe(150);
    });

    it('accepts custom defaultLimit', () => {
      const result = parsePagination({}, 200, 50);
      expect(result.limit).toBe(50);
    });

    it('calculates skip correctly for page 1', () => {
      const result = parsePagination({ page: 1, limit: 25 });
      expect(result.skip).toBe(0);
    });

    it('calculates skip correctly for page 5 with limit 20', () => {
      const result = parsePagination({ page: 5, limit: 20 });
      expect(result.skip).toBe(80);
    });
  });

  describe('buildMeta', () => {
    it('calculates pages correctly', () => {
      const meta = buildMeta(100, 1, 20);
      expect(meta).toEqual({ total: 100, page: 1, limit: 20, pages: 5 });
    });

    it('rounds up pages for partial last page', () => {
      const meta = buildMeta(21, 1, 20);
      expect(meta).toEqual({ total: 21, page: 1, limit: 20, pages: 2 });
    });

    it('returns 0 pages for empty results', () => {
      const meta = buildMeta(0, 1, 20);
      expect(meta).toEqual({ total: 0, page: 1, limit: 20, pages: 0 });
    });

    it('returns 1 page when total equals limit', () => {
      const meta = buildMeta(20, 1, 20);
      expect(meta).toEqual({ total: 20, page: 1, limit: 20, pages: 1 });
    });

    it('returns 1 page when total is less than limit', () => {
      const meta = buildMeta(5, 1, 20);
      expect(meta).toEqual({ total: 5, page: 1, limit: 20, pages: 1 });
    });
  });
});
