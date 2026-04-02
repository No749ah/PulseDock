/**
 * Unit tests for DeliveryHistoryModal pure logic.
 *
 * Tests: delivery count summation, total/success/fail stats,
 * retry-button guard, empty state derivation, modal title derivation.
 */
import { describe, it, expect } from 'vitest';

// ── Types mirrored from component ─────────────────────────────────────────────

interface DeliveryEntry {
  id: string;
  status: 'delivered' | 'failed';
  attemptedAt: string;
  error?: string | null;
}

interface DeliveryHistory {
  successCount: number;
  failedCount: number;
  deliveries: DeliveryEntry[];
}

interface AlertChannel {
  id: string;
  name: string;
  type: string;
}

// ── Pure helpers mirrored from DeliveryHistoryModal ───────────────────────────

function totalDeliveries(history: DeliveryHistory): number {
  return history.successCount + history.failedCount;
}

function hasFailedDeliveries(history: DeliveryHistory): boolean {
  return history.deliveries.some((d) => d.status === 'failed');
}

function isEmptyHistory(history: DeliveryHistory): boolean {
  return history.deliveries.length === 0;
}

function modalTitle(selected: AlertChannel | null): string {
  return `Delivery History — ${selected?.name ?? ''}`;
}

function retryAllDisabled(retryingAll: boolean): boolean {
  return retryingAll;
}

function retryItemDisabled(deliveryId: string, retryingDeliveryId: string | null): boolean {
  return retryingDeliveryId === deliveryId;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DeliveryHistoryModal — totalDeliveries', () => {
  it('sums success and failed counts', () => {
    expect(totalDeliveries({ successCount: 5, failedCount: 2, deliveries: [] })).toBe(7);
  });

  it('returns 0 for empty history', () => {
    expect(totalDeliveries({ successCount: 0, failedCount: 0, deliveries: [] })).toBe(0);
  });

  it('handles all successes', () => {
    expect(totalDeliveries({ successCount: 10, failedCount: 0, deliveries: [] })).toBe(10);
  });

  it('handles all failures', () => {
    expect(totalDeliveries({ successCount: 0, failedCount: 3, deliveries: [] })).toBe(3);
  });

  it('is sum of success + failed (not delivery array length)', () => {
    // Stats may differ from entries length (pagination)
    const history: DeliveryHistory = {
      successCount: 100,
      failedCount: 50,
      deliveries: [{ id: 'd-1', status: 'delivered', attemptedAt: '2026-01-01T00:00:00Z' }],
    };
    expect(totalDeliveries(history)).toBe(150);
  });
});

describe('DeliveryHistoryModal — hasFailedDeliveries', () => {
  it('returns true when any delivery has failed status', () => {
    const history: DeliveryHistory = {
      successCount: 1,
      failedCount: 1,
      deliveries: [
        { id: 'd-1', status: 'delivered', attemptedAt: '2026-01-01T00:00:00Z' },
        { id: 'd-2', status: 'failed', attemptedAt: '2026-01-01T01:00:00Z', error: 'Timeout' },
      ],
    };
    expect(hasFailedDeliveries(history)).toBe(true);
  });

  it('returns false when all deliveries succeeded', () => {
    const history: DeliveryHistory = {
      successCount: 2,
      failedCount: 0,
      deliveries: [
        { id: 'd-1', status: 'delivered', attemptedAt: '2026-01-01T00:00:00Z' },
        { id: 'd-2', status: 'delivered', attemptedAt: '2026-01-01T01:00:00Z' },
      ],
    };
    expect(hasFailedDeliveries(history)).toBe(false);
  });

  it('returns false for empty deliveries list', () => {
    expect(hasFailedDeliveries({ successCount: 0, failedCount: 0, deliveries: [] })).toBe(false);
  });

  it('returns true for single failed delivery', () => {
    const history: DeliveryHistory = {
      successCount: 0,
      failedCount: 1,
      deliveries: [{ id: 'd-1', status: 'failed', attemptedAt: '2026-01-01T00:00:00Z' }],
    };
    expect(hasFailedDeliveries(history)).toBe(true);
  });
});

describe('DeliveryHistoryModal — isEmptyHistory', () => {
  it('returns true for empty deliveries array', () => {
    expect(isEmptyHistory({ successCount: 0, failedCount: 0, deliveries: [] })).toBe(true);
  });

  it('returns false when deliveries exist', () => {
    const history: DeliveryHistory = {
      successCount: 1,
      failedCount: 0,
      deliveries: [{ id: 'd-1', status: 'delivered', attemptedAt: '2026-01-01T00:00:00Z' }],
    };
    expect(isEmptyHistory(history)).toBe(false);
  });
});

describe('DeliveryHistoryModal — modalTitle', () => {
  it('includes channel name in title', () => {
    const channel: AlertChannel = { id: 'ch-1', name: 'My Slack', type: 'slack' };
    expect(modalTitle(channel)).toBe('Delivery History — My Slack');
  });

  it('handles null selected with empty suffix', () => {
    expect(modalTitle(null)).toBe('Delivery History — ');
  });

  it('starts with "Delivery History"', () => {
    const channel: AlertChannel = { id: 'ch-2', name: 'Discord Ops', type: 'discord' };
    expect(modalTitle(channel)).toMatch(/^Delivery History/);
  });
});

describe('DeliveryHistoryModal — retry disabled guards', () => {
  it('retryAllDisabled returns true when retrying', () => {
    expect(retryAllDisabled(true)).toBe(true);
  });

  it('retryAllDisabled returns false when not retrying', () => {
    expect(retryAllDisabled(false)).toBe(false);
  });

  it('retryItemDisabled matches specific delivery being retried', () => {
    expect(retryItemDisabled('d-1', 'd-1')).toBe(true);
  });

  it('retryItemDisabled false for different delivery id', () => {
    expect(retryItemDisabled('d-1', 'd-2')).toBe(false);
  });

  it('retryItemDisabled false when no delivery retrying', () => {
    expect(retryItemDisabled('d-1', null)).toBe(false);
  });
});

describe('DeliveryHistoryModal — stat consistency', () => {
  it('success rate derivation', () => {
    const history: DeliveryHistory = {
      successCount: 9,
      failedCount: 1,
      deliveries: [],
    };
    const total = totalDeliveries(history);
    const rate = (history.successCount / total) * 100;
    expect(rate).toBeCloseTo(90);
  });

  it('100% success rate when no failures', () => {
    const history: DeliveryHistory = { successCount: 5, failedCount: 0, deliveries: [] };
    const total = totalDeliveries(history);
    expect(total).toBe(5);
    expect(history.successCount / total).toBe(1.0);
  });

  it('0% success rate when all failed', () => {
    const history: DeliveryHistory = { successCount: 0, failedCount: 5, deliveries: [] };
    const total = totalDeliveries(history);
    expect(total).toBe(5);
    expect(history.successCount / total).toBe(0);
  });
});
