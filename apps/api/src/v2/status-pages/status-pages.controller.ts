import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { PrismaService } from '../../common/prisma.service';
import { V2ListStatusPagesQuery } from './status-pages.dto';
import {
  AuthenticatedRequest,
  PaginatedEnvelope,
  parsePagination,
  buildMeta,
} from '../v2.types';

/**
 * V2 Status Pages Controller
 *
 * Improvements over v1 GET /v1/status-pages:
 * - Paginated response with meta.total / meta.pages
 * - Optional filter by isPublished
 * - Full-text search on title and slug
 * - Sort by createdAt, updatedAt, title, or viewCount
 * - Each entry includes subscriberCount and widgetCount derived fields
 * - Strips sensitive fields (passwordHash, notifyWebhookUrl, etc.)
 */
@ApiTags('Status Pages v2')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/status-pages')
export class V2StatusPagesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'List status pages (paginated)',
    description:
      'Returns status pages for the authenticated user with pagination, filtering, and sorting. ' +
      'Each page includes `subscriberCount` (email subscribers) and `widgetCount` (layout widgets). ' +
      'Response envelope: `{ data: StatusPage[], meta: { total, page, limit, pages } }`.',
  })
  @ApiResponse({ status: 200, description: 'Paginated status page list returned.' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: V2ListStatusPagesQuery,
  ): Promise<PaginatedEnvelope<unknown>> {
    const { page, limit, skip } = parsePagination(query);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDir ?? 'desc';

    const where: Record<string, unknown> = { userId: req.user.id };
    if (query.isPublished !== undefined) where.isPublished = query.isPublished;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [pages, total] = await Promise.all([
      this.prisma.publicStatusPage.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip,
        take: limit,
        include: {
          _count: {
            select: { subscribers: true },
          },
        },
      }),
      this.prisma.publicStatusPage.count({ where }),
    ]);

    const data = pages.map((p) => {
      // Count widgets from layout JSON safely
      let widgetCount = 0;
      try {
        const layout = p.layout as { widgets?: unknown[] } | null;
        widgetCount = Array.isArray(layout?.widgets) ? layout.widgets.length : 0;
      } catch {
        widgetCount = 0;
      }

      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        description: p.description ?? null,
        isPublished: p.isPublished,
        viewCount: p.viewCount,
        lastViewedAt: p.lastViewedAt?.toISOString() ?? null,
        subscriberCount: p._count.subscribers,
        widgetCount,
        hasPassword: p.passwordHash !== null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };
    });

    return { data, meta: buildMeta(total, page, limit) };
  }
}
