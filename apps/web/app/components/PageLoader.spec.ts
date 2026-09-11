import { describe, it, expect } from 'vitest';

describe('PageLoader component', () => {
  it('exports a default PageLoader export', async () => {
    const mod = await import('./PageLoader');
    expect(typeof mod.default).toBe('function');
  });

  it('PageLoader is a React component (function)', async () => {
    const { default: PageLoader } = await import('./PageLoader');
    expect(PageLoader).toBeDefined();
    expect(typeof PageLoader).toBe('function');
  });
});
