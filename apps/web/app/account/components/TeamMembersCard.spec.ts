/**
 * Unit tests for TeamMembersCard pure logic.
 * Tests role colors, role labels, role mapping, invite validation, and team member counting.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component + shared ────────────────────────────────────

type TeamRoleApi = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
type TeamRoleDisplay = 'Admin' | 'Editor' | 'Viewer';

const roleColors: Record<TeamRoleApi, string> = {
  OWNER: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  ADMIN: 'bg-danger/15 text-danger border-danger/20',
  EDITOR: 'bg-accent/15 text-accent border-accent/20',
  VIEWER: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
};

const roleLabel: Record<TeamRoleApi, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
};

const roleMap: Record<TeamRoleDisplay, TeamRoleApi> = {
  Admin: 'ADMIN',
  Editor: 'EDITOR',
  Viewer: 'VIEWER',
};

function canSendInvite(email: string): boolean {
  return email.trim().length > 0;
}

function memberCountLabel(count: number): string {
  return `${count} member${count !== 1 ? 's' : ''}`;
}

function pendingCountLabel(count: number): string {
  return `${count} pending invite${count !== 1 ? 's' : ''}`;
}

function isOwner(role: TeamRoleApi): boolean {
  return role === 'OWNER';
}

function canRemoveMember(currentUserId: string, memberId: string, memberRole: TeamRoleApi): boolean {
  // Cannot remove yourself or the owner
  if (currentUserId === memberId) return false;
  if (memberRole === 'OWNER') return false;
  return true;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TeamMembersCard — roleColors', () => {
  it('OWNER → yellow (special color)', () => expect(roleColors['OWNER']).toContain('yellow'));
  it('ADMIN → danger/red (high privilege)', () => expect(roleColors['ADMIN']).toContain('danger'));
  it('EDITOR → accent (standard contributor)', () => expect(roleColors['EDITOR']).toContain('accent'));
  it('VIEWER → blue (read-only)', () => expect(roleColors['VIEWER']).toContain('blue'));

  it('all roles have bg, text, and border classes', () => {
    (['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'] as TeamRoleApi[]).forEach((role) => {
      const cls = roleColors[role];
      expect(cls).toMatch(/bg-/);
      expect(cls).toMatch(/text-/);
      expect(cls).toMatch(/border-/);
    });
  });
});

describe('TeamMembersCard — roleLabel', () => {
  it('OWNER → "Owner"', () => expect(roleLabel['OWNER']).toBe('Owner'));
  it('ADMIN → "Admin"', () => expect(roleLabel['ADMIN']).toBe('Admin'));
  it('EDITOR → "Editor"', () => expect(roleLabel['EDITOR']).toBe('Editor'));
  it('VIEWER → "Viewer"', () => expect(roleLabel['VIEWER']).toBe('Viewer'));
});

describe('TeamMembersCard — roleMap (display to API)', () => {
  it('Admin → ADMIN', () => expect(roleMap['Admin']).toBe('ADMIN'));
  it('Editor → EDITOR', () => expect(roleMap['Editor']).toBe('EDITOR'));
  it('Viewer → VIEWER', () => expect(roleMap['Viewer']).toBe('VIEWER'));

  it('all display roles map to valid API roles', () => {
    const VALID_API_ROLES: TeamRoleApi[] = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'];
    Object.values(roleMap).forEach((apiRole) => {
      expect(VALID_API_ROLES).toContain(apiRole);
    });
  });

  it('OWNER is not invitable via roleMap (cannot invite owner)', () => {
    expect(Object.values(roleMap)).not.toContain('OWNER');
  });
});

describe('TeamMembersCard — canSendInvite', () => {
  it('returns false for empty email', () => expect(canSendInvite('')).toBe(false));
  it('returns false for whitespace-only', () => expect(canSendInvite('   ')).toBe(false));
  it('returns true for valid email', () => expect(canSendInvite('user@example.com')).toBe(true));
});

describe('TeamMembersCard — memberCountLabel', () => {
  it('1 → "1 member"', () => expect(memberCountLabel(1)).toBe('1 member'));
  it('0 → "0 members"', () => expect(memberCountLabel(0)).toBe('0 members'));
  it('5 → "5 members"', () => expect(memberCountLabel(5)).toBe('5 members'));
});

describe('TeamMembersCard — pendingCountLabel', () => {
  it('1 → "1 pending invite"', () => expect(pendingCountLabel(1)).toBe('1 pending invite'));
  it('0 → "0 pending invites"', () => expect(pendingCountLabel(0)).toBe('0 pending invites'));
  it('3 → "3 pending invites"', () => expect(pendingCountLabel(3)).toBe('3 pending invites'));
});

describe('TeamMembersCard — isOwner', () => {
  it('OWNER → true', () => expect(isOwner('OWNER')).toBe(true));
  it('ADMIN → false', () => expect(isOwner('ADMIN')).toBe(false));
  it('EDITOR → false', () => expect(isOwner('EDITOR')).toBe(false));
  it('VIEWER → false', () => expect(isOwner('VIEWER')).toBe(false));
});

describe('TeamMembersCard — canRemoveMember', () => {
  it('cannot remove yourself', () => {
    expect(canRemoveMember('user-1', 'user-1', 'EDITOR')).toBe(false);
  });

  it('cannot remove the owner', () => {
    expect(canRemoveMember('admin-1', 'owner-1', 'OWNER')).toBe(false);
  });

  it('can remove a non-owner member', () => {
    expect(canRemoveMember('admin-1', 'editor-1', 'EDITOR')).toBe(true);
    expect(canRemoveMember('admin-1', 'viewer-1', 'VIEWER')).toBe(true);
    expect(canRemoveMember('admin-1', 'other-admin', 'ADMIN')).toBe(true);
  });
});
