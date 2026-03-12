import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MetricsService } from './common/metrics.service';

const pkg = require('../package.json');

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check', description: 'Returns service health status.' })
  @ApiResponse({ status: 200, description: 'Service is healthy.' })
  health() {
    return { ok: true, service: 'pulsedock-api', runtime: 'nestjs' };
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Metrics snapshot', description: 'Returns runtime request/error counters.' })
  @ApiResponse({ status: 200, description: 'Metrics snapshot returned.' })
  metricsSnapshot() {
    return this.metrics.snapshot();
  }

  @Get('v1/system/version')
  @ApiOperation({ summary: 'API version (verbose)', description: 'Returns service version with additional metadata.' })
  @ApiResponse({ status: 200, description: 'Version info returned.' })
  version() {
    return {
      ServerVersion: String(pkg.version ?? '0.0.0'),
      service: 'pulsedock-api',
      runtime: 'nestjs',
    };
  }

  @Get('version')
  @ApiOperation({ summary: 'API version (simple)', description: 'Returns just the version string.' })
  @ApiResponse({ status: 200, description: 'Version returned.' })
  simpleVersion() {
    return { version: String(pkg.version ?? '0.0.0') };
  }
}
