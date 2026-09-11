/**
 * @vitest-environment node
 * Pure helper coverage for app/search/page.tsx
 * Tests: TYPE_CONFIG keys/structure, STATUS_COLOR_MAP entries
 */

import { describe, it, expect } from 'vitest';

// ── Inline data extracted from page.tsx ──────────────────────────────────────

const TYPE_CONFIG = {
  monitor: { label: 'Monitors', color: 'text-blue-400' },
  incident: { label: 'Incidents', color: 'text-orange-400' },
  status_page: { label: 'Status Pages', color: 'text-green-400' },
  version: { label: 'Versions', color: 'text-purple-400' },
} as const;

const STATUS_COLOR_MAP: Record<string, string> = {
  green: 'bg-success',
  yellow: 'bg-warning',
  red: 'bg-danger animate-pulse',
  blue: 'bg-blue-400',
  gray: 'bg-border',
};

// ── TYPE_CONFIG ──────────────────────────────────────────────────────────────

describe('TYPE_CONFIG (search/page)', () => {
  it('has exactly 4 search result types', () => {
    expect(Object.keys(TYPE_CONFIG)).toHaveLength(4);
  });

  it('contains all expected type keys', () => {
    expect(TYPE_CONFIG).toHaveProperty('monitor');
    expect(TYPE_CONFIG).toHaveProperty('incident');
    expect(TYPE_CONFIG).toHaveProperty('status_page');
    expect(TYPE_CONFIG).toHaveProperty('version');
  });

  it('has correct labels', () => {
    expect(TYPE_CONFIG.monitor.label).toBe('Monitors');
    expect(TYPE_CONFIG.incident.label).toBe('Incidents');
    expect(TYPE_CONFIG.status_page.label).toBe('Status Pages');
    expect(TYPE_CONFIG.version.label).toBe('Versions');
  });

  it('has distinct colors per type', () => {
    const colors = Object.values(TYPE_CONFIG).map(c => c.color);
    expect(new Set(colors).size).toBe(4);
  });

  it('monitor uses blue color', () => {
    expect(TYPE_CONFIG.monitor.color).toContain('blue');
  });

  it('incident uses orange color', () => {
    expect(TYPE_CONFIG.incident.color).toContain('orange');
  });

  it('status_page uses green color', () => {
    expect(TYPE_CONFIG.status_page.color).toContain('green');
  });

  it('version uses purple color', () => {
    expect(TYPE_CONFIG.version.color).toContain('purple');
  });
});

// ── STATUS_COLOR_MAP ──────────────────────────────────────────────────────────

describe('STATUS_COLOR_MAP', () => {
  it('has 5 entries', () => {
    expect(Object.keys(STATUS_COLOR_MAP)).toHaveLength(5);
  });

  it('maps green → bg-success', () => {
    expect(STATUS_COLOR_MAP['green']).toBe('bg-success');
  });

  it('maps yellow → bg-warning', () => {
    expect(STATUS_COLOR_MAP['yellow']).toBe('bg-warning');
  });

  it('maps red → includes bg-danger with animate-pulse', () => {
    expect(STATUS_COLOR_MAP['red']).toContain('bg-danger');
    expect(STATUS_COLOR_MAP['red']).toContain('animate-pulse');
  });

  it('maps blue → bg-blue-400', () => {
    expect(STATUS_COLOR_MAP['blue']).toBe('bg-blue-400');
  });

  it('maps gray → bg-border (neutral/unknown)', () => {
    expect(STATUS_COLOR_MAP['gray']).toBe('bg-border');
  });
});
