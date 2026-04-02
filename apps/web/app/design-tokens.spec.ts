/**
 * Unit tests for design-tokens.ts
 *
 * Verifies that all exported design token constants:
 * - Are non-empty strings
 * - Contain the expected Tailwind class fragments
 * - Are internally consistent (banners follow the same pattern, etc.)
 */
import { describe, it, expect } from 'vitest';
import {
  HEADING_PRIMARY,
  HEADING_LABEL,
  STAT_NUMBER,
  CARD_BASE,
  CARD_HOVER,
  CARD_COMPACT,
  ICON_CONTAINER,
  BUTTON_INLINE,
  BADGE_BASE,
  BANNER_DANGER,
  BANNER_SUCCESS,
  BANNER_WARNING,
} from './design-tokens';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasClass(token: string, cls: string): boolean {
  return token.split(' ').some((t) => t === cls || t.startsWith(cls + '/') || t.startsWith(cls));
}

// ─── Typography tokens ────────────────────────────────────────────────────────

describe('design-tokens — HEADING_PRIMARY', () => {
  it('is a non-empty string', () => {
    expect(typeof HEADING_PRIMARY).toBe('string');
    expect(HEADING_PRIMARY.length).toBeGreaterThan(0);
  });
  it('contains text-xl for large headings', () => {
    expect(HEADING_PRIMARY).toContain('text-xl');
  });
  it('contains font-bold', () => {
    expect(HEADING_PRIMARY).toContain('font-bold');
  });
  it('uses primary text color', () => {
    expect(HEADING_PRIMARY).toContain('text-text-primary');
  });
});

describe('design-tokens — HEADING_LABEL', () => {
  it('is a non-empty string', () => {
    expect(HEADING_LABEL.length).toBeGreaterThan(0);
  });
  it('contains text-sm for small labels', () => {
    expect(HEADING_LABEL).toContain('text-sm');
  });
  it('contains uppercase', () => {
    expect(HEADING_LABEL).toContain('uppercase');
  });
  it('contains tracking-wide for letter spacing', () => {
    expect(HEADING_LABEL).toContain('tracking-wide');
  });
  it('uses secondary text color', () => {
    expect(HEADING_LABEL).toContain('text-text-secondary');
  });
});

describe('design-tokens — STAT_NUMBER', () => {
  it('is a non-empty string', () => {
    expect(STAT_NUMBER.length).toBeGreaterThan(0);
  });
  it('contains text-3xl for large stat numbers', () => {
    expect(STAT_NUMBER).toContain('text-3xl');
  });
  it('contains font-bold', () => {
    expect(STAT_NUMBER).toContain('font-bold');
  });
  it('contains tabular-nums for digit alignment', () => {
    expect(STAT_NUMBER).toContain('tabular-nums');
  });
});

// ─── Card tokens ──────────────────────────────────────────────────────────────

describe('design-tokens — CARD_BASE', () => {
  it('contains rounded-2xl', () => {
    expect(CARD_BASE).toContain('rounded-2xl');
  });
  it('contains border class', () => {
    expect(CARD_BASE).toContain('border');
  });
  it('uses bg-surface', () => {
    expect(CARD_BASE).toContain('bg-surface');
  });
  it('contains padding', () => {
    expect(CARD_BASE).toContain('p-6');
  });
  it('contains transition', () => {
    expect(CARD_BASE).toContain('transition');
  });
});

describe('design-tokens — CARD_HOVER', () => {
  it('is non-empty', () => {
    expect(CARD_HOVER.length).toBeGreaterThan(0);
  });
  it('contains hover: prefix classes', () => {
    expect(CARD_HOVER).toContain('hover:');
  });
  it('contains cursor-pointer', () => {
    expect(CARD_HOVER).toContain('cursor-pointer');
  });
  it('contains hover shadow', () => {
    expect(CARD_HOVER).toContain('hover:shadow');
  });
});

