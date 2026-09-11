import { describe, it, expect } from 'vitest';

describe('StaggerList component', () => {
  it('exports a StaggerList named export', async () => {
    const mod = await import('./StaggerList');
    expect(typeof mod.StaggerList).toBe('function');
  });

  it('StaggerList is a React function component', async () => {
    const { StaggerList } = await import('./StaggerList');
    expect(StaggerList).toBeDefined();
    expect(typeof StaggerList).toBe('function');
  });
});
