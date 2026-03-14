import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

function makeNotificationsService(): NotificationsService {
  return {
    getPreference: vi.fn().mockResolvedValue({
      userId: 'user-1',
      emailEnabled: true,
      alertLevels: ['error', 'warning'],
      quietHoursStart: null,
      quietHoursEnd: null,
      digestFrequency: 'instant',
    }),
    updatePreference: vi.fn().mockResolvedValue({
      userId: 'user-1',
      emailEnabled: false,
      alertLevels: ['error'],
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      digestFrequency: 'daily',
    }),
    shouldNotify: vi.fn().mockResolvedValue(true),
  } as unknown as NotificationsService;
}

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notificationsService: NotificationsService;

  beforeEach(() => {
    notificationsService = makeNotificationsService();
    controller = new NotificationsController(notificationsService);
  });

  describe('getPreference()', () => {
    it('returns notification preferences for the user', async () => {
      const req = { user: { sub: 'user-1' } };
      const result = await controller.getPreference(req);
      expect(notificationsService.getPreference).toHaveBeenCalledWith('user-1');
      expect(result).toMatchObject({ userId: 'user-1', emailEnabled: true });
    });

    it('uses req.user.sub as userId', async () => {
      const req = { user: { sub: 'user-abc' } };
      await controller.getPreference(req);
      expect(notificationsService.getPreference).toHaveBeenCalledWith('user-abc');
    });
  });

  describe('updatePreference()', () => {
    it('updates and returns preferences', async () => {
      const req = { user: { sub: 'user-1' } };
      const dto = { emailEnabled: false, digestFrequency: 'daily' as const };
      const result = await controller.updatePreference(req, dto);
      expect(notificationsService.updatePreference).toHaveBeenCalledWith('user-1', dto);
      expect(result).toMatchObject({ emailEnabled: false, digestFrequency: 'daily' });
    });

    it('passes partial update DTO to service', async () => {
      const req = { user: { sub: 'user-2' } };
      const dto = { quietHoursStart: '22:00', quietHoursEnd: '08:00' };
      await controller.updatePreference(req, dto);
      expect(notificationsService.updatePreference).toHaveBeenCalledWith('user-2', dto);
    });
  });
});
