import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PlaybooksService } from './playbooks.service';
import type { PrismaService } from '../common/prisma.service';

const makePrisma = () =>
  ({
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
  }) as unknown as PrismaService;

describe('PlaybooksService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: PlaybooksService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new PlaybooksService(prisma);
    vi.clearAllMocks();
  });

  describe('findAll()', () => {
    it('returns all playbooks for user', async () => {
      const playbooks = [{ id: 'pb1', name: 'Restart' }];
      (prisma.incidentPlaybook.findMany as any).mockResolvedValue(playbooks);
      const result = await svc.findAll('u1');
      expect(result).toEqual(playbooks);
    });
  });

  describe('findOne()', () => {
    it('returns playbook when found', async () => {
      const pb = { id: 'pb1', name: 'Restart' };
      (prisma.incidentPlaybook.findFirst as any).mockResolvedValue(pb);
      const result = await svc.findOne('u1', 'pb1');
      expect(result).toEqual(pb);
    });

    it('throws NotFoundException when not found', async () => {
      (prisma.incidentPlaybook.findFirst as any).mockResolvedValue(null);
      await expect(svc.findOne('u1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create()', () => {
    it('creates playbook with steps', async () => {
      const created = { id: 'pb1', name: 'Restart', steps: [{ id: 's1', title: 'Step 1' }] };
      (prisma.incidentPlaybook.create as any).mockResolvedValue(created);
      const result = await svc.create('u1', {
        name: 'Restart',
        steps: [{ id: 's1', title: 'Step 1' }],
      } as any);
      expect(result).toEqual(created);
    });

    it('throws BadRequestException for empty steps', async () => {
      await expect(svc.create('u1', { name: 'Empty', steps: [] } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update()', () => {
    it('updates existing playbook', async () => {
      (prisma.incidentPlaybook.findFirst as any).mockResolvedValue({ id: 'pb1' });
      const updated = { id: 'pb1', name: 'Updated' };
      (prisma.incidentPlaybook.update as any).mockResolvedValue(updated);
      const result = await svc.update('u1', 'pb1', { name: 'Updated' } as any);
      expect(result).toEqual(updated);
    });
  });

  describe('delete()', () => {
    it('deletes existing playbook', async () => {
      (prisma.incidentPlaybook.findFirst as any).mockResolvedValue({ id: 'pb1' });
      (prisma.incidentPlaybook.delete as any).mockResolvedValue({});
      await svc.delete('u1', 'pb1');
      expect(prisma.incidentPlaybook.delete).toHaveBeenCalledWith({ where: { id: 'pb1' } });
    });
  });

  describe('attachToMonitor()', () => {
    it('throws NotFoundException when monitor not found', async () => {
      (prisma.monitor.findFirst as any).mockResolvedValue(null);
      await expect(svc.attachToMonitor('u1', 'missing', 'pb1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when playbook not found', async () => {
      (prisma.monitor.findFirst as any).mockResolvedValue({ id: 'm1' });
      (prisma.incidentPlaybook.findFirst as any).mockResolvedValue(null);
      await expect(svc.attachToMonitor('u1', 'm1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('clears playbook when null', async () => {
      (prisma.monitor.findFirst as any).mockResolvedValue({ id: 'm1' });
      (prisma.monitor.update as any).mockResolvedValue({ id: 'm1', playbookId: null });
      const result = await svc.attachToMonitor('u1', 'm1', null);
      expect(prisma.monitor.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { playbookId: null },
      });
    });

    it('attaches playbook on success', async () => {
      (prisma.monitor.findFirst as any).mockResolvedValue({ id: 'm1' });
      (prisma.incidentPlaybook.findFirst as any).mockResolvedValue({ id: 'pb1' });
      (prisma.monitor.update as any).mockResolvedValue({ id: 'm1', playbookId: 'pb1' });
      const result = await svc.attachToMonitor('u1', 'm1', 'pb1');
      expect(prisma.monitor.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { playbookId: 'pb1' },
      });
    });
  });

  describe('getForIncident()', () => {
    it('throws NotFoundException when incident not found', async () => {
      (prisma.incident.findFirst as any).mockResolvedValue(null);
      await expect(svc.getForIncident('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('returns snapshot source when playbookSteps exists', async () => {
      const steps = [{ id: 's1', title: 'Restart', done: false }];
      (prisma.incident.findFirst as any).mockResolvedValue({
        id: 'inc1',
        playbookSteps: steps,
        playbookId: 'pb1',
        monitors: [],
      });
      const result = await svc.getForIncident('u1', 'inc1');
      expect(result).toEqual({ steps, playbookId: 'pb1', source: 'snapshot' });
    });

    it('returns live source from monitor playbook', async () => {
      const steps = [{ id: 's1', title: 'Check logs' }];
      (prisma.incident.findFirst as any).mockResolvedValue({
        id: 'inc1',
        playbookSteps: null,
        playbookId: null,
        monitors: [{ monitor: { playbook: { id: 'pb1', steps } } }],
      });
      (prisma.incident.update as any).mockResolvedValue({});
      const result = await svc.getForIncident('u1', 'inc1');
      expect(result).toEqual({ steps, playbookId: 'pb1', source: 'live' });
    });

    it('returns none source when no playbook available', async () => {
      (prisma.incident.findFirst as any).mockResolvedValue({
        id: 'inc1',
        playbookSteps: null,
        playbookId: null,
        monitors: [{ monitor: { playbook: null } }],
      });
      const result = await svc.getForIncident('u1', 'inc1');
      expect(result).toEqual({ steps: [], playbookId: null, source: 'none' });
    });
  });

  describe('markStep()', () => {
    it('throws NotFoundException when incident not found', async () => {
      (prisma.incident.findFirst as any).mockResolvedValue(null);
      await expect(svc.markStep('u1', 'missing', 's1', true)).rejects.toThrow(NotFoundException);
    });

    it('marks step as done', async () => {
      (prisma.incident.findFirst as any).mockResolvedValue({
        id: 'inc1',
        playbookSteps: [
          { id: 's1', title: 'Step 1', done: false },
          { id: 's2', title: 'Step 2', done: false },
        ],
      });
      const updated = { id: 'inc1' };
      (prisma.incident.update as any).mockResolvedValue(updated);

      const result = await svc.markStep('u1', 'inc1', 's1', true);
      expect(prisma.incident.update).toHaveBeenCalledWith({
        where: { id: 'inc1' },
        data: {
          playbookSteps: [
            { id: 's1', title: 'Step 1', done: true },
            { id: 's2', title: 'Step 2', done: false },
          ],
        },
      });
    });
  });
});
