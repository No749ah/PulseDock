function inferApiBaseFromLocation() {
  if (typeof window === 'undefined') return '';

  const host = window.location.host;
  const protocol = window.location.protocol;

  // Public test setup: oc-web-test.* -> oc-api-test.*
  if (host.startsWith('oc-web-test.')) {
    return `${protocol}//${host.replace('oc-web-test.', 'oc-api-test.')}`;
  }

  // Dev test setup: oc-dev-test.* -> same host /api proxy
  if (host.startsWith('oc-dev-test.')) {
    return `${protocol}//${host}/api`;
  }

  // Local dev setup
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
    return 'http://localhost:4321';
  }

  return '';
}

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  inferApiBaseFromLocation() ||
  'https://oc-api-test.no749ah.com';

function getStored(name: string) {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(name) ?? '';
}

function setStored(name: string, value: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(name, value);
}

function clearStored(name: string) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(name);
}

export async function api<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const access = token || getStored('pulsedock_access_token');

  const run = async (bearer?: string) =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });

  let response = await run(access);

  if (response.status === 401 && access && typeof window !== 'undefined') {
    const refreshToken = getStored('pulsedock_refresh_token');
    if (refreshToken) {
      const refreshResp = await fetch(`${API_BASE}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (refreshResp.ok) {
        const refreshed = (await refreshResp.json()) as {
          accessToken: string;
          refreshToken: string;
          user: { id: string; email: string; role: 'admin' | 'user'; name?: string };
        };
        setStored('pulsedock_access_token', refreshed.accessToken);
        setStored('pulsedock_refresh_token', refreshed.refreshToken);
        const name = refreshed.user?.name || refreshed.user?.email?.split('@')?.[0] || 'user';
        setStored('pulsedock_user', JSON.stringify({ ...refreshed.user, name }));
        response = await run(refreshed.accessToken);
      } else {
        // Invalid/expired refresh token: clear stale session so frontend can re-login cleanly
        clearStored('pulsedock_access_token');
        clearStored('pulsedock_refresh_token');
        clearStored('pulsedock_user');
      }
    }
  }

  if (!response.ok) {
    const text = await response.text();
    let message = text;

    try {
      const parsed = JSON.parse(text);
      message = parsed?.error?.message || parsed?.message || text;
    } catch {
      // keep raw text message
    }

    throw new Error(message || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}
