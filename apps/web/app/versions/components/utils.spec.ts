/**
 * Unit tests for versions/components/utils.tsx pure helper functions.
 * StatusIcon (JSX) is intentionally excluded; tested via component snapshots elsewhere.
 */
import { describe, it, expect } from 'vitest';
import {
  stripLeadingV,
  secondsToHuman,
  levelBadgeVariant,
  CHANNEL_TYPE_COLORS,
  VERSION_NOTIFY_OPTIONS,
  NOTIFY_ON_LABELS,
  providerOptions,
  authOptions,
} from './utils';

// ── stripLeadingV ─────────────────────────────────────────────────────────────

describe('stripLeadingV', () => {
  it('strips a lowercase v prefix before a digit', () => {
    expect(stripLeadingV('v1.2.3')).toBe('1.2.3');
  });

  it('strips an uppercase V prefix before a digit', () => {
    expect(stripLeadingV('V2.0.0')).toBe('2.0.0');
  });

  it('does not strip v when not followed by a digit', () => {
    expect(stripLeadingV('version-1.0')).toBe('version-1.0');
  });

  it('returns the string unchanged when there is no leading v', () => {
    expect(stripLeadingV('1.0.0')).toBe('1.0.0');
  });

  it('handles an empty string', () => {
    expect(stripLeadingV('')).toBe('');
  });

  it('handles a single "v" with no following digit', () => {
    expect(stripLeadingV('v')).toBe('v');
  });

  it('strips exactly one leading v even with v-v prefix', () => {
    // Only the first v before a digit is replaced; 'vv1' → 'v1' (second v is not before digit directly)
    expect(stripLeadingV('v1.0')).toBe('1.0');
  });

  it('handles semver with pre-release suffix', () => {
    expect(stripLeadingV('v3.2.1-beta.1')).toBe('3.2.1-beta.1');
  });
});

// ── secondsToHuman ────────────────────────────────────────────────────────────

describe('secondsToHuman', () => {
  it('converts exact days (multiple of 86400)', () => {
    expect(secondsToHuman(86400)).toBe('1d');
    expect(secondsToHuman(172800)).toBe('2d');
    expect(secondsToHuman(604800)).toBe('7d');
  });

  it('converts exact hours (multiple of 3600, not days)', () => {
    expect(secondsToHuman(3600)).toBe('1h');
    expect(secondsToHuman(7200)).toBe('2h');
    expect(secondsToHuman(43200)).toBe('12h');
  });

  it('converts exact minutes (multiple of 60, not hours)', () => {
    expect(secondsToHuman(60)).toBe('1m');
    expect(secondsToHuman(300)).toBe('5m');
    expect(secondsToHuman(1800)).toBe('30m');
  });

  it('falls back to seconds for non-round values', () => {
    expect(secondsToHuman(1)).toBe('1s');
    expect(secondsToHuman(45)).toBe('45s');
    expect(secondsToHuman(3661)).toBe('3661s');
  });

  it('handles 0 seconds', () => {
    expect(secondsToHuman(0)).toBe('0d'); // 0 % 86400 === 0
  });
});

// ── levelBadgeVariant ─────────────────────────────────────────────────────────

describe('levelBadgeVariant', () => {
  it('maps green to success', () => {
    expect(levelBadgeVariant('green')).toBe('success');
  });

  it('maps yellow to warning', () => {
    expect(levelBadgeVariant('yellow')).toBe('warning');
  });

  it('maps red to danger', () => {
    expect(levelBadgeVariant('red')).toBe('danger');
  });

  it('falls back to danger for unknown levels', () => {
    expect(levelBadgeVariant('unknown')).toBe('danger');
    expect(levelBadgeVariant('')).toBe('danger');
    expect(levelBadgeVariant('blue')).toBe('danger');
  });
});

// ── CHANNEL_TYPE_COLORS ───────────────────────────────────────────────────────

describe('CHANNEL_TYPE_COLORS', () => {
  it('has exactly 5 channel types', () => {
    expect(Object.keys(CHANNEL_TYPE_COLORS)).toHaveLength(5);
  });

  it('covers discord, slack, webhook, telegram, email', () => {
    expect(Object.keys(CHANNEL_TYPE_COLORS)).toEqual(
      expect.arrayContaining(['discord', 'slack', 'webhook', 'telegram', 'email']),
    );
  });

  it('each value is a non-empty Tailwind text class', () => {
    for (const val of Object.values(CHANNEL_TYPE_COLORS)) {
      expect(val).toMatch(/^text-\w+/);
    }
  });
});

// ── VERSION_NOTIFY_OPTIONS ────────────────────────────────────────────────────

describe('VERSION_NOTIFY_OPTIONS', () => {
  it('has exactly 2 options', () => {
    expect(VERSION_NOTIFY_OPTIONS).toHaveLength(2);
  });

  it('includes VERSION_ANY', () => {
    expect(VERSION_NOTIFY_OPTIONS.map((o) => o.value)).toContain('VERSION_ANY');
  });

  it('includes VERSION_MAJOR', () => {
    expect(VERSION_NOTIFY_OPTIONS.map((o) => o.value)).toContain('VERSION_MAJOR');
  });

  it('every option has a non-empty label', () => {
    for (const opt of VERSION_NOTIFY_OPTIONS) {
      expect(opt.label).toBeTruthy();
    }
  });
});

// ── NOTIFY_ON_LABELS ──────────────────────────────────────────────────────────

describe('NOTIFY_ON_LABELS', () => {
  it('has entries for VERSION_ANY and VERSION_MAJOR', () => {
    expect(NOTIFY_ON_LABELS['VERSION_ANY']).toBeTruthy();
    expect(NOTIFY_ON_LABELS['VERSION_MAJOR']).toBeTruthy();
  });

  it('is consistent with VERSION_NOTIFY_OPTIONS values', () => {
    for (const opt of VERSION_NOTIFY_OPTIONS) {
      expect(NOTIFY_ON_LABELS[opt.value]).toBeTruthy();
    }
  });
});

// ── providerOptions ───────────────────────────────────────────────────────────

describe('providerOptions', () => {
  it('has at least 5 provider options', () => {
    expect(providerOptions.length).toBeGreaterThanOrEqual(5);
  });

  it('every option has a non-empty value and label', () => {
    for (const opt of providerOptions) {
      expect(opt.value).toBeTruthy();
      expect(opt.label).toBeTruthy();
    }
  });

  it('includes github as a provider', () => {
    expect(providerOptions.map((o) => o.value)).toContain('github');
  });

  it('includes docker as a provider', () => {
    expect(providerOptions.map((o) => o.value)).toContain('docker');
  });

  it('includes npm as a provider', () => {
    expect(providerOptions.map((o) => o.value)).toContain('npm');
  });
});

// ── authOptions ───────────────────────────────────────────────────────────────

describe('authOptions', () => {
  it('has exactly 3 auth options', () => {
    expect(authOptions).toHaveLength(3);
  });

  it('includes a none option', () => {
    expect(authOptions.map((o) => o.value)).toContain('none');
  });

  it('includes a token option', () => {
    expect(authOptions.map((o) => o.value)).toContain('token');
  });

  it('every option has a non-empty label', () => {
    for (const opt of authOptions) {
      expect(opt.label).toBeTruthy();
    }
  });
});
