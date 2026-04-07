import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { PrismaService } from '../../common/prisma.service';
import { isWindowActive } from '../../maintenance/maintenance.service';
import { V2ListMaintenanceQuery } from './maintenance.dto';
import {
  AuthenticatedRequest,
  PaginatedEnvelope,
  parsePagination,
  buildMeta,
} from '../v2.types';

/**
 * V2 Maintenance Controller
 *
 * Improvements over v1 GET /v1/maintenance:
 * - Paginated response with `meta.total`, `meta.pages`
 * - Full-text search on name and description
 * - Filter by recurrence type (NONE, DAILY, WEEKLY, MONTHLY)
 * - Filter to only currently active windows (`activeOnly=true`)
 * - Sort by startsAt, endsAt, createdAt, name, or monitorCount
 * - Each entry includes `monitorCount` and `isActive` computed flag
 */
@ApiTags('Maintenance v2')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/maintenance')
export class V2MaintenanceController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List maintenance windows with pagination, filtering, and sorting.
   *
   * Improvements over v1:
   * - Paginated with `meta.total`, `meta.pages`
   * - Filter by recurrence or active status
   * - Sort by any field including monitorCount
   */
  @Get()
  @ApiOperation({
    summary: 'List maintenance windows (paginated)',
    description:
      'Returns maintenance windows for the authenticated user with pagination, filtering, and sorting. ' +
      'Each entry includes `monitorCount` (number of linked monitors) and `isActive` computed flag. ' +
      'Use `activeOnly=true` to get only windows currently suppressing alerts. ' +
      'Response envelope: `{ data: MaintenanceWindow[], meta: { total, page, limit, pages } }`.',
  })
  @ApiResponse({ status: 200, description: 'Paginated maintenance window list returned.' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: V2ListMaintenanceQuery,
  ): Promise<PaginatedEnvelope<unknown>> {
    const { page, limit, skip } = parsePagination(query);
    const sortBy = query.sortBy ?? 'startsAt';
    const sortDir = query.sortDir ?? 'asc';
    const now = new Date();

    // Build where clause
    const where: Record<string, unknown> = { userId: req.user.id };
    if (query.recurrence) where.recurrence = query.recurrence;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // monitorCount sort requires in-memory handling; activeOnly filter also requires fetching all
    const needsInMemory = sortBy === 'monitorCount' || query.activeOnly === true || query.activeOnly === 'true';

    const dbOrderBy: Record<string, unknown> =
      needsInMemory ? { startsAt: 'asc' } : { [sortBy]: sortDir };

    // Fetch (all or paged depending on whether we need in-memory ops)
    const windows = await this.prisma.maintenanceWindow.findMany({
      where,
      orderBy: dbOrderBy,
      include: {
        monitors: { select: { monitorId: true } },
      },
      ...(needsInMemory ? {} : { skip, take: limit }),
    });

    // Map to response shape
    let mapped = windows.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      startsAt: w.startsAt.toISOString(),
      endsAt: w.endsAt.toISOString(),
      recurrence: w.recurrence,
      recurrenceDays: w.recurrenceDays,
      durationMinutes: w.durationMinutes,
      recurrenceEndsAt: w.recurrenceEndsAt?.toISOString() ?? null,
      monitorIds: w.monitors.map((m) => m.monitorId),
      monitorCount: w.monitors.length,
      isActive: isWindowActive(w, now),
      createdAt: w.createdAt.toISOString(),
    }));

    // Apply activeOnly filter in memory
    if (query.activeOnly === true || query.activeOnly === 'true') {
      mapped = mapped.filter((w) => w.isActive);
    }

    // Apply monitorCount sort in memory
    if (sortBy === 'monitorCount') {
      mapped = mapped.sort((a, b) =>
        sortDir === 'asc' ? a.monitorCount - b.monitorCount : b.monitorCount - a.monitorCount,
      );
    }

    const total = needsInMemory ? mapped.length : await this.prisma.maintenanceWindow.count({ where });

    // Paginate in memory when needed
    if (needsInMemory) {
      mapped = mapped.slice(skip, skip + limit);
    }

    return { data: mapped, meta: buildMeta(total, page, limit) };
  }
}
