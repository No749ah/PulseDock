/**
 * V2 Playbooks Controller
 *
 * Improvements over v1 GET /v1/playbooks:
 * - Paginated flat response envelope { data, meta }
 * - sortBy: name | createdAt | updatedAt | stepCount | monitorCount
 * - sortDir: asc | desc
 * - search: case-insensitive name/description substring match
 * - severity: filter by forSeverities array membership
 * - Each item includes derived `stepCount` and `monitorCount` fields
 */
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { PrismaService } from '../../common/prisma.service';
import { V2ListPlaybooksQuery } from './playbooks.dto';
import { AuthenticatedRequest, PaginatedEnvelope, buildMeta } from '../v2.types';

export interface V2PlaybookItem {
  id: string;
  name: string;
  description: string | null;
  steps: unknown[];
  forSeverities: string[];
  stepCount: number;
  monitorCount: number;
  createdAt: string;
  updatedAt: string;
}

@ApiTags('Playbooks v2')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/playbooks')
export class V2PlaybooksController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated list of incident playbooks with derived stepCount + monitorCount.
   *
   * Supports:
   *  - search (case-insensitive name/description substring)
   *  - severity filter (forSeverities array member)
   *  - sortBy: name | createdAt | updatedAt | stepCount | monitorCount
   *  - sortDir: asc | desc
   *  - pagination: page / limit (max 100)
   */
  @Get()
  @ApiOperation({
    summary: 'List incident playbooks (paginated, v2)',
    description:
      'Returns a paginated list of incident playbooks for the authenticated user. ' +
      'Each item includes derived `stepCount` (length of the steps array) and ' +
      '`monitorCount` (number of monitors using this playbook). ' +
      'Supports search (name/description), severity filter, and sortBy: ' +
      'name, createdAt, updatedAt, stepCount (in-memory), monitorCount (in-memory).',
  })
  @ApiResponse({ status: 200, description: 'Paginated playbook list returned.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: V2ListPlaybooksQuery,
  ): Promise<PaginatedEnvelope<V2PlaybookItem>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const sortBy = query.sortBy ?? 'updatedAt';
    const sortDir = query.sortDir ?? 'desc';

    // Build Prisma where clause
    const search = query.search?.trim();
    const searchFilter = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const where = {
      userId: req.user.id,
      ...searchFilter,
    };

    // Fetch all matching playbooks (we need all for in-memory sorts and severity filter)
    const all = await this.prisma.incidentPlaybook.findMany({
      where,
      include: { _count: { select: { monitors: true } } },
    });

    // Map to V2PlaybookItem with derived fields
    let items: V2PlaybookItem[] = all.map(pb => ({
      id: pb.id,
      name: pb.name,
      description: pb.description ?? null,
      steps: Array.isArray(pb.steps) ? (pb.steps as unknown[]) : [],
      forSeverities: pb.forSeverities as string[],
      stepCount: Array.isArray(pb.steps) ? (pb.steps as unknown[]).length : 0,
      monitorCount: pb._count.monitors,
      createdAt: pb.createdAt.toISOString(),
      updatedAt: pb.updatedAt.toISOString(),
    }));

    // Apply severity filter (in-memory, forSeverities is a JSON array)
    if (query.severity) {
      const sev = query.severity.toUpperCase();
      items = items.filter(pb => pb.forSeverities.map(s => s.toUpperCase()).includes(sev));
    }

    // Sort
    items.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'createdAt':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case 'stepCount':
          cmp = a.stepCount - b.stepCount;
          break;
        case 'monitorCount':
          cmp = a.monitorCount - b.monitorCount;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    const total = items.length;
    const skip = (page - 1) * limit;
    const data = items.slice(skip, skip + limit);

    return { data, meta: buildMeta(total, page, limit) };
  }
}
