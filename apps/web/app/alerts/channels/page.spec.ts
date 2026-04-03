import { describe, it, expect } from 'vitest';
import { STATUS_LABELS, STATUS_COLORS, STATUS_BG, relativeTime } from './helpers';

describe('alerts channels helpers', () => {
  it('STATUS_LABELS has expected labels', () => {
    expect(Object.keys(STATUS_LABELS)).toHaveLength(4);
    expect(STATUS_LABELS.healthy).toBe('Healthy');
    expect(STATUS_LABELS.degraded).toBe('Degraded');
    expect(STATUS_LABELS.failing).toBe('Failing');
    expect(STATUS_LABELS.untested).toBe('Untested');
  });

  it('STATUS_COLORS has expected text classes', () => {
    expect(Object.keys(STATUS_COLORS)).toHaveLength(4);
    expect(STATUS_COLORS.healthy).toBe('text-emerald-400');
    expect(STATUS_COLORS.degraded).toBe('text-yellow-400');
    expect(STATUS_COLORS.failing).toBe('text-red-400');
    expect(STATUS_COLORS.untested).toBe('text-zinc-400');
  });

  it('STATUS_BG has expected bg classes', () => {
    expect(Object.keys(STATUS_BG)).toHaveLength(4);
    expect(STATUS_BG.healthy).toBe('bg-emerald-500/10');
    expect(STATUS_BG.degraded).toBe('bg-yellow-500/10');
    expect(STATUS_BG.failing).toBe('bg-red-500/10');
    expect(STATUS_BG.untested).toBe('bg-zinc-500/10');
  });

  it("relativeTime(null) returns 'Never'", () => {
    expect(relativeTime(null)).toBe('Never');
  });

  it("relativeTime for under a minute returns 'Just now'", () => {
    expect(relativeTime(new Date(Date.now() - 30000).toISOString())).toBe('Just now');
  });

  it("relativeTime for 5 minutes returns '5m ago'", () => {
    expect(relativeTime(new Date(Date.now() - 5 * 60000).toISOString())).toBe('5m ago');
  });

  it("relativeTime for 2 hours returns '2h ago'", () => {
    expect(relativeTime(new Date(Date.now() - 2 * 3600000).toISOString())).toBe('2h ago');
  });

  it("relativeTime for 3 days returns '3d ago'", () => {
    expect(relativeTime(new Date(Date.now() - 3 * 86400000).toISOString())).toBe('3d ago');
  });
});
