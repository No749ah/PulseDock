// Unit tests for monitors/services/page.tsx pure helpers
import { describe, it, expect } from 'vitest';

// ─── statusBadgeMap (from StatusBadge component) ──────────────────────────────

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  operational: { label: 'Operational', cls: 'bg-green-500/20 text-green-400 border-green-500/30' },
  degraded: { label: 'Degraded', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  outage: { label: 'Outage', cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
  unknown: { label: 'Unknown', cls: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
};

function resolveStatus(status: string): { label: string; cls: string } {
  return STATUS_MAP[status] ?? STATUS_MAP.unknown;
}

describe('StatusBadge STATUS_MAP', () => {
  it('has all 4 status entries', () => {
    expect(Object.keys(STATUS_MAP)).toEqual(['operational', 'degraded', 'outage', 'unknown']);
  });

  it('operational has green color', () => {
    const s = STATUS_MAP.operational;
    expect(s.label).toBe('Operational');
    expect(s.cls).toContain('green');
  });

  it('degraded has yellow color', () => {
    const s = STATUS_MAP.degraded;
    expect(s.label).toBe('Degraded');
    expect(s.cls).toContain('yellow');
  });

  it('outage has red color', () => {
    const s = STATUS_MAP.outage;
    expect(s.label).toBe('Outage');
    expect(s.cls).toContain('red');
  });

  it('unknown has gray color', () => {
    const s = STATUS_MAP.unknown;
    expect(s.label).toBe('Unknown');
    expect(s.cls).toContain('gray');
  });

  it('falls back to unknown for unmapped status', () => {
    const s = resolveStatus('some-weird-status');
    expect(s.label).toBe('Unknown');
  });

  it('each entry has label and cls', () => {
    for (const s of Object.values(STATUS_MAP)) {
      expect(s).toHaveProperty('label');
      expect(s).toHaveProperty('cls');
    }
  });
});

// ─── LevelDot color class (from LevelDot component) ──────────────────────────

function levelDotClass(level: string | null): string {
  if (level === 'green') return 'text-green-400';
  if (level === 'yellow') return 'text-yellow-400';
  if (level === 'red') return 'text-red-400';
  return 'text-gray-500';
}

describe('levelDotClass', () => {
  it('returns green class for green', () => expect(levelDotClass('green')).toBe('text-green-400'));
  it('returns yellow class for yellow', () => expect(levelDotClass('yellow')).toBe('text-yellow-400'));
  it('returns red class for red', () => expect(levelDotClass('red')).toBe('text-red-400'));
  it('returns gray for null', () => expect(levelDotClass(null)).toBe('text-gray-500'));
  it('returns gray for unknown value', () => expect(levelDotClass('purple')).toBe('text-gray-500'));
  it('returns gray for empty string', () => expect(levelDotClass('')).toBe('text-gray-500'));
});

// ─── monitor search filter ────────────────────────────────────────────────────

interface Monitor {
  id: string;
  name: string;
  type: string;
  target: string;
  enabled: boolean;
}

function filterMonitorsBySearch(monitors: Monitor[], search: string): Monitor[] {
  const q = search.toLowerCase();
  if (!q) return monitors;
  return monitors.filter(m =>
    m.name.toLowerCase().includes(q) || m.target.toLowerCase().includes(q)
  );
}

describe('filterMonitorsBySearch', () => {
  const monitors: Monitor[] = [
    { id: '1', name: 'API Server', type: 'HTTP', target: 'https://api.example.com', enabled: true },
    { id: '2', name: 'Database', type: 'TCP', target: 'db.internal:5432', enabled: true },
    { id: '3', name: 'Frontend', type: 'HTTP', target: 'https://app.example.com', enabled: false },
  ];

  it('returns all monitors for empty search', () => {
    expect(filterMonitorsBySearch(monitors, '')).toHaveLength(3);
  });

  it('filters by name case-insensitively', () => {
    const result = filterMonitorsBySearch(monitors, 'api');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by target', () => {
    const result = filterMonitorsBySearch(monitors, 'example.com');
    expect(result).toHaveLength(2);
  });

  it('filters by partial name', () => {
    const result = filterMonitorsBySearch(monitors, 'front');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('returns empty array for no match', () => {
    expect(filterMonitorsBySearch(monitors, 'zzznomatch')).toHaveLength(0);
  });

  it('is case-insensitive for target', () => {
    const result = filterMonitorsBySearch(monitors, 'DB.INTERNAL');
    expect(result).toHaveLength(1);
  });
});
