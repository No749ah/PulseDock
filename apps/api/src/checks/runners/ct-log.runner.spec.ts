import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runCtLogCheck } from './ct-log.runner';

// ─── Mock global.fetch ────────────────────────────────────────────────────────
const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', mockFetch);

function makeCrtShEntry(notBefore: string, cn: string, san?: string) {
  return {
    issuer_ca_id: 1,
    issuer_name: 'Let\'s Encrypt',
    common_name: cn,
    name_value: san ?? cn,
    id: Math.floor(Math.random() * 1_000_000),
    entry_timestamp: notBefore,
    not_before: notBefore,
    not_after: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    serial_number: 'ABCDEF123456',
  };
}

function recentDate(daysAgo = 1): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function oldDate(daysAgo = 30): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function mockOkResponse(body: string, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as Response);
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Test 1: Returns green when no recent certificates found ──────────────────
describe('runCtLogCheck()', () => {
  it('returns green when crt.sh returns empty array (no certs)', async () => {
    mockOkResponse('[]');

    const result = await runCtLogCheck('example.com', { lookbackDays: 7 });

    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.message).toMatch(/No new certificates found/i);
    expect(result.statusCode).toBe(200);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  // ─── Test 2: Returns yellow when new certificates found within lookback window
  it('returns yellow when new certificates are found within the lookback window', async () => {
    const entries = [
      makeCrtShEntry(recentDate(1), 'example.com'),
      makeCrtShEntry(recentDate(2), 'sub.example.com', 'sub.example.com\nexample.com'),
      makeCrtShEntry(recentDate(3), '*.example.com'),
    ];
    mockOkResponse(JSON.stringify(entries));

    const result = await runCtLogCheck('example.com', { lookbackDays: 7 });

    expect(result.ok).toBe(true);
    expect(result.level).toBe('yellow');
    expect(result.message).toMatch(/3 new certificate/i);
    expect(result.message).toContain('example.com');
    const meta = (result as typeof result & { metadata?: { newCertCount: number; domains: string[] } }).metadata;
    expect(meta?.newCertCount).toBe(3);
    expect(Array.isArray(meta?.domains)).toBe(true);
    expect(meta!.domains.length).toBeGreaterThan(0);
  });

  // ─── Test 3: Returns red on crt.sh fetch error ────────────────────────────
  it('returns red when crt.sh fetch throws a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED network error'));

    const result = await runCtLogCheck('example.com', { lookbackDays: 7 });

    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toMatch(/CT log check failed/i);
    expect(result.message).toContain('example.com');
  });

  // ─── Test 4: Correctly filters by lookback days ───────────────────────────
  it('ignores certificates older than the lookback window', async () => {
    const entries = [
      makeCrtShEntry(oldDate(20), 'old.example.com'),  // 20 days ago — outside 7-day window
      makeCrtShEntry(oldDate(15), 'old2.example.com'), // 15 days ago — outside 7-day window
      makeCrtShEntry(recentDate(3), 'new.example.com'), // 3 days ago — inside 7-day window
    ];
    mockOkResponse(JSON.stringify(entries));

    const result = await runCtLogCheck('example.com', { lookbackDays: 7 });

    // Only 1 entry within the 7-day window
    expect(result.ok).toBe(true);
    expect(result.level).toBe('yellow');
    expect(result.message).toMatch(/1 new certificate/i);
    const meta = (result as typeof result & { metadata?: { newCertCount: number } }).metadata;
    expect(meta?.newCertCount).toBe(1);
  });

  // ─── Test 5: Handles malformed crt.sh JSON gracefully ────────────────────
  it('returns red when crt.sh returns malformed JSON', async () => {
    mockOkResponse('{ this is not valid json ][[[');

    const result = await runCtLogCheck('example.com', { lookbackDays: 7 });

    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toMatch(/malformed JSON/i);
  });
});
