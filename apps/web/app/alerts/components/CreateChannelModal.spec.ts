/**
 * Unit tests for CreateChannelModal pure logic.
 *
 * Tests: wizard step guard/navigation, platform label derivation,
 * credential label mapping per channel type, grouping/batch defaults,
 * step 3 review completeness guards.
 */
import { describe, it, expect } from 'vitest';

// ── Constants mirrored from component ────────────────────────────────────────

type AlertType =
  | 'discord' | 'webhook' | 'slack' | 'telegram' | 'email'
  | 'pagerduty' | 'opsgenie' | 'sms' | 'teams' | 'ntfy'
  | 'gotify' | 'matrix' | 'rocketchat' | 'apprise' | 'mattermost' | 'zulip';

const PLATFORM_OPTIONS: { value: AlertType; label: string }[] = [
  { value: 'discord', label: 'Discord' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'slack', label: 'Slack' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'email', label: 'Email' },
  { value: 'pagerduty', label: 'PagerDuty' },
  { value: 'opsgenie', label: 'OpsGenie' },
  { value: 'sms', label: 'SMS (Twilio)' },
  { value: 'teams', label: 'Microsoft Teams' },
  { value: 'ntfy', label: 'ntfy (self-hosted)' },
  { value: 'gotify', label: 'Gotify (self-hosted)' },
  { value: 'matrix', label: 'Matrix / Element (self-hosted)' },
  { value: 'rocketchat', label: 'Rocket.Chat (self-hosted)' },
  { value: 'apprise', label: 'Apprise (universal gateway)' },
  { value: 'mattermost', label: 'Mattermost (self-hosted)' },
  { value: 'zulip', label: 'Zulip (self-hosted)' },
];

const TOTAL_STEPS = 3;

// ── Pure helpers ──────────────────────────────────────────────────────────────

function canGoNext(step: number): boolean {
  return step < TOTAL_STEPS - 1;
}

function canGoBack(step: number): boolean {
  return step > 0;
}

function isLastStep(step: number): boolean {
  return step === TOTAL_STEPS - 1;
}

function credentialLabel(type: AlertType): string {
  switch (type) {
    case 'telegram': return 'Bot token';
    case 'email': return 'Email address';
    case 'pagerduty': return 'Integration Key';
    case 'opsgenie': return 'API Key';
    case 'sms': return 'Account SID';
    case 'teams': return 'Teams Webhook URL';
    case 'ntfy': return 'Topic URL';
    case 'gotify': return 'Server URL';
    case 'matrix': return 'Homeserver URL';
    case 'rocketchat': return 'Rocket.Chat Webhook URL';
    case 'apprise': return 'Apprise Server URL';
    case 'mattermost': return 'Mattermost Webhook URL';
    case 'zulip': return 'Zulip Server URL';
    default: return 'URL';
  }
}

function clampBatchWindow(raw: number): number {
  return Math.max(0, Math.min(300, raw));
}

function clampGroupWindow(raw: number): number {
  return Math.max(1, Math.min(1440, raw));
}

