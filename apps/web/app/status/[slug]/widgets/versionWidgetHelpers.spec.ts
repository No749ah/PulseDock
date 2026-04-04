import { describe, it, expect } from 'vitest';

// ── Inline helpers (mirrored from versionWidgetHelpers.ts) ─────────────────

function parseVersionFromMessage(msg: string | null): { current: string | null; latest: string | null } {
  if (!msg) return { current: null, latest: null };
  const m = msg.match(/current\s+([^\s,]+)[,\s]+latest\s+([^\s,]+)/i);
  return m ? { current: m[1], latest: m[2] } : { current: null, latest: null };
}

function classifyVersionDiff(current: string, latest: string): 'up-to-date' | 'patch' | 'minor' | 'major' {
  const c = current.replace(/^v/i, '').split('.');
  const l = latest.replace(/^v/i, '').split('.');
  if (c[0] !== l[0]) return 'major';
  if (c[1] !== l[1]) return 'minor';
  if (c[2] !== l[2]) return 'patch';
  return 'up-to-date';
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('parseVersionFromMessage', () => {
  it('returns nulls for null input', () => {
    expect(parseVersionFromMessage(null)).toEqual({ current: null, latest: null });
  });

  it('returns nulls for empty string', () => {
    expect(parseVersionFromMessage('')).toEqual({ current: null, latest: null });
  });

  it('parses "current X, latest Y" format', () => {
    expect(parseVersionFromMessage('current 1.2.3, latest 1.3.0')).toEqual({
      current: '1.2.3',
      latest: '1.3.0',
    });
  });

  it('parses case-insensitively', () => {
    expect(parseVersionFromMessage('Current v2.0.0, Latest v3.0.0')).toEqual({
      current: 'v2.0.0',
      latest: 'v3.0.0',
    });
  });

  it('handles whitespace instead of comma', () => {
    expect(parseVersionFromMessage('current 1.0.0 latest 2.0.0')).toEqual({
      current: '1.0.0',
      latest: '2.0.0',
    });
  });

  it('returns nulls for unrecognized format', () => {
    expect(parseVersionFromMessage('version 1.0.0 is outdated')).toEqual({
      current: null,
      latest: null,
    });
  });
});

describe('classifyVersionDiff', () => {
  it('returns "up-to-date" when versions match', () => {
    expect(classifyVersionDiff('1.2.3', '1.2.3')).toBe('up-to-date');
  });

  it('returns "up-to-date" with v prefix', () => {
    expect(classifyVersionDiff('v1.2.3', 'v1.2.3')).toBe('up-to-date');
  });

  it('returns "patch" for patch difference', () => {
    expect(classifyVersionDiff('1.2.3', '1.2.4')).toBe('patch');
  });

  it('returns "minor" for minor difference', () => {
    expect(classifyVersionDiff('1.2.3', '1.3.0')).toBe('minor');
  });

  it('returns "major" for major difference', () => {
    expect(classifyVersionDiff('1.2.3', '2.0.0')).toBe('major');
  });

  it('strips v prefix before comparing', () => {
    expect(classifyVersionDiff('v1.0.0', '1.0.1')).toBe('patch');
    expect(classifyVersionDiff('1.0.0', 'V2.0.0')).toBe('major');
  });

  it('returns "major" when major differs even if minor/patch also differ', () => {
    expect(classifyVersionDiff('1.2.3', '2.5.9')).toBe('major');
  });

  it('returns "minor" when minor differs even if patch also differs', () => {
    expect(classifyVersionDiff('1.2.3', '1.5.9')).toBe('minor');
  });
});
