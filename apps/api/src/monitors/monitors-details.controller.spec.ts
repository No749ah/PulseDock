import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MonitorsDetailsController } from './monitors-details.controller';

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

function makeCrudService() {
  return {
    listDependencies: vi.fn(),
    addDependency: vi.fn(),
    removeDependency: vi.fn(),
    listEvents: vi.fn(),
    createEvent: vi.fn(),
    deleteEvent: vi.fn(),
    getResponseDiff: vi.fn(),
    getConfigHistory: vi.fn(),
  };
}

function makePrisma(found = true, extra: Record<string, unknown> = {}) {
  return {
    monitor: {
      findFirst: vi.fn().mockResolvedValue(found ? { id: 'mon-1', userId: 'user-1', ...extra } : null),
    },
    incidentMonitor: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('MonitorsDetailsController — dependencies', () => {
  let controller: MonitorsDetailsController;
  let service: ReturnType<typeof makeCrudService>;

  beforeEach(() => {
    service = makeCrudService();
    controller = new MonitorsDetailsController(service as never, {} as never);
  });

  it('listDependencies() delegates to crudService', async () => {
    service.listDependencies.mockResolvedValue([]);
    await controller.listDependencies(makeReq(), 'm-1');
    expect(service.listDependencies).toHaveBeenCalledWith('user-1', 'm-1');
  });

  it('addDependency() delegates to crudService', async () => {
    service.addDependency.mockResolvedValue({ ok: true });
    const result = await controller.addDependency(makeReq(), 'm-1', 'dep-1');
    expect(service.addDependency).toHaveBeenCalledWith('user-1', 'm-1', 'dep-1');
    expect(result).toEqual({ ok: true });
  });

  it('removeDependency() delegates to crudService', async () => {
    service.removeDependency.mockResolvedValue({ ok: true });
    const result = await controller.removeDependency(makeReq(), 'm-1', 'dep-1');
    expect(service.removeDependency).toHaveBeenCalledWith('user-1', 'm-1', 'dep-1');
    expect(result).toEqual({ ok: true });
  });
});

describe('MonitorsDetailsController — events', () => {
  let controller: MonitorsDetailsController;
  let service: ReturnType<typeof makeCrudService>;

  beforeEach(() => {
    service = makeCrudService();
    controller = new MonitorsDetailsController(service as never, {} as never);
  });

  it('listEvents() delegates to crudService', async () => {
    const events = [{ id: 'ev-1', message: 'Deploy', eventType: 'deploy', createdAt: new Date() }];
    service.listEvents.mockResolvedValue({ events });
    await controller.listEvents(makeReq(), 'm-1');
    expect(service.listEvents).toHaveBeenCalledWith('user-1', 'm-1');
  });

  it('createEvent() passes eventType from dto', async () => {
    service.createEvent.mockResolvedValue({ id: 'ev-1', message: 'v2 rollout', eventType: 'deploy' });
    await controller.createEvent(makeReq(), 'm-1', { message: 'v2 rollout', eventType: 'deploy' });
    expect(service.createEvent).toHaveBeenCalledWith('user-1', 'm-1', 'v2 rollout', 'deploy');
  });

  it('createEvent() defaults eventType to "note"', async () => {
    service.createEvent.mockResolvedValue({ id: 'ev-2', message: 'Restarted', eventType: 'note' });
    await controller.createEvent(makeReq(), 'm-1', { message: 'Restarted' });
    expect(service.createEvent).toHaveBeenCalledWith('user-1', 'm-1', 'Restarted', 'note');
  });

  it('deleteEvent() delegates to crudService', async () => {
    service.deleteEvent.mockResolvedValue({ ok: true });
    const result = await controller.deleteEvent(makeReq(), 'm-1', 'ev-1');
    expect(service.deleteEvent).toHaveBeenCalledWith('user-1', 'm-1', 'ev-1');
    expect(result).toEqual({ ok: true });
  });
});

describe('MonitorsDetailsController — responseDiff and configHistory', () => {
  let controller: MonitorsDetailsController;
  let service: ReturnType<typeof makeCrudService>;

  beforeEach(() => {
    service = makeCrudService();
    controller = new MonitorsDetailsController(service as never, {} as never);
  });

  it('getResponseDiff() delegates with both run IDs', async () => {
    service.getResponseDiff.mockResolvedValue({ failedBody: 'err', baseBody: 'ok' });
    await controller.getResponseDiff(makeReq(), 'm-1', 'run-bad', 'run-good');
    expect(service.getResponseDiff).toHaveBeenCalledWith('user-1', 'm-1', 'run-bad', 'run-good');
  });

  it('getResponseDiff() passes undefined baseRunId when not provided', async () => {
    service.getResponseDiff.mockResolvedValue({});
    await controller.getResponseDiff(makeReq(), 'm-1', 'run-abc');
    expect(service.getResponseDiff).toHaveBeenCalledWith('user-1', 'm-1', 'run-abc', undefined);
  });

  it('getConfigHistory() delegates with limit', async () => {
    service.getConfigHistory.mockResolvedValue({ entries: [] });
    await controller.getConfigHistory(makeReq(), 'm-1', '20');
    expect(service.getConfigHistory).toHaveBeenCalledWith('user-1', 'm-1', 20);
  });

  it('getConfigHistory() defaults to 50 when limit not provided', async () => {
    service.getConfigHistory.mockResolvedValue({ entries: [] });
    await controller.getConfigHistory(makeReq(), 'm-1');
    expect(service.getConfigHistory).toHaveBeenCalledWith('user-1', 'm-1', 50);
  });
});

describe('MonitorsDetailsController — securityAdvisories', () => {
  it('returns 404 when monitor not found', async () => {
    const prisma = makePrisma(false);
    const ctrl = new MonitorsDetailsController({} as never, prisma as never);
    await expect(ctrl.securityAdvisories(makeReq(), 'missing')).rejects.toThrow(NotFoundException);
  });

  it('returns supported:false for docker provider', async () => {
    const prisma = {
      monitor: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'mon-1', type: 'DOCKER_IMAGE', target: 'nginx', configJson: { provider: 'docker', target: 'nginx' },
        }),
      },
    };
    const ctrl = new MonitorsDetailsController({} as never, prisma as never);
    const result = await ctrl.securityAdvisories(makeReq(), 'mon-1') as Record<string, unknown>;
    expect(result['supported']).toBe(false);
  });

  it('returns supported:false for helm provider', async () => {
    const prisma = {
      monitor: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'mon-1', type: 'GIT_RELEASE', target: 'some/chart', configJson: { provider: 'helm' },
        }),
      },
    };
    const ctrl = new MonitorsDetailsController({} as never, prisma as never);
    const result = await ctrl.securityAdvisories(makeReq(), 'mon-1') as Record<string, unknown>;
    expect(result['supported']).toBe(false);
  });
});

