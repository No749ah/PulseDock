import { Body, Controller, Get, HttpCode, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { RequireScope } from '../common/require-scope.decorator';
import { ScopeGuard } from '../common/scope.guard';
import { ApiKeyScope } from '../apikeys/apikeys.dto';
import { MonitorsExportService } from './monitors-export.service';
import { ImportExternalDto, ImportFromComposeDto, ImportMonitorsDto } from './monitors.dto';
import { OpenApiImportDto, OpenApiPreviewDto } from './import-openapi.dto';

@ApiTags('Monitors')
@ApiBearerAuth()
@UseGuards(AuthGuard, ScopeGuard)
@Controller('v1/monitors')
export class MonitorsExportController {
  constructor(
    private readonly exportService: MonitorsExportService,
  ) {}

  // ─── Export Config ────────────────────────────────────────────────────

  @Get('export')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Export monitor configurations as JSON or YAML' })
  @ApiQuery({ name: 'format', required: false, description: 'json (default) or yaml' })
  @ApiQuery({ name: 'ids', required: false, description: 'Comma-separated monitor IDs to export (omit = all)' })
  @ApiQuery({ name: 'includeAlertChannels', required: false, description: 'Include alert channel names (default: false)' })
  async exportMonitorsConfig(
    @Req() req: { user: { id: string } },
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('ids') ids?: string,
    @Query('includeAlertChannels') includeAlertChannels?: string,
  ) {
    const result = await this.exportService.exportMonitorsConfig(req.user.id, {
      format: format === 'yaml' ? 'yaml' : 'json',
      ids: ids ? ids.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      includeAlertChannels: includeAlertChannels === 'true',
    });
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(result.content);
  }

  // ─── Import Monitors ──────────────────────────────────────────────────

  @Post('import')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Import monitors',
    description: 'Bulk-creates monitors from a previously exported document. Existing monitors are not modified.',
  })
  @ApiResponse({ status: 200, description: 'Import result returned.' })
  importMonitors(@Req() req: { user: { id: string } }, @Body() body: ImportMonitorsDto) {
    return this.exportService.importMonitors(req.user.id, body.monitors);
  }

  // ─── Import Config ────────────────────────────────────────────────────

  @Post('import-config')
  @HttpCode(200)
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Import monitor configurations from JSON or YAML' })
  @ApiResponse({ status: 200, description: 'Import result returned.' })
  importMonitorsConfig(
    @Req() req: { user: { id: string } },
    @Body() body: { format: string; content: string; dryRun?: boolean; overwriteExisting?: boolean },
  ) {
    return this.exportService.importMonitorsConfig(req.user.id, {
      format: body.format === 'yaml' ? 'yaml' : 'json',
      content: body.content,
      dryRun: body.dryRun ?? false,
      overwriteExisting: body.overwriteExisting ?? false,
    });
  }

  // ─── Import External ──────────────────────────────────────────────────

  @Post('import-external')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Import from external service',
    description: 'Parse and import monitors from an Uptime Robot JSON export, BetterUptime JSON export, or a generic CSV file. Duplicate targets (same URL already monitored) are automatically skipped.',
  })
  @ApiResponse({ status: 200, description: 'Import result with count of imported, skipped, and errors.' })
  importExternal(@Req() req: { user: { id: string } }, @Body() body: ImportExternalDto) {
    return this.exportService.importExternal(req.user.id, body.source, body.payload);
  }

  // ─── Import from Docker Compose ───────────────────────────────────────

  @Post('import-from-compose')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Parse a Docker Compose YAML and suggest monitors',
    description: 'Returns suggested monitors based on service images and port mappings. Does not create monitors.',
  })
  @ApiResponse({ status: 200, description: 'Suggested monitors array' })
  @ApiResponse({ status: 400, description: 'Invalid YAML' })
  importFromCompose(@Req() req: { user: { id: string } }, @Body() body: ImportFromComposeDto) {
    return this.exportService.importFromCompose(body.compose);
  }

  // ─── Import from OpenAPI (Preview) ────────────────────────────────────

  @Post('import-from-openapi/preview')
  @HttpCode(200)
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Preview monitors from OpenAPI/Swagger spec',
    description: 'Parses an OpenAPI 3.x or Swagger 2.x spec and returns monitor suggestions without creating them.',
  })
  @ApiResponse({ status: 200, description: 'Suggestions array returned.' })
  @ApiResponse({ status: 400, description: 'Invalid spec or URL fetch failed.' })
  importFromOpenApiPreview(@Req() req: { user: { id: string } }, @Body() body: OpenApiPreviewDto) {
    return this.exportService.previewFromOpenApi(body);
  }

  // ─── Import from OpenAPI ──────────────────────────────────────────────

  @Post('import-from-openapi')
  @HttpCode(200)
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({
    summary: 'Import monitors from OpenAPI/Swagger spec',
    description: 'Creates monitors for selected paths from an OpenAPI/Swagger spec.',
  })
  @ApiResponse({ status: 200, description: 'Created monitors returned.' })
  @ApiResponse({ status: 400, description: 'Invalid spec or URL fetch failed.' })
  importFromOpenApi(@Req() req: { user: { id: string } }, @Body() body: OpenApiImportDto) {
    return this.exportService.importFromOpenApi(req.user.id, body);
  }
}
