import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { PrismaService } from '../../common/prisma.service';
import { V2ListApiKeysQuery } from './api-keys.dto';
import {
  AuthenticatedRequest,
  PaginatedEnvelope,
  parsePagination,
  buildMeta,
} from '../v2.types';

/**
 * V2 API Keys Controller
 *
 * Improvements over v1 GET /v1/api-keys:
 * - Paginated response with meta.total / meta.pages (v1 returns flat array)
 * - Filter by scope (READ/WRITE/ADMIN)
 * - Filter by status (active/expired)
 * - Search by name (case-insensitive prefix)
 * - Sort by name, createdAt, lastUsedAt, usageCount
 * - Each entry includes computed `isExpired` flag and `daysSinceLastUsed`
 */
@ApiTags('API Keys v2')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/api-keys')
export class V2ApiKeysController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List API keys for the authenticated user, paginated.
   *
   * Key hashes are never exposed — only metadata.
   * Includes computed `isExpired` and `daysSinceLastUsed` fields.
   */
  @Get()
  @ApiOperation({
    summary: 'List API keys (paginated)',
    description:
      'Returns paginated API keys for the authenticated user. ' +
      'Key hashes are never exposed — only metadata (name, scope, prefix, usage). ' +
      'Supports filtering by scope and expiry status, and sorting by multiple fields. ' +
      'Response envelope: `{ data: ApiKeyEntry[], meta: { total, page, limit, pages } }`.',
  })
  @ApiResponse({ status: 200, description: 'Paginated API keys returned.' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: V2ListApiKeysQuery,
  ): Promise<PaginatedEnvelope<unknown>> {
    const { page, limit, skip } = parsePagination(query, 100, 20);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDir ?? 'desc';
    const now = new Date();

    // Build where clause
    const where: Record<string, unknown> = { userId: req.user.id };

    if (query.scope) {
      where.scope = query.scope;
    }

    if (query.status === 'expired') {
      where.expiresAt = { lt: now };
    } else if (query.status === 'active') {
      // Active = not expired: expiresAt is null OR expiresAt >= now
      // Prisma supports OR at the query level
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gte: now } },
      ];
    }

    if (query.search) {
      where.name = { startsWith: query.search, mode: 'insensitive' };
    }

    // Build orderBy (usageCount needs in-memory sort; others are DB-native)
    const dbSortField = sortBy === 'usageCount' ? 'createdAt' : sortBy;
    const orderBy: Record<string, string> = { [dbSortField]: sortDir };

    const [keys, total] = await Promise.all([
      this.prisma.apiKey.findMany({
        where,
        orderBy,
        skip: sortBy === 'usageCount' ? 0 : skip,
        take: sortBy === 'usageCount' ? undefined : limit,
        select: {
          id: true,
          name: true,
          prefix: true,
          scope: true,
          usageCount: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
      this.prisma.apiKey.count({ where }),
    ]);

    // In-memory sort + paginate for usageCount (derived field)
    let sortedKeys = keys;
    if (sortBy === 'usageCount') {
      sortedKeys = [...keys].sort((a, b) =>
        sortDir === 'asc' ? a.usageCount - b.usageCount : b.usageCount - a.usageCount,
      );
      sortedKeys = sortedKeys.slice(skip, skip + limit);
    }

    const data = sortedKeys.map((k) => {
      const isExpired = k.expiresAt !== null && k.expiresAt < now;
      const daysSinceLastUsed =
        k.lastUsedAt !== null
          ? Math.floor((now.getTime() - k.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24))
          : null;

      return {
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        scope: k.scope,
        usageCount: k.usageCount,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        expiresAt: k.expiresAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
        isExpired,
        daysSinceLastUsed,
      };
    });

    return { data, meta: buildMeta(total, page, limit) };
  }
}
