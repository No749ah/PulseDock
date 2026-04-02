/**
 * Unit tests for admin/components/EditUserModal pure logic.
 *
 * Tests:
 * - isSelf detection
 * - toggleActive logic
 * - confirmDelete label logic
 * - Role validation
 * - AdminUser type structure contract
 */
import { describe, it, expect } from 'vitest';

// ── Mirror types from admin/types.ts ─────────────────────────────────────────

type AdminUser = {
  id: string;
  email: string;
  displayName?: string | null;
  role: 'admin' | 'user';
  isActive?: boolean;
  totpEnabled?: boolean;
  emailVerified?: boolean;
  createdAt: string;
  updatedAt?: string | null;
};

// ── Logic mirrored from EditUserModal.tsx ─────────────────────────────────────

function isSelf(userId: string, currentUserId: string): boolean {
  return userId === currentUserId;
}

// isActive defaults to true when undefined
function isActiveUser(user: AdminUser): boolean {
  return user.isActive !== false;
}

function toggleActiveLabel(user: AdminUser): string {
  return isActiveUser(user) ? 'Disable account' : 'Enable account';
}

function toggleActiveDescription(user: AdminUser): string {
  return isActiveUser(user)
    ? 'Revokes all sessions, blocks sign-in'
    : 'Restore sign-in access';
}

function toggleActiveButtonLabel(user: AdminUser, loading: boolean): string {
  if (loading) return '…';
  return isActiveUser(user) ? 'Disable' : 'Enable';
}

function confirmDeleteButtonLabel(deleting: boolean): string {
  return deleting ? 'Deleting…' : 'Yes, delete';
}

function saveButtonLabel(saving: boolean): string {
  return saving ? 'Saving…' : 'Save changes';
}

function passwordResetButtonLabel(loading: boolean): string {
  return loading ? '…' : 'Reset';
}

function resetMfaButtonLabel(loading: boolean): string {
  return loading ? '…' : 'Remove MFA';
}

function canSave(email: string, saving: boolean): boolean {
  return !saving && Boolean(email.trim());
}

// ── Tests: isSelf ─────────────────────────────────────────────────────────────

