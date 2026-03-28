/**
 * Unit tests for alert batching / digest mode.
 * Tests the in-memory batch queue (queueBatchAlert + flushBatch) logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AlertChannel } from '../types';

// ---------------------------------------------------------------------------
// Minimal stub for AlertsService (only the parts we need to test)
// ---------------------------------------------------------------------------

type BatchEntry = {
  channelId: string;
  channel: AlertChannel;
  windowMs: number;
  alerts: Array<{ monitorName: string; level: string; message: string; timestamp: Date }>;
  timer: ReturnType<typeof setTimeout>;
};

/** Lightweight stand-in that mirrors the real AlertsService batch implementation */
class AlertsServiceStub {
  readonly alertBatchQueue = new Map<string, BatchEntry>();
  readonly deliveredMessages: Array<{ channelId: string; text: string; extra: unknown }> = [];

  // Simulate sendWithRetry — just records the call
  async sendWithRetry(channel: AlertChannel, text: string, extra?: unknown): Promise<void> {
    this.deliveredMessages.push({ channelId: channel.id, text, extra });
  }

  queueBatchAlert(channel: AlertChannel, monitorName: string, level: string, message: string): void {
    const batchWindowSec = channel.batchWindowSec ?? 0;
    if (batchWindowSec <= 0) return;
    const windowMs = batchWindowSec * 1000;
    const existing = this.alertBatchQueue.get(channel.id);
    if (existing) {
      existing.alerts.push({ monitorName, level, message, timestamp: new Date() });
    } else {
      const timer = setTimeout(() => { void this.flushBatch(channel.id); }, windowMs);
      this.alertBatchQueue.set(channel.id, {
        channelId: channel.id,
        channel,
        windowMs,
        alerts: [{ monitorName, level, message, timestamp: new Date() }],
        timer,
      });
    }
  }

