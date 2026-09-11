import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { PrismaService } from '../../common/prisma.service';
import { V2ListTagsQuery } from './tags.dto';
import {
  AuthenticatedRequest,
  PaginatedEnvelope,
  parsePagination,
  buildMeta,
} from '../v2.types';

/**
 * V2 Tags Controller
 *
 * Improvements over v1 GET /v1/tags:
 * - Paginated response with meta.total / meta.pages
 * - Full-text search on tag name
 * - Sort by name, createdAt, or monitorCount
 * - Each entry includes monitorCount (number of monitors using this tag)
 */
@ApiTags('Tags v2')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/tags')
export class V2TagsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'List tags (paginated)',
    description:
      'Returns tags for the authenticated user with pagination, filtering, and sorting. ' +
      'Each tag includes `monitorCount` — how many monitors use it. ' +
      'Supports sorting by `monitorCount` to find most-used or least-used tags. ' +
      'Response envelope: `{ data: Tag[], meta: { total, page, limit, pages } }`.',
  })
  @ApiResponse({ status: 200, description: 'Paginated tag list returned.' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: V2ListTagsQuery,
  ): Promise<PaginatedEnvelope<unknown>> {
    const { page, limit, skip } = parsePagination(query);
    const sortBy = query.sortBy ?? 'name';
    const sortDir = query.sortDir ?? 'asc';

    const where: Record<string, unknown> = { userId: req.user.id };
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    // monitorCount sort requires post-sort (Prisma doesn't sort by _count aggregates directly)
    // For other sort fields, use DB-level ordering.
    const dbOrderBy: Record<string, unknown> =
      sortBy === 'monitorCount' ? { name: 'asc' } : { [sortBy]: sortDir };

    const [tags, total] = await Promise.all([
      this.prisma.tag.findMany({
        where,
        orderBy: dbOrderBy,
        // For monitorCount sort we fetch all matching then sort/slice in memory
        ...(sortBy === 'monitorCount' ? {} : { skip, take: limit }),
        include: {
          _count: {
            select: { monitorTags: true },
          },
        },
      }),
      this.prisma.tag.count({ where }),
    ]);

    // Map to response shape
    let mapped = tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      monitorCount: t._count.monitorTags,
      createdAt: t.createdAt.toISOString(),
    }));

    // In-memory sort + slice for monitorCount ordering
    if (sortBy === 'monitorCount') {
      mapped = mapped.sort((a, b) =>
        sortDir === 'asc' ? a.monitorCount - b.monitorCount : b.monitorCount - a.monitorCount,
      );
      mapped = mapped.slice(skip, skip + limit);
    }

    return { data: mapped, meta: buildMeta(total, page, limit) };
  }
}
