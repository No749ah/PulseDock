import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DemoService } from './demo.service';

const mockPrisma = {
  monitor: { count: vi.fn(), create: vi.fn() },
  alertChannel: { create: vi.fn() },
};

const mockMonitorsService = {
  create: vi.fn(),
};

const mockStatusPagesService = {
  create: vi.fn(),
};

function makeService() {
  return new DemoService(
    mockPrisma as never,
    mockMonitorsService as never,
    mockStatusPagesService as never,
  );
}

describe('DemoService.seed()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.alertChannel.create.mockResolvedValue({ id: 'ch-1' });
    mockMonitorsService.create.mockImplementation((_uid: string, body: { name: string }) =>
      Promise.resolve({ id: `m-${body.name.slice(0, 4)}` }),
    );
    mockStatusPagesService.create.mockResolvedValue({ id: 'sp-1', slug: 'demo-abcd1234' });
  });

  it('seeds monitors, alert channel, and status page when user has fewer than 3 monitors', async () => {
    mockPrisma.monitor.count.mockResolvedValue(0);
    const svc = makeService();
    const result = await svc.seed('user-1');

    expect(result.alreadySeeded).toBe(false);
    expect(result.alertChannelId).toBe('ch-1');
    expect(result.monitors.length).toBeGreaterThan(0);
    expect(result.statusPageId).toBe('sp-1');
    expect(result.statusPageSlug).toBe('demo-abcd1234');
  });

  it('returns alreadySeeded=true when user already has 3+ monitors', async () => {
    mockPrisma.monitor.count.mockResolvedValue(5);
    const svc = makeService();
    const result = await svc.seed('user-1');

    expect(result.alreadySeeded).toBe(true);
    expect(result.monitors).toHaveLength(0);
    expect(mockPrisma.alertChannel.create).not.toHaveBeenCalled();
  });

  it('returns alreadySeeded=true at exactly 3 monitors', async () => {
    mockPrisma.monitor.count.mockResolvedValue(3);
    const svc = makeService();
    const result = await svc.seed('user-1');
    expect(result.alreadySeeded).toBe(true);
  });

  it('still succeeds when a single monitor creation fails', async () => {
    mockPrisma.monitor.count.mockResolvedValue(0);
    let callCount = 0;
    mockMonitorsService.create.mockImplementation(() => {
      callCount++;
      if (callCount === 2) return Promise.reject(new Error('network error'));
      return Promise.resolve({ id: `m-${callCount}` });
    });
    const svc = makeService();
    const result = await svc.seed('user-1');

    expect(result.alreadySeeded).toBe(false);
    expect(result.monitors.length).toBeGreaterThan(0);
  });

  it('returns statusPageId=null when status page creation fails', async () => {
    mockPrisma.monitor.count.mockResolvedValue(0);
    mockStatusPagesService.create.mockRejectedValue(new Error('slug conflict'));
    const svc = makeService();
    const result = await svc.seed('user-1');

    expect(result.statusPageId).toBeNull();
    expect(result.alreadySeeded).toBe(false);
    expect(result.monitors.length).toBeGreaterThan(0);
  });
});
