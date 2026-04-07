/**
 * V2 Search Controller
 *
 * Improvements over v1 GET /v1/search:
 * - Paginated flat response envelope { data, meta } instead of per-category arrays
 * - sortBy: relevance | updatedAt | title
 * - sortDir: asc | desc
 * - types filter still supported
 * - meta.total, meta.page, meta.limit, meta.pages
 * - Each item includes `entityType` field for client-side categorization
 */
import { Controller, Get, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { SearchService, type SearchItem } from '../../search/search.service';
import { V2SearchQuery } from './search.dto';
import { AuthenticatedRequest, PaginatedEnvelope, buildMeta } from '../v2.types';

const ALL_TYPES = new Set(['monitors', 'incidents', 'status_pages', 'versions']);

/** V2 search result — identical to SearchItem but with explicit entityType */
export interface V2SearchItem extends SearchItem {
  entityType: 'monitor' | 'incident' | 'status_page' | 'version';
}

@ApiTags('Search v2')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v2/search')
export class V2SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * Paginated global search across monitors, incidents, status pages, and versions.
   *
   * Returns a flat paginated list of results with entity type in each item.
   * Supports sorting by relevance (default), updatedAt, or title.
   */
  @Get()
  @ApiOperation({
    summary: 'Paginated global search (v2)',
    description:
      'Searches monitors, incidents, status pages, and version checks by name/target/title. ' +
      'Returns a flat paginated list sorted by relevance, updatedAt, or title. ' +
      'Response envelope: `{ data: SearchItem[], meta: { total, page, limit, pages } }`.',
  })
  @ApiResponse({ status: 200, description: 'Paginated search results returned.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  async search(
    @Req() req: AuthenticatedRequest,
    @Query() query: V2SearchQuery,
  ): Promise<PaginatedEnvelope<V2SearchItem>> {
    const q = (query.q ?? '').trim();
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const sortBy = query.sortBy ?? 'relevance';
    const sortDir = query.sortDir ?? 'desc';

    // Parse types filter
    let typeSet: Set<string>;
    if (query.types) {
      const requested = new Set(
        query.types
          .split(',')
          .map(t => t.trim().toLowerCase())
          .filter(t => t.length > 0),
      );
      // Validate types
      for (const t of requested) {
        if (!ALL_TYPES.has(t)) {
          throw new BadRequestException(
            `Invalid type: "${t}". Valid types: ${[...ALL_TYPES].join(', ')}`,
          );
        }
      }
      typeSet = requested;
    } else {
      typeSet = ALL_TYPES;
    }

    // Fetch more than needed so we can paginate the flat merged list.
    // We fetch up to page*limit+limit per category to support correct pagination.
    const fetchLimit = page * limit + limit;

    const raw = await this.searchService.search(req.user.id, q, fetchLimit, typeSet);

    // Flatten all categories into a single list with entityType
    const all: V2SearchItem[] = [
      ...raw.monitors.map(item => ({ ...item, entityType: 'monitor' as const })),
      ...raw.incidents.map(item => ({ ...item, entityType: 'incident' as const })),
      ...raw.status_pages.map(item => ({ ...item, entityType: 'status_page' as const })),
      ...raw.versions.map(item => ({ ...item, entityType: 'version' as const })),
    ];

    // Sort
    if (sortBy === 'updatedAt') {
      all.sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return sortDir === 'asc' ? ta - tb : tb - ta;
      });
    } else if (sortBy === 'title') {
      all.sort((a, b) => {
        const cmp = a.title.localeCompare(b.title);
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    // relevance: keep natural order (DB ordering is by relevance/name asc)

    const total = all.length;
    const skip = (page - 1) * limit;
    const data = all.slice(skip, skip + limit);

    return { data, meta: buildMeta(total, page, limit) };
  }
}
