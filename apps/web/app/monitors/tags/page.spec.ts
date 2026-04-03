import { describe, expect, it } from 'vitest';
import { PRESET_COLORS, getTagMonitorCount } from './helpers';

describe('tags helpers', () => {
  it('PRESET_COLORS has 10 valid hex colors', () => {
    expect(PRESET_COLORS).toHaveLength(10);
    for (const color of PRESET_COLORS) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('getTagMonitorCount returns 0 for empty monitors', () => {
    expect(getTagMonitorCount('tag-1', [])).toBe(0);
  });

  it('getTagMonitorCount counts monitors with matching tag', () => {
    const monitors = [
      { id: 'm1', tags: [{ id: 'tag-1' }] },
      { id: 'm2', tags: [{ id: 'tag-2' }] },
      { id: 'm3', tags: [{ id: 'tag-1' }, { id: 'tag-2' }] },
    ];

    expect(getTagMonitorCount('tag-1', monitors)).toBe(2);
    expect(getTagMonitorCount('tag-2', monitors)).toBe(2);
  });

  it('getTagMonitorCount ignores monitors without tags', () => {
    const monitors = [
      { id: 'm1' },
      { id: 'm2', tags: [] },
      { id: 'm3', tags: [{ id: 'tag-3' }] },
    ];

    expect(getTagMonitorCount('tag-1', monitors)).toBe(0);
  });
});
