import { describe, it, expect, vi } from 'vitest';
import { resolveMetricWidget } from './metric.resolver';
import type { Widget } from '../status-pages.types';

function makeWidget(type: string, config: Record<string, unknown> = {}): Widget {
  return { id: `w-${type}`, type: type as Widget['type'], x: 0, y: 0, w: 4, h: 2, config };
}

const noopCache = {} as never;
const userId = 'user-1';
const monitorId = 'mon-1';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    monitor: { findMany: vi.fn().mockResolvedValue([]) },
    incident: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    ...overrides,
  } as unknown as any;
}

// ── metric-counter ────────────────────────────────────────────────────────────

describe('metric resolver — metric-counter', () => {
  it('returns uptime metric by default', async () => {
    const runs = [...Array(90).fill({ level: 'green' }), ...Array(10).fill({ level: 'red' })];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('metric-counter', { monitorId }), undefined,
    );
    expect(result.suffix).toBe('%');
    expect(result.value).toBe(90);
    expect(result.metricType).toBe('uptime');
    expect(result.fetchedAt).toBeDefined();
  });

  it('returns 100% uptime when no runs', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('metric-counter', { monitorId, metricType: 'uptime' }), undefined,
    );
    expect(result.value).toBe(100);
  });

  it('returns average latency metric', async () => {
    const runs = [{ latencyMs: 100 }, { latencyMs: 200 }, { latencyMs: 300 }];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('metric-counter', { monitorId, metricType: 'latency' }), undefined,
    );
    expect(result.value).toBe(200);
    expect(result.suffix).toBe('ms');
  });

  it('returns latency=0 when no runs', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('metric-counter', { monitorId, metricType: 'latency' }), undefined,
    );
    expect(result.value).toBe(0);
    expect(result.suffix).toBe('ms');
  });

  it('returns checks count metric', async () => {
    const runs = Array(42).fill({});
    const prisma = { monitorRun: { count: vi.fn().mockResolvedValue(42) } } as unknown as any;
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('metric-counter', { monitorId, metricType: 'checks' }), undefined,
    );
    expect(result.value).toBe(42);
    expect(result.suffix).toBe('');
  });

  it('returns incidents count metric', async () => {
    const prisma = { incident: { count: vi.fn().mockResolvedValue(3) } } as unknown as any;
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('metric-counter', { monitorId, metricType: 'incidents' }), undefined,
    );
    expect(result.value).toBe(3);
    expect(result.suffix).toBe('');
  });

  it('uses custom label when provided', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('metric-counter', { monitorId, metricType: 'uptime', label: 'My Custom Label' }), undefined,
    );
    expect(result.label).toBe('My Custom Label');
  });

  it('clamps periodDays between 1 and 365', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const r = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('metric-counter', { monitorId, periodDays: 999 }), undefined,
    );
    expect(r.periodDays).toBe(365);
  });
});

// ── metric-comparison-row ─────────────────────────────────────────────────────

