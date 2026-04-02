import { describe, expect, it, vi } from 'vitest';

describe('sitemap', () => {
  it('returns default base URL entries', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.resetModules();
    const { default: sitemap } = await import('./sitemap');

    const entries = sitemap();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.url).toBe('https://oc-dev-test.no749ah.com');
    expect(entries[0]?.changeFrequency).toBe('weekly');
    expect(entries[0]?.priority).toBe(1);
    expect(entries[1]?.url).toBe('https://oc-dev-test.no749ah.com/login');
  });

  it('uses NEXT_PUBLIC_APP_URL when provided', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://status.example.com';
    vi.resetModules();
    const { default: sitemap } = await import('./sitemap');

    const entries = sitemap();
    expect(entries[0]?.url).toBe('https://status.example.com');
    expect(entries[1]?.url).toBe('https://status.example.com/login');
  });
});
