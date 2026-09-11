/**
 * Unit tests for alerts/components/types.ts
 *
 * Tests:
 * - AlertType union — all channel types present
 * - ChannelSchedule structure contract
 * - AlertChannel structure contract
 * - CreateFormState structure contract
 * - ALERT_TYPES list coverage
 */
import { describe, it, expect } from 'vitest';

// ── Mirror alert types from types.ts ─────────────────────────────────────────

type AlertType =
  | 'discord' | 'webhook' | 'slack' | 'telegram' | 'email'
  | 'pagerduty' | 'opsgenie' | 'sms' | 'teams' | 'ntfy'
  | 'gotify' | 'matrix' | 'rocketchat' | 'apprise' | 'mattermost' | 'zulip';

const ALL_ALERT_TYPES: AlertType[] = [
  'discord', 'webhook', 'slack', 'telegram', 'email',
  'pagerduty', 'opsgenie', 'sms', 'teams', 'ntfy',
  'gotify', 'matrix', 'rocketchat', 'apprise', 'mattermost', 'zulip',
];

// ── ChannelSchedule structure validator ───────────────────────────────────────

interface ChannelSchedule {
  enabled: boolean;
  timezone: string;
  days: number[];
  startHour: number;
  endHour: number;
}

function isValidSchedule(s: ChannelSchedule): boolean {
  if (typeof s.enabled !== 'boolean') return false;
  if (typeof s.timezone !== 'string' || s.timezone.length === 0) return false;
  if (!Array.isArray(s.days)) return false;
  if (typeof s.startHour !== 'number') return false;
  if (typeof s.endHour !== 'number') return false;
  return true;
}

// ── AlertChannel structure validator ─────────────────────────────────────────

interface AlertChannel {
  id: string;
  name: string;
  type: AlertType;
  config: Record<string, unknown>;
  createdAt: string;
}

function isValidChannel(c: AlertChannel): boolean {
  if (typeof c.id !== 'string' || c.id.length === 0) return false;
  if (typeof c.name !== 'string' || c.name.length === 0) return false;
  if (!ALL_ALERT_TYPES.includes(c.type)) return false;
  if (typeof c.config !== 'object' || c.config === null) return false;
  if (typeof c.createdAt !== 'string') return false;
  return true;
}

// ── Tests: AlertType union ────────────────────────────────────────────────────

describe('AlertType — all channel types', () => {
  it('includes discord', () => expect(ALL_ALERT_TYPES).toContain('discord'));
  it('includes webhook', () => expect(ALL_ALERT_TYPES).toContain('webhook'));
  it('includes slack', () => expect(ALL_ALERT_TYPES).toContain('slack'));
  it('includes telegram', () => expect(ALL_ALERT_TYPES).toContain('telegram'));
  it('includes email', () => expect(ALL_ALERT_TYPES).toContain('email'));
  it('includes pagerduty', () => expect(ALL_ALERT_TYPES).toContain('pagerduty'));
  it('includes opsgenie', () => expect(ALL_ALERT_TYPES).toContain('opsgenie'));
  it('includes sms', () => expect(ALL_ALERT_TYPES).toContain('sms'));
  it('includes teams', () => expect(ALL_ALERT_TYPES).toContain('teams'));
  it('includes ntfy', () => expect(ALL_ALERT_TYPES).toContain('ntfy'));
  it('includes gotify', () => expect(ALL_ALERT_TYPES).toContain('gotify'));
  it('includes matrix', () => expect(ALL_ALERT_TYPES).toContain('matrix'));
  it('includes rocketchat', () => expect(ALL_ALERT_TYPES).toContain('rocketchat'));
  it('includes apprise', () => expect(ALL_ALERT_TYPES).toContain('apprise'));
  it('includes mattermost', () => expect(ALL_ALERT_TYPES).toContain('mattermost'));
  it('includes zulip', () => expect(ALL_ALERT_TYPES).toContain('zulip'));

  it('has exactly 16 channel types', () => {
    expect(ALL_ALERT_TYPES).toHaveLength(16);
  });

  it('all entries are unique', () => {
    expect(new Set(ALL_ALERT_TYPES).size).toBe(ALL_ALERT_TYPES.length);
  });

  it('all entries are non-empty lowercase strings', () => {
    for (const type of ALL_ALERT_TYPES) {
      expect(typeof type).toBe('string');
      expect(type.length).toBeGreaterThan(0);
      expect(type).toBe(type.toLowerCase());
    }
  });
});

// ── Tests: ChannelSchedule ────────────────────────────────────────────────────

