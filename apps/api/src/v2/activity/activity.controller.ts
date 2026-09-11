import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { PrismaService } from '../../common/prisma.service';
import { V2ListActivityQuery } from './activity.dto';
import {
  AuthenticatedRequest,
  PaginatedEnvelope,
  parsePagination,
  buildMeta,
} from '../v2.types';

/**
 * V2 Activity Controller
 *
 * Improvements over v1 GET /v1/auth/audit-log:
 * - Paginated response with meta.total / meta.pages (v1 returns last 100 flat)
 * - Filter by action prefix (e.g. "auth", "monitor", "alert")
 * - Date-range filtering via `since` and `until` ISO 8601 timestamps
 * - Sort direction control (asc/desc)
 * - Each entry includes a structured `meta` payload (parsed from JSON)
 */
@ApiTags('Activity v2')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/activity')
export class V2ActivityController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List audit log entries for the authenticated user, paginated.
   *
   * Returns events where `actorUserId` matches the authenticated user.
   * Results are sorted by `createdAt` (newest first by default).
   */
  @Get()
  @ApiOperation({
    summary: 'List activity log (paginated)',
    description:
      'Returns paginated audit log entries for the authenticated user. ' +
      'Supports filtering by action prefix (e.g. "auth", "monitor", "alert") ' +
      'and date-range filtering via `since`/`until`. ' +
      'Response envelope: `{ data: ActivityEntry[], meta: { total, page, limit, pages } }`.',
  })
  @ApiResponse({ status: 200, description: 'Paginated activity log returned.' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: V2ListActivityQuery,
  ): Promise<PaginatedEnvelope<unknown>> {
    const { page, limit, skip } = parsePagination(query, 100, 50);
    const sortDir = query.sortDir ?? 'desc';

    // Build where clause
    const where: Record<string, unknown> = { actorUserId: req.user.id };

    if (query.action) {
      where.action = { startsWith: query.action, mode: 'insensitive' };
    }

    if (query.since || query.until) {
      const createdAt: Record<string, Date> = {};
      if (query.since) createdAt.gte = new Date(query.since);
      if (query.until) createdAt.lte = new Date(query.until);
      where.createdAt = createdAt;
    }

    const [entries, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: sortDir },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const data = entries.map((e) => ({
      id: e.id,
      action: e.action,
      meta: (e.metaJson as Record<string, unknown> | null) ?? {},
      createdAt: e.createdAt.toISOString(),
    }));

    return { data, meta: buildMeta(total, page, limit) };
  }
}