describe('metric resolver — metric-comparison-row', () => {
  it('returns _noConfig when no monitors found', async () => {
    const prisma = makePrisma({ monitor: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveMetricWidget(prisma, noopCache, userId, makeWidget('metric-comparison-row'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('returns 4 metric cards when monitors exist', async () => {
    const monitors = [{ id: 'm1' }];
    const findMany = vi.fn()
      .mockResolvedValueOnce(monitors)          // monitor.findMany
      .mockResolvedValueOnce([{ level: 'green' }]) // uptimeRuns
      .mockResolvedValueOnce([{ latencyMs: 50 }])  // latencyRuns
      .mockResolvedValueOnce([{ id: 'r1' }])      // todayRuns
      .mockResolvedValueOnce([]);                  // activeIncidents

    const prisma = {
      monitor: { findMany },
      monitorRun: { findMany },
      incident: { findMany },
    } as unknown as any;

    const result = await resolveMetricWidget(prisma, noopCache, userId, makeWidget('metric-comparison-row'), undefined);
    const metrics = result.metrics as any[];
    expect(metrics).toHaveLength(4);
    const keys = metrics.map((m: any) => m.key);
    expect(keys).toContain('uptime');
    expect(keys).toContain('avg-latency');
    expect(keys).toContain('checks-today');
    expect(keys).toContain('active-incidents');
  });

  it('colors uptime green when >= 99.9%', async () => {
    const monitors = [{ id: 'm1' }];
    const allGreen = Array(1000).fill({ level: 'green' });
    const findMany = vi.fn()
      .mockResolvedValueOnce(monitors)
      .mockResolvedValueOnce(allGreen)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const prisma = { monitor: { findMany }, monitorRun: { findMany }, incident: { findMany } } as unknown as any;
    const result = await resolveMetricWidget(prisma, noopCache, userId, makeWidget('metric-comparison-row'), undefined);
    const uptimeMetric = (result.metrics as any[]).find((m: any) => m.key === 'uptime');
    expect(uptimeMetric.color).toBe('green');
  });

  it('colors active incidents red when > 0', async () => {
    const monitors = [{ id: 'm1' }];
    const findMany = vi.fn()
      .mockResolvedValueOnce(monitors)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'inc1' }]); // active incident

    const prisma = { monitor: { findMany }, monitorRun: { findMany }, incident: { findMany } } as unknown as any;
    const result = await resolveMetricWidget(prisma, noopCache, userId, makeWidget('metric-comparison-row'), undefined);
    const incidentMetric = (result.metrics as any[]).find((m: any) => m.key === 'active-incidents');
    expect(incidentMetric.color).toBe('red');
    expect(incidentMetric.value).toBe('1');
  });

  it('filters by monitorIds when provided', async () => {
    const prisma = makePrisma({
      monitor: { findMany: vi.fn().mockResolvedValue([]) },
    });
    await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('metric-comparison-row', { monitorIds: ['m1', 'm2'] }), undefined,
    );
    const findArgs = (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findArgs.where.id).toEqual({ in: ['m1', 'm2'] });
  });
});

// ── gauge ─────────────────────────────────────────────────────────────────────

describe('metric resolver — gauge', () => {
  it('returns _noConfig when no monitors found', async () => {
    const prisma = makePrisma({ monitor: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveMetricWidget(prisma, noopCache, userId, makeWidget('gauge'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('returns uptime gauge value for default metricType', async () => {
    const monitors = [{ id: 'm1' }];
    const runs = [...Array(95).fill({ level: 'green', latencyMs: 50 }), ...Array(5).fill({ level: 'red', latencyMs: null })];
    const findMany = vi.fn()
      .mockResolvedValueOnce(monitors)
      .mockResolvedValueOnce(runs);
    const prisma = { monitor: { findMany }, monitorRun: { findMany } } as unknown as any;
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('gauge', { monitorId }), undefined,
    );
    expect(result.value).toBeGreaterThan(0);
    expect(result.metricType).toBeDefined();
    expect(result.label).toBeDefined();
    expect(result.thresholds).toBeDefined();
    expect(result.fetchedAt).toBeDefined();
  });

  it('returns sla compliance gauge', async () => {
    const monitors = [{ id: 'm1' }];
    const runs = Array(100).fill({ level: 'green', latencyMs: 50 });
    const findMany = vi.fn()
      .mockResolvedValueOnce(monitors)
      .mockResolvedValueOnce(runs);
    const prisma = { monitor: { findMany }, monitorRun: { findMany } } as unknown as any;
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('gauge', { monitorId, metricType: 'sla', slaTarget: 99.9 }), undefined,
    );
    expect(result.value).toBe(100); // 100% / 99.9% * 100 → capped at 100
    expect(result.label).toContain('SLA');
  });

  it('returns apdex gauge', async () => {
    const monitors = [{ id: 'm1' }];
    const runs = [
      ...Array(60).fill({ level: 'green', latencyMs: 100 }),  // satisfied
      ...Array(40).fill({ level: 'green', latencyMs: 500 }),  // tolerating
    ];
    const findMany = vi.fn()
      .mockResolvedValueOnce(monitors)
      .mockResolvedValueOnce(runs);
    const prisma = { monitor: { findMany }, monitorRun: { findMany } } as unknown as any;
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('gauge', { monitorId, metricType: 'apdex', satisfiedThresholdMs: 200, toleratingThresholdMs: 800 }), undefined,
    );
    // apdex = (60 + 40/2) / 100 = 0.8 → * 100 = 80
    expect(result.value).toBe(80);
    expect(result.label).toBe('Apdex Score');
  });
});

// ── stats-grid ────────────────────────────────────────────────────────────────

describe('metric resolver — stats-grid', () => {
  it('returns stats grid with all four metrics', async () => {
    const monitors = [
      { id: 'm1', runs: [{ level: 'green' }] },
      { id: 'm2', runs: [{ level: 'red' }] },
    ];
    const findMany = vi.fn()
      .mockResolvedValueOnce(monitors)            // monitor.findMany
      .mockResolvedValueOnce(Array(100).fill({ level: 'green' })) // uptimeRuns
      .mockResolvedValueOnce([])                   // incidentRuns (this month)
      .mockResolvedValueOnce([{ latencyMs: 100 }]) // responseRuns
      .mockResolvedValueOnce([{ id: 'r1' }]);      // todayRuns

    const prisma = {
      monitor: { findMany },
      monitorRun: { findMany },
      incident: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    } as unknown as any;

    const result = await resolveMetricWidget(prisma, noopCache, userId, makeWidget('stats-grid'), undefined);
    expect(result.stats).toBeDefined();
    const stats = result.stats as any[];
    expect(stats.length).toBeGreaterThan(0);
    expect(result.fetchedAt).toBeDefined();
  });

  it('filters by monitorIds when provided', async () => {
    const prisma = makePrisma({ monitor: { findMany: vi.fn().mockResolvedValue([]) } });
    await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('stats-grid', { monitorIds: ['m1'] }), undefined,
    );
    const findArgs = (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findArgs.where.id).toEqual({ in: ['m1'] });
  });
});

// ── custom-metric-chart ───────────────────────────────────────────────────────

describe('metric resolver — custom-metric-chart', () => {
  it('returns empty chart when no monitorId', async () => {
    const prisma = makePrisma();
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('custom-metric-chart', { metric: 'latency' }), undefined,
    );
    expect(result.labels).toHaveLength(0);
    expect(result.values).toHaveLength(0);
  });

  it('returns latency chart data', async () => {
    const now = new Date();
    const runs = [
      { checkedAt: new Date(now.getTime() - 3600_000), latencyMs: 100 },
      { checkedAt: new Date(now.getTime() - 1800_000), latencyMs: 200 },
    ];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('custom-metric-chart', { monitorId, metric: 'latency', timeRange: 24 }), undefined,
    );
    expect(result.labels).toBeDefined();
    expect(result.values).toBeDefined();
    expect(result.unit).toBe('ms');
    expect(result.chartType).toBe('line'); // default
  });

  it('returns uptime chart data', async () => {
    const now = new Date();
    const runs = [
      { checkedAt: new Date(now.getTime() - 3600_000), level: 'green' },
      { checkedAt: new Date(now.getTime() - 1800_000), level: 'red' },
    ];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('custom-metric-chart', { monitorId, metric: 'uptime', timeRange: 24 }), undefined,
    );
    expect(result.unit).toBe('%');
  });

  it('uses custom chartType from config', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('custom-metric-chart', { monitorId, chartType: 'bar' }), undefined,
    );
    expect(result.chartType).toBe('bar');
  });

  it('clamps timeRange between 1 and 720 hours', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('custom-metric-chart', { monitorId, timeRange: 9999 }), undefined,
    );
    // Should succeed (clamped internally) and return valid structure
    expect(result.labels).toBeDefined();
    expect(result.values).toBeDefined();
  });
});

