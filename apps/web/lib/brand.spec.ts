import { describe, it, expect } from 'vitest';
import { brand } from './brand';

describe('brand config', () => {
  it('exports default PulseDock name', () => {
    expect(brand.name).toBe('PulseDock');
  });

  it('has non-empty description', () => {
    expect(brand.description.length).toBeGreaterThan(0);
  });

  it('has valid accent color hex', () => {
    expect(brand.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('has valid URL format', () => {
    expect(brand.url).toMatch(/^https?:\/\//);
  });

  it('has github URL pointing to correct repo', () => {
    expect(brand.githubUrl).toContain('No749ah/PulseDock');
  });

  it('does not hide branding by default', () => {
    expect(brand.hideBranding).toBe(false);
  });

  it('has null logoUrl by default (uses inline SVG)', () => {
    expect(brand.logoUrl).toBeNull();
  });

  it('ogImageUrl contains the base URL', () => {
    expect(brand.ogImageUrl).toContain(brand.url);
  });
});
