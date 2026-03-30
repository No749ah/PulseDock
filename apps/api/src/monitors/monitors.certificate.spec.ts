/**
 * Unit tests for MonitorsService.generateUptimeCertificate()
 *
 * 8 tests covering:
 * 1. Throws NotFoundException for wrong user
 * 2. Returns 100% uptime when all checks green
 * 3. Computes correct uptimePct with failures
 * 4. Counts incidents via ok→fail transitions
 * 5. Computes totalDowntimeMinutes correctly
 * 6. Sets slaCompliant=true when above target
 * 7. Sets slaCompliant=false when below target
 * 8. Sets slaCompliant=null when no slaTarget
 */
import { describe, it, expect, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MonitorsSlaService } from './monitors-sla.service';
import { VersionDetectionService } from './version-detection.service';
import { PrismaService } from '../common/prisma.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { MonitorsService } from './monitors.service';

// ── Types ──────────────────────────────────────────────────────────────────

interface RunRecord {
  ok: boolean;
  checkedAt: Date;
  latencyMs: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildPrisma(opts: {
  monitor?: {
    id: string;
    name: string;
    type: string;
    target: string;
    slaTarget: number | null;
  } | null;
  runs?: RunRecord[];
}) {
  const monitor = opts.monitor ?? null;
  const runs = opts.runs ?? [];

  return {
    monitor: {
      findFirst: vi.fn().mockResolvedValue(monitor),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue(runs),
    },
  };
}

async function buildService(prisma: ReturnType<typeof buildPrisma>): Promise<MonitorsSlaService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MonitorsSlaService,
      { provide: PrismaService, useValue: prisma },
      { provide: ChecksService, useValue: {} },
      { provide: AuditService, useValue: { log: vi.fn() } },
      { provide: RealtimeEvents, useValue: {} },
      { provide: VersionDetectionService, useValue: {} },
    ],
  }).compile();
  return module.get(MonitorsSlaService);
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const baseMonitor = {
  id: 'mon-cert-1',
  name: 'Prod API',
  type: 'HTTP',
  target: 'https://api.example.com',
  slaTarget: 99.9,
};

function makeRuns(n: number, ok = true): RunRecord[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => ({
    ok,
    checkedAt: new Date(now.getTime() - (n - i) * 60_000),
    latencyMs: ok ? 50 + i : null,
  }));
}

/**
 * Build a sequence of runs with specific ok values.
 * Each run is spaced `intervalMin` minutes apart.
 */
function makeSequence(
  values: boolean[],
  intervalMin = 5,
): RunRecord[] {
  const now = new Date();
  return values.map((ok, i) => ({
    ok,
    checkedAt: new Date(now.getTime() - (values.length - i) * intervalMin * 60_000),
    latencyMs: ok ? 100 : null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────

describe('MonitorsService.generateUptimeCertificate()', () => {
  it('throws NotFoundException for wrong user (monitor not found)', async () => {
    const prisma = buildPrisma({ monitor: null, runs: [] });
    const svc = await buildService(prisma);

    await expect(
      svc.generateUptimeCertificate('wrong-user', 'mon-cert-1', { periodDays: 30 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns 100% uptime when all checks are green', async () => {
    const runs = makeRuns(100, true);
    const prisma = buildPrisma({ monitor: baseMonitor, runs });
    const svc = await buildService(prisma);

    const cert = await svc.generateUptimeCertificate('user-1', 'mon-cert-1', { periodDays: 30 });

    expect(cert.uptimePct).toBe(100);
    expect(cert.totalChecks).toBe(100);
    expect(cert.successChecks).toBe(100);
    expect(cert.failedChecks).toBe(0);
    expect(cert.incidents).toBe(0);
    expect(cert.monitorName).toBe('Prod API');
  });

  it('computes correct uptimePct with failures', async () => {
    const passing = makeRuns(90, true);
    const failing = makeRuns(10, false);
    const runs = [...passing, ...failing];
    const prisma = buildPrisma({ monitor: baseMonitor, runs });
    const svc = await buildService(prisma);

    const cert = await svc.generateUptimeCertificate('user-1', 'mon-cert-1', { periodDays: 30 });

    expect(cert.totalChecks).toBe(100);
    expect(cert.failedChecks).toBe(10);
    expect(cert.successChecks).toBe(90);
    expect(cert.uptimePct).toBe(90);
  });

  it('counts incidents via ok→fail transitions', async () => {
    // 3 distinct outages: ok→fail→ok→fail→ok→fail→ok
    const seq = makeSequence([
      true, true, false, true, true, false, false, true, false, true,
    ]);
    const prisma = buildPrisma({ monitor: baseMonitor, runs: seq });
    const svc = await buildService(prisma);

    const cert = await svc.generateUptimeCertificate('user-1', 'mon-cert-1', { periodDays: 30 });

    // 3 ok→fail transitions
    expect(cert.incidents).toBe(3);
  });

  it('computes totalDowntimeMinutes correctly', async () => {
    // Simple sequence: ok for 0-4, fail at 5, ok again at 6
    // With intervalMin=10: outage = 10 minutes
    const seq = makeSequence([true, true, true, true, true, false, true], 10);
    const prisma = buildPrisma({ monitor: baseMonitor, runs: seq });
    const svc = await buildService(prisma);

    const cert = await svc.generateUptimeCertificate('user-1', 'mon-cert-1', { periodDays: 30 });

    // One outage of exactly 10 minutes (from index 5 to index 6, 10-min interval)
    expect(cert.totalDowntimeMinutes).toBe(10);
    expect(cert.longestOutageMinutes).toBe(10);
    expect(cert.incidents).toBe(1);
  });

  it('sets slaCompliant=true when uptimePct >= slaTarget', async () => {
    const runs = makeRuns(1000, true); // 100% uptime > 99.9% target
    const prisma = buildPrisma({ monitor: { ...baseMonitor, slaTarget: 99.9 }, runs });
    const svc = await buildService(prisma);

    const cert = await svc.generateUptimeCertificate('user-1', 'mon-cert-1', { periodDays: 30 });

    expect(cert.slaTarget).toBe(99.9);
    expect(cert.slaCompliant).toBe(true);
  });

  it('sets slaCompliant=false when uptimePct < slaTarget', async () => {
    // 800 pass, 200 fail → 80% < 99.9% target
    const runs = [...makeRuns(800, true), ...makeRuns(200, false)];
    const prisma = buildPrisma({ monitor: { ...baseMonitor, slaTarget: 99.9 }, runs });
    const svc = await buildService(prisma);

    const cert = await svc.generateUptimeCertificate('user-1', 'mon-cert-1', { periodDays: 30 });

    expect(cert.slaCompliant).toBe(false);
  });

  it('sets slaCompliant=null when monitor has no slaTarget', async () => {
    const runs = makeRuns(50, true);
    const prisma = buildPrisma({ monitor: { ...baseMonitor, slaTarget: null }, runs });
    const svc = await buildService(prisma);

    const cert = await svc.generateUptimeCertificate('user-1', 'mon-cert-1', { periodDays: 30 });

    expect(cert.slaTarget).toBeNull();
    expect(cert.slaCompliant).toBeNull();
  });
});
