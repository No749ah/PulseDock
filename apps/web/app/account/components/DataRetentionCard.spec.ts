/**
 * Unit tests for DataRetentionCard pure logic.
 * Tests retention option labels, storage stats formatting, option button classes.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

const RETENTION_OPTIONS = [
  { value: 7,   label: '7 days'  },
  { value: 30,  label: '30 days' },
  { value: 90,  label: '90 days' },
  { value: 365, label: '1 year'  },
] as const;

type RetentionDays = 7 | 30 | 90 | 365;

function retentionOptionClass(value: RetentionDays, selected: RetentionDays): string {
  const base = 'px-4 py-2 rounded-lg border text-sm font-medium transition-colors';
  const active = 'border-accent bg-accent/10 text-accent';
  const inactive = 'border-border text-text-secondary hover:border-accent/50';
  return `${base} ${value === selected ? active : inactive}`;
}

function rollupToggleClass(enabled: boolean): string {
  return enabled ? 'bg-accent' : 'bg-surface-elevated border border-border';
}

function formatStorageCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function isValidRetentionDays(days: number): days is RetentionDays {
  return ([7, 30, 90, 365] as number[]).includes(days);
}

function hasStorageStats(stats: null | { rawRunsTotal: number }): boolean {
  return stats !== null;
}

function currentSettingLabel(days: number): string {
  const opt = RETENTION_OPTIONS.find((o) => o.value === days);
  return opt ? opt.label : `${days} days`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DataRetentionCard — RETENTION_OPTIONS', () => {
  it('has exactly 4 options', () => expect(RETENTION_OPTIONS).toHaveLength(4));

  it('options are 7, 30, 90, 365 days', () => {
    const values = RETENTION_OPTIONS.map((o) => o.value);
    expect(values).toEqual([7, 30, 90, 365]);
  });

  it('all options have labels', () => {
    RETENTION_OPTIONS.forEach((o) => {
      expect(o.label.length).toBeGreaterThan(0);
    });
  });

  it('365 days displays as "1 year"', () => {
    const yearOption = RETENTION_OPTIONS.find((o) => o.value === 365);
    expect(yearOption?.label).toBe('1 year');
  });
});

describe('DataRetentionCard — retentionOptionClass', () => {
  it('selected option gets accent styling', () => {
    expect(retentionOptionClass(90, 90)).toContain('accent');
  });

  it('unselected option gets secondary styling', () => {
    expect(retentionOptionClass(7, 90)).toContain('text-text-secondary');
    expect(retentionOptionClass(7, 90)).not.toContain('bg-accent/10');
  });

  it('all options produce distinct classes based on selection', () => {
    RETENTION_OPTIONS.forEach(({ value }) => {
      const selected = retentionOptionClass(value as RetentionDays, value as RetentionDays);
      const unselected = retentionOptionClass(value as RetentionDays, 365 as RetentionDays);
      if (value !== 365) {
        expect(selected).not.toBe(unselected);
      }
    });
  });
});

describe('DataRetentionCard — rollupToggleClass', () => {
  it('enabled → accent background', () => expect(rollupToggleClass(true)).toContain('accent'));
  it('disabled → surface background', () => {
    expect(rollupToggleClass(false)).not.toContain('accent');
    expect(rollupToggleClass(false)).toContain('surface-elevated');
  });
});

describe('DataRetentionCard — formatStorageCount', () => {
  it('< 1000 → plain number', () => {
    expect(formatStorageCount(0)).toBe('0');
    expect(formatStorageCount(999)).toBe('999');
  });

  it('1000-999999 → K suffix', () => {
    expect(formatStorageCount(1000)).toBe('1.0K');
    expect(formatStorageCount(1500)).toBe('1.5K');
    expect(formatStorageCount(50000)).toBe('50.0K');
  });

  it('≥ 1,000,000 → M suffix', () => {
    expect(formatStorageCount(1_000_000)).toBe('1.0M');
    expect(formatStorageCount(2_500_000)).toBe('2.5M');
  });
});

describe('DataRetentionCard — isValidRetentionDays', () => {
  it('accepts 7, 30, 90, 365', () => {
    expect(isValidRetentionDays(7)).toBe(true);
    expect(isValidRetentionDays(30)).toBe(true);
    expect(isValidRetentionDays(90)).toBe(true);
    expect(isValidRetentionDays(365)).toBe(true);
  });

  it('rejects arbitrary numbers', () => {
    expect(isValidRetentionDays(14)).toBe(false);
    expect(isValidRetentionDays(60)).toBe(false);
    expect(isValidRetentionDays(180)).toBe(false);
  });
});

describe('DataRetentionCard — hasStorageStats', () => {
  it('returns false for null', () => expect(hasStorageStats(null)).toBe(false));
  it('returns true when stats are loaded', () => {
    expect(hasStorageStats({ rawRunsTotal: 1000 })).toBe(true);
  });
});

describe('DataRetentionCard — currentSettingLabel', () => {
  it('maps known values to labels', () => {
    expect(currentSettingLabel(7)).toBe('7 days');
    expect(currentSettingLabel(30)).toBe('30 days');
    expect(currentSettingLabel(90)).toBe('90 days');
    expect(currentSettingLabel(365)).toBe('1 year');
  });

  it('falls back to "N days" for custom values', () => {
    expect(currentSettingLabel(14)).toBe('14 days');
    expect(currentSettingLabel(180)).toBe('180 days');
  });
});
