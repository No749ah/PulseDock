import { Controller, Get, Post, Body, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GrafanaService, TimeseriesResult, TableResult, AnnotationResult } from './grafana.service';

/** Grafana SimpleJSON datasource target */
interface SimpleJsonTarget {
  target: string;
  type?: 'timeserie' | 'table';
  refId?: string;
}

/** Grafana SimpleJSON query body */
interface SimpleJsonQueryBody {
  range: { from: string; to: string };
  intervalMs: number;
  maxDataPoints: number;
  targets: SimpleJsonTarget[];
}

/** Grafana annotation request */
interface AnnotationRequest {
  annotation: {
    name: string;
    query?: string;
    enable: boolean;
    iconColor?: string;
  };
  range: { from: string; to: string };
}

@ApiTags('Grafana')
@Controller('v1/grafana')
export class GrafanaController {
  constructor(private readonly grafanaService: GrafanaService) {}

  /**
   * Health check for Grafana datasource.
   * Grafana calls GET / to verify the datasource is reachable.
   */
  @Get()
  @ApiOperation({ summary: 'Grafana datasource health check', description: 'Returns 200 OK when the datasource is reachable.' })
  @ApiResponse({ status: 200, description: 'Datasource is healthy.' })
  health() {
    return 'OK';
  }

  /**
   * Returns list of available metrics for the Grafana metric picker.
   * Supports optional query filter.
   */
  @Post('search')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Search available metrics',
    description:
      'Returns available metric targets for the Grafana SimpleJSON datasource. Includes monitor-specific metrics like uptime, latency, and status.',
  })
  @ApiResponse({ status: 200, description: 'List of metric names returned.' })
  async search(@Req() req: { user: { id: string } }, @Body() body: { target?: string }) {
    return this.grafanaService.search(req.user.id, body.target ?? '');
  }

  /**
   * Returns time-series or table data for the requested targets.
   * Used by Grafana to populate panels.
   */
  @Post('query')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Query time-series or table data',
    description: 'Returns metric data for Grafana panels. Supported targets: monitor uptime%, latency, status over time.',
  })
  @ApiResponse({ status: 200, description: 'Query results returned.' })
  async query(@Req() req: { user: { id: string } }, @Body() body: SimpleJsonQueryBody): Promise<(TimeseriesResult | TableResult)[]> {
    return this.grafanaService.query(req.user.id, body);
  }

  /**
   * Returns annotation events (incidents, downtime) for Grafana timeline overlay.
   */
  @Post('annotations')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get annotation events',
    description: 'Returns incident and downtime events as Grafana annotations for timeline panels.',
  })
  @ApiResponse({ status: 200, description: 'Annotations returned.' })
  async annotations(@Req() req: { user: { id: string } }, @Body() body: AnnotationRequest): Promise<AnnotationResult[]> {
    return this.grafanaService.annotations(req.user.id, body);
  }

  /**
   * Returns available tag keys for variable filtering.
   */
  @Post('tag-keys')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get tag keys for Grafana variable filtering.' })
  @ApiResponse({ status: 200, description: 'Tag keys returned.' })
  tagKeys() {
    return [
      { type: 'string', text: 'monitor' },
      { type: 'string', text: 'type' },
      { type: 'string', text: 'status' },
    ];
  }

  /**
   * Returns available tag values for a given tag key.
   */
  @Post('tag-values')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get tag values for Grafana variable filtering.' })
  @ApiResponse({ status: 200, description: 'Tag values returned.' })
  async tagValues(@Req() req: { user: { id: string } }, @Body() body: { key: string }) {
    return this.grafanaService.tagValues(req.user.id, body.key);
  }
}
