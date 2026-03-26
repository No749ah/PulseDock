import { describe, it, expect } from 'vitest';

describe('GradientText component', () => {
  it('exports a GradientText named export', async () => {
    const mod = await import('./GradientText');
    expect(typeof mod.GradientText).toBe('function');
  });

  it('GradientText is a function (React component)', async () => {
    const { GradientText } = await import('./GradientText');
    expect(GradientText).toBeDefined();
    expect(typeof GradientText).toBe('function');
  });
});
