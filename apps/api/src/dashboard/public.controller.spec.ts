import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicDashboardController } from './public.controller';
import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { PrismaService } from '../common/prisma.service';

const makeDate = (offsetMs = 0) => new Date(Date.now() - offsetMs);

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    user: { findUnique: vi.fn() },
    monitor: { findMany: vi.fn() },
    monitorRun: { findMany: vi.fn() },
    ...overrides,
  } as unknown as PrismaService;
}

function makeRun(monitorId: string, level: 'green' | 'yellow' | 'red', offsetMs: number, extra: Record<string, unknown> = {}) {
  return {
    id: `run-${monitorId}-${offsetMs}`,
    monitorId,
    userId: 'user-1',
    checkedAt: makeDate(offsetMs),
    ok: level === 'green',
    latencyMs: 42,
    message: `${level} check`,
    level,
    ...extra,
  };
}

function makeMonitor(id: string, name: string) {
  return { id, userId: 'user-1', name, type: 'HTTP', target: 'https://example.com', enabled: true, intervalMs: 60000, timeoutMs: 5000, createdAt: new Date(), updatedAt: new Date() };
}

describe('PublicDashboardController', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let controller: PublicDashboardController;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new PublicDashboardController(prisma);
  });

  it('throws NotFoundException when user not found', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(controller.overview('no-user')).rejects.toThrow(NotFoundException);
  });

  it('returns empty overview when user has no monitors', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await controller.overview('u1');
    expect(result.totalMonitors).toBe(0);
    expect(result.uptimePct).toBe(100);
    expect(result.monitors).toEqual([]);
    expect(result.incidents).toEqual([]);
    expect(result.recentEvents).toEqual([]);
  });

  it('handles monitor with no runs (defaults to green)', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeMonitor('m1', 'Mon1')]);
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await controller.overview('u1');
    expect(result.green).toBe(1);
    expect(result.monitors[0].level).toBe('green');
    expect(result.monitors[0].uptimePct).toBe(100);
    expect(result.monitors[0].latencyHistory).toEqual([]);
    expect(result.monitors[0].lastChecked).toBeNull();
    expect(result.monitors[0].message).toBeNull();
    expect(result.monitors[0].latencyMs).toBeNull();
  });

  it('handles monitor with only green runs', async () => {
    const runs = [
      makeRun('m1', 'green', 1000),
      makeRun('m1', 'green', 2000),
    ];
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeMonitor('m1', 'Mon1')]);
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(runs);

    const result = await controller.overview('u1');
    expect(result.green).toBe(1);
    expect(result.yellow).toBe(0);
    expect(result.red).toBe(0);
    expect(result.monitors[0].uptimePct).toBe(100);
    expect(result.incidents).toEqual([]);
  });

  it('increments yellow counter for yellow-level monitor', async () => {
    const runs = [makeRun('m1', 'yellow', 1000)];
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeMonitor('m1', 'Mon1')]);
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(runs);

    const result = await controller.overview('u1');
    expect(result.yellow).toBe(1);
    expect(result.green).toBe(0);
    expect(result.monitors[0].level).toBe('yellow');
  });

  it('increments red counter for red-level monitor', async () => {
    const runs = [makeRun('m1', 'red', 1000)];
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeMonitor('m1', 'Mon1')]);
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(runs);

    const result = await controller.overview('u1');
    expect(result.red).toBe(1);
    expect(result.monitors[0].level).toBe('red');
  });

  it('filters null latencyMs from latencyHistory', async () => {
    const runs = [
      makeRun('m1', 'green', 1000, { latencyMs: null }),
      makeRun('m1', 'green', 2000, { latencyMs: 55 }),
    ];
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeMonitor('m1', 'Mon1')]);
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(runs);

    const result = await controller.overview('u1');
    expect(result.monitors[0].latencyHistory.length).toBe(1);
    expect(result.monitors[0].latencyHistory[0].latencyMs).toBe(55);
  });

  it('creates a resolved incident (non-green then green)', async () => {
    // Runs are newest-first from DB; the controller reverses for incident scanning
    const runs = [
      makeRun('m1', 'green', 1000),   // newest — resolves incident
      makeRun('m1', 'yellow', 2000),   // older — starts incident
    ];
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeMonitor('m1', 'Mon1')]);
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(runs);

    const result = await controller.overview('u1');
    expect(result.incidents.length).toBe(1);
    expect(result.incidents[0].resolvedAt).not.toBeNull();
    expect(result.incidents[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(result.incidents[0].level).toBe('yellow');
  });

  it('creates an ongoing incident (no closing green)', async () => {
    const runs = [makeRun('m1', 'red', 1000)];
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeMonitor('m1', 'Mon1')]);
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(runs);

    const result = await controller.overview('u1');
    expect(result.incidents.length).toBe(1);
    expect(result.incidents[0].resolvedAt).toBeNull();
    expect(result.incidents[0].durationMs).toBeNull();
    expect(result.incidents[0].level).toBe('red');
  });

  it('escalates incident from yellow to red when red run encountered', async () => {
    // newest-first: green (resolves), red (escalates), yellow (starts)
    const runs = [
      makeRun('m1', 'green', 1000),
      makeRun('m1', 'red', 2000),
      makeRun('m1', 'yellow', 3000),
    ];
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeMonitor('m1', 'Mon1')]);
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(runs);

    const result = await controller.overview('u1');
    expect(result.incidents.length).toBe(1);
    expect(result.incidents[0].level).toBe('red');
    expect(result.incidents[0].resolvedAt).not.toBeNull();
  });

  it('handles multiple incidents on one monitor', async () => {
    // newest-first: red(ongoing), green, yellow(resolved#2 start), green, red(resolved#1 start)
    const runs = [
      makeRun('m1', 'red', 1000),    // newest — ongoing incident
      makeRun('m1', 'green', 2000),   // resolves second incident
      makeRun('m1', 'yellow', 3000),  // second incident starts
      makeRun('m1', 'green', 4000),   // resolves first incident
      makeRun('m1', 'red', 5000),     // first incident starts (oldest)
    ];
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeMonitor('m1', 'Mon1')]);
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(runs);

    const result = await controller.overview('u1');
    expect(result.incidents.length).toBe(3);
    // Two resolved + one ongoing
    const resolved = result.incidents.filter((i) => i.resolvedAt !== null);
    const ongoing = result.incidents.filter((i) => i.resolvedAt === null);
    expect(resolved.length).toBe(2);
    expect(ongoing.length).toBe(1);
  });

  it('sorts incidents newest-first', async () => {
    // Two monitors with incidents at different times
    const runs = [
      makeRun('m1', 'red', 1000),   // newer incident
      makeRun('m2', 'red', 5000),   // older incident
    ];
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeMonitor('m1', 'Mon1'), makeMonitor('m2', 'Mon2')]);
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(runs);

    const result = await controller.overview('u1');
    expect(result.incidents.length).toBe(2);
    const t0 = new Date(result.incidents[0].startedAt).getTime();
    const t1 = new Date(result.incidents[1].startedAt).getTime();
    expect(t0).toBeGreaterThan(t1);
  });

  it('slices recentEvents to max 20', async () => {
    const runs = Array.from({ length: 25 }, (_, i) => makeRun('m1', 'green', i * 1000));
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeMonitor('m1', 'Mon1')]);
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(runs);

    const result = await controller.overview('u1');
    expect(result.recentEvents.length).toBe(20);
  });

  it('computes correct uptimePct with mixed monitor levels', async () => {
    // 3 monitors: 2 green, 1 red → uptimePct should be ~66.67
    const runs = [
      makeRun('m1', 'green', 1000),
      makeRun('m2', 'green', 1000),
      makeRun('m3', 'red', 1000),
    ];
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeMonitor('m1', 'Mon1'),
      makeMonitor('m2', 'Mon2'),
      makeMonitor('m3', 'Mon3'),
    ]);
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(runs);

    const result = await controller.overview('u1');
    expect(result.green).toBe(2);
    expect(result.red).toBe(1);
    expect(result.uptimePct).toBe(66.67);
  });

  it('slices incidents to max 20', async () => {
    // Create 25 monitors each with an ongoing incident
    const monitors = Array.from({ length: 25 }, (_, i) => makeMonitor(`m${i}`, `Mon${i}`));
    const runs = monitors.map((m, i) => makeRun(m.id, 'red', (i + 1) * 1000));
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(monitors);
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(runs);

    const result = await controller.overview('u1');
    expect(result.incidents.length).toBe(20);
  });

  it('includes correct fields in recentEvents', async () => {
    const runs = [makeRun('m1', 'green', 1000)];
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeMonitor('m1', 'Mon1')]);
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(runs);

    const result = await controller.overview('u1');
    const event = result.recentEvents[0];
    expect(event).toHaveProperty('id');
    expect(event).toHaveProperty('monitorId', 'm1');
    expect(event).toHaveProperty('checkedAt');
    expect(event).toHaveProperty('ok', true);
    expect(event).toHaveProperty('latencyMs', 42);
    expect(event).toHaveProperty('message', 'green check');
    expect(event).toHaveProperty('level', 'green');
  });
});

