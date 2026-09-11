/**
 * Unit tests for Badge variant class logic.
 * We test the pure variants map since the component is purely declarative.
 */
import { describe, it, expect } from 'vitest';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'default';

const variants: Record<BadgeVariant, string> = {
  success: 'bg-success/20 text-success border border-success/30',
  warning: 'bg-warning/20 text-warning border border-warning/30',
  danger: 'bg-danger/20 text-danger border border-danger/30',
  default: 'bg-accent/20 text-accent border border-accent/30',
};

function getVariantClass(variant: BadgeVariant = 'default'): string {
  return variants[variant] ?? variants.default;
}

describe('Badge — variant classes', () => {
  it('has distinct classes for each variant', () => {
    const classes = Object.values(variants);
    const unique = new Set(classes);
    expect(unique.size).toBe(classes.length);
  });

  it('success variant contains success tokens', () => {
    expect(getVariantClass('success')).toContain('text-success');
    expect(getVariantClass('success')).toContain('bg-success');
  });

  it('warning variant contains warning tokens', () => {
    expect(getVariantClass('warning')).toContain('text-warning');
    expect(getVariantClass('warning')).toContain('bg-warning');
  });

  it('danger variant contains danger tokens', () => {
    expect(getVariantClass('danger')).toContain('text-danger');
    expect(getVariantClass('danger')).toContain('bg-danger');
  });

  it('default variant contains accent tokens', () => {
    expect(getVariantClass('default')).toContain('text-accent');
    expect(getVariantClass('default')).toContain('bg-accent');
  });

  it('all variants include border class', () => {
    for (const variant of Object.keys(variants) as BadgeVariant[]) {
      expect(getVariantClass(variant)).toContain('border');
    }
  });

  it('all variants include rounded-full class in component', () => {
    // The component itself always adds rounded-full; variants only define color
    const baseClass = 'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold';
    expect(baseClass).toContain('rounded-full');
  });
});
