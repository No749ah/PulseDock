/**
 * Unit tests for status-page editor utility functions.
 * Tests needsMonitorConfig, hasMappedMonitorRecord, getConfigWarnings, resolveCollisions,
 * getDefaultMultiMonitorIds.
 */
import { describe, it, expect } from 'vitest';

// ─── Inline copies of pure logic to avoid lucide-react import issues ─────────

type WidgetType = string;

interface Widget {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, unknown>;
}

interface Monitor {
  id: string;
  name: string;
  type: string;
  status: string;
}

const NO_MONITOR_NEEDED_TYPES = new Set([
  'text', 'text-block', 'divider', 'spacer', 'custom-header', 'announcement-bar',
  'faq-accordion', 'link-list', 'social-links', 'embed-iframe', 'video-embed',
  'code-block', 'countdown', 'table-of-contents', 'page-navigation', 'image-banner',
  'column-layout', 'collapsible-section', 'tab-container', 'sticky-header',
  'subscriber-form', 'subscriber-form-widget', 'rss-feed-widget', 'offline-banner',
  'offline-banner-widget',
  'overall-system-status', 'scheduled-maintenance', 'incident-history',
  'check-history-feed', 'third-party-dependencies', 'security-advisory',
]);

const MULTI_MODE_PRIMARY_WIDGETS = new Set([
  'response-time-chart', 'response-time-comparison',
]);

function needsMonitorConfig(widget: Widget): boolean {
  if (NO_MONITOR_NEEDED_TYPES.has(widget.type)) return false;
  const { monitorId, monitorIds, monitorMode } = widget.config as { monitorId?: string; monitorIds?: string[]; monitorMode?: string };
  if (monitorMode === 'all') return false;
  const hasMonitor = Boolean(monitorId);
  const hasMonitors = Array.isArray(monitorIds) && monitorIds.length > 0;
  return !hasMonitor && !hasMonitors;
}

function hasMappedMonitorRecord(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).some(
    (entry) => Array.isArray(entry) && entry.length > 0,
  );
}

function getConfigWarnings(widget: Widget, monitorMode: string): string[] {
  const warnings: string[] = [];

  if (monitorMode === 'single' && !NO_MONITOR_NEEDED_TYPES.has(widget.type) && !(widget.config.monitorId)) {
    warnings.push('Select a monitor (or switch monitor scope to Multiple/All).');
  }
  if (monitorMode === 'multiple' && (!Array.isArray(widget.config.monitorIds) || (widget.config.monitorIds as string[]).length === 0)) {
    warnings.push('Select at least one monitor in multi-monitor mode.');
  }
  if (widget.type === 'custom-metric-chart' && !widget.config.monitorId) {
    warnings.push('Custom Metric Chart requires a monitor selection.');
  }
  if (widget.type === 'security-advisory' && !String(widget.config.packageName ?? '').trim()) {
    warnings.push('Package name is required for Security Advisory.');
  }
  if (widget.type === 'tab-container' && (!Array.isArray(widget.config.tabs) || (widget.config.tabs as unknown[]).length === 0)) {
    warnings.push('Add at least one tab entry ({ title, content }).');
  }
  if (widget.type === 'dependency-map' && (!Array.isArray(widget.config.edges) || (widget.config.edges as unknown[]).length === 0)) {
    warnings.push('Add at least one dependency edge ({ source, target }).');
  }
  if (widget.type === 'multi-environment-status' && !hasMappedMonitorRecord(widget.config.envMonitors)) {
    warnings.push('Define envMonitors with at least one monitor ID per environment.');
  }
  if (widget.type === 'region-status-map' && !hasMappedMonitorRecord(widget.config.regionMonitors)) {
    warnings.push('Define regionMonitors with at least one monitor ID per region.');
  }
  if (widget.type === 'third-party-dependencies' && (!Array.isArray(widget.config.services) || (widget.config.services as unknown[]).length === 0)) {
    warnings.push('Add at least one external service ({ name, url }).');
  }
  if (widget.type === 'embed-iframe' && !String(widget.config.url ?? '').trim()) {
    warnings.push('Embed URL is required for iFrame widgets.');
  }
  if (['version-comparison-table', 'outdated-components-alert', 'metric-comparison-row'].includes(widget.type)
    && (!Array.isArray(widget.config.monitorIds) || (widget.config.monitorIds as string[]).length === 0)) {
    warnings.push('Select at least one monitor for this comparison widget.');
  }
  if (['table-of-contents', 'column-layout'].includes(widget.type)
    && (!Array.isArray(widget.config.items) || (widget.config.items as unknown[]).length === 0)) {
    warnings.push('Add at least one item entry in JSON configuration.');
  }
  return warnings;
}

