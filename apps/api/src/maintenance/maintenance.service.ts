import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateMaintenanceWindowDto, UpdateMaintenanceWindowDto } from './maintenance.dto';

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  private async findOwned(id: string, userId: string) {
    const window = await this.prisma.maintenanceWindow.findUnique({
      where: { id },
      include: { monitors: { select: { monitorId: true } } },
    });
    if (!window) throw new NotFoundException('Maintenance window not found');
    if (window.userId !== userId) throw new ForbiddenException();
    return window;
  }

  async list(userId: string) {
    const now = new Date();
    const windows = await this.prisma.maintenanceWindow.findMany({
      where: { userId },
      include: { monitors: { select: { monitorId: true } } },
      orderBy: { startsAt: 'asc' },
    });
    return windows.map((w) => ({
      ...w,
      monitorIds: w.monitors.map((m) => m.monitorId),
      monitorCount: w.monitors.length,
      isActive: w.startsAt <= now && w.endsAt >= now,
      monitors: undefined,
    }));
  }

  async listActive(userId: string) {
    const now = new Date();
    const windows = await this.prisma.maintenanceWindow.findMany({
      where: {
        userId,
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      include: { monitors: { select: { monitorId: true } } },
      orderBy: { endsAt: 'asc' },
    });
    return windows.map((w) => ({
      ...w,
      monitorIds: w.monitors.map((m) => m.monitorId),
      monitorCount: w.monitors.length,
      isActive: true,
      monitors: undefined,
    }));
  }

  async getOne(id: string, userId: string) {
    const w = await this.findOwned(id, userId);
    const now = new Date();
    return {
      ...w,
      monitorIds: w.monitors.map((m) => m.monitorId),
      monitorCount: w.monitors.length,
      isActive: w.startsAt <= now && w.endsAt >= now,
      monitors: undefined,
    };
  }

  async create(userId: string, dto: CreateMaintenanceWindowDto) {
    const { monitorIds = [], ...rest } = dto;
    const window = await this.prisma.maintenanceWindow.create({
      data: {
        ...rest,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        userId,
        monitors: monitorIds.length
          ? { create: monitorIds.map((monitorId) => ({ monitorId })) }
          : undefined,
      },
      include: { monitors: { select: { monitorId: true } } },
    });
    const now = new Date();
    return {
      ...window,
      monitorIds: window.monitors.map((m) => m.monitorId),
      monitorCount: window.monitors.length,
      isActive: window.startsAt <= now && window.endsAt >= now,
      monitors: undefined,
    };
  }

  async update(id: string, userId: string, dto: UpdateMaintenanceWindowDto) {
    await this.findOwned(id, userId);
    const { monitorIds, ...rest } = dto;

    await this.prisma.$transaction(async (tx) => {
      if (monitorIds !== undefined) {
        await tx.maintenanceWindowMonitor.deleteMany({ where: { windowId: id } });
        if (monitorIds.length > 0) {
          await tx.maintenanceWindowMonitor.createMany({
            data: monitorIds.map((monitorId) => ({ windowId: id, monitorId })),
          });
        }
      }
      await tx.maintenanceWindow.update({
        where: { id },
        data: {
          ...rest,
          ...(rest.startsAt ? { startsAt: new Date(rest.startsAt) } : {}),
          ...(rest.endsAt ? { endsAt: new Date(rest.endsAt) } : {}),
        },
      });
    });

    return this.getOne(id, userId);
  }

  async remove(id: string, userId: string) {
    await this.findOwned(id, userId);
    await this.prisma.maintenanceWindow.delete({ where: { id } });
    return { ok: true };
  }

  /** Returns true if monitorId is currently inside an active maintenance window for userId */
  async isMonitorInMaintenance(monitorId: string, userId: string): Promise<boolean> {
    const now = new Date();
    const count = await this.prisma.maintenanceWindow.count({
      where: {
        userId,
        startsAt: { lte: now },
        endsAt: { gte: now },
        monitors: { some: { monitorId } },
      },
    });
    return count > 0;
  }
}
