import { Controller, Get, Param, Query, Req, UseGuards, NotFoundException } from '@nestjs/common';
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
   * Fleet summary — counts by status (enabled/disabled/total) and type breakdown.
   * Useful for dashboard widgets and health indicators.
   */
  @Get('summary')
  @ApiOperation({
    summary: 'Monitor fleet summary',
    description:
      'Returns aggregate counts for the authenticated user\'s monitors: ' +
      'total, enabled, disabled, and a breakdown by monitor type.',
  })
  @ApiResponse({ status: 200, description: 'Fleet summary returned.' })
  async summary(@Req() req: AuthenticatedRequest): Promise<{
    total: number;
    enabled: number;
    disabled: number;
    byType: Record<string, number>;
  }> {
    const userId = req.user.id;

    const [total, enabled, byTypeRows] = await Promise.all([
      this.prisma.monitor.count({ where: { userId } }),
      this.prisma.monitor.count({ where: { userId, enabled: true } }),
      this.prisma.monitor.groupBy({
        by: ['type'],
        where: { userId },
        _count: { type: true },
      }),
    ]);

    const byType: Record<string, number> = {};
    for (const row of byTypeRows) {
      byType[row.type] = row._count.type;
    }

    return { total, enabled, disabled: total - enabled, byType };
  }

  /**
   * Get a single monitor by ID.
   *
   * Returns the same shape as list items including alertChannelIds.
   * Returns 404 if the monitor does not exist or belongs to another user.
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get monitor by ID',
    description:
      'Returns a single monitor by its ID for the authenticated user. ' +
      'Sensitive config fields (token, appToken) are redacted. ' +
      'Returns 404 if not found or access is denied.',
  })
  @ApiResponse({ status: 200, description: 'Monitor returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async getOne(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<unknown> {
    const m = await this.prisma.monitor.findFirst({
      where: { id, userId: req.user.id },
      include: { monitorAlerts: true },
    });

    if (!m) throw new NotFoundException('Monitor not found');

    const config = { ...(m.configJson as Record<string, unknown> | null) ?? {} };
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
  }

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
