import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { PrismaService } from '../../common/prisma.service';
import { V2ListIncidentsQuery } from './incidents.dto';
import {
  AuthenticatedRequest,
  PaginatedEnvelope,
  parsePagination,
  buildMeta,
} from '../v2.types';

/**
 * V2 Incidents Controller
 *
 * Improvements over v1 GET /v1/incidents:
 * - Paginated response with meta.total / meta.pages
 * - Filter by status and severity
 * - Full-text search on title
 * - Sort by createdAt, updatedAt, severity, or status
 * - Includes updateCount and latestUpdateStatus for quick triage
 * - Includes linked monitor count (monitorCount)
 */
@ApiTags('Incidents v2')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/incidents')
export class V2IncidentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'List incidents (paginated)',
    description:
      'Returns incidents for the authenticated user with pagination, filtering, and sorting. ' +
      'Each incident includes updateCount, latestUpdateStatus, and monitorCount. ' +
      'Response envelope: `{ data: Incident[], meta: { total, page, limit, pages } }`.',
  })
  @ApiResponse({ status: 200, description: 'Paginated incident list returned.' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: V2ListIncidentsQuery,
  ): Promise<PaginatedEnvelope<unknown>> {
    const { page, limit, skip } = parsePagination(query, 200, 20);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDir ?? 'desc';

    const where: Record<string, unknown> = { userId: req.user.id };
    if (query.status) where.status = query.status;
    if (query.severity) where.severity = query.severity;
    if (query.search) {
      where.title = { contains: query.search, mode: 'insensitive' };
    }

    const [incidents, total] = await Promise.all([
      this.prisma.incident.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip,
        take: limit,
        include: {
          updates: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { status: true, createdAt: true },
          },
          monitors: {
            select: { monitorId: true },
          },
          _count: { select: { updates: true } },
        },
      }),
      this.prisma.incident.count({ where }),
    ]);

    const data = incidents.map((inc) => ({
      id: inc.id,
      title: inc.title,
      status: inc.status,
      severity: inc.severity,
      autoCreated: inc.autoCreated,
      resolvedAt: inc.resolvedAt?.toISOString() ?? null,
      createdAt: inc.createdAt.toISOString(),
      updatedAt: inc.updatedAt.toISOString(),
      updateCount: inc._count.updates,
      latestUpdateStatus: inc.updates[0]?.status ?? null,
      latestUpdateAt: inc.updates[0]?.createdAt.toISOString() ?? null,
      monitorCount: inc.monitors.length,
    }));

    return { data, meta: buildMeta(total, page, limit) };
  }
}