describe('MonitorsDetailsController — releaseNotes', () => {
  it('returns 404 when monitor not found', async () => {
    const prisma = makePrisma(false);
    const ctrl = new MonitorsDetailsController({} as never, prisma as never);
    await expect(ctrl.releaseNotes(makeReq(), 'missing')).rejects.toThrow(NotFoundException);
  });

  it('returns available:false for non-github provider', async () => {
    const prisma = {
      monitor: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'mon-1', type: 'GIT_RELEASE', target: 'express', configJson: { provider: 'npm', target: 'express' },
        }),
      },
    };
    const ctrl = new MonitorsDetailsController({} as never, prisma as never);
    const result = await ctrl.releaseNotes(makeReq(), 'mon-1') as Record<string, unknown>;
    expect(result['available']).toBe(false);
  });

  it('returns available:false for unparseable target', async () => {
    const prisma = {
      monitor: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'mon-1', type: 'GIT_RELEASE', target: 'notarepo', configJson: { provider: 'github', target: 'notarepo' },
        }),
      },
    };
    const ctrl = new MonitorsDetailsController({} as never, prisma as never);
    const result = await ctrl.releaseNotes(makeReq(), 'mon-1') as Record<string, unknown>;
    expect(result['available']).toBe(false);
  });
});

describe('MonitorsDetailsController — monitorIncidents', () => {
  const now = new Date('2026-03-01T10:00:00Z');
  const resolved = new Date('2026-03-01T11:30:00Z');

  it('returns linked incidents with durationSec', async () => {
    const prisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue({ id: 'mon-1' }) },
      incidentMonitor: {
        findMany: vi.fn().mockResolvedValue([{
          monitorId: 'mon-1',
          incident: { id: 'inc-1', title: 'API down', status: 'RESOLVED', severity: 'HIGH', autoCreated: true, createdAt: now, resolvedAt: resolved },
        }]),
      },
    };
    const ctrl = new MonitorsDetailsController({} as never, prisma as never);
    const result = await ctrl.monitorIncidents(makeReq(), 'mon-1') as Record<string, unknown>;
    const incidents = result['incidents'] as Array<Record<string, unknown>>;
    expect(incidents).toHaveLength(1);
    expect(incidents[0]['id']).toBe('inc-1');
    expect(incidents[0]['durationSec']).toBe(5400);
  });

  it('throws NotFoundException when monitor not found', async () => {
    const prisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue(null) },
      incidentMonitor: { findMany: vi.fn() },
    };
    const ctrl = new MonitorsDetailsController({} as never, prisma as never);
    await expect(ctrl.monitorIncidents(makeReq(), 'missing')).rejects.toThrow(NotFoundException);
  });

  it('returns empty list when no incidents linked', async () => {
    const prisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue({ id: 'mon-1' }) },
      incidentMonitor: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const ctrl = new MonitorsDetailsController({} as never, prisma as never);
    const result = await ctrl.monitorIncidents(makeReq(), 'mon-1') as Record<string, unknown>;
    expect(result['total']).toBe(0);
    expect((result['incidents'] as unknown[]).length).toBe(0);
  });

  it('open incident has durationSec null', async () => {
    const openLink = {
      monitorId: 'mon-1',
      incident: { id: 'inc-1', title: 'API down', status: 'INVESTIGATING', severity: 'HIGH', autoCreated: true, createdAt: now, resolvedAt: null },
    };
    const prisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue({ id: 'mon-1' }) },
      incidentMonitor: { findMany: vi.fn().mockResolvedValue([openLink]) },
    };
    const ctrl = new MonitorsDetailsController({} as never, prisma as never);
    const result = await ctrl.monitorIncidents(makeReq(), 'mon-1') as Record<string, unknown>;
    const incidents = result['incidents'] as Array<Record<string, unknown>>;
    expect(incidents[0]['durationSec']).toBeNull();
  });
});

