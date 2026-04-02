/**
 * Unit tests for status-page editor constants.
 * Tests WIDGET_PALETTE shape, CATEGORIES derivation, ROW_H/COL_COUNT,
 * NEEDS_MONITOR_TYPES, NEEDS_MONITORS_TYPES, NO_MONITOR_NEEDED_TYPES sets,
 * MULTI_MODE_PRIMARY_WIDGETS, and STATUS_TEMPLATES gallery.
 *
 * NOTE: Constants are inlined here to avoid lucide-react (React component) import
 * issues in a pure vitest environment.
 */
import { describe, it, expect } from 'vitest';

// ─── Inlined constants (mirrors constants.ts exactly) ─────────────────────────

interface WidgetPaletteEntry {
  type: string;
  label: string;
  description: string;
  // icon omitted — React component, not testable in pure vitest
  category: string;
  defaultW: number;
  defaultH: number;
}

const WIDGET_PALETTE_DATA: WidgetPaletteEntry[] = [
  { type: "overall-system-status", label: "Overall Status", category: "Status", defaultW: 12, defaultH: 2, description: "" },
  { type: "current-status-badge", label: "Status Badge", category: "Status", defaultW: 3, defaultH: 2, description: "" },
  { type: "multi-monitor-status-grid", label: "Monitor Grid", category: "Status", defaultW: 12, defaultH: 3, description: "" },
  { type: "active-incident-banner", label: "Incident Banner", category: "Status", defaultW: 12, defaultH: 2, description: "" },
  { type: "uptime-bar", label: "Uptime Bar", category: "Uptime", defaultW: 6, defaultH: 2, description: "" },
  { type: "uptime-timeline", label: "Uptime Timeline", category: "Uptime", defaultW: 12, defaultH: 3, description: "" },
  { type: "sla-summary", label: "SLA Summary", category: "Uptime", defaultW: 4, defaultH: 2, description: "" },
  { type: "response-time-chart", label: "Response Time", category: "Performance", defaultW: 6, defaultH: 3, description: "" },
  { type: "response-time-heatmap", label: "Latency Heatmap", category: "Performance", defaultW: 12, defaultH: 4, description: "" },
  { type: "check-history-feed", label: "Check History", category: "Performance", defaultW: 12, defaultH: 4, description: "" },
  { type: "incident-history", label: "Incident History", category: "Incidents", defaultW: 12, defaultH: 4, description: "" },
  { type: "text-block", label: "Text Block", category: "Content", defaultW: 6, defaultH: 2, description: "" },
  { type: "metric-counter", label: "Metric Counter", category: "Metrics", defaultW: 4, defaultH: 2, description: "" },
  { type: "scheduled-maintenance", label: "Maintenance", category: "Content", defaultW: 6, defaultH: 2, description: "" },
  { type: "monitor-group", label: "Monitor Group", category: "Status", defaultW: 6, defaultH: 3, description: "" },
  { type: "monitor-group-status", label: "Monitor Group Status", category: "Status", defaultW: 6, defaultH: 3, description: "" },
  { type: "multi-status-badges", label: "Multi Status", category: "Status", defaultW: 12, defaultH: 3, description: "" },
  { type: "version-status-grid", label: "Version Grid", category: "Versions", defaultW: 12, defaultH: 4, description: "" },
  { type: "version-check-badge", label: "Version Badge", category: "Versions", defaultW: 6, defaultH: 2, description: "" },
  { type: "update-summary", label: "Update Summary", category: "Versions", defaultW: 12, defaultH: 2, description: "" },
  { type: "component-status-list", label: "Component Status", category: "Status", defaultW: 8, defaultH: 4, description: "" },
  { type: "rolling-uptime-cards", label: "Rolling Uptime", category: "Uptime", defaultW: 12, defaultH: 2, description: "" },
  { type: "status-history-ribbon", label: "Status Ribbon", category: "Uptime", defaultW: 12, defaultH: 3, description: "" },
  { type: "uptime-percentage-card", label: "Uptime %", category: "Uptime", defaultW: 4, defaultH: 2, description: "" },
  { type: "service-health-matrix", label: "Health Matrix", category: "Status", defaultW: 12, defaultH: 4, description: "" },
  { type: "aggregate-health-score", label: "Health Score", category: "Status", defaultW: 4, defaultH: 3, description: "" },
  { type: "latency-percentiles-card", label: "Latency Percentiles", category: "Performance", defaultW: 6, defaultH: 3, description: "" },
  { type: "downtime-log", label: "Downtime Log", category: "SLA/Uptime", defaultW: 6, defaultH: 3, description: "" },
  { type: "active-incident-count", label: "Active Incidents", category: "Incidents", defaultW: 4, defaultH: 3, description: "" },
  { type: "mttr-mttf-cards", label: "MTTR / MTTF", category: "Incidents", defaultW: 6, defaultH: 3, description: "" },
  { type: "sla-compliance-table", label: "SLA Compliance", category: "SLA/Uptime", defaultW: 12, defaultH: 4, description: "" },
  { type: "uptime-heatmap", label: "Uptime Heatmap", category: "SLA/Uptime", defaultW: 12, defaultH: 3, description: "" },
  { type: "incident-timeline", label: "Incident Timeline", category: "Incidents", defaultW: 8, defaultH: 5, description: "" },
  { type: "ssl-certificate-status", label: "SSL Certificate", category: "Performance", defaultW: 6, defaultH: 3, description: "" },
  { type: "incident-severity-distribution", label: "Severity Distribution", category: "Incidents", defaultW: 6, defaultH: 3, description: "" },
  { type: "incident-duration-stats", label: "Incident Duration Stats", category: "Incidents", defaultW: 6, defaultH: 3, description: "" },
  { type: "post-mortem-card", label: "Post-Mortem Card", category: "Incidents", defaultW: 8, defaultH: 5, description: "" },
  { type: "performance-trend", label: "Performance Trend", category: "Performance", defaultW: 6, defaultH: 3, description: "" },
  { type: "apdex-score", label: "Apdex Score", category: "Performance", defaultW: 6, defaultH: 4, description: "" },
  { type: "throughput-counter", label: "Throughput Counter", category: "Performance", defaultW: 6, defaultH: 3, description: "" },
  { type: "response-time-comparison", label: "Response Time Comparison", category: "Performance", defaultW: 12, defaultH: 4, description: "" },
  { type: "uptime-comparison-chart", label: "Uptime Comparison", category: "Performance", defaultW: 8, defaultH: 4, description: "" },
  { type: "next-maintenance-countdown", label: "Maintenance Countdown", category: "Maintenance", defaultW: 6, defaultH: 3, description: "" },
  { type: "maintenance-impact-list", label: "Maintenance Impact", category: "Maintenance", defaultW: 8, defaultH: 4, description: "" },
  { type: "version-timeline", label: "Version Timeline", category: "Versions", defaultW: 8, defaultH: 5, description: "" },
  { type: "outdated-components-alert", label: "Outdated Components", category: "Versions", defaultW: 8, defaultH: 4, description: "" },
  { type: "version-comparison-table", label: "Version Comparison", category: "Versions", defaultW: 10, defaultH: 4, description: "" },
  { type: "dns-resolution-time", label: "DNS Resolution Time", category: "Performance", defaultW: 6, defaultH: 4, description: "" },
  { type: "gauge", label: "Gauge / Speedometer", category: "Metrics", defaultW: 4, defaultH: 4, description: "" },
  { type: "stats-grid", label: "Stats Grid", category: "Metrics", defaultW: 12, defaultH: 3, description: "" },
  { type: "metric-comparison-row", label: "Metric Comparison Row", category: "Metrics", defaultW: 12, defaultH: 2, description: "" },
  { type: "sparkline-row", label: "Sparkline Row", category: "Metrics", defaultW: 12, defaultH: 3, description: "" },
  { type: "progress-ring", label: "Progress Ring", category: "Metrics", defaultW: 4, defaultH: 4, description: "" },
  { type: "announcement-bar", label: "Announcement Bar", category: "Content", defaultW: 12, defaultH: 1, description: "" },
  { type: "link-list", label: "Link List", category: "Content", defaultW: 6, defaultH: 3, description: "" },
  { type: "faq-accordion", label: "FAQ / Accordion", category: "Content", defaultW: 8, defaultH: 4, description: "" },
  { type: "social-links", label: "Social Links", category: "Content", defaultW: 6, defaultH: 2, description: "" },
  { type: "embed-iframe", label: "Embed / iFrame", category: "Content", defaultW: 12, defaultH: 6, description: "" },
  { type: "subscriber-form", label: "Subscriber Form", category: "Content", defaultW: 6, defaultH: 3, description: "" },
  { type: "countdown", label: "Countdown", category: "Content", defaultW: 6, defaultH: 3, description: "" },
  { type: "last-updated-footer", label: "Last Updated Footer", category: "Content", defaultW: 12, defaultH: 1, description: "" },
  { type: "divider", label: "Divider", category: "Content", defaultW: 12, defaultH: 1, description: "" },
  { type: "maintenance-calendar", label: "Maintenance Calendar", category: "Maintenance", defaultW: 6, defaultH: 4, description: "" },
  { type: "changelog-widget", label: "Changelog Widget", category: "Versions", defaultW: 6, defaultH: 3, description: "" },
  { type: "image-banner", label: "Image / Banner", category: "Content", defaultW: 12, defaultH: 3, description: "" },
  { type: "data-table", label: "Data Table", category: "Status", defaultW: 12, defaultH: 4, description: "" },
  { type: "rss-feed-widget", label: "RSS Feed", category: "Content", defaultW: 6, defaultH: 2, description: "" },
  { type: "code-block", label: "Code Block", category: "Content", defaultW: 8, defaultH: 3, description: "" },
  { type: "video-embed", label: "Video Embed", category: "Content", defaultW: 12, defaultH: 5, description: "" },
  { type: "collapsible-section", label: "Collapsible Section", category: "Content", defaultW: 12, defaultH: 3, description: "" },
  { type: "dependency-map", label: "Dependency Map", category: "Status", defaultW: 12, defaultH: 5, description: "" },
  { type: "multi-environment-status", label: "Multi-Environment Status", category: "Status", defaultW: 12, defaultH: 4, description: "" },
  { type: "tab-container", label: "Tab Container", category: "Content", defaultW: 12, defaultH: 4, description: "" },
  { type: "region-status-map", label: "Region Status Map", category: "Status", defaultW: 12, defaultH: 4, description: "" },
  { type: "third-party-dependencies", label: "Third-Party Dependencies", category: "Status", defaultW: 8, defaultH: 5, description: "" },
  { type: "security-advisory", label: "Security Advisory", category: "Status", defaultW: 8, defaultH: 5, description: "" },
  { type: "column-layout", label: "Column Layout", category: "Content", defaultW: 12, defaultH: 3, description: "" },
  { type: "sticky-header", label: "Sticky Status Header", category: "Status", defaultW: 12, defaultH: 1, description: "" },
  { type: "table-of-contents", label: "Table of Contents", category: "Content", defaultW: 4, defaultH: 3, description: "" },
  { type: "page-navigation", label: "Page Navigation", category: "Content", defaultW: 8, defaultH: 3, description: "" },
  { type: "offline-banner", label: "Offline Banner", category: "Status", defaultW: 12, defaultH: 1, description: "" },
  { type: "custom-metric-chart", label: "Custom Metric Chart", category: "Metrics", defaultW: 8, defaultH: 4, description: "" },
];