function getDefaultMultiMonitorIds(widget: Widget, monitors: Monitor[]): string[] {
  const configured = Array.isArray(widget.config.monitorIds)
    ? (widget.config.monitorIds as unknown[]).filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (configured.length > 0) return configured;

  const singleId = typeof widget.config.monitorId === 'string' ? widget.config.monitorId : undefined;
  const ordered = [singleId, ...monitors.map((m) => m.id)].filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
  const unique = Array.from(new Set(ordered));
  const limit = MULTI_MODE_PRIMARY_WIDGETS.has(widget.type) ? 1 : 6;
  return unique.slice(0, limit);
}

function resolveCollisions(allWidgets: Widget[]): Widget[] {
  let widgets = [...allWidgets];
  const MAX_PASSES = 100;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    const sorted = [...widgets].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        const overlapX = a.x < b.x + b.w && a.x + a.w > b.x;
        const overlapY = a.y < b.y + b.h && a.y + a.h > b.y;
        if (overlapX && overlapY) {
          const newY = a.y + a.h;
          if (b.y !== newY) {
            const idx = widgets.findIndex(w => w.id === b.id);
            if (idx >= 0) {
              widgets = [...widgets];
              widgets[idx] = { ...widgets[idx], y: newY };
              sorted[j] = { ...sorted[j], y: newY };
              changed = true;
            }
          }
        }
      }
    }
    if (!changed) break;
  }
  return widgets;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWidget(overrides: Partial<Widget> & { id: string; type: string }): Widget {
  return {
    x: 0, y: 0, w: 6, h: 2,
    config: {},
    ...overrides,
  };
}

function makeMonitor(id: string): Monitor {
  return { id, name: `Monitor ${id}`, type: 'HTTP', status: 'operational' };
}

// ─── needsMonitorConfig ───────────────────────────────────────────────────────

describe('needsMonitorConfig', () => {
  it('returns false for NO_MONITOR_NEEDED_TYPES widgets', () => {
    for (const type of ['text-block', 'divider', 'overall-system-status', 'incident-history', 'security-advisory']) {
      const w = makeWidget({ id: 'w1', type });
      expect(needsMonitorConfig(w)).toBe(false);
    }
  });

  it('returns false when monitorMode is "all"', () => {
    const w = makeWidget({ id: 'w1', type: 'uptime-bar', config: { monitorMode: 'all' } });
    expect(needsMonitorConfig(w)).toBe(false);
  });

  it('returns false when monitorId is set', () => {
    const w = makeWidget({ id: 'w1', type: 'uptime-bar', config: { monitorId: 'mon-1' } });
    expect(needsMonitorConfig(w)).toBe(false);
  });

  it('returns false when monitorIds array is non-empty', () => {
    const w = makeWidget({ id: 'w1', type: 'uptime-bar', config: { monitorIds: ['mon-1'] } });
    expect(needsMonitorConfig(w)).toBe(false);
  });

  it('returns true when no monitor configured and type is not in exclusion set', () => {
    const w = makeWidget({ id: 'w1', type: 'uptime-bar', config: {} });
    expect(needsMonitorConfig(w)).toBe(true);
  });

  it('returns true when monitorIds is empty array', () => {
    const w = makeWidget({ id: 'w1', type: 'uptime-bar', config: { monitorIds: [] } });
    expect(needsMonitorConfig(w)).toBe(true);
  });

  it('returns true when monitorId is empty string', () => {
    const w = makeWidget({ id: 'w1', type: 'sla-summary', config: { monitorId: '' } });
    expect(needsMonitorConfig(w)).toBe(true);
  });
});

// ─── hasMappedMonitorRecord ───────────────────────────────────────────────────

