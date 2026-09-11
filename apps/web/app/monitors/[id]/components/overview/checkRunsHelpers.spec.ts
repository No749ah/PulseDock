import { describe, it, expect } from 'vitest';

// ── Inline helpers (mirrored from checkRunsHelpers.ts) ─────────────────────

interface TimingPhase { label: string; value: number | null; color: string }

function buildTimingPhases(timings: {
  dnsMs?: number | null;
  tcpMs?: number | null;
  tlsMs?: number | null;
  ttfbMs?: number | null;
  downloadMs?: number | null;
}): TimingPhase[] {
  return [
    { label: 'DNS', value: timings.dnsMs ?? null, color: 'bg-blue-500' },
    { label: 'TCP', value: timings.tcpMs ?? null, color: 'bg-green-500' },
    { label: 'TLS', value: timings.tlsMs ?? null, color: 'bg-purple-500' },
    { label: 'TTFB', value: timings.ttfbMs ?? null, color: 'bg-orange-500' },
    { label: 'Download', value: timings.downloadMs ?? null, color: 'bg-cyan-500' },
  ];
}

function computeTotal(phases: TimingPhase[], totalMs: number | null): number {
  return totalMs ?? phases.reduce((sum, p) => sum + (p.value ?? 0), 0);
}

function computeBarWidth(value: number, maxMs: number): number {
  return Math.max(2, (value / maxMs) * 100);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('buildTimingPhases', () => {
  it('returns 5 phases in correct order', () => {
    const phases = buildTimingPhases({});
    expect(phases).toHaveLength(5);
    expect(phases.map((p) => p.label)).toEqual(['DNS', 'TCP', 'TLS', 'TTFB', 'Download']);
  });

  it('maps provided values', () => {
    const phases = buildTimingPhases({
      dnsMs: 10,
      tcpMs: 20,
      tlsMs: 30,
      ttfbMs: 40,
      downloadMs: 50,
    });
    expect(phases[0].value).toBe(10);
    expect(phases[1].value).toBe(20);
    expect(phases[2].value).toBe(30);
    expect(phases[3].value).toBe(40);
    expect(phases[4].value).toBe(50);
  });

  it('defaults missing values to null', () => {
    const phases = buildTimingPhases({});
    for (const p of phases) {
      expect(p.value).toBeNull();
    }
  });

  it('defaults null values to null', () => {
    const phases = buildTimingPhases({ dnsMs: null, tcpMs: null });
    expect(phases[0].value).toBeNull();
    expect(phases[1].value).toBeNull();
  });

  it('assigns distinct colors to each phase', () => {
    const phases = buildTimingPhases({});
    const colors = new Set(phases.map((p) => p.color));
    expect(colors.size).toBe(5);
  });
});

describe('computeTotal', () => {
  it('returns totalMs when provided', () => {
    const phases = buildTimingPhases({ dnsMs: 10, tcpMs: 20 });
    expect(computeTotal(phases, 500)).toBe(500);
  });

  it('sums phase values when totalMs is null', () => {
    const phases = buildTimingPhases({
      dnsMs: 10,
      tcpMs: 20,
      tlsMs: 30,
      ttfbMs: 40,
      downloadMs: 50,
    });
    expect(computeTotal(phases, null)).toBe(150);
  });

  it('treats null phase values as 0 in sum', () => {
    const phases = buildTimingPhases({ dnsMs: 10 });
    expect(computeTotal(phases, null)).toBe(10);
  });

  it('returns 0 when all phases null and totalMs null', () => {
    const phases = buildTimingPhases({});
    expect(computeTotal(phases, null)).toBe(0);
  });
});

describe('computeBarWidth', () => {
  it('returns percentage of max', () => {
    expect(computeBarWidth(50, 100)).toBe(50);
  });

  it('returns 100 for value equal to max', () => {
    expect(computeBarWidth(200, 200)).toBe(100);
  });

  it('enforces minimum width of 2', () => {
    expect(computeBarWidth(0, 1000)).toBe(2);
    expect(computeBarWidth(1, 100000)).toBe(2);
  });

  it('returns > 2 for non-trivial values', () => {
    expect(computeBarWidth(500, 1000)).toBe(50);
  });
});
