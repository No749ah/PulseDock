import { describe, it, expect } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MonitorsAnalyticsService } from './monitors-analytics.service';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeRun(message: string, checkedAt: Date, ok = false) {
  return { message, checkedAt, ok };
}

function makeService(overrides: {
  monitorFindFirst?: (args: unknown) => unknown;
  monitorRunFindMany?: (args: unknown) => unknown;
}): MonitorsAnalyticsService {
  const prismaMock = {
    monitor: {
      findFirst: overrides.monitorFindFirst ?? ((_args: unknown) => ({ id: 'mon1', userId: 'user1' })),
    },
    monitorRun: {
      findMany: overrides.monitorRunFindMany ?? ((_args: unknown) => []),
    },
  };
  return new (MonitorsAnalyticsService as unknown as new (...args: unknown[]) => MonitorsAnalyticsService)(prismaMock as never);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MonitorsService.failurePatterns', () => {

  // 1. Returns empty when no failures
  it('returns zero patterns when there are no failed runs', async () => {
    const svc = makeService({
      monitorRunFindMany: () => [],
    });
    const result = await svc.failurePatterns('user1', 'mon1', 30);
    expect(result.totalFailures).toBe(0);
    expect(result.uniquePatterns).toBe(0);
    expect(result.patterns).toHaveLength(0);
  });

  // 2. Throws NotFoundException when monitor not found
  it('throws NotFoundException when monitor does not belong to user', async () => {
    const svc = makeService({
      monitorFindFirst: () => null,
    });
    await expect(svc.failurePatterns('user1', 'bad-mon', 30)).rejects.toThrow(NotFoundException);
  });

  // 3. Groups identical messages into a single pattern
  it('groups identical messages into one pattern with correct count', async () => {
    const base = new Date('2024-01-15T12:00:00Z');
    const svc = makeService({
      monitorRunFindMany: () => [
        makeRun('Connection refused', new Date('2024-01-15T10:00:00Z')),
        makeRun('Connection refused', new Date('2024-01-15T11:00:00Z')),
        makeRun('Connection refused', new Date('2024-01-15T12:00:00Z')),
      ],
    });
    const result = await svc.failurePatterns('user1', 'mon1', 30);
    expect(result.totalFailures).toBe(3);
    expect(result.uniquePatterns).toBe(1);
    expect(result.patterns[0].count).toBe(3);
    expect(result.patterns[0].percentage).toBe(100);
  });

  // 4. Normalizes dynamic values (IPs, HTTP codes) into placeholders
  it('normalizes IP addresses and HTTP status codes into patterns', async () => {
    const svc = makeService({
      monitorRunFindMany: () => [
        makeRun('HTTP status: 503 from 192.168.1.100', new Date('2024-01-15T10:00:00Z')),
        makeRun('HTTP status: 503 from 10.0.0.1', new Date('2024-01-15T11:00:00Z')),
        makeRun('HTTP status: 503 from 172.16.0.5', new Date('2024-01-15T12:00:00Z')),
      ],
    });
    const result = await svc.failurePatterns('user1', 'mon1', 30);
    // All 3 should normalize to the same pattern (IP replaced by <IP>, code by <CODE>)
    expect(result.uniquePatterns).toBe(1);
    expect(result.patterns[0].count).toBe(3);
    expect(result.patterns[0].pattern).toContain('<IP>');
  });

  // 5. Returns patterns sorted by frequency (most frequent first)
  it('sorts patterns by count descending', async () => {
    const svc = makeService({
      monitorRunFindMany: () => [
        makeRun('Timeout error', new Date('2024-01-15T10:00:00Z')),
        makeRun('Connection refused', new Date('2024-01-15T10:05:00Z')),
        makeRun('Timeout error', new Date('2024-01-15T10:10:00Z')),
        makeRun('Timeout error', new Date('2024-01-15T10:15:00Z')),
        makeRun('DNS resolution failed', new Date('2024-01-15T10:20:00Z')),
      ],
    });
    const result = await svc.failurePatterns('user1', 'mon1', 30);
    expect(result.uniquePatterns).toBe(3);
    expect(result.patterns[0].count).toBe(3); // Timeout error is most frequent
    expect(result.patterns[0].pattern).toContain('Timeout error');
    expect(result.patterns[1].count).toBe(1); // Remaining two each appear once
    expect(result.patterns[2].count).toBe(1);
  });

  // 6. Records firstSeen and lastSeen timestamps correctly
  it('tracks firstSeen and lastSeen per pattern', async () => {
    const first = new Date('2024-01-10T08:00:00Z');
    const last = new Date('2024-01-20T18:00:00Z');
    const svc = makeService({
      monitorRunFindMany: () => [
        makeRun('SSL certificate expired', first),
        makeRun('SSL certificate expired', new Date('2024-01-15T12:00:00Z')),
        makeRun('SSL certificate expired', last),
      ],
    });
    const result = await svc.failurePatterns('user1', 'mon1', 30);
    expect(result.patterns[0].firstSeen).toEqual(first);
    expect(result.patterns[0].lastSeen).toEqual(last);
  });

  // 7. weeklyTrend has 7 buckets
  it('weeklyTrend always has exactly 7 buckets', async () => {
    const svc = makeService({
      monitorRunFindMany: () => [
        makeRun('Error', new Date('2024-01-15T10:00:00Z')),
      ],
    });
    const result = await svc.failurePatterns('user1', 'mon1', 30);
    expect(result.patterns[0].weeklyTrend).toHaveLength(7);
  });

  // 8. Percentage sums to 100 for a single pattern
  it('percentage is 100 when all failures have the same pattern', async () => {
    const svc = makeService({
      monitorRunFindMany: () => [
        makeRun('Read timeout', new Date('2024-01-15T10:00:00Z')),
        makeRun('Read timeout', new Date('2024-01-15T11:00:00Z')),
      ],
    });
    const result = await svc.failurePatterns('user1', 'mon1', 30);
    expect(result.patterns[0].percentage).toBe(100);
  });

  // 9. Normalizes UUIDs
  it('normalizes UUID values in messages', async () => {
    const svc = makeService({
      monitorRunFindMany: () => [
        makeRun('Request a3f7c2b0-1234-5678-abcd-ef0123456789 failed', new Date('2024-01-15T10:00:00Z')),
        makeRun('Request 00000000-0000-0000-0000-000000000001 failed', new Date('2024-01-15T11:00:00Z')),
      ],
    });
    const result = await svc.failurePatterns('user1', 'mon1', 30);
    expect(result.uniquePatterns).toBe(1);
    expect(result.patterns[0].pattern).toContain('<UUID>');
  });

  // 10. Sets exampleMessage to actual raw message
  it('retains original raw message as exampleMessage', async () => {
    const rawMsg = 'Connection refused to 192.168.1.1:8080';
    const svc = makeService({
      monitorRunFindMany: () => [
        makeRun(rawMsg, new Date('2024-01-15T10:00:00Z')),
      ],
    });
    const result = await svc.failurePatterns('user1', 'mon1', 30);
    expect(result.patterns[0].exampleMessage).toBe(rawMsg);
  });
});
