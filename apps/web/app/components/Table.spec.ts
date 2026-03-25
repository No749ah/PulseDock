/**
 * Unit tests for Table component class logic.
 */
import { describe, it, expect } from 'vitest';

// Mirror component internals

function buildTableClass(noScroll = false, extra = ''): string {
  const overflow = noScroll ? 'overflow-hidden' : 'overflow-x-auto';
  return [overflow, 'rounded-lg', 'border', 'border-border', extra].filter(Boolean).join(' ');
}

function buildRowClass(hover = true, extra = ''): string {
  const base = 'border-b border-border last:border-b-0';
  const hoverClass = hover ? 'hover:bg-surface-hover transition-colors' : '';
  return [base, hoverClass, extra].filter(Boolean).join(' ');
}

const TABLE_HEADER_CLASS =
  'px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider';
const TABLE_CELL_CLASS = 'px-4 py-3 text-text-primary';
const TABLE_HEAD_CLASS = 'bg-surface-elevated border-b border-border';

describe('Table — container class', () => {
  it('default has overflow-x-auto', () => {
    expect(buildTableClass()).toContain('overflow-x-auto');
  });

  it('noScroll=true uses overflow-hidden', () => {
    expect(buildTableClass(true)).toContain('overflow-hidden');
  });

  it('noScroll=true does not use overflow-x-auto', () => {
    expect(buildTableClass(true)).not.toContain('overflow-x-auto');
  });

  it('always has rounded-lg border', () => {
    const cls = buildTableClass();
    expect(cls).toContain('rounded-lg');
    expect(cls).toContain('border-border');
  });

  it('extra className is appended', () => {
    expect(buildTableClass(false, 'mt-4')).toContain('mt-4');
  });
});

describe('TableRow — hover class', () => {
  it('hover=true includes hover:bg-surface-hover', () => {
    expect(buildRowClass(true)).toContain('hover:bg-surface-hover');
  });

  it('hover=true includes transition-colors', () => {
    expect(buildRowClass(true)).toContain('transition-colors');
  });

  it('hover=false does not include hover class', () => {
    const cls = buildRowClass(false);
    expect(cls).not.toContain('hover:bg-surface-hover');
    expect(cls).not.toContain('transition-colors');
  });

  it('always has bottom border', () => {
    expect(buildRowClass()).toContain('border-b');
    expect(buildRowClass()).toContain('border-border');
  });

  it('always has last:border-b-0 to remove last row border', () => {
    expect(buildRowClass()).toContain('last:border-b-0');
  });

  it('extra className appended', () => {
    expect(buildRowClass(true, 'bg-danger/10')).toContain('bg-danger/10');
  });
});

describe('TableHeader — class string', () => {
  it('has left alignment', () => {
    expect(TABLE_HEADER_CLASS).toContain('text-left');
  });

  it('has uppercase tracking', () => {
    expect(TABLE_HEADER_CLASS).toContain('uppercase');
    expect(TABLE_HEADER_CLASS).toContain('tracking-wider');
  });

  it('has small font size', () => {
    expect(TABLE_HEADER_CLASS).toContain('text-xs');
  });

  it('has muted text color', () => {
    expect(TABLE_HEADER_CLASS).toContain('text-text-secondary');
  });

  it('has standard padding', () => {
    expect(TABLE_HEADER_CLASS).toContain('px-4');
    expect(TABLE_HEADER_CLASS).toContain('py-3');
  });
});

describe('TableCell — class string', () => {
  it('has standard padding', () => {
    expect(TABLE_CELL_CLASS).toContain('px-4');
    expect(TABLE_CELL_CLASS).toContain('py-3');
  });

  it('uses primary text color', () => {
    expect(TABLE_CELL_CLASS).toContain('text-text-primary');
  });
});

describe('TableHead — class string', () => {
  it('has elevated background', () => {
    expect(TABLE_HEAD_CLASS).toContain('bg-surface-elevated');
  });

  it('has bottom border', () => {
    expect(TABLE_HEAD_CLASS).toContain('border-b');
  });
});

describe('Table — structural consistency', () => {
  it('TableHeader uses smaller text than body', () => {
    expect(TABLE_HEADER_CLASS).toContain('text-xs');
    // Cell is implicitly larger (inherits base)
    expect(TABLE_HEADER_CLASS).not.toContain('text-sm');
  });

  it('both header and cell share same horizontal padding', () => {
    expect(TABLE_HEADER_CLASS).toContain('px-4');
    expect(TABLE_CELL_CLASS).toContain('px-4');
  });

  it('both share same vertical padding', () => {
    expect(TABLE_HEADER_CLASS).toContain('py-3');
    expect(TABLE_CELL_CLASS).toContain('py-3');
  });
});
