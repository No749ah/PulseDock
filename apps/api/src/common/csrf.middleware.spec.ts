import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { CsrfMiddleware, CSRF_COOKIE, CSRF_HEADER, generateCsrfToken, setCsrfCookie } from './csrf.middleware';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TOKEN = 'a'.repeat(64); // 64-char hex token

function makeReq(overrides: {
  method?: string;
  path?: string;
  authorization?: string;
  csrfCookie?: string;
  csrfHeader?: string;
  cookies?: Record<string, string>;
} = {}): Request {
  return {
    method: overrides.method ?? 'POST',
    path: overrides.path ?? '/v1/monitors',
    headers: {
      authorization: overrides.authorization ?? '',
      [CSRF_HEADER]: overrides.csrfHeader,
    },
    cookies: overrides.cookies ?? (overrides.csrfCookie ? { [CSRF_COOKIE]: overrides.csrfCookie } : {}),
  } as unknown as Request;
}

function makeRes(): Response {
  return { cookie: vi.fn() } as unknown as Response;
}

function run(req: Request): void {
  const mw = new CsrfMiddleware();
  const next: NextFunction = vi.fn();
  mw.use(req, makeRes(), next);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CsrfMiddleware', () => {
  // ── Safe methods ──────────────────────────────────────────────────────────

  describe('safe HTTP methods (GET, HEAD, OPTIONS)', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])('%s passes through without validation', (method) => {
      expect(() => run(makeReq({ method }))).not.toThrow();
    });
  });

  // ── Exempt paths ──────────────────────────────────────────────────────────

  describe('exempt paths', () => {
    const exemptPaths = [
      '/v1/auth/login',
      '/v1/auth/register',
      '/v1/auth/refresh',
      '/v1/auth/csrf',
      '/v1/auth/invite-info',
      '/v1/auth/accept-invite',
      '/v1/auth/request-password-reset',
      '/v1/auth/reset-password',
      '/v1/auth/logout',
      '/health',
      '/metrics',
    ];

    it.each(exemptPaths)('%s is exempt from CSRF', (path) => {
      expect(() => run(makeReq({ method: 'POST', path }))).not.toThrow();
    });

    it('trailing slash is stripped before path check', () => {
      expect(() => run(makeReq({ method: 'POST', path: '/v1/auth/login/' }))).not.toThrow();
    });
  });

  // ── Exempt prefixes ───────────────────────────────────────────────────────

  describe('exempt path prefixes', () => {
    it('/v1/heartbeat/* paths are exempt', () => {
      expect(() => run(makeReq({ method: 'POST', path: '/v1/heartbeat/abc123' }))).not.toThrow();
    });
  });

  // ── Bearer / ApiKey callers ───────────────────────────────────────────────

  describe('Bearer / ApiKey authorization', () => {
    it('Bearer token skips CSRF validation', () => {
      expect(() =>
        run(makeReq({ authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.x.y' })),
      ).not.toThrow();
    });

    it('ApiKey token skips CSRF validation', () => {
      expect(() =>
        run(makeReq({ authorization: 'ApiKey sk_test_abc123' })),
      ).not.toThrow();
    });
  });

  // ── Token validation ──────────────────────────────────────────────────────

  describe('double-submit cookie validation', () => {
    it('throws ForbiddenException when CSRF cookie is missing', () => {
      expect(() =>
        run(makeReq({ csrfHeader: TOKEN })),
      ).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when CSRF header is missing', () => {
      expect(() =>
        run(makeReq({ csrfCookie: TOKEN })),
      ).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when both token and header are missing', () => {
      expect(() => run(makeReq({}))).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when tokens do not match', () => {
      expect(() =>
        run(makeReq({ csrfCookie: TOKEN, csrfHeader: 'b'.repeat(64) })),
      ).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when tokens have different lengths', () => {
      expect(() =>
        run(makeReq({ csrfCookie: TOKEN, csrfHeader: TOKEN.slice(0, 32) })),
      ).toThrow(ForbiddenException);
    });

    it('passes when cookie and header tokens match', () => {
      expect(() =>
        run(makeReq({ csrfCookie: TOKEN, csrfHeader: TOKEN })),
      ).not.toThrow();
    });
  });

  // ── PUT / PATCH / DELETE ──────────────────────────────────────────────────

  describe('non-POST mutating methods', () => {
    it.each(['PUT', 'PATCH', 'DELETE'])('%s is also validated', (method) => {
      expect(() =>
        run(makeReq({ method, csrfCookie: TOKEN, csrfHeader: TOKEN })),
      ).not.toThrow();
    });

    it.each(['PUT', 'PATCH', 'DELETE'])('%s fails without valid CSRF token', (method) => {
      expect(() =>
        run(makeReq({ method })),
      ).toThrow(ForbiddenException);
    });
  });
});

// ─── generateCsrfToken ───────────────────────────────────────────────────────

describe('generateCsrfToken()', () => {
  it('returns a 64-character hex string', () => {
    const token = generateCsrfToken();
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it('generates unique tokens on each call', () => {
    const t1 = generateCsrfToken();
    const t2 = generateCsrfToken();
    expect(t1).not.toBe(t2);
  });
});

// ─── setCsrfCookie ───────────────────────────────────────────────────────────

describe('setCsrfCookie()', () => {
  it('calls res.cookie with the correct cookie name and token', () => {
    const res = makeRes();
    setCsrfCookie(res, TOKEN);
    expect(res.cookie).toHaveBeenCalledWith(
      CSRF_COOKIE,
      TOKEN,
      expect.objectContaining({ httpOnly: false, sameSite: 'lax' }),
    );
  });

  it('sets maxAge to 24 hours', () => {
    const res = makeRes();
    setCsrfCookie(res, TOKEN);
    expect(res.cookie).toHaveBeenCalledWith(
      CSRF_COOKIE,
      TOKEN,
      expect.objectContaining({ maxAge: 24 * 60 * 60 * 1000 }),
    );
  });
});
