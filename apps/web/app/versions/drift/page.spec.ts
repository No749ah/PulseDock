import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Extracted pure helpers from versions/drift/page.tsx ─────────────────────

type DriftKind = 'major' | 'minor' | 'patch' | 'up-to-date' | 'unknown';

const KIND_CONFIG: Record<DriftKind, { label: string; bg: string; text: string; border: string }> = {
  major:        { label: 'Major',      bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/30' },
  minor:        { label: 'Minor',      bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/30' },
  patch:        { label: 'Patch',      bg: 'bg-yellow-500/10',  text: 'text-yellow-400',  border: 'border-yellow-500/30' },
  'up-to-date': { label: 'Up to date', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  unknown:      { label: 'Unknown',    bg: 'bg-zinc-700/50',    text: 'text-zinc-400',    border: 'border-zinc-600' },
};

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('versions/drift/page — KIND_CONFIG structure', () => {
  it('covers all 5 DriftKind values', () => {
    const kinds: DriftKind[] = ['major', 'minor', 'patch', 'up-to-date', 'unknown'];
    for (const kind of kinds) {
      expect(KIND_CONFIG[kind]).toBeDefined();
    }
  });

  it('major has red styling', () => {
    expect(KIND_CONFIG.major.text).toBe('text-red-400');
    expect(KIND_CONFIG.major.bg).toContain('red');
    expect(KIND_CONFIG.major.border).toContain('red');
  });

  it('minor has orange styling', () => {
    expect(KIND_CONFIG.minor.text).toBe('text-orange-400');
    expect(KIND_CONFIG.minor.bg).toContain('orange');
  });

  it('patch has yellow styling', () => {
    expect(KIND_CONFIG.patch.text).toBe('text-yellow-400');
    expect(KIND_CONFIG.patch.bg).toContain('yellow');
  });

  it('up-to-date has emerald styling', () => {
    expect(KIND_CONFIG['up-to-date'].text).toBe('text-emerald-400');
    expect(KIND_CONFIG['up-to-date'].bg).toContain('emerald');
  });

  it('unknown has zinc styling', () => {
    expect(KIND_CONFIG.unknown.text).toBe('text-zinc-400');
    expect(KIND_CONFIG.unknown.bg).toContain('zinc');
  });

  it('each kind has a non-empty label', () => {
    for (const [, cfg] of Object.entries(KIND_CONFIG)) {
      expect(cfg.label.length).toBeGreaterThan(0);
    }
  });

  it('labels are correct for each kind', () => {
    expect(KIND_CONFIG.major.label).toBe('Major');
    expect(KIND_CONFIG.minor.label).toBe('Minor');
    expect(KIND_CONFIG.patch.label).toBe('Patch');
    expect(KIND_CONFIG['up-to-date'].label).toBe('Up to date');
    expect(KIND_CONFIG.unknown.label).toBe('Unknown');
  });
});

describe('versions/drift/page — formatRelativeTime', () => {
  let now: number;
  let dateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    now = new Date('2026-04-03T01:00:00Z').getTime();
    dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  it('returns Never for null', () => {
    expect(formatRelativeTime(null)).toBe('Never');
  });

  it('returns Never for empty string', () => {
    expect(formatRelativeTime('')).toBe('Never');
  });

  it('returns 0m ago for just now (< 1 min)', () => {
    const date = new Date(now - 30000).toISOString(); // 30 seconds ago
    expect(formatRelativeTime(date)).toBe('0m ago');
  });

  it('returns 5m ago for 5 minutes ago', () => {
    const date = new Date(now - 5 * 60000).toISOString();
    expect(formatRelativeTime(date)).toBe('5m ago');
  });

  it('returns 59m ago just before 60 minutes', () => {
    const date = new Date(now - 59 * 60000).toISOString();
    expect(formatRelativeTime(date)).toBe('59m ago');
  });

  it('returns 1h ago at exactly 60 minutes', () => {
    const date = new Date(now - 60 * 60000).toISOString();
    expect(formatRelativeTime(date)).toBe('1h ago');
  });

  it('returns 2h ago for 120 minutes', () => {
    const date = new Date(now - 120 * 60000).toISOString();
    expect(formatRelativeTime(date)).toBe('2h ago');
  });

  it('returns 23h ago just before 24 hours', () => {
    const date = new Date(now - 23 * 3600000).toISOString();
    expect(formatRelativeTime(date)).toBe('23h ago');
  });

  it('returns 1d ago at exactly 24 hours', () => {
    const date = new Date(now - 24 * 3600000).toISOString();
    expect(formatRelativeTime(date)).toBe('1d ago');
  });

  it('returns 7d ago for one week', () => {
    const date = new Date(now - 7 * 24 * 3600000).toISOString();
    expect(formatRelativeTime(date)).toBe('7d ago');
  });

  it('returns 30d ago for 30 days', () => {
    const date = new Date(now - 30 * 24 * 3600000).toISOString();
    expect(formatRelativeTime(date)).toBe('30d ago');
  });
});
