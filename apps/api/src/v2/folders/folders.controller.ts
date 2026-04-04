import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { PrismaService } from '../../common/prisma.service';
import { V2ListFoldersQuery } from './folders.dto';
import {
  AuthenticatedRequest,
  PaginatedEnvelope,
  parsePagination,
  buildMeta,
} from '../v2.types';

/**
 * V2 Folders Controller
 *
 * Improvements over v1 GET /v1/folders (which returns a nested tree):
 * - Flat paginated response — easier to consume for API clients and tooling
 * - Pagination with meta (total, pages)
 * - Full-text search on folder name
 * - Filter by parentId (or "root" to list only top-level folders)
 * - Sort by name, createdAt, position, or monitorCount
 * - Each folder includes depth (0 = root), path (ancestor names), monitorCount, and stats summary
 */
@ApiTags('Folders v2')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/folders')
export class V2FoldersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'List folders (flat, paginated)',
    description:
      'Returns a flat paginated list of folders for the authenticated user. ' +
      'Unlike v1 which returns a nested tree, v2 returns a flat list with depth + path fields. ' +
      'Each folder includes monitorCount and a stats summary (healthy/degraded/down counts). ' +
      'Supports filtering by parentId (pass "root" for top-level only), full-text search, and sorting. ' +
      'Response envelope: `{ data: Folder[], meta: { total, page, limit, pages } }`.',
  })
  @ApiResponse({ status: 200, description: 'Paginated folder list returned.' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: V2ListFoldersQuery,
  ): Promise<PaginatedEnvelope<unknown>> {
    const { page, limit, skip } = parsePagination(query, 200, 50);
    const sortBy = query.sortBy ?? 'name';
    const sortDir = query.sortDir ?? 'asc';

    // Build where clause
    const where: Record<string, unknown> = { userId: req.user.id };
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }
    if (query.parentId === 'root') {
      where.parentId = null;
    } else if (query.parentId) {
      where.parentId = query.parentId;
    }

    // monitorCount sort requires post-sort (Prisma can't sort by _count directly)
    const dbOrderBy: Record<string, unknown> =
      sortBy === 'monitorCount' ? { name: 'asc' } : { [sortBy]: sortDir };

    // Fetch all matching folders with monitor counts + latest run data
    const [allFolders, total] = await Promise.all([
      this.prisma.folder.findMany({
        where,
        orderBy: dbOrderBy,
        // For monitorCount sort we do in-memory sort + slice
        ...(sortBy !== 'monitorCount' ? { skip, take: limit } : {}),
        include: {
          _count: { select: { monitors: true } },
          monitors: {
            take: 500, // sample for stats — avoids loading unbounded runs
            select: {
              enabled: true,
              runs: {
                orderBy: { checkedAt: 'desc' },
                take: 1,
                select: { ok: true, level: true },
              },
            },
          },
        },
      }),
      this.prisma.folder.count({ where }),
    ]);

    // Build ancestor path for each folder (depth + path names)
    // We need the full ancestor chain; fetch all user folders for path resolution
    const allUserFolders = await this.prisma.folder.findMany({
      where: { userId: req.user.id },
      select: { id: true, parentId: true, name: true },
    });
    const folderMap = new Map(allUserFolders.map((f) => [f.id, f]));

    function buildPath(folderId: string | null): string[] {
      const path: string[] = [];
      let current = folderId;
      let depth = 0;
      while (current && depth < 10) {
        const node = folderMap.get(current);
        if (!node) break;
        path.unshift(node.name);
        current = node.parentId;
        depth++;
      }
      return path;
    }

    function getDepth(folderId: string | null): number {
      let depth = 0;
      let current = folderId;
      while (current) {
        const node = folderMap.get(current);
        if (!node || !node.parentId) break;
        current = node.parentId;
        depth++;
      }
      return depth;
    }

    // Map to response shape
    type FolderRow = (typeof allFolders)[number];
    let mapped = allFolders.map((f: FolderRow) => {
      // Compute stats from sampled monitors
      let healthy = 0;
      let degraded = 0;
      let down = 0;

      for (const m of f.monitors) {
        if (!m.enabled) continue;
        const latestRun = m.runs[0];
        if (!latestRun) continue;
        if (latestRun.level === 'red' || !latestRun.ok) down++;
        else if (latestRun.level === 'yellow') degraded++;
        else healthy++;
      }

      const monitorCount = f._count.monitors;
      const path = buildPath(f.parentId);
      const depth = f.parentId ? getDepth(f.id) : 0;

      return {
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        position: f.position,
        depth,
        path,
        monitorCount,
        stats: {
          healthy,
          degraded,
          down,
          overallStatus:
            down > 0
              ? 'outage'
              : degraded > 0
                ? 'degraded'
                : monitorCount === 0
                  ? 'empty'
                  : 'operational',
        },
        createdAt: f.createdAt.toISOString(),
      };
    });

    // In-memory sort + slice for monitorCount
    if (sortBy === 'monitorCount') {
      mapped = mapped.sort((a, b) =>
        sortDir === 'asc' ? a.monitorCount - b.monitorCount : b.monitorCount - a.monitorCount,
      );
      mapped = mapped.slice(skip, skip + limit);
    }

    return { data: mapped, meta: buildMeta(total, page, limit) };
  }
}
