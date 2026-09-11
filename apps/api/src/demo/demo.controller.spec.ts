import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DemoController } from './demo.controller';
import { DemoService, SeedResult } from './demo.service';

describe('DemoController', () => {
  let controller: DemoController;
  let service: { seed: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    service = { seed: vi.fn() };
    controller = new DemoController(service as unknown as DemoService);
  });

  it('calls seed with user id and returns result', async () => {
    const result: SeedResult = {
      monitors: ['m1', 'm2'],
      alertChannelId: 'ac1',
      statusPageId: 'sp1',
      statusPageSlug: 'demo-abc123',
      alreadySeeded: false,
    };
    service.seed.mockResolvedValue(result);

    const res = await controller.seed({ user: { id: 'user-1' } });

    expect(service.seed).toHaveBeenCalledWith('user-1');
    expect(res).toEqual(result);
  });

  it('returns alreadySeeded when user has enough data', async () => {
    const result: SeedResult = {
      monitors: [],
      alertChannelId: null,
      statusPageId: null,
      statusPageSlug: null,
      alreadySeeded: true,
    };
    service.seed.mockResolvedValue(result);

    const res = await controller.seed({ user: { id: 'user-2' } });

    expect(res.alreadySeeded).toBe(true);
    expect(res.monitors).toHaveLength(0);
  });

  it('propagates service errors', async () => {
    service.seed.mockRejectedValue(new Error('DB down'));

    await expect(controller.seed({ user: { id: 'user-3' } })).rejects.toThrow('DB down');
  });
});
