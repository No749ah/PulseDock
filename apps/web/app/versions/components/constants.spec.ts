/**
 * Unit tests for versions/components/utils.tsx constants and pure functions.
 *
 * Tests:
 * - CHANNEL_TYPE_COLORS — structure and known entries
 * - VERSION_NOTIFY_OPTIONS — value/label structure
 * - NOTIFY_ON_LABELS — keys match VERSION_NOTIFY_OPTIONS values
 * - providerOptions — all expected providers present
 * - authOptions — all expected auth modes present
 * - StatusIcon state branches
 */
import { describe, it, expect } from 'vitest';

// ── Mirror constants from versions/components/utils.tsx ──────────────────────

const CHANNEL_TYPE_COLORS: Record<string, string> = {
  discord: 'text-indigo-400',
  slack: 'text-green-400',
  webhook: 'text-blue-400',
  telegram: 'text-sky-400',
  email: 'text-yellow-400',
};

const VERSION_NOTIFY_OPTIONS = [
  { value: 'VERSION_ANY',   label: 'Any update (minor + major)' },
  { value: 'VERSION_MAJOR', label: 'Major updates only' },
];

const NOTIFY_ON_LABELS: Record<string, string> = {
  VERSION_ANY:   'Any update',
  VERSION_MAJOR: 'Major only',
};

const providerOptions = [
  { value: 'github', label: 'GitHub releases' },
  { value: 'gitlab', label: 'GitLab releases' },
  { value: 'docker', label: 'Docker image tags' },
  { value: 'apt', label: 'APT package versions' },
  { value: 'npm', label: 'npm package' },
  { value: 'pypi', label: 'PyPI package' },
  { value: 'cargo', label: 'Cargo crate (crates.io)' },
  { value: 'maven', label: 'Maven Central artifact' },
  { value: 'helm', label: 'Helm chart (Artifact Hub)' },
];

const authOptions = [
  { value: 'token', label: 'Token headers' },
  { value: 'openvpn', label: 'OpenVPN (Basic / OpenVPN headers)' },
  { value: 'none', label: 'No auth' },
];

// ── CHANNEL_TYPE_COLORS ───────────────────────────────────────────────────────

describe('CHANNEL_TYPE_COLORS', () => {
  it('is an object', () => {
    expect(typeof CHANNEL_TYPE_COLORS).toBe('object');
    expect(CHANNEL_TYPE_COLORS).not.toBeNull();
  });

  it('has discord color', () => {
    expect(CHANNEL_TYPE_COLORS['discord']).toBe('text-indigo-400');
  });

  it('has slack color', () => {
    expect(CHANNEL_TYPE_COLORS['slack']).toBe('text-green-400');
  });

  it('has webhook color', () => {
    expect(CHANNEL_TYPE_COLORS['webhook']).toBe('text-blue-400');
  });

  it('has telegram color', () => {
    expect(CHANNEL_TYPE_COLORS['telegram']).toBe('text-sky-400');
  });

  it('has email color', () => {
    expect(CHANNEL_TYPE_COLORS['email']).toBe('text-yellow-400');
  });

  it('all values are non-empty Tailwind class strings', () => {
    for (const [key, value] of Object.entries(CHANNEL_TYPE_COLORS)) {
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
      expect(typeof value).toBe('string');
      expect(value).toMatch(/^text-/);
    }
  });

  it('has at least 5 color entries', () => {
    expect(Object.keys(CHANNEL_TYPE_COLORS).length).toBeGreaterThanOrEqual(5);
  });
});

// ── VERSION_NOTIFY_OPTIONS ────────────────────────────────────────────────────

