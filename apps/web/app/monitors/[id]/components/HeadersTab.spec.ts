/**
 * Unit tests for HeadersTab pure logic.
 * Tests tracked header parsing, baseline comparison, and header count label.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

function parseTrackedHeaders(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function headerCountLabel(count: number): string {
  return `${count} header${count !== 1 ? 's' : ''}`;
}

function headerChanged(
  baseline: Record<string, string | null> | null | undefined,
  headerName: string,
  currentValue: string | null | undefined,
): boolean {
  if (!baseline) return false;
  const baselineValue = baseline[headerName];
  if (baselineValue === undefined) return false; // not tracked
  return baselineValue !== (currentValue ?? null);
}

function hasBaseline(
  baseline: Record<string, string | null> | null | undefined,
): boolean {
  if (!baseline) return false;
  return Object.keys(baseline).length > 0;
}

function headerChangeClass(changed: boolean): string {
  return changed ? 'text-yellow-400' : 'text-text-muted';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HeadersTab — parseTrackedHeaders', () => {
  it('parses comma-separated headers', () => {
    const result = parseTrackedHeaders('content-type, x-ratelimit-limit, server');
    expect(result).toEqual(['content-type', 'x-ratelimit-limit', 'server']);
  });

  it('lowercases all header names', () => {
    const result = parseTrackedHeaders('Content-Type,X-Frame-Options');
    expect(result).toEqual(['content-type', 'x-frame-options']);
  });

  it('removes empty entries from double commas', () => {
    const result = parseTrackedHeaders('a,,b');
    expect(result).toEqual(['a', 'b']);
  });

  it('returns empty array for null', () => {
    expect(parseTrackedHeaders(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(parseTrackedHeaders(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseTrackedHeaders('')).toEqual([]);
  });

  it('trims whitespace around each header name', () => {
    expect(parseTrackedHeaders('  server  , content-type  ')).toEqual(['server', 'content-type']);
  });

  it('single header parses correctly', () => {
    expect(parseTrackedHeaders('server')).toEqual(['server']);
  });
});

describe('HeadersTab — headerCountLabel', () => {
  it('singular for 1', () => expect(headerCountLabel(1)).toBe('1 header'));
  it('plural for 0', () => expect(headerCountLabel(0)).toBe('0 headers'));
  it('plural for 2+', () => {
    expect(headerCountLabel(2)).toBe('2 headers');
    expect(headerCountLabel(10)).toBe('10 headers');
  });
});

describe('HeadersTab — headerChanged', () => {
  it('returns false when no baseline', () => {
    expect(headerChanged(null, 'server', 'nginx')).toBe(false);
    expect(headerChanged(undefined, 'server', 'nginx')).toBe(false);
  });

  it('returns false when header not in baseline (not tracked)', () => {
    expect(headerChanged({ 'content-type': 'text/html' }, 'server', 'nginx')).toBe(false);
  });

  it('returns false when value matches baseline', () => {
    expect(headerChanged({ server: 'nginx/1.20' }, 'server', 'nginx/1.20')).toBe(false);
  });

  it('returns true when value differs from baseline', () => {
    expect(headerChanged({ server: 'nginx/1.20' }, 'server', 'nginx/1.21')).toBe(true);
  });

  it('returns true when baseline has value but current is null', () => {
    expect(headerChanged({ server: 'nginx' }, 'server', null)).toBe(true);
  });

  it('returns true when baseline is null but current has value', () => {
    // baseline[header] = null means it was absent before
    expect(headerChanged({ server: null }, 'server', 'nginx')).toBe(true);
  });

  it('returns false when both baseline and current are null', () => {
    expect(headerChanged({ server: null }, 'server', null)).toBe(false);
  });
});

describe('HeadersTab — hasBaseline', () => {
  it('returns false for null baseline', () => {
    expect(hasBaseline(null)).toBe(false);
  });

  it('returns false for undefined baseline', () => {
    expect(hasBaseline(undefined)).toBe(false);
  });

  it('returns false for empty baseline object', () => {
    expect(hasBaseline({})).toBe(false);
  });

  it('returns true when baseline has entries', () => {
    expect(hasBaseline({ server: 'nginx' })).toBe(true);
  });
});

describe('HeadersTab — headerChangeClass', () => {
  it('changed → yellow warning class', () => {
    expect(headerChangeClass(true)).toBe('text-yellow-400');
  });

  it('unchanged → muted class', () => {
    expect(headerChangeClass(false)).toBe('text-text-muted');
  });
});

describe('HeadersTab — real-world header tracking scenarios', () => {
  const baseline = {
    'content-type': 'text/html; charset=utf-8',
    'x-frame-options': 'DENY',
    'server': 'nginx/1.20.2',
    'strict-transport-security': 'max-age=31536000',
  };

  it('detects server version change', () => {
    expect(headerChanged(baseline, 'server', 'nginx/1.22.0')).toBe(true);
  });

  it('does not flag unchanged security headers', () => {
    expect(headerChanged(baseline, 'x-frame-options', 'DENY')).toBe(false);
    expect(headerChanged(baseline, 'strict-transport-security', 'max-age=31536000')).toBe(false);
  });

  it('detects content-type change', () => {
    expect(headerChanged(baseline, 'content-type', 'application/json')).toBe(true);
  });

  it('parses tracked headers into 4 tracked names', () => {
    const raw = 'content-type, x-frame-options, server, strict-transport-security';
    expect(parseTrackedHeaders(raw)).toHaveLength(4);
  });
});
