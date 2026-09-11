import { describe, it, expect } from 'vitest';
import { METHODS, statusColor, hasBody } from './playgroundHelpers';

describe('playgroundHelpers', () => {
  it('METHODS has expected 5 entries in order', () => {
    expect(METHODS).toHaveLength(5);
    expect(METHODS).toEqual(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
  });

  it('statusColor returns emerald classes for 2xx', () => {
    const emerald = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    expect(statusColor(200)).toBe(emerald);
    expect(statusColor(201)).toBe(emerald);
    expect(statusColor(299)).toBe(emerald);
  });

  it('statusColor returns amber classes for 3xx', () => {
    const amber = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    expect(statusColor(301)).toBe(amber);
    expect(statusColor(302)).toBe(amber);
    expect(statusColor(399)).toBe(amber);
  });

  it('statusColor returns red classes otherwise', () => {
    const red = 'bg-red-500/20 text-red-400 border-red-500/30';
    expect(statusColor(400)).toBe(red);
    expect(statusColor(500)).toBe(red);
    expect(statusColor(100)).toBe(red);
  });

  it('hasBody returns true for POST/PUT/PATCH', () => {
    expect(hasBody('POST')).toBe(true);
    expect(hasBody('PUT')).toBe(true);
    expect(hasBody('PATCH')).toBe(true);
  });

  it('hasBody returns false for GET/DELETE', () => {
    expect(hasBody('GET')).toBe(false);
    expect(hasBody('DELETE')).toBe(false);
  });
});
