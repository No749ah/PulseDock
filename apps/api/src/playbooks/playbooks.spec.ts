import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PlaybooksService } from './playbooks.service';
import type { PrismaService } from '../common/prisma.service';

const mockPrisma = {
  incidentPlaybook: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  monitor: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  incident: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
} as unknown as PrismaService;

function makeService() {
  return new PlaybooksService(mockPrisma);
}

describe('PlaybooksService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('findAll returns empty array for user with no playbooks', async () => {
    (mockPrisma.incidentPlaybook.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const svc = makeService();
    const result = await svc.findAll('user-1');
    expect(result).toEqual([]);
    expect(mockPrisma.incidentPlaybook.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('create creates a playbook with correct fields', async () => {
    const playbook = {
      id: 'pb-1',
      userId: 'user-1',
      name: 'DB Outage',
      description: 'Steps for DB outage',
      steps: [{ id: 's1', title: 'Check DB', type: 'check' }],
      forSeverities: ['CRITICAL'],
    };
    (mockPrisma.incidentPlaybook.create as ReturnType<typeof vi.fn>).mockResolvedValue(playbook);
    const svc = makeService();
    const result = await svc.create('user-1', {
      name: 'DB Outage',
      description: 'Steps for DB outage',
      steps: [{ id: 's1', title: 'Check DB', type: 'check' }],
      forSeverities: ['CRITICAL'],
    });
    expect(result.name).toBe('DB Outage');
    expect(result.userId).toBe('user-1');
  });

  it('create throws BadRequestException if steps is empty array', async () => {
    const svc = makeService();
    await expect(
      svc.create('user-1', { name: 'Empty', steps: [], forSeverities: [] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('update throws NotFoundException if playbook does not belong to user', async () => {
    (mockPrisma.incidentPlaybook.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const svc = makeService();
    await expect(
      svc.update('user-1', 'non-existent', {
        name: 'Updated',
        steps: [{ id: 's1', title: 'Step', type: 'check' }],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('delete throws NotFoundException if playbook not found', async () => {
    (mockPrisma.incidentPlaybook.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const svc = makeService();
    await expect(svc.delete('user-1', 'missing-id')).rejects.toThrow(NotFoundException);
  });

  it('attachToMonitor throws NotFoundException if monitor not found', async () => {
    (mockPrisma.monitor.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const svc = makeService();
    await expect(svc.attachToMonitor('user-1', 'missing-monitor', 'pb-1')).rejects.toThrow(NotFoundException);
  });

  it('attachToMonitor sets playbookId correctly', async () => {
    (mockPrisma.monitor.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'mon-1', userId: 'user-1' });
    (mockPrisma.incidentPlaybook.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'pb-1', userId: 'user-1' });
    (mockPrisma.monitor.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'mon-1', playbookId: 'pb-1' });
    const svc = makeService();
    const result = await svc.attachToMonitor('user-1', 'mon-1', 'pb-1');
    expect(result.playbookId).toBe('pb-1');
    expect(mockPrisma.monitor.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { playbookId: 'pb-1' } }),
    );
  });

  it('getForIncident returns snapshot steps if playbookSteps already set on incident', async () => {
    const snapshotSteps = [{ id: 's1', title: 'Check logs', type: 'check', done: true }];
    (mockPrisma.incident.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'inc-1',
      userId: 'user-1',
      playbookSteps: snapshotSteps,
      playbookId: 'pb-1',
      monitors: [],
    });
    const svc = makeService();
    const result = await svc.getForIncident('user-1', 'inc-1');
    expect(result.source).toBe('snapshot');
    expect(result.steps).toEqual(snapshotSteps);
    expect(result.playbookId).toBe('pb-1');
  });

  it('getForIncident returns live source when no snapshot but monitor has playbook', async () => {
    const liveSteps = [{ id: 's1', title: 'Restart', type: 'command' }];
    (mockPrisma.incident.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'inc-1',
      userId: 'user-1',
      playbookSteps: null,
      playbookId: null,
      monitors: [
        { monitor: { playbook: { id: 'pb-1', steps: liveSteps } } },
      ],
    });
    (mockPrisma.incident.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const svc = makeService();
    const result = await svc.getForIncident('user-1', 'inc-1');
    expect(result.source).toBe('live');
    expect(result.steps).toEqual(liveSteps);
    expect(result.playbookId).toBe('pb-1');
    expect(mockPrisma.incident.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ playbookSteps: liveSteps }) }),
    );
  });

  it('getForIncident returns none source when no snapshot and no linked playbook', async () => {
    (mockPrisma.incident.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'inc-1',
      userId: 'user-1',
      playbookSteps: null,
      playbookId: null,
      monitors: [{ monitor: { playbook: null } }],
    });
    const svc = makeService();
    const result = await svc.getForIncident('user-1', 'inc-1');
    expect(result.source).toBe('none');
    expect(result.steps).toEqual([]);
  });

  it('getForIncident throws NotFoundException for missing incident', async () => {
    (mockPrisma.incident.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const svc = makeService();
    await expect(svc.getForIncident('user-1', 'bad')).rejects.toThrow(NotFoundException);
  });

  it('markStep toggles a specific step done state', async () => {
    const steps = [
      { id: 's1', title: 'Check logs', done: false },
      { id: 's2', title: 'Restart', done: false },
    ];
    (mockPrisma.incident.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'inc-1',
      userId: 'user-1',
      playbookSteps: steps,
    });
    (mockPrisma.incident.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const svc = makeService();
    await svc.markStep('user-1', 'inc-1', 's1', true);
    const updateCall = (mockPrisma.incident.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.playbookSteps[0].done).toBe(true);
    expect(updateCall.data.playbookSteps[1].done).toBe(false);
  });

  it('markStep throws NotFoundException for missing incident', async () => {
    (mockPrisma.incident.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const svc = makeService();
    await expect(svc.markStep('user-1', 'bad', 's1', true)).rejects.toThrow(NotFoundException);
  });

  it('update updates playbook fields', async () => {
    (mockPrisma.incidentPlaybook.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'pb-1', userId: 'user-1', name: 'Old', _count: { monitors: 0 }, monitors: [],
    });
    (mockPrisma.incidentPlaybook.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'pb-1', name: 'Updated', steps: [{ id: 's1', title: 'New Step', type: 'check' }],
    });
    const svc = makeService();
    const result = await svc.update('user-1', 'pb-1', {
      name: 'Updated',
      steps: [{ id: 's1', title: 'New Step', type: 'check' }],
    });
    expect(result.name).toBe('Updated');
  });

  it('delete removes playbook when found', async () => {
    (mockPrisma.incidentPlaybook.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'pb-1', userId: 'user-1', _count: { monitors: 0 }, monitors: [],
    });
    (mockPrisma.incidentPlaybook.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const svc = makeService();
    await svc.delete('user-1', 'pb-1');
    expect(mockPrisma.incidentPlaybook.delete).toHaveBeenCalledWith({ where: { id: 'pb-1' } });
  });

  it('findOne returns playbook with monitor count', async () => {
    const pb = { id: 'pb-1', userId: 'user-1', name: 'Test', _count: { monitors: 3 }, monitors: [{ id: 'm1', name: 'API' }] };
    (mockPrisma.incidentPlaybook.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(pb);
    const svc = makeService();
    const result = await svc.findOne('user-1', 'pb-1');
    expect(result._count.monitors).toBe(3);
  });

  it('findOne throws NotFoundException for missing playbook', async () => {
    (mockPrisma.incidentPlaybook.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const svc = makeService();
    await expect(svc.findOne('user-1', 'bad')).rejects.toThrow(NotFoundException);
  });

  it('attachToMonitor clears playbookId when null passed', async () => {
    (mockPrisma.monitor.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'mon-1', userId: 'user-1' });
    (mockPrisma.monitor.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'mon-1', playbookId: null });
    const svc = makeService();
    const result = await svc.attachToMonitor('user-1', 'mon-1', null);
    expect(result.playbookId).toBeNull();
    expect(mockPrisma.monitor.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { playbookId: null } }),
    );
  });

  it('attachToMonitor throws NotFoundException if playbook not found', async () => {
    (mockPrisma.monitor.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'mon-1', userId: 'user-1' });
    (mockPrisma.incidentPlaybook.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const svc = makeService();
    await expect(svc.attachToMonitor('user-1', 'mon-1', 'bad-pb')).rejects.toThrow(NotFoundException);
  });
});
