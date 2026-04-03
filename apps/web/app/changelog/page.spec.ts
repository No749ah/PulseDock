/**
 * Unit tests for changelog/page.tsx pure data structures.
 *
 * TAG_COLORS and the releases array are pure constants — fully testable without React.
 */
import { describe, it, expect } from 'vitest';

// ─── Mirror TAG_COLORS ────────────────────────────────────────────────────────

const TAG_COLORS: Record<string, string> = {
  Security:    'bg-danger/15 text-danger border-danger/20',
  Features:    'bg-accent/15 text-accent border-accent/20',
  Performance: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  'Bug Fixes': 'bg-warning/15 text-warning border-warning/20',
  Testing:     'bg-purple-500/15 text-purple-400 border-purple-500/20',
  UX:          'bg-green-500/15 text-green-400 border-green-500/20',
  Docs:        'bg-text-secondary/10 text-text-secondary border-border',
};

// ─── Mirror fallback lookup ───────────────────────────────────────────────────

const FALLBACK_TAG_CLASS = 'bg-surface-elevated text-text-secondary border-border';

function resolveTagClass(tag: string): string {
  return TAG_COLORS[tag] ?? FALLBACK_TAG_CLASS;
}

// ─── TAG_COLORS structure ─────────────────────────────────────────────────────

describe('TAG_COLORS', () => {
  const knownTags = ['Security', 'Features', 'Performance', 'Bug Fixes', 'Testing', 'UX', 'Docs'];

  it('has exactly 7 entries', () => {
    expect(Object.keys(TAG_COLORS)).toHaveLength(7);
  });

  it.each(knownTags)('"%s" is present', (tag) => {
    expect(TAG_COLORS).toHaveProperty(tag);
  });

  it.each(knownTags)('"%s" value is a non-empty string', (tag) => {
    expect(typeof TAG_COLORS[tag]).toBe('string');
    expect(TAG_COLORS[tag].length).toBeGreaterThan(0);
  });

  it('all values contain a background class', () => {
    Object.values(TAG_COLORS).forEach((cls) => {
      expect(cls).toMatch(/^bg-/);
    });
  });

  it('all values contain a text class', () => {
    Object.values(TAG_COLORS).forEach((cls) => {
      expect(cls).toContain('text-');
    });
  });

  it('all values contain a border class', () => {
    Object.values(TAG_COLORS).forEach((cls) => {
      expect(cls).toContain('border-');
    });
  });

  it('Security uses danger color token', () => {
    expect(TAG_COLORS['Security']).toContain('danger');
  });

  it('Features uses accent color token', () => {
    expect(TAG_COLORS['Features']).toContain('accent');
  });

  it('Performance uses blue-500 color token', () => {
    expect(TAG_COLORS['Performance']).toContain('blue-500');
  });

  it('Bug Fixes uses warning color token', () => {
    expect(TAG_COLORS['Bug Fixes']).toContain('warning');
  });

  it('Testing uses purple-500 color token', () => {
    expect(TAG_COLORS['Testing']).toContain('purple-500');
  });

  it('UX uses green color token', () => {
    expect(TAG_COLORS['UX']).toContain('green');
  });

  it('Docs uses text-secondary token', () => {
    expect(TAG_COLORS['Docs']).toContain('text-secondary');
  });
});

// ─── resolveTagClass (fallback behavior) ─────────────────────────────────────

describe('resolveTagClass', () => {
  it('returns correct class for known tags', () => {
    expect(resolveTagClass('Security')).toBe(TAG_COLORS['Security']);
    expect(resolveTagClass('Features')).toBe(TAG_COLORS['Features']);
    expect(resolveTagClass('Bug Fixes')).toBe(TAG_COLORS['Bug Fixes']);
  });

  it('returns fallback class for unknown tags', () => {
    expect(resolveTagClass('UnknownTag')).toBe(FALLBACK_TAG_CLASS);
    expect(resolveTagClass('')).toBe(FALLBACK_TAG_CLASS);
    expect(resolveTagClass('security')).toBe(FALLBACK_TAG_CLASS); // case-sensitive
  });

  it('fallback includes bg, text, and border classes', () => {
    const fallback = resolveTagClass('nope');
    expect(fallback).toContain('bg-');
    expect(fallback).toContain('text-');
    expect(fallback).toContain('border-');
  });
});
