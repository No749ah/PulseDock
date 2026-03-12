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
});
