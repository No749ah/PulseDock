import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateMaintenanceWindowDto, UpdateMaintenanceWindowDto } from './maintenance.dto';

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Internal helper — fetches a MaintenanceWindow with linked monitor IDs and
   * verifies ownership.
   *
   * @throws NotFoundException if the window does not exist
   * @throws ForbiddenException if the window belongs to another user
   */
  private async findOwned(id: string, userId: string) {
    const window = await this.prisma.maintenanceWindow.findUnique({
      where: { id },
      include: { monitors: { select: { monitorId: true } } },
    });
    if (!window) throw new NotFoundException('Maintenance window not found');
    if (window.userId !== userId) throw new ForbiddenException();
    return window;
  }

  /**
   * Returns all maintenance windows for a user, enriched with `monitorIds`,
   * `monitorCount`, and the computed `isActive` flag.
   * Ordered by `startsAt` ascending.
   *
   * @param userId - Owner's user ID
   */
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

  /**
   * Returns only the currently active maintenance windows (started in the past, ends in the future).
   * Used by the alert suppression logic in `ChecksService`.
   *
   * @param userId - Owner's user ID
   */
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

  /**
   * Returns a single maintenance window by ID.
   *
   * @param id     - MaintenanceWindow ID
   * @param userId - Owner's user ID
   * @throws NotFoundException / ForbiddenException via `findOwned`
   */
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

  /**
   * Creates a new maintenance window, optionally linking it to one or more monitors.
   *
   * @param userId - Owner's user ID
   * @param dto    - Window payload (name, description, startsAt, endsAt, monitorIds)
   */
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

  /**
   * Updates an existing maintenance window.
   * When `monitorIds` is provided the linked monitors are fully replaced (delete-all then re-insert)
   * inside a single DB transaction.
   *
   * @param id     - MaintenanceWindow ID
   * @param userId - Owner's user ID
   * @param dto    - Partial update payload
   * @throws NotFoundException / ForbiddenException via `findOwned`
   */
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

  /**
   * Deletes a maintenance window (cascades to linked monitors).
   *
   * @param id     - MaintenanceWindow ID
   * @param userId - Owner's user ID
   * @throws NotFoundException / ForbiddenException via `findOwned`
   */
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