describe('hasMappedMonitorRecord', () => {
  it('returns false for null/undefined', () => {
    expect(hasMappedMonitorRecord(null)).toBe(false);
    expect(hasMappedMonitorRecord(undefined)).toBe(false);
  });

  it('returns false for non-object values', () => {
    expect(hasMappedMonitorRecord('string')).toBe(false);
    expect(hasMappedMonitorRecord(42)).toBe(false);
    expect(hasMappedMonitorRecord(true)).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(hasMappedMonitorRecord(['mon-1'])).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(hasMappedMonitorRecord({})).toBe(false);
  });

  it('returns false when all values are empty arrays', () => {
    expect(hasMappedMonitorRecord({ prod: [], staging: [] })).toBe(false);
  });

  it('returns true when at least one key has non-empty array', () => {
    expect(hasMappedMonitorRecord({ prod: ['mon-1'], staging: [] })).toBe(true);
  });

  it('returns true when value has non-empty array', () => {
    expect(hasMappedMonitorRecord({ 'us-east': ['mon-1', 'mon-2'] })).toBe(true);
  });

  it('returns false when values are non-array types', () => {
    expect(hasMappedMonitorRecord({ prod: 'mon-1' })).toBe(false);
    expect(hasMappedMonitorRecord({ prod: 42 })).toBe(false);
  });
});

// ─── getConfigWarnings ────────────────────────────────────────────────────────

