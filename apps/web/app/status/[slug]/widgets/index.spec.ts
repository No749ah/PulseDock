import { describe, it, expect } from 'vitest';
import { getScopedMonitors, passesVisibilityRule, monitorDetailHref } from './widgetIndexHelpers';
import type { Widget, MonitorSummary } from './shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMonitor(overrides: Partial<MonitorSummary> & { id: string }): MonitorSummary {
  return {
    id: overrides.id,
    name: overrides.name ?? `Monitor ${overrides.id}`,
    type: overrides.type ?? 'HTTP',
    level: overrides.level ?? 'green',
    status: overrides.status ?? 'up',
    uptimePct: overrides.uptimePct ?? 99.9,
    responseMs: overrides.responseMs ?? 100,
    lastChecked: overrides.lastChecked ?? null,
    enabled: overrides.enabled ?? true,
    tags: overrides.tags ?? [],
    folderId: overrides.folderId ?? null,
    message: overrides.message ?? null,
    shareToken: overrides.shareToken ?? null,
  } as MonitorSummary;
}

function makeWidget(config: Record<string, unknown> = {}): Widget {
  return { id: 'w1', type: 'uptime-badge', x: 0, y: 0, w: 2, h: 2, config, locked: false } as Widget;
}

// ── getScopedMonitors ─────────────────────────────────────────────────────────

describe('getScopedMonitors', () => {
  const monitors = [
    makeMonitor({ id: 'a', tags: ['prod'], folderId: 'f1', type: 'HTTP' }),
    makeMonitor({ id: 'b', tags: ['staging'], folderId: 'f2', type: 'TCP' }),
    makeMonitor({ id: 'c', tags: ['prod'], folderId: 'f1', type: 'HTTP' }),
  ];

  it('returns all monitors when no filter config is set', () => {
    expect(getScopedMonitors(makeWidget(), monitors)).toHaveLength(3);
  });

  it('filters by monitorIds array when present', () => {
    const result = getScopedMonitors(makeWidget({ monitorIds: ['a', 'c'] }), monitors);
    expect(result.map(m => m.id)).toEqual(['a', 'c']);
  });

  it('filters by single monitorId when monitorIds is absent', () => {
    const result = getScopedMonitors(makeWidget({ monitorId: 'b' }), monitors);
    expect(result.map(m => m.id)).toEqual(['b']);
  });

  it('monitorIds takes precedence over monitorId', () => {
    const result = getScopedMonitors(makeWidget({ monitorIds: ['a'], monitorId: 'b' }), monitors);
    expect(result.map(m => m.id)).toEqual(['a']);
  });

  it('filters by tag', () => {
    const result = getScopedMonitors(makeWidget({ tag: 'prod' }), monitors);
    expect(result.map(m => m.id)).toEqual(['a', 'c']);
  });

  it('filters by folderId', () => {
    const result = getScopedMonitors(makeWidget({ folderId: 'f2' }), monitors);
    expect(result.map(m => m.id)).toEqual(['b']);
  });

  it('filters by monitorType', () => {
    const result = getScopedMonitors(makeWidget({ monitorType: 'TCP' }), monitors);
    expect(result.map(m => m.id)).toEqual(['b']);
  });

  it('combines tag and folderId filters', () => {
    const result = getScopedMonitors(makeWidget({ tag: 'prod', folderId: 'f1' }), monitors);
    expect(result.map(m => m.id)).toEqual(['a', 'c']);
  });

  it('returns empty array when no monitors match', () => {
    const result = getScopedMonitors(makeWidget({ monitorId: 'z' }), monitors);
    expect(result).toHaveLength(0);
  });
});

// ── passesVisibilityRule ──────────────────────────────────────────────────────

describe('passesVisibilityRule', () => {
  const green = makeMonitor({ id: '1', level: 'green' });
  const yellow = makeMonitor({ id: '2', level: 'yellow' });
  const red = makeMonitor({ id: '3', level: 'red' });

  it('"always" rule always returns true', () => {
    expect(passesVisibilityRule(makeWidget({ visibility: 'always' }), [])).toBe(true);
    expect(passesVisibilityRule(makeWidget({ visibility: 'always' }), [green])).toBe(true);
  });

  it('defaults to "always" when visibility is not set', () => {
    expect(passesVisibilityRule(makeWidget(), [])).toBe(true);
  });

  it('returns false for any non-always rule when scopedMonitors is empty', () => {
    expect(passesVisibilityRule(makeWidget({ visibility: 'outage' }), [])).toBe(false);
    expect(passesVisibilityRule(makeWidget({ visibility: 'degraded' }), [])).toBe(false);
    expect(passesVisibilityRule(makeWidget({ visibility: 'operational' }), [])).toBe(false);
  });

  it('"outage" rule returns true only when a red monitor exists', () => {
    expect(passesVisibilityRule(makeWidget({ visibility: 'outage' }), [red])).toBe(true);
    expect(passesVisibilityRule(makeWidget({ visibility: 'outage' }), [green, yellow])).toBe(false);
  });

  it('"degraded" rule returns true when yellow exists but no red', () => {
    expect(passesVisibilityRule(makeWidget({ visibility: 'degraded' }), [yellow])).toBe(true);
    expect(passesVisibilityRule(makeWidget({ visibility: 'degraded' }), [green, yellow])).toBe(true);
    expect(passesVisibilityRule(makeWidget({ visibility: 'degraded' }), [red, yellow])).toBe(false);
    expect(passesVisibilityRule(makeWidget({ visibility: 'degraded' }), [green])).toBe(false);
  });

  it('"operational" rule returns true when no red or yellow', () => {
    expect(passesVisibilityRule(makeWidget({ visibility: 'operational' }), [green])).toBe(true);
    expect(passesVisibilityRule(makeWidget({ visibility: 'operational' }), [yellow])).toBe(false);
    expect(passesVisibilityRule(makeWidget({ visibility: 'operational' }), [red])).toBe(false);
  });

  it('unknown rule falls through to true', () => {
    expect(passesVisibilityRule(makeWidget({ visibility: 'unknown-rule' }), [green])).toBe(true);
  });
});

// ── monitorDetailHref ─────────────────────────────────────────────────────────

describe('monitorDetailHref', () => {
  it('returns href using monitorId config when set', () => {
    expect(monitorDetailHref(makeWidget({ monitorId: 'abc' }), [])).toBe('/monitors/abc');
  });

  it('returns href from first monitorIds entry when monitorId is absent', () => {
    expect(monitorDetailHref(makeWidget({ monitorIds: ['x', 'y'] }), [])).toBe('/monitors/x');
  });

  it('falls back to first scoped monitor id when no config ids', () => {
    const monitors = [makeMonitor({ id: 'fallback' })];
    expect(monitorDetailHref(makeWidget(), monitors)).toBe('/monitors/fallback');
  });

  it('returns null when no config ids and no scoped monitors', () => {
    expect(monitorDetailHref(makeWidget(), [])).toBeNull();
  });

  it('monitorId takes precedence over monitorIds and scoped', () => {
    const monitors = [makeMonitor({ id: 'scoped' })];
    expect(monitorDetailHref(makeWidget({ monitorId: 'direct', monitorIds: ['list'] }), monitors)).toBe('/monitors/direct');
  });
});
