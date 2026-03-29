/**
 * Unit tests for MonitorsService.allHealthScores() and MonitorsService.ctLogHistory()
 *
 * allHealthScores: batch 24h uptime score per monitor (0–100), null when no data.
 * ctLogHistory: parses CT log check run messages into structured entries.
 */

import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MonitorsService } from './monitors.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { VersionDetectionService } from './version-detection.service';

// ─── Factory helpers ──────────────────────────────────────────────────────────

function makeService(prisma: Record<string, unknown>) {
  return new MonitorsService(
    prisma as never,
    { listPlugins: vi.fn().mockReturnValue([]), runMonitor: vi.fn() } as unknown as ChecksService,
    { log: vi.fn() } as unknown as AuditService,
    { emitMonitorUpdate: vi.fn(), emitCheckResult: vi.fn() } as unknown as RealtimeEvents,
    {} as unknown as VersionDetectionService,
  );
}

// ─── allHealthScores() ────────────────────────────────────────────────────────

describe('MonitorsService.allHealthScores()', () => {
  it('returns empty array when user has no monitors', async () => {
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([]) },
      monitorRun: { groupBy: vi.fn().mockResolvedValue([]) },
      incidentMonitor: { groupBy: vi.fn().mockResolvedValue([]) },
    };
    const svc = makeService(prisma);
    const result = await svc.allHealthScores('user-1');
    expect(result).toHaveLength(0);
  });

  it('returns null score for monitors with no runs in the last 24h', async () => {
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([{ id: 'm1', isFlapping: false }]) },
      monitorRun: { groupBy: vi.fn().mockResolvedValue([]) }, // no run data
      incidentMonitor: { groupBy: vi.fn().mockResolvedValue([]) },
    };
    const svc = makeService(prisma);
    const result = await svc.allHealthScores('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].monitorId).toBe('m1');
    expect(result[0].score).toBeNull();
  });

  it('returns 100% uptime score + no incidents + no flapping = max score', async () => {
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([{ id: 'm1', isFlapping: false }]) },
      monitorRun: {
        groupBy: vi.fn()
          // First call: total runs
          .mockResolvedValueOnce([{ monitorId: 'm1', _count: { _all: 100 } }])
          // Second call: ok runs (same count = 100% uptime)
          .mockResolvedValueOnce([{ monitorId: 'm1', _count: { _all: 100 } }]),
      },
      incidentMonitor: { groupBy: vi.fn().mockResolvedValue([]) },
    };
    const svc = makeService(prisma);
    const result = await svc.allHealthScores('user-1');

    // uptimeScore = 50 (100% of 50), incidentScore = 20 (0 incidents), flapping = 0
    // score = 50 + 30 + 20 = 100
    expect(result[0].score).toBe(100);
  });

  it('returns lower score when monitor has 50% uptime', async () => {
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([{ id: 'm1', isFlapping: false }]) },
      monitorRun: {
        groupBy: vi.fn()
          .mockResolvedValueOnce([{ monitorId: 'm1', _count: { _all: 100 } }])  // total
          .mockResolvedValueOnce([{ monitorId: 'm1', _count: { _all: 50 } }]),  // ok
      },
      incidentMonitor: { groupBy: vi.fn().mockResolvedValue([]) },
    };
    const svc = makeService(prisma);
    const result = await svc.allHealthScores('user-1');

    // uptimeScore = 25 (50% of 50), incidentScore = 20, flapping = 0
    // score = 25 + 30 + 20 = 75
    expect(result[0].score).toBe(75);
  });

  it('applies flapping penalty of 15 points', async () => {
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([{ id: 'm1', isFlapping: true }]) },
      monitorRun: {
        groupBy: vi.fn()
          .mockResolvedValueOnce([{ monitorId: 'm1', _count: { _all: 100 } }])
          .mockResolvedValueOnce([{ monitorId: 'm1', _count: { _all: 100 } }]),
      },
      incidentMonitor: { groupBy: vi.fn().mockResolvedValue([]) },
    };
    const svc = makeService(prisma);
    const result = await svc.allHealthScores('user-1');

    // 100 - 15 (flapping) = 85
    expect(result[0].score).toBe(85);
  });

  it('reduces score by 10 for each active incident', async () => {
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([{ id: 'm1', isFlapping: false }]) },
      monitorRun: {
        groupBy: vi.fn()
          .mockResolvedValueOnce([{ monitorId: 'm1', _count: { _all: 100 } }])
          .mockResolvedValueOnce([{ monitorId: 'm1', _count: { _all: 100 } }]),
      },
      incidentMonitor: {
        groupBy: vi.fn().mockResolvedValue([{ monitorId: 'm1', _count: { _all: 2 } }]),
      },
    };
    const svc = makeService(prisma);
    const result = await svc.allHealthScores('user-1');

    // incidentScore = max(0, 20 - 2*10) = 0
    // score = 50 + 30 + 0 = 80
    expect(result[0].score).toBe(80);
  });

  it('score never goes below 0', async () => {
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([{ id: 'm1', isFlapping: true }]) },
      monitorRun: {
        groupBy: vi.fn()
          .mockResolvedValueOnce([{ monitorId: 'm1', _count: { _all: 100 } }])
          .mockResolvedValueOnce([{ monitorId: 'm1', _count: { _all: 0 } }]), // 0% uptime
      },
      incidentMonitor: {
        groupBy: vi.fn().mockResolvedValue([{ monitorId: 'm1', _count: { _all: 10 } }]),
      },
    };
    const svc = makeService(prisma);
    const result = await svc.allHealthScores('user-1');

    expect(result[0].score).toBeGreaterThanOrEqual(0);
  });

  it('returns scores for multiple monitors in one call', async () => {
    const prisma = {
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm1', isFlapping: false },
          { id: 'm2', isFlapping: false },
          { id: 'm3', isFlapping: false },
        ]),
      },
      monitorRun: {
        groupBy: vi.fn()
          .mockResolvedValueOnce([
            { monitorId: 'm1', _count: { _all: 100 } },
            { monitorId: 'm2', _count: { _all: 50 } },
            // m3 not in results → no data
          ])
          .mockResolvedValueOnce([
            { monitorId: 'm1', _count: { _all: 100 } },
            { monitorId: 'm2', _count: { _all: 50 } },
          ]),
      },
      incidentMonitor: { groupBy: vi.fn().mockResolvedValue([]) },
    };
    const svc = makeService(prisma);
    const result = await svc.allHealthScores('user-1');

    expect(result).toHaveLength(3);
    expect(result.find(r => r.monitorId === 'm1')?.score).toBe(100);
    expect(result.find(r => r.monitorId === 'm2')?.score).toBe(100); // 100% ok of 50
    expect(result.find(r => r.monitorId === 'm3')?.score).toBeNull();
  });
});

