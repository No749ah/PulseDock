import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetricsService } from './metrics.service';
import type { PrismaService } from './prisma.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  describe('inc()', () => {
    it('increments requestsTotal by 1 by default', () => {
      service.inc('requestsTotal');
      const snap = service.snapshot();
      expect(snap.requestsTotal).toBe(1);
    });

    it('increments by custom amount', () => {
      service.inc('errorsTotal', 5);
      const snap = service.snapshot();
      expect(snap.errorsTotal).toBe(5);
    });

    it('increments authLoginFailed', () => {
      service.inc('authLoginFailed');
      service.inc('authLoginFailed');
      const snap = service.snapshot();
      expect(snap.authLoginFailed).toBe(2);
    });

    it('increments alertsSent and alertsFailed independently', () => {
      service.inc('alertsSent', 3);
      service.inc('alertsFailed', 1);
      const snap = service.snapshot();
      expect(snap.alertsSent).toBe(3);
      expect(snap.alertsFailed).toBe(1);
    });
  });

  describe('snapshot()', () => {
    it('returns all counters initialized to 0', () => {
      const snap = service.snapshot();
      expect(snap.requestsTotal).toBe(0);
      expect(snap.errorsTotal).toBe(0);
      expect(snap.authLoginFailed).toBe(0);
      expect(snap.alertsSent).toBe(0);
      expect(snap.alertsFailed).toBe(0);
    });

    it('includes a timestamp', () => {
      const snap = service.snapshot();
      expect(snap).toHaveProperty('at');
      expect(new Date(snap.at).getTime()).toBeGreaterThan(0);
    });
  });

  describe('prometheusText()', () => {
    it('returns a non-empty string', () => {
      const text = service.prometheusText();
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    });

    it('includes HELP and TYPE comments for all counters with snake_case names', () => {
      const text = service.prometheusText();
      expect(text).toContain('# HELP pulsedock_requests_total');
      expect(text).toContain('# TYPE pulsedock_requests_total counter');
      expect(text).toContain('# HELP pulsedock_errors_total');
      expect(text).toContain('# TYPE pulsedock_errors_total counter');
      expect(text).toContain('# HELP pulsedock_alerts_sent_total');
      expect(text).toContain('# HELP pulsedock_alerts_failed_total');
      expect(text).toContain('# HELP pulsedock_auth_login_failed_total');
    });

    it('renders counter values correctly', () => {
      service.inc('requestsTotal', 42);
      service.inc('alertsSent', 7);
      const text = service.prometheusText();
      expect(text).toContain('pulsedock_requests_total 42');
      expect(text).toContain('pulsedock_alerts_sent_total 7');
    });

    it('includes process uptime gauge', () => {
      const text = service.prometheusText();
      expect(text).toContain('# HELP pulsedock_process_uptime_seconds');
      expect(text).toContain('# TYPE pulsedock_process_uptime_seconds gauge');
      expect(text).toMatch(/pulsedock_process_uptime_seconds \d+/);
    });

    it('ends with a trailing newline (Prometheus requirement)', () => {
      const text = service.prometheusText();
      expect(text.endsWith('\n')).toBe(true);
    });

    it('includes process memory gauges', () => {
      const text = service.prometheusText();
      expect(text).toContain('# HELP pulsedock_process_heap_used_bytes');
      expect(text).toContain('# TYPE pulsedock_process_heap_used_bytes gauge');
      expect(text).toMatch(/pulsedock_process_heap_used_bytes \d+/);
      expect(text).toContain('pulsedock_process_rss_bytes');
      expect(text).toContain('pulsedock_process_heap_total_bytes');
      expect(text).toContain('pulsedock_process_external_bytes');
    });
  });

  describe('observeHttpDuration()', () => {
    it('records observations into histogram buckets', () => {
      service.observeHttpDuration(3);   // <= 5ms bucket
      service.observeHttpDuration(15);  // <= 25ms bucket
      service.observeHttpDuration(200); // <= 250ms bucket
      const text = service.prometheusText();
      // 3ms falls into le="5" bucket → cumulative 1
      expect(text).toContain('pulsedock_http_request_duration_ms_bucket{le="5"} 1');
      // 15ms falls into le="25" bucket → cumulative 2 (5 + 25)
      expect(text).toContain('pulsedock_http_request_duration_ms_bucket{le="25"} 2');
      // 200ms falls into le="250" → cumulative 3
      expect(text).toContain('pulsedock_http_request_duration_ms_bucket{le="250"} 3');
      // +Inf always equals count
      expect(text).toContain('pulsedock_http_request_duration_ms_bucket{le="+Inf"} 3');
      expect(text).toContain('pulsedock_http_request_duration_ms_sum 218');
      expect(text).toContain('pulsedock_http_request_duration_ms_count 3');
    });

    it('handles requests exceeding all buckets', () => {
      service.observeHttpDuration(15000); // > 10000ms (max bucket)
      const text = service.prometheusText();
      // All bucket cumulative counts should be 0 (since 15000 > every bucket)
      expect(text).toContain('pulsedock_http_request_duration_ms_bucket{le="10000"} 0');
      expect(text).toContain('pulsedock_http_request_duration_ms_bucket{le="+Inf"} 1');
      expect(text).toContain('pulsedock_http_request_duration_ms_sum 15000');
    });

    it('includes histogram header comments', () => {
      const text = service.prometheusText();
      expect(text).toContain('# HELP pulsedock_http_request_duration_ms');
      expect(text).toContain('# TYPE pulsedock_http_request_duration_ms histogram');
    });
  });

  describe('observeCheckExecution()', () => {
    it('tracks check execution counts by type and result', () => {
      service.observeCheckExecution('HTTP', true, 150);
      service.observeCheckExecution('HTTP', true, 200);
      service.observeCheckExecution('HTTP', false, 5000);
      service.observeCheckExecution('TCP', true, 50);
      const text = service.prometheusText();
      expect(text).toContain('pulsedock_checks_executed_total{type="HTTP",result="ok"} 2');
      expect(text).toContain('pulsedock_checks_executed_total{type="HTTP",result="fail"} 1');
      expect(text).toContain('pulsedock_checks_executed_total{type="TCP",result="ok"} 1');
    });

    it('tracks check duration histogram per type', () => {
      service.observeCheckExecution('HTTP', true, 75);   // <= 100ms bucket
      service.observeCheckExecution('HTTP', true, 300);  // <= 500ms bucket
      service.observeCheckExecution('HTTP', false, 8000); // <= 10000ms bucket
      const text = service.prometheusText();
      expect(text).toContain('pulsedock_check_duration_ms_bucket{type="http",le="100"} 1');
      expect(text).toContain('pulsedock_check_duration_ms_bucket{type="http",le="500"} 2');
      expect(text).toContain('pulsedock_check_duration_ms_bucket{type="http",le="10000"} 3');
      expect(text).toContain('pulsedock_check_duration_ms_sum{type="http"} 8375');
      expect(text).toContain('pulsedock_check_duration_ms_count{type="http"} 3');
    });
  });

  describe('checkStarted() / checkFinished()', () => {
    it('tracks in-flight checks gauge', () => {
      service.checkStarted();
      service.checkStarted();
      let text = service.prometheusText();
      expect(text).toContain('pulsedock_checks_in_flight 2');

      service.checkFinished();
      text = service.prometheusText();
      expect(text).toContain('pulsedock_checks_in_flight 1');
    });

    it('does not go below zero', () => {
      service.checkFinished();
      service.checkFinished();
      const text = service.prometheusText();
      expect(text).toContain('pulsedock_checks_in_flight 0');
    });
  });

  describe('prometheusFullText()', () => {
    function makePrisma(opts: {
      monitors?: object[];
      runCounts?: object[];
    } = {}): PrismaService {
      const monitors = opts.monitors ?? [];
      const runCounts = opts.runCounts ?? [];
      return {
        monitor: {
          findMany: vi.fn().mockResolvedValue(monitors),
        },
        monitorRun: {
          groupBy: vi.fn().mockResolvedValue(runCounts),
        },
      } as unknown as PrismaService;
    }

    it('returns string containing base metrics + aggregate gauges', async () => {
      const prisma = makePrisma();
      const text = await service.prometheusFullText(prisma);
      expect(typeof text).toBe('string');
      expect(text).toContain('pulsedock_requests_total');
      expect(text).toContain('pulsedock_monitors_total 0');
      expect(text).toContain('pulsedock_monitors_up_total 0');
      expect(text).toContain('pulsedock_monitors_down_total 0');
    });

    it('exports per-monitor up/latency/uptime gauges for each monitor', async () => {
      const prisma = makePrisma({
        monitors: [
          {
            id: 'mon-1',
            name: 'My API',
            type: 'HTTP',
            target: 'https://api.example.com',
            enabled: true,
            runs: [{ status: 'up', latencyMs: 42, checkedAt: new Date() }],
          },
        ],
        runCounts: [
          { monitorId: 'mon-1', status: 'up', _count: { _all: 100 } },
          { monitorId: 'mon-1', status: 'down', _count: { _all: 2 } },
        ],
      });

      const text = await service.prometheusFullText(prisma);
      expect(text).toContain('pulsedock_monitors_total 1');
      expect(text).toContain('pulsedock_monitors_up_total 1');
      expect(text).toContain('pulsedock_monitors_down_total 0');
      expect(text).toContain('id="mon-1"');
      expect(text).toContain('name="My API"');
      // Status: up → 1
      expect(text).toMatch(/pulsedock_monitor_up\{[^}]*id="mon-1"[^}]*\} 1/);
      // Latency: 42ms
      expect(text).toMatch(/pulsedock_monitor_latency_ms\{[^}]*id="mon-1"[^}]*\} 42/);
      // Uptime 7d: 100/102 ≈ 98.0392%
      expect(text).toMatch(/pulsedock_monitor_uptime_pct_7d\{[^}]*id="mon-1"[^}]*\} 98\./);
    });

    it('reports -1 for disabled monitors', async () => {
      const prisma = makePrisma({
        monitors: [
          {
            id: 'mon-2',
            name: 'Paused',
            type: 'HTTP',
            target: 'https://paused.example.com',
            enabled: false,
            runs: [],
          },
        ],
      });
      const text = await service.prometheusFullText(prisma);
      expect(text).toContain('pulsedock_monitors_paused_total 1');
      expect(text).toMatch(/pulsedock_monitor_up\{[^}]*id="mon-2"[^}]*\} -1/);
    });

    it('sanitizes label values with special characters', async () => {
      const prisma = makePrisma({
        monitors: [
          {
            id: 'mon-3',
            name: 'Service "Alpha"',
            type: 'HTTP',
            target: 'https://alpha.example.com',
            enabled: true,
            runs: [{ status: 'down', latencyMs: null, checkedAt: new Date() }],
          },
        ],
      });
      const text = await service.prometheusFullText(prisma);
      // The double-quote in the name should be escaped
      expect(text).toContain('name="Service \\"Alpha\\""');
      // down → 0
      expect(text).toMatch(/pulsedock_monitor_up\{[^}]*id="mon-3"[^}]*\} 0/);
      // no latency → -1
      expect(text).toMatch(/pulsedock_monitor_latency_ms\{[^}]*id="mon-3"[^}]*\} -1/);
    });

    it('ends with a trailing newline', async () => {
      const prisma = makePrisma();
      const text = await service.prometheusFullText(prisma);
      expect(text.endsWith('\n')).toBe(true);
    });
  });
});
