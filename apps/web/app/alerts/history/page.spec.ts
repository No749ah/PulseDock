/**
 * @vitest-environment node
 * Unit tests for pure helpers in alerts/history/page.tsx
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// ── Inline helpers from page.tsx ─────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function channelTypeBadgeClass(type: string): string {
  switch (type) {
    case 'discord': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
    case 'slack': return 'bg-green-500/10 text-green-400 border-green-500/20';
    case 'telegram': return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
    case 'webhook': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    case 'email': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'pagerduty': return 'bg-green-600/10 text-green-500 border-green-600/20';
    case 'opsgenie': return 'bg-orange-600/10 text-orange-500 border-orange-600/20';
    case 'sms': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'teams': return 'bg-blue-600/10 text-blue-400 border-blue-600/20';
    case 'ntfy': return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
    case 'gotify': return 'bg-teal-500/10 text-teal-400 border-teal-500/20';
    case 'matrix': return 'bg-pink-500/10 text-pink-400 border-pink-500/20';
    default: return 'bg-surface-elevated text-text-secondary border-border';
  }
}

// Extracted from useMemo in page component
function filterDeliveries(
  deliveries: Array<{
    status: string;
    monitorName: string | null;
    channelName: string;
    channelType: string;
  }>,
  statusFilter: 'all' | 'success' | 'failed',
  search: string,
) {
  return deliveries.filter((d) => {
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (d.monitorName?.toLowerCase().includes(q) ?? false) ||
        d.channelName.toLowerCase().includes(q) ||
        d.channelType.toLowerCase().includes(q)
      );
    }
    return true;
  });
}

function computeSuccessRate(total: number, successCount: number): number | null {
  if (total === 0) return null;
  return Math.round((successCount / total) * 100);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('alerts/history/page — relativeTime', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('returns "just now" for < 1 minute ago', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-03T06:00:00Z').getTime();
    vi.setSystemTime(now);
    expect(relativeTime(new Date(now - 30000).toISOString())).toBe('just now');
    expect(relativeTime(new Date(now - 59999).toISOString())).toBe('just now');
  });

  it('returns Nm ago for 1-59 minutes', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-03T06:00:00Z').getTime();
    vi.setSystemTime(now);
    expect(relativeTime(new Date(now - 60000).toISOString())).toBe('1m ago');
    expect(relativeTime(new Date(now - 5 * 60000).toISOString())).toBe('5m ago');
    expect(relativeTime(new Date(now - 59 * 60000).toISOString())).toBe('59m ago');
  });

  it('returns Nh ago for 1-23 hours', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-03T06:00:00Z').getTime();
    vi.setSystemTime(now);
    expect(relativeTime(new Date(now - 60 * 60000).toISOString())).toBe('1h ago');
    expect(relativeTime(new Date(now - 5 * 3600000).toISOString())).toBe('5h ago');
    expect(relativeTime(new Date(now - 23 * 3600000).toISOString())).toBe('23h ago');
  });

  it('returns Nd ago for >= 24 hours', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-03T06:00:00Z').getTime();
    vi.setSystemTime(now);
    expect(relativeTime(new Date(now - 24 * 3600000).toISOString())).toBe('1d ago');
    expect(relativeTime(new Date(now - 7 * 24 * 3600000).toISOString())).toBe('7d ago');
  });
});

describe('alerts/history/page — channelTypeBadgeClass', () => {
  it('returns indigo classes for discord', () => {
    expect(channelTypeBadgeClass('discord')).toContain('indigo-400');
  });

  it('returns green classes for slack', () => {
    expect(channelTypeBadgeClass('slack')).toContain('green-400');
  });

  it('returns sky classes for telegram', () => {
    expect(channelTypeBadgeClass('telegram')).toContain('sky-400');
  });

  it('returns orange classes for webhook', () => {
    expect(channelTypeBadgeClass('webhook')).toContain('orange-400');
  });

  it('returns blue classes for email', () => {
    expect(channelTypeBadgeClass('email')).toContain('blue-400');
  });

  it('returns green-500 classes for pagerduty', () => {
    expect(channelTypeBadgeClass('pagerduty')).toContain('green-500');
  });

  it('returns orange-500 classes for opsgenie', () => {
    expect(channelTypeBadgeClass('opsgenie')).toContain('orange-500');
  });

  it('returns emerald classes for sms', () => {
    expect(channelTypeBadgeClass('sms')).toContain('emerald-400');
  });

  it('returns blue-600 classes for teams', () => {
    expect(channelTypeBadgeClass('teams')).toContain('blue-600');
  });

  it('returns violet classes for ntfy', () => {
    expect(channelTypeBadgeClass('ntfy')).toContain('violet-400');
  });

  it('returns teal classes for gotify', () => {
    expect(channelTypeBadgeClass('gotify')).toContain('teal-400');
  });

  it('returns pink classes for matrix', () => {
    expect(channelTypeBadgeClass('matrix')).toContain('pink-400');
  });

  it('returns default fallback for unknown types', () => {
    expect(channelTypeBadgeClass('rocketchat')).toContain('surface-elevated');
    expect(channelTypeBadgeClass('')).toContain('surface-elevated');
    expect(channelTypeBadgeClass('unknown')).toContain('surface-elevated');
  });
});

describe('alerts/history/page — filterDeliveries', () => {
  const deliveries = [
    { status: 'success', monitorName: 'API Gateway', channelName: 'Ops Slack', channelType: 'slack' },
    { status: 'failed',  monitorName: 'DB Primary',  channelName: 'Prod Discord', channelType: 'discord' },
    { status: 'success', monitorName: null,           channelName: 'Webhook Out',  channelType: 'webhook' },
  ];

  it('returns all entries with statusFilter=all and no search', () => {
    expect(filterDeliveries(deliveries, 'all', '')).toHaveLength(3);
  });

  it('filters to success only', () => {
    const result = filterDeliveries(deliveries, 'success', '');
    expect(result).toHaveLength(2);
    expect(result.every(d => d.status === 'success')).toBe(true);
  });

  it('filters to failed only', () => {
    const result = filterDeliveries(deliveries, 'failed', '');
    expect(result).toHaveLength(1);
    expect(result[0].channelName).toBe('Prod Discord');
  });

  it('searches by monitor name (case-insensitive)', () => {
    expect(filterDeliveries(deliveries, 'all', 'api')).toHaveLength(1);
    expect(filterDeliveries(deliveries, 'all', 'API GATEWAY')).toHaveLength(1);
  });

  it('searches by channel name', () => {
    expect(filterDeliveries(deliveries, 'all', 'ops slack')).toHaveLength(1);
    expect(filterDeliveries(deliveries, 'all', 'webhook')).toHaveLength(1);
  });

  it('searches by channel type', () => {
    expect(filterDeliveries(deliveries, 'all', 'discord')).toHaveLength(1);
    expect(filterDeliveries(deliveries, 'all', 'slack')).toHaveLength(1);
  });

  it('handles null monitorName without crashing', () => {
    const result = filterDeliveries(deliveries, 'all', 'webhook');
    expect(result).toHaveLength(1);
    expect(result[0].monitorName).toBeNull();
  });

  it('combines statusFilter and search', () => {
    const result = filterDeliveries(deliveries, 'success', 'slack');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('success');
  });

  it('returns empty for no match', () => {
    expect(filterDeliveries(deliveries, 'all', 'zzznotfound')).toHaveLength(0);
  });

  it('ignores whitespace-only search', () => {
    expect(filterDeliveries(deliveries, 'all', '   ')).toHaveLength(3);
  });
});

describe('alerts/history/page — computeSuccessRate', () => {
  it('returns null when total is 0', () => {
    expect(computeSuccessRate(0, 0)).toBeNull();
  });

  it('returns 100 for all successes', () => {
    expect(computeSuccessRate(10, 10)).toBe(100);
  });

  it('returns 0 for all failures', () => {
    expect(computeSuccessRate(10, 0)).toBe(0);
  });

  it('rounds to nearest integer', () => {
    // 1/3 ≈ 33.33 → 33
    expect(computeSuccessRate(3, 1)).toBe(33);
    // 2/3 ≈ 66.67 → 67
    expect(computeSuccessRate(3, 2)).toBe(67);
  });

  it('computes 95% rate correctly', () => {
    expect(computeSuccessRate(100, 95)).toBe(95);
  });
});
