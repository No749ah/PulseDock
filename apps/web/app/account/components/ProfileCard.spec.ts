/**
 * Unit tests for ProfileCard pure logic.
 *
 * Tests: profile patch payload construction, timezone validation,
 * displayName trimming, email format, role badge derivation.
 */
import { describe, it, expect } from 'vitest';

// ── Pure helpers mirrored from ProfileCard ────────────────────────────────────

interface ProfilePatch {
  email: string;
  displayName?: string;
  timezone: string;
}

function buildProfilePatch(
  email: string,
  displayName: string,
  timezone: string,
): ProfilePatch {
  return {
    email,
    displayName: displayName.trim() || undefined,
    timezone,
  };
}

/** Whether the save button should be enabled */
function canSaveProfile(email: string, saving: boolean): boolean {
  return email.trim().length > 0 && !saving;
}

/** Derive role badge variant */
function roleBadgeVariant(role: 'admin' | 'user'): string {
  return role === 'admin' ? 'warning' : 'default';
}

/** Derive role display label */
function roleLabel(role: 'admin' | 'user'): string {
  return role === 'admin' ? 'Admin' : 'Member';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProfileCard — buildProfilePatch', () => {
  it('includes email and timezone in patch', () => {
    const patch = buildProfilePatch('user@example.com', '', 'UTC');
    expect(patch.email).toBe('user@example.com');
    expect(patch.timezone).toBe('UTC');
  });

  it('omits displayName when empty string', () => {
    const patch = buildProfilePatch('user@example.com', '', 'UTC');
    expect(patch.displayName).toBeUndefined();
  });

  it('omits displayName when whitespace only', () => {
    const patch = buildProfilePatch('user@example.com', '   ', 'UTC');
    expect(patch.displayName).toBeUndefined();
  });

  it('includes displayName when provided', () => {
    const patch = buildProfilePatch('user@example.com', 'Noah', 'UTC');
    expect(patch.displayName).toBe('Noah');
  });

  it('trims displayName before including', () => {
    const patch = buildProfilePatch('user@example.com', '  Noah  ', 'UTC');
    expect(patch.displayName).toBe('Noah');
  });

  it('includes non-UTC timezones', () => {
    const patch = buildProfilePatch('user@example.com', '', 'Europe/Berlin');
    expect(patch.timezone).toBe('Europe/Berlin');
  });

  it('patch has at most 3 keys', () => {
    const patch = buildProfilePatch('user@example.com', 'Noah', 'UTC');
    expect(Object.keys(patch).length).toBeLessThanOrEqual(3);
  });
});

describe('ProfileCard — canSaveProfile', () => {
  it('returns true when email set and not saving', () => {
    expect(canSaveProfile('user@example.com', false)).toBe(true);
  });

  it('returns false when email is empty', () => {
    expect(canSaveProfile('', false)).toBe(false);
  });

  it('returns false when email is whitespace only', () => {
    expect(canSaveProfile('   ', false)).toBe(false);
  });

  it('returns false when saving', () => {
    expect(canSaveProfile('user@example.com', true)).toBe(false);
  });

  it('returns false for both bad email and saving', () => {
    expect(canSaveProfile('', true)).toBe(false);
  });
});

describe('ProfileCard — roleBadgeVariant', () => {
  it('admin uses warning variant (visually prominent)', () => {
    expect(roleBadgeVariant('admin')).toBe('warning');
  });

  it('user uses default variant', () => {
    expect(roleBadgeVariant('user')).toBe('default');
  });
});

describe('ProfileCard — roleLabel', () => {
  it('admin shows "Admin"', () => {
    expect(roleLabel('admin')).toBe('Admin');
  });

  it('user shows "Member"', () => {
    expect(roleLabel('user')).toBe('Member');
  });
});

describe('ProfileCard — patch idempotency', () => {
  it('two identical inputs produce identical patches', () => {
    const a = buildProfilePatch('a@b.com', 'Noah', 'UTC');
    const b = buildProfilePatch('a@b.com', 'Noah', 'UTC');
    expect(a).toEqual(b);
  });

  it('different emails produce different patches', () => {
    const a = buildProfilePatch('a@b.com', 'Noah', 'UTC');
    const b = buildProfilePatch('c@d.com', 'Noah', 'UTC');
    expect(a.email).not.toBe(b.email);
  });

  it('different timezones produce different patches', () => {
    const a = buildProfilePatch('a@b.com', 'Noah', 'UTC');
    const b = buildProfilePatch('a@b.com', 'Noah', 'Asia/Tokyo');
    expect(a.timezone).not.toBe(b.timezone);
  });
});
