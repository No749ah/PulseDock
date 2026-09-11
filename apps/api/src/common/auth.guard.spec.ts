import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';

function makeContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as never;
}

function makeAuthService() {
  return {
    getUserByAccessToken: vi.fn(),
    getActiveUserById: vi.fn(),
  };
}

function makeApiKeysService() {
  return {
    validateKey: vi.fn(),
  };
}

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let authService: ReturnType<typeof makeAuthService>;
  let apiKeysService: ReturnType<typeof makeApiKeysService>;

  beforeEach(() => {
    authService = makeAuthService();
    apiKeysService = makeApiKeysService();
    guard = new AuthGuard(authService as never, apiKeysService as never);
  });

  it('authenticates with valid Bearer token', async () => {
    const tokenUser = { id: 'u1' };
    const user = { id: 'u1', email: 'a@b.com', role: 'user', mustChangePassword: false, totpEnabled: false };
    authService.getUserByAccessToken.mockResolvedValue(tokenUser);
    authService.getActiveUserById.mockResolvedValue(user);

    const request: Record<string, unknown> = { headers: { authorization: 'Bearer valid-token' }, cookies: {} };
    const result = await guard.canActivate(makeContext(request));

    expect(result).toBe(true);
    expect(request['user']).toMatchObject({ id: 'u1', email: 'a@b.com' });
  });

  it('authenticates with valid cookie token', async () => {
    const tokenUser = { id: 'u2' };
    const user = { id: 'u2', email: 'b@c.com', role: 'user', mustChangePassword: false, totpEnabled: false };
    authService.getUserByAccessToken.mockResolvedValue(tokenUser);
    authService.getActiveUserById.mockResolvedValue(user);

    const request: Record<string, unknown> = {
      headers: {},
      cookies: { pulsedock_token: 'cookie-valid-token' },
    };
    const result = await guard.canActivate(makeContext(request));

    expect(result).toBe(true);
    expect(authService.getUserByAccessToken).toHaveBeenCalledWith('cookie-valid-token');
  });

  it('prefers cookie token over Authorization header', async () => {
    const user = { id: 'u1', email: 'a@b.com', role: 'user', mustChangePassword: false, totpEnabled: false };
    authService.getUserByAccessToken.mockResolvedValue({ id: 'u1' });
    authService.getActiveUserById.mockResolvedValue(user);

    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer header-token' },
      cookies: { pulsedock_token: 'cookie-token' },
    };
    await guard.canActivate(makeContext(request));

    expect(authService.getUserByAccessToken).toHaveBeenCalledWith('cookie-token');
  });

  it('throws UnauthorizedException when no token provided', async () => {
    authService.getUserByAccessToken.mockResolvedValue(null);

    const request: Record<string, unknown> = { headers: {}, cookies: {} };
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException for invalid access token', async () => {
    authService.getUserByAccessToken.mockResolvedValue(null);

    const request: Record<string, unknown> = { headers: { authorization: 'Bearer bad-token' }, cookies: {} };
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when user is inactive', async () => {
    authService.getUserByAccessToken.mockResolvedValue({ id: 'u1' });
    authService.getActiveUserById.mockResolvedValue(null);

    const request: Record<string, unknown> = { headers: { authorization: 'Bearer some-token' }, cookies: {} };
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(UnauthorizedException);
  });

  it('validates API key with pdck_ prefix', async () => {
    const apiKeyUser = { id: 'u-api', email: 'api@example.com', role: 'user' };
    apiKeysService.validateKey.mockResolvedValue(apiKeyUser);

    const request: Record<string, unknown> = { headers: { authorization: 'Bearer pdck_test123' }, cookies: {} };
    const result = await guard.canActivate(makeContext(request));

    expect(result).toBe(true);
    expect(apiKeysService.validateKey).toHaveBeenCalledWith('pdck_test123');
    expect(request['user']).toMatchObject({ id: 'u-api', email: 'api@example.com' });
  });

  it('throws UnauthorizedException for invalid API key', async () => {
    apiKeysService.validateKey.mockResolvedValue(null);

    const request: Record<string, unknown> = { headers: { authorization: 'Bearer pdck_invalid' }, cookies: {} };
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(UnauthorizedException);
  });

  it('handles missing cookies object gracefully', async () => {
    authService.getUserByAccessToken.mockResolvedValue({ id: 'u1' });
    authService.getActiveUserById.mockResolvedValue({ id: 'u1', email: 'a@b.com', role: 'user', mustChangePassword: false, totpEnabled: false });

    const request: Record<string, unknown> = { headers: { authorization: 'Bearer valid-token' } };
    const result = await guard.canActivate(makeContext(request));

    expect(result).toBe(true);
  });
});
