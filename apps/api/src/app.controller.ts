import * as net from 'node:net';
import { Controller, Get, Header, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MetricsService } from './common/metrics.service';
import { PrismaService } from './common/prisma.service';
import { ChecksScheduler } from './checks/checks.scheduler';

const pkg = require('../package.json') as { version: string; name: string };
const startedAt = Date.now();

@ApiTags('System')
@Controller()
export class AppController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly checksScheduler: ChecksScheduler,
  ) {}

  /** Probe Redis connectivity via a raw PING over TCP. */
  private pingRedis(): Promise<'ok' | 'error'> {
    return new Promise((resolve) => {
      const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
      const match = redisUrl.match(/redis:\/\/([^:]+):(\d+)/);
      const host = match?.[1] ?? 'localhost';
      const port = parseInt(match?.[2] ?? '6379', 10);

      const socket = net.createConnection({ host, port }, () => {
        socket.write('PING\r\n');
      });
      socket.setTimeout(2000);
      socket.on('data', (data) => {
        socket.destroy();
        resolve(data.toString().includes('+PONG') ? 'ok' : 'error');
      });
      socket.on('error', () => { socket.destroy(); resolve('error'); });
      socket.on('timeout', () => { socket.destroy(); resolve('error'); });
    });
  }

  @Get('health')
  @ApiOperation({
    summary: 'Health check',
    description: 'Returns service health including DB connectivity, Redis status, and uptime.',
  })
  @ApiResponse({ status: 200, description: 'Service is healthy.' })
  @ApiResponse({ status: 503, description: 'Service is unhealthy (DB unreachable).' })
  async health() {
    const uptimeMs = Date.now() - startedAt;

    let db: 'ok' | 'error' = 'error';
    let dbLatencyMs: number | null = null;

    try {
      const t0 = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - t0;
      db = 'ok';
    } catch {
      // db stays 'error'
    }

    const redisStatus = await this.pingRedis();
    const healthy = db === 'ok';

    const payload = {
      ok: healthy,
      service: 'pulsedock-api',
      version: pkg.version,
      runtime: 'nestjs',
      uptimeMs,
      uptime: process.uptime(),
      checks: {
        database: { status: db, latencyMs: dbLatencyMs },
        redis: { status: redisStatus },
        scheduler: {
          queueDepth: this.checksScheduler.getQueueDepth(),
          lastCycleMs: this.checksScheduler.getLastCycleMs(),
        },
      },
    };

    if (!healthy) {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }

  @Get('health/live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe', description: 'Always returns 200 if the process is alive.' })
  @ApiResponse({ status: 200, description: 'Process is alive.' })
  liveness() {
    return { ok: true };
  }

  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe', description: 'Returns 200 only when DB is reachable.' })
  @ApiResponse({ status: 200, description: 'Service ready.' })
  @ApiResponse({ status: 503, description: 'Service not ready.' })
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, ready: true };
    } catch {
      throw new ServiceUnavailableException({ ok: false, ready: false, reason: 'database unreachable' });
    }
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Metrics snapshot (JSON)', description: 'Returns runtime request/error counters as JSON.' })
  @ApiResponse({ status: 200, description: 'Metrics snapshot returned.' })
  metricsSnapshot() {
    return this.metrics.snapshot();
  }

  @Get('metrics/prometheus')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({
    summary: 'Prometheus metrics',
    description:
      'Returns runtime metrics in Prometheus text exposition format (version 0.0.4). Includes per-monitor up/down status, latency, 7-day uptime%, and aggregate counters. Suitable for scraping by a Prometheus server or Grafana Alloy.',
  })
  @ApiProduces('text/plain')
  @ApiResponse({ status: 200, description: 'Prometheus metrics text returned.' })
  async metricsPrometheus(): Promise<string> {
    return this.metrics.prometheusFullText(this.prisma);
  }

  @Get('v1/system/version')
  @ApiOperation({ summary: 'API version (verbose)', description: 'Returns service version with additional metadata.' })
  @ApiResponse({ status: 200, description: 'Version info returned.' })
  version() {
    return {
      ServerVersion: pkg.version,
      service: 'pulsedock-api',
      runtime: 'nestjs',
    };
  }

  @Get('version')
  @ApiOperation({ summary: 'API version (simple)', description: 'Returns just the version string.' })
  @ApiResponse({ status: 200, description: 'Version returned.' })
  simpleVersion() {
    return { version: pkg.version };
  }
}
