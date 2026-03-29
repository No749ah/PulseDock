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

    it('includes HELP and TYPE comments for all counters', () => {
      const text = service.prometheusText();
      expect(text).toContain('# HELP pulsedock_requestsTotal');
      expect(text).toContain('# TYPE pulsedock_requestsTotal counter');
      expect(text).toContain('# HELP pulsedock_errorsTotal');
      expect(text).toContain('# TYPE pulsedock_errorsTotal counter');
      expect(text).toContain('# HELP pulsedock_alertsSent');
      expect(text).toContain('# HELP pulsedock_alertsFailed');
    });

    it('renders counter values correctly', () => {
      service.inc('requestsTotal', 42);
      service.inc('alertsSent', 7);
      const text = service.prometheusText();
      expect(text).toContain('pulsedock_requestsTotal 42');
      expect(text).toContain('pulsedock_alertsSent 7');
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
      expect(text).toContain('pulsedock_requestsTotal');
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
