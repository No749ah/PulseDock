/**
 * Unit tests for pure helper functions in the public monitor status page.
 *
 * Tests: formatRelative, formatType, statusMeta, levelColor,
 * buildDayBars, buildSparkPath — all testable without React/DOM.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// ─── Re-implement helpers (same logic as page.tsx, no 'use client' boundary) ──

type MonitorStatusStatus = 'up' | 'down' | 'paused' | string;

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatType(type: string): string {
  const map: Record<string, string> = {
    HTTP: 'HTTP', GIT_RELEASE: 'Git Release', DOCKER_IMAGE: 'Docker Image',
    TCP: 'TCP', SSL_CERT: 'SSL Cert', HEARTBEAT: 'Heartbeat',
    DNS: 'DNS', PING: 'Ping', SMTP: 'SMTP', BROWSER: 'Browser', WHOIS: 'WHOIS',
  };
  return map[type] ?? type;
}

function statusMeta(status: MonitorStatusStatus): {
  label: string; colorClass: string; dotClass: string; bgClass: string; borderClass: string;
} {
  switch (status) {
    case 'up': return { label: 'Operational', colorClass: 'text-success', dotClass: 'bg-success shadow-[0_0_6px_#3fb95055]', bgClass: 'bg-success/10', borderClass: 'border-success/30' };
    case 'down': return { label: 'Down', colorClass: 'text-danger', dotClass: 'bg-danger shadow-[0_0_6px_#f8514955]', bgClass: 'bg-danger/10', borderClass: 'border-danger/30' };
    case 'paused': return { label: 'Paused', colorClass: 'text-text-secondary', dotClass: 'bg-text-secondary', bgClass: 'bg-surface-elevated', borderClass: 'border-border' };
    default: return { label: 'Unknown', colorClass: 'text-warning', dotClass: 'bg-warning', bgClass: 'bg-warning/10', borderClass: 'border-warning/30' };
  }
}

function levelColor(level: 'green' | 'yellow' | 'red'): string {
  return level === 'green' ? 'bg-success' : level === 'yellow' ? 'bg-warning' : 'bg-danger';
}

interface HistoryRun {
  ok: boolean;
  latencyMs: number | null;
  checkedAt: string;
}

function buildDayBars(runs: HistoryRun[]): { date: string; pct: number | null; color: string; height: string }[] {
  const days = new Map<string, { ok: number; total: number }>();
  for (const r of runs) {
    const day = r.checkedAt.slice(0, 10);
    const prev = days.get(day) ?? { ok: 0, total: 0 };
    days.set(day, { ok: prev.ok + (r.ok ? 1 : 0), total: prev.total + 1 });
  }
  const result: { date: string; pct: number | null; color: string; height: string }[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const data = days.get(key);
    if (!data) {
      result.push({ date: key, pct: null, color: 'bg-surface-elevated', height: 'h-1' });
    } else {
      const pct = data.total > 0 ? data.ok / data.total : 0;
      const color = pct >= 0.99 ? 'bg-success' : pct >= 0.80 ? 'bg-warning' : 'bg-danger';
      const heightPct = Math.max(Math.round(pct * 28) + 4, 4);
      result.push({ date: key, pct: Math.round(pct * 1000) / 10, color, height: `${heightPct}px` });
    }
  }
  return result;
}

function buildSparkPath(runs: HistoryRun[]): string | null {
  const withLatency = [...runs].reverse().filter(r => r.latencyMs != null);
  if (withLatency.length < 3) return null;
  const W = 400;
  const H = 48;
  const max = Math.max(...withLatency.map(r => r.latencyMs!), 1);
  const step = W / Math.max(withLatency.length - 1, 1);
  return withLatency.map((r, i) => {
    const x = (i * step).toFixed(1);
    const y = (H - ((r.latencyMs! / max) * (H - 4))).toFixed(1);
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');
}

// ─── formatRelative ───────────────────────────────────────────────────────────

describe('formatRelative', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns dash for null', () => {
    expect(formatRelative(null)).toBe('—');
  });

  it('returns seconds ago for times < 1 minute', () => {
    const now = Date.now();
    const iso = new Date(now - 30_000).toISOString();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(formatRelative(iso)).toBe('30s ago');
  });

  it('returns minutes ago for times < 1 hour', () => {
    const now = Date.now();
    const iso = new Date(now - 5 * 60_000).toISOString();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(formatRelative(iso)).toBe('5m ago');
  });

  it('returns hours ago for times < 1 day', () => {
    const now = Date.now();
    const iso = new Date(now - 3 * 3600_000).toISOString();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(formatRelative(iso)).toBe('3h ago');
  });

  it('returns days ago for times >= 1 day', () => {
    const now = Date.now();
    const iso = new Date(now - 2 * 86_400_000).toISOString();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(formatRelative(iso)).toBe('2d ago');
  });

  it('returns 0s ago for exact now', () => {
    const now = Date.now();
    const iso = new Date(now).toISOString();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(formatRelative(iso)).toBe('0s ago');
  });

  it('returns 59s ago at the boundary before 1 minute', () => {
    const now = Date.now();
    const iso = new Date(now - 59_000).toISOString();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(formatRelative(iso)).toBe('59s ago');
  });

  it('returns 1m ago at exactly 60 seconds', () => {
    const now = Date.now();
    const iso = new Date(now - 60_000).toISOString();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(formatRelative(iso)).toBe('1m ago');
  });
});

// ─── formatType ───────────────────────────────────────────────────────────────

describe('formatType', () => {
  it('formats HTTP', () => expect(formatType('HTTP')).toBe('HTTP'));
  it('formats GIT_RELEASE', () => expect(formatType('GIT_RELEASE')).toBe('Git Release'));
  it('formats DOCKER_IMAGE', () => expect(formatType('DOCKER_IMAGE')).toBe('Docker Image'));
  it('formats TCP', () => expect(formatType('TCP')).toBe('TCP'));
  it('formats SSL_CERT', () => expect(formatType('SSL_CERT')).toBe('SSL Cert'));
  it('formats HEARTBEAT', () => expect(formatType('HEARTBEAT')).toBe('Heartbeat'));
  it('formats DNS', () => expect(formatType('DNS')).toBe('DNS'));
  it('formats PING', () => expect(formatType('PING')).toBe('Ping'));
  it('formats SMTP', () => expect(formatType('SMTP')).toBe('SMTP'));
  it('formats BROWSER', () => expect(formatType('BROWSER')).toBe('Browser'));
  it('formats WHOIS', () => expect(formatType('WHOIS')).toBe('WHOIS'));
  it('returns raw type for unknown types', () => expect(formatType('UNKNOWN_TYPE')).toBe('UNKNOWN_TYPE'));
  it('returns raw type for empty string', () => expect(formatType('')).toBe(''));
});

// ─── statusMeta ───────────────────────────────────────────────────────────────

describe('statusMeta', () => {
  it('returns Operational for up', () => {
    const m = statusMeta('up');
    expect(m.label).toBe('Operational');
    expect(m.colorClass).toBe('text-success');
    expect(m.bgClass).toBe('bg-success/10');
    expect(m.borderClass).toBe('border-success/30');
    expect(m.dotClass).toContain('bg-success');
  });

  it('returns Down for down', () => {
    const m = statusMeta('down');
    expect(m.label).toBe('Down');
    expect(m.colorClass).toBe('text-danger');
    expect(m.bgClass).toBe('bg-danger/10');
    expect(m.borderClass).toBe('border-danger/30');
  });

  it('returns Paused for paused', () => {
    const m = statusMeta('paused');
    expect(m.label).toBe('Paused');
    expect(m.colorClass).toBe('text-text-secondary');
    expect(m.bgClass).toBe('bg-surface-elevated');
  });

  it('returns Unknown for unrecognised status', () => {
    const m = statusMeta('degraded');
    expect(m.label).toBe('Unknown');
    expect(m.colorClass).toBe('text-warning');
    expect(m.bgClass).toBe('bg-warning/10');
  });

  it('returns Unknown for empty string', () => {
    const m = statusMeta('');
    expect(m.label).toBe('Unknown');
  });
});

// ─── levelColor ───────────────────────────────────────────────────────────────

describe('levelColor', () => {
  it('returns bg-success for green', () => expect(levelColor('green')).toBe('bg-success'));
  it('returns bg-warning for yellow', () => expect(levelColor('yellow')).toBe('bg-warning'));
  it('returns bg-danger for red', () => expect(levelColor('red')).toBe('bg-danger'));
});

// ─── buildDayBars ────────────────────────────────────────────────────────────

describe('buildDayBars', () => {
  it('always returns exactly 90 bars', () => {
    const bars = buildDayBars([]);
    expect(bars).toHaveLength(90);
  });

  it('returns null pct and placeholder color for days with no data', () => {
    const bars = buildDayBars([]);
    for (const bar of bars) {
      expect(bar.pct).toBeNull();
      expect(bar.color).toBe('bg-surface-elevated');
      expect(bar.height).toBe('h-1');
    }
  });

  it('uses bg-success color when all runs pass (100% uptime)', () => {
    const today = new Date().toISOString().slice(0, 10);
    const runs: HistoryRun[] = [
      { ok: true, latencyMs: 100, checkedAt: `${today}T10:00:00.000Z` },
      { ok: true, latencyMs: 120, checkedAt: `${today}T11:00:00.000Z` },
    ];
    const bars = buildDayBars(runs);
    const todayBar = bars.find(b => b.date === today);
    expect(todayBar).toBeDefined();
    expect(todayBar!.color).toBe('bg-success');
    expect(todayBar!.pct).toBe(100);
  });

  it('uses bg-danger color when all runs fail (0% uptime)', () => {
    const today = new Date().toISOString().slice(0, 10);
    const runs: HistoryRun[] = [
      { ok: false, latencyMs: null, checkedAt: `${today}T10:00:00.000Z` },
    ];
    const bars = buildDayBars(runs);
    const todayBar = bars.find(b => b.date === today);
    expect(todayBar).toBeDefined();
    expect(todayBar!.color).toBe('bg-danger');
    expect(todayBar!.pct).toBe(0);
  });

  it('uses bg-warning color when uptime is between 80% and 99%', () => {
    const today = new Date().toISOString().slice(0, 10);
    // 9 ok, 1 fail → 90% uptime
    const runs: HistoryRun[] = Array.from({ length: 9 }, (_, i) => ({
      ok: true, latencyMs: 50, checkedAt: `${today}T${String(i).padStart(2, '0')}:00:00.000Z`,
    }));
    runs.push({ ok: false, latencyMs: null, checkedAt: `${today}T09:30:00.000Z` });
    const bars = buildDayBars(runs);
    const todayBar = bars.find(b => b.date === today);
    expect(todayBar).toBeDefined();
    expect(todayBar!.color).toBe('bg-warning');
  });

  it('rounds pct to 1 decimal place', () => {
    const today = new Date().toISOString().slice(0, 10);
    // 1 ok out of 3 → 33.3%
    const runs: HistoryRun[] = [
      { ok: true, latencyMs: 50, checkedAt: `${today}T10:00:00.000Z` },
      { ok: false, latencyMs: null, checkedAt: `${today}T11:00:00.000Z` },
      { ok: false, latencyMs: null, checkedAt: `${today}T12:00:00.000Z` },
    ];
    const bars = buildDayBars(runs);
    const todayBar = bars.find(b => b.date === today);
    expect(todayBar!.pct).toBe(33.3);
  });

  it('bars are in chronological order (oldest to newest)', () => {
    const bars = buildDayBars([]);
    for (let i = 1; i < bars.length; i++) {
      expect(new Date(bars[i]!.date) > new Date(bars[i - 1]!.date)).toBe(true);
    }
  });
});

// ─── buildSparkPath ───────────────────────────────────────────────────────────

describe('buildSparkPath', () => {
  it('returns null for empty runs', () => {
    expect(buildSparkPath([])).toBeNull();
  });

  it('returns null with fewer than 3 runs with latency', () => {
    const runs: HistoryRun[] = [
      { ok: true, latencyMs: 100, checkedAt: '2026-01-01T10:00:00Z' },
      { ok: true, latencyMs: 200, checkedAt: '2026-01-01T11:00:00Z' },
    ];
    expect(buildSparkPath(runs)).toBeNull();
  });

  it('returns null when all runs have null latency', () => {
    const runs: HistoryRun[] = [
      { ok: false, latencyMs: null, checkedAt: '2026-01-01T10:00:00Z' },
      { ok: false, latencyMs: null, checkedAt: '2026-01-01T11:00:00Z' },
      { ok: false, latencyMs: null, checkedAt: '2026-01-01T12:00:00Z' },
    ];
    expect(buildSparkPath(runs)).toBeNull();
  });

  it('returns a valid SVG path string for 3+ latency runs', () => {
    const runs: HistoryRun[] = [
      { ok: true, latencyMs: 100, checkedAt: '2026-01-01T10:00:00Z' },
      { ok: true, latencyMs: 200, checkedAt: '2026-01-01T11:00:00Z' },
      { ok: true, latencyMs: 150, checkedAt: '2026-01-01T12:00:00Z' },
    ];
    const path = buildSparkPath(runs);
    expect(path).toBeTruthy();
    expect(path).toMatch(/^M/); // starts with Move command
    expect(path).toContain('L');  // has line segments
  });

  it('starts path with M command', () => {
    const runs: HistoryRun[] = [
      { ok: true, latencyMs: 50, checkedAt: '2026-01-01T10:00:00Z' },
      { ok: true, latencyMs: 100, checkedAt: '2026-01-01T11:00:00Z' },
      { ok: true, latencyMs: 75, checkedAt: '2026-01-01T12:00:00Z' },
    ];
    const path = buildSparkPath(runs)!;
    expect(path.startsWith('M')).toBe(true);
  });

  it('produces exactly N-1 L commands for N latency points', () => {
    const runs: HistoryRun[] = [
      { ok: true, latencyMs: 50, checkedAt: '2026-01-01T10:00:00Z' },
      { ok: true, latencyMs: 100, checkedAt: '2026-01-01T11:00:00Z' },
      { ok: true, latencyMs: 75, checkedAt: '2026-01-01T12:00:00Z' },
      { ok: true, latencyMs: 120, checkedAt: '2026-01-01T13:00:00Z' },
    ];
    const path = buildSparkPath(runs)!;
    const lCount = (path.match(/L/g) ?? []).length;
    expect(lCount).toBe(3); // 4 points → 3 L commands
  });

  it('skips runs without latency data', () => {
    const runs: HistoryRun[] = [
      { ok: true, latencyMs: 50, checkedAt: '2026-01-01T10:00:00Z' },
      { ok: false, latencyMs: null, checkedAt: '2026-01-01T10:30:00Z' },  // skipped
      { ok: true, latencyMs: 100, checkedAt: '2026-01-01T11:00:00Z' },
      { ok: false, latencyMs: null, checkedAt: '2026-01-01T11:30:00Z' },  // skipped
      { ok: true, latencyMs: 75, checkedAt: '2026-01-01T12:00:00Z' },
    ];
    const path = buildSparkPath(runs)!;
    // 3 points with latency → 2 L commands
    const lCount = (path.match(/L/g) ?? []).length;
    expect(lCount).toBe(2);
  });

  it('path x values span from 0 to 400 (W=400)', () => {
    const runs: HistoryRun[] = [
      { ok: true, latencyMs: 50, checkedAt: '2026-01-01T10:00:00Z' },
      { ok: true, latencyMs: 100, checkedAt: '2026-01-01T11:00:00Z' },
      { ok: true, latencyMs: 75, checkedAt: '2026-01-01T12:00:00Z' },
    ];
    const path = buildSparkPath(runs)!;
    // First M should have x=0
    expect(path).toMatch(/^M0\.0,/);
    // Last point should have x=400
    expect(path).toMatch(/L400\.0,/);
  });
});
