import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IncidentsService } from './incidents.service';
import { IncidentStatus, IncidentSeverity } from '@prisma/client';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeIncident(
  overrides: Partial<{
    id: string;
    userId: string;
    status: IncidentStatus;
    createdAt: Date;
    resolvedAt: Date | null;
    monitors: Array<{ monitor: { id: string; name: string } }>;
  }> = {},
) {
  return {
    id: 'inc-1',
    userId: 'user-1',
    title: 'Test incident',
    description: null,
    status: IncidentStatus.RESOLVED,
    severity: IncidentSeverity.MEDIUM,
    resolvedAt: null,
    rootCause: null,
    postmortemNotes: null,
    createdAt: new Date('2024-01-01T10:00:00Z'),
    updatedAt: new Date('2024-01-01T10:30:00Z'),
    monitors: [],
    updates: [],
    _count: { updates: 0 },
    ...overrides,
  };
}

function makePrisma(incidents: ReturnType<typeof makeIncident>[]) {
  return {
    incident: {
      findMany: vi.fn().mockResolvedValue(incidents),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    incidentMonitor: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    incidentUpdate: {
      create: vi.fn(),
    },
  };
}

function makeService(incidents: ReturnType<typeof makeIncident>[]) {
  const prisma = makePrisma(incidents);
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  const statusPages = { notifySubscribersOfIncident: vi.fn().mockResolvedValue(undefined) };
  const service = new IncidentsService(prisma as never, audit as never, statusPages as never);
  return { service, prisma };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('IncidentsService.mttrReport', () => {
  // Test 1: Returns null MTTR when no resolved incidents
  it('returns null MTTR when there are no resolved incidents', async () => {
    const unresolved = makeIncident({
      id: 'inc-1',
      status: IncidentStatus.INVESTIGATING,
      resolvedAt: null,
    });
    const { service } = makeService([unresolved]);

    const result = await service.mttrReport('user-1', 30);

    expect(result.overall.mttrMinutes).toBeNull();
    expect(result.overall.mttfMinutes).toBeNull();
    expect(result.overall.totalIncidents).toBe(1);
    expect(result.overall.resolvedIncidents).toBe(0);
  });

  // Test 2: Calculates MTTR correctly for 2 resolved incidents
  it('calculates MTTR correctly for 2 resolved incidents', async () => {
    // Incident 1: 60 minutes to resolve
    const inc1 = makeIncident({
      id: 'inc-1',
      status: IncidentStatus.RESOLVED,
      createdAt: new Date('2024-01-10T10:00:00Z'),
      resolvedAt: new Date('2024-01-10T11:00:00Z'), // 60 min
      monitors: [{ monitor: { id: 'mon-1', name: 'API' } }],
    });
    // Incident 2: 30 minutes to resolve
    const inc2 = makeIncident({
      id: 'inc-2',
      status: IncidentStatus.RESOLVED,
      createdAt: new Date('2024-01-11T10:00:00Z'),
      resolvedAt: new Date('2024-01-11T10:30:00Z'), // 30 min
      monitors: [{ monitor: { id: 'mon-1', name: 'API' } }],
    });

    const { service } = makeService([inc1, inc2]);

    const result = await service.mttrReport('user-1', 30);

    // Average MTTR = (60 + 30) / 2 = 45 minutes
    expect(result.overall.mttrMinutes).toBe(45);
    expect(result.overall.resolvedIncidents).toBe(2);
    expect(result.overall.longestIncidentMinutes).toBe(60);
    expect(result.overall.shortestIncidentMinutes).toBe(30);
  });

  // Test 3: Calculates MTTF correctly when 2 incidents with known gap
  it('calculates MTTF correctly for 2 incidents with known gap on same monitor', async () => {
    // Monitor 1: inc1 resolves at 11:00, inc2 starts at 14:00 → gap = 180 min
    const inc1 = makeIncident({
      id: 'inc-1',
      status: IncidentStatus.RESOLVED,
      createdAt: new Date('2024-01-10T10:00:00Z'),
      resolvedAt: new Date('2024-01-10T11:00:00Z'),
      monitors: [{ monitor: { id: 'mon-1', name: 'API' } }],
    });
    const inc2 = makeIncident({
      id: 'inc-2',
      status: IncidentStatus.RESOLVED,
      createdAt: new Date('2024-01-10T14:00:00Z'), // 180 min after inc1 resolved
      resolvedAt: new Date('2024-01-10T14:30:00Z'),
      monitors: [{ monitor: { id: 'mon-1', name: 'API' } }],
    });

    const { service } = makeService([inc1, inc2]);

    const result = await service.mttrReport('user-1', 30);

    // MTTF = gap between inc1.resolvedAt and inc2.createdAt = 180 min
    expect(result.overall.mttfMinutes).toBe(180);
  });

  // Test 4: Trend groups incidents by week correctly
  it('groups incidents by ISO week (Monday start) for trend', async () => {
    // 2024-01-15 is Monday of week 2024-W03
    const inc1 = makeIncident({
      id: 'inc-1',
      status: IncidentStatus.RESOLVED,
      createdAt: new Date('2024-01-15T10:00:00Z'), // Monday week 3
      resolvedAt: new Date('2024-01-15T10:20:00Z'), // 20 min
      monitors: [],
    });
    const inc2 = makeIncident({
      id: 'inc-2',
      status: IncidentStatus.RESOLVED,
      createdAt: new Date('2024-01-16T10:00:00Z'), // Tuesday same week
      resolvedAt: new Date('2024-01-16T11:00:00Z'), // 60 min
      monitors: [],
    });
    // Different week: 2024-01-22 is Monday week 4
    const inc3 = makeIncident({
      id: 'inc-3',
      status: IncidentStatus.RESOLVED,
      createdAt: new Date('2024-01-22T10:00:00Z'),
      resolvedAt: new Date('2024-01-22T10:30:00Z'), // 30 min
      monitors: [],
    });

    const { service } = makeService([inc1, inc2, inc3]);

    const result = await service.mttrReport('user-1', 30);

    expect(result.trend).toHaveLength(2);
    // Week 1: avg of 20 and 60 = 40 min
    expect(result.trend[0].incidentCount).toBe(2);
    expect(result.trend[0].mttrMinutes).toBe(40);
    // Week 2: 30 min
    expect(result.trend[1].incidentCount).toBe(1);
    expect(result.trend[1].mttrMinutes).toBe(30);
  });

  // Test 5: byMonitor groups by monitorId correctly
  it('groups byMonitor and calculates per-monitor MTTR', async () => {
    const inc1 = makeIncident({
      id: 'inc-1',
      status: IncidentStatus.RESOLVED,
      createdAt: new Date('2024-01-10T10:00:00Z'),
      resolvedAt: new Date('2024-01-10T11:00:00Z'), // 60 min
      monitors: [{ monitor: { id: 'mon-1', name: 'API Server' } }],
    });
    const inc2 = makeIncident({
      id: 'inc-2',
      status: IncidentStatus.RESOLVED,
      createdAt: new Date('2024-01-11T10:00:00Z'),
      resolvedAt: new Date('2024-01-11T10:20:00Z'), // 20 min
      monitors: [{ monitor: { id: 'mon-1', name: 'API Server' } }],
    });
    const inc3 = makeIncident({
      id: 'inc-3',
      status: IncidentStatus.RESOLVED,
      createdAt: new Date('2024-01-12T10:00:00Z'),
      resolvedAt: new Date('2024-01-12T10:10:00Z'), // 10 min
      monitors: [{ monitor: { id: 'mon-2', name: 'Database' } }],
    });

    const { service } = makeService([inc1, inc2, inc3]);

    const result = await service.mttrReport('user-1', 30);

    expect(result.byMonitor).toHaveLength(2);

    const apiMonitor = result.byMonitor.find((m) => m.monitorId === 'mon-1');
    expect(apiMonitor).toBeDefined();
    expect(apiMonitor!.monitorName).toBe('API Server');
    expect(apiMonitor!.incidentCount).toBe(2);
    expect(apiMonitor!.resolvedCount).toBe(2);
    // avg MTTR = (60 + 20) / 2 = 40 min
    expect(apiMonitor!.mttrMinutes).toBe(40);

    const dbMonitor = result.byMonitor.find((m) => m.monitorId === 'mon-2');
    expect(dbMonitor).toBeDefined();
    expect(dbMonitor!.monitorName).toBe('Database');
    expect(dbMonitor!.incidentCount).toBe(1);
    expect(dbMonitor!.mttrMinutes).toBe(10);
  });
});
