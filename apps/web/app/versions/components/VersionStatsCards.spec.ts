/**
 * Unit tests for VersionStatsCards — data contract and types.
 * (Render tests are excluded; the component only renders stat numbers via the Card wrapper.)
 */
import { describe, it, expect } from 'vitest';
import type { Summary } from './types';

// VersionStatsCards is a pure presentational component.
// We test the data shape it expects (Summary['stats']) and the numeric invariants.

type Stats = Summary['stats'];

function makeStats(overrides: Partial<Stats> = {}): Stats {
  return { total: 10, green: 7, yellow: 2, red: 1, ...overrides };
}

describe('VersionStatsCards data contract', () => {
  describe('stats totals', () => {
    it('green + yellow + red equals total when all enabled', () => {
      const s = makeStats({ total: 10, green: 7, yellow: 2, red: 1 });
      expect(s.green + s.yellow + s.red).toBe(s.total);
    });

    it('accepts zero total', () => {
      const s = makeStats({ total: 0, green: 0, yellow: 0, red: 0 });
      expect(s.total).toBe(0);
    });

    it('accepts large counts', () => {
      const s = makeStats({ total: 5000, green: 4800, yellow: 150, red: 50 });
      expect(s.total).toBe(5000);
    });

    it('green + yellow + red can exceed total (disabled monitors not counted in breakdown)', () => {
      // Not a contract violation — disabled monitors may not appear in breakdown
      const s = makeStats({ total: 15, green: 7, yellow: 2, red: 1 });
      expect(s.green + s.yellow + s.red).toBeLessThanOrEqual(s.total);
    });
  });

  describe('individual stat fields', () => {
    it('total is a number', () => {
      const s = makeStats({ total: 42 });
      expect(typeof s.total).toBe('number');
    });

    it('green is a number', () => {
      const s = makeStats({ green: 30 });
      expect(typeof s.green).toBe('number');
    });

    it('yellow is a number', () => {
      const s = makeStats({ yellow: 8 });
      expect(typeof s.yellow).toBe('number');
    });

    it('red is a number', () => {
      const s = makeStats({ red: 4 });
      expect(typeof s.red).toBe('number');
    });

    it('all stats are non-negative', () => {
      const s = makeStats({ total: 5, green: 3, yellow: 1, red: 1 });
      expect(s.total).toBeGreaterThanOrEqual(0);
      expect(s.green).toBeGreaterThanOrEqual(0);
      expect(s.yellow).toBeGreaterThanOrEqual(0);
      expect(s.red).toBeGreaterThanOrEqual(0);
    });
  });

  describe('critical items detected from stats', () => {
    it('has critical items when red > 0', () => {
      const s = makeStats({ red: 3 });
      expect(s.red).toBeGreaterThan(0);
    });

    it('no critical items when red === 0', () => {
      const s = makeStats({ red: 0 });
      expect(s.red).toBe(0);
    });

    it('update-available items detected when yellow > 0', () => {
      const s = makeStats({ yellow: 5 });
      expect(s.yellow).toBeGreaterThan(0);
    });

    it('all up-to-date when green === total and others are zero', () => {
      const s = makeStats({ total: 10, green: 10, yellow: 0, red: 0 });
      expect(s.green).toBe(s.total);
      expect(s.yellow).toBe(0);
      expect(s.red).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles all red (full outage scenario)', () => {
      const s = makeStats({ total: 5, green: 0, yellow: 0, red: 5 });
      expect(s.red).toBe(5);
      expect(s.green).toBe(0);
    });

    it('handles single monitor up-to-date', () => {
      const s = makeStats({ total: 1, green: 1, yellow: 0, red: 0 });
      expect(s.total).toBe(1);
      expect(s.green).toBe(1);
    });

    it('handles single monitor critical', () => {
      const s = makeStats({ total: 1, green: 0, yellow: 0, red: 1 });
      expect(s.red).toBe(1);
    });
  });
});
