import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { resolveStatusWidget } from './status.resolver';
import type { Widget } from '../status-pages.types';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeWidget(type: string, config: Record<string, unknown> = {}): Widget {
  return { id: `w-${type}`, type: type as Widget['type'], x: 0, y: 0, w: 4, h: 2, config };
}

const noopCache = {} as never;
const userId = 'user-1';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    monitor: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    publicStatusPage: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as any;
}

// ── current-status-badge ─────────────────────────────────────────────────────

describe('status resolver — current-status-badge', () => {
  it('returns _noConfig when no monitorId', async () => {
    const result = await resolveStatusWidget(makePrisma(), noopCache, userId, makeWidget('current-status-badge'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('throws NotFoundException when monitor not found', async () => {
    const prisma = makePrisma({
      monitor: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    await expect(
      resolveStatusWidget(prisma, noopCache, userId, makeWidget('current-status-badge', { monitorId: 'bad' }), undefined),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns monitor status with latest run data', async () => {
    const now = new Date();
    const prisma = makePrisma({
      monitor: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'mon1', name: 'API Server',
          runs: [{ level: 'green', checkedAt: now, latencyMs: 42 }],
        }),
      },
    });
    const result = await resolveStatusWidget(
      prisma, noopCache, userId,
      makeWidget('current-status-badge', { monitorId: 'mon1' }), undefined,
    );
    expect(result.name).toBe('API Server');
    expect(result.level).toBe('green');
    expect(result.latencyMs).toBe(42);
    expect(result.fetchedAt).toBeDefined();
  });

  it('defaults to green when no runs exist', async () => {
    const prisma = makePrisma({
      monitor: { findFirst: vi.fn().mockResolvedValue({ id: 'mon1', name: 'Test', runs: [] }) },
    });
    const result = await resolveStatusWidget(
      prisma, noopCache, userId,
      makeWidget('current-status-badge', { monitorId: 'mon1' }), undefined,
    );
    expect(result.level).toBe('green');
    expect(result.lastChecked).toBeNull();
  });
});

// ── overall-system-status ────────────────────────────────────────────────────

describe('status resolver — overall-system-status', () => {
  it('returns operational when all monitors green', async () => {
    const prisma = makePrisma({
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { runs: [{ level: 'green' }] },
          { runs: [{ level: 'green' }] },
        ]),
      },
    });
    const result = await resolveStatusWidget(prisma, noopCache, userId, makeWidget('overall-system-status'), undefined);
    expect(result.status).toBe('operational');
    expect(result.total).toBe(2);
    expect(result.monitorsDown).toBe(0);
  });

  it('returns degraded when some monitors yellow', async () => {
    const prisma = makePrisma({
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { runs: [{ level: 'green' }] },
          { runs: [{ level: 'yellow' }] },
        ]),
      },
    });
    const result = await resolveStatusWidget(prisma, noopCache, userId, makeWidget('overall-system-status'), undefined);
    expect(result.status).toBe('degraded');
    expect(result.monitorsDegraded).toBe(1);
  });

  it('returns outage when any monitor red', async () => {
    const prisma = makePrisma({
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { runs: [{ level: 'green' }] },
          { runs: [{ level: 'red' }] },
        ]),
      },
    });
    const result = await resolveStatusWidget(prisma, noopCache, userId, makeWidget('overall-system-status'), undefined);
    expect(result.status).toBe('outage');
    expect(result.monitorsDown).toBe(1);
  });

  it('returns operational when no monitors exist', async () => {
    const result = await resolveStatusWidget(makePrisma(), noopCache, userId, makeWidget('overall-system-status'), undefined);
    expect(result.status).toBe('operational');
    expect(result.total).toBe(0);
  });
});

// ── component-status-list ────────────────────────────────────────────────────

