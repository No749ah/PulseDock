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

  it('returns red when no certificate is returned', async () => {
    const socket = {
      getPeerCertificate: vi.fn().mockReturnValue(null),
      end: vi.fn(),
      setTimeout: vi.fn(),
      on: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
    };
    vi.mocked(tls.connect).mockImplementation((_opts: unknown, cb: unknown) => {
      setTimeout(() => (cb as () => void)(), 0);
      return socket as unknown as ReturnType<typeof tls.connect>;
    });

    const result = await certExpiryPlugin.run(makeCtx());
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('No certificate');
  });

  it('returns red when cert has no valid_to', async () => {
    const socket = {
      getPeerCertificate: vi.fn().mockReturnValue({ subject: { CN: 'test' } }),
      end: vi.fn(),
      setTimeout: vi.fn(),
      on: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
    };
    vi.mocked(tls.connect).mockImplementation((_opts: unknown, cb: unknown) => {
      setTimeout(() => (cb as () => void)(), 0);
      return socket as unknown as ReturnType<typeof tls.connect>;
    });

    const result = await certExpiryPlugin.run(makeCtx());
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('No certificate');
  });

  it('handles array-typed subject.CN and issuer fields', async () => {
    const now = new Date();
    const expiry = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const socket = {
      getPeerCertificate: vi.fn().mockReturnValue({
        valid_to: expiry.toUTCString(),
        subject: { CN: ['array-cn.com', 'alt'] },
        issuer: { O: ['Array Issuer Org'], CN: ['Array Issuer CN'] },
      }),
      end: vi.fn(),
      setTimeout: vi.fn(),
      on: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
    };
    vi.mocked(tls.connect).mockImplementation((_opts: unknown, cb: unknown) => {
      setTimeout(() => (cb as () => void)(), 0);
      return socket as unknown as ReturnType<typeof tls.connect>;
    });

    const result = await certExpiryPlugin.run(makeCtx());
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.message).toContain('array-cn.com');
  });

  it('falls back to subject.O when subject.CN is undefined', async () => {
    const now = new Date();
    const expiry = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const socket = {
      getPeerCertificate: vi.fn().mockReturnValue({
        valid_to: expiry.toUTCString(),
        subject: { O: 'Fallback Org' },
        issuer: { CN: 'Issuer CN Only' },
      }),
      end: vi.fn(),
      setTimeout: vi.fn(),
      on: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
    };
    vi.mocked(tls.connect).mockImplementation((_opts: unknown, cb: unknown) => {
      setTimeout(() => (cb as () => void)(), 0);
      return socket as unknown as ReturnType<typeof tls.connect>;
    });

    const result = await certExpiryPlugin.run(makeCtx());
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Fallback Org');
  });

  it('falls back to "Unknown" when no subject/issuer fields', async () => {
    const now = new Date();
    const expiry = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const socket = {
      getPeerCertificate: vi.fn().mockReturnValue({
        valid_to: expiry.toUTCString(),
        subject: {},
        issuer: {},
      }),
      end: vi.fn(),
      setTimeout: vi.fn(),
      on: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
    };
    vi.mocked(tls.connect).mockImplementation((_opts: unknown, cb: unknown) => {
      setTimeout(() => (cb as () => void)(), 0);
      return socket as unknown as ReturnType<typeof tls.connect>;
    });

    const result = await certExpiryPlugin.run(makeCtx());
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Unknown');
  });

  it('handles non-Error throw in catch block', async () => {
    const socket = {
      getPeerCertificate: vi.fn(),
      end: vi.fn(),
      setTimeout: vi.fn(),
      on: vi.fn().mockImplementation((event: string, cb: (err: unknown) => void) => {
        if (event === 'error') setTimeout(() => cb('string-error'), 0);
        return socket;
      }),
      destroy: vi.fn(),
    };
    vi.mocked(tls.connect).mockReturnValue(socket as unknown as ReturnType<typeof tls.connect>);

    const result = await certExpiryPlugin.run(makeCtx());
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toBe('TLS check failed');
  });

  it('uses default warnDays=30 and criticalDays=7 when not configured', async () => {
    const socket = makeMockSocket(20); // 20 days → between default warn (30) and critical (7)
    vi.mocked(tls.connect).mockImplementation((_opts: unknown, cb: unknown) => {
      setTimeout(() => (cb as () => void)(), 0);
      return socket as unknown as ReturnType<typeof tls.connect>;
    });

    const result = await certExpiryPlugin.run(makeCtx({})); // no config
    expect(result.level).toBe('yellow'); // 20 days < default 30
  });

  it('prepends https:// to targets without protocol', async () => {
    const socket = makeMockSocket(90);
    vi.mocked(tls.connect).mockImplementation((_opts: unknown, cb: unknown) => {
      setTimeout(() => (cb as () => void)(), 0);
      return socket as unknown as ReturnType<typeof tls.connect>;
    });

    const ctx = makeCtx();
    ctx.monitor.target = 'example.com'; // no protocol
    const result = await certExpiryPlugin.run(ctx);
    expect(result.ok).toBe(true);
  });

  it('uses custom port from URL', async () => {
    const socket = makeMockSocket(90);
    vi.mocked(tls.connect).mockImplementation((opts: unknown, cb: unknown) => {
      setTimeout(() => (cb as () => void)(), 0);
      return socket as unknown as ReturnType<typeof tls.connect>;
    });

    const ctx = makeCtx();
    ctx.monitor.target = 'https://example.com:8443';
    const result = await certExpiryPlugin.run(ctx);
    expect(result.ok).toBe(true);
    expect(tls.connect).toHaveBeenCalledWith(
      expect.objectContaining({ port: 8443 }),
      expect.any(Function),
    );
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
