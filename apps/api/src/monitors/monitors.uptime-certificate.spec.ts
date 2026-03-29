/**
 * Unit tests for MonitorsService.uptimeCertificate()
 *
 * Tests HTML uptime certificate generation:
 * 1. Returns valid HTML for a monitor with SLA target + all passing checks
 * 2. Returns "Insufficient Data" when no checks exist
 * 3. Shows SLA BREACH when uptime < slaTarget
 * 4. Shows NO TARGET when slaTarget is null
 * 5. Clamps months to valid set (1,3,6,12) — invalid months default to 1
 * 6. Escapes HTML special chars in monitor name/description
 */
import { describe, it, expect, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { MonitorsService } from './monitors.service';
import { VersionDetectionService } from './version-detection.service';
import { PrismaService } from '../common/prisma.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPrisma(opts: {
  monitor?: {
    id: string;
    name: string;
    type: string;
    target: string;
    slaTarget: number | null;
    description: string | null;
    enabled: boolean;
  } | null;
  runs?: Array<{ ok: boolean; checkedAt: Date }>;
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

function buildModule(prisma: ReturnType<typeof buildPrisma>) {
  return Test.createTestingModule({
    providers: [
      MonitorsService,
      { provide: PrismaService, useValue: prisma },
      { provide: ChecksService, useValue: {} },
      { provide: AuditService, useValue: { log: vi.fn() } },
      { provide: RealtimeEvents, useValue: {} },
      { provide: VersionDetectionService, useValue: {} },
    ],
  }).compile();
}

// Reusable monitor fixture
const baseMonitor = {
  id: 'mon-cert-1',
  name: 'My API Monitor',
  type: 'HTTP',
  target: 'https://api.example.com/health',
  slaTarget: 99.9,
  description: 'Production API health check',
  enabled: true,
};

// Generate N runs all passing
function makeRuns(n: number, ok = true): Array<{ ok: boolean; checkedAt: Date }> {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => ({
    ok,
    checkedAt: new Date(now.getTime() - i * 60_000),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────

describe('MonitorsService.uptimeCertificate()', () => {
  it('returns valid HTML containing certificate elements for a compliant monitor', async () => {
    const runs = makeRuns(100, true);
    const prisma = buildPrisma({ monitor: baseMonitor, runs });
    const module: TestingModule = await buildModule(prisma);
    const svc = module.get(MonitorsService);

    const html = await svc.uptimeCertificate('user-1', 'mon-cert-1', 1);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Uptime Performance');
    expect(html).toContain('My API Monitor');
    expect(html).toContain('100.0000%');
    expect(html).toContain('SLA COMPLIANT');
    expect(html).toContain('99.9%');
    expect(html).toContain('PD-CERT-');
    expect(html).toContain('Print / Save PDF');
  });

  it('shows "Insufficient Data" when there are no check runs', async () => {
    const prisma = buildPrisma({ monitor: baseMonitor, runs: [] });
    const module: TestingModule = await buildModule(prisma);
    const svc = module.get(MonitorsService);

    const html = await svc.uptimeCertificate('user-1', 'mon-cert-1', 1);

    expect(html).toContain('Insufficient Data');
    expect(html).toContain('NO TARGET');
  });

  it('shows SLA BREACH when uptime is below SLA target', async () => {
    // 80 passing, 20 failing → 80% uptime < 99.9% target
    const runs = [
      ...makeRuns(80, true),
      ...makeRuns(20, false),
    ];
    const prisma = buildPrisma({ monitor: baseMonitor, runs });
    const module: TestingModule = await buildModule(prisma);
    const svc = module.get(MonitorsService);

    const html = await svc.uptimeCertificate('user-1', 'mon-cert-1', 1);

    expect(html).toContain('SLA BREACH');
    expect(html).not.toContain('SLA COMPLIANT');
  });

  it('shows NO TARGET when slaTarget is null', async () => {
    const monitorNoTarget = { ...baseMonitor, slaTarget: null };
    const runs = makeRuns(50, true);
    const prisma = buildPrisma({ monitor: monitorNoTarget, runs });
    const module: TestingModule = await buildModule(prisma);
    const svc = module.get(MonitorsService);

    const html = await svc.uptimeCertificate('user-1', 'mon-cert-1', 1);

    expect(html).toContain('NO TARGET');
    expect(html).toContain('No target set');
  });

  it('throws when monitor is not found', async () => {
    const prisma = buildPrisma({ monitor: null, runs: [] });
    const module: TestingModule = await buildModule(prisma);
    const svc = module.get(MonitorsService);

    await expect(svc.uptimeCertificate('user-1', 'nonexistent', 1)).rejects.toThrow('Monitor not found');
  });

  it('clamps invalid months to 1 and returns single-month certificate', async () => {
    const runs = makeRuns(60, true);
    const prisma = buildPrisma({ monitor: baseMonitor, runs });
    const module: TestingModule = await buildModule(prisma);
    const svc = module.get(MonitorsService);

    // months=7 is not in [1,3,6,12] → clamped to 1
    const html = await svc.uptimeCertificate('user-1', 'mon-cert-1', 7);

    // Monthly breakdown table is only shown when months > 1
    expect(html).not.toContain('Monthly Breakdown');
  });

  it('includes monthly breakdown table for 3-month certificate', async () => {
    const runs = makeRuns(90, true);
    const prisma = buildPrisma({ monitor: baseMonitor, runs });
    const module: TestingModule = await buildModule(prisma);
    const svc = module.get(MonitorsService);

    const html = await svc.uptimeCertificate('user-1', 'mon-cert-1', 3);

    expect(html).toContain('Monthly Breakdown');
    expect(html).toContain('Last 3 Months');
  });

  it('escapes HTML special characters in monitor name and description', async () => {
    const xssMonitor = {
      ...baseMonitor,
      name: '<script>alert("xss")</script>',
      description: 'A & B "test" \'value\'',
    };
    const runs = makeRuns(10, true);
    const prisma = buildPrisma({ monitor: xssMonitor, runs });
    const module: TestingModule = await buildModule(prisma);
    const svc = module.get(MonitorsService);

    const html = await svc.uptimeCertificate('user-1', 'mon-cert-1', 1);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &quot;test&quot; &#39;value&#39;');
  });
});
