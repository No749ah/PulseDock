import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { PrismaService } from '../../common/prisma.service';
import { V2ListDeploymentsQuery } from './deployments.dto';
import {
  AuthenticatedRequest,
  PaginatedEnvelope,
  parsePagination,
  buildMeta,
} from '../v2.types';

/**
 * V2 Deployments Controller
 *
 * Improvements over v1 GET /v1/deployments:
 * - Paginated response with meta.total / meta.pages
 * - Filter by service, environment, and status
 * - Full-text search across service, version, and commitMessage
 * - Sort by createdAt, service, environment, or status
 * - Response includes monitorCount (number of linked monitors)
 */
@ApiTags('Deployments v2')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/deployments')
export class V2DeploymentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'List deployment events (paginated)',
    description:
      'Returns deployment events for the authenticated user with pagination, filtering, and sorting. ' +
      'Supports filtering by service, environment, and status, plus full-text search. ' +
      'Response envelope: `{ data: DeploymentEvent[], meta: { total, page, limit, pages } }`.',
  })
  @ApiResponse({ status: 200, description: 'Paginated deployment event list returned.' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: V2ListDeploymentsQuery,
  ): Promise<PaginatedEnvelope<unknown>> {
    const { page, limit, skip } = parsePagination(query, 200, 20);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDir ?? 'desc';

    const where: Record<string, unknown> = { userId: req.user.id };
    if (query.service) where.service = query.service;
    if (query.environment) where.environment = query.environment;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { service: { contains: query.search, mode: 'insensitive' } },
        { version: { contains: query.search, mode: 'insensitive' } },
        { commitMessage: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [events, total] = await Promise.all([
      this.prisma.deploymentEvent.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip,
        take: limit,
      }),
      this.prisma.deploymentEvent.count({ where }),
    ]);

    const data = events.map((e) => ({
      id: e.id,
      service: e.service,
      environment: e.environment,
      version: e.version ?? null,
      status: e.status,
      deployedBy: e.deployedBy ?? null,
      commitSha: e.commitSha ?? null,
      commitMessage: e.commitMessage ?? null,
      branch: e.branch ?? null,
      sourceUrl: e.sourceUrl ?? null,
      durationMs: e.durationMs ?? null,
      suppressAlerts: e.suppressAlerts,
      monitorCount: e.monitorIds.length,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    }));

    return { data, meta: buildMeta(total, page, limit) };
  }
}