describe('status resolver — component-status-list', () => {
  it('returns components with status mapping', async () => {
    const prisma = makePrisma({
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm1', name: 'API', type: 'HTTP', runs: [{ level: 'green', checkedAt: new Date(), latencyMs: 10 }] },
          { id: 'm2', name: 'DB', type: 'TCP', runs: [{ level: 'red', checkedAt: new Date(), latencyMs: null }] },
          { id: 'm3', name: 'Cache', type: 'TCP', runs: [{ level: 'yellow', checkedAt: new Date(), latencyMs: 5 }] },
        ]),
      },
    });
    const result = await resolveStatusWidget(prisma, noopCache, userId, makeWidget('component-status-list'), undefined);
    const components = result.components as Array<{ name: string; status: string }>;
    expect(components).toHaveLength(3);
    expect(components.find((c) => c.name === 'API')?.status).toBe('operational');
    expect(components.find((c) => c.name === 'DB')?.status).toBe('major-outage');
    expect(components.find((c) => c.name === 'Cache')?.status).toBe('degraded');
    expect(result.overallStatus).toBe('major-outage');
    expect(result.downCount).toBe(1);
    expect(result.degradedCount).toBe(1);
  });

  it('returns operational when all green', async () => {
    const prisma = makePrisma({
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm1', name: 'A', type: 'HTTP', runs: [{ level: 'green', checkedAt: new Date(), latencyMs: 5 }] },
        ]),
      },
    });
    const result = await resolveStatusWidget(prisma, noopCache, userId, makeWidget('component-status-list'), undefined);
    expect(result.overallStatus).toBe('operational');
  });

  it('returns partial-outage when degraded but no down', async () => {
    const prisma = makePrisma({
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm1', name: 'A', type: 'HTTP', runs: [{ level: 'yellow', checkedAt: new Date(), latencyMs: 5 }] },
        ]),
      },
    });
    const result = await resolveStatusWidget(prisma, noopCache, userId, makeWidget('component-status-list'), undefined);
    expect(result.overallStatus).toBe('partial-outage');
  });

  it('filters by monitorIds when provided', async () => {
    const prisma = makePrisma({
      monitor: { findMany: vi.fn().mockResolvedValue([]) },
    });
    await resolveStatusWidget(prisma, noopCache, userId, makeWidget('component-status-list', { monitorIds: ['m1'] }), undefined);
    expect(prisma.monitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['m1'] } }),
      }),
    );
  });
});

// ── aggregate-health-score ───────────────────────────────────────────────────

describe('status resolver — aggregate-health-score', () => {
  it('returns 100 when no monitors', async () => {
    const result = await resolveStatusWidget(makePrisma(), noopCache, userId, makeWidget('aggregate-health-score'), undefined);
    expect(result.score).toBe(100);
    expect(result.total).toBe(0);
  });

  it('computes weighted score from monitor levels', async () => {
    const prisma = makePrisma({
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm1', name: 'API', runs: [{ level: 'green', latencyMs: 10 }] },
          { id: 'm2', name: 'DB', runs: [{ level: 'red', latencyMs: null }] },
        ]),
      },
    });
    const result = await resolveStatusWidget(prisma, noopCache, userId, makeWidget('aggregate-health-score'), undefined);
    // (100*1 + 0*1) / 2 = 50
    expect(result.score).toBe(50);
    expect(result.status).toBe('degraded');
    expect(result.down).toBe(1);
  });

  it('applies custom weights', async () => {
    const prisma = makePrisma({
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm1', name: 'API', runs: [{ level: 'green', latencyMs: 10 }] },
          { id: 'm2', name: 'DB', runs: [{ level: 'red', latencyMs: null }] },
        ]),
      },
    });
    const result = await resolveStatusWidget(
      prisma, noopCache, userId,
      makeWidget('aggregate-health-score', { weights: { m1: 3, m2: 1 } }), undefined,
    );
    // (100*3 + 0*1) / 4 = 75
    expect(result.score).toBe(75);
  });

  it('returns critical when >50% monitors down', async () => {
    const prisma = makePrisma({
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm1', name: 'A', runs: [{ level: 'red', latencyMs: null }] },
          { id: 'm2', name: 'B', runs: [{ level: 'red', latencyMs: null }] },
          { id: 'm3', name: 'C', runs: [{ level: 'green', latencyMs: 10 }] },
        ]),
      },
    });
    const result = await resolveStatusWidget(prisma, noopCache, userId, makeWidget('aggregate-health-score'), undefined);
    expect(result.status).toBe('critical');
  });
});

