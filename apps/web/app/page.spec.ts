import { describe, it, expect } from 'vitest';
import { STATUS_DOT_COLORS, statusDotColor } from './landingHelpers';

describe('STATUS_DOT_COLORS', () => {
  it('has exactly 3 entries', () => {
    expect(Object.keys(STATUS_DOT_COLORS)).toHaveLength(3);
  });

  it('up → bg-success', () => {
    expect(STATUS_DOT_COLORS['up']).toBe('bg-success');
  });

  it('warning → bg-warning', () => {
    expect(STATUS_DOT_COLORS['warning']).toBe('bg-warning');
  });

  it('down → bg-danger', () => {
    expect(STATUS_DOT_COLORS['down']).toBe('bg-danger');
  });
});

describe('statusDotColor', () => {
  it('returns correct class for "up"', () => {
    expect(statusDotColor('up')).toBe('bg-success');
  });

  it('returns correct class for "warning"', () => {
    expect(statusDotColor('warning')).toBe('bg-warning');
  });

  it('returns correct class for "down"', () => {
    expect(statusDotColor('down')).toBe('bg-danger');
  });
});
