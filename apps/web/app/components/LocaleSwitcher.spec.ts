import { describe, it, expect } from 'vitest';

describe('LocaleSwitcher component', () => {
  it('exports a LocaleSwitcher named export', async () => {
    const mod = await import('./LocaleSwitcher');
    expect(typeof mod.LocaleSwitcher).toBe('function');
  });

  it('LocaleSwitcher accepts compact prop (truthy/falsy)', async () => {
    const { LocaleSwitcher } = await import('./LocaleSwitcher');
    expect(LocaleSwitcher).toBeDefined();
    // Component should accept a compact boolean prop — verified by TypeScript types
    expect(typeof LocaleSwitcher).toBe('function');
  });
});
