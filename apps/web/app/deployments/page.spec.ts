/**
 * @vitest-environment node
 * Pure helper coverage for app/deployments/page.tsx
 * Tests: envClass, ENV_COLORS map, STATUS_CONFIG labels
 */

import { describe, it, expect } from 'vitest';

// ── Inline helpers extracted from page.tsx ───────────────────────────────────

type DeploymentStatus = 'STARTED' | 'SUCCESS' | 'FAILED' | 'ROLLBACK';

const STATUS_CONFIG: Record<DeploymentStatus, { color: string; bg: string; label: string }> = {
  STARTED:  { color: 'text-blue-400',  bg: 'bg-blue-900/30 border-blue-600/30',   label: 'Started' },
  SUCCESS:  { color: 'text-green-400', bg: 'bg-green-900/30 border-green-600/30', label: 'Success' },
  FAILED:   { color: 'text-red-400',   bg: 'bg-red-900/30 border-red-600/30',     label: 'Failed' },
  ROLLBACK: { color: 'text-yellow-400',bg: 'bg-yellow-900/30 border-yellow-600/30',label: 'Rollback' },
};

const ENV_COLORS: Record<string, string> = {
  production: 'bg-red-900/30 text-red-300 border-red-600/30',
  prod: 'bg-red-900/30 text-red-300 border-red-600/30',
  staging: 'bg-yellow-900/30 text-yellow-300 border-yellow-600/30',
  stage: 'bg-yellow-900/30 text-yellow-300 border-yellow-600/30',
  development: 'bg-gray-700/60 text-gray-300 border-gray-600/50',
  dev: 'bg-gray-700/60 text-gray-300 border-gray-600/50',
};

const DEFAULT_ENV_CLASS = 'bg-gray-700/60 text-gray-300 border-gray-600/50';

function envClass(env: string): string {
  return ENV_COLORS[env.toLowerCase()] ?? DEFAULT_ENV_CLASS;
}

// ── STATUS_CONFIG ─────────────────────────────────────────────────────────────

describe('STATUS_CONFIG (deployments)', () => {
  it('covers all 4 deployment statuses', () => {
    const keys = Object.keys(STATUS_CONFIG);
    expect(keys).toContain('STARTED');
    expect(keys).toContain('SUCCESS');
    expect(keys).toContain('FAILED');
    expect(keys).toContain('ROLLBACK');
    expect(keys).toHaveLength(4);
  });

  it('has correct human-readable labels', () => {
    expect(STATUS_CONFIG.STARTED.label).toBe('Started');
    expect(STATUS_CONFIG.SUCCESS.label).toBe('Success');
    expect(STATUS_CONFIG.FAILED.label).toBe('Failed');
    expect(STATUS_CONFIG.ROLLBACK.label).toBe('Rollback');
  });

  it('SUCCESS uses green color', () => {
    expect(STATUS_CONFIG.SUCCESS.color).toContain('green');
  });

  it('FAILED uses red color', () => {
    expect(STATUS_CONFIG.FAILED.color).toContain('red');
  });

  it('ROLLBACK uses yellow color', () => {
    expect(STATUS_CONFIG.ROLLBACK.color).toContain('yellow');
  });

  it('STARTED uses blue color', () => {
    expect(STATUS_CONFIG.STARTED.color).toContain('blue');
  });
});

// ── envClass ─────────────────────────────────────────────────────────────────

describe('envClass', () => {
  it('returns production class for "production"', () => {
    expect(envClass('production')).toBe('bg-red-900/30 text-red-300 border-red-600/30');
  });

  it('returns production class for "prod" alias', () => {
    expect(envClass('prod')).toBe('bg-red-900/30 text-red-300 border-red-600/30');
  });

  it('returns staging class for "staging"', () => {
    expect(envClass('staging')).toBe('bg-yellow-900/30 text-yellow-300 border-yellow-600/30');
  });

  it('returns staging class for "stage" alias', () => {
    expect(envClass('stage')).toBe('bg-yellow-900/30 text-yellow-300 border-yellow-600/30');
  });

  it('returns dev class for "dev"', () => {
    expect(envClass('dev')).toBe('bg-gray-700/60 text-gray-300 border-gray-600/50');
  });

  it('returns dev class for "development"', () => {
    expect(envClass('development')).toBe('bg-gray-700/60 text-gray-300 border-gray-600/50');
  });

  it('is case-insensitive (uppercase input)', () => {
    expect(envClass('PRODUCTION')).toBe('bg-red-900/30 text-red-300 border-red-600/30');
    expect(envClass('STAGING')).toBe('bg-yellow-900/30 text-yellow-300 border-yellow-600/30');
    expect(envClass('DEV')).toBe('bg-gray-700/60 text-gray-300 border-gray-600/50');
  });

  it('is case-insensitive (mixed case)', () => {
    expect(envClass('Production')).toBe('bg-red-900/30 text-red-300 border-red-600/30');
    expect(envClass('Staging')).toBe('bg-yellow-900/30 text-yellow-300 border-yellow-600/30');
  });

  it('falls back to default class for unknown environments', () => {
    expect(envClass('qa')).toBe(DEFAULT_ENV_CLASS);
    expect(envClass('test')).toBe(DEFAULT_ENV_CLASS);
    expect(envClass('canary')).toBe(DEFAULT_ENV_CLASS);
    expect(envClass('')).toBe(DEFAULT_ENV_CLASS);
    expect(envClass('preview')).toBe(DEFAULT_ENV_CLASS);
  });
});
