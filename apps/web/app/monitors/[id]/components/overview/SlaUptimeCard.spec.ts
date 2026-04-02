/**
 * Unit tests for SlaUptimeCard pure logic.
 * Tests health score grade colors, period label mapping, uptime color thresholds,
 * and MTTR/MTBF display formatting.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component + types ─────────────────────────────────────

type UptimePeriod = '1d' | '7d' | '30d' | '90d';
type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

const PERIOD_LABELS: Record<UptimePeriod, string> = {
  '1d': '24h',
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
};

function gradeColor(grade: HealthGrade): string {
  switch (grade) {
    case 'A': return 'border-success text-success';
    case 'B': return 'border-success/70 text-success/80';
    case 'C': return 'border-warning text-warning';
    case 'D': return 'border-orange-400 text-orange-400';
    default:  return 'border-danger text-danger'; // F
  }
}

function formatDuration(sec: number): string {
  if (sec === 0) return '0s';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

function isPeriodActive(period: UptimePeriod, activePeriod: UptimePeriod): boolean {
  return period === activePeriod;
}

function uptimeDisplayColor(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return 'text-text-muted';
  if (pct >= 99.9) return 'text-success';
  if (pct >= 99)   return 'text-yellow-400';
  if (pct >= 95)   return 'text-warning';
  return 'text-danger';
}

function lastRunStatus(ok: boolean | null | undefined): 'ok' | 'fail' | 'unknown' {
  if (ok === null || ok === undefined) return 'unknown';
  return ok ? 'ok' : 'fail';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SlaUptimeCard — PERIOD_LABELS', () => {
  it('1d → 24h', () => expect(PERIOD_LABELS['1d']).toBe('24h'));
  it('7d → 7d',  () => expect(PERIOD_LABELS['7d']).toBe('7d'));
  it('30d → 30d', () => expect(PERIOD_LABELS['30d']).toBe('30d'));
  it('90d → 90d', () => expect(PERIOD_LABELS['90d']).toBe('90d'));
  it('all four periods have labels', () => {
    const periods: UptimePeriod[] = ['1d', '7d', '30d', '90d'];
    periods.forEach((p) => expect(PERIOD_LABELS[p]).toBeTruthy());
  });
});

describe('SlaUptimeCard — gradeColor', () => {
  it('A → success color', () => {
    expect(gradeColor('A')).toContain('success');
  });
  it('B → success variant color', () => {
    expect(gradeColor('B')).toContain('success');
  });
  it('C → warning color', () => {
    expect(gradeColor('C')).toContain('warning');
  });
  it('D → orange color', () => {
    expect(gradeColor('D')).toContain('orange');
  });
  it('F → danger color', () => {
    expect(gradeColor('F')).toContain('danger');
  });

  it('A grade is not danger', () => {
    expect(gradeColor('A')).not.toContain('danger');
  });

  it('F grade is not success', () => {
    expect(gradeColor('F')).not.toContain('success');
  });
});

describe('SlaUptimeCard — formatDuration', () => {
  it('0s → "0s"', () => expect(formatDuration(0)).toBe('0s'));
  it('30s → "30s"', () => expect(formatDuration(30)).toBe('30s'));
  it('59s → "59s"', () => expect(formatDuration(59)).toBe('59s'));
  it('60s → "1m"', () => expect(formatDuration(60)).toBe('1m'));
  it('90s → "2m"', () => expect(formatDuration(90)).toBe('2m'));
  it('3600s → "1h"', () => expect(formatDuration(3600)).toBe('1h'));
  it('7200s → "2h"', () => expect(formatDuration(7200)).toBe('2h'));
  it('86400s → "1d"', () => expect(formatDuration(86400)).toBe('1d'));
  it('172800s → "2d"', () => expect(formatDuration(172800)).toBe('2d'));
  it('1800s → "30m"', () => expect(formatDuration(1800)).toBe('30m'));
});

describe('SlaUptimeCard — isPeriodActive', () => {
  it('returns true when periods match', () => {
    expect(isPeriodActive('7d', '7d')).toBe(true);
    expect(isPeriodActive('30d', '30d')).toBe(true);
  });

  it('returns false when periods differ', () => {
    expect(isPeriodActive('1d', '7d')).toBe(false);
    expect(isPeriodActive('90d', '30d')).toBe(false);
  });
});

describe('SlaUptimeCard — uptimeDisplayColor', () => {
  it('null → muted (no data)', () => {
    expect(uptimeDisplayColor(null)).toContain('muted');
    expect(uptimeDisplayColor(undefined)).toContain('muted');
  });

  it('≥ 99.9% → success (excellent)', () => {
    expect(uptimeDisplayColor(100)).toBe('text-success');
    expect(uptimeDisplayColor(99.9)).toBe('text-success');
  });

  it('99-99.89% → yellow-400', () => {
    expect(uptimeDisplayColor(99.5)).toBe('text-yellow-400');
    expect(uptimeDisplayColor(99)).toBe('text-yellow-400');
  });

  it('95-98.99% → warning', () => {
    expect(uptimeDisplayColor(98)).toBe('text-warning');
    expect(uptimeDisplayColor(95)).toBe('text-warning');
  });

  it('< 95% → danger', () => {
    expect(uptimeDisplayColor(94)).toBe('text-danger');
    expect(uptimeDisplayColor(80)).toBe('text-danger');
  });
});

describe('SlaUptimeCard — lastRunStatus', () => {
  it('true → ok', () => expect(lastRunStatus(true)).toBe('ok'));
  it('false → fail', () => expect(lastRunStatus(false)).toBe('fail'));
  it('null → unknown', () => expect(lastRunStatus(null)).toBe('unknown'));
  it('undefined → unknown', () => expect(lastRunStatus(undefined)).toBe('unknown'));
});

describe('SlaUptimeCard — combined health score scenarios', () => {
  it('A-grade monitor (≥ 99.9% uptime) shows success everywhere', () => {
    expect(gradeColor('A')).toContain('success');
    expect(uptimeDisplayColor(99.99)).toBe('text-success');
  });

  it('F-grade monitor (severe degradation) shows danger everywhere', () => {
    expect(gradeColor('F')).toContain('danger');
    expect(uptimeDisplayColor(80)).toBe('text-danger');
  });
});
