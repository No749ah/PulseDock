import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateServiceGroupDto, UpdateServiceGroupDto } from './service-groups.dto';

@Injectable()
export class ServiceGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const groups = await this.prisma.monitorServiceGroup.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return groups.map((g) => ({ ...g, monitorCount: g.monitorIds.length }));
  }

  async create(userId: string, dto: CreateServiceGroupDto) {
    return this.prisma.monitorServiceGroup.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description,
        monitorIds: dto.monitorIds,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateServiceGroupDto) {
    const group = await this.prisma.monitorServiceGroup.findFirst({ where: { id, userId } });
    if (!group) throw new NotFoundException('Service group not found');
    return this.prisma.monitorServiceGroup.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.monitorIds !== undefined && { monitorIds: dto.monitorIds }),
      },
    });
  }

  async remove(userId: string, id: string) {
    const group = await this.prisma.monitorServiceGroup.findFirst({ where: { id, userId } });
    if (!group) throw new NotFoundException('Service group not found');
    await this.prisma.monitorServiceGroup.delete({ where: { id } });
  }

  async getStatus(userId: string, id: string) {
    const group = await this.prisma.monitorServiceGroup.findFirst({ where: { id, userId } });
    if (!group) throw new NotFoundException('Service group not found');

    if (group.monitorIds.length === 0) {
      return { id: group.id, name: group.name, description: group.description, status: 'unknown', monitors: [] };
    }

    const monitors = await this.prisma.monitor.findMany({
      where: { id: { in: group.monitorIds }, userId },
      select: { id: true, name: true, target: true, type: true, enabled: true },
    });

    const monitorStatuses = await Promise.all(
      monitors.map(async (m) => {
        const run = await this.prisma.monitorRun.findFirst({
          where: { monitorId: m.id },
          orderBy: { checkedAt: 'desc' },
        });
        return {
          id: m.id,
          name: m.name,
          level: run?.level ?? null,
          latencyMs: run?.latencyMs ?? null,
          checkedAt: run?.checkedAt ?? null,
        };
      }),
    );

    let status: string = 'operational';
    const hasRed = monitorStatuses.some((m) => m.level === 'red');
    const hasYellow = monitorStatuses.some((m) => m.level === 'yellow');

    if (hasRed) {
      status = 'outage';
    } else if (hasYellow) {
      status = 'degraded';
    } else {
      status = 'operational';
    }

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      status,
      monitors: monitorStatuses,
    };
  }
}
