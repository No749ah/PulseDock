import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TOOL_REGISTRY, searchTools, TOOL_CATEGORIES } from '../../../../packages/tool-registry/src';

@ApiTags('Tool Registry')
@Controller('v1/tool-registry')
export class ToolRegistryController {
  /** In-memory cache — registry is static at build time */
  private readonly registry = TOOL_REGISTRY;
  private readonly categories = TOOL_CATEGORIES;

  @Get()
  @ApiOperation({
    summary: 'List tool registry',
    description: 'Returns all tool entries (or filtered by search/category). No auth required.',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Search query (name, description, tags)' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiResponse({ status: 200, description: 'Tool list returned.' })
  list(@Query('q') q?: string, @Query('category') category?: string) {
    const tools = q || category ? searchTools(q ?? '', category) : this.registry;
    return {
      total: tools.length,
      categories: this.categories,
      tools,
    };
  }
}
