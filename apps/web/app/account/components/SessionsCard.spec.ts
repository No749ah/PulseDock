/**
 * Unit tests for SessionsCard pure logic.
 * Tests active session filtering, "revoke others" button visibility, and session display logic.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

interface Session {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  revokedAt: string | null;
  createdAt: string;
}

function getActiveSessions(sessions: Session[]): Session[] {
  return sessions.filter((s) => !s.revokedAt);
}

function getRevokedSessions(sessions: Session[]): Session[] {
  return sessions.filter((s) => s.revokedAt !== null);
}

function showRevokeOthers(sessions: Session[]): boolean {
  return getActiveSessions(sessions).length > 1;
}

function activeSessionCount(sessions: Session[]): number {
  return getActiveSessions(sessions).length;
}

function activeSessionLabel(count: number): string {
  return `${count} active`;
}

function parseUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  if (ua.includes('Edg/')) return 'Microsoft Edge';
  if (ua.includes('Chrome')) return 'Chrome Browser';
  if (ua.includes('Firefox')) return 'Firefox Browser';
  if (ua.includes('Safari')) return 'Safari Browser';
  if (ua.includes('curl')) return 'API Client (curl)';
  if (ua.includes('python')) return 'Python Client';
  if (ua.includes('node')) return 'Node.js Client';
  return ua.length > 50 ? ua.slice(0, 50) + '…' : ua;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(id: string, revokedAt: string | null = null): Session {
  return {
    id,
    userAgent: null,
    ipAddress: '127.0.0.1',
    revokedAt,
    createdAt: new Date().toISOString(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SessionsCard — getActiveSessions', () => {
  it('returns all sessions when none revoked', () => {
    const sessions = [makeSession('a'), makeSession('b')];
    expect(getActiveSessions(sessions)).toHaveLength(2);
  });

  it('filters out revoked sessions', () => {
    const sessions = [
      makeSession('a'),
      makeSession('b', '2026-01-01T00:00:00Z'),
      makeSession('c'),
    ];
    const active = getActiveSessions(sessions);
    expect(active).toHaveLength(2);
    expect(active.map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('returns empty array when all revoked', () => {
    const sessions = [makeSession('a', '2026-01-01T00:00:00Z')];
    expect(getActiveSessions(sessions)).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(getActiveSessions([])).toHaveLength(0);
  });
});

describe('SessionsCard — getRevokedSessions', () => {
  it('returns only revoked sessions', () => {
    const sessions = [
      makeSession('a'),
      makeSession('b', '2026-01-01T00:00:00Z'),
    ];
    const revoked = getRevokedSessions(sessions);
    expect(revoked).toHaveLength(1);
    expect(revoked[0].id).toBe('b');
  });
});

describe('SessionsCard — showRevokeOthers', () => {
  it('returns false for 0 active sessions', () => {
    expect(showRevokeOthers([])).toBe(false);
  });

  it('returns false for exactly 1 active session', () => {
    const sessions = [makeSession('a')];
    expect(showRevokeOthers(sessions)).toBe(false);
  });

  it('returns true for 2+ active sessions', () => {
    const sessions = [makeSession('a'), makeSession('b')];
    expect(showRevokeOthers(sessions)).toBe(true);
  });

  it('counts only active sessions (not revoked)', () => {
    const sessions = [
      makeSession('a'),
      makeSession('b', '2026-01-01T00:00:00Z'), // revoked
    ];
    // Only 1 active → no "Revoke others"
    expect(showRevokeOthers(sessions)).toBe(false);
  });
});

describe('SessionsCard — activeSessionLabel', () => {
  it('0 active → "0 active"', () => expect(activeSessionLabel(0)).toBe('0 active'));
  it('1 active → "1 active"', () => expect(activeSessionLabel(1)).toBe('1 active'));
  it('5 active → "5 active"', () => expect(activeSessionLabel(5)).toBe('5 active'));
});

describe('SessionsCard — parseUserAgent', () => {
  it('null → "Unknown device"', () => expect(parseUserAgent(null)).toBe('Unknown device'));
  it('undefined → "Unknown device"', () => expect(parseUserAgent(undefined)).toBe('Unknown device'));
  it('empty string → "Unknown device"', () => expect(parseUserAgent('')).toBe('Unknown device'));

  it('Edge UA → "Microsoft Edge"', () => {
    expect(parseUserAgent('Mozilla/5.0 ... Edg/99.0')).toBe('Microsoft Edge');
  });

  it('Chrome UA → "Chrome Browser"', () => {
    expect(parseUserAgent('Mozilla/5.0 ... Chrome/120.0')).toBe('Chrome Browser');
  });

  it('Firefox UA → "Firefox Browser"', () => {
    expect(parseUserAgent('Mozilla/5.0 ... Firefox/115.0')).toBe('Firefox Browser');
  });

  it('Safari UA → "Safari Browser"', () => {
    expect(parseUserAgent('Mozilla/5.0 ... Safari/537.36')).toBe('Safari Browser');
  });

  it('curl UA → "API Client (curl)"', () => {
    expect(parseUserAgent('curl/7.88.1')).toBe('API Client (curl)');
  });

  it('python UA → "Python Client"', () => {
    expect(parseUserAgent('python-requests/2.28.2')).toBe('Python Client');
  });

  it('node UA → "Node.js Client"', () => {
    expect(parseUserAgent('node-fetch/2.6.7')).toBe('Node.js Client');
  });

  it('long unknown UA → truncated to 50 chars + ellipsis', () => {
    const longUA = 'X'.repeat(60);
    const result = parseUserAgent(longUA);
    expect(result.length).toBeLessThanOrEqual(53); // 50 + "…"
    expect(result.endsWith('…')).toBe(true);
  });

  it('short unknown UA → returned as-is', () => {
    const shortUA = 'MyCustomAgent/1.0';
    expect(parseUserAgent(shortUA)).toBe(shortUA);
  });
});