// ─── ctLogHistory() ──────────────────────────────────────────────────────────

describe('MonitorsService.ctLogHistory()', () => {
  it('throws NotFoundException for unknown monitor', async () => {
    const prisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue(null) },
      monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const svc = makeService(prisma);
    await expect(svc.ctLogHistory('user-1', 'missing-id')).rejects.toThrow(NotFoundException);
  });

  it('returns empty entries when monitor has no runs', async () => {
    const prisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue({ id: 'm1', type: 'CT_LOG' }) },
      monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const svc = makeService(prisma);
    const result = await svc.ctLogHistory('user-1', 'm1');

    expect(result.entries).toHaveLength(0);
  });

  it('parses cert count from message', async () => {
    const prisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue({ id: 'm1' }) },
      monitorRun: {
        findMany: vi.fn().mockResolvedValue([
          {
            checkedAt: new Date('2026-03-28T10:00:00Z'),
            message: '3 new certificate(s) found for example.com: api.example.com, www.example.com, mail.example.com',
            level: 'yellow',
          },
        ]),
      },
    };
    const svc = makeService(prisma);
    const result = await svc.ctLogHistory('user-1', 'm1');

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].newCertCount).toBe(3);
    expect(result.entries[0].level).toBe('yellow');
  });

  it('returns newCertCount=0 for green (no new certs) messages', async () => {
    const prisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue({ id: 'm1' }) },
      monitorRun: {
        findMany: vi.fn().mockResolvedValue([
          {
            checkedAt: new Date('2026-03-28T10:00:00Z'),
            message: 'No new certificates found',
            level: 'green',
          },
        ]),
      },
    };
    const svc = makeService(prisma);
    const result = await svc.ctLogHistory('user-1', 'm1');

    expect(result.entries[0].newCertCount).toBe(0);
    expect(result.entries[0].level).toBe('green');
  });

  it('parses domain list from message', async () => {
    const prisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue({ id: 'm1' }) },
      monitorRun: {
        findMany: vi.fn().mockResolvedValue([
          {
            checkedAt: new Date('2026-03-28T10:00:00Z'),
            message: '2 new certificate(s) found: api.example.com, www.example.com',
            level: 'yellow',
          },
        ]),
      },
    };
    const svc = makeService(prisma);
    const result = await svc.ctLogHistory('user-1', 'm1');

    expect(result.entries[0].domains).toContain('api.example.com');
    expect(result.entries[0].domains).toContain('www.example.com');
  });

  it('defaults level to green when run.level is null', async () => {
    const prisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue({ id: 'm1' }) },
      monitorRun: {
        findMany: vi.fn().mockResolvedValue([
          { checkedAt: new Date(), message: 'OK', level: null },
        ]),
      },
    };
    const svc = makeService(prisma);
    const result = await svc.ctLogHistory('user-1', 'm1');

    expect(result.entries[0].level).toBe('green');
  });
});
