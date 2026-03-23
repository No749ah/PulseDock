import { describe, it, expect } from 'vitest';
import { spacing, typography, statusBadge, channelColors, surfaces, buttonClasses, sizes, statusDot, chartColors } from './design-tokens';

describe('design tokens', () => {
  describe('spacing', () => {
    it('uses Tailwind padding classes', () => {
      expect(spacing.cardPadding).toBe('p-6');
      expect(spacing.cardPaddingSm).toBe('p-4');
    });

    it('has gap utilities', () => {
      expect(spacing.sectionGap).toContain('gap-');
    });
  });

  describe('typography', () => {
    it('section heading includes text size and weight', () => {
      expect(typography.sectionHeading).toContain('text-lg');
      expect(typography.sectionHeading).toContain('font-semibold');
    });

    it('mono includes font-mono', () => {
      expect(typography.mono).toContain('font-mono');
    });

    it('all typography values are non-empty strings', () => {
      for (const [key, value] of Object.entries(typography)) {
        expect(value, `typography.${key}`).toBeTruthy();
        expect(typeof value).toBe('string');
      }
    });
  });

  describe('statusBadge', () => {
    it('has all status types', () => {
      expect(statusBadge).toHaveProperty('up');
      expect(statusBadge).toHaveProperty('down');
      expect(statusBadge).toHaveProperty('degraded');
      expect(statusBadge).toHaveProperty('paused');
      expect(statusBadge).toHaveProperty('pending');
    });

    it('all badges have rounded-full class', () => {
      for (const [key, value] of Object.entries(statusBadge)) {
        expect(value, `statusBadge.${key}`).toContain('rounded-full');
      }
    });
  });

  describe('channelColors', () => {
    it('covers all alert channel types', () => {
      const expected = ['email', 'slack', 'discord', 'telegram', 'webhook', 'pagerduty'];
      for (const type of expected) {
        expect(channelColors).toHaveProperty(type);
      }
    });
  });

  describe('surfaces', () => {
    it('card has border and rounded classes', () => {
      expect(surfaces.card).toContain('rounded-');
      expect(surfaces.card).toContain('border');
    });

    it('cardHover has transition', () => {
      expect(surfaces.cardHover).toContain('transition');
    });

    it('input has focus ring', () => {
      expect(surfaces.input).toContain('focus:ring');
    });
  });

  describe('buttonClasses', () => {
    it('all buttons have active:scale', () => {
      for (const key of ['primary', 'secondary', 'danger'] as const) {
        expect(buttonClasses[key]).toContain('active:scale');
      }
    });

    it('primary has bg-accent', () => {
      expect(buttonClasses.primary).toContain('bg-accent');
    });

    it('danger has danger colors', () => {
      expect(buttonClasses.danger).toContain('danger');
    });
  });

  describe('sizes', () => {
    it('has xs through lg', () => {
      expect(sizes).toHaveProperty('xs');
      expect(sizes).toHaveProperty('sm');
      expect(sizes).toHaveProperty('md');
      expect(sizes).toHaveProperty('lg');
    });
  });

  describe('statusDot', () => {
    it('up is success color', () => {
      expect(statusDot.up).toContain('success');
    });
    it('down is danger color', () => {
      expect(statusDot.down).toContain('danger');
    });
  });

  describe('chartColors', () => {
    it('all values are valid hex colors', () => {
      for (const [key, value] of Object.entries(chartColors)) {
        expect(value, `chartColors.${key}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });
});
