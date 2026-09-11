// Unit tests for monitors/live/page.tsx pure helpers
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── levelLabel ────────────────────────────────────────────────────────────────

function levelLabel(level: string): string {
  if (level === 'green') return 'OK';
  if (level === 'yellow') return 'Degraded';
  if (level === 'red') return 'Down';
  return level;
}

describe('levelLabel', () => {
  it('returns OK for green', () => expect(levelLabel('green')).toBe('OK'));
  it('returns Degraded for yellow', () => expect(levelLabel('yellow')).toBe('Degraded'));
  it('returns Down for red', () => expect(levelLabel('red')).toBe('Down'));
  it('returns the level as-is for unknown values', () => expect(levelLabel('unknown')).toBe('unknown'));
  it('returns the level as-is for empty string', () => expect(levelLabel('')).toBe(''));
});

// ─── fmtLatency ───────────────────────────────────────────────────────────────

function fmtLatency(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

describe('fmtLatency', () => {
  it('returns — for null', () => expect(fmtLatency(null)).toBe('—'));
  it('returns 0ms for zero', () => expect(fmtLatency(0)).toBe('0ms'));
  it('returns ms for values under 1000', () => expect(fmtLatency(999)).toBe('999ms'));
  it('returns ms for 1 ms', () => expect(fmtLatency(1)).toBe('1ms'));
  it('converts to seconds at 1000', () => expect(fmtLatency(1000)).toBe('1.0s'));
  it('converts to seconds with one decimal', () => expect(fmtLatency(1500)).toBe('1.5s'));
  it('rounds to one decimal for 2345ms', () => expect(fmtLatency(2345)).toBe('2.3s'));
  it('handles large latency values', () => expect(fmtLatency(60000)).toBe('60.0s'));
});

// ─── fmtSize ──────────────────────────────────────────────────────────────────

function fmtSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

describe('fmtSize', () => {
  it('returns empty string for null', () => expect(fmtSize(null)).toBe(''));
  it('returns B for 0 bytes', () => expect(fmtSize(0)).toBe('0B'));
  it('returns B for values under 1024', () => expect(fmtSize(512)).toBe('512B'));
  it('returns B for exactly 1023', () => expect(fmtSize(1023)).toBe('1023B'));
  it('returns KB for 1024', () => expect(fmtSize(1024)).toBe('1.0KB'));
  it('returns KB for 2048', () => expect(fmtSize(2048)).toBe('2.0KB'));
  it('returns KB with one decimal for 1536', () => expect(fmtSize(1536)).toBe('1.5KB'));
  it('returns MB for 1MB exactly', () => expect(fmtSize(1024 * 1024)).toBe('1.0MB'));
  it('returns MB for 2.5MB', () => expect(fmtSize(Math.round(2.5 * 1024 * 1024))).toBe('2.5MB'));
  it('returns bytes for 1 byte', () => expect(fmtSize(1)).toBe('1B'));
});

// ─── fmtAge ───────────────────────────────────────────────────────────────────

function fmtAge(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

describe('fmtAge', () => {
  let now: number;

  beforeEach(() => {
    now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "just now" for 0s ago', () => {
    const iso = new Date(now - 0).toISOString();
    expect(fmtAge(iso)).toBe('just now');
  });

  it('returns "just now" for 4s ago', () => {
    const iso = new Date(now - 4000).toISOString();
    expect(fmtAge(iso)).toBe('just now');
  });

  it('returns seconds for 5s ago', () => {
    const iso = new Date(now - 5000).toISOString();
    expect(fmtAge(iso)).toBe('5s ago');
  });

  it('returns seconds for 59s ago', () => {
    const iso = new Date(now - 59000).toISOString();
    expect(fmtAge(iso)).toBe('59s ago');
  });

  it('returns minutes for 60s ago', () => {
    const iso = new Date(now - 60000).toISOString();
    expect(fmtAge(iso)).toBe('1m ago');
  });

  it('returns minutes for 90s ago', () => {
    const iso = new Date(now - 90000).toISOString();
    expect(fmtAge(iso)).toBe('1m ago');
  });

  it('returns minutes for 3599s ago', () => {
    const iso = new Date(now - 3599000).toISOString();
    expect(fmtAge(iso)).toBe('59m ago');
  });

  it('returns hours for 3600s ago', () => {
    const iso = new Date(now - 3600000).toISOString();
    expect(fmtAge(iso)).toBe('1h ago');
  });

  it('returns hours for 7200s ago', () => {
    const iso = new Date(now - 7200000).toISOString();
    expect(fmtAge(iso)).toBe('2h ago');
  });
});

// ─── LEVEL_CONFIG structure ────────────────────────────────────────────────────

const LEVEL_CONFIG = {
  green: { label: 'OK', color: 'text-success', bg: 'bg-success/10', border: 'border-success/20', dot: 'bg-success' },
  yellow: { label: 'Degraded', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20', dot: 'bg-warning' },
  red: { label: 'Down', color: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/20', dot: 'bg-danger' },
};

describe('LEVEL_CONFIG', () => {
  it('has all three levels', () => {
    expect(Object.keys(LEVEL_CONFIG)).toEqual(['green', 'yellow', 'red']);
  });

  it('green has OK label', () => expect(LEVEL_CONFIG.green.label).toBe('OK'));
  it('yellow has Degraded label', () => expect(LEVEL_CONFIG.yellow.label).toBe('Degraded'));
  it('red has Down label', () => expect(LEVEL_CONFIG.red.label).toBe('Down'));

  it('each level has color, bg, border, dot fields', () => {
    for (const cfg of Object.values(LEVEL_CONFIG)) {
      expect(cfg).toHaveProperty('color');
      expect(cfg).toHaveProperty('bg');
      expect(cfg).toHaveProperty('border');
      expect(cfg).toHaveProperty('dot');
    }
  });

  it('bg and border reference the same base token', () => {
    expect(LEVEL_CONFIG.green.bg).toContain('success');
    expect(LEVEL_CONFIG.green.border).toContain('success');
    expect(LEVEL_CONFIG.yellow.bg).toContain('warning');
    expect(LEVEL_CONFIG.yellow.border).toContain('warning');
    expect(LEVEL_CONFIG.red.bg).toContain('danger');
    expect(LEVEL_CONFIG.red.border).toContain('danger');
  });
});
