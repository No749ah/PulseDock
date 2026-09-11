export interface CheckResult {
  url: string;
  status: number;
  statusText: string;
  ok: boolean;
  durationMs: number;
  contentLength: number | null;
  contentType: string | null;
  redirectedTo: string | null;
  headers: Record<string, string>;
  error?: string;
}

export interface CheckOptions {
  method?: string;
  timeoutMs?: number;
  followRedirects?: boolean;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Perform a single HTTP check against a URL and return structured results.
 */
export async function httpCheck(
  url: string,
  opts: CheckOptions = {},
): Promise<CheckResult> {
  const {
    method = 'GET',
    timeoutMs = 10_000,
    followRedirects = true,
    headers = {},
    body,
  } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method,
      redirect: followRedirects ? 'follow' : 'manual',
      signal: controller.signal,
      headers,
      body: body !== undefined ? body : undefined,
    });

    const durationMs = Date.now() - start;

    const resHeaders: Record<string, string> = {};
    res.headers.forEach((val, key) => {
      resHeaders[key] = val;
    });

    const rawLength = res.headers.get('content-length');
    const contentLength = rawLength !== null ? Number(rawLength) : null;

    return {
      url,
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      durationMs,
      contentLength,
      contentType: res.headers.get('content-type'),
      redirectedTo: res.redirected ? res.url : null,
      headers: resHeaders,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? `Timed out after ${timeoutMs}ms`
          : err.message
        : String(err);

    return {
      url,
      status: 0,
      statusText: 'Connection Error',
      ok: false,
      durationMs,
      contentLength: null,
      contentType: null,
      redirectedTo: null,
      headers: {},
      error: message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call the PulseDock API (authenticated).
 */
export async function apiRequest<T = unknown>(
  apiUrl: string,
  apiKey: string,
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const url = `${apiUrl.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { message?: string };
      detail = body.message ? `: ${body.message}` : '';
    } catch {
      // ignore
    }
    throw new Error(`API error ${res.status} ${res.statusText}${detail}`);
  }

  return res.json() as Promise<T>;
}
