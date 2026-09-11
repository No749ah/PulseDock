import { describe, expect, it } from 'vitest';
import { formatLatency, formatUptime, statusColor, statusLabel } from './helpers';

describe('embed helpers', () => {
  it('statusColor maps statuses and default', () => {
    expect(statusColor('up')).toBe('#3fb950');
    expect(statusColor('degraded')).toBe('#d29922');
    expect(statusColor('down')).toBe('#f85149');
    expect(statusColor('paused')).toBe('#9ca3af');
    expect(statusColor('unknown' as never)).toBe('#9ca3af');
  });

  it('statusLabel maps statuses and unknown', () => {
    expect(statusLabel('up')).toBe('Operational');
    expect(statusLabel('degraded')).toBe('Degraded');
    expect(statusLabel('down')).toBe('Down');
    expect(statusLabel('paused')).toBe('Paused');
    expect(statusLabel('unknown' as never)).toBe('Unknown');
  });

  it('formatUptime formats with 2 decimals', () => {
    expect(formatUptime(99.5)).toBe('99.50%');
    expect(formatUptime(100)).toBe('100.00%');
    expect(formatUptime(0)).toBe('0.00%');
  });

  it('formatLatency formats null, ms and seconds', () => {
    expect(formatLatency(null)).toBe('—');
    expect(formatLatency(250)).toBe('250ms');
    expect(formatLatency(1500)).toBe('1.5s');
    expect(formatLatency(999)).toBe('999ms');
    expect(formatLatency(1000)).toBe('1.0s');
  });
});
