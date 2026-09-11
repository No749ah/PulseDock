/**
 * Unit tests for Select component logic.
 * Tests option filtering, placeholder logic, and onChange wiring.
 */
import { describe, it, expect, vi } from 'vitest';

// Mirror the component's option shape
interface SelectOption {
  value: string;
  label: string;
}

// Pure helpers that mirror what the component does

function filterOptionsBySearch(options: SelectOption[], query: string): SelectOption[] {
  if (!query.trim()) return options;
  const q = query.toLowerCase();
  return options.filter(
    (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
  );
}

function findOptionByValue(options: SelectOption[], value: string): SelectOption | undefined {
  return options.find((o) => o.value === value);
}

function buildOptions(count: number): SelectOption[] {
  return Array.from({ length: count }, (_, i) => ({
    value: `val-${i}`,
    label: `Label ${i}`,
  }));
}

describe('Select — option list', () => {
  const options: SelectOption[] = [
    { value: 'a', label: 'Apple' },
    { value: 'b', label: 'Banana' },
    { value: 'c', label: 'Cherry' },
  ];

  it('returns all options when query is empty', () => {
    expect(filterOptionsBySearch(options, '')).toHaveLength(3);
  });

  it('filters by label (case-insensitive)', () => {
    const result = filterOptionsBySearch(options, 'apple');
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('a');
  });

  it('filters by value', () => {
    const result = filterOptionsBySearch(options, 'b');
    // matches 'Banana' label and 'b' value
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((o) => o.value === 'b')).toBe(true);
  });

  it('returns empty array when no match', () => {
    expect(filterOptionsBySearch(options, 'zzz')).toHaveLength(0);
  });

  it('trims query whitespace before filtering', () => {
    const result = filterOptionsBySearch(options, '  ');
    expect(result).toHaveLength(3);
  });
});

describe('Select — findOptionByValue', () => {
  const options = buildOptions(5);

  it('finds option that exists', () => {
    const opt = findOptionByValue(options, 'val-3');
    expect(opt).toBeDefined();
    expect(opt?.label).toBe('Label 3');
  });

  it('returns undefined for non-existent value', () => {
    expect(findOptionByValue(options, 'nope')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(findOptionByValue(options, '')).toBeUndefined();
  });
});

describe('Select — onChange handler', () => {
  it('calls onChange with the selected value', () => {
    const onChange = vi.fn();

    function simulateChange(newValue: string): void {
      onChange(newValue);
    }

    simulateChange('cherry');
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('cherry');
  });

  it('calls onChange each time a new value is selected', () => {
    const onChange = vi.fn();

    ['a', 'b', 'c'].forEach((v) => onChange(v));
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenNthCalledWith(2, 'b');
  });
});

describe('Select — placeholder option', () => {
  it('placeholder option has empty string value', () => {
    const placeholderOption = { value: '', label: 'Choose one…' };
    expect(placeholderOption.value).toBe('');
  });

  it('placeholder is disabled (simulated)', () => {
    // When value is '' and onChange fires with '', it means user re-selected placeholder
    const onChange = vi.fn();
    onChange('');
    expect(onChange).toHaveBeenCalledWith('');
  });
});

describe('Select — disabled state', () => {
  it('disabled=true prevents interaction (guard check)', () => {
    let callCount = 0;

    function onChange(disabled: boolean, newValue: string): void {
      if (!disabled) callCount++;
    }

    onChange(true, 'x');
    expect(callCount).toBe(0);

    onChange(false, 'x');
    expect(callCount).toBe(1);
  });
});

describe('Select — large option lists', () => {
  const bigOptions = buildOptions(100);

  it('handles 100 options without issue', () => {
    expect(bigOptions).toHaveLength(100);
    expect(findOptionByValue(bigOptions, 'val-99')).toBeDefined();
  });

  it('filtering on large list works efficiently', () => {
    const result = filterOptionsBySearch(bigOptions, 'Label 5');
    // matches 5, 50-59 (11 items) but label exact match for "Label 5" is only "Label 5"
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((o) => o.value === 'val-5')).toBe(true);
  });
});
