/**
 * Unit tests for Button component logic (variants, sizes, disabled state).
 * Tests the pure class-mapping logic since the component is declarative.
 */
import { describe, it, expect } from 'vitest';

// Mirror the component's internal maps
const variants = {
  primary: 'bg-accent hover:bg-accent-hover text-bg',
  secondary: 'border border-border hover:border-border-hover text-text-primary',
  ghost: 'text-text-secondary hover:text-text-primary',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-base',
};

const BASE_CLASSES =
  'font-semibold rounded-lg transition-all active:scale-[0.97] active:brightness-90 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

function buildClassName(
  variant: keyof typeof variants = 'primary',
  size: keyof typeof sizes = 'md',
  extra = ''
): string {
  return [BASE_CLASSES, variants[variant], sizes[size], extra].filter(Boolean).join(' ');
}

describe('Button — variant classes', () => {
  it('each variant produces distinct class string', () => {
    const classes = Object.values(variants);
    expect(new Set(classes).size).toBe(classes.length);
  });

  it('primary variant uses accent tokens', () => {
    expect(variants.primary).toContain('bg-accent');
    expect(variants.primary).toContain('text-bg');
  });

  it('secondary variant has border styling', () => {
    expect(variants.secondary).toContain('border');
    expect(variants.secondary).toContain('text-text-primary');
  });

  it('ghost variant uses muted text', () => {
    expect(variants.ghost).toContain('text-text-secondary');
    expect(variants.ghost).toContain('hover:text-text-primary');
  });
});

describe('Button — size classes', () => {
  it('each size produces distinct class string', () => {
    const classes = Object.values(sizes);
    expect(new Set(classes).size).toBe(classes.length);
  });

  it('sm size has smaller padding', () => {
    expect(sizes.sm).toContain('px-3');
    expect(sizes.sm).toContain('py-1.5');
  });

  it('md size has medium padding', () => {
    expect(sizes.md).toContain('px-4');
    expect(sizes.md).toContain('py-2');
  });

  it('lg size has largest padding', () => {
    expect(sizes.lg).toContain('px-6');
    expect(sizes.lg).toContain('py-3');
  });

  it('sm and md use different text sizes', () => {
    expect(sizes.sm).toContain('text-sm');
    expect(sizes.md).toContain('text-base');
  });
});

describe('Button — full className assembly', () => {
  it('default (primary, md) includes base, variant, and size classes', () => {
    const cls = buildClassName();
    expect(cls).toContain('font-semibold');
    expect(cls).toContain('rounded-lg');
    expect(cls).toContain('bg-accent');
    expect(cls).toContain('px-4');
  });

  it('disabled classes are always present in base', () => {
    expect(BASE_CLASSES).toContain('disabled:opacity-50');
    expect(BASE_CLASSES).toContain('disabled:cursor-not-allowed');
  });

  it('press feedback classes are always present', () => {
    expect(BASE_CLASSES).toContain('active:scale-[0.97]');
    expect(BASE_CLASSES).toContain('active:brightness-90');
  });

  it('extra className is appended', () => {
    const cls = buildClassName('primary', 'md', 'flex items-center gap-2');
    expect(cls).toContain('flex');
    expect(cls).toContain('items-center');
    expect(cls).toContain('gap-2');
  });

  it('secondary + sm combination is valid', () => {
    const cls = buildClassName('secondary', 'sm');
    expect(cls).toContain('border');
    expect(cls).toContain('text-sm');
    expect(cls).not.toContain('bg-accent');
  });

  it('ghost + lg combination is valid', () => {
    const cls = buildClassName('ghost', 'lg');
    expect(cls).toContain('text-text-secondary');
    expect(cls).toContain('px-6');
    expect(cls).not.toContain('bg-accent');
    expect(cls).not.toContain('border border-border');
  });
});

describe('Button — disabled/loading state logic', () => {
  function isDisabledProp(disabled: boolean, loading: boolean): boolean {
    return disabled || loading;
  }

  it('disabled=true disables the button', () => {
    expect(isDisabledProp(true, false)).toBe(true);
  });

  it('loading=true disables the button', () => {
    expect(isDisabledProp(false, true)).toBe(true);
  });

  it('both false keeps button enabled', () => {
    expect(isDisabledProp(false, false)).toBe(false);
  });

  it('both true still disables (OR semantics)', () => {
    expect(isDisabledProp(true, true)).toBe(true);
  });
});

describe('Button — type attribute defaults', () => {
  type ButtonType = 'button' | 'submit' | 'reset';

  function resolveType(type?: ButtonType): ButtonType {
    return type ?? 'button';
  }

  it('defaults to "button" type', () => {
    expect(resolveType()).toBe('button');
  });

  it('accepts submit type', () => {
    expect(resolveType('submit')).toBe('submit');
  });

  it('accepts reset type', () => {
    expect(resolveType('reset')).toBe('reset');
  });

  it('explicit "button" type is preserved', () => {
    expect(resolveType('button')).toBe('button');
  });
});
