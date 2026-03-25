import { describe, it, expect } from 'vitest';
import { normalizeSslHost } from './network.runner';

// ── normalizeSslHost ─────────────────────────────────────────────────────────
// We test the pure parsing helper without network I/O.
// The full TCP/SSL/DNS/Ping/SMTP runners require live network connections
// which are tested in checks.service.spec.ts via integration-style mocks.

describe('normalizeSslHost', () => {
  it('extracts hostname from bare domain', () => {
    expect(normalizeSslHost('example.com')).toBe('example.com');
  });

  it('extracts hostname from https:// URL', () => {
    expect(normalizeSslHost('https://example.com')).toBe('example.com');
  });

  it('strips path from https:// URL', () => {
    expect(normalizeSslHost('https://example.com/path/to/page')).toBe('example.com');
  });

  it('strips port from https:// URL', () => {
    expect(normalizeSslHost('https://example.com:8443')).toBe('example.com');
  });

  it('handles http:// as valid input', () => {
    expect(normalizeSslHost('http://example.com')).toBe('example.com');
  });

  it('handles subdomain URLs', () => {
    expect(normalizeSslHost('https://api.example.com/v1/health')).toBe('api.example.com');
  });

  it('returns null for empty string', () => {
    expect(normalizeSslHost('')).toBeNull();
  });

  it('returns null for whitespace', () => {
    expect(normalizeSslHost('   ')).toBeNull();
  });
});
