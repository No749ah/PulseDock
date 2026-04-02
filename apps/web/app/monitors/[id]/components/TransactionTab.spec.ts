/**
 * Unit tests for TransactionTab pure logic.
 *
 * Tests: levelColor, levelBg helpers, step pass/fail derivation,
 * total latency calculation, assertion failure counting.
 */
import { describe, it, expect } from 'vitest';

// ── Pure helpers mirrored from TransactionTab ─────────────────────────────────

function levelColor(level: string): string {
  if (level === 'green') return 'text-success';
  if (level === 'yellow') return 'text-warning';
  return 'text-error';
}

function levelBg(level: string): string {
  if (level === 'green') return 'bg-success/10 border-success/20';
  if (level === 'yellow') return 'bg-warning/10 border-warning/20';
  return 'bg-error/10 border-error/20';
}

interface TransactionStep {
  stepId: string;
  name: string;
  ok: boolean;
  statusCode?: number;
  latencyMs: number;
  assertionFailures: string[];
  error?: string;
}

/** Sum of all step latencies */
function totalLatencyMs(steps: TransactionStep[]): number {
  return steps.reduce((sum, s) => sum + s.latencyMs, 0);
}

/** Count failed steps */
function failedStepCount(steps: TransactionStep[]): number {
  return steps.filter((s) => !s.ok).length;
}

/** Count passed steps */
function passedStepCount(steps: TransactionStep[]): number {
  return steps.filter((s) => s.ok).length;
}

/** All assertion failures across all steps */
function allAssertionFailures(steps: TransactionStep[]): string[] {
  return steps.flatMap((s) => s.assertionFailures);
}

/** Step has error (either not ok, or has error string) */
function stepHasError(step: TransactionStep): boolean {
  return !step.ok || (step.error !== undefined && step.error !== '');
}

/** Transaction pass rate percentage */
function passRate(steps: TransactionStep[]): number {
  if (steps.length === 0) return 0;
  return Math.round((passedStepCount(steps) / steps.length) * 100);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TransactionTab — levelColor', () => {
  it('green → text-success', () => expect(levelColor('green')).toBe('text-success'));
  it('yellow → text-warning', () => expect(levelColor('yellow')).toBe('text-warning'));
  it('red → text-error', () => expect(levelColor('red')).toBe('text-error'));
  it('unknown → text-error (default)', () => expect(levelColor('unknown')).toBe('text-error'));

  it('all three defined levels produce unique colors', () => {
    expect(new Set([levelColor('green'), levelColor('yellow'), levelColor('red')]).size).toBe(3);
  });
});

describe('TransactionTab — levelBg', () => {
  it('green → success background', () => {
    expect(levelBg('green')).toContain('bg-success');
  });

  it('yellow → warning background', () => {
    expect(levelBg('yellow')).toContain('bg-warning');
  });

  it('red → error background', () => {
    expect(levelBg('red')).toContain('bg-error');
  });

  it('all three levels produce unique backgrounds', () => {
    expect(new Set([levelBg('green'), levelBg('yellow'), levelBg('red')]).size).toBe(3);
  });
});

describe('TransactionTab — totalLatencyMs', () => {
  const steps: TransactionStep[] = [
    { stepId: 's1', name: 'Login', ok: true, latencyMs: 120, assertionFailures: [] },
    { stepId: 's2', name: 'Navigate', ok: true, latencyMs: 80, assertionFailures: [] },
    { stepId: 's3', name: 'Submit', ok: false, latencyMs: 200, assertionFailures: ['Expected 200, got 500'] },
  ];

  it('sums all step latencies', () => {
    expect(totalLatencyMs(steps)).toBe(400);
  });

  it('returns 0 for empty steps', () => {
    expect(totalLatencyMs([])).toBe(0);
  });

  it('returns single step latency', () => {
    expect(totalLatencyMs([steps[0]])).toBe(120);
  });
});

