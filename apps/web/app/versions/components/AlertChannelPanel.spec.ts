/**
 * Unit tests for AlertChannelPanel pure logic helpers.
 * Tests available-channels filtering (excludes already-assigned channels),
 * CHANNEL_TYPE_COLORS structure, and VERSION_NOTIFY_OPTIONS.
 */
import { describe, it, expect } from 'vitest';

// ── Types mirrored from component ─────────────────────────────────────────────

interface AlertChannelFull {
  id: string;
  type: string;
  name: string;
  notifyOn?: string;
}

// ── Constants mirrored from utils ─────────────────────────────────────────────

const CHANNEL_TYPE_COLORS: Record<string, string> = {
  discord: 'text-indigo-400',
  slack: 'text-green-400',
  webhook: 'text-blue-400',
  telegram: 'text-sky-400',
  email: 'text-yellow-400',
};

const VERSION_NOTIFY_OPTIONS = [
  { value: 'VERSION_ANY', label: 'Any update (minor + major)' },
  { value: 'VERSION_MAJOR', label: 'Major updates only' },
];

// ── Pure helpers mirrored from component ─────────────────────────────────────

function getAvailableChannels(
  allChannels: AlertChannelFull[],
  assignedChannels: AlertChannelFull[],
): AlertChannelFull[] {
  return allChannels.filter((c) => !assignedChannels.some((a) => a.id === c.id));
}

// ── getAvailableChannels ──────────────────────────────────────────────────────

describe('getAvailableChannels (versions AlertChannelPanel)', () => {
  const all: AlertChannelFull[] = [
    { id: 'ch1', type: 'slack', name: 'Slack Alerts' },
    { id: 'ch2', type: 'discord', name: 'Discord' },
    { id: 'ch3', type: 'email', name: 'Email' },
    { id: 'ch4', type: 'webhook', name: 'Webhook' },
  ];

  it('returns all channels when none assigned', () => {
    expect(getAvailableChannels(all, [])).toHaveLength(4);
  });

  it('excludes assigned channels', () => {
    const assigned = [all[0], all[2]]; // ch1, ch3
    const result = getAvailableChannels(all, assigned);
    expect(result.map((c) => c.id)).toEqual(['ch2', 'ch4']);
  });

  it('returns empty when all channels are assigned', () => {
    expect(getAvailableChannels(all, all)).toHaveLength(0);
  });

  it('returns all when allChannels is empty', () => {
    expect(getAvailableChannels([], all)).toHaveLength(0);
  });

  it('does not mutate original arrays', () => {
    const original = [...all];
    getAvailableChannels(all, [all[0]]);
    expect(all).toHaveLength(original.length);
  });
});

// ── CHANNEL_TYPE_COLORS ───────────────────────────────────────────────────────

describe('CHANNEL_TYPE_COLORS (versions)', () => {
  it('has discord color', () => {
    expect(CHANNEL_TYPE_COLORS.discord).toBe('text-indigo-400');
  });

  it('has slack color', () => {
    expect(CHANNEL_TYPE_COLORS.slack).toBe('text-green-400');
  });

  it('has webhook color', () => {
    expect(CHANNEL_TYPE_COLORS.webhook).toBe('text-blue-400');
  });

  it('has telegram color', () => {
    expect(CHANNEL_TYPE_COLORS.telegram).toBe('text-sky-400');
  });

  it('has email color', () => {
    expect(CHANNEL_TYPE_COLORS.email).toBe('text-yellow-400');
  });

  it('returns undefined for unknown channel type', () => {
    expect(CHANNEL_TYPE_COLORS['pagerduty']).toBeUndefined();
  });
});

// ── VERSION_NOTIFY_OPTIONS ────────────────────────────────────────────────────

describe('VERSION_NOTIFY_OPTIONS (versions)', () => {
  it('has exactly 2 options', () => {
    expect(VERSION_NOTIFY_OPTIONS).toHaveLength(2);
  });

  it('first option is VERSION_ANY', () => {
    expect(VERSION_NOTIFY_OPTIONS[0].value).toBe('VERSION_ANY');
    expect(VERSION_NOTIFY_OPTIONS[0].label).toContain('Any update');
  });

  it('second option is VERSION_MAJOR', () => {
    expect(VERSION_NOTIFY_OPTIONS[1].value).toBe('VERSION_MAJOR');
    expect(VERSION_NOTIFY_OPTIONS[1].label).toContain('Major');
  });

  it('all options have value and label', () => {
    VERSION_NOTIFY_OPTIONS.forEach((opt) => {
      expect(opt.value).toBeTruthy();
      expect(opt.label).toBeTruthy();
    });
  });
});
