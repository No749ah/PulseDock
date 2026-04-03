/**
 * @vitest-environment node
 * Unit tests for pure helpers/constants in alerts/routing/page.tsx
 */

import { describe, it, expect } from 'vitest';

// ── Inline constants from page.tsx ────────────────────────────────────────────

const MONITOR_TYPES = [
  'HTTP', 'GIT_RELEASE', 'DOCKER_IMAGE', 'TCP', 'SSL_CERT',
  'HEARTBEAT', 'DNS', 'PING', 'SMTP', 'BROWSER', 'WHOIS', 'FTP', 'IMAP', 'POP3',
];

const ALERT_LEVELS = ['green', 'yellow', 'red'];

// RuleForm toggle logic (inline)
function toggle(current: string[], value: string): string[] {
  return current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('alerts/routing/page — MONITOR_TYPES', () => {
  it('has 14 monitor types', () => {
    expect(MONITOR_TYPES).toHaveLength(14);
  });

  it('includes core uptime types', () => {
    expect(MONITOR_TYPES).toContain('HTTP');
    expect(MONITOR_TYPES).toContain('TCP');
    expect(MONITOR_TYPES).toContain('PING');
    expect(MONITOR_TYPES).toContain('HEARTBEAT');
  });

  it('includes certificate/domain types', () => {
    expect(MONITOR_TYPES).toContain('SSL_CERT');
    expect(MONITOR_TYPES).toContain('WHOIS');
    expect(MONITOR_TYPES).toContain('DNS');
  });

  it('includes version intelligence types', () => {
    expect(MONITOR_TYPES).toContain('GIT_RELEASE');
    expect(MONITOR_TYPES).toContain('DOCKER_IMAGE');
  });

  it('includes email protocol types', () => {
    expect(MONITOR_TYPES).toContain('SMTP');
    expect(MONITOR_TYPES).toContain('IMAP');
    expect(MONITOR_TYPES).toContain('POP3');
  });

  it('includes browser and FTP types', () => {
    expect(MONITOR_TYPES).toContain('BROWSER');
    expect(MONITOR_TYPES).toContain('FTP');
  });

  it('has no duplicate types', () => {
    expect(new Set(MONITOR_TYPES).size).toBe(MONITOR_TYPES.length);
  });

  it('all types are uppercase strings', () => {
    for (const t of MONITOR_TYPES) {
      expect(t).toBe(t.toUpperCase());
      expect(typeof t).toBe('string');
    }
  });
});

describe('alerts/routing/page — ALERT_LEVELS', () => {
  it('has exactly 3 alert levels', () => {
    expect(ALERT_LEVELS).toHaveLength(3);
  });

  it('includes green, yellow, red', () => {
    expect(ALERT_LEVELS).toContain('green');
    expect(ALERT_LEVELS).toContain('yellow');
    expect(ALERT_LEVELS).toContain('red');
  });

  it('has no duplicate levels', () => {
    expect(new Set(ALERT_LEVELS).size).toBe(3);
  });

  it('levels are lowercase strings', () => {
    for (const level of ALERT_LEVELS) {
      expect(level).toBe(level.toLowerCase());
    }
  });
});

describe('alerts/routing/page — toggle helper (RuleForm)', () => {
  it('adds value when not present', () => {
    const result = toggle([], 'green');
    expect(result).toContain('green');
    expect(result).toHaveLength(1);
  });

  it('removes value when already present', () => {
    const result = toggle(['green', 'red'], 'green');
    expect(result).not.toContain('green');
    expect(result).toContain('red');
    expect(result).toHaveLength(1);
  });

  it('does not mutate original array', () => {
    const original = ['green'];
    toggle(original, 'red');
    expect(original).toHaveLength(1);
  });

  it('adding to empty array returns single-item array', () => {
    expect(toggle([], 'HTTP')).toEqual(['HTTP']);
  });

  it('toggling same value twice returns to original state', () => {
    const start: string[] = [];
    const after1 = toggle(start, 'HTTP');
    const after2 = toggle(after1, 'HTTP');
    expect(after2).toEqual(start);
  });

  it('preserves order of remaining items when removing', () => {
    const result = toggle(['a', 'b', 'c'], 'b');
    expect(result).toEqual(['a', 'c']);
  });

  it('appends new item at end of array', () => {
    const result = toggle(['a', 'b'], 'c');
    expect(result[result.length - 1]).toBe('c');
  });
});
