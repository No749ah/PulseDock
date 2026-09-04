import { getApiBase } from '../lib/api';

export type SessionUser = { id: string; email: string; role: 'admin' | 'user'; name?: string };

const USER_KEY = 'pulsedock_user';

let userCache: SessionUser | null = null;

/**
 * Persist user metadata after login. Tokens are handled exclusively via
 * httpOnly cookies set by the API — we never store JWTs in localStorage.
 */
export function setSession(_accessToken: string, _refreshToken: string, user: SessionUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  userCache = user;
}

export function clearLocalSession() {
  localStorage.removeItem(USER_KEY);
  userCache = null;
}

/**
 * Clear session: calls API logout (clears httpOnly cookies server-side) + clears local state.
 */
export async function clearSession() {
  clearLocalSession();
  try {
    await fetch(`${getApiBase()}/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    // Ignore errors — local session is already cleared
  }
}

/**
 * @deprecated Tokens are stored in httpOnly cookies. This always returns an empty string.
 * Auth is handled automatically via `credentials: 'include'` in fetch calls.
 */
export function getToken(): string {
  return '';
}

/**
 * @deprecated Tokens are stored in httpOnly cookies. This always returns an empty string.
 */
export function getRefreshToken(): string {
  return '';
}

export function getUser(): SessionUser | null {
  if (userCache) return userCache;
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    userCache = JSON.parse(raw) as SessionUser;
    return userCache;
  } catch {
    return null;
  }
}

export function getCachedUser() {
  return userCache;
}
