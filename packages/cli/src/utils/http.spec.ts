import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { httpCheck } from './http.js';

describe('httpCheck', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok=true for 200 response', async () => {
    const mockRes = {
      status: 200,
      statusText: 'OK',
      ok: true,
      redirected: false,
      url: 'https://example.com',
      headers: new Headers({
        'content-type': 'text/html',
        'content-length': '1234',
      }),
    };
    vi.mocked(fetch).mockResolvedValueOnce(mockRes as Response);

    const result = await httpCheck('https://example.com');

    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.contentType).toBe('text/html');
    expect(result.contentLength).toBe(1234);
    expect(result.error).toBeUndefined();
  });

  it('returns ok=false for 500 response', async () => {
    const mockRes = {
      status: 500,
      statusText: 'Internal Server Error',
      ok: false,
      redirected: false,
      url: 'https://example.com',
      headers: new Headers({}),
    };
    vi.mocked(fetch).mockResolvedValueOnce(mockRes as Response);

    const result = await httpCheck('https://example.com');

    expect(result.status).toBe(500);
    expect(result.ok).toBe(false);
  });

  it('handles network errors gracefully', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await httpCheck('https://unreachable.local');

    expect(result.status).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('handles abort/timeout as error', async () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    vi.mocked(fetch).mockRejectedValueOnce(abortErr);

    const result = await httpCheck('https://slow.example.com', { timeoutMs: 100 });

    expect(result.status).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timed out/i);
  });

  it('captures redirected URL when following redirects', async () => {
    const mockRes = {
      status: 200,
      statusText: 'OK',
      ok: true,
      redirected: true,
      url: 'https://example.com/final',
      headers: new Headers({}),
    };
    vi.mocked(fetch).mockResolvedValueOnce(mockRes as Response);

    const result = await httpCheck('https://example.com', { followRedirects: true });

    expect(result.redirectedTo).toBe('https://example.com/final');
  });

  it('includes durationMs in result', async () => {
    const mockRes = {
      status: 200,
      statusText: 'OK',
      ok: true,
      redirected: false,
      url: 'https://example.com',
      headers: new Headers({}),
    };
    vi.mocked(fetch).mockResolvedValueOnce(mockRes as Response);

    const result = await httpCheck('https://example.com');

    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