describe('design-tokens — CARD_COMPACT', () => {
  it('contains rounded-2xl like CARD_BASE', () => {
    expect(CARD_COMPACT).toContain('rounded-2xl');
  });
  it('uses p-4 (smaller padding than CARD_BASE p-6)', () => {
    expect(CARD_COMPACT).toContain('p-4');
  });
  it('uses bg-surface', () => {
    expect(CARD_COMPACT).toContain('bg-surface');
  });
  it('contains border', () => {
    expect(CARD_COMPACT).toContain('border');
  });
  it('is different from CARD_BASE', () => {
    expect(CARD_COMPACT).not.toBe(CARD_BASE);
  });
});

// ─── Icon container ───────────────────────────────────────────────────────────

describe('design-tokens — ICON_CONTAINER', () => {
  it('is non-empty', () => {
    expect(ICON_CONTAINER.length).toBeGreaterThan(0);
  });
  it('contains padding class', () => {
    expect(ICON_CONTAINER).toContain('p-');
  });
  it('contains rounded class', () => {
    expect(ICON_CONTAINER).toContain('rounded');
  });
});

// ─── Button ───────────────────────────────────────────────────────────────────

describe('design-tokens — BUTTON_INLINE', () => {
  it('is non-empty', () => {
    expect(BUTTON_INLINE.length).toBeGreaterThan(0);
  });
  it('uses flex layout', () => {
    expect(BUTTON_INLINE).toContain('flex');
  });
  it('has gap class', () => {
    expect(BUTTON_INLINE).toContain('gap-');
  });
  it('has text-xs for small inline buttons', () => {
    expect(BUTTON_INLINE).toContain('text-xs');
  });
  it('has hover transition', () => {
    expect(BUTTON_INLINE).toContain('transition');
  });
  it('has border class', () => {
    expect(BUTTON_INLINE).toContain('border');
  });
});

// ─── Badge ────────────────────────────────────────────────────────────────────

describe('design-tokens — BADGE_BASE', () => {
  it('is non-empty', () => {
    expect(BADGE_BASE.length).toBeGreaterThan(0);
  });
  it('uses inline-flex', () => {
    expect(BADGE_BASE).toContain('inline-flex');
  });
  it('uses rounded-full for pill shape', () => {
    expect(BADGE_BASE).toContain('rounded-full');
  });
  it('has padding', () => {
    expect(BADGE_BASE).toContain('px-');
  });
  it('uses text-xs', () => {
    expect(BADGE_BASE).toContain('text-xs');
  });
  it('uses font-semibold', () => {
    expect(BADGE_BASE).toContain('font-semibold');
  });
});

// ─── Banners ──────────────────────────────────────────────────────────────────

describe('design-tokens — banner tokens', () => {
  const banners = [
    { name: 'BANNER_DANGER', token: BANNER_DANGER, colorKey: 'danger' },
    { name: 'BANNER_SUCCESS', token: BANNER_SUCCESS, colorKey: 'success' },
    { name: 'BANNER_WARNING', token: BANNER_WARNING, colorKey: 'warning' },
  ];

  for (const { name, token, colorKey } of banners) {
    it(`${name} is non-empty`, () => {
      expect(token.length).toBeGreaterThan(0);
    });

    it(`${name} uses flex layout`, () => {
      expect(token).toContain('flex');
    });

    it(`${name} contains semantic color (${colorKey})`, () => {
      expect(token).toContain(colorKey);
    });

    it(`${name} has rounded class`, () => {
      expect(token).toContain('rounded');
    });

    it(`${name} has border class`, () => {
      expect(token).toContain('border');
    });
  }

  it('all three banners use different colors', () => {
    expect(BANNER_DANGER).not.toBe(BANNER_SUCCESS);
    expect(BANNER_SUCCESS).not.toBe(BANNER_WARNING);
    expect(BANNER_DANGER).not.toBe(BANNER_WARNING);
  });

  it('all banners follow the same structural pattern (flex + gap + padding + rounded + border)', () => {
    for (const token of [BANNER_DANGER, BANNER_SUCCESS, BANNER_WARNING]) {
      expect(token).toContain('flex');
      expect(token).toContain('gap-');
      expect(token).toContain('p-');
      expect(token).toContain('rounded');
      expect(token).toContain('border');
    }
  });
});
