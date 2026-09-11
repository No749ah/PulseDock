import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeartbeatController } from './heartbeat.controller';

function makeChecksService() {
  return {
    handleHeartbeatPing: vi.fn(),
  };
}

describe('HeartbeatController', () => {
  let controller: HeartbeatController;
  let service: ReturnType<typeof makeChecksService>;

  beforeEach(() => {
    service = makeChecksService();
    controller = new HeartbeatController(service as never);
  });

  describe('pingHeartbeat()', () => {
    it('delegates to checksService.handleHeartbeatPing and returns ok:true', async () => {
      service.handleHeartbeatPing.mockResolvedValue(undefined);
      const result = await controller.pingHeartbeat('tok-abc123');
      expect(service.handleHeartbeatPing).toHaveBeenCalledWith('tok-abc123');
      expect(result).toEqual({ ok: true });
    });

    it('propagates NotFoundException when token not found', async () => {
      service.handleHeartbeatPing.mockRejectedValue(new Error('not found'));
      await expect(controller.pingHeartbeat('invalid-token')).rejects.toThrow('not found');
    });

    it('passes the exact token string to the service', async () => {
      service.handleHeartbeatPing.mockResolvedValue(undefined);
      await controller.pingHeartbeat('hb_deadbeef1234');
      expect(service.handleHeartbeatPing).toHaveBeenCalledWith('hb_deadbeef1234');
    });
  });
});
