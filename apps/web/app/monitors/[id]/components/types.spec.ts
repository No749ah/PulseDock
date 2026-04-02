/**
 * Unit tests for monitors/[id]/components/types.ts
 *
 * Covers: PERIOD_LABELS constant, formatDuration helper, and type
 * shape contracts for MonitorItem, SloReport, HealthScore, ErrorBudget.
 */
import { describe, it, expect } from 'vitest';
import { PERIOD_LABELS, formatDuration } from './types';
import type { MonitorItem, HealthScore, ErrorBudget, SloReport, UptimePeriod } from './types';

// ─── PERIOD_LABELS ────────────────────────────────────────────────────────────

describe('types — PERIOD_LABELS', () => {
  it('has exactly 4 entries', () => {
    expect(Object.keys(PERIOD_LABELS)).toHaveLength(4);
  });

  it('covers all UptimePeriod values', () => {
    const periods: UptimePeriod[] = ['1d', '7d', '30d', '90d'];
    for (const p of periods) {
      expect(PERIOD_LABELS[p]).toBeTruthy();
    }
  });

  it('1d maps to "24h"', () => {
    expect(PERIOD_LABELS['1d']).toBe('24h');
  });

  it('7d maps to "7d"', () => {
    expect(PERIOD_LABELS['7d']).toBe('7d');
  });

  it('30d maps to "30d"', () => {
    expect(PERIOD_LABELS['30d']).toBe('30d');
  });

  it('90d maps to "90d"', () => {
    expect(PERIOD_LABELS['90d']).toBe('90d');
  });

  it('all labels are non-empty strings', () => {
    for (const label of Object.values(PERIOD_LABELS)) {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

// ─── formatDuration ───────────────────────────────────────────────────────────

describe('types — formatDuration', () => {
  it('0 → "0s"', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('1 → "1s"', () => {
    expect(formatDuration(1)).toBe('1s');
  });

  it('59 → "59s"', () => {
    expect(formatDuration(59)).toBe('59s');
  });

  it('60 → "1m"', () => {
    expect(formatDuration(60)).toBe('1m');
  });

  it('90 → "2m" (rounds)', () => {
    expect(formatDuration(90)).toBe('2m');
  });

  it('300 → "5m"', () => {
    expect(formatDuration(300)).toBe('5m');
  });

  it('3599 → "60m"', () => {
    expect(formatDuration(3599)).toBe('60m');
  });

  it('3600 → "1h"', () => {
    expect(formatDuration(3600)).toBe('1h');
  });

  it('7200 → "2h"', () => {
    expect(formatDuration(7200)).toBe('2h');
  });

  it('5400 → "2h" (rounds up)', () => {
    expect(formatDuration(5400)).toBe('2h');
  });

  it('86399 → "24h"', () => {
    expect(formatDuration(86399)).toBe('24h');
  });

  it('86400 → "1d"', () => {
    expect(formatDuration(86400)).toBe('1d');
  });

  it('172800 → "2d"', () => {
    expect(formatDuration(172800)).toBe('2d');
  });

  it('604800 → "7d"', () => {
    expect(formatDuration(604800)).toBe('7d');
  });

  it('all boundaries produce non-empty strings', () => {
    const values = [0, 1, 59, 60, 3600, 86400, 604800];
    for (const v of values) {
      expect(formatDuration(v).length).toBeGreaterThan(0);
    }
  });
});

// ─── Type shape contracts ─────────────────────────────────────────────────────

describe('types — MonitorItem shape', () => {
  it('accepts required fields', () => {
    const item: MonitorItem = {
      id: 'm-1',
      name: 'Test Monitor',
      type: 'HTTP',
      target: 'https://example.com',
      intervalSec: 60,
      enabled: true,
      createdAt: '2026-04-01T00:00:00Z',
    };
    expect(item.type).toBe('HTTP');
    expect(item.intervalSec).toBe(60);
  });

  it('accepts all monitor types', () => {
    const types = ['HTTP', 'GIT_RELEASE', 'DOCKER_IMAGE', 'TCP', 'SSL_CERT', 'HEARTBEAT', 'DNS', 'PING', 'SMTP', 'BROWSER', 'WHOIS', 'FTP', 'IMAP', 'POP3', 'CT_LOG', 'GRAPHQL', 'TRANSACTION'] as const;
    for (const t of types) {
      const item: MonitorItem = { id: 'm-1', name: 'T', type: t, target: 'x', intervalSec: 60, enabled: true, createdAt: '' };
      expect(item.type).toBe(t);
    }
  });

  it('optional fields can be omitted', () => {
    const item: MonitorItem = {
      id: 'm-1', name: 'T', type: 'TCP', target: 'x:80',
      intervalSec: 30, enabled: false, createdAt: '2026-04-01T00:00:00Z',
    };
    expect(item.slaTarget).toBeUndefined();
    expect(item.tags).toBeUndefined();
  });
});

describe('types — HealthScore shape', () => {
  it('accepts valid grade and breakdown', () => {
    const hs: HealthScore = {
      score: 92,
      grade: 'A',
      breakdown: { uptime: 30, latency: 20, sla: 20, streak: 22 },
    };
    expect(hs.grade).toBe('A');
    expect(hs.breakdown.uptime + hs.breakdown.latency + hs.breakdown.sla + hs.breakdown.streak).toBe(92);
  });

  it('breakdown components are numbers', () => {
    const hs: HealthScore = {
      score: 0,
      grade: 'F',
      breakdown: { uptime: 0, latency: 0, sla: 0, streak: 0 },
    };
    for (const v of Object.values(hs.breakdown)) {
      expect(typeof v).toBe('number');
    }
  });
});

describe('types — ErrorBudget shape', () => {
  it('accepts valid error budget data', () => {
    const eb: ErrorBudget = {
      monitorId: 'm-1',
      period: '30d',
      slaTarget: 99.9,
      totalMinutes: 43200,
      allowedDownMinutes: 43.2,
      actualDownMinutes: 10,
      remainingDownMinutes: 33.2,
      budgetConsumedPct: 23.1,
      budgetRemainingPct: 76.9,
    };
    expect(eb.slaTarget).toBe(99.9);
    expect(eb.budgetConsumedPct + eb.budgetRemainingPct).toBeCloseTo(100, 0);
  });
});

describe('types — SloReport shape', () => {
  const makeErrorBudget = () => ({
    uptimeBudgetMinutes: 43.2,
    uptimeBurnedMinutes: 10,
    uptimeBurnRate: 0.23,
    latencyBudgetPct: 1,
    latencyBurnedPct: 0.2,
    latencyBurnRate: 0.2,
    overallHealth: 'ok' as const,
  });

  it('accepts valid SLO report', () => {
    const report: SloReport = {
      monitorId: 'm-1',
      period: { days: 30, from: '2026-03-01T00:00:00Z', to: '2026-03-31T23:59:59Z' },
      uptime: {
        target: 99.9,
        actual: 99.95,
        status: 'ok',
        totalChecks: 4320,
        failedChecks: 2,
        remainingBudgetMinutes: 40,
      },
      errorBudget: makeErrorBudget(),
    };
    expect(report.uptime.status).toBe('ok');
    expect(report.uptime.actual).toBeGreaterThan(report.uptime.target);
  });

  it('uptime status can be warning or breached', () => {
    const statuses: Array<'ok' | 'warning' | 'breached'> = ['ok', 'warning', 'breached'];
    for (const status of statuses) {
      const report: SloReport = {
        monitorId: 'm-1',
        period: { days: 7, from: '', to: '' },
        uptime: { target: 99, actual: 98, status, totalChecks: 100, failedChecks: 2, remainingBudgetMinutes: 0 },
        errorBudget: makeErrorBudget(),
      };
      expect(report.uptime.status).toBe(status);
    }
  });
});