// ── Incident level escalation from yellow → red (line 103) ───────────────────

describe('overview() — incident escalation: yellow start, then red (line 103)', () => {
  it('escalates ongoing incident from yellow to red when a red run follows the initial yellow', async () => {
    const prisma = makePrisma();
    const controller = new PublicDashboardController(prisma);

    // Runs in newest-first order:
    // yellow (newest — starts the ongoing incident, incidentLevel='yellow')
    // red   (older  — incidentStart already set, lvl==='red' → incidentLevel='red' ← LINE 103)
    const runs = [
      makeRun('m1', 'yellow', 1000),
      makeRun('m1', 'red', 2000),
    ];
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeMonitor('m1', 'Mon1')]);
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(runs);

    const result = await controller.overview('u1');

    expect(result.incidents).toHaveLength(1);
    expect(result.incidents[0].resolvedAt).toBeNull();
    expect(result.incidents[0].level).toBe('red');
  });
});

// ── Badge endpoint tests ──────────────────────────────────────────────────────

function makeMockRes() {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  return {
    res: {
      setHeader: vi.fn((k: string, v: string) => { headers[k] = v; }),
      end: vi.fn((data: string) => { body = data; }),
    } as unknown as Response,
    getHeaders: () => headers,
    getBody: () => body,
  };
}

