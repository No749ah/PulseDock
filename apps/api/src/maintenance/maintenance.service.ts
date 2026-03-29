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

  /**
   * Analyzes the effectiveness of past maintenance windows.
   *
   * For each completed (non-recurring) window in the past N days:
   * - Count check runs during the window
   * - Count failures during the window
   * - Compare to baseline failure rate (equal-duration period before the window)
   * - Detect post-maintenance recovery: first successful check after window ends
   * - Compute suppressed alerts (failures during window that would otherwise have fired)
   *
   * @param userId  - Owner's user ID
   * @param days    - How far back to look for completed windows (1–365, default 90)
   */
  async effectiveness(userId: string, days: number): Promise<{
    period: { days: number; since: string };
    summary: {
      totalWindows: number;
      avgDurationMinutes: number;
      totalSuppressedAlerts: number;
      avgBaselineFailurePct: number;
      avgWindowFailurePct: number;
      noiseReductionPct: number;
    };
    windows: Array<{
      id: string;
      name: string;
      description: string | null;
      startsAt: string;
      endsAt: string;
      durationMinutes: number;
      monitorIds: string[];
      monitorNames: string[];
      checksInWindow: number;
      failuresInWindow: number;
      windowFailurePct: number;
      checksInBaseline: number;
      failuresInBaseline: number;
      baselineFailurePct: number;
      suppressedAlerts: number;
      recoveredAfterMinutes: number | null;
      status: 'effective' | 'over-active' | 'no-data';
    }>;
  }> {
    const clampedDays = Math.min(365, Math.max(1, days));
    const since = new Date(Date.now() - clampedDays * 24 * 60 * 60 * 1000);
    const now = new Date();

    // Only look at one-shot (NONE recurrence) windows that have already ended
    const windows = await this.prisma.maintenanceWindow.findMany({
      where: {
        userId,
        recurrence: 'NONE',
        endsAt: { lte: now, gte: since },
      },
      include: {
        monitors: {
          include: { monitor: { select: { id: true, name: true } } },
        },
      },
      orderBy: { startsAt: 'desc' },
    });

    const windowResults = await Promise.all(windows.map(async (w) => {
      const durationMs = w.endsAt.getTime() - w.startsAt.getTime();
      const durationMinutes = Math.round(durationMs / 60000);
      const monitorIds = w.monitors.map(m => m.monitor.id);
      const monitorNames = w.monitors.map(m => m.monitor.name);

      // Baseline: same duration period immediately before the window
      const baselineEnd = w.startsAt;
      const baselineStart = new Date(w.startsAt.getTime() - durationMs);

      const monitorFilter = monitorIds.length > 0
        ? { monitorId: { in: monitorIds } }
        : { monitor: { userId } };

      const [windowRuns, baselineRuns] = await Promise.all([
        this.prisma.monitorRun.findMany({
          where: { ...monitorFilter, checkedAt: { gte: w.startsAt, lte: w.endsAt } },
          select: { ok: true, checkedAt: true },
        }),
        this.prisma.monitorRun.findMany({
          where: { ...monitorFilter, checkedAt: { gte: baselineStart, lte: baselineEnd } },
          select: { ok: true },
        }),
      ]);

      const checksInWindow = windowRuns.length;
      const failuresInWindow = windowRuns.filter(r => !r.ok).length;
      const windowFailurePct = checksInWindow > 0
        ? Math.round((failuresInWindow / checksInWindow) * 100)
        : 0;

      const checksInBaseline = baselineRuns.length;
      const failuresInBaseline = baselineRuns.filter(r => !r.ok).length;
      const baselineFailurePct = checksInBaseline > 0
        ? Math.round((failuresInBaseline / checksInBaseline) * 100)
        : 0;

      // Suppressed alerts = failures during window that would have fired if not in maintenance
      const suppressedAlerts = failuresInWindow;

      // Recovery detection: first ok run after window ends within 30 minutes
      const recoveryRuns = await this.prisma.monitorRun.findMany({
        where: {
          ...monitorFilter,
          checkedAt: { gte: w.endsAt, lte: new Date(w.endsAt.getTime() + 30 * 60 * 1000) },
          ok: true,
        },
        orderBy: { checkedAt: 'asc' },
        take: 1,
      });

      const recoveredAfterMinutes = recoveryRuns.length > 0
        ? Math.round((recoveryRuns[0].checkedAt.getTime() - w.endsAt.getTime()) / 60000)
        : null;

      // Status: effective = reduced failures; over-active = no failures in baseline (window unnecessary); no-data = no checks
      let status: 'effective' | 'over-active' | 'no-data';
      if (checksInWindow === 0 && checksInBaseline === 0) {
        status = 'no-data';
      } else if (baselineFailurePct === 0 && failuresInWindow === 0) {
        status = 'over-active';
      } else {
        status = 'effective';
      }

      return {
        id: w.id,
        name: w.name,
        description: w.description ?? null,
        startsAt: w.startsAt.toISOString(),
        endsAt: w.endsAt.toISOString(),
        durationMinutes,
        monitorIds,
        monitorNames,
        checksInWindow,
        failuresInWindow,
        windowFailurePct,
        checksInBaseline,
        failuresInBaseline,
        baselineFailurePct,
        suppressedAlerts,
        recoveredAfterMinutes,
        status,
      };
    }));

    const totalWindows = windowResults.length;
    const avgDurationMinutes = totalWindows > 0
      ? Math.round(windowResults.reduce((a, b) => a + b.durationMinutes, 0) / totalWindows)
      : 0;
    const totalSuppressedAlerts = windowResults.reduce((a, b) => a + b.suppressedAlerts, 0);
    const withData = windowResults.filter(w => w.status !== 'no-data');
    const avgBaselineFailurePct = withData.length > 0
      ? Math.round(withData.reduce((a, b) => a + b.baselineFailurePct, 0) / withData.length)
      : 0;
    const avgWindowFailurePct = withData.length > 0
      ? Math.round(withData.reduce((a, b) => a + b.windowFailurePct, 0) / withData.length)
      : 0;
    const noiseReductionPct = avgBaselineFailurePct > 0
      ? Math.round(((avgBaselineFailurePct - avgWindowFailurePct) / avgBaselineFailurePct) * 100)
      : 0;

    return {
      period: { days: clampedDays, since: since.toISOString().slice(0, 10) },
      summary: {
        totalWindows,
        avgDurationMinutes,
        totalSuppressedAlerts,
        avgBaselineFailurePct,
        avgWindowFailurePct,
        noiseReductionPct,
      },
      windows: windowResults,
    };
  }
}
