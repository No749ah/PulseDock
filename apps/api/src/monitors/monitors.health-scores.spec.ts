/**
 * Unit tests for MonitorsService.healthScoreLeaderboard()
 *
 * 6 tests:
 * 1. Returns empty items + zero summary when no monitors exist
 * 2. Returns null score + no-data hint when monitor has no runs
 * 3. Computes correct score + grade A for 100% uptime, no incidents
 * 4. Computes lower score for monitors with active incidents
 * 5. Applies flapping penalty and records correct hint
 * 6. Sets slaCompliant correctly when uptimePct < slaTarget
 */
import { describe, it, expect, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { MonitorsService } from './monitors.service';
import { PrismaService } from '../common/prisma.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { VersionDetectionService } from './version-detection.service';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makePrisma(opts: {
  monitors?: Array<{ id: string; name: string; type: string; isFlapping: boolean; slaTarget: number | null }>;
  runStats?: Array<{ monitorId: string; _count: { _all: number } }>;
  okStats?: Array<{ monitorId: string; _count: { _all: number } }>;
  incidentStats?: Array<{ monitorId: string; _count: { _all: number } }>;
}) {
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(opts.monitors ?? []),
    },
    monitorRun: {
      groupBy: vi
        .fn()
        .mockResolvedValueOnce(opts.runStats ?? [])
        .mockResolvedValueOnce(opts.okStats ?? []),
    },
    incidentMonitor: {
      groupBy: vi.fn().mockResolvedValue(opts.incidentStats ?? []),
    },
  };
}

async function buildService(prisma: ReturnType<typeof makePrisma>): Promise<MonitorsService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MonitorsService,
      { provide: PrismaService, useValue: prisma },
      { provide: ChecksService, useValue: {} },
      { provide: AuditService, useValue: { log: vi.fn() } },
      { provide: RealtimeEvents, useValue: {} },
      { provide: VersionDetectionService, useValue: {} },
    ],
  }).compile();
  return module.get(MonitorsService);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('MonitorsService.healthScoreLeaderboard()', () => {
  it('returns empty items and zero summary when no monitors exist', async () => {
    const prisma = makePrisma({ monitors: [], runStats: [], okStats: [], incidentStats: [] });
    const svc = await buildService(prisma);

    const result = await svc.healthScoreLeaderboard('user-1');

    expect(result.items).toHaveLength(0);
    expect(result.summary.totalMonitors).toBe(0);
    expect(result.summary.avgScore).toBeNull();
    expect(result.summary.noDataCount).toBe(0);
  });

  it('returns null score and no-data hint when monitor has no runs', async () => {
    const monitors = [{ id: 'mon-1', name: 'API', type: 'HTTP', isFlapping: false, slaTarget: null }];
    const prisma = makePrisma({ monitors, runStats: [], okStats: [], incidentStats: [] });
    const svc = await buildService(prisma);

    const result = await svc.healthScoreLeaderboard('user-1');

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.score).toBeNull();
    expect(item.grade).toBeNull();
    expect(item.uptimePct24h).toBeNull();
    expect(item.hints[0]).toContain('No check data');
    expect(result.summary.noDataCount).toBe(1);
    expect(result.summary.avgScore).toBeNull();
  });

  it('computes Grade A for 100% uptime and no incidents', async () => {
    const monitors = [{ id: 'mon-1', name: 'API', type: 'HTTP', isFlapping: false, slaTarget: 99.9 }];
    const runStats = [{ monitorId: 'mon-1', _count: { _all: 100 } }];
    const okStats = [{ monitorId: 'mon-1', _count: { _all: 100 } }];
    const prisma = makePrisma({ monitors, runStats, okStats, incidentStats: [] });
    const svc = await buildService(prisma);

    const result = await svc.healthScoreLeaderboard('user-1');

    const item = result.items[0];
    // uptimeScore = 50, latency = 30, incidentScore = 20, flapping = 0 → 100
    expect(item.score).toBe(100);
    expect(item.grade).toBe('A');
    expect(item.uptimePct24h).toBe(100);
    expect(item.slaCompliant).toBe(true);
    expect(result.summary.gradeDistribution.A).toBe(1);
  });

  it('reduces score and sets hint when there are active incidents', async () => {
    const monitors = [{ id: 'mon-1', name: 'DB', type: 'TCP', isFlapping: false, slaTarget: null }];
    const runStats = [{ monitorId: 'mon-1', _count: { _all: 100 } }];
    const okStats = [{ monitorId: 'mon-1', _count: { _all: 100 } }];
    // 2 active incidents → incidentScore = max(0, 20 - 20) = 0
    const incidentStats = [{ monitorId: 'mon-1', _count: { _all: 2 } }];
    const prisma = makePrisma({ monitors, runStats, okStats, incidentStats });
    const svc = await buildService(prisma);

    const result = await svc.healthScoreLeaderboard('user-1');

    const item = result.items[0];
    // uptimeScore=50, latency=30, incidentScore=0, flapping=0 → 80
    expect(item.score).toBe(80);
    expect(item.grade).toBe('B');
    expect(item.activeIncidents).toBe(2);
    expect(item.hints.some((h) => h.includes('incident'))).toBe(true);
  });

  it('applies flapping penalty (-15) and records flapping hint', async () => {
    const monitors = [{ id: 'mon-1', name: 'Web', type: 'HTTP', isFlapping: true, slaTarget: null }];
    const runStats = [{ monitorId: 'mon-1', _count: { _all: 100 } }];
    const okStats = [{ monitorId: 'mon-1', _count: { _all: 100 } }];
    const prisma = makePrisma({ monitors, runStats, okStats, incidentStats: [] });
    const svc = await buildService(prisma);

    const result = await svc.healthScoreLeaderboard('user-1');

    const item = result.items[0];
    // uptimeScore=50, latency=30, incidentScore=20, flapping=-15 → 85
    expect(item.score).toBe(85);
    expect(item.isFlapping).toBe(true);
    expect(item.hints.some((h) => h.toLowerCase().includes('flap'))).toBe(true);
  });

  it('sets slaCompliant=false and adds hint when uptimePct < slaTarget', async () => {
    const monitors = [{ id: 'mon-1', name: 'API', type: 'HTTP', isFlapping: false, slaTarget: 99.9 }];
    // 80 ok out of 100 → 80% uptime < 99.9% target
    const runStats = [{ monitorId: 'mon-1', _count: { _all: 100 } }];
    const okStats = [{ monitorId: 'mon-1', _count: { _all: 80 } }];
    const prisma = makePrisma({ monitors, runStats, okStats, incidentStats: [] });
    const svc = await buildService(prisma);

    const result = await svc.healthScoreLeaderboard('user-1');

    const item = result.items[0];
    expect(item.slaCompliant).toBe(false);
    expect(item.slaTarget).toBe(99.9);
    expect(item.hints.some((h) => h.includes('SLA'))).toBe(true);
  });
});