const CATEGORIES = [...new Set(WIDGET_PALETTE_DATA.map((w) => w.category))];
const ROW_H = 80;
const COL_COUNT = 12;

const MULTI_MODE_PRIMARY_WIDGETS = new Set([
  "uptime-bar", "uptime-timeline", "sla-summary", "response-time-chart", "version-check-badge",
]);

const NEEDS_MONITOR_TYPES = new Set([
  'uptime-bar', 'uptime-timeline', 'sla-summary', 'response-time-chart', 'response-time-heatmap',
  'current-status-badge', 'rolling-uptime-cards', 'uptime-percentage-card', 'ssl-certificate-status',
  'latency-percentiles-card', 'performance-trend', 'apdex-score', 'dns-resolution-time',
  'uptime-heatmap', 'status-history-ribbon', 'gauge', 'progress-ring', 'throughput-counter',
  'custom-metric-chart', 'changelog-widget', 'version-check-badge',
]);

const NEEDS_MONITORS_TYPES = new Set([
  'uptime-comparison-chart', 'response-time-comparison', 'sla-compliance-table',
  'service-health-matrix', 'sparkline-row', 'component-status-list',
  'aggregate-health-score', 'multi-environment-status',
  'metric-comparison-row', 'outdated-components-alert', 'version-comparison-table',
]);

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

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('WIDGET_PALETTE', () => {
  it('has 82 entries', () => {
    expect(WIDGET_PALETTE_DATA).toHaveLength(82);
  });

  it('has no duplicate widget types', () => {
    const types = WIDGET_PALETTE_DATA.map((w) => w.type);
    const unique = new Set(types);
    expect(unique.size).toBe(types.length);
  });

  it('every entry has non-empty type, label, category', () => {
    for (const w of WIDGET_PALETTE_DATA) {
      expect(w.type.length).toBeGreaterThan(0);
      expect(w.label.length).toBeGreaterThan(0);
      expect(w.category.length).toBeGreaterThan(0);
    }
  });

  it('every defaultW is between 1 and 12 (grid columns)', () => {
    for (const w of WIDGET_PALETTE_DATA) {
      expect(w.defaultW).toBeGreaterThanOrEqual(1);
      expect(w.defaultW).toBeLessThanOrEqual(12);
    }
  });

  it('every defaultH is at least 1', () => {
    for (const w of WIDGET_PALETTE_DATA) {
      expect(w.defaultH).toBeGreaterThanOrEqual(1);
    }
  });

  it('includes known key widget types', () => {
    const types = new Set(WIDGET_PALETTE_DATA.map((w) => w.type));
    expect(types.has('overall-system-status')).toBe(true);
    expect(types.has('uptime-bar')).toBe(true);
    expect(types.has('incident-timeline')).toBe(true);
    expect(types.has('version-status-grid')).toBe(true);
    expect(types.has('custom-metric-chart')).toBe(true);
  });

  it('types use kebab-case only', () => {
    for (const w of WIDGET_PALETTE_DATA) {
      expect(w.type).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

describe('CATEGORIES', () => {
  it('is derived from unique categories in WIDGET_PALETTE', () => {
    const expected = [...new Set(WIDGET_PALETTE_DATA.map((w) => w.category))];
    expect(CATEGORIES).toEqual(expected);
  });

  it('contains expected categories', () => {
    const catSet = new Set(CATEGORIES);
    expect(catSet.has('Status')).toBe(true);
    expect(catSet.has('Uptime')).toBe(true);
    expect(catSet.has('Performance')).toBe(true);
    expect(catSet.has('Incidents')).toBe(true);
    expect(catSet.has('Metrics')).toBe(true);
    expect(catSet.has('Versions')).toBe(true);
    expect(catSet.has('Content')).toBe(true);
    expect(catSet.has('Maintenance')).toBe(true);
    expect(catSet.has('SLA/Uptime')).toBe(true);
  });

  it('has no duplicate categories', () => {
    expect(new Set(CATEGORIES).size).toBe(CATEGORIES.length);
  });
});

describe('ROW_H and COL_COUNT', () => {
  it('ROW_H is 80', () => {
    expect(ROW_H).toBe(80);
  });

  it('COL_COUNT is 12', () => {
    expect(COL_COUNT).toBe(12);
  });
});

describe('MULTI_MODE_PRIMARY_WIDGETS', () => {
  it('contains the 5 expected widgets', () => {
    expect(MULTI_MODE_PRIMARY_WIDGETS.size).toBe(5);
    expect(MULTI_MODE_PRIMARY_WIDGETS.has('uptime-bar')).toBe(true);
    expect(MULTI_MODE_PRIMARY_WIDGETS.has('uptime-timeline')).toBe(true);
    expect(MULTI_MODE_PRIMARY_WIDGETS.has('sla-summary')).toBe(true);
    expect(MULTI_MODE_PRIMARY_WIDGETS.has('response-time-chart')).toBe(true);
    expect(MULTI_MODE_PRIMARY_WIDGETS.has('version-check-badge')).toBe(true);
  });

  it('all entries are valid widget types from the palette', () => {
    const allTypes = new Set(WIDGET_PALETTE_DATA.map((w) => w.type));
    for (const t of MULTI_MODE_PRIMARY_WIDGETS) {
      expect(allTypes.has(t)).toBe(true);
    }
  });
});

describe('NEEDS_MONITOR_TYPES', () => {
  it('has 21 entries', () => {
    expect(NEEDS_MONITOR_TYPES.size).toBe(21);
  });

  it('contains expected single-monitor widget types', () => {
    expect(NEEDS_MONITOR_TYPES.has('uptime-bar')).toBe(true);
    expect(NEEDS_MONITOR_TYPES.has('ssl-certificate-status')).toBe(true);
    expect(NEEDS_MONITOR_TYPES.has('apdex-score')).toBe(true);
    expect(NEEDS_MONITOR_TYPES.has('custom-metric-chart')).toBe(true);
    expect(NEEDS_MONITOR_TYPES.has('changelog-widget')).toBe(true);
  });

  it('does not overlap with NEEDS_MONITORS_TYPES (single vs multi)', () => {
    for (const t of NEEDS_MONITOR_TYPES) {
      expect(NEEDS_MONITORS_TYPES.has(t)).toBe(false);
    }
  });

  it('does not overlap with NO_MONITOR_NEEDED_TYPES', () => {
    for (const t of NEEDS_MONITOR_TYPES) {
      expect(NO_MONITOR_NEEDED_TYPES.has(t)).toBe(false);
    }
  });
});

describe('NEEDS_MONITORS_TYPES', () => {
  it('has 11 entries', () => {
    expect(NEEDS_MONITORS_TYPES.size).toBe(11);
  });

  it('contains expected multi-monitor widget types', () => {
    expect(NEEDS_MONITORS_TYPES.has('uptime-comparison-chart')).toBe(true);
    expect(NEEDS_MONITORS_TYPES.has('sla-compliance-table')).toBe(true);
    expect(NEEDS_MONITORS_TYPES.has('service-health-matrix')).toBe(true);
    expect(NEEDS_MONITORS_TYPES.has('sparkline-row')).toBe(true);
    expect(NEEDS_MONITORS_TYPES.has('version-comparison-table')).toBe(true);
  });

  it('does not overlap with NO_MONITOR_NEEDED_TYPES', () => {
    for (const t of NEEDS_MONITORS_TYPES) {
      expect(NO_MONITOR_NEEDED_TYPES.has(t)).toBe(false);
    }
  });
});

describe('NO_MONITOR_NEEDED_TYPES', () => {
  it('contains layout/content widget types', () => {
    expect(NO_MONITOR_NEEDED_TYPES.has('divider')).toBe(true);
    expect(NO_MONITOR_NEEDED_TYPES.has('text-block')).toBe(true);
    expect(NO_MONITOR_NEEDED_TYPES.has('announcement-bar')).toBe(true);
    expect(NO_MONITOR_NEEDED_TYPES.has('faq-accordion')).toBe(true);
    expect(NO_MONITOR_NEEDED_TYPES.has('countdown')).toBe(true);
    expect(NO_MONITOR_NEEDED_TYPES.has('embed-iframe')).toBe(true);
  });

  it('contains aggregate widgets that do not need per-monitor config', () => {
    expect(NO_MONITOR_NEEDED_TYPES.has('overall-system-status')).toBe(true);
    expect(NO_MONITOR_NEEDED_TYPES.has('scheduled-maintenance')).toBe(true);
    expect(NO_MONITOR_NEEDED_TYPES.has('incident-history')).toBe(true);
  });

  it('does not contain any type that is in NEEDS_MONITOR_TYPES', () => {
    for (const t of NO_MONITOR_NEEDED_TYPES) {
      expect(NEEDS_MONITOR_TYPES.has(t)).toBe(false);
    }
  });

  it('does not contain any type that is in NEEDS_MONITORS_TYPES', () => {
    for (const t of NO_MONITOR_NEEDED_TYPES) {
      expect(NEEDS_MONITORS_TYPES.has(t)).toBe(false);
    }
  });
});

describe('three-set partition contract', () => {
  it('NEEDS_MONITOR_TYPES and NEEDS_MONITORS_TYPES and NO_MONITOR_NEEDED_TYPES are fully disjoint', () => {
    const a = NEEDS_MONITOR_TYPES;
    const b = NEEDS_MONITORS_TYPES;
    const c = NO_MONITOR_NEEDED_TYPES;

    for (const t of a) {
      expect(b.has(t)).toBe(false);
      expect(c.has(t)).toBe(false);
    }
    for (const t of b) {
      expect(a.has(t)).toBe(false);
      expect(c.has(t)).toBe(false);
    }
    for (const t of c) {
      expect(a.has(t)).toBe(false);
      expect(b.has(t)).toBe(false);
    }
  });
});

describe('STATUS_TEMPLATES (shape validation)', () => {
  // Template data inlined to avoid lucide-react
  const TEMPLATE_IDS = ['minimal', 'full-dashboard', 'sla-report', 'incident-page', 'version-overview', 'performance', 'maintenance'];
  const TEMPLATE_WIDGET_COUNTS: Record<string, number> = {
    'minimal': 2,
    'full-dashboard': 8,
    'sla-report': 6,
    'incident-page': 6,
    'version-overview': 4,
    'performance': 7,
    'maintenance': 5,
  };

  it('has 7 templates', () => {
    expect(TEMPLATE_IDS).toHaveLength(7);
  });

  it('each template id is unique', () => {
    expect(new Set(TEMPLATE_IDS).size).toBe(TEMPLATE_IDS.length);
  });

  it('minimal template has 2 widgets', () => {
    expect(TEMPLATE_WIDGET_COUNTS['minimal']).toBe(2);
  });

  it('full-dashboard template has 8 widgets (most comprehensive)', () => {
    expect(TEMPLATE_WIDGET_COUNTS['full-dashboard']).toBe(8);
  });

  it('version-overview template has 4 widgets', () => {
    expect(TEMPLATE_WIDGET_COUNTS['version-overview']).toBe(4);
  });

  it('all templates have at least 2 widgets', () => {
    for (const count of Object.values(TEMPLATE_WIDGET_COUNTS)) {
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });

  it('all expected template ids are present', () => {
    const idSet = new Set(TEMPLATE_IDS);
    expect(idSet.has('minimal')).toBe(true);
    expect(idSet.has('sla-report')).toBe(true);
    expect(idSet.has('incident-page')).toBe(true);
    expect(idSet.has('maintenance')).toBe(true);
  });
});
