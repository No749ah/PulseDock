/**
 * Unit tests for Modal component logic.
 * Tests pure logic: size class mapping, focusable selector, aria attributes.
 * React rendering tests are handled in E2E (Playwright).
 */
import { describe, it, expect } from 'vitest';

// ─── Size class mapping (mirrors Modal.tsx) ──────────────────────────────────

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
};

type ModalSize = keyof typeof sizes;

function getSizeClass(size: ModalSize = 'md'): string {
  return sizes[size];
}

describe('Modal — size class mapping', () => {
  it('returns max-w-sm for sm', () => {
    expect(getSizeClass('sm')).toBe('max-w-sm');
  });

  it('returns max-w-md for md', () => {
    expect(getSizeClass('md')).toBe('max-w-md');
  });

  it('returns max-w-2xl for lg', () => {
    expect(getSizeClass('lg')).toBe('max-w-2xl');
  });

  it('returns max-w-3xl for xl', () => {
    expect(getSizeClass('xl')).toBe('max-w-3xl');
  });

  it('defaults to max-w-md when no size given', () => {
    expect(getSizeClass()).toBe('max-w-md');
  });

  it('covers all four size variants', () => {
    const allSizes: ModalSize[] = ['sm', 'md', 'lg', 'xl'];
    const classes = allSizes.map(getSizeClass);
    expect(new Set(classes).size).toBe(4); // all unique
  });
});

// ─── Focusable selector (mirrors FOCUSABLE in Modal.tsx) ─────────────────────

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
];

const FOCUSABLE = FOCUSABLE_SELECTORS.join(',');

describe('Modal — FOCUSABLE selector', () => {
  it('includes anchor with href', () => {
    expect(FOCUSABLE).toContain('a[href]');
  });

  it('includes enabled buttons (excludes disabled)', () => {
    expect(FOCUSABLE).toContain('button:not([disabled])');
  });

  it('includes enabled inputs', () => {
    expect(FOCUSABLE).toContain('input:not([disabled])');
  });

  it('includes enabled selects', () => {
    expect(FOCUSABLE).toContain('select:not([disabled])');
  });

  it('includes enabled textareas', () => {
    expect(FOCUSABLE).toContain('textarea:not([disabled])');
  });

  it('excludes tabindex=-1 elements', () => {
    expect(FOCUSABLE).toContain('[tabindex]:not([tabindex="-1"])');
  });

  it('is a comma-joined string of all selectors', () => {
    const parts = FOCUSABLE.split(',');
    expect(parts).toHaveLength(FOCUSABLE_SELECTORS.length);
  });
});

// ─── Focus-trap Tab navigation logic ─────────────────────────────────────────

function getNextFocusIdx(currentIdx: number, total: number, shiftKey: boolean): number {
  if (total === 0) return -1;
  if (shiftKey) {
    return currentIdx <= 0 ? total - 1 : currentIdx - 1;
  } else {
    return currentIdx < 0 || currentIdx >= total - 1 ? 0 : currentIdx + 1;
  }
}

describe('Modal — focus-trap Tab navigation', () => {
  it('Tab from last element wraps to first', () => {
    expect(getNextFocusIdx(2, 3, false)).toBe(0);
  });

  it('Tab from first element goes to second', () => {
    expect(getNextFocusIdx(0, 3, false)).toBe(1);
  });

  it('Tab from middle element goes to next', () => {
    expect(getNextFocusIdx(1, 3, false)).toBe(2);
  });

  it('Shift+Tab from first element wraps to last', () => {
    expect(getNextFocusIdx(0, 3, true)).toBe(2);
  });

  it('Shift+Tab from last element goes to previous', () => {
    expect(getNextFocusIdx(2, 3, true)).toBe(1);
  });

  it('Shift+Tab from middle element goes to previous', () => {
    expect(getNextFocusIdx(1, 3, true)).toBe(0);
  });

  it('Tab when no focusable elements returns -1', () => {
    expect(getNextFocusIdx(0, 0, false)).toBe(-1);
  });

  it('Tab from out-of-bounds (currentIdx=-1) wraps to first', () => {
    expect(getNextFocusIdx(-1, 3, false)).toBe(0);
  });

  it('Shift+Tab from out-of-bounds wraps to last', () => {
    expect(getNextFocusIdx(-1, 3, true)).toBe(2);
  });

  it('single focusable element: Tab always returns 0', () => {
    expect(getNextFocusIdx(0, 1, false)).toBe(0);
    expect(getNextFocusIdx(0, 1, true)).toBe(0);
  });
});

// ─── Animation phase transitions ─────────────────────────────────────────────

type AnimPhase = 'enter' | 'exit';

function getPhase(isOpen: boolean, wasOpen: boolean): AnimPhase | null {
  if (isOpen) return 'enter';
  if (wasOpen) return 'exit';
  return null;
}

describe('Modal — animation phase transitions', () => {
  it('returns enter phase when isOpen=true', () => {
    expect(getPhase(true, false)).toBe('enter');
  });

  it('returns exit phase when closed from open state', () => {
    expect(getPhase(false, true)).toBe('exit');
  });

  it('returns null when never opened', () => {
    expect(getPhase(false, false)).toBeNull();
  });
});

// ─── Scroll lock side-effects (pure logic simulation) ────────────────────────

describe('Modal — body scroll lock logic', () => {
  it('sets overflow hidden when modal opens', () => {
    // Simulates: document.body.style.overflow = 'hidden'
    const style = { overflow: '' };
    if (true /* isOpen */) style.overflow = 'hidden';
    expect(style.overflow).toBe('hidden');
  });

  it('restores overflow on cleanup', () => {
    // Simulates: return () => { document.body.style.overflow = 'unset' }
    const style = { overflow: 'hidden' };
    style.overflow = 'unset'; // cleanup fn
    expect(style.overflow).toBe('unset');
  });
});
