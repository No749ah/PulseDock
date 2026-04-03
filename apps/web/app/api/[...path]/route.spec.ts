import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('api proxy route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    delete process.env.INTERNAL_API_URL;
  });

  it('proxies GET with query string and strips hop-by-hop headers', async () => {
    const fetchMock = vi.fn(async () => {
      const h = new Headers({
        'content-type': 'application/json',
        'connection': 'keep-alive',
        'transfer-encoding': 'chunked',
        'x-upstream': 'ok',
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: h });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const mod = await import('./route');
    const req = new Request('http://localhost/api/v1/health?full=1', {
      method: 'GET',
      headers: {
        host: 'localhost:3000',
        authorization: 'Bearer token',
        connection: 'keep-alive',
      },
    });

    const res = await mod.GET(req, { params: Promise.resolve({ path: ['v1', 'health'] }) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:4321/v1/health?full=1');
    expect(init.method).toBe('GET');
    const headers = init.headers as Headers;
    expect(headers.get('host')).toBeNull();
    expect(headers.get('authorization')).toBe('Bearer token');

    expect(res.status).toBe(200);
    expect(res.headers.get('x-upstream')).toBe('ok');
    expect(res.headers.get('connection')).toBeNull();
    expect(res.headers.get('transfer-encoding')).toBeNull();
  });

  it('deduplicates content-type and forwards body for non-GET methods', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Headers;
      expect(headers.get('content-type')).toBe('application/json');
      expect(init?.body).toBeInstanceOf(Buffer);
      return new Response('created', { status: 201 });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    process.env.INTERNAL_API_URL = 'http://api:4321';
    const mod = await import('./route');

    const req = new Request('http://localhost/api/v1/monitors', {
      method: 'POST',
      headers: { 'content-type': 'application/json, application/json' },
      body: JSON.stringify({ name: 'Demo' }),
    });

    const res = await mod.POST(req, { params: Promise.resolve({ path: ['v1', 'monitors'] }) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api:4321/v1/monitors');
    expect(res.status).toBe(201);
  });

  it('forwards multiple set-cookie headers individually', async () => {
    const fetchMock = vi.fn(async () => {
      const upstream = new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
      const headersWithCookies = upstream.headers as unknown as { getSetCookie?: () => string[] };
      headersWithCookies.getSetCookie = () => ['a=1; Path=/', 'b=2; HttpOnly; Path=/'];
      return upstream;
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const mod = await import('./route');
    const req = new Request('http://localhost/api/v1/auth/me', { method: 'GET' });
    const res = await mod.GET(req, { params: Promise.resolve({ path: ['v1', 'auth', 'me'] }) });

    expect(res.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; HttpOnly; Path=/']);
  });
});
