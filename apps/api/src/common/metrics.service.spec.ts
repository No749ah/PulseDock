import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsService } from './metrics.service';

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
  });
});
