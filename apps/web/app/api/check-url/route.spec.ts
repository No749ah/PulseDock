import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

describe('api/check-url route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when url query is missing', async () => {
    const req = new NextRequest('http://localhost/api/check-url');
    const res = await GET(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: 'Missing url' });
  });

  it('returns 400 for invalid URL', async () => {
    const req = new NextRequest('http://localhost/api/check-url?url=not-a-url');
    const res = await GET(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: 'Invalid URL' });
  });

  it('returns 400 for unsupported protocol', async () => {
    const req = new NextRequest('http://localhost/api/check-url?url=ftp://example.com');
    const res = await GET(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: 'Only HTTP/HTTPS URLs are supported',
    });
  });

  it('returns ok=true for 2xx/3xx status responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch);

    const req = new NextRequest('http://localhost/api/check-url?url=https://example.com');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.status).toBe(204);
    expect(typeof data.latencyMs).toBe('number');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns ok=false for 4xx/5xx upstream status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })) as unknown as typeof fetch);

    const req = new NextRequest('http://localhost/api/check-url?url=https://example.com');
    const res = await GET(req);
    await expect(res.json()).resolves.toMatchObject({ ok: false, status: 503 });
  });

  it('maps timeout-like errors to Timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('The operation was aborted due to timeout');
    }) as unknown as typeof fetch);

    const req = new NextRequest('http://localhost/api/check-url?url=https://example.com');
    const res = await GET(req);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: 'Timeout' });
  });

  it('maps generic errors to Request failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch);

    const req = new NextRequest('http://localhost/api/check-url?url=https://example.com');
    const res = await GET(req);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: 'Request failed' });
  });
});
