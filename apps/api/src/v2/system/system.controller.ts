import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('../../../package.json') as { version: string; name: string };

/**
 * V2 System Controller
 *
 * Provides enhanced system/metadata endpoints for the v2 API surface.
 * These supplement (do not replace) the v1 health endpoints.
 */
@ApiTags('System v2')
@Controller('v2/system')
export class V2SystemController {
  /**
   * Extended API metadata — useful for clients to discover capabilities,
   * supported versions, deprecation notices, and contact info.
   */
  @Get('info')
  @ApiOperation({
    summary: 'Extended API info',
    description:
      'Returns structured metadata about the API: supported versions, current version, ' +
      'deprecation notices, changelog URL, and contact information.',
  })
  @ApiResponse({ status: 200, description: 'API metadata returned.' })
  info() {
    return {
      service: 'pulsedock-api',
      version: pkg.version,
      apiVersions: {
        supported: ['v1', 'v2'],
        current: 'v2',
        stable: 'v1',
        deprecated: [] as string[],
      },
      features: {
        v1: [
          'monitors CRUD',
          'alerts',
          'auth (JWT + API keys)',
          'dashboard',
          'public status pages',
          'WebSocket real-time updates',
          'plugin system',
        ],
        v2: [
          'paginated monitor listing with filtering + sorting',
          'paginated alert channels with usage counts',
          'paginated check history with date-range + level filters',
          'paginated incidents with status/severity filtering',
          'paginated deployments with service/environment/status filtering',
          'paginated status pages with subscriberCount + widgetCount',
          'paginated tags with monitorCount, sortable by monitorCount',
          'paginated flat folders with depth, path, stats',
          'envelope response format { data, meta }',
          'extended API info endpoint',
          'version compatibility matrix',
        ],
      },
      breakingChangePolicy: {
        deprecationNoticeDays: 180,
        sunsetAfterDays: 365,
        changelogUrl: 'https://github.com/No749ah/PulseDock/blob/main/CHANGELOG.md',
      },
      links: {
        docs: '/docs',
        health: '/health',
        changelog: 'https://github.com/No749ah/PulseDock/blob/main/CHANGELOG.md',
        github: 'https://github.com/No749ah/PulseDock',
      },
    };
  }

  /**
   * Version compatibility matrix — clients can use this to understand
   * which API version introduced which features.
   */
  @Get('versions')
  @ApiOperation({
    summary: 'API version compatibility matrix',
    description:
      'Returns the version compatibility matrix for all supported API versions, ' +
      'including added features, breaking changes, and sunset dates.',
  })
  @ApiResponse({ status: 200, description: 'Version matrix returned.' })
  versions() {
    return {
      versions: [
        {
          version: 'v1',
          status: 'stable',
          introducedIn: '0.1.0',
          sunsetDate: null,
          breaking: false,
          features: [
            'monitors CRUD',
            'alerts management',
            'auth (cookie + bearer + API keys)',
            'dashboard stats',
            'public status pages',
            'WebSocket real-time',
            'plugin system',
          ],
          notes: 'v1 is the stable production API. No breaking changes planned.',
        },
        {
          version: 'v2',
          status: 'stable',
          introducedIn: pkg.version,
          sunsetDate: null,
          breaking: false,
          features: [
            'paginated monitor listing (page, limit, sortBy, sortDir, type, enabled, search)',
            'paginated alert channels with usedByCount + config (secrets redacted)',
            'paginated check history with date-range + level filters',
            'paginated incidents with status/severity/search/sort',
            'paginated deployments with service/environment/status filters',
            'paginated status pages with subscriberCount + widgetCount',
            'paginated tags with monitorCount, in-memory monitorCount sort',
            'paginated flat folders with depth, path, stats (healthy/degraded/down)',
            'envelope response format { data, meta }',
            'extended system info endpoint',
            'version compatibility matrix',
          ],
          notes:
            'v2 adds pagination and envelope format. v1 endpoints remain available and unmodified.',
        },
      ],
    };
  }
}
