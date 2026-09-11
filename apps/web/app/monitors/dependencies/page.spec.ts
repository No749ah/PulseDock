import { describe, expect, it } from 'vitest';
import { computeLayout, statusBg, statusColor, statusTextClass } from './helpers';

describe('dependencies helpers', () => {
  describe('computeLayout', () => {
    it('returns empty map for empty nodes', () => {
      const positions = computeLayout([], []);
      expect(positions.size).toBe(0);
    });

    it('positions a single node', () => {
      const positions = computeLayout([{ id: 'a' }], []);
      expect(positions.size).toBe(1);
      expect(positions.get('a')).toEqual({ x: 0, y: -30 });
    });

    it('puts 2 connected nodes on different layers', () => {
      const positions = computeLayout(
        [{ id: 'a' }, { id: 'b' }],
        [{ source: 'a', target: 'b' }],
      );

      expect(positions.get('a')?.x).toBe(0);
      expect(positions.get('b')?.x).toBe(260);
    });

    it('keeps nodes with no incoming edges at layer 0', () => {
      const positions = computeLayout(
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        [
          { source: 'a', target: 'c' },
          { source: 'b', target: 'c' },
        ],
      );

      expect(positions.get('a')?.x).toBe(0);
      expect(positions.get('b')?.x).toBe(0);
      expect(positions.get('c')?.x).toBe(260);
    });

    it('handles cycles by assigning positions to all nodes', () => {
      const positions = computeLayout(
        [{ id: 'a' }, { id: 'b' }],
        [
          { source: 'a', target: 'b' },
          { source: 'b', target: 'a' },
        ],
      );

      expect(positions.size).toBe(2);
      expect(positions.has('a')).toBe(true);
      expect(positions.has('b')).toBe(true);
    });

    it('keeps isolated nodes at layer 0', () => {
      const positions = computeLayout(
        [{ id: 'a' }, { id: 'b' }, { id: 'iso' }],
        [{ source: 'a', target: 'b' }],
      );

      expect(positions.get('iso')?.x).toBe(0);
    });
  });

  it('statusColor maps all statuses + default', () => {
    expect(statusColor('up')).toBe('#22c55e');
    expect(statusColor('degraded')).toBe('#eab308');
    expect(statusColor('down')).toBe('#ef4444');
    expect(statusColor('paused')).toBe('#6b7280');
    expect(statusColor('no-data')).toBe('#374151');
    expect(statusColor('unknown' as never)).toBe('#374151');
  });

  it('statusBg maps all statuses + default', () => {
    expect(statusBg('up')).toBe('#052e16');
    expect(statusBg('degraded')).toBe('#1c1400');
    expect(statusBg('down')).toBe('#1c0000');
    expect(statusBg('paused')).toBe('#111827');
    expect(statusBg('no-data')).toBe('#111827');
    expect(statusBg('unknown' as never)).toBe('#111827');
  });

  it('statusTextClass maps all statuses', () => {
    expect(statusTextClass('up')).toBe('text-green-400');
    expect(statusTextClass('degraded')).toBe('text-yellow-400');
    expect(statusTextClass('down')).toBe('text-red-400');
    expect(statusTextClass('paused')).toBe('text-gray-400');
    expect(statusTextClass('no-data')).toBe('text-gray-500');
  });
});
