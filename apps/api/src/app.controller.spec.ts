import { describe, it, expect, vi } from 'vitest';
import { AppController } from './app.controller';
import { MetricsService } from './common/metrics.service';

describe('AppController', () => {
  const metrics = new MetricsService();
  const controller = new AppController(metrics);

  describe('health()', () => {
    it('returns ok=true with correct service name', () => {
      const result = controller.health();
      expect(result.ok).toBe(true);
      expect(result.service).toBe('pulsedock-api');
      expect(result.runtime).toBe('nestjs');
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
});
