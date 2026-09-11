import { describe, it, expect } from 'vitest';
import { STATUS_DOT_COLORS, statusDotColor, type LandingStatus } from './landingHelpers';

describe('STATUS_DOT_COLORS', () => {
  it('has 3 entries', () => {
    expect(Object.keys(STATUS_DOT_COLORS)).toHaveLength(3);
  });

  it('up maps to success class', () => {
    expect(STATUS_DOT_COLORS.up).toBe('bg-success');
  });

  it('warning maps to warning class', () => {
    expect(STATUS_DOT_COLORS.warning).toBe('bg-warning');
  });

  it('down maps to danger class', () => {
    expect(STATUS_DOT_COLORS.down).toBe('bg-danger');
  });
});

describe('statusDotColor', () => {
  const statuses: LandingStatus[] = ['up', 'warning', 'down'];

  it.each(statuses)('returns non-empty string for status "%s"', (status) => {
    expect(statusDotColor(status).length).toBeGreaterThan(0);
  });

  it('matches STATUS_DOT_COLORS lookup', () => {
    for (const status of statuses) {
      expect(statusDotColor(status)).toBe(STATUS_DOT_COLORS[status]);
    }
  });
});
