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

// ─── CSRF ────────────────────────────────────────────────────────────────────

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Read the pulsedock_csrf cookie from document.cookie.
 * Returns undefined when running server-side or when the cookie is absent.
 */
function readCsrfCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|;\s*)pulsedock_csrf=([^;]+)/);
  return match?.[1];
}

/**
 * Ensure a CSRF token is available in the pulsedock_csrf cookie.
 * If not, fetches one from the API (which sets the cookie server-side).
 * Returns the token string so it can be attached to headers immediately.
 */
async function ensureCsrfToken(): Promise<string | undefined> {
  if (typeof document === 'undefined') return undefined; // SSR — no CSRF needed

  const existing = readCsrfCookie();
  if (existing) return existing;

  try {
    const resp = await fetch(`${API_BASE}/v1/auth/csrf`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    if (resp.ok) {
      const data = (await resp.json()) as { csrfToken?: string };
      return data.csrfToken ?? readCsrfCookie();
    }
  } catch {
    // Non-fatal: requests without CSRF will get a 403, which is visible to the user
  }
  return undefined;
}

// ─── Main API helper ─────────────────────────────────────────────────────────

/**
 * Typed fetch helper.
 *
 * Authentication is handled exclusively via httpOnly cookies set by the API
 * on login/refresh. All requests use `credentials: 'include'` to send those
 * cookies automatically. The `_token` parameter is kept for call-site backward
 * compatibility only and is intentionally ignored — never send JWTs in headers.
 *
 * CSRF protection: mutating requests (POST/PUT/PATCH/DELETE) automatically
 * include the X-CSRF-Token header from the pulsedock_csrf cookie value.
 *
 * On 401, a cookie-based token refresh is attempted transparently.
 */
export async function api<T>(path: string, _token?: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();

  // Inject CSRF token for state-mutating requests
  let csrfHeaders: Record<string, string> = {};
  if (MUTATING_METHODS.has(method)) {
    const token = await ensureCsrfToken();
    if (token) {
      csrfHeaders = { 'x-csrf-token': token };
    }
  }

  const run = () =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include', // httpOnly cookies sent automatically
      headers: {
        'content-type': 'application/json',
        ...csrfHeaders,
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });

  let response = await run();

  if (response.status === 401 && typeof window !== 'undefined') {
    // Attempt a silent token refresh using the httpOnly refresh cookie.
    const refreshResp = await fetch(`${API_BASE}/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // sends pulsedock_refresh cookie
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (refreshResp.ok) {
      // API has rotated both cookies server-side. Retry the original request.
      const refreshed = (await refreshResp.json()) as {
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; role: 'admin' | 'user'; name?: string };
      };
      // Update local user metadata (not a token — cookies were set by the server).
      if (typeof localStorage !== 'undefined') {
        const name = refreshed.user?.name || refreshed.user?.email?.split('@')?.[0] || 'user';
        localStorage.setItem('pulsedock_user', JSON.stringify({ ...refreshed.user, name }));
      }
      response = await run();
    }
    // If refresh fails: do nothing here. The 401 will bubble up and callers
    // redirect to /login on error (existing pattern in all pages).
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