describe('badge()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let controller: PublicDashboardController;

  beforeEach(() => {
    prisma = {
      user: { findUnique: vi.fn() },
      monitor: { findUnique: vi.fn(), findMany: vi.fn() },
      monitorRun: { findFirst: vi.fn(), findMany: vi.fn() },
    } as unknown as PrismaService;
    controller = new PublicDashboardController(prisma);
  });

  it('throws NotFoundException when monitor not found', async () => {
    (prisma.monitor.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { res } = makeMockRes();
    await expect(controller.badge('nonexistent', undefined, undefined, res)).rejects.toThrow(NotFoundException);
  });

  it('returns green SVG badge for up monitor', async () => {
    (prisma.monitor.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', name: 'My API', enabled: true });
    (prisma.monitorRun.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ level: 'green', ok: true });
    const { res, getBody, getHeaders } = makeMockRes();

    await controller.badge('m1', undefined, undefined, res);

    const body = getBody()!;
    expect(body).toContain('<svg');
    expect(body).toContain('up');
    expect(body).toContain('#3fb950'); // green color
    expect(getHeaders()['Cache-Control']).toContain('public');
  });

  it('returns degraded SVG badge for yellow monitor', async () => {
    (prisma.monitor.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', name: 'My API', enabled: true });
    (prisma.monitorRun.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ level: 'yellow', ok: false });
    const { res, getBody } = makeMockRes();

    await controller.badge('m1', undefined, undefined, res);

    const body = getBody()!;
    expect(body).toContain('degraded');
    expect(body).toContain('#d29922'); // yellow color
  });

  it('returns down SVG badge for red monitor', async () => {
    (prisma.monitor.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', name: 'My API', enabled: true });
    (prisma.monitorRun.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ level: 'red', ok: false });
    const { res, getBody } = makeMockRes();

    await controller.badge('m1', undefined, undefined, res);

    const body = getBody()!;
    expect(body).toContain('down');
    expect(body).toContain('#f85149'); // red color
  });

  it('returns paused SVG badge for disabled monitor', async () => {
    (prisma.monitor.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', name: 'My API', enabled: false });
    (prisma.monitorRun.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { res, getBody } = makeMockRes();

    await controller.badge('m1', undefined, undefined, res);

    const body = getBody()!;
    expect(body).toContain('paused');
    expect(body).toContain('#9ca3af'); // gray color
  });

  it('uses custom label override', async () => {
    (prisma.monitor.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', name: 'My API', enabled: true });
    (prisma.monitorRun.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ level: 'green', ok: true });
    const { res, getBody } = makeMockRes();

    await controller.badge('m1', undefined, 'custom-label', res);

    const body = getBody()!;
    expect(body).toContain('custom-label');
  });

  it('renders flat-square style (no gradient)', async () => {
    (prisma.monitor.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', name: 'My API', enabled: true });
    (prisma.monitorRun.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ level: 'green', ok: true });
    const { res, getBody } = makeMockRes();

    await controller.badge('m1', 'flat-square', undefined, res);

    const body = getBody()!;
    expect(body).toContain('<svg');
    // flat-square has rx=0
    expect(body).toContain('rx="0"');
  });

  it('renders for-the-badge style with uppercase text', async () => {
    (prisma.monitor.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', name: 'my api', enabled: true });
    (prisma.monitorRun.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ level: 'green', ok: true });
    const { res, getBody } = makeMockRes();

    await controller.badge('m1', 'for-the-badge', undefined, res);

    const body = getBody()!;
    expect(body).toContain('MY API');
    expect(body).toContain('UP');
  });

  it('defaults to green when no run exists', async () => {
    (prisma.monitor.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', name: 'My API', enabled: true });
    (prisma.monitorRun.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { res, getBody } = makeMockRes();

    await controller.badge('m1', undefined, undefined, res);

    const body = getBody()!;
    expect(body).toContain('up');
    expect(body).toContain('#3fb950');
  });
});

describe('embedData()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let controller: PublicDashboardController;

  function makeMockJsonRes() {
    const headers: Record<string, string> = {};
    let body: unknown;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn((data: unknown) => { body = data; }),
      setHeader: vi.fn((k: string, v: string) => { headers[k] = v; }),
    } as unknown as Response;
    return { res, getBody: () => body, getHeaders: () => headers };
  }

  beforeEach(() => {
    prisma = {
      user: { findUnique: vi.fn() },
      monitor: { findUnique: vi.fn(), findMany: vi.fn() },
      monitorRun: { findFirst: vi.fn(), findMany: vi.fn() },
    } as unknown as PrismaService;
    controller = new PublicDashboardController(prisma);
  });

  it('returns 404 JSON when monitor not found', async () => {
    (prisma.monitor.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { res, getBody } = makeMockJsonRes();
    await controller.embedData('nonexistent', res);
    expect((getBody() as Record<string, string>).error).toContain('not found');
  });

  it('returns up status for green monitor', async () => {
    (prisma.monitor.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', name: 'My API', enabled: true });
    (prisma.monitorRun.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ level: 'green', ok: true, latencyMs: 42, checkedAt: new Date('2026-01-01T00:00:00Z') });
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ level: 'green' }, { level: 'green' }]);
    const { res, getBody } = makeMockJsonRes();

    await controller.embedData('m1', res);

    const body = getBody() as Record<string, unknown>;
    expect(body.status).toBe('up');
    expect(body.uptimePct).toBe(100);
    expect(body.responseMs).toBe(42);
    expect(body.monitorId).toBe('m1');
    expect(body.name).toBe('My API');
  });

  it('returns down status for red monitor', async () => {
    (prisma.monitor.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm2', name: 'DB', enabled: true });
    (prisma.monitorRun.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ level: 'red', ok: false, latencyMs: null, checkedAt: new Date() });
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ level: 'green' }, { level: 'red' }]);
    const { res, getBody } = makeMockJsonRes();

    await controller.embedData('m2', res);

    expect((getBody() as Record<string, unknown>).status).toBe('down');
    expect((getBody() as Record<string, unknown>).uptimePct).toBe(50);
  });

  it('returns degraded status for yellow monitor', async () => {
    (prisma.monitor.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm3', name: 'Cache', enabled: true });
    (prisma.monitorRun.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ level: 'yellow', ok: false, latencyMs: 900, checkedAt: new Date() });
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ level: 'yellow' }]);
    const { res, getBody } = makeMockJsonRes();

    await controller.embedData('m3', res);

    expect((getBody() as Record<string, unknown>).status).toBe('degraded');
  });

  it('returns paused status for disabled monitor', async () => {
    (prisma.monitor.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm4', name: 'Paused', enabled: false });
    (prisma.monitorRun.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { res, getBody } = makeMockJsonRes();

    await controller.embedData('m4', res);

    expect((getBody() as Record<string, unknown>).status).toBe('paused');
    expect((getBody() as Record<string, unknown>).uptimePct).toBe(100); // no runs = 100
  });

  it('sets CORS headers on embed response', async () => {
    (prisma.monitor.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm5', name: 'API', enabled: true });
    (prisma.monitorRun.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ level: 'green', ok: true, latencyMs: 10, checkedAt: new Date() });
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ level: 'green' }]);
    const { res, getHeaders } = makeMockJsonRes();

    await controller.embedData('m5', res);

    expect(getHeaders()['Access-Control-Allow-Origin']).toBe('*');
  });
});

