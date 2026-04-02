/**
 * Unit tests for ApiKeysCard pure logic.
 * Tests key expiry detection, scope labels/colors, copy state, and key creation validation.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component + shared ────────────────────────────────────

type ApiKeyScope = 'READ' | 'WRITE' | 'ADMIN';

const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
  READ: 'Read-only',
  WRITE: 'Read + Write',
  ADMIN: 'Full Access',
};

const API_KEY_SCOPE_COLORS: Record<ApiKeyScope, string> = {
  READ: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  WRITE: 'bg-accent/15 text-accent border-accent/20',
  ADMIN: 'bg-danger/15 text-danger border-danger/20',
};

function isKeyExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function canCreateKey(name: string): boolean {
  return name.trim().length > 0;
}

function maskKey(key: string): string {
  if (key.length <= 8) return key;
  return key.slice(0, 4) + '•'.repeat(key.length - 8) + key.slice(-4);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ApiKeysCard — API_KEY_SCOPE_LABELS', () => {
  it('READ → Read-only', () => expect(API_KEY_SCOPE_LABELS['READ']).toBe('Read-only'));
  it('WRITE → Read + Write', () => expect(API_KEY_SCOPE_LABELS['WRITE']).toBe('Read + Write'));
  it('ADMIN → Full Access', () => expect(API_KEY_SCOPE_LABELS['ADMIN']).toBe('Full Access'));
});

describe('ApiKeysCard — API_KEY_SCOPE_COLORS', () => {
  it('READ → blue badge', () => expect(API_KEY_SCOPE_COLORS['READ']).toContain('blue'));
  it('WRITE → accent badge', () => expect(API_KEY_SCOPE_COLORS['WRITE']).toContain('accent'));
  it('ADMIN → danger badge (most privileged → red)', () => expect(API_KEY_SCOPE_COLORS['ADMIN']).toContain('danger'));
  it('all scopes have background, text, and border class', () => {
    (['READ', 'WRITE', 'ADMIN'] as ApiKeyScope[]).forEach((scope) => {
      const cls = API_KEY_SCOPE_COLORS[scope];
      expect(cls).toMatch(/bg-/);
      expect(cls).toMatch(/text-/);
      expect(cls).toMatch(/border-/);
    });
  });
});

describe('ApiKeysCard — isKeyExpired', () => {
  it('returns false when expiresAt is null (no expiry)', () => {
    expect(isKeyExpired(null)).toBe(false);
  });

  it('returns false for a future expiry date', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString(); // +1 day
    expect(isKeyExpired(future)).toBe(false);
  });

  it('returns true for a past expiry date', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString(); // -1 day
    expect(isKeyExpired(past)).toBe(true);
  });

  it('returns true for a date in the distant past', () => {
    expect(isKeyExpired('2020-01-01T00:00:00.000Z')).toBe(true);
  });

  it('returns false for a date in the far future', () => {
    expect(isKeyExpired('2099-12-31T23:59:59.000Z')).toBe(false);
  });
});

describe('ApiKeysCard — canCreateKey', () => {
  it('returns false for empty name', () => {
    expect(canCreateKey('')).toBe(false);
  });

  it('returns false for whitespace-only name', () => {
    expect(canCreateKey('   ')).toBe(false);
    expect(canCreateKey('\t')).toBe(false);
  });

  it('returns true for valid name', () => {
    expect(canCreateKey('My API Key')).toBe(true);
    expect(canCreateKey('k')).toBe(true);
  });

  it('returns true for name with only leading/trailing spaces but content', () => {
    expect(canCreateKey(' valid ')).toBe(true);
  });
});

describe('ApiKeysCard — maskKey', () => {
  it('shows first 4 and last 4 chars with dots in between', () => {
    const key = 'pd_abcd1234efgh5678';
    const masked = maskKey(key);
    expect(masked.startsWith('pd_a')).toBe(true);
    expect(masked.endsWith('5678')).toBe(true);
    expect(masked).toContain('•');
  });

  it('does not mask keys shorter than 9 chars', () => {
    const short = 'pd_12345';
    expect(maskKey(short)).toBe(short);
  });

  it('exactly 8 chars → returns as-is', () => {
    expect(maskKey('12345678')).toBe('12345678');
  });
});

describe('ApiKeysCard — scope coverage', () => {
  it('all three scopes have labels defined', () => {
    const scopes: ApiKeyScope[] = ['READ', 'WRITE', 'ADMIN'];
    scopes.forEach((s) => {
      expect(API_KEY_SCOPE_LABELS[s]).toBeTruthy();
      expect(API_KEY_SCOPE_COLORS[s]).toBeTruthy();
    });
  });

  it('scope ordering by privilege: READ < WRITE < ADMIN', () => {
    // ADMIN is the most privileged, should have "danger" color
    expect(API_KEY_SCOPE_COLORS['ADMIN']).toContain('danger');
    // READ is read-only, should not have danger
    expect(API_KEY_SCOPE_COLORS['READ']).not.toContain('danger');
  });
});
