/**
 * Unit tests for MonitorsService.checkRate()
 *
 * Tests the effective check rate API that returns throttleMs, maxChecksPerHour,
 * checksLastHour, effectiveChecksPerHour, and isThrottled.
 */
import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MonitorsService } from './monitors.service';
import { VersionDetectionService } from './version-detection.service';
import { PrismaService } from '../common/prisma.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';

// ── Helper: build a minimal Prisma mock for checkRate ─────────────────────────

function buildPrismaMock(opts: {
  monitor?: {
    intervalSec: number;
    throttleMs: number | null;
    maxChecksPerHour: number | null;
  } | null;
  checksLastHour?: number;
}) {
  return {
    monitor: {
      findFirst: vi.fn().mockResolvedValue(opts.monitor ?? null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(opts.checksLastHour ?? 0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    monitorDependency: { findMany: vi.fn().mockResolvedValue([]) },
    monitorAlert: { findMany: vi.fn().mockResolvedValue([]) },
    monitorTag: { findMany: vi.fn().mockResolvedValue([]) },
    incident: { count: vi.fn().mockResolvedValue(0) },
    incidentMonitor: { groupBy: vi.fn().mockResolvedValue([]) },
  };
}

async function buildService(prisma: object): Promise<MonitorsService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MonitorsService,
      { provide: PrismaService, useValue: prisma },
      {
        provide: ChecksService,
        useValue: { listPlugins: vi.fn().mockReturnValue([]), runCheck: vi.fn() },
      },
      { provide: AuditService, useValue: { log: vi.fn() } },
      { provide: RealtimeEvents, useValue: { emit: vi.fn() } },
      { provide: VersionDetectionService, useValue: {} },
    ],
  }).compile();
  return module.get<MonitorsService>(MonitorsService);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MonitorsService – checkRate', () => {

  // ── 1. effectiveChecksPerHour = 3600 / intervalSec when no maxChecksPerHour ─
  it('returns effectiveChecksPerHour based on interval when maxChecksPerHour is null', async () => {
    const prisma = buildPrismaMock({
      monitor: { intervalSec: 60, throttleMs: null, maxChecksPerHour: null },
      checksLastHour: 55,
    });
    const svc = await buildService(prisma);
    const result = await svc.checkRate('user1', 'monitor1');

    expect(result.intervalSec).toBe(60);
    expect(result.throttleMs).toBeNull();
    expect(result.maxChecksPerHour).toBeNull();
    // 3600 / 60 = 60 checks per hour
    expect(result.effectiveChecksPerHour).toBe(60);
    expect(result.checksLastHour).toBe(55);
    // isThrottled should be false when maxChecksPerHour is null
    expect(result.isThrottled).toBe(false);
  });

  // ── 2. effectiveChecksPerHour = min(interval-based, maxChecksPerHour) ────────
  it('effectiveChecksPerHour is capped by maxChecksPerHour when it is lower than interval-based rate', async () => {
    const prisma = buildPrismaMock({
      monitor: { intervalSec: 30, throttleMs: null, maxChecksPerHour: 30 },
      checksLastHour: 10,
    });
    const svc = await buildService(prisma);
    const result = await svc.checkRate('user1', 'monitor1');

    // interval-based = 3600 / 30 = 120, but capped by maxChecksPerHour = 30
    expect(result.effectiveChecksPerHour).toBe(30);
    expect(result.maxChecksPerHour).toBe(30);
  });

  // ── 3. isThrottled = true when checksLastHour >= maxChecksPerHour ─────────
  it('sets isThrottled = true when checksLastHour >= maxChecksPerHour', async () => {
    const prisma = buildPrismaMock({
      monitor: { intervalSec: 60, throttleMs: null, maxChecksPerHour: 20 },
      checksLastHour: 20, // exactly at the cap
    });
    const svc = await buildService(prisma);
    const result = await svc.checkRate('user1', 'monitor1');

    expect(result.isThrottled).toBe(true);
    expect(result.checksLastHour).toBe(20);
    expect(result.maxChecksPerHour).toBe(20);
  });

  // ── 4. isThrottled = false when checksLastHour < maxChecksPerHour ─────────
  it('sets isThrottled = false when checksLastHour < maxChecksPerHour', async () => {
    const prisma = buildPrismaMock({
      monitor: { intervalSec: 60, throttleMs: 5000, maxChecksPerHour: 30 },
      checksLastHour: 15,
    });
    const svc = await buildService(prisma);
    const result = await svc.checkRate('user1', 'monitor1');

    expect(result.isThrottled).toBe(false);
    expect(result.checksLastHour).toBe(15);
    expect(result.throttleMs).toBe(5000);
  });

  // ── 5. Throws NotFoundException when monitor not found ─────────────────────
  it('throws NotFoundException when monitor does not exist', async () => {
    const prisma = buildPrismaMock({ monitor: null });
    const svc = await buildService(prisma);

    await expect(svc.checkRate('user1', 'nonexistent-id')).rejects.toThrow(NotFoundException);
  });
});