describe('MonitorsDetailsController — certificateDetails', () => {
  it('throws 404 when monitor not found', async () => {
    const prisma = { monitor: { findFirst: vi.fn().mockResolvedValue(null) } };
    const ctrl = new MonitorsDetailsController({} as never, prisma as never);
    await expect(ctrl.certificateDetails(makeReq(), 'missing')).rejects.toThrow(NotFoundException);
  });

  it('returns supported:false for non-TLS monitor type', async () => {
    const prisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue({ id: 'mon-1', type: 'TCP', target: 'example.com:9000', timeoutMs: 5000 }) },
    };
    const ctrl = new MonitorsDetailsController({} as never, prisma as never);
    const result = await ctrl.certificateDetails(makeReq(), 'mon-1') as Record<string, unknown>;
    expect(result['supported']).toBe(false);
    expect(String(result['reason'])).toContain('TCP');
  });

  it('returns supported:false for invalid hostname', async () => {
    const prisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue({ id: 'mon-1', type: 'SSL_CERT', target: 'not a valid url !!', timeoutMs: 5000 }) },
    };
    const ctrl = new MonitorsDetailsController({} as never, prisma as never);
    const result = await ctrl.certificateDetails(makeReq(), 'mon-1') as Record<string, unknown>;
    expect(result['supported']).toBe(false);
    expect(String(result['reason'])).toContain('hostname');
  });
});
