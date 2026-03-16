import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual, randomBytes } from 'node:crypto';

export const CSRF_COOKIE = 'pulsedock_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Paths excluded from CSRF enforcement.
 * These are unauthenticated bootstrap endpoints — the browser has no session
 * cookie yet, so there's no CSRF risk (and no csrf cookie to read).
 */
const EXEMPT_PATHS = new Set([
  '/v1/auth/login',
  '/v1/auth/register',
  '/v1/auth/refresh',
  '/v1/auth/csrf',
  '/v1/auth/invite-info',
  '/v1/auth/accept-invite',
  '/v1/auth/request-password-reset',
  '/v1/auth/reset-password',
  '/v1/auth/verify-email',      // user arrives via email link — no session cookie yet
  '/v1/auth/resend-verification', // pre-auth — no session cookie yet
  '/v1/auth/logout', // logout CSRF is low-severity (forces log-out, no data exfil)
  '/v1/auth/setup',  // first-run setup — no session cookie yet
  // Public endpoints
  '/health',
  '/metrics',
]);

/** URL prefixes that are exempt from CSRF (public push endpoints). */
const EXEMPT_PREFIXES: string[] = ['/v1/heartbeat/'];

/**
 * Double-Submit Cookie CSRF Middleware
 *
 * How it works:
 * 1. The client obtains a CSRF token via GET /v1/auth/csrf. The API sets a
 *    non-httpOnly `pulsedock_csrf` cookie containing a random token.
 * 2. The frontend reads this cookie and sends it as `X-CSRF-Token` header on
 *    every state-mutating request (POST / PUT / PATCH / DELETE).
 * 3. This middleware validates that the header value matches the cookie value.
 *
 * Security properties:
 * - Cross-origin attackers cannot read the cookie (SameSite + CORS), so they
 *   cannot forge the header.
 * - API-key / Bearer-token callers (programmatic access) are exempt because
 *   they provide credentials explicitly and are not cookie-based.
 * - Comparison uses timingSafeEqual to prevent timing side-channel attacks.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Safe methods don't modify state
    if (SAFE_METHODS.has(req.method)) {
      return next();
    }

    // Exempt unauthenticated bootstrap endpoints
    const path = req.path.replace(/\/+$/, '');
    if (EXEMPT_PATHS.has(path)) {
      return next();
    }

    // Exempt public push endpoints (e.g. heartbeat pings) by prefix
    if (EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return next();
    }

    // API-key / Bearer-token callers are programmatic — CSRF doesn't apply
    const authHeader = req.headers.authorization ?? '';
    if (authHeader.startsWith('Bearer ') || authHeader.startsWith('ApiKey ')) {
      return next();
    }

    // Validate double-submit cookie
    const cookieToken: string | undefined = (req.cookies as Record<string, string | undefined>)?.[CSRF_COOKIE];
    const headerToken: string | undefined = req.headers[CSRF_HEADER] as string | undefined;

    if (!cookieToken || !headerToken) {
      throw new ForbiddenException('CSRF token missing');
    }

    // Constant-time comparison prevents timing-based token oracle attacks
    try {
      const a = Buffer.from(cookieToken);
      const b = Buffer.from(headerToken);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new ForbiddenException('CSRF token mismatch');
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      throw new ForbiddenException('CSRF validation failed');
    }

    next();
  }
}

/** Generate a cryptographically secure CSRF token (hex string, 32 bytes = 64 chars) */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

const IS_PROD = process.env.NODE_ENV === 'production';

/** Set the CSRF cookie on a response */
export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,      // MUST be readable by JS (that's the whole point)
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24h
    path: '/',
  });
}
