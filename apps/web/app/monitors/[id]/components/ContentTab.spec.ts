/**
 * Unit tests for ContentTab pure logic.
 * Tests content change detection filtering, config extraction, and baseline reset helpers.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

interface MonitorRun {
  id: string;
  ok: boolean;
  message?: string | null;
  checkedAt: string;
}

function filterContentChangedRuns(runs: MonitorRun[]): MonitorRun[] {
  return runs.filter((r) => r.message?.includes('Content changed'));
}

function hasBaselineHash(config: Record<string, unknown> | undefined): boolean {
  return Boolean(config?.contentHash);
}

function stripBaselineFromConfig(config: Record<string, unknown>): Record<string, unknown> {
  const next = { ...config };
  delete next.contentHash;
  delete next.contentHashSetAt;
  return next;
}

function formatBaselineDate(contentHashSetAt: unknown): string | null {
  if (!contentHashSetAt) return null;
  return new Date(String(contentHashSetAt)).toLocaleDateString();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ContentTab — filterContentChangedRuns', () => {
  it('keeps only runs with "Content changed" message', () => {
    const runs: MonitorRun[] = [
      { id: '1', ok: true, message: 'OK', checkedAt: '2026-01-01' },
      { id: '2', ok: false, message: 'Content changed (SHA256: abc)', checkedAt: '2026-01-02' },
      { id: '3', ok: false, message: 'Timeout', checkedAt: '2026-01-03' },
      { id: '4', ok: false, message: 'Content changed', checkedAt: '2026-01-04' },
    ];
    const result = filterContentChangedRuns(runs);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['2', '4']);
  });

  it('returns empty when no content changes', () => {
    const runs: MonitorRun[] = [
      { id: '1', ok: true, message: 'OK', checkedAt: '2026-01-01' },
    ];
    expect(filterContentChangedRuns(runs)).toHaveLength(0);
  });

  it('handles runs with null message', () => {
    const runs: MonitorRun[] = [
      { id: '1', ok: false, message: null, checkedAt: '2026-01-01' },
      { id: '2', ok: false, message: undefined, checkedAt: '2026-01-02' },
    ];
    expect(filterContentChangedRuns(runs)).toHaveLength(0);
  });
});

describe('ContentTab — hasBaselineHash', () => {
  it('returns true when contentHash is set', () => {
    expect(hasBaselineHash({ contentHash: 'abc123' })).toBe(true);
  });

  it('returns false when contentHash is missing', () => {
    expect(hasBaselineHash({})).toBe(false);
  });

  it('returns false when config is undefined', () => {
    expect(hasBaselineHash(undefined)).toBe(false);
  });

  it('returns false when contentHash is empty string', () => {
    expect(hasBaselineHash({ contentHash: '' })).toBe(false);
  });

  it('returns false when contentHash is null', () => {
    expect(hasBaselineHash({ contentHash: null })).toBe(false);
  });
});

describe('ContentTab — stripBaselineFromConfig', () => {
  it('removes contentHash and contentHashSetAt', () => {
    const config = {
      contentHash: 'abc123',
      contentHashSetAt: '2026-01-01',
      method: 'GET',
      timeout: 5000,
    };
    const result = stripBaselineFromConfig(config);
    expect(result.contentHash).toBeUndefined();
    expect(result.contentHashSetAt).toBeUndefined();
    expect(result.method).toBe('GET');
    expect(result.timeout).toBe(5000);
  });

  it('does not mutate original config', () => {
    const config = { contentHash: 'abc', other: 'value' };
    stripBaselineFromConfig(config);
    expect(config.contentHash).toBe('abc');
  });

  it('handles config without baseline fields gracefully', () => {
    const config = { method: 'POST' };
    const result = stripBaselineFromConfig(config);
    expect(result).toEqual({ method: 'POST' });
  });
});

describe('ContentTab — formatBaselineDate', () => {
  it('returns null for falsy values', () => {
    expect(formatBaselineDate(null)).toBeNull();
    expect(formatBaselineDate(undefined)).toBeNull();
    expect(formatBaselineDate('')).toBeNull();
  });

  it('formats valid ISO date string', () => {
    const result = formatBaselineDate('2026-01-15T10:00:00Z');
    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
  });
});