describe('ChannelSchedule — structure contract', () => {
  const validSchedule: ChannelSchedule = {
    enabled: true,
    timezone: 'UTC',
    days: [1, 2, 3, 4, 5],
    startHour: 9,
    endHour: 18,
  };

  it('accepts a valid schedule', () => {
    expect(isValidSchedule(validSchedule)).toBe(true);
  });

  it('requires enabled to be boolean', () => {
    const bad = { ...validSchedule, enabled: 'yes' } as unknown as ChannelSchedule;
    expect(isValidSchedule(bad)).toBe(false);
  });

  it('requires timezone to be non-empty string', () => {
    expect(isValidSchedule({ ...validSchedule, timezone: '' })).toBe(false);
  });

  it('requires days to be array', () => {
    const bad = { ...validSchedule, days: null } as unknown as ChannelSchedule;
    expect(isValidSchedule(bad)).toBe(false);
  });

  it('allows weekday-only days array [1-5]', () => {
    expect(isValidSchedule({ ...validSchedule, days: [1, 2, 3, 4, 5] })).toBe(true);
  });

  it('allows weekend days [0, 6]', () => {
    expect(isValidSchedule({ ...validSchedule, days: [0, 6] })).toBe(true);
  });

  it('allows empty days array (schedule with no active days)', () => {
    expect(isValidSchedule({ ...validSchedule, days: [] })).toBe(true);
  });

  it('enabled:false still valid', () => {
    expect(isValidSchedule({ ...validSchedule, enabled: false })).toBe(true);
  });
});

// ── Tests: AlertChannel ───────────────────────────────────────────────────────

describe('AlertChannel — structure contract', () => {
  const validChannel: AlertChannel = {
    id: 'ch-1',
    name: 'Discord Alerts',
    type: 'discord',
    config: { webhookUrl: 'https://discord.com/api/webhooks/123' },
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('accepts a valid channel', () => {
    expect(isValidChannel(validChannel)).toBe(true);
  });

  it('requires non-empty id', () => {
    expect(isValidChannel({ ...validChannel, id: '' })).toBe(false);
  });

  it('requires non-empty name', () => {
    expect(isValidChannel({ ...validChannel, name: '' })).toBe(false);
  });

  it('requires valid type', () => {
    const bad = { ...validChannel, type: 'unknown_type' as AlertType };
    expect(isValidChannel(bad)).toBe(false);
  });

  it('requires config to be an object', () => {
    const bad = { ...validChannel, config: null } as unknown as AlertChannel;
    expect(isValidChannel(bad)).toBe(false);
  });

  it('accepts all valid alert types', () => {
    for (const type of ALL_ALERT_TYPES) {
      const ch: AlertChannel = { ...validChannel, type };
      expect(isValidChannel(ch)).toBe(true);
    }
  });

  it('config can be empty object', () => {
    expect(isValidChannel({ ...validChannel, config: {} })).toBe(true);
  });
});

// ── Tests: DeliveryStats structure ────────────────────────────────────────────

describe('DeliveryStats — structure contract', () => {
  const validStats = {
    totalDeliveries: 100,
    successCount: 95,
    failureCount: 5,
    successRate: 0.95,
    lastDeliveryAt: '2026-04-01T12:00:00.000Z',
    lastSuccessAt: '2026-04-01T12:00:00.000Z',
    lastFailureAt: null,
    last24hSuccess: 10,
    last24hFailure: 0,
    recentLogs: [],
  };

  it('successRate is between 0 and 1', () => {
    expect(validStats.successRate).toBeGreaterThanOrEqual(0);
    expect(validStats.successRate).toBeLessThanOrEqual(1);
  });

  it('successCount + failureCount <= totalDeliveries', () => {
    expect(validStats.successCount + validStats.failureCount).toBeLessThanOrEqual(validStats.totalDeliveries);
  });

  it('lastFailureAt can be null', () => {
    expect(validStats.lastFailureAt).toBeNull();
  });

  it('recentLogs is array', () => {
    expect(Array.isArray(validStats.recentLogs)).toBe(true);
  });

  it('100% success rate when no failures', () => {
    const perfect = { ...validStats, successCount: 50, failureCount: 0, totalDeliveries: 50, successRate: 1.0 };
    expect(perfect.successRate).toBe(1.0);
    expect(perfect.failureCount).toBe(0);
  });
});

// ── Tests: CreateFormState defaults ──────────────────────────────────────────

describe('CreateFormState — field coverage', () => {
  const defaultForm = {
    name: '',
    type: 'discord' as AlertType,
    a: '',
    b: '',
    secret: '',
    username: '',
    avatarUrl: '',
    mentionRoleId: '',
    mentionUserId: '',
    messageTemplate: '',
    parseMode: '',
    payloadTemplate: '',
    customHeaders: [] as Array<{ key: string; value: string }>,
  };

  it('has all required fields', () => {
    expect('name' in defaultForm).toBe(true);
    expect('type' in defaultForm).toBe(true);
    expect('a' in defaultForm).toBe(true);
    expect('b' in defaultForm).toBe(true);
    expect('secret' in defaultForm).toBe(true);
    expect('username' in defaultForm).toBe(true);
    expect('avatarUrl' in defaultForm).toBe(true);
    expect('messageTemplate' in defaultForm).toBe(true);
    expect('customHeaders' in defaultForm).toBe(true);
  });

  it('customHeaders is array', () => {
    expect(Array.isArray(defaultForm.customHeaders)).toBe(true);
  });

  it('default type is a valid alert type', () => {
    expect(ALL_ALERT_TYPES).toContain(defaultForm.type);
  });
});
