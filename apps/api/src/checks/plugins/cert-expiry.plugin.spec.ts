import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist mocks before imports to avoid initialization order issues
vi.mock('tls', () => ({
  connect: vi.fn(),
}));

import * as tls from 'tls';
import { certExpiryPlugin } from './cert-expiry.plugin';

const makeCtx = (config: Record<string, unknown> = {}) => ({
  monitor: { id: 'm1', name: 'Test', type: 'HTTP' as const, target: 'https://example.com', timeoutMs: 5000 },
  config,
  nowIso: new Date().toISOString(),
});

function makeMockSocket(daysFromNow: number, subject = 'example.com', issuer = "Let's Encrypt") {
  const now = new Date();
  const expiry = new Date(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000);
  const socket = {
    getPeerCertificate: vi.fn().mockReturnValue({
      valid_to: expiry.toUTCString(),
      subject: { CN: subject },
      issuer: { O: issuer },
    }),
    end: vi.fn(),
    setTimeout: vi.fn(),
    on: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
  return socket;
}

describe('http.cert-expiry plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns green when cert has plenty of days remaining', async () => {
    const socket = makeMockSocket(90);
    vi.mocked(tls.connect).mockImplementation((_opts: unknown, cb: unknown) => {
      setTimeout(() => (cb as () => void)(), 0);
      return socket as unknown as ReturnType<typeof tls.connect>;
    });

    const result = await certExpiryPlugin.run(makeCtx({ warnDays: 30, criticalDays: 7 }));
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.message).toMatch(/\b8[89]\b/); // floor can be 89 or 90
  });

  it('returns yellow when cert is within warn threshold (~15 days)', async () => {
    const socket = makeMockSocket(15);
    vi.mocked(tls.connect).mockImplementation((_opts: unknown, cb: unknown) => {
      setTimeout(() => (cb as () => void)(), 0);
      return socket as unknown as ReturnType<typeof tls.connect>;
    });

    const result = await certExpiryPlugin.run(makeCtx({ warnDays: 30, criticalDays: 7 }));
    expect(result.ok).toBe(true);
    expect(result.level).toBe('yellow');
    // daysRemaining is floor-based so can be 14 or 15 depending on exact timing
    expect(result.message).toMatch(/\b1[45]\b/);
  });

  it('returns red when cert is within critical threshold (~3 days)', async () => {
    const socket = makeMockSocket(3);
    vi.mocked(tls.connect).mockImplementation((_opts: unknown, cb: unknown) => {
      setTimeout(() => (cb as () => void)(), 0);
      return socket as unknown as ReturnType<typeof tls.connect>;
    });

    const result = await certExpiryPlugin.run(makeCtx({ warnDays: 30, criticalDays: 7 }));
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toMatch(/\b[23]\b/);
  });

  it('returns red when cert is expired', async () => {
    const socket = makeMockSocket(-5);
    vi.mocked(tls.connect).mockImplementation((_opts: unknown, cb: unknown) => {
      setTimeout(() => (cb as () => void)(), 0);
      return socket as unknown as ReturnType<typeof tls.connect>;
    });

    const result = await certExpiryPlugin.run(makeCtx({ warnDays: 30, criticalDays: 7 }));
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toMatch(/EXPIRED/i);
  });

  it('returns red on TLS connection error', async () => {
    const socket = {
      getPeerCertificate: vi.fn(),
      end: vi.fn(),
      setTimeout: vi.fn(),
      on: vi.fn().mockImplementation((event: string, cb: (err: Error) => void) => {
        if (event === 'error') setTimeout(() => cb(new Error('ECONNREFUSED')), 0);
        return socket;
      }),
      destroy: vi.fn(),
    };
    vi.mocked(tls.connect).mockReturnValue(socket as unknown as ReturnType<typeof tls.connect>);

    const result = await certExpiryPlugin.run(makeCtx({ warnDays: 30, criticalDays: 7 }));
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('ECONNREFUSED');
  });
});
