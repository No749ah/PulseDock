/**
 * @vitest-environment node
 * Unit tests for pure helpers in monitors/security/page.tsx
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// ── Inline helpers from page.tsx ─────────────────────────────────────────────

function gradeColor(grade: string | null): string {
  if (!grade) return 'text-text-muted';
  switch (grade.toUpperCase()) {
    case 'A': return 'text-success';
    case 'B': return 'text-success/80';
    case 'C': return 'text-warning';
    case 'D': return 'text-warning/80';
    case 'F': return 'text-danger';
    default: return 'text-text-muted';
  }
}

function gradeBg(grade: string | null): string {
  if (!grade) return 'bg-surface-elevated border-border';
  switch (grade.toUpperCase()) {
    case 'A': return 'bg-success/10 border-success/30';
    case 'B': return 'bg-success/5 border-success/20';
    case 'C': return 'bg-warning/10 border-warning/30';
    case 'D': return 'bg-warning/5 border-warning/20';
    case 'F': return 'bg-danger/10 border-danger/30';
    default: return 'bg-surface-elevated border-border';
  }
}

function gradeBadgeVariant(grade: string | null): 'success' | 'warning' | 'danger' | 'default' {
  if (!grade) return 'default';
  switch (grade.toUpperCase()) {
    case 'A': case 'B': return 'success';
    case 'C': case 'D': return 'warning';
    case 'F': return 'danger';
    default: return 'default';
  }
}

function coveragePctColor(pct: number): string {
  if (pct >= 80) return 'text-success';
  if (pct >= 50) return 'text-warning';
  return 'text-danger';
}

function coverageBarColor(pct: number): string {
  if (pct >= 80) return 'bg-success';
  if (pct >= 50) return 'bg-warning';
  return 'bg-danger';
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('monitors/security/page — gradeColor', () => {
  it('returns muted for null', () => {
    expect(gradeColor(null)).toBe('text-text-muted');
  });

  it('returns success for A', () => {
    expect(gradeColor('A')).toBe('text-success');
    expect(gradeColor('a')).toBe('text-success'); // case-insensitive
  });

  it('returns muted success for B', () => {
    expect(gradeColor('B')).toBe('text-success/80');
    expect(gradeColor('b')).toBe('text-success/80');
  });

  it('returns warning for C', () => {
    expect(gradeColor('C')).toBe('text-warning');
  });

  it('returns muted warning for D', () => {
    expect(gradeColor('D')).toBe('text-warning/80');
  });

  it('returns danger for F', () => {
    expect(gradeColor('F')).toBe('text-danger');
  });

  it('returns muted for unknown grade', () => {
    expect(gradeColor('E')).toBe('text-text-muted');
    expect(gradeColor('X')).toBe('text-text-muted');
  });
});

describe('monitors/security/page — gradeBg', () => {
  it('returns surface for null', () => {
    expect(gradeBg(null)).toBe('bg-surface-elevated border-border');
  });

  it('returns success/10 for A', () => {
    expect(gradeBg('A')).toBe('bg-success/10 border-success/30');
  });

  it('returns success/5 for B', () => {
    expect(gradeBg('B')).toBe('bg-success/5 border-success/20');
  });

  it('returns warning/10 for C', () => {
    expect(gradeBg('C')).toBe('bg-warning/10 border-warning/30');
  });

  it('returns warning/5 for D', () => {
    expect(gradeBg('D')).toBe('bg-warning/5 border-warning/20');
  });

  it('returns danger/10 for F', () => {
    expect(gradeBg('F')).toBe('bg-danger/10 border-danger/30');
  });

  it('returns surface for unknown', () => {
    expect(gradeBg('Z')).toBe('bg-surface-elevated border-border');
  });

  it('is case-insensitive', () => {
    expect(gradeBg('a')).toBe('bg-success/10 border-success/30');
    expect(gradeBg('f')).toBe('bg-danger/10 border-danger/30');
  });
});

describe('monitors/security/page — gradeBadgeVariant', () => {
  it('returns default for null', () => {
    expect(gradeBadgeVariant(null)).toBe('default');
  });

  it('returns success for A', () => {
    expect(gradeBadgeVariant('A')).toBe('success');
  });

  it('returns success for B', () => {
    expect(gradeBadgeVariant('B')).toBe('success');
  });

  it('returns warning for C', () => {
    expect(gradeBadgeVariant('C')).toBe('warning');
  });

  it('returns warning for D', () => {
    expect(gradeBadgeVariant('D')).toBe('warning');
  });

  it('returns danger for F', () => {
    expect(gradeBadgeVariant('F')).toBe('danger');
  });

  it('returns default for unknown', () => {
    expect(gradeBadgeVariant('E')).toBe('default');
  });

  it('is case-insensitive', () => {
    expect(gradeBadgeVariant('a')).toBe('success');
    expect(gradeBadgeVariant('f')).toBe('danger');
  });
});

describe('monitors/security/page — coveragePctColor', () => {
  it('returns success at 80', () => {
    expect(coveragePctColor(80)).toBe('text-success');
  });

  it('returns success above 80', () => {
    expect(coveragePctColor(100)).toBe('text-success');
    expect(coveragePctColor(95)).toBe('text-success');
  });

  it('returns warning at 50', () => {
    expect(coveragePctColor(50)).toBe('text-warning');
  });

  it('returns warning between 50 and 79', () => {
    expect(coveragePctColor(79)).toBe('text-warning');
    expect(coveragePctColor(60)).toBe('text-warning');
  });

  it('returns danger below 50', () => {
    expect(coveragePctColor(49)).toBe('text-danger');
    expect(coveragePctColor(0)).toBe('text-danger');
  });
});

describe('monitors/security/page — coverageBarColor', () => {
  it('returns bg-success at 80+', () => {
    expect(coverageBarColor(80)).toBe('bg-success');
    expect(coverageBarColor(100)).toBe('bg-success');
  });

  it('returns bg-warning at 50–79', () => {
    expect(coverageBarColor(50)).toBe('bg-warning');
    expect(coverageBarColor(79)).toBe('bg-warning');
  });

  it('returns bg-danger below 50', () => {
    expect(coverageBarColor(49)).toBe('bg-danger');
    expect(coverageBarColor(0)).toBe('bg-danger');
  });

  it('coveragePctColor and coverageBarColor agree on all thresholds', () => {
    // Both use same 80/50 split; text vs bg prefix only
    for (const pct of [0, 49, 50, 79, 80, 100]) {
      const textColor = coveragePctColor(pct);
      const bgColor = coverageBarColor(pct);
      // Extract semantic part (success/warning/danger) and compare
      const textSemantic = textColor.replace('text-', '');
      const bgSemantic = bgColor.replace('bg-', '');
      expect(textSemantic).toBe(bgSemantic);
    }
  });
});

describe('monitors/security/page — relativeTime', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('returns — for null', () => {
    expect(relativeTime(null)).toBe('—');
  });

  it('returns "just now" for 0-1 minutes', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-03T06:00:00Z').getTime();
    vi.setSystemTime(now);
    expect(relativeTime(new Date(now - 0).toISOString())).toBe('just now');
    expect(relativeTime(new Date(now - 60000).toISOString())).toBe('just now'); // exactly 1 min → min < 2
    expect(relativeTime(new Date(now - 119999).toISOString())).toBe('just now');
  });

  it('returns Nm ago for 2–59 minutes', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-03T06:00:00Z').getTime();
    vi.setSystemTime(now);
    expect(relativeTime(new Date(now - 2 * 60000).toISOString())).toBe('2m ago');
    expect(relativeTime(new Date(now - 30 * 60000).toISOString())).toBe('30m ago');
    expect(relativeTime(new Date(now - 59 * 60000).toISOString())).toBe('59m ago');
  });

  it('returns Nh ago for hours', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-03T06:00:00Z').getTime();
    vi.setSystemTime(now);
    expect(relativeTime(new Date(now - 3600000).toISOString())).toBe('1h ago');
    expect(relativeTime(new Date(now - 12 * 3600000).toISOString())).toBe('12h ago');
  });

  it('returns Nd ago for >= 24h', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-03T06:00:00Z').getTime();
    vi.setSystemTime(now);
    expect(relativeTime(new Date(now - 24 * 3600000).toISOString())).toBe('1d ago');
    expect(relativeTime(new Date(now - 30 * 24 * 3600000).toISOString())).toBe('30d ago');
  });
});
