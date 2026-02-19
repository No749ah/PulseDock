import { Controller, Get } from '@nestjs/common';
import { MetricsService } from './common/metrics.service';

const pkg = require('../package.json');

@Controller()
export class AppController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('health')
  health() {
    return { ok: true, service: 'pulsedock-api', runtime: 'nestjs' };
  }

  @Get('metrics')
  metricsSnapshot() {
    return this.metrics.snapshot();
  }

  @Get('v1/system/version')
  version() {
    return {
      ServerVersion: String(pkg.version ?? '0.0.0'),
      service: 'pulsedock-api',
      runtime: 'nestjs',
    };
  }

  @Get('version')
  simpleVersion() {
    return { version: String(pkg.version ?? '0.0.0') };
  }
}
