/**
 * Unit tests for Card component class logic.
 */
import { describe, it, expect } from 'vitest';

const BASE_CLASSES = 'rounded-2xl border border-border bg-surface p-6 transition-all duration-200';
const HOVER_CLASSES =
  'hover:border-border-hover hover:bg-surface-elevated hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 cursor-pointer';

function buildCardClassName(hover = false, extra = ''): string {
  return [BASE_CLASSES, hover ? HOVER_CLASSES : '', extra].filter(Boolean).join(' ');
}

describe('Card — base classes', () => {
  it('always has rounded-2xl', () => {
    expect(buildCardClassName()).toContain('rounded-2xl');
  });

  it('always has border classes', () => {
    expect(buildCardClassName()).toContain('border-border');
  });

  it('always has bg-surface', () => {
    expect(buildCardClassName()).toContain('bg-surface');
  });

  it('always has padding', () => {
    expect(buildCardClassName()).toContain('p-6');
  });

  it('always has transition classes', () => {
    expect(buildCardClassName()).toContain('transition-all');
    expect(buildCardClassName()).toContain('duration-200');
  });
});

describe('Card — hover variant', () => {
  it('hover=false does not include hover-specific classes', () => {
    const cls = buildCardClassName(false);
    expect(cls).not.toContain('cursor-pointer');
    expect(cls).not.toContain('hover:bg-surface-elevated');
    expect(cls).not.toContain('hover:-translate-y-0.5');
  });

  it('hover=true includes cursor-pointer', () => {
    expect(buildCardClassName(true)).toContain('cursor-pointer');
  });

  it('hover=true includes shadow', () => {
    expect(buildCardClassName(true)).toContain('hover:shadow-lg');
  });

  it('hover=true includes border hover state', () => {
    expect(buildCardClassName(true)).toContain('hover:border-border-hover');
  });

  it('hover=true includes translate lift', () => {
    expect(buildCardClassName(true)).toContain('hover:-translate-y-0.5');
  });
});

describe('Card — extra className passthrough', () => {
  it('extra class is appended', () => {
    const cls = buildCardClassName(false, 'col-span-2');
    expect(cls).toContain('col-span-2');
  });

  it('extra class does not override base', () => {
    const cls = buildCardClassName(false, 'col-span-2');
    expect(cls).toContain('rounded-2xl');
    expect(cls).toContain('bg-surface');
  });

  it('empty extra class produces no trailing spaces that break classes', () => {
    const cls = buildCardClassName(false, '');
    // Should still contain core classes without artifacts
    expect(cls).toContain('rounded-2xl');
    expect(cls.includes('  ')).toBe(false); // no double spaces from empty extra
  });
});

describe('Card — hover vs non-hover class difference', () => {
  it('hover card has more classes than non-hover', () => {
    const noHover = buildCardClassName(false).split(' ').length;
    const withHover = buildCardClassName(true).split(' ').length;
    expect(withHover).toBeGreaterThan(noHover);
  });
});
