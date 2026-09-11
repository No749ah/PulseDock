import { describe, it, expect } from 'vitest';
import { SEVERITIES, severityColors, stepTypeColors } from './helpers';

describe('playbooks helpers', () => {
  it('SEVERITIES has expected 4 entries in order', () => {
    expect(SEVERITIES).toHaveLength(4);
    expect(SEVERITIES).toEqual(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
  });

  it('severityColors has expected classes per severity', () => {
    expect(Object.keys(severityColors)).toHaveLength(4);
    expect(severityColors.CRITICAL).toBe('bg-red-500/20 text-red-400 border-red-500/30');
    expect(severityColors.HIGH).toBe('bg-orange-500/20 text-orange-400 border-orange-500/30');
    expect(severityColors.MEDIUM).toBe('bg-yellow-500/20 text-yellow-400 border-yellow-500/30');
    expect(severityColors.LOW).toBe('bg-blue-500/20 text-blue-400 border-blue-500/30');
  });

  it('stepTypeColors has expected classes per step type', () => {
    expect(Object.keys(stepTypeColors)).toHaveLength(5);
    expect(stepTypeColors.check).toBe('bg-blue-500/20 text-blue-400');
    expect(stepTypeColors.escalate).toBe('bg-red-500/20 text-red-400');
    expect(stepTypeColors.runbook).toBe('bg-purple-500/20 text-purple-400');
    expect(stepTypeColors.command).toBe('bg-zinc-500/20 text-zinc-400');
    expect(stepTypeColors.notify).toBe('bg-green-500/20 text-green-400');
  });

  it("severityColors['UNKNOWN'] is undefined", () => {
    expect(severityColors.UNKNOWN).toBeUndefined();
  });
});
