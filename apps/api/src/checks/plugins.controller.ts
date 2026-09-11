import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChecksService } from './checks.service';

@ApiTags('Plugins')
@Controller('v1/plugins')
export class PluginsController {
  constructor(private readonly checksService: ChecksService) {}

  /**
   * List all registered check plugins (built-in + external filesystem plugins).
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List check plugins',
    description:
      'Returns all registered monitor check plugins — built-in (http.response-match, http.cert-expiry, etc.) ' +
      'and any externally loaded from the PLUGIN_DIR directory.',
  })
  @ApiResponse({ status: 200, description: 'Plugin list returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  listPlugins() {
    return this.checksService.listPlugins();
  }
}
