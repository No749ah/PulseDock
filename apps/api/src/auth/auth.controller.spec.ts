import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthController } from './auth.controller';

function makeRes() {
  const res = {
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
  };
  return res;
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    headers: { 'user-agent': 'test-agent' },
    ip: '127.0.0.1',
    cookies: {},
    user: { id: 'user-1', email: 'user@example.com', role: 'user' },
    ...overrides,
  };
}

function makeAuthService() {
  return {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    revokeSessionByToken: vi.fn().mockResolvedValue(undefined),
    getInviteInfo: vi.fn(),
    acceptInvite: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    isMailConfigured: vi.fn(),
    setup2FA: vi.fn(),
    verifyAndEnable2FA: vi.fn(),
    disable2FA: vi.fn(),
    regenerateRecoveryCodes: vi.fn(),
    verifyTotpLogin: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    listSessions: vi.fn(),
    revokeSession: vi.fn(),
    getAuditLog: vi.fn(),
    exportAuditLog: vi.fn(),
  };
}

describe('AuthController', () => {
  let controller: AuthController;
  let authService: ReturnType<typeof makeAuthService>;

  beforeEach(() => {
    authService = makeAuthService();
    controller = new AuthController(authService as never);
  });

  describe('register()', () => {
    it('delegates to authService.register', async () => {
      authService.register.mockResolvedValue({ ok: true });
      const result = await controller.register({ email: 'test@example.com', password: 'Password123!' });
      expect(authService.register).toHaveBeenCalledWith('test@example.com', 'Password123!');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('login()', () => {
    it('calls authService.login and sets cookies', async () => {
      const tokens = { accessToken: 'acc', refreshToken: 'ref', user: { id: 'u1', email: 'a@b.com' } };
      authService.login.mockResolvedValue(tokens);
      const req = makeReq();
      const res = makeRes();

      const result = await controller.login(req, res, { email: 'a@b.com', password: 'pass', totpCode: undefined });

      expect(authService.login).toHaveBeenCalledWith('a@b.com', 'pass', expect.objectContaining({ userAgent: 'test-agent', ipAddress: '127.0.0.1' }));
      expect(res.cookie).toHaveBeenCalledWith('pulsedock_token', 'acc', expect.any(Object));
      expect(res.cookie).toHaveBeenCalledWith('pulsedock_refresh', 'ref', expect.any(Object));
      expect(result).toEqual(tokens);
    });
  });

  describe('refresh()', () => {
    it('prefers cookie refresh token over body', async () => {
      const tokens = { accessToken: 'new-acc', refreshToken: 'new-ref' };
      authService.refresh.mockResolvedValue(tokens);
      const req = makeReq({ cookies: { pulsedock_refresh: 'cookie-token' } });
      const res = makeRes();

      await controller.refresh(req, res, { refreshToken: 'body-token' });

      expect(authService.refresh).toHaveBeenCalledWith('cookie-token', expect.any(Object));
    });

    it('falls back to body refresh token when no cookie', async () => {
      const tokens = { accessToken: 'new-acc', refreshToken: 'new-ref' };
      authService.refresh.mockResolvedValue(tokens);
      const req = makeReq({ cookies: {} });
      const res = makeRes();

      await controller.refresh(req, res, { refreshToken: 'body-token' });

      expect(authService.refresh).toHaveBeenCalledWith('body-token', expect.any(Object));
    });
  });

  describe('inviteInfo()', () => {
    it('delegates to authService.getInviteInfo', async () => {
      authService.getInviteInfo.mockResolvedValue({ inviterEmail: 'admin@example.com', expiresAt: new Date().toISOString() });
      const result = await controller.inviteInfo({ token: 'tok-123' });
      expect(authService.getInviteInfo).toHaveBeenCalledWith('tok-123');
      expect(result).toMatchObject({ inviterEmail: 'admin@example.com' });
    });
  });

  describe('acceptInvite()', () => {
    it('delegates to authService.acceptInvite', async () => {
      authService.acceptInvite.mockResolvedValue({ accessToken: 'tok', refreshToken: 'ref', user: {} });
      const res = makeRes();
      await controller.acceptInvite(res, { token: 'tok', password: 'Passw0rd!!' });
      expect(authService.acceptInvite).toHaveBeenCalledWith('tok', 'Passw0rd!!');
    });
  });

  describe('verifyEmail()', () => {
    it('delegates to authService.verifyEmail', async () => {
      authService.verifyEmail.mockResolvedValue({ ok: true });
      const result = await controller.verifyEmail({ token: 'verify-tok' });
      expect(authService.verifyEmail).toHaveBeenCalledWith('verify-tok');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('resendVerification()', () => {
    it('delegates to authService.resendVerification', async () => {
      authService.resendVerification.mockResolvedValue({ ok: true });
      const result = await controller.resendVerification({ email: 'user@example.com' });
      expect(authService.resendVerification).toHaveBeenCalledWith('user@example.com');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('mailConfigured()', () => {
    it('returns { enabled: true } when mail is configured', () => {
      authService.isMailConfigured.mockReturnValue(true);
      const result = controller.mailConfigured();
      expect(result).toEqual({ enabled: true });
    });

    it('returns { enabled: false } when mail is not configured', () => {
      authService.isMailConfigured.mockReturnValue(false);
      const result = controller.mailConfigured();
      expect(result).toEqual({ enabled: false });
    });
  });

  describe('requestPasswordReset()', () => {
    it('delegates to authService.requestPasswordReset', async () => {
      authService.requestPasswordReset.mockResolvedValue({ ok: true });
      const result = await controller.requestPasswordReset({ email: 'user@example.com' });
      expect(authService.requestPasswordReset).toHaveBeenCalledWith('user@example.com');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('resetPassword()', () => {
    it('delegates to authService.resetPassword and sets cookies if tokens returned', async () => {
      authService.resetPassword.mockResolvedValue({ accessToken: 'acc', refreshToken: 'ref', ok: true });
      const res = makeRes();
      const result = await controller.resetPassword(res, { token: 'reset-tok', newPassword: 'NewPass123!' });
      expect(authService.resetPassword).toHaveBeenCalledWith('reset-tok', 'NewPass123!');
      expect(res.cookie).toHaveBeenCalledWith('pulsedock_token', 'acc', expect.any(Object));
    });
  });

  describe('logout()', () => {
    it('clears cookies and returns ok', async () => {
      const req = makeReq({ cookies: { pulsedock_token: 'some-token' } });
      const res = makeRes();

      const result = await controller.logout(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith('pulsedock_token', expect.any(Object));
      expect(res.clearCookie).toHaveBeenCalledWith('pulsedock_refresh', expect.any(Object));
      expect(result).toEqual({ ok: true });
    });

    it('clears cookies even when no token cookie present', async () => {
      const req = makeReq({ cookies: {} });
      const res = makeRes();

      const result = await controller.logout(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith('pulsedock_token', expect.any(Object));
      expect(result).toEqual({ ok: true });
    });
  });

  describe('getCsrf()', () => {
    it('returns a csrf token string', () => {
      const res = makeRes();
      const result = controller.getCsrf(res) as Record<string, unknown>;
      expect(result).toHaveProperty('csrfToken');
      expect(typeof result['csrfToken']).toBe('string');
      expect((result['csrfToken'] as string).length).toBeGreaterThan(0);
    });
  });

  describe('me()', () => {
    it('returns user from request', () => {
      const req = makeReq({ user: { id: 'user-1', email: 'a@b.com', role: 'user' } });
      const result = controller.me(req);
      expect(result).toMatchObject({ id: 'user-1', email: 'a@b.com' });
    });

    it('returns null when no user on request', () => {
      const req = makeReq({ user: undefined });
      const result = controller.me(req);
      expect(result).toBeNull();
    });
  });

  describe('updateProfile()', () => {
    it('delegates to authService.updateProfile with positional args', async () => {
      authService.updateProfile.mockResolvedValue({ id: 'user-1', displayName: 'Alice' });
      const result = await controller.updateProfile(makeReq(), { email: undefined, displayName: 'Alice', timezone: 'Europe/Berlin' });
      expect(authService.updateProfile).toHaveBeenCalledWith('user-1', undefined, 'Alice', 'Europe/Berlin');
    });
  });

  describe('changePassword()', () => {
    it('delegates to authService.changePassword', async () => {
      authService.changePassword.mockResolvedValue({ ok: true });
      const result = await controller.changePassword(makeReq(), { currentPassword: 'old', newPassword: 'New1234!!' });
      expect(authService.changePassword).toHaveBeenCalledWith('user-1', 'old', 'New1234!!');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('2FA endpoints', () => {
    it('setup2FA delegates to authService.setup2FA', async () => {
      authService.setup2FA.mockResolvedValue({ qrCode: 'data:...', secret: 'ABCD' });
      const result = await controller.setup2FA(makeReq());
      expect(authService.setup2FA).toHaveBeenCalledWith('user-1');
      expect(result).toHaveProperty('secret');
    });

    it('enable2FA delegates to authService.verifyAndEnable2FA', async () => {
      authService.verifyAndEnable2FA.mockResolvedValue({ ok: true, recoveryCodes: ['A', 'B'] });
      const result = await controller.enable2FA(makeReq(), { code: '123456' });
      expect(authService.verifyAndEnable2FA).toHaveBeenCalledWith('user-1', '123456');
      expect(result).toHaveProperty('recoveryCodes');
    });

    it('disable2FA delegates to authService.disable2FA', async () => {
      authService.disable2FA.mockResolvedValue({ ok: true });
      await controller.disable2FA(makeReq(), { password: 'pass', code: '654321' });
      expect(authService.disable2FA).toHaveBeenCalledWith('user-1', 'pass', '654321');
    });

    it('regenerateRecoveryCodes delegates to authService', async () => {
      authService.regenerateRecoveryCodes.mockResolvedValue({ recoveryCodes: ['X', 'Y'] });
      const result = await controller.regenerateRecoveryCodes(makeReq(), { code: '111222' });
      expect(authService.regenerateRecoveryCodes).toHaveBeenCalledWith('user-1', '111222');
      const r = result as Record<string, unknown>;
      expect(r['recoveryCodes']).toHaveLength(2);
    });

    it('verifyTotpLogin delegates to authService and sets cookies', async () => {
      const tokens = { accessToken: 'acc', refreshToken: 'ref', user: { id: 'u1' } };
      authService.verifyTotpLogin.mockResolvedValue(tokens);
      const req = makeReq();
      const res = makeRes();
      const result = await controller.verifyTotpLogin(req, res, { tempToken: 'tmp', code: '999888' });
      expect(authService.verifyTotpLogin).toHaveBeenCalledWith('tmp', '999888', expect.any(Object));
      expect(res.cookie).toHaveBeenCalledWith('pulsedock_token', 'acc', expect.any(Object));
    });
  });

  describe('sessions()', () => {
    it('delegates to authService.listSessions', async () => {
      authService.listSessions.mockResolvedValue([{ id: 's1', userAgent: 'Chrome', createdAt: new Date().toISOString() }]);
      const result = await controller.sessions(makeReq());
      expect(authService.listSessions).toHaveBeenCalledWith('user-1');
      const r = result as Array<Record<string, unknown>>;
      expect(r).toHaveLength(1);
    });
  });
});
