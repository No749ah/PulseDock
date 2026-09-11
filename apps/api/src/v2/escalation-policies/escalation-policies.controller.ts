import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { PrismaService } from '../../common/prisma.service';
import { V2ListEscalationPoliciesQuery } from './escalation-policies.dto';
import {
  AuthenticatedRequest,
  PaginatedEnvelope,
  parsePagination,
  buildMeta,
} from '../v2.types';

/**
 * V2 Escalation Policies Controller
 *
 * Improvements over v1 GET /v1/escalation-policies:
 * - Paginated response with meta.total / meta.pages
 * - Full-text search on policy name
 * - Sort by name, createdAt, or stepCount
 * - Each entry includes derived stepCount (number of escalation steps)
 * - Response envelope: { data: EscalationPolicy[], meta: { total, page, limit, pages } }
 */
@ApiTags('Escalation Policies v2')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/escalation-policies')
export class V2EscalationPoliciesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'List escalation policies (paginated)',
    description:
      'Returns escalation policies for the authenticated user with pagination, filtering, and sorting. ' +
      'Each entry includes `stepCount` — the number of escalation steps in the policy. ' +
      'Supports sorting by `stepCount` to find most or least complex policies. ' +
      'Response envelope: `{ data: EscalationPolicy[], meta: { total, page, limit, pages } }`.',
  })
  @ApiResponse({ status: 200, description: 'Paginated escalation policy list returned.' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: V2ListEscalationPoliciesQuery,
  ): Promise<PaginatedEnvelope<unknown>> {
    const { page, limit, skip } = parsePagination(query);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDir ?? 'desc';

    const where: Record<string, unknown> = { userId: req.user.id };
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    // stepCount sort requires in-memory sort (steps is a JSON array)
    const useDbSort = sortBy !== 'stepCount';
    const dbOrderBy: Record<string, unknown> = useDbSort ? { [sortBy]: sortDir } : { createdAt: 'desc' };

    const [policies, total] = await Promise.all([
      this.prisma.escalationPolicy.findMany({
        where,
        orderBy: dbOrderBy,
        ...(useDbSort ? { skip, take: limit } : {}),
      }),
      this.prisma.escalationPolicy.count({ where }),
    ]);

    // Map to response shape with derived stepCount
    let mapped = policies.map((p) => {
      const steps = Array.isArray(p.steps) ? p.steps : [];
      return {
        id: p.id,
        name: p.name,
        steps: p.steps,
        stepCount: steps.length,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };
    });

    // In-memory sort + paginate for stepCount
    if (sortBy === 'stepCount') {
      mapped = mapped.sort((a, b) =>
        sortDir === 'asc' ? a.stepCount - b.stepCount : b.stepCount - a.stepCount,
      );
      mapped = mapped.slice(skip, skip + limit);
    }

    return {
      data: mapped,
      meta: buildMeta(total, page, limit),
    };
  }
}
