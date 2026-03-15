import { describe, it, expect, vi } from 'vitest';
import { AppController } from './app.controller';
import { MetricsService } from './common/metrics.service';

const mockPrisma = {
  $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
};

describe('AppController', () => {
  const metrics = new MetricsService();
  const controller = new AppController(metrics, mockPrisma as never);

  describe('health()', () => {
    it('returns ok=true with DB status when DB is up', async () => {
      const result = await controller.health();
      expect(result.ok).toBe(true);
      expect(result.service).toBe('pulsedock-api');
      expect(result.runtime).toBe('nestjs');
      expect(result.checks.database.status).toBe('ok');
      expect(typeof result.uptimeMs).toBe('number');
    });

    it('throws 503 when DB is unreachable', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
      await expect(controller.health()).rejects.toThrow();
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
    it('returns Prometheus text format string', () => {
      const result = controller.metricsPrometheus();
      expect(typeof result).toBe('string');
      expect(result).toContain('# HELP pulsedock_requestsTotal');
      expect(result).toContain('# TYPE pulsedock_requestsTotal counter');
    });

    it('ends with a trailing newline (Prometheus requirement)', () => {
      const result = controller.metricsPrometheus();
      expect(result.endsWith('\n')).toBe(true);
    });

    it('includes process uptime gauge', () => {
      const result = controller.metricsPrometheus();
      expect(result).toContain('pulsedock_process_uptime_seconds');
    });
  });
});
