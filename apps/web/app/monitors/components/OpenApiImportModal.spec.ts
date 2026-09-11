import { describe, it, expect } from 'vitest';
import { METHOD_COLORS } from './openApiImportHelpers';

describe('METHOD_COLORS', () => {
  it('has exactly 6 HTTP method entries', () => {
    expect(Object.keys(METHOD_COLORS)).toHaveLength(6);
  });

  it('GET maps to blue classes', () => {
    expect(METHOD_COLORS['GET']).toContain('blue');
  });

  it('POST maps to green classes', () => {
    expect(METHOD_COLORS['POST']).toContain('green');
  });

  it('PUT maps to amber classes', () => {
    expect(METHOD_COLORS['PUT']).toContain('amber');
  });

  it('DELETE maps to red classes', () => {
    expect(METHOD_COLORS['DELETE']).toContain('red');
  });

  it('PATCH maps to purple classes', () => {
    expect(METHOD_COLORS['PATCH']).toContain('purple');
  });

  it('HEAD maps to slate classes', () => {
    expect(METHOD_COLORS['HEAD']).toContain('slate');
  });

  it('unknown method returns undefined', () => {
    expect(METHOD_COLORS['UNKNOWN']).toBeUndefined();
  });

  it('each value contains bg, text and border segments', () => {
    for (const [, cls] of Object.entries(METHOD_COLORS)) {
      expect(cls).toMatch(/bg-/);
      expect(cls).toMatch(/text-/);
      expect(cls).toMatch(/border-/);
    }
  });
});