/** Step 3 review is complete when name and primary credential are set */
function reviewComplete(name: string, primaryValue: string): boolean {
  return name.trim().length > 0 && primaryValue.trim().length > 0;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CreateChannelModal — PLATFORM_OPTIONS', () => {
  it('has 16 platform options', () => {
    expect(PLATFORM_OPTIONS).toHaveLength(16);
  });

  it('discord is first (default)', () => {
    expect(PLATFORM_OPTIONS[0].value).toBe('discord');
  });

  it('all platforms have non-empty labels', () => {
    for (const opt of PLATFORM_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });

  it('all platform values are unique', () => {
    const values = PLATFORM_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('includes self-hosted options', () => {
    const selfHosted = PLATFORM_OPTIONS.filter((o) => o.label.includes('self-hosted'));
    expect(selfHosted.length).toBeGreaterThan(0);
  });

  it('includes all 16 alert types', () => {
    const types: AlertType[] = [
      'discord', 'webhook', 'slack', 'telegram', 'email',
      'pagerduty', 'opsgenie', 'sms', 'teams', 'ntfy',
      'gotify', 'matrix', 'rocketchat', 'apprise', 'mattermost', 'zulip',
    ];
    for (const type of types) {
      expect(PLATFORM_OPTIONS.find((o) => o.value === type)).toBeDefined();
    }
  });
});

describe('CreateChannelModal — wizard step navigation', () => {
  it('can go next from step 0', () => {
    expect(canGoNext(0)).toBe(true);
  });

  it('can go next from step 1', () => {
    expect(canGoNext(1)).toBe(true);
  });

  it('cannot go next from last step (2)', () => {
    expect(canGoNext(2)).toBe(false);
  });

  it('cannot go back from step 0', () => {
    expect(canGoBack(0)).toBe(false);
  });

  it('can go back from step 1', () => {
    expect(canGoBack(1)).toBe(true);
  });

  it('can go back from step 2', () => {
    expect(canGoBack(2)).toBe(true);
  });

  it('step 2 is the last step', () => {
    expect(isLastStep(2)).toBe(true);
  });

  it('step 0 and 1 are not last', () => {
    expect(isLastStep(0)).toBe(false);
    expect(isLastStep(1)).toBe(false);
  });

  it('total steps is 3', () => {
    expect(TOTAL_STEPS).toBe(3);
  });
});

describe('CreateChannelModal — credentialLabel', () => {
  it('telegram → Bot token', () => {
    expect(credentialLabel('telegram')).toBe('Bot token');
  });

  it('email → Email address', () => {
    expect(credentialLabel('email')).toBe('Email address');
  });

  it('pagerduty → Integration Key', () => {
    expect(credentialLabel('pagerduty')).toBe('Integration Key');
  });

  it('opsgenie → API Key', () => {
    expect(credentialLabel('opsgenie')).toBe('API Key');
  });

  it('sms → Account SID', () => {
    expect(credentialLabel('sms')).toBe('Account SID');
  });

  it('ntfy → Topic URL', () => {
    expect(credentialLabel('ntfy')).toBe('Topic URL');
  });

  it('gotify → Server URL', () => {
    expect(credentialLabel('gotify')).toBe('Server URL');
  });

  it('matrix → Homeserver URL', () => {
    expect(credentialLabel('matrix')).toBe('Homeserver URL');
  });

  it('discord falls through to URL default', () => {
    expect(credentialLabel('discord')).toBe('URL');
  });

  it('webhook falls through to URL default', () => {
    expect(credentialLabel('webhook')).toBe('URL');
  });

  it('slack falls through to URL default', () => {
    expect(credentialLabel('slack')).toBe('URL');
  });
});

describe('CreateChannelModal — clampBatchWindow', () => {
  it('valid values pass through', () => {
    expect(clampBatchWindow(0)).toBe(0);
    expect(clampBatchWindow(60)).toBe(60);
    expect(clampBatchWindow(300)).toBe(300);
  });

  it('clamps negative to 0', () => {
    expect(clampBatchWindow(-1)).toBe(0);
  });

  it('clamps above 300 to 300', () => {
    expect(clampBatchWindow(301)).toBe(300);
    expect(clampBatchWindow(9999)).toBe(300);
  });
});

describe('CreateChannelModal — clampGroupWindow', () => {
  it('valid range 1-1440 passes', () => {
    expect(clampGroupWindow(1)).toBe(1);
    expect(clampGroupWindow(60)).toBe(60);
    expect(clampGroupWindow(1440)).toBe(1440);
  });

  it('clamps below 1 to 1', () => {
    expect(clampGroupWindow(0)).toBe(1);
    expect(clampGroupWindow(-10)).toBe(1);
  });

  it('clamps above 1440 (24h) to 1440', () => {
    expect(clampGroupWindow(1441)).toBe(1440);
  });
});

describe('CreateChannelModal — reviewComplete', () => {
  it('complete when name and primary value set', () => {
    expect(reviewComplete('My Channel', 'https://hooks.slack.com/test')).toBe(true);
  });

  it('incomplete when name is empty', () => {
    expect(reviewComplete('', 'https://hooks.slack.com/test')).toBe(false);
  });

  it('incomplete when primary value missing', () => {
    expect(reviewComplete('My Channel', '')).toBe(false);
  });

  it('incomplete when both empty', () => {
    expect(reviewComplete('', '')).toBe(false);
  });

  it('whitespace-only name is incomplete', () => {
    expect(reviewComplete('   ', 'https://hooks.slack.com/test')).toBe(false);
  });
});
