import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  TOOL_REGISTRY,
  searchTools,
  TOOL_CATEGORIES,
  getToolById,
  getToolVariants,
} from '../../../../packages/tool-registry/src';

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
  @ApiQuery({ name: 'q', required: false, description: 'Search query (name, description, tags, aliases)' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'withVariants', required: false, description: 'Include variants in each entry (default: false)' })
  @ApiResponse({ status: 200, description: 'Tool list returned.' })
  list(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('withVariants') withVariants?: string,
  ) {
    const tools = q || category ? searchTools(q ?? '', category) : this.registry;
    const includeVariants = withVariants === 'true' || withVariants === '1';

    return {
      total: tools.length,
      categories: this.categories,
      tools: includeVariants
        ? tools.map((t) => ({ ...t, variants: getToolVariants(t.id) }))
        : tools,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get tool by ID',
    description: 'Returns a single tool registry entry including its platform variants.',
  })
  @ApiParam({ name: 'id', description: 'Tool registry ID (e.g. grafana, prometheus, gitlab-ce)' })
  @ApiResponse({ status: 200, description: 'Tool entry returned.' })
  @ApiResponse({ status: 404, description: 'Tool not found.' })
  getById(@Param('id') id: string) {
    const tool = getToolById(id);
    if (!tool) throw new NotFoundException(`Tool '${id}' not found in registry`);
    const variants = getToolVariants(id);
    return { ...tool, variants };
  }

  @Get(':id/variants')
  @ApiOperation({
    summary: 'Get platform variants for a tool',
    description:
      'Returns the list of platform/edition variants for a tool (e.g. OSS/EE/Cloud, Docker/Kubernetes). ' +
      'Use this to populate a Platform selector in the setup UI. Returns empty array if no variants defined.',
  })
  @ApiParam({ name: 'id', description: 'Tool registry ID' })
  @ApiResponse({ status: 200, description: 'Variants returned (may be empty array).' })
  @ApiResponse({ status: 404, description: 'Tool not found.' })
  getVariants(@Param('id') id: string) {
    const tool = getToolById(id);
    if (!tool) throw new NotFoundException(`Tool '${id}' not found in registry`);
    const variants = getToolVariants(id);
    return {
      toolId: id,
      toolName: tool.name,
      hasVariants: variants.length > 0,
      variants,
    };
  }
}
