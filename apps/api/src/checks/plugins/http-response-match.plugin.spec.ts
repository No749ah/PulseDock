import { describe, it, expect, vi, afterEach } from 'vitest';
import { httpResponseMatchPlugin } from './http-response-match.plugin';

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    monitor: { id: 'm-1', userId: 'u-1', name: 'Test', target: 'https://example.com', type: 'HTTP', intervalSec: 60, timeoutMs: 10000, enabled: true, createdAt: new Date().toISOString(), config: {}, alertChannelIds: [], folderId: null },
    config: { expectedText: 'OK' },
    ...overrides,
  } as Parameters<typeof httpResponseMatchPlugin.run>[0];
}

describe('http-response-match plugin', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns red/ok:false when expectedText is empty', async () => {
    const result = await httpResponseMatchPlugin.run(makeContext({ config: { expectedText: '' } }));
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('expectedText is required');
  });

  it('returns red/ok:false when expectedText is absent', async () => {
    const result = await httpResponseMatchPlugin.run(makeContext({ config: {} }));
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
  });

  it('returns green when response body contains expected text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('Status: OK'),
    }));
    const result = await httpResponseMatchPlugin.run(makeContext());
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.message).toContain('Matched');
  });

  it('returns red when response body does NOT contain expected text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('Something else entirely'),
    }));
    const result = await httpResponseMatchPlugin.run(makeContext());
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('not found');
  });

  it('returns red when response is not ok even if text matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('OK but server error'),
    }));
    const result = await httpResponseMatchPlugin.run(makeContext());
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
  });

  it('returns red on fetch error (Error instance)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await httpResponseMatchPlugin.run(makeContext());
    expect(result.ok).toBe(false);
    expect(result.message).toBe('ECONNREFUSED');
    expect(result.level).toBe('red');
  });

  it('returns "Request failed" on fetch error (non-Error thrown)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('timeout'));
    const result = await httpResponseMatchPlugin.run(makeContext());
    expect(result.ok).toBe(false);
    expect(result.message).toBe('Request failed');
    expect(result.level).toBe('red');
  });
});
