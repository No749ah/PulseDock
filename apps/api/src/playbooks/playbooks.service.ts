import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { CreatePlaybookDto, UpdatePlaybookDto } from './playbooks.dto';

@Injectable()
export class PlaybooksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.incidentPlaybook.findMany({
      where: { userId },
      include: { _count: { select: { monitors: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const pb = await this.prisma.incidentPlaybook.findFirst({
      where: { id, userId },
      include: {
        _count: { select: { monitors: true } },
        monitors: { select: { id: true, name: true } },
      },
    });
    if (!pb) throw new NotFoundException('Playbook not found');
    return pb;
  }

  async create(userId: string, dto: CreatePlaybookDto) {
    if (dto.steps.length < 1) throw new BadRequestException('Playbook must have at least 1 step');
    return this.prisma.incidentPlaybook.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description,
        steps: dto.steps as object[],
        forSeverities: dto.forSeverities ?? [],
      },
    });
  }

  async update(userId: string, id: string, dto: UpdatePlaybookDto) {
    await this.findOne(userId, id);
    return this.prisma.incidentPlaybook.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        steps: dto.steps as object[],
        forSeverities: dto.forSeverities ?? [],
      },
    });
  }

  async delete(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.incidentPlaybook.delete({ where: { id } });
  }

  async attachToMonitor(userId: string, monitorId: string, playbookId: string | null | undefined) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');
    if (playbookId) {
      const pb = await this.prisma.incidentPlaybook.findFirst({ where: { id: playbookId, userId } });
      if (!pb) throw new NotFoundException('Playbook not found');
    }
    return this.prisma.monitor.update({
      where: { id: monitorId },
      data: { playbookId: playbookId ?? null },
    });
  }

  async getForIncident(userId: string, incidentId: string) {
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, userId },
      include: {
        monitors: { include: { monitor: { include: { playbook: true } } } },
      },
    });
    if (!incident) throw new NotFoundException('Incident not found');

    // Return snapshot if exists
    if (incident.playbookSteps) {
      return {
        steps: incident.playbookSteps,
        playbookId: incident.playbookId,
        source: 'snapshot' as const,
      };
    }

    // Try to get from first linked monitor's playbook
    const monitor = incident.monitors[0]?.monitor;
    if (monitor?.playbook) {
      const steps = monitor.playbook.steps as object[];
      await this.prisma.incident.update({
        where: { id: incidentId },
        data: { playbookSteps: steps, playbookId: monitor.playbook.id },
      });
      return { steps, playbookId: monitor.playbook.id, source: 'live' as const };
    }

    return { steps: [], playbookId: null, source: 'none' as const };
  }

  async markStep(userId: string, incidentId: string, stepId: string, done: boolean) {
    const incident = await this.prisma.incident.findFirst({ where: { id: incidentId, userId } });
    if (!incident) throw new NotFoundException('Incident not found');

    const steps = (incident.playbookSteps ?? []) as Array<{ id: string; done?: boolean; [key: string]: unknown }>;
    const updated = steps.map((s) => s.id === stepId ? { ...s, done } : s) as object[];

    return this.prisma.incident.update({
      where: { id: incidentId },
      data: { playbookSteps: updated },
    });
  }
}
