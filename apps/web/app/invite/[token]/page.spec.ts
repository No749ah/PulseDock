import { describe, it, expect } from 'vitest';
import { ROLE_COLORS, ROLE_DESC } from './helpers';

describe('ROLE_COLORS', () => {
  it('has exactly 4 entries', () => {
    expect(Object.keys(ROLE_COLORS)).toHaveLength(4);
  });

  it('OWNER → yellow', () => {
    expect(ROLE_COLORS['OWNER']).toContain('yellow');
  });

  it('ADMIN → purple', () => {
    expect(ROLE_COLORS['ADMIN']).toContain('purple');
  });

  it('EDITOR → blue', () => {
    expect(ROLE_COLORS['EDITOR']).toContain('blue');
  });

  it('VIEWER → slate', () => {
    expect(ROLE_COLORS['VIEWER']).toContain('slate');
  });

  it('UNKNOWN → undefined', () => {
    expect(ROLE_COLORS['UNKNOWN']).toBeUndefined();
  });
});

describe('ROLE_DESC', () => {
  it('has exactly 4 entries', () => {
    expect(Object.keys(ROLE_DESC)).toHaveLength(4);
  });

  it('each value is a non-empty string', () => {
    for (const val of Object.values(ROLE_DESC)) {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    }
  });

  it('OWNER contains "Full control"', () => {
    expect(ROLE_DESC['OWNER']).toContain('Full control');
  });

  it('VIEWER contains "Read-only"', () => {
    expect(ROLE_DESC['VIEWER']).toContain('Read-only');
  });
});
