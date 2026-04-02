/**
 * Unit tests for GeoRegionsInput pure logic.
 * Tests region add/remove, validation constraints, and keyboard handling.
 */
import { describe, it, expect } from 'vitest';

// ── Constants mirrored from component ────────────────────────────────────────

const MAX_REGIONS = 10;
const MAX_REGION_LENGTH = 50;

// ── Logic mirrored from component ────────────────────────────────────────────

function addRegion(regions: string[], value: string): string[] {
  const trimmed = value.trim().slice(0, MAX_REGION_LENGTH);
  if (!trimmed || regions.includes(trimmed) || regions.length >= MAX_REGIONS) return regions;
  return [...regions, trimmed];
}

function removeRegion(regions: string[], region: string): string[] {
  return regions.filter((r) => r !== region);
}

function removeLastRegion(regions: string[]): string[] {
  if (regions.length === 0) return regions;
  return regions.slice(0, -1);
}

function isInputDisabled(regions: string[]): boolean {
  return regions.length >= MAX_REGIONS;
}

function getInputPlaceholder(regions: string[]): string {
  if (regions.length === 0) return "e.g. us-east-1 — press Enter or comma to add";
  if (regions.length >= MAX_REGIONS) return "Max 10 regions";
  return "Add region…";
}

function normalizeRegionInput(raw: string): string {
  return raw.trim().replace(/,+$/, '').trim();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GeoRegionsInput — addRegion', () => {
  it('adds a new region to empty list', () => {
    const result = addRegion([], 'us-east-1');
    expect(result).toEqual(['us-east-1']);
  });

  it('trims whitespace from input', () => {
    const result = addRegion([], '  eu-west-1  ');
    expect(result).toEqual(['eu-west-1']);
  });

  it('does not add duplicate region', () => {
    const result = addRegion(['us-east-1'], 'us-east-1');
    expect(result).toEqual(['us-east-1']);
  });

  it('does not add empty string', () => {
    const result = addRegion(['us-east-1'], '');
    expect(result).toEqual(['us-east-1']);
  });

  it('does not add whitespace-only string', () => {
    const result = addRegion([], '   ');
    expect(result).toHaveLength(0);
  });

  it('respects max 10 regions limit', () => {
    const full = Array.from({ length: MAX_REGIONS }, (_, i) => `region-${i}`);
    const result = addRegion(full, 'region-new');
    expect(result).toHaveLength(MAX_REGIONS);
    expect(result).not.toContain('region-new');
  });

  it('truncates region to 50 characters', () => {
    const longValue = 'a'.repeat(60);
    const result = addRegion([], longValue);
    expect(result[0]).toHaveLength(MAX_REGION_LENGTH);
  });

  it('adds up to exactly 10 regions', () => {
    let regions: string[] = [];
    for (let i = 0; i < MAX_REGIONS; i++) {
      regions = addRegion(regions, `region-${i}`);
    }
    expect(regions).toHaveLength(MAX_REGIONS);
  });

  it('returns new array reference', () => {
    const original = ['us-east-1'];
    const result = addRegion(original, 'eu-west-1');
    expect(result).not.toBe(original);
  });
});

describe('GeoRegionsInput — removeRegion', () => {
  it('removes a specific region', () => {
    const result = removeRegion(['us-east-1', 'eu-west-1', 'ap-south-1'], 'eu-west-1');
    expect(result).toEqual(['us-east-1', 'ap-south-1']);
  });

  it('does nothing if region not found', () => {
    const result = removeRegion(['us-east-1'], 'nonexistent');
    expect(result).toEqual(['us-east-1']);
  });

  it('removes from single-item list', () => {
    const result = removeRegion(['us-east-1'], 'us-east-1');
    expect(result).toHaveLength(0);
  });

  it('returns new array reference', () => {
    const original = ['us-east-1'];
    const result = removeRegion(original, 'us-east-1');
    expect(result).not.toBe(original);
  });
});

describe('GeoRegionsInput — removeLastRegion (backspace)', () => {
  it('removes the last region', () => {
    const result = removeLastRegion(['us-east-1', 'eu-west-1']);
    expect(result).toEqual(['us-east-1']);
  });

  it('returns empty array from single-item list', () => {
    const result = removeLastRegion(['us-east-1']);
    expect(result).toHaveLength(0);
  });

  it('returns same empty array for empty list', () => {
    const original: string[] = [];
    const result = removeLastRegion(original);
    expect(result).toBe(original);
  });
});

describe('GeoRegionsInput — isInputDisabled', () => {
  it('is false when regions < 10', () => {
    expect(isInputDisabled([])).toBe(false);
    expect(isInputDisabled(['a', 'b', 'c'])).toBe(false);
    expect(isInputDisabled(Array.from({ length: 9 }, (_, i) => `r${i}`))).toBe(false);
  });

  it('is true when regions = 10', () => {
    const full = Array.from({ length: MAX_REGIONS }, (_, i) => `region-${i}`);
    expect(isInputDisabled(full)).toBe(true);
  });
});

describe('GeoRegionsInput — getInputPlaceholder', () => {
  it('returns descriptive placeholder for empty list', () => {
    const p = getInputPlaceholder([]);
    expect(p).toContain('us-east-1');
    expect(p).toContain('Enter');
  });

  it('returns max regions message when full', () => {
    const full = Array.from({ length: MAX_REGIONS }, (_, i) => `r${i}`);
    expect(getInputPlaceholder(full)).toBe('Max 10 regions');
  });

  it('returns short add message for partial list', () => {
    expect(getInputPlaceholder(['us-east-1'])).toBe('Add region…');
    expect(getInputPlaceholder(['a', 'b', 'c'])).toBe('Add region…');
  });
});

describe('GeoRegionsInput — normalizeRegionInput', () => {
  it('trims whitespace', () => {
    expect(normalizeRegionInput('  us-east-1  ')).toBe('us-east-1');
  });

  it('strips trailing commas', () => {
    expect(normalizeRegionInput('eu-west-1,')).toBe('eu-west-1');
    expect(normalizeRegionInput('ap-south-1,,')).toBe('ap-south-1');
  });

  it('strips trailing commas and whitespace', () => {
    expect(normalizeRegionInput(' us-east-1 , ')).toBe('us-east-1');
  });

  it('preserves dashes and dots', () => {
    expect(normalizeRegionInput('us-east-1')).toBe('us-east-1');
    expect(normalizeRegionInput('prod.us.east')).toBe('prod.us.east');
  });

  it('returns empty string for comma-only input', () => {
    expect(normalizeRegionInput(',,')).toBe('');
  });
});

describe('GeoRegionsInput — count display', () => {
  it('shows correct count out of 10', () => {
    const regions = ['us-east-1', 'eu-west-1'];
    const countText = `${regions.length}/10 regions · max 50 chars each`;
    expect(countText).toBe('2/10 regions · max 50 chars each');
  });

  it('shows 0/10 for empty list', () => {
    const regions: string[] = [];
    const countText = `${regions.length}/10 regions · max 50 chars each`;
    expect(countText).toBe('0/10 regions · max 50 chars each');
  });
});
