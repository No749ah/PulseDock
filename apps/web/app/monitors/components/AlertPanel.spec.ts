/**
 * Unit tests for AlertPanel pure logic helpers.
 * Tests getRepeatInterval fallback chain and channel filtering logic.
 */
import { describe, it, expect } from 'vitest';

// ── Pure helpers mirrored from component ─────────────────────────────────────

interface AlertChannel {
  id: string;
  type: string;
  name: string;
  notifyOn?: string;
  repeatIntervalMin?: number | null;
}

/** Mirror of getRepeatInterval logic */
function getRepeatInterval(
  channel: AlertChannel,
  repeatIntervals: Record<string, number>,
): number {
  if (repeatIntervals[channel.id] !== undefined) return repeatIntervals[channel.id];
  return channel.repeatIntervalMin ?? 30;
}

/** Mirror of available channels filter */
function getAvailableChannels(
  allChannels: AlertChannel[],
  assignedChannels: AlertChannel[],
  currentId: string,
): AlertChannel[] {
  return allChannels.filter(
    (c) =>
      c.id !== currentId &&
      !assignedChannels.some((a) => a.id === c.id),
  );
}

/** Mirror of unassigned channels filter */
function getUnassignedChannels(
  allChannels: AlertChannel[],
  assignedChannels: AlertChannel[],
): AlertChannel[] {
  return allChannels.filter((c) => !assignedChannels.some((a) => a.id === c.id));
}

// ── getRepeatInterval ─────────────────────────────────────────────────────────

describe('getRepeatInterval', () => {
  it('returns local state value when present', () => {
    const channel: AlertChannel = { id: 'ch1', type: 'slack', name: 'Slack', repeatIntervalMin: 60 };
    expect(getRepeatInterval(channel, { ch1: 15 })).toBe(15);
  });

  it('falls back to channel.repeatIntervalMin when no local state', () => {
    const channel: AlertChannel = { id: 'ch1', type: 'slack', name: 'Slack', repeatIntervalMin: 45 };
    expect(getRepeatInterval(channel, {})).toBe(45);
  });

  it('falls back to default 30 when neither local state nor channel value set', () => {
    const channel: AlertChannel = { id: 'ch1', type: 'webhook', name: 'Webhook' };
    expect(getRepeatInterval(channel, {})).toBe(30);
  });

  it('falls back to default 30 when repeatIntervalMin is null', () => {
    const channel: AlertChannel = { id: 'ch2', type: 'discord', name: 'Alerts', repeatIntervalMin: null };
    expect(getRepeatInterval(channel, {})).toBe(30);
  });

  it('local state 0 overrides channel value', () => {
    const channel: AlertChannel = { id: 'ch3', type: 'email', name: 'Email', repeatIntervalMin: 60 };
    expect(getRepeatInterval(channel, { ch3: 0 })).toBe(0);
  });

  it('does not use local state from different channel id', () => {
    const channel: AlertChannel = { id: 'ch1', type: 'pagerduty', name: 'PD', repeatIntervalMin: 120 };
    expect(getRepeatInterval(channel, { ch2: 5 })).toBe(120);
  });
});

// ── getUnassignedChannels ─────────────────────────────────────────────────────

describe('getUnassignedChannels', () => {
  const all: AlertChannel[] = [
    { id: 'ch1', type: 'slack', name: 'Slack' },
    { id: 'ch2', type: 'discord', name: 'Discord' },
    { id: 'ch3', type: 'email', name: 'Email' },
  ];

  it('returns all channels when none are assigned', () => {
    expect(getUnassignedChannels(all, [])).toHaveLength(3);
  });

  it('excludes assigned channels', () => {
    const assigned = [{ id: 'ch1', type: 'slack', name: 'Slack' }];
    const result = getUnassignedChannels(all, assigned);
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.id !== 'ch1')).toBe(true);
  });

  it('returns empty when all channels are assigned', () => {
    expect(getUnassignedChannels(all, all)).toHaveLength(0);
  });

  it('returns empty when allChannels is empty', () => {
    expect(getUnassignedChannels([], all)).toHaveLength(0);
  });

  it('preserves order of unassigned channels', () => {
    const assigned = [{ id: 'ch2', type: 'discord', name: 'Discord' }];
    const result = getUnassignedChannels(all, assigned);
    expect(result.map((c) => c.id)).toEqual(['ch1', 'ch3']);
  });
});

// ── getAvailableChannels ──────────────────────────────────────────────────────

describe('getAvailableChannels', () => {
  const all: AlertChannel[] = [
    { id: 'ch1', type: 'slack', name: 'Slack' },
    { id: 'ch2', type: 'discord', name: 'Discord' },
    { id: 'ch3', type: 'email', name: 'Email' },
    { id: 'ch4', type: 'webhook', name: 'Webhook' },
  ];

  it('excludes current monitor id and already-assigned channels', () => {
    const assigned = [{ id: 'ch2', type: 'discord', name: 'Discord' }];
    const result = getAvailableChannels(all, assigned, 'ch1');
    expect(result.map((c) => c.id)).toEqual(['ch3', 'ch4']);
  });

  it('excludes only current id when no assigned channels', () => {
    const result = getAvailableChannels(all, [], 'ch1');
    expect(result).toHaveLength(3);
    expect(result.every((c) => c.id !== 'ch1')).toBe(true);
  });

  it('returns all channels when currentId does not match any', () => {
    const result = getAvailableChannels(all, [], 'nonexistent');
    expect(result).toHaveLength(4);
  });

  it('returns empty when all assigned and current excluded', () => {
    const assigned = all.slice(1); // ch2, ch3, ch4 assigned
    const result = getAvailableChannels(all, assigned, 'ch1'); // ch1 is current
    expect(result).toHaveLength(0);
  });
});
