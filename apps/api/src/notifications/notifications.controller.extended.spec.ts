/**
 * Extended coverage for NotificationsController — tests for getDigestQueue and triggerDigest
 * which are not covered by the existing spec.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

function makeNotificationsService(): NotificationsService {
  return {
    getPreference: vi.fn().mockResolvedValue({ frequency: 'instant' }),
    updatePreference: vi.fn().mockResolvedValue({}),
    shouldNotify: vi.fn().mockResolvedValue(true),
    getDigestQueue: vi.fn().mockResolvedValue({ pending: [], sent: [] }),
    sendHourlyDigests: vi.fn().mockResolvedValue(undefined),
    sendDailyDigests: vi.fn().mockResolvedValue(undefined),
    sendWeeklyDigests: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsService;
}

describe('NotificationsController – extended coverage', () => {
  let controller: NotificationsController;
  let service: NotificationsService;

  beforeEach(() => {
    service = makeNotificationsService();
    controller = new NotificationsController(service);
  });

  describe('getDigestQueue()', () => {
    it('returns digest queue for the current user', async () => {
      const req = { user: { id: 'user-1' } };
      const result = await controller.getDigestQueue(req);

      expect(service.getDigestQueue).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ pending: [], sent: [] });
    });
  });

  describe('triggerDigest()', () => {
    it('triggers hourly digest when frequency is hourly_digest', async () => {
      vi.mocked(service.getPreference).mockResolvedValue({ frequency: 'hourly_digest' } as never);
      const req = { user: { id: 'user-1' } };

      const result = await controller.triggerDigest(req);

      expect(service.getPreference).toHaveBeenCalledWith('user-1');
      expect(service.sendHourlyDigests).toHaveBeenCalledOnce();
      expect(service.sendDailyDigests).not.toHaveBeenCalled();
      expect(result).toEqual({ triggered: true, frequency: 'hourly_digest' });
    });

    it('triggers daily digest when frequency is daily_digest', async () => {
      vi.mocked(service.getPreference).mockResolvedValue({ frequency: 'daily_digest' } as never);
      const req = { user: { id: 'user-2' } };

      const result = await controller.triggerDigest(req);

      expect(service.sendDailyDigests).toHaveBeenCalledOnce();
      expect(service.sendHourlyDigests).not.toHaveBeenCalled();
      expect(result).toEqual({ triggered: true, frequency: 'daily_digest' });
    });

    it('triggers weekly digest when frequency is weekly_digest', async () => {
      vi.mocked(service.getPreference).mockResolvedValue({ frequency: 'weekly_digest' } as never);
      const req = { user: { id: 'user-4' } };

      const result = await controller.triggerDigest(req);

      expect(service.sendWeeklyDigests).toHaveBeenCalledOnce();
      expect(service.sendHourlyDigests).not.toHaveBeenCalled();
      expect(service.sendDailyDigests).not.toHaveBeenCalled();
      expect(result).toEqual({ triggered: true, frequency: 'weekly_digest' });
    });

    it('triggers no digest when frequency is instant', async () => {
      vi.mocked(service.getPreference).mockResolvedValue({ frequency: 'instant' } as never);
      const req = { user: { id: 'user-3' } };

      const result = await controller.triggerDigest(req);

      expect(service.sendHourlyDigests).not.toHaveBeenCalled();
      expect(service.sendDailyDigests).not.toHaveBeenCalled();
      expect(result).toEqual({ triggered: true, frequency: 'instant' });
    });
  });
});
