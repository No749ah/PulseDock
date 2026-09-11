/**
 * Unit tests for AnnotationsTab pure logic.
 * Tests color map lookups, dot colors, annotation text validation, and empty state.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

type AnnotationColor = 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';

const COLOR_MAP: Record<string, string> = {
  blue:   'bg-blue-500/10 border-blue-500/30 text-blue-400',
  green:  'bg-green-500/10 border-green-500/30 text-green-400',
  yellow: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  red:    'bg-red-500/10 border-red-500/30 text-red-400',
  purple: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
  gray:   'bg-gray-500/10 border-gray-500/30 text-gray-400',
};

const DOT_MAP: Record<string, string> = {
  blue:   'bg-blue-400',
  green:  'bg-green-400',
  yellow: 'bg-yellow-400',
  red:    'bg-red-400',
  purple: 'bg-purple-400',
  gray:   'bg-gray-400',
};

const ALL_COLORS: AnnotationColor[] = ['blue', 'green', 'yellow', 'red', 'purple', 'gray'];

function annotationBadgeClass(color: AnnotationColor | string): string {
  return COLOR_MAP[color] ?? 'bg-surface text-text-secondary border-border';
}

function annotationDotClass(color: AnnotationColor | string): string {
  return DOT_MAP[color] ?? 'bg-gray-400';
}

function canSaveAnnotation(text: string): boolean {
  return text.trim().length > 0;
}

function hasAnnotations(annotations: Array<unknown>): boolean {
  return annotations.length > 0;
}

function sortAnnotationsByDate(
  annotations: Array<{ id: string; annotatedAt: string; text: string; color: string; createdAt: string }>,
): typeof annotations {
  return [...annotations].sort(
    (a, b) => new Date(b.annotatedAt).getTime() - new Date(a.annotatedAt).getTime(),
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAnnotation(id: string, color: AnnotationColor, date: string) {
  return { id, text: `Note ${id}`, color, annotatedAt: date, createdAt: date };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AnnotationsTab — annotationBadgeClass', () => {
  it('blue → blue badge classes', () => {
    expect(annotationBadgeClass('blue')).toContain('blue-500');
  });
  it('green → green badge classes', () => {
    expect(annotationBadgeClass('green')).toContain('green-500');
  });
  it('yellow → yellow badge classes', () => {
    expect(annotationBadgeClass('yellow')).toContain('yellow-500');
  });
  it('red → red badge classes', () => {
    expect(annotationBadgeClass('red')).toContain('red-500');
  });
  it('purple → purple badge classes', () => {
    expect(annotationBadgeClass('purple')).toContain('purple-500');
  });
  it('gray → gray badge classes', () => {
    expect(annotationBadgeClass('gray')).toContain('gray-500');
  });
  it('unknown color → neutral fallback', () => {
    expect(annotationBadgeClass('magenta')).toContain('surface');
  });

  it('all badge classes have bg, border, and text components', () => {
    ALL_COLORS.forEach((c) => {
      const cls = annotationBadgeClass(c);
      expect(cls).toMatch(/bg-/);
      expect(cls).toMatch(/border-/);
      expect(cls).toMatch(/text-/);
    });
  });
});

describe('AnnotationsTab — annotationDotClass', () => {
  ALL_COLORS.forEach((c) => {
    it(`${c} dot → bg-${c}-400`, () => {
      expect(annotationDotClass(c)).toBe(`bg-${c}-400`);
    });
  });

  it('unknown color → gray-400 fallback', () => {
    expect(annotationDotClass('neon')).toBe('bg-gray-400');
  });
});

describe('AnnotationsTab — canSaveAnnotation', () => {
  it('returns false for empty text', () => {
    expect(canSaveAnnotation('')).toBe(false);
  });

  it('returns false for whitespace-only text', () => {
    expect(canSaveAnnotation('   ')).toBe(false);
    expect(canSaveAnnotation('\t\n')).toBe(false);
  });

  it('returns true for valid annotation text', () => {
    expect(canSaveAnnotation('Deployed v2.0')).toBe(true);
    expect(canSaveAnnotation('x')).toBe(true);
  });
});

describe('AnnotationsTab — hasAnnotations', () => {
  it('returns false for empty array', () => expect(hasAnnotations([])).toBe(false));
  it('returns true when annotations exist', () => {
    expect(hasAnnotations([makeAnnotation('1', 'blue', '2026-01-01')])).toBe(true);
  });
});

describe('AnnotationsTab — sortAnnotationsByDate', () => {
  it('sorts newest annotatedAt first', () => {
    const annotations = [
      makeAnnotation('1', 'blue', '2026-01-01T00:00:00Z'),
      makeAnnotation('2', 'green', '2026-03-15T00:00:00Z'),
      makeAnnotation('3', 'red', '2026-02-10T00:00:00Z'),
    ];
    const sorted = sortAnnotationsByDate(annotations);
    expect(sorted[0].id).toBe('2'); // March (newest)
    expect(sorted[1].id).toBe('3'); // February
    expect(sorted[2].id).toBe('1'); // January (oldest)
  });

  it('does not mutate original array', () => {
    const annotations = [
      makeAnnotation('a', 'blue', '2026-01-01T00:00:00Z'),
      makeAnnotation('b', 'green', '2026-03-01T00:00:00Z'),
    ];
    sortAnnotationsByDate(annotations);
    expect(annotations[0].id).toBe('a'); // unchanged
  });

  it('handles single annotation', () => {
    const annotations = [makeAnnotation('1', 'blue', '2026-01-01T00:00:00Z')];
    expect(sortAnnotationsByDate(annotations)).toHaveLength(1);
  });
});

describe('AnnotationsTab — color coverage', () => {
  it('all 6 annotation colors are defined', () => {
    expect(ALL_COLORS).toHaveLength(6);
    ALL_COLORS.forEach((c) => {
      expect(COLOR_MAP[c]).toBeTruthy();
      expect(DOT_MAP[c]).toBeTruthy();
    });
  });
});
