/**
 * Unit tests for account/components/shared.ts
 *
 * Covers: API_KEY_SCOPE_LABELS, API_KEY_SCOPE_COLORS,
 * inputClass style string, type shape contracts.
 */
import { describe, it, expect } from 'vitest';
import {
  inputClass,
  API_KEY_SCOPE_LABELS,
  API_KEY_SCOPE_COLORS,
} from './shared';

describe('shared.ts — inputClass', () => {
  it('is a non-empty string', () => {
    expect(typeof inputClass).toBe('string');
    expect(inputClass.length).toBeGreaterThan(0);
  });

  it('contains Tailwind background class', () => {
    expect(inputClass).toContain('bg-surface');
  });

  it('contains border class', () => {
    expect(inputClass).toContain('border');
  });

  it('contains rounded class', () => {
    expect(inputClass).toContain('rounded');
  });

  it('contains focus ring class', () => {
    expect(inputClass).toContain('focus:ring-');
  });

  it('contains placeholder color class', () => {
    expect(inputClass).toContain('placeholder-');
  });
});

describe('shared.ts — API_KEY_SCOPE_LABELS', () => {
  it('covers READ scope', () => {
    expect(API_KEY_SCOPE_LABELS.READ).toBeTruthy();
    expect(typeof API_KEY_SCOPE_LABELS.READ).toBe('string');
  });

  it('covers WRITE scope', () => {
    expect(API_KEY_SCOPE_LABELS.WRITE).toBeTruthy();
  });

  it('covers ADMIN scope', () => {
    expect(API_KEY_SCOPE_LABELS.ADMIN).toBeTruthy();
  });

  it('READ label describes read-only access', () => {
    expect(API_KEY_SCOPE_LABELS.READ.toLowerCase()).toContain('read');
  });

  it('WRITE label describes write access', () => {
    const label = API_KEY_SCOPE_LABELS.WRITE.toLowerCase();
    expect(label.includes('write') || label.includes('read')).toBe(true);
  });

  it('ADMIN label describes admin/full access', () => {
    const label = API_KEY_SCOPE_LABELS.ADMIN.toLowerCase();
    expect(label.includes('admin') || label.includes('full') || label.includes('access')).toBe(true);
  });

  it('has exactly 3 entries', () => {
    expect(Object.keys(API_KEY_SCOPE_LABELS)).toHaveLength(3);
  });

  it('all labels are distinct', () => {
    const labels = Object.values(API_KEY_SCOPE_LABELS);
    expect(new Set(labels).size).toBe(3);
  });
});

describe('shared.ts — API_KEY_SCOPE_COLORS', () => {
  it('covers all three scopes', () => {
    expect(API_KEY_SCOPE_COLORS.READ).toBeTruthy();
    expect(API_KEY_SCOPE_COLORS.WRITE).toBeTruthy();
    expect(API_KEY_SCOPE_COLORS.ADMIN).toBeTruthy();
  });

  it('all color strings are non-empty', () => {
    for (const val of Object.values(API_KEY_SCOPE_COLORS)) {
      expect(val.length).toBeGreaterThan(0);
    }
  });

  it('all color strings contain Tailwind class tokens', () => {
    for (const val of Object.values(API_KEY_SCOPE_COLORS)) {
      expect(val).toContain('-');
    }
  });

  it('ADMIN uses danger-related color (high-visibility)', () => {
    expect(API_KEY_SCOPE_COLORS.ADMIN).toContain('danger');
  });

  it('READ uses blue-related color (informational)', () => {
    expect(API_KEY_SCOPE_COLORS.READ).toContain('blue');
  });

  it('all three scopes have different colors', () => {
    const colors = Object.values(API_KEY_SCOPE_COLORS);
    expect(new Set(colors).size).toBe(3);
  });

  it('has exactly 3 entries', () => {
    expect(Object.keys(API_KEY_SCOPE_COLORS)).toHaveLength(3);
  });
});

describe('shared.ts — type shape contracts', () => {
  it('Me type has expected required fields', () => {
    // Structural test via assignment
    const me: import('./shared').Me = {
      id: 'u-1',
      email: 'test@example.com',
      role: 'user',
    };
    expect(me.id).toBe('u-1');
    expect(me.role).toBe('user');
  });

  it('Me role can be admin', () => {
    const me: import('./shared').Me = {
      id: 'u-2',
      email: 'admin@example.com',
      role: 'admin',
    };
    expect(me.role).toBe('admin');
  });

  it('ApiKey shape has expected fields', () => {
    const key: import('./shared').ApiKey = {
      id: 'k-1',
      name: 'Test Key',
      prefix: 'pk_',
      scope: 'READ',
      usageCount: 0,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: '2026-04-01T00:00:00Z',
    };
    expect(key.scope).toBe('READ');
    expect(key.usageCount).toBe(0);
  });

  it('TeamMember has nested user field', () => {
    const member: import('./shared').TeamMember = {
      id: 'tm-1',
      ownerId: 'o-1',
      userId: 'u-1',
      role: 'VIEWER',
      createdAt: '2026-04-01T00:00:00Z',
      user: {
        id: 'u-1',
        email: 'viewer@example.com',
        displayName: 'Viewer User',
      },
    };
    expect(member.user.email).toBe('viewer@example.com');
    expect(member.role).toBe('VIEWER');
  });

  it('Session has revokedAt field (nullable)', () => {
    const session: import('./shared').Session = {
      id: 's-1',
      userAgent: 'Mozilla/5.0',
      ipAddress: '127.0.0.1',
      revokedAt: null,
      createdAt: '2026-04-01T00:00:00Z',
    };
    expect(session.revokedAt).toBeNull();
  });

  it('NotificationPreference has quiet hours fields', () => {
    const pref: import('./shared').NotificationPreference = {
      id: 'np-1',
      notifyOnDown: true,
      notifyOnRecovery: true,
      notifyOnDegraded: false,
      quietHoursEnabled: true,
      quietHoursStart: 22,
      quietHoursEnd: 8,
      frequency: 'IMMEDIATE',
      alertStormProtection: true,
      alertStormThreshold: 5,
    };
    expect(pref.quietHoursStart).toBe(22);
    expect(pref.quietHoursEnd).toBe(8);
  });
});
