/**
 * Global Search API
 * Searches across monitors, incidents, version monitors, and status pages
 * in a single request. Designed for command-palette and quick-find flows.
 */
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SearchService, SearchResultDto } from './search.service';

@ApiTags('Search')
@Controller('v1/search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * Global search across monitors, incidents, status pages, and versions.
   * Returns up to `limit` results per category (default 5, max 20).
   */
  @Get()
  @ApiOperation({
    summary: 'Global search',
    description:
      'Searches monitors, incidents, status pages, and version checks by name/target/title. ' +
      'Returns up to `limit` results per category. Designed for command-palette use.',
  })
  @ApiQuery({ name: 'q', required: true, description: 'Search query (min 2 chars)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results per category (1–20, default 5)' })
  @ApiQuery({
    name: 'types',
    required: false,
    description: 'Comma-separated result types to include: monitors,incidents,status_pages,versions (default: all)',
  })
  @ApiResponse({ status: 200, description: 'Search results returned.' })
  search(
    @Req() req: { user: { id: string } },
    @Query('q') q = '',
    @Query('limit') limitRaw?: string,
    @Query('types') types?: string,
  ): Promise<SearchResultDto> {
    const limit = Math.min(Math.max(parseInt(limitRaw ?? '5', 10) || 5, 1), 20);
    const typeSet = types
      ? new Set(types.split(',').map(t => t.trim().toLowerCase()))
      : new Set(['monitors', 'incidents', 'status_pages', 'versions']);

    return this.searchService.search(req.user.id, q.trim(), limit, typeSet);
  }
}
