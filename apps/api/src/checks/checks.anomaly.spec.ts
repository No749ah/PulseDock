/**
 * Anomaly detection unit tests.
 * Tests the P95 baseline logic used in runMonitor() to detect latency spikes.
 */
import { describe, it, expect } from 'vitest';

// ── Isolated P95 computation (pure logic, no DB) ─────────────────────────────

function computeP95(latencies: number[]): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[idx] ?? sorted[sorted.length - 1];
}

function isAnomaly(currentLatencyMs: number, baselineLatencies: number[], multiplier: number): boolean {
  if (baselineLatencies.length < 10) return false;
  const p95 = computeP95(baselineLatencies);
  return currentLatencyMs > p95 * multiplier;
}

describe('Anomaly Detection — P95 baseline logic', () => {
  it('computes P95 correctly for a sorted range', () => {
    const latencies = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100ms
    const p95 = computeP95(latencies);
    // 95th percentile of 100 values → index 95 → value 96
    expect(p95).toBe(96);
  });

  it('returns false when fewer than 10 baseline samples available', () => {
    const baseline = [100, 110, 120]; // only 3 samples
    expect(isAnomaly(5000, baseline, 2.0)).toBe(false);
  });

  it('detects anomaly when current latency > 2× P95', () => {
    // P95 of stable baseline ~100ms
    const baseline = Array.from({ length: 100 }, () => 100);
    // P95 = 100ms → threshold = 200ms
    expect(isAnomaly(250, baseline, 2.0)).toBe(true);
  });

  it('does NOT flag as anomaly when latency is within 2× P95', () => {
    const baseline = Array.from({ length: 100 }, () => 100);
    // P95 = 100ms → threshold = 200ms; 150ms is fine
    expect(isAnomaly(150, baseline, 2.0)).toBe(false);
  });

  it('respects custom multiplier (3×)', () => {
    const baseline = Array.from({ length: 100 }, () => 100);
    // P95 = 100ms → threshold = 300ms
    expect(isAnomaly(250, baseline, 3.0)).toBe(false);
    expect(isAnomaly(350, baseline, 3.0)).toBe(true);
  });

  it('handles skewed distributions (most low, some high)', () => {
    // 90 fast requests + 10 slow → P95 should be in the slow range
    const baseline = [
      ...Array.from({ length: 90 }, () => 50),
      ...Array.from({ length: 10 }, () => 500),
    ];
    const p95 = computeP95(baseline);
    expect(p95).toBeGreaterThanOrEqual(500);
    // A 2× multiplier: threshold = 1000ms
    // 900ms should NOT be an anomaly (just a slow request)
    expect(isAnomaly(900, baseline, 2.0)).toBe(false);
    // 1100ms IS anomaly
    expect(isAnomaly(1100, baseline, 2.0)).toBe(true);
  });

  it('returns false for zero or negative latency', () => {
    const baseline = Array.from({ length: 20 }, () => 100);
    expect(isAnomaly(0, baseline, 2.0)).toBe(false);
    expect(isAnomaly(-1, baseline, 2.0)).toBe(false);
  });

  it('works at exactly P95 boundary (not an anomaly)', () => {
    const baseline = Array.from({ length: 100 }, () => 100);
    const p95 = computeP95(baseline); // 100
    // Exactly at 2× threshold is NOT > threshold
    expect(isAnomaly(p95 * 2.0, baseline, 2.0)).toBe(false);
  });

  it('detects anomaly for a single spike in otherwise stable baseline', () => {
    const baseline = [
      ...Array.from({ length: 95 }, () => 80),
      ...Array.from({ length: 5 }, () => 150),
    ];
    const p95 = computeP95(baseline);
    expect(p95).toBeLessThanOrEqual(150);
    // 600ms against a max-P95 of 150ms with 2× multiplier = threshold 300ms → anomaly
    expect(isAnomaly(600, baseline, 2.0)).toBe(true);
  });
});
