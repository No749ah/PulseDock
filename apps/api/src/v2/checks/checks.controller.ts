import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { PrismaService } from '../../common/prisma.service';
import { V2ListChecksQuery } from './checks.dto';
import {
  AuthenticatedRequest,
  PaginatedEnvelope,
  parsePagination,
  buildMeta,
} from '../v2.types';

/**
 * V2 Check History Controller
 *
 * Provides paginated, filterable access to monitor run history.
 * v1 has no equivalent paginated endpoint — `GET /v1/monitors/runs` returns
 * a fixed last-N slice. This v2 endpoint is the authoritative history source.
 *
 * Supports:
 * - Pagination (page + limit, max 200/page)
 * - Per-monitor filtering (`?monitorId=...`)
 * - Level filtering (`?level=red`)
 * - Date-range filtering (`?since=ISO&until=ISO`)
 */
@ApiTags('Checks v2')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/checks')
export class V2ChecksController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Paginated check history',
    description:
      'Returns paginated monitor run history for the authenticated user. ' +
      'Supports per-monitor filtering, level filtering, and date-range queries. ' +
      'Response envelope: `{ data: CheckRun[], meta: { total, page, limit, pages } }`.',
  })
  @ApiResponse({ status: 200, description: 'Paginated check history returned.' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: V2ListChecksQuery,
  ): Promise<PaginatedEnvelope<unknown>> {
    const { page, limit, skip } = parsePagination(query, 200, 50);

    const where: Record<string, unknown> = { userId: req.user.id };
    if (query.monitorId) where.monitorId = query.monitorId;
    if (query.level) where.level = query.level;

    // Date-range filtering
    if (query.since || query.until) {
      const checkedAt: Record<string, unknown> = {};
      if (query.since) checkedAt.gte = new Date(query.since);
      if (query.until) checkedAt.lt = new Date(query.until);
      where.checkedAt = checkedAt;
    }

    const [runs, total] = await Promise.all([
      this.prisma.monitorRun.findMany({
        where,
        orderBy: { checkedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.monitorRun.count({ where }),
    ]);

    const data = runs.map((r) => ({
      id: r.id,
      monitorId: r.monitorId,
      checkedAt: r.checkedAt.toISOString(),
      ok: r.ok,
      statusCode: r.status,
      latencyMs: r.latencyMs,
      message: r.message,
      level: r.level,
    }));

    return { data, meta: buildMeta(total, page, limit) };
  }
}