// ── multi-monitor-status-grid ────────────────────────────────────────────────

describe('status resolver — multi-monitor-status-grid', () => {
  it('returns all monitors with summary', async () => {
    const prisma = makePrisma({
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm1', name: 'API', type: 'HTTP', runs: [{ level: 'green', latencyMs: 15, checkedAt: new Date() }], monitorTags: [] },
          { id: 'm2', name: 'DB', type: 'TCP', runs: [{ level: 'red', latencyMs: null, checkedAt: new Date() }], monitorTags: [{ tag: { name: 'critical' } }] },
        ]),
      },
    });
    const result = await resolveStatusWidget(prisma, noopCache, userId, makeWidget('multi-monitor-status-grid'), undefined);
    expect(result.monitors).toHaveLength(2);
    expect(result.summary).toEqual({ total: 2, down: 1, degraded: 0, healthy: 1 });
    expect(result.fetchedAt).toBeDefined();
  });

  it('handles empty monitor list', async () => {
    const result = await resolveStatusWidget(makePrisma(), noopCache, userId, makeWidget('multi-monitor-status-grid'), undefined);
    expect(result.monitors).toEqual([]);
    expect(result.summary).toEqual({ total: 0, down: 0, degraded: 0, healthy: 0 });
  });
});

// ── multi-environment-status ─────────────────────────────────────────────────

describe('status resolver — multi-environment-status', () => {
  it('returns environment breakdown', async () => {
    const prisma = makePrisma({
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm1', name: 'API', runs: [{ level: 'green' }] },
          { id: 'm2', name: 'DB', runs: [{ level: 'red' }] },
        ]),
      },
    });
    const widget = makeWidget('multi-environment-status', {
      envMonitors: { Production: ['m1'], Staging: ['m2'] },
    });
    const result = await resolveStatusWidget(prisma, noopCache, userId, widget, undefined);
    const envs = result.environments as Array<{ env: string; summary: string }>;
    expect(envs).toHaveLength(2);
    expect(envs.find((e) => e.env === 'Production')?.summary).toBe('operational');
    expect(envs.find((e) => e.env === 'Staging')?.summary).toBe('outage');
  });

  it('returns empty environments when no config', async () => {
    const result = await resolveStatusWidget(makePrisma(), noopCache, userId, makeWidget('multi-environment-status'), undefined);
    expect(result.environments).toEqual([]);
  });
});

// ── region-status-map ────────────────────────────────────────────────────────

describe('status resolver — region-status-map', () => {
  it('returns regions with status', async () => {
    const prisma = makePrisma({
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm1', runs: [{ level: 'green' }] },
          { id: 'm2', runs: [{ level: 'yellow' }] },
        ]),
      },
    });
    const widget = makeWidget('region-status-map', {
      regionMonitors: { 'US-East': ['m1'], 'EU-West': ['m2'] },
    });
    const result = await resolveStatusWidget(prisma, noopCache, userId, widget, undefined);
    const regions = result.regions as Array<{ region: string; status: string }>;
    expect(regions).toHaveLength(2);
    expect(regions.find((r) => r.region === 'US-East')?.status).toBe('operational');
    expect(regions.find((r) => r.region === 'EU-West')?.status).toBe('degraded');
  });

  it('handles empty regionMonitors', async () => {
    const result = await resolveStatusWidget(makePrisma(), noopCache, userId, makeWidget('region-status-map'), undefined);
    expect(result.regions).toEqual([]);
  });
});

// ── service-health-matrix ────────────────────────────────────────────────────

