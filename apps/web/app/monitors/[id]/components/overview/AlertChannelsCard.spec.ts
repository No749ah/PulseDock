import { describe, it, expect } from 'vitest';
import { TYPE_COLORS, NOTIFY_LABELS } from './alertChannelsCardHelpers';

describe('TYPE_COLORS', () => {
  it('has exactly 5 entries', () => {
    expect(Object.keys(TYPE_COLORS)).toHaveLength(5);
  });

  it('email maps to yellow classes', () => {
    expect(TYPE_COLORS['email']).toContain('yellow');
  });

  it('slack maps to green classes', () => {
    expect(TYPE_COLORS['slack']).toContain('green');
  });

  it('discord maps to indigo classes', () => {
    expect(TYPE_COLORS['discord']).toContain('indigo');
  });

  it('webhook maps to blue classes', () => {
    expect(TYPE_COLORS['webhook']).toContain('blue');
  });

  it('telegram maps to sky classes', () => {
    expect(TYPE_COLORS['telegram']).toContain('sky');
  });

  it('unknown key returns undefined', () => {
    expect(TYPE_COLORS['unknown']).toBeUndefined();
  });
});

describe('NOTIFY_LABELS', () => {
  it('has exactly 6 entries', () => {
    expect(Object.keys(NOTIFY_LABELS)).toHaveLength(6);
  });

  it('ON_CHANGE → "On change"', () => {
    expect(NOTIFY_LABELS['ON_CHANGE']).toBe('On change');
  });

  it('ALWAYS → "Always"', () => {
    expect(NOTIFY_LABELS['ALWAYS']).toBe('Always');
  });

  it('VERSION_MAJOR → "Major only"', () => {
    expect(NOTIFY_LABELS['VERSION_MAJOR']).toBe('Major only');
  });

  it('UNKNOWN key → undefined', () => {
    expect(NOTIFY_LABELS['UNKNOWN']).toBeUndefined();
  });
});
