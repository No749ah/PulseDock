/**
 * Latency Alert Threshold unit tests.
 * Tests the fixed latency threshold logic used in runMonitor() to flag slow responses.
 */
import { describe, it, expect } from 'vitest';

// ── Pure latency threshold logic ──────────────────────────────────────────────

/**
 * Determines whether a monitor run should be flagged yellow due to latency threshold.
 * Mirrors the logic in checks.service.ts runMonitor().
 */
function shouldTriggerLatencyAlert(params: {
  ok: boolean;
  latencyMs: number | null;
  latencyAlertMs: number | null | undefined;
  currentLevel: string;
}): boolean {
  const { ok, latencyMs, latencyAlertMs, currentLevel } = params;
  return (
    currentLevel === 'green' &&
    ok &&
    typeof latencyAlertMs === 'number' &&
    latencyAlertMs > 0 &&
    latencyMs !== null &&
    latencyMs > latencyAlertMs
  );
}

describe('Latency Alert Threshold — fixed threshold logic', () => {
  it('triggers when latency exceeds threshold on a successful check', () => {
    expect(shouldTriggerLatencyAlert({
      ok: true,
      latencyMs: 2500,
      latencyAlertMs: 2000,
      currentLevel: 'green',
    })).toBe(true);
  });

  it('does NOT trigger when latency is exactly at threshold', () => {
    expect(shouldTriggerLatencyAlert({
      ok: true,
      latencyMs: 2000,
      latencyAlertMs: 2000,
      currentLevel: 'green',
    })).toBe(false);
  });

  it('does NOT trigger when latency is below threshold', () => {
    expect(shouldTriggerLatencyAlert({
      ok: true,
      latencyMs: 1500,
      latencyAlertMs: 2000,
      currentLevel: 'green',
    })).toBe(false);
  });

  it('does NOT trigger when check failed (ok=false)', () => {
    expect(shouldTriggerLatencyAlert({
      ok: false,
      latencyMs: 5000,
      latencyAlertMs: 2000,
      currentLevel: 'red',
    })).toBe(false);
  });

  it('does NOT trigger when latencyAlertMs is null (disabled)', () => {
    expect(shouldTriggerLatencyAlert({
      ok: true,
      latencyMs: 9999,
      latencyAlertMs: null,
      currentLevel: 'green',
    })).toBe(false);
  });

  it('does NOT trigger when latencyAlertMs is undefined (not configured)', () => {
    expect(shouldTriggerLatencyAlert({
      ok: true,
      latencyMs: 9999,
      latencyAlertMs: undefined,
      currentLevel: 'green',
    })).toBe(false);
  });

  it('does NOT trigger when latencyAlertMs is 0 (invalid)', () => {
    expect(shouldTriggerLatencyAlert({
      ok: true,
      latencyMs: 9999,
      latencyAlertMs: 0,
      currentLevel: 'green',
    })).toBe(false);
  });

  it('does NOT trigger when latency is null (no timing data)', () => {
    expect(shouldTriggerLatencyAlert({
      ok: true,
      latencyMs: null,
      latencyAlertMs: 2000,
      currentLevel: 'green',
    })).toBe(false);
  });

  it('does NOT override anomaly detection (non-green level)', () => {
    // If anomaly detection already set level to yellow, latency threshold should not fire
    expect(shouldTriggerLatencyAlert({
      ok: true,
      latencyMs: 5000,
      latencyAlertMs: 2000,
      currentLevel: 'yellow', // already escalated by anomaly detection
    })).toBe(false);
  });

  it('works with 1ms threshold (edge case)', () => {
    expect(shouldTriggerLatencyAlert({
      ok: true,
      latencyMs: 2,
      latencyAlertMs: 1,
      currentLevel: 'green',
    })).toBe(true);
  });
});
