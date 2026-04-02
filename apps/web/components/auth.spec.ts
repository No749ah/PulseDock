import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLocalSession,
  clearSession,
  getCachedUser,
  getRefreshToken,
  getToken,
  getUser,
  setSession,
  type SessionUser,
} from './auth';

describe('auth local session helpers', () => {
  const user: SessionUser = {
    id: 'user_1',
    email: 'noah@example.com',
    role: 'admin',
    name: 'Noah',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    clearLocalSession();
  });

  it('setSession persists user in localStorage and cache', () => {
    setSession('ignored-access', 'ignored-refresh', user);

    expect(localStorage.getItem('pulsedock_user')).toBe(JSON.stringify(user));
    expect(getCachedUser()).toEqual(user);
    expect(getUser()).toEqual(user);
  });

  it('getUser hydrates cache from localStorage when cache is empty', () => {
    localStorage.setItem('pulsedock_user', JSON.stringify(user));

    expect(getCachedUser()).toBeNull();
    expect(getUser()).toEqual(user);
    expect(getCachedUser()).toEqual(user);
  });

  it('getUser returns null when storage entry is missing', () => {
    expect(getUser()).toBeNull();
    expect(getCachedUser()).toBeNull();
  });

  it('getUser returns null for invalid JSON payloads', () => {
    localStorage.setItem('pulsedock_user', '{invalid-json');

    expect(getUser()).toBeNull();
    expect(getCachedUser()).toBeNull();
  });

  it('clearLocalSession removes localStorage state and cache', () => {
    setSession('ignored-access', 'ignored-refresh', user);

    clearLocalSession();

    expect(localStorage.getItem('pulsedock_user')).toBeNull();
    expect(getCachedUser()).toBeNull();
    expect(getUser()).toBeNull();
  });

  it('getToken/getRefreshToken always return empty strings (cookie auth only)', () => {
    expect(getToken()).toBe('');
    expect(getRefreshToken()).toBe('');
  });
});

describe('clearSession', () => {
  const user: SessionUser = {
    id: 'user_2',
    email: 'owner@example.com',
    role: 'user',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    clearLocalSession();
  });

  it('clears local user state and calls logout endpoint', async () => {
    setSession('ignored-access', 'ignored-refresh', user);

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await clearSession();

    expect(localStorage.getItem('pulsedock_user')).toBeNull();
    expect(getCachedUser()).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4321/v1/auth/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('swallows logout network errors after clearing local state', async () => {
    setSession('ignored-access', 'ignored-refresh', user);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(clearSession()).resolves.toBeUndefined();
    expect(localStorage.getItem('pulsedock_user')).toBeNull();
    expect(getCachedUser()).toBeNull();
  });
});