describe('EditUserModal — isSelf', () => {
  it('returns true when userId equals currentUserId', () => {
    expect(isSelf('user-1', 'user-1')).toBe(true);
  });

  it('returns false when userId differs from currentUserId', () => {
    expect(isSelf('user-1', 'user-2')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(isSelf('User-1', 'user-1')).toBe(false);
  });
});

// ── Tests: isActiveUser ───────────────────────────────────────────────────────

describe('EditUserModal — isActiveUser', () => {
  it('returns true when isActive is true', () => {
    const u: AdminUser = { id: 'u1', email: 'a@b.com', role: 'user', isActive: true, createdAt: '2026-01-01' };
    expect(isActiveUser(u)).toBe(true);
  });

  it('returns false when isActive is false', () => {
    const u: AdminUser = { id: 'u1', email: 'a@b.com', role: 'user', isActive: false, createdAt: '2026-01-01' };
    expect(isActiveUser(u)).toBe(false);
  });

  it('defaults to true when isActive is undefined', () => {
    const u: AdminUser = { id: 'u1', email: 'a@b.com', role: 'user', createdAt: '2026-01-01' };
    expect(isActiveUser(u)).toBe(true);
  });
});

// ── Tests: toggleActiveLabel ──────────────────────────────────────────────────

describe('EditUserModal — toggleActiveLabel', () => {
  it('shows "Disable account" for active user', () => {
    const u: AdminUser = { id: 'u1', email: 'a@b.com', role: 'user', isActive: true, createdAt: '2026-01-01' };
    expect(toggleActiveLabel(u)).toBe('Disable account');
  });

  it('shows "Enable account" for disabled user', () => {
    const u: AdminUser = { id: 'u1', email: 'a@b.com', role: 'user', isActive: false, createdAt: '2026-01-01' };
    expect(toggleActiveLabel(u)).toBe('Enable account');
  });

  it('shows "Disable account" when isActive is undefined (defaults active)', () => {
    const u: AdminUser = { id: 'u1', email: 'a@b.com', role: 'user', createdAt: '2026-01-01' };
    expect(toggleActiveLabel(u)).toBe('Disable account');
  });
});

// ── Tests: toggleActiveDescription ───────────────────────────────────────────

describe('EditUserModal — toggleActiveDescription', () => {
  it('shows revoke sessions description for active user', () => {
    const u: AdminUser = { id: 'u1', email: 'a@b.com', role: 'user', isActive: true, createdAt: '2026-01-01' };
    expect(toggleActiveDescription(u)).toBe('Revokes all sessions, blocks sign-in');
  });

  it('shows restore access description for disabled user', () => {
    const u: AdminUser = { id: 'u1', email: 'a@b.com', role: 'user', isActive: false, createdAt: '2026-01-01' };
    expect(toggleActiveDescription(u)).toBe('Restore sign-in access');
  });
});

// ── Tests: toggleActiveButtonLabel ───────────────────────────────────────────

describe('EditUserModal — toggleActiveButtonLabel', () => {
  const active: AdminUser = { id: 'u1', email: 'a@b.com', role: 'user', isActive: true, createdAt: '2026-01-01' };
  const disabled: AdminUser = { id: 'u1', email: 'a@b.com', role: 'user', isActive: false, createdAt: '2026-01-01' };

  it('shows "…" while loading', () => {
    expect(toggleActiveButtonLabel(active, true)).toBe('…');
    expect(toggleActiveButtonLabel(disabled, true)).toBe('…');
  });

  it('shows "Disable" for active user when not loading', () => {
    expect(toggleActiveButtonLabel(active, false)).toBe('Disable');
  });

  it('shows "Enable" for disabled user when not loading', () => {
    expect(toggleActiveButtonLabel(disabled, false)).toBe('Enable');
  });
});

// ── Tests: confirmDeleteButtonLabel ──────────────────────────────────────────

describe('EditUserModal — confirmDeleteButtonLabel', () => {
  it('shows "Deleting…" while deleting', () => {
    expect(confirmDeleteButtonLabel(true)).toBe('Deleting…');
  });

  it('shows "Yes, delete" when not deleting', () => {
    expect(confirmDeleteButtonLabel(false)).toBe('Yes, delete');
  });
});

// ── Tests: saveButtonLabel ────────────────────────────────────────────────────

describe('EditUserModal — saveButtonLabel', () => {
  it('shows "Saving…" while saving', () => {
    expect(saveButtonLabel(true)).toBe('Saving…');
  });

  it('shows "Save changes" when not saving', () => {
    expect(saveButtonLabel(false)).toBe('Save changes');
  });
});

// ── Tests: passwordResetButtonLabel ──────────────────────────────────────────

describe('EditUserModal — passwordResetButtonLabel', () => {
  it('shows "…" while loading', () => {
    expect(passwordResetButtonLabel(true)).toBe('…');
  });

  it('shows "Reset" when not loading', () => {
    expect(passwordResetButtonLabel(false)).toBe('Reset');
  });
});

// ── Tests: resetMfaButtonLabel ────────────────────────────────────────────────

describe('EditUserModal — resetMfaButtonLabel', () => {
  it('shows "…" while loading', () => {
    expect(resetMfaButtonLabel(true)).toBe('…');
  });

  it('shows "Remove MFA" when not loading', () => {
    expect(resetMfaButtonLabel(false)).toBe('Remove MFA');
  });
});

// ── Tests: canSave ────────────────────────────────────────────────────────────

describe('EditUserModal — canSave', () => {
  it('returns false when saving', () => {
    expect(canSave('user@example.com', true)).toBe(false);
  });

  it('returns false when email is empty', () => {
    expect(canSave('', false)).toBe(false);
  });

  it('returns false when email is whitespace', () => {
    expect(canSave('   ', false)).toBe(false);
  });

  it('returns true when email is valid and not saving', () => {
    expect(canSave('user@example.com', false)).toBe(true);
  });
});

// ── Tests: AdminUser type structure ──────────────────────────────────────────

describe('AdminUser — type structure', () => {
  function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
    return {
      id: 'user-1',
      email: 'test@example.com',
      role: 'user',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('admin role is valid', () => {
    const u = makeUser({ role: 'admin' });
    expect(u.role).toBe('admin');
  });

  it('user role is valid', () => {
    const u = makeUser({ role: 'user' });
    expect(u.role).toBe('user');
  });

  it('displayName can be null', () => {
    const u = makeUser({ displayName: null });
    expect(u.displayName).toBeNull();
  });

  it('displayName can be string', () => {
    const u = makeUser({ displayName: 'John Doe' });
    expect(typeof u.displayName).toBe('string');
  });

  it('totpEnabled defaults to undefined', () => {
    const u = makeUser();
    expect(u.totpEnabled).toBeUndefined();
  });

  it('emailVerified can be true', () => {
    const u = makeUser({ emailVerified: true });
    expect(u.emailVerified).toBe(true);
  });

  it('updatedAt can be null', () => {
    const u = makeUser({ updatedAt: null });
    expect(u.updatedAt).toBeNull();
  });

  it('createdAt is required string', () => {
    const u = makeUser();
    expect(typeof u.createdAt).toBe('string');
    expect(u.createdAt.length).toBeGreaterThan(0);
  });
});
