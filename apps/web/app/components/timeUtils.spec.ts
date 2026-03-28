/**
 * Unit tests for timeUtils helpers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  relativeTime,
  formatMonitorType,
  parseUserAgent,
  targetPlaceholder,
  targetHelperText,
} from './timeUtils';

// ── relativeTime ────────────────────────────────────────────────────────────

describe('relativeTime', () => {
  const NOW = 1_700_000_000_000;

  beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => vi.restoreAllMocks());

  it('returns "—" for null', () => {
    expect(relativeTime(null)).toBe('—');
  });

  it('returns "—" for undefined', () => {
    expect(relativeTime(undefined)).toBe('—');
  });

  it('returns "just now" for < 5 seconds', () => {
    const iso = new Date(NOW - 3_000).toISOString();
    expect(relativeTime(iso)).toBe('just now');
  });

  it('returns "Xs ago" for 5-59 seconds', () => {
    const iso = new Date(NOW - 30_000).toISOString();
    expect(relativeTime(iso)).toBe('30s ago');
  });

  it('returns "Xm ago" for 1-59 minutes', () => {
    const iso = new Date(NOW - 15 * 60_000).toISOString();
    expect(relativeTime(iso)).toBe('15m ago');
  });

  it('returns "Xh ago" for 1-23 hours', () => {
    const iso = new Date(NOW - 5 * 3600_000).toISOString();
    expect(relativeTime(iso)).toBe('5h ago');
  });

  it('returns "Xd ago" for 1-6 days', () => {
    const iso = new Date(NOW - 4 * 86400_000).toISOString();
    expect(relativeTime(iso)).toBe('4d ago');
  });

  it('returns locale date for 7+ days', () => {
    const date = new Date(NOW - 10 * 86400_000);
    const iso = date.toISOString();
    expect(relativeTime(iso)).toBe(date.toLocaleDateString());
  });

  it('accepts a Date object', () => {
    const date = new Date(NOW - 10_000);
    expect(relativeTime(date)).toBe('10s ago');
  });
});

// ── formatMonitorType ───────────────────────────────────────────────────────

describe('formatMonitorType', () => {
  const cases: [string, string][] = [
    ['HTTP', 'HTTP Check'],
    ['GIT_RELEASE', 'Git Release'],
    ['DOCKER_IMAGE', 'Docker Image'],
    ['TCP', 'TCP Port'],
    ['SSL_CERT', 'SSL Certificate'],
    ['HEARTBEAT', 'Heartbeat'],
    ['DNS', 'DNS Lookup'],
    ['PING', 'ICMP Ping'],
    ['SMTP', 'SMTP Email'],
    ['BROWSER', 'Browser Check'],
    ['WHOIS', 'WHOIS / Domain'],
  ];

  it.each(cases)('maps %s → %s', (input, expected) => {
    expect(formatMonitorType(input)).toBe(expected);
  });

  it('returns the raw type for unknown values', () => {
    expect(formatMonitorType('CUSTOM_TYPE')).toBe('CUSTOM_TYPE');
  });
});

// ── parseUserAgent ──────────────────────────────────────────────────────────

describe('parseUserAgent', () => {
  it('returns "Unknown device" for null', () => {
    expect(parseUserAgent(null)).toBe('Unknown device');
  });

  it('returns "Unknown device" for undefined', () => {
    expect(parseUserAgent(undefined)).toBe('Unknown device');
  });

  it('returns "Unknown device" for empty string', () => {
    expect(parseUserAgent('')).toBe('Unknown device');
  });

  it('detects Microsoft Edge', () => {
    expect(parseUserAgent('Mozilla/5.0 (Windows) Edg/111.0')).toBe('Microsoft Edge');
  });

  it('detects Chrome', () => {
    expect(parseUserAgent('Mozilla/5.0 Chrome/120.0 Safari/537.36')).toBe('Chrome Browser');
  });

  it('detects Firefox', () => {
    expect(parseUserAgent('Mozilla/5.0 Firefox/119.0')).toBe('Firefox Browser');
  });

  it('detects Safari (without Chrome)', () => {
    expect(parseUserAgent('Mozilla/5.0 Safari/605.1 AppleWebKit')).toBe('Safari Browser');
  });

  it('detects curl', () => {
    expect(parseUserAgent('curl/7.88.1')).toBe('API Client (curl)');
  });

  it('detects python', () => {
    expect(parseUserAgent('python-requests/2.31.0')).toBe('Python Client');
  });

  it('detects node', () => {
    expect(parseUserAgent('node-fetch/3.0')).toBe('Node.js Client');
  });

  it('truncates long unknown UA to 50 chars + ellipsis', () => {
    const longUA = 'a'.repeat(60);
    const result = parseUserAgent(longUA);
    expect(result).toBe('a'.repeat(50) + '…');
  });

  it('returns short unknown UA as-is', () => {
    const shortUA = 'CustomBot/1.0';
    expect(parseUserAgent(shortUA)).toBe(shortUA);
  });
});

// ── targetPlaceholder ──────────────────────────────────────────────────────

describe('targetPlaceholder', () => {
  it('returns GitHub-style placeholder for GIT_RELEASE', () => {
    expect(targetPlaceholder('GIT_RELEASE')).toContain('owner/repo');
  });

  it('returns image:tag placeholder for DOCKER_IMAGE', () => {
    expect(targetPlaceholder('DOCKER_IMAGE')).toContain('image:tag');
  });

  it('returns host:port placeholder for TCP', () => {
    expect(targetPlaceholder('TCP')).toContain('host:port');
  });

  it('returns domain placeholder for SSL_CERT', () => {
    expect(targetPlaceholder('SSL_CERT')).toContain('example.com');
  });

  it('returns label placeholder for HEARTBEAT', () => {
    expect(targetPlaceholder('HEARTBEAT')).toBeTruthy();
  });

  it('returns domain placeholder for DNS', () => {
    expect(targetPlaceholder('DNS')).toContain('example.com');
  });

  it('returns IP/domain placeholder for PING', () => {
    expect(targetPlaceholder('PING')).toContain('example.com');
  });

  it('returns mail server placeholder for SMTP', () => {
    expect(targetPlaceholder('SMTP')).toContain('mail.example.com');
  });

  it('returns https URL for BROWSER', () => {
    expect(targetPlaceholder('BROWSER')).toContain('https://');
  });

  it('returns default URL placeholder for HTTP', () => {
    const result = targetPlaceholder('HTTP');
    expect(result).toContain('https://');
  });

  it('returns default placeholder for unknown type', () => {
    const result = targetPlaceholder('CUSTOM');
    expect(result).toContain('https://');
  });
});

// ── targetHelperText ───────────────────────────────────────────────────────

describe('targetHelperText', () => {
  const types = ['GIT_RELEASE', 'DOCKER_IMAGE', 'TCP', 'SSL_CERT', 'HEARTBEAT', 'DNS', 'PING', 'SMTP', 'BROWSER', 'HTTP'];

  it.each(types)('returns non-empty help text for %s', (type) => {
    expect(targetHelperText(type).length).toBeGreaterThan(0);
  });

  it('returns default text for unknown type', () => {
    const text = targetHelperText('UNKNOWN');
    expect(text).toContain('HTTP');
  });
});