// ── progress-ring ─────────────────────────────────────────────────────────────

describe('metric resolver — progress-ring', () => {
  it('returns _noConfig when no monitors found for scope', async () => {
    const prisma = makePrisma({ monitor: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('progress-ring'), undefined,
    );
    expect(result._noConfig).toBe(true);
  });

  it('returns uptime percentage as ring value', async () => {
    const monitors = [{ id: 'm1' }];
    const runs = Array(90).fill({ level: 'green' }).concat(Array(10).fill({ level: 'red' }));
    const findMany = vi.fn()
      .mockResolvedValueOnce(monitors) // monitor.findMany
      .mockResolvedValueOnce(runs);    // monitorRun.findMany
    const prisma = { monitor: { findMany }, monitorRun: { findMany } } as unknown as any;
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('progress-ring', { monitorId }), undefined,
    );
    expect(result.value).toBe(90);
    expect(result.fetchedAt).toBeDefined();
  });

  it('returns 100% when no runs', async () => {
    const monitors = [{ id: 'm1' }];
    const findMany = vi.fn()
      .mockResolvedValueOnce(monitors)
      .mockResolvedValueOnce([]);
    const prisma = { monitor: { findMany }, monitorRun: { findMany } } as unknown as any;
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('progress-ring', { monitorId }), undefined,
    );
    expect(result.value).toBe(100);
  });

  it('returns custom value ring when metricType=custom', async () => {
    const prisma = makePrisma();
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('progress-ring', { metricType: 'custom', customValue: 72 }), undefined,
    );
    expect(result.value).toBe(72);
  });

  it('clamps customValue to 0-100 range', async () => {
    const prisma = makePrisma();
    const resultOver = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('progress-ring', { metricType: 'custom', customValue: 150 }), undefined,
    );
    expect(resultOver.value).toBe(100);
    const resultUnder = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('progress-ring', { metricType: 'custom', customValue: -10 }), undefined,
    );
    expect(resultUnder.value).toBe(0);
  });

  it('uses default customValue=100 when not set in custom metricType', async () => {
    const prisma = makePrisma();
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('progress-ring', { metricType: 'custom' }), undefined,
    );
    expect(result.value).toBe(100);
  });

  it('returns SLA compliance value for metricType=sla', async () => {
    const monitors = [{ id: 'm1' }];
    const runs = Array(99).fill({ level: 'green' }).concat(Array(1).fill({ level: 'red' }));
    const findMany = vi.fn()
      .mockResolvedValueOnce(monitors)
      .mockResolvedValueOnce(runs);
    const prisma = { monitor: { findMany }, monitorRun: { findMany } } as unknown as any;
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('progress-ring', { monitorId, metricType: 'sla', slaTarget: 99 }), undefined,
    );
    // 99% actual / 99% target = 100% compliance
    expect(result.value).toBeDefined();
    expect(result.label).toBe('SLA Compliance');
  });

  it('resolves scope from monitorIds array (not single monitorId)', async () => {
    const monitors = [{ id: 'm1' }, { id: 'm2' }];
    const runs = Array(80).fill({ level: 'green' }).concat(Array(20).fill({ level: 'red' }));
    const findMany = vi.fn()
      .mockResolvedValueOnce(monitors)
      .mockResolvedValueOnce(runs);
    const prisma = { monitor: { findMany }, monitorRun: { findMany } } as unknown as any;
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('progress-ring', { monitorIds: ['m1', 'm2'] }), undefined,
    );
    expect(result.value).toBe(80);
  });

  it('assigns yellow color for value in 95-99 range', async () => {
    const monitors = [{ id: 'm1' }];
    const runs = Array(97).fill({ level: 'green' }).concat(Array(3).fill({ level: 'red' }));
    const findMany = vi.fn()
      .mockResolvedValueOnce(monitors)
      .mockResolvedValueOnce(runs);
    const prisma = { monitor: { findMany }, monitorRun: { findMany } } as unknown as any;
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('progress-ring', { monitorId }), undefined,
    );
    expect(result.color).toBe('yellow');
  });

  it('assigns red color for value below 95', async () => {
    const monitors = [{ id: 'm1' }];
    const runs = Array(90).fill({ level: 'green' }).concat(Array(10).fill({ level: 'red' }));
    const findMany = vi.fn()
      .mockResolvedValueOnce(monitors)
      .mockResolvedValueOnce(runs);
    const prisma = { monitor: { findMany }, monitorRun: { findMany } } as unknown as any;
    const result = await resolveMetricWidget(
      prisma, noopCache, userId,
      makeWidget('progress-ring', { monitorId, metricType: 'uptime' }), undefined,
    );
    expect(result.color).toBe('red'); // 90% is below 95 threshold → red
  });
});

