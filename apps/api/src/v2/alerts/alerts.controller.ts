import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { PrismaService } from '../../common/prisma.service';
import { V2ListAlertChannelsQuery } from './alerts.dto';

interface AuthenticatedRequest {
  user: { id: string };
}

/** Envelope for paginated list responses in v2 */
interface PaginatedEnvelope<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

/**
 * V2 Alert Channels Controller
 *
 * Improvements over v1:
 * - Paginated response with meta.total / meta.pages
 * - Filter by type, full-text search on name
 * - Sort by name, createdAt, or type
 * - Each channel includes a usedByCount (number of monitors using it)
 */
@ApiTags('Alerts v2')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/alert-channels')
export class V2AlertsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'List alert channels (paginated)',
    description:
      'Returns alert channels for the authenticated user with pagination, filtering, and sorting. ' +
      'Each channel includes `usedByCount` — how many monitors reference it. ' +
      'Response envelope: `{ data: AlertChannel[], meta: { total, page, limit, pages } }`.',
  })
  @ApiResponse({ status: 200, description: 'Paginated alert channel list returned.' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: V2ListAlertChannelsQuery,
  ): Promise<PaginatedEnvelope<unknown>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDir ?? 'desc';

    const where: Record<string, unknown> = { userId: req.user.id };
    if (query.type) where.type = query.type;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [channels, total] = await Promise.all([
      this.prisma.alertChannel.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip,
        take: limit,
        include: {
          monitorAlerts: {
            select: { monitorId: true },
          },
        },
      }),
      this.prisma.alertChannel.count({ where }),
    ]);

    const data = channels.map((c) => {
      // Redact secrets from config
      const config = { ...(c.configJson as Record<string, unknown> | null) ?? {} };
      if (typeof config.botToken === 'string') config.botToken = '[redacted]';
      if (typeof config.webhookUrl === 'string') {
        // Keep the domain but redact any token/key in the URL path
        try {
          const u = new URL(config.webhookUrl);
          config.webhookUrl = `${u.protocol}//${u.hostname}/[redacted]`;
        } catch {
          config.webhookUrl = '[redacted]';
        }
      }

      return {
        id: c.id,
        name: c.name,
        type: c.type,
        config,
        usedByCount: c.monitorAlerts.length,
        createdAt: c.createdAt.toISOString(),
      };
    });

    return {
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }
}
