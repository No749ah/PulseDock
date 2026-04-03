// Unit tests for monitors/timing-breakdown/page.tsx pure helpers
import { describe, it, expect } from 'vitest';

// ─── PHASE_CONFIG ─────────────────────────────────────────────────────────────

const PHASE_CONFIG = {
  dns: { label: 'DNS', color: 'bg-purple-500', textColor: 'text-purple-400' },
  tcp: { label: 'TCP', color: 'bg-blue-500', textColor: 'text-blue-400' },
  tls: { label: 'TLS', color: 'bg-emerald-500', textColor: 'text-emerald-400' },
  ttfb: { label: 'TTFB', color: 'bg-yellow-500', textColor: 'text-yellow-400' },
  download: { label: 'Download', color: 'bg-orange-500', textColor: 'text-orange-400' },
} as const;

describe('PHASE_CONFIG', () => {
  it('has exactly 5 phases', () => {
    expect(Object.keys(PHASE_CONFIG)).toHaveLength(5);
  });

  it('phases are: dns, tcp, tls, ttfb, download', () => {
    expect(Object.keys(PHASE_CONFIG)).toEqual(['dns', 'tcp', 'tls', 'ttfb', 'download']);
  });

  it('dns has DNS label and purple color', () => {
    expect(PHASE_CONFIG.dns.label).toBe('DNS');
    expect(PHASE_CONFIG.dns.color).toContain('purple');
    expect(PHASE_CONFIG.dns.textColor).toContain('purple');
  });

  it('tcp has TCP label and blue color', () => {
    expect(PHASE_CONFIG.tcp.label).toBe('TCP');
    expect(PHASE_CONFIG.tcp.color).toContain('blue');
    expect(PHASE_CONFIG.tcp.textColor).toContain('blue');
  });

  it('tls has TLS label and emerald color', () => {
    expect(PHASE_CONFIG.tls.label).toBe('TLS');
    expect(PHASE_CONFIG.tls.color).toContain('emerald');
    expect(PHASE_CONFIG.tls.textColor).toContain('emerald');
  });

  it('ttfb has TTFB label and yellow color', () => {
    expect(PHASE_CONFIG.ttfb.label).toBe('TTFB');
    expect(PHASE_CONFIG.ttfb.color).toContain('yellow');
    expect(PHASE_CONFIG.ttfb.textColor).toContain('yellow');
  });

  it('download has Download label and orange color', () => {
    expect(PHASE_CONFIG.download.label).toBe('Download');
    expect(PHASE_CONFIG.download.color).toContain('orange');
    expect(PHASE_CONFIG.download.textColor).toContain('orange');
  });

  it('each phase has matching bg- and text- color tokens', () => {
    for (const cfg of Object.values(PHASE_CONFIG)) {
      const bgToken = cfg.color.replace('bg-', '').split('-')[0];
      const textToken = cfg.textColor.replace('text-', '').split('-')[0];
      expect(bgToken).toBe(textToken);
    }
  });

  it('all colors are bg- classes', () => {
    for (const cfg of Object.values(PHASE_CONFIG)) {
      expect(cfg.color).toMatch(/^bg-/);
    }
  });

  it('all textColors are text- classes', () => {
    for (const cfg of Object.values(PHASE_CONFIG)) {
      expect(cfg.textColor).toMatch(/^text-/);
    }
  });
});

// ─── formatMs ─────────────────────────────────────────────────────────────────

function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

describe('formatMs', () => {
  it('returns — for null', () => expect(formatMs(null)).toBe('—'));
  it('returns 0ms for 0', () => expect(formatMs(0)).toBe('0ms'));
  it('returns 1ms for 1', () => expect(formatMs(1)).toBe('1ms'));
  it('returns 999ms for 999', () => expect(formatMs(999)).toBe('999ms'));
  it('returns 1.0s for 1000', () => expect(formatMs(1000)).toBe('1.0s'));
  it('returns 1.5s for 1500', () => expect(formatMs(1500)).toBe('1.5s'));
  it('returns 2.3s for 2345', () => expect(formatMs(2345)).toBe('2.3s'));
  it('returns 10.0s for 10000', () => expect(formatMs(10000)).toBe('10.0s'));
});

// ─── WaterfallBar percentage computation ──────────────────────────────────────

function computeWaterfallPct(ms: number, totalMs: number): number {
  return Math.max(1, Math.round((ms / totalMs) * 100));
}

describe('computeWaterfallPct', () => {
  it('returns 100 for full total', () => expect(computeWaterfallPct(100, 100)).toBe(100));
  it('returns 50 for half', () => expect(computeWaterfallPct(50, 100)).toBe(50));
  it('returns minimum 1 for very small fraction', () => expect(computeWaterfallPct(1, 10000)).toBe(1));
  it('returns 25 for quarter', () => expect(computeWaterfallPct(25, 100)).toBe(25));
  it('rounds 33.3 to 33', () => expect(computeWaterfallPct(100, 300)).toBe(33));
  it('rounds 66.6 to 67', () => expect(computeWaterfallPct(200, 300)).toBe(67));
  it('handles typical DNS timing (5ms of 200ms total)', () => {
    const pct = computeWaterfallPct(5, 200);
    expect(pct).toBeGreaterThanOrEqual(1);
    expect(pct).toBeLessThan(10);
  });
});

// ─── phase sum validation ─────────────────────────────────────────────────────

interface MonitorTiming {
  id: string;
  name: string;
  avgDnsMs: number | null;
  avgTcpMs: number | null;
  avgTlsMs: number | null;
  avgTtfbMs: number | null;
  avgDownloadMs: number | null;
  avgTotalMs: number | null;
}

function sumPhases(m: MonitorTiming): number {
  return [m.avgDnsMs, m.avgTcpMs, m.avgTlsMs, m.avgTtfbMs, m.avgDownloadMs]
    .reduce<number>((sum, v) => sum + (v ?? 0), 0);
}

describe('sumPhases', () => {
  it('sums all non-null phases', () => {
    const m: MonitorTiming = {
      id: '1', name: 'test',
      avgDnsMs: 10, avgTcpMs: 20, avgTlsMs: 30, avgTtfbMs: 40, avgDownloadMs: 50,
      avgTotalMs: 150,
    };
    expect(sumPhases(m)).toBe(150);
  });

  it('treats null phases as 0', () => {
    const m: MonitorTiming = {
      id: '1', name: 'test',
      avgDnsMs: null, avgTcpMs: 50, avgTlsMs: null, avgTtfbMs: 100, avgDownloadMs: null,
      avgTotalMs: 150,
    };
    expect(sumPhases(m)).toBe(150);
  });

  it('returns 0 for all null phases', () => {
    const m: MonitorTiming = {
      id: '1', name: 'test',
      avgDnsMs: null, avgTcpMs: null, avgTlsMs: null, avgTtfbMs: null, avgDownloadMs: null,
      avgTotalMs: null,
    };
    expect(sumPhases(m)).toBe(0);
  });
});