describe('statusPageBadge()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let controller: PublicDashboardController;

  function makeMockEndRes() {
    const headers: Record<string, string> = {};
    let body: string | undefined;
    const res = {
      setHeader: vi.fn((k: string, v: string) => { headers[k] = v; }),
      end: vi.fn((data: string) => { body = data; }),
    } as unknown as Response;
    return { res, getBody: () => body, getHeaders: () => headers };
  }

  beforeEach(() => {
    prisma = {
      user: { findUnique: vi.fn() },
      monitor: { findUnique: vi.fn(), findMany: vi.fn() },
      monitorRun: { findFirst: vi.fn(), findMany: vi.fn() },
      publicStatusPage: { findUnique: vi.fn() },
    } as unknown as PrismaService;
    controller = new PublicDashboardController(prisma);
  });

  it('throws NotFoundException when page not found', async () => {
    (prisma.publicStatusPage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { res } = makeMockEndRes();
    await expect(controller.statusPageBadge('no-slug', undefined, undefined, res)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when page is not published', async () => {
    (prisma.publicStatusPage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', title: 'Status', isPublished: false, layout: {}, userId: 'u1' });
    const { res } = makeMockEndRes();
    await expect(controller.statusPageBadge('my-page', undefined, undefined, res)).rejects.toThrow(NotFoundException);
  });

  it('returns operational badge when no monitors in layout', async () => {
    (prisma.publicStatusPage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1', title: 'My Status', isPublished: true, layout: {}, userId: 'u1',
    });
    const { res, getBody } = makeMockEndRes();

    await controller.statusPageBadge('my-page', undefined, undefined, res);

    expect(getBody()).toContain('operational');
    expect(getBody()).toContain('#2da44e');
  });

  it('returns outage badge when any monitor is red', async () => {
    (prisma.publicStatusPage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1', title: 'Status', isPublished: true,
      layout: { widgets: [{ config: { monitorId: 'mon-1' } }] },
      userId: 'u1',
    });
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { monitorId: 'mon-1', level: 'red', ok: false },
    ]);
    const { res, getBody } = makeMockEndRes();

    await controller.statusPageBadge('my-page', undefined, undefined, res);

    expect(getBody()).toContain('outage');
    expect(getBody()).toContain('#cf222e');
  });

  it('returns degraded badge when any monitor is yellow', async () => {
    (prisma.publicStatusPage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1', title: 'Status', isPublished: true,
      layout: { widgets: [{ config: { monitorId: 'mon-2' } }] },
      userId: 'u1',
    });
    (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { monitorId: 'mon-2', level: 'yellow', ok: false },
    ]);
    const { res, getBody } = makeMockEndRes();

    await controller.statusPageBadge('my-page', undefined, undefined, res);

    expect(getBody()).toContain('degraded');
    expect(getBody()).toContain('#d1a317');
  });

  it('uses custom label override', async () => {
    (prisma.publicStatusPage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1', title: 'Status', isPublished: true, layout: {}, userId: 'u1',
    });
    const { res, getBody } = makeMockEndRes();

    await controller.statusPageBadge('my-page', undefined, 'My Company', res);

    expect(getBody()).toContain('My Company');
  });

  it('sets CORS and cache headers', async () => {
    (prisma.publicStatusPage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1', title: 'Status', isPublished: true, layout: {}, userId: 'u1',
    });
    const { res, getHeaders } = makeMockEndRes();

    await controller.statusPageBadge('my-page', undefined, undefined, res);

    expect(getHeaders()['Access-Control-Allow-Origin']).toBe('*');
    expect(getHeaders()['Cache-Control']).toContain('public');
  });
});