describe('status resolver — service-health-matrix', () => {
  it('returns auto mode when no columns/rows configured', async () => {
    const prisma = makePrisma({
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm1', name: 'API', runs: [{ level: 'green', latencyMs: 10, checkedAt: new Date() }] },
        ]),
      },
    });
    const result = await resolveStatusWidget(prisma, noopCache, userId, makeWidget('service-health-matrix'), undefined);
    expect(result.mode).toBe('auto');
    expect(result.columns).toEqual(['Production']);
    expect((result.matrix as unknown[]).length).toBe(1);
  });

  it('returns manual mode with configured columns and rows', async () => {
    const prisma = makePrisma({
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm1', name: 'API', runs: [{ level: 'green', latencyMs: 10, checkedAt: new Date() }] },
          { id: 'm2', name: 'API-stage', runs: [{ level: 'yellow', latencyMs: 50, checkedAt: new Date() }] },
        ]),
      },
    });
    const widget = makeWidget('service-health-matrix', {
      columns: [
        { label: 'Prod', monitorIds: ['m1'] },
        { label: 'Staging', monitorIds: ['m2'] },
      ],
      rows: [{ id: 'api', name: 'API' }],
    });
    const result = await resolveStatusWidget(prisma, noopCache, userId, widget, undefined);
    expect(result.mode).toBe('manual');
    expect(result.columns).toEqual(['Prod', 'Staging']);
  });
});

// ── ssl-certificate-status ───────────────────────────────────────────────────

describe('status resolver — ssl-certificate-status', () => {
  it('returns _noConfig when no SSL monitors found', async () => {
    const result = await resolveStatusWidget(makePrisma(), noopCache, userId, makeWidget('ssl-certificate-status'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('returns cert data with correct status mapping', async () => {
    const prisma = makePrisma({
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm1', name: 'example.com', target: 'example.com', runs: [{ level: 'green', latencyMs: 90, message: 'expires: 2026-06-01, issuer: Let\'s Encrypt', checkedAt: new Date() }] },
          { id: 'm2', name: 'test.com', target: 'test.com', runs: [{ level: 'red', latencyMs: 5, message: 'expires: 2026-03-30', checkedAt: new Date() }] },
          { id: 'm3', name: 'expired.com', target: 'expired.com', runs: [{ level: 'red', latencyMs: 0, message: '', checkedAt: new Date() }] },
        ]),
      },
    });
    const result = await resolveStatusWidget(prisma, noopCache, userId, makeWidget('ssl-certificate-status'), undefined);
    const certs = result.certs as Array<{ domain: string; status: string; grade: string }>;
    expect(certs).toHaveLength(3);
    // Sorted by severity: expired first, then critical, then valid
    expect(certs[0].status).toBe('expired');
    expect(certs[1].status).toBe('critical');
    expect(certs[2].status).toBe('valid');
  });
});

// ── third-party-dependencies ─────────────────────────────────────────────────

describe('status resolver — third-party-dependencies', () => {
  it('returns empty services when none configured', async () => {
    const result = await resolveStatusWidget(makePrisma(), noopCache, userId, makeWidget('third-party-dependencies'), undefined);
    expect(result.services).toEqual([]);
    expect(result.checkedAt).toBeDefined();
  });
});

// ── security-advisory ────────────────────────────────────────────────────────

describe('status resolver — security-advisory', () => {
  it('returns empty advisories when no packageName', async () => {
    const result = await resolveStatusWidget(makePrisma(), noopCache, userId, makeWidget('security-advisory'), undefined);
    expect(result.advisories).toEqual([]);
    expect(result.packageName).toBe('');
  });
});

// ── monitor-group ────────────────────────────────────────────────────────────

describe('status resolver — monitor-group', () => {
  it('returns type for monitor-group', async () => {
    const result = await resolveStatusWidget(makePrisma(), noopCache, userId, makeWidget('monitor-group'), undefined);
    expect(result.type).toBe('monitor-group');
  });

  it('returns type for monitor-group-status', async () => {
    const result = await resolveStatusWidget(makePrisma(), noopCache, userId, makeWidget('monitor-group-status'), undefined);
    expect(result.type).toBe('monitor-group-status');
  });
});

// ── default / unknown widget type ────────────────────────────────────────────

describe('status resolver — unknown type', () => {
  it('returns fallback message', async () => {
    const result = await resolveStatusWidget(makePrisma(), noopCache, userId, makeWidget('unknown-widget-type'), undefined);
    expect(result.widgetType).toBe('unknown-widget-type');
    expect(result.message).toContain('not yet implemented');
  });
});
