import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateMaintenanceWindowDto, UpdateMaintenanceWindowDto } from './maintenance.dto';

/**
 * Determines whether a recurring or one-shot maintenance window is currently active
 * given the current time.
 *
 * Recurrence rules:
 * - NONE: active iff startsAt <= now <= endsAt
 * - DAILY: every day, from startsAt's time-of-day for durationMinutes
 * - WEEKLY: on the days in recurrenceDays[], from startsAt's time-of-day for durationMinutes
 * - MONTHLY: on the same day-of-month as startsAt, from startsAt's time-of-day for durationMinutes
 *
 * recurrenceEndsAt stops new occurrences from being generated.
 *
 * @param window  - MaintenanceWindow record (plain shape with recurrence fields)
 * @param now     - Point in time to evaluate (default: current time)
 * @returns true when the window is active right now
 */
export function isWindowActive(
  window: {
    startsAt: Date;
    endsAt: Date;
    recurrence: string;
    recurrenceDays: string | null;
    durationMinutes: number | null;
    recurrenceEndsAt: Date | null;
  },
  now: Date = new Date(),
): boolean {
  const { startsAt, endsAt, recurrence, recurrenceDays, durationMinutes, recurrenceEndsAt } = window;

  if (recurrence === 'NONE') {
    return startsAt <= now && endsAt >= now;
  }

  // Recurring: don't start before the first occurrence
  if (now < startsAt) return false;
  // Recurring: don't apply after recurrenceEndsAt
  if (recurrenceEndsAt && now > recurrenceEndsAt) return false;

  const duration = durationMinutes ?? Math.round((endsAt.getTime() - startsAt.getTime()) / 60000);
  const startHour = startsAt.getUTCHours();
  const startMin = startsAt.getUTCMinutes();

  // Build the start of the current occurrence window in UTC
  const todayOccurrenceStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), startHour, startMin, 0, 0),
  );
  const todayOccurrenceEnd = new Date(todayOccurrenceStart.getTime() + duration * 60000);

  if (recurrence === 'DAILY') {
    return now >= todayOccurrenceStart && now <= todayOccurrenceEnd;
  }

  if (recurrence === 'WEEKLY') {
    const allowedDays = (recurrenceDays ?? '')
      .split(',')
      .map((d) => parseInt(d.trim(), 10))
      .filter((d) => !isNaN(d));
    if (allowedDays.length === 0) return false;
    const dow = now.getUTCDay();
    return allowedDays.includes(dow) && now >= todayOccurrenceStart && now <= todayOccurrenceEnd;
  }

  if (recurrence === 'MONTHLY') {
    const domMatch = now.getUTCDate() === startsAt.getUTCDate();
    return domMatch && now >= todayOccurrenceStart && now <= todayOccurrenceEnd;
  }

  return false;
}

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
   * @returns Maintenance windows with computed activity metadata
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
      isActive: isWindowActive(w, now),
      monitors: undefined,
    }));
  }

  /**
   * Returns only the currently active maintenance windows (started in the past, ends in the future),
   * including recurring windows that are currently in an active occurrence.
   *
   * Used by the alert suppression logic in `ChecksService`.
   *
   * @param userId - Owner's user ID
   * @returns Active maintenance windows with computed activity metadata
   */
  async listActive(userId: string) {
    const now = new Date();
    // Fetch all windows for this user (recurring ones can't be filtered by DB alone)
    const windows = await this.prisma.maintenanceWindow.findMany({
      where: { userId },
      include: { monitors: { select: { monitorId: true } } },
      orderBy: { endsAt: 'asc' },
    });
    return windows
      .filter((w) => isWindowActive(w, now))
      .map((w) => ({
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
   * @returns Window with computed activity metadata
   * @throws NotFoundException / ForbiddenException via `findOwned`
   */
  async getOne(id: string, userId: string) {
    const window = await this.findOwned(id, userId);
    const now = new Date();
    return {
      ...window,
      monitorIds: window.monitors.map((m) => m.monitorId),
      monitorCount: window.monitors.length,
      isActive: isWindowActive(window, now),
      monitors: undefined,
    };
  }

  /**
   * Creates a new maintenance window, optionally linking specific monitors.
   *
   * @param userId - Owner's user ID
   * @param dto    - Create payload
   * @returns Newly created maintenance window
   */
  async create(userId: string, dto: CreateMaintenanceWindowDto) {
    const { monitorIds, ...rest } = dto;
    const duration =
      dto.durationMinutes ??
      Math.round((new Date(dto.endsAt).getTime() - new Date(dto.startsAt).getTime()) / 60000);

    const window = await this.prisma.maintenanceWindow.create({
      data: {
        userId,
        name: rest.name,
        description: rest.description,
        startsAt: new Date(rest.startsAt),
        endsAt: new Date(rest.endsAt),
        recurrence: rest.recurrence ?? 'NONE',
        recurrenceDays: rest.recurrenceDays ?? null,
        durationMinutes: duration,
        recurrenceEndsAt: rest.recurrenceEndsAt ? new Date(rest.recurrenceEndsAt) : null,
        monitors: monitorIds?.length
          ? { createMany: { data: monitorIds.map((monitorId) => ({ monitorId })) } }
          : undefined,
      },
      include: { monitors: { select: { monitorId: true } } },
    });

    const now = new Date();
    return {
      ...window,
      monitorIds: window.monitors.map((m) => m.monitorId),
      monitorCount: window.monitors.length,
      isActive: isWindowActive(window, now),
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
   * @returns Updated maintenance window with computed activity metadata
   * @throws NotFoundException / ForbiddenException via `findOwned`
   */
  async update(id: string, userId: string, dto: UpdateMaintenanceWindowDto) {
    await this.findOwned(id, userId);
    const { monitorIds, ...rest } = dto;

    // Compute durationMinutes if start/end are being updated and duration not explicit
    let durationMinutes: number | undefined;
    if (rest.durationMinutes !== undefined) {
      durationMinutes = rest.durationMinutes;
    } else if (rest.startsAt && rest.endsAt) {
      durationMinutes = Math.round(
        (new Date(rest.endsAt).getTime() - new Date(rest.startsAt).getTime()) / 60000,
      );
    }

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
          ...(rest.name !== undefined ? { name: rest.name } : {}),
          ...(rest.description !== undefined ? { description: rest.description } : {}),
          ...(rest.startsAt ? { startsAt: new Date(rest.startsAt) } : {}),
          ...(rest.endsAt ? { endsAt: new Date(rest.endsAt) } : {}),
          ...(rest.recurrence !== undefined ? { recurrence: rest.recurrence } : {}),
          ...(rest.recurrenceDays !== undefined ? { recurrenceDays: rest.recurrenceDays } : {}),
          ...(durationMinutes !== undefined ? { durationMinutes } : {}),
          ...(rest.recurrenceEndsAt !== undefined
            ? { recurrenceEndsAt: rest.recurrenceEndsAt ? new Date(rest.recurrenceEndsAt) : null }
            : {}),
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
   * @returns `{ ok: true }` when deletion succeeds
   * @throws NotFoundException / ForbiddenException via `findOwned`
   */
  async remove(id: string, userId: string) {
    await this.findOwned(id, userId);
    await this.prisma.maintenanceWindow.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Returns whether a monitor is currently covered by an active maintenance window.
   * Supports recurring windows.
   *
   * @param monitorId - Monitor ID to check
   * @param userId - Owner's user ID
   * @returns `true` when at least one active maintenance window includes the monitor (or has no monitor filter)
   */
  async isMonitorInMaintenance(monitorId: string, userId: string): Promise<boolean> {
    const now = new Date();
    const windows = await this.prisma.maintenanceWindow.findMany({
      where: { userId },
      include: { monitors: { select: { monitorId: true } } },
    });

    for (const w of windows) {
      if (!isWindowActive(w, now)) continue;
      const monitorIds = w.monitors.map((m) => m.monitorId);
      if (monitorIds.length === 0 || monitorIds.includes(monitorId)) return true;
    }
    return false;
  }
}
