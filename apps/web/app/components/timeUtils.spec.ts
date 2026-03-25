/**
 * @file timeUtils.spec.ts
 * Unit tests for timeUtils — pure utility functions.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { relativeTime, formatMonitorType, parseUserAgent, targetPlaceholder, targetHelperText } from './timeUtils';

// ────────────────────────────────────────────────────────────────────────────
// relativeTime
// ────────────────────────────────────────────────────────────────────────────

describe('relativeTime', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "—" for null', () => {
    expect(relativeTime(null)).toBe('—');
  });

  it('returns "—" for undefined', () => {
    expect(relativeTime(undefined)).toBe('—');
  });

  it('returns "just now" for < 5 seconds ago', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 2000);
    expect(relativeTime(new Date(now).toISOString())).toBe('just now');
  });

  it('returns seconds ago for 5-59 seconds', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 30_000);
    expect(relativeTime(new Date(now).toISOString())).toBe('30s ago');
  });

  it('returns minutes ago for 1-59 minutes', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 5 * 60_000);
    expect(relativeTime(new Date(now).toISOString())).toBe('5m ago');
  });

  it('returns hours ago for 1-23 hours', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 3 * 3600_000);
    expect(relativeTime(new Date(now).toISOString())).toBe('3h ago');
  });

  it('returns days ago for 1-6 days', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 3 * 86400_000);
    expect(relativeTime(new Date(now).toISOString())).toBe('3d ago');
  });

  it('returns locale date for 7+ days ago', () => {
    const past = new Date('2024-01-01T00:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-15T00:00:00Z').getTime());
    const result = relativeTime(past);
    // Should be a date string, not relative
    expect(result).not.toContain('ago');
    expect(result).not.toBe('—');
  });

  it('accepts a Date object', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 10_000);
    expect(relativeTime(new Date(now))).toBe('10s ago');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// formatMonitorType
// ────────────────────────────────────────────────────────────────────────────

describe('formatMonitorType', () => {
  it.each([
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
  ])('%s → %s', (type, label) => {
    expect(formatMonitorType(type)).toBe(label);
  });

  it('returns the raw type for unknown types', () => {
    expect(formatMonitorType('CUSTOM_TYPE')).toBe('CUSTOM_TYPE');
    expect(formatMonitorType('')).toBe('');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// parseUserAgent
// ────────────────────────────────────────────────────────────────────────────

describe('parseUserAgent', () => {
  it('returns "Unknown device" for null', () => {
    expect(parseUserAgent(null)).toBe('Unknown device');
  });

  it('returns "Unknown device" for undefined', () => {
    expect(parseUserAgent(undefined)).toBe('Unknown device');
  });

  it('detects Edge browser', () => {
    expect(parseUserAgent('Mozilla/5.0 ... Edg/120.0.0.0')).toBe('Microsoft Edge');
  });

  it('detects Chrome browser', () => {
    expect(parseUserAgent('Mozilla/5.0 ... Chrome/120.0.0.0 Safari/537.36')).toBe('Chrome Browser');
  });

  it('detects Firefox browser', () => {
    expect(parseUserAgent('Mozilla/5.0 ... Firefox/121.0')).toBe('Firefox Browser');
  });

  it('detects Safari browser', () => {
    expect(parseUserAgent('Mozilla/5.0 ... Safari/604.1')).toBe('Safari Browser');
  });

  it('detects curl client', () => {
    expect(parseUserAgent('curl/7.88.1')).toBe('API Client (curl)');
  });

  it('detects python client', () => {
    expect(parseUserAgent('python-requests/2.31.0')).toBe('Python Client');
  });

  it('detects node.js client', () => {
    expect(parseUserAgent('node-fetch/3.3.1')).toBe('Node.js Client');
  });

  it('truncates long unknown user agents', () => {
    const long = 'A'.repeat(100);
    const result = parseUserAgent(long);
    expect(result.length).toBeLessThanOrEqual(53); // 50 + "…"
    expect(result.endsWith('…')).toBe(true);
  });

  it('returns short unknown user agents as-is', () => {
    const short = 'CustomAgent/1.0';
    expect(parseUserAgent(short)).toBe(short);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// targetPlaceholder
// ────────────────────────────────────────────────────────────────────────────

describe('targetPlaceholder', () => {
  it.each([
    ['GIT_RELEASE', 'owner/repo'],
    ['DOCKER_IMAGE', 'image:tag'],
    ['TCP', 'host:port'],
    ['SSL_CERT', 'example.com'],
    ['HEARTBEAT', 'heartbeat-worker'],
    ['DNS', 'example.com'],
    ['PING', 'example.com'],
    ['SMTP', 'mail.example.com'],
    ['BROWSER', 'https://example.com'],
    ['HTTP', 'https://'],
  ])('%s contains expected substring', (type, substr) => {
    expect(targetPlaceholder(type)).toContain(substr);
  });

  it('returns a default placeholder for unknown types', () => {
    expect(targetPlaceholder('UNKNOWN')).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// targetHelperText
// ────────────────────────────────────────────────────────────────────────────

describe('targetHelperText', () => {
  it.each([
    ['HTTP', 'HTTP request'],
    ['GIT_RELEASE', 'GitHub'],
    ['DOCKER_IMAGE', 'Docker Hub'],
    ['TCP', 'TCP'],
    ['SSL_CERT', 'TLS certificate'],
    ['HEARTBEAT', 'ping URL'],
    ['DNS', 'hostname'],
    ['PING', 'ICMP'],
    ['SMTP', 'mail server'],
    ['BROWSER', 'User-Agent'],
  ])('%s helper text mentions "%s"', (type, keyword) => {
    expect(targetHelperText(type)).toContain(keyword);
  });

  it('returns a non-empty default for unknown types', () => {
    const result = targetHelperText('UNKNOWN');
    expect(result.length).toBeGreaterThan(0);
  });
});
