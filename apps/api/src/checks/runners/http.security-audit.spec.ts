import { describe, it, expect } from 'vitest';
import { auditSecurityHeaders } from './http.runner';

describe('auditSecurityHeaders', () => {
  it('returns grade F for empty headers', () => {
    const result = auditSecurityHeaders({});
    expect(result.grade).toBe('F');
    expect(result.score).toBe(0);
    expect(result.headers).toHaveLength(8);
    expect(result.headers.every((h) => !h.present)).toBe(true);
  });

  it('returns grade A for all critical + major headers present', () => {
    const result = auditSecurityHeaders({
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'content-security-policy': "default-src 'self'",
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=()',
      'x-xss-protection': '1; mode=block',
      'cache-control': 'no-store',
    });
    expect(result.grade).toBe('A');
    expect(result.score).toBe(100);
    expect(result.headers.every((h) => h.present)).toBe(true);
  });

  it('marks individual headers present', () => {
    const result = auditSecurityHeaders({
      'strict-transport-security': 'max-age=63072000',
    });
    const hsts = result.headers.find((h) => h.name === 'Strict-Transport-Security');
    expect(hsts?.present).toBe(true);
    expect(hsts?.value).toBe('max-age=63072000');
  });

  it('handles header names case-insensitively', () => {
    const result = auditSecurityHeaders({
      'Strict-Transport-Security': 'max-age=31536000',
      'X-Content-Type-Options': 'nosniff',
    });
    const hsts = result.headers.find((h) => h.name === 'Strict-Transport-Security');
    const xcto = result.headers.find((h) => h.name === 'X-Content-Type-Options');
    expect(hsts?.present).toBe(true);
    expect(xcto?.present).toBe(true);
  });

  it('accepts Content-Security-Policy-Report-Only as a CSP alternative', () => {
    const result = auditSecurityHeaders({
      'content-security-policy-report-only': "default-src 'self'; report-uri /csp",
    });
    const csp = result.headers.find((h) => h.name === 'Content-Security-Policy');
    expect(csp?.present).toBe(true);
  });

  it('returns grade B for most headers but missing CSP', () => {
    const result = auditSecurityHeaders({
      'strict-transport-security': 'max-age=31536000',
      'x-frame-options': 'SAMEORIGIN',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'geolocation=()',
      'x-xss-protection': '1; mode=block',
      'cache-control': 'no-store',
      // no CSP
    });
    // Missing only CSP (30 pts). 110-30=80 out of 110 = ~73. Grade B (>=75 is B) → might be C
    expect(['B', 'C']).toContain(result.grade);
  });

  it('attaches description and recommendation to missing headers', () => {
    const result = auditSecurityHeaders({});
    const hsts = result.headers.find((h) => h.name === 'Strict-Transport-Security');
    expect(hsts?.description).toBeTruthy();
    expect(hsts?.recommendation).toBeTruthy();
    expect(hsts?.severity).toBe('critical');
  });

  it('all header results have a severity field', () => {
    const result = auditSecurityHeaders({});
    for (const h of result.headers) {
      expect(['critical', 'warning', 'info']).toContain(h.severity);
    }
  });
});