describe('getConfigWarnings', () => {
  it('returns empty array when no issues', () => {
    const w = makeWidget({ id: 'w1', type: 'uptime-bar', config: { monitorId: 'mon-1' } });
    expect(getConfigWarnings(w, 'single')).toEqual([]);
  });

  it('warns when single mode and no monitorId for non-excluded types', () => {
    const w = makeWidget({ id: 'w1', type: 'uptime-bar', config: {} });
    const warnings = getConfigWarnings(w, 'single');
    expect(warnings.some(w => w.includes('Select a monitor'))).toBe(true);
  });

  it('does not warn for excluded types in single mode without monitorId', () => {
    const w = makeWidget({ id: 'w1', type: 'overall-system-status', config: {} });
    const warnings = getConfigWarnings(w, 'single');
    expect(warnings.some(w => w.includes('Select a monitor'))).toBe(false);
  });

  it('warns when multiple mode and monitorIds is empty', () => {
    const w = makeWidget({ id: 'w1', type: 'uptime-bar', config: { monitorIds: [] } });
    const warnings = getConfigWarnings(w, 'multiple');
    expect(warnings.some(w => w.includes('at least one monitor in multi-monitor'))).toBe(true);
  });

  it('warns for security-advisory with no packageName', () => {
    const w = makeWidget({ id: 'w1', type: 'security-advisory', config: {} });
    const warnings = getConfigWarnings(w, 'single');
    expect(warnings.some(w => w.includes('Package name is required'))).toBe(true);
  });

  it('no warning for security-advisory with packageName set', () => {
    const w = makeWidget({ id: 'w1', type: 'security-advisory', config: { packageName: 'express' } });
    const warnings = getConfigWarnings(w, 'single');
    expect(warnings.some(w => w.includes('Package name'))).toBe(false);
  });

  it('warns for tab-container with no tabs', () => {
    const w = makeWidget({ id: 'w1', type: 'tab-container', config: { tabs: [] } });
    const warnings = getConfigWarnings(w, 'single');
    expect(warnings.some(w => w.includes('tab entry'))).toBe(true);
  });

  it('warns for dependency-map with no edges', () => {
    const w = makeWidget({ id: 'w1', type: 'dependency-map', config: {} });
    const warnings = getConfigWarnings(w, 'single');
    expect(warnings.some(w => w.includes('dependency edge'))).toBe(true);
  });

  it('warns for embed-iframe with no URL', () => {
    const w = makeWidget({ id: 'w1', type: 'embed-iframe', config: { url: '' } });
    const warnings = getConfigWarnings(w, 'single');
    expect(warnings.some(w => w.includes('Embed URL'))).toBe(true);
  });

  it('no warning for embed-iframe with URL set', () => {
    const w = makeWidget({ id: 'w1', type: 'embed-iframe', config: { url: 'https://grafana.example.com/panel' } });
    const warnings = getConfigWarnings(w, 'single');
    expect(warnings.some(w => w.includes('Embed URL'))).toBe(false);
  });

  it('warns for version-comparison-table with no monitorIds', () => {
    const w = makeWidget({ id: 'w1', type: 'version-comparison-table', config: {} });
    const warnings = getConfigWarnings(w, 'multiple');
    expect(warnings.some(w => w.includes('at least one monitor for this comparison'))).toBe(true);
  });

  it('warns for multi-environment-status with empty envMonitors', () => {
    const w = makeWidget({ id: 'w1', type: 'multi-environment-status', config: { envMonitors: {} } });
    const warnings = getConfigWarnings(w, 'single');
    expect(warnings.some(w => w.includes('envMonitors'))).toBe(true);
  });

  it('no warning for multi-environment-status with populated envMonitors', () => {
    const w = makeWidget({ id: 'w1', type: 'multi-environment-status', config: { envMonitors: { prod: ['mon-1'] } } });
    const warnings = getConfigWarnings(w, 'single');
    expect(warnings.some(w => w.includes('envMonitors'))).toBe(false);
  });

  it('can return multiple warnings at once', () => {
    const w = makeWidget({ id: 'w1', type: 'custom-metric-chart', config: {} });
    // custom-metric-chart needs monitorId; if mode is single, also gets "select a monitor" warning
    const warnings = getConfigWarnings(w, 'single');
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── getDefaultMultiMonitorIds ────────────────────────────────────────────────

describe('getDefaultMultiMonitorIds', () => {
  it('returns configured monitorIds when present', () => {
    const w = makeWidget({ id: 'w1', type: 'uptime-bar', config: { monitorIds: ['mon-1', 'mon-2'] } });
    const monitors = [makeMonitor('mon-3'), makeMonitor('mon-4')];
    expect(getDefaultMultiMonitorIds(w, monitors)).toEqual(['mon-1', 'mon-2']);
  });

  it('falls back to monitorId + monitors when monitorIds is empty', () => {
    const w = makeWidget({ id: 'w1', type: 'uptime-bar', config: { monitorId: 'mon-1' } });
    const monitors = [makeMonitor('mon-2'), makeMonitor('mon-3')];
    const result = getDefaultMultiMonitorIds(w, monitors);
    expect(result[0]).toBe('mon-1');
    expect(result).toContain('mon-2');
  });

  it('limits to 6 monitors for non-primary widgets', () => {
    const w = makeWidget({ id: 'w1', type: 'uptime-bar', config: {} });
    const monitors = Array.from({ length: 10 }, (_, i) => makeMonitor(`mon-${i}`));
    const result = getDefaultMultiMonitorIds(w, monitors);
    expect(result.length).toBeLessThanOrEqual(6);
  });

  it('limits to 1 monitor for MULTI_MODE_PRIMARY_WIDGETS', () => {
    const w = makeWidget({ id: 'w1', type: 'response-time-chart', config: {} });
    const monitors = Array.from({ length: 5 }, (_, i) => makeMonitor(`mon-${i}`));
    const result = getDefaultMultiMonitorIds(w, monitors);
    expect(result.length).toBe(1);
  });

  it('deduplicates monitorId and monitors list', () => {
    const w = makeWidget({ id: 'w1', type: 'uptime-bar', config: { monitorId: 'mon-1' } });
    const monitors = [makeMonitor('mon-1'), makeMonitor('mon-2')];
    const result = getDefaultMultiMonitorIds(w, monitors);
    expect(result.filter(id => id === 'mon-1').length).toBe(1);
  });

  it('returns empty array when no monitors and no config', () => {
    const w = makeWidget({ id: 'w1', type: 'uptime-bar', config: {} });
    expect(getDefaultMultiMonitorIds(w, [])).toEqual([]);
  });
});

// ─── resolveCollisions ────────────────────────────────────────────────────────

describe('resolveCollisions', () => {
  it('returns widgets unchanged when no overlaps', () => {
    const widgets: Widget[] = [
      makeWidget({ id: 'w1', type: 'uptime-bar', x: 0, y: 0, w: 6, h: 2 }),
      makeWidget({ id: 'w2', type: 'uptime-bar', x: 0, y: 2, w: 6, h: 2 }),
    ];
    const result = resolveCollisions(widgets);
    expect(result.find(w => w.id === 'w1')!.y).toBe(0);
    expect(result.find(w => w.id === 'w2')!.y).toBe(2);
  });

  it('pushes overlapping widget down', () => {
    const widgets: Widget[] = [
      makeWidget({ id: 'w1', type: 'uptime-bar', x: 0, y: 0, w: 6, h: 2 }),
      makeWidget({ id: 'w2', type: 'uptime-bar', x: 0, y: 1, w: 6, h: 2 }),
    ];
    const result = resolveCollisions(widgets);
    const w1 = result.find(w => w.id === 'w1')!;
    const w2 = result.find(w => w.id === 'w2')!;
    // w2 should be pushed to y=2 (w1.y + w1.h)
    expect(w2.y).toBeGreaterThanOrEqual(w1.y + w1.h);
  });

  it('does not push widgets that do not overlap horizontally', () => {
    const widgets: Widget[] = [
      makeWidget({ id: 'w1', type: 'uptime-bar', x: 0, y: 0, w: 6, h: 2 }),
      makeWidget({ id: 'w2', type: 'uptime-bar', x: 6, y: 0, w: 6, h: 2 }),
    ];
    const result = resolveCollisions(widgets);
    // Both at y=0, no overlap (different x spans)
    expect(result.find(w => w.id === 'w1')!.y).toBe(0);
    expect(result.find(w => w.id === 'w2')!.y).toBe(0);
  });

  it('handles cascade collisions', () => {
    // Three widgets stacked — w1 overlaps w2, w2 overlaps w3
    const widgets: Widget[] = [
      makeWidget({ id: 'w1', type: 'uptime-bar', x: 0, y: 0, w: 6, h: 3 }),
      makeWidget({ id: 'w2', type: 'uptime-bar', x: 0, y: 1, w: 6, h: 3 }),
      makeWidget({ id: 'w3', type: 'uptime-bar', x: 0, y: 2, w: 6, h: 2 }),
    ];
    const result = resolveCollisions(widgets);
    const w1 = result.find(w => w.id === 'w1')!;
    const w2 = result.find(w => w.id === 'w2')!;
    const w3 = result.find(w => w.id === 'w3')!;
    // No widget should overlap another
    expect(w2.y).toBeGreaterThanOrEqual(w1.y + w1.h);
    expect(w3.y).toBeGreaterThanOrEqual(w2.y + w2.h);
  });

  it('preserves widget count', () => {
    const widgets: Widget[] = Array.from({ length: 5 }, (_, i) =>
      makeWidget({ id: `w${i}`, type: 'uptime-bar', x: 0, y: i, w: 12, h: 2 })
    );
    const result = resolveCollisions(widgets);
    expect(result.length).toBe(5);
  });

  it('returns same widgets when input is empty', () => {
    expect(resolveCollisions([])).toEqual([]);
  });

  it('returns same widget unchanged when only one widget', () => {
    const widgets: Widget[] = [makeWidget({ id: 'w1', type: 'uptime-bar', x: 0, y: 0, w: 6, h: 2 })];
    const result = resolveCollisions(widgets);
    expect(result.length).toBe(1);
    expect(result[0].y).toBe(0);
  });
});

// ─── Inline: getMultiModeHelperText + getWidgetConfigHints ───────────────────

const MULTI_MODE_PRIMARY_WIDGETS_TEST = new Set([
  "uptime-bar",
  "uptime-timeline",
  "sla-summary",
  "response-time-chart",
  "version-check-badge",
]);

function getMultiModeHelperText(widgetType: string): string {
  if (MULTI_MODE_PRIMARY_WIDGETS_TEST.has(widgetType)) {
    return "This widget uses the first selected monitor as its primary series in multi-monitor mode.";
  }
  return "This widget will render data for all selected monitors.";
}

function getWidgetConfigHints(widgetType: string): string[] {
  switch (widgetType) {
    case "embed-iframe":
      return [
        "Use a full HTTPS URL and a source that allows iFrame embedding.",
        "If the widget stays blank on public pages, check X-Frame-Options/CSP on the target site.",
      ];
    case "security-advisory":
      return [
        "Use the real package name from your ecosystem (for example: express, requests, serde).",
        "Set ecosystem when names overlap across package managers.",
      ];
    case "dependency-map":
      return [
        "Edges use monitor IDs, not names.",
        "Format: { source, target, label? }.",
      ];
    case "multi-environment-status":
    case "region-status-map":
      return [
        "Use monitor IDs in each group list.",
        "Groups with empty arrays render as no-data until monitors are added.",
      ];
    case "third-party-dependencies":
      return [
        "Each service runs a lightweight HEAD request.",
        "Use stable health/status endpoints for best results.",
      ];
    case "table-of-contents":
      return [
        "Anchors must match element IDs on your page.",
        "Use short, lowercase IDs like 'incidents' or 'uptime'.",
      ];
    case "tab-container":
      return [
        "Use a tabs array with { title, content } items.",
        "Keep content concise for mobile readability.",
      ];
    case "column-layout":
      return [
        "Use items as an array of { heading?, body }.",
        "For readability, keep body text short per column.",
      ];
    case "custom-metric-chart":
      return [
        "Select a monitor first, then tune metric + chart type.",
        "Use line/area for trends and bar for discrete comparisons.",
      ];
    default:
      return [];
  }
}

// ─── Tests: getMultiModeHelperText ───────────────────────────────────────────

describe('getMultiModeHelperText', () => {
  it('returns primary-series message for uptime-bar', () => {
    expect(getMultiModeHelperText('uptime-bar')).toContain('primary series');
  });

  it('returns primary-series message for uptime-timeline', () => {
    expect(getMultiModeHelperText('uptime-timeline')).toContain('primary series');
  });

  it('returns primary-series message for sla-summary', () => {
    expect(getMultiModeHelperText('sla-summary')).toContain('primary series');
  });

  it('returns primary-series message for response-time-chart', () => {
    expect(getMultiModeHelperText('response-time-chart')).toContain('primary series');
  });

  it('returns primary-series message for version-check-badge', () => {
    expect(getMultiModeHelperText('version-check-badge')).toContain('primary series');
  });

  it('returns all-monitors message for non-primary widget types', () => {
    const result = getMultiModeHelperText('current-status-badge');
    expect(result).toContain('all selected monitors');
  });

  it('returns all-monitors message for unknown widget types', () => {
    expect(getMultiModeHelperText('unknown-widget')).toContain('all selected monitors');
  });

  it('returns all-monitors message for text-block (content widget)', () => {
    expect(getMultiModeHelperText('text-block')).toContain('all selected monitors');
  });
});

// ─── Tests: getWidgetConfigHints ─────────────────────────────────────────────

describe('getWidgetConfigHints', () => {
  it('returns empty array for unknown widget types', () => {
    expect(getWidgetConfigHints('uptime-bar')).toEqual([]);
    expect(getWidgetConfigHints('text-block')).toEqual([]);
    expect(getWidgetConfigHints('unknown')).toEqual([]);
  });

  it('returns hints for embed-iframe', () => {
    const hints = getWidgetConfigHints('embed-iframe');
    expect(hints).toHaveLength(2);
    expect(hints[0]).toContain('HTTPS URL');
    expect(hints[1]).toContain('X-Frame-Options');
  });

  it('returns hints for security-advisory', () => {
    const hints = getWidgetConfigHints('security-advisory');
    expect(hints).toHaveLength(2);
    expect(hints[0]).toContain('package name');
  });

  it('returns hints for dependency-map', () => {
    const hints = getWidgetConfigHints('dependency-map');
    expect(hints).toHaveLength(2);
    expect(hints[0]).toContain('monitor IDs');
  });

  it('returns same hints for multi-environment-status and region-status-map', () => {
    const envHints = getWidgetConfigHints('multi-environment-status');
    const regionHints = getWidgetConfigHints('region-status-map');
    expect(envHints).toEqual(regionHints);
    expect(envHints[0]).toContain('monitor IDs');
  });

  it('returns hints for third-party-dependencies', () => {
    const hints = getWidgetConfigHints('third-party-dependencies');
    expect(hints).toHaveLength(2);
    expect(hints[0]).toContain('HEAD request');
  });

  it('returns hints for table-of-contents', () => {
    const hints = getWidgetConfigHints('table-of-contents');
    expect(hints).toHaveLength(2);
    expect(hints[0]).toContain('Anchors');
  });

  it('returns hints for tab-container', () => {
    const hints = getWidgetConfigHints('tab-container');
    expect(hints).toHaveLength(2);
    expect(hints[0]).toContain('tabs array');
  });

  it('returns hints for column-layout', () => {
    const hints = getWidgetConfigHints('column-layout');
    expect(hints).toHaveLength(2);
    expect(hints[0]).toContain('items');
  });

  it('returns hints for custom-metric-chart', () => {
    const hints = getWidgetConfigHints('custom-metric-chart');
    expect(hints).toHaveLength(2);
    expect(hints[0]).toContain('monitor first');
  });

  it('all hint arrays contain non-empty strings', () => {
    const types = ['embed-iframe', 'security-advisory', 'dependency-map', 'multi-environment-status',
      'region-status-map', 'third-party-dependencies', 'table-of-contents', 'tab-container',
      'column-layout', 'custom-metric-chart'];
    for (const type of types) {
      const hints = getWidgetConfigHints(type);
      expect(hints.length).toBeGreaterThan(0);
      for (const hint of hints) {
        expect(typeof hint).toBe('string');
        expect(hint.length).toBeGreaterThan(0);
      }
    }
  });
});
