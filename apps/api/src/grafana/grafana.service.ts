import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/** Grafana SimpleJSON timeseries datapoint: [value, timestampMs] */
export type Datapoint = [number, number];

/** Grafana SimpleJSON timeseries result */
export interface TimeseriesResult {
  target: string;
  datapoints: Datapoint[];
}

/** Grafana SimpleJSON table result */
export interface TableResult {
  type: 'table';
  columns: { text: string; type: string }[];
  rows: (string | number | boolean)[][];
}

/** Grafana annotation result */
export interface AnnotationResult {
  annotation: { name: string; enable: boolean; iconColor?: string };
  time: number;
  timeEnd?: number;
  title: string;
  text: string;
  tags: string[];
}

/** Grafana SimpleJSON query body */
interface SimpleJsonQueryBody {
  range: { from: string; to: string };
  intervalMs: number;
  maxDataPoints: number;
  targets: { target: string; type?: string; refId?: string }[];
}

/** Grafana annotation request */
interface AnnotationRequest {
  annotation: { name: string; query?: string; enable: boolean; iconColor?: string };
  range: { from: string; to: string };
}

@Injectable()
export class GrafanaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns available metric target strings for the Grafana metric picker.
   * Format: `<monitorName>.<metric>` where metric is uptime|latency|status.
   * @param userId - Authenticated user ID
   * @param query - Optional filter string
   * @returns List of metric target strings
   */
  async search(userId: string, query: string): Promise<string[]> {
    const monitors = await this.prisma.monitor.findMany({
      where: { userId, enabled: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 200,
    });

    const metrics = ['uptime', 'latency', 'status', 'flap'];
    const targets: string[] = [];

    for (const monitor of monitors) {
      const safeName = monitor.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      for (const metric of metrics) {
        const target = `${safeName}.${metric}`;
        if (!query || target.toLowerCase().includes(query.toLowerCase())) {
          targets.push(target);
        }
      }
    }

    return targets;
  }

  /**
   * Queries time-series or table data for Grafana panels.
   * Supports target patterns:
   * - `<monitorName>.latency` → latency ms over time
   * - `<monitorName>.status` → 1=up, 0=down over time
   * - `<monitorName>.uptime` → rolling uptime % over time (daily buckets)
   * - `all_monitors.table` → summary table of all monitors
   * @param userId - Authenticated user ID
   * @param body - Grafana query payload
   */
  async query(userId: string, body: SimpleJsonQueryBody): Promise<(TimeseriesResult | TableResult)[]> {
    const from = new Date(body.range.from);
    const to = new Date(body.range.to);
    const results: (TimeseriesResult | TableResult)[] = [];

    for (const target of body.targets) {
      const t = target.target ?? '';

      // Special table target: all monitors summary
      if (t === 'all_monitors.table' || target.type === 'table') {
        const table = await this.buildAllMonitorsTable(userId, from, to);
        results.push(table);
        continue;
      }

      // Parse `monitorName.metric`
      const lastDot = t.lastIndexOf('.');
      if (lastDot === -1) continue;

      const monitorNameRaw = t.slice(0, lastDot).replace(/_/g, ' ');
      const metric = t.slice(lastDot + 1);

      // Find monitor by name (case-insensitive, underscore ↔ space)
      const monitor = await this.prisma.monitor.findFirst({
        where: {
          userId,
          name: { equals: monitorNameRaw, mode: 'insensitive' },
        },
        select: { id: true, name: true },
      });

      if (!monitor) continue;

      if (metric === 'latency') {
        const ts = await this.buildLatencyTimeseries(monitor.id, monitor.name, from, to, body.maxDataPoints);
        results.push(ts);
      } else if (metric === 'status') {
        const ts = await this.buildStatusTimeseries(monitor.id, monitor.name, from, to, body.maxDataPoints);
        results.push(ts);
      } else if (metric === 'uptime') {
        const ts = await this.buildUptimeTimeseries(monitor.id, monitor.name, from, to);
        results.push(ts);
      } else if (metric === 'flap') {
        const ts = await this.buildFlapTimeseries(monitor.id, monitor.name, from, to, body.maxDataPoints);
        results.push(ts);
      }
    }

    return results;
  }

  /**
   * Returns Grafana annotation events for incidents and monitor downtime.
   * @param userId - Authenticated user ID
   * @param body - Annotation request payload
   */
  async annotations(userId: string, body: AnnotationRequest): Promise<AnnotationResult[]> {
    const from = new Date(body.range.from);
    const to = new Date(body.range.to);
    const results: AnnotationResult[] = [];

    // Incidents as annotations
    const incidents = await this.prisma.incident.findMany({
      where: {
        userId,
        createdAt: { gte: from, lte: to },
      },
      select: {
        title: true,
        severity: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    for (const incident of incidents) {
      results.push({
        annotation: {
          name: body.annotation.name,
          enable: body.annotation.enable,
          iconColor: body.annotation.iconColor ?? 'red',
        },
        time: incident.createdAt.getTime(),
        timeEnd: incident.resolvedAt?.getTime(),
        title: `Incident: ${incident.title}`,
        text: `Severity: ${incident.severity} | Status: ${incident.status}`,
        tags: ['incident', incident.severity?.toLowerCase() ?? 'unknown'],
      });
    }

    return results;
  }

  /**
   * Returns available tag values for a given tag key.
   * @param userId - Authenticated user ID
   * @param key - Tag key (monitor|type|status)
   */
  async tagValues(userId: string, key: string): Promise<{ text: string }[]> {
    if (key === 'monitor') {
      const monitors = await this.prisma.monitor.findMany({
        where: { userId },
        select: { name: true },
        orderBy: { name: 'asc' },
        take: 200,
      });
      return monitors.map((m) => ({ text: m.name }));
    }

    if (key === 'type') {
      return [
        { text: 'HTTP' },
        { text: 'TCP' },
        { text: 'PING' },
        { text: 'DNS' },
        { text: 'SSL' },
        { text: 'HEARTBEAT' },
        { text: 'VERSION_CHECK' },
      ];
    }

    if (key === 'status') {
      return [{ text: 'up' }, { text: 'down' }, { text: 'degraded' }, { text: 'paused' }];
    }

    return [];
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async buildLatencyTimeseries(
    monitorId: string,
    monitorName: string,
    from: Date,
    to: Date,
    maxPoints: number,
  ): Promise<TimeseriesResult> {
    const runs = await this.prisma.monitorRun.findMany({
      where: { monitorId, checkedAt: { gte: from, lte: to }, latencyMs: { not: null } },
      select: { latencyMs: true, checkedAt: true },
      orderBy: { checkedAt: 'asc' },
      take: Math.min(maxPoints || 1000, 2000),
    });

    const safeName = monitorName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return {
      target: `${safeName}.latency`,
      datapoints: runs.map((r) => [r.latencyMs ?? 0, r.checkedAt.getTime()]),
    };
  }

  private async buildStatusTimeseries(
    monitorId: string,
    monitorName: string,
    from: Date,
    to: Date,
    maxPoints: number,
  ): Promise<TimeseriesResult> {
    const runs = await this.prisma.monitorRun.findMany({
      where: { monitorId, checkedAt: { gte: from, lte: to } },
      select: { ok: true, checkedAt: true },
      orderBy: { checkedAt: 'asc' },
      take: Math.min(maxPoints || 1000, 2000),
    });

    const safeName = monitorName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return {
      target: `${safeName}.status`,
      datapoints: runs.map((r) => [r.ok ? 1 : 0, r.checkedAt.getTime()]),
    };
  }

  private async buildUptimeTimeseries(
    monitorId: string,
    monitorName: string,
    from: Date,
    to: Date,
  ): Promise<TimeseriesResult> {
    // Group runs into daily buckets
    const runs = await this.prisma.monitorRun.findMany({
      where: { monitorId, checkedAt: { gte: from, lte: to } },
      select: { ok: true, checkedAt: true },
      orderBy: { checkedAt: 'asc' },
      take: 5000,
    });

    // Bucket by UTC day
    const buckets = new Map<string, { total: number; ok: number; ts: number }>();
    for (const run of runs) {
      const day = run.checkedAt.toISOString().slice(0, 10);
      const existing = buckets.get(day) ?? { total: 0, ok: 0, ts: new Date(day + 'T00:00:00Z').getTime() };
      existing.total++;
      if (run.ok) existing.ok++;
      buckets.set(day, existing);
    }

    const safeName = monitorName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const datapoints: Datapoint[] = Array.from(buckets.values())
      .sort((a, b) => a.ts - b.ts)
      .map((b) => [b.total > 0 ? Math.round((b.ok / b.total) * 10000) / 100 : 0, b.ts]);

    return { target: `${safeName}.uptime`, datapoints };
  }

  /**
   * Builds a time-series for flap status: 1 when the monitor is flapping at that point in time,
   * 0 when stable. Detects state changes by scanning run-level transitions in window of 5.
   * Returns a single current-value point (the monitor's live isFlapping state) at `to`.
   * For historical trend, returns 1/0 per check based on state-change rate in a rolling window.
   */
  private async buildFlapTimeseries(
    monitorId: string,
    monitorName: string,
    from: Date,
    to: Date,
    maxPoints: number,
  ): Promise<TimeseriesResult> {
    const runs = await this.prisma.monitorRun.findMany({
      where: { monitorId, checkedAt: { gte: from, lte: to } },
      select: { ok: true, checkedAt: true },
      orderBy: { checkedAt: 'asc' },
      take: Math.min(maxPoints || 1000, 2000),
    });

    const safeName = monitorName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const FLAP_WINDOW = 5;
    const FLAP_THRESHOLD = 3;

    // For each run, look at the previous FLAP_WINDOW runs and detect flapping
    const datapoints: Datapoint[] = runs.map((run, idx) => {
      const windowStart = Math.max(0, idx - FLAP_WINDOW + 1);
      const window = runs.slice(windowStart, idx + 1);
      let changes = 0;
      for (let i = 1; i < window.length; i++) {
        if (window[i].ok !== window[i - 1].ok) changes++;
      }
      const isFlapping = window.length >= 3 && changes >= FLAP_THRESHOLD ? 1 : 0;
      return [isFlapping, run.checkedAt.getTime()];
    });

    return { target: `${safeName}.flap`, datapoints };
  }

  private async buildAllMonitorsTable(userId: string, from: Date, to: Date): Promise<TableResult> {
    const monitors = await this.prisma.monitor.findMany({
      where: { userId },
      select: { id: true, name: true, type: true, target: true, enabled: true, isFlapping: true },
      orderBy: { name: 'asc' },
      take: 200,
    });

    const rows: (string | number | boolean)[][] = [];

    for (const monitor of monitors) {
      // Aggregate stats in range
      const stats = await this.prisma.monitorRun.aggregate({
        where: { monitorId: monitor.id, checkedAt: { gte: from, lte: to } },
        _count: { _all: true },
        _avg: { latencyMs: true },
      });

      const okCount = await this.prisma.monitorRun.count({
        where: { monitorId: monitor.id, checkedAt: { gte: from, lte: to }, ok: true },
      });

      const total = stats._count._all;
      const uptimePct = total > 0 ? Math.round((okCount / total) * 10000) / 100 : 0;
      const avgLatency = Math.round(stats._avg.latencyMs ?? 0);

      rows.push([monitor.name, monitor.type, monitor.target ?? '', uptimePct, avgLatency, total, monitor.enabled ? 'enabled' : 'disabled', monitor.isFlapping ? 'yes' : 'no']);
    }

    return {
      type: 'table',
      columns: [
        { text: 'Monitor', type: 'string' },
        { text: 'Type', type: 'string' },
        { text: 'Target', type: 'string' },
        { text: 'Uptime %', type: 'number' },
        { text: 'Avg Latency ms', type: 'number' },
        { text: 'Total Checks', type: 'number' },
        { text: 'Status', type: 'string' },
        { text: 'Flapping', type: 'string' },
      ],
      rows,
    };
  }
}
