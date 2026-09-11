import { describe, expect, it, vi } from 'vitest';

describe('robots', () => {
  it('returns default robots policy and sitemap URL', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.resetModules();
    const { default: robots } = await import('./robots');

    const config = robots();
    expect(config.sitemap).toBe('https://oc-dev-test.no749ah.com/sitemap.xml');
    expect(config.rules).toHaveLength(1);
    const rule = Array.isArray(config.rules) ? config.rules[0] : config.rules;
    expect(rule?.userAgent).toBe('*');
    expect(rule?.allow).toContain('/');
    expect(rule?.allow).toContain('/login');
    expect(rule?.disallow).toContain('/dashboard');
    expect(rule?.disallow).toContain('/api/');
  });

  it('uses NEXT_PUBLIC_APP_URL for sitemap host', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://status.example.com';
    vi.resetModules();
    const { default: robots } = await import('./robots');

    const config = robots();
    expect(config.sitemap).toBe('https://status.example.com/sitemap.xml');
  });
});
