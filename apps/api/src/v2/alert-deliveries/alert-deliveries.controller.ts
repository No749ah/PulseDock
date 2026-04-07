import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { PrismaService } from '../../common/prisma.service';
import { V2ListAlertDeliveriesQuery } from './alert-deliveries.dto';
import {
  AuthenticatedRequest,
  PaginatedEnvelope,
  parsePagination,
  buildMeta,
} from '../v2.types';

/**
 * V2 Alert Deliveries Controller
 *
 * Provides a paginated, filterable view of alert delivery log entries
 * for the authenticated user. Each entry represents one attempted
 * delivery to an alert channel.
 *
 * Improvements over the v1 delivery log (per-channel only):
 *   - Cross-channel delivery log in one endpoint
 *   - Filter by status (success/failed), channelId, monitorId, date range
 *   - Sort by createdAt, durationMs, or status
 *   - Consistent PaginatedEnvelope shape { data, meta }
 *   - Channel name included in each record
 */
@ApiTags('Alert Deliveries v2')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/alert-deliveries')
export class V2AlertDeliveriesController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List alert delivery log entries for the authenticated user.
   * Joins through alert_channel → user for ownership scoping.
   *
   * @param req   - Authenticated request (user.id)
   * @param query - Filter/sort/pagination options
   * @returns Paginated delivery log entries
   */
  @Get()
  @ApiOperation({
    summary: 'List alert delivery log',
    description:
      'Returns paginated alert delivery log entries for the authenticated user. ' +
      'Filter by status (success/failed), channelId, monitorId, or date range. ' +
      'Sort by createdAt, durationMs, or status.',
  })
  @ApiResponse({ status: 200, description: 'Paginated alert deliveries returned.' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: V2ListAlertDeliveriesQuery,
  ): Promise<PaginatedEnvelope<{
    id: string;
    alertChannelId: string;
    channelName: string;
    channelType: string;
    monitorId: string | null;
    monitorName: string | null;
    status: string;
    trigger: string | null;
    errorMessage: string | null;
    durationMs: number | null;
    isGrouped: boolean;
    groupedCount: number;
    createdAt: string;
  }>> {
    const userId = req.user.id;
    const { page, limit } = parsePagination(query);

    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = (query.sortDir ?? 'desc') as 'asc' | 'desc';

    // Build the where clause for AlertDeliveryLog via channel.userId
    const whereLog: Record<string, unknown> = {
      alertChannel: { userId },
    };

    if (query.status) {
      whereLog['status'] = query.status;
    }
    if (query.channelId) {
      whereLog['alertChannelId'] = query.channelId;
    }
    if (query.monitorId) {
      whereLog['monitorId'] = query.monitorId;
    }
    if (query.since || query.until) {
      const createdAt: Record<string, Date> = {};
      if (query.since) createdAt['gte'] = new Date(query.since);
      if (query.until) createdAt['lte'] = new Date(query.until);
      whereLog['createdAt'] = createdAt;
    }

    // Sort order — durationMs needs null handling (nulls last for asc)
    let orderBy: Record<string, string> | Record<string, unknown>;
    if (sortBy === 'durationMs') {
      orderBy = { durationMs: sortDir };
    } else if (sortBy === 'status') {
      orderBy = { status: sortDir };
    } else {
      orderBy = { createdAt: sortDir };
    }

    const [total, rows] = await Promise.all([
      this.prisma.alertDeliveryLog.count({ where: whereLog }),
      this.prisma.alertDeliveryLog.findMany({
        where: whereLog,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          alertChannel: {
            select: { name: true, type: true },
          },
        },
      }),
    ]);

    const data = rows.map((row) => ({
      id: row.id,
      alertChannelId: row.alertChannelId,
      channelName: row.alertChannel.name,
      channelType: row.alertChannel.type,
      monitorId: row.monitorId,
      monitorName: row.monitorName,
      status: row.status,
      trigger: row.trigger,
      errorMessage: row.errorMessage,
      durationMs: row.durationMs,
      isGrouped: row.isGrouped,
      groupedCount: row.groupedCount,
      createdAt: row.createdAt.toISOString(),
    }));

    return { data, meta: buildMeta(total, page, limit) };
  }
}