describe('TransactionTab — failedStepCount', () => {
  const steps: TransactionStep[] = [
    { stepId: 's1', name: 'Step 1', ok: true, latencyMs: 100, assertionFailures: [] },
    { stepId: 's2', name: 'Step 2', ok: false, latencyMs: 200, assertionFailures: ['Error'] },
    { stepId: 's3', name: 'Step 3', ok: false, latencyMs: 150, assertionFailures: [] },
  ];

  it('counts failed steps', () => {
    expect(failedStepCount(steps)).toBe(2);
  });

  it('returns 0 when all pass', () => {
    const passing = steps.map((s) => ({ ...s, ok: true }));
    expect(failedStepCount(passing)).toBe(0);
  });

  it('returns total count when all fail', () => {
    const failing = steps.map((s) => ({ ...s, ok: false }));
    expect(failedStepCount(failing)).toBe(3);
  });
});

describe('TransactionTab — passedStepCount', () => {
  const steps: TransactionStep[] = [
    { stepId: 's1', name: 'Step 1', ok: true, latencyMs: 100, assertionFailures: [] },
    { stepId: 's2', name: 'Step 2', ok: false, latencyMs: 200, assertionFailures: [] },
  ];

  it('counts only ok=true steps', () => {
    expect(passedStepCount(steps)).toBe(1);
  });

  it('returns 0 for empty array', () => {
    expect(passedStepCount([])).toBe(0);
  });
});

describe('TransactionTab — allAssertionFailures', () => {
  it('collects failures from all steps', () => {
    const steps: TransactionStep[] = [
      { stepId: 's1', name: 'A', ok: false, latencyMs: 100, assertionFailures: ['Expected 200', 'Body mismatch'] },
      { stepId: 's2', name: 'B', ok: true, latencyMs: 50, assertionFailures: [] },
      { stepId: 's3', name: 'C', ok: false, latencyMs: 80, assertionFailures: ['Timeout'] },
    ];
    const failures = allAssertionFailures(steps);
    expect(failures).toHaveLength(3);
    expect(failures).toContain('Expected 200');
    expect(failures).toContain('Body mismatch');
    expect(failures).toContain('Timeout');
  });

  it('returns empty for no failures', () => {
    const steps: TransactionStep[] = [
      { stepId: 's1', name: 'A', ok: true, latencyMs: 100, assertionFailures: [] },
    ];
    expect(allAssertionFailures(steps)).toHaveLength(0);
  });
});

describe('TransactionTab — stepHasError', () => {
  it('ok=false → has error', () => {
    const step: TransactionStep = { stepId: 's1', name: 'A', ok: false, latencyMs: 100, assertionFailures: [] };
    expect(stepHasError(step)).toBe(true);
  });

  it('ok=true with no error → no error', () => {
    const step: TransactionStep = { stepId: 's1', name: 'A', ok: true, latencyMs: 100, assertionFailures: [] };
    expect(stepHasError(step)).toBe(false);
  });

  it('ok=true with error string → has error', () => {
    const step: TransactionStep = { stepId: 's1', name: 'A', ok: true, latencyMs: 100, assertionFailures: [], error: 'Network issue' };
    expect(stepHasError(step)).toBe(true);
  });
});

describe('TransactionTab — passRate', () => {
  it('all passing = 100%', () => {
    const steps: TransactionStep[] = [
      { stepId: 's1', name: 'A', ok: true, latencyMs: 100, assertionFailures: [] },
      { stepId: 's2', name: 'B', ok: true, latencyMs: 100, assertionFailures: [] },
    ];
    expect(passRate(steps)).toBe(100);
  });

  it('all failing = 0%', () => {
    const steps: TransactionStep[] = [
      { stepId: 's1', name: 'A', ok: false, latencyMs: 100, assertionFailures: [] },
    ];
    expect(passRate(steps)).toBe(0);
  });

  it('half passing = 50%', () => {
    const steps: TransactionStep[] = [
      { stepId: 's1', name: 'A', ok: true, latencyMs: 100, assertionFailures: [] },
      { stepId: 's2', name: 'B', ok: false, latencyMs: 100, assertionFailures: [] },
    ];
    expect(passRate(steps)).toBe(50);
  });

  it('empty steps = 0%', () => {
    expect(passRate([])).toBe(0);
  });
});