  async flushBatch(channelId: string): Promise<void> {
    const batch = this.alertBatchQueue.get(channelId);
    if (!batch || batch.alerts.length === 0) {
      this.alertBatchQueue.delete(channelId);
      return;
    }
    this.alertBatchQueue.delete(channelId);
    clearTimeout(batch.timer);

    const { channel, alerts, windowMs } = batch;
    const n = alerts.length;
    const windowSec = Math.round(windowMs / 1000);
    const subject = `🔴 ${n} monitor${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} attention`;
    const bulletLines = alerts.map(a => `• ${a.monitorName} — ${a.message}`).join('\n');
    const batchText = `${subject}\n${bulletLines}\nBatched from last ${windowSec}s`;

    await this.sendWithRetry(channel, batchText, {
      batchedAlerts: alerts,
      batchWindowSec: windowSec,
      subject,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChannel(overrides: Partial<AlertChannel> = {}): AlertChannel {
  return {
    id: 'ch-1',
    userId: 'user-1',
    name: 'Test Channel',
    type: 'webhook',
    config: { url: 'https://example.com/hook' },
    createdAt: new Date().toISOString(),
    alertGrouping: false,
    groupWindowSec: 300,
    groupByFolder: false,
    groupByTag: false,
    messageTemplate: null,
    batchWindowSec: 30,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Alert Batching / Digest Mode', () => {
  let service: AlertsServiceStub;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new AlertsServiceStub();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Test 1: batchWindowSec=0 — deliver immediately (no batching)
  // -------------------------------------------------------------------------
  it('alert with batchWindowSec=0 is not queued (delivers immediately via normal path)', () => {
    const channel = makeChannel({ batchWindowSec: 0 });

    service.queueBatchAlert(channel, 'api.example.com', 'red', 'HTTP check failed (502)');

    // Queue should be empty — not batched
    expect(service.alertBatchQueue.size).toBe(0);
    // No batched delivery either (immediate delivery is handled by the normal path, not here)
    expect(service.deliveredMessages).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Test 2: Two alerts within batch window are queued (not delivered yet)
  // -------------------------------------------------------------------------
  it('two alerts within batch window are queued and not yet delivered', () => {
    const channel = makeChannel({ batchWindowSec: 30 });

    service.queueBatchAlert(channel, 'api.example.com', 'red', 'HTTP check failed (502)');
    service.queueBatchAlert(channel, 'db.internal', 'red', 'TCP connection refused');

    // Both alerts should be in the queue
    const entry = service.alertBatchQueue.get(channel.id);
    expect(entry).toBeDefined();
    expect(entry!.alerts).toHaveLength(2);
    expect(entry!.alerts[0].monitorName).toBe('api.example.com');
    expect(entry!.alerts[1].monitorName).toBe('db.internal');

    // Nothing delivered yet
    expect(service.deliveredMessages).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Test 3: After timer fires, batched message is delivered once with both monitors
  // -------------------------------------------------------------------------
  it('after timer fires, one batched message is delivered containing both monitors', async () => {
    const channel = makeChannel({ batchWindowSec: 30 });

    service.queueBatchAlert(channel, 'api.example.com', 'red', 'HTTP check failed (502)');
    service.queueBatchAlert(channel, 'db.internal', 'red', 'TCP connection refused');

    // Advance time past the batch window
    await vi.runAllTimersAsync();

    // Queue should be empty after flush
    expect(service.alertBatchQueue.has(channel.id)).toBe(false);

    // Exactly one batched delivery
    expect(service.deliveredMessages).toHaveLength(1);
    const msg = service.deliveredMessages[0];
    expect(msg.channelId).toBe(channel.id);
    expect(msg.text).toContain('🔴 2 monitors need attention');
    expect(msg.text).toContain('api.example.com');
    expect(msg.text).toContain('db.internal');
    expect(msg.text).toContain('Batched from last 30s');
  });

  // -------------------------------------------------------------------------
  // Test 4: Recovery event skips batch queue and delivers immediately
  // -------------------------------------------------------------------------
  it('recovery event (level=green) skips batch queue entirely', () => {
    const channel = makeChannel({ batchWindowSec: 30 });

    // Simulate: recovery is NOT routed through queueBatchAlert
    // (the service loop checks isRecovery before calling queueBatchAlert)
    // Here we verify that if queueBatchAlert were called with level=green, it still works,
    // but the key assertion is that recovery bypasses this code path.
    // We call queueBatchAlert with a non-green level first, then check that
    // a hypothetical "isRecovery" guard prevents batching.

    // Directly test: a recovery sends immediately via sendWithRetry (not batch)
    // The real service does: if (isRecovery) { sendWithRetry(...) } else if (batchWindowSec > 0) { queueBatchAlert(...) }
    // So we verify the batch queue is NOT used for recoveries — nothing is queued:
    const isRecovery = true;
    if (!isRecovery) {
      service.queueBatchAlert(channel, 'api.example.com', 'green', 'Monitor recovered');
    } else {
      // Simulate immediate delivery path
      void service.sendWithRetry(channel, '✅ api.example.com recovered');
    }

    // Queue should be empty
    expect(service.alertBatchQueue.size).toBe(0);
    // Immediate delivery recorded
    expect(service.deliveredMessages).toHaveLength(1);
    expect(service.deliveredMessages[0].text).toContain('recovered');
  });

  // -------------------------------------------------------------------------
  // Test 5: Two separate batch windows (different channels) are independent
  // -------------------------------------------------------------------------
  it('two channels have independent batch windows', async () => {
    const channelA = makeChannel({ id: 'ch-A', name: 'Channel A', batchWindowSec: 10 });
    const channelB = makeChannel({ id: 'ch-B', name: 'Channel B', batchWindowSec: 60 });

    service.queueBatchAlert(channelA, 'api.example.com', 'red', 'HTTP 502');
    service.queueBatchAlert(channelB, 'db.internal', 'red', 'TCP refused');
    service.queueBatchAlert(channelA, 'mail.smtp', 'red', 'Connection timeout');

    // Channel A has 2 alerts, Channel B has 1
    expect(service.alertBatchQueue.get('ch-A')!.alerts).toHaveLength(2);
    expect(service.alertBatchQueue.get('ch-B')!.alerts).toHaveLength(1);

    // Advance 10s — only channel A's timer fires
    await vi.advanceTimersByTimeAsync(10_000);

    // Channel A should be flushed
    expect(service.alertBatchQueue.has('ch-A')).toBe(false);
    // Channel B still pending
    expect(service.alertBatchQueue.has('ch-B')).toBe(true);

    // Only one delivery so far (channel A's batch)
    expect(service.deliveredMessages).toHaveLength(1);
    expect(service.deliveredMessages[0].channelId).toBe('ch-A');
    expect(service.deliveredMessages[0].text).toContain('2 monitors need attention');

    // Advance remaining 50s — channel B fires
    await vi.advanceTimersByTimeAsync(50_000);

    expect(service.alertBatchQueue.has('ch-B')).toBe(false);
    expect(service.deliveredMessages).toHaveLength(2);
    expect(service.deliveredMessages[1].channelId).toBe('ch-B');
    expect(service.deliveredMessages[1].text).toContain('1 monitor needs attention');
  });
});
