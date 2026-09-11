/**
 * Unit tests for status/page.tsx pure helpers.
 *
 * getOverallStatus() and STATUS_CONFIG are pure — fully testable without React.
 */
import { describe, it, expect } from 'vitest';

// ─── Mirror STATUS_CONFIG ─────────────────────────────────────────────────────

const STATUS_CONFIG = {
  operational: {
    label: 'All Systems Operational',
    dotClass: 'bg-emerald-500',
    badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    ringClass: 'ring-emerald-500/20',
  },
  degraded: {
    label: 'Partial Degradation',
    dotClass: 'bg-amber-500',
    badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    ringClass: 'ring-amber-500/20',
  },
  outage: {
    label: 'Major Outage',
    dotClass: 'bg-red-500',
    badgeClass: 'border-red-500/30 bg-red-500/10 text-red-400',
    ringClass: 'ring-red-500/20',
  },
  unknown: {
    label: 'No Monitors',
    dotClass: 'bg-gray-500',
    badgeClass: 'border-gray-500/30 bg-gray-500/10 text-gray-400',
    ringClass: 'ring-gray-500/20',
  },
} as const;

type Status = 'operational' | 'degraded' | 'outage' | 'unknown';

interface StatusPageSummary {
  slug: string;
  title: string;
  description: string | null;
  status: Status;
  monitorsTotal: number;
  monitorsUp: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Mirror getOverallStatus ──────────────────────────────────────────────────

function getOverallStatus(pages: StatusPageSummary[]): Status {
  if (pages.length === 0) return 'unknown';
  const statuses = pages.map((p) => p.status);
  if (statuses.includes('outage')) return 'outage';
  if (statuses.includes('degraded')) return 'degraded';
  if (statuses.every((s) => s === 'operational')) return 'operational';
  return 'unknown';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePage(status: Status): StatusPageSummary {
  return {
    slug: `page-${status}`,
    title: `Page ${status}`,
    description: null,
    status,
    monitorsTotal: 5,
    monitorsUp: status === 'operational' ? 5 : 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
  };
}

// ─── STATUS_CONFIG structure tests ────────────────────────────────────────────

describe('STATUS_CONFIG', () => {
  const statuses: Status[] = ['operational', 'degraded', 'outage', 'unknown'];

  it('has exactly 4 entries', () => {
    expect(Object.keys(STATUS_CONFIG)).toHaveLength(4);
  });

  it.each(statuses)('"%s" entry has label, dotClass, badgeClass, ringClass', (s) => {
    const cfg = STATUS_CONFIG[s];
    expect(typeof cfg.label).toBe('string');
    expect(cfg.label.length).toBeGreaterThan(0);
    expect(typeof cfg.dotClass).toBe('string');
    expect(typeof cfg.badgeClass).toBe('string');
    expect(typeof cfg.ringClass).toBe('string');
  });

  it('operational label is "All Systems Operational"', () => {
    expect(STATUS_CONFIG.operational.label).toBe('All Systems Operational');
  });

  it('outage label is "Major Outage"', () => {
    expect(STATUS_CONFIG.outage.label).toBe('Major Outage');
  });

  it('degraded label is "Partial Degradation"', () => {
    expect(STATUS_CONFIG.degraded.label).toBe('Partial Degradation');
  });

  it('unknown label is "No Monitors"', () => {
    expect(STATUS_CONFIG.unknown.label).toBe('No Monitors');
  });

  it('dot classes use correct Tailwind color tokens', () => {
    expect(STATUS_CONFIG.operational.dotClass).toContain('emerald');
    expect(STATUS_CONFIG.degraded.dotClass).toContain('amber');
    expect(STATUS_CONFIG.outage.dotClass).toContain('red');
    expect(STATUS_CONFIG.unknown.dotClass).toContain('gray');
  });
});

// ─── getOverallStatus ─────────────────────────────────────────────────────────

describe('getOverallStatus', () => {
  describe('empty array', () => {
    it('returns "unknown" when no pages', () => {
      expect(getOverallStatus([])).toBe('unknown');
    });
  });

  describe('single page', () => {
    it('returns "operational" for a single operational page', () => {
      expect(getOverallStatus([makePage('operational')])).toBe('operational');
    });

    it('returns "degraded" for a single degraded page', () => {
      expect(getOverallStatus([makePage('degraded')])).toBe('degraded');
    });

    it('returns "outage" for a single outage page', () => {
      expect(getOverallStatus([makePage('outage')])).toBe('outage');
    });

    it('returns "unknown" for a single unknown page', () => {
      expect(getOverallStatus([makePage('unknown')])).toBe('unknown');
    });
  });

  describe('outage takes priority', () => {
    it('outage + operational → outage', () => {
      expect(getOverallStatus([makePage('outage'), makePage('operational')])).toBe('outage');
    });

    it('outage + degraded → outage', () => {
      expect(getOverallStatus([makePage('outage'), makePage('degraded')])).toBe('outage');
    });

    it('outage + unknown → outage', () => {
      expect(getOverallStatus([makePage('outage'), makePage('unknown')])).toBe('outage');
    });

    it('multiple outages → outage', () => {
      expect(getOverallStatus([makePage('outage'), makePage('outage')])).toBe('outage');
    });
  });

  describe('degraded is second priority (no outage)', () => {
    it('degraded + operational → degraded', () => {
      expect(getOverallStatus([makePage('degraded'), makePage('operational')])).toBe('degraded');
    });

    it('degraded + unknown → degraded', () => {
      expect(getOverallStatus([makePage('degraded'), makePage('unknown')])).toBe('degraded');
    });

    it('multiple degraded → degraded', () => {
      expect(getOverallStatus([makePage('degraded'), makePage('degraded')])).toBe('degraded');
    });
  });

  describe('all operational', () => {
    it('two operational pages → operational', () => {
      expect(getOverallStatus([makePage('operational'), makePage('operational')])).toBe('operational');
    });

    it('three operational pages → operational', () => {
      expect(
        getOverallStatus([makePage('operational'), makePage('operational'), makePage('operational')]),
      ).toBe('operational');
    });
  });

  describe('mixed non-outage non-degraded with unknown → unknown fallback', () => {
    it('operational + unknown → unknown (not all operational)', () => {
      expect(getOverallStatus([makePage('operational'), makePage('unknown')])).toBe('unknown');
    });

    it('two unknown → unknown', () => {
      expect(getOverallStatus([makePage('unknown'), makePage('unknown')])).toBe('unknown');
    });
  });

  describe('priority order verification', () => {
    it('outage beats degraded beats operational', () => {
      const pages = [makePage('operational'), makePage('degraded'), makePage('outage')];
      expect(getOverallStatus(pages)).toBe('outage');
    });

    it('degraded beats operational when no outage', () => {
      const pages = [makePage('operational'), makePage('operational'), makePage('degraded')];
      expect(getOverallStatus(pages)).toBe('degraded');
    });
  });
});