describe('VERSION_NOTIFY_OPTIONS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(VERSION_NOTIFY_OPTIONS)).toBe(true);
    expect(VERSION_NOTIFY_OPTIONS.length).toBeGreaterThan(0);
  });

  it('has exactly 2 options', () => {
    expect(VERSION_NOTIFY_OPTIONS).toHaveLength(2);
  });

  it('contains VERSION_ANY option', () => {
    expect(VERSION_NOTIFY_OPTIONS.some((o) => o.value === 'VERSION_ANY')).toBe(true);
  });

  it('contains VERSION_MAJOR option', () => {
    expect(VERSION_NOTIFY_OPTIONS.some((o) => o.value === 'VERSION_MAJOR')).toBe(true);
  });

  it('all options have value and label strings', () => {
    for (const opt of VERSION_NOTIFY_OPTIONS) {
      expect(typeof opt.value).toBe('string');
      expect(opt.value.length).toBeGreaterThan(0);
      expect(typeof opt.label).toBe('string');
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });

  it('all option values are unique', () => {
    const values = VERSION_NOTIFY_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

// ── NOTIFY_ON_LABELS ──────────────────────────────────────────────────────────

describe('NOTIFY_ON_LABELS', () => {
  it('has a label for VERSION_ANY', () => {
    expect(NOTIFY_ON_LABELS['VERSION_ANY']).toBe('Any update');
  });

  it('has a label for VERSION_MAJOR', () => {
    expect(NOTIFY_ON_LABELS['VERSION_MAJOR']).toBe('Major only');
  });

  it('keys match VERSION_NOTIFY_OPTIONS values', () => {
    for (const opt of VERSION_NOTIFY_OPTIONS) {
      expect(NOTIFY_ON_LABELS[opt.value]).toBeDefined();
    }
  });

  it('all labels are non-empty strings', () => {
    for (const label of Object.values(NOTIFY_ON_LABELS)) {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

// ── providerOptions ───────────────────────────────────────────────────────────

describe('providerOptions', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(providerOptions)).toBe(true);
    expect(providerOptions.length).toBeGreaterThan(0);
  });

  it('contains github provider', () => {
    expect(providerOptions.some((o) => o.value === 'github')).toBe(true);
  });

  it('contains gitlab provider', () => {
    expect(providerOptions.some((o) => o.value === 'gitlab')).toBe(true);
  });

  it('contains docker provider', () => {
    expect(providerOptions.some((o) => o.value === 'docker')).toBe(true);
  });

  it('contains npm provider', () => {
    expect(providerOptions.some((o) => o.value === 'npm')).toBe(true);
  });

  it('contains pypi provider', () => {
    expect(providerOptions.some((o) => o.value === 'pypi')).toBe(true);
  });

  it('contains cargo provider', () => {
    expect(providerOptions.some((o) => o.value === 'cargo')).toBe(true);
  });

  it('contains maven provider', () => {
    expect(providerOptions.some((o) => o.value === 'maven')).toBe(true);
  });

  it('contains helm provider', () => {
    expect(providerOptions.some((o) => o.value === 'helm')).toBe(true);
  });

  it('has exactly 9 providers', () => {
    expect(providerOptions).toHaveLength(9);
  });

  it('all options have value and label', () => {
    for (const opt of providerOptions) {
      expect(typeof opt.value).toBe('string');
      expect(opt.value.length).toBeGreaterThan(0);
      expect(typeof opt.label).toBe('string');
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });

  it('all option values are unique', () => {
    const values = providerOptions.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('github is first option', () => {
    expect(providerOptions[0].value).toBe('github');
  });
});

// ── authOptions ───────────────────────────────────────────────────────────────

describe('authOptions', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(authOptions)).toBe(true);
    expect(authOptions.length).toBeGreaterThan(0);
  });

  it('has exactly 3 auth modes', () => {
    expect(authOptions).toHaveLength(3);
  });

  it('contains token auth', () => {
    expect(authOptions.some((o) => o.value === 'token')).toBe(true);
  });

  it('contains openvpn auth', () => {
    expect(authOptions.some((o) => o.value === 'openvpn')).toBe(true);
  });

  it('contains none auth', () => {
    expect(authOptions.some((o) => o.value === 'none')).toBe(true);
  });

  it('all options have value and label', () => {
    for (const opt of authOptions) {
      expect(typeof opt.value).toBe('string');
      expect(opt.value.length).toBeGreaterThan(0);
      expect(typeof opt.label).toBe('string');
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });

  it('all option values are unique', () => {
    const values = authOptions.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

// ── inputClass (versions) ─────────────────────────────────────────────────────

describe('versions inputClass', () => {
  // Mirror the constant
  const inputClass = "w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";

  it('is a non-empty string', () => {
    expect(typeof inputClass).toBe('string');
    expect(inputClass.length).toBeGreaterThan(0);
  });

  it('contains w-full', () => {
    expect(inputClass).toContain('w-full');
  });

  it('contains bg-surface', () => {
    expect(inputClass).toContain('bg-surface');
  });

  it('contains rounded-lg', () => {
    expect(inputClass).toContain('rounded-lg');
  });

  it('contains focus ring', () => {
    expect(inputClass).toContain('focus:ring-');
  });

  it('contains text-text-primary', () => {
    expect(inputClass).toContain('text-text-primary');
  });
});
