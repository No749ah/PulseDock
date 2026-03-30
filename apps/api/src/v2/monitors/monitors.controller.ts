import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { PrismaService } from '../../common/prisma.service';
import { V2ListMonitorsQuery } from './monitors.dto';
import {
  AuthenticatedRequest,
  PaginatedEnvelope,
  parsePagination,
  buildMeta,
} from '../v2.types';

@ApiTags('Monitors v2')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/monitors')
export class V2MonitorsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List monitors with pagination, filtering, and sorting.
   *
   * Improvements over v1:
   * - Paginated response with `meta.total`, `meta.pages`
   * - Filter by `type` and `enabled`
   * - Sort by `name`, `createdAt`, `type`, or `intervalSec`
   * - Full-text search on `name` and `target`
   */
  @Get()
  @ApiOperation({
    summary: 'List monitors (paginated)',
    description:
      'Returns monitors for the authenticated user with pagination, filtering, and sorting support. ' +
      'Response envelope: `{ data: Monitor[], meta: { total, page, limit, pages } }`.',
  })
  @ApiResponse({ status: 200, description: 'Paginated monitor list returned.' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: V2ListMonitorsQuery,
  ): Promise<PaginatedEnvelope<unknown>> {
    const { page, limit, skip } = parsePagination(query);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDir ?? 'desc';

    // Build Prisma where clause
    const where: Record<string, unknown> = { userId: req.user.id };
    if (query.type) where.type = query.type;
    if (query.enabled !== undefined) where.enabled = query.enabled === 'true';
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { target: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [monitors, total] = await Promise.all([
      this.prisma.monitor.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip,
        take: limit,
        include: { monitorAlerts: true },
      }),
      this.prisma.monitor.count({ where }),
    ]);

    const data = monitors.map((m) => {
      const config = { ...(m.configJson as Record<string, unknown> | null) ?? {} };
      // Redact sensitive fields
      const hasRepoToken = typeof config.token === 'string' && config.token.length > 0;
      const hasAppToken = typeof config.appToken === 'string' && config.appToken.length > 0;
      delete config.token;
      delete config.appToken;
      delete config.openvpnPassword;
      config.hasRepoToken = hasRepoToken;
      config.hasAppToken = hasAppToken;

      return {
        id: m.id,
        name: m.name,
        type: m.type,
        target: m.target,
        enabled: m.enabled,
        intervalSec: m.intervalSec,
        timeoutMs: m.timeoutMs,
        folderId: m.folderId,
        config,
        alertChannelIds: m.monitorAlerts.map((ma) => ma.alertChannelId),
        createdAt: m.createdAt.toISOString(),
      };
    });

    return { data, meta: buildMeta(total, page, limit) };
  }
}
