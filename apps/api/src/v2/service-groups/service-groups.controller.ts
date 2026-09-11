import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { PrismaService } from '../../common/prisma.service';
import { V2ListServiceGroupsQuery } from './service-groups.dto';
import {
  AuthenticatedRequest,
  PaginatedEnvelope,
  parsePagination,
  buildMeta,
} from '../v2.types';

/**
 * V2 Service Groups Controller
 *
 * Improvements over v1 GET /v1/service-groups:
 * - Paginated response with meta.total / meta.pages
 * - Full-text search on name and description
 * - Sort by name, createdAt, or monitorCount
 * - Each entry includes derived monitorCount (number of monitors in the group)
 * - Response envelope: { data: ServiceGroup[], meta: { total, page, limit, pages } }
 */
@ApiTags('Service Groups v2')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/service-groups')
export class V2ServiceGroupsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'List service groups (paginated)',
    description:
      'Returns service groups for the authenticated user with pagination, filtering, and sorting. ' +
      'Each entry includes `monitorCount` — the number of monitors in the group. ' +
      'Supports sorting by `monitorCount` to find largest or smallest groups. ' +
      'Response envelope: `{ data: ServiceGroup[], meta: { total, page, limit, pages } }`.',
  })
  @ApiResponse({ status: 200, description: 'Paginated service group list returned.' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: V2ListServiceGroupsQuery,
  ): Promise<PaginatedEnvelope<unknown>> {
    const { page, limit, skip } = parsePagination(query);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDir ?? 'desc';

    const where: Record<string, unknown> = { userId: req.user.id };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // monitorCount sort: monitorIds is a scalar array — sort in memory after fetch
    const useDbSort = sortBy !== 'monitorCount';
    const dbOrderBy: Record<string, unknown> = useDbSort ? { [sortBy]: sortDir } : { createdAt: 'desc' };

    const [groups, total] = await Promise.all([
      this.prisma.monitorServiceGroup.findMany({
        where,
        orderBy: dbOrderBy,
        ...(useDbSort ? { skip, take: limit } : {}),
      }),
      this.prisma.monitorServiceGroup.count({ where }),
    ]);

    // Map to response shape with derived monitorCount
    let mapped = groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description ?? null,
      monitorIds: g.monitorIds,
      monitorCount: g.monitorIds.length,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    }));

    // In-memory sort + paginate for monitorCount
    if (sortBy === 'monitorCount') {
      mapped = mapped.sort((a, b) =>
        sortDir === 'asc' ? a.monitorCount - b.monitorCount : b.monitorCount - a.monitorCount,
      );
      mapped = mapped.slice(skip, skip + limit);
    }

    return {
      data: mapped,
      meta: buildMeta(total, page, limit),
    };
  }
}
