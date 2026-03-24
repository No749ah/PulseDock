import { describe, it, expect, vi } from 'vitest';
import { AppController } from './app.controller';
import { MetricsService } from './common/metrics.service';

const mockPrisma = {
  $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  monitor: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  monitorRun: {
    groupBy: vi.fn().mockResolvedValue([]),
  },
};

const mockScheduler = {
  getQueueDepth: vi.fn().mockReturnValue(0),
  getLastCycleMs: vi.fn().mockReturnValue(0),
};

describe('AppController', () => {
  const metrics = new MetricsService();
  const controller = new AppController(metrics, mockPrisma as never, mockScheduler as never);

  describe('health()', () => {
    it('returns ok=true with DB status when DB is up', async () => {
      const result = await controller.health();
      expect(result.ok).toBe(true);
      expect(result.service).toBe('pulsedock-api');
      expect(result.runtime).toBe('nestjs');
      expect(result.checks.database.status).toBe('ok');
      expect(typeof result.checks.scheduler.queueDepth).toBe('number');
      expect(typeof result.checks.scheduler.lastCycleMs).toBe('number');
      expect(typeof result.checks.redis.status).toBe('string');
      expect(typeof result.uptimeMs).toBe('number');
      expect(typeof result.uptime).toBe('number');
    });

    it('throws 503 when DB is unreachable', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
      await expect(controller.health()).rejects.toThrow();
    });

    it('includes DB latency in milliseconds when healthy', async () => {
      const result = await controller.health();
      expect(typeof result.checks.database.latencyMs).toBe('number');
      expect(result.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('reports version from package.json', async () => {
      const result = await controller.health();
      expect(typeof result.version).toBe('string');
      expect(result.version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('liveness()', () => {
    it('returns ok=true', () => {
      expect(controller.liveness().ok).toBe(true);
    });
  });

  describe('readiness()', () => {
    it('returns ok=true when DB up', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
      const result = await controller.readiness();
      expect(result.ok).toBe(true);
    });

    it('throws ServiceUnavailableException when DB is unreachable', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('db down'));
      await expect(controller.readiness()).rejects.toThrow();
    });
  });

  describe('metricsSnapshot()', () => {
    it('returns metrics snapshot with counters', () => {
      const result = controller.metricsSnapshot();
      expect(result).toHaveProperty('requestsTotal');
      expect(result).toHaveProperty('errorsTotal');
      expect(result).toHaveProperty('at');
    });
  });

  describe('version()', () => {
    it('returns ServerVersion and service name', () => {
      const result = controller.version();
      expect(result).toHaveProperty('ServerVersion');
      expect(result.service).toBe('pulsedock-api');
      expect(result.runtime).toBe('nestjs');
    });
  });

  describe('simpleVersion()', () => {
    it('returns version string', () => {
      const result = controller.simpleVersion();
      expect(result).toHaveProperty('version');
      expect(typeof result.version).toBe('string');
    });
  });

  describe('metricsPrometheus()', () => {
    it('returns Prometheus text format string', async () => {
      const result = await controller.metricsPrometheus();
      expect(typeof result).toBe('string');
      expect(result).toContain('# HELP pulsedock_requestsTotal');
      expect(result).toContain('# TYPE pulsedock_requestsTotal counter');
    });

    it('ends with a trailing newline (Prometheus requirement)', async () => {
      const result = await controller.metricsPrometheus();
      expect(result.endsWith('\n')).toBe(true);
    });

    it('includes process uptime gauge', async () => {
      const result = await controller.metricsPrometheus();
      expect(result).toContain('pulsedock_process_uptime_seconds');
    });

    it('includes aggregate monitor gauges', async () => {
      const result = await controller.metricsPrometheus();
      expect(result).toContain('pulsedock_monitors_total');
      expect(result).toContain('pulsedock_monitors_up_total');
      expect(result).toContain('pulsedock_monitors_down_total');
    });
  });
});
