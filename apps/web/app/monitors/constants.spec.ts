/**
 * Unit tests for monitors/constants.ts
 * Validates that key lookup maps and option arrays are correct and complete.
 */
import { describe, it, expect } from 'vitest';
import {
  CHANNEL_TYPE_COLORS,
  NOTIFY_ON_LABELS,
  UPTIME_NOTIFY_OPTIONS,
  VERSION_NOTIFY_OPTIONS,
  MONITOR_TYPES,
} from './constants';

describe('CHANNEL_TYPE_COLORS', () => {
  const expectedChannels = ['discord', 'slack', 'webhook', 'telegram', 'email'];

  it.each(expectedChannels)('has a color for %s', (channel) => {
    expect(CHANNEL_TYPE_COLORS[channel]).toBeTruthy();
  });

  it('has non-empty CSS class strings', () => {
    for (const value of Object.values(CHANNEL_TYPE_COLORS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe('NOTIFY_ON_LABELS', () => {
  const expectedKeys = ['ON_CHANGE', 'ALWAYS', 'FIRST_ONLY', 'DAILY_DIGEST', 'VERSION_ANY', 'VERSION_MAJOR'];

  it.each(expectedKeys)('has label for %s', (key) => {
    expect(NOTIFY_ON_LABELS[key]).toBeTruthy();
  });

  it('all values are non-empty strings', () => {
    for (const value of Object.values(NOTIFY_ON_LABELS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe('UPTIME_NOTIFY_OPTIONS', () => {
  it('has 4 options', () => {
    expect(UPTIME_NOTIFY_OPTIONS).toHaveLength(4);
  });

  it('each option has value and label', () => {
    for (const opt of UPTIME_NOTIFY_OPTIONS) {
      expect(opt.value).toBeTruthy();
      expect(opt.label).toBeTruthy();
    }
  });

  it('includes ON_CHANGE option', () => {
    expect(UPTIME_NOTIFY_OPTIONS.map((o) => o.value)).toContain('ON_CHANGE');
  });

  it('includes DAILY_DIGEST option', () => {
    expect(UPTIME_NOTIFY_OPTIONS.map((o) => o.value)).toContain('DAILY_DIGEST');
  });
});

describe('VERSION_NOTIFY_OPTIONS', () => {
  it('has 2 options', () => {
    expect(VERSION_NOTIFY_OPTIONS).toHaveLength(2);
  });

  it('includes VERSION_ANY and VERSION_MAJOR', () => {
    const values = VERSION_NOTIFY_OPTIONS.map((o) => o.value);
    expect(values).toContain('VERSION_ANY');
    expect(values).toContain('VERSION_MAJOR');
  });

  it('each option has value and label', () => {
    for (const opt of VERSION_NOTIFY_OPTIONS) {
      expect(opt.value).toBeTruthy();
      expect(opt.label).toBeTruthy();
    }
  });
});

describe('MONITOR_TYPES', () => {
  const expected = ['HTTP', 'TCP', 'SSL_CERT', 'HEARTBEAT', 'DNS', 'PING', 'SMTP', 'GIT_RELEASE', 'DOCKER_IMAGE', 'BROWSER'];

  it.each(expected)('includes %s', (type) => {
    expect(MONITOR_TYPES as readonly string[]).toContain(type);
  });

  it('has at least 10 types', () => {
    expect(MONITOR_TYPES.length).toBeGreaterThanOrEqual(10);
  });
});
