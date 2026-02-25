export type SessionUser = { id: string; email: string; role: 'admin' | 'user'; name?: string };

const TOKEN_KEY = 'pulsedock_access_token';
const REFRESH_KEY = 'pulsedock_refresh_token';
const USER_KEY = 'pulsedock_user';

let userCache: SessionUser | null = null;

export function setSession(accessToken: string, refreshToken: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  userCache = user;
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  userCache = null;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY) ?? '';
}

export function getUser(): SessionUser | null {
  if (userCache) return userCache;
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
