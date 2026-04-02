/**
 * Unit tests for ChannelTypeIcon pure logic.
 * Tests that every known AlertType maps to the correct icon and color class.
 */
import { describe, it, expect } from 'vitest';

// ── Types mirrored from component ────────────────────────────────────────────
type AlertType =
  | 'email' | 'slack' | 'discord' | 'webhook' | 'telegram'
  | 'pagerduty' | 'opsgenie' | 'sms' | 'teams' | 'ntfy'
  | 'gotify' | 'matrix' | 'rocketchat' | 'apprise' | 'mattermost' | 'zulip';

// ── Logic mirrored from component ────────────────────────────────────────────
function iconColorClass(type: AlertType | string): string {
  switch (type) {
    case 'email':      return 'text-blue-400';
    case 'slack':      return 'text-green-400';
    case 'discord':    return 'text-indigo-400';
    case 'webhook':    return 'text-orange-400';
    case 'telegram':   return 'text-sky-400';
    case 'pagerduty':  return 'text-green-500';
    case 'opsgenie':   return 'text-orange-500';
    case 'sms':        return 'text-green-400';
    case 'teams':      return 'text-purple-400';
    case 'ntfy':       return 'text-yellow-400';
    case 'gotify':     return 'text-cyan-400';
    case 'matrix':     return 'text-emerald-400';
    case 'rocketchat': return 'text-orange-400';
    case 'apprise':    return 'text-violet-400';
    case 'mattermost': return 'text-blue-400';
    case 'zulip':      return 'text-green-400';
    default:           return 'text-text-secondary';
  }
}

function iconKind(type: AlertType | string): 'mail' | 'message-square' | 'hash' | 'globe' | 'send' | 'bell' | 'smartphone' {
  switch (type) {
    case 'email':      return 'mail';
    case 'slack':      return 'message-square';
    case 'discord':    return 'hash';
    case 'webhook':    return 'globe';
    case 'telegram':   return 'send';
    case 'pagerduty':
    case 'opsgenie':
    case 'ntfy':
    case 'gotify':
    case 'apprise':    return 'bell';
    case 'sms':        return 'smartphone';
    case 'teams':
    case 'matrix':
    case 'rocketchat':
    case 'mattermost':
    case 'zulip':      return 'message-square';
    default:           return 'bell';
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChannelTypeIcon — iconColorClass', () => {
  it('email → text-blue-400', () => expect(iconColorClass('email')).toBe('text-blue-400'));
  it('slack → text-green-400', () => expect(iconColorClass('slack')).toBe('text-green-400'));
  it('discord → text-indigo-400', () => expect(iconColorClass('discord')).toBe('text-indigo-400'));
  it('webhook → text-orange-400', () => expect(iconColorClass('webhook')).toBe('text-orange-400'));
  it('telegram → text-sky-400', () => expect(iconColorClass('telegram')).toBe('text-sky-400'));
  it('pagerduty → text-green-500', () => expect(iconColorClass('pagerduty')).toBe('text-green-500'));
  it('opsgenie → text-orange-500', () => expect(iconColorClass('opsgenie')).toBe('text-orange-500'));
  it('sms → text-green-400', () => expect(iconColorClass('sms')).toBe('text-green-400'));
  it('teams → text-purple-400', () => expect(iconColorClass('teams')).toBe('text-purple-400'));
  it('ntfy → text-yellow-400', () => expect(iconColorClass('ntfy')).toBe('text-yellow-400'));
  it('gotify → text-cyan-400', () => expect(iconColorClass('gotify')).toBe('text-cyan-400'));
  it('matrix → text-emerald-400', () => expect(iconColorClass('matrix')).toBe('text-emerald-400'));
  it('rocketchat → text-orange-400', () => expect(iconColorClass('rocketchat')).toBe('text-orange-400'));
  it('apprise → text-violet-400', () => expect(iconColorClass('apprise')).toBe('text-violet-400'));
  it('mattermost → text-blue-400', () => expect(iconColorClass('mattermost')).toBe('text-blue-400'));
  it('zulip → text-green-400', () => expect(iconColorClass('zulip')).toBe('text-green-400'));
  it('unknown type → text-text-secondary', () => expect(iconColorClass('unknown_provider')).toBe('text-text-secondary'));
});

describe('ChannelTypeIcon — iconKind', () => {
  it('email → mail icon', () => expect(iconKind('email')).toBe('mail'));
  it('slack → message-square icon', () => expect(iconKind('slack')).toBe('message-square'));
  it('discord → hash icon', () => expect(iconKind('discord')).toBe('hash'));
  it('webhook → globe icon', () => expect(iconKind('webhook')).toBe('globe'));
  it('telegram → send icon', () => expect(iconKind('telegram')).toBe('send'));
  it('pagerduty → bell icon', () => expect(iconKind('pagerduty')).toBe('bell'));
  it('opsgenie → bell icon', () => expect(iconKind('opsgenie')).toBe('bell'));
  it('ntfy → bell icon', () => expect(iconKind('ntfy')).toBe('bell'));
  it('gotify → bell icon', () => expect(iconKind('gotify')).toBe('bell'));
  it('apprise → bell icon', () => expect(iconKind('apprise')).toBe('bell'));
  it('sms → smartphone icon', () => expect(iconKind('sms')).toBe('smartphone'));
  it('teams → message-square icon', () => expect(iconKind('teams')).toBe('message-square'));
  it('matrix → message-square icon', () => expect(iconKind('matrix')).toBe('message-square'));
  it('rocketchat → message-square icon', () => expect(iconKind('rocketchat')).toBe('message-square'));
  it('mattermost → message-square icon', () => expect(iconKind('mattermost')).toBe('message-square'));
  it('zulip → message-square icon', () => expect(iconKind('zulip')).toBe('message-square'));
  it('unknown type → bell icon (fallback)', () => expect(iconKind('some_new_provider')).toBe('bell'));
});

describe('ChannelTypeIcon — all known types have coverage', () => {
  const ALL_KNOWN: AlertType[] = [
    'email', 'slack', 'discord', 'webhook', 'telegram',
    'pagerduty', 'opsgenie', 'sms', 'teams', 'ntfy',
    'gotify', 'matrix', 'rocketchat', 'apprise', 'mattermost', 'zulip',
  ];

  it('no unknown type falls through to default color for known types', () => {
    const defaults = ALL_KNOWN.filter((t) => iconColorClass(t) === 'text-text-secondary');
    expect(defaults).toHaveLength(0);
  });

  it('all 16 known types produce a non-empty color class', () => {
    ALL_KNOWN.forEach((t) => {
      expect(iconColorClass(t).length).toBeGreaterThan(0);
    });
  });

  it('all 16 known types produce a known icon kind', () => {
    const VALID_ICONS = ['mail', 'message-square', 'hash', 'globe', 'send', 'bell', 'smartphone'];
    ALL_KNOWN.forEach((t) => {
      expect(VALID_ICONS).toContain(iconKind(t));
    });
  });
});