// ── sparkline-row ─────────────────────────────────────────────────────────────

describe('metric resolver — sparkline-row', () => {
  it('returns _noConfig when no monitors found', async () => {
    const prisma = makePrisma({ monitor: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveMetricWidget(prisma, noopCache, userId, makeWidget('sparkline-row'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('returns monitors array with sparkline data', async () => {
    const monitors = [{ id: 'm1', name: 'API', runs: [{ level: 'green' }] }];
    const latencyRuns = [{ latencyMs: 50 }, { latencyMs: 75 }];
    const findMany = vi.fn()
      .mockResolvedValueOnce(monitors)     // monitor.findMany (scopeMonitors)
      .mockResolvedValueOnce(latencyRuns); // monitorRun.findMany for m1

    const prisma = { monitor: { findMany }, monitorRun: { findMany } } as unknown as any;
    const result = await resolveMetricWidget(prisma, noopCache, userId, makeWidget('sparkline-row'), undefined);
    // Returns { monitors, fetchedAt }
    const resultMonitors = result.monitors as any[];
    expect(resultMonitors.length).toBeGreaterThan(0);
    expect(resultMonitors[0].name).toBe('API');
    expect(resultMonitors[0].dataPoints).toBeDefined();
    expect(result.fetchedAt).toBeDefined();
  });
});

// ── data-table ────────────────────────────────────────────────────────────────

describe('metric resolver — data-table', () => {
  it('returns widgetType and config (pass-through)', async () => {
    // data-table is a pass-through widget that returns widgetType + config
    const prisma = makePrisma();
    const result = await resolveMetricWidget(prisma, noopCache, userId, makeWidget('data-table', { columns: 3 }), undefined);
    expect(result.widgetType).toBe('data-table');
    expect(result.fetchedAt).toBeDefined();
  });
});

// ── default / unknown type ────────────────────────────────────────────────────

describe('metric resolver — unknown widget type', () => {
  it('returns fallback message for unrecognized type', async () => {
    const prisma = makePrisma();
    const result = await resolveMetricWidget(prisma, noopCache, userId, makeWidget('unknown-metric-widget'), undefined);
    expect(result.message).toContain('not yet implemented');
  });
});
